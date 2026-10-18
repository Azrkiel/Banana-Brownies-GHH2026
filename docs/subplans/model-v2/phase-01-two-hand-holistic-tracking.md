# Phase 1: Two-Hand & Holistic Landmark Extraction, Handedness Canonicalization & Live Overlay (`phase-01-two-hand-holistic-tracking.md`)

## 1. Objective and Why It Matters

**Objective:** Fix the single-hand tracking and visualization bug in the live video call (`Stage A`), unify the browser and Python feature pipelines on a normalized two-hand + upper-body pose + facial grammar feature schema (`T = 32` frames × `F = 174` features/frame), implement automatic handedness canonicalization (`canonicalize()`) for left- and right-handed signers, and establish an automated TypeScript↔Python bit-parity test (`ml/tests/test_parity.py`) while keeping the existing 7-word model working via a backward-compatible adapter.

**Why It Matters:**  
Our repository audit ([`README.md` §2.1](README.md)) proved that landmark lines appear on only one hand in the call because `web/src/lib/wordRecognition.ts:70,96` configures `numHands: 1` and extracts `.landmarks[0]`, `web/src/lib/wordModel.ts:4` only accepts 42 features (1 hand), and `web/src/components/SignerWords.tsx:32-42` only draws a single 21-point array—even though a two-hand + pose + face tracker (`web/src/lib/landmarks.ts`) already exists for `#/bench`! Most ASL signs are two-handed (symmetrical or dominant-on-nondominant), and sign location relative to the head and torso (e.g., `MOTHER` on chin vs. `FATHER` on forehead) cannot be determined from wrist-relative coordinates alone. Completing Phase 1 immediately gives the user a working two-hand visual demo in the live call and locks in the exact mathematical feature contract required by Phases 2–5.

---

## 2. Prerequisites and Dependencies

- **Earlier Phases Required:** None (this is Phase 1).
- **Existing Codebase Assets Used:**
  - `web/src/lib/types.ts` (`Pt`, `Brow`, `Frame`)
  - `web/src/lib/landmarks.ts` (`createTracker`)
  - `web/src/lib/features.ts` (`T = 32`, `FEAT_PER_FRAME = 174`, `anchors`, `orderHands`, `mirrorFrame`, `frameFeatures`, `resample`, `clipFeatures`)
  - `web/src/lib/wordRecognition.ts` (`createWordCapture`, `LiveFrame`)
  - `web/src/components/SignerWords.tsx` (`drawLive`)
- **Runtime Assets:** Local MediaPipe WASM and `.task` bundles (`hand_landmarker.task`, `pose_landmarker_lite.task`, `face_landmarker.task`) prepared via `npm --prefix web run setup:assets` (or mocked in unit tests).

---

## 3. Concrete Ordered Tasks (One Agent Session Each)

### Task 1.1: Complete the Canonical Two-Hand + Pose + Face Feature Schema in `web/src/lib/features.ts`
- [x] **1.1.1:** Inspect `web/src/lib/features.ts`. Currently it defines `T = 32` and `FEAT_PER_FRAME = 174`, with per-frame layout:
  - `[0..41]` (`42` floats): Dominant hand `(x, y)` relative to shoulder midpoint `a.c`, scaled by shoulder width `a.s` (aspect-corrected `x = p.x * (w / h)`).
  - `[42..83]` (`42` floats): Dominant hand local shape `(x, y)` relative to dominant wrist `pts[0]`, scaled by palm length `|pts[9] - pts[0]|`.
  - `[84..125]` (`42` floats): Non-dominant hand `(x, y)` relative to shoulder midpoint `a.c`, scaled by `a.s` (zero-filled if only 1 hand is visible).
  - `[126..167]` (`42` floats): Non-dominant hand local shape `(x, y)` relative to non-dominant wrist, scaled by palm length (zero-filled if missing).
  - `[168..171]` (`4` floats): Dominant index fingertip (`dom[8]`) relative to `a.nose` `(dx, dy) / a.s` and `a.mouth` `(dx, dy) / a.s`.
  - `[172..173]` (`2` floats): Hand presence flags `[dom ? 1 : 0, non ? 1 : 0]`.
