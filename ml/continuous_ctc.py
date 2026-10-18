"""Stage D2: signer-bound Hermite stitched streams and provenance-checked gloss CTC.

How2Sign caches contain English sentence labels, not ASL gloss annotations. Real
training requires a reviewed --gloss-manifest (clip_id, signer_id, split, glosses).
"""
import argparse
import json
from pathlib import Path
import numpy as np
import pandas as pd
import torch
from torch.nn import functional as F
from torch.utils.data import Dataset, DataLoader
from .dataset_v2 import LandmarkDataset, collate, load_records, make_synthetic, shard_records
from .datasets.common import filter_manifest, validate_splits
from .evaluate_v2 import edit_distance, greedy_ctc, prefix_beam_search
from .models.conformer import SignConformerV2
from .train_v2 import ModelEMA, epoch_lr, seed_all


class SignContinuousCTC(SignConformerV2):
    """Reuse the XY174 encoder with a per-frame gloss head; blank is always zero."""
    def __init__(self, num_classes, **kwargs):
        super().__init__(num_classes, input_dim=174, stage='b_fingerspelling', **kwargs)


def repair_geometry(x):
    """Restore binary visibility and local handshape after continuous interpolation."""
    x = np.array(x, dtype=np.float32, copy=True)
    x[:,172:] = (x[:,172:] >= .5).astype(np.float32)
    for side,start in enumerate((0,84)):
        body = x[:,start:start+42].reshape(-1,21,2)
        local = body-body[:,:1]
        local /= np.maximum(np.linalg.norm(body[:,9]-body[:,0],axis=-1)[:,None,None],1e-3)
        x[:,start+42:start+84] = local.reshape(-1,42)
        x[x[:,172+side]==0,start:start+84] = 0
    x[x[:,172]==0,168:172] = 0
    return x


def resample(x, length):
    positions = np.linspace(0,len(x)-1,length)
    lo,hi = np.floor(positions).astype(int),np.ceil(positions).astype(int)
    w = (positions-lo)[:,None]
    out = (1-w)*x[lo]+w*x[hi]
    out[:,172:] = x[np.rint(positions).astype(int),172:]
    return repair_geometry(out)


def hermite_transition(left, right, frames, rng, noise_std=.002):
    """Interior samples of a spline; endpoints/derivatives match the adjacent clips."""
    if frames < 1 or len(left)<2 or len(right)<2 or noise_std<0:
        raise ValueError('Hermite stitching requires positive length, nonnegative noise and two boundary frames')
    u = np.arange(1,frames+1,dtype=np.float64)[:,None]/(frames+1)
    p0,p1 = left[-1],right[0]
    m0,m1 = (left[-1]-left[-2])*(frames+1),(right[1]-right[0])*(frames+1)
    out = (2*u**3-3*u**2+1)*p0+(u**3-2*u**2+u)*m0+(-2*u**3+3*u**2)*p1+(u**3-u**2)*m1
    # Vanishing noise at endpoints also preserves endpoint derivatives.
    out[:,:172] += rng.normal(0,noise_std,(frames,172))*(u*(1-u))**2*16
    out[:,172:] = np.where(u<.5,p0[172:],p1[172:])
    return repair_geometry(out)


