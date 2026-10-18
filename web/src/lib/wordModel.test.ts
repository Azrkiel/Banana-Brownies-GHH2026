import { describe, expect, it } from 'vitest';
import recovered from '../../public/trained-words.json';
import { parseWordForest, predictWord, wordFrame, wordProbabilities, type WordForest } from './wordModel';

const sample = () => Array(1260).fill(0) as number[];
const forest = (): WordForest => ({
  version: 1, frames: 30, featuresPerFrame: 42, preprocessing: 'mirrored-one-hand-wrist-relative-xy',
  labels: ['HELLO', 'NAME'], trees: [[
    { left: 1, right: 2, feature: 0, threshold: 0.1, votes: [] },
    { left: -1, right: -1, feature: -2, threshold: -2, votes: [8, 2] },
    { left: -1, right: -1, feature: -2, threshold: -2, votes: [1, 9] },
  ]],
});

describe('recovered word model', () => {
  it('validates the shipped seven-word model', () => {
    const model = parseWordForest(recovered);
    expect(model.labels).toEqual(['DEMO', 'FOOD', 'GOODBYE', 'HELLO', 'LISA', 'MY', 'NAME']);
    expect(model.trees).toHaveLength(100);
  });
  it('keeps wrist-relative features invariant under image translation', () => {
    const hand = Array.from({ length: 21 }, (_, index) => ({ x: index / 100, y: index / 200, z: 0 }));
    const shifted = hand.map(point => ({ ...point, x: point.x + 0.4, y: point.y + 0.2 }));
    wordFrame(shifted).forEach((value, index) => expect(value).toBeCloseTo(wordFrame(hand)[index], 12));
    expect(wordFrame(null)).toEqual(Array(42).fill(0));
  });
  it('averages normalized leaf probabilities instead of voting only for the winning class', () => {
    const model = forest();
    model.trees.push([{ left: -1, right: -1, feature: -2, threshold: -2, votes: [1, 1] }]);
    expect(wordProbabilities(model, sample())).toEqual([0.65, 0.35]);
  });
  it('casts features to float32 before a threshold comparison, like sklearn', () => {
    const model = forest();
    model.trees[0][0].threshold = 0.1000000005;
    const features = sample(); features[0] = 0.1000000004;
    expect(wordProbabilities(model, features)).toEqual([0.1, 0.9]);
  });
  it('rejects no-hand samples even when a tree gives them a high score', () => {
    expect(predictWord(forest(), sample(), 0).accepted).toBe(false);
    expect(predictWord(forest(), sample(), 23).accepted).toBe(false);
    expect(predictWord(forest(), sample(), 24)).toMatchObject({ label: 'HELLO', score: 0.8, accepted: true });
  });
  it('accepts a clear lead from 40% and holds close calls for retry', () => {
    const model = forest(); model.trees[0][1].votes = [0.59, 0.41];
    expect(predictWord(model, sample(), 30).accepted).toBe(true);
    model.trees[0][1].votes = [0.55, 0.45];
    expect(predictWord(model, sample(), 30).accepted).toBe(false);
  });
  it('holds a top score under 40% even with a clear lead', () => {
    const model = forest(); model.labels = ['HELLO', 'NAME', 'MY', 'FOOD'];
    model.trees[0][1].votes = [0.39, 0.21, 0.2, 0.2];
    expect(predictWord(model, sample(), 30)).toMatchObject({ label: 'HELLO', accepted: false });
    model.trees[0][1].votes = [0.41, 0.2, 0.2, 0.19];
    expect(predictWord(model, sample(), 30)).toMatchObject({ label: 'HELLO', accepted: true });
  });
  it('rejects incompatible, cyclic, empty and nonfinite model data', () => {
    expect(() => parseWordForest({ ...forest(), frames: 32 })).toThrow();
    const model = forest(); model.trees[0][0].left = 0;
    expect(() => parseWordForest(model)).toThrow();
    expect(() => parseWordForest({ ...forest(), trees: [] })).toThrow();
    const broken = forest(); broken.trees[0][1].votes = [NaN, 1];
    expect(() => parseWordForest(broken)).toThrow();
    expect(() => wordProbabilities(forest(), [0])).toThrow();
    expect(() => wordProbabilities(forest(), Array(1260).fill(Infinity))).toThrow();
  });
});
