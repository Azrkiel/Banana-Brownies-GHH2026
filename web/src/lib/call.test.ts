import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteTrack } from 'livekit-client';
import { joinCall, type CallHandlers } from './call';
import type { Caption } from './types';

const mock = vi.hoisted(() => {
  const events = new Map<string, (...args: unknown[]) => void>();
  const streams = new Map<string, (reader: unknown, info: unknown) => Promise<void>>();
  const participant = { publishTrack: vi.fn(), setMicrophoneEnabled: vi.fn(), sendText: vi.fn() };
  const room = {
    on: vi.fn(), registerTextStreamHandler: vi.fn(), connect: vi.fn(), disconnect: vi.fn(),
    localParticipant: participant, remoteParticipants: new Map(), canPlaybackAudio: true,
  };
  return { events, streams, room, participant, token: vi.fn(), makeRoom: vi.fn() };
});

vi.mock('./api', () => ({ getToken: mock.token }));
vi.mock('livekit-client', () => ({
  Room: class { constructor(options: unknown) { mock.makeRoom(options); return mock.room; } },
  RoomEvent: {
    TrackSubscribed: 'subscribed', TrackUnsubscribed: 'unsubscribed',
    ParticipantConnected: 'peer-joined', ParticipantDisconnected: 'peer-left',
    Reconnecting: 'reconnecting', Reconnected: 'reconnected', Disconnected: 'disconnected',
    AudioPlaybackStatusChanged: 'audio',
  },
  Track: { Kind: { Video: 'video', Audio: 'audio' }, Source: { Camera: 'camera', Microphone: 'microphone' } },
}));

const camera = { kind: 'video' } as MediaStreamTrack;
const handlers = (): CallHandlers => ({ onCaption: vi.fn(), onCtrl: vi.fn(), onRemoteVideo: vi.fn(), onStatus: vi.fn(), onPeer: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  mock.events.clear(); mock.streams.clear(); mock.room.remoteParticipants.clear();
  mock.room.canPlaybackAudio = true;
  mock.token.mockResolvedValue({ token: 'test-token', url: 'wss://test.invalid' });
  mock.room.connect.mockResolvedValue(undefined);
  mock.room.disconnect.mockResolvedValue(undefined);
  mock.participant.publishTrack.mockResolvedValue(undefined);
  mock.participant.setMicrophoneEnabled.mockResolvedValue(undefined);
  mock.participant.sendText.mockResolvedValue(undefined);
  mock.room.on.mockImplementation((event, handler) => { mock.events.set(event, handler); return mock.room; });
  mock.room.registerTextStreamHandler.mockImplementation((topic, handler) => { mock.streams.set(topic, handler); });
  vi.stubGlobal('document', { body: { appendChild: vi.fn() } });
});
afterEach(() => { vi.unstubAllGlobals(); });

function options(h = handlers()) { return { room: 'demo-room', name: 'Kev', role: 'signer' as const, camera, h }; }

