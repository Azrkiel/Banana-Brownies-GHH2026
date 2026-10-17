"""Prepare local browser runtimes and official MediaPipe model bundles.

Run from web/: npm run setup:assets. Use --runtime-only to copy npm assets
without downloading models. Generated files are deliberately ignored by Git.
"""

import argparse
import shutil
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

WEB = Path(__file__).resolve().parents[1]
MODELS = {
    'hand_landmarker.task': 'hand_landmarker/hand_landmarker/float16/1',
    'pose_landmarker_lite.task': 'pose_landmarker/pose_landmarker_lite/float16/1',
    'face_landmarker.task': 'face_landmarker/face_landmarker/float16/1',
}


def valid_model(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size <= 1_000_000:
        return False
    try:
        with zipfile.ZipFile(path) as bundle:
            return bool(bundle.namelist()) and bundle.testzip() is None
    except zipfile.BadZipFile:
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime-only', action='store_true')
    args = parser.parse_args()
    public = WEB / 'public'
    wasm = WEB / 'node_modules/@mediapipe/tasks-vision/wasm'
    ort = WEB / 'node_modules/onnxruntime-web/dist'
    if not wasm.is_dir() or not ort.is_dir():
        raise RuntimeError('Install frontend dependencies with npm ci first.')
    shutil.copytree(wasm, public / 'mediapipe/wasm', dirs_exist_ok=True)
    (public / 'ort').mkdir(parents=True, exist_ok=True)
    for extension in ('*.wasm', '*.mjs'):
        sources = list(ort.glob(extension))
        if not sources:
            raise RuntimeError(f'ONNX runtime is missing {extension} files.')
        for source in sources:
            shutil.copy2(source, public / 'ort' / source.name)
    print('Copied MediaPipe and ONNX browser runtimes.', flush=True)
    if args.runtime_only:
        return
    (public / 'models').mkdir(parents=True, exist_ok=True)
    for filename, version in MODELS.items():
        target = public / 'models' / filename
        if valid_model(target):
            print(f'Using existing {filename} ({target.stat().st_size:,} bytes).')
            continue
        temporary = target.with_suffix('.download')
        url = f'https://storage.googleapis.com/mediapipe-models/{version}/{filename}'
        print(f'Downloading {filename} from the official MediaPipe model bucket.', flush=True)
        try:
            # urllib uses the environment HTTPS proxy and default TLS verification.
            with urllib.request.urlopen(url, timeout=120) as response:
                with temporary.open('wb') as output:
                    shutil.copyfileobj(response, output)
            if not valid_model(temporary):
                raise RuntimeError(f'{filename} is not a valid model bundle larger than 1 MB.')
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
        print(f'Ready: {filename} ({target.stat().st_size:,} bytes).')


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, urllib.error.URLError) as error:
        sys.exit(f'Asset setup failed: {error}\nCheck network access to storage.googleapis.com and retry npm run setup:assets.')
