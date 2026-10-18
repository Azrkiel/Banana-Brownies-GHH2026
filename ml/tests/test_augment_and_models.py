"""Phase 3 verification against the real browser schema and Phase 2 caches."""
import itertools
import json
import math
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
import torch
from ml import augment as aug
from ml.calibrate import bake_temperature, fit_temperature
from ml.dataset_v2 import CHARACTERS, LandmarkDataset, collate, load_records, make_synthetic
from ml.datasets.common import dataset_info
from ml.evaluate_v2 import greedy_ctc, isolated_metrics, prefix_beam_search, sequence_metrics
from ml.features import anchors, frame_features, mirror_frame
from ml.models import build_model
from ml.models.heads import classification_loss
from ml.train_v2 import ModelEMA, epoch_lr, export_onnx, seed_all

torch.set_num_threads(2)


def frame(two=True):
    pose=[dict(x=.4+i*.003,y=.2+i*.01,z=0) for i in range(17)]
    pose[11],pose[12]=dict(x=.3,y=.4,z=0),dict(x=.7,y=.4,z=0)
    hands=[[dict(x=offset+i*.002,y=.5+i*.003,z=.02*i) for i in range(21)] for offset in ([.2,.6] if two else [.6])]
    return dict(w=4,h=3,pose=pose,hands=hands,brow=None)


def sequence(two=True,t=8):
    f=frame(two)
    return np.tile(np.array(frame_features(f,anchors(f)),dtype=np.float32),(t,1))


@pytest.mark.parametrize('two',[False,True])
def test_mirror_matches_real_feature_extractor(two):
    f=frame(two); mirrored=mirror_frame(f)
    expected=np.array(frame_features(mirrored,anchors(mirrored)))
    actual=aug.mirror_hands_and_pose(sequence(two),p=1)
    np.testing.assert_allclose(actual[0],expected,atol=1e-6)
    np.testing.assert_allclose(aug.mirror_hands_and_pose(actual,p=1),sequence(two),atol=1e-6)
    np.testing.assert_array_equal(actual[:,172:],sequence(two)[:,172:])


def test_mirror_moves_real_hand_blocks():
    x=sequence(); y=aug.mirror_hands_and_pose(x,1)
    np.testing.assert_allclose(y[:,:84:2],-x[:,84:168:2])
    np.testing.assert_allclose(y[:,1:84:2],x[:,85:168:2])
    np.testing.assert_array_equal(aug.mirror_hands_and_pose(x,0),x)
    np.testing.assert_array_equal(aug.mirror_hands_and_pose(np.zeros_like(x),1),np.zeros_like(x))


@pytest.mark.parametrize('function',[aug.mirror_hands_and_pose,aug.random_3d_rotation_and_camera_tilt,
    aug.random_temporal_resample,aug.random_hand_dropout_and_occlusion,aug.random_scale_and_perspective_jitter])
def test_augment_preserves_missingness_dtype_and_input(function):
    x=sequence(False); original=x.copy(); y=function(x)
    np.testing.assert_array_equal(x,original)
    assert y.shape==x.shape and y.dtype==np.float32 and np.isfinite(y).all()
    assert set(np.unique(y[:,172:])).issubset({0.,1.})
    np.testing.assert_array_equal(y[:,84:168],np.zeros((len(y),84)))
    np.testing.assert_array_equal(function(np.zeros_like(x)),np.zeros_like(x))


def test_rotation_and_scaling_preserve_local_wrist_origin():
    x=sequence()
    for function in [aug.random_3d_rotation_and_camera_tilt,aug.random_scale_and_perspective_jitter]:
        y=function(x)
        np.testing.assert_allclose(y[:,42:44],0,atol=1e-7)
        np.testing.assert_allclose(y[:,126:128],0,atol=1e-7)
        assert np.isfinite(y).all()


def test_temporal_and_dropout_boundaries():
    x=sequence(t=12)
    fast=aug.random_temporal_resample(x,(2,2))
    np.testing.assert_array_equal(fast[6:],0)
    dropped=aug.random_hand_dropout_and_occlusion(x,1,1)
    assert np.isfinite(dropped).all()
    assert np.all(dropped[:,173]==0)
    assert len(aug.random_temporal_resample(np.empty((0,174))))==0
    with pytest.raises(ValueError):
        aug.mirror_hands_and_pose(np.zeros((5,90)))


