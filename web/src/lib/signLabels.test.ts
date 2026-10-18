import { describe, expect, it } from 'vitest';
import { signLabel } from './signLabels';

describe('signLabel', () => {
  it('names the idle key', () => expect(signLabel('_idle')).toBe('Resting (no sign)'));
  it('splits known compounds', () => expect(signLabel('THANKYOU')).toBe('Thank you'));
  it('title-cases other keys', () => { expect(signLabel('HELLO')).toBe('Hello'); expect(signLabel('GOODBYE')).toBe('Goodbye'); });
});
