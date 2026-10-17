import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCaptionHistory } from './captions';
import { createSpeechCaptions } from './speechCaptions';
import { createCallSpeech } from './callSpeech';
import type { Caption } from './types';
import type { startWebSpeech } from './stt';

let cleanups: (() => void)[];
beforeEach(() => { vi.useFakeTimers(); cleanups = []; });
afterEach(() => { cleanups.forEach(fn => fn()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
function setup() {
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
  const capture = createCallSpeech({ role: 'hearing', start, transcript: sender.transcript, clearDraft: sender.clearDraft, onState: vi.fn(), onError: error });
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
