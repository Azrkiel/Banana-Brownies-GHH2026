"""Resumable offline MP4 extraction and variable 180-D How2Sign conversion."""
import argparse
import hashlib
import io
import json
import sys
import tempfile
from multiprocessing import Pool
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from features import T, FEAT_PER_FRAME, anchors, canonicalize, clip_features, frame_features
from datasets.common import ROOT, Source, digest, metadata, select_rows, write_meta

_source = None
_models = None


def points(array):
    return [dict(zip(('x', 'y', 'z'), map(float, p[:3]))) for p in array]


def how2sign_features(array):
    array = np.asarray(array, dtype=np.float64)
    # 33*4 + 468*3 + 21*3 + 21*3 = 1662 (pose includes visibility).
    if array.ndim != 2 or array.shape[1] != 1662 or not len(array):
        raise ValueError('Expected nonempty How2Sign (frames,1662) layout')
    frames, summaries = [], []
    for i, row in enumerate(array):
        pose = row[:132].reshape(33, 4)[:17, :3]
        face = row[132:1536].reshape(468, 3)
        hands = [row[1536:1599].reshape(21, 3), row[1599:1662].reshape(21, 3)]
        frames.append({'t': i * 1000 / 30, 'w': 1280, 'h': 720,
                       'pose': points(np.nan_to_num(pose)) if np.isfinite(pose[:13]).all() and not np.allclose(pose, 0) else None,
                       'hands': [points(h) for h in hands if np.isfinite(h).all() and not np.allclose(h, 0)], 'brow': None})
        # Six dimensionless vertical offsets; face translation cancels at the nose.
        scale = np.linalg.norm(pose[11, :2] - pose[12, :2])
        summary = (face[[70, 105, 336, 300, 13, 14], 1] - face[1, 1]) / (scale if np.isfinite(scale) and scale > 1e-3 else 1)
        summaries.append(np.nan_to_num(summary, nan=0, posinf=0, neginf=0))
    result = np.zeros((len(frames), 180), dtype=np.float32)
    anchor = None
    for i, f in enumerate(canonicalize(frames)):
        anchor = anchors(f, anchor)
        if anchor is not None:
            result[i, :174] = frame_features(f, anchor)
        result[i, 174:] = summaries[i]
    return result


def extract_video_landmarks(path, model_dir):
    """MediaPipe Tasks at <=30 Hz using actual dimensions and monotonic video timestamps."""
    import cv2
    import mediapipe as mp
    from contextlib import ExitStack

    vision = mp.tasks.vision
    model_dir = Path(model_dir)
    hand_path, pose_path = model_dir / 'hand_landmarker.task', model_dir / 'pose_landmarker_lite.task'
    if not hand_path.exists() or not pose_path.exists():
        raise ValueError(f'Missing hand/pose assets under {model_dir}; run web/scripts/setup_assets.py')
    cap = cv2.VideoCapture(str(path))
    frames = []
    try:
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        fps = fps if np.isfinite(fps) and fps > 0 else 30.0
        with ExitStack() as stack:
            hand = stack.enter_context(vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(model_asset_path=str(hand_path)),
                running_mode=vision.RunningMode.VIDEO, num_hands=2)))
            pose = stack.enter_context(vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(model_asset_path=str(pose_path)),
                running_mode=vision.RunningMode.VIDEO, num_poses=1)))
            face_path = model_dir / 'face_landmarker.task'
            face = stack.enter_context(vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(model_asset_path=str(face_path)), running_mode=vision.RunningMode.VIDEO,
                num_faces=1, output_face_blendshapes=True))) if face_path.exists() else None
            index, last = 0, -1000.0
            brow = None
            while True:
                ok, rgb = cap.read()
                if not ok:
                    break
                t = index * 1000 / fps
                index += 1
                if t - last < 1000 / 30 - 0.01:
                    continue
                last = t
                h, w = rgb.shape[:2]
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(rgb, cv2.COLOR_BGR2RGB))
                timestamp = round(t)
                hand_result = hand.detect_for_video(image, timestamp)
                pose_result = pose.detect_for_video(image, timestamp)
                def convert_landmarks(landmarks):
                    return [{'x': float(p.x), 'y': float(p.y), 'z': float(p.z)} for p in landmarks]
                hands = [convert_landmarks(l) for l in hand_result.hand_landmarks if len(l) == 21]
                hands = [l for l in hands if all(np.isfinite(list(p.values())).all() for p in l)]
                pose_points = convert_landmarks(pose_result.pose_landmarks[0][:17]) if pose_result.pose_landmarks else None
                if pose_points and not all(np.isfinite(list(p.values())).all() for p in pose_points):
                    pose_points = None
                if face and len(frames) % 3 == 0:
                    blend = face.detect_for_video(image, timestamp).face_blendshapes
                    scores = {c.category_name: c.score for c in blend[0]} if blend else {}
                    brow = {'raise': scores.get('browInnerUp', 0),
                            'furrow': (scores.get('browDownLeft', 0) + scores.get('browDownRight', 0)) / 2}
                frames.append({'t': t, 'w': w, 'h': h, 'hands': hands[:2], 'pose': pose_points, 'brow': brow})
    finally:
        cap.release()
    if not frames:
        raise ValueError(f'Empty/unreadable video: {path}')
    return frames


