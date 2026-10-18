import { WORD_FEATURES, WORD_FRAMES, type WordPrediction } from './wordModel';

export const PERSONAL_FEATURE_VERSION = 'word-v1';
export const MAX_PERSONAL_SAMPLES = 500;
export const MIN_SIGN_EXAMPLES = 3;
export type FeatureVersion = 'word-v1' | 'holistic-v2' | 'holistic_v2_emb192';
export type WordSample = { features: number[]; framesWithHand: number; featureVersion?: FeatureVersion; modelSha256?: string };
export const sampleVersion = (sample: WordSample): FeatureVersion => sample.featureVersion ?? 'word-v1';
export type PersonalSample = WordSample & { id: string; label: string; createdAt: string };
export type PersonalModel = { labels: string[]; examples: { label: string; features: number[]; featureVersion?: FeatureVersion; modelSha256?: string }[] };

export function signLabel(value: string): string {
  const label = value.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!/^[A-Z][A-Z0-9 '-]{0,39}$/.test(label)) throw new Error('Use 1–40 letters, numbers, spaces, apostrophes or hyphens, starting with a letter.');
  return label;
}

export function validateWordSample(sample: WordSample): void {
  const version = sampleVersion(sample);
  const length = version === 'word-v1' ? WORD_FRAMES * WORD_FEATURES : version === 'holistic-v2' ? 5568 : version === 'holistic_v2_emb192' ? 192 : 0;
  const max = version === 'word-v1' ? 2 : version === 'holistic-v2' ? 20 : 1.001;
  if (!length || !Array.isArray(sample.features) || sample.features.length !== length ||
      !sample.features.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= max) ||
      !Number.isInteger(sample.framesWithHand) || sample.framesWithHand < 24 || sample.framesWithHand > (version === 'word-v1' ? 30 : 32)) {
    throw new Error('Keep your hands in view for the whole capture, then try again.');
  }
  if (version === 'holistic_v2_emb192' && (!/^[a-f0-9]{64}$/.test(sample.modelSha256 ?? '') ||
      Math.abs(Math.hypot(...sample.features) - 1) > .02)) throw new Error('Invalid model embedding.');

  if (sample.features.every(x => Math.abs(x) < 0.00001)) throw new Error('No usable hand landmarks. Try again.');
}

function normalized(sample: WordSample): number[] {
  validateWordSample(sample);
  // Remove hand size/distance to camera while retaining pose and motion over 30 frames.
  const scale = Math.sqrt(sample.features.reduce((sum, x) => sum + x * x, 0) / (sampleVersion(sample) === 'holistic_v2_emb192' ? 1 : sample.features.length));
  return sample.features.map(x => x / scale);
}

/** minSigns 1 is for use beside the shared forest, which already supplies other words. */
export function trainPersonalModel(samples: readonly PersonalSample[], minSigns = 2): PersonalModel {
  if (samples.length > MAX_PERSONAL_SAMPLES) throw new Error('Too many examples. Delete some and try again.');
  const counts = new Map<string, number>();
  const examples = samples.map(sample => {
    const label = signLabel(sample.label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
    return { label, features: normalized(sample), featureVersion: sampleVersion(sample), modelSha256: sample.modelSha256 };
  });
  if (counts.size < minSigns) throw new Error(minSigns > 1 ? 'Teach at least two different signs so the model can tell them apart.' : 'Save at least three examples of a sign to start your vocabulary.');
  if (counts.size > 64) throw new Error('Use up to 64 different signs in your personal model.');
  if ([...counts.values()].some(count => count < MIN_SIGN_EXAMPLES)) throw new Error('Save at least three examples of every sign before training.');
  return { labels: [...counts.keys()].sort(), examples };
}

/** Closest saved example must be within this distance, and the third closest within the next (both loosened
 * from 0.35 / 0.5 on Oct 18 so live signs are held back less often). */
export const MAX_NEAREST_DISTANCE = 0.45;
export const MAX_THIRD_DISTANCE = 0.65;

/** Signs with fewer than three examples are left out (and listed) instead of stopping the whole model from loading. */
export function usableSamples(samples: readonly PersonalSample[]): { samples: PersonalSample[]; labels: string[]; skipped: string[] } {
  const counts = new Map<string, number>();
  for (const sample of samples) counts.set(signLabel(sample.label), (counts.get(signLabel(sample.label)) ?? 0) + 1);
  const ready = new Set([...counts].filter(([, n]) => n >= MIN_SIGN_EXAMPLES).map(([label]) => label));
  return { samples: samples.filter(sample => ready.has(signLabel(sample.label))), labels: [...ready].sort(),
    skipped: [...counts].filter(([, n]) => n < MIN_SIGN_EXAMPLES).map(([label]) => label).sort() };
}

/** A small nearest-neighbor model for personal isolated signs, not a general ASL translator. */
export function predictPersonalSign(model: PersonalModel, sample: WordSample): WordPrediction {
  const input = normalized(sample);
  const compatible = model.examples.filter(example => (example.featureVersion ?? 'word-v1') === sampleVersion(sample) &&
    (sampleVersion(sample) !== 'holistic_v2_emb192' || example.modelSha256 === sample.modelSha256));
  const labels = [...new Set(compatible.map(e => e.label))].filter(label => compatible.filter(e => e.label === label).length >= 3);
  if (!labels.length) return { label: model.labels[0] ?? '_idle', score: 0, margin: 0, accepted: false };
  if (sampleVersion(sample) === 'holistic_v2_emb192') {
    const scores = labels.map(label => {
      const rows = compatible.filter(e => e.label === label);
      const prototype = input.map((_, i) => rows.reduce((sum, row) => sum + row.features[i], 0) / rows.length);
      const norm = Math.hypot(...prototype);
      return { label, score: norm > 1e-8 ? Math.max(-1, Math.min(1, input.reduce((sum, x, i) => sum + x * prototype[i] / norm, 0))) : 0 };
    }).sort((a, b) => b.score - a.score);
    const margin = scores[0].score - (scores[1]?.score ?? 0);
    return { ...scores[0], margin, accepted: scores[0].score >= .78 && margin >= .05 };
  }
  const nearest = compatible.filter(e => labels.includes(e.label)).map(example => ({
    label: example.label,
    distance: Math.sqrt(example.features.reduce((sum, x, i) => sum + (x - input[i]) ** 2, 0) / input.length),
  })).sort((a, b) => a.distance - b.distance).slice(0, 3);
  const votes = labels.map(label => ({ label, score: nearest.filter(x => x.label === label).length / 3 }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const score = votes[0].score;
  // With one personal sign there is no runner-up; the distance gates decide whether it matched.
  const margin = score - (votes[1]?.score ?? 0);
  return { label: votes[0].label, score, margin,
    accepted: score >= 2 / 3 && margin >= 0.3 && nearest[0].distance <= MAX_NEAREST_DISTANCE && nearest[2].distance <= MAX_THIRD_DISTANCE };
}
