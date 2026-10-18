import { KinematicSegmenter } from './segmenter';
export type GlossCandidate = { gloss: string; score: number };
export type GlossTokenSlot = { candidates: GlossCandidate[]; nmm_tags: string[] };
type Recognizers = {
  isolated: (xy174: number[][]) => Promise<GlossCandidate[]>;
  fingerspelling: (aslfr90: number[][]) => Promise<string>;
};
/** Inference adapters own resampling/ONNX. Stage B receives ASLFR90, never XY174. */
export class Decoder {
  readonly segmenter = new KinematicSegmenter();
  readonly slots: GlossTokenSlot[] = [];
  private letters: number[][] = [];
  private pending: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private spellingSpan = 0;
  private lastSpelling = '';
  private spellingSlot: GlossTokenSlot | null = null;
  private models: Recognizers;
  constructor(models: Recognizers) { this.models = models; }
  reset() { this.segmenter.reset(); this.slots.length = 0; this.letters = []; this.lastSpelling = ''; this.spellingSlot = null; this.generation++; this.spellingSpan++; }
  async push(features: ArrayLike<number>, options: { letterFeatures?: ArrayLike<number>; fingerspellMode?: boolean; nmmTags?: string[] } = {}): Promise<GlossTokenSlot | null> {
    const d = this.segmenter.push(features, options.fingerspellMode);
    const letter = options.letterFeatures;
    if (d.state === 'REST') { this.letters = []; this.lastSpelling = ''; this.spellingSlot = null; this.spellingSpan++; }
    else if (letter?.length === 90 && Array.from(letter).every(Number.isFinite)) {
      this.letters.push(Array.from(letter)); if (this.letters.length > 128) this.letters.shift();
    } else this.letters = [];
    if (!d.trigger || (d.trigger === 'fingerspelling' && this.letters.length < 64)) return null;
    const generation = this.generation, spellingSpan = this.spellingSpan, letters = this.letters.map(r => r.slice()), tags = [...(options.nmmTags ?? [])];
    // Serialize inference without losing a subsequent boundary while a model is busy.
    const task = this.pending.then(async (): Promise<GlossTokenSlot | null> => {
      if (generation !== this.generation) return null;
      let candidates: GlossCandidate[];
      if (d.trigger === 'fingerspelling') {
        const text = (await this.models.fingerspelling(letters)).trim().toUpperCase();
        if (!text || text === this.lastSpelling || generation !== this.generation || spellingSpan !== this.spellingSpan) return null;
        // CTC text alone has no calibrated confidence; keep it for signer review.
        candidates = [{ gloss: '@' + text, score: 0 }]; tags.push('FS');
      } else candidates = (await this.models.isolated(d.frames)).filter(c => c.gloss !== '_idle' && c.gloss.trim() && Number.isFinite(c.score) && c.score >= 0 && c.score <= 1).sort((a, b) => b.score - a.score).slice(0, 3);
      if (generation !== this.generation || !candidates.length) return null;
      if (d.trigger === 'fingerspelling') {
        this.lastSpelling = candidates[0].gloss.slice(1);
        // Rolling CTC prefixes revise one name rather than appending partial names.
        if (this.spellingSlot) {
          this.spellingSlot.candidates = candidates;
          this.spellingSlot.nmm_tags = [...new Set(tags)];
          return this.spellingSlot;
        }
      } else { this.spellingSlot = null; this.lastSpelling = ''; }
      const slot = { candidates, nmm_tags: [...new Set(tags)] };
      this.slots.push(slot);
      if (d.trigger === 'fingerspelling') this.spellingSlot = slot;
      return slot;
    });
    this.pending = task.catch(() => {});
    return task;
  }
}
