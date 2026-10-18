"""Shared metadata, source access, split and binary-shard contracts."""
import csv
import hashlib
import io
import json
import tarfile
import zipfile
from functools import lru_cache
from pathlib import Path, PurePosixPath

import numpy as np
import pandas as pd

from .vocab_merge import allowed, normalize_gloss, source_id

ROOT = Path(__file__).resolve().parents[2]
DATASET_CONFIG = ROOT / 'docs/subplans/model-v2/datasets.json'
CONFIG_IDS = {'gislr': 'kaggle-gislr', 'aslfr': 'kaggle-aslfr', 'asl_citizen': 'asl-citizen',
              'how2sign': 'how2sign-holistic', 'chicagofswild': 'chicagofswild-plus',
              'wlasl': 'wlasl', 'ms_asl': 'ms-asl', 'openasl': 'openasl', 'popsign': 'popsign-full'}


@lru_cache(maxsize=None)
def dataset_info(dataset):
    dataset = source_id(dataset)
    if dataset == 'own':
        return {'license': 'MIT / Project Owned (consented)', 'license_tier': 'commercial'}
    return next(d for d in json.loads(DATASET_CONFIG.read_text())['recommended_datasets']
                if d['id'] == CONFIG_IDS[dataset])


def signer_split(signer):
    bucket = int(hashlib.sha256(signer.encode()).hexdigest()[:8], 16) % 10
    return 'test' if bucket == 0 else 'val' if bucket == 1 else 'train'


def validate_splits(rows):
    assignments = {}
    for row in rows:
        signer, split = row['signer_id'], row['split']
        if split not in {'train', 'val', 'test'}:
            raise ValueError(f'Invalid split: {split}')
        if signer in assignments and assignments[signer] != split:
            raise ValueError(f'Signer leakage: {signer}')
        assignments[signer] = split


class Source:
    """Read a folder, ZIP or TGZ without extracting archives or accepting unsafe paths."""
    def __init__(self, path):
        self.path = Path(path)
        self.archive = (zipfile.ZipFile(path) if self.path.suffix == '.zip' else
                        tarfile.open(path, 'r:*') if self.path.suffix in {'.tgz', '.gz', '.tar'} else None)
        self.names = sorted(self.archive.namelist() if isinstance(self.archive, zipfile.ZipFile) else
                            [m.name for m in self.archive.getmembers() if m.isfile()] if self.archive else
                            [p.relative_to(path).as_posix() for p in self.path.rglob('*') if p.is_file()])
        for name in self.names:
            self.safe_name(name)
        self._names = set(self.names)
        self._basenames = {}
        for name in self.names:
            self._basenames.setdefault(PurePosixPath(name).name, []).append(name)

    @staticmethod
    def safe_name(name):
        p = PurePosixPath(str(name).replace('\\', '/'))
        if p.is_absolute() or '..' in p.parts or ':' in str(p):
            raise ValueError(f'Unsafe source path: {name}')
        return str(p)

    def resolve(self, name):
        name = self.safe_name(name)
        if name in self._names:
            return name
        candidates = self._basenames.get(PurePosixPath(name).name, [])
        matches = [n for n in candidates if n.endswith('/' + name)]
        if not matches:
            matches = candidates
        if len(matches) != 1:
            raise ValueError(f'Missing or ambiguous file: {name}')
        return matches[0]

    def open(self, name):
        name = self.resolve(name)
        if isinstance(self.archive, zipfile.ZipFile):
            return self.archive.open(name)
        if self.archive:
            return self.archive.extractfile(name)
        return (self.path / name).open('rb')

    def read(self, name):
        with self.open(name) as f:
            return f.read()

    def close(self):
        if self.archive:
            self.archive.close()

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def digest(stream):
    h = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b''):
        h.update(block)
    return h.hexdigest()


def read_table(source, path):
    with source.open(path) as f:
        if path.endswith('.parquet'):
            return pd.read_parquet(io.BytesIO(f.read()))
        if path.endswith('.csv'):
            return pd.read_csv(f, float_precision='round_trip')
        if path.endswith('.npz'):
            with np.load(io.BytesIO(f.read()), allow_pickle=False) as a:
                return pd.DataFrame({k: a[k] for k in a.files})
    raise ValueError(f'Unsupported table: {path}')


