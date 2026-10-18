/** Local-only comparison against sklearn predictions; does not upload recordings. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWordForest, wordProbabilities } from '../src/lib/wordModel';

const root = fileURLToPath(new URL('../../', import.meta.url));
const model = parseWordForest(JSON.parse(readFileSync(resolve(root, 'web/public/trained-words.json'), 'utf8')));
const fixture = JSON.parse(readFileSync(resolve(root, process.argv[2] ?? 'data/legacy/word-parity.json'), 'utf8')) as {
  features: number[][]; probabilities: number[][];
};
if (!fixture.features.length || fixture.features.length !== fixture.probabilities.length) throw new Error('No parity samples.');
let maximumError = 0;
fixture.features.forEach((features, index) => {
  const actual = wordProbabilities(model, features);
  const expected = fixture.probabilities[index];
  if (actual.length !== expected.length) throw new Error('Probability dimension mismatch.');
  actual.forEach((value, label) => {
    const error = Math.abs(value - expected[label]);
    if (!Number.isFinite(error) || error > 1e-12) throw new Error(`Parity failed at sample ${index}, class ${label}: ${error}`);
    maximumError = Math.max(maximumError, error);
  });
});
console.log(`PASS ${fixture.features.length} samples: browser forest matches sklearn probabilities; max error ${maximumError}.`);
