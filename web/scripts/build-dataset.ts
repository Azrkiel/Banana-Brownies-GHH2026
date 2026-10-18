/* Usage (from web/): npm run dataset -- ../data/raw ../data/processed
   Reads OUR recorder sessions; writes training tensors (same layout as ml/gislr_to_features.py)
   plus starter kNN and letter templates for the browser. */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { clipFeatures, FEAT_PER_FRAME, T } from '../src/lib/features';
import { LETTER_F, letterFeatures, letterHand } from '../src/lib/letters';
import { IDLE } from '../src/vocab';
import type { Session } from '../src/lib/types';

const [rawDir = '../data/raw', outDir = '../data/processed', pubDir = 'public/models'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
mkdirSync(pubDir, { recursive: true });
const f32 = (a: Float32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

const sessions: Session[] = readdirSync(rawDir)
  .filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(readFileSync(join(rawDir, f), 'utf8')) as Session);
for (const s of sessions) {
  if (s.version !== 1 || !s.signer?.trim() || !Array.isArray(s.clips)) throw new Error('Invalid Recorder session');
  for (const c of s.clips) {
    if (!['sign', 'letter'].includes(c.kind) || !c.label?.trim() || !c.frames?.length) throw new Error('Invalid Recorder clip');
    for (const f of c.frames) {
      if (!(f.w > 0 && f.h > 0) || !Number.isFinite(f.w / f.h) || f.hands.length > 2) throw new Error('Invalid frame dimensions/hands');
      for (const h of f.hands) if (h.length !== 21) throw new Error('Expected 21 hand landmarks');
      if (f.pose && f.pose.length < 13) throw new Error('Expected upper-body pose');
      for (const p of [...(f.pose ?? []), ...f.hands.flat()]) if (![p.x, p.y, p.z].every(Number.isFinite)) throw new Error('Non-finite landmarks');
    }
  }
}
const signClips = sessions.flatMap((s) => s.clips.filter((c) => c.kind === 'sign').map((c) => ({ ...c, signer: s.signer })));
const letterClips = sessions.flatMap((s) => s.clips.filter((c) => c.kind === 'letter').map((c) => ({ ...c, signer: s.signer })));

// ---- signs: one T x F matrix per clip (features computed by the same code the browser runs)
const labels = [...new Set(signClips.map((c) => c.label))].sort();
if (!labels.includes(IDLE)) throw new Error('No _idle clips — record _idle before training');
const N = T * FEAT_PER_FRAME;
const X = new Float32Array(signClips.length * N);
signClips.forEach((c, i) => X.set(clipFeatures(c.frames), i * N));
if (!X.every(Number.isFinite)) throw new Error('Non-finite sign tensors');
writeFileSync(join(outDir, 'X.f32'), f32(X));
writeFileSync(join(outDir, 'meta.json'), JSON.stringify({
  n: signClips.length, T, F: FEAT_PER_FRAME, labels,
  y: signClips.map((c) => labels.indexOf(c.label)), signers: signClips.map((c) => `own:${c.signer}`),
  splits: signClips.map((c) => { const bucket = parseInt(createHash('sha256').update(`own:${c.signer}`).digest('hex').slice(0, 8), 16) % 10; return bucket === 0 ? 'test' : bucket === 1 ? 'val' : 'train'; }),
  source: 'own', license: 'MIT / Project Owned (consented)', license_tier: 'commercial',
}));

// ---- kNN templates for the browser: up to 12 per label, spread over the recording order
const byLabel = new Map<string, number[]>();
signClips.forEach((c, i) => byLabel.set(c.label, [...(byLabel.get(c.label) ?? []), i]));
const pick = [...byLabel.values()].flatMap((idx) => {
  const step = Math.max(1, Math.floor(idx.length / 12));
  return idx.filter((_, j) => j % step === 0).slice(0, 12);
});
const K = new Float32Array(pick.length * N);
pick.forEach((i, j) => K.set(X.subarray(i * N, (i + 1) * N), j * N));
writeFileSync(join(pubDir, 'knn.f32'), f32(K));
writeFileSync(join(pubDir, 'knn.json'), JSON.stringify({ labels: pick.map((i) => signClips[i].label), T, F: FEAT_PER_FRAME }));

// ---- letters: every 3rd frame of each 2 s hold
const L: { label: string; x: Float32Array }[] = [];
for (const c of letterClips) c.frames.forEach((f, j) => {
  const hand = letterHand(f);
  if (hand && j % 3 === 0) L.push({ label: c.label, x: letterFeatures(hand, f.w / f.h) });
});
const dist = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };
const nearestSame = L.map((r, i) => Math.min(...L.filter((o, j) => j !== i && o.label === r.label).map((o) => dist(o.x, r.x)))).filter(Number.isFinite).sort((a, b) => a - b);
// floor of 0.5: very steady holds give near-zero distances, which would reject every live letter
const maxDist = Math.max(0.5, nearestSame.length ? nearestSame[Math.floor(0.95 * (nearestSame.length - 1))] * 1.5 : 1.0);
const LX = new Float32Array(L.length * LETTER_F);
L.forEach((r, i) => LX.set(r.x, i * LETTER_F));
writeFileSync(join(pubDir, 'letters.f32'), f32(LX));
writeFileSync(join(pubDir, 'letters.json'), JSON.stringify({ labels: L.map((r) => r.label), F: LETTER_F, maxDist }));

const count = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {}));
console.log(`signs: ${signClips.length} clips, ${labels.length} labels`, count(signClips.map((c) => c.label)));
console.log('signers:', count(signClips.map((c) => c.signer)));
console.log(`letters: ${L.length} templates, maxDist ${maxDist.toFixed(3)}`, count(L.map((r) => r.label)));
