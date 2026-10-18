"""ASLFR long/wide Parquet and coordinate-major NPY to variable 90-D shards."""
import argparse
import io
import json
import re
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gislr_to_features import to_frames
from datasets.common import Source, metadata, read_table, select_rows, write_meta
from datasets.letter_features import sequence_features

_source = None
_cache = {}
_columns = None
def wide_frames(table, aspect):
    frames = []
    for i, row in enumerate(table.to_dict('records')):
        def block(kind, n):
            return np.asarray([[row.get(f'{a}_{kind}_{j}', float('nan')) for a in 'xyz'] for j in range(n)])
        pose = block('pose', 17)
        hands = [block(k, 21) for k in ['left_hand', 'right_hand']]
        def points(a):
            return [dict(zip(('x', 'y', 'z'), map(float, p))) for p in a]
        frames.append({'t': i, 'w': aspect, 'h': 1, 'brow': None,
                       'pose': points(np.nan_to_num(pose)) if np.isfinite(pose[:13]).all() else None,
                       'hands': [points(h) for h in hands if np.isfinite(h).all()]})
    if not any(re.match(r'x_(left|right)_hand_\d+$', str(c)) for c in table.columns):
        raise ValueError('No identified hand columns')
    return frames


def npy_frames(array, aspect, columns=None):
    if array.ndim == 3 and array.shape[1:] == (543, 3):
        points = [f'face_{i}' for i in range(468)] + [f'left_hand_{i}' for i in range(21)] + [f'pose_{i}' for i in range(33)] + [f'right_hand_{i}' for i in range(21)]
        columns = [f'{a}_{p}' for p in points for a in 'xyz']
        array = array.reshape(len(array), -1)
    if array.ndim != 2:
        raise ValueError('Expected (frames, columns) NPY array')
    if columns is None or len(columns) != array.shape[1] or len(set(columns)) != len(columns):
        raise ValueError('Unknown NPY layout; provide columns.json or inference_args.json selected_columns')
    return wide_frames(pd.DataFrame(array, columns=columns), aspect)


def _init(path):
    global _source, _cache, _columns
    _source, _cache, _columns = Source(path), {}, None
    for name in ['columns.json', 'inference_args.json']:
        matches = [n for n in _source.names if Path(n).name == name]
        if matches:
            content = json.loads(_source.read(matches[0]))
            _columns = content.get('selected_columns') if isinstance(content, dict) else content
            break


def _convert(job):
    row, aspect = job
    name = row['rel_path']
    if name.endswith('.npy'):
        frames = npy_frames(np.load(io.BytesIO(_source.read(name)), allow_pickle=False), aspect, _columns)
    else:
        if name not in _cache:
            _cache.clear()  # One shard per worker, never the entire corpus.
            _cache[name] = read_table(_source, name)
            table = _cache[name]
            groups = table.groupby('sequence_id', sort=False).indices if 'sequence_id' in table else table.groupby(level=0, sort=False).indices
            _cache['groups'] = {str(k): v for k, v in groups.items()}
        table = _cache[name]
        seq = row.get('sequence_id')
        if seq is not None:
            table = table.iloc[_cache['groups'].get(str(seq), [])]
        if table.empty:
            raise ValueError(f'Empty sequence: {row["clip_id"]}')
        frames = to_frames(table, aspect) if 'type' in table else wide_frames(table, aspect)
    if not frames:
        raise ValueError('Empty fingerspelling sequence')
    features = sequence_features(frames)
    if not np.isfinite(features).all():
        raise ValueError('Non-finite fingerspelling features')
    return features


def convert(path, out, workers=1, aspect=0.75, license_tier='commercial', manifest=None):
    if workers < 1 or not np.isfinite(aspect) or aspect <= 0:
        raise ValueError('workers/aspect must be positive')
    with Source(path) as source:
        rows = select_rows(metadata(source, 'aslfr'), 'aslfr', license_tier, manifest, source)
        names = [n for n in source.names if Path(n).name == 'character_to_prediction_index.json']
        chars = json.loads(source.read(names[0])) if names else {c: i for i, c in enumerate(sorted(set(''.join(r['raw_label'] for r in rows))))}
    if set(chars.values()) != set(range(len(chars))) or any(c not in chars for r in rows for c in r['raw_label']):
        raise ValueError('Invalid character vocabulary or unknown characters')
    rows.sort(key=lambda r: (r['rel_path'], r['clip_id']))
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    offsets = [0]
    part = out / 'X.f32.part'
    jobs = [(r, aspect) for r in rows]
    def consume(iterator, f):
        for tensor in iterator:
            f.write(tensor.astype('<f4').tobytes())
            offsets.append(offsets[-1] + len(tensor))
    try:
        with part.open('wb') as f:
            if workers == 1:
                _init(path)
                try:
                    consume(map(_convert, jobs), f)
                finally:
                    _source.close()
            else:
                with Pool(workers, initializer=_init, initargs=(str(path),)) as pool:
                    consume(pool.imap(_convert, jobs, chunksize=16), f)
        part.replace(out / 'X.f32')
    except BaseException:
        part.unlink(missing_ok=True)
        raise
    np.asarray(offsets, dtype='<i8').tofile(out / 'offsets.i64')
    (out / 'character_to_prediction_index.json').write_text(json.dumps(chars, indent=2) + '\n')
    (out / 'y_chars.json').write_text(json.dumps([[chars[c] for c in r['raw_label']] for r in rows]) + '\n')
    return write_meta(out, rows, sorted({r['canonical_gloss'] for r in rows}), T=None, F=90,
                      phrases=[r['raw_label'] for r in rows], character_to_prediction_index=chars,
                      offsets='offsets.i64', aspect=aspect, query_license_tier=license_tier)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--dir', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--workers', type=int, default=1)
    p.add_argument('--aspect', type=float, default=0.75)
    p.add_argument('--license-tier', choices=['commercial', 'research'], default='commercial')
    p.add_argument('--manifest', type=Path)
    a = p.parse_args()
    result = convert(a.dir, a.out, a.workers, a.aspect, a.license_tier, a.manifest)
    print(f'Wrote {result["n"]} sequences -> {a.out}')


if __name__ == '__main__':
    main()