- [x] **1.1.2:** Add `bodyCenterX(f: Frame): number` and `canonicalize(frames: Frame[]): Frame[]` to `web/src/lib/features.ts` (and call `const frames = canonicalize(raw);` at the top of `clipFeatures(raw: Frame[])`).
  - *How `canonicalize()` works:* Across a clip's frames, compute cumulative wrist displacement of the image-left hand (`left`) vs. the image-right hand (`right`). When two hands are visible, `orderHands(f.hands)` places the smaller-`x` hand in slot 0 (`l`) and larger-`x` hand in slot 1 (`r`). When one hand is visible, compare its wrist `x` against `bodyCenterX(f)` (shoulder midpoint `(pose[11].x + pose[12].x) / 2`, or `0.5` if pose is missing). If `right > left`, mirror all frames (`frames.map(mirrorFrame)`). This guarantees that left-handed signers, right-handed signers, mirrored webcam feeds, and unmirrored dataset clips all map the active dominant hand to the image-left slot (`0..83`).
- [x] **1.1.3:** Add unit tests in `web/src/lib/features.test.ts` verifying:
  - `canonicalize()` mirrors a clip when the image-right hand does the moving and leaves right-handed (image-left in mirrored view) clips unchanged.
  - `clipFeatures(clip)` and `clipFeatures(clip.map(mirrorFrame))` produce identical output (`toBeCloseTo(v, 5)`).
  - Missing hands zero-fill slots `84..167` and set presence flags `[1, 0]` or `[0, 0]`.

### Task 1.2: Create the Python Feature Twin (`ml/features.py`) and Bit-Parity Suite (`ml/tests/test_parity.py`)
- [x] **1.2.1:** Create `ml/requirements.txt` with pinned versions compatible with Python 3.12 (see Section 5 below).
- [x] **1.2.2:** Create `web/scripts/export-fixtures.ts` (invoked via `npm --prefix web run fixtures`), which generates 7 deterministic synthetic clip test cases (`one hand`, `two hands`, `left-handed two hands`, `left-handed one hand`, `missing pose and hands`, `portrait aspect`, `single frame`) and writes `ml/tests/fixtures/parity.json`.
- [x] **1.2.3:** Create `ml/features.py` implementing `anchors`, `order_hands`, `mirror_frame`, `body_center_x`, `canonicalize`, `frame_features`, `resample`, and `clip_features` with the exact same floating-point operations as `web/src/lib/features.ts`.
- [x] **1.2.4:** Create `ml/tests/test_parity.py` asserting that `clip_features()` in Python matches `clipFeatures()` in TypeScript to `max |diff| < 1e-4` across all 7 cases in `ml/tests/fixtures/parity.json`.

### Task 1.3: Upgrade `createTracker` (`web/src/lib/landmarks.ts`) with GPU→CPU Delegate Fallback & Head-Pose Tracking
- [x] **1.3.1:** Update `web/src/lib/landmarks.ts` so `createTracker(opts: { withFace: boolean; delegate?: 'GPU' | 'CPU' })`:
  - Attempts `delegate: opts.delegate ?? 'GPU'` first, and if WebGL/GPU initialization throws in headless browsers or unsupported GPUs, automatically falls back to `delegate: 'CPU'` instead of failing.
  - Continues detecting up to **2 hands** (`numHands: 2`), **1 upper-body pose** (`pose.landmarks[0].slice(0, 17)`), and optional **face blendshapes** every 3rd frame (`brow.raise`, `brow.furrow`).
  - Adds `headYaw` (nose `x` relative to ear/eye midpoint from `pose[0], pose[7], pose[8]`) to `Frame` (optional field `headYaw?: number` in `web/src/lib/types.ts`) so headshake negation (`NEG`) can be tracked even when `FaceLandmarker` is off.
- [x] **1.3.2:** Update `web/src/lib/landmarks.test.ts` to test both two-hand extraction and the GPU→CPU fallback path.

