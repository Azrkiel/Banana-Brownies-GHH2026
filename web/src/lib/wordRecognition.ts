import { parseWordForest, predictWord, wordFrame, WORD_FRAMES, type WordForest, type WordPrediction } from './wordModel';
import { predictPersonalSign, type PersonalModel, type WordSample } from './personalModel';

export type WordRecognizer = {
  labels: string[];
  capture(onProgress: (frames: number) => void): Promise<WordPrediction>;
  close(): void;
};

export async function loadWordForest(signal: AbortSignal): Promise<WordForest> {
  const response = await fetch(`${import.meta.env.BASE_URL}trained-words.json`, { signal });
  if (!response.ok) throw new Error('The trained word model could not be loaded.');
  return parseWordForest(await response.json());
}

/** Shares the call's existing video; never requests a second camera or microphone. */
export async function createWordRecognizer(video: HTMLVideoElement, signal: AbortSignal): Promise<WordRecognizer> {
  const model = await loadWordForest(signal);
  const capture = await createWordCapture(video, signal);
  return { labels: [...model.labels], close: capture.close,
    async capture(onProgress) {
      const sample = await capture.capture(onProgress);
      return predictWord(model, sample.features, sample.framesWithHand);
    },
  };
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
  return { labels: sharedAndPersonalLabels(shared, model), close: capture.close,
    async capture(onProgress) {
      return predictSharedAndPersonal(shared, model, await capture.capture(onProgress));
    },
  };
}

export type WordCapture = { capture(onProgress: (frames: number) => void): Promise<WordSample>; close(): void };

/** Same capture contract for teaching, testing, and in-call recognition. No samples are uploaded here. */
export async function createWordCapture(video: HTMLVideoElement, signal: AbortSignal): Promise<WordCapture> {
  signal.throwIfAborted();
  const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
  signal.throwIfAborted();
  const fileset = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe/wasm`);
  signal.throwIfAborted();
  const hand = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`, delegate: 'CPU' },
    runningMode: 'VIDEO', numHands: 1,
    minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6,
  });
  if (signal.aborted) { hand.close(); signal.throwIfAborted(); }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) { hand.close(); throw new Error('Camera processing is unavailable.'); }
  let closed = false;
  let cancelCapture: (() => void) | null = null;
  const close = () => {
    if (closed) return;
    closed = true;
    cancelCapture?.();
    signal.removeEventListener('abort', close);
    hand.close();
  };
  signal.addEventListener('abort', close, { once: true });
  return {
    capture(onProgress) {
      if (closed || signal.aborted) return Promise.reject(new DOMException('Recognition stopped.', 'AbortError'));
      if (cancelCapture) return Promise.reject(new Error('A sign is already being captured.'));
      return new Promise((resolve, reject) => {
        const features: number[] = [];
        let frames = 0;
        let framesWithHand = 0;
        let animation = 0;
        let lastSample = -Infinity;
        let lastVideoTime = -1;
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
            if (video.readyState >= 2 && video.videoWidth && video.videoHeight && video.currentTime !== lastVideoTime && time - lastSample >= 1000 / 30 - 2) {
              canvas.width = video.videoWidth; canvas.height = video.videoHeight;
              // The original OpenCV trainer flips each image before extracting landmarks.
              context.setTransform(-1, 0, 0, 1, canvas.width, 0);
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              const points = hand.detectForVideo(canvas, time).landmarks[0] ?? null;
              const valid = points?.length === 21 && points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y));
              features.push(...wordFrame(valid ? points : null));
              if (valid) framesWithHand++;
              frames++; lastSample = time; lastVideoTime = video.currentTime;
              onProgress(frames);
              if (frames === WORD_FRAMES) { finish({ features, framesWithHand }); return; }
            }
            animation = requestAnimationFrame(tick);
          } catch (error) { finish(undefined, error); }
        };
        animation = requestAnimationFrame(tick);
      });
    },
    close,
  };
}
