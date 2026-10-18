import { describe, expect, it, vi } from 'vitest';
import { glossToEnglish } from './signedSentence';

const words = [{ label: 'MY', score: 0.9 }, { label: 'NAME', score: 0.8 }, { label: 'LISA', score: 0.7 }];
const result = (english: string, confidence: number) => ({ english, confidence, sentence_type: 'statement' as const, uncertain: [] });

describe('signed sentence to English', () => {
  it('uses a confident Gemini sentence and passes scores and recent context', async () => {
    const translate = vi.fn().mockResolvedValue(result('My name is Lisa.', 0.95));
    expect(await glossToEnglish(words, ['What is your name?'], translate)).toBe('My name is Lisa.');
    expect(translate).toHaveBeenCalledWith([{ gloss: 'MY', p: 0.9, alts: [] }, { gloss: 'NAME', p: 0.8, alts: [] }, { gloss: 'LISA', p: 0.7, alts: [] }],
      [], ['What is your name?'], 5000);
  });
  it('keeps the signed words when Gemini is unsure, empty, slow or down', async () => {
    expect(await glossToEnglish(words, [], vi.fn().mockResolvedValue(result('Do you want food?', 0.5)))).toBe('MY NAME LISA');
    expect(await glossToEnglish(words, [], vi.fn().mockResolvedValue(result('  ', 0.9)))).toBe('MY NAME LISA');
    expect(await glossToEnglish(words, [], vi.fn().mockRejectedValue(new Error('/api/gloss 502')))).toBe('MY NAME LISA');
  });
});