### Task 1.4: Fix the One-Hand Bug in `wordRecognition.ts` and `SignerWords.tsx` (While Keeping the 7-Word Model Working)
- [x] **1.4.1:** In `web/src/lib/wordRecognition.ts`:
  - Update `LiveFrame` (`line 54`) from:
    ```ts
    export type LiveFrame = { points: Pt[] | null; image: HTMLCanvasElement; sample: WordSample | null };
    ```
    to:
    ```ts
    export type LiveFrame = {
      points: Pt[] | null;          // Primary/dominant hand for backward compatibility with v1 tests
      hands: Pt[][];                // 0..2 detected hands (each 21 points)
      pose: Pt[] | null;            // Upper-body pose landmarks 0..16 (when pose model loaded)
      brow: Brow | null;            // Optional eyebrow blendshapes
      image: HTMLCanvasElement;
      sample: WordSample | null;
    };
    ```
  - In `createWordCapture()` (`web/src/lib/wordRecognition.ts:68-72`), change `numHands: 1` to `numHands: 2` (and optionally load `PoseLandmarker` when available, gracefully degrading to hands-only if `pose_landmarker_lite.task` is not mocked in legacy unit tests).
  - In `sampleFrame()` (`line 96`), extract **all detected valid 21-point hands**:
    ```ts
    const rawHands = hand.detectForVideo(canvas, time).landmarks ?? [];
    const validHands = rawHands.filter(
      hl => hl.length === 21 && hl.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    );
    const [domHand] = orderHands(validHands);
    const points = domHand ?? null;
    ```
  - Pass `points` (the dominant/active hand) to `wordFrame(points)` so the existing 7-word Random Forest (`trained-words.json`) and existing personal signs (`word-v1`) continue to work with zero regression, while `LiveFrame.hands` exposes **both hands** (`validHands`) to the UI and v2 pipeline!
- [x] **1.4.2:** In `web/src/components/SignerWords.tsx` (`drawLive`, `lines 32-42`) and `web/src/pages/Bench.tsx`:
  - Update `drawLive()` to iterate over `frame.hands ?? (frame.points ? [frame.points] : [])` so **both hands** have their 21 landmarks and `HAND_LINKS` skeleton lines drawn on `<canvas>`.
  - Use distinct, high-contrast accessible colors for the two hands after ordering: `#3ddc84` (emerald green) for the primary/image-left hand and `#38bdf8` (sky blue) for the secondary/image-right hand, plus subtle shoulder/nose anchor dots when `frame.pose` is present.
  - Update the status copy in `SignerWords.tsx:277` to show exact hand count: `'2 hands tracked.'`, `'1 hand tracked.'`, or `'No hands found. Raise your hands into view.'`.
  - Add a `<canvas>` overlay to `web/src/pages/Bench.tsx` and `web/src/pages/Recorder.tsx` using a shared `drawLandmarksOverlay()` helper exported from `web/src/lib/landmarks.ts` so all camera pages display two-hand skeletons consistently.
- [x] **1.4.3:** Add unit tests in `web/src/lib/wordRecognition.test.ts` confirming that `numHands: 2` is passed to `HandLandmarker.createFromOptions`, that `LiveFrame.hands` contains 2 hands when 2 hands are detected, and that `drawLive` strokes both hands.

---

## 4. Exact Files and Directories to Create or Modify

| Action | File Path | Purpose |
| :--- | :--- | :--- |
| **Modify** | `web/src/lib/types.ts` | Add optional `headYaw?: number` to `Frame`. |
| **Modify** | `web/src/lib/features.ts` | Add `bodyCenterX()`, `canonicalize()`, and wire `canonicalize()` into `clipFeatures()`. |
| **Modify** | `web/src/lib/features.test.ts` | Add canonicalization, left-handed mirroring, and mirror-invariance tests. |
| **Modify** | `web/src/lib/landmarks.ts` | Add GPU→CPU delegate fallback, `headYaw` calculation, and shared `drawLandmarksOverlay()` canvas helper. |
| **Modify** | `web/src/lib/landmarks.test.ts` | Add tests for GPU→CPU fallback and overlay drawing helper. |
| **Modify** | `web/src/lib/wordRecognition.ts` | Change `numHands: 1` → `numHands: 2`, return `hands: Pt[][]` in `LiveFrame`, and use `orderHands()` to feed the dominant hand to the v1 forest adapter. |
| **Modify** | `web/src/lib/wordRecognition.test.ts` | Verify `numHands: 2` config and 2-hand `LiveFrame.hands` population. |
| **Modify** | `web/src/components/SignerWords.tsx` | Update `drawLive()` to render both hands in distinct colors and report `'1 hand tracked'` vs `'2 hands tracked'`. |
| **Modify** | `web/src/pages/Bench.tsx` | Mount `<canvas>` overlay over the `<video>` preview using `drawLandmarksOverlay()`. |
| **Modify** | `web/src/pages/Recorder.tsx` | Mount `<canvas>` overlay over the `<video>` preview using `drawLandmarksOverlay()`. |
| **Create** | `web/scripts/export-fixtures.ts` | Generate 7-case synthetic landmark parity fixture (`ml/tests/fixtures/parity.json`). |
| **Create** | `ml/requirements.txt` | Pin Python ML/ONNX/test dependencies. |
| **Create** | `ml/features.py` | Python bit-exact twin of `web/src/lib/features.ts`. |
| **Create** | `ml/tests/test_parity.py` | Pytest suite verifying `ml/features.py` matches `web/src/lib/features.ts` (`< 1e-4`). |
| **Create** | `ml/tests/fixtures/parity.json` | Generated parity fixture committed to git. |
| **Create** | `docs/subplans/model-v2/DECISIONS.md` | Architecture decision log initialized during Phase 1. |

