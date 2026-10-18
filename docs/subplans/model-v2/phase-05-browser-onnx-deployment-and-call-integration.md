# Phase 05: Browser ONNX Deployment, Server Fallback & LiveKit Video-Call Integration

**Status:** `[ ]` Pending  
**Target Stage:** Stage E (Real-Time Browser Inference `>= 24 FPS`, `<= 35 ms` Model Latency, LiveKit Data-Channel Caption & Correction Sync, Personal Sign `holistic-v2` Migration)  
**Estimated Effort:** 8–10 hours (2–3 coding agent sessions)  
**Compute Requirements:** CPU-only (runs in local Node/Vite + Python environment; zero GPU required).

---

## 1. Objective and Why It Matters

### 1.1 Current State & Root Causes (from Step 1 Audit)
1. **Disconnected Dual-Pipeline Architecture:**
   - The repo already has `onnxruntime-web@^1.21.0` in `web/package.json:19` and an ONNX wrapper in `web/src/lib/classifier.ts:1-125`, **but it is only wired to `#/bench` (`web/src/routes/Bench.tsx`), never to the live video call (`web/src/routes/Call.tsx` / `web/src/components/SignerWords.tsx`)**.
   - Instead, `SignerWords.tsx` runs `wordModel.ts` (1-hand RandomForest JSON) on the main UI thread.
2. **Broken External Data File Export (`ml/export_onnx.py:25-39`):**
   - `ml/export_onnx.py` exports PyTorch weights using external data (`model.onnx` + `model.onnx.data` in `web/public/models/`). In the browser, `ort.InferenceSession.create('/models/model.onnx')` inside `web/src/lib/classifier.ts:28` fetches `/models/model.onnx` over HTTP without registering `/models/model.onnx.data` in ONNX Runtime's virtual filesystem (`externalData`), causing session initialization failures whenever weights are split into an external `.data` file.
3. **Main-Thread UI Jitter During Live Calls:**
   - Both MediaPipe landmark extraction and model inference currently execute on the browser main thread alongside LiveKit WebRTC video decoding, canvas rendering, and ElevenLabs WebAudio synthesis.
4. **Hardcoded `1,260`-Float Vector in Personal Calibration & Supabase (`web/src/lib/personalModel.ts:17` & `supabase/migrations/202610180001_personal_signs.sql:10`):**
   - `personalModel.ts` (`EXPECTED_LEN = 30 * 42 = 1260`) and the Supabase Postgres constraint `check (octet_length(vec) = 5040)` reject 2-hand holistic feature vectors (`32 * 174 = 5568` floats or `192`-dim neural embeddings).

### 1.2 Why This Phase Matters
Phase 05 unifies the browser inference stack and wires the Phase 03/04 models directly into the live two-person video call (`#/call/:room`):
1. Exports **single-file, self-contained FP16/INT8 ONNX models (`< 5 MB`, no external `.data` file)** for Stage B (fingerspelling) and Stage C1 (250-sign isolated core).
2. Runs `onnxruntime-web` inside a dedicated **Web Worker (`web/src/lib/onnxWorker.ts`)** with WASM SIMD/WebGL acceleration so the main thread stays above `24–30 FPS`.
3. Replaces the 1-hand RandomForest in `SignerWords.tsx` with the unified 2-hand holistic ONNX pipeline (keeping the JSON RandomForest only as an emergency fallback if WASM fails to load).
4. Upgrades the **LiveKit `'caption'` and `'ctrl'` data-channel protocol** (`web/src/lib/call.ts`) to stream live gloss hypotheses, confidence badges, non-manual grammar markers (`[Q-YN]`, `[NEG]`), and instant `"That was wrong"` caption retractions to the hearing partner, while preserving strict privacy (**raw camera video never leaves the peer-to-peer WebRTC call for ML inference**).
5. Adds an optional lightweight `/api/infer` server-side landmark fallback (`server/app/infer.py`) that accepts **only compact `F=174` landmark vectors** (`~11 KB/clip`, never raw video) for ultra-low-end mobile browsers, budgeted safely within Fly.io's `512 MB` RAM limit (`fly.toml:26-29`).

---

## 2. Prerequisites and Dependencies

