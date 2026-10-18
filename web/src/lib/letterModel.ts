import { LETTER_F, LetterDecoder, NONE, letterFeatures, type DecoderCfg } from './letters';
import type { Pt } from './types';

/**
 * Live fingerspelling for the call: one steady handshape becomes one letter.
 *
 * - Taught letters: the signer's own examples (saved on this device), compared with the rotation-invariant
 *   `letterFeatures`. On 415 public photos of other people, 5 examples per letter scored 96% for K/E/V and 75%
 *   across the alphabet; your own hand does better.
 * - Built-in fallback: asl-alphabet-classifier (MIT, see public/letters/README.md), 24 static letters, ~47% on
 *   people it was not trained on. Used only for letters you have not taught (or when "only my letters" is off).
 */

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const STORE_KEY = 'signline.taughtLetters.v1';
/** Letter-feature distance limits for a taught match, calibrated on 415 photos (same letter: median 0.53).
 *  Mixed with the built-in model a match must be close (1.0: 80% of same-letter, 50% of other-letter neighbours).
 *  With "only my letters" the closest taught letter wins unless the hand is unlike all of them (4.0): in a spelling
 *  simulation with letters taught from other people, 2.0 dropped 19% of words' letters, 4.0 spelled 77% of 3-5
 *  letter words exactly with no extra letters (a steady hold is still required). */
export const TAUGHT_MAX_DISTANCE = 1.0;
export const ONLY_TAUGHT_MAX_DISTANCE = 4.0;
/** How sharply the closest taught letter wins over the next closest (letter-feature distance units). */
export const TAUGHT_TEMPERATURE = 0.15;
/** Steady frames before a letter is accepted, and the smoothed score it needs. */
export const LETTER_DECODER: DecoderCfg = { alpha: 0.35, accept: 0.55, frames: 8, stillMax: 0.9, releaseSpeed: 1.6 };

export type LetterHand = { points: Pt[]; mirrored: boolean };
export type LetterGuess = { letter: string; score: number; source: 'taught' | 'built-in' } | null;

/** The spelling hand: the higher one if two are visible, mirrored when it is image-right of the shoulders so a
 *  signer's examples and live letters always share one orientation. Points are in the call's (mirrored) image. */
export function spellingHand(hands: Pt[][], pose: Pt[] | null): LetterHand | null {
  const valid = hands.filter(h => h.length === 21 && h.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  if (!valid.length) return null;
  const hand = valid.reduce((best, h) => (h[0].y < best[0].y ? h : best));
  const center = pose && pose.length >= 13 ? (pose[11].x + pose[12].x) / 2 : 0.5;
  const mirrored = hand[0].x > center;
  return { points: mirrored ? hand.map(p => ({ x: 1 - p.x, y: p.y, z: p.z ?? 0 })) : hand.map(p => ({ ...p, z: p.z ?? 0 })), mirrored };
}

/** Hand-size-normalized landmark speed in hand lengths per second (0 when still). */
export function handSpeed(previous: Pt[] | null, current: Pt[], seconds: number): number {
  if (!previous || previous.length !== 21 || !(seconds > 0)) return 0;
  const scale = Math.hypot(current[9].x - current[0].x, current[9].y - current[0].y) || 1e-3;
  let sum = 0;
  for (let i = 0; i < 21; i++) sum += Math.hypot(current[i].x - previous[i].x, current[i].y - previous[i].y);
  return sum / 21 / scale / seconds;
}

export type BuiltinLetters = (hand: Pt[]) => Record<string, number>;

/** Loads the MIT TF.js weights and runs Dense(128, relu) -> Dense(64, relu) -> Dense(24, softmax) in plain JS. */
export async function loadBuiltinLetters(base = '/letters', signal?: AbortSignal): Promise<BuiltinLetters> {
  const get = async (path: string) => { const r = await fetch(`${base}/${path}`, { signal }); if (!r.ok) throw new Error(`Could not load ${path}`); return r; };
  const manifest = await (await get('model.json')).json() as { weightsManifest: { paths: string[]; weights: { shape: number[] }[] }[] };
  const labels = await (await get('labels.json')).json() as string[];
  const group = manifest.weightsManifest[0];
  const buffer = new Float32Array(await (await get(group.paths[0])).arrayBuffer());
  let offset = 0;
  const tensors = group.weights.map(w => { const n = w.shape.reduce((a, b) => a * b, 1); const t = { shape: w.shape, data: buffer.subarray(offset, offset + n) }; offset += n; return t; });
  if (tensors.length !== 6 || offset !== buffer.length || tensors[4].shape[1] !== labels.length) throw new Error('Unexpected letter model layout');
  const dense = (input: Float32Array, k: number, relu: boolean) => {
    const { shape: [inDim, outDim], data: kernel } = tensors[k], bias = tensors[k + 1].data, out = new Float32Array(outDim);
    for (let j = 0; j < outDim; j++) {
      let s = bias[j];
      for (let i = 0; i < inDim; i++) s += input[i] * kernel[i * outDim + j];
      out[j] = relu ? Math.max(0, s) : s;
    }
    return out;
  };
  const run = (x: Float32Array) => {
    const z = dense(dense(dense(x, 0, true), 2, true), 4, false);
    const max = Math.max(...z), e = Array.from(z, v => Math.exp(v - max)), sum = e.reduce((a, b) => a + b, 0);
    return e.map(v => v / sum);
  };
  // The model was trained on raw image coordinates of one handedness; try both and keep the more confident reading.
  return hand => {
    const raw = Float32Array.from(hand.flatMap(p => [p.x, p.y, p.z ?? 0]));
    const flipped = Float32Array.from(hand.flatMap(p => [1 - p.x, p.y, p.z ?? 0]));
    const a = run(raw), b = run(flipped);
    const best = Math.max(...a) >= Math.max(...b) ? a : b;
    return Object.fromEntries(labels.map((label, i) => [label, best[i]]));
  };
}

export type TaughtLetters = Record<string, number[][]>;
export function loadTaughtLetters(): TaughtLetters {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as TaughtLetters;
    return Object.fromEntries(Object.entries(value).filter(([letter, rows]) => LETTERS.includes(letter) && Array.isArray(rows)
      && rows.every(row => Array.isArray(row) && row.length === LETTER_F && row.every(Number.isFinite))));
  } catch { return {}; }
}
export function saveTaughtLetters(taught: TaughtLetters) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(taught)); } catch { /* storage may be blocked; letters stay for this call */ }
}
export const shapeOf = (hand: LetterHand, aspect: number) => Array.from(letterFeatures(hand.points, aspect));

