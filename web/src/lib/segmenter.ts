import { anchors, type Anchors } from './features';
import type { Frame } from './types';

export type SegReason = 'still' | 'lowered' | 'lost' | 'timeout';
export type SegEvent = { kind: 'start'; t: number } | { kind: 'end'; t: number; frames: Frame[]; reason: SegReason };

export type SegConfig = {
  onSpeed: number;    // shoulder-widths per second needed to start
  offRatio: number;   // "still" when speed < onSpeed * offRatio
  onFrames: number;   // consecutive fast frames to start
  offFrames: number;  // consecutive still frames to end
  lostFrames: number; // frames without any hand to end
  maxMs: number;      // force an end
  minFrames: number;  // drop shorter segments
  preroll: number;    // frames kept from before the onset
  cooldownMs: number;
  alpha: number;      // EMA smoothing for speed
};
export const DEFAULT_SEG: SegConfig = {
  onSpeed: 0.8, offRatio: 0.5, onFrames: 3, offFrames: 8, lostFrames: 10,
  maxMs: 3000, minFrames: 8, preroll: 8, cooldownMs: 300, alpha: 0.3,
};

const TRACKED = [0, 4, 8, 12]; // wrist, thumb tip, index tip, middle tip
type HandPts = [number, number][];

/** Cuts the landmark stream into one-sign segments. Uses whichever hand moves, so it works for either handedness. */
export class Segmenter {
  state: 'IDLE' | 'ACTIVE' | 'COOLDOWN' = 'IDLE';
  speed = 0;
  anchors: Anchors | null = null;
  private cfg: SegConfig;
  private ring: Frame[] = [];
  private buf: Frame[] = [];
  private prev: { t: number; hands: HandPts[] } | null = null;
  private fast = 0; private slow = 0; private lost = 0;
  private startT = 0; private coolUntil = 0;

  constructor(cfg: SegConfig = DEFAULT_SEG) { this.cfg = cfg; } // explicit field: Vite's template forbids parameter properties

  push(f: Frame): SegEvent | null {
    this.anchors = anchors(f, this.anchors);
    const a = this.anchors;
    this.updateSpeed(f, a);
    const hands = f.hands.length > 0;
    const high = !!a && f.hands.some((h) => h[0].y < a.restY); // any hand above the rest line

    if (this.state === 'COOLDOWN') {
      if (f.t < this.coolUntil) return null;
      this.state = 'IDLE';
    }
    if (this.state === 'IDLE') {
      this.ring.push(f);
      if (this.ring.length > this.cfg.preroll) this.ring.shift();
      this.fast = hands && high && this.speed > this.cfg.onSpeed ? this.fast + 1 : 0;
      if (this.fast < this.cfg.onFrames) return null;
      this.state = 'ACTIVE';
      this.buf = [...this.ring];
      this.startT = f.t; this.slow = 0; this.lost = 0;
      return { kind: 'start', t: f.t };
    }

    // ACTIVE
    this.buf.push(f);
    this.lost = hands ? 0 : this.lost + 1;
    this.slow = this.speed < this.cfg.onSpeed * this.cfg.offRatio ? this.slow + 1 : 0;
    const reason: SegReason | null =
      this.lost >= this.cfg.lostFrames ? 'lost'
      : hands && a && !high ? 'lowered'
      : this.slow >= this.cfg.offFrames ? 'still'
      : f.t - this.startT > this.cfg.maxMs ? 'timeout'
      : null;
    if (!reason) return null;

    const frames = this.buf;
    this.buf = []; this.ring = []; this.fast = 0;
    this.state = 'COOLDOWN';
    this.coolUntil = f.t + this.cfg.cooldownMs;
    if (frames.filter((x) => x.hands.length > 0).length < this.cfg.minFrames) return null;
    return { kind: 'end', t: f.t, frames, reason };
  }

  /** Speed of the fastest hand, in shoulder widths per second. Hands are matched to the previous frame by nearest wrist. */
  private updateSpeed(f: Frame, a: Anchors | null) {
    if (!f.hands.length || !a) { this.prev = null; this.speed *= 1 - this.cfg.alpha; return; }
    const asp = f.w / f.h;
    const cur: HandPts[] = f.hands.map((h) => TRACKED.map((i) => [h[i].x * asp, h[i].y] as [number, number]));
    if (this.prev && this.prev.hands.length && f.t > this.prev.t) {
      const dt = (f.t - this.prev.t) / 1000;
      let fastest = 0;
      for (const c of cur) {
        let nearest = Infinity;
        for (const p of this.prev.hands) {
          const d = c.reduce((sum, q, i) => sum + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0) / c.length;
          nearest = Math.min(nearest, d);
        }
        fastest = Math.max(fastest, nearest);
      }
      this.speed = this.cfg.alpha * (fastest / a.s / dt) + (1 - this.cfg.alpha) * this.speed;
    }
    this.prev = { t: f.t, hands: cur };
  }
}
