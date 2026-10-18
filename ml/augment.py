"""Augment the shipped XY174 schema; never reinterpret flags as XYZ coordinates.

Each hand is body XY (42) then wrist-local XY (42); offsets occupy 168:172,
and hand-presence flags occupy 172:174. No depth survives preprocessing.
"""
import numpy as np


def _copy(seq):
    x = np.array(seq, dtype=np.float32, copy=True)
    if x.ndim != 2 or x.shape[1] != 174 or not np.isfinite(x).all():
        raise ValueError('Expected finite (T,174) canonical XY features')
    return x


def mirror_hands_and_pose(seq_174, p=0.5):
    x = _copy(seq_174)
    if not 0 <= p <= 1:
        raise ValueError('p must be in [0,1]')
    if np.random.random() >= p:
        return x
    # With one visible hand the extractor always uses slot zero. With two,
    # slots are image ordered, so reflection exchanges them and anchor offsets.
    two = x[:, 173] > 0
    nose = x[:, 16:18] - x[:, 168:170]
    mouth = x[:, 16:18] - x[:, 170:172]
    x[two, :84], x[two, 84:168] = x[two, 84:168].copy(), x[two, :84].copy()
    x[two, 168:170] = x[two, 16:18] - nose[two]
    x[two, 170:172] = x[two, 16:18] - mouth[two]
    x[:, :172:2] *= -1
    return x


def _transform(seq, matrix, noise_std=0):
    x = _copy(seq)
    for start in (0, 84):
        present = x[:, 172 + start // 84] > 0
        for block in (start, start + 42):
            points = x[:, block:block+42].reshape(-1, 21, 2)
            points[:] = points @ matrix.T
            if noise_std:
                points[present] += np.random.normal(0, noise_std, points[present].shape)
            points[~present] = 0
        # Recompute wrist-local coordinates from transformed body points.
        body = x[:, start:start+42].reshape(-1, 21, 2)
        local = body - body[:, :1]
        scale = np.linalg.norm(body[:, 9] - body[:, 0], axis=1)
        local /= np.maximum(scale[:, None, None], 1e-3)
        x[:, start+42:start+84] = local.reshape(-1, 42)
    x[:, 168:172] = (x[:, 168:172].reshape(-1, 2, 2) @ matrix.T).reshape(-1, 4)
    return x


def random_3d_rotation_and_camera_tilt(seq_174, max_yaw_deg=15., max_pitch_deg=12., max_roll_deg=10.):
    # Project a true SO(3) camera rotation of planar XY points (z=0). We cannot
    # invent discarded landmark depth; record this planar approximation in ADR.
    yaw, pitch, roll = np.deg2rad(np.random.uniform(-1, 1, 3) *
                                 [max_yaw_deg, max_pitch_deg, max_roll_deg])
    cy, sy, cp, sp, cr, sr = np.cos(yaw), np.sin(yaw), np.cos(pitch), np.sin(pitch), np.cos(roll), np.sin(roll)
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
    return _transform(seq_174, (rz @ rx @ ry)[:2, :2])


def random_temporal_resample(seq_174, speed_range=(.75, 1.30)):
    x = _copy(seq_174)
    if not len(x):
        return x
    speed = np.random.uniform(*speed_range)
    if speed <= 0:
        raise ValueError('Speed must be positive')
    positions = np.arange(len(x)) * speed
    lo = np.minimum(positions.astype(int), len(x)-1)
    hi = np.minimum(lo+1, len(x)-1)
    w = (positions - lo).clip(0, 1)[:, None]
    result = ((1-w)*x[lo] + w*x[hi]).astype(np.float32)
    result[:, 172:] = x[np.minimum(np.rint(positions).astype(int), len(x)-1), 172:]
    for side in (0, 1):
        result[result[:, 172+side] == 0, side*84:(side+1)*84] = 0
    result[result[:, 172] == 0, 168:172] = 0
    result[positions > len(x)-1] = 0
    return result


def random_hand_dropout_and_occlusion(seq_174, frame_drop_prob=.08, nondom_hand_drop_prob=.05):
    x = _copy(seq_174)
    nose = x[:, 16:18] - x[:, 168:170]
    mouth = x[:, 16:18] - x[:, 170:172]
    for t in range(len(x)):
        if np.random.random() < frame_drop_prob:
            side = np.random.randint(2)
            end = min(len(x), t + np.random.randint(1, 4))
            x[t:end, side*84:(side+1)*84] = 0
            x[t:end, 172+side] = 0
        if np.random.random() < nondom_hand_drop_prob:
            x[t, 84:168] = 0
            x[t, 173] = 0
    # Restore the extractor's one-visible-hand convention after primary loss.
    only_second = (x[:, 172] == 0) & (x[:, 173] > 0)
    x[only_second, :84] = x[only_second, 84:168]
    x[only_second, 84:168] = 0
    x[only_second, 172], x[only_second, 173] = 1, 0
    # Preserve body anchors when promoting the remaining hand.
    x[only_second, 168:170] = x[only_second, 16:18] - nose[only_second]
    x[only_second, 170:172] = x[only_second, 16:18] - mouth[only_second]
    x[x[:, 172] == 0, 168:172] = 0
    return x


def random_scale_and_perspective_jitter(seq_174, scale_range=(.85, 1.15), noise_std=.012):
    return _transform(seq_174, np.diag(np.random.uniform(*scale_range, size=2)), noise_std)


def augment(seq):
    x = mirror_hands_and_pose(seq)
    x = random_3d_rotation_and_camera_tilt(x)
    x = random_temporal_resample(x)
    x = random_scale_and_perspective_jitter(x)
    return random_hand_dropout_and_occlusion(x)
