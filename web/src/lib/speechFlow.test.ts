import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCaptionHistory } from './captions';
import { createSpeechCaptions } from './speechCaptions';
import { createCallSpeech } from './callSpeech';
import type { Caption } from './types';
import { startWebSpeech } from './stt';

let cleanups: (() => void)[];
beforeEach(() => { vi.useFakeTimers(); cleanups = []; });
afterEach(() => { cleanups.forEach(fn => fn()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup(useSharedAdapter = false) {
  let localRows: Caption[] = [], remoteRows: Caption[] = [];
  const local = createCaptionHistory(rows => { localRows = rows; });
  const remote = createCaptionHistory(rows => { remoteRows = rows; });
  const error = vi.fn();
  const sender = createSpeechCaptions({
    speaker: 'Neutral test', local: c => local.receive(c, 'self'), remove: (id, rev) => local.clear(id, rev, 'self'),
    send: async c => { if ('type' in c) remote.clear(c.id, c.revision, 'sender-identity'); else remote.receive(c, 'sender-identity'); },
    onError: error,
  });
  const start = vi.fn<typeof startWebSpeech>(() => ({ kind: 'webspeech', stop: vi.fn() }));
  const capture = createCallSpeech({ role: 'hearing', start: useSharedAdapter ? startWebSpeech : start, transcript: sender.transcript, clearDraft: sender.clearDraft, onState: vi.fn(), onError: error });
  sender.connection(true); capture.connection(true); capture.consent(true); capture.enable(true);
  cleanups.push(() => { capture.dispose(); sender.dispose(); });
  const say = (text: string, final: boolean) => start.mock.calls.at(-1)![0](text, final);
  return { sender, capture, say, start, error, localRows: () => localRows, remoteRows: () => remoteRows };
}
describe('recognition to room caption flow (mock transport)', () => {
  it('revises a remote draft into one final and keeps legitimate repeated speech', async () => {
    const flow = setup(); flow.say('hello', false); await vi.advanceTimersByTimeAsync(200);
    expect(flow.remoteRows()[0].final).toBe(false);
    flow.say('hello world', true); flow.say('hello world', true); await vi.advanceTimersByTimeAsync(0);
    expect(flow.localRows()).toHaveLength(2); expect(flow.remoteRows()).toHaveLength(2);
    expect(flow.remoteRows().every(c => c.final && c.text === 'hello world')).toBe(true);
    expect(flow.error).not.toHaveBeenCalled();
  });
  it('explicit captions disable clears both screens without erasing finished speech', async () => {
    const flow = setup(); flow.say('finished', true); flow.say('unfinished', false);
    await vi.advanceTimersByTimeAsync(200); flow.capture.enable(false); await vi.advanceTimersByTimeAsync(0);
    expect(flow.localRows().map(c => c.text)).toEqual(['finished']);
    expect(flow.remoteRows().map(c => c.text)).toEqual(['finished']);
  });
  it('mute clears the draft, ignores late recognition and resumes with a fresh utterance', async () => {
    const flow = setup(); flow.say('old draft', false); await vi.advanceTimersByTimeAsync(200);
    const oldText = flow.start.mock.calls[0][0]; flow.capture.mute(true);
    oldText('late final', true); await vi.advanceTimersByTimeAsync(0);
    expect(flow.remoteRows()).toEqual([]);
    flow.capture.mute(false); flow.say('new phrase', true); await vi.advanceTimersByTimeAsync(0);
    expect(flow.remoteRows().map(c => c.text)).toEqual(['new phrase']);
  });
});

describe('optional browser recognizer adapter wired to room captions', () => {
  function browser() {
    const recognizers: Recognition[] = [];
    class Recognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onresult: ((event: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null = null;
      constructor() { recognizers.push(this); }
      start() { this.onstart?.(); }
      abort() { this.onend?.(); }
      say(text: string, final: boolean) {
        this.onresult?.({ resultIndex: 0, results: [{ isFinal: final, 0: { transcript: text } }] });
      }
    }
    vi.stubGlobal('window', { SpeechRecognition: Recognition });
    return recognizers;
  }

  it('delivers browser-adapter drafts and finals through room captions', async () => {
    const recognizers = browser();
    const flow = setup(true);
    expect(recognizers).toHaveLength(1);
    expect(recognizers[0]).toMatchObject({ continuous: true, interimResults: true, lang: 'en-US' });
    recognizers[0].say('hello', false);
    await vi.advanceTimersByTimeAsync(200);
    expect(flow.remoteRows()).toMatchObject([{ text: 'hello', final: false }]);
    recognizers[0].say('hello from the speech check engine', true);
    await vi.advanceTimersByTimeAsync(0);
    expect(flow.localRows()).toMatchObject([{ text: 'hello from the speech check engine', final: true }]);
    expect(flow.remoteRows()).toMatchObject([{ text: 'hello from the speech check engine', final: true }]);
    expect(flow.error).not.toHaveBeenCalled();
  });

  it('reproduces the screenshot error in both standalone and call paths on provider network failure', async () => {
    const recognizers = browser();
    const standaloneText = vi.fn(), standaloneError = vi.fn();
    const standalone = startWebSpeech(standaloneText, standaloneError);
    cleanups.push(() => standalone?.stop());
    const flow = setup(true);
    for (const delay of [1000, 2000, 4000, 0]) {
      // Both paths receive the same external browser-service failure.
      for (const recognizer of recognizers.slice(-2)) recognizer.onerror?.({ error: 'network' });
      await vi.advanceTimersByTimeAsync(delay);
    }
    expect(standaloneError.mock.lastCall?.[0]).toContain('could not connect after three retries');
    expect(flow.error.mock.lastCall).toEqual(standaloneError.mock.lastCall);
    expect(standaloneText).not.toHaveBeenCalled();
    expect(flow.localRows()).toEqual([]);
    expect(flow.remoteRows()).toEqual([]);
    expect(recognizers).toHaveLength(8);
  });
});
