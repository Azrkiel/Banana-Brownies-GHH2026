import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPersonalRecognizer, createWordCapture, createWordRecognizer } from './wordRecognition';
import { trainPersonalModel, type PersonalSample } from './personalModel';

const mocks = vi.hoisted(() => ({ create: vi.fn(), fileset: vi.fn() }));
vi.mock('@mediapipe/tasks-vision', () => ({
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
    expect(fetch).not.toHaveBeenCalled(); recognizer.close();
  });
});
