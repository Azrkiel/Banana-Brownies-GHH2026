"""Seven deterministic TypeScript-produced cases; never regenerate from Python."""
import json
from pathlib import Path
import sys

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from features import FEAT_PER_FRAME, T, clip_features

FIXTURE = json.loads((Path(__file__).parent / "fixtures/parity.json").read_text())
assert len(FIXTURE["cases"]) == 7
assert FIXTURE["T"] == T and FIXTURE["featuresPerFrame"] == FEAT_PER_FRAME


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda case: case["name"])
def test_parity(case):
    actual = clip_features(case["frames"])
    expected = np.asarray(case["features"], dtype=np.float32)
    assert actual.dtype == np.float32
    assert actual.shape == expected.shape == (T * FEAT_PER_FRAME,)
    assert np.isfinite(actual).all()
    difference = float(np.max(np.abs(actual - expected)))
    assert difference < 1e-4, f"{case['name']}: max |diff| = {difference}"
