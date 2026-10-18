import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Brow, Frame, Pt } from './types';

export type Tracker = { detect(video: HTMLVideoElement, t: number): Frame; close(): void };

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const toPt = (p: { x: number; y: number; z: number }): Pt => ({ x: r4(p.x), y: r4(p.y), z: r4(p.z) });

/** Hand (2 hands!) + Pose lite, optional Face blendshapes every 3rd frame. All files served locally. */
export async function createTracker(opts: { withFace: boolean; delegate?: 'GPU' | 'CPU' }): Promise<Tracker> {
  const fileset = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe/wasm`);
  const initialize = async <T>(create: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> => {
    const preferred = opts.delegate ?? 'GPU';
    try { return await create(preferred); }
    catch (error) {
      if (preferred === 'CPU') throw error;
      console.warn('GPU landmark initialization failed; retrying on CPU.', error);
      return create('CPU');
    }
  };
  const hand = await initialize(delegate => HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`, delegate },
    runningMode: 'VIDEO', numHands: 2, // default is 1 — two-handed signs would silently lose a hand
  }));
  let pose: PoseLandmarker | undefined;
  let face: FaceLandmarker | null;
  try {
    pose = await initialize(delegate => PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`, delegate },
      runningMode: 'VIDEO', numPoses: 1,
    }));
    face = opts.withFace
      ? await initialize(delegate => FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/face_landmarker.task`, delegate },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
      }))
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
      const upperPose = p.landmarks[0] ? p.landmarks[0].slice(0, 17).map(toPt) : null;
      return {
        t, w: video.videoWidth, h: video.videoHeight,
        pose: upperPose, headYaw: headYawFromPose(upperPose),
        hands: h.landmarks.map((hl) => hl.map(toPt)),
        brow,
      };
    },
    close() { hand.close(); pose!.close(); face?.close(); },
  };
}

/** Relative image-space yaw proxy, available without the face model. */
export function headYawFromPose(pose: Pt[] | null): number | undefined {
  if (!pose || pose.length < 9) return undefined;
  const nose = pose[0], left = pose[7], right = pose[8];
  const width = Math.abs(right.x - left.x);
  if (width < 1e-3 || ![nose.x, left.x, right.x].every(Number.isFinite)) return undefined;
  return (nose.x - (left.x + right.x) / 2) / width;
}


const HAND_LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

type OverlayFrame = { hands?: Pt[][]; points?: Pt[] | null; pose?: Pt[] | null };

/** Draw normalized landmarks over either the raw preview or its mirrored display. */
export function drawLandmarksOverlay(canvas: HTMLCanvasElement | null, frame: OverlayFrame, opts: { clear?: boolean; mirror?: boolean } = {}) {
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;
  if (opts.clear !== false) context.clearRect(0, 0, canvas.width, canvas.height);
  const displayX = (p: Pt) => opts.mirror ? 1 - p.x : p.x;
  const at = (p: Pt): [number, number] => [displayX(p) * canvas.width, p.y * canvas.height];
  const hands = (frame.hands ?? (frame.points ? [frame.points] : [])).filter(h => h.length === 21)
    .slice().sort((a, b) => displayX(a[0]) - displayX(b[0]));
  hands.forEach((hand, i) => {
    context.strokeStyle = i === 0 ? '#3ddc84' : '#38bdf8';
    context.fillStyle = context.strokeStyle;
    context.lineWidth = 2;
    for (const [a, b] of HAND_LINKS) {
      context.beginPath(); context.moveTo(...at(hand[a])); context.lineTo(...at(hand[b])); context.stroke();
    }
    for (const p of hand) { context.beginPath(); context.arc(...at(p), 3, 0, Math.PI * 2); context.fill(); }
  });
  if (frame.pose && frame.pose.length >= 13) {
    context.fillStyle = '#f8fafc';
    for (const i of [0, 11, 12]) { context.beginPath(); context.arc(...at(frame.pose[i]), 2, 0, Math.PI * 2); context.fill(); }
  }
}

/** Draw the mirrored capture image and the same overlay used by the camera tools. */
export function drawLive(canvas: HTMLCanvasElement | null, frame: OverlayFrame & { image: HTMLCanvasElement }) {
  const context = canvas?.getContext('2d');
  if (!canvas || !context || !frame.image.width) return;
  canvas.width = 320; canvas.height = Math.round(320 * frame.image.height / frame.image.width);
  context.drawImage(frame.image, 0, 0, canvas.width, canvas.height);
  drawLandmarksOverlay(canvas, frame, { clear: false });
}

/** Draw tracked landmarks over the call's own (mirrored) video tile. The recognizer tracks a mirrored frame, which
 *  is what the tile shows, so no flip is needed; points are fitted into the video's object-fit: contain box. */
export function drawTileOverlay(canvas: HTMLCanvasElement | null, video: HTMLVideoElement | null, frame: OverlayFrame | null) {
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * ratio), height = Math.round(canvas.clientHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  context.clearRect(0, 0, width, height);
  if (!frame || !video?.videoWidth || !video.videoHeight) return;
  const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
  const boxW = video.videoWidth * scale, boxH = video.videoHeight * scale, left = (width - boxW) / 2, top = (height - boxH) / 2;
  const at = (p: Pt): [number, number] => [left + p.x * boxW, top + p.y * boxH];
  const line = Math.max(2, Math.min(width, height) / 160);
  const hands = (frame.hands ?? (frame.points ? [frame.points] : [])).filter(h => h.length === 21);
  hands.forEach((hand, i) => {
    context.strokeStyle = i === 0 ? '#3ddc84' : '#38bdf8';
    context.fillStyle = context.strokeStyle;
    context.lineWidth = line; context.lineCap = 'round';
    for (const [a, b] of HAND_LINKS) { context.beginPath(); context.moveTo(...at(hand[a])); context.lineTo(...at(hand[b])); context.stroke(); }
    for (const p of hand) { context.beginPath(); context.arc(...at(p), line * 1.4, 0, Math.PI * 2); context.fill(); }
  });
  if (frame.pose && frame.pose.length >= 13) {
    context.fillStyle = '#f8fafc';
    for (const i of [0, 11, 12]) { context.beginPath(); context.arc(...at(frame.pose[i]), line * 1.2, 0, Math.PI * 2); context.fill(); }
  }
}
