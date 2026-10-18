import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture
def landmark_table():
    def make(n=7):
        rows = []
        for frame in range(n):
            for kind, count in [('face', 468), ('left_hand', 21), ('pose', 33), ('right_hand', 21)]:
                for index in range(count):
                    x, y, z = 0.5, 0.3, 0.0
                    if kind == 'pose' and index in (11, 12):
                        x, y = (0.35 if index == 11 else 0.65), 0.6
                    if 'hand' in kind:
                        x = (0.25 if kind == 'left_hand' else 0.7) + (index % 5) * 0.01 + frame * 0.002
                        y = 0.5 - (index // 5) * 0.02
                        if kind == 'right_hand' and frame % 3 == 0:
                            x = y = z = np.nan
                    rows.append((frame, f'{frame}-{kind}-{index}', kind, index, x, y, z))
        return pd.DataFrame(rows, columns=['frame', 'row_id', 'type', 'landmark_index', 'x', 'y', 'z'])
    return make
