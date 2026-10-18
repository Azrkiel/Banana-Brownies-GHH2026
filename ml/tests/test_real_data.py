"""Acquisition preserves ZIP bytes and signer splits; CPU caps preserve target text."""
import io
import zipfile
import pandas as pd
import pytest
from ml.datasets import kaggle_subset
from ml.datasets.common import signer_split
from datasets.aslfr_to_features import convert


def test_range_reader_supports_zip_seeks_without_extraction(monkeypatch):
    buffer=io.BytesIO()
    with zipfile.ZipFile(buffer,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('train.csv','participant_id,sign\n1,hello\n')
        archive.writestr('train/clip.parquet',b'landmarks'*1000)
    content=buffer.getvalue();ranges=[]
    def fetch(url,start,end):
        assert url=='private-url';ranges.append((start,end))
        return content[start:end]
    monkeypatch.setattr(kaggle_subset,'get_range',fetch)
    with zipfile.ZipFile(kaggle_subset.RangeReader('private-url',len(content))) as archive:
        assert archive.read('train/clip.parquet')==b'landmarks'*1000
    assert len(ranges)>1 and all(0<=a<b<=len(content) for a,b in ranges)


def test_subset_caps_keep_all_labels_and_disjoint_signers():
    frame=pd.DataFrame([{'participant_id':i,'sequence_id':i*100+j,'sign':label}
                        for i in range(100) for j,label in enumerate(['hello','book'])])
    selected=kaggle_subset.select(frame,'gislr',10,3,3)
    assert selected.groupby(['split','sign']).size().to_dict()=={
        ('train','book'):10,('train','hello'):10,('val','book'):3,('val','hello'):3,('test','book'):3,('test','hello'):3}
    assert selected.equals(kaggle_subset.select(frame,'gislr',10,3,3))
    groups={s:set(selected[selected.split==s].participant_id) for s in ('train','val','test')}
    assert all(groups[a].isdisjoint(groups[b]) for a,b in [('train','val'),('train','test'),('val','test')])
    with pytest.raises(ValueError,match='split'):
        kaggle_subset.select(frame.iloc[:2],'gislr',10,3,3)


def test_aslfr_filter_preserves_supported_phrases():
    frame=pd.DataFrame([{'participant_id':i,'sequence_id':i*10+j,'phrase':p}
                        for i in range(100) for j,p in enumerate(['john','http://x','123','a'])])
    selected=kaggle_subset.select(frame,'aslfr',20,5,5)
    assert set(selected.phrase)=={'john','123'}
    assert len(selected)==30


def test_cpu_frame_cap_retains_phrase_and_recomputes_gap_velocities(tmp_path,landmark_table):
    raw=tmp_path/'raw';raw.mkdir()
    landmark_table(20).to_parquet(raw/'clip.parquet',index=False)
    pd.DataFrame([{'path':'clip.parquet','phrase':'ab','signer_id':'1'}]).to_csv(raw/'clips.csv',index=False)
    meta=convert(raw,tmp_path/'out',max_frames=8)
    import numpy as np
    offsets=np.fromfile(tmp_path/'out/offsets.i64',dtype='<i8')
    x=np.fromfile(tmp_path/'out/X.f32',dtype='<f4').reshape(-1,90)
    assert offsets.tolist()==[0,8] and meta['phrases']==['ab'] and meta['max_frames']==8
    assert np.isfinite(x).all() and not x[0,48:].any()
    with pytest.raises(ValueError,match='max_frames'):
        convert(raw,tmp_path/'bad',max_frames=0)


def test_background_uses_original_no_hand_windows_and_keeps_signer_splits(tmp_path,landmark_table):
    from ml.datasets.common import dataset_info
    from ml.datasets.prepare_real_training import isolated_manifest
    from ml.datasets.verify import verify_source
    from gislr_to_features import convert as convert_gislr
    root=tmp_path/'real';raw=root/'raw/gislr';raw.mkdir(parents=True)
    participants={}
    for i in range(100): participants.setdefault(signer_split(f'gislr:{i}'),i)
    metadata=[]
    with zipfile.ZipFile(raw/'asl-signs-subset.zip','w') as archive:
        for split,signer in participants.items():
            table=landmark_table(30)
            table.loc[(table.frame<10)&table.type.str.contains('hand'),['x','y','z']]=float('nan')
            name=f'train_landmark_files/{signer}/{signer}.parquet'
            content=io.BytesIO();table.to_parquet(content,index=False)
            archive.writestr(name,content.getvalue())
            metadata.append({'path':name,'participant_id':signer,'sequence_id':signer,'sign':'hello'})
        archive.writestr('train.csv',pd.DataFrame(metadata).to_csv(index=False))
    manifest=root/'manifests';manifest.mkdir()
    pd.DataFrame(verify_source(raw/'asl-signs-subset.zip','gislr')).to_parquet(manifest/'clip_manifest.parquet')
    convert_gislr(raw/'asl-signs-subset.zip',root/'processed/gislr')
    report=isolated_manifest(root,per_split=1)
    assert report['background_splits']=={'train':1,'val':1,'test':1}
    assert report['labels']==2
    frame=pd.read_parquet(manifest/'gislr-training.parquet')
    assert len(frame)==6 and len(set(frame.clip_id))==6
    assert all(len(set(group.split))==1 for _,group in frame.groupby('signer_id'))
    import numpy as np
    assert not np.fromfile(root/'processed/background/X.f32',dtype='<f4').any()
