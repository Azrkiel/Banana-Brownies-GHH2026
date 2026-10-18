import { Classifier } from './classifier';
import { clipFeatures, anchors, frameFeatures, type Anchors } from './features';
import { createTracker, type Tracker } from './landmarks';
import { letterFeatures, letterHand } from './letters';
import { KinematicSegmenter } from './segmenter';
import { NMMDetector } from './nmm';
import type { Frame } from './types';
import type { RecognitionMode, WindowPrediction } from './onnxProtocol';
import type { WordCapture } from './wordRecognition';
import type { WordSample } from './personalModel';

/** ASLFR90 twin: normalized handshape48 plus unrotated wrist-local velocity42. */
export function spellingSequence(frames: Frame[]): Float32Array {
  const output = new Float32Array(frames.length * 90);
  let previous: number[] | null = null;
  frames.forEach((frame, index) => {
    const hand = letterHand(frame);
    if (!hand) { previous = null; return; }
    const aspect = frame.w / frame.h, wrist = hand[0];
    const scale = Math.hypot((hand[9].x - wrist.x) * aspect, hand[9].y - wrist.y) || 1e-3;
    const local = hand.flatMap(p => [(p.x - wrist.x) * aspect / scale, (p.y - wrist.y) / scale]);
    output.set(letterFeatures(hand, aspect), index * 90);
    if (previous) output.set(local.map((x, i) => x - previous![i]), index * 90 + 48);
    previous = local;
  });
  return output;
}
export class V2Stream {
  readonly segmenter = new KinematicSegmenter();
  private nmm = new NMMDetector();
  private frames: Frame[] = [];
  private a: Anchors | null = null;
  private busy = false;
  private epoch = 0;
  private lowEnd = false;
  mode: RecognitionMode = 'auto';
  serverConsent = false;
  private classifier: Classifier;
  private infer?: (features: Float32Array) => Promise<WindowPrediction>;
  constructor(classifier: Classifier, infer?: (features: Float32Array) => Promise<WindowPrediction>) { this.classifier = classifier; this.infer = infer; }
  reset() { this.epoch++; this.segmenter.reset(); this.nmm.reset(); this.frames = []; this.a = null; }
  push(frame: Frame, onPrediction: (prediction: WindowPrediction, tags: string[], spelling: boolean, features: Float32Array) => void, onError: (error: unknown) => void) {
    this.frames.push(frame); if (this.frames.length > 128) this.frames.shift();
    this.a = anchors(frame, this.a);
    const row = this.a ? frameFeatures(frame, this.a) : new Array(174).fill(0);
    const decision = this.segmenter.push(row, this.mode === 'fingerspell', this.mode === 'auto');
    const tags = this.nmm.push({ t: frame.t, rest: decision.state === 'REST', brow: frame.brow, headYaw: frame.headYaw });
    if (!decision.trigger || this.busy) return;
    const spelling = decision.trigger === 'fingerspelling';
    const frames = this.frames.slice(-decision.frames.length);
    if (spelling && frames.length < 64) return;
    const features = spelling ? spellingSequence(frames) : clipFeatures(frames);
    const epoch = this.epoch;
    this.busy = true;
    const cloud = !spelling && this.serverConsent && this.lowEnd && this.infer;
    Promise.resolve(cloud ? this.infer!(features).catch(() => this.classifier.predictWindow(features)) : this.classifier.predictWindow(features, spelling ? 'b' : 'c1')).then(result => {
      if (epoch !== this.epoch) return;
      if (!cloud) this.lowEnd = result.latencyMs > 120;
      onPrediction(result, tags, spelling, features);
    }).catch(error => { if (epoch === this.epoch) onError(error); }).finally(() => { this.busy = false; });
  }
}
export async function createV2Capture(video: HTMLVideoElement, signal: AbortSignal): Promise<WordCapture> {
  let tracker: Tracker | null = null, classifier: Classifier | null = null;
  let raf = 0, closed = false, rejectCapture: ((error: Error) => void) | null = null;
  const close = () => {
    if (closed) return;
    closed = true; cancelAnimationFrame(raf); tracker?.close(); classifier?.close();
    rejectCapture?.(new Error('Capture stopped.')); rejectCapture = null;
    signal.removeEventListener('abort', close);
  };
  try {
    signal.throwIfAborted();
    tracker = await createTracker({ withFace: false, interleaved: true });
    signal.throwIfAborted();
    // Raw XY174 is available while the browser model bundle is absent/loading.
    try { classifier = await Classifier.create(signal); } catch { signal.throwIfAborted(); }
    signal.addEventListener('abort', close, { once: true });
    return { close, watch: () => { throw new Error('Calibration capture only.'); }, capture: onProgress => new Promise<WordSample>((resolve, reject) => {
      if (closed || rejectCapture) { reject(new Error('Capture unavailable.')); return; }
      rejectCapture = reject;
      const frames: Frame[] = [], start = performance.now();
      let last = -1;
      const tick = () => {
        if (closed) return;
        try {
          if (performance.now() - start > 7000) throw new Error('Keep your hands in view and retry.');
          if (video.readyState >= 2 && video.currentTime !== last) {
            last = video.currentTime;
            frames.push(tracker!.detect(video, performance.now())); onProgress(frames.length);
          }
          if (frames.length < 32) { raf = requestAnimationFrame(tick); return; }
          const features = clipFeatures(frames), framesWithHand = frames.filter(f => f.hands.length).length;
          const raw: WordSample = { features: Array.from(features), framesWithHand, featureVersion: 'holistic-v2' };
          const finish = (sample: WordSample) => { if (!closed) { rejectCapture = null; resolve(sample); } };
          if (!classifier) finish(raw);
          else classifier.extractEmbedding(features).then(embedding => finish({ features: Array.from(embedding), framesWithHand,
            featureVersion: 'holistic_v2_emb192', modelSha256: classifier!.manifest.c1_sha256 }), () => finish(raw));
        } catch (error) { rejectCapture = null; reject(error); }
      };
      tick();
    }) };
  } catch (error) { close(); throw error; }
}
