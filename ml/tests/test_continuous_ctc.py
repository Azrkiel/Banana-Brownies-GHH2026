"""Stage D2 verification on actual Phase 2 caches and tiny CPU training."""
import argparse
import json
import numpy as np
import pandas as pd
import pytest
import torch
from ml.continuous_ctc import (SignContinuousCTC, StitchedSignStreamDataset, hermite_transition,
    datasets, evaluate_checkpoint, evaluate_continuous, initialize_encoder, real_records, train)
from ml.dataset_v2 import LandmarkDataset, collate, load_records, make_synthetic
from ml.datasets.common import dataset_info
from ml.evaluate_v2 import greedy_ctc

torch.set_num_threads(2)


def args(root, **overrides):
    values=dict(manifest=root,shards=None,gloss_manifest=None,stage='c1_commercial_250',dataset='stitched',
        license_tier='commercial',seq_len=128,min_signs=2,max_signs=5,samples=4,seed=42,
        out_dir=root/'run',smoke_test=False,device='cpu',cpu_threads=2,epochs=1,batch_size=2,lr=.001,init_from=None)
    return argparse.Namespace(**(values|overrides))


def isolated(tmp_path):
    root=make_synthetic(tmp_path/'clips','c1_commercial_250').parent
    rows,_,_=load_records(root,'c1_commercial_250')
    return LandmarkDataset(rows,'train','c1_commercial_250')


def test_stitching_same_signer_determinism_lengths_and_epoch(tmp_path):
    base=isolated(tmp_path)
    stream=StitchedSignStreamDataset(base,samples=10)
    seen=set()
    for i in range(10):
        x,y=stream[i];x2,y2=stream[i]
        assert torch.equal(x,x2) and y==y2
        assert x.shape == (128,174) and torch.isfinite(x).all()
        assert 2<=len(y)<=5 and min(y)>0
        assert set(x[:,172:].unique().tolist()) <= {0.,1.}
        _,indices=stream.sample_indices(i)
        assert len({base.rows[k]['signer_id'] for k in indices}) == 1
        seen.add(len(y))
        absent=x[:,173]==0
        assert torch.count_nonzero(x[absent,84:168])==0
    assert len(seen)>=3
    before=stream[0][0];stream.epoch=1
    assert not torch.equal(before,stream[0][0])


def test_hermite_interpolation_matches_boundary_velocity_and_noise(tmp_path):
    left=np.zeros((2,174),dtype=np.float32);right=left.copy()
    # Constant velocity yields an exactly straight Hermite trajectory.
    left[:,0]=[-.1,0];right[:,0]=[.7,.8];left[:,172]=1;right[:,172]=1
    z=hermite_transition(left,right,6,np.random.default_rng(1),noise_std=0)
    np.testing.assert_allclose(z[:,0],np.arange(1,7)*.1,atol=1e-6)
    noisy=hermite_transition(left,right,6,np.random.default_rng(1))
    assert not np.array_equal(noisy,z)
    np.testing.assert_array_equal(noisy[:,172:],z[:,172:])


@pytest.mark.parametrize('kwargs',[dict(min_signs=1),dict(max_signs=6),dict(seq_len=10),dict(noise_std=-1),dict(samples=0)])
def test_invalid_stitch_config(tmp_path,kwargs):
    with pytest.raises(ValueError):
        StitchedSignStreamDataset(isolated(tmp_path),**kwargs)


def test_production_model_ctc_backward_padding_and_repeated_signs(tmp_path):
    model=SignContinuousCTC(3,dropout=0).eval()
    data=StitchedSignStreamDataset(isolated(tmp_path),min_signs=5,max_signs=5,samples=2)
    x,n,y,ny=collate([data[0],data[1]])
    z=model(x,n)['logits']
    assert z.shape==(2,128,3)
    loss=torch.nn.functional.ctc_loss(z.log_softmax(-1).transpose(0,1),y,n,ny,blank=0,zero_infinity=False)
    loss.backward()
    assert torch.isfinite(loss)
    assert all(torch.isfinite(p.grad).all() for p in model.parameters() if p.grad is not None)
    torch.testing.assert_close(z[:,:128],model(torch.nn.functional.pad(x,(0,0,0,4)),n)['logits'][:,:128],atol=1e-5,rtol=1e-5)
    assert greedy_ctc(torch.tensor([[0.,5,0],[0,5,0],[5,0,0],[0,5,0]]))==[1,1]


