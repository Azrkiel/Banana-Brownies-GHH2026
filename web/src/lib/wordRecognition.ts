import { parseWordForest, predictWord, wordFrame, WORD_FRAMES, type WordForest, type WordPrediction } from './wordModel';

export type WordSample = { features: number[]; framesWithHand: number };
export type WordRecognizer = {
  labels: string[];
  modelSha256: string | null;
  captureSample(onProgress: (frames: number) => void): Promise<WordSample>;
  capture(onProgress: (frames: number) => void): Promise<WordPrediction>;
  predict(features: readonly number[], framesWithHand: number): WordPrediction;
  close(): void;
};

/** Shares the call's existing video; never requests a second camera or microphone. */
export async function createWordRecognizer(video: HTMLVideoElement, signal: AbortSignal): Promise<WordRecognizer> {
  const response = await fetch(`${import.meta.env.BASE_URL}trained-words.json`, { signal });
  if (!response.ok) throw new Error('The trained word model could not be loaded.');
  const json: unknown = await response.json();
  const model: WordForest = parseWordForest(json);
  const sha = (json as { sourceSha256?: unknown }).sourceSha256;
  const modelSha256 = typeof sha === 'string' ? sha : null;
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
  const captureSample = (onProgress: (frames: number) => void): Promise<WordSample> => {
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
  };
  return {
    labels: [...model.labels],
    modelSha256,
    predict: (features, framesWithHand) => predictWord(model, features, framesWithHand),
    captureSample,
    async capture(onProgress) {
      const sample = await captureSample(onProgress);
      return predictWord(model, sample.features, sample.framesWithHand);
    },
    close,
  };
}
