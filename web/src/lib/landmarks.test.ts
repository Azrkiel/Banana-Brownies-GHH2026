import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTracker, headYawFromPose, drawLandmarksOverlay } from './landmarks';

const mocks = vi.hoisted(() => {
  const point = { x: 0.123456, y: 0.4, z: -0.01 };
  const hand = { detectForVideo: vi.fn(), close: vi.fn() };
  const pose = { detectForVideo: vi.fn(), close: vi.fn() };
  const face = { detectForVideo: vi.fn(), close: vi.fn() };
  return {
    point, hand, pose, face,
    files: vi.fn(), createHand: vi.fn(), createPose: vi.fn(), createFace: vi.fn(),
  };
});

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: mocks.files },
  HandLandmarker: { createFromOptions: mocks.createHand },
  PoseLandmarker: { createFromOptions: mocks.createPose },
  FaceLandmarker: { createFromOptions: mocks.createFace },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.files.mockResolvedValue({});
  mocks.createHand.mockResolvedValue(mocks.hand);
  mocks.createPose.mockResolvedValue(mocks.pose);
  mocks.createFace.mockResolvedValue(mocks.face);
  mocks.hand.detectForVideo.mockReturnValue({ landmarks: [Array(21).fill(mocks.point), Array(21).fill(mocks.point)] });
  mocks.pose.detectForVideo.mockReturnValue({ landmarks: [Array(33).fill(mocks.point)] });
  mocks.face.detectForVideo.mockReturnValue({ faceBlendshapes: [{ categories: [
    { categoryName: 'browInnerUp', score: 0.9 },
    { categoryName: 'browDownLeft', score: 0.4 },
  ] }] });
});

describe('camera tracker', () => {
  const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;

  it('keeps both hands, rounds coordinates, and limits pose to the shared contract', async () => {
    const tracker = await createTracker({ withFace: false });
    const frame = tracker.detect(video, 123);
    expect(frame).toMatchObject({ t: 123, w: 640, h: 480, brow: null });
    expect(frame.hands).toHaveLength(2);
    expect(frame.hands[0]).toHaveLength(21);
    expect(frame.hands[0][0].x).toBe(0.1235);
    expect(frame.pose).toHaveLength(17);
    expect(mocks.createHand.mock.calls[0][1]).toMatchObject({ numHands: 2, runningMode: 'VIDEO' });
    expect(mocks.createFace).not.toHaveBeenCalled();
    tracker.close();
    expect(mocks.hand.close).toHaveBeenCalledOnce();
    expect(mocks.pose.close).toHaveBeenCalledOnce();
  });

  it('updates face blendshapes every third frame and clears a lost face', async () => {
    const tracker = await createTracker({ withFace: true });
    expect(tracker.detect(video, 1).brow).toEqual({ raise: 0.3, furrow: 0.2 });
    tracker.detect(video, 2);
    tracker.detect(video, 3);
    expect(mocks.face.detectForVideo).toHaveBeenCalledOnce();
    mocks.face.detectForVideo.mockReturnValue({ faceBlendshapes: [] });
    expect(tracker.detect(video, 4).brow).toBeNull();
    tracker.close();
    expect(mocks.face.close).toHaveBeenCalledOnce();
  });

  it('returns a missing pose without inventing landmarks', async () => {
    mocks.pose.detectForVideo.mockReturnValue({ landmarks: [] });
    const tracker = await createTracker({ withFace: false });
    expect(tracker.detect(video, 1).pose).toBeNull();
    tracker.close();
  });

  it('closes loaded models if a later model cannot initialize', async () => {
    mocks.createFace.mockRejectedValue(new Error('model unavailable'));
    await expect(createTracker({ withFace: true })).rejects.toThrow('model unavailable');
    expect(mocks.hand.close).toHaveBeenCalledOnce();
    expect(mocks.pose.close).toHaveBeenCalledOnce();
    mocks.hand.close.mockClear();
    mocks.pose.close.mockClear();
    mocks.createPose.mockRejectedValue(new Error('pose unavailable'));
    await expect(createTracker({ withFace: false })).rejects.toThrow('pose unavailable');
    expect(mocks.hand.close).toHaveBeenCalledOnce();
    expect(mocks.pose.close).not.toHaveBeenCalled();
  });
});

