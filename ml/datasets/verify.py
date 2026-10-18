"""Validate archives and clip provenance without unpacking large datasets."""
import argparse
import io
import json
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from datasets.common import (Source, dataset_info, digest, filter_manifest, metadata,
                             read_table, validate_splits)
from datasets.vocab_merge import source_id

COLUMNS = ['clip_id', 'dataset_id', 'rel_path', 'raw_label', 'canonical_gloss', 'signer_id',
           'split', 'license', 'license_tier', 'sha256']


def check_readable(source, name):
    suffix = Path(name).suffix.lower()
    if suffix in {'.parquet', '.csv', '.npz'}:
        table = read_table(source, name)
        if table.empty:
            raise ValueError(f'Empty table: {name}')
    elif suffix == '.npy':
        a = np.load(io.BytesIO(source.read(name)), allow_pickle=False)
        if a.size == 0 or a.dtype.kind not in 'fiu':
            raise ValueError(f'Invalid landmark array: {name}')
    elif suffix == '.mp4':
        import cv2
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp, 'sample.mp4')
            path.write_bytes(source.read(name))
            cap = cv2.VideoCapture(str(path))
            try:
                ok, _ = cap.read()
                if not ok:
                    raise ValueError(f'Unreadable video: {name}')
            finally:
                cap.release()
    elif suffix == '.json':
        json.loads(source.read(name))
    else:
        raise ValueError(f'Unsupported clip format: {name}')


def verify_source(path, dataset, expected_sha256=None, samples=5):
    dataset = source_id(dataset)
    archive_sha = None
    if Path(path).is_file():
        with Path(path).open('rb') as f:
            archive_sha = digest(f)
        if expected_sha256 and archive_sha.lower() != expected_sha256.lower():
            raise ValueError(f'Archive SHA256 mismatch: {path}')
    with Source(path) as source:
        rows = metadata(source, dataset)
        checked = {}
        for row in rows:
            name = row['rel_path']
            if name not in checked:
                with source.open(name) as f:
                    checked[name] = digest(f)  # Also checks ZIP member CRC while streaming.
            row.update(dataset_info(dataset))
            row['sha256'] = checked[name]
            if archive_sha:
                row['archive_sha256'] = archive_sha
                row['archive_path'] = str(path)
        for suffix in {Path(r['rel_path']).suffix for r in rows}:
            names = sorted({r['rel_path'] for r in rows if Path(r['rel_path']).suffix == suffix})
            for name in names[:samples]:
                check_readable(source, name)
        return [{k: r[k] for k in COLUMNS + (['archive_sha256', 'archive_path'] if archive_sha else [])} for r in rows]


def build_manifest(raw_dir, out, license_tier='commercial', expected_checksums=None):
    rows, sums, observed_archives = [], expected_checksums or {}, {}
    for directory in sorted(Path(raw_dir).iterdir()):
        if not directory.is_dir():
            continue
        try:
            dataset = source_id(directory.name)
        except ValueError:
            continue
        # Check the registry before even opening research data in commercial mode.
        from datasets.vocab_merge import allowed
        if not allowed(dataset, license_tier):
            continue
        archives = sorted(p for p in directory.iterdir() if p.suffix in {'.zip', '.tgz', '.gz', '.tar'})
        loose_metadata = any(directory.rglob('clips.csv')) or any(directory.rglob('train.csv'))
        if archives and loose_metadata:
            # Compact NPY mirrors may require competition metadata supplied beside the extracted files.
            for archive in archives:
                with archive.open('rb') as f:
                    sha = digest(f)
                if archive.name in sums and sums[archive.name].lower() != sha:
                    raise ValueError(f'Archive SHA256 mismatch: {archive}')
                observed_archives[str(archive)] = sha
                with Source(archive) as src:
                    for suffix in {'.parquet', '.mp4', '.npy'}:
                        for name in [n for n in src.names if n.endswith(suffix)][:5]:
                            check_readable(src, name)
            rows.extend(verify_source(directory, dataset))
        elif archives:
            for archive in archives:
                rows.extend(verify_source(archive, dataset, sums.get(archive.name)))
        else:
            rows.extend(verify_source(directory, dataset))
    if not rows:
        raise ValueError('No eligible datasets found; download datasets or use synthetic tests')
    validate_splits(rows)
    if len({r['clip_id'] for r in rows}) != len(rows):
        raise ValueError('Duplicate clip IDs across sources')
    frame = filter_manifest(pd.DataFrame(rows), license_tier)
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(out, index=False)
    if observed_archives:
        Path(out).with_suffix('.archive_checksums.json').write_text(json.dumps(observed_archives, indent=2) + '\n')
    return frame


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--raw-dir', type=Path, default=Path('data/raw'))
    p.add_argument('--out', type=Path, default=Path('data/manifests/clip_manifest.parquet'))
    p.add_argument('--license-tier', choices=['commercial', 'research'], default='commercial')
    p.add_argument('--checksums', type=Path, help='Trusted JSON archive filename -> SHA256 (not self-generated trust)')
    a = p.parse_args()
    checksums = json.loads(a.checksums.read_text()) if a.checksums else None
    try:
        frame = build_manifest(a.raw_dir, a.out, a.license_tier, checksums)
    except (ValueError, OSError, ImportError) as e:
        p.exit(2, f'Verification failed: {e}\n')
    print(f'Verified {len(frame)} clips -> {a.out}')


if __name__ == '__main__':
    main()