def real_manifest(tmp_path, glosses=True):
    rows=[]
    for i,split in enumerate(('train','val','test')):
        path=tmp_path/f'{split}.npz'
        x=np.zeros((1,12,180),dtype=np.float32);x[:,:,:174]=.1;x[:,:,172:174]=1;x[:,:,174:]=99
        np.savez(path,X=x)
        rows.append(dict(clip_id=f'how2sign:{i}',dataset_id='how2sign',signer_id=f'how2sign:{split}',split=split,
            feature_path=path.name,row_index=0,F=180,T=12,n=1,canonical_gloss='ENGLISH_SENTENCE',
            license=dataset_info('how2sign')['license'],license_tier='research',**({'glosses':['YOU','KNOW']} if glosses else {})))
    path=tmp_path/'manifest.parquet';pd.DataFrame(rows).to_parquet(path)
    return path


def test_real_how2sign_annotations_and_license_opt_in(tmp_path):
    manifest=real_manifest(tmp_path)
    with pytest.raises(ValueError,match='research'):
        real_records(manifest,'commercial')
    cfg=args(tmp_path,manifest=manifest,dataset='how2sign_holistic',license_tier='research')
    sets,labels,tier,signers=datasets(cfg)
    assert tier=='research' and labels[0]=='<blank>'
    x,y=sets[0][0]
    assert x.shape==(12,174) and x.max()<99 and len(y)==2
    assert set(signers['train']).isdisjoint(signers['val'])
    real_manifest(tmp_path,False)
    with pytest.raises(ValueError,match='English sentences'):
        real_records(manifest,'research')
    annotations=[dict(clip_id=f'how2sign:{i}',signer_id=f'how2sign:{s}',split=s,glosses=['YOU','KNOW']) for i,s in enumerate(('train','val','test'))]
    annotation_path=tmp_path/'glosses.json';annotation_path.write_text(json.dumps(annotations))
    assert real_records(manifest,'research',annotation_path)[0][0]['glosses']==['YOU','KNOW']
    annotations[0]['signer_id']='wrong';annotation_path.write_text(json.dumps(annotations))
    with pytest.raises(ValueError,match='mismatch'):
        real_records(manifest,'research',annotation_path)


def test_real_rejects_split_leakage_spoofed_license_and_impossible_ctc(tmp_path):
    manifest=real_manifest(tmp_path)
    df=pd.read_parquet(manifest);df.loc[0,'signer_id']=df.loc[1,'signer_id'];df.to_parquet(manifest)
    with pytest.raises(ValueError,match='leakage'):
        real_records(manifest,'research')
    manifest=real_manifest(tmp_path);df=pd.read_parquet(manifest);df.loc[0,'license']='CC BY 4.0';df.to_parquet(manifest)
    with pytest.raises(ValueError,match='license'):
        real_records(manifest,'research')
    manifest=real_manifest(tmp_path);df=pd.read_parquet(manifest);df.at[0,'glosses']=['YOU']*20;df.to_parquet(manifest)
    sets,_,_,_=datasets(args(tmp_path,manifest=manifest,dataset='how2sign_holistic',license_tier='research'))
    with pytest.raises(ValueError,match='CTC'):
        sets[0][0]


def test_research_initialization_never_taints_commercial(tmp_path):
    model=SignContinuousCTC(3)
    ckpt=tmp_path/'research.pt';torch.save(dict(config={'license_tier':'research'},model=model.state_dict()),ckpt)
    with pytest.raises(ValueError,match='Research weights'):
        initialize_encoder(model,ckpt,'commercial')
    assert initialize_encoder(model,ckpt,'research')>0


def test_word_error_metric_counts_substitution_insertion_and_deletion():
    class Known(torch.nn.Module):
        def forward(self,x,lengths):
            z=torch.full((len(x),5,4),-20.)
            # reference [1,2]; predicted [1,3,3] => one substitution + insertion
            for i,token in enumerate([1,0,3,0,3]):z[:,i,token]=20
            return {'logits':z}
    sample=[(torch.zeros(5,174),[1,2])]
    report=evaluate_continuous(Known(),sample)
    assert report['wer']==1 and report['beam_wer']==1


def test_full_cpu_training_checkpoint_reload_and_evaluation(tmp_path):
    root=make_synthetic(tmp_path/'clips','c1_commercial_250').parent
    cfg=args(root)
    summary=train(cfg)
    ckpt=torch.load(cfg.out_dir/'best_ema.pt',weights_only=True)
    assert ckpt['config']['blank']==0 and ckpt['labels'][0]=='<blank>'
    assert ckpt['config']['license_tier']=='commercial' and not ckpt['config']['non_commercial']
    assert summary['validation']['n']==4 and summary['test']['reference_glosses']>=12
    report=evaluate_checkpoint(cfg.out_dir/'best_ema.pt',root,split='test')
    assert report['wer']==summary['test']['wer']
