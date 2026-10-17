import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCallSpeech } from './callSpeech';
import type { startWebSpeech } from './stt';

let instances: ReturnType<typeof createCallSpeech>[];
beforeEach(() => { vi.useFakeTimers(); instances = []; });
afterEach(() => { instances.forEach(x => x.dispose()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
function setup(role: 'hearing' | 'signer' = 'hearing') {
  const handles: { stop: ReturnType<typeof vi.fn> }[] = [];
  const start = vi.fn<typeof startWebSpeech>(() => { const handle = { kind: 'webspeech' as const, stop: vi.fn() }; handles.push(handle); return handle; });
  const o = { role, start, transcript: vi.fn(), clearDraft: vi.fn(), onState: vi.fn(), onError: vi.fn() };
  const session = createCallSpeech(o); instances.push(session);
  const enable = () => { session.connection(true); session.consent(true); session.enable(true); };
  return { session, enable, handles, ...o };
}
describe('call speech ownership', () => {
  it('requires connection, consent and an explicit enable; joining/consent alone never starts', () => {
    const { session, start } = setup(); session.enable(true); session.connection(true); session.consent(true);
    expect(start).not.toHaveBeenCalled(); session.enable(true); expect(start).toHaveBeenCalledTimes(1);
  });
  it('never starts for a signer', () => { const { enable, start } = setup('signer'); enable(); expect(start).not.toHaveBeenCalled(); });
  it('keeps a single active recognizer across repeated updates and enable clicks', () => {
    const { session, enable, start } = setup(); enable(); session.enable(true); session.connection(true); session.mute(false);
    expect(start).toHaveBeenCalledTimes(1);
  });
  it('stops on mute and resumes once on unmute while intent remains enabled', () => {
    const { session, enable, start, handles } = setup(); enable(); session.mute(true);
    expect(handles[0].stop).toHaveBeenCalledTimes(1); session.mute(false); expect(start).toHaveBeenCalledTimes(2);
  });
  it('does not resume after explicit disable while muted', () => {
    const { session, enable, start } = setup(); enable(); session.mute(true); session.enable(false); session.mute(false);
    expect(start).toHaveBeenCalledTimes(1);
  });
  it('stops on disconnect, ignores old callbacks, and starts once when reconnected', () => {
    const { session, enable, start, handles, transcript } = setup(); enable(); session.connection(false);
    start.mock.calls[0][0]('late', true); expect(transcript).not.toHaveBeenCalled();
    expect(handles[0].stop).toHaveBeenCalledTimes(1); session.connection(true); expect(start).toHaveBeenCalledTimes(2);
  });
  it('revoking consent disables intent and does not resume just by reconsenting', () => {
    const { session, enable, start } = setup(); enable(); session.consent(false); session.consent(true);
    expect(start).toHaveBeenCalledTimes(1);
  });
  it('terminal permission failure needs explicit start, preserving the subsequent error callback', () => {
    const { session, enable, start, onError, transcript } = setup(); enable();
    start.mock.calls[0][2]?.('failed'); start.mock.calls[0][1]('Permission blocked');
    start.mock.calls[0][0]('late', true); session.connection(true);
    expect(onError).toHaveBeenCalledWith('Permission blocked'); expect(transcript).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1); session.enable(true); expect(start).toHaveBeenCalledTimes(2);
  });
  it('handles synchronous failure during startup and closes the returned handle', () => {
    const { start, enable, onState } = setup(); const stop = vi.fn();
    start.mockImplementationOnce((_, error, state) => { state?.('failed'); error('unavailable'); return { kind: 'webspeech', stop }; });
    enable(); expect(onState).toHaveBeenLastCalledWith('failed'); expect(stop).toHaveBeenCalledTimes(1);
  });
  it('uses voice lifecycle signals to pause capture and waits for all speakers to finish', () => {
    const { session, enable, start, handles } = setup(); enable();
    session.playback('one', true); session.playback('two', true);
    expect(handles[0].stop).toHaveBeenCalledTimes(1);
    session.playback('one', false); expect(start).toHaveBeenCalledTimes(1);
    session.playback('two', false); expect(start).toHaveBeenCalledTimes(2);
  });
  it('a missing voice finish fails closed rather than silently resuming into feedback', async () => {
    const { session, enable, start, onState, onError } = setup(); enable(); session.playback('peer', true);
    await vi.advanceTimersByTimeAsync(30000); expect(onState).toHaveBeenLastCalledWith('failed');
    expect(onError).toHaveBeenCalled(); session.playback('peer', false); expect(start).toHaveBeenCalledTimes(1);
  });
  it('unmount/dispose cancels playback timers and ignores every late callback', async () => {
    const { session, enable, start, onState, onError, transcript } = setup(); enable(); session.playback('peer', true);
    session.dispose(); const count = onState.mock.calls.length;
    start.mock.calls[0][0]('late', true); start.mock.calls[0][1]('late'); start.mock.calls[0][2]?.('listening');
    session.connection(true); session.enable(true); await vi.advanceTimersByTimeAsync(60000);
    expect(onState).toHaveBeenCalledTimes(count); expect(onError).not.toHaveBeenCalled(); expect(transcript).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
  });
});