---

## 5. Commands, Tools & Pinned Library Versions

### Pinned Libraries
- **Frontend (`web/package.json` — already locked):**
  - `@mediapipe/tasks-vision`: `1.1.1`
  - `onnxruntime-web`: `1.30.0`
  - `react` / `react-dom`: `^19.2.8`
  - `typescript`: `~6.0.2`
  - `vitest`: `^5.0.5`
- **Python ML (`ml/requirements.txt`):**
  ```text
  numpy==2.3.5
  scipy==1.15.2
  pandas==2.2.3
  pyarrow==19.0.1
  scikit-learn==1.9.1
  torch>=2.6.0
  onnx>=1.17.0
  onnxscript>=0.2.0
  onnxruntime>=1.20.0
  matplotlib>=3.10.0
  pytest==9.1.1
  ```

### Verification Commands
```bash
# 1. Regenerate TypeScript feature fixtures and verify zero drift
(cd web && npm run fixtures)
git diff --exit-code -- ml/tests/fixtures/parity.json

# 2. Run Python feature parity test
python3 -m pytest -q ml/tests/test_parity.py

# 3. Run full frontend test suite, linter, and production build
npm --prefix web test
npm --prefix web run lint
npm --prefix web run build
```

---

## 6. Acceptance Criteria

1. **Two-Hand Detector & Overlay Verified:** `wordRecognition.ts` initializes `HandLandmarker` with `numHands: 2`; when two hands are in view on `#/call` (`SignerWords` live view), `#/bench`, or `#/record`, landmark lines and joints are drawn on **both hands** simultaneously.
2. **Canonical Feature Schema & Handedness Invariance Verified:** `features.test.ts` passes all tests including `"mirrors a clip whose image-right hand does the moving"` and `"gives the same features for a sign and its mirror image"`.
3. **TypeScript ↔ Python Parity Verified:** `pytest ml/tests/test_parity.py` passes all 7 cases with `max |diff| < 1e-4`.
4. **Zero Regression on Existing App:** All 224+ existing Vitest tests, `npm --prefix web run lint`, and `npm --prefix web run build` pass, and the shipped 7-word model (`trained-words.json`) still recognizes single-hand signs in the call.

---

## 7. Risks, Fallbacks & "If This Fails, Do X"

- **Risk 1: `delegate: 'GPU'` fails in headless Chromium/Playwright or older integrated GPUs.**
  - *If this fails, do X:* Catch any error thrown by `HandLandmarker.createFromOptions` / `PoseLandmarker.createFromOptions` with `delegate: 'GPU'` and immediately retry once with `delegate: 'CPU'`. Log a console warning so production calls never crash.
- **Risk 2: Existing tests in `wordRecognition.test.ts` mock `detectForVideo` with only 1 hand and expect `transform(-1, 0, 0, 1, 640, 0)`.**
  - *If this fails, do X:* Preserve the offscreen canvas horizontal flip in `createWordCapture` and keep `LiveFrame.points` populated with `orderHands(validHands)[0] ?? null` so every existing assertion in `wordRecognition.test.ts` continues to pass unmodified while new tests assert `numHands: 2` and `LiveFrame.hands.length === 2`.
- **Risk 3: `torch` is not pre-installed in an offline agent container during Phase 1.**
  - *If this fails, do X:* `ml/features.py` and `ml/tests/test_parity.py` depend **only on Python standard library `math`, `json`, and `numpy`** (no `torch` import in `features.py`). Run `python3 -m pytest -q ml/tests/test_parity.py` using the system Python + `numpy` so Phase 1 never blocks on PyTorch installation.

---

