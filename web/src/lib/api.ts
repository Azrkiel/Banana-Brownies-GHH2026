import type { Role } from './types';

// Empty in local dev (Vite proxies /api). A static deploy such as GitHub Pages can set
// VITE_API_BASE to a deployed server's origin.
export const API_BASE = import.meta.env.VITE_API_BASE ?? '';

async function post<T>(path: string, body: unknown, timeoutMs = 8000): Promise<T> {
  const res = await fetch(API_BASE + path, {
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
export const translateGloss = (signs: GlossSign[], tags: string[], context: string[], timeoutMs = 3000) =>
  post<GlossResult>('/api/gloss', { signs, tags, context }, timeoutMs);

export async function fetchTts(text: string, voiceId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/tts`, {
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
  const res = await fetch(`${API_BASE}/api/voices`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`/api/voices ${res.status}`);
  return (await res.json()) as VoiceInfo[];
}

export const getScribeToken = () => post<{ token: string }>('/api/scribe-token', {});

export async function inferLandmarks(features: Float32Array, signal: AbortSignal, consent: () => boolean, modelSha256: string) {
  if (!consent()) throw new Error('Landmark sharing is off.');
  const { encodeLandmarks, parseInference } = await import('./landmarkInference');
  signal.throwIfAborted();
  if (!consent()) throw new Error('Landmark sharing is off.');
  const response = await fetch(API_BASE + '/api/infer', {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Landmark-Consent': 'true', 'X-Model-SHA256': modelSha256 },
    body: encodeLandmarks(features), signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]),
  });
  if (!response.ok) throw new Error('Server assistance is unavailable.');
  return parseInference(await response.json());
}
