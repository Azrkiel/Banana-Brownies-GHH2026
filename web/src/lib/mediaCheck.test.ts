import { describe, expect, it, vi } from 'vitest';
import { createMediaCheck, type DeviceCheck } from './mediaCheck';

function media() {
  const track = new EventTarget() as MediaStreamTrack;
  Object.assign(track, { readyState: 'live', stop: vi.fn() });
  return { track, stream: { getTracks: () => [track] } as unknown as MediaStream };
}

describe('pre-call device checks', () => {
  it('starts only requested devices, keeping a working camera when mic permission fails', async () => {
    const camera = media();
    const acquire = vi.fn().mockResolvedValueOnce(camera.stream).mockRejectedValueOnce(new DOMException('', 'NotAllowedError'));
    const state: Partial<Record<'camera' | 'microphone', DeviceCheck>> = {};
    const check = createMediaCheck((kind, next) => { state[kind] = next; }, acquire);
    expect(acquire).not.toHaveBeenCalled();
    await check.start('camera');
    await check.start('microphone');
    expect(acquire.mock.calls).toEqual([[{ video: { width: 640, height: 480, frameRate: 30 }, audio: false }], [{ video: false, audio: true }]]);
    expect(state.camera?.stream).toBe(camera.stream);
    expect(state.microphone?.error).toContain('Allow microphone access');
    expect(camera.track.stop).not.toHaveBeenCalled();
    check.dispose();
    expect(camera.track.stop).toHaveBeenCalledOnce();
  });

  it('stops late permission grants after cancellation without replacing a newer preview', async () => {
    let resolve!: (stream: MediaStream) => void;
    const old = media(), fresh = media();
    const acquire = vi.fn().mockImplementationOnce(() => new Promise<MediaStream>(r => { resolve = r; })).mockResolvedValueOnce(fresh.stream);
    const update = vi.fn();
    const check = createMediaCheck(update, acquire);
    const pending = check.start('camera');
    check.stop('camera');
    await check.start('camera');
    resolve(old.stream);
    await pending;
    expect(old.track.stop).toHaveBeenCalledOnce();
    expect(fresh.track.stop).not.toHaveBeenCalled();
    expect(update).toHaveBeenLastCalledWith('camera', { status: 'ready', stream: fresh.stream, error: '' });
    check.dispose();
  });

  it('ignores duplicate requests and cleans up late grants after disposal', async () => {
    let resolve!: (stream: MediaStream) => void;
    const camera = media();
    const acquire = vi.fn(() => new Promise<MediaStream>(r => { resolve = r; }));
    const update = vi.fn();
    const check = createMediaCheck(update, acquire);
    const pending = check.start('camera');
    await check.start('camera');
    expect(acquire).toHaveBeenCalledOnce();
    check.dispose();
    update.mockClear();
    resolve(camera.stream);
    await pending;
    expect(camera.track.stop).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    await check.start('microphone');
    expect(acquire).toHaveBeenCalledOnce();
  });

  it('invalidates readiness when a device disconnects and permits retry', async () => {
    const first = media(), second = media();
    const update = vi.fn();
    const check = createMediaCheck(update, vi.fn().mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream));
    await check.start('camera');
    first.track.dispatchEvent(new Event('ended'));
    expect(update.mock.lastCall?.[1]).toMatchObject({ status: 'idle', stream: null });
    await check.start('camera');
    expect(update.mock.lastCall?.[1]).toMatchObject({ status: 'ready', stream: second.stream });
    check.dispose();
  });

  it('handles unavailable media APIs and can retry after permission denial', async () => {
    const update = vi.fn();
    const microphone = media();
    const acquire = vi.fn().mockRejectedValueOnce(new DOMException('', 'NotAllowedError')).mockResolvedValueOnce(microphone.stream);
    const check = createMediaCheck(update, acquire);
    await check.start('microphone');
    expect(update.mock.lastCall?.[1].status).toBe('error');
    await check.start('microphone');
    expect(update.mock.lastCall?.[1].status).toBe('ready');
    check.stop('microphone');
    expect(microphone.track.stop).toHaveBeenCalledOnce();
    check.dispose();
    const unavailable = createMediaCheck(update, async () => { throw new Error('unavailable'); });
    await unavailable.start('camera');
    expect(update.mock.lastCall?.[1].error).toContain('HTTPS');
    unavailable.dispose();
  });

  it('stops camera and microphone independently and rejects already-ended streams', async () => {
    const camera = media(), microphone = media(), ended = media();
    Object.assign(ended.track, { readyState: 'ended' });
    const update = vi.fn();
    const check = createMediaCheck(update, vi.fn().mockResolvedValueOnce(camera.stream).mockResolvedValueOnce(microphone.stream).mockResolvedValueOnce(ended.stream));
    await check.start('camera');
    await check.start('microphone');
    check.stop('camera');
    expect(camera.track.stop).toHaveBeenCalledOnce();
    expect(microphone.track.stop).not.toHaveBeenCalled();
    await check.start('camera');
    expect(ended.track.stop).toHaveBeenCalledOnce();
    expect(update).toHaveBeenLastCalledWith('camera', { status: 'idle', stream: null, error: '' });
    check.dispose();
    expect(microphone.track.stop).toHaveBeenCalledOnce();
  });
});
