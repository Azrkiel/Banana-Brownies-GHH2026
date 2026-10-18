"""Acquire deterministic real Kaggle subsets directly from ZIP member byte ranges.

Full archive downloads can continue separately. Range reads preserve each original
member's CRC; verify.py subsequently records SHA256 and signer-disjoint provenance.
No GISLR Parquet files are extracted. Signed URLs and credentials are never saved.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import io
import json
from pathlib import Path
import struct
import zipfile
import zlib

import pandas as pd
import requests

from .common import Source, signer_split, validate_splits


class RangeReader(io.RawIOBase):
    def __init__(self, url, size):
        self.url, self.size, self.position = url, size, 0

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.position

    def seek(self, offset, whence=0):
        self.position = offset + (0 if whence == 0 else self.position if whence == 1 else self.size)
        return self.position

    def read(self, size=-1):
        end = self.size if size < 0 else min(self.size, self.position + size)
        if end <= self.position: return b''
        result = get_range(self.url, self.position, end)
        self.position = end
        return result


def get_range(url, start, end):
    for attempt in range(4):
        try:
            with requests.get(url, headers={'Range': f'bytes={start}-{end-1}'}, timeout=120) as response:
                if response.status_code != 206 or response.headers.get('Content-Range', '').split('/')[0] != f'bytes {start}-{end-1}':
                    raise ValueError('Server did not honor the exact archive byte range')
                content = response.content
                if len(content) != end-start: raise ValueError('Truncated archive range')
                return content
        except requests.RequestException:
            if attempt == 3: raise RuntimeError('Kaggle archive range request failed') from None
    raise RuntimeError('Archive range unavailable')


def select(frame, dataset, train_cap, val_cap, test_cap, seed=42):
    frame = frame.copy()
    frame['split'] = [signer_split(f'{dataset}:{p}') for p in frame.participant_id]
    frame = frame.sample(frac=1, random_state=seed)
    if dataset == 'aslfr':
        # Deliberately select short phrases in the established browser character set.
        # Never silently strip unsupported punctuation from the target strings.
        allowed = set('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 &-')
        frame = frame[[2 <= len(p) <= 16 and set(p.upper()) <= allowed for p in frame.phrase]]
    pieces = []
    for split, cap in [('train',train_cap),('val',val_cap),('test',test_cap)]:
        part = frame[frame.split == split]
        pieces.append(part.groupby('sign',sort=True).head(cap) if dataset == 'gislr' else part.head(cap))
    result = pd.concat(pieces).sort_values('sequence_id')
    validate_splits([{'signer_id':f'{dataset}:{r.participant_id}', 'split':r.split} for r in result.itertuples()])
    if set(result.split) != {'train','val','test'}: raise ValueError('Missing signer-disjoint split')
    if dataset == 'gislr' and any(set(result[result.split==s].sign) != set(frame.sign) for s in ('train','val','test')):
        raise ValueError('Every sign must be represented in every split')
    return result


def acquire(dataset, out, train_cap, val_cap, test_cap, workers=8):
    from kaggle.api.kaggle_api_extended import KaggleApi, ApiDownloadDataFilesRequest
    from kagglesdk.datasets.types.dataset_api_service import ApiDownloadDatasetRequest
    api = KaggleApi(); api.authenticate()
    with api.build_kaggle_client() as client:
        if dataset == 'gislr':
            req = ApiDownloadDataFilesRequest(); req.competition_name = 'asl-signs'
            resource = client.competitions.competition_api_client.download_data_files(req)
        else:
            req = ApiDownloadDatasetRequest(); req.owner_slug='darraghdog';req.dataset_slug='asl-fingerspelling-preprocessing-train-dataset'
            resource = client.datasets.dataset_api_client.download_dataset(req)
        url = resource.url
    with requests.get(url,headers={'Range':'bytes=0-0'},timeout=60) as response:
        if response.status_code != 206: raise ValueError('Archive does not support ranges')
        size = int(response.headers['Content-Range'].split('/')[-1])
        etag = response.headers.get('ETag')
    reader = RangeReader(url,size)
    archive = zipfile.ZipFile(reader)
    entries = {info.filename:info for info in archive.infolist() if not info.is_dir()}
    names = sorted(entries,key=lambda n:entries[n].header_offset)
    ends = {name:entries[names[i+1]].header_offset if i+1<len(names) else archive.start_dir for i,name in enumerate(names)}
    def member(name):
        info = entries[name]
        data = get_range(url,info.header_offset,ends[name])
        if data[:4] != b'PK\x03\x04': raise ValueError('Invalid member header')
        filename_len,extra_len = struct.unpack_from('<HH',data,26)
        start = 30+filename_len+extra_len
        packed = data[start:start+info.compress_size]
        content = zlib.decompress(packed,-15) if info.compress_type == zipfile.ZIP_DEFLATED else packed if info.compress_type == zipfile.ZIP_STORED else None
        if content is None or len(content)!=info.file_size or zlib.crc32(content)!=info.CRC: raise ValueError('Archive member integrity failure')
        return content
    def find(base):
        matches = [n for n in entries if Path(n).name == base]
        if len(matches)!=1: raise ValueError(f'Missing or ambiguous publisher metadata: {base}')
        return matches[0]
    if dataset == 'gislr':
        frame = pd.read_csv(io.BytesIO(member(find('train.csv'))))
    else:
        with zipfile.ZipFile('data/raw/aslfr/train.csv.zip') as metadata_zip:
            frame = pd.read_csv(io.BytesIO(metadata_zip.read('train.csv')))
    selected = select(frame,dataset,train_cap,val_cap,test_cap)
    if dataset == 'gislr':
        paths = selected.path.tolist()
    else:
        lookup = {Path(n).stem:n for n in entries if n.endswith('.npy') and Path(n).stem.isdigit()}
        selected = selected[selected.sequence_id.astype(str).isin(lookup)].copy()
        paths = [lookup[str(s)] for s in selected.sequence_id]
    for name in paths: Source.safe_name(name)
    out = Path(out);out.parent.mkdir(parents=True,exist_ok=True)
    temporary = out.with_suffix('.zip.part')
    with zipfile.ZipFile(temporary,'w',compression=zipfile.ZIP_STORED,allowZip64=True) as target:
        target.writestr('train.csv',selected.to_csv(index=False))
        metadata_names = ['sign_to_prediction_index_map.json'] if dataset=='gislr' else ['inference_args.json']
        for base in metadata_names: target.writestr(base,member(find(base)))
        if dataset=='aslfr':
            target.writestr('character_to_prediction_index.json',Path('data/raw/aslfr/character_to_prediction_index.json').read_bytes())
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = []
            iterator = iter(paths)
            # Bound outstanding transfers so a slow first member cannot buffer the corpus.
            for _ in range(workers*2):
                name=next(iterator,None)
                if name is not None: futures.append((name,pool.submit(member,name)))
            count=0
            while futures:
                name,future=futures.pop(0)
                target.writestr(name,future.result());count+=1
                if count%100==0: print(json.dumps({'dataset':dataset,'clips':count,'total':len(paths)}),flush=True)
                name=next(iterator,None)
                if name is not None: futures.append((name,pool.submit(member,name)))
    temporary.replace(out)
    provenance={'dataset':dataset,'archive_bytes':size,'archive_etag':etag,'original_clips':len(frame),
                'selected_clips':len(selected),'counts':selected.groupby('split').size().to_dict(),
                'caps':{'train':train_cap,'val':val_cap,'test':test_cap},'seed':42,
                'selection':'per sign per split' if dataset=='gislr' else '2..16 characters in existing 39-character alphabet; per split',
                'integrity':'Original ZIP member CRC32 checked during range acquisition; verify.py records SHA256 next.'}
    out.with_suffix('.provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
    print(json.dumps(provenance),flush=True)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--dataset',choices=['gislr','aslfr'],required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--train-cap',type=int,required=True)
    p.add_argument('--val-cap',type=int,required=True)
    p.add_argument('--test-cap',type=int,required=True)
    p.add_argument('--workers',type=int,default=8)
    a=p.parse_args()
    if min(a.train_cap,a.val_cap,a.test_cap,a.workers)<1:p.error('Caps and workers must be positive')
    acquire(a.dataset,a.out,a.train_cap,a.val_cap,a.test_cap,a.workers)

if __name__=='__main__': main()
