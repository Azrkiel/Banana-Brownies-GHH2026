"""Stream GISLR ZIP/folder landmarks to finite (N,32,174) float32 tensors."""
import argparse
import json
import math
import sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import FEAT_PER_FRAME, T, clip_features
from datasets.common import ROOT, Source, metadata, read_table, select_rows, write_meta

_source = None


def _point(p):
    return dict(zip(('x', 'y', 'z'), map(float, p)))


def to_frames(df, aspect=0.75):
    if not math.isfinite(aspect) or aspect <= 0:
        raise ValueError('aspect must be finite and positive')
    required = {'frame', 'type', 'landmark_index', 'x', 'y', 'z'}
    if not required <= set(df.columns) or df.empty:
        raise ValueError('unexpected row layout')
    frames = []
    for t, group in df.groupby('frame', sort=True):
        blocks = {}
        for kind, n in [('pose', 33), ('left_hand', 21), ('right_hand', 21)]:
            block = group[group['type'] == kind].sort_values('landmark_index')
            if block.landmark_index.tolist() != list(range(n)):
                raise ValueError(f'unexpected row layout for {kind} in frame {t}')
            blocks[kind] = block[['x', 'y', 'z']].to_numpy(dtype=np.float64)
        pose = blocks['pose'][:17]
        frames.append({'t': float(t), 'w': aspect, 'h': 1.0, 'brow': None,
                       'pose': [_point(p) for p in np.nan_to_num(pose)] if np.isfinite(pose[:13]).all() else None,
                       'hands': [[_point(p) for p in blocks[k]] for k in ['left_hand', 'right_hand']
                                 if np.isfinite(blocks[k]).all()]})
    return frames


def estimate_aspect(raw_dir):
    ratios = []
    for path in sorted(Path(raw_dir).rglob('*.json')):
        session = json.loads(path.read_text())
        for clip in session.get('clips', []):
            ratios.extend(f['w'] / f['h'] for f in clip['frames'] if f.get('h', 0) > 0 and f.get('w', 0) > 0)
    if not ratios:
        raise ValueError('No recorder dimensions found')
    return float(np.median(ratios))


def _init(path):
    global _source
    _source = Source(path)


def _convert(job):
    row, aspect = job
    tensor = clip_features(to_frames(read_table(_source, row['rel_path']), aspect))
    if tensor.size != T * FEAT_PER_FRAME or not np.isfinite(tensor).all():
        raise ValueError(f'Invalid features: {row["clip_id"]}')
    return tensor


def convert(path, out, signs='all', aspect=0.75, workers=1, csv_path=None,
            license_tier='commercial', manifest=None):
    with Source(path) as source:
        rows = select_rows(metadata(source, 'gislr', csv_path), 'gislr', license_tier, manifest, source)
    if signs != 'all':
        wanted = set(json.loads((ROOT / 'web/src/vocab.json').read_text())['gislr'] if signs == 'demo' else signs.split(','))
        missing = wanted - {r['raw_label'] for r in rows}
        if missing:
            raise ValueError(f'not in the dataset: {sorted(missing)}')
        rows = [r for r in rows if r['raw_label'] in wanted]
    rows.sort(key=lambda r: r['clip_id'])
    if not rows or workers < 1 or not math.isfinite(aspect) or aspect <= 0:
        raise ValueError('Need eligible clips, positive workers and positive finite aspect')
    labels = sorted({r['canonical_gloss'] for r in rows})
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    part = out / 'X.f32.part'
    jobs = [(r, aspect) for r in rows]
    try:
        with part.open('wb') as f:
            if workers == 1:
                _init(path)
                try:
                    for tensor in map(_convert, jobs):
                        f.write(tensor.astype('<f4').tobytes())
                finally:
                    _source.close()
            else:
                with Pool(workers, initializer=_init, initargs=(str(path),)) as pool:
                    for tensor in pool.imap(_convert, jobs, chunksize=32):
                        f.write(tensor.astype('<f4').tobytes())
        part.replace(out / 'X.f32')
    except BaseException:
        part.unlink(missing_ok=True)
        raise
    return write_meta(out, rows, labels, T=T, F=FEAT_PER_FRAME, aspect=aspect, query_license_tier=license_tier)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    g = p.add_mutually_exclusive_group()
    g.add_argument('--zip', type=Path)
    g.add_argument('--dir', type=Path)
    p.add_argument('--csv')
    p.add_argument('--signs', default='demo')
    p.add_argument('--aspect', type=float, default=0.75)
    p.add_argument('--estimate-aspect-from', type=Path)
    p.add_argument('--out', type=Path)
    p.add_argument('--workers', type=int, default=1)
    p.add_argument('--license-tier', choices=['commercial', 'research'], default='commercial')
    p.add_argument('--manifest', type=Path)
    a = p.parse_args()
    if a.estimate_aspect_from:
        print(estimate_aspect(a.estimate_aspect_from))
        return
    if not (a.zip or a.dir) or not a.out:
        p.error('--zip or --dir, and --out are required')
    csv_path = a.csv
    if csv_path and Path(csv_path).is_absolute() and a.dir:
        csv_path = Path(csv_path).relative_to(a.dir).as_posix()
    result = convert(a.zip or a.dir, a.out, a.signs, a.aspect, a.workers, csv_path, a.license_tier, a.manifest)
    print(f'Wrote {result["n"]} clips -> {a.out}')


if __name__ == '__main__':
    main()
