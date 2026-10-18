import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startScribe } from './scribe';
import type { Stt } from './stt';
import { createCallSpeech } from './callSpeech';
import { createSpeechCaptions } from './speechCaptions';
import { createCaptionHistory } from './captions';
import type { Caption } from './types';

const mock = vi.hoisted(() => {
  const events = new Map<string, (data?: unknown) => void>();
  const connection = { on: vi.fn(), close: vi.fn() };
  return { token: vi.fn(), connect: vi.fn(), events, connection };
});
vi.mock('./api', () => ({ getScribeToken: mock.token }));
vi.mock('@elevenlabs/client', () => ({
  Scribe: { connect: mock.connect }, CommitStrategy: { VAD: 'vad' },
  RealtimeEvents: Object.fromEntries(['SESSION_STARTED', 'PARTIAL_TRANSCRIPT', 'COMMITTED_TRANSCRIPT', 'ERROR', 'CLOSE', 'AUTH_ERROR', 'QUOTA_EXCEEDED', 'RATE_LIMITED', 'UNACCEPTED_TERMS', 'TRANSCRIBER_ERROR', 'INPUT_ERROR', 'QUEUE_OVERFLOW', 'RESOURCE_EXHAUSTED', 'SESSION_TIME_LIMIT_EXCEEDED', 'CHUNK_SIZE_EXCEEDED', 'INSUFFICIENT_AUDIO_ACTIVITY'].map(name => [name, name])),
}));
let sessions: Stt[];
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mock.events.clear(); sessions = [];
  mock.token.mockResolvedValue({ token: 'single-use-test-token' });
  mock.connection.on.mockImplementation((event, listener) => { mock.events.set(event, listener); return mock.connection; });
  mock.connect.mockReturnValue(mock.connection);
});
afterEach(() => { sessions.forEach(session => session.stop()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
const flush = () => vi.advanceTimersByTimeAsync(0);
function begin() {
  const text = vi.fn(), error = vi.fn(), state = vi.fn();
  const session = startScribe(text, error, state); sessions.push(session);
  return { session, text, error, state };
}

describe('ElevenLabs captions lifecycle', () => {
  it('fetches only a single-use token and waits for session readiness before delivering transcripts', async () => {
    const capture = begin();
    expect(capture.session.kind).toBe('scribe');
    expect(capture.state).toHaveBeenLastCalledWith('starting');
    await flush();
    expect(mock.connect).toHaveBeenCalledWith(expect.objectContaining({ token: 'single-use-test-token', modelId: 'scribe_v2_realtime', commitStrategy: 'vad', languageCode: 'en', microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }));
    mock.events.get('PARTIAL_TRANSCRIPT')?.({ text: 'too early' });
    expect(capture.text).not.toHaveBeenCalled();
    mock.events.get('SESSION_STARTED')?.();
    mock.events.get('PARTIAL_TRANSCRIPT')?.({ text: 'hello' });
    mock.events.get('COMMITTED_TRANSCRIPT')?.({ text: 'hello world' });
    expect(capture.state).toHaveBeenLastCalledWith('listening');
    expect(capture.text.mock.calls).toEqual([['hello', false], ['hello world', true]]);
    capture.session.stop();
    mock.events.get('COMMITTED_TRANSCRIPT')?.({ text: 'late' });
    expect(capture.text).toHaveBeenCalledTimes(2);
    expect(mock.connection.close).toHaveBeenCalledOnce();
  });
  it('cancels while a token is pending without opening a microphone or connection', async () => {
    let resolve!: (value: { token: string }) => void;
    mock.token.mockImplementation(() => new Promise(r => { resolve = r; }));
    const capture = begin(); capture.session.stop(); resolve({ token: 'late-token' });
    await flush();
    expect(mock.connect).not.toHaveBeenCalled();
    expect(capture.error).not.toHaveBeenCalled();
  });
  it.each([['AUTH_ERROR', 'API key'], ['QUOTA_EXCEEDED', 'quota'], ['RATE_LIMITED', 'busy'], ['UNACCEPTED_TERMS', 'terms']])('fails clearly on %s and releases resources', async (event, message) => {
    const capture = begin(); await flush(); mock.events.get('SESSION_STARTED')?.();
    mock.events.get(event)?.({ error: 'untrusted-provider-details-and-token' });
    expect(capture.state).toHaveBeenLastCalledWith('failed');
    expect(capture.error.mock.lastCall?.[0]).toContain(message);
    expect(capture.error.mock.lastCall?.[0]).not.toContain('untrusted');
    expect(mock.connection.close).toHaveBeenCalledOnce();
  });
  it('reports token endpoint failure without exposing server details or falling back to browser recognition', async () => {
    mock.token.mockRejectedValue(new Error('secret upstream details'));
    const capture = begin(); await flush();
    expect(capture.error.mock.lastCall?.[0]).toContain('ElevenLabs');
    expect(capture.error.mock.lastCall?.[0]).not.toContain('secret');
    expect(mock.connect).not.toHaveBeenCalled();
  });
  it('fails a hung startup and a remote close, and ignores late provider events', async () => {
    const capture = begin(); await flush();
    await vi.advanceTimersByTimeAsync(20000);
    expect(capture.state).toHaveBeenLastCalledWith('failed');
    expect(mock.connection.close).toHaveBeenCalledOnce();
    mock.events.get('SESSION_STARTED')?.();
    expect(capture.state).toHaveBeenLastCalledWith('failed');
    const next = begin(); await flush(); mock.events.get('SESSION_STARTED')?.();
    mock.events.get('CLOSE')?.();
    expect(next.state).toHaveBeenLastCalledWith('failed');
    expect(next.error.mock.lastCall?.[0]).toContain('closed');
  });

  it('uses ElevenLabs by default in calls, sends captions to the peer, and closes on mute', async () => {
    let remoteRows: Caption[] = [];
    const history = createCaptionHistory(rows => { remoteRows = rows; });
    const error = vi.fn();
    const sender = createSpeechCaptions({
      speaker: 'Synthetic test', local: vi.fn(), remove: vi.fn(), onError: error,
      send: async message => { if ('type' in message) history.clear(message.id, message.revision, 'peer'); else history.receive(message, 'peer'); },
    });
    const capture = createCallSpeech({ role: 'hearing', transcript: sender.transcript, clearDraft: sender.clearDraft, onState: vi.fn(), onError: error });
    try {
      sender.connection(true); capture.connection(true); capture.consent(true); capture.enable(true);
      await flush();
      expect(mock.connect).toHaveBeenCalledOnce();
      mock.events.get('SESSION_STARTED')?.();
      mock.events.get('PARTIAL_TRANSCRIPT')?.({ text: 'test' });
      await vi.advanceTimersByTimeAsync(200);
      expect(remoteRows).toMatchObject([{ text: 'test', final: false }]);
      mock.events.get('COMMITTED_TRANSCRIPT')?.({ text: 'test sentence' });
      await flush();
      expect(remoteRows).toMatchObject([{ text: 'test sentence', final: true }]);
      capture.mute(true);
      expect(mock.connection.close).toHaveBeenCalledOnce();
      mock.events.get('COMMITTED_TRANSCRIPT')?.({ text: 'late' }); await flush();
      expect(remoteRows).toHaveLength(1);
    } finally { capture.dispose(); sender.dispose(); }
  });
});
