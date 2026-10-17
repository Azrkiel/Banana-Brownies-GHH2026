import type { Role } from './types';

async function post<T>(path: string, body: unknown, timeoutMs = 8000): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return (await res.json()) as T;
}

export const getToken = (room: string, name: string, role: Role) =>
  post<{ token: string; url: string; identity: string }>('/api/token', { room, name, role });

export type GlossSign = { gloss: string; p: number; alts: { gloss: string; p: number }[] };
export type GlossResult = {
  english: string;
  sentence_type: 'statement' | 'yes_no_question' | 'wh_question';
  confidence: number;
  uncertain: string[];
};
export const translateGloss = (signs: GlossSign[], tags: string[], context: string[]) =>
  post<GlossResult>('/api/gloss', { signs, tags, context }, 3000);

export async function fetchTts(text: string, voiceId: string): Promise<Blob> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voiceId }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`/api/tts ${res.status}`);
  return res.blob();
}

export type VoiceInfo = { id: string; name: string; labels: Record<string, string> };
export async function getVoices(): Promise<VoiceInfo[]> {
  const res = await fetch('/api/voices', { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`/api/voices ${res.status}`);
  return (await res.json()) as VoiceInfo[];
}

export const getScribeToken = () => post<{ token: string }>('/api/scribe-token', {});
