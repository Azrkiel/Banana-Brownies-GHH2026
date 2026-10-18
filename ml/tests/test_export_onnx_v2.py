"""Exporter validates actual checkpoint logits, inline tensors, provenance and strict parity."""
import json
from pathlib import Path
import numpy as np
import onnx
import onnxruntime as ort
import pytest
import torch
from ml.models import build_model
from ml.export_onnx_v2 import BrowserModel, export_bundle, export_one

def checkpoint(tmp_path, stage):
    torch.manual_seed(42)
    labels = ['<blank>','A','B'] if stage == 'b_fingerspelling' else ['_idle','HELLO','BOOK']
    kwargs = {'num_layers':2, 'd_model':128} if stage == 'b_fingerspelling' else {'num_layers':1}
    cfg = dict(arch='conformer',stage=stage,num_classes=3,model_kwargs=kwargs,
               license_tier='commercial',manifest=str(tmp_path/'synthetic'/'manifest.parquet'))
    model = build_model('conformer',stage,3,**kwargs).eval()
    path = tmp_path/(stage+'.pt')
    torch.save(dict(model=model.state_dict(),config=cfg,labels=labels,calibrated=True),path)
    return path, model

@pytest.mark.parametrize('stage,dim,time',[('c1_commercial_250',174,32),('b_fingerspelling',90,64)])
def test_browser_head_matches_training_model_with_missing_and_idle_frames(tmp_path,stage,dim,time):
    _, model = checkpoint(tmp_path,stage)
    wrapper = BrowserModel(model).eval()
    x = torch.randn(1,time,dim); x[:,time//2:]=0
    with torch.no_grad():
        expected = model(x,torch.tensor([time]))['logits']
        logits,embedding,activity = wrapper(x)
    torch.testing.assert_close(logits,expected)
    assert embedding.shape == (1,192) and activity.shape == (1,)
    torch.testing.assert_close(embedding.norm(dim=-1),torch.ones(1))
    assert torch.isfinite(wrapper(torch.zeros_like(x))[0]).all()

def test_single_file_bundle_hashes_and_100_clip_probability_parity(tmp_path):
    c1,_=checkpoint(tmp_path,'c1_commercial_250'); b,_=checkpoint(tmp_path,'b_fingerspelling')
    out=tmp_path/'bundle'
    manifest=export_bundle(c1,b,out,'fp16',True)
    assert not manifest['deployable'] and manifest['temperature_baked']
    assert json.loads((out/'manifest.json').read_text())==manifest
    assert manifest['c1_size_bytes'] <= 4_000_000 and manifest['b_size_bytes'] <= 2_000_000
    assert len(list(out.iterdir()))==3 and not list(out.glob('*.data'))
    for stage,name,shape in [('c1','sign_c1_250.onnx',(1,32,174)),('b','sign_b_fingerspell.onnx',(1,128,90))]:
        model=onnx.load(out/name)
        assert not any(t.data_location==onnx.TensorProto.EXTERNAL for t in model.graph.initializer)
        session=ort.InferenceSession(str(out/name),providers=['CPUExecutionProvider'])
        result=session.run(None,{'features':np.zeros(shape,dtype=np.float32)})
        assert result[1].shape==(1,192) and np.isfinite(result[0]).all()
        assert manifest['verification'][stage]['parity_clips']==100
        assert manifest['verification'][stage]['probability_max_error']<1e-3

def test_provenance_guard_and_atomic_failed_export(tmp_path):
    c1,_=checkpoint(tmp_path,'c1_commercial_250'); b,_=checkpoint(tmp_path,'b_fingerspelling')
    with pytest.raises(ValueError,match='smoke-test'):
        export_one(c1,tmp_path/'x.onnx','c1_commercial_250')
    with pytest.raises(ValueError,match='public'):
        export_bundle(c1,b,tmp_path/'public'/'models','fp16',True)
    ckpt=torch.load(c1,weights_only=True); ckpt['config']['license_tier']='research'; torch.save(ckpt,c1)
    with pytest.raises(ValueError,match='commercial'):
        export_one(c1,tmp_path/'x.onnx','c1_commercial_250',smoke_test=True)
    out=tmp_path/'existing'; out.mkdir(); (out/'manifest.json').write_text('prior bundle')
    with pytest.raises(ValueError):
        export_bundle(c1,b,out,'fp16',True)
    assert (out/'manifest.json').read_text()=='prior bundle'
