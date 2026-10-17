// Single source of truth for labels: vocab.json (Python training reads the same file).
import vocab from './vocab.json';

export const IDLE: string = vocab.idle;                                  // '_idle'
export const GISLR_SIGNS: string[] = vocab.gislr.map((s) => s.toUpperCase()); // from the Kaggle dataset, no recording needed
export const OWN_SIGNS: string[] = vocab.own;                            // not in the Kaggle set: we record these
export const DEMO_SIGNS: string[] = [...GISLR_SIGNS, ...OWN_SIGNS];
export const LETTERS: string[] = vocab.letters;                          // spell mode knows only these
export const WH_SIGNS = new Set<string>(vocab.wh);
export const RECORD_LABELS: string[] = [...OWN_SIGNS, IDLE, ...GISLR_SIGNS]; // own + idle required; GISLR signs optional (adaptation)
