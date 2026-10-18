import { describe, expect, it } from 'vitest';
import { createDictation, MAX_DICTATED_WORDS, type DictationEvent } from './dictation';
import type { WordPrediction } from './wordModel';

const guess = (label: string, accepted = true): WordPrediction => ({ label, score: accepted ? 0.8 : 0.3, margin: 0.4, accepted });

/** Feeds one prediction every 33 ms (30 fps) for `ms` and returns the events produced. */
function feed(d: ReturnType<typeof createDictation>, clock: { t: number }, ms: number, prediction: WordPrediction | null, hand = true) {
  const events: DictationEvent[] = [];
  for (const end = clock.t + ms; clock.t < end; clock.t += 33) {
    const event = d.push(prediction, hand, clock.t);
    if (event) events.push(event);
  }
  return events;
}

describe('live dictation', () => {
  it('adds a word once after a steady confident guess, then sends the sentence when the hand drops', () => {
    const d = createDictation(); const clock = { t: 0 };
    expect(feed(d, clock, 300, guess('MY'))).toEqual([]);
    const added = feed(d, clock, 1000, guess('MY'));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ type: 'word', word: { label: 'MY' } });
    feed(d, clock, 500, guess('NAME'));
    feed(d, clock, 500, guess('LISA'));
    expect(d.words.map(w => w.label)).toEqual(['MY', 'NAME', 'LISA']);
    const ended = feed(d, clock, 1600, null, false);
    expect(ended).toEqual([{ type: 'sentence', words: [expect.objectContaining({ label: 'MY' }), expect.objectContaining({ label: 'NAME' }), expect.objectContaining({ label: 'LISA' })] }]);
    expect(d.words).toEqual([]);
  });

  it('never adds unconfident guesses or brief flickers', () => {
    const d = createDictation(); const clock = { t: 0 };
    feed(d, clock, 2000, guess('FOOD', false));
    for (let i = 0; i < 10; i++) { feed(d, clock, 100, guess('DEMO')); feed(d, clock, 100, guess('HELLO')); }
    expect(d.words).toEqual([]);
  });

  it('repeats a word only after the signer pauses between the two signs', () => {
    const d = createDictation(); const clock = { t: 0 };
    feed(d, clock, 600, guess('HELLO'));
    feed(d, clock, 100, guess('HELLO', false));
    feed(d, clock, 600, guess('HELLO'));
    expect(d.words).toHaveLength(1);
    feed(d, clock, 400, guess('HELLO', false));
    feed(d, clock, 600, guess('HELLO'));
    expect(d.words.map(w => w.label)).toEqual(['HELLO', 'HELLO']);
  });

  it('ignores a short hand drop and sends nothing when no words were signed', () => {
    const d = createDictation(); const clock = { t: 0 };
    feed(d, clock, 600, guess('GOODBYE'));
    expect(feed(d, clock, 800, null, false)).toEqual([]);
    expect(d.words).toHaveLength(1);
    const quiet = createDictation(); const other = { t: 0 };
    expect(feed(quiet, other, 3000, null, false)).toEqual([]);
  });

  it('ends a sentence at the gloss limit and can flush or clear on demand', () => {
    const d = createDictation(); const clock = { t: 0 };
    let sentences = 0;
    for (let i = 0; i < MAX_DICTATED_WORDS; i++) {
      sentences += feed(d, clock, 500, guess(i % 2 ? 'MY' : 'NAME')).filter(e => e.type === 'sentence').length;
    }
    expect(sentences).toBe(1);
    feed(d, clock, 500, guess('DEMO'));
    expect(d.flush()).toMatchObject({ type: 'sentence', words: [{ label: 'DEMO' }] });
    feed(d, clock, 500, guess('FOOD'));
    d.clear();
    expect(d.flush()).toBeNull();
  });
});