describe('LiveKit call lifecycle', () => {
  it('publishes the supplied camera once and leaves the signer microphone off', async () => {
    const h = handlers();
    await joinCall(options(h));
    expect(mock.token).toHaveBeenCalledWith('demo-room', 'Kev', 'signer');
    expect(mock.participant.publishTrack).toHaveBeenCalledExactlyOnceWith(camera, { source: 'camera' });
    expect(mock.participant.setMicrophoneEnabled).not.toHaveBeenCalled();
    expect(h.onStatus).toHaveBeenCalledWith('connected');
  });
  it('enables the hearing participant microphone and publishes optional synthesized voice', async () => {
    const voice = { kind: 'audio' } as MediaStreamTrack;
    await joinCall({ ...options(), role: 'hearing', voice });
    expect(mock.participant.publishTrack).toHaveBeenCalledWith(voice, { source: 'microphone', name: 'voice' });
    expect(mock.participant.setMicrophoneEnabled).toHaveBeenCalledExactlyOnceWith(true);
  });
  it('disconnects a partially connected room when media publication fails', async () => {
    mock.participant.publishTrack.mockRejectedValueOnce(new Error('permission denied'));
    const h = handlers();
    await expect(joinCall(options(h))).rejects.toThrow('permission denied');
    expect(mock.room.disconnect).toHaveBeenCalled();
    expect(h.onRemoteVideo).toHaveBeenCalledWith(null);
    expect(h.onStatus).not.toHaveBeenCalledWith('connected');
  });
  it('does not construct a room when token issuance fails', async () => {
    mock.token.mockRejectedValueOnce(new Error('API unavailable'));
    await expect(joinCall(options())).rejects.toThrow('API unavailable');
    expect(mock.makeRoom).not.toHaveBeenCalled();
  });
  it('does not publish media after joining was cancelled', async () => {
    const abort = new AbortController();
    mock.room.connect.mockImplementationOnce(async () => { abort.abort(); });
    await expect(joinCall({ ...options(), signal: abort.signal })).rejects.toThrow();
    expect(mock.participant.publishTrack).not.toHaveBeenCalled();
    expect(mock.room.disconnect).toHaveBeenCalled();
  });
  it('removes attached remote audio on leave and reports remote video removal', async () => {
    const h = handlers();
    const call = await joinCall(options(h));
    const element = { style: {}, remove: vi.fn() };
    const track = { kind: 'audio', attach: () => element };
    mock.events.get('subscribed')?.(track);
    expect(document.body.appendChild).toHaveBeenCalledWith(element);
    await call.leave();
    expect(element.remove).toHaveBeenCalled();
    expect(h.onRemoteVideo).toHaveBeenLastCalledWith(null);
  });
  it('sends captions and control messages on their respective topics', async () => {
    const call = await joinCall(options());
    const caption: Caption = { id: 'a', text: 'Hello', speaker: 'Kev', role: 'signer', kind: 'english', final: true, ts: 1 };
    await call.sendCaption(caption);
    await call.sendCtrl({ type: 'attention' });
    expect(mock.participant.sendText).toHaveBeenCalledWith(JSON.stringify(caption), { topic: 'caption' });
    expect(mock.participant.sendText).toHaveBeenCalledWith('{"type":"attention"}', { topic: 'ctrl' });
  });
  it('receives captions and control messages without crashing on invalid JSON', async () => {
    const h = handlers();
    await joinCall(options(h));
    const caption = { id: 'a', text: 'Hello' };
    await mock.streams.get('caption')?.({ readAll: async () => JSON.stringify(caption) }, {});
    expect(h.onCaption).toHaveBeenCalledWith(caption);
    await mock.streams.get('ctrl')?.({ readAll: async () => '{"type":"attention"}' }, { identity: 'peer' });
    expect(h.onCtrl).toHaveBeenCalledWith({ type: 'attention' }, 'peer');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(mock.streams.get('caption')?.({ readAll: async () => 'bad json' }, {})).resolves.toBeUndefined();
    warning.mockRestore();
  });
  it('reports reconnecting, reconnected, audio blocked and disconnected states', async () => {
    const h = handlers();
    await joinCall(options(h));
    mock.events.get('reconnecting')?.();
    expect(h.onStatus).toHaveBeenLastCalledWith('reconnecting');
    mock.events.get('reconnected')?.();
    expect(h.onStatus).toHaveBeenLastCalledWith('connected');
    mock.room.canPlaybackAudio = false;
    mock.events.get('audio')?.();
    expect(h.onStatus).toHaveBeenLastCalledWith('audio-blocked');
    mock.room.canPlaybackAudio = true;
    mock.events.get('audio')?.();
    expect(h.onStatus).toHaveBeenLastCalledWith('connected');
    mock.events.get('disconnected')?.();
    expect(h.onStatus).toHaveBeenLastCalledWith('disconnected');
  });
  it('attaches remote video through the supplied handler', async () => {
    const h = handlers();
    await joinCall(options(h));
    const track = { kind: 'video', detach: () => [] } as unknown as RemoteTrack;
    mock.events.get('subscribed')?.(track);
    expect(h.onRemoteVideo).toHaveBeenLastCalledWith(track);
    mock.events.get('unsubscribed')?.(track);
    expect(h.onRemoteVideo).toHaveBeenLastCalledWith(null);
  });
});
