# Phase 2: Dataset Acquisition, Verification, Manifest & Offline Preprocessing Pipeline (`phase-02-dataset-acquisition-preprocessing.md`)

## 1. Objective and Why It Matters

**Objective:** Build a reproducible, license-aware dataset acquisition and offline landmark preprocessing pipeline (`ml/datasets/` and `ml/gislr_to_features.py`) that ingests pre-extracted landmarks (Kaggle GISLR, Kaggle ASLFR, How2Sign Holistic) and raw videos (ASL Citizen, ChicagoFSWild), reconciles coordinate format differences into our unified `T = 32, F = 174` (for isolated signs) and variable-length `T_var × F` (for fingerspelling/continuous signing) binary shards, enforces SHA256/schema verification and dead-link resilience, and writes a master clip manifest (`data/manifests/clip_manifest.parquet`) tracking the source, signer ID, split, and exact license tier (`commercial` vs. `research`) of every clip.

**Why It Matters:**  
Training deep sequence models directly on raw video or tens of thousands of individual Parquet files is IO-bound and slow. By extracting and normalizing landmarks **once** offline into contiguous memory-mapped `float32` binary arrays (`X.f32` + `meta.json`), training 60 epochs of a 250-to-2,731-class model takes minutes instead of days on a single consumer GPU. Furthermore, because executing agents may run in environments without internet access or Kaggle credentials, this phase separates **automated pipeline code + synthetic verification** (which the agent completes and tests immediately) from **large human/GPU dataset downloads** (documented with exact copy-pasteable commands).

---

## 2. Prerequisites and Dependencies

