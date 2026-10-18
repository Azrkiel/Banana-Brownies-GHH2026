# Phase 06: Testing, Regression QA, Latency Benchmarking, Documentation, Model Card & Research Backlog

**Status:** `[ ]` Pending

**Target Stages:** Cross-Cutting QA & Release Readiness across Stages A–E

**Estimated Effort:** 4–6 hours (1–2 coding agent sessions)

**Compute Requirements:** CPU-only (`pytest`, `vitest`, headless Playwright/browser benchmark, documentation authoring).

## 1. Objective and Why It Matters

### 1.1 Current State & Problem (from Step 1 Audit)

1. **Zero Automated Tests:** The repository currently has **0 test files** across `web/`, `server/`, and `ml/`.

2. **Missing Model Card, License & Dataset Attributions:** There is no root `LICENSE`, no Model Card documenting intended use, demographic bias, or the critical ethical disclaimer that **automated ASL recognition does not replace a certified human ASL interpreter**, and no attribution file crediting the dataset creators ([Google GISLR/ASLFR](https://www.google.com/search?q=https%3A%2F%2Fwww.kaggle.com%2Fcompetitions%2Fasl-signs%2Fdata), [Microsoft Research ASL Citizen](https://www.google.com/search?q=https%3A%2F%2Fwww.microsoft.com%2Fen-us%2Fresearch%2Fproject%2Fasl-citizen%2F), [WLASL](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fdxli94%2FWLASL), [How2Sign](https://www.google.com/search?q=https%3A%2F%2Fhow2sign.github.io%2F)).

### 1.2 Why This Phase Matters

Before handing off Model v2 for public demos or deployment, we need:

1. A deterministic **Unit & Golden-Fixture Regression Suite** verifying Python ↔ TypeScript canonicalization parity, ONNX model accuracy on held-out 1-hand and 2-hand clips, and `/api/gloss` + `/api/infer` contract stability.

2. An automated **Browser & Server Latency Benchmark** (`#/bench` + `ml/benchmark_latency.py`) enforcing our p50/p95 frame-rate and latency budgets.

3. A step-by-step **Manual Two-Person Video-Call QA Runbook** (`docs/QA_RUNBOOK.md`) that two humans (or one tester with two browser windows) can run in 10 minutes.

4. Complete **Model Card (`docs/MODEL_CARD.md`)**, **Dataset Attributions (`docs/ATTRIBUTIONS.md`)**, **Changelog (`CHANGELOG.md`)**, and a prioritized **Research Backlog** (Topic 10).

## 2. Prerequisites and Dependencies

* **Phases 01–05 Complete:** Holistic 2-hand feature pipeline, trained & calibrated ONNX models, continuous segmenter + NMM extractor, and LiveKit video-call integration all in place.

## 3. Concrete Tasks (Ordered for Agent Sessions)

### Task 6.1: Unit & Held-Out Clip Regression Suite (`ml/tests/`, `server/tests/`, `web/src/lib/__tests__/`)

Create and wire a single-command test suite (`Makefile` or root `scripts/run_all_tests.sh`):

1. **Python ML Unit & Regression Tests (`ml/tests/`):**

   * `ml/tests/test_features_parity.py`: Loads `ml/tests/fixtures/canonical_holistic_v2_fixtures.json` and verifies `max(abs(py_out - ts_out)) < 1e-5` across missing-hand, 1-hand, 2-hand, and off-center poses.

   * `ml/tests/test_augment_and_models.py`: Tests L/R hand mirror involution (`mirror(mirror(x)) == x`), model output shapes, masked padding invariance, and temperature scaling (`T_temp > 0`).

   * `ml/tests/test_regression_clips.py`: Commits a compact **25-clip anonymized landmark regression fixture** (`ml/tests/fixtures/regression_clips_25.npz`, `< 450 KB` total — containing only `32×174` float tensors, never raw video) spanning:

     * 10 two-handed signs (`BOOK`, `HELP`, `FAMILY`, `FINISHED`, `MORE`, `THANK-YOU`, `PLEASE`, `SCHOOL`, `WORK`, `FRIEND`)

     * 8 one-handed signs (`HELLO`, `WATER`, `EAT`, `YES`, `NO`, `ME`, `YOU`, `WHERE`)

     * 5 fingerspelled sequences (`A`, `J`, `Z`, `L-I-S-A`, `A-L-E-X`)

     * 2 `_idle` / non-signing rest sequences

   * Asserts that the exported quantized ONNX models (`web/public/models/sign_c1_250.onnx` and `sign_b_fingerspell.onnx`) achieve `>= 90%` accuracy on the regression fixture and `0` false triggers on the `_idle` clips.

2. **Backend FastAPI Tests (`server/tests/`):**

   * `server/tests/test_api.py`: Tests `/api/health`, `/api/token` validation, `/api/gloss` (both legacy `glosses` array and v2 `lattice + nmm_tags` payloads, plus offline fallback when `GEMINI_API_KEY` is unset), and `/api/infer` (`32×174` landmark payload validation and latency `< 25 ms`).

3. **Frontend Vitest Suite (`web/src/lib/__tests__/`):**

   * `features.test.ts`, `segmenter.test.ts`, `nmm.test.ts`, `grammarFallback.test.ts`, and `personalModel.test.ts`.

### Task 6.2: Automated Latency & Memory Benchmark (`ml/benchmark_latency.py` & `web/src/routes/Bench.tsx`)

1. **CLI ONNX Latency & Memory Profiler (`ml/benchmark_latency.py`):**

   * Runs `1,000` warmup + `2,000` timed iterations of `sign_c1_250.onnx` and `sign_b_fingerspell.onnx` on single-threaded and 2-threaded CPU (`onnxruntime`), reporting `p50`, `p95`, `p99` latency (ms), peak RSS memory (MB), and model file size (MB) in `docs/subplans/model-v2/BENCHMARK_REPORT.md`.

2. **In-Browser `#/bench` Harness Upgrade (`web/src/routes/Bench.tsx`):**

   * Adds a **"Run 300-Frame Benchmark"** button in `#/bench` that feeds synthetic/recorded `32×174` windows through `HolisticTracker` + `onnxWorker` and exports a JSON/Markdown performance card showing browser FPS, MediaPipe ms/frame, ONNX Worker p50/p95 ms, and WebRTC data-channel round-trip time.

### Task 6.3: Manual Two-Person Video-Call QA Runbook (`docs/QA_RUNBOOK.md`)

Create `docs/QA_RUNBOOK.md` with a 12-step scripted protocol for two real testers on a call (`Signer` on Laptop/Phone A at `#/call/qa-room?role=signer`, `Hearing Partner` on Laptop/Phone B at `#/call/qa-room?role=hearing`):

1. **Scenario 1 — Two-Hand Overlay & Dominant/Non-Dominant Verification:** Signer raises left hand only (`Cyan`), right hand only (`Amber`), then both hands together (`BOOK`, `HELP`). Verify both skeletons render at `>= 24 FPS` with zero flickering.

2. **Scenario 2 — Left-Handed Signer Test:** Signer performs 5 signs predominantly with the left hand (`HELLO`, `WATER`, `THANK-YOU`, `WHERE`, `FRIEND`). Verify recognition accuracy matches right-handed execution.

3. **Scenario 3 — Continuous Sentence + Facial Question Marker (`[Q-YN]`):** Signer signs `YOU WANT WATER` while raising eyebrows at the end. Verify Hearing Partner sees `"Do you want water?"` and hears the ElevenLabs voice output.

4. **Scenario 4 — Fingerspelled Name Introduction:** Signer signs `MY NAME` then fingerspells `A-L-E-X`. Verify Hearing Partner receives `"My name is Alex."`

5. **Scenario 5 — Instant Retraction (`"That was wrong"`):** Signer triggers a sign, then clicks `"That was wrong"`. Verify the caption is immediately retracted on the Hearing Partner's screen.

6. **Scenario 6 — Personal Sign Few-Shot Calibration (`#/calibrate`):** Signer records 3 demos of a custom sign (e.g., `UVA` or `HACKATHON`), enters the call, and triggers it reliably.

7. **Scenario 7 — Bidirectional Speech-to-Text (`Hearing -> Signer`):** Hearing Partner speaks `"Nice to meet you, Alex, where are you calling from?"` Verify ElevenLabs Scribe streams live captions to the Signer's screen within `300 ms`.

### Task 6.4: Model Card, Dataset Attributions & Changelog (`docs/MODEL_CARD.md`, `docs/ATTRIBUTIONS.md`, `CHANGELOG.md`)

Create three essential documentation artifacts (Topic 9):

1. **`docs/MODEL_CARD.md` (following Mitchell et al. / Hugging Face Model Card standard):**

   * **Model Details:** Architecture (`SignConformerV2` + `FingerspellingCTCMini`), input schema (`holistic_v2_32x174`), parameter count, quantization, and license split (**Commercial Tier C1** vs. **Research Tier C2/D2**).

   * **Intended Use & Critical Ethical Disclaimer:** Explicitly states that SignLine Model v2 is an **assistive communication aid for casual peer-to-peer video calls and educational practice** and **MUST NOT be used as a substitute for a qualified, certified human ASL interpreter in medical, legal, emergency, financial, or high-stakes employment settings** (citing ADA Title II/III and NAD guidelines).

   * **Known Limitations & Demographic Bias Analysis:**

     * Documented signer demographics in training sets (e.g., [Kaggle GISLR](https://www.google.com/search?q=https%3A%2F%2Fwww.kaggle.com%2Fcompetitions%2Fasl-signs%2Fdata) has only 21 signers; [How2Sign](https://www.google.com/search?q=https%3A%2F%2Fhow2sign.github.io%2F) has 11 signers; [ASL Citizen](https://www.google.com/search?q=https%3A%2F%2Fwww.microsoft.com%2Fen-us%2Fresearch%2Fproject%2Fasl-citizen%2Fdatasheet%2F) has 52 signers across 16 U.S. states, 61.5% female, 38.5% male).

     * Accuracy degradation under extreme low light, heavy motion blur (`< 15 FPS` cameras), out-of-frame hands (signing near waist or while holding a phone in one hand), regional ASL dialects, Black ASL (BASL) lexical/spatial variations, and tactile/protactile signing.

   * **Evaluation Metrics Summary:** Table of Top-1, Top-5, Macro F1, CER, WER, and ECE across held-out signers.

2. **`docs/ATTRIBUTIONS.md`:**

   * Complete BibTeX citations, license quotes, and attribution notices for every dataset in `docs/subplans/model-v2/DATASETS.md` (GISLR, ASLFR/FSboard, PopSign, ASL Citizen, WLASL, How2Sign, Sem-Lex, ASL-LEX 2.0).

3. **`CHANGELOG.md`:**

   * Structured `v2.0.0` changelog documenting the transition from the hackathon 1-hand 7-word RandomForest (`v1.0.0`) to the 2-hand holistic `SignConformerV2` + `FingerspellingCTCMini` architecture.

## 4. Next Steps & Research Backlog (Topic 10)

Document the post-v2 research backlog inside `docs/MODEL_CARD.md` and `docs/subplans/model-v2/README.md`:

1. **Richer Non-Manual Markers (NMMs) via MediaPipe Face Blendshapes (`52` ARKit-style blendshapes):**

   * Upgrade from 8 geometric face points to MediaPipe Face Landmarker's `outputFaceBlendshapes: true` (`52` blendshape coefficients) to capture ASL **mouth morphemes** (`CHA` for large/intense, `MM` for normal/effortless, `TH` for careless, `OO` for thin/narrow, `PAH` for finally/success), cheek puffs, and eye squints, plus torso lean and shoulder shifts (role shifting / constructed action).

2. **Regional Variants, Black ASL (BASL) & Signer Dialect Adaptation:**

   * Partner with Deaf community organizations and university linguistics labs to evaluate and expand coverage for regional ASL variations (e.g., age signs, birthday/holiday signs, state/city names) and Black ASL (BASL), which famously uses higher rates of two-handed signs, larger signing space, and distinct lexical items (McCaskill et al., *The Hidden Treasure of Black ASL*).

3. **On-Device LoRA / Prototype Adapter Personal Fine-Tuning:**

   * Extend `personalModel.ts` from cosine prototype matching on the `192`-dim embedding to an in-browser WebGPU rank-4 LoRA adapter on the final Conformer block so a user's personal signing speed and hand proportions adapt across all 250–2,731 signs after 10–15 calibration clips.

4. **Larger Multimodal / Video-Pose Pretrained Backbones (Server GPU Tier):**

   * For self-hosted GPU deployments (`L4` / `A10G`), integrate pre-trained multimodal video+pose transformers (e.g., [SSVP-SLT](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Ffacebookresearch%2Fssvp_slt) or [YouTube-ASL](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fgoogle-research%2Fgoogle-research%2Fblob%2Fmaster%2Fyoutube_asl%2FREADME.md) T5/ByT5 sign-to-text encoders) alongside browser landmark streaming.

5. **Consented Community Data Collection Pipeline (`#/contribute`):**

   * Turn the existing `#/record` route (`web/src/routes/Record.tsx`) into an IRB/consent-gated community contribution portal where Deaf and fluent ASL signers can opt in under an explicit `CC BY 4.0` consent form, recording **anonymized `F=174` holistic landmarks only (no raw video face pixels stored)** with self-reported handedness and region metadata to grow our commercial-safe vocabulary from 250 signs to 1,500+ signs.

## 5. Exact Files and Directories to Create or Modify

| File Path | Action | Description | 
| ----- | ----- | ----- | 
| `ml/tests/test_regression_clips.py` | **Create** | Regression test runner on held-out 1-hand, 2-hand, fingerspelling, and `_idle` landmark fixtures. | 
| `ml/tests/fixtures/regression_clips_25.npz` | **Create** | Compact (`< 450 KB`) anonymized 25-clip landmark tensor regression fixture. | 
| `ml/benchmark_latency.py` | **Create** | Automated CPU/ONNX latency (`p50/p95/p99`) and memory benchmark script. | 
| `server/tests/test_api.py` | **Create** | FastAPI unit test suite covering `/api/health`, `/api/token`, `/api/gloss`, and `/api/infer`. | 
| `scripts/run_all_tests.sh` | **Create** | Single command running `pytest ml/tests`, `pytest server/tests`, and `cd web && npx vitest run`. | 
| `docs/QA_RUNBOOK.md` | **Create** | Step-by-step manual two-person video-call QA test script. | 
| `docs/MODEL_CARD.md` | **Create** | Comprehensive Model Card (intended use, non-interpreter disclaimer, demographic bias, metrics, research backlog). | 
| `docs/ATTRIBUTIONS.md` | **Create** | Full dataset citations, primary URLs, and license attributions. | 
| `CHANGELOG.md` | **Create** | Release changelog for Model v2 (`v2.0.0`). | 

## 6. Commands, Tools & Pinned Libraries

```
# 1. Run the complete cross-stack test suite (Python ML + FastAPI Server + TypeScript Web)
bash scripts/run_all_tests.sh

# 2. Run the automated ONNX latency & memory benchmark
python -m ml.benchmark_latency \
  --c1-onnx web/public/models/sign_c1_250.onnx \
  --b-onnx web/public/models/sign_b_fingerspell.onnx \
  --out docs/subplans/model-v2/BENCHMARK_REPORT.md

```

## 7. Acceptance Criteria

* \[ \] **AC-6.1 (Green Cross-Stack Test Suite):** `bash scripts/run_all_tests.sh` exits with code `0` across all Python (`ml/tests/`, `server/tests/`) and TypeScript (`web/src/lib/__tests__/`) unit and regression tests.

* \[ \] **AC-6.2 (Latency & Size Gate):** `ml/benchmark_latency.py` confirms single-window inference p95 `<= 35 ms`, combined ONNX bundle size `<= 6 MB`, and peak server RSS `< 180 MB`.

* \[ \] **AC-6.3 (Documentation & Compliance Completeness):** `docs/MODEL_CARD.md`, `docs/ATTRIBUTIONS.md`, `docs/QA_RUNBOOK.md`, and `CHANGELOG.md` exist, contain zero `TODO` placeholders, include the explicit human-interpreter disclaimer, and accurately distinguish Commercial Tier (`CC BY 4.0`) from Research Tier (`Non-Commercial`) checkpoints.

## 8. Risks, Fallbacks & "If This Fails, Do X"

1. **Risk: Browser WebGL/WASM automated tests fail in headless CI without a physical webcam or GPU.**

   * *If this fails:* Keep unit and regression tests driven by pre-extracted landmark fixtures (`regression_clips_25.npz` and `canonical_holistic_v2_fixtures.json`) so CI tests `canonicalize()`, `Segmenter`, `NMMExtractor`, and `onnxruntime` deterministically without needing a hardware webcam. Reserve physical webcam testing for `docs/QA_RUNBOOK.md`.

## 9. Handoff Note for Executing Agent

> **Handoff Context (Phase 06):**
>
> This is the final phase of the Model v2 plan. Run `bash scripts/run_all_tests.sh` and `python -m ml.benchmark_latency` to verify every acceptance criterion across Phases 01–06. Double-check `git status` and `git check-ignore` to ensure no raw dataset files (`.mp4`, `.parquet`, large `.pt` checkpoints) are staged. Complete `docs/MODEL_CARD.md`, `docs/ATTRIBUTIONS.md`, `docs/QA_RUNBOOK.md`, and `CHANGELOG.md`, mark all phases `[x]` in `docs/subplans/model-v2/README.md`, and record final benchmark numbers in `docs/subplans/model-v2/DECISIONS.md`.