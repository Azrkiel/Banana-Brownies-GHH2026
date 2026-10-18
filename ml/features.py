"""Canonical two-hand features: mathematical twin of web/src/lib/features.ts.

Use Python doubles for geometry/interpolation and cast only the final tensor to
float32, matching JavaScript numbers followed by Float32Array construction.
"""
import math

import numpy as np

T = 32
FEAT_PER_FRAME = 174


def _xy(p, aspect):
    return (p["x"] * aspect, p["y"])


def anchors(f, prev=None):
    pose = f.get("pose")
    if not pose or len(pose) < 13:
        return prev
    aspect = f["w"] / f["h"]
    left, right = _xy(pose[11], aspect), _xy(pose[12], aspect)
    scale = math.hypot(left[0] - right[0], left[1] - right[1])
    if scale < 1e-3:
        return prev
    m1, m2 = _xy(pose[9], aspect), _xy(pose[10], aspect)
    center = ((left[0] + right[0]) / 2, (left[1] + right[1]) / 2)
    return {"c": center, "s": scale, "nose": _xy(pose[0], aspect),
            "mouth": ((m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2),
            "restY": center[1] + 0.8 * scale}


def order_hands(hands):
    if not hands:
        return (None, None)
    if len(hands) == 1:
        return (hands[0], None)
    a, b = hands[:2]
    return (a, b) if a[0]["x"] <= b[0]["x"] else (b, a)


def mirror_frame(f):
    def mirror(p):
        return {"x": 1 - p["x"], "y": p["y"], "z": p["z"]}
    result = {**f, "pose": [mirror(p) for p in f["pose"]] if f.get("pose") is not None else None,
              "hands": [[mirror(p) for p in hand] for hand in f["hands"]]}
    if "headYaw" in f:
        result["headYaw"] = -f["headYaw"]
    return result


def body_center_x(f):
    pose = f.get("pose")
    return (pose[11]["x"] + pose[12]["x"]) / 2 if pose and len(pose) >= 13 else 0.5


def canonicalize(frames):
    motion = [0.0, 0.0]
    previous = [None, None]
    orientation = 0
    for f in frames:
        left, right = order_hands(f["hands"])
        if len(f["hands"]) == 1:
            wrists = [left[0], None] if left[0]["x"] <= body_center_x(f) else [None, left[0]]
        else:
            wrists = [left[0] if left else None, right[0] if right else None]
        for side in range(2):
            p, prev = wrists[side], previous[side]
            if p is not None and prev is not None:
                motion[side] += math.hypot(p["x"] - prev["x"], p["y"] - prev["y"])
        if orientation == 0:
            for hand in f["hands"]:
                point = next((p for p in hand if abs(p["x"] - body_center_x(f)) > 1e-8), None)
                if point is not None:
                    orientation = point["x"] - body_center_x(f)
                    break
        previous = wrists
    delta = motion[1] - motion[0]
    mirror = delta > 0 if abs(delta) > 1e-8 else orientation > 0
    return [mirror_frame(f) for f in frames] if mirror else frames


def _push_hand(out, hand, a, aspect):
    if hand is None:
        out.extend([0.0] * 84)
        return
    points = [_xy(p, aspect) for p in hand]
    for p in points:
        out.extend(((p[0] - a["c"][0]) / a["s"], (p[1] - a["c"][1]) / a["s"]))
    wrist = points[0]
    scale = math.hypot(points[9][0] - wrist[0], points[9][1] - wrist[1]) or 1e-3
    for p in points:
        out.extend(((p[0] - wrist[0]) / scale, (p[1] - wrist[1]) / scale))


def frame_features(f, a):
    aspect = f["w"] / f["h"]
    dom, non = order_hands(f["hands"])
    out = []
    _push_hand(out, dom, a, aspect)
    _push_hand(out, non, a, aspect)
    if dom is not None:
        tip = _xy(dom[8], aspect)
        for anchor in (a["nose"], a["mouth"]):
            out.extend(((tip[0] - anchor[0]) / a["s"], (tip[1] - anchor[1]) / a["s"]))
    else:
        out.extend([0.0] * 4)
    out.extend((int(dom is not None), int(non is not None)))
    return out


def resample(seq, n):
    if not isinstance(n, int) or n < 1:
        raise ValueError("Sample count must be a positive integer")
    if not seq:
        return []
    if n == 1:
        return [seq[0][:]]
    if len(seq) == 1:
        return [seq[0][:] for _ in range(n)]
    out = []
    for i in range(n):
        pos = i * (len(seq) - 1) / (n - 1)
        lo = math.floor(pos)
        hi = min(lo + 1, len(seq) - 1)
        weight = pos - lo
        out.append([v * (1 - weight) + seq[hi][k] * weight for k, v in enumerate(seq[lo])])
    return out


def clip_features(raw):
    frames = canonicalize(raw)
    active = [i for i, f in enumerate(frames) if f["hands"]]
    first, last = (active[0], active[-1]) if active else (0, len(frames) - 1)
    a = None
    for f in frames:
        a = anchors(f, a)
        if a is not None:
            break
    seq = []
    for f in frames[first:last + 1]:
        a = anchors(f, a)
        seq.append(frame_features(f, a) if a is not None else [0.0] * FEAT_PER_FRAME)
    rows = resample(seq, T)
    return np.asarray(rows, dtype=np.float32).reshape(-1) if rows else np.zeros(T * FEAT_PER_FRAME, dtype=np.float32)
