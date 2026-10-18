import type { WindowPrediction } from './onnxProtocol';

/** Fixed little-endian float16 wire format; never accepts video/audio or arbitrary payloads. */
export function encodeLandmarks(features: Float32Array): ArrayBuffer {
  if (features.length !== 5568 || !features.every(x => Number.isFinite(x) && Math.abs(x) <= 20)) throw new Error('Invalid XY174 window.');
  const buffer = new ArrayBuffer(11136), view = new DataView(buffer);
  features.forEach((value, i) => {
    if (i % 174 >= 172 && value !== 0 && value !== 1) throw new Error('Invalid hand presence.');
    const sign = value < 0 || Object.is(value, -0) ? 0x8000 : 0, abs = Math.abs(value);
    let bits: number;
    if (abs < 2 ** -14) bits = Math.round(abs / 2 ** -24);
    else {
      let exponent = Math.floor(Math.log2(abs)), mantissa = Math.round((abs / 2 ** exponent - 1) * 1024);
      if (mantissa === 1024) { exponent++; mantissa = 0; }
      bits = ((exponent + 15) << 10) | mantissa;
    }
    view.setUint16(i * 2, sign | bits, true);
  });
  return buffer;
}
export function parseInference(value: unknown): WindowPrediction {
  const result = value as WindowPrediction;
  if (!result || !Array.isArray(result.topK) || result.topK.length < 1 || result.topK.length > 3 ||
      result.topK.some(c => typeof c.gloss !== 'string' || !c.gloss || !Number.isFinite(c.prob) || c.prob < 0 || c.prob > 1) ||
      !Array.isArray(result.embedding) || result.embedding.length !== 192 || !result.embedding.every(Number.isFinite) ||
      !Number.isFinite(result.handActivityProb) || result.handActivityProb < 0 || result.handActivityProb > 1 ||
      !Number.isFinite(result.latencyMs) || result.latencyMs < 0) throw new Error('Invalid server inference response.');
  return { ...result, embedding: Float32Array.from(result.embedding) };
}
