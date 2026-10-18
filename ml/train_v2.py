"""Deterministic Stage B/C training, EMA, validation calibration and CPU export."""
import argparse
import copy
import json
import math
import os
import random
import time
from pathlib import Path
import numpy as np
import torch
from torch.nn import functional as F
from torch.utils.data import DataLoader
from .calibrate import bake_temperature, fit_temperature
from .dataset_v2 import CHARACTERS, LandmarkDataset, collate, load_records, make_synthetic
from .evaluate_v2 import collect_outputs, evaluate, isolated_metrics, sequence_metrics
from .models import STAGES, build_model
from .models.heads import classification_loss


def seed_all(seed):
    os.environ.setdefault('CUBLAS_WORKSPACE_CONFIG', ':4096:8')
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic=True
    torch.backends.cudnn.benchmark=False
    torch.use_deterministic_algorithms(True)


class ModelEMA:
    def __init__(self, model, decay=.995):
        self.model=copy.deepcopy(model).eval()
        self.decay=decay
        self.model.requires_grad_(False)

    @torch.no_grad()
    def update(self,model):
        source=model.state_dict()
        for key,value in self.model.state_dict().items():
            current=source[key]
            if value.is_floating_point():
                value.lerp_(current,1-self.decay)
            else:
                value.copy_(current)


def epoch_lr(epoch, epochs, base=1.5e-3, minimum=1e-5, warmup=5):
    if epoch < warmup:
        return base*(epoch+1)/warmup
    fraction=(epoch-warmup)/max(1,epochs-warmup-1)
    return minimum+(base-minimum)*.5*(1+math.cos(math.pi*fraction))


class ExportModel(torch.nn.Module):
    def __init__(self,model):
        super().__init__(); self.model=model

    def forward(self,x,lengths):
        result=self.model(x,lengths)
        if 'hand_activity_logit' in result:
            return result['logits'],result['hand_activity_logit']
        return result['logits']


def export_onnx(model,path,input_dim,ctc=False):
    import onnx
    import onnxruntime as ort
    wrapper=ExportModel(copy.deepcopy(model).cpu().eval()).eval()
    x=torch.randn(2,16,input_dim)
    if input_dim==174:
        x[:,:,172:]=1
    lengths=torch.tensor([16,12],dtype=torch.long)
    x[1,12:]=0
    outputs=['logits'] if ctc else ['logits','hand_activity_logit']
    axes={'features':{0:'batch',1:'time'},'lengths':{0:'batch'},'logits':{0:'batch'}}
    if ctc:
        axes['logits'][1]='time'
    else:
        axes['hand_activity_logit']={0:'batch'}
    torch.onnx.export(wrapper,(x,lengths),str(path),input_names=['features','lengths'],output_names=outputs,
                      dynamic_axes=axes,opset_version=17,dynamo=False)
    onnx.checker.check_model(onnx.load(path))
    session=ort.InferenceSession(str(path),providers=['CPUExecutionProvider'])
    error=0.
    # Different batch/time dimensions verify genuinely dynamic export.
    for b,t in ((2,16),(1,23)):
        sample=torch.randn(b,t,input_dim)
        n=torch.full((b,),t,dtype=torch.long)
        if input_dim==174:
            sample[:,:,172:]=1
        with torch.no_grad():
            expected=wrapper(sample,n)
        if isinstance(expected,torch.Tensor):
            expected=(expected,)
        actual=session.run(None,{'features':sample.numpy(),'lengths':n.numpy()})
        for left,right in zip(expected,actual):
            np.testing.assert_allclose(left.numpy(),right,atol=1e-3,rtol=1e-3)
            error=max(error,float(np.max(np.abs(left.numpy()-right))))
    return error


