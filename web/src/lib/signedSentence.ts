import type { GlossResult, GlossSign } from './api';
import type { DictatedWord } from './dictation';

/** Gemini's own estimate below this means the signs did not form a clear sentence; keep the signed words. */
export const MIN_GLOSS_CONFIDENCE = 0.6;
/** The first request after the server wakes can take several seconds. */
const GLOSS_TIMEOUT_MS = 5000;

type Translate = (signs: GlossSign[], tags: string[], context: string[], timeoutMs: number) => Promise<GlossResult>;

/** ASL word order differs from English, so Gemini rewrites the glosses; any doubt falls back to the signs themselves. */
export async function glossToEnglish(words: DictatedWord[], context: string[], translate: Translate): Promise<string> {
  const signed = words.map(word => word.label).join(' ');
  try {
    const result = await translate(words.map(word => ({ gloss: word.label, p: word.score, alts: [] })), [], context, GLOSS_TIMEOUT_MS);
    const english = result.english.trim();
    return english && result.confidence >= MIN_GLOSS_CONFIDENCE ? english : signed;
  } catch {
    return signed;
  }
}

/** The preview must never stay empty: an empty or failed polish falls back to the recognized words. */
export function sentenceOrFallback(text: string | null | undefined, words: DictatedWord[], label: (key: string) => string): string {
  return text?.trim() || words.map(word => label(word.label)).join(' ');
}