- **Phase 01 Complete:** Unified 2-hand + pose + face tracker (`web/src/lib/landmarks.ts`) and `canonicalize()` (`web/src/lib/features.ts`) working in browser.
- **Phase 03 & Phase 04 Complete:** Trained PyTorch checkpoints (`stage_b_conformer/best_ema.pt`, `stage_c1_conformer_250/best_ema.pt`) and client-side segmenter/NMM modules (`web/src/lib/segmenter.ts`, `web/src/lib/nmm.ts`).

---

## 3. Browser Runtime & Deployment Budgets (Topic 6)

| Component | Target Budget | Technical Mechanism |
|---|---|---|
| **Stage C1 Isolated Model (`sign_c1_250.onnx`)** | **`<= 3.8 MB`** single-file ONNX (`<= 2.0 MB` gzipped over HTTPS) | Dynamic INT8 quantization / FP16 weights embedded inline (`save_as_external_data=False`) |
| **Stage B Fingerspelling Model (`sign_b_fingerspell.onnx`)** | **`<= 1.8 MB`** single-file ONNX (`<= 1.0 MB` gzipped) | 2-block `ConformerMini` (`d_model=128`) with inline weights |
| **Browser Landmark Extraction (`HolisticTracker`)** | **`<= 18 ms / frame`** (`>= 24 FPS` steady state on 2022+ laptop) | `HandLandmarker` (`numHands: 2`, `GPU` delegate) every frame + `PoseLandmarker` / `FaceLandmarker` interleaved on odd/even frames (`15 Hz`) |
| **Browser ONNX Worker Inference Latency** | **`<= 15 ms` p50 / `<= 35 ms` p95** per window | Dedicated Web Worker running `onnxruntime-web` `wasm` backend with `simd: true, numThreads: 2` |
| **End-to-End Sign-to-Caption Latency** | **`<= 350 ms`** (local gloss chip) / **`<= 650 ms`** (English sentence + TTS start) | Local Web Worker inference + LiveKit reliable data channel (`topic: 'caption'`) + `/api/gloss` (`gemini-3.5-flash-lite` or `0 ms` local grammar fallback) |
| **Browser IndexedDB Model Cache** | Zero re-download on repeat visits | Cache ONNX ArrayBuffers in IndexedDB (`signline_model_cache_v2`) keyed by SHA-256 hash from `/models/manifest.json` |

---

## 4. Concrete Tasks (Ordered for Agent Sessions)

### Task 5.1: Single-File Quantized ONNX Exporter & Model Manifest (`ml/export_onnx_v2.py`)
Create `ml/export_onnx_v2.py` and replace the multi-file export behavior in `ml/export_onnx.py`:
1. **Inline Weights Only (No `.onnx.data` Sidecar):**
   - Calls `torch.onnx.export(..., opset_version=17, do_constant_folding=True, input_names=['features'], output_names=['logits', 'embedding'])` where `embedding` (`192`-dim L2-normalized pooled representation) is exposed as a second output for fast k-NN personal sign calibration!
   - Loads the exported model with `onnx.load()`, runs `onnx.shape_inference.infer_shapes()`, and saves with `onnx.save_model(model, out_path, save_as_external_data=False)`.
2. **FP16 / Dynamic INT8 Quantization:**
   - Uses `onnxruntime.quantization.quantize_dynamic(..., weight_type=QuantType.QUInt8)` (or FP16 conversion) and verifies with `onnxruntime.InferenceSession` that maximum probability divergence between PyTorch and quantized ONNX across 100 test clips is `< 1e-3`.
3. **Generate `web/public/models/manifest.json`:**
   - Writes model metadata (`version`, `schema: "holistic_v2_32x174"`, `c1_model_url`, `c1_sha256`, `c1_size_bytes`, `b_model_url`, `b_sha256`, `temperature`, `labels`, `idle_index: 0`).

### Task 5.2: Web Worker ONNX Inference Engine with IndexedDB Caching (`web/src/lib/onnxWorker.ts` & `web/src/lib/classifier.ts`)
Create `web/src/lib/onnxWorker.ts` and update `web/src/lib/classifier.ts`:
1. **Dedicated Web Worker (`onnxWorker.ts`):**
   - Runs `onnxruntime-web` off the main UI thread so WebRTC video rendering never drops frames.
   - Configures `ort.env.wasm.numThreads = Math.min(2, navigator.hardwareConcurrency || 2)` and `ort.env.wasm.simd = true`.
   - Fetches `/models/manifest.json`, checks IndexedDB (`signline_model_cache_v2`) for cached model bytes matching `sha256`, downloads only on cache miss, and initializes both Stage C1 (`sign_c1_250.onnx`) and Stage B (`sign_b_fingerspell.onnx`).
   - Returns `{ topK: { gloss: string, prob: number }[], handActivityProb: number, embedding: Float32Array, latencyMs: number }`.
