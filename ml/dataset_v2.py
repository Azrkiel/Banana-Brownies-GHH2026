"""License-checked Phase 2 mmap/NPZ datasets and signer-independent splits."""
import json
from pathlib import Path
import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset, WeightedRandomSampler
from .augment import augment
from .datasets.common import dataset_info, filter_manifest, validate_splits

CHARACTERS = ['<blank>', *'ABCDEFGHIJKLMNOPQRSTUVWXYZ', *'0123456789', ' ', '&', '-']


def encode_phrase(phrase):
    try:
        return [CHARACTERS.index(c) for c in str(phrase).upper()]
    except ValueError as exc:
        raise ValueError('Unsupported CTC character; review source text rather than silently deleting it') from exc


def shard_records(meta_path):
    path = Path(meta_path)
    meta = json.loads(path.read_text(encoding='utf-8'))
    n = meta['n']
    if any(len(meta[k]) != n for k in ('signers', 'splits', 'clip_ids', 'y')):
        raise ValueError('Inconsistent shard metadata lengths')
    records = []
    for i in range(n):
        records.append(dict(clip_id=meta['clip_ids'][i], dataset_id=meta['source'],
            signer_id=meta['signers'][i], split=meta['splits'][i], license=meta['license'],
            license_tier=meta['license_tier'], canonical_gloss=meta['labels'][meta['y'][i]],
            phrase=meta.get('phrases', ['']*n)[i], feature_path=str(path.parent/'X.f32'),
            row_index=i, n=n, T=meta['T'], F=meta['F'],
            offsets_path=str(path.parent/meta.get('offsets', 'offsets.i64'))))
        if 'domains' in meta:
            records[-1]['domain'] = meta['domains'][i]
        elif 'domain' in meta:
            records[-1]['domain'] = meta['domain']
    return records


def load_records(manifest, stage, license_tier='commercial', license_filter='commercial_safe', shards=None):
    path = Path(manifest)
    if stage == 'c1_commercial_250':
        tier = 'commercial'
    else:
        tier = 'research' if license_filter == 'all' and license_tier == 'research' else 'commercial'
    if path.is_dir() or path.suffix == '.json':
        metas = sorted(path.rglob('meta.json')) if path.is_dir() else [path]
        rows = [r for meta in metas for r in shard_records(meta)]
    else:
        rows = pd.read_parquet(path).to_dict('records')
        if rows and 'feature_path' not in rows[0]:
            root = Path(shards) if shards else path.parent
            cache = {r['clip_id']: r for meta in sorted(root.rglob('meta.json')) for r in shard_records(meta)}
            merged = []
            for row in rows:
                if row['clip_id'] not in cache:
                    continue
                feature = cache[row['clip_id']]
                for key in ('dataset_id', 'signer_id', 'split', 'license', 'license_tier', 'canonical_gloss'):
                    if row[key] != feature[key]:
                        raise ValueError('Shard provenance differs from manifest: ' + key)
                merged.append({**row, **feature, **({'domain':row['domain']} if 'domain' in row else {})})
            rows = merged
        else:
            for row in rows:
                feature = Path(row['feature_path'])
                row['feature_path'] = str(feature if feature.is_absolute() else path.parent/feature)
    if not rows:
        raise ValueError('No cached clips. Pass a Phase 2 shard directory or --shards with the provenance manifest')
    # Validate every split before filtering, including research rows excluded later.
    if any(not isinstance(r.get('signer_id'), str) or not r['signer_id'] for r in rows):
        raise ValueError('Every clip requires a signer identity')
    validate_splits(rows)
    rows = filter_manifest(pd.DataFrame(rows), tier).to_dict('records')
    rows = [r for r in rows if (r['dataset_id'] == 'aslfr') == (stage == 'b_fingerspelling')]
    if not rows:
        raise ValueError('No eligible cached clips for this stage/license tier')
    if len({r['clip_id'] for r in rows}) != len(rows):
        raise ValueError('Duplicate clip identity')
    for r in rows:
        if int(r['F']) != (90 if stage == 'b_fingerspelling' else 174):
            raise ValueError('Cached feature layout does not match model stage')
    signers = {s: sorted({r['signer_id'] for r in rows if r['split'] == s}) for s in ('train', 'val', 'test')}
    assert all(set(signers[a]).isdisjoint(signers[b]) for a, b in [('train','val'), ('train','test'), ('val','test')])
    return rows, tier, signers


