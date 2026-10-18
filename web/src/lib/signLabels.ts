const COMPOUNDS: Record<string, string> = { THANKYOU: 'Thank you' };

/** Display label for a sign key: `_idle` -> "Resting (no sign)", `HELLO` -> "Hello", `THANKYOU` -> "Thank you". */
export function signLabel(key: string): string {
  if (key === '_idle') return 'Resting (no sign)';
  const compound = COMPOUNDS[key.toUpperCase()];
  if (compound) return compound;
  const lower = key.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
