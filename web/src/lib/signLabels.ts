const COMPOUNDS: Record<string, string> = { THANKYOU: 'Thank you', GOODBYE: 'Goodbye', GOODMORNING: 'Good morning', GOODNIGHT: 'Good night' };

/** The one display label for a sign key: `_idle` -> "Resting (no sign)", `HELLO` -> "Hello", `THANKYOU` -> "Thank you", `A` -> "A". */
export function signLabel(key: string): string {
  if (key === '_idle') return 'Resting (no sign)';
  // A fingerspelled word (fs-KEV) reads as a name: "Kev".
  if (/^fs-[A-Za-z]+$/.test(key)) return key.charAt(3).toUpperCase() + key.slice(4).toLowerCase();
  if (key.length <= 1) return key;
  const compound = COMPOUNDS[key.toUpperCase()];
  if (compound) return compound;
  const spaced = key.replace(/_+/g, ' ').trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
