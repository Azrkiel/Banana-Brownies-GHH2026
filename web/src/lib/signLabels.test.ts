import { describe, expect, it } from 'vitest';
import { signLabel } from './signLabels';

describe('signLabel', () => {
  it('names the idle key', () => expect(signLabel('_idle')).toBe('Resting (no sign)'));
  it('splits known compounds', () => { expect(signLabel('THANKYOU')).toBe('Thank you'); expect(signLabel('GOODBYE')).toBe('Goodbye'); expect(signLabel('GOODMORNING')).toBe('Good morning'); });
  it('sentence-cases other keys', () => expect(signLabel('HELLO')).toBe('Hello'));
  it('leaves single letters unchanged', () => { expect(signLabel('A')).toBe('A'); expect(signLabel('z')).toBe('z'); });
  it('spaces underscores in multiword keys', () => expect(signLabel('I_LOVE_YOU')).toBe('I love you'));
});
