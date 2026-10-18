"""Dataset preflight/downloader. --write-human-guide never starts a download."""
import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from datasets.common import ROOT, dataset_info
from datasets.vocab_merge import allowed, source_id

CHOICES = ['gislr', 'aslfr', 'aslfr-npy', 'asl-citizen', 'how2sign-holistic', 'chicagofswild', 'wlasl-hf']
TARGETS = {'gislr': ('gislr', 'asl-signs.zip'), 'aslfr': ('aslfr', 'asl-fingerspelling.zip'),
           'aslfr-npy': ('aslfr', 'asl-fingerspelling-preprocessing-train-dataset.zip'),
           'asl-citizen': ('asl_citizen', 'ASL_Citizen.zip'),
           'how2sign-holistic': ('how2sign', None), 'chicagofswild': ('chicagofswild', 'ChicagoFSWild.tgz'),
           'wlasl-hf': ('wlasl', None)}


def command(dataset, dest):
    directory = Path(dest) / TARGETS[dataset][0]
    if dataset in {'gislr', 'aslfr'}:
        return ['kaggle', 'competitions', 'download', '-c', 'asl-signs' if dataset == 'gislr' else 'asl-fingerspelling', '-p', str(directory)]
    if dataset == 'aslfr-npy':
        return ['kaggle', 'datasets', 'download', '-d', 'darraghdog/asl-fingerspelling-preprocessing-train-dataset', '-p', str(directory)]
    if dataset in {'how2sign-holistic', 'wlasl-hf'}:
        repo = 'PSewmuthu/How2Sign_Holistic' if dataset == 'how2sign-holistic' else 'Voxel51/WLASL'
        cmd = ['hf', 'download', repo, '--repo-type', 'dataset', '--local-dir', str(directory)]
        return cmd + (['--include', 'metadata/*', '*/frontal/*'] if dataset == 'how2sign-holistic' else [])
    return ['curl', '-L', '--fail', '--continue-at', '-', dataset_info(source_id(dataset))['download_url'],
            '--output', str(directory / TARGETS[dataset][1])]


def has_kaggle_credentials():
    if os.environ.get('KAGGLE_USERNAME') and os.environ.get('KAGGLE_KEY'):
        return True
    path = Path(os.environ.get('KAGGLE_CONFIG_DIR', str(Path.home() / '.kaggle'))) / 'kaggle.json'
    try:
        token = json.loads(path.read_text())
        return bool(token.get('username') and token.get('key'))
    except (OSError, ValueError):
        return False


