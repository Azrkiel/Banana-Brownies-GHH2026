import { bodyCenterX } from './features';
import type { Frame, Pt } from './types';

export const LETTER_F = 48;
export const NONE = '_none';

/** The spelling hand: the higher hand if two are visible, mirrored when it is on the image-right side of the body
 *  (a left hand), so letters always look right-handed. Used by the recorder data, training and live spell mode. */
export function letterHand(f: Frame): Pt[] | null {
  const hands = f.hands.filter(h => h.length === 21 && h.every(p => [p.x, p.y, p.z].every(Number.isFinite)));
  if (!hands.length) return null;
  const hand = hands.reduce((best, h) => (h[0].y < best[0].y ? h : best));
  return hand[0].x > bodyCenterX(f) ? hand.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })) : hand;
}

/** Handshape of one hand, invariant to position, size and in-plane rotation. */
export function letterFeatures(hand: Pt[], aspect: number): Float32Array {
  if (hand.length !== 21 || !Number.isFinite(aspect) || aspect <= 0 || !hand.every(p => [p.x, p.y, p.z].every(Number.isFinite))) throw new Error('Invalid letter landmarks/aspect');
  const pts = hand.map((p) => [p.x * aspect, p.y] as [number, number]);
  const w = pts[0];
  const vx = pts[9][0] - w[0], vy = pts[9][1] - w[1];
  const scale = Math.hypot(vx, vy) || 1e-3;
  const theta = Math.atan2(vx, -vy); // 0 when wrist -> middle knuckle points straight up
  const c = Math.cos(-theta), s = Math.sin(-theta);
  const out = new Float32Array(LETTER_F);
  let k = 0;
  for (const p of pts) {
    const x = (p[0] - w[0]) / scale, y = (p[1] - w[1]) / scale;
    out[k++] = x * c - y * s;
    out[k++] = x * s + y * c;
  }
  out[k++] = Math.sin(theta); // orientation separates H/U, G/Q, K/P
  out[k++] = Math.cos(theta);
  const ax = pts[5][0] - w[0], ay = pts[5][1] - w[1], bx = pts[17][0] - w[0], by = pts[17][1] - w[1];
  out[k++] = Math.sign(ax * by - ay * bx); // palm vs back toward the camera
  const d = (i: number, j: number) => Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) / scale;
  out[k++] = d(4, 8); out[k++] = d(4, 12); out[k++] = d(8, 12); // thumb-index, thumb-middle, index-middle
  return out;
}

export class LetterKnn {
  private rows: { label: string; x: Float32Array }[] = [];
  private maxDist: number;
  private k: number;
  constructor(maxDist: number, k = 5) {
    if (!(maxDist > 0) || !Number.isFinite(maxDist) || !Number.isInteger(k) || k < 1) throw new Error('Invalid letter kNN configuration');
    this.maxDist = maxDist; this.k = k;
  }
  add(label: string, x: Float32Array) {
    if (!label || x.length !== LETTER_F || !x.every(Number.isFinite)) throw new Error('Invalid letter template');
    this.rows.push({ label, x: x.slice() });
  }

  /** Vote shares of the k nearest templates; {_none: 1} when nothing is close enough. */
  probs(x: Float32Array): Record<string, number> {
    if (x.length !== LETTER_F || !x.every(Number.isFinite)) return { [NONE]: 1 };
    const near = this.rows
      .map((r) => { let s = 0; for (let i = 0; i < x.length; i++) s += (r.x[i] - x[i]) ** 2; return { label: r.label, d: Math.sqrt(s) }; })
      .sort((a, b) => a.d - b.d)
      .slice(0, this.k);
    if (!near.length || near[0].d > this.maxDist) return { [NONE]: 1 };
    const out: Record<string, number> = {};
    for (const n of near) out[n.label] = (out[n.label] ?? 0) + 1 / near.length;
    return out;
  }

  static async load(base = '/models'): Promise<LetterKnn> {
    const response = await fetch(`${base}/letters.json`);
    if (!response.ok) throw new Error('Unable to load letter metadata');
    const meta = (await response.json()) as { labels: string[]; F: number; maxDist: number };
    if (meta.F !== LETTER_F) throw new Error('letter templates were built with different features');
    if (!Array.isArray(meta.labels) || !meta.labels.length || !meta.labels.every(l => typeof l === 'string' && l.length > 0)) throw new Error('Invalid letter labels');
    const binary = await fetch(`${base}/letters.f32`);
    if (!binary.ok) throw new Error('Unable to load letter templates');
    const bytes = await binary.arrayBuffer();
    if (bytes.byteLength !== meta.labels.length * LETTER_F * 4) throw new Error('Truncated letter templates');
    const all = new Float32Array(bytes);
    const knn = new LetterKnn(meta.maxDist);
    meta.labels.forEach((label, i) => knn.add(label, all.subarray(i * LETTER_F, (i + 1) * LETTER_F)));
    return knn;
  }
}

export type DecoderCfg = { alpha: number; accept: number; frames: number; stillMax: number; releaseSpeed: number };
export const DEFAULT_DECODER: DecoderCfg = { alpha: 0.4, accept: 0.8, frames: 8, stillMax: 0.6, releaseSpeed: 1.2 };

/** Smooths per-frame letter votes; emits a letter after ~8 steady frames; repeats only after a release (bounce or change). */
export class LetterDecoder {
  private ema: Record<string, number> = {};
  private streak = 0;
  private cand: string | null = null;
  private last: string | null = null;
  private released = true;
  private cfg: DecoderCfg;
  constructor(cfg: DecoderCfg = DEFAULT_DECODER) { this.cfg = cfg; }

  push(probs: Record<string, number>, speed: number): string | null {
    for (const k of new Set([...Object.keys(this.ema), ...Object.keys(probs)])) {
      this.ema[k] = this.cfg.alpha * (probs[k] ?? 0) + (1 - this.cfg.alpha) * (this.ema[k] ?? 0);
    }
    let top = NONE, best = 0;
    for (const [k, v] of Object.entries(this.ema)) if (v > best) { best = v; top = k; }
    if (speed > this.cfg.releaseSpeed || top !== this.last || (this.ema[this.last] ?? 0) < 0.5) this.released = true;
    const ok = top !== NONE && best >= this.cfg.accept && speed < this.cfg.stillMax;
    this.streak = ok && top === this.cand ? this.streak + 1 : ok ? 1 : 0;
    this.cand = ok ? top : null;
    if (this.streak >= this.cfg.frames && this.released) {
      this.last = top; this.released = false; this.streak = 0;
      return top;
    }
    return null;
  }

  reset() { this.ema = {}; this.streak = 0; this.cand = null; this.last = null; this.released = true; }
}
