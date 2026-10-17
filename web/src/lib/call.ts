import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';
import { getToken } from './api';
import type { Caption, Ctrl, Role } from './types';

export type CallStatus = 'connected' | 'reconnecting' | 'disconnected' | 'audio-blocked';
export type CallHandlers = {
  onCaption(c: Caption): void;
  onCtrl(m: Ctrl, fromIdentity: string): void;
  onRemoteVideo(track: RemoteTrack | null): void;
  onStatus(s: CallStatus): void;
  onPeer(name: string | null): void;
};
export type Call = {
  room: Room;
  sendCaption(c: Caption): Promise<void>;
  sendCtrl(m: Ctrl): Promise<void>;
  leave(): Promise<void>;
};

export async function joinCall(o: {
  room: string; name: string; role: Role;
  camera: MediaStreamTrack;
  voice?: MediaStreamTrack;
  signal?: AbortSignal;
  h: CallHandlers;
}): Promise<Call> {
  const { token, url } = await getToken(o.room, o.name, o.role);
  o.signal?.throwIfAborted();
  const room = new Room({ adaptiveStream: true, dynacast: true });
  let ready = false;
  const abort = () => { void room.disconnect().catch(() => {}); };
  o.signal?.addEventListener('abort', abort, { once: true });
  const audioElements = new Set<HTMLMediaElement>();
  const clearMedia = () => {
    for (const element of audioElements) element.remove();
    audioElements.clear();
    o.h.onRemoteVideo(null);
    o.h.onPeer(null);
  };

  room
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video) o.h.onRemoteVideo(track);
      if (track.kind === Track.Kind.Audio) {
        const element = track.attach();
        element.style.display = 'none';
        document.body.appendChild(element);
        audioElements.add(element);
      }
    })
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video) o.h.onRemoteVideo(null);
      track.detach().forEach(element => {
        audioElements.delete(element);
        element.remove();
      });
    })
    .on(RoomEvent.ParticipantConnected, p => o.h.onPeer(p.name || p.identity))
    .on(RoomEvent.ParticipantDisconnected, () => {
      o.h.onPeer(null);
      o.h.onRemoteVideo(null);
    })
    .on(RoomEvent.Reconnecting, () => o.h.onStatus('reconnecting'))
    .on(RoomEvent.Reconnected, () => o.h.onStatus('connected'))
    .on(RoomEvent.Disconnected, () => {
      clearMedia();
      o.signal?.removeEventListener('abort', abort);
      if (ready) o.h.onStatus('disconnected');
    })
    .on(RoomEvent.AudioPlaybackStatusChanged, () => {
      o.h.onStatus(room.canPlaybackAudio ? 'connected' : 'audio-blocked');
    });

  room.registerTextStreamHandler('caption', async reader => {
    try { o.h.onCaption(JSON.parse(await reader.readAll()) as Caption); }
    catch { console.warn('Could not read a caption message.'); }
  });
  room.registerTextStreamHandler('ctrl', async (reader, info) => {
    try { o.h.onCtrl(JSON.parse(await reader.readAll()) as Ctrl, info.identity); }
    catch { console.warn('Could not read a call control message.'); }
  });

  try {
    await room.connect(url, token);
    o.signal?.throwIfAborted();
    await room.localParticipant.publishTrack(o.camera, { source: Track.Source.Camera });
    o.signal?.throwIfAborted();
    if (o.voice) await room.localParticipant.publishTrack(o.voice, { source: Track.Source.Microphone, name: 'voice' });
    o.signal?.throwIfAborted();
    if (o.role === 'hearing') await room.localParticipant.setMicrophoneEnabled(true);
    o.signal?.throwIfAborted();
    ready = true;
    for (const peer of room.remoteParticipants.values()) o.h.onPeer(peer.name || peer.identity);
    o.h.onStatus('connected');
  } catch (error) {
    try { await room.disconnect(); }
    finally { o.signal?.removeEventListener('abort', abort); clearMedia(); }
    throw error;
  }

  return {
    room,
    sendCaption: async caption => {
      await room.localParticipant.sendText(JSON.stringify(caption), { topic: 'caption' });
    },
    sendCtrl: async message => {
      await room.localParticipant.sendText(JSON.stringify(message), { topic: 'ctrl' });
    },
    leave: async () => {
      try { await room.disconnect(); }
      finally { o.signal?.removeEventListener('abort', abort); clearMedia(); }
    },
  };
}