- **Earlier Phases Required:** [phase-01-two-hand-holistic-tracking.md](https://www.google.com/search?q=phase-01-two-hand-holistic-tracking.md) (`ml/features.py`, `web/src/lib/features.ts`, and `ml/tests/test_parity.py` must be green).
- **Dataset Manifest Input:** [docs/subplans/model-v2/datasets.json](https://www.google.com/search?q=datasets.json) and [`docs/subplans/model-v2/DATASETS.md`](DATASETS.md).

---

## 3. Reconciling Landmark Format Differences Across Datasets

Different datasets store landmarks in different coordinate systems, aspect ratios, and keypoint subsets. All converters in this phase must normalize into the **SignLine Canonical Frame Dict** consumed by `ml/features.py`:

```python
FrameDict = {
    "w": float,                        # Aspect width (or w/h ratio when h=1.0)
    "h": float,                        # Aspect height
    "pose": list[list[float]] | None,  # 17 upper-body landmarks (MediaPipe Pose indices 0..16), each [x, y, z] in 0..1
    "hands": list[list[list[float]]],  # 0..2 detected hands, each 21 landmarks [x, y, z] in 0..1 (unlabeled left/right)
    "brow": {"raise": float, "furrow": float} | None, # Optional grammatical facial markers
}
```

| Source Dataset | Native Format & Keypoints | Differences vs. Browser `landmarks.ts` | Exact Reconciliation Rule in `ml/datasets/` |
| :--- | :--- | :--- | :--- |
| **Kaggle GISLR (`asl-signs`)** | Apache Parquet: `543` rows/frame (`face`: 468, `pose`: 33, `left_hand`: 21, `right_hand`: 21). Missing points are `NaN`. | 1. Video dimensions `(w, h)` omitted (recorded on Pixel 4a portrait `1944×2592`, `w/h = 0.75`).<br>2. Unmirrored camera feed.<br>3. `left_hand` and `right_hand` are fixed slots with `NaN` when absent. | 1. Set `w = aspect` (default `0.75`, configurable via `--aspect`), `h = 1.0`.<br>2. Slice `pose[0:17]`; if any `NaN` in `pose[0:13]`, set `pose = None`.<br>3. Collect non-`NaN` hands from `(left_hand, right_hand)` into `hands` list.<br>4. Pass to `clip_features()`, whose `canonicalize()` automatically normalizes handedness/mirroring. |
| **Kaggle ASLFR (`asl-fingerspelling`)** | Apache Parquet (`543` rows/frame) or `darraghdog` `.npy` shards (hands + lips + pose). | 1. Variable-length sequences (10 to 300+ frames) spelling multi-character phrases.<br>2. One-handed signing (either left or right hand active). | 1. Extract active hand per frame using `letter_hand()` (higher hand if two visible; mirror `x -> 1 - x` if wrist `x > body_center_x(f)`).<br>2. Compute `48`-dim rotation/scale-invariant `letter_features()` (`21×2` rotated shape + `sin/cos(theta)` + palm normal sign + 3 inter-fingertip distances) PLUS `21×2` frame-to-frame velocity `(dx, dy)` = **`90` features/frame**.<br>3. Save variable-length sequences (`X.f32` + `offsets.i64` + `y_chars.json`) without resampling to 32 frames so CTC loss preserves character timing. |
| **ASL Citizen (v1.0)** | Raw `.mp4` webcam videos (`640×480` typical, variable length) + split CSVs. | Raw RGB pixels rather than pre-extracted landmarks. | Run MediaPipe (`HandLandmarker` `numHands=2` + `PoseLandmarker` `lite` + `FaceLandmarker`) at 30 fps offline (`ml/datasets/extract_video_landmarks.py`), using actual video `(width, height)`, then pass directly to `clip_features()` (`T=32, F=174`). |
| **How2Sign Holistic (`PSewmuthu/How2Sign_Holistic`)** | NumPy `.npy` arrays per sentence clip (`frontal` view, `1280×720`, `w/h = 1.778`) containing frame-level MediaPipe Holistic `[pose(33×4), face(468×3), lh(21×3), rh(21×3)]` (1,662 floats/frame). | Continuous multi-second sentences (`T_var` frames) in `16:9` studio aspect ratio; zeros (not `NaN`) mark missing hands in `.npy` files. | 1. Set `w = 1280.0, h = 720.0`.<br>2. Treat hand blocks where `np.allclose(hand, 0)` as absent.<br>3. Compute per-frame `frame_features(f, a)` (`174` floats/frame) + eyebrow/mouth summaries (`6` floats from face landmarks `70, 105, 336, 300, 13, 14`), storing variable-length `T_var × 180` tensors with `offsets.i64`. |
| **First-Party Recorder (`#/record` JSON)** | `Session` JSON (`version: 1`, `clips[].frames[]` with `w, h, pose(17), hands(0..2)`). | Already in SignLine `Frame` format (`web/src/lib/types.ts`). | Processed by `web/scripts/build-dataset.ts` and `ml/datasets/preprocess.py` into `X.f32` + `meta.json`. |

---

## 4. Concrete Ordered Tasks (One Agent Session Each)

### Task 2.1: Create Vocabulary Normalization & ASL-LEX Mapping (`ml/datasets/vocab_merge.py` & `ml/datasets/label_map.json`)
- [x] **2.1.1:** Create `ml/datasets/label_map.json` mapping all 250 lowercase GISLR labels (e.g., `"thankyou": "THANKYOU"`, `"callonphone": "CALL_ON_PHONE"`, `"minemy": "MY"`, `"hesheit": "IX_3P"`) and `web/src/vocab.json` labels (`ME, YOU, NAME, WHAT, _idle`) to canonical uppercase glosses and `ASL-LEX 2.0` `EntryID`s where applicable.
- [x] **2.1.2:** Create `ml/datasets/vocab_merge.py` with functions:
  - `normalize_gloss(raw_label: str, source: str) -> str`
  - `build_vocabulary(sources: list[str], license_tier: Literal["commercial", "research"], max_classes: int = 2750) -> dict`
  - Ensure that `--license-tier commercial` includes only `CC BY 4.0` (`gislr`, `popsign`) and `own` labels, while `--license-tier research` merges `asl_citizen` + `gislr` + `own` without duplicate homonym collisions.
- [x] **2.1.3:** Write unit tests in `ml/tests/test_vocab_merge.py` verifying label normalization, commercial vs. research filtering, and deterministic class index ordering.

### Task 2.2: Create Dataset Download Manager, Checksum Verifier & Human Instructions (`ml/datasets/download.py` & `ml/datasets/verify.py`)
- [x] **2.2.1:** Create `ml/datasets/download.py` reading `docs/subplans/model-v2/datasets.json` and supporting:
  - `python ml/datasets/download.py --dataset gislr|aslfr|aslfr-npy|asl-citizen|how2sign-holistic|chicagofswild|wlasl-hf --dest data/raw`
  - Pre-flight check: verifies disk space (`shutil.disk_usage`), checks if target archive already exists, and for Kaggle datasets checks whether `~/.kaggle/kaggle.json` or `KAGGLE_USERNAME`/`KAGGLE_KEY` environment variables are configured.
  - **Human-Action Prompt on Missing Credentials/Network:** If run in an offline environment or without Kaggle credentials, `download.py` exits cleanly with code `2` (or writes `docs/subplans/model-v2/NEEDS_HUMAN_ACTION.md` when `--write-human-guide` is passed) printing the exact manual download instructions and destination path.
  - **Dead-Link Resilience:** For any URL-based dataset (such as WLASL/OpenASL if ever invoked), logs dead URLs to `data/manifests/dead_links.jsonl` and continues without crashing.
- [x] **2.2.2:** Create `ml/datasets/verify.py` which validates downloaded archives in `data/raw/`, computes SHA256 digests, checks sample readability (e.g., reading the first 5 Parquet/MP4/NPY entries), and writes a unified clip-level provenance manifest `data/manifests/clip_manifest.parquet` with columns:
  - `clip_id: str`
  - `dataset_id: str` (`gislr`, `aslfr`, `asl_citizen`, `how2sign`, `own`)
  - `rel_path: str`
  - `raw_label: str`
  - `canonical_gloss: str`
  - `signer_id: str` (prefixed, e.g., `gislr:26734`)
  - `split: str` (`train`, `val`, `test` — strictly signer-disjoint!)
  - `license: str`
  - `license_tier: str` (`commercial` or `research`)
  - `sha256: str`
- [x] **2.2.3:** Write unit tests in `ml/tests/test_manifest_verify.py` using temporary synthetic archives to verify that `verify.py` catches corrupted files, assigns signer-disjoint splits (`set(train_signers).isdisjoint(val_signers)` and `set(train_signers).isdisjoint(test_signers)`), and never mixes `research`-only clips into a `commercial` query.

### Task 2.3: Implement Offline Landmark Converters (`ml/gislr_to_features.py`, `ml/datasets/aslfr_to_features.py`, `ml/datasets/video_to_features.py`, `web/scripts/build-dataset.ts`)
- [x] **2.3.1:** Create `ml/gislr_to_features.py` (following the reference design in `plan/tasks/1.B6.md` enhanced with split metadata):
  - Streams directly from `data/raw/gislr/asl-signs.zip` or a mounted folder (`/kaggle/input/asl-signs`) using `multiprocessing.Pool`.
  - Supports `--signs demo|all|<comma-list>`, `--aspect 0.75`, `--estimate-aspect-from data/raw/own`, and writes `X.f32` (`float32` shape `(N, 32, 174)`) + `meta.json` (`n, T, F, labels, y, signers, source, license_tier, aspect`).
- [x] **2.3.2:** Create `ml/datasets/aslfr_to_features.py` for Stage B fingerspelling:
  - Reads Kaggle ASLFR Parquet files (`train_landmarks/*.parquet`) or `darraghdog` `.npy` files.
  - Extracts the 90-dimensional per-frame fingerspelling feature vector (`48` static rotation-invariant handshape features matching `web/src/lib/letters.ts` + `42` wrist-normalized velocity features `(dx, dy)`).
  - Writes variable-length contiguous binary shards (`X.f32`, `offsets.i64`, `meta.json` with character vocabulary `character_to_prediction_index.json` and signer-independent splits).
- [x] **2.3.3:** Create `ml/datasets/video_to_features.py` for raw MP4 datasets (`ASL Citizen` and `ChicagoFSWild`) and `.npy` datasets (`How2Sign_Holistic`):
  - Uses MediaPipe (`HandLandmarker` `numHands=2` + `PoseLandmarker`) in multiprocessing workers to extract `T=32, F=174` tensors from ASL Citizen MP4s (`data/asl_citizen_features/X.f32` + `meta.json`), with checkpoint resume support (`--resume`) so interrupted multi-hour runs pick up where they left off.
  - Includes a `--how2sign-npy` mode that converts `PSewmuthu/How2Sign_Holistic` `.npy` files directly into variable-length `T_var × 180` continuous tensors in <20 minutes without video decoding.
- [x] **2.3.4:** Create `web/scripts/build-dataset.ts` and `web/scripts/fake-sessions.ts` (from `plan/tasks/2.B2.md` and `plan/tasks/2.B3.md`) so first-party `#/record` sessions compile into `data/processed/X.f32`, `data/processed/meta.json`, `web/public/models/knn.*`, and `web/public/models/letters.*`.
- [x] **2.3.5:** Create `ml/tests/test_gislr_convert.py` and `ml/tests/test_aslfr_convert.py` that build synthetic Parquet/zip fixtures in `tmp_path` and verify byte-identical zip-vs-folder conversion, finite `float32` outputs, and proper `NaN` handling.

---

## 5. Exact Instructions for Human-Assisted Downloads (When Agent Has No Egress/Credentials)

If the executing agent runs in an environment without Kaggle credentials or sufficient disk space, the human operator should run these exact commands on the training machine (e.g., Kev's MSI RTX 3060 laptop or a cloud GPU box) from the repository root:

```bash
# Step A: Configure Kaggle API token (once)
# 1. Go to https://www.kaggle.com/settings -> API -> "Create New Token" (downloads kaggle.json)
# 2. Accept competition rules at:
#    - https://www.kaggle.com/competitions/asl-signs/rules
#    - https://www.kaggle.com/competitions/asl-fingerspelling/rules
mkdir -p ~/.kaggle && mv ~/Downloads/kaggle.json ~/.kaggle/kaggle.json && chmod 600 ~/.kaggle/kaggle.json

# Step B: Download Commercial-Safe Pre-Extracted Landmark Datasets (CC BY 4.0)
mkdir -p data/raw/gislr data/raw/aslfr data/raw/asl_citizen data/raw/how2sign
kaggle competitions download -c asl-signs -p data/raw/gislr
# For fingerspelling, download either the compact 12.4 GB preprocessed mirror (fastest) or full 46.5 GB competition zip:
kaggle datasets download -d darraghdog/asl-fingerspelling-preprocessing-train-dataset -p data/raw/aslfr
# (Optional full ASLFR): kaggle competitions download -c asl-fingerspelling -p data/raw/aslfr

# Step C (Optional - Research Tier Only): Download ASL Citizen (42.8 GB) & How2Sign Holistic Frontal (16.9 GB)
wget -c https://download.microsoft.com/download/b/8/8/b88c0bae-e6c1-43e1-8726-98cf5af36ca4/ASL_Citizen.zip \
  -O data/raw/asl_citizen/ASL_Citizen.zip
hf download PSewmuthu/How2Sign_Holistic --repo-type dataset \
  --include "metadata/*" --include "*/frontal/*" --local-dir data/raw/how2sign

# Step D: Run offline verification and feature conversion (caches compact .f32 tensors)
ml/.venv/bin/python ml/datasets/verify.py --raw-dir data/raw --out data/manifests/clip_manifest.parquet
ml/.venv/bin/python ml/gislr_to_features.py --zip data/raw/gislr/asl-signs.zip --signs demo --out data/gislr-demo --workers 8
ml/.venv/bin/python ml/gislr_to_features.py --zip data/raw/gislr/asl-signs.zip --signs all --out data/gislr-all --workers 8
ml/.venv/bin/python ml/datasets/aslfr_to_features.py --dir data/raw/aslfr --out data/aslfr-processed --workers 8
```

---

## 6. Exact Files and Directories to Create or Modify

| Action | File Path | Purpose |
| :--- | :--- | :--- |
| **Create** | `ml/datasets/__init__.py` | Package marker for dataset utilities. |
| **Create** | `ml/datasets/label_map.json` | Canonical gloss & ASL-LEX 2.0 mapping table across GISLR, ASL Citizen, and SignLine. |
| **Create** | `ml/datasets/vocab_merge.py` | Vocabulary builder with `--license-tier commercial|research` enforcement. |
| **Create** | `ml/datasets/download.py` | CLI downloader with disk-space check, credential check, dead-link logger, and human fallback guide. |
| **Create** | `ml/datasets/verify.py` | Checksum/schema verifier and `clip_manifest.parquet` builder with signer-disjoint split checks. |
| **Create** | `ml/gislr_to_features.py` | Parallel converter from GISLR Parquet zip/folder to `(N, 32, 174)` `X.f32` + `meta.json`. |
| **Create** | `ml/datasets/aslfr_to_features.py` | Parallel converter from ASLFR Parquet/NPY to variable-length 90-dim fingerspelling shards. |
| **Create** | `ml/datasets/video_to_features.py` | Offline MediaPipe extractor for ASL Citizen MP4s and converter for How2Sign Holistic `.npy` files. |
| **Create** | `web/src/lib/letters.ts` | Browser handshape feature extractor (`LETTER_F = 48`), `LetterKnn`, and `LetterDecoder`. |
| **Create** | `web/src/lib/letters.test.ts` | Unit tests for `letterHand`, `letterFeatures`, and `LetterDecoder`. |
| **Create** | `web/scripts/fake-sessions.ts` | Synthetic Recorder session generator for offline testing. |
| **Create** | `web/scripts/build-dataset.ts` | Converts Recorder JSON sessions into `data/processed/X.f32` + starter `knn.*` and `letters.*`. |
| **Modify** | `.gitignore` | Ignore `data/`, `ml/out/`, and `web/public/models/*.task`, while allowing small model files (`*.onnx`, `*_meta.json`, `knn.*`, `letters.*`). |
| **Create** | `ml/tests/test_vocab_merge.py` | Unit tests for vocabulary merging and license-tier filtering. |
| **Create** | `ml/tests/test_manifest_verify.py` | Unit tests for manifest verification and signer-independent split enforcement. |
| **Create** | `ml/tests/test_gislr_convert.py` | Synthetic Parquet zip vs. folder conversion parity test. |
| **Create** | `ml/tests/test_aslfr_convert.py` | Synthetic ASLFR fingerspelling conversion test. |

---

## 7. Commands, Tools & Verification Criteria

### Verification Commands (Runnable Offline on Synthetic Fixtures)
```bash
# 1. Run Python dataset, manifest, and synthetic Parquet converter tests
python3 -m pytest -q ml/tests/test_vocab_merge.py ml/tests/test_manifest_verify.py ml/tests/test_gislr_convert.py ml/tests/test_aslfr_convert.py

# 2. Run synthetic Recorder session builder and verify output tensors
TMP_DIR=$(mktemp -d)
(cd web && npx tsx scripts/fake-sessions.ts "$TMP_DIR/raw" && npx tsx scripts/build-dataset.ts "$TMP_DIR/raw" "$TMP_DIR/processed" "$TMP_DIR/pub")
test -s "$TMP_DIR/processed/X.f32" && test -s "$TMP_DIR/pub/knn.f32" && test -s "$TMP_DIR/pub/letters.f32"
rm -rf "$TMP_DIR"

# 3. Run frontend tests (including letters.test.ts), lint, and build
npm --prefix web test
npm --prefix web run lint
npm --prefix web run build
```

### Acceptance Criteria
1. **Byte-Identical Zip vs. Directory Conversion:** `test_gislr_convert.py` proves that reading directly from `asl-signs.zip` produces byte-identical `X.f32` tensors to reading from an unzipped directory, with `T = 32, F = 174` and all finite values.
2. **Strict Signer Disjointness & License Filtering:** `test_manifest_verify.py` proves zero signer overlap between `train`, `val`, and `test`, and confirms that `license_tier == "commercial"` excludes `ASL Citizen`, `How2Sign`, `WLASL`, `MS-ASL`, and `OpenASL`.
3. **First-Party Recorder Builder Works End-to-End:** `build-dataset.ts` compiles Recorder sessions into `X.f32`, `meta.json`, `knn.f32`, and `letters.f32`.

---

## 8. Risks, Fallbacks & "If This Fails, Do X"

- **Risk 1: `pyarrow` is not installed in the sandbox environment when running `pd.read_parquet` in `test_gislr_convert.py`.**
  - *If this fails, do X:* In `ml/gislr_to_features.py` and `ml/datasets/aslfr_to_features.py`, use `pyarrow` / `pandas.read_parquet` when installed, and add an automatic fallback reader for `.npz` / `.csv` synthetic fixtures in offline test environments where `pyarrow` is absent.
- **Risk 2: 40 GB Kaggle download is too slow on venue/home Wi-Fi.**
  - *If this fails, do X:* Run `ml/gislr_to_features.py` and `ml/datasets/aslfr_to_features.py` directly inside a free **Kaggle Notebook** (where `/kaggle/input/asl-signs` and `/kaggle/input/asl-fingerspelling` are already mounted locally with 0 download time) and download only the resulting `X.f32` + `meta.json` (`~2.1 GB` for all 250 signs, or `~140 MB` for the 16-sign demo subset).

---

## 9. Estimated Effort and Compute Needs

- **Agent Coding & Synthetic Verification Effort:** 1–2 agent sessions (~60–90 minutes).
- **Compute Needs for Synthetic Verification:** CPU only (< 2 minutes runtime, < 100 MB temp disk).
- **Compute Needs for Full Dataset Conversion (Human/GPU Machine):**
  - `kaggle-gislr` (94,477 Parquet clips → `X.f32`): ~20 minutes on 8 CPU cores, 2.1 GB output.
  - `kaggle-aslfr` (67,287 sequences → `X.f32`): ~15 minutes on 8 CPU cores, 1.1 GB output.
  - `ASL Citizen` (83,399 MP4 videos → `X.f32`, optional Research Tier): ~4.5 hours on 8 CPU cores + 1 GPU, 1.9 GB output.

---

## 10. Handoff Note for Fresh Agent

> **To the agent starting Phase 2:**  
> Ensure Phase 1 is marked complete in `docs/subplans/model-v2/README.md` and `pytest ml/tests/test_parity.py` passes. Implement Tasks 2.1, 2.2, and 2.3 in order. Remember: do **not** attempt to download 40 GB archives inside the agent sandbox; verify all converters and manifest builders using the deterministic synthetic pytest suites (`test_vocab_merge.py`, `test_manifest_verify.py`, `test_gislr_convert.py`, `test_aslfr_convert.py`) and `fake-sessions.ts`. If real datasets are not present in `data/raw/`, run `python ml/datasets/download.py --write-human-guide` to populate `docs/subplans/model-v2/NEEDS_HUMAN_ACTION.md`, then proceed to [phase-03-fingerspelling-and-expanded-isolated-model.md](https://www.google.com/search?q=phase-03-fingerspelling-and-expanded-isolated-model.md).


## Handoff Summary - October 18, 2026 - Phase 2 only

Tasks **2.1 through 2.3** are complete and all automated acceptance checks pass. No Phase 3-6 task, model training, migration, or deployment was performed. Large dataset acquisition remains a human action; no large dataset was downloaded in this session.

- **Task 2.1:** All 250 GISLR labels and first-party labels have deterministic canonical mappings. Commercial vocabulary excludes research sources. ASL-LEX EntryID references are explicitly marked lookup hints, not verified sign equivalence; missing IDs remain null. Research classes retain source namespaces and sense numbers.
- **Task 2.2:** Registry-driven credential/disk/existing-file preflight, offline exit code 2, atomic URL downloads with dead-link logging, and idempotent human guide generation. ZIP/TGZ/folder verification records SHA256 provenance, decodes sample files, preserves official splits or assigns stable signer-hash splits, and rejects leakage or spoofed license tiers. Extracted NPY mirrors can use external competition metadata while archive hashes are recorded in a sidecar.
- **Task 2.3:** GISLR ZIP/folder multiprocessing conversion writes identical `(N,32,174)` float32 bytes. ASLFR long/wide Parquet and explicitly identified NPY layouts write variable `(sum_frames,90)` shards, int64 offsets, character indices and signer splits. Browser/Python 48-feature handshape twins agree within 1e-4; missing hands reset velocity. Raw-video workers use MediaPipe Tasks with two hands, pose and optional face at <=30 Hz; actual detector and codec boundaries are mocked in synthetic tests. How2Sign's 1662-value layout becomes variable 180-feature tensors. Resume checkpoints validate input/model/config fingerprints and recover corrupt partial caches. First-party browser and Python adapters share canonical feature/signer-split contracts.
- **Efficiency:** Tensor output streams to disk; GISLR workers keep archives open, ASLFR workers cache one shard and sequence index, and registry/label/path lookups avoid repeated corpus-wide scans. Full-corpus throughput has not been measured.
- **Human actions:** [NEEDS_HUMAN_ACTION.md](NEEDS_HUMAN_ACTION.md) preserves Phase 1 QA and adds exact Windows download/extraction/verification commands, optional research-only commands, expected paths/output sizes, trusted-checksum handling and commands to resume verification. Publisher SHA256 values are unavailable; observed hashes are not represented as publisher authenticity checks. Reduced ASLFR NPY data requires publisher `inference_args.json`/`selected_columns` or an explicit `columns.json`; missing signer metadata requires reviewed `clips.csv` rather than guessed identities.

Verification evidence (Windows, Node 24.20.0; Python 3.12.14, NumPy 2.3.5, pandas 2.2.3, PyArrow 19.0.1, pytest 9.1.1):

| Check | Result |
| :--- | :--- |
| `ml/.venv/Scripts/python -m pytest -q ml/tests` | **45 passed** in 22.86 s; includes all four Section 7 suites (33 cases), 7 existing feature-parity cases, 3 video/How2Sign/resume cases and 2 Recorder integration cases. No tests skipped or loosened. |
| GISLR synthetic ZIP/folder/2-worker conversion | Byte-identical output for 12 clips, 2 labels, 3 signers; finite float32 `(12,32,174)`. |
| ASLFR synthetic conversion | Variable 4/7-frame sequences; offsets `[0,4,11]`; Parquet/NPY byte parity, missing-hand gaps and character validation pass. |
| `npm --prefix web test` | **259 tests passed across 21 files**, including letter decoder and asset-loader checks. |
| `npm --prefix web run lint` | Passed. |
| `npm --prefix web run build` | TypeScript and production bundling passed; existing LiveKit chunk-size advisory remains. |
| Section 7 `fake-sessions.ts` -> `build-dataset.ts` | **60 sign clips, 5 labels, 3 signers; 18 letter holds -> 252 templates**, maxDist 0.500. `X.f32`: 1,336,320 bytes; `knn.f32`: 1,336,320 bytes; `letters.f32`: 48,384 bytes. Generated files are under ignored `data/phase2-synthetic/`. |
| Converter `--help` commands | GISLR, ASLFR and video CLIs passed, exposing license-tier/manifest options. |
| `git diff --check` | Passed. |

The server was untouched and `server/.venv` is absent, so the guide's conditional backend check does not apply. No raw recordings, datasets, environment files, dependency installations, checkpoint caches, or synthetic model assets are committed.

Commits already created: `a36e45c` (Task 2.1 vocabulary) and `c36c539` (Task 2.2 acquisition/provenance). The Task 2.3 implementation/completion commit is titled `phase-02: complete offline preprocessing and synthetic verification`; its exact hash is recorded in the documentation follow-up below.

**Scope boundary:** Stop after pushing Phase 2 to `main`. A future agent must obtain explicit authorization before starting Phase 3. Full dataset conversion timing, real MediaPipe/codec quality, publisher checksums and Phase 1 physical webcam/call QA remain human verification; synthetic success makes no real-data accuracy or timing claim.


**Verified Phase 2 implementation and completion commit:** `aa3c4333b4ac7ac42bf2ed26cf8c32955cf6c87a`. This documentation follow-up records the exact hash; it makes no implementation changes.
