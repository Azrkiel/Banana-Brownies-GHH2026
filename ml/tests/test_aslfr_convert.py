import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from datasets.aslfr_to_features import convert, npy_frames, wide_frames
from datasets.letter_features import letter_features, letter_hand, sequence_features

ROOT = Path(__file__).resolve().parents[2]


def wide_table(long):
    data = []
    for _, group in long.groupby('frame', sort=True):
        data.append({f'{axis}_{r.type}_{int(r.landmark_index)}': getattr(r, axis)
                     for r in group.itertuples() for axis in 'xyz'})
    return pd.DataFrame(data)


def test_wide_parquet_variable_sequences_and_npy_equivalence(tmp_path, landmark_table):
    raw = tmp_path / 'raw'
    raw.mkdir()
    tables, rows = [], []
    for seq, n in [('11', 4), ('12', 7)]:
        wide = wide_table(landmark_table(n))
        wide.index = pd.Index([int(seq)] * n, name='sequence_id')
        tables.append(wide)
        rows.append({'path': 'train_landmarks/123.parquet', 'file_id': '123', 'sequence_id': seq,
                     'participant_id': seq, 'phrase': 'ab' if seq == '11' else 'ba'})
    (raw / 'train_landmarks').mkdir()
    pd.concat(tables).to_parquet(raw / 'train_landmarks/123.parquet')
    pd.DataFrame(rows).to_csv(raw / 'train.csv', index=False)
    convert(raw, tmp_path / 'parquet', workers=2)
    offsets = np.fromfile(tmp_path / 'parquet/offsets.i64', dtype='<i8')
    assert offsets.tolist() == [0, 4, 11]
    x = np.fromfile(tmp_path / 'parquet/X.f32', dtype='<f4').reshape(-1, 90)
    assert x.shape == (11, 90) and np.isfinite(x).all()
    assert not x[[0, 4], 48:].any()
    assert json.loads((tmp_path / 'parquet/y_chars.json').read_text()) == [[0, 1], [1, 0]]
    for seq, table in zip(['11', '12'], tables):
        directory = raw / 'train_landmarks/123'
        directory.mkdir(exist_ok=True)
        np.save(directory / f'{seq}.npy', table.to_numpy())
    (raw / 'inference_args.json').write_text(json.dumps({'selected_columns': tables[0].columns.tolist()}))
    convert(raw, tmp_path / 'npy')
    assert (tmp_path / 'npy/X.f32').read_bytes() == (tmp_path / 'parquet/X.f32').read_bytes()
    meta = json.loads((tmp_path / 'npy/meta.json').read_text())
    assert meta['n'] == 2 and meta['F'] == 90 and meta['T'] is None
    assert len(set(meta['signers'])) == 2 and meta['license_tier'] == 'commercial'


def test_missing_hand_gaps_unknown_npy_and_character_validation(tmp_path, landmark_table):
    frames = wide_frames(wide_table(landmark_table(3)), 0.75)
    frames[1]['hands'] = []
    features = sequence_features(frames)
    assert not features[1].any()
    assert not features[2, 48:].any()
    assert letter_hand(frames[1]) is None
    with pytest.raises(ValueError, match='Unknown NPY'):
        npy_frames(np.ones((3, 288)), 0.75)
    with pytest.raises(ValueError, match='hand columns'):
        wide_frames(pd.DataFrame({'unknown': [1]}), 0.75)


def test_long_parquet_full_npy_and_character_mismatch(tmp_path, landmark_table):
    table = landmark_table(3)
    table.to_parquet(tmp_path / 'one.parquet', index=False)
    pd.DataFrame([{'path': 'one.parquet', 'phrase': 'a', 'signer_id': '1'}]).to_csv(tmp_path / 'clips.csv', index=False)
    meta = convert(tmp_path, tmp_path / 'out')
    assert meta['n'] == 1 and meta['F'] == 90
    full = []
    for _, group in table.groupby('frame', sort=True):
        full.append(np.concatenate([group[group.type == k].sort_values('landmark_index')[['x','y','z']].to_numpy()
                                    for k in ['face','left_hand','pose','right_hand']]))
    assert len(npy_frames(np.asarray(full), .75)) == 3
    (tmp_path / 'character_to_prediction_index.json').write_text(json.dumps({'b': 0}))
    with pytest.raises(ValueError, match='character vocabulary'):
        convert(tmp_path, tmp_path / 'bad')


def test_browser_python_letter_parity(tmp_path):
    hand = [{'x': 0.24 + i % 5 * .013, 'y': .5 - i // 5 * .023, 'z': .001 * i} for i in range(21)]
    cases = []
    for aspect in [0.75, 4 / 3]:
        for mirror in [False, True]:
            frame = {'t': 0, 'w': aspect, 'h': 1, 'pose': None, 'brow': None,
                     'hands': [[{**p, 'x': 1 - p['x']} for p in hand] if mirror else hand]}
            cases.append(frame)
    input_path = tmp_path / 'cases.json'
    input_path.write_text(json.dumps(cases))
    code = "import {readFileSync} from 'node:fs'; import {letterHand,letterFeatures} from './web/src/lib/letters.ts'; const cases=JSON.parse(readFileSync(process.argv[1],'utf8')); console.log(JSON.stringify(cases.map(f=>Array.from(letterFeatures(letterHand(f),f.w/f.h)))));"
    result = subprocess.run(['node', str(ROOT / 'web/node_modules/tsx/dist/cli.mjs'), '-e', code, str(input_path)],
                            cwd=ROOT, capture_output=True, text=True, check=True)
    expected = np.asarray(json.loads(result.stdout), dtype=np.float32)
    actual = np.asarray([letter_features(letter_hand(f), f['w'] / f['h']) for f in cases])
    assert np.max(np.abs(actual - expected)) < 1e-4
