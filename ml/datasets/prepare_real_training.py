"""Build auditable training manifests from verified real Phase 2 shards.

Reject impossible CTC alignments without changing text. Background windows come
only from >=8 consecutive original GISLR frames with neither hand tracked; they
are tracking-absence examples, not human-labelled first-party resting gestures.
"""
import argparse
import json
from pathlib import Path
import numpy as np
import pandas as pd
from ..dataset_v2 import encode_phrase, shard_records
from .common import Source, read_table, validate_splits, write_meta
from ..gislr_to_features import to_frames
from ..features import clip_features


def ctc_manifest(root):
    rows=shard_records(root/'processed/aslfr/meta.json')
    offsets=np.fromfile(root/'processed/aslfr/offsets.i64',dtype='<i8')
    keep=[];excluded=[]
    for i,row in enumerate(rows):
        target=encode_phrase(row['phrase']);n=int(offsets[i+1]-offsets[i])
        minimum=len(target)+sum(a==b for a,b in zip(target,target[1:]))
        if n<minimum:
            excluded.append({'clip_id':row['clip_id'],'frames':n,'minimum_ctc_frames':minimum,
                             'reason':'Original clip cannot align to unchanged CTC target'})
        else:
            for key in ('feature_path','offsets_path'):row[key]=str(Path(row[key]).resolve())
            keep.append(row)
    pd.DataFrame(keep).to_parquet(root/'manifests/aslfr-training.parquet',index=False)
    (root/'manifests/aslfr-excluded.json').write_text(json.dumps(excluded,indent=2)+'\n')
    return {'eligible':len(keep),'excluded':len(excluded),'splits':pd.DataFrame(keep).groupby('split').size().to_dict()}


def isolated_manifest(root,per_split=100):
    provenance=pd.read_parquet(root/'manifests/clip_manifest.parquet')
    selected=provenance[provenance.dataset_id=='gislr'].sort_values('clip_id')
    rows=[];tensors=[];counts={s:0 for s in ('train','val','test')}
    with Source(root/'raw/gislr/asl-signs-subset.zip') as source:
        for original in selected.to_dict('records'):
            split=original['split']
            if counts[split]>=per_split:continue
            frames=to_frames(read_table(source,original['rel_path']))
            run=0
            for i,frame in enumerate(frames):
                run=run+1 if not frame['hands'] else 0
                if run>=8:
                    tensor=clip_features(frames[i-run+1:i+1]).reshape(32,174)
                    if tensor.any():raise ValueError('No-hand background produced nonzero hand features')
                    rows.append({**original,'clip_id':original['clip_id']+f':background:{i-run+1}',
                                 'raw_label':'_idle','canonical_gloss':'_idle',
                                 'derived_from_clip_id':original['clip_id'],'frame_start':i-run+1,'frame_end':i+1})
                    tensors.append(tensor);counts[split]+=1;break
    if any(n==0 for n in counts.values()):raise ValueError('No real tracking-absence background in a required split')
    out=root/'processed/background';out.mkdir(parents=True,exist_ok=True)
    np.asarray(tensors,dtype='<f4').tofile(out/'X.f32')
    write_meta(out,rows,['_idle'],T=32,F=174,domain='derived_gislr_tracking_absence',
               derived_from_clip_ids=[r['derived_from_clip_id'] for r in rows],
               description='>=8 contiguous original no-hand frames; not first-party resting gestures')
    (root/'manifests/background.json').write_text(json.dumps(rows,indent=2)+'\n')
    records=shard_records(root/'processed/gislr/meta.json')+shard_records(out/'meta.json')
    for row in records:
        for key in ('feature_path','offsets_path'):row[key]=str(Path(row[key]).resolve())
    validate_splits(records)
    pd.DataFrame(records).to_parquet(root/'manifests/gislr-training.parquet',index=False)
    return {'sign_clips':len(records)-len(rows),'background_clips':len(rows),'background_splits':counts,
            'labels':len({r['canonical_gloss'] for r in records}),
            'background_limit':'Tracking absence only; real first-party visible-hand resting/transition recordings remain unavailable.'}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,default=Path('data/real-v1'))
    p.add_argument('--stage',choices=['b','c1','all'],default='all')
    a=p.parse_args();report={}
    if a.stage in ('b','all'):report['b']=ctc_manifest(a.root)
    if a.stage in ('c1','all'):report['c1']=isolated_manifest(a.root)
    (a.root/'manifests'/f'preparation-{a.stage}.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