@pytest.mark.parametrize('arch',['conformer','bigru'])
@pytest.mark.parametrize('stage,classes,width',[('c1_commercial_250',251,174),('c2_research_2731',2732,174),('b_fingerspelling',40,90)])
def test_models_forward_backward_padding_and_empty_input(arch,stage,classes,width):
    seed_all(7)
    model=build_model(arch,stage,classes).eval()
    x=torch.randn(2,12,width)
    if width==174:
        x[:,:,172:]=1
    lengths=torch.tensor([12,8]); x[1,8:]=0
    result=model(x,lengths)
    assert result['logits'].shape==((2,12,classes) if width==90 else (2,classes))
    padded=torch.nn.functional.pad(x,(0,0,0,7))
    other=model(padded,lengths)['logits']
    if width==90:
        other=other[:,:12]
    torch.testing.assert_close(other,result['logits'],atol=2e-5,rtol=2e-5)
    result['logits'].square().mean().backward()
    assert all(torch.isfinite(p.grad).all() for p in model.parameters() if p.grad is not None)
    empty=model(torch.zeros_like(x),torch.zeros_like(lengths))['logits']
    assert torch.isfinite(empty).all()


@pytest.mark.parametrize('arch',['conformer','bigru'])
@pytest.mark.parametrize('stage,width',[('c1_commercial_250',174),('b_fingerspelling',90)])
def test_onnx_export_and_dynamic_runtime_parity(tmp_path,arch,stage,width):
    model=build_model(arch,stage,40 if width==90 else 7).eval()
    error=export_onnx(model,tmp_path/'model.onnx',width,width==90)
    assert error<1e-3


@pytest.mark.parametrize('stage',['c1_commercial_250','b_fingerspelling'])
def test_phase2_mmap_data_signers_and_labels(tmp_path,stage):
    meta=make_synthetic(tmp_path,stage)
    rows,tier,signers=load_records(meta,stage)
    assert tier=='commercial' and all(len(v)==1 for v in signers.values())
    dataset=LandmarkDataset(rows,'train',stage)
    x,target=dataset[0]
    assert x.shape==(12,90) if stage=='b_fingerspelling' else x.shape==(32,174)
    if stage=='b_fingerspelling':
        assert target==[1,2] and CHARACTERS[37]==' '
    else:
        assert dataset.labels[0]=='_idle'
        sampler=dataset.sampler(torch.Generator().manual_seed(2))
        assert len(list(sampler))==len(dataset)
    assert collate([dataset[0],dataset[1]])[0].shape[0]==2


def test_manifest_rejects_leakage_license_spoof_and_corrupt_shard(tmp_path):
    path=make_synthetic(tmp_path,'c1_commercial_250')
    meta=json.loads(path.read_text()); original=json.loads(path.read_text())
    meta['signers'][50]=meta['signers'][0]; path.write_text(json.dumps(meta))
    with pytest.raises(ValueError,match='Signer leakage'):
        load_records(path,'c1_commercial_250')
    meta=original.copy(); meta['license']='invented'; path.write_text(json.dumps(meta))
    with pytest.raises(ValueError,match='license'):
        load_records(path,'c1_commercial_250')
    path.write_text(json.dumps(original))
    rows,_,_=load_records(path,'c1_commercial_250')
    (tmp_path/'X.f32').write_bytes(b'bad!')
    with pytest.raises(ValueError,match='Truncated'):
        LandmarkDataset(rows,'train','c1_commercial_250')[0]


def test_commercial_stage_forces_filter_before_feature_access(tmp_path):
    path=make_synthetic(tmp_path/'own','c1_commercial_250')
    meta=json.loads(path.read_text())
    info=dataset_info('asl_citizen')
    meta.update(source='asl_citizen',license=info['license'],license_tier=info['license_tier'])
    meta['clip_ids']=['research:'+str(i) for i in range(meta['n'])]
    meta['signers']=['research:'+s for s in meta['signers']]
    root=tmp_path/'restricted'; root.mkdir(); (root/'meta.json').write_text(json.dumps(meta))
    # No research feature file exists. Filtering must happen before opening it.
    rows,tier,_=load_records(tmp_path,'c1_commercial_250','research','all')
    assert tier=='commercial' and {r['dataset_id'] for r in rows}=={'own'}


def test_npz_and_manifest_join_provenance(tmp_path):
    path=make_synthetic(tmp_path/'cache','c1_commercial_250')
    rows,_,_=load_records(path,'c1_commercial_250')
    manifest=tmp_path/'manifest.parquet'
    provenance=[{k:r[k] for k in ('clip_id','dataset_id','signer_id','split','license','license_tier','canonical_gloss')} for r in rows]
    pd.DataFrame(provenance).to_parquet(manifest)
    loaded,_,_=load_records(manifest,'c1_commercial_250',shards=path.parent)
    np.testing.assert_array_equal(LandmarkDataset(loaded,'train','c1_commercial_250')[1][0],LandmarkDataset(rows,'train','c1_commercial_250')[1][0])
    data=np.stack([LandmarkDataset(rows,'train','c1_commercial_250')[i][0].numpy() for i in range(48)])
    np.savez(tmp_path/'micro.npz',X=data)
    subset=[dict(r,feature_path=str(tmp_path/'micro.npz')) for r in rows[:48]]
    np.testing.assert_array_equal(LandmarkDataset(subset,'train','c1_commercial_250')[2][0],data[2])
    provenance[0]['signer_id']='other'; pd.DataFrame(provenance).to_parquet(manifest)
    with pytest.raises(ValueError,match='provenance'):
        load_records(manifest,'c1_commercial_250',shards=path.parent)


