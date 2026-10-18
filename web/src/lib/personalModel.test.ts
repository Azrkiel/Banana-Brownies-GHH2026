import { describe, expect, it } from 'vitest';
import { predictPersonalSign, signLabel, trainPersonalModel, usableSamples, validateWordSample, type PersonalSample } from './personalModel';

function sample(label: string, axis: number, variation = 0): PersonalSample {
  return { id: crypto.randomUUID(), label, createdAt: new Date().toISOString(), framesWithHand: 30,
    features: Array.from({ length: 1260 }, (_, i) => (i % 42 === axis ? 0.2 + variation : 0)) };
}
const examples = () => [0, 0.001, -0.001].flatMap(delta => [sample('HELLO', 2, delta), sample('NAME', 3, delta)]);

describe('personal isolated-sign model', () => {
  it('learns multiple private labels and matches fresh examples after hand-size normalization', () => {
    const model = trainPersonalModel(examples());
    const test = sample('not used', 2, 0.08);
    expect(predictPersonalSign(model, test)).toMatchObject({ label: 'HELLO', accepted: true });
    expect(predictPersonalSign(model, sample('not used', 3, -0.05))).toMatchObject({ label: 'NAME', accepted: true });
  });
  it('rejects an unseen hand pose even when nearest neighbors agree on a label', () => {
    expect(predictPersonalSign(trainPersonalModel(examples()), sample('UNSEEN', 4)).accepted).toBe(false);
  });
  it('holds an ambiguous pose instead of offering the most common label', () => {
    const ambiguous = sample('UNSURE', 2);
    ambiguous.features = ambiguous.features.map((x, i) => x + (i % 42 === 3 ? 0.2 : 0));
    expect(predictPersonalSign(trainPersonalModel(examples()), ambiguous).accepted).toBe(false);
  });
  it('requires at least two labels and three examples for every label', () => {
    expect(() => trainPersonalModel(examples().filter(x => x.label === 'HELLO'))).toThrow('two different');
    expect(() => trainPersonalModel(examples().slice(1))).toThrow('three examples');
    expect(() => trainPersonalModel([])).toThrow('two different');
  });
  it('allows one sign beside the shared words and still rejects unseen poses', () => {
    const model = trainPersonalModel(examples().filter(x => x.label === 'HELLO'), 1);
    expect(predictPersonalSign(model, sample('not used', 2, 0.08))).toMatchObject({ label: 'HELLO', accepted: true });
    expect(predictPersonalSign(model, sample('UNSEEN', 4)).accepted).toBe(false);
    expect(() => trainPersonalModel([], 1)).toThrow('at least three examples');
  });
  it('rejects missing hands, corrupted shapes and incompatible numeric features', () => {
    expect(() => validateWordSample({ ...sample('HELLO', 2), framesWithHand: 23 })).toThrow();
    for (const features of [[0], Array(1260).fill(0), Array(1260).fill(NaN), Array(1260).fill(Infinity), Array(1260).fill(3)]) {
      expect(() => validateWordSample({ features, framesWithHand: 30 })).toThrow();
    }
  });
  it('keeps trained data independent of later edits to source examples', () => {
    const source = examples(); const model = trainPersonalModel(source);
    source[0].features.fill(0);
    expect(predictPersonalSign(model, sample('HELLO', 2)).accepted).toBe(true);
  });
  it('skips signs with fewer than three examples instead of refusing the whole vocabulary', () => {
    const samples = [...examples(), sample('WAVE', 4), sample('WAVE', 4, 0.001)];
    const usable = usableSamples(samples);
    expect(usable.labels).toEqual(['HELLO', 'NAME']);
    expect(usable.skipped).toEqual(['WAVE']);
    expect(() => trainPersonalModel(samples, 1)).toThrow('three examples');
    expect(trainPersonalModel(usable.samples, 1).labels).toEqual(['HELLO', 'NAME']);
  });
  it('normalizes custom sign names and rejects markup or invalid names', () => {
    expect(signLabel("  my   name-2's  ")).toBe("MY NAME-2'S");
    for (const value of ['', '<script>', '1SIGN', 'a'.repeat(41)]) expect(() => signLabel(value)).toThrow();
  });
});
