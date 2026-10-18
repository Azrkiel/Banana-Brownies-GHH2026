# Phase 04: Continuous Signing Segmentation, Non-Manual Markers & Gloss-to-English Translation

**Status:** `[ ]` Pending  
**Target Stage:** Stage D (Continuous Signing Stream Segmentation, Non-Manual Facial Grammar Markers & Lattice-Aware Gloss-to-English Captioning)  
**Estimated Effort:** 6–9 hours (2–3 coding agent sessions + optional 3-hour GPU run for continuous CTC fine-tuning)  
**Compute Requirements:**
- **Browser / Server Sliding-Window Segmenter + NMM Extractor + LLM Lattice Rescorer:** CPU-only (0 GPU hours).
- **Continuous CTC Sequence Head (`SignContinuousCTC` on stitched isolated clips + [How2Sign Holistic](https://www.google.com/search?q=https%3A%2F%2Fhuggingface.co%2Fdatasets%2FPSewmuthu%2FHow2Sign_Holistic)):** 1× NVIDIA T4 / L4 GPU for ~2–3 hours.

---

## 1. Objective and Why It Matters

### 1.1 Current State & Problem
1. **Brittle Fixed-Stride Sliding Window (`web/src/components/SignerWords.tsx:167-189` & `web/src/lib/decoder.ts:14-60`):**
   - Currently, `SignerWords.tsx` runs inference every `stride = 3` frames (`~100 ms`) on a fixed `30`-frame buffer (`~1.0 s`), requiring `2` consecutive identical predictions (`stabilityWindow = 2`) above `confidenceThreshold = 0.60`, followed by a `cooldownMs = 900` lockout.
   - During continuous multi-sign sentences, **co-articulation (movement epenthesis)**—the transitional motion as the hands move from the end location of Sign $i$ to the start location of Sign $i+1$—causes the fixed window to either fire false positives mid-transition or swallow rapid 2-sign phrases during the `900 ms` cooldown.
2. **Unused Face Landmarks (`web/src/lib/features.ts:75-86`):**
   - Although `landmarks.ts` extracts 8 face points (nose, eyes, mouth corners, chin, eyebrows), nothing in the inference pipeline extracts **ASL Non-Manual Markers (NMMs)**: eyebrow raise (`[Q-YN]` yes/no questions), eyebrow furrow (`[Q-WH]` wh-questions), or headshake (`[NEG]` negation). Without NMMs, `YOU GO STORE` as a statement is indistinguishable from `"Are you going to the store?"` or `"You aren't going to the store."`
3. **Top-1 Gloss Prompt Without Uncertainty or Offline Fallback (`server/app/gloss.py:13-53`):**
   - `server/app/gloss.py` sends only a flat space-separated string of top-1 glosses (`" ".join(g.strip().upper() for g in glosses)`) to `gemini-3.5-flash-lite` (`temperature=0.2, max_output_tokens=80`).
   - If the classifier confuses two visually similar signs (e.g., top-1 `WATER` `0.48` vs. top-2 `DRINK` `0.44` after `THIRSTY`), `/api/gloss` never sees the top-2 candidate (`DRINK`) or any facial grammar markers (`[Q-YN]`, `[NEG]`). Furthermore, if `GEMINI_API_KEY` is missing or times out, `gloss_to_english()` (`server/app/gloss.py:42`) simply returns the raw uppercase gloss string (`"ME WATER"`).

### 1.2 Why This Phase Matters
Real ASL conversation is continuous, combines lexical signs with fingerspelled names/nouns, and encodes question/negation grammar on the face and head. Phase 04 bridges the gap between isolated word classification (Stage C) and natural live captions (Stage D) through a pragmatic two-tier architecture:
- **Tier D1 (Deployable Immediately on Commercial Data):** A kinematic **Motion-Onset / Hold Boundary Segmenter** + **Dual-Stream Isolated/Fingerspelling Router** + **Facial Non-Manual Marker (`NMM`) Extractor** + **Top-3 Lattice Gloss-to-English Translator** (with an instant deterministic rule-based fallback for offline/zero-key environments).
- **Tier D2 (Stretch / Research Track):** A **Continuous Sliding-Window CTC Sequence Model (`SignContinuousCTC`)** trained on synthetic co-articulated sign chains (3–6 signs stitched with cubic spline transitions) and fine-tuned on [How2Sign Holistic](https://www.google.com/search?q=https%3A%2F%2Fhuggingface.co%2Fdatasets%2FPSewmuthu%2FHow2Sign_Holistic) (`CC BY-NC 4.0`).

---

## 2. Prerequisites and Dependencies

- **Phase 01 Complete:** Holistic 2-hand + pose + 8-point face extraction (`web/src/lib/landmarks.ts` and `web/src/lib/features.ts`) active.
- **Phase 03 Complete:** Calibrated Stage B (`FingerspellingCTCMini`) and Stage C (`SignConformerV2`) checkpoints and top-50 confusion matrix (`confusion_report.json`) available.

---

## 3. Continuous Signing Architecture Comparison (Topic 4)

| Approach | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Option A: Kinematic Boundary Segmenter + Top-K Lattice Rescoring (Tier D1)** | Detects sign boundaries from hand velocity minima/holds + wrist height; runs Stage C isolated classifier & Stage B fingerspelling CTC on active segments; passes Top-3 `(gloss, prob)` lattice + NMM tags to LLM/grammar rescorer | Works **100% on commercial-safe data** (GISLR + ASLFR); zero sequence-level training needed; `<5 ms` overhead in browser | Can miss boundaries in rapid native signing without pauses | **Primary Production Pipeline (Stage D1)** |
| **Option B: Sliding-Window CTC over Continuous Sign Streams (Tier D2)** | `SignConformerV2` encoder over `T=128` frames (`~4.2s`) with a vocabulary-level CTC head (`blank=0` + gloss classes), trained on synthetic stitched sign chains + How2Sign | Explicitly models co-articulation transitions between signs without heuristic velocity thresholds | Requires synthetic transition blending or NC-licensed How2Sign data; higher browser memory (`T=128`) | **Secondary / Stretch Pipeline (Stage D2)** |
| **Option C: End-to-End Video/Landmark-to-English Seq2Seq Transformer** | Encoder-decoder directly predicting English tokens from landmark streams (e.g., Tarrés et al. 2023 on How2Sign) | Single network from landmarks to English | Hallucinates English sentences when signer vocabulary drifts; requires `>500h` parallel corpus (`BLEU ~8–15` on How2Sign) | **Rejected for direct browser inference** (keep translation decoupled via gloss lattice) |

---

## 4. Concrete Tasks (Ordered for Agent Sessions)

Execution checklist (code verification is separate from real-data acceptance below):

- [x] Task 4.1: Kinematic segmenter, spelling router and top-three decoder.
- [x] Task 4.2: NMM extraction with a Python counterpart.
- [x] Task 4.3: Lattice/NMM API and shared offline grammar.
- [ ] Task 4.4: Continuous CTC stitching, training and evaluation.

### Task 4.1: Kinematic Sign Boundary Segmenter & Fingerspelling Router (`web/src/lib/segmenter.ts`)
Create `web/src/lib/segmenter.ts` and upgrade `web/src/lib/decoder.ts`:
1. **Kinematic State Machine (`REST -> ONSET -> STROKE_HOLD -> TRANSITION`):**
   - Computes per-frame wrist & fingertip kinetic energy $E_t = \|\Delta H_t^L\|_2^2 + \|\Delta H_t^R\|_2^2$ and normalized wrist elevation relative to the hip/shoulder line from the `F=174` frame vector.
   - **`REST`:** Hands below lower chest threshold (`y_wrist > y_shoulder + 0.65 * shoulder_width`) or $E_t < \epsilon_{\text{idle}}$ for `>= 12` frames (`400 ms`). Suppresses classifier firing completely.
   - **`ONSET` / `STROKE_HOLD`:** Hand enters signing space and reaches local velocity dip (sign hold/apex) or completes a `24–36` frame active window. Triggers Stage C isolated classifier.
   - **`TRANSITION` Gate:** Detects rapid ballistic movement between two sign holds ($E_t > \epsilon_{\text{transition}}$ with monotonic wrist trajectory) and masks out predictions during the transition frames instead of relying solely on a blind `900 ms` timer cooldown.
2. **Automatic Isolated-vs.-Fingerspelling Mode Router:**
   - Computes a fingerspelling likelihood heuristic (`isFingerspellingCandidate`): single dominant hand localized near shoulder/chin region (`\|\Delta \text{wrist}\|_2 < 0.08` over `20` frames) with high distal finger-joint articulation ($\text{Var}(\text{fingertips}) / \text{Var}(\text{wrist}) > 4.5$).
   - When triggered (or when the user toggles `[Fingerspell Mode]` in UI), routes the rolling `64–128` frame buffer to the Stage B `FingerspellingCTCMini` model and emits spelled tokens (`@NAME` or word) into the sentence buffer.

### Task 4.2: Non-Manual Facial Grammar Marker (`NMM`) Extractor (`web/src/lib/nmm.ts` & `ml/nmm.py`)
Create `web/src/lib/nmm.ts` (and matching Python `ml/nmm.py`) operating on the 8 face landmarks in `[150:174]` (`nose=0, L_eye=1, R_eye=2, L_mouth=3, R_mouth=4, chin=5, L_brow=6, R_brow=7`):
1. **Eyebrow Raise Ratio (`browRaiseRatio`):**
   - Distance from eyebrows (`6, 7`) to eye centers (`1, 2`) normalized by inter-ocular distance $\|P_{\text{R\_eye}} - P_{\text{L\_eye}}\|_2$ (scale and pitch invariant).
   - If `browRaiseRatio > baseline + 2.0 * std` across the final `10` frames of an utterance -> attaches tag `[Q-YN]` (Yes/No Question).
2. **Eyebrow Furrow Ratio (`browFurrowRatio`):**
   - Inner brow-to-nose-bridge distance + inter-brow contraction relative to inter-ocular distance.
   - If `browFurrowRatio < baseline - 1.8 * std` -> attaches tag `[Q-WH]` (Wh-Question).
3. **Horizontal Headshake Detector (`headshakeScore`):**
   - Tracks horizontal nose displacement $x_{\text{nose}}(t) - \frac{1}{2}(x_{\text{L\_eye}}(t) + x_{\text{R\_eye}}(t))$ (yaw proxy) over a `24`-frame window; if `>= 2` zero-crossings with amplitude `> 0.06` occur during a sign -> attaches tag `[NEG]` (Negation).
4. **Per-Signer Auto-Calibration:**
   - Maintains a 5-second rolling exponential moving average of neutral brow/eye distance during `REST` states so each user's facial morphology is self-calibrated without manual setup.

### Task 4.3: Upgrade `/api/gloss` to Lattice- & NMM-Aware Translation with Offline Fallback (`server/app/gloss.py` & `server/app/main.py`)
Update `server/app/main.py` and `server/app/gloss.py` while keeping 100% backward compatibility with the existing `{ "glosses": ["ME", "WATER"] }` request payload:
1. **Extended Request Schema (`GlossRequest` in `server/app/main.py`):**
   ```python
   class GlossCandidate(BaseModel):
       gloss: str
       score: float

   class GlossTokenSlot(BaseModel):
       candidates: list[GlossCandidate]  # Top-3 candidates per time slot
       nmm_tags: list[str] = []          # e.g. ["Q-YN"], ["NEG"], ["FS"]

   class GlossRequest(BaseModel):
       glosses: list[str] = Field(default_factory=list, max_length=30)
       lattice: list[GlossTokenSlot] | None = None
       nmm_tags: list[str] = Field(default_factory=list)
       context_prev_english: str | None = None
   ```
2. **Deterministic Offline Grammar Fallback (`fallback_gloss_to_english()` in `server/app/gloss.py`):**
   - When `GEMINI_API_KEY` is unset, quota-limited, or times out (`> 1.5 s`), instead of returning raw `"ME WATER"`, executes a fast rule-based ASL-to-English grammar transformer (`server/app/asl_grammar_fallback.py` + `web/src/lib/grammarFallback.ts` for offline browser mode):
     - Maps pronoun glosses (`ME/I -> I`, `YOU -> you`, `MY -> my`, `YOUR -> your`), inserts copulas/articles (`ME STUDENT -> "I am a student."`, `MY NAME @LISA -> "My name is Lisa."`), handles time-topic-comment ordering (`YESTERDAY ME GO STORE -> "Yesterday I went to the store."`), applies `[NEG]` (`ME KNOW [NEG] -> "I don't know."`), and applies `[Q-YN]` / `[Q-WH]` (`YOU WANT WATER [Q-YN] -> "Do you want water?"`, `YOUR NAME WHAT [Q-WH] -> "What is your name?"`).
3. **LLM Lattice Prompt (`server/app/gloss.py`):**
   - When `GEMINI_API_KEY` is configured, formats the Top-3 candidate lattice per slot (e.g. `Slot 1: [ME (0.91)] -> Slot 2: [THIRSTY (0.84)] -> Slot 3: [WATER (0.49) | DRINK (0.43) | DEER (0.04)] | Markers: [Q-YN]`) so `gemini-3.5-flash-lite` picks the semantically coherent candidate in context and outputs natural punctuated English in `< 250 ms`.

### Task 4.4: Continuous Signing CTC Sequence Generator & Trainer (`ml/continuous_ctc.py`)
Create `ml/continuous_ctc.py` for Stage D2:
1. **Synthetic Co-Articulated Stream Generator (`StitchedSignStreamDataset`):**
   - Samples `2 to 5` isolated clips from the same signer (or canonicalized signer-agnostic skeletons) in GISLR / ASL Citizen.
   - Synthesizes realistic **co-articulation transitions** (`4 to 8` frames) between the final frame of Sign $i$ and the initial frame of Sign $i+1$ using cubic Hermite spline interpolation ($\mathbf{p}(u)$ matching position and velocity at boundaries) plus Gaussian trajectory noise.
   - Concatenates into `T = 128` frame sequences with sequence targets $[y_1, y_2, \dots, y_k]$ for `CTCLoss(blank=0)`.
2. **Optional Real Continuous Fine-Tuning on [How2Sign Holistic](https://www.google.com/search?q=https%3A%2F%2Fhuggingface.co%2Fdatasets%2FPSewmuthu%2FHow2Sign_Holistic):**
   - Provides `--dataset how2sign_holistic` flag (marked `non_commercial` in checkpoint metadata) to train/evaluate continuous sequence decoding on real multi-sign sentences (`WER` evaluation via `ml/evaluate_v2.py --mode continuous`).

---

## 5. Exact Files and Directories to Create or Modify

| File Path | Action | Description |
|---|---|---|
| `web/src/lib/segmenter.ts` | **Create** | Kinematic sign-boundary state machine (`REST / ONSET / STROKE_HOLD / TRANSITION`) and fingerspelling router. |
| `web/src/lib/nmm.ts` | **Create** | Non-manual facial grammar marker detector (`[Q-YN]`, `[Q-WH]`, `[NEG]`) with rolling neutral auto-calibration. |
| `web/src/lib/grammarFallback.ts` | **Create** | Deterministic client-side ASL gloss + NMM to English rule-based formatter (0 ms offline fallback). |
| `web/src/lib/decoder.ts` | **Modify** | Integrate `Segmenter` state and output Top-3 candidate lattices (`GlossTokenSlot[]`) instead of only Top-1 strings. |
| `server/app/asl_grammar_fallback.py` | **Create** | Deterministic Python ASL-to-English rule engine used when `GEMINI_API_KEY` is missing or errors out. |
| `server/app/gloss.py` | **Modify** | Support `lattice` + `nmm_tags` prompt formatting for `gemini-3.5-flash-lite` and invoke `asl_grammar_fallback` on offline/error paths. |
| `server/app/main.py` | **Modify** | Extend `GlossRequest` / `GlossResponse` schemas (backward-compatible with existing `{ "glosses": [...] }` callers). |
| `ml/nmm.py` | **Create** | Python counterpart of `web/src/lib/nmm.ts` for offline dataset annotation and unit testing. |
| `ml/continuous_ctc.py` | **Create** | Stage D2 synthetic cubic-spline sign stitching dataset and continuous CTC sequence trainer. |
| `server/tests/test_gloss_lattice.py` | **Create** | FastAPI unit tests verifying backward compatibility, NMM question/negation formatting, and offline grammar fallback. |

---

## 6. Commands, Tools & Pinned Libraries

```bash
# 1. Run backend unit tests for lattice gloss translation & deterministic offline fallback
pytest server/tests/test_gloss_lattice.py -v

# 2. Run frontend unit tests for kinematic segmenter, NMM detector, and client grammar fallback
cd web && npx vitest run src/lib/__tests__/segmenter.test.ts src/lib/__tests__/nmm.test.ts

# 3. Train Stage D2 Continuous CTC sequence model on synthetic stitched GISLR chains (commercial-safe)
python -m ml.continuous_ctc \
  --manifest data/processed/holistic_v2/manifest.parquet \
  --stage c1_commercial_250 \
  --seq-len 128 \
  --min-signs 2 \
  --max-signs 5 \
  --epochs 30 \
  --out-dir ml/checkpoints/stage_d2_continuous_ctc
```

---

## 7. Acceptance Criteria

- [x] **AC-4.1 (Kinematic Transition Suppression):** On a synthetic or recorded 4-sign sequence with transitional hand movements, `web/src/lib/segmenter.ts` reduces false-positive mid-transition triggers by `>= 50%` compared to the legacy fixed-stride decoder while supporting back-to-back signs separated by `350 ms` (down from `900 ms`).
- [x] **AC-4.2 (Non-Manual Marker Detection):** Unit tests in `src/lib/__tests__/nmm.test.ts` verify that synthetic/recorded brow raise triggers `[Q-YN]`, brow furrow triggers `[Q-WH]`, and horizontal headshake triggers `[NEG]`, while overall head pitch/distance scaling (`0.7x` to `1.4x`) does not cause false triggers.
- [ ] **AC-4.3 (Offline & LLM Gloss-to-English Quality):**
  - Without `GEMINI_API_KEY`, `POST /api/gloss` converts `{"glosses": ["ME", "WANT", "WATER"], "nmm_tags": ["Q-YN"]}` -> `"Do I want water?"` and `{"glosses": ["YOU", "NEED", "HELP"], "nmm_tags": ["Q-YN"]}` -> `"Do you need help?"` in `< 5 ms`.
  - With `GEMINI_API_KEY`, passing a 3-slot lattice where Slot 2 has `[{"gloss": "DEER", "score": 0.46}, {"gloss": "THIRSTY", "score": 0.44}]` followed by `WATER (0.91)` resolves to `"I am thirsty and want some water."`
  - [x] Offline examples and latency; shared browser/Python fixtures; mocked lattice selection, quota, cancellation and invalid-output paths.
  - [ ] Live Gemini semantic quality and <250ms model-service latency remain unmeasured; AC-4.3 stays open for that external check.
- [ ] **AC-4.4 (Continuous Signing Benchmark — Stage D):** Achieves `<= 28%` Gloss Word Error Rate (`WER`) on stitched 3-to-5 sign commercial validation streams (`<= 35%` WER on [How2Sign Holistic](https://www.google.com/search?q=https%3A%2F%2Fhuggingface.co%2Fdatasets%2FPSewmuthu%2FHow2Sign_Holistic) validation sentences).

---

## 8. Risks, Fallbacks & "If This Fails, Do X"

1. **Risk: Co-articulated natural signing causes high boundary segmentation error in Stage D2.**
   - *If this fails:* Do not block the live video call on end-to-end continuous CTC (Stage D2). Default the live call UI (`SignerWords.tsx`) to **Stage D1 (Kinematic Segmenter + Rhythmic Isolated/Fingerspelling Mode)** with a subtle visual cadence ring on the signer's HUD that pulses green (`Ready for next sign`) as soon as the hand velocity dip settles (`~300 ms`), guiding the signer into a natural, high-accuracy cadence while still supporting multi-sign sentence assembly.
2. **Risk: Eyebrow landmarks are occluded by bangs, thick glasses frames, or baseball caps.**
   - *If this fails:* Gate NMM emission on face landmark visibility/stability (`std(inter_ocular_dist) < 0.015`). When brow visibility is low, fall back to lexical question signs (`WHAT, WHERE, WHO, WHEN, WHY, HOW`) and punctuation inference in `/api/gloss`.

---

## 9. Handoff Note for Executing Agent

> **Handoff Context (Phase 04):**  
> Inspect `server/app/gloss.py` and `server/app/main.py` first: notice how `/api/gloss` currently takes `{"glosses": list[str]}` and returns `{"english": str}` using `gemini-3.5-flash-lite`. Keep that exact JSON contract working so existing callers (`web/src/lib/wordModel.ts:116-130` and `web/src/routes/Bench.tsx`) never break, while adding optional `lattice` and `nmm_tags` fields. Implement `server/app/asl_grammar_fallback.py` and `web/src/lib/grammarFallback.ts` so the app produces clean English sentences even when `GEMINI_API_KEY` is absent. Once tests pass, record the segmenter thresholds and WER metrics in `docs/subplans/model-v2/DECISIONS.md` and check off Phase 04 in `docs/subplans/model-v2/README.md`.
