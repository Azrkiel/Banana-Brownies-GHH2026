"""Python first-party Recorder adapter, sharing canonical features with GISLR."""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from features import T, FEAT_PER_FRAME, clip_features
from datasets.common import Source, metadata, select_rows, write_meta


def convert(path, out, license_tier='commercial', manifest=None):
    with Source(path) as source:
        sessions = {n: json.loads(source.read(n)) for n in source.names if n.endswith('.json')}
        rows = select_rows(metadata(source, 'own'), 'own', license_tier, manifest, source)
        rows = [r for r in rows if sessions[r['rel_path']]['clips'][int(r['clip_id'].rsplit(':', 1)[1])]['kind'] == 'sign']
        if not rows:
            raise ValueError('No sign clips')
        labels = sorted({r['canonical_gloss'] for r in rows})
        out = Path(out)
        out.mkdir(parents=True, exist_ok=True)
        with (out / 'X.f32').open('wb') as f:
            for row in rows:
                clip = sessions[row['rel_path']]['clips'][int(row['clip_id'].rsplit(':', 1)[1])]
                tensor = clip_features(clip['frames'])
                if not np.isfinite(tensor).all():
                    raise ValueError('Non-finite Recorder tensor')
                f.write(tensor.astype('<f4').tobytes())
    return write_meta(out, rows, labels, T=T, F=FEAT_PER_FRAME)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--dir', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--license-tier', choices=['commercial', 'research'], default='commercial')
    p.add_argument('--manifest', type=Path)
    a = p.parse_args()
    print(convert(a.dir, a.out, a.license_tier, a.manifest)['n'])


if __name__ == '__main__':
    main()
