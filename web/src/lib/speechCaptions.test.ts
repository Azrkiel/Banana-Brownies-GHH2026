import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpeechCaptions } from './speechCaptions';

let instances: ReturnType<typeof createSpeechCaptions>[];
beforeEach(() => { vi.useFakeTimers(); instances = []; });
afterEach(() => { instances.forEach(x => x.dispose()); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
function setup() {
  let id = 0;
  const o = { speaker: 'Test', local: vi.fn(), remove: vi.fn(), send: vi.fn<Parameters<typeof createSpeechCaptions>[0]['send']>().mockResolvedValue(), onError: vi.fn(), id: () => `id-${++id}` };
  const sender = createSpeechCaptions(o); instances.push(sender); sender.connection(true);
  return { sender, ...o };
}
describe('speech caption delivery', () => {
  it('updates local drafts immediately and coalesces the latest remote interim at 200ms', async () => {
    const { sender, send, local } = setup();
    sender.transcript('one', false); sender.transcript('one two', false);
    expect(local).toHaveBeenCalledTimes(2); expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ text: 'one two', revision: 2, final: false }));
  });
  it('does not delay a final behind its scheduled interim and keeps the same ID', async () => {
    const { sender, send, local } = setup();
    sender.transcript('hello', false); sender.transcript('hello world', true);
    await vi.advanceTimersByTimeAsync(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ id: local.mock.calls[0][0].id, final: true, revision: 2 }));
  });
  it('gives two legitimate identical phrases distinct IDs', () => {
    const { sender, local } = setup(); sender.transcript('Hello', true); sender.transcript('Hello', true);
    expect(local.mock.calls[0][0].id).not.toBe(local.mock.calls[1][0].id);
  });
  it('clears unfinished text locally and sends a terminal clear', async () => {
    const { sender, send, remove } = setup();
    sender.transcript('hello', false); sender.transcript('', false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(remove).toHaveBeenCalledWith('id-1', 2);
    expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'caption-clear', id: 'id-1', revision: 2 });
  });
  it('serializes a final behind an in-flight interim and sends the clear after it', async () => {
    const { sender, send } = setup(); let release!: () => void;
    send.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    sender.transcript('draft', false); await vi.advanceTimersByTimeAsync(200);
    sender.transcript('finished', true); sender.transcript('abandoned', false); sender.clearDraft();
    expect(send).toHaveBeenCalledTimes(1); release(); await vi.advanceTimersByTimeAsync(0);
    expect(send.mock.calls.map(([c]) => 'type' in c ? c.type : c.final)).toEqual([false, true, 'caption-clear']);
  });
  it('retries finals twice with stable IDs then reports failed delivery', async () => {
    const { sender, send, onError } = setup(); send.mockRejectedValue(new Error('offline'));
    sender.transcript('hello', true); await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(3); expect(onError).toHaveBeenCalledTimes(1);
    expect(new Set(send.mock.calls.map(([c]) => c.id)).size).toBe(1);
  });
  it('times out unresolved transport without hanging all future sends', async () => {
    const { sender, send, onError } = setup(); send.mockImplementation(() => new Promise(() => {}));
    sender.transcript('hello', true); await vi.advanceTimersByTimeAsync(17000);
    expect(send).toHaveBeenCalledTimes(3); expect(onError).toHaveBeenCalledTimes(1);
  });
  it('bounds the final queue and reports overflow rather than silently dropping it', () => {
    const { sender, send, onError } = setup(); send.mockImplementation(() => new Promise(() => {}));
    for (let i = 0; i < 21; i++) sender.transcript('hello', true);
    expect(send).toHaveBeenCalledTimes(1); expect(onError).toHaveBeenCalledTimes(1);
  });
  it('expires unsent queued phrases after 30 seconds', async () => {
    const { sender, send, onError } = setup(); send.mockImplementation(() => new Promise(() => {}));
    for (let i = 0; i < 5; i++) sender.transcript('hello', true);
    await vi.advanceTimersByTimeAsync(30000);
    expect(onError).toHaveBeenCalled();
    const count = send.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30000); expect(send).toHaveBeenCalledTimes(count);
  });
  it('discards queued work on reconnect and never replays it into a new session', async () => {
    const { sender, send, onError, remove } = setup(); send.mockImplementation(() => new Promise(() => {}));
    sender.transcript('final', true); sender.transcript('draft', false);
    sender.connection(false); sender.connection(true); await vi.advanceTimersByTimeAsync(60000);
    expect(send.mock.calls.filter(([c]) => 'final' in c)).toHaveLength(1);
    expect(send).toHaveBeenCalledWith({ type: 'caption-clear', id: 'id-2', revision: 2 });
    expect(remove).toHaveBeenCalled(); expect(onError).toHaveBeenCalled();
  });
  it('clears a remote stale draft after a brief reconnect even if the peer never left', async () => {
    const { sender, send } = setup(); sender.transcript('draft', false);
    await vi.advanceTimersByTimeAsync(200);
    sender.connection(false); sender.connection(true); await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenLastCalledWith({ type: 'caption-clear', id: 'id-1', revision: 2 });
  });
  it('ignores late send failures and transcripts after disposal', async () => {
    const { sender, send, local, onError } = setup(); let reject!: (e: Error) => void;
    send.mockImplementation(() => new Promise<void>((_, no) => { reject = no; }));
    sender.transcript('hello', true); sender.dispose(); reject(new Error('late'));
    sender.transcript('late', true); await vi.advanceTimersByTimeAsync(60000);
    expect(local).toHaveBeenCalledTimes(1); expect(send).toHaveBeenCalledTimes(1); expect(onError).not.toHaveBeenCalled();
  });
});
