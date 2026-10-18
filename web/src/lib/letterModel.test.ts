import { describe, expect, it } from 'vitest';
import manifest from '../../public/letters/model.json';
import labels from '../../public/letters/labels.json';
import { createSpeller, handSpeed, spellingHand, taughtProbs, shapeOf, loadBuiltinLetters, type TaughtLetters } from './letterModel';
import { signLabel } from './signLabels';
import type { Pt } from './types';

// A synthetic right hand: fingers fan out from the wrist; `curl` bends the index finger (a different "letter").
const hand = (curl = 0, dx = 0): Pt[] => Array.from({ length: 21 }, (_, i) => {
  const finger = Math.floor((i - 1) / 4), joint = (i - 1) % 4;
  if (i === 0) return { x: 0.5 + dx, y: 0.8, z: 0 };
  const angle = -0.6 + finger * 0.3, bend = finger === 1 ? curl * joint : 0;
  return { x: 0.5 + dx + Math.sin(angle + bend) * 0.05 * (joint + 1), y: 0.8 - Math.cos(angle + bend) * 0.05 * (joint + 1), z: 0 };
});
const noBuiltin = () => ({ A: 1 });

describe('fingerspelling', () => {
  it('emits a taught letter only after a steady hold, once per hold', () => {
    const taught: TaughtLetters = { K: [shapeOf({ points: hand(0), mirrored: false }, 4 / 3)], E: [shapeOf({ points: hand(1.2), mirrored: false }, 4 / 3)] };
    const speller = createSpeller(noBuiltin);
    const out: string[] = [];
    for (let f = 0; f < 40; f++) { const r = speller.push({ points: hand(0), mirrored: false }, 4 / 3, f * 33, taught, true); if (r.letter) out.push(r.letter); }
    expect(out).toEqual(['K']);
  });
  it('moves to the next letter when the handshape changes', () => {
    const taught: TaughtLetters = { K: [shapeOf({ points: hand(0), mirrored: false }, 4 / 3)], E: [shapeOf({ points: hand(1.2), mirrored: false }, 4 / 3)] };
    const speller = createSpeller(noBuiltin); const out: string[] = []; let t = 0;
    for (const curl of [0, 1.2]) for (let f = 0; f < 30; f++) { const r = speller.push({ points: hand(curl), mirrored: false }, 4 / 3, (t += 33), taught, true); if (r.letter) out.push(r.letter); }
    expect(out).toEqual(['K', 'E']);
  });
  it('does not emit while the hand is moving', () => {
    const speller = createSpeller(() => ({ V: 1 })); let emitted = 0;
    for (let f = 0; f < 40; f++) if (speller.push({ points: hand(0, (f % 2) * 0.08), mirrored: false }, 4 / 3, f * 33, {}, false).letter) emitted++;
    expect(emitted).toBe(0);
  });
  it('rejects taught matches that are too far away, and measures speed in hand lengths per second', () => {
    const taught: TaughtLetters = { K: [shapeOf({ points: hand(0), mirrored: false }, 4 / 3)] };
    expect(taughtProbs(taught, shapeOf({ points: hand(2.5), mirrored: false }, 4 / 3), 0.1)).toEqual({ _none: 1 });
    expect(handSpeed(hand(0), hand(0), 0.033)).toBe(0);
    expect(handSpeed(hand(0), hand(0, 0.05), 0.5)).toBeGreaterThan(0.5);
  });
  it('picks the higher hand and mirrors one that is image-right of the shoulders', () => {
    const low = hand(0, -0.2).map(p => ({ ...p, y: p.y + 0.1 }));
    const right = hand(0, 0.3);
    const pick = spellingHand([low, right], null)!;
    expect(pick.mirrored).toBe(true);
    expect(pick.points[0].x).toBeCloseTo(1 - right[0].x);
    expect(spellingHand([], null)).toBeNull();
  });
  it('runs the shipped built-in letter layout in plain JS', async () => {
    // Real weights were checked against Keras separately; here a stand-in buffer of the shipped shape tests the runner.
    const total = manifest.weightsManifest[0].weights.reduce((sum, w) => sum + w.shape.reduce((a, b) => a * b, 1), 0);
    const files: Record<string, ArrayBuffer | string> = {
      'model.json': JSON.stringify(manifest), 'labels.json': JSON.stringify(labels),
      'group1-shard1of1.bin': new Float32Array(total).map((_, i) => ((i * 7919) % 13) / 100 - 0.06).buffer,
    };
    const fetcher = (url: string) => { const body = files[url.split('/').pop()!]; return Promise.resolve(new Response(body)); };
    const original = globalThis.fetch; globalThis.fetch = fetcher as typeof fetch;
    try {
      const builtin = await loadBuiltinLetters('/letters');
      const probs = builtin(hand(0));
      expect(Object.keys(probs)).toHaveLength(24);
      expect(Object.values(probs).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    } finally { globalThis.fetch = original; }
  });
  it('reads a spelled word as a name', () => {
    expect(signLabel('fs-KEV')).toBe('Kev');
    expect(signLabel('HELLO')).toBe('Hello');
  });
});