2. **Interleaved Holistic Landmark Scheduler (`web/src/lib/landmarks.ts`):**
   - To guarantee `>= 24 FPS` even on integrated laptop GPUs:
     - Runs `HandLandmarker.detectForVideo()` (`numHands: 2`) on **every frame** (`30 Hz`).
     - Runs `PoseLandmarker.detectForVideo()` on **even frames** (`15 Hz`) and caches the upper-body anchor for 1 frame.
     - Runs `FaceLandmarker.detectForVideo()` on **odd frames** (`15 Hz`) and caches the 8 facial NMM points for 1 frame.
   - This cuts per-frame MediaPipe GPU/CPU work by `~45%` with zero loss in hand trajectory resolution.

### Task 5.3: Migrate Personal Sign Calibration & Supabase to `holistic-v2` Embeddings (`web/src/lib/personalModel.ts` & `supabase/migrations/`)
Update `web/src/lib/personalModel.ts` and add a non-destructive database migration `supabase/migrations/202610190001_personal_signs_v2.sql`:
1. **Few-Shot Prototype Calibration in Embedding Space (Plus Raw Feature Support):**
   - Instead of comparing raw `1,260`-float 1-hand vectors via Euclidean distance (`personalModel.ts:17`), `personalModel.ts` now stores either:
     - **Mode 1 (Preferred):** The `192`-float L2-normalized neural embedding vector (`768 bytes` as `Float32Array`) output by `sign_c1_250.onnx` (`embedding` output head), using cosine similarity (`threshold = 0.78`) over 3–5 user calibration demos! Because the backbone is already trained on 250+ signs across 21+ signers, 3 demos in `192`-dim embedding space generalize across camera angles and two-hand signs far better than raw coordinate k-NN.
     - **Mode 2 (Fallback when ONNX is still loading):** Canonicalized `32 × 174 = 5,568`-float holistic vector (`22,272 bytes`).
2. **Supabase Migration (`supabase/migrations/202610190001_personal_signs_v2.sql`):**
   - Drops the rigid `check (octet_length(vec) = 5040)` constraint on `public.personal_signs` and replaces it with:
     ```sql
     alter table public.personal_signs
       drop constraint if exists personal_signs_vec_check,
       add column if not exists schema_version text not null default 'holistic_v2_emb192',
       add constraint personal_signs_vec_v2_check
         check (octet_length(vec) in (768, 5040, 22272));
     ```
   - This keeps existing `5,040`-byte v1 rows readable while supporting `768`-byte (`192 × 4`) neural embeddings and `22,272`-byte (`32 × 174 × 4`) full holistic windows.

### Task 5.4: LiveKit Video-Call Integration, Caption UI & Privacy Controls (`web/src/components/SignerWords.tsx` & `web/src/routes/Call.tsx`)
Upgrade `web/src/components/SignerWords.tsx`, `web/src/lib/call.ts`, and `web/src/routes/Call.tsx`:
1. **Replace 1-Hand RandomForest Loop with Holistic V2 + ONNX Worker (`SignerWords.tsx`):**
   - Uses `HolisticTracker` (from Phase 01) + `Segmenter` & `NMMExtractor` (from Phase 04) + `onnxWorker` (from Task 5.2).
   - Retains `wordModel.ts` (RandomForest JSON) strictly as an automatic fallback if ONNX initialization fails.
2. **Enhanced Caption UI, Confidence Display & Sentence Assembly (`SignerWords.tsx` & `Call.tsx`):**
   - **Live Gloss Token Strip:** Displays assembled gloss tokens for the current utterance with color-coded confidence pills:
     - High confidence (`>= 0.80`): solid emerald pill (`HELLO 94%`).
     - Medium confidence (`0.60 – 0.79`): amber pill with tap-to-swap dropdown showing Top-2/Top-3 alternatives (`WATER 64% ▾ [DRINK 31%]`).
     - Non-Manual Marker Badge: displays `[? Yes/No]`, `[? Wh-]`, or `[¬ Neg]` chip when detected from facial landmarks.
   - **Mode Switcher (`[Auto | Isolated | Fingerspell A-Z]`):** Allows the signer to let the automatic router decide or explicitly lock into Fingerspelling mode when spelling a name/address.
   - **Instant Retraction (`"That was wrong"` / `Backspace`):** Clicking `"That was wrong"` (`Call.tsx:168-174`) sends `{ type: 'clear', captionId }` over the LiveKit `'ctrl'` data channel (`call.ts:88-96`), immediately striking through or clearing the last caption on the hearing participant's screen and cancelling any pending TTS playback.