class LandmarkDataset(Dataset):
    def __init__(self, records, split, stage, labels=None, training=False):
        self.rows = [r for r in records if r['split'] == split]
        if not self.rows:
            raise ValueError('Empty required split: ' + split)
        self.stage, self.training, self.cache = stage, training, {}
        self.labels = labels if labels is not None else ['_idle'] + sorted({r['canonical_gloss'] for r in records} - {'_idle'})
        if stage != 'b_fingerspelling' and (self.labels[0] != '_idle' or len(set(self.labels)) != len(self.labels)):
            raise ValueError('Unique labels with _idle at index zero are required')
        self.targets = [encode_phrase(r['phrase']) if stage == 'b_fingerspelling' else self.labels.index(r['canonical_gloss']) for r in self.rows]

    def __len__(self):
        return len(self.rows)

    def _features(self, r):
        path = str(r['feature_path'])
        if path.endswith('.npz'):
            with np.load(path, allow_pickle=False) as archive:
                return np.array(archive['X'][int(r['row_index'])], dtype=np.float32, copy=True)
        if path not in self.cache:
            self.cache[path] = np.memmap(path, dtype='<f4', mode='r')
        data = self.cache[path]
        width = int(r['F'])
        if r['T'] is None or pd.isna(r['T']):
            offsets_path = str(r['offsets_path'])
            if offsets_path not in self.cache:
                self.cache[offsets_path] = np.memmap(offsets_path, dtype='<i8', mode='r')
            offsets = self.cache[offsets_path]
            if len(offsets) != int(r['n'])+1 or offsets[0] != 0 or np.any(np.diff(offsets) <= 0) or offsets[-1]*width != len(data):
                raise ValueError('Invalid variable-length shard offsets')
            start, end = offsets[int(r['row_index']):int(r['row_index'])+2]
        else:
            t = int(r['T'])
            if len(data) != int(r['n'])*t*width:
                raise ValueError('Truncated or incompatible feature shard')
            start, end = int(r['row_index'])*t, (int(r['row_index'])+1)*t
        return np.array(data[start*width:end*width].reshape(-1, width), copy=True)

    def __getitem__(self, index):
        x = self._features(self.rows[index])
        if not len(x) or x.ndim != 2 or x.shape[1] != (90 if self.stage == 'b_fingerspelling' else 174) or not np.isfinite(x).all():
            raise ValueError('Invalid cached feature sequence')
        target = self.targets[index]
        if self.stage == 'b_fingerspelling':
            minimum = len(target) + sum(a == b for a,b in zip(target, target[1:]))
            if minimum > len(x) or not target:
                raise ValueError('CTC target is empty or cannot align to input frames')
        elif self.training:
            x = augment(x)
        return torch.from_numpy(x), target

    def sampler(self, generator):
        if self.stage == 'b_fingerspelling':
            return None
        counts = np.bincount(self.targets, minlength=len(self.labels))
        weights = [1/np.sqrt(counts[t]) for t in self.targets]
        return WeightedRandomSampler(weights, len(weights), replacement=True, generator=generator)


def collate(batch):
    xs, ys = zip(*batch)
    lengths = torch.tensor([len(x) for x in xs], dtype=torch.long)
    padded = torch.nn.utils.rnn.pad_sequence(xs, batch_first=True)
    if isinstance(ys[0], list):
        targets = torch.tensor([c for y in ys for c in y], dtype=torch.long)
        target_lengths = torch.tensor([len(y) for y in ys], dtype=torch.long)
    else:
        targets, target_lengths = torch.tensor(ys, dtype=torch.long), None
    return padded, lengths, targets, target_lengths


def make_synthetic(root, stage, seed=42):
    """Deterministic disk-backed micro-shards with independent signer groups."""
    root = Path(root); root.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)
    letters = stage == 'b_fingerspelling'
    n, t, width = 72, 12 if letters else 32, 90 if letters else 174
    labels = ['AB', 'JZ', 'AA', 'J', 'Z', '0'] if letters else ['_idle', 'HELLO', 'NAME']
    tensors = rng.normal(0, .02, (n, t, width)).astype('<f4')
    y = [i % len(labels) for i in range(n)]
    for i, target in enumerate(y):
        if letters:
            tensors[i, :, target*5:target*5+5] += .8
        elif target == 0:
            tensors[i] = 0
        else:
            tensors[i, :, :168] += target*.2
            tensors[i, :, 172:] = [1, i%2]
            if not i%2:
                tensors[i, :, 84:168] = 0
    tensors.tofile(root/'X.f32')
    source = 'aslfr' if letters else 'own'
    info = dataset_info(source)
    splits = ['train']*48 + ['val']*12 + ['test']*12
    meta = dict(n=n, labels=labels, y=y, source=source, **{k:info[k] for k in ('license','license_tier')},
        signers=[f'{source}:synthetic-{s}' for s in splits], splits=splits,
        clip_ids=[f'{source}:synthetic-{i}' for i in range(n)], T=None if letters else t, F=width, domain='synthetic')
    if letters:
        (np.arange(n+1, dtype='<i8') * t).tofile(root/'offsets.i64')
        meta.update(phrases=[labels[i] for i in y], offsets='offsets.i64')
    (root/'meta.json').write_text(json.dumps(meta), encoding='utf-8')
    return root/'meta.json'
