import json
import subprocess
from pathlib import Path

import numpy as np

from datasets.common import Source, metadata
from datasets.preprocess import convert
from datasets.verify import verify_source

ROOT = Path(__file__).resolve().parents[2]
TSX = ROOT / 'web/node_modules/tsx/dist/cli.mjs'


def test_fake_sessions_builder_and_python_twin(tmp_path):
    raw, processed, public = [tmp_path / n for n in ['raw', 'processed', 'pub']]
    subprocess.run(['node', str(TSX), 'web/scripts/fake-sessions.ts', str(raw)], cwd=ROOT, check=True)
    subprocess.run(['node', str(TSX), 'web/scripts/build-dataset.ts', str(raw), str(processed), str(public)], cwd=ROOT, check=True)
    m = json.loads((processed / 'meta.json').read_text())
    assert m['n'] == 60 and m['T'] == 32 and m['F'] == 174
    assert len(set(m['signers'])) == 3 and '_idle' in m['labels']
    for path in [processed / 'X.f32', public / 'knn.f32', public / 'letters.f32']:
        x = np.fromfile(path, dtype='<f4')
        assert x.size > 0 and np.isfinite(x).all()
    assert json.loads((public / 'letters.json').read_text())['F'] == 48
    own_manifest = verify_source(raw, 'own')
    assert len(own_manifest) == 78
    py_meta = convert(raw, tmp_path / 'python')
    assert py_meta['splits'] == m['splits'] and py_meta['signers'] == m['signers']
    x = np.fromfile(processed / 'X.f32', dtype='<f4')
    y = np.fromfile(tmp_path / 'python/X.f32', dtype='<f4')
    assert np.max(np.abs(x - y)) < 1e-4


def test_builder_rejects_malformed_session(tmp_path):
    raw = tmp_path / 'raw'
    raw.mkdir()
    (raw / 'invalid.json').write_text(json.dumps({'version': 1, 'signer': '', 'clips': []}))
    result = subprocess.run(['node', str(TSX), 'web/scripts/build-dataset.ts', str(raw), str(tmp_path / 'out'), str(tmp_path / 'pub')],
                            cwd=ROOT, capture_output=True, text=True)
    assert result.returncode != 0 and 'Invalid Recorder session' in result.stderr
