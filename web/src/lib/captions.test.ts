import { describe, expect, it } from 'vitest';
import { upsertCaption } from './captions';
import type { Caption } from './types';

const caption = (id: string, text = 'Hello'): Caption => ({ id, text, speaker: 'Kev', role: 'signer', kind: 'english', final: true, ts: 1 });

describe('caption history', () => {
  it('replaces interim captions by ID and preserves the original list', () => {
    const original = [{ ...caption('a', 'Hel'), final: false }, caption('b')];
    const updated = upsertCaption(original, caption('a', 'Hello!'));
    expect(updated).toEqual([caption('a', 'Hello!'), caption('b')]);
    expect(original[0].text).toBe('Hel');
  });
  it('keeps retractions on the original caption rather than appending a second sentence', () => {
    const updated = upsertCaption([caption('a')], { ...caption('a'), retracted: true });
    expect(updated).toHaveLength(1);
    expect(updated[0].retracted).toBe(true);
  });
  it('bounds the retained history at 50 captions', () => {
    const original = Array.from({ length: 50 }, (_, index) => caption(String(index)));
    const updated = upsertCaption(original, caption('50'));
    expect(updated).toHaveLength(50);
    expect(updated[0].id).toBe('1');
    expect(updated.at(-1)?.id).toBe('50');
  });
});
