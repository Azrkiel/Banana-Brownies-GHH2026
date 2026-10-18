export type Pt = { x: number; y: number; z: number };
export type Brow = { raise: number; furrow: number };
/** One video frame of landmarks. Coordinates are MediaPipe-normalized (0..1, y down). */
export type Frame = {
  t: number;            // performance.now() in ms
  w: number; h: number; // video size, for aspect correction
  pose: Pt[] | null;    // pose landmarks 0..16 only (face + shoulders + arms)
  hands: Pt[][];        // 0..2 hands x 21 points, NOT labeled left/right
  headYaw?: number;    // nose offset from ear midpoint / ear separation; positive toward image-right
  brow: Brow | null;    // face blendshapes (updated every 3rd frame), null if face model off
};
export type ClipKind = 'sign' | 'letter';
export type Clip = { kind: ClipKind; label: string; frames: Frame[] };
export type Session = { version: 1; signer: string; leftHanded: boolean; recordedAt: string; clips: Clip[] };
export type Role = 'signer' | 'hearing';
export type Caption = {
  id: string; speaker: string; role: Role;
  kind: 'english' | 'speech'; text: string; final: boolean; ts: number;
  confidence?: number; nmmTags?: string[];
  retracted?: boolean; // signer withdrew a mistaken sentence
  revision?: number; // ordered speech draft/final updates; other producers remain compatible
};
export type Ctrl =
  | { type: 'signing'; on: boolean }
  | { type: 'tts'; on: boolean }
  | { type: 'clarify' }
  | { type: 'attention' }
  | { type: 'speak-local'; text: string }
  | { type: 'clear'; captionId: string }
  | { type: 'gloss'; words: { label: string; score: number; nmmTags?: string[] }[] }
  | { type: 'caption-clear'; id: string; revision: number };