/** Shares from each taught letter's closest example, weighted by distance so a clearly closer letter dominates
 *  even with one example each; {_none: 1} if no example is within the limit. */
export function taughtProbs(taught: TaughtLetters, shape: number[], maxDistance = TAUGHT_MAX_DISTANCE, temperature = TAUGHT_TEMPERATURE): Record<string, number> {
  const best = Object.entries(taught).filter(([, rows]) => rows.length)
    .map(([letter, rows]) => ({ letter, d: Math.min(...rows.map(row => Math.hypot(...row.map((v, i) => v - shape[i])))) }));
  const nearest = Math.min(...best.map(b => b.d));
  if (!best.length || nearest > maxDistance) return { [NONE]: 1 };
  const weights = best.map(b => ({ letter: b.letter, w: Math.exp(-(b.d - nearest) / temperature) }));
  const total = weights.reduce((sum, b) => sum + b.w, 0);
  return Object.fromEntries(weights.map(b => [b.letter, b.w / total]));
}

/**
 * Per-frame spelling: picks the source, smooths it, and emits a letter after a steady hold.
 * `onlyTaught` restricts readings to taught letters (most reliable once two or more are taught).
 */
export function createSpeller(builtin: BuiltinLetters, cfg: DecoderCfg = LETTER_DECODER, temperature = TAUGHT_TEMPERATURE) {
  const decoder = new LetterDecoder(cfg);
  let previous: Pt[] | null = null, lastTime = 0;
  return {
    push(hand: LetterHand | null, aspect: number, now: number, taught: TaughtLetters, onlyTaught: boolean): { guess: LetterGuess; letter: string | null; shape: number[] | null; speed: number } {
      if (!hand) { previous = null; decoder.push({ [NONE]: 1 }, 0); return { guess: null, letter: null, shape: null, speed: 0 }; }
      const speed = handSpeed(previous, hand.points, (now - lastTime) / 1000);
      previous = hand.points; lastTime = now;
      const shape = shapeOf(hand, aspect);
      const taughtCount = Object.values(taught).filter(rows => rows.length).length;
      const closed = onlyTaught && taughtCount >= 2;
      let probs = taughtCount ? taughtProbs(taught, shape, closed ? ONLY_TAUGHT_MAX_DISTANCE : TAUGHT_MAX_DISTANCE, temperature) : { [NONE]: 1 };
      let source: 'taught' | 'built-in' = 'taught';
      if (probs[NONE] === 1 && !closed) { probs = builtin(hand.points); source = 'built-in'; }
      const [letter, score] = Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
      const emitted = decoder.push(probs, speed);
      return { guess: letter === NONE ? null : { letter, score, source }, letter: emitted && emitted !== NONE ? emitted : null, shape, speed };
    },
    reset() { decoder.reset(); previous = null; },
  };
}
