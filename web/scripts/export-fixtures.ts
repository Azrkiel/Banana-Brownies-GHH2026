import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clipFeatures, mirrorFrame, T, FEAT_PER_FRAME } from '../src/lib/features';
import type { Frame, Pt } from '../src/lib/types';

const point = (x: number, y: number): Pt => ({ x, y, z: 0 });
const hand = (x: number, y: number): Pt[] => Array.from({ length: 21 }, (_, i) => point(x + (i % 5) * 0.013, y - Math.floor(i / 5) * 0.017));
function pose(): Pt[] {
  const p = Array.from({ length: 17 }, () => point(0.5, 0.3));
  p[9] = point(0.48, 0.38); p[10] = point(0.52, 0.38);
  p[11] = point(0.35, 0.6); p[12] = point(0.65, 0.6);
  return p;
}
const clip = (two: boolean): Frame[] => Array.from({ length: 13 }, (_, i) => ({
  t: i * 34, w: 640, h: 480, pose: i === 6 ? null : pose(), brow: null,
  hands: i === 0 || i === 12 || i === 5 ? [] : [hand(0.22 + i * 0.009, 0.4 + Math.sin(i) * 0.012), ...(two ? [hand(0.72, 0.5)] : [])],
}));
const one = clip(false), two = clip(true);
const cases = [
  { name: 'one hand', frames: one },
  { name: 'two hands', frames: two },
  { name: 'left-handed two hands', frames: two.map(mirrorFrame) },
  { name: 'left-handed one hand', frames: one.map(mirrorFrame) },
  { name: 'missing pose and hands', frames: one.map(f => ({ ...f, pose: null, hands: [] })) },
  { name: 'portrait aspect', frames: two.map(f => ({ ...f, w: 480, h: 640 })) },
  { name: 'single frame', frames: [one[1]] },
].map(test => ({ ...test, features: Array.from(clipFeatures(test.frames)) }));
const directory = new URL('../../ml/tests/fixtures/', import.meta.url);
mkdirSync(directory, { recursive: true });
writeFileSync(new URL('parity.json', directory), JSON.stringify({ T, featuresPerFrame: FEAT_PER_FRAME, cases }) + '\n');
console.log(`Exported ${cases.length} deterministic clips to ${fileURLToPath(directory)}parity.json`);
