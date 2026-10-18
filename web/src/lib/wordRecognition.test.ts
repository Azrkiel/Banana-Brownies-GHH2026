import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPersonalRecognizer, createWordCapture, createWordRecognizer, predictSharedAndPersonal, sharedAndPersonalLabels } from './wordRecognition';
import { drawLive } from './landmarks';
import type { WordForest } from './wordModel';
import { trainPersonalModel, type PersonalSample } from './personalModel';

const mocks = vi.hoisted(() => ({ create: vi.fn(), fileset: vi.fn(), pose: vi.fn() }));
vi.mock('@mediapipe/tasks-vision', () => ({
  PoseLandmarker: { createFromOptions: mocks.pose },
  HandLandmarker: { createFromOptions: mocks.create }, FilesetResolver: { forVisionTasks: mocks.fileset },
}));
const model = {
  version: 1, frames: 30, featuresPerFrame: 42, preprocessing: 'mirrored-one-hand-wrist-relative-xy',
  labels: ['HELLO', 'NAME'], trees: [[{ left: -1, right: -1, feature: -2, threshold: -2, votes: [1, 0] }]],
};

describe('signer word recognition lifecycle', () => {
  let callbacks: Map<number, FrameRequestCallback>;
  let video: HTMLVideoElement;
  let close: ReturnType<typeof vi.fn>;
  let detect: ReturnType<typeof vi.fn>;
  let transform: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    callbacks = new Map(); let id = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++id, callback); return id; });
    vi.stubGlobal('cancelAnimationFrame', (key: number) => callbacks.delete(key));
    vi.spyOn(performance, 'now').mockReturnValue(0);
    transform = vi.fn();
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ setTransform: transform, drawImage: vi.fn() }) }) });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => model }));
    video = { readyState: 2, videoWidth: 640, videoHeight: 480, currentTime: 0 } as HTMLVideoElement;
    close = vi.fn();
    detect = vi.fn().mockReturnValue({ landmarks: [Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + i / 100, y: 0.5, z: 0 }))] });
    mocks.create.mockReset().mockResolvedValue({ close, detectForVideo: detect });
    mocks.fileset.mockReset().mockResolvedValue({});
    mocks.pose.mockReset().mockRejectedValue(new Error('Optional pose model unavailable'));
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  function frame(time: number, advance = true) {
    if (advance) (video as unknown as { currentTime: number }).currentTime = time / 1000;
    const [id, callback] = callbacks.entries().next().value!;
    callbacks.delete(id); callback(time);
  }
  it('captures 30 distinct frames, mirrors input and returns a reviewed suggestion', async () => {
    const recognizer = await createWordRecognizer(video, new AbortController().signal);
    const progress = vi.fn();
    const result = recognizer.capture(progress);
    for (let i = 1; i <= 30; i++) frame(i * 34);
    expect(await result).toMatchObject({ label: 'HELLO', accepted: true });
    expect(progress).toHaveBeenLastCalledWith(30);
    expect(transform).toHaveBeenCalledWith(-1, 0, 0, 1, 640, 0);
    expect(detect).toHaveBeenCalledTimes(30);
    expect(callbacks.size).toBe(0);
    recognizer.close(); expect(close).toHaveBeenCalledTimes(1);
  });
  it('rejects a no-hand capture rather than accepting the model’s default class', async () => {
    detect.mockReturnValue({ landmarks: [] });
    const recognizer = await createWordRecognizer(video, new AbortController().signal);
    const result = recognizer.capture(vi.fn());
    for (let i = 1; i <= 30; i++) frame(i * 34);
    expect((await result).accepted).toBe(false);
    recognizer.close();
  });
  it('aborts capture, cancels frames and closes only its model when stopped', async () => {
    const controller = new AbortController();
    const recognizer = await createWordRecognizer(video, controller.signal);
    const result = expect(recognizer.capture(vi.fn())).rejects.toMatchObject({ name: 'AbortError' });
    frame(34); controller.abort();
    await result;
    expect(callbacks.size).toBe(0);
    expect(close).toHaveBeenCalledTimes(1);
    recognizer.close(); expect(close).toHaveBeenCalledTimes(1);
    await expect(recognizer.capture(vi.fn())).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('closes a model that finishes loading after the signer has stopped', async () => {
    let finish!: (value: unknown) => void;
    mocks.create.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const result = expect(createWordRecognizer(video, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalled());
    controller.abort(); finish({ close, detectForVideo: detect });
    await result; expect(close).toHaveBeenCalledTimes(1);
  });
  it('times out a frozen video instead of counting the same frame 30 times', async () => {
    const recognizer = await createWordRecognizer(video, new AbortController().signal);
    const progress = vi.fn();
    const result = expect(recognizer.capture(progress)).rejects.toThrow('camera paused');
    frame(34); frame(68, false); frame(6001, false);
    await result;
    expect(progress).toHaveBeenCalledTimes(1);
    expect(callbacks.size).toBe(0); recognizer.close();
  });
  it('predicts live on a rolling 30-frame window and stops cleanly', async () => {
    const recognizer = await createWordRecognizer(video, new AbortController().signal);
    const updates: (string | null)[] = [];
    const stop = recognizer.watch((liveFrame, guess) => { expect(liveFrame.points).toHaveLength(21); updates.push(guess?.label ?? null); });
    for (let i = 1; i <= 32; i++) frame(i * 34);
    expect(updates.slice(0, 29).every(x => x === null)).toBe(true);
    expect(updates.slice(29)).toEqual(['HELLO', 'HELLO', 'HELLO']);
    stop(); expect(callbacks.size).toBe(0);
    const result = recognizer.capture(vi.fn());
    for (let i = 33; i <= 62; i++) frame(i * 34);
    expect(await result).toMatchObject({ label: 'HELLO', framesWithHand: 30 });
    recognizer.close();
  });
  it('requests two hands and exposes both while preserving image-left word-v1 features', async () => {
    const left = Array.from({ length: 21 }, (_, i) => ({ x: 0.2 + i / 100, y: 0.4, z: 0 }));
    const right = left.map(p => ({ ...p, x: p.x + 0.4 }));
    detect.mockReturnValue({ landmarks: [right, left] });
    const capture = await createWordCapture(video, new AbortController().signal);
    expect(mocks.create.mock.calls[0][1]).toMatchObject({ numHands: 2 });
    const update = vi.fn();
    const stop = capture.watch(update);
    for (let i = 1; i <= 30; i++) frame(i * 34);
    const live = update.mock.calls.at(-1)![0];
    expect(live.hands).toEqual([right, left]);
    expect(live.points).toEqual(left);
    expect(live.pose).toBeNull();
    expect(live.brow).toBeNull();
    expect(live.sample.features).toHaveLength(1260);
    expect(live.sample.features.slice(0, 42)).toEqual(left.flatMap(p => [p.x - left[0].x, p.y - left[0].y]));
    stop(); capture.close();
  });
  it('filters malformed hands without losing a second valid hand', async () => {
    const valid = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    detect.mockReturnValue({ landmarks: [[{ x: NaN, y: 0.4, z: 0 }], valid] });
    const capture = await createWordCapture(video, new AbortController().signal);
    const update = vi.fn();
    capture.watch(update); frame(34);
    expect(update.mock.calls[0][0].hands).toEqual([valid]);
    capture.close();
  });
  it('drawLive strokes both hands in distinct colours with the legacy points fallback', () => {
    const colours: string[] = [];
    const context = { strokeStyle: '', fillStyle: '', lineWidth: 0, drawImage: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      stroke: vi.fn(() => colours.push(context.strokeStyle)), arc: vi.fn(), fill: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
    const left = Array.from({ length: 21 }, () => ({ x: 0.2, y: 0.5, z: 0 }));
    const right = left.map(p => ({ ...p, x: 0.8 }));
    const image = { width: 640, height: 480 } as HTMLCanvasElement;
    drawLive(canvas, { hands: [right, left], points: left, image });
    expect(context.stroke).toHaveBeenCalledTimes(42);
    expect(colours.slice(0, 21)).toEqual(Array(21).fill('#3ddc84'));
    expect(colours.slice(21)).toEqual(Array(21).fill('#38bdf8'));
    expect(context.arc).toHaveBeenCalledTimes(42);
    context.stroke.mockClear();
    drawLive(canvas, { points: left, image });
    expect(context.stroke).toHaveBeenCalledTimes(21);
  });
  it('exposes upper-body pose and keeps tracking hands if optional pose detection fails', async () => {
    const posePoints = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.4, z: 0 }));
    const pose = { close: vi.fn(), detectForVideo: vi.fn().mockReturnValue({ landmarks: [posePoints] }) };
    mocks.pose.mockResolvedValue(pose);
    const capture = await createWordCapture(video, new AbortController().signal);
    const update = vi.fn();
    capture.watch(update); frame(34);
    expect(update.mock.calls[0][0].pose).toEqual(posePoints.slice(0, 17));
    pose.detectForVideo.mockImplementation(() => { throw new Error('Pose lost'); });
    frame(68); frame(102);
    expect(update).toHaveBeenCalledTimes(3);
    expect(update.mock.calls[1][0]).toMatchObject({ pose: null, hands: [expect.any(Array)] });
    capture.close();
    expect(pose.close).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
  it('releases both models when stopped during optional pose initialization', async () => {
    let finish!: (value: unknown) => void;
    mocks.pose.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const loading = expect(createWordCapture(video, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(mocks.pose).toHaveBeenCalled());
    const closePose = vi.fn();
    controller.abort(); finish({ close: closePose, detectForVideo: vi.fn() });
    await loading;
    expect(close).toHaveBeenCalledOnce();
    expect(closePose).toHaveBeenCalledOnce();
    expect(callbacks.size).toBe(0);
  });
  it('reports a missing model before initializing hand tracking', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    await expect(createWordRecognizer(video, new AbortController().signal)).rejects.toThrow('could not be loaded');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('captures training landmarks without loading the shared forest or uploading a sample', async () => {
    const capture = await createWordCapture(video, new AbortController().signal);
    const result = capture.capture(vi.fn());
    for (let i = 1; i <= 30; i++) frame(i * 34);
    expect(await result).toMatchObject({ framesWithHand: 30 });
    expect((await result).features).toHaveLength(1260);
    expect(fetch).not.toHaveBeenCalled();
    capture.close(); expect(close).toHaveBeenCalledTimes(1);
  });
  it('uses the same capture features for a personal model and rejects a missing hand', async () => {
    const points = Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + i / 100, y: 0.5, z: 0 }));
    const features = Array.from({ length: 30 }, () => points.flatMap(p => [p.x - points[0].x, p.y - points[0].y])).flat();
    const samples: PersonalSample[] = ['HELLO', 'NAME'].flatMap(label => Array.from({ length: 3 }, (_, i) => ({
      id: `${label}-${i}`, label, createdAt: '', framesWithHand: 30,
      features: label === 'HELLO' ? [...features] : features.map((x, j) => j % 2 ? 0.1 : x),
    })));
    const recognizer = await createPersonalRecognizer(video, new AbortController().signal, trainPersonalModel(samples));
    const result = recognizer.capture(vi.fn());
    for (let i = 1; i <= 30; i++) frame(i * 34);
    expect(await result).toMatchObject({ label: 'HELLO', accepted: true });
    detect.mockReturnValue({ landmarks: [] });
    const missing = recognizer.capture(vi.fn());
    for (let i = 31; i <= 60; i++) frame(i * 34);
    expect((await missing).accepted).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1); recognizer.close();
  });
});

