import { describe, expect, it } from 'vitest';
import { DEFAULT_SEG, Segmenter, type SegEvent } from './segmenter';
import type { Frame, Pt } from './types';

const P = (x: number, y: number): Pt => ({ x, y, z: 0 });
const pose = (): Pt[] => {
  const p = Array.from({ length: 17 }, () => P(0.5, 0.3));
  p[11] = P(0.4, 0.6); p[12] = P(0.6, 0.6);
  return p;
};
const hand = (x: number, y: number): Pt[] => Array.from({ length: 21 }, (_, i) => P(x + 0.005 * (i % 5), y - 0.005 * Math.floor(i / 5)));
let t = 0;
const fr = (h: Pt[] | null): Frame => ({ t: (t += 33), w: 640, h: 480, pose: pose(), hands: h ? [h] : [], brow: null });

function run(seg: Segmenter, frames: Frame[]): SegEvent[] {
  return frames.map((f) => seg.push(f)).filter((e): e is SegEvent => e !== null);
}
const endReason = (ev: SegEvent[]) => { const e = ev.at(-1); return e?.kind === 'end' ? e.reason : null; };
const moving = (n: number, y = 0.4) => Array.from({ length: n }, (_, i) => fr(hand(0.45 + (i % 2 ? 0.03 : -0.03), y)));
const still = (n: number, y = 0.4) => Array.from({ length: n }, () => fr(hand(0.45, y)));

describe('Segmenter', () => {
  it('never starts without hands', () => {
    expect(run(new Segmenter(), Array.from({ length: 60 }, () => fr(null)))).toEqual([]);
  });
  it('starts on fast motion and ends when the hand holds still', () => {
    const ev = run(new Segmenter(), [...still(5), ...moving(15), ...still(30)]);
    expect(ev.map((e) => e.kind)).toEqual(['start', 'end']);
    const end = ev[1];
    expect(end.kind === 'end' && end.reason).toBe('still');
    expect(end.kind === 'end' && end.frames.length).toBeGreaterThanOrEqual(15);
  });
  it('ends when the hand drops below the rest line', () => {
    const ev = run(new Segmenter(), [...moving(15), ...still(3, 0.95)]);
    expect(endReason(ev)).toBe('lowered');
  });
  it('ends when hands disappear', () => {
    const ev = run(new Segmenter(), [...moving(15), ...Array.from({ length: 12 }, () => fr(null))]);
    expect(endReason(ev)).toBe('lost');
  });
  it('works when the moving hand is on the image-right side (left-handed signer)', () => {
    const lefty = (n: number) => Array.from({ length: n }, (_, i) => fr(hand(0.62 + (i % 2 ? 0.03 : -0.03), 0.4)));
    const ev = run(new Segmenter(), [...lefty(15), ...Array.from({ length: 30 }, () => fr(hand(0.62, 0.4)))]);
    expect(ev.map((e) => e.kind)).toEqual(['start', 'end']);
  });
  it('can start again after cooldown', () => {
    const ev = run(new Segmenter(), [...moving(15), ...still(30), ...moving(15), ...still(30)]);
    expect(ev.filter((e) => e.kind === 'end')).toHaveLength(2);
  });
  it('detects a moving image-right hand while the image-left hand stays still', () => {
    const frames = [...moving(15), ...still(30)].map((f) => ({
      ...f,
      hands: [hand(0.25, 0.4), f.hands[0].map((p) => ({ ...p, x: p.x + 0.2 }))],
    }));
    const ev = run(new Segmenter(), frames);
    expect(ev.map((e) => e.kind)).toEqual(['start', 'end']);
    expect(endReason(ev)).toBe('still');
  });
  it('does not mistake reordered stationary hands for motion', () => {
    const left = hand(0.25, 0.4), right = hand(0.7, 0.4);
    const frames = Array.from({ length: 60 }, (_, i) => ({
      ...fr(null), hands: i % 2 ? [right, left] : [left, right],
    }));
    const seg = new Segmenter();
    expect(run(seg, frames)).toEqual([]);
    expect(seg.speed).toBe(0);
  });
  it('forces an end when continuous motion exceeds the time limit', () => {
    const seg = new Segmenter({ ...DEFAULT_SEG, maxMs: 400 });
    const ev = run(seg, moving(20));
    expect(ev.map((e) => e.kind)).toEqual(['start', 'end']);
    expect(endReason(ev)).toBe('timeout');
    expect(seg.state).toBe('COOLDOWN');
  });
  it('discards clips with fewer than the required visible-hand frames', () => {
    const seg = new Segmenter({ ...DEFAULT_SEG, minFrames: 100 });
    const ev = run(seg, [...moving(15), ...still(30)]);
    expect(ev.map((e) => e.kind)).toEqual(['start']);
    expect(seg.state).toBe('IDLE'); // the trailing still frames also exhaust cooldown
  });
  it('does not start before a valid pose establishes shoulder anchors', () => {
    const seg = new Segmenter();
    expect(run(seg, moving(20).map((f) => ({ ...f, pose: null })))).toEqual([]);
    expect(seg.anchors).toBeNull();
    expect(run(seg, [...moving(15), ...still(30)]).map((e) => e.kind))
      .toEqual(['start', 'end']);
  });
});
