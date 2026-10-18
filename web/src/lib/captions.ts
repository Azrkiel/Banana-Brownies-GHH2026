import type { Caption, Ctrl } from './types';

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && !!v.trim() && v.length <= max;
export const validRevision = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;

export function isCaption(v: unknown): v is Caption {
  return record(v) && text(v.id, 200) && text(v.speaker, 40) &&
    (v.role === 'signer' || v.role === 'hearing') && (v.kind === 'english' || v.kind === 'speech') &&
    text(v.text, 8000) && typeof v.final === 'boolean' && typeof v.ts === 'number' && Number.isFinite(v.ts) &&
    (v.retracted === undefined || typeof v.retracted === 'boolean') &&
    (v.kind !== 'speech' || (v.role === 'hearing' && validRevision(v.revision) && !v.retracted));
}

export function isCtrl(v: unknown): v is Ctrl {
  if (!record(v)) return false;
  switch (v.type) {
    case 'caption-clear': return text(v.id, 200) && validRevision(v.revision);
    case 'signing': case 'tts': return typeof v.on === 'boolean';
    case 'clarify': case 'attention': return true;
    case 'speak-local': return text(v.text, 1000);
    default: return false;
  }
}

/** Room-scoped ownership and ordering. Holds at most 200 rows and 512 recent IDs.
 * SDK sender identity, never the display name, scopes every wire ID. After 512
 * newer IDs a tombstone can expire; this is bounded session protection, not storage.
 */
export function createCaptionHistory(onChange: (captions: Caption[]) => void) {
  const rows = new Map<string, Caption>();
  const recent = new Map<string, { revision: number; terminal: boolean }>();
  const keyFor = (from: string, id: string) => JSON.stringify([from, id]);
  function remember(key: string, revision: number, terminal: boolean) {
    recent.delete(key);
    recent.set(key, { revision, terminal });
    while (recent.size > 512) recent.delete(recent.keys().next().value!);
  }
  function publish() { onChange([...rows.values()]); }
  return {
    receive(c: Caption, from: string) {
      if (!from || !isCaption(c)) return;
      const key = keyFor(from, c.id);
      const previous = recent.get(key);
      const existing = rows.get(key);
      // A peer may update only its own IDs, and may never change a row's kind.
      if (existing && existing.kind !== c.kind) return;
      if (c.kind === 'speech') {
        if (previous?.terminal || existing?.final || (previous && c.revision! <= previous.revision)) return;
        remember(key, c.revision!, c.final);
      }
      rows.set(key, { ...c, id: key });
      while (rows.size > 200) rows.delete(rows.keys().next().value!);
      publish();
    },
    clear(id: string, revision: number, from: string) {
      if (!from || !text(id, 200) || !validRevision(revision)) return;
      const key = keyFor(from, id);
      const existing = rows.get(key);
      const previous = recent.get(key);
      if (existing && (existing.kind !== 'speech' || existing.final)) return;
      if (previous?.terminal || (previous && revision <= previous.revision)) return;
      remember(key, revision, true);
      rows.delete(key);
      publish();
    },
    clearDrafts(from?: string) {
      for (const [key, c] of rows) {
        if (c.kind === 'speech' && !c.final && (from === undefined || JSON.parse(key)[0] === from)) {
          remember(key, (c.revision ?? 0) + 1, true);
          rows.delete(key);
        }
      }
      publish();
    },
    reset() { rows.clear(); recent.clear(); publish(); },
  };
}

export function upsertCaption(list: Caption[], c: Caption): Caption[] {
  const i = list.findIndex((x) => x.id === c.id);
  if (i === -1) return [...list, c].slice(-200);
  const next = list.slice();
  next[i] = c;
  return next;
}

/** The caption-history source for this tab's own captions; peers use their SDK identity. */
export const LOCAL_SOURCE = 'local';
/** Own captions are identified by the history source baked into the row ID, never by display name. */
export function isOwnCaption(c: Pick<Caption, 'id'>): boolean {
  try { const parsed: unknown = JSON.parse(c.id); return Array.isArray(parsed) && parsed[0] === LOCAL_SOURCE; }
  catch { return false; }
}

export const NEAR_BOTTOM_PX = 64;
export const isNearBottom = (scrollHeight: number, scrollTop: number, clientHeight: number, slack = NEAR_BOTTOM_PX) =>
  scrollHeight - scrollTop - clientHeight <= slack;

const COUNTER_THRESHOLDS: [number, string][] = [[800, '200 characters left.'], [900, '100 characters left.'], [950, '50 characters left.'], [1000, 'Caption is full: 1000 characters.']];
/** A screen-reader message only when typing crosses a threshold (never per keystroke); null when nothing new to say. */
export function counterAnnouncement(previous: number, next: number): string | null {
  let message: string | null = null;
  for (const [limit, text] of COUNTER_THRESHOLDS) if (previous < limit && next >= limit) message = text;
  return message;
}
