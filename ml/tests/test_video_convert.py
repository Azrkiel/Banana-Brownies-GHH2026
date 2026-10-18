import json
import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

from datasets import video_to_features as video


def holistic(n=5):
    a = np.zeros((n, 1662), dtype=np.float32)
    pose = a[:, :132].reshape(n, 33, 4)
    pose[:, :, :3] = [0.5, 0.3, 0]
    pose[:, 11, :3] = [.35, .6, 0]
    pose[:, 12, :3] = [.65, .6, 0]
    hand = a[:, 1536:1599].reshape(n, 21, 3)
    for i in range(21):
        hand[:, i, :] = [.25 + i % 5 * .01, .5 - i // 5 * .02, 0]
    a[:, 132:1536] = .3
    a[0, 1536:] = 0
    return a


def make_how2sign(tmp_path):
    raw = tmp_path / 'raw'
    raw.mkdir()
    np.save(raw / 'clip.npy', holistic())
    pd.DataFrame([{'path': 'clip.npy', 'label': 'hello there', 'signer_id': 's1'}]).to_csv(raw / 'clips.csv', index=False)
    return raw


def test_how2sign_layout_license_offsets_and_resume(tmp_path, monkeypatch):
    raw = make_how2sign(tmp_path)
    out = tmp_path / 'out'
    with pytest.raises(ValueError, match='research'):
        video.convert(raw, out, dataset='how2sign', how2sign_npy=True)
    meta = video.convert(raw, out, dataset='how2sign', how2sign_npy=True, license_tier='research', workers=2)
    assert meta['F'] == 180 and meta['T'] is None
    data = (out / 'X.f32').read_bytes()
    x = np.frombuffer(data, dtype='<f4').reshape(-1, 180)
    assert x.shape == (5, 180) and np.isfinite(x).all()
    assert not x[0, :174].any() and x[1, 172] == 1 and x[1, 173] == 0
    assert np.fromfile(out / 'offsets.i64', dtype='<i8').tolist() == [0, 5]
    def fail(_):
        pytest.fail('resume must reuse valid cached features')
    original = video.how2sign_features
    monkeypatch.setattr(video, 'how2sign_features', fail)
    video.convert(raw, out, dataset='how2sign', how2sign_npy=True, license_tier='research', resume=True)
    assert (out / 'X.f32').read_bytes() == data
    monkeypatch.setattr(video, 'how2sign_features', original)
    next(out.glob('.cache/*.npz')).write_bytes(b'partial checkpoint')
    video.convert(raw, out, dataset='how2sign', how2sign_npy=True, license_tier='research', resume=True)
    assert (out / 'X.f32').read_bytes() == data
    changed = holistic()
    changed[:, 1536] += .1
    np.save(raw / 'clip.npy', changed)
    video.convert(raw, out, dataset='how2sign', how2sign_npy=True, license_tier='research', resume=True)
    assert (out / 'X.f32').read_bytes() != data
    with pytest.raises(ValueError, match='1662'):
        video.how2sign_features(np.zeros((2, 1661)))


def test_raw_video_to_fixed_tensor_and_resume(tmp_path, monkeypatch):
    raw = tmp_path / 'raw'
    raw.mkdir()
    (raw / 'clip.mp4').write_bytes(b'synthetic video source, extractor mocked')
    pd.DataFrame([{'path': 'clip.mp4', 'label': 'hello', 'signer_id': 's1'}]).to_csv(raw / 'clips.csv', index=False)
    pose = [{'x': .5, 'y': .3, 'z': 0} for _ in range(17)]
    pose[11]['x'], pose[12]['x'] = .35, .65
    hand = [{'x': .25 + i % 5 * .01, 'y': .5 - i // 5 * .02, 'z': 0} for i in range(21)]
    calls = []
    def extract(path, model_dir):
        calls.append(path)
        return [{'t': 0, 'w': 640, 'h': 480, 'pose': pose, 'hands': [hand], 'brow': None}]
    monkeypatch.setattr(video, 'extract_video_landmarks', extract)
    out = tmp_path / 'out'
    meta = video.convert(raw, out, license_tier='research')
    assert meta['T'] == 32 and meta['F'] == 174
    assert (out / 'X.f32').stat().st_size == 32 * 174 * 4
    video.convert(raw, out, license_tier='research', resume=True)
    assert len(calls) == 1


def test_mediapipe_tasks_sampling_and_cleanup(tmp_path, monkeypatch):
    # The same extraction loop runs against deterministic capture/task boundaries.
    events, options = [], []
    for name in ['hand_landmarker.task', 'pose_landmarker_lite.task', 'face_landmarker.task']:
        (tmp_path / name).touch()
    class Capture:
        def __init__(self, path):
            self.i = 0
        def get(self, prop):
            return 60
        def read(self):
            self.i += 1
            return (True, np.zeros((48, 64, 3), dtype=np.uint8)) if self.i <= 6 else (False, None)
        def release(self):
            events.append('release')
    class Detector:
        @staticmethod
        def create_from_options(option):
            options.append(option)
            return Detector()
        def __enter__(self):
            return self
        def __exit__(self, *_):
            events.append('close')
        def detect_for_video(self, image, t):
            events.append(t)
            p = SimpleNamespace(x=.3, y=.4, z=0)
            return SimpleNamespace(hand_landmarks=[[p] * 21, [p] * 21], pose_landmarks=[[p] * 33], face_blendshapes=[])
    vision = SimpleNamespace(RunningMode=SimpleNamespace(VIDEO='VIDEO'))
    for name in ['HandLandmarker', 'PoseLandmarker', 'FaceLandmarker']:
        setattr(vision, name, Detector)
        setattr(vision, name + 'Options', lambda **kw: kw)
    mp = SimpleNamespace(tasks=SimpleNamespace(vision=vision, BaseOptions=lambda **kw: kw),
                         Image=lambda **kw: kw, ImageFormat=SimpleNamespace(SRGB='rgb'))
    cv2 = SimpleNamespace(VideoCapture=Capture, CAP_PROP_FPS=1, COLOR_BGR2RGB=2, cvtColor=lambda x, _: x)
    monkeypatch.setitem(sys.modules, 'cv2', cv2)
    monkeypatch.setitem(sys.modules, 'mediapipe', mp)
    frames = video.extract_video_landmarks(tmp_path / 'clip.mp4', tmp_path)
    assert len(frames) == 3 and len(frames[0]['hands']) == 2 and len(frames[0]['pose']) == 17
    assert [round(f['t']) for f in frames] == [0, 33, 67]
    assert frames[0]['w'] == 64 and frames[0]['h'] == 48
    assert options[0]['num_hands'] == 2 and options[1]['num_poses'] == 1
    assert events.count('close') == 3 and events[-1] == 'release'
