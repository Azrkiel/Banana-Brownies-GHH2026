import type { Frame, Pt } from './types';

export const T = 32;                                 // frames per sign after resampling (~1 s at 30 fps)
export const FEAT_PER_FRAME = 2 * (42 + 42) + 4 + 2; // 174
// layout: [dom global 42][dom local 42][non-dom global 42][non-dom local 42][face 4][presence 2]
// everything before the last 2 values is (x, y) pairs, so rotation augmentation can rotate pairs.

type XY = [number, number];
export type Anchors = { c: XY; s: number; nose: XY; mouth: XY; restY: number };

const NOSE = 0, MOUTH_L = 9, MOUTH_R = 10, SH_L = 11, SH_R = 12;
const xy = (p: Pt, aspect: number): XY => [p.x * aspect, p.y];   // aspect-corrected: x and y in image-height units
const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const len = (a: XY) => Math.hypot(a[0], a[1]);

/** Shoulder-centred frame of reference; falls back to the previous anchors when pose is missing. */
export function anchors(f: Frame, prev: Anchors | null): Anchors | null {
  if (!f.pose || f.pose.length < 13) return prev;
  const asp = f.w / f.h;
  const l = xy(f.pose[SH_L], asp), r = xy(f.pose[SH_R], asp);
  const s = len(sub(l, r));
  if (s < 1e-3) return prev;
  const m1 = xy(f.pose[MOUTH_L], asp), m2 = xy(f.pose[MOUTH_R], asp);
  const c: XY = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2];
  return { c, s, nose: xy(f.pose[NOSE], asp), mouth: [(m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2], restY: c[1] + 0.8 * s };
}

/** Image-left hand first after canonical mirroring; a lone hand occupies the first slot. */
export function orderHands(hands: Pt[][]): [Pt[] | null, Pt[] | null] {
  if (hands.length === 0) return [null, null];
  if (hands.length === 1) return [hands[0], null];
  const [a, b] = hands;
  return a[0].x <= b[0].x ? [a, b] : [b, a];
}

export function mirrorFrame(f: Frame): Frame {
  const m = (p: Pt): Pt => ({ x: 1 - p.x, y: p.y, z: p.z });
  return { ...f, pose: f.pose ? f.pose.map(m) : null, hands: f.hands.map((h) => h.map(m)) };
}

function pushHand(out: number[], hand: Pt[] | null, a: Anchors, asp: number) {
  if (!hand) { for (let i = 0; i < 84; i++) out.push(0); return; }
  const pts = hand.map((p) => xy(p, asp));
  for (const p of pts) out.push((p[0] - a.c[0]) / a.s, (p[1] - a.c[1]) / a.s);      // where the hand is
  const w = pts[0];
  const scale = len(sub(pts[9], w)) || 1e-3;
  for (const p of pts) out.push((p[0] - w[0]) / scale, (p[1] - w[1]) / scale);       // handshape
}

export function frameFeatures(f: Frame, a: Anchors): number[] {
  const asp = f.w / f.h;
  const [dom, non] = orderHands(f.hands);
  const out: number[] = [];
  pushHand(out, dom, a, asp);
  pushHand(out, non, a, asp);
  if (dom) {
    const tip = xy(dom[8], asp);
    out.push((tip[0] - a.nose[0]) / a.s, (tip[1] - a.nose[1]) / a.s, (tip[0] - a.mouth[0]) / a.s, (tip[1] - a.mouth[1]) / a.s);
  } else out.push(0, 0, 0, 0);
  out.push(dom ? 1 : 0, non ? 1 : 0);
  return out;
}

export function resample(seq: number[][], n: number): number[][] {
  if (!Number.isInteger(n) || n < 1) throw new RangeError("Sample count must be a positive integer");
  if (seq.length === 0) return [];
  if (n === 1) return [seq[0].slice()];
  if (seq.length === 1) return Array.from({ length: n }, () => seq[0].slice());
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const pos = (i * (seq.length - 1)) / (n - 1);
    const lo = Math.floor(pos), hi = Math.min(lo + 1, seq.length - 1), w = pos - lo;
    out.push(seq[lo].map((v, k) => v * (1 - w) + seq[hi][k] * w));
  }
  return out;
}

/** Frames must already be mirrored for left-handed signers. Returns Float32Array(T * FEAT_PER_FRAME). */
export function clipFeatures(frames: Frame[]): Float32Array {
  let first = frames.findIndex((f) => f.hands.length > 0);
  let last = frames.length - 1 - [...frames].reverse().findIndex((f) => f.hands.length > 0);
  if (first === -1) { first = 0; last = frames.length - 1; }
  let a: Anchors | null = null;
  for (const f of frames) { a = anchors(f, a); if (a) break; }       // seed with first valid pose
  const seq: number[][] = [];
  for (const f of frames.slice(first, last + 1)) {
    a = anchors(f, a);
    seq.push(a ? frameFeatures(f, a) : new Array(FEAT_PER_FRAME).fill(0));
  }
  const out = new Float32Array(T * FEAT_PER_FRAME);
  resample(seq, T).forEach((row, i) => out.set(row, i * FEAT_PER_FRAME));
  return out;
}
