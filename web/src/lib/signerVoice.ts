import { fetchTts } from './api';
import type { Ctrl } from './types';

/** The server's ElevenLabs route accepts at most this many characters. */
export const MAX_SPOKEN_CHARS = 400;

/** Signed words arrive as uppercase glosses ("MY NAME LISA"); speak them as a plain sentence. */
export function spokenText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed || /[a-z]/.test(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export type SignerVoice = {
  /** Published to the call as the signer's microphone; silent until a caption is spoken. */
  track: MediaStreamTrack;
  speak(text: string, voiceId: string): Promise<void>;
  /** Cuts off the caption being spoken, including one still being fetched. */
  stop(): void;
  close(): void;
};

/** ElevenLabs audio is decoded and played into a WebAudio stream, so the other side hears it through the call. */
export function createSignerVoice(): SignerVoice {
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  const track = destination.stream.getAudioTracks()[0];
  let current: AudioBufferSourceNode | null = null;
  let closed = false;
  let stops = 0;
  return {
    track,
    async speak(text, voiceId) {
      const mine = stops;
      const audio = await fetchTts(text, voiceId);
      if (closed || stops !== mine) return;
      await context.resume();
      const buffer = await context.decodeAudioData(await audio.arrayBuffer());
      if (closed || stops !== mine) return;
      current?.stop();
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      current = source;
      await new Promise<void>(resolve => { source.onended = () => resolve(); source.start(); });
      if (current === source) current = null;
    },
    stop() { stops++; current?.stop(); },
    close() {
      if (closed) return;
      closed = true;
      current?.stop();
      track.stop();
      void context.close().catch(() => {});
    },
  };
}

/** Tells listeners to pause their speech captions while the voice plays, so it is not transcribed back. */
export async function speakToRoom(o: {
  text: string; voiceId: string; voice: SignerVoice; sendCtrl(message: Ctrl): Promise<void>;
}): Promise<void> {
  const text = spokenText(o.text);
  if (!text) return;
  if (text.length > MAX_SPOKEN_CHARS) throw new Error(`Captions over ${MAX_SPOKEN_CHARS} characters are sent as text only.`);
  await o.sendCtrl({ type: 'tts', on: true }).catch(() => {});
  try { await o.voice.speak(text, o.voiceId); }
  finally { await o.sendCtrl({ type: 'tts', on: false }).catch(() => {}); }
}
