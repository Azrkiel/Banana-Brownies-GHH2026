import { parseWordForest, predictWord, wordFrame, WORD_FRAMES, type WordForest, type WordPrediction } from './wordModel';
import { predictPersonalSign, type PersonalModel, type WordSample } from './personalModel';
import type { Brow, Pt } from './types';
import { orderHands } from './features';

export type WordRecognizer = {
  labels: string[];
  capture(onProgress: (frames: number) => void): Promise<WordPrediction>;
  /** Predicts on the latest 30 frames, every frame, until the returned stop function runs. */
  watch(onUpdate: (frame: LiveFrame, prediction: WordPrediction | null) => void): () => void;
  close(): void;
};

export async function loadWordForest(signal: AbortSignal): Promise<WordForest> {
  const response = await fetch(`${import.meta.env.BASE_URL}trained-words.json`, { signal });
  if (!response.ok) throw new Error('The trained word model could not be loaded.');
  return parseWordForest(await response.json());
}

function recognizer(labels: string[], capture: WordCapture, predict: (sample: WordSample) => WordPrediction): WordRecognizer {
  const scored = (sample: WordSample) => ({ ...predict(sample), framesWithHand: sample.framesWithHand });
  return { labels, close: capture.close,
    async capture(onProgress) { return scored(await capture.capture(onProgress)); },
    watch: onUpdate => capture.watch(frame => onUpdate(frame, frame.sample ? scored(frame.sample) : null)),
  };
}

/** Shares the call's existing video; never requests a second camera or microphone. */
export async function createWordRecognizer(video: HTMLVideoElement, signal: AbortSignal): Promise<WordRecognizer> {
  const model = await loadWordForest(signal);
  const capture = await createWordCapture(video, signal);
  return recognizer([...model.labels], capture, sample => predictWord(model, sample.features, sample.framesWithHand));
}

export function sharedAndPersonalLabels(shared: WordForest | null, personal: PersonalModel): string[] {
  return [...new Set([...(shared?.labels ?? []), ...personal.labels])].sort();
}

/** Personal signs are checked first; the shared forest only answers when no personal sign matched closely. */
export function predictSharedAndPersonal(shared: WordForest | null, personal: PersonalModel, sample: WordSample): WordPrediction {
  if (sample.framesWithHand < 24) return { label: personal.labels[0], score: 0, margin: 0, accepted: false };
  let mine: WordPrediction | null = null;
  try { mine = predictPersonalSign(personal, sample); } catch { /* Unusable landmarks; the forest rejects them too. */ }
  if (mine?.accepted || !shared) return mine ?? { label: personal.labels[0], score: 0, margin: 0, accepted: false };
  return predictWord(shared, sample.features, sample.framesWithHand);
}

export async function createPersonalRecognizer(video: HTMLVideoElement, signal: AbortSignal, model: PersonalModel): Promise<WordRecognizer> {
  const shared = await loadWordForest(signal);
  const capture = await createWordCapture(video, signal);
  return recognizer(sharedAndPersonalLabels(shared, model), capture, sample => predictSharedAndPersonal(shared, model, sample));
}

/** `image` is the mirrored frame the hand model saw; `sample` is null until 30 frames have been seen. */
export type LiveFrame = {
  points: Pt[] | null; // Primary image-left hand: unchanged word-v1 adapter.
  hands: Pt[][];
  pose: Pt[] | null;
  brow: Brow | null;
  image: HTMLCanvasElement;
  sample: WordSample | null;
};
export type WordCapture = {
  capture(onProgress: (frames: number) => void): Promise<WordSample>;
  watch(onFrame: (frame: LiveFrame) => void): () => void;
  close(): void;
};

