"""Float32 twin of browser letters.ts, plus gap-aware wrist-local velocity."""
import math

import numpy as np

from features import body_center_x

LETTER_F = 48
SEQUENCE_F = 90


def letter_hand(frame):
    hands = frame['hands']
    if not hands:
        return None
    hand = min(hands, key=lambda h: h[0]['y'])
    return [{'x': 1 - p['x'], 'y': p['y'], 'z': p['z']} for p in hand] if hand[0]['x'] > body_center_x(frame) else hand


def letter_features(hand, aspect):
    pts = [(p['x'] * aspect, p['y']) for p in hand]
    wx, wy = pts[0]
    vx, vy = pts[9][0] - wx, pts[9][1] - wy
    scale = math.hypot(vx, vy) or 1e-3
    theta = math.atan2(vx, -vy)
    c, s = math.cos(-theta), math.sin(-theta)
    result = []
    for px, py in pts:
        x, y = (px - wx) / scale, (py - wy) / scale
        result.extend((x * c - y * s, x * s + y * c))
    ax, ay, bx, by = pts[5][0] - wx, pts[5][1] - wy, pts[17][0] - wx, pts[17][1] - wy
    cross = ax * by - ay * bx
    result.extend((math.sin(theta), math.cos(theta), (cross > 0) - (cross < 0)))
    for i, j in [(4, 8), (4, 12), (8, 12)]:
        result.append(math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) / scale)
    return np.asarray(result, dtype=np.float32)


def sequence_features(frames):
    result = np.zeros((len(frames), SEQUENCE_F), dtype=np.float32)
    previous = None
    for i, frame in enumerate(frames):
        hand = letter_hand(frame)
        if hand is None:
            previous = None
            continue
        aspect = frame['w'] / frame['h']
        pts = np.asarray([[p['x'] * aspect, p['y']] for p in hand], dtype=np.float64)
        scale = np.linalg.norm(pts[9] - pts[0]) or 1e-3
        local = (pts - pts[0]) / scale
        result[i, :LETTER_F] = letter_features(hand, aspect)
        if previous is not None:
            result[i, LETTER_F:] = (local - previous).reshape(-1)
        previous = local
    return result