class StitchedSignStreamDataset(Dataset):
    def __init__(self, isolated, seq_len=128, min_signs=2, max_signs=5, samples=None, seed=42, noise_std=.002):
        if not 2 <= min_signs <= max_signs <= 5 or seq_len < max_signs*2+(max_signs-1)*8 or noise_std<0:
            raise ValueError('Need 2..5 signs and room for at least two frames/sign plus 4..8-frame transitions')
        self.isolated,self.seq_len,self.min_signs,self.max_signs = isolated,seq_len,min_signs,max_signs
        self.seed,self.epoch,self.noise_std = seed,0,noise_std
        self.groups = {}
        for i,r in enumerate(isolated.rows):
            if isolated.targets[i] != 0:
                self.groups.setdefault(r['signer_id'],[]).append(i)
        self.signers = sorted(self.groups)
        if not self.signers:
            raise ValueError('No non-idle clips for continuous stitching')
        self.samples = len(isolated) if samples is None else samples
        if self.samples<1:
            raise ValueError('At least one stream sample is required')
        self.labels = ['<blank>',*isolated.labels[1:]]

    def __len__(self):
        return self.samples

    def sample_indices(self,index):
        rng = np.random.default_rng(self.seed+self.epoch*1000003+index)
        signer = self.signers[int(rng.integers(len(self.signers)))]
        count = int(rng.integers(self.min_signs,self.max_signs+1))
        return rng, rng.choice(self.groups[signer],count,replace=True).tolist()

    def __getitem__(self,index):
        rng,indices = self.sample_indices(index)
        transitions = rng.integers(4,9,len(indices)-1).tolist()
        available = self.seq_len-sum(transitions)
        durations = np.full(len(indices),available//len(indices),dtype=int)
        durations[:available%len(indices)] += 1
        clips,targets = [],[]
        for idx,duration in zip(indices,durations):
            x,y = self.isolated[idx]
            clips.append(resample(x.numpy(),int(duration)))
            targets.append(int(y))
        chunks = [clips[0]]
        for i,n in enumerate(transitions):
            chunks += [hermite_transition(clips[i],clips[i+1],n,rng,self.noise_std),clips[i+1]]
        stream = np.concatenate(chunks)
        minimum = len(targets)+sum(a==b for a,b in zip(targets,targets[1:]))
        if len(stream)!=self.seq_len or minimum>len(stream) or not np.isfinite(stream).all():
            raise ValueError('Invalid CTC stream/target alignment')
        return torch.from_numpy(stream),targets


def real_records(manifest, license_tier, gloss_manifest=None):
    if license_tier!='research':
        raise ValueError('How2Sign requires explicit --license-tier research; never initialize commercial weights from it')
    path = Path(manifest)
    if path.is_dir() or path.suffix=='.json':
        metas = sorted(path.rglob('meta.json')) if path.is_dir() else [path]
        rows = [r for meta in metas for r in shard_records(meta)]
    else:
        rows = pd.read_parquet(path).to_dict('records')
        for row in rows:
            for key in ('feature_path','offsets_path'):
                if key in row and not Path(row[key]).is_absolute():
                    row[key] = str(path.parent/row[key])
    if not rows or any(not isinstance(r.get('signer_id'),str) or not r['signer_id'] for r in rows):
        raise ValueError('Real continuous clips require signer identity')
    validate_splits(rows)
    rows = filter_manifest(pd.DataFrame(rows),'research').to_dict('records')
    if any(r['dataset_id']!='how2sign' or int(r['F']) not in (174,180) for r in rows):
        raise ValueError('Only provenance-checked How2Sign XY174/180 caches are supported for real continuous input')
    if len({r['clip_id'] for r in rows})!=len(rows):
        raise ValueError('Duplicate continuous clip identity')
    if gloss_manifest:
        p = Path(gloss_manifest)
        annotations = json.loads(p.read_text(encoding='utf-8-sig')) if p.suffix=='.json' else pd.read_parquet(p).to_dict('records')
        if len({a['clip_id'] for a in annotations})!=len(annotations):
            raise ValueError('Duplicate gloss annotation identity')
        lookup = {a['clip_id']:a for a in annotations}
        for r in rows:
            a = lookup.get(r['clip_id'])
            if not a or any(a.get(k)!=r[k] for k in ('signer_id','split')):
                raise ValueError('Gloss annotation identity/signer/split mismatch')
            r['glosses'] = a.get('glosses')
    for r in rows:
        tokens = r.get('glosses')
        if not isinstance(tokens,(list,np.ndarray)) or not len(tokens) or any(not isinstance(g,str) or not g.strip() or g in ('_idle','<blank>') for g in tokens):
            raise ValueError('Need reviewed ASL glosses in --gloss-manifest; English sentences are not gloss targets')
        r['glosses'] = list(tokens)
    signers = {split:sorted({r['signer_id'] for r in rows if r['split']==split}) for split in ('train','val','test')}
    return rows,'research',signers


class RealContinuousDataset(Dataset):
    def __init__(self, rows, split, labels):
        self.rows = [r for r in rows if r['split']==split]
        self.labels = labels
        self.reader = LandmarkDataset.__new__(LandmarkDataset)
        self.reader.cache = {}
        if not self.rows:
            raise ValueError('Empty continuous split: '+split)
        self.targets = [[labels.index(g) for g in r['glosses']] for r in self.rows]

    def __len__(self):
        return len(self.rows)

    def __getitem__(self,index):
        x = self.reader._features(self.rows[index])
        target = self.targets[index]
        minimum = len(target)+sum(a==b for a,b in zip(target,target[1:]))
        if x.ndim!=2 or not np.isfinite(x).all() or len(x)<minimum or any(t<=0 for t in target):
            raise ValueError('Invalid real continuous sequence/CTC target')
        # Phase 2 How2Sign appends six face summaries after the unchanged XY174.
        return torch.from_numpy(np.array(x[:,:174],copy=True)),target


@torch.no_grad()
def evaluate_continuous(model,dataset,batch_size=16,device='cpu',beam_width=10):
    model.eval()
    errors, beam_errors, total, losses = 0,0,0,[]
    for x,lengths,y,ny in DataLoader(dataset,batch_size=batch_size,collate_fn=collate):
        logits = model(x.to(device),lengths.to(device))['logits'].cpu()
        loss = F.ctc_loss(logits.log_softmax(-1).transpose(0,1),y,lengths,ny,blank=0,zero_infinity=False)
        if not torch.isfinite(loss):
            raise FloatingPointError('Nonfinite continuous validation loss')
        losses.extend([float(loss)]*len(x))
        offset=0
        for z,n,k in zip(logits,lengths,ny):
            reference = y[offset:offset+k].tolist(); offset+=k
            prediction = greedy_ctc(z,int(n))
            beam = prefix_beam_search(z[:int(n)],beam_width)
            errors += edit_distance(reference,prediction)
            beam_errors += edit_distance(reference,beam)
            total += len(reference)
    return dict(n=len(dataset),reference_glosses=total,gloss_errors=errors,wer=errors/total,
                beam_gloss_errors=beam_errors,beam_wer=beam_errors/total,val_loss=sum(losses)/len(losses))


def datasets(args, labels=None):
    if args.dataset=='how2sign_holistic':
        rows,tier,signers = real_records(args.manifest,args.license_tier,args.gloss_manifest)
        labels = labels or ['<blank>',*sorted({g for r in rows for g in r['glosses']})]
        result = [RealContinuousDataset(rows,split,labels) for split in ('train','val','test')]
    else:
        rows,tier,signers = load_records(args.manifest,args.stage,args.license_tier,
            'all' if args.license_tier=='research' else 'commercial_safe',args.shards)
        if any(r['dataset_id'] not in {'gislr','popsign','asl_citizen','own'} for r in rows):
            raise ValueError('Stitch only isolated GISLR/PopSign, ASL Citizen or consented clips')
        labels = labels or ['<blank>',*sorted({r['canonical_gloss'] for r in rows}-{'_idle'})]
        result = []
        for split in ('train','val','test'):
            isolated = LandmarkDataset(rows,split,args.stage,labels=['_idle',*labels[1:]])
            result.append(StitchedSignStreamDataset(isolated,args.seq_len,
                args.min_signs if split=='train' else max(3,args.min_signs),
                args.max_signs if split=='train' else max(3,args.max_signs),
                samples=args.samples,seed=args.seed+{'train':0,'val':10000,'test':20000}[split]))
    if labels[0]!='<blank>' or len(set(labels))!=len(labels):
        raise ValueError('Unique labels and blank=0 required')
    return result,labels,tier,signers


def initialize_encoder(model,checkpoint,tier):
    ckpt = torch.load(checkpoint,map_location='cpu',weights_only=True)
    if ckpt['config']['license_tier']=='research' and tier!='research':
        raise ValueError('Research weights cannot initialize a commercial run')
    current = model.state_dict()
    compatible = {k:v for k,v in ckpt['model'].items() if k.startswith(('stem.','blocks.')) and k in current and v.shape==current[k].shape}
    if not compatible:
        raise ValueError('No compatible XY174 encoder weights')
    model.load_state_dict(compatible,strict=False)
    return len(compatible)


def train(args):
    seed_all(args.seed); torch.set_num_threads(args.cpu_threads)
    out = Path(args.out_dir)
    if args.smoke_test:
        if args.dataset!='stitched':
            raise ValueError('Smoke mode uses synthetic isolated clips only')
        args.manifest = make_synthetic(out/'synthetic_clips','c1_commercial_250',args.seed).parent
    sets,labels,tier,signers = datasets(args)
    if tier=='research':
        out = out/'research_only'
    out.mkdir(parents=True,exist_ok=True)
    model_kwargs = dict(d_model=192,num_layers=4,dropout=.1)
    device = 'cuda' if args.device=='auto' and torch.cuda.is_available() else 'cpu' if args.device=='auto' else args.device
    model = SignContinuousCTC(len(labels),**model_kwargs).to(device)
    initialized = initialize_encoder(model,args.init_from,tier) if args.init_from else 0
    ema = ModelEMA(model)
    optimizer = torch.optim.AdamW(model.parameters(),lr=args.lr,weight_decay=.01)
    config = dict(stage='d2_continuous_ctc',source_stage=args.stage,dataset=args.dataset,license_tier=tier,
        non_commercial=tier=='research',feature_schema='xy174',blank=0,num_classes=len(labels),model_kwargs=model_kwargs,
        seq_len=args.seq_len,min_signs=args.min_signs,max_signs=args.max_signs,samples=args.samples,seed=args.seed,
        signers=signers,initialized_encoder_tensors=initialized,synthetic=args.smoke_test,torch_version=str(torch.__version__))
    best = float('inf')
    for epoch in range(args.epochs):
        if isinstance(sets[0],StitchedSignStreamDataset):
            sets[0].epoch = epoch
        generator = torch.Generator().manual_seed(args.seed+epoch)
        loader = DataLoader(sets[0],batch_size=args.batch_size,shuffle=True,generator=generator,collate_fn=collate)
        model.train();losses=[]
        for group in optimizer.param_groups:
            group['lr'] = epoch_lr(epoch,args.epochs,args.lr)
        for x,lengths,y,ny in loader:
            optimizer.zero_grad(set_to_none=True)
            logits = model(x.to(device),lengths.to(device))['logits']
            loss = F.ctc_loss(logits.log_softmax(-1).transpose(0,1),y.to(device),lengths,ny,blank=0,zero_infinity=False)
            if not torch.isfinite(loss):
                raise FloatingPointError('Nonfinite continuous training loss')
            loss.backward();torch.nn.utils.clip_grad_norm_(model.parameters(),5.,error_if_nonfinite=True)
            optimizer.step();ema.update(model);losses.append(float(loss.detach()))
        report = evaluate_continuous(ema.model,sets[1],args.batch_size,device)
        record = dict(epoch=epoch+1,train_loss=sum(losses)/len(losses),**report)
        print(json.dumps(record))
        with (out/'metrics.jsonl').open('a',encoding='utf-8') as f:
            f.write(json.dumps(record,allow_nan=False)+'\n')
        if report['val_loss']<best:
            best = report['val_loss']
            torch.save(dict(model=ema.model.state_dict(),config=config,labels=labels),out/'best_ema.pt')
    ckpt = torch.load(out/'best_ema.pt',map_location=device,weights_only=True)
    model.load_state_dict(ckpt['model'])
    summary = dict(synthetic=args.smoke_test,license_tier=tier,non_commercial=tier=='research',
        validation=evaluate_continuous(model,sets[1],args.batch_size,device),test=evaluate_continuous(model,sets[2],args.batch_size,device))
    (out/'config.json').write_text(json.dumps(config,indent=2),encoding='utf-8')
    (out/'summary.json').write_text(json.dumps(summary,indent=2,allow_nan=False),encoding='utf-8')
    print(json.dumps(summary,indent=2))
    return summary


def evaluate_checkpoint(checkpoint,manifest,license_tier='commercial',split='test',shards=None,gloss_manifest=None,out_dir=None):
    ckpt = torch.load(checkpoint,map_location='cpu',weights_only=True)
    cfg = ckpt['config']
    if cfg['stage']!='d2_continuous_ctc' or (cfg['license_tier']=='research' and license_tier!='research'):
        raise ValueError('Continuous checkpoint and matching explicit research opt-in required')
    args = argparse.Namespace(manifest=manifest,shards=shards,gloss_manifest=gloss_manifest,
        dataset=cfg['dataset'],stage=cfg['source_stage'],license_tier=license_tier,
        seq_len=cfg['seq_len'],min_signs=cfg['min_signs'],max_signs=cfg['max_signs'],samples=cfg['samples'],seed=cfg['seed'])
    sets,labels,tier,_ = datasets(args,ckpt['labels'])
    if tier!=cfg['license_tier']:
        raise ValueError('Evaluation tier must match checkpoint provenance')
    model = SignContinuousCTC(len(labels),**cfg['model_kwargs']);model.load_state_dict(ckpt['model'])
    report = evaluate_continuous(model,sets[1 if split=='val' else 2])
    if out_dir:
        out=Path(out_dir);out.mkdir(parents=True,exist_ok=True)
        (out/'continuous_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest',type=Path,default=Path('data/processed/holistic_v2/manifest.parquet'))
    p.add_argument('--shards',type=Path)
    p.add_argument('--gloss-manifest',type=Path)
    p.add_argument('--dataset',choices=['stitched','how2sign_holistic'],default='stitched')
    p.add_argument('--stage',choices=['c1_commercial_250','c2_research_2731'],default='c1_commercial_250')
    p.add_argument('--license-tier',choices=['commercial','research'],default='commercial')
    p.add_argument('--seq-len',type=int,default=128)
    p.add_argument('--min-signs',type=int,default=2)
    p.add_argument('--max-signs',type=int,default=5)
    p.add_argument('--samples',type=int)
    p.add_argument('--epochs',type=int)
    p.add_argument('--batch-size',type=int,default=16)
    p.add_argument('--lr',type=float,default=1.5e-3)
    p.add_argument('--seed',type=int,default=42)
    p.add_argument('--cpu-threads',type=int,default=2)
    p.add_argument('--device',choices=['auto','cpu','cuda'],default='auto')
    p.add_argument('--init-from',type=Path)
    p.add_argument('--out-dir',type=Path,default=Path('ml/checkpoints/stage_d2_continuous_ctc'))
    p.add_argument('--smoke-test',action='store_true')
    a=p.parse_args()
    a.epochs = a.epochs if a.epochs is not None else 2 if a.smoke_test else 30
    if a.smoke_test and a.samples is None:
        a.samples=12
    if a.epochs<1 or a.batch_size<1 or a.lr<=0 or a.cpu_threads<1 or (a.samples is not None and a.samples<1):
        p.error('epochs, batch size, learning rate, threads and samples must be positive')
    train(a)


if __name__=='__main__':
    main()
