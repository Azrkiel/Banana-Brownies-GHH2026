/** Deterministic, synthetic Recorder sessions. Never contains human recordings. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Frame, Pt, Session } from '../src/lib/types';

const [directory] = process.argv.slice(2);
if (!directory) throw new Error('Usage: tsx scripts/fake-sessions.ts <output-directory>');
mkdirSync(directory, { recursive: true });
const point = (x: number, y: number): Pt => ({ x, y, z: 0 });
function frame(i: number, label: number, signer: number, letter: boolean): Frame {
  const pose = Array.from({ length: 17 }, () => point(0.5, 0.3));
  pose[9] = point(0.48, 0.4); pose[10] = point(0.52, 0.4);
  pose[11] = point(0.35, 0.6); pose[12] = point(0.65, 0.6);
  const motion = letter ? 0 : Math.sin(i / 9) * 0.015 * (label + 1);
  const hand = Array.from({ length: 21 }, (_, j) => point(
    0.25 + (j % 5) * (0.01 + label * 0.001) + motion + signer * 0.002,
    0.5 - Math.floor(j / 5) * (0.015 + label * 0.002),
  ));
  return { t: i * 1000 / 30, w: 640, h: 480, pose, hands: !letter && label === 4 ? [] : [hand], brow: null };
}
for (let signer = 0; signer < 3; signer++) {
  const session: Session = { version: 1, signer: `synthetic-${signer}`, leftHanded: false,
    recordedAt: '2026-10-18T00:00:00.000Z', clips: [] };
  ['ME', 'YOU', 'NAME', 'WHAT', '_idle'].forEach((label, l) => {
    for (let clip = 0; clip < 4; clip++) session.clips.push({ kind: 'sign', label,
      frames: Array.from({ length: 30 }, (_, i) => frame(i, l, signer, false)) });
  });
  ['K', 'E', 'V'].forEach((label, l) => {
    for (let clip = 0; clip < 2; clip++) session.clips.push({ kind: 'letter', label,
      frames: Array.from({ length: 40 }, (_, i) => frame(i, l, signer, true)) });
  });
  writeFileSync(join(directory, `synthetic-${signer}.json`), JSON.stringify(session) + '\n');
}
console.log('Wrote 3 synthetic sessions: 60 signs, 18 letter holds.');