def instructions(dest='data/raw'):
    def manual_command(dataset):
        cmd = command(dataset, dest)
        if cmd[0] in {'kaggle', 'hf'}:
            cmd[0] = 'ml/.venv/Scripts/' + cmd[0]
        return ' '.join(cmd)
    commands = manual_command('gislr') + '\n# Compact ASLFR NPY source:\n' + manual_command('aslfr-npy')
    commands += f'\nml/.venv/Scripts/kaggle competitions download -c asl-fingerspelling -f train.csv -p {dest}/aslfr'
    commands += f'\nExpand-Archive -LiteralPath {dest}/aslfr/asl-fingerspelling-preprocessing-train-dataset.zip -DestinationPath {dest}/aslfr'
    commands += '\n# Full competition alternative (use instead of the compact source above):\n# ' + manual_command('aslfr')
    commands += f'\n# Expand-Archive -LiteralPath {dest}/aslfr/asl-fingerspelling.zip -DestinationPath {dest}/aslfr'
    optional = '\n'.join(manual_command(d) for d in CHOICES[3:])
    return f'''## Phase 2 / Tasks 2.1–2.3 — Dataset acquisition and full-data verification

**Missing prerequisites:** Large datasets, accepted Kaggle competition rules, credentials, disk space and optional video model assets are absent from the synthetic verification environment. No large dataset was downloaded. Full-data throughput and real video quality remain human checks.

Run from the repository root on the training machine. Python commands below use the Windows virtual environment; on Linux use `ml/.venv/bin/python`. Install only data dependencies for Phase 2:

```powershell
python -m venv ml/.venv
ml/.venv/Scripts/python -m pip install numpy==2.3.5 pandas==2.2.3 pyarrow==19.0.1 pytest==9.1.1 kaggle huggingface_hub
New-Item -ItemType Directory -Force "$HOME/.kaggle", {dest}/gislr, {dest}/aslfr | Out-Null
Copy-Item "$HOME/Downloads/kaggle.json" "$HOME/.kaggle/kaggle.json"
```

Create your private API token at https://www.kaggle.com/settings and accept rules at https://www.kaggle.com/competitions/asl-signs/rules and https://www.kaggle.com/competitions/asl-fingerspelling/rules. Keep the token out of Git. Choose **either** compact ASLFR NPY or the full competition archive; both include overlapping clips.

```powershell
{commands}
```

**Exact targets:** `{dest}/gislr/asl-signs.zip`; either `{dest}/aslfr/asl-fingerspelling-preprocessing-train-dataset.zip` (extract locally before NPY conversion) or `{dest}/aslfr/asl-fingerspelling.zip` (extract before ASLFR conversion). GISLR can be read directly from ZIP. Reserve at least archive size × 1.25 for downloads and additional space for extraction/features. The manager enforces preflight: `ml/.venv/Scripts/python ml/datasets/download.py --dataset gislr --dest {dest}`.

**Expected SHA256:** The registry does not publish trusted archive digests. Do not treat an observed hash as an authenticity guarantee. Obtain a publisher checksum if available, place a filename-to-SHA256 JSON mapping at `data/manifests/expected_checksums.json`, and pass `--checksums` to verification. Otherwise verification records observed SHA256 per archive and clip, checks ZIP CRC, and decodes up to five files per media format. Expected binary outputs must be finite float32; fixed sign shards have `n × 32 × 174 × 4` bytes and variable shards have `offsets[-1] × F × 4` bytes, with `n+1` int64 offsets.

```powershell
ml/.venv/Scripts/python ml/datasets/verify.py --raw-dir {dest} --out data/manifests/clip_manifest.parquet
ml/.venv/Scripts/python ml/gislr_to_features.py --zip {dest}/gislr/asl-signs.zip --signs demo --manifest data/manifests/clip_manifest.parquet --out data/gislr-demo --workers 8
ml/.venv/Scripts/python ml/gislr_to_features.py --zip {dest}/gislr/asl-signs.zip --signs all --manifest data/manifests/clip_manifest.parquet --out data/gislr-all --workers 8
ml/.venv/Scripts/python ml/datasets/aslfr_to_features.py --dir {dest}/aslfr --manifest data/manifests/clip_manifest.parquet --out data/aslfr-processed --workers 8
```

For compact NPY, keep its matching `train.csv` beside `train_landmarks/<file_id>/<sequence_id>.npy` (or `<file_id>/<sequence_id>.npy`). Keep the publisher's `inference_args.json` containing `selected_columns`, or supply `columns.json` listing the exact flattened column order. Reduced layouts are never guessed. Preserve `character_to_prediction_index.json` if supplied.

**Optional research downloads only:** Accept each source's research license first. Run individually with ample disk space:

```powershell
New-Item -ItemType Directory -Force {dest}/asl_citizen, {dest}/how2sign, {dest}/chicagofswild, {dest}/wlasl | Out-Null
{optional}
ml/.venv/Scripts/python ml/datasets/verify.py --raw-dir {dest} --out data/manifests/research_manifest.parquet --license-tier research
```

Keep official signer/split metadata. When source metadata uses another schema, provide `clips.csv` with `path,label,signer_id,split` (relative media paths, one row per clip, splits train/val/test). How2Sign sentence metadata may lack signer identity: supply verified signer IDs; the pipeline refuses guessed identities. ASL-LEX EntryID references are research lookup hints, not evidence that identically named signs are equivalent. Human review is required before merging research classes.

```powershell
ml/.venv/Scripts/python -m pip install mediapipe opencv-python
python web/scripts/setup_assets.py
ml/.venv/Scripts/python ml/datasets/video_to_features.py --dir {dest}/asl_citizen --dataset asl_citizen --license-tier research --manifest data/manifests/research_manifest.parquet --out data/asl_citizen_features --workers 8 --resume
ml/.venv/Scripts/python ml/datasets/video_to_features.py --dir {dest}/how2sign --dataset how2sign --how2sign-npy --license-tier research --manifest data/manifests/research_manifest.parquet --out data/how2sign_features --workers 8 --resume
```

**Resume automated verification (Phase 2 only):**

```powershell
ml/.venv/Scripts/python -m pytest -q ml/tests
npm --prefix web test
npm --prefix web run lint
npm --prefix web run build
$phase2tmp = Join-Path $env:TEMP 'signline-phase2'
Push-Location web
npx tsx scripts/fake-sessions.ts "$phase2tmp/raw"
npx tsx scripts/build-dataset.ts "$phase2tmp/raw" "$phase2tmp/processed" "$phase2tmp/pub"
Pop-Location
```

Expected: manifest columns include clip/dataset/path/label/signer/split/license/SHA256; no signer overlap between splits; commercial manifests exclude research sources; synthetic recorder output contains 60 sign clips across three signers and nonempty `knn.f32`/`letters.f32`. No training, deployment, or Phase 3 work is authorized by these commands.
'''


