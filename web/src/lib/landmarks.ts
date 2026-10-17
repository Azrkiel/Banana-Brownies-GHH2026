import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Brow, Frame, Pt } from './types';

export type Tracker = { detect(video: HTMLVideoElement, t: number): Frame; close(): void };

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const toPt = (p: { x: number; y: number; z: number }): Pt => ({ x: r4(p.x), y: r4(p.y), z: r4(p.z) });

/** Hand (2 hands!) + Pose lite, optional Face blendshapes every 3rd frame. All files served locally. */
export async function createTracker(opts: { withFace: boolean }): Promise<Tracker> {
  const fileset = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe/wasm`);
  const hand = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`, delegate: 'GPU' },
    runningMode: 'VIDEO', numHands: 2, // default is 1 — two-handed signs would silently lose a hand
  });
  let pose: PoseLandmarker | undefined;
  let face: FaceLandmarker | null;
  try {
    pose = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`, delegate: 'GPU' },
    runningMode: 'VIDEO', numPoses: 1,
  });
    face = opts.withFace
    ? await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/face_landmarker.task`, delegate: 'GPU' },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
      })
    : null;
  } catch (error) {
    hand.close();
    // Pose may have loaded before optional face initialization failed.
    pose?.close();
    throw error;
  }

  let n = 0;
  let brow: Brow | null = null;
  return {
    detect(video, t) {
      const h = hand.detectForVideo(video, t);
      const p = pose!.detectForVideo(video, t);
      if (face && n++ % 3 === 0) {
        const cats = face.detectForVideo(video, t).faceBlendshapes?.[0]?.categories ?? [];
        const g = (name: string) => cats.find((c) => c.categoryName === name)?.score ?? 0;
        brow = cats.length
          ? { raise: (g('browInnerUp') + g('browOuterUpLeft') + g('browOuterUpRight')) / 3,
              furrow: (g('browDownLeft') + g('browDownRight')) / 2 }
          : null;
      }
      return {
        t, w: video.videoWidth, h: video.videoHeight,
        pose: p.landmarks[0] ? p.landmarks[0].slice(0, 17).map(toPt) : null,
        hands: h.landmarks.map((hl) => hl.map(toPt)),
        brow,
      };
    },
    close() { hand.close(); pose!.close(); face?.close(); },
  };
}