describe('delegate fallback and head pose', () => {
  it('retries each model on CPU after GPU failure', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const [create, model] of [[mocks.createHand, mocks.hand], [mocks.createPose, mocks.pose], [mocks.createFace, mocks.face]] as const) {
      create.mockRejectedValueOnce(new Error('WebGL unavailable')).mockResolvedValueOnce(model);
    }
    const tracker = await createTracker({ withFace: true });
    for (const create of [mocks.createHand, mocks.createPose, mocks.createFace]) {
      expect(create.mock.calls.map(call => call[1].baseOptions.delegate)).toEqual(['GPU', 'CPU']);
    }
    expect(tracker.detect({ videoWidth: 640, videoHeight: 480 } as HTMLVideoElement, 1).hands).toHaveLength(2);
    tracker.close();
    warning.mockRestore();
  });
  it('honours explicit CPU and does not retry CPU failures', async () => {
    mocks.createHand.mockRejectedValue(new Error('CPU unavailable'));
    await expect(createTracker({ withFace: false, delegate: 'CPU' })).rejects.toThrow('CPU unavailable');
    expect(mocks.createHand).toHaveBeenCalledOnce();
    expect(mocks.createHand.mock.calls[0][1].baseOptions.delegate).toBe('CPU');
    expect(mocks.createPose).not.toHaveBeenCalled();
  });
  it('normalizes nose displacement by ear width and handles missing anchors', async () => {
    const pose = Array.from({ length: 17 }, () => ({ x: 0.5, y: 0.3, z: 0 }));
    pose[0].x = 0.55; pose[7].x = 0.4; pose[8].x = 0.6;
    expect(headYawFromPose(pose)).toBeCloseTo(0.25);
    mocks.pose.detectForVideo.mockReturnValue({ landmarks: [pose] });
    const tracker = await createTracker({ withFace: false });
    expect(tracker.detect({ videoWidth: 640, videoHeight: 480 } as HTMLVideoElement, 1).headYaw).toBeCloseTo(0.25);
    tracker.close();
    expect(headYawFromPose(null)).toBeUndefined();
    expect(headYawFromPose([])).toBeUndefined();
    expect(headYawFromPose(Array(17).fill(mocks.point))).toBeUndefined();
  });
});

describe('shared preview overlay', () => {
  it('mirrors coordinates and orders displayed hands, clears stale drawings and adds body anchors', () => {
    const ctx = { clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
      strokeStyle: '', fillStyle: '', lineWidth: 0 };
    const canvas = { width: 640, height: 480, getContext: () => ctx } as unknown as HTMLCanvasElement;
    const left = Array.from({ length: 21 }, () => ({ x: 0.2, y: 0.4, z: 0 }));
    const right = left.map(p => ({ ...p, x: 0.8 }));
    drawLandmarksOverlay(canvas, { hands: [left, right], pose: Array(17).fill({ x: 0.5, y: 0.3, z: 0 }) }, { mirror: true });
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(ctx.moveTo.mock.calls[0][0]).toBeCloseTo(128);
    expect(ctx.stroke).toHaveBeenCalledTimes(42);
    expect(ctx.arc).toHaveBeenCalledTimes(45);
    drawLandmarksOverlay(canvas, { hands: [] });
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);
    expect(ctx.stroke).toHaveBeenCalledTimes(42);
  });
});

it('interleaves pose and face at 15 Hz while preserving both hands every frame', async () => {
  const tracker = await createTracker({ withFace: true, interleaved: true });
  const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
  expect(tracker.detect(video, 0).brow).toBeNull();
  expect(tracker.detect(video, 33).brow).not.toBeNull();
  for (const t of [66,99,132,165]) expect(tracker.detect(video,t).hands).toHaveLength(2);
  expect(mocks.hand.detectForVideo).toHaveBeenCalledTimes(6);
  expect(mocks.pose.detectForVideo).toHaveBeenCalledTimes(3);
  expect(mocks.face.detectForVideo).toHaveBeenCalledTimes(3);
  tracker.close();
});