def _init(path, model_dir):
    global _source, _models
    _source, _models = Source(path), Path(model_dir)


def _convert(job):
    row, cache_path, signature, how2sign, resume = job
    cache_path = Path(cache_path)
    if resume and cache_path.exists():
        try:
            with np.load(cache_path, allow_pickle=False) as cached:
                tensor = cached['tensor']
                valid_shape = tensor.ndim == 2 and tensor.shape[1] == 180 if how2sign else tensor.shape == (T, FEAT_PER_FRAME)
                if str(cached['signature']) == signature and valid_shape and len(tensor) and np.isfinite(tensor).all():
                    return tensor
        except (OSError, ValueError, KeyError):
            pass  # A partial/corrupt checkpoint is recomputed, never treated as a completed clip.
    name = row['rel_path']
    if how2sign:
        tensor = how2sign_features(np.load(io.BytesIO(_source.read(name)), allow_pickle=False))
    else:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp, 'clip.mp4')
            with _source.open(name) as src, path.open('wb') as dst:
                import shutil
                shutil.copyfileobj(src, dst)
            tensor = clip_features(extract_video_landmarks(path, _models)).reshape(T, FEAT_PER_FRAME)
    if not np.isfinite(tensor).all():
        raise ValueError(f'Non-finite features for {row["clip_id"]}')
    part = cache_path.with_suffix('.part')
    with part.open('wb') as f:
        np.savez(f, tensor=tensor, signature=signature)
    part.replace(cache_path)
    return tensor


def convert(path, out, dataset='asl_citizen', how2sign_npy=False, workers=1, resume=False,
            license_tier='commercial', manifest=None, model_dir=ROOT / 'web/public/models'):
    if workers < 1:
        raise ValueError('workers must be positive')
    if how2sign_npy != (dataset == 'how2sign'):
        raise ValueError('How2Sign requires --dataset how2sign --how2sign-npy')
    out = Path(out)
    cache = out / '.cache'
    cache.mkdir(parents=True, exist_ok=True)
    with Source(path) as source:
        rows = select_rows(metadata(source, dataset), dataset, license_tier, manifest, source)
        rows.sort(key=lambda r: r['clip_id'])
        model_hashes = {}
        for model in sorted(Path(model_dir).glob('*.task')) if not how2sign_npy else []:
            with model.open('rb') as f:
                model_hashes[model.name] = digest(f)
        jobs = []
        for row in rows:
            with source.open(row['rel_path']) as f:
                sha = digest(f)
            identity = json.dumps({'schema': 'phase2-v1', 'row': row, 'sha256': sha, 'models': model_hashes,
                                   'how2sign': how2sign_npy, 'license_tier': license_tier}, sort_keys=True)
            signature = hashlib.sha256(identity.encode()).hexdigest()
            key = hashlib.sha256(row['clip_id'].encode()).hexdigest()
            jobs.append((row, str(cache / (key + '.npz')), signature, how2sign_npy, resume))
    offsets = [0]
    def consume(iterator, f):
        for tensor in iterator:
            f.write(tensor.astype('<f4').tobytes())
            offsets.append(offsets[-1] + len(tensor))
    part = out / 'X.f32.part'
    try:
        with part.open('wb') as f:
            if workers == 1:
                _init(path, model_dir)
                try:
                    consume(map(_convert, jobs), f)
                finally:
                    _source.close()
            else:
                with Pool(workers, initializer=_init, initargs=(str(path), str(model_dir))) as pool:
                    consume(pool.imap(_convert, jobs), f)
        part.replace(out / 'X.f32')
    except BaseException:
        part.unlink(missing_ok=True)
        raise
    if how2sign_npy:
        np.asarray(offsets, dtype='<i8').tofile(out / 'offsets.i64')
    return write_meta(out, rows, sorted({r['canonical_gloss'] for r in rows}),
                      T=None if how2sign_npy else T, F=180 if how2sign_npy else FEAT_PER_FRAME,
                      query_license_tier=license_tier, offsets='offsets.i64' if how2sign_npy else None)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--dir', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--dataset', choices=['asl_citizen', 'chicagofswild', 'how2sign'], default='asl_citizen')
    p.add_argument('--how2sign-npy', action='store_true')
    p.add_argument('--workers', type=int, default=1)
    p.add_argument('--resume', action='store_true')
    p.add_argument('--license-tier', choices=['commercial', 'research'], default='commercial')
    p.add_argument('--manifest', type=Path)
    p.add_argument('--model-dir', type=Path, default=ROOT / 'web/public/models')
    a = p.parse_args()
    result = convert(a.dir, a.out, a.dataset, a.how2sign_npy, a.workers, a.resume, a.license_tier, a.manifest, a.model_dir)
    print(f'Wrote {result["n"]} clips -> {a.out}')


if __name__ == '__main__':
    main()