3. **Privacy & Consent Architecture (Topic 7):**
   - **100% Local Camera Inference by Default:** Raw video frames from the signer's camera are processed strictly inside the signer's own browser via MediaPipe WebAssembly/WebGL and the local ONNX Web Worker. Raw video is transmitted only peer-to-peer over encrypted WebRTC (`LiveKit`) to the call partner and is **never uploaded to any backend server for ML inference**.
   - **Explicit Opt-In Consent Banner for Personal Sign Cloud Sync & Telemetry:** Adding a personal sign (`personalModel.ts`) or enabling the optional `/api/infer` landmark fallback displays a clear consent toggle explaining that only anonymized 3D skeletal keypoints (`174` floats/frame, no video pixels or audio) are sent.

### Task 5.5: Optional Lightweight Server-Side Landmark Fallback (`/api/infer` in `server/app/infer.py`)
Create `server/app/infer.py` and register `POST /api/infer` in `server/app/main.py`:
1. **Why Landmark-Only (Never Raw Video) & Why `onnxruntime` CPU (Never PyTorch) on Server:**
   - `fly.toml:26-29` provisions a `shared-cpu-1x` VM with **512 MB RAM**. Loading PyTorch or decoding raw video on the server would immediately crash the container with `OOMKilled`.
   - Instead, `server/app/infer.py` uses `onnxruntime` CPU (`~35 MB` RSS footprint) to load `sign_c1_250.onnx` (`~3.6 MB`) lazily on first request.
   - If a low-end mobile browser experiences WASM latency `> 120 ms`, the client can opt in to POST compact quantized `Float16` landmark windows (`32 × 174 × 2 = 11.1 KB`) to `POST /api/infer` and receive Top-3 predictions in `< 15 ms` server compute time while keeping Fly.io memory usage under `160 MB`.

---

## 5. Exact Files and Directories to Create or Modify

| File Path | Action | Description |
|---|---|---|
| `ml/export_onnx_v2.py` | **Create** | Exports single-file quantized ONNX models (`save_as_external_data=False`) with dual `(logits, embedding)` outputs and writes `web/public/models/manifest.json`. |
| `web/src/lib/onnxWorker.ts` | **Create** | Dedicated Web Worker running `onnxruntime-web` (WASM SIMD) with IndexedDB caching. |
| `web/src/lib/classifier.ts` | **Modify** | Connect `Classifier` client API to `onnxWorker.ts` and expose `predictWindow()` + `extractEmbedding()`. |
| `web/src/lib/landmarks.ts` | **Modify** | Add interleaved frame scheduling (`30 Hz` 2-hand + `15 Hz` alternating pose/face) and FPS telemetry. |
| `web/src/lib/personalModel.ts` | **Modify** | Upgrade personal sign calibration to `192`-dim L2-normalized ONNX embeddings (with v1 migration adapter). |
| `supabase/migrations/202610190001_personal_signs_v2.sql` | **Create** | Relax `octet_length(vec)` constraint to accept `768` (`192×4`), `5040` (`legacy`), and `22272` (`32×174×4`) bytes. |
| `web/src/components/SignerWords.tsx` | **Modify** | Replace 1-hand `wordModel` primary path with `HolisticTracker` + `Segmenter` + `NMMExtractor` + `onnxWorker`; add confidence pills, Top-3 tap-to-swap, and Fingerspell toggle. |
| `web/src/routes/Call.tsx` | **Modify** | Wire structured caption events (`confidence`, `nmmTags`, `captionId`) and `"That was wrong"` retraction sync over LiveKit `'caption'` & `'ctrl'` topics. |
| `server/app/infer.py` | **Create** | Optional lightweight `onnxruntime` CPU `/api/infer` endpoint accepting compact `(32, 174)` landmark arrays within Fly.io's 512 MB RAM budget. |
| `server/app/main.py` | **Modify** | Mount `/api/infer` router and update `server/requirements.txt` with `onnxruntime==1.19.2` and `numpy==1.26.4`. |