def write_human_guide(path=None, dest='data/raw'):
    path = Path(path or ROOT / 'docs/subplans/model-v2/NEEDS_HUMAN_ACTION.md')
    existing = path.read_text(encoding='utf8') if path.exists() else '# Model v2 Human Actions\n'
    marker = '## Phase 2 / Tasks 2.1'
    existing = existing.split(marker)[0].rstrip()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(existing + '\n\n' + instructions(dest), encoding='utf8')
    return path


def log_dead_link(path, url, error):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a', encoding='utf8') as f:
        f.write(json.dumps({'url': url, 'error': str(error)}) + '\n')


def fetch_url(url, target, dead_links):
    target = Path(target)
    part = target.with_name(target.name + '.part')
    try:
        with urllib.request.urlopen(url, timeout=60) as response, part.open('wb') as f:
            shutil.copyfileobj(response, f)
        part.replace(target)
        return True
    except (OSError, urllib.error.URLError) as e:
        part.unlink(missing_ok=True)
        log_dead_link(dead_links, url, e)
        return False


def download(dataset, dest, license_tier='commercial', offline=False, dead_links='data/manifests/dead_links.jsonl'):
    if not allowed(source_id(dataset), license_tier):
        print('Research source requires --license-tier research')
        return 2
    directory, filename = TARGETS[dataset]
    target_dir = Path(dest) / directory
    if filename and (target_dir / filename).exists():
        print(f'Already exists: {target_dir / filename}; run verify.py')
        return 0
    if not filename and (target_dir / '.download-complete').exists():
        return 0
    ancestor = Path(dest).resolve()
    while not ancestor.exists():
        ancestor = ancestor.parent
    info = dataset_info(source_id(dataset))
    gb = info.get('preprocessed_size_gb', 12.4) if dataset == 'aslfr-npy' else info['size_gb']
    needed = int(gb * 1.25 * 10**9)
    if offline or shutil.disk_usage(ancestor).free < needed or (dataset.startswith(('gislr', 'aslfr')) and not has_kaggle_credentials()):
        print(instructions(str(dest)))
        return 2
    cmd = command(dataset, dest)
    target_dir.mkdir(parents=True, exist_ok=True)
    if cmd[0] == 'curl':
        ok = fetch_url(info['download_url'], target_dir / filename, dead_links)
        return 0 if ok else 2
    local_cli = Path(sys.executable).parent / (cmd[0] + ('.exe' if os.name == 'nt' else ''))
    if local_cli.exists():
        cmd[0] = str(local_cli)
    try:
        subprocess.run(cmd, check=True)
    except (OSError, subprocess.CalledProcessError) as e:
        print(f'Download unavailable: {e}\n' + instructions(str(dest)))
        return 2
    if not filename:
        (target_dir / '.download-complete').touch()
    return 0


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--dataset', choices=CHOICES)
    p.add_argument('--dest', type=Path, default=Path('data/raw'))
    p.add_argument('--license-tier', choices=['commercial', 'research'], default='commercial')
    p.add_argument('--offline', action='store_true')
    p.add_argument('--write-human-guide', action='store_true')
    a = p.parse_args()
    if a.write_human_guide:
        print(write_human_guide(dest=str(a.dest)))
        return 0
    if not a.dataset:
        p.error('--dataset is required unless --write-human-guide is used')
    return download(a.dataset, a.dest, a.license_tier, a.offline)


if __name__ == '__main__':
    sys.exit(main())
