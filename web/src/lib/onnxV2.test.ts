import { describe, expect, it, vi, afterEach } from 'vitest';
import { parseManifest, softmax, decodeCTC, verifyBytes } from './onnxProtocol';
import { encodeLandmarks, parseInference } from './landmarkInference';
import { Classifier } from './classifier';
import { predictPersonalSign, trainPersonalModel, validateWordSample, type PersonalSample } from './personalModel';
import { createCaptionHistory, isCaption, isCtrl } from './captions';
import type { Caption } from './types';

const hash = 'a'.repeat(64);
const manifest = { version: 2, schema: 'holistic_v2_32x174', deployable: true, c1_model_url: 'c1.onnx', c1_sha256: hash, c1_size_bytes: 100,
  b_model_url: 'b.onnx', b_sha256: hash, b_size_bytes: 100, labels: ['_idle', 'HELLO'], b_labels: ['<blank>', 'A'], b_schema: 'aslfr90',
  idle_index: 0, temperature: 1, temperature_baked: true, embedding_dim: 192 };
afterEach(() => vi.unstubAllGlobals());
describe('verified v2 model protocol', () => {
  it('rejects smoke manifests, paths, size/hash and schema mismatches', () => {
    expect(parseManifest(manifest).labels).toEqual(['_idle', 'HELLO']);
    for (const patch of [{ deployable: false }, { c1_model_url: '../data.onnx' }, { c1_sha256: 'broken' }, { b_schema: 'xy174' },
      { b_size_bytes: 6_000_000 }, { temperature: NaN }, { labels: ['HELLO'] }, { labels: ['_idle', '_idle'] }]) {
      expect(() => parseManifest({ ...manifest, ...patch })).toThrow();
    }
  });
  it('verifies every cache entry and rejects corrupted bytes', async () => {
    const bytes = new TextEncoder().encode('model').buffer;
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
    expect(await verifyBytes(bytes, digest, 5)).toBe(true);
    expect(await verifyBytes(new ArrayBuffer(5), digest, 5)).toBe(false);
    expect(await verifyBytes(bytes, digest, 6)).toBe(false);
  });
  it('decodes CTC repeated letters only after blank and normalizes stable probabilities', () => {
    expect(softmax([1000, 1001]).reduce((a, b) => a+b)).toBeCloseTo(1);
    expect(decodeCTC([0, 10, 0, 10, 10, 0, 0, 10], ['<blank>', 'A'])).toBe('AA');
    expect(() => softmax([NaN])).toThrow();
  });
  it('encodes only exact 32x174 little-endian float16 windows', () => {
    const x = new Float32Array(5568); x[0] = 1; x[1] = -.5; x[2] = 2 ** -24; x[172] = 1;
    const wire = new DataView(encodeLandmarks(x));
    expect(wire.byteLength).toBe(11136); expect(wire.getUint16(0, true)).toBe(0x3c00);
    expect(wire.getUint16(2, true)).toBe(0xb800); expect(wire.getUint16(4, true)).toBe(1);
    for (const bad of [new Float32Array(2), new Float32Array(5568).fill(NaN), new Float32Array(5568).fill(30)]) expect(() => encodeLandmarks(bad)).toThrow();
    x[172] = .5; expect(() => encodeLandmarks(x)).toThrow();
  });
  it('bounds server responses before accepting them', () => {
    const value = { topK: [{ gloss: 'HELLO', prob: .9 }], embedding: Array(192).fill(0), handActivityProb: .8, latencyMs: 10 };
    expect(parseInference(value).embedding).toBeInstanceOf(Float32Array);
    expect(() => parseInference({ ...value, embedding: [1] })).toThrow();
    expect(() => parseInference({ ...value, handActivityProb: NaN })).toThrow();
  });
  it('terminates workers and rejects pending inference on abort without detaching callers data', async () => {
    vi.stubGlobal('location', { href: 'http://localhost/' });
    const sent: Record<string, unknown>[] = [];
    const worker = { onmessage: null as null | ((event: { data: unknown }) => void), onerror: null, onmessageerror: null, terminate: vi.fn(),
      postMessage: vi.fn((message: Record<string, unknown>) => { sent.push(message); if (message.type === 'init') queueMicrotask(() => worker.onmessage?.({ data: { id: message.id, result: manifest } })); }) };
    const abort = new AbortController();
    const client = await Classifier.create(abort.signal, () => worker as unknown as Worker);
    const input = new Float32Array(5568), pending = client.predictWindow(input);
    await expect(client.predictWindow(input)).rejects.toThrow('busy');
    expect(sent.at(-1)?.features).not.toBe(input); expect(input.length).toBe(5568);
    abort.abort(); await expect(pending).rejects.toThrow('stopped'); expect(worker.terminate).toHaveBeenCalledOnce();
    await expect(client.predictWindow(input)).rejects.toThrow('stopped');
  });
});
describe('personal embedding prototypes', () => {
  const sample = (label: string, axis: number, version: 'holistic_v2_emb192' | 'holistic-v2' = 'holistic_v2_emb192'): PersonalSample => ({
    label, id: crypto.randomUUID(), createdAt: '', featureVersion: version, modelSha256: hash, framesWithHand: 32,
    features: Array.from({ length: version === 'holistic-v2' ? 5568 : 192 }, (_, i) => i === axis ? 1 : 0),
  });
  it('uses cosine prototypes, rejects unseen directions and model-version mismatches', () => {
    const data = Array.from({ length: 3 }, () => [sample('HELLO', 1), sample('BOOK', 2)]).flat();
    const model = trainPersonalModel(data);
    expect(predictPersonalSign(model, sample('unused', 1))).toMatchObject({ label: 'HELLO', accepted: true });
    expect(predictPersonalSign(model, sample('unused', 3)).accepted).toBe(false);
    expect(predictPersonalSign(model, { ...sample('unused', 1), modelSha256: 'b'.repeat(64) }).accepted).toBe(false);
  });
  it('supports raw holistic data without comparing incompatible schemas', () => {
    const model = trainPersonalModel(Array.from({ length: 3 }, () => sample('BOOK', 2, 'holistic-v2')), 1);
    expect(predictPersonalSign(model, sample('unused', 2, 'holistic-v2')).accepted).toBe(true);
    expect(predictPersonalSign(model, sample('unused', 2)).accepted).toBe(false);
    expect(() => validateWordSample({ ...sample('X', 1), features: Array(192).fill(1) })).toThrow();
  });
});
describe('sender-owned caption retraction', () => {
  const caption: Caption = { id: 'same', speaker: 'A', role: 'signer', kind: 'english', final: true, text: 'Hello', ts: 1, confidence: .9, nmmTags: ['Q-YN'] };
  it('retracts immediately, cannot affect another sender, and handles reordering', () => {
    let rows: Caption[] = []; const history = createCaptionHistory(value => { rows = value; });
    history.receive(caption, 'alice'); history.retract('same', 'bob');
    expect(rows[0].retracted).not.toBe(true);
    history.retract('same', 'alice'); expect(rows[0].retracted).toBe(true);
    history.receive(caption, 'alice'); expect(rows[0].retracted).toBe(true);
    history.retract('future', 'alice'); history.receive({ ...caption, id: 'future' }, 'alice');
    expect(rows).toHaveLength(1);
  });
  it('validates confidence, tags and bounded control messages', () => {
    expect(isCaption(caption)).toBe(true); expect(isCaption({ ...caption, confidence: Infinity })).toBe(false);
    expect(isCtrl({ type: 'clear', captionId: 'same' })).toBe(true);
    expect(isCtrl({ type: 'gloss', words: [{ label: 'BOOK', score: .9, nmmTags: ['NEG'] }] })).toBe(true);
    expect(isCtrl({ type: 'gloss', words: [{ label: 'BOOK', score: NaN }] })).toBe(false);
  });
});