---

## 6. Commands, Tools & Pinned Libraries

```bash
# 1. Export single-file quantized ONNX models and verify zero external .data files
python -m ml.export_onnx_v2 \
  --c1-checkpoint ml/checkpoints/stage_c1_conformer_250/best_ema.pt \
  --b-checkpoint ml/checkpoints/stage_b_conformer/best_ema.pt \
  --out-dir web/public/models \
  --quantize uint8

# Verify single-file size budget (< 5 MB) and absence of .onnx.data sidecars
ls -lh web/public/models/

# 2. Test backend /api/infer and /api/gloss endpoints
pytest server/tests/ -v

# 3. Build and typecheck the web app
cd web && npm run build
```

---

## 7. Acceptance Criteria

- [ ] **AC-5.1 (Single-File ONNX Export `< 5 MB`):** `web/public/models/sign_c1_250.onnx` is a single self-contained file (`<= 4.0 MB`, no `.onnx.data` file) and `web/public/models/sign_b_fingerspell.onnx` is `<= 2.0 MB`.
- [ ] **AC-5.2 (Real-Time Frame Rate & Worker Latency):** In `#/call/demo?role=signer` and `#/bench`, total MediaPipe + ONNX Worker loop sustains `>= 24 FPS` (`<= 41 ms` frame budget) with ONNX worker inference taking `<= 15 ms` p50 / `<= 35 ms` p95.
- [ ] **AC-5.3 (End-to-End Two-Hand Call Captioning):** Signing a two-handed word (e.g., `BOOK`, `HELP`, `FAMILY`, `FINISHED`) or fingerspelling a name (`@ALEX`) in `#/call/test-room?role=signer` displays both hand skeletons (`Left=Cyan`, `Right=Amber`), shows the confidence pill and NMM badge locally, and delivers the translated English caption + TTS audio to `#/call/test-room?role=hearing` within `<= 650 ms`.
- [ ] **AC-5.4 (Retraction & Privacy Verification):** Clicking `"That was wrong"` immediately clears/retracts the last caption on the hearing participant's screen over the `'ctrl'` data channel, and Chrome DevTools Network inspection confirms zero raw video/image frames are ever sent to the FastAPI backend.
- [ ] **AC-5.5 (Fly.io Memory Safety):** Running `uvicorn app.main:app` with `/api/infer` active consumes `<= 180 MB` RSS memory (well below `fly.toml`'s `512 MB` limit).

---

## 8. Risks, Fallbacks & "If This Fails, Do X"

1. **Risk: Vite dev server or production static host serves `.wasm` files with wrong MIME type or blocks SharedArrayBuffer (`numThreads > 1`) when COOP/COEP headers are absent.**
   - *If this fails:* In `web/src/lib/onnxWorker.ts`, check `self.crossOriginIsolated` at startup: only set `ort.env.wasm.numThreads = 2` when `self.crossOriginIsolated === true`, and automatically set `ort.env.wasm.numThreads = 1` (with `simd: true`) otherwise so `onnxruntime-web` never throws a `SharedArrayBuffer` initialization error.
2. **Risk: Dynamic INT8 quantization degrades accuracy on small depthwise convolution layers by `> 1.5%`.**
   - *If this fails:* Use `--quantize fp16` in `ml/export_onnx_v2.py` (which keeps exact dynamic range at `~3.6 MB` file size, still inside our `< 5 MB` budget).

---

## 9. Handoff Note for Executing Agent

> **Handoff Context (Phase 05):**  
> Start by checking `ml/export_onnx.py` and `web/src/lib/classifier.ts`: notice why the old exporter created `.onnx.data` sidecar files that broke browser loading. Build `ml/export_onnx_v2.py` with `save_as_external_data=False` first and verify with `ls -lh web/public/models/`. Then create `web/src/lib/onnxWorker.ts` and wire `web/src/components/SignerWords.tsx` so the live call (`#/call/:room`) uses the new holistic ONNX pipeline while keeping `wordModel.ts` as an automatic fallback. Don't forget to check `self.crossOriginIsolated` before setting `ort.env.wasm.numThreads > 1` so LiveKit and MediaPipe CDN assets aren't blocked by strict COEP headers. Update `docs/subplans/model-v2/DECISIONS.md` and `docs/subplans/model-v2/README.md` when complete.
