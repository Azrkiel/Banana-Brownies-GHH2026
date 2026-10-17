// Single source of truth. Team verification against Lifeprint/Handspeak is pending.
// Add verified form descriptions before collecting recordings.
export const IDLE = '_idle'
export const SIGNS_TIER1 = [
  'HELLO', 'NICE', 'MEET', 'YOU', 'ME', 'MY', 'NAME', 'WHAT',
  'DEAF', 'HEARING', 'YES', 'NO', 'PLEASE', 'SLOW', 'AGAIN', 'THANK-YOU',
] as const
export const SIGNS_TIER2 = [
  'UNDERSTAND', 'HELP', 'WHERE', 'WHO', 'HOW', 'LEARN', 'SIGN', 'GO',
  'TOMORROW', 'STORE', 'BYE',
] as const
// Default demo name: LIV. Confirm with the team before recording.
export const LETTERS = ['L', 'I', 'V', 'K', 'O', 'F', 'Y', 'B', 'C', 'D'] as const
export const WH_SIGNS = new Set(['WHAT', 'WHERE', 'WHO', 'HOW'])
export const RECORD_LABELS: string[] = [...SIGNS_TIER1, IDLE]