def metadata(source, dataset, csv_path=None):
    """Adapt competition/Citizen CSVs or explicit clips.csv (path,label,signer_id,split)."""
    dataset = source_id(dataset)
    if dataset == 'own':
        rows = []
        for name in source.names:
            if not name.endswith('.json'):
                continue
            session = json.loads(source.read(name))
            if session.get('version') != 1 or 'clips' not in session:
                continue
            signer = f"own:{session['signer']}"
            if not session['signer']:
                raise ValueError('Recorder session is missing signer identity')
            for i, clip in enumerate(session['clips']):
                rows.append({'clip_id': f'own:{name}:{i}', 'dataset_id': 'own', 'rel_path': name,
                             'raw_label': clip['label'], 'canonical_gloss': normalize_gloss(clip['label'], 'own'),
                             'signer_id': signer, 'split': signer_split(signer)})
        if not rows:
            raise ValueError('No recorder sessions found')
        return rows
    candidates = [source.resolve(csv_path)] if csv_path else [n for n in source.names if n.endswith('.csv') and
        (PurePosixPath(n).name.lower() in {'train.csv', 'val.csv', 'test.csv', 'clips.csv',
                                         'supplemental_metadata.csv', 'how2sign_realigned_train.csv',
                                         'how2sign_realigned_val.csv', 'how2sign_realigned_test.csv'})]
    if not csv_path:
        overrides = [n for n in candidates if PurePosixPath(n).name == 'clips.csv']
        if overrides:
            candidates = overrides
    result = []
    for name in sorted(candidates):
        text = source.read(name).decode('utf-8-sig')
        delimiter = '\t' if '\t' in text.splitlines()[0] else ','
        for original in csv.DictReader(io.StringIO(text), delimiter=delimiter):
            r = {k.strip().lower().replace(' ', '_'): v for k, v in original.items() if k}
            path = r.get('path') or r.get('rel_path') or r.get('video_file') or r.get('video_name')
            seq = r.get('sequence_id') or r.get('clip_id')
            if dataset == 'aslfr' and seq:
                npy = f"train_landmarks/{r.get('file_id')}/{seq}.npy"
                try:
                    path = source.resolve(npy)
                except ValueError:
                    path = path or f"train_landmarks/{r.get('file_id')}.parquet"
            if dataset == 'how2sign' and not path:
                path = r.get('sentence_name', '') + '.npy'
            signer = r.get('participant_id') or r.get('signer_id') or r.get('signer')
            label = r.get('sign') or r.get('gloss') or r.get('raw_label') or r.get('label') or r.get('phrase') or r.get('sentence')
            if not path or not signer or label is None:
                raise ValueError(f'{name}: need path, label/phrase and signer identity; supply clips.csv')
            signer = signer if signer.startswith(dataset + ':') else f'{dataset}:{signer}'
            filename_split = PurePosixPath(name).stem.lower().split('_')[-1]
            split = r.get('split') or (filename_split if filename_split in {'train', 'val', 'test'} and dataset != 'gislr' and dataset != 'aslfr' else signer_split(signer))
            result.append({'clip_id': f'{dataset}:{seq or PurePosixPath(path).stem}', 'dataset_id': dataset,
                           'rel_path': source.resolve(path), 'raw_label': label,
                           'canonical_gloss': normalize_gloss(label, dataset), 'signer_id': signer,
                           'split': split, 'sequence_id': seq})
    if not result:
        raise ValueError(f'No clip metadata in {source.path}; provide clips.csv with path,label,signer_id,split')
    validate_splits(result)
    if len({r['clip_id'] for r in result}) != len(result):
        raise ValueError('Duplicate clip IDs')
    return result


def filter_manifest(frame, license_tier='commercial'):
    rows = frame.to_dict('records') if isinstance(frame, pd.DataFrame) else list(frame)
    result = []
    for r in rows:
        info = dataset_info(r['dataset_id'])
        if r['license_tier'] != info['license_tier'] or r['license'] != info['license']:
            raise ValueError('Manifest license contradicts dataset registry')
        if allowed(r['dataset_id'], license_tier):
            result.append(r)
    validate_splits(result)
    return pd.DataFrame(result, columns=frame.columns if isinstance(frame, pd.DataFrame) else None)


def select_rows(rows, dataset, license_tier, manifest=None, source=None):
    if not allowed(dataset, license_tier):
        raise ValueError(f'{dataset} requires --license-tier research')
    if manifest:
        permitted = filter_manifest(pd.read_parquet(manifest), license_tier)
        permitted = permitted[permitted.dataset_id == source_id(dataset)]
        index = {r['clip_id']: r for r in permitted.to_dict('records')}
        selected, verified = [], {}
        for row in rows:
            record = index.get(row['clip_id'])
            if record is None:
                continue
            if any(record[k] != row[k] for k in ['raw_label', 'canonical_gloss', 'signer_id', 'rel_path']):
                raise ValueError(f'Manifest provenance mismatch: {row["clip_id"]}')
            if source is not None:
                name = row['rel_path']
                if name not in verified:
                    with source.open(name) as f:
                        verified[name] = digest(f)
                if record['sha256'] != verified[name]:
                    raise ValueError(f'Manifest checksum mismatch: {row["clip_id"]}')
            selected.append({**row, 'split': record['split']})
        rows = selected
    validate_splits(rows)
    if not rows:
        raise ValueError('No eligible clips')
    return rows


def write_meta(out, rows, labels, **extra):
    info = dataset_info(rows[0]['dataset_id'])
    result = {'n': len(rows), 'labels': labels, 'y': [labels.index(r['canonical_gloss']) for r in rows],
              'signers': [r['signer_id'] for r in rows], 'splits': [r['split'] for r in rows],
              'clip_ids': [r['clip_id'] for r in rows], 'source': rows[0]['dataset_id'],
              'license': info['license'], 'license_tier': info['license_tier'], **extra}
    Path(out).mkdir(parents=True, exist_ok=True)
    Path(out, 'meta.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    return result