describe('shared words plus personal signs', () => {
  const sample = (axis: number): PersonalSample => ({ id: crypto.randomUUID(), label: 'WAVE', createdAt: '', framesWithHand: 30,
    features: Array.from({ length: 1260 }, (_, i) => (i % 42 === axis ? 0.2 : 0)) });
  const personal = trainPersonalModel([sample(2), sample(2), sample(2)], 1);
  const shared = model as unknown as WordForest;
  it('offers a single personal sign without a second personal label', () => {
    expect(predictSharedAndPersonal(shared, personal, sample(2))).toMatchObject({ label: 'WAVE', accepted: true });
    expect(sharedAndPersonalLabels(shared, personal)).toEqual(['HELLO', 'NAME', 'WAVE']);
  });
  it('falls back to the shared forest when no personal sign is close', () => {
    expect(predictSharedAndPersonal(shared, personal, sample(5))).toMatchObject({ label: 'HELLO', accepted: true });
  });
  it('rejects unmatched poses when the shared forest is unavailable, and missing hands always', () => {
    expect(predictSharedAndPersonal(null, personal, sample(5)).accepted).toBe(false);
    expect(predictSharedAndPersonal(shared, personal, { ...sample(2), framesWithHand: 10 }).accepted).toBe(false);
  });
});
