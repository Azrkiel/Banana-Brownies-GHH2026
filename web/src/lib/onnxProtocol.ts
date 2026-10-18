export type ModelManifest = {
  version: 2; schema: 'holistic_v2_32x174'; deployable: boolean;
  c1_model_url: string; c1_sha256: string; c1_size_bytes: number;
  b_model_url: string; b_sha256: string; b_size_bytes: number;
  labels: string[]; b_labels: string[]; b_schema: 'aslfr90'; idle_index: 0;
  temperature: number; temperature_baked: boolean; embedding_dim: 192;
};
export type WindowPrediction = {
  topK: { gloss: string; prob: number }[]; handActivityProb: number;
  embedding: Float32Array; latencyMs: number; text?: string;
};
export type RecognitionMode = 'auto' | 'isolated' | 'fingerspell';

export function parseManifest(value: unknown): ModelManifest {
  const m = value as ModelManifest;
  if (!m || m.version !== 2 || m.schema !== 'holistic_v2_32x174' || m.deployable !== true ||
      m.b_schema !== 'aslfr90' || m.idle_index !== 0 || m.embedding_dim !== 192 ||
      !(m.temperature > 0) || !Number.isFinite(m.temperature) || typeof m.temperature_baked !== 'boolean') throw new Error('No verified v2 model bundle is available.');
  for (const [url, hash, size] of [[m.c1_model_url, m.c1_sha256, m.c1_size_bytes], [m.b_model_url, m.b_sha256, m.b_size_bytes]]) {
    if (typeof url !== 'string' || !/^[a-zA-Z0-9_-]+\.onnx$/.test(url) ||
        typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash) ||
        !Number.isInteger(size) || +size <= 0 || +size > 5_000_000) throw new Error('Invalid model artifact metadata.');
  }
  for (const labels of [m.labels, m.b_labels]) if (!Array.isArray(labels) || !labels.length || labels.length > 3000 ||
      labels.some(l => typeof l !== 'string' || !l.length || l.length > 80) || new Set(labels).size !== labels.length) throw new Error('Invalid model labels.');
  if (m.labels[0] !== '_idle' || m.b_labels[0] !== '<blank>') throw new Error('Invalid idle/CTC mapping.');
  return m;
}

export async function verifyBytes(bytes: ArrayBuffer, hash: string, size: number) {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== size) return false;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('') === hash;
}
export function softmax(logits: ArrayLike<number>, temperature = 1): number[] {
  const values = Array.from(logits);
  if (!values.length || values.some(v => !Number.isFinite(v))) throw new Error('Invalid model probabilities.');
  const max = Math.max(...values), exp = values.map(v => Math.exp((v - max) / temperature)), sum = exp.reduce((a, b) => a + b, 0);
  return exp.map(v => v / sum);
}
export function decodeCTC(logits: ArrayLike<number>, labels: string[], temperature = 1) {
  let last = -1, text = '';
  for (let i = 0; i < logits.length; i += labels.length) {
    const row = Array.from(logits).slice(i, i + labels.length);
    const p = softmax(row, temperature), best = p.indexOf(Math.max(...p));
    if (best && best !== last) text += labels[best];
    last = best;
  }
  return text.trim();
}
