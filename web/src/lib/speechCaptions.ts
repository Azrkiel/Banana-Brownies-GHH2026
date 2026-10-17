import type { Caption } from './types';

type Clear = { type: 'caption-clear'; id: string; revision: number };
type Item = { value: Caption | Clear; created: number; tries: number };
type Options = {
  speaker: string;
  local(c: Caption): void;
  remove(id: string, revision: number): void;
  send(c: Caption | Clear): Promise<void>;
  onError(message: string): void;
  id?: () => string;
};

/** Serial, bounded room-session delivery. Completion is transport acceptance, not
 * a remote read receipt. Timed-out SDK sends cannot be cancelled; receivers use IDs
 * and revisions to reject duplicates/late drafts. Nothing persists between rooms.
 */
export function createSpeechCaptions(o: Options) {
  let active = true;
  let connected = false;
  let utterance: Caption | undefined;
  let interim: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let expire: ReturnType<typeof setTimeout> | undefined;
  let pending: Item[] = [];
  let reconnectClears: Clear[] = [];
  let sending = false;
  let epoch = 0;
  const failed = () => { if (active) o.onError('Some speech captions could not reach the room. You can still type captions.'); };
  function cancelInterim() { clearTimeout(interim); interim = undefined; }
  function scheduleExpiry() {
    clearTimeout(expire);
    expire = undefined;
    if (!pending.length || !active) return;
    expire = setTimeout(() => {
      const before = pending.length;
      pending = pending.filter(item => Date.now() - item.created < 30000);
      if (before !== pending.length) failed();
      scheduleExpiry();
    }, Math.max(1, pending[0].created + 30000 - Date.now()));
  }
  function enqueue(value: Caption | Clear) {
    if (!active || !connected) return;
    // Final/clear supersedes queued drafts for this utterance; other finals retain order.
    pending = pending.filter(item => item.value.id !== value.id || ('final' in item.value && item.value.final));
    if (pending.length >= 20) { failed(); return; }
    pending.push({ value, created: Date.now(), tries: 0 });
    scheduleExpiry();
    pump();
  }
  function pump() {
    if (!active || !connected || sending || retry || !pending.length) return;
    const item = pending[0];
    const attempt = epoch;
    sending = true;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled || !active || attempt !== epoch) return;
      settled = true;
      clearTimeout(timeout); timeout = undefined;
      sending = false;
      const index = pending.indexOf(item);
      if (index < 0) { pump(); return; }
      if (ok) pending.splice(index, 1);
      else if (('final' in item.value && !item.value.final)) pending.splice(index, 1);
      else if (++item.tries <= 2 && Date.now() - item.created < 30000) {
        retry = setTimeout(() => { retry = undefined; pump(); }, item.tries === 1 ? 500 : 1500);
      } else { pending.splice(index, 1); failed(); }
      scheduleExpiry();
      pump();
    };
    timeout = setTimeout(() => finish(false), 5000);
    try { void o.send(item.value).then(() => finish(true), () => finish(false)); }
    catch { finish(false); }
  }
  function clearDraft(send = true) {
    cancelInterim();
    if (!utterance) return;
    const id = utterance.id;
    const revision = utterance.revision! + 1;
    utterance = undefined;
    o.remove(id, revision);
    pending = pending.filter(item => item.value.id !== id);
    if (send) enqueue({ type: 'caption-clear', id, revision });
    scheduleExpiry();
  }
  function clearQueue() {
    epoch++;
    clearTimeout(retry); clearTimeout(timeout); clearTimeout(expire);
    retry = timeout = expire = undefined;
    pending = []; sending = false;
  }
  return {
    transcript(text: string, final: boolean) {
      if (!active || !connected) return;
      text = text.trim().slice(0, 8000);
      if (!text) { if (!final) clearDraft(); return; }
      utterance = {
        id: utterance?.id ?? (o.id ?? (() => crypto.randomUUID()))(),
        speaker: o.speaker, role: 'hearing', kind: 'speech', text, final,
        ts: utterance?.ts ?? Date.now(), revision: (utterance?.revision ?? 0) + 1,
      };
      o.local(utterance);
      if (final) {
        cancelInterim();
        const finished = utterance; utterance = undefined;
        enqueue(finished);
      } else if (!interim) {
        interim = setTimeout(() => {
          interim = undefined;
          if (utterance) enqueue(utterance);
        }, 200);
      }
    },
    clearDraft,
    connection(on: boolean) {
      if (!active || connected === on) return;
      if (!on) {
        const lostFinal = pending.some(item => 'final' in item.value && item.value.final);
        // The other laptop can remain connected during our brief interruption.
        // Retain only clear IDs (no text) until this same room reconnects.
        reconnectClears = [...reconnectClears, ...pending.flatMap(item => 'type' in item.value ? [item.value] : [])];
        if (utterance) reconnectClears.push({ type: 'caption-clear', id: utterance.id, revision: utterance.revision! + 1 });
        if (reconnectClears.length > 20) { reconnectClears = reconnectClears.slice(-20); failed(); }
        clearDraft(false); clearQueue();
        if (lostFinal) failed();
      }
      connected = on;
      if (on) {
        const clears = reconnectClears; reconnectClears = [];
        clears.forEach(enqueue);
      }
    },
    dispose() { if (!active) return; clearDraft(false); active = false; connected = false; reconnectClears = []; clearQueue(); },
  };
}
