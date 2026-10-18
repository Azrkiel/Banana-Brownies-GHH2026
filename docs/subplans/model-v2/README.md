# SignLine ASL Recognition v2 — Architecture & Phased Implementation Plan

**Repository:** `Banana-Brownies-GHH2026` (`SignLine`)  
**Target Branch:** `plan/model-v2`  
**Audit & Plan Date:** October 18, 2026  
**Target Executors:** Autonomous AI Coding Agents (Google Antigravity, OpenAI Codex, Claude Code) and Human Maintainers  

---

## 1. Executive Overview

**SignLine** (`Banana-Brownies-GHH2026`) is a browser-based, two-person video-calling web application designed to let a Deaf or hard-of-hearing signer communicate with a hearing participant using real-time captions and optional synthesized speech. During the Girls Hoo Hack 2026 sprint (ending October 18, 2026), the original multi-lane plan for a 2-hand ONNX recognizer trained on Kaggle's Google Isolated Sign Language Recognition (GISLR) dataset was dropped (`plan.md:20-26`) in favor of shipping a recovered legacy 1-hand, 7-word Random Forest model (`web/public/trained-words.json`) plus a 1-hand 3-Nearest-Neighbor (`3-NN`) personal sign trainer (`web/src/lib/personalModel.ts`).

This **Model v2 Implementation Plan** provides a complete, self-contained engineering blueprint to upgrade SignLine from its hackathon prototype to a two-handed, large-vocabulary, continuous-signing captioning system integrated into the live WebRTC (LiveKit) video call. Every phase is designed so that executing agents with zero prior context can implement, verify, and commit incremental milestones while keeping the application working and demoable after every phase.

---

## 2. Step 1: Read-Only Repository Audit

All findings below were verified directly against commit `069be9516b9536da69191ac2914fae60667e7533` of `Banana-Brownies-GHH2026`.

### 2.1 Hand Tracking & Why Landmark Lines Appear on Only One Hand

The repository currently contains **two separate, disconnected hand-tracking pipelines** under `web/src/lib/`:

1. **Active In-Call & Personal-Training Pipeline (`web/src/lib/wordRecognition.ts`, `web/src/lib/wordModel.ts`, `web/src/components/SignerWords.tsx`) — Single-Hand Only:**
   - **Detector Configuration (`web/src/lib/wordRecognition.ts:68-72`):** `createWordCapture()` initializes `@mediapipe/tasks-vision` `HandLandmarker.createFromOptions()` with `numHands: 1` and `delegate: 'CPU'`:
     ```ts
     const hand = await HandLandmarker.createFromOptions(fileset, {
       baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/hand_landmarker.task`, delegate: 'CPU' },
       runningMode: 'VIDEO', numHands: 1,
       minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6,
     });
     ```
   - **Landmark Array Extraction (`web/src/lib/wordRecognition.ts:54, 96`):** `sampleFrame()` extracts only the first detected hand (`const points = hand.detectForVideo(canvas, time).landmarks[0] ?? null;`) and exposes `LiveFrame.points` as `Pt[] | null` (a single 21-point hand array) rather than `Pt[][]`.
   - **Feature Vector Shape (`web/src/lib/wordModel.ts:3-10, 43-46`):** `WORD_FRAMES = 30` and `WORD_FEATURES = 42`. `wordFrame(hand: Pt[] | null)` computes 21 wrist-relative 2D coordinates `[point.x - hand[0].x, point.y - hand[0].y]`, discarding the `z` coordinate and any second hand (`preprocessing: 'mirrored-one-hand-wrist-relative-xy'`). Over 30 frames, the feature vector holds `30 * 42 = 1260` floats.
   - **Database & Personal Model Schema Lock-in (`web/src/lib/personalModel.ts:16-23`, `supabase/migrations/202610180001_personal_signs.sql:9-12`):** `validateWordSample()` and the PostgreSQL `check` constraint on `public.personal_sign_samples.features` strictly enforce `cardinality(features) = 1260` and `feature_version = 'word-v1'`.
   - **Canvas Overlay Drawing Code (`web/src/components/SignerWords.tsx:26-42`):** `drawLive(canvas, frame)` checks `if (!frame.points) return;` and iterates once over `HAND_LINKS` (21 joints) for that single `Pt[]` array. It cannot render a second hand, pose anchors, or handedness indicators.
   - **Legacy Python Scripts (`ml/legacy/train_words.py:19-24, 84-96` and `ml/legacy/custom_hybrid.py:58-63`):** Both desktop scripts initialize `mp.solutions.hands.Hands(static_image_mode=False, max_num_hands=1, ...)` and index `results.multi_hand_landmarks[0]`.

2. **Dormant Developer-Tool Pipeline (`web/src/lib/landmarks.ts`, `web/src/lib/features.ts`) — Two-Hand + Pose + Face, Unwired from Call:**
   - **Detector Configuration (`web/src/lib/landmarks.ts:10-58`):** `createTracker()` configures `HandLandmarker` with `numHands: 2` (`delegate: 'GPU'`), `PoseLandmarker` (`pose_landmarker_lite.task`, `numPoses: 1`, keeping upper-body landmarks `0..16`), and optional `FaceLandmarker` (`face_landmarker.task`, `numFaces: 1`, `outputFaceBlendshapes: true` sampled every 3rd frame to compute `brow.raise` and `brow.furrow`).
   - **Feature Extraction (`web/src/lib/features.ts:3-93`):** Defines `T = 32` and `FEAT_PER_FRAME = 174` (`2 * (42 + 42) + 4 + 2`, representing dominant hand shoulder-normalized `42` + wrist-local `42`, non-dominant hand shoulder-normalized `42` + wrist-local `42`, dominant index-tip to nose/mouth `4`, and `[dom, non]` presence flags `2`). However, `features.ts:79-93` in the current checkout is missing `bodyCenterX()` and `canonicalize()` (auto-mirroring clips when the image-right hand moves more than the image-left hand), which was left unimplemented when `plan/tasks/1.B2.md` was dropped.
   - **Usage (`web/src/pages/Bench.tsx:23`, `web/src/pages/Recorder.tsx:58`):** `useCameraTracker()` (`web/src/lib/useCameraTracker.ts:6-80`) is only mounted on the hidden developer routes `#/bench` and `#/record`, neither of which renders a `<canvas>` landmark skeleton overlay or connects to `Call.tsx`.

