import * as ort from 'onnxruntime-web/wasm';
import { decodeCTC, parseManifest, softmax, verifyBytes, type ModelManifest, type WindowPrediction } from './onnxProtocol';

type Message = { id: number; type: 'init'; base: string } | { id: number; type: 'predict'; stage: 'c1' | 'b'; features: Float32Array };
const scope = self as unknown as {
  crossOriginIsolated: boolean; location: Location;
  onmessage: ((event: MessageEvent<Message>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
let manifest: ModelManifest;
let sessions: { c1: ort.InferenceSession; b: ort.InferenceSession } | undefined;
let queue = Promise.resolve();

async function cache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('signline_model_cache_v2', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('models');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Model cache blocked.'));
  });
}
async function cachedBytes(hash: string, write?: ArrayBuffer): Promise<ArrayBuffer | undefined> {
  let db: IDBDatabase | undefined;
  try {
    db = await cache();
    return await new Promise((resolve, reject) => {
      const transaction = db!.transaction('models', write ? 'readwrite' : 'readonly'), store = transaction.objectStore('models');
      const request = write ? store.put(write, hash) : store.get(hash);
      transaction.oncomplete = () => resolve(write ?? request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch { return undefined; } // Private browsing/quota errors must not prevent local inference.
  finally { db?.close(); }
}
async function modelBytes(base: string, stage: 'c1' | 'b') {
  const hash = stage === 'c1' ? manifest.c1_sha256 : manifest.b_sha256;
  const size = stage === 'c1' ? manifest.c1_size_bytes : manifest.b_size_bytes;
  const url = stage === 'c1' ? manifest.c1_model_url : manifest.b_model_url;
  const cached = await cachedBytes(hash);
  if (cached && await verifyBytes(cached, hash, size)) return cached;
  const response = await fetch(new URL(url, base), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Unable to download the v2 model.');
  const bytes = await response.arrayBuffer();
  if (!await verifyBytes(bytes, hash, size)) throw new Error('Model integrity verification failed.');
  await cachedBytes(hash, bytes);
  return bytes;
}
async function initialize(base: string) {
  const root = new URL(base, scope.location.href);
  if (root.origin !== scope.location.origin) throw new Error('Models must be served from this site.');
  const response = await fetch(new URL('manifest.json', root), { signal: AbortSignal.timeout(10000), cache: 'no-cache' });
  if (!response.ok) throw new Error('V2 models are not installed.');
  manifest = parseManifest(await response.json());
  ort.env.wasm.numThreads = scope.crossOriginIsolated ? Math.min(2, navigator.hardwareConcurrency || 2) : 1;
  ort.env.wasm.simd = true;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = new URL('../ort/', root).href;
  let c1: ort.InferenceSession | undefined;
  try {
    c1 = await ort.InferenceSession.create(await modelBytes(root.href, 'c1'), { executionProviders: ['wasm'] });
    const b = await ort.InferenceSession.create(await modelBytes(root.href, 'b'), { executionProviders: ['wasm'] });
    sessions = { c1, b };
  } catch (error) { await c1?.release(); throw error; }
  return manifest;
}
async function predict(stage: 'c1' | 'b', features: Float32Array): Promise<WindowPrediction> {
  if (!sessions) throw new Error('Models are not ready.');
  const dim = stage === 'c1' ? 174 : 90, time = features.length / dim;
  if (!(features instanceof Float32Array) || !features.every(Number.isFinite) ||
      (stage === 'c1' ? time !== 32 : !Number.isInteger(time) || time < 64 || time > 128)) throw new Error('Invalid landmark window.');
  const start = performance.now();
  const output = await sessions[stage].run({ features: new ort.Tensor('float32', features, [1, time, dim]) });
  try {
    const logits = output.logits.data as Float32Array, embedding = Float32Array.from(output.embedding.data as Float32Array);
    const handActivityProb = Number(output.handActivityProb.data[0]);
    if (embedding.length !== 192 || !embedding.every(Number.isFinite) || !Number.isFinite(handActivityProb)) throw new Error('Invalid model output.');
    const temperature = manifest.temperature_baked ? 1 : manifest.temperature;
    if (logits.length !== (stage === 'c1' ? manifest.labels.length : time * manifest.b_labels.length)) throw new Error('Model label mapping mismatch.');
    const probs = stage === 'c1' ? softmax(logits, temperature) : [];
    const topK = probs.map((prob, i) => ({ gloss: manifest.labels[i], prob })).sort((a, b) => b.prob - a.prob).slice(0, 3);
    return { topK, handActivityProb, embedding, latencyMs: performance.now() - start,
      ...(stage === 'b' ? { text: decodeCTC(logits, manifest.b_labels, temperature) } : {}) };
  } finally { for (const value of Object.values(output)) value.dispose(); }
}
scope.onmessage = event => {
  const message = event.data;
  queue = queue.then(async () => {
    try {
      const result = message.type === 'init' ? await initialize(message.base) : await predict(message.stage, message.features);
      scope.postMessage({ id: message.id, result }, 'embedding' in result ? [result.embedding.buffer] : []);
    } catch (error) { scope.postMessage({ id: message.id, error: error instanceof Error ? error.message : 'Local inference failed.' }); }
  });
};