def train(args):
    seed_all(args.seed)
    torch.set_num_threads(args.cpu_threads)
    if args.device=='cuda' and not torch.cuda.is_available():
        raise ValueError('CUDA requested but unavailable')
    device='cpu' if args.smoke_test else ('cuda' if args.device=='auto' and torch.cuda.is_available() else args.device)
    if device=='auto':
        device='cpu'
    # Resolve all artifacts into ignored directories; isolate research weights.
    out=args.out_dir or Path('ml/checkpoints')/time.strftime('%Y%m%d-%H%M%S')
    if args.license_tier=='research' and args.stage!='c1_commercial_250':
        out=out/'research_only'
    out.mkdir(parents=True,exist_ok=True)
    manifest=make_synthetic(out/'synthetic',args.stage,args.seed) if args.smoke_test else args.manifest
    rows,tier,signers=load_records(manifest,args.stage,args.license_tier,args.license_filter,args.shards)
    print(json.dumps({'device':device,'license_tier':tier,'signers':{s:len(v) for s,v in signers.items()}}))
    train_set=LandmarkDataset(rows,'train',args.stage,training=True)
    val_set=LandmarkDataset(rows,'val',args.stage,labels=train_set.labels)
    test_set=LandmarkDataset(rows,'test',args.stage,labels=train_set.labels)
    ctc=args.stage=='b_fingerspelling'
    labels=CHARACTERS if ctc else train_set.labels
    num_classes=len(labels)
    if args.stage=='c1_commercial_250' and num_classes>251:
        raise ValueError('C1 exceeds 250 signs plus idle')
    if args.stage=='c2_research_2731' and num_classes>2732:
        raise ValueError('C2 exceeds 2731 signs plus idle')
    # Smoke uses the full production architecture; only data/epochs are smaller.
    model_kwargs = ({'d_model': getattr(args, 'd_model', 192),
                     'num_layers': getattr(args, 'num_layers', 4)} if args.arch == 'conformer' else {})
    model=build_model(args.arch,args.stage,num_classes,**model_kwargs).to(device)
    if args.init_from:
        previous=torch.load(args.init_from,map_location='cpu',weights_only=True)
        if previous['config']['license_tier']=='research' and tier=='commercial':
            raise ValueError('Research weights cannot initialize commercial training')
        if previous['config']['arch'] != args.arch or previous['config']['feature_schema'] != ('aslfr90' if ctc else 'xy174'):
            raise ValueError('Initialization architecture/feature schema mismatch')
        state={k:v for k,v in previous['model'].items() if not k.startswith('head.')}
        model.load_state_dict(state,strict=False)
    ema=ModelEMA(model, decay=getattr(args, 'ema_decay', .995))
    optimizer=torch.optim.AdamW(model.parameters(),lr=args.lr,weight_decay=1e-2)
    scaler=torch.amp.GradScaler('cuda',enabled=device=='cuda')
    generator=torch.Generator().manual_seed(args.seed)
    sampler=train_set.sampler(generator)
    loader=DataLoader(train_set,batch_size=args.batch_size,sampler=sampler,shuffle=sampler is None,
                      collate_fn=collate,generator=generator,num_workers=0)
    counts=torch.tensor(np.bincount(train_set.targets,minlength=num_classes),dtype=torch.float32,device=device) if not ctc else None
    epochs=args.epochs if args.epochs is not None else (2 if args.smoke_test else 60)
    config=dict(stage=args.stage,arch=args.arch,num_classes=num_classes,model_kwargs=model_kwargs,
                license_tier=tier,seed=args.seed,epochs=epochs,manifest=str(manifest),signers=signers,
                synthetic=bool(args.smoke_test),ema_decay=getattr(args, 'ema_decay', .995),
                feature_schema='aslfr90' if ctc else 'xy174',torch_version=str(torch.__version__))
    (out/'config.json').write_text(json.dumps(config,indent=2),encoding='utf-8')
    tracker=None
    if args.wandb:
        import wandb
        tracker=wandb.init(project='signline-model-v2',config=config)
    best=float('inf')
    start=time.perf_counter()
    with (out/'metrics.jsonl').open('w',encoding='utf-8') as metrics:
        for epoch in range(epochs):
            lr=epoch_lr(epoch,epochs,args.lr)
            for group in optimizer.param_groups:
                group['lr']=lr
            model.train(); losses=[]
            for x,lengths,y,ny in loader:
                x,lengths,y=x.to(device),lengths.to(device),y.to(device)
                if not ctc:
                    # Always teach an explicit empty-background baseline, even
                    # when a source corpus contains only labelled signs. Real
                    # resting/transition clips still require first-party data.
                    idle_n=max(1,math.ceil(len(x)*.05))
                    x=torch.cat([x,x.new_zeros(idle_n,x.shape[1],x.shape[2])])
                    lengths=torch.cat([lengths,lengths.new_full((idle_n,),x.shape[1])])
                    y=torch.cat([y,y.new_zeros(idle_n)])
                optimizer.zero_grad(set_to_none=True)
                with torch.amp.autocast(device_type=device,dtype=torch.float16,enabled=device=='cuda'):
                    result=model(x,lengths,targets=None if ctc else y)
                    if ctc:
                        loss=F.ctc_loss(result['logits'].float().log_softmax(-1).transpose(0,1),y,lengths,ny,blank=0,zero_infinity=True)
                    else:
                        loss=classification_loss(result['logits'],y,counts)
                        loss=loss+.1*F.binary_cross_entropy_with_logits(result['hand_activity_logit'],y.ne(0).float())
                if not torch.isfinite(loss):
                    raise FloatingPointError('Non-finite training loss')
                scaler.scale(loss).backward()
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(),5.,error_if_nonfinite=True)
                scaler.step(optimizer); scaler.update(); ema.update(model)
                losses.append(float(loss.detach()))
            z,y,n,ny,_=collect_outputs(ema.model,val_set,args.batch_size,device)
            if ctc:
                val_loss=float(F.ctc_loss(z.log_softmax(-1).transpose(0,1),y,n,ny,zero_infinity=False))
                values=sequence_metrics(z,val_set.targets,n) if (epoch+1) % getattr(args, 'metrics_interval', 1) == 0 or epoch+1 == epochs else {}
                accuracy={k:None for k in ('top1','top5','macro_f1','ece')}
            else:
                val_loss=float(F.cross_entropy(z,y)); accuracy=isolated_metrics(z,y)[0]; values={}
            record=dict(epoch=epoch+1,train_loss=sum(losses)/len(losses),val_loss=val_loss,
                val_top1=accuracy['top1'],val_top5=accuracy['top5'],val_macro_f1=accuracy['macro_f1'],
                val_ece=accuracy['ece'],lr=lr,wall_time_s=time.perf_counter()-start,**values)
            metrics.write(json.dumps(record,allow_nan=False)+'\n'); metrics.flush()
            print(json.dumps(record,allow_nan=False))
            if tracker:
                tracker.log(record)
            if val_loss<best:
                best=val_loss
                torch.save(dict(model=ema.model.state_dict(),config=config,labels=labels,calibrated=False),out/'best_ema.pt')
    checkpoint=torch.load(out/'best_ema.pt',map_location=device,weights_only=True)
    model.load_state_dict(checkpoint['model']); model.eval()
    z,y,n,ny,_=collect_outputs(model,val_set,args.batch_size,device)
    calibration=fit_temperature(z,y,n,ny)
    bake_temperature(model,calibration['temperature'])
    checkpoint.update(model=model.state_dict(),calibrated=True,calibration=calibration)
    torch.save(checkpoint,out/'best_ema.pt')
    (out/'calibration.json').write_text(json.dumps(calibration,indent=2),encoding='utf-8')
    report=evaluate(model,test_set,out,args.batch_size,device)
    parity=export_onnx(model,out/('fingerspell_v2.onnx' if ctc else 'sign_v2.onnx'),90 if ctc else 174,ctc)
    result=dict(synthetic=args.smoke_test,calibration=calibration,test=report,onnx_max_abs_error=parity,output=str(out))
    (out/'summary.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    if tracker:
        tracker.finish()
    print(json.dumps(result,indent=2))
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest',type=Path,default=Path('data/processed/holistic_v2/manifest.parquet'))
    p.add_argument('--shards',type=Path)
    p.add_argument('--stage',choices=STAGES,default='c1_commercial_250')
    p.add_argument('--arch',choices=['conformer','bigru'],default='conformer')
    p.add_argument('--license-tier',choices=['commercial','research'],default='commercial')
    p.add_argument('--license-filter',choices=['commercial_safe','all'],default='commercial_safe')
    p.add_argument('--epochs',type=int)
    p.add_argument('--batch-size',type=int,default=128)
    p.add_argument('--lr',type=float,default=1.5e-3)
    p.add_argument('--seed',type=int,default=42)
    p.add_argument('--cpu-threads',type=int,default=2)
    p.add_argument('--device',choices=['auto','cpu','cuda'],default='auto')
    p.add_argument('--out-dir',type=Path)
    p.add_argument('--init-from',type=Path)
    p.add_argument('--wandb',action='store_true')
    p.add_argument('--d-model',type=int,default=192,choices=[128,192])
    p.add_argument('--num-layers',type=int,default=4,choices=[1,2,3,4])
    p.add_argument('--ema-decay',type=float,default=.995)
    p.add_argument('--metrics-interval',type=int,default=1,help='Decode validation CTC metrics every N epochs; loss selection still runs every epoch')
    p.add_argument('--smoke-test',action='store_true')
    a=p.parse_args()
    if a.batch_size<1 or a.lr<=0 or a.cpu_threads<1 or a.metrics_interval<1 or not 0 <= a.ema_decay < 1 or (a.epochs is not None and a.epochs<1):
        p.error('batch-size, learning rate, threads and epochs must be positive')
    train(a)


if __name__=='__main__':
    main()
