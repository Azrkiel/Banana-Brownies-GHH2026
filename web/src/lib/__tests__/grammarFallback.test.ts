import cases from '../../../../server/tests/fixtures/gloss_grammar.json';
import { describe, expect, it } from 'vitest';
import { fallbackGlossToEnglish, grammarResult } from '../grammarFallback';
describe('offline grammar shares exact Python fixtures',()=>{
  it.each(cases)('$glosses $tags',c=>expect(fallbackGlossToEnglish(c.glosses,c.tags)).toBe(c.english));
  it('leaves unknown syntax for signer review',()=>expect(grammarResult(['WATER','STORE','BYE']).supported).toBe(false));
});
