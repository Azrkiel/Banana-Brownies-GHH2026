import type { Pt } from './types';

export const WORD_FRAMES = 30;
export const WORD_FEATURES = 42;
type Node = { left: number; right: number; feature: number; threshold: number; votes: number[] };
export type WordForest = {
  version: 1; frames: 30; featuresPerFrame: 42;
  labels: string[]; trees: Node[][];
  preprocessing: 'mirrored-one-hand-wrist-relative-xy';
};
export type WordPrediction = { label: string; score: number; margin: number; accepted: boolean; framesWithHand?: number };

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Validate once at load, including forward-only edges so a malformed tree cannot loop. */
export function parseWordForest(value: unknown): WordForest {
  if (!record(value) || value.version !== 1 || value.frames !== WORD_FRAMES || value.featuresPerFrame !== WORD_FEATURES ||
      value.preprocessing !== 'mirrored-one-hand-wrist-relative-xy' || !Array.isArray(value.labels) ||
      value.labels.length < 2 || value.labels.length > 64 ||
      !value.labels.every(label => typeof label === 'string' && /^[A-Z][A-Z ]{0,39}$/.test(label)) ||
      new Set(value.labels).size !== value.labels.length || !Array.isArray(value.trees) ||
      !value.trees.length || value.trees.length > 1000) throw new Error('Unsupported trained word model.');
  const classes = value.labels.length;
  for (const tree of value.trees) {
    if (!Array.isArray(tree) || !tree.length || tree.length > 10000) throw new Error('Invalid word tree.');
    for (let index = 0; index < tree.length; index++) {
      const node: unknown = tree[index];
      if (!record(node) || !finite(node.threshold) || !Array.isArray(node.votes)) throw new Error('Invalid word node.');
      if (node.left === -1 && node.right === -1) {
        if (node.votes.length !== classes || !node.votes.every(vote => finite(vote) && vote >= 0) ||
            node.votes.reduce((a: number, b: number) => a + b, 0) <= 0) throw new Error('Invalid word votes.');
      } else if (!Number.isInteger(node.feature) || (node.feature as number) < 0 || (node.feature as number) >= WORD_FRAMES * WORD_FEATURES ||
          ![node.left, node.right].every(child => Number.isInteger(child) && (child as number) > index && (child as number) < tree.length)) {
        throw new Error('Invalid word tree edge.');
      }
    }
  }
  return value as WordForest;
}

/** Same features as the recovered trainer, applied to an already mirrored frame. */
export function wordFrame(hand: Pt[] | null): number[] {
  if (!hand || hand.length !== 21 || hand.some(point => !finite(point.x) || !finite(point.y))) return Array(WORD_FEATURES).fill(0);
  return hand.flatMap(point => [point.x - hand[0].x, point.y - hand[0].y]);
}

export function wordProbabilities(model: WordForest, features: readonly number[]): number[] {
  if (features.length !== WORD_FRAMES * WORD_FEATURES || !features.every(finite)) throw new Error('Invalid word sample.');
  // sklearn converts prediction inputs to float32 before traversing trees.
  const input = Float32Array.from(features);
  const result = model.labels.map(() => 0);
  for (const tree of model.trees) {
    let node = tree[0];
    while (node.left !== -1) node = tree[input[node.feature] <= node.threshold ? node.left : node.right];
    const sum = node.votes.reduce((a, b) => a + b, 0);
    node.votes.forEach((vote, index) => { result[index] += vote / sum / model.trees.length; });
  }
  return result;
}

/** A model score is not measured accuracy. Every result still requires confirmation. */
export function predictWord(model: WordForest, features: readonly number[], framesWithHand: number): WordPrediction {
  const probabilities = wordProbabilities(model, features);
  const order = probabilities.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score || a.index - b.index);
  const score = order[0].score;
  const margin = score - order[1].score;
  return { label: model.labels[order[0].index], score, margin, accepted: framesWithHand >= 24 && score >= 0.6 && margin >= 0.15 };
}
