import { startWebSpeech, type Stt, type SttState } from './stt';
import type { Role } from './types';

export type CallSpeechState = SttState | 'disabled' | 'paused';
type Options = {
  role: Role;
  transcript(text: string, final: boolean): void;
  clearDraft(): void;
  onState(state: CallSpeechState): void;
  onError(message: string): void;
  start?: typeof startWebSpeech;
};

/** Explicit user intent is separate from current permission/connectivity. One owner
 * reserves startup before synchronous callbacks, and invalidates every old callback.
 */
export function createCallSpeech(o: Options) {
  let active = true, connected = false, consented = false, enabled = false, muted = false;
  let session: Stt | null = null;
  let running = false, epoch = 0;
  const playback = new Map<string, ReturnType<typeof setTimeout>>();
  function stop() {
    epoch++;
    running = false;
    const previous = session; session = null;
    previous?.stop();
    o.clearDraft();
  }
  function reconcile() {
    if (!active) return;
    if (!enabled || !consented || o.role !== 'hearing') {
      stop(); o.onState('disabled'); return;
    }
    if (!connected || muted || playback.size) {
      stop(); o.onState('paused'); return;
    }
    if (running) return;
    const attempt = ++epoch;
    const current = () => active && epoch === attempt;
    running = true;
    const handle = (o.start ?? startWebSpeech)(
      (text, final) => { if (current() && running) o.transcript(text, final); },
      message => { if (current()) o.onError(message); },
      state => {
        if (!current() || !running) return;
        if (state === 'failed' || state === 'stopped') {
          enabled = false; running = false; session = null; o.clearDraft();
        }
        o.onState(state);
      },
    );
    if (!current() || !running) { handle?.stop(); return; }
    session = handle;
    if (!handle) { enabled = false; running = false; o.onState('failed'); }
  }
  return {
    consent(on: boolean) { consented = on; if (!on) enabled = false; reconcile(); },
    enable(on: boolean) { enabled = on && consented && connected && !muted && o.role === 'hearing'; reconcile(); },
    connection(on: boolean) { connected = on; reconcile(); },
    mute(on: boolean) { muted = on; reconcile(); },
    playback(from: string, on: boolean) {
      if (!active || !from) return;
      clearTimeout(playback.get(from)); playback.delete(from);
      if (on) playback.set(from, setTimeout(() => {
        playback.delete(from); enabled = false; stop();
        o.onState('failed');
        o.onError('Voice playback did not finish. Check that playback has stopped, then start captions again.');
      }, 30000));
      reconcile();
    },
    dispose() {
      if (!active) return;
      active = false; enabled = false; stop();
      for (const timer of playback.values()) clearTimeout(timer);
      playback.clear();
    },
  };
}
