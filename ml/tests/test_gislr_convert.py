import json
import subprocess
import sys
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from datasets.common import Source, read_table
from datasets.verify import verify_source
from gislr_to_features import convert, estimate_aspect, to_frames

ROOT = Path(__file__).resolve().parents[2]


def test_byte_identical_zip_folder_and_parallel_conversion(tmp_path, landmark_table):
    raw = tmp_path / 'raw'
    raw.mkdir()
    rows = []
    for signer in range(3):
        for label in ['hello', 'bye']:
            for sequence in range(2):
                seq = f'{signer}-{label}-{sequence}'
                name = f'train_landmark_files/{signer}/{seq}.parquet'
                (raw / name).parent.mkdir(parents=True, exist_ok=True)
                landmark_table(20).to_parquet(raw / name, index=False)
                rows.append({'path': name, 'participant_id': signer, 'sequence_id': seq, 'sign': label})
    pd.DataFrame(rows).to_csv(raw / 'train.csv', index=False)
    archive = tmp_path / 'asl-signs.zip'
    with zipfile.ZipFile(archive, 'w') as z:
        for path in sorted(raw.rglob('*')):
            if path.is_file():
                z.write(path, path.relative_to(raw))
    for mode, source, out in [('--zip', archive, 'zip'), ('--dir', raw, 'folder')]:
        subprocess.run([sys.executable, str(ROOT / 'ml/gislr_to_features.py'), mode, str(source),
                        '--signs', 'hello,bye', '--out', str(tmp_path / out), '--workers', '1'], check=True)
    assert (tmp_path / 'zip/X.f32').read_bytes() == (tmp_path / 'folder/X.f32').read_bytes()
    meta = json.loads((tmp_path / 'zip/meta.json').read_text())
    assert (meta['n'], meta['T'], meta['F'], meta['labels']) == (12, 32, 174, ['BYE', 'HELLO'])
    assert len(set(meta['signers'])) == 3
    x = np.fromfile(tmp_path / 'zip/X.f32', dtype='<f4')
    assert x.size == 12 * 32 * 174 and np.isfinite(x).all() and np.any(x != 0)
    convert(raw, tmp_path / 'parallel', workers=2)
    assert (tmp_path / 'parallel/X.f32').read_bytes() == (tmp_path / 'zip/X.f32').read_bytes()
    with pytest.raises(ValueError, match='not in the dataset'):
        convert(raw, tmp_path / 'missing', signs='name')
    manifest = pd.DataFrame(verify_source(raw, 'gislr'))
    manifest.iloc[:2].to_parquet(tmp_path / 'manifest.parquet', index=False)
    selected = convert(raw, tmp_path / 'selected', manifest=tmp_path / 'manifest.parquet')
    assert selected['n'] == 2
    table = pd.read_parquet(raw / manifest.iloc[0].rel_path)
    table.loc[0, 'x'] = 0.12345
    table.to_parquet(raw / manifest.iloc[0].rel_path, index=False)
    with pytest.raises(ValueError, match='checksum mismatch'):
        convert(raw, tmp_path / 'changed', manifest=tmp_path / 'manifest.parquet')


def test_nan_hand_pose_and_invalid_layout(landmark_table):
    table = landmark_table(3)
    frames = to_frames(table.sample(frac=1, random_state=4), 0.75)
    assert len(frames[0]['hands']) == 1
    assert len(frames[1]['hands']) == 2
    table.loc[(table.type == 'pose') & (table.landmark_index == 0), 'x'] = np.nan
    assert all(f['pose'] is None for f in to_frames(table))
    with pytest.raises(ValueError, match='layout'):
        to_frames(table.iloc[1:][table.iloc[1:].type != 'right_hand'])
    with pytest.raises(ValueError, match='aspect'):
        to_frames(table, float('nan'))


def test_offline_csv_npz_and_aspect_estimation(tmp_path, landmark_table):
    table = landmark_table(2)
    table.to_csv(tmp_path / 'clip.csv', index=False)
    np.savez(tmp_path / 'clip.npz', **{c: np.asarray(table[c].tolist(), dtype=str) if c in ['row_id', 'type'] else table[c].to_numpy() for c in table.columns})
    with Source(tmp_path) as source:
        assert to_frames(read_table(source, 'clip.csv')) == to_frames(read_table(source, 'clip.npz'))
    (tmp_path / 'session.json').write_text(json.dumps({'clips': [{'frames': [{'w': 640, 'h': 480}]}]}))
    assert estimate_aspect(tmp_path) == 640 / 480
