import { describe, expect, it } from 'vitest';
import { bodyCenterX, canonicalize, clipFeatures, FEAT_PER_FRAME, frameFeatures, anchors, mirrorFrame, orderHands, resample, T } from './features';
import type { Frame, Pt } from './types';

const P = (x: number, y: number): Pt => ({ x, y, z: 0 });
function pose(dx = 0, s = 1): Pt[] {
  const pts = Array.from({ length: 17 }, () => P(0.5, 0.3));
  pts[0] = P(0.5, 0.3); pts[9] = P(0.48, 0.38); pts[10] = P(0.52, 0.38);
  pts[11] = P(0.4, 0.6); pts[12] = P(0.6, 0.6);
  return pts.map((p) => P(0.5 + (p.x - 0.5) * s + dx, 0.5 + (p.y - 0.5) * s));
}
function hand(cx: number, cy: number, dx = 0, s = 1): Pt[] {
  return Array.from({ length: 21 }, (_, i) =>
    P(0.5 + (cx + 0.01 * (i % 5) - 0.5) * s + dx, 0.5 + (cy - 0.01 * Math.floor(i / 5) - 0.5) * s));
}
const frame = (hands: Pt[][], dx = 0, s = 1): Frame =>
  ({ t: 0, w: 640, h: 480, pose: pose(dx, s), hands: hands.map((h) => h.map((p) => P(0.5 + (p.x - 0.5) * s + dx, 0.5 + (p.y - 0.5) * s))), brow: null });

describe('features', () => {
  it('has the documented size', () => {
    const f = frame([hand(0.45, 0.4)]);
    expect(frameFeatures(f, anchors(f, null)!)).toHaveLength(FEAT_PER_FRAME);
  });
  it('is invariant to translation and scale of the whole scene', () => {
    const a = frame([hand(0.45, 0.4), hand(0.6, 0.45)]);
    const b = frame([hand(0.45, 0.4), hand(0.6, 0.45)], 0.07, 1.25);
    const fa = frameFeatures(a, anchors(a, null)!); const fb = frameFeatures(b, anchors(b, null)!);
    fa.forEach((v, i) => expect(fb[i]).toBeCloseTo(v, 5));
  });
  it('puts the image-left hand first (dominant after canonical mirroring)', () => {
    const left = hand(0.3, 0.4); const right = hand(0.7, 0.4);
    expect(orderHands([right, left])[0]).toBe(left);
    expect(orderHands([right])[1]).toBeNull();
  });
  it('zero-fills a missing hand and sets presence flags', () => {
    const f = frame([hand(0.45, 0.4)]);
    const v = frameFeatures(f, anchors(f, null)!);
    expect(v.slice(84, 168).every((x) => x === 0)).toBe(true);
    expect(v.slice(-2)).toEqual([1, 0]);
  });
  it('mirrors x for left-handed signers', () => {
    const f = frame([hand(0.3, 0.4)]);
    expect(mirrorFrame(f).hands[0][0].x).toBeCloseTo(1 - f.hands[0][0].x, 6);
  });
  it('resamples any length to T frames and keeps endpoints', () => {
    const seq = Array.from({ length: 50 }, (_, i) => [i, 2 * i]);
    const r = resample(seq, T);
    expect(r).toHaveLength(T);
    expect(r[0]).toEqual([0, 0]);
    expect(r[T - 1]).toEqual([49, 98]);
  });
  it('clipFeatures returns T x F floats', () => {
    const frames = Array.from({ length: 20 }, () => frame([hand(0.45, 0.4)]));
    expect(clipFeatures(frames)).toHaveLength(T * FEAT_PER_FRAME);
  });

  it('reuses the previous anchors when pose tracking is lost or shoulders collapse', () => {
    const f = frame([hand(0.45, 0.4)]);
    const previous = anchors(f, null)!;
    expect(anchors({ ...f, pose: null }, previous)).toBe(previous);
    const collapsed = pose();
    collapsed[12] = collapsed[11];
    expect(anchors({ ...f, pose: collapsed }, previous)).toBe(previous);
    expect(anchors({ ...f, pose: null }, null)).toBeNull();
  });

  it('zero-fills empty clips and clips without usable pose anchors', () => {
    const noPose = { ...frame([hand(0.45, 0.4)]), pose: null };
    for (const frames of [[], [noPose]]) {
      const features = clipFeatures(frames);
      expect(features).toHaveLength(T * FEAT_PER_FRAME);
      expect(features.every((value) => value === 0)).toBe(true);
    }
  });

  it('trims leading and trailing frames without hands', () => {
    const active = frame([hand(0.45, 0.4)]);
    expect(clipFeatures([frame([]), active, active, frame([])]))
      .toEqual(clipFeatures([active, active]));
  });

  it('keeps a clip finite across temporary pose and hand tracking loss', () => {
    const active = frame([hand(0.45, 0.4)]);
    const dropout = { ...active, pose: null, hands: [] };
    const features = clipFeatures([active, dropout, { ...active, pose: null }]);
    expect(features.every(Number.isFinite)).toBe(true);
    expect(Array.from(features.slice(-2))).toEqual([1, 0]);
  });

  it('mirrors without mutating the recorded frame and is reversible', () => {
    const f = frame([hand(0.3, 0.4), hand(0.7, 0.4)]);
    const original = structuredClone(f);
    const mirrored = mirrorFrame(f);
    expect(f).toEqual(original);
    expect(mirrored.pose![0].x).toBeCloseTo(1 - f.pose![0].x);
    mirrorFrame(mirrored).hands.forEach((h, i) => {
      h.forEach((p, j) => expect(p.x).toBeCloseTo(f.hands[i][j].x));
    });
  });

  it('interpolates intermediate samples and copies singleton rows', () => {
    expect(resample([[0, 2], [10, 6]], 3)).toEqual([[0, 2], [5, 4], [10, 6]]);
    const row = [1, 2];
    const repeated = resample([row], 3);
    repeated[0][0] = 99;
    expect(repeated[1]).toEqual([1, 2]);
    expect(row).toEqual([1, 2]);
    expect(resample([], T)).toEqual([]);
  });

  it('can request a single sample without producing NaN', () => {
    expect(resample([[2, 4], [6, 8]], 1)).toEqual([[2, 4]]);
  });

  it('rejects invalid sample counts', () => {
    for (const count of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => resample([[1], [2]], count)).toThrow(RangeError);
    }
  });
});

