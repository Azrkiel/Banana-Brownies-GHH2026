import type { Frame } from './types';
import { anchors, frameFeatures, type Anchors } from './features';

export type SegmentState = 'REST' | 'ONSET' | 'STROKE_HOLD' | 'TRANSITION';
export type SegmentDecision = { state: SegmentState; energy: number; trigger: 'isolated' | 'fingerspelling' | null; frames: number[][] };
export const SEGMENT_DEFAULTS = { idleEnergy: 0.0003, transitionEnergy: 0.04, restFrames: 12, minFrames: 8, windowFrames: 32, settleFrames: 3 };
const tips = [4, 8, 12, 16, 20];
const valid = (x: ArrayLike<number>) => x.length === 174 && Array.from(x).every(Number.isFinite);

/** XY174 uses global XY hands at 0/84 and presence at 172/173; no facial points. */
function signing(x: number[]) { return [0, 84].some((s, i) => x[172 + i] > 0.5 && x[s + 1] <= 0.65); }
function kinetic(a: number[], b: number[]) {
  let e = 0;
  for (const [i, s] of [0, 84].entries()) if (a[172 + i] > .5 && b[172 + i] > .5) {
    for (const p of [0, ...tips]) e += (a[s + 2*p] - b[s + 2*p]) ** 2 + (a[s + 2*p+1] - b[s + 2*p+1]) ** 2;
  }
  return e;
}
function variance(points: number[][]) {
  const mean = points[0].map((_, j) => points.reduce((s, p) => s + p[j], 0) / points.length);
  return points.reduce((s, p) => s + p.reduce((v, x, j) => v + (x - mean[j]) ** 2, 0), 0) / points.length;
}
export function isFingerspellingCandidate(frames: number[][]): boolean {
  const rows = frames.slice(-20);
  if (rows.length < 20 || rows.some(x => !valid(x) || x[172] <= .5 || x[173] > .5 || x[1] > .65 || x[1] < -1.5 || Math.abs(x[0]) > 1)) return false;
  const wrists = rows.map(x => x.slice(0, 2));
  if (wrists.some(p => Math.hypot(p[0]-wrists[0][0], p[1]-wrists[0][1]) >= .08)) return false;
  // Local finger coordinates remove wrist translation from articulation.
  return variance(rows.map(x => tips.flatMap(p => [x[42+2*p], x[43+2*p]]))) / Math.max(variance(wrists), 1e-6) > 4.5;
}

export class KinematicSegmenter {
  state: SegmentState = 'REST';
  private history: number[][] = [];
  private stroke: number[][] = [];
  private previous: number[] | null = null;
  private deltas: number[][] = [];
  private idle = 0;
  private active = 0;
  private settled = 0;
  private emitted = false;
  private fsTick = 0;
  private a: Anchors | null = null;
  readonly options: typeof SEGMENT_DEFAULTS;
  constructor(options: Partial<typeof SEGMENT_DEFAULTS> = {}) {
    this.options = { ...SEGMENT_DEFAULTS, ...options };
    if (Object.values(this.options).some(x => !Number.isFinite(x) || x <= 0)) throw new RangeError('Segment thresholds must be positive');
  }
  reset() {
    this.state = 'REST'; this.history = []; this.stroke = []; this.previous = null; this.deltas = [];
    this.idle = this.active = this.settled = this.fsTick = 0; this.emitted = false; this.a = null;
  }
  pushFrame(frame: Frame, fingerspellMode = false): SegmentDecision {
    this.a = anchors(frame, this.a);
    return this.push(this.a ? frameFeatures(frame, this.a) : new Array(174).fill(0), fingerspellMode);
  }
  push(input: ArrayLike<number>, fingerspellMode = false, automaticSpelling = true): SegmentDecision {
    if (!valid(input)) { this.reset(); return { state: 'REST', energy: 0, trigger: null, frames: [] }; }
    const x = Array.from(input), prev = this.previous;
    const energy = prev ? kinetic(x, prev) : 0;
    this.previous = x;
    const result = (trigger: SegmentDecision['trigger'] = null): SegmentDecision => ({ state: this.state, energy, trigger, frames: this.history.map(r => r.slice()) });
    // Tracking loss must not bridge either a motion segment or a spelling window.
    if (!signing(x)) { this.reset(); return result(); }
    this.history.push(x); if (this.history.length > 128) this.history.shift();
    if (prev) this.deltas.push([0, 84].flatMap((s,i) => prev[172+i] > .5 && x[172+i] > .5 ? [x[s]-prev[s],x[s+1]-prev[s+1]] : [0,0]));
    else this.deltas = [];
    if (this.deltas.length > 3) this.deltas.shift();
    const monotonic = this.deltas.length === 3 && [0,2].some(s => this.deltas.slice(1).every((d,i) => {
      const p=this.deltas[i]; return d[s]*p[s]+d[s+1]*p[s+1] > .8*Math.hypot(d[s],d[s+1])*Math.hypot(p[s],p[s+1]);
    }));
    const fs = fingerspellMode || (automaticSpelling && isFingerspellingCandidate(this.history));
    if (fs) {
      this.state = 'STROKE_HOLD'; this.idle = 0; this.fsTick++;
      return result(this.history.length >= 64 && (this.fsTick === 1 || this.fsTick % 16 === 0) ? 'fingerspelling' : null);
    }
    this.fsTick = 0;
    if (energy < this.options.idleEnergy) this.idle++; else this.idle = 0;
    if (this.state === 'REST') {
      if (this.emitted && energy < this.options.idleEnergy) return result();
      this.state = 'ONSET'; this.active = this.settled = 0;
    }
    this.active++;
    if (energy > this.options.transitionEnergy && monotonic) {
      this.state = 'TRANSITION'; this.stroke = []; this.settled = 0; this.emitted = false; this.active = 0;
      return result();
    }
    if (energy >= this.options.idleEnergy) {
      if (this.emitted) { this.stroke=[]; this.active=1; }
      this.settled = 0; this.emitted = false; this.state = 'ONSET';
    }
    else this.settled++;
    this.stroke.push(x); if (this.stroke.length > this.options.windowFrames) this.stroke.shift();
    if (!this.emitted && ((this.active >= this.options.minFrames && this.settled >= this.options.settleFrames) || this.active >= this.options.windowFrames)) {
      this.state = 'STROKE_HOLD'; this.emitted = true; this.active = 0;
      const output = result('isolated'); output.frames = this.stroke.map(r=>r.slice()); this.stroke=[]; return output;
    }
    if (this.idle >= this.options.restFrames) { this.state = 'REST'; this.stroke=[]; this.active = 0; }
    return result();
  }
}


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
