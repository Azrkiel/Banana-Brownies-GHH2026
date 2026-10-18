import type { WordPrediction } from './wordModel';

export type DictatedWord = { label: string; score: number };
export type DictationEvent =
  | { type: 'word'; word: DictatedWord; words: DictatedWord[] }
  | { type: 'sentence'; words: DictatedWord[] };

/** The /api/gloss route accepts at most this many signs per sentence. */
export const MAX_DICTATED_WORDS = 20;

/**
 * Turns per-frame live predictions into words and sentences, with no button presses.
 * A word is added only after the same confident guess holds for `holdMs`; the same word
 * repeats only after the guess changes or the hand rests for `releaseMs`. Lowering the
 * hand for `endMs` ends the sentence. Unconfident guesses are never added.
 */
export function createDictation(o: { holdMs?: number; releaseMs?: number; endMs?: number } = {}) {
  const holdMs = o.holdMs ?? 350, releaseMs = o.releaseMs ?? 300, endMs = o.endMs ?? 1500;
  let words: DictatedWord[] = [];
  let candidate: { label: string; since: number; best: number } | null = null;
  let locked: string | null = null;
  let quietSince: number | null = null;
  let handGoneSince: number | null = null;

  const finish = (): DictationEvent | null => {
    const sentence = words;
    words = []; candidate = null; locked = null;
    return sentence.length ? { type: 'sentence', words: sentence } : null;
  };

  return {
    get words() { return words; },
    push(prediction: WordPrediction | null, handVisible: boolean, now: number): DictationEvent | null {
      handGoneSince = handVisible ? null : handGoneSince ?? now;
      if (handGoneSince !== null && now - handGoneSince >= endMs) return finish();
      if (!prediction?.accepted) {
        candidate = null;
        quietSince ??= now;
        if (now - quietSince >= releaseMs) locked = null;
        return null;
      }
      quietSince = null;
      if (locked && prediction.label !== locked) locked = null;
      if (candidate?.label !== prediction.label) candidate = { label: prediction.label, since: now, best: prediction.score };
      candidate.best = Math.max(candidate.best, prediction.score);
      if (locked || now - candidate.since < holdMs) return null;
      const word = { label: candidate.label, score: candidate.best };
      words = [...words, word];
      locked = word.label; candidate = null;
      if (words.length >= MAX_DICTATED_WORDS) return finish();
      return { type: 'word', word, words };
    },
    /** Sends what has been signed so far, e.g. when dictation is switched off mid-sentence. */
    flush: finish,
    clear() { words = []; candidate = null; locked = null; },
  };
}