/** Same capture contract for teaching, testing, and in-call recognition. No samples are uploaded here. */
export async function createWordCapture(video: HTMLVideoElement, signal: AbortSignal): Promise<WordCapture> {
  signal.throwIfAborted();
  const vision = await import('@mediapipe/tasks-vision');
  const { FilesetResolver, HandLandmarker } = vision;
  signal.throwIfAborted();
  const fileset = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe/wasm`);
  signal.throwIfAborted();
  const hand = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`, delegate: 'CPU' },
    runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6,
  });
  if (signal.aborted) { hand.close(); signal.throwIfAborted(); }
  let pose: import('@mediapipe/tasks-vision').PoseLandmarker | null = null;
  try {
    pose = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`, delegate: 'CPU' },
      runningMode: 'VIDEO', numPoses: 1,
    });
  } catch { /* Optional pose assets may be absent; word-v1 only needs hands. */ }
  if (signal.aborted) { hand.close(); pose?.close(); signal.throwIfAborted(); }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) { hand.close(); pose?.close(); throw new Error('Camera processing is unavailable.'); }
  let closed = false;
  let cancelCapture: (() => void) | null = null;
  const close = () => {
    if (closed) return;
    closed = true;
    cancelCapture?.();
    signal.removeEventListener('abort', close);
    hand.close(); pose?.close();
  };
  signal.addEventListener('abort', close, { once: true });
  let lastSample = -Infinity;
  let lastVideoTime = -1;
  /** Samples at most 30 fps and only new video frames; undefined means no new frame yet. */
  const sampleFrame = (time: number): Omit<LiveFrame, 'image' | 'sample'> | undefined => {
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight || video.currentTime === lastVideoTime || time - lastSample < 1000 / 30 - 2) return undefined;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    // The original OpenCV trainer flips each image before extracting landmarks.
    context.setTransform(-1, 0, 0, 1, canvas.width, 0);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawHands = hand.detectForVideo(canvas, time).landmarks ?? [];
    const hands = rawHands.filter(hl => hl.length === 21 && hl.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
    const points = orderHands(hands)[0] ?? null;
    let upperPose: Pt[] | null = null;
    try { upperPose = pose?.detectForVideo(canvas, time).landmarks[0]?.slice(0, 17) ?? null; }
    catch { pose?.close(); pose = null; } // A pose failure must not interrupt the legacy recognizer.
    lastSample = time; lastVideoTime = video.currentTime;
    return { points, hands, pose: upperPose, brow: null };
  };
  return {
    capture(onProgress) {
      if (closed || signal.aborted) return Promise.reject(new DOMException('Recognition stopped.', 'AbortError'));
      if (cancelCapture) return Promise.reject(new Error('A sign is already being captured.'));
      return new Promise((resolve, reject) => {
        const features: number[] = [];
        let frames = 0;
        let framesWithHand = 0;
        let animation = 0;
        const started = performance.now();
        const finish = (result?: WordSample, error?: unknown) => {
          cancelAnimationFrame(animation);
          cancelCapture = null;
          if (error) reject(error);
          else resolve(result!);
        };
        cancelCapture = () => finish(undefined, new DOMException('Recognition stopped.', 'AbortError'));
        const tick = (time: number) => {
          if (time - started > 6000) { finish(undefined, new Error('The camera paused. Try capturing the sign again.')); return; }
          try {
            const frame = sampleFrame(time);
            if (frame !== undefined) {
              const { points } = frame;
              features.push(...wordFrame(points));
              if (points) framesWithHand++;
              frames++;
              onProgress(frames);
              if (frames === WORD_FRAMES) { finish({ features, framesWithHand }); return; }
            }
            animation = requestAnimationFrame(tick);
          } catch (error) { finish(undefined, error); }
        };
        animation = requestAnimationFrame(tick);
      });
    },
    watch(onFrame) {
      if (closed || signal.aborted || cancelCapture) return () => {};
      const recent: { features: number[]; hand: boolean }[] = [];
      let animation = 0;
      const stop = () => { cancelAnimationFrame(animation); if (cancelCapture === stop) cancelCapture = null; };
      cancelCapture = stop;
      const tick = (time: number) => {
        try {
          const frame = sampleFrame(time);
          if (frame !== undefined) {
            const { points } = frame;
            recent.push({ features: wordFrame(points), hand: Boolean(points) });
            if (recent.length > WORD_FRAMES) recent.shift();
            const sample = recent.length === WORD_FRAMES
              ? { features: recent.flatMap(frame => frame.features), framesWithHand: recent.filter(frame => frame.hand).length } : null;
            onFrame({ ...frame, image: canvas, sample });
          }
        } catch { stop(); return; }
        animation = requestAnimationFrame(tick);
      };
      animation = requestAnimationFrame(tick);
      return stop;
    },
    close,
  };
}
