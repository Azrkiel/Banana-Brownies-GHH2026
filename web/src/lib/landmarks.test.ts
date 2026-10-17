import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTracker } from './landmarks';

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