## 8. Estimated Effort and Compute Needs

- **Agent Coding & Verification Effort:** 1 agent session (~45–60 minutes).
- **Compute Needs:** Standard CPU only (0 GPU hours, < 2 GB RAM, 0 MB external network downloads required for code & parity tests).

---

## 9. Handoff Note for Fresh Agent

> **To the agent starting Phase 1:**  
> Read `docs/subplans/model-v2/AGENT_GUIDE.md` first. Your goal in Phase 1 is purely to fix the 1-hand tracking/drawing limitation (`wordRecognition.ts`, `SignerWords.tsx`, `Bench.tsx`, `Recorder.tsx`), add `bodyCenterX` and `canonicalize` to `web/src/lib/features.ts`, and create `web/scripts/export-fixtures.ts`, `ml/features.py`, and `ml/tests/test_parity.py`. Do not break any existing test in `web/src/lib/*.test.ts`. When all commands in Section 5 pass, check off the tasks above, update `docs/subplans/model-v2/README.md`, record your commit hash below, and proceed to [phase-02-dataset-acquisition-preprocessing.md](https://www.google.com/search?q=phase-02-dataset-acquisition-preprocessing.md).


## Handoff Summary - October 18, 2026

Tasks 1.1 through 1.4 were implemented in order and all Phase 1 automated checks passed. The completion commit is titled `phase-01: complete two-hand tracking and feature parity`.

- **Features:** Automatic clip canonicalization, body-centre fallback, deterministic static-clip orientation, gap-aware wrist motion, and mirrored head yaw. The tensor remains 32 x 174; optional brow/head-yaw metadata does not add tensor columns.
- **Python twin:** Added the pinned requirements, TypeScript fixture exporter, NumPy implementation, and seven-case parity suite. Geometry and interpolation use double precision before the final float32 conversion.
- **Tracking:** `createTracker` retries failed GPU initialization on CPU for hands, pose and optional face, retains two hands and pose indices 0..16, samples face every third frame, and exposes an ear-normalized nose-offset head-yaw proxy.
- **Live capture and overlays:** Live capture detects both valid hands; the existing mirrored 30 x 42 word-v1 adapter still receives the image-left hand. Pose is optional and degrades to hands-only on initialization/detection failure. Shared canvas rendering draws both hands with green/blue skeletons and body anchors across the call, bench and recorder; mirrored previews preserve coordinate alignment. Status copy reports the exact hand count.
- **Verification environment:** Windows, Node 24.20.0, Python 3.12.14, NumPy 2.3.5, pytest 9.1.1. Only the Phase 1 NumPy/pytest dependencies were needed; no training dependencies or runtime assets were committed.

Verification results:

| Command | Result |
| :--- | :--- |
| `npm --prefix web run fixtures` | Seven deterministic cases exported. |
| `git diff --exit-code -- ml/tests/fixtures/parity.json` | Passed after regeneration against the staged generated fixture; no drift. |
| `pytest ml/tests/test_parity.py` | 7 passed; max absolute float32 difference **0.0** in every case (required < 1e-4). |
| `npm --prefix web test` | **250 tests passed across 20 files**. Existing tests retained. |
| `npm --prefix web run lint` | Passed. |
| `npm --prefix web run build` | Passed TypeScript and production bundling. Vite reports the existing LiveKit chunk size advisory. |
| `python -m pytest -q ml/tests` | 7 passed. |
| `git diff --check` | Passed. |
| `python plan/verify.py preflight --lane recog` | Passed. |
| `python plan/verify.py next` | `NO AGENT TASKS LEFT (all lanes).` This is the separate legacy ledger, not authorization to execute later model-v2 phases. |

The server was untouched and `server/.venv` was absent, so the guide's conditional backend check did not apply. The initial global legacy preflight reported absent server dependencies; the scoped frontend preflight passed after installing locked web dependencies.

**Human QA pending:** Physical two-hand signing, target-laptop FPS, and real two-person call/model recognition were not exercised. Follow [NEEDS_HUMAN_ACTION.md](NEEDS_HUMAN_ACTION.md). Automated canvas tests prove both skeletons are stroked, but do not measure real detector accuracy or hardware latency.

**Scope boundary:** Phase 1 only. Phases 2-6 remain pending; no dataset acquisition, training, database migration, deployment, or later-phase integration was performed. Stop after pushing the Phase 1 commits to main, as requested by the owner.