> **Verdict on Hand-Tracking Root Cause:** The single-hand limitation in the live call is **(d) a combination of all three factors**: **(a)** `wordRecognition.ts:70,96` configures `numHands: 1` and slices `.landmarks[0]`, **(b)** `wordModel.ts:3-4,43-46`, `personalModel.ts:17`, and `supabase/migrations/202610180001_personal_signs.sql:10` hardcode a 1-hand `30 × 42 = 1260` feature vector, and **(c)** `SignerWords.tsx:32-42` only draws a single `Pt[]` array, while the 2-hand tracker in `landmarks.ts` was left disconnected from the call UI.

### 2.2 Model Audit

| Component | Current Implementation | File & Line References |
| :--- | :--- | :--- |
| **Shared Model Architecture** | `scikit-learn==1.9.1` `RandomForestClassifier(n_estimators=100, random_state=42)` exported to JSON decision trees (`version: 1`, 100 trees) | `ml/legacy/train_words.py:114`, `ml/export_words.py:31-60`, `web/public/trained-words.json:1` |
| **Shared Model Input Shape** | Flat `1260`-element `float32` vector (`30` frames × `42` wrist-relative `(x, y)` features for 1 mirrored hand) | `ml/export_words.py:42`, `web/src/lib/wordModel.ts:3-4, 48-51` |
| **Shared Model Output Classes** | **7 isolated words**: `["DEMO", "FOOD", "GOODBYE", "HELLO", "LISA", "MY", "NAME"]` *(Note: `web/src/vocab.json:1-7` lists 16 GISLR signs + 4 own signs + `_idle` + 3 letters, which were never trained; the user's ~15-word note reflects the 15 samples/word in `word_data.pickle` or the 16 GISLR words in `vocab.json`)* | `web/public/trained-words.json:1`, `ml/README.md:4-7`, `web/src/vocab.json:1-7` |
| **Shared Dataset Source & Size** | **105 custom webcam clips** (7 classes × 15 clips/class, 30 frames/clip) recorded by one signer (Lisa Ou) on a Mac camera (`cv2.CAP_AVFOUNDATION`) in commit `405afe03bae60eac7313f8d58dfa426b9d301862`; zero held-out validation split | `ml/README.md:5-7`, `ml/fetch_legacy_assets.py:14-18`, `ml/legacy/train_words.py:11-12` |
| **Personal Model Architecture** | In-browser 3-Nearest-Neighbor (`3-NN`) classifier using Euclidean distance over RMS-normalized 1,260-float vectors (supports 1–64 custom labels, min 3 examples/label, max 500 total examples) | `web/src/lib/personalModel.ts:3-8, 25-61`, `web/src/pages/PersonalSigns.tsx:38-160` |

### 2.3 Inference Pipeline Audit

- **Execution Environment (`web/src/lib/wordRecognition.ts:62-99`):** Runs 100% client-side in the browser main thread. MediaPipe `HandLandmarker` runs in WASM with `delegate: 'CPU'`, and Random Forest / 3-NN inference runs in plain TypeScript (`wordModel.ts:48-69`, `personalModel.ts:48-61`).
- **Frame Rate & Sampling (`web/src/lib/wordRecognition.ts:90-99`):** `sampleFrame()` runs inside a `requestAnimationFrame` loop, throttling detection to at most **30 FPS** (`time - lastSample < 1000 / 30 - 2` ≈ 31.33 ms) whenever `video.currentTime !== lastVideoTime`. Each frame is horizontally flipped (`context.setTransform(-1, 0, 0, 1, canvas.width, 0)`) onto an offscreen canvas before detection.
- **Latency & Buffering (`web/src/lib/wordRecognition.ts:101-155`):**
  - **Capture mode (`capture()`):** Records 30 sequential frames (~1.0 s window, 6.0 s timeout) before producing a single prediction.
  - **Live mode (`watch()`):** Maintains a 30-frame sliding window (`recent`) and evaluates the 100-tree Random Forest on every new frame (~0.2 ms tree traversal + ~10–25 ms CPU hand detection).
- **Smoothing, Gating & Debouncing (`web/src/lib/wordModel.ts:63-69`, `web/src/lib/dictation.ts:17-59`):**
  - **Shared Forest Gate (`wordModel.ts:68`):** Requires `framesWithHand >= 24`, top class probability `score >= 0.60`, and runner-up margin `margin >= 0.15`.
  - **Personal 3-NN Gate (`personalModel.ts:59-60`):** Requires `framesWithHand >= 24`, vote share `score >= 2/3`, `margin >= 0.30`, `nearest[0].distance <= 0.35`, and `nearest[2].distance <= 0.50`.
  - **Live Dictation State Machine (`dictation.ts:17-52`):** Requires the same accepted label to persist for `holdMs = 350` ms before appending to the sentence buffer; locks that label against repeat emission until the label changes or drops below threshold for `releaseMs = 300` ms; finalizes the sentence when no hand is detected for `endMs = 1500` ms (or at `MAX_DICTATED_WORDS = 20`).
- **Sentence Polish & UI Presentation (`web/src/components/SignerWords.tsx:97-142`, `web/src/lib/signedSentence.ts:12-26`, `server/app/gloss.py:72-83`):**
  - Finalized word lists are sent to `POST /api/gloss`, which prompts Google Gemini (`GEMINI_MODEL=gemini-3.5-flash-lite`, temperature `0.2`, structured JSON output) with the gloss sequence and up to 3 recent hearing-side captions.
  - If Gemini returns `confidence >= 0.6` within `PREPARE_TIMEOUT_MS = 4000` ms (`server/app/main.py:67` enforces a `2.5` s upstream timeout), the polished English sentence is shown in a 6-second countdown preview (`PREVIEW_SECONDS = 6`) with **Send now** and **Cancel** buttons; otherwise it falls back to raw gloss words (`sentenceOrFallback()`).

### 2.4 Video-Call Feature Audit

- **Transport & Signaling (`web/src/lib/call.ts:1-171`, `server/app/main.py:48-63`):** Built on **LiveKit** (`livekit-client@^2.23.0` in browser, `livekit-api==1.2.2` on FastAPI backend). `POST /api/token` mints room-scoped HS256 JWTs with `roomJoin`, `canPublish`, `canSubscribe`, and `canPublishData` grants.
- **Media Streams (`web/src/pages/Call.tsx:390-403`, `web/src/lib/signerVoice.ts:25-70`):**
  - `Call.tsx:390` requests a single video-only camera stream (`640×480 @ 30fps`, `audio: false`) for `local` `<video>` and publishes `media.getVideoTracks()[0]` as `Track.Source.Camera`.
  - For signers, `createSignerVoice()` (`signerVoice.ts:25-58`) creates an `AudioContext` `MediaStreamDestination` track published as `Track.Source.Microphone` (`name: 'voice'`). When a signer sends a caption with **Speak my captions aloud** enabled, `POST /api/tts` streams `mp3_44100_128` audio from ElevenLabs (`eleven_flash_v2_5`), decodes it into the WebAudio buffer, and plays it into the LiveKit audio track while sending `{ type: 'tts', on: true }` over the `ctrl` data channel so the hearing participant's speech-to-text pauses and avoids acoustic echo (`call.ts:408`, `callSpeech.ts:62-71`).
  - Hearing participants stream microphone audio to ElevenLabs Scribe (`scribe_v2_realtime` in `web/src/lib/scribe.ts:36-40`) using a single-use token from `POST /api/scribe-token`.
- **Caption & Control Data Channels (`web/src/lib/call.ts:113-128, 155-160`, `web/src/lib/captions.ts:30-78`):**
  - Uses LiveKit text streams (`sendText` / `registerTextStreamHandler`) on topics `'caption'` (`Caption` JSON payloads) and `'ctrl'` (`Ctrl` JSON payloads).
- **Where Recognition Output Plugs In (`web/src/pages/Call.tsx:515-537, 662`):**
  - `Call.tsx:662` mounts `<SignerWords camera={local} connected={canSend} reconnecting={reconnecting} onPending={setPendingWords} onPrepare={prepareSigned} onSentence={sendSigned} />`.
  - `SignerWords` reads frames directly from `local.current` (`HTMLVideoElement`), calls `prepareSigned()` to translate glosses to English, and calls `sendSigned()` to broadcast the `Caption` over the LiveKit `'caption'` topic and trigger `speak()`.

### 2.5 Existing Tests, Docs, Dependencies, Build/Deploy Setup & Constraints

- **Automated Tests:**
  - Frontend (`web/src/lib/*.test.ts`): 20 Vitest suites totaling 2,402 lines (testing `call`, `callSpeech`, `captions`, `dictation`, `features`, `landmarks`, `mediaCheck`, `personalModel`, `personalSigns.rls` via `@electric-sql/pglite`, `preCall`, `scribe`, `segmenter`, `signLabels`, `signedSentence`, `signerVoice`, `speechCaptions`, `speechFlow`, `stt`, `wordModel`, `wordRecognition`).
  - Browser E2E Scripts (`web/scripts/`): 3 Playwright scripts (`check-camera-startup.mjs`, `check-personal-signs.mjs`, `check-welcome-flight.mjs`) and 1 parity script (`verify-word-parity.ts`).
  - Backend (`server/tests/`): 3 pytest files (`test_api.py`, `test_gloss.py`, `test_schema.py`).
  - ML (`ml/`): **Zero unit tests** exist in `ml/` because `ml/tests/test_parity.py` and `ml/train.py` were dropped during the hackathon.
- **Build & Deploy Setup (`Dockerfile`, `fly.toml`, `server/deploy/`):**
  - Multi-stage `Dockerfile` builds `web/` (`node:24-bookworm`, running `python3 scripts/setup_assets.py && npm run build`) and copies `web/dist` into `python:3.12-slim` served by `uvicorn app.main:app --port 8080`.
  - Deployed on **Fly.io** (`fly.toml`, app `signline-api`, region `iad`, VM size `shared-cpu-1x` with **512 MB RAM**, `min_machines_running = 0`, `auto_stop_machines = "stop"`).
- **Hackathon-Era Shortcuts & Technical Constraints:**
  1. **512 MB Fly.io RAM Limit (`fly.toml:27`):** Running PyTorch or MediaPipe video inference on the server would immediately OOM the 512 MB Fly VM. Primary inference must run in the browser via WebAssembly/WebGL (`@mediapipe/tasks-vision` + `onnxruntime-web`), with server-side inference restricted to an optional lightweight ONNX Runtime CPU endpoint when deployed on a >=2 GB instance.
  2. **Cold-Start Delay (`fly.toml:16-18`):** Because `min_machines_running = 0`, the first `/api/gloss` or `/api/token` request incurs a ~2.5 s Fly machine wake-up penalty (`plan.md:45`), which can trip the 2.5 s timeout in `server/app/main.py:67`.
  3. **Strict TypeScript Compiler Flags (`AGENTS.md:62`, `web/tsconfig.app.json`):** `erasableSyntaxOnly: true` and `noUnusedLocals: true` forbid TypeScript `enum`, `namespace`, and `constructor(private x)` parameter properties.
  4. **Hardcoded Supabase 1,260-Float Constraint (`supabase/migrations/202610180001_personal_signs.sql:9-12`):** The database rejects any feature vector whose length is not `1260` or whose `feature_version` is not `'word-v1'`. Upgrading to 2-hand features (`32 × 174 = 5568` floats) requires a backward-compatible SQL migration (`feature_version = 'holistic-v2'`).
  5. **Hardcoded Public Supabase Keys in `fly.toml:10-12`:** While publishable/anon keys are safe for browser bundles, environment-specific URLs should be managed cleanly across staging and production.

### 2.6 Current State and Root Causes Summary (Including UNVERIFIED Items)

- **Root Cause 1 (One-Hand Tracking & Overlay):** `wordRecognition.ts` hardcodes `numHands: 1` (line 70) and `.landmarks[0]` (line 96); `wordModel.ts` hardcodes `WORD_FEATURES = 42` (line 4); `SignerWords.tsx` (lines 32–42) only renders one 21-point hand; and the 2-hand tracker in `landmarks.ts` is only connected to `#/bench` and `#/record`.
- **Root Cause 2 (Tiny 7-Word Overfit Vocabulary):** The shipped `trained-words.json` Random Forest was trained on 105 clips from a single signer (`Lisa Ou`) with no held-out validation split and no scale/shoulder normalization, causing it to fail on new signers, different camera distances, or two-handed signs (`plan.md:38-39`).
- **Root Cause 3 (No Continuous Sequence or Fingerspelling Model in Call):** Live dictation (`dictation.ts`) simply runs the 30-frame isolated-word forest on every frame and waits for a 350 ms static hold, which cannot segment natural co-articulated signing or decode fingerspelled words.
- **UNVERIFIED Items:**
  - **Live Provider Quotas & Keys (`UNVERIFIED`):** `server/.env` is gitignored and absent from the archive; live connectivity and rate limits for LiveKit Cloud, Google AI Studio (`gemini-3.5-flash-lite`), ElevenLabs (`eleven_flash_v2_5` / `scribe_v2_realtime`), and Tiger Data (`DATABASE_URL`) could not be tested inside the offline sandbox.
  - **Real-Camera Frame Rate on Target Laptops (`UNVERIFIED`):** Actual GPU/CPU MediaPipe inference latency on the team's MacBooks and MSI RTX 3060 laptop requires physical webcam execution on `#/bench`.
  - **Retained Git Object History for Commit `405afe0` (`UNVERIFIED`):** Because the uploaded repository was provided as a working-tree zip archive without `.git/objects`, `git show 405afe03bae60eac7313f8d58dfa426b9d301862:word_model.p` could not be verified locally (though `web/public/trained-words.json` is already committed and verified via `wordModel.test.ts`).

---

## 3. Step 3: Measurable Goals by Stage (Stages A–E)

To progress from the current 1-hand, 7-word prototype to real-time two-hand captioning in a video call without breaking the working app, we define five measurable stages grounded in the empirical benchmarks of the datasets audited in [DATASETS.md](https://www.google.com/search?q=DATASETS.md):

| Stage | Scope & Deliverable | Measurable Targets | Realism Classification | Demo Readiness |
| :--- | :--- | :--- | :--- | :--- |
| **Stage A: Two-Hand + Holistic Tracking** | Unify browser tracking on `HandLandmarker` (`numHands: 2`), `PoseLandmarker` (`0..16`), and optional `FaceLandmarker` (brow/head non-manual markers); render both hands + pose anchors on the live call canvas; implement `canonicalize()` handedness normalization (`T=32, F=174`); pass TypeScript↔Python parity (`< 1e-4` max diff). | **2 hands** tracked & drawn simultaneously; **>= 24 FPS** (`<= 35 ms` detect time) on laptop WebGL/GPU (`>= 18 FPS` on CPU fallback); **100% parity** across 7 canonicalization & missing-hand test cases; existing 7-word forest still works via legacy slice adapter. | **Realistic & Immediate** (code foundations already 70% present in `landmarks.ts` and `features.ts`). | **Usable Demo 1** (Ships at end of **Phase 1**). |
| **Stage B: Fingerspelling (A–Z, 0–9 & Continuous Words)** | Static + dynamic fingerspelling recognition (all 26 letters A–Z including dynamic `J` and `Z`, plus digits `0–9`) and continuous fingerspelled word/name decoding trained on Kaggle Google ASL Fingerspelling (`asl-fingerspelling`, 67,287 sequences, CC BY 4.0). | **>= 88% top-1 accuracy** on held-out signers for isolated A–Z / 0–9 holds; **<= 18% Character Error Rate (CER)** on unseen signers for continuous fingerspelled names/words (grounded in FSboard's 11.1% CER ByT5 baseline and 16.4% CER Kaggle TFLite top solutions). | **Realistic** for isolated letters and slow-to-moderate fingerspelled names (15–30 Hz landmarks); fast conversational fingerspelling (>60 WPM) remains challenging on low-end webcams. | **Usable Demo 2** (Ships in **Phase 3**). |
| **Stage C: Large-Vocabulary Isolated Signs** | Two-tier isolated sign classifier on the unified `32 × 174` two-hand + pose + face tensor: **Tier C1 (Commercial-Safe Core)** trained on Kaggle GISLR / PopSign v1.0 (250 signs, 94,477 clips, CC BY 4.0) + consented recordings; **Tier C2 (Expanded Research Lexicon)** merging ASL Citizen v1.0 (2,731 signs, 83,399 clips) + GISLR via ASL-LEX 2.0 IDs (~2,800 unique signs). | **Tier C1 (250 signs):** **>= 80% Top-1 / >= 93% Top-5** signer-independent accuracy (PopSign baseline is 83.8% Top-1).<br>**Tier C2 (1,000–2,731 signs):** **>= 60% Top-1 / >= 85% Top-5 / >= 90% Top-10** signer-independent accuracy (ASL Citizen ST-GCN/I3D baselines achieve 59.5%–63.1% Top-1, 82.7%–86.1% Top-5, 88.1%–90.9% Top-10). | **Tier C1 (250 signs) is production-realistic** for live auto-captioning; **Tier C2 (1,000–2,731 signs) is realistic for Top-5 assisted chip selection / dictionary lookup**, but Top-1 (~60%) is too noisy for unreviewed auto-speak without Top-K LLM disambiguation. | **Usable Demo 3** (Ships in **Phase 3**). |
| **Stage D: Continuous Signing & Gloss-to-English Translation** | Segment continuous sign streams using motion-onset/offset + sliding-window CTC sequence decoding (trained on synthetic concatenated GISLR/ASL Citizen sequences + How2Sign Holistic `PSewmuthu/How2Sign_Holistic` 35k sentences), fused with facial grammar tags (`Q-YN`, `Q-WH`, `NEG`) and contextual Gemini (`POST /api/gloss`) + offline rule-based translation. | **<= 28% Word Error Rate (WER)** on constrained vocabulary multi-sign sequences (3–6 signs/utterance with brief inter-sign transitions); **>= 35 BLEU-4** on constrained conversational templates; **15–22 BLEU-4** on open-domain continuous signing (How2Sign SOTA is 15.5 BLEU-4). | **Constrained continuous signing (paused/phrased sequences of known signs + LLM lattice rescoring) is realistic**; **unconstrained open-domain conversational ASL translation is a Research-Grade Stretch Goal** due to coarticulation, spatial classifiers, and 15.5 BLEU SOTA limits. | **Later / Stretch Demo** (Ships in **Phase 4**). |
| **Stage E: Real-Time In-Call Performance & End-to-End UX** | Browser Web Worker (`onnxruntime-web` WASM SIMD) running two-hand tracking + ONNX inference on local camera stream, streaming live draft/final captions and retractions over LiveKit data channels, with `< 5 MB` quantized ONNX bundles and optional server fallback. | **>= 24 FPS** camera loop; **<= 35 ms** landmark detection + **<= 8 ms** ONNX classification per segment; **<= 1,500 ms** p50 end-to-end latency from sign completion to remote caption display (**<= 2,200 ms** with TTS audio); **< 5 MB** initial ONNX download. | **Realistic & Production-Viable** on modern desktop/laptop browsers (Chrome/Edge/Brave). | **Production Demo** (Ships in **Phase 5 & Phase 6**). |

---

## 4. Phase Index & Status Checklist

Executing agents must work through these phases sequentially, updating the status checkboxes below and recording architectural choices in `docs/subplans/model-v2/DECISIONS.md` as specified in [AGENT\_GUIDE.md](https://www.google.com/search?q=AGENT_GUIDE.md).

| Phase | File | Objective | Primary Topics Covered | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | [phase-01-two-hand-holistic-tracking.md](https://www.google.com/search?q=phase-01-two-hand-holistic-tracking.md) | Fix the one-hand tracking & overlay bug, unify browser/Python on the `T=32, F=174` two-hand + pose + face schema with `canonicalize()`, and keep the 7-word model working via a legacy adapter. | Topic 1 (Two-hand & holistic extraction, handedness, mirroring, normalized schema) | - [x] Complete - 250 frontend tests, 7 parity cases; live webcam QA pending |
| **Phase 2** | [phase-02-dataset-acquisition-preprocessing.md](https://www.google.com/search?q=phase-02-dataset-acquisition-preprocessing.md) | Build automated downloaders, checksum verifiers, license-tier manifests, and offline landmark extraction/reconciliation pipelines for GISLR, ASLFR, How2Sign Holistic, and ASL Citizen. | Topics 2 & 3 (Dataset acquisition, verification, dead-link handling, manifest, offline preprocessing cache) | - [ ] Pending |
| **Phase 3** | [phase-03-fingerspelling-and-expanded-isolated-model.md](https://www.google.com/search?q=phase-03-fingerspelling-and-expanded-isolated-model.md) | Train and evaluate the Stage B fingerspelling model (A–Z, 0–9, continuous phrases) and Stage C isolated sign models (250-sign Commercial Core + 1,000–2,731-sign Research Extended) with signer-independent splits. | Topics 4 & 5 (Model architectures, augmentations, signer-independent training, confusion & webcam eval) | - [ ] Pending |
| **Phase 4** | [phase-04-continuous-signing-and-gloss-translation.md](https://www.google.com/search?q=phase-04-continuous-signing-and-gloss-translation.md) | Implement Stage D sliding-window + CTC continuous sign segmentation, non-manual facial grammar markers (`Q-YN`, `Q-WH`, `NEG`), top-K lattice rescoring in `/api/gloss`, and offline fallback rules. | Topics 1, 4 & 5 (Continuous CTC/encoder-decoder, non-manual markers, language layer) | - [ ] Pending |
| **Phase 5** | [phase-05-browser-onnx-deployment-and-call-integration.md](https://www.google.com/search?q=phase-05-browser-onnx-deployment-and-call-integration.md) | Export quantized `< 5 MB` ONNX models, run inference in a browser Web Worker (`onnxruntime-web`), wire live top-K chips and caption retraction into the LiveKit call, and migrate Supabase personal signs to v2. | Topics 6 & 7 (Browser ONNX deployment, latency/FPS budgets, server fallback, LiveKit data channels, privacy/consent) | - [ ] Pending |
| **Phase 6** | [phase-06-testing-qa-and-documentation.md](https://www.google.com/search?q=phase-06-testing-qa-and-documentation.md) | Complete unit/regression/latency benchmark suites, two-person call QA protocol, Model Card, dataset attributions, changelog, and the long-term research backlog. | Topics 8, 9 & 10 (Testing & QA, documentation, model card, attributions, research backlog) | - [ ] Pending |

### Companion Documents in `docs/subplans/model-v2/`

- [DATASETS.md](https://www.google.com/search?q=DATASETS.md): Comprehensive Step 2 dataset discovery, verification, comparison matrix, combination strategy, storage/compute budget, licensing risk summary, and unverified leads (checked `2026-10-18`).
- [datasets.json](https://www.google.com/search?q=datasets.json): Machine-readable JSON manifest of all recommended and audited datasets for programmatic consumption by training and download scripts.
- [AGENT\_GUIDE.md](https://www.google.com/search?q=AGENT_GUIDE.md): Mandatory operating rules, git hygiene, test gates, license guardrails, and human-escalation protocols for executing AI coding agents.

---

## 5. Glossary

- **ASL-LEX 2.0:** A lexical and phonological database of 2,723 American Sign Language signs (`https://asl-lex.org/`) providing canonical sign IDs (`EntryID`), frequency, iconicity, and phonological features. Used in this plan as the canonical namespace to merge vocabularies across datasets.
- **Canonical Handedness (`canonicalize()`):** A per-clip coordinate transformation (`web/src/lib/features.ts`) that measures total wrist path length of the image-left vs. image-right hand relative to the shoulder midpoint (`bodyCenterX`). If the image-right hand moves more (indicating a left-handed signer in a mirrored preview or an unmirrored recording), the frame is horizontally mirrored (`x -> 1 - x`) so the dominant signing hand always occupies the first feature slot (`0..83`).
- **CER (Character Error Rate):** Minimum Levenshtein edit distance at the character level divided by ground-truth character length; primary metric for continuous fingerspelling recognition (Stage B).
- **Coarticulation:** The transitional blending of handshapes and movements between consecutive signs in natural continuous signing, which causes isolated-sign classifiers to degrade on unsegmented streams.
- **CTC (Connectionist Temporal Classification):** A sequence-to-sequence loss function and decoding method that aligns unsegmented frame-level feature sequences (`T` frames) to shorter token sequences (letters or glosses) using a blank token (`<blank>`), without requiring frame-exact start/end timestamps.
- **GISLR (Google Isolated Sign Language Recognition):** The 2023 Kaggle competition dataset (`asl-signs`) derived from PopSign v1.0, containing 94,477 pre-extracted MediaPipe Holistic Parquet files across 250 everyday ASL signs and 21 Deaf signers under CC BY 4.0.
- **Gloss:** An uppercase English word or compound identifier (e.g., `THANKYOU`, `ME`, `GO`) used by linguists and recognition models to label a discrete ASL sign. Glosses are labels, not English translations, and follow ASL syntax rather than English word order.
- **LiveKit Data Channels / Text Streams:** Low-latency WebRTC data transport (`sendText` / `registerTextStreamHandler` on topics `'caption'` and `'ctrl'` in `web/src/lib/call.ts`) used by SignLine to transmit captions and control signals peer-to-peer without uploading raw video to an inference server.
- **NMM (Non-Manual Markers):** Grammatical signals conveyed through facial expressions, head movement, and upper-body posture rather than the hands—such as raised eyebrows (`Q-YN` for yes/no questions), furrowed eyebrows (`Q-WH` for wh-questions), and headshakes (`NEG` for negation).
- **Signer-Independent Split (`GroupKFold`):** A dataset partitioning rule ensuring that all clips from any given human signer (`participant_id` / `signer_id`) appear exclusively in `train`, `val`, or `test`. Splitting randomly by clip leaks signer identity (body proportions, signing speed, background) and inflates test accuracy by 20–50 percentage points (as demonstrated in the ASL Citizen paper, where WLASL-2000 I3D drops from 32.5% to 8.5% on unseen signers).
- **WER (Word Error Rate):** Word-level Levenshtein edit distance (substitutions + insertions + deletions) divided by reference word/gloss count; primary metric for continuous sign recognition (Stage D).

---

## 6. Top 5 Risks and First 3 Actions to Take

### Top 5 Risks

1. **Cross-Dataset Signer Overfitting & Coordinate Mismatch:** Merging pre-extracted landmarks from Kaggle GISLR (portrait smartphone `w/h ≈ 0.75`, unmirrored MediaPipe Holistic), How2Sign Holistic (studio green-screen `1280×720`), and ASL Citizen (webcam `640×480`) without aspect-ratio correction and shoulder-centered normalization will cause the model to classify dataset origin rather than sign semantics. *Mitigation:* Enforce aspect-corrected shoulder normalization (`anchors()` in `features.ts` / `features.py`), `--estimate-aspect-from` calibration, ±10% x-stretch augmentation, and strict signer-independent `GroupKFold` validation.
2. **Licensing Contamination Between Research-Only and Commercial Models:** ASL Citizen (Microsoft Research License), How2Sign (CC BY-NC 4.0), OpenASL (CC BY-NC-ND 4.0), and WLASL/MS-ASL (C-UDA-1.0) prohibit commercial use. Training a single model on all datasets would taint weights needed for a public commercial deployment. *Mitigation:* Enforce a strict `--license-tier commercial` (Kaggle GISLR + Kaggle ASLFR / FSboard + PopSign, all CC BY 4.0, plus consented first-party recordings) vs. `--license-tier research` split in `data/manifests/clip_manifest.parquet` and produce separate checkpoint artifacts.
3. **Browser Main-Thread Jitter During Simultaneous WebRTC Encoding & Dual-Model Tracking:** Running MediaPipe `HandLandmarker` (`numHands: 2`) + `PoseLandmarker` + `FaceLandmarker` + ONNX inference on the main UI thread alongside LiveKit WebRTC VP8/H.264 video encoding can drop frame rates below 15 FPS on integrated-GPU laptops. *Mitigation:* Enable the `GPU` WebGL delegate in `landmarks.ts`, throttle `FaceLandmarker` to every 3rd frame (`n % 3 === 0`), move ONNX Runtime Web (`onnxruntime-web`) into a dedicated Web Worker (`web/src/lib/onnxWorker.ts`), and auto-disable `FaceLandmarker` if rolling FPS drops below 18 FPS for 3 seconds.
4. **False-Positive Auto-Speak on Out-of-Vocabulary or Transitional Motion:** When vocabulary scales from 7 words to 250–2,731 signs, casual hand movements (scratching face, adjusting glasses, resting hands) or low-confidence top-1 predictions (~60% on 2,731 signs) can trigger unintended spoken sentences. *Mitigation:* Include an explicit `_idle` class in training, enforce calibrated temperature scaling (`fit_temperature`) and margin gating (`p1 >= tau && p1 - p2 >= margin`), pass top-3 alternatives to Gemini `/api/gloss` for contextual disambiguation, hold low-confidence utterances as interactive chips, and provide 1-click **"That was wrong"** caption retraction (`Caption.retracted = true`).
5. **External Dataset Download Bottlenecks & Gated Access in Agent Environments:** Full raw datasets are 40–85 GB and Kaggle requires an authenticated `kaggle.json` token, while cloud coding agents often run in sandboxes with restricted egress or small disks. *Mitigation:* Every phase includes a synthetic-data smoke test (`test_gislr_convert.py`, `test_train_smoke.py`, `fake-sessions.ts`) so agents can implement and verify 100% of the pipeline offline without waiting for human downloads, while `phase-02` provides exact one-line CLI commands for the human operator to stage datasets on the GPU machine.

### First 3 Actions to Take

1. **Execute Phase 1 (`phase-01-two-hand-holistic-tracking.md`) to Fix the One-Hand Bug Immediately:** Replace the 1-hand `createWordCapture()` tracker in `web/src/lib/wordRecognition.ts` with the unified 2-hand + pose + face tracker (`web/src/lib/landmarks.ts`), update `drawLive()` in `web/src/components/SignerWords.tsx` to draw both hands and upper-body pose anchors, add `canonicalize()` to `web/src/lib/features.ts`, and create `ml/features.py` + `ml/tests/test_parity.py`. Keep the 7-word model working via a backward-compatible 1-hand slice adapter so the live call immediately shows two-hand tracking.
2. **Stage the CC BY 4.0 Pre-Extracted Landmark Datasets (`phase-02-dataset-acquisition-preprocessing.md`):** On the training machine (e.g., the MSI RTX 3060 laptop or a cloud GPU instance), configure `~/.kaggle/kaggle.json` and run `python ml/datasets/download.py --dataset gislr aslfr` to fetch the pre-extracted MediaPipe Holistic Parquet archives (`asl-signs.zip` and `asl-fingerspelling.zip`). Because these already contain MediaPipe landmarks, you bypass hundreds of GPU-hours of raw video decoding and can start training within 30 minutes.
3. **Train & Export the Stage B Fingerspelling + Stage C1 250-Sign ONNX Models (`phase-03-fingerspelling-and-expanded-isolated-model.md`):** Run the offline converter (`ml/gislr_to_features.py`) and trainer (`ml/train.py`) to produce `web/public/models/sign_v2.onnx` and `web/public/models/fingerspell_v2.onnx`, verify PyTorch-to-ONNX parity (`< 1e-3`), and wire them into the browser Web Worker in Phase 5.