def test_ctc_rejects_unalignable_repeated_targets_and_unsupported_characters(tmp_path):
    path=make_synthetic(tmp_path,'b_fingerspelling')
    meta=json.loads(path.read_text()); meta['phrases'][0]='A'*13
    path.write_text(json.dumps(meta)); rows,_,_=load_records(path,'b_fingerspelling')
    with pytest.raises(ValueError,match='align'):
        LandmarkDataset(rows,'train','b_fingerspelling')[0]
    meta['phrases'][0]='@'; path.write_text(json.dumps(meta))
    rows,_,_=load_records(path,'b_fingerspelling')
    with pytest.raises(ValueError,match='Unsupported'):
        LandmarkDataset(rows,'train','b_fingerspelling')


def test_temperature_fits_positive_nll_and_bakes_exactly():
    logits=torch.tensor([[8.,0.],[0.,8.],[8.,0.],[0.,8.]])
    targets=torch.tensor([0,1,1,1])
    result=fit_temperature(logits,targets)
    assert result['temperature']>0 and result['nll_after']<result['nll_before']
    model=build_model(num_classes=3).eval(); x=torch.tensor(sequence())[None]
    before=model(x)['logits']; bake_temperature(model,result['temperature'])
    torch.testing.assert_close(model(x)['logits'],before/result['temperature'])
    for t in (0,-1,float('nan')):
        with pytest.raises(ValueError):
            bake_temperature(model,t)


def test_ctc_temperature_uses_sequence_objective():
    logits=torch.randn(2,8,40)
    targets=torch.tensor([1,2,3,3]); lengths=torch.tensor([8,7]); ny=torch.tensor([2,2])
    result=fit_temperature(logits,targets,lengths,ny)
    assert result['temperature']>0 and result['nll_after']<=result['nll_before']
    assert 'ece_after' not in result  # No frame-level ground truth exists for CTC.


def test_isolated_metrics_idle_macro_and_top5():
    logits=torch.tensor([[4.,0.,0.],[0.,4.,0.],[4.,0.,0.],[0.,0.,4.]])
    targets=torch.tensor([0,1,0,1])
    report,matrix=isolated_metrics(logits,targets)
    assert report['top1']==.75 and report['top5']==1 and report['idle_false_positive_rate']==0
    assert report['macro_top1']==.75 and matrix.sum()==4


def test_ctc_greedy_repeats_and_beam_matches_exhaustive_paths():
    logits=torch.tensor([[1.,3.,0.],[3.,0.,1.],[0.,3.,1.]])
    assert greedy_ctc(logits)==[1,1]
    probabilities=logits.softmax(-1).numpy(); sums={}
    for path in itertools.product(range(3),repeat=3):
        decoded=tuple(c for i,c in enumerate(path) if c and (not i or path[i-1]!=c))
        sums[decoded]=sums.get(decoded,0)+math.prod(probabilities[i,c] for i,c in enumerate(path))
    assert prefix_beam_search(logits,beam_width=100)==list(max(sums,key=sums.get))
    full=torch.full((1,3,40),-20.); full[0,0,1]=20; full[0,1,0]=20; full[0,2,1]=20
    metrics=sequence_metrics(full,[[1,1]],[3])
    assert metrics['greedy_cer']==metrics['beam_cer']==0
    assert metrics['greedy_wer']==metrics['beam_wer']==0
    assert metrics['greedy_isolated_character_top1'] is None


def test_balanced_loss_ema_schedule_and_determinism():
    seed_all(42); model=build_model(num_classes=3); ema=ModelEMA(model)
    logits=torch.randn(4,3,requires_grad=True)
    loss=classification_loss(logits,torch.tensor([0,1,2,1]),torch.tensor([100.,10.,1.]))
    loss.backward(); assert torch.isfinite(logits.grad).all()
    with torch.no_grad():
        next(model.parameters()).add_(1)
    ema.update(model)
    assert not torch.equal(next(ema.model.parameters()),next(model.parameters()))
    assert epoch_lr(0,60)<epoch_lr(4,60) and abs(epoch_lr(59,60)-1e-5)<1e-10
    seed_all(42); a=torch.rand(4); seed_all(42); torch.testing.assert_close(a,torch.rand(4))
