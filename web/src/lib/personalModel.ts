import { WORD_FEATURES, WORD_FRAMES, type WordPrediction } from './wordModel';

export const PERSONAL_FEATURE_VERSION = 'word-v1';
export const MAX_PERSONAL_SAMPLES = 500;
export const MIN_SIGN_EXAMPLES = 3;
export type WordSample = { features: number[]; framesWithHand: number };
export type PersonalSample = WordSample & { id: string; label: string; createdAt: string };
export type PersonalModel = { labels: string[]; examples: { label: string; features: number[] }[] };

export function signLabel(value: string): string {
  const label = value.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!/^[A-Z][A-Z0-9 '-]{0,39}$/.test(label)) throw new Error('Use 1–40 letters, numbers, spaces, apostrophes or hyphens, starting with a letter.');
  return label;
}

export function validateWordSample(sample: WordSample): void {
  if (!Array.isArray(sample.features) || sample.features.length !== WORD_FRAMES * WORD_FEATURES ||
      !sample.features.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 2) ||
      !Number.isInteger(sample.framesWithHand) || sample.framesWithHand < 24 || sample.framesWithHand > WORD_FRAMES) {
    throw new Error('Keep one hand in view for the whole capture, then try again.');
  }
  if (sample.features.every(x => Math.abs(x) < 0.00001)) throw new Error('No usable hand landmarks. Try again.');
}

function normalized(sample: WordSample): number[] {
  validateWordSample(sample);
  // Remove hand size/distance to camera while retaining pose and motion over 30 frames.
  const scale = Math.sqrt(sample.features.reduce((sum, x) => sum + x * x, 0) / sample.features.length);
  return sample.features.map(x => x / scale);
}

export function trainPersonalModel(samples: readonly PersonalSample[]): PersonalModel {
  if (samples.length > MAX_PERSONAL_SAMPLES) throw new Error('Too many examples. Delete some and try again.');
  const counts = new Map<string, number>();
  const examples = samples.map(sample => {
    const label = signLabel(sample.label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
    return { label, features: normalized(sample) };
  });
  if (counts.size < 2) throw new Error('Teach at least two different signs so the model can tell them apart.');
  if (counts.size > 64) throw new Error('Use up to 64 different signs in your personal model.');
  if ([...counts.values()].some(count => count < MIN_SIGN_EXAMPLES)) throw new Error('Save at least three examples of every sign before training.');
  return { labels: [...counts.keys()].sort(), examples };
}

/** A small nearest-neighbor model for personal isolated signs, not a general ASL translator. */
export function predictPersonalSign(model: PersonalModel, sample: WordSample): WordPrediction {
  const input = normalized(sample);
  const nearest = model.examples.map(example => ({
    label: example.label,
    distance: Math.sqrt(example.features.reduce((sum, x, i) => sum + (x - input[i]) ** 2, 0) / input.length),
  })).sort((a, b) => a.distance - b.distance).slice(0, 3);
  const votes = model.labels.map(label => ({ label, score: nearest.filter(x => x.label === label).length / 3 }))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const score = votes[0].score;
  const margin = score - votes[1].score;
  return { label: votes[0].label, score, margin,
    accepted: score >= 2 / 3 && margin >= 0.3 && nearest[0].distance <= 0.35 && nearest[2].distance <= 0.5 };
}