describe('canonical handedness', () => {
  const movingLeft = () => Array.from({ length: 8 }, (_, i) => frame([hand(0.25 + i * 0.01, 0.4), hand(0.7, 0.5)]));
  it('mirrors a clip whose image-right hand does the moving', () => {
    const right = movingLeft().map(mirrorFrame);
    expect(canonicalize(right)[0].hands[0][0].x).toBeCloseTo(0.25);
    const left = movingLeft();
    expect(canonicalize(left)).toBe(left);
  });
  it('gives the same features for a sign and its mirror image', () => {
    const clip = movingLeft();
    const features = clipFeatures(clip);
    clipFeatures(clip.map(mirrorFrame)).forEach((v, i) => expect(v).toBeCloseTo(features[i], 5));
  });
  it('handles a lone hand, static clips and single frames without mutating input', () => {
    for (const clip of [movingLeft().map(f => ({ ...f, hands: [f.hands[0]] })), [frame([hand(0.3, 0.4)])]]) {
      const saved = structuredClone(clip);
      const expected = clipFeatures(clip);
      clipFeatures(clip.map(mirrorFrame)).forEach((v, i) => expect(v).toBeCloseTo(expected[i], 5));
      expect(clip).toEqual(saved);
    }
  });
  it('uses the shoulder midpoint or image centre when pose is missing', () => {
    expect(bodyCenterX(frame([], 0.1))).toBeCloseTo(0.6);
    expect(bodyCenterX({ ...frame([]), pose: null })).toBe(0.5);
  });
  it('does not count disappearances as wrist motion and zero-fills absent hands', () => {
    const clip = movingLeft();
    clip.splice(3, 0, frame([]));
    expect(canonicalize(clip)).toBe(clip);
    const f = frame([]);
    expect(frameFeatures(f, anchors(f, null)!)).toEqual(new Array(FEAT_PER_FRAME).fill(0));
  });
});

it('canonicalizes a static hand with its wrist at body centre and reverses head yaw', () => {
  const clip = [{ ...frame([hand(0.5, 0.4)]), headYaw: 0.25 }];
  const expected = clipFeatures(clip);
  const mirrored = clip.map(mirrorFrame);
  expect(mirrored[0].headYaw).toBe(-0.25);
  clipFeatures(mirrored).forEach((v, i) => expect(v).toBeCloseTo(expected[i], 5));
});
