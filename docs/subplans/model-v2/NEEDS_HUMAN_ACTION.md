# Model v2 Human QA

## Phase 1 / Tasks 1.3-1.4 - Physical webcam and two-person call

**Missing prerequisite:** Automated tests used mocked MediaPipe detectors and canvas contexts. A person signing on the target laptops and a second call participant are required to verify real model accuracy, overlay alignment and runtime FPS.

From the repository root, prepare ignored local runtime assets and start the web app:

```powershell
python web/scripts/setup_assets.py
npm --prefix web run dev -- --host 127.0.0.1
```

**Target paths and expected output:** The asset script prepares `web/public/models/hand_landmarker.task`, `web/public/models/pose_landmarker_lite.task`, `web/public/models/face_landmarker.task` and local WASM runtime files. These generated runtime assets remain ignored. At the printed local URL, inspect `#/bench` and `#/record`: both hands should have green/blue skeletons aligned with the mirrored preview, and pose anchors should follow nose/shoulders. Record bench FPS with face enabled/disabled on target hardware (goals: >=24 FPS GPU, >=18 FPS CPU). In `#/call`, join a test room with another participant, enable signer recognition, verify 0/1/2-hand status and overlay, and confirm a known shared/personal sign still yields a reviewed suggestion and reaches the other participant when sent. Live calls require the normal local server/provider setup.

No recording or dataset file is required as a QA artifact. Report observed browser/hardware, FPS, alignment and recognition results; automated tests do not establish these measurements.

**Resume automated verification:**

```powershell
npm --prefix web run fixtures
python -m pytest -q ml/tests/test_parity.py
npm --prefix web test
npm --prefix web run lint
npm --prefix web run build
```

Phase 1 code checks have passed. This QA note does not authorize starting Phase 2 or deployment.

## Phase 2 / Tasks 2.1–2.3 — Dataset acquisition and full-data verification

**Missing prerequisites:** Large datasets, accepted Kaggle competition rules, credentials, disk space and optional video model assets are absent from the synthetic verification environment. No large dataset was downloaded. Full-data throughput and real video quality remain human checks.

Run from the repository root on the training machine. Python commands below use the Windows virtual environment; on Linux use `ml/.venv/bin/python`. Install only data dependencies for Phase 2:

```powershell
python -m venv ml/.venv
ml/.venv/Scripts/python -m pip install numpy==2.3.5 pandas==2.2.3 pyarrow==19.0.1 pytest==9.1.1 kaggle huggingface_hub
New-Item -ItemType Directory -Force "$HOME/.kaggle", data\raw/gislr, data\raw/aslfr | Out-Null
Copy-Item "$HOME/Downloads/kaggle.json" "$HOME/.kaggle/kaggle.json"
```

Create your private API token at https://www.kaggle.com/settings and accept rules at https://www.kaggle.com/competitions/asl-signs/rules and https://www.kaggle.com/competitions/asl-fingerspelling/rules. Keep the token out of Git. Choose **either** compact ASLFR NPY or the full competition archive; both include overlapping clips.

```powershell
ml/.venv/Scripts/kaggle competitions download -c asl-signs -p data\raw\gislr
# Compact ASLFR NPY source:
ml/.venv/Scripts/kaggle datasets download -d darraghdog/asl-fingerspelling-preprocessing-train-dataset -p data\raw\aslfr
ml/.venv/Scripts/kaggle competitions download -c asl-fingerspelling -f train.csv -p data\raw/aslfr
Expand-Archive -LiteralPath data\raw/aslfr/asl-fingerspelling-preprocessing-train-dataset.zip -DestinationPath data\raw/aslfr
# Full competition alternative (use instead of the compact source above):
# ml/.venv/Scripts/kaggle competitions download -c asl-fingerspelling -p data\raw\aslfr
# Expand-Archive -LiteralPath data\raw/aslfr/asl-fingerspelling.zip -DestinationPath data\raw/aslfr
```

**Exact targets:** `data\raw/gislr/asl-signs.zip`; either `data\raw/aslfr/asl-fingerspelling-preprocessing-train-dataset.zip` (extract locally before NPY conversion) or `data\raw/aslfr/asl-fingerspelling.zip` (extract before ASLFR conversion). GISLR can be read directly from ZIP. Reserve at least archive size × 1.25 for downloads and additional space for extraction/features. The manager enforces preflight: `ml/.venv/Scripts/python ml/datasets/download.py --dataset gislr --dest data\raw`.

**Expected SHA256:** The registry does not publish trusted archive digests. Do not treat an observed hash as an authenticity guarantee. Obtain a publisher checksum if available, place a filename-to-SHA256 JSON mapping at `data/manifests/expected_checksums.json`, and pass `--checksums` to verification. Otherwise verification records observed SHA256 per archive and clip, checks ZIP CRC, and decodes up to five files per media format. Expected binary outputs must be finite float32; fixed sign shards have `n × 32 × 174 × 4` bytes and variable shards have `offsets[-1] × F × 4` bytes, with `n+1` int64 offsets.

```powershell
ml/.venv/Scripts/python ml/datasets/verify.py --raw-dir data\raw --out data/manifests/clip_manifest.parquet
ml/.venv/Scripts/python ml/gislr_to_features.py --zip data\raw/gislr/asl-signs.zip --signs demo --manifest data/manifests/clip_manifest.parquet --out data/gislr-demo --workers 8
ml/.venv/Scripts/python ml/gislr_to_features.py --zip data\raw/gislr/asl-signs.zip --signs all --manifest data/manifests/clip_manifest.parquet --out data/gislr-all --workers 8
ml/.venv/Scripts/python ml/datasets/aslfr_to_features.py --dir data\raw/aslfr --manifest data/manifests/clip_manifest.parquet --out data/aslfr-processed --workers 8
```

For compact NPY, keep its matching `train.csv` beside `train_landmarks/<file_id>/<sequence_id>.npy` (or `<file_id>/<sequence_id>.npy`). Keep the publisher's `inference_args.json` containing `selected_columns`, or supply `columns.json` listing the exact flattened column order. Reduced layouts are never guessed. Preserve `character_to_prediction_index.json` if supplied.

**Optional research downloads only:** Accept each source's research license first. Run individually with ample disk space:

```powershell
New-Item -ItemType Directory -Force data\raw/asl_citizen, data\raw/how2sign, data\raw/chicagofswild, data\raw/wlasl | Out-Null
curl -L --fail --continue-at - https://download.microsoft.com/download/b/8/8/b88c0bae-e6c1-43e1-8726-98cf5af36ca4/ASL_Citizen.zip --output data\raw\asl_citizen\ASL_Citizen.zip
ml/.venv/Scripts/hf download PSewmuthu/How2Sign_Holistic --repo-type dataset --local-dir data\raw\how2sign --include metadata/* */frontal/*
curl -L --fail --continue-at - https://dl.ttic.edu/ChicagoFSWild.tgz --output data\raw\chicagofswild\ChicagoFSWild.tgz
ml/.venv/Scripts/hf download Voxel51/WLASL --repo-type dataset --local-dir data\raw\wlasl
ml/.venv/Scripts/python ml/datasets/verify.py --raw-dir data\raw --out data/manifests/research_manifest.parquet --license-tier research
```

Keep official signer/split metadata. When source metadata uses another schema, provide `clips.csv` with `path,label,signer_id,split` (relative media paths, one row per clip, splits train/val/test). How2Sign sentence metadata may lack signer identity: supply verified signer IDs; the pipeline refuses guessed identities. ASL-LEX EntryID references are research lookup hints, not evidence that identically named signs are equivalent. Human review is required before merging research classes.

```powershell
ml/.venv/Scripts/python -m pip install mediapipe opencv-python
python web/scripts/setup_assets.py
ml/.venv/Scripts/python ml/datasets/video_to_features.py --dir data\raw/asl_citizen --dataset asl_citizen --license-tier research --manifest data/manifests/research_manifest.parquet --out data/asl_citizen_features --workers 8 --resume
ml/.venv/Scripts/python ml/datasets/video_to_features.py --dir data\raw/how2sign --dataset how2sign --how2sign-npy --license-tier research --manifest data/manifests/research_manifest.parquet --out data/how2sign_features --workers 8 --resume
```

**Resume automated verification (Phase 2 only):**

```powershell
ml/.venv/Scripts/python -m pytest -q ml/tests
npm --prefix web test
npm --prefix web run lint
npm --prefix web run build
$phase2tmp = Join-Path $env:TEMP 'signline-phase2'
Push-Location web
npx tsx scripts/fake-sessions.ts "$phase2tmp/raw"
npx tsx scripts/build-dataset.ts "$phase2tmp/raw" "$phase2tmp/processed" "$phase2tmp/pub"
Pop-Location
```

Expected: manifest columns include clip/dataset/path/label/signer/split/license/SHA256; no signer overlap between splits; commercial manifests exclude research sources; synthetic recorder output contains 60 sign clips across three signers and nonempty `knn.f32`/`letters.f32`. No training, deployment, or Phase 3 work is authorized by these commands.


## Phase 4 / Tasks 4.1-4.4 - Real-data and live acceptance follow-through

**Missing prerequisites:** Real provenance-checked commercial isolated data, a trained Phase 3 C1 encoder and CUDA training environment; for research, How2Sign XY180 caches plus reviewed ASL gloss annotations. No live Gemini generation or real signer/camera QA was run. The implemented code and synthetic checks pass; AC-4.4 is unmet and AC-4.3's live quality/latency remains open.

From the repository root on the training machine (use its CUDA Python, not the local CPU smoke weights):

```powershell
python -m ml.continuous_ctc --manifest data/gislr-all --stage c1_commercial_250 --license-tier commercial --seq-len 128 --min-signs 2 --max-signs 5 --epochs 30 --device cuda --init-from ml/checkpoints/stage_c1/best_ema.pt --out-dir ml/checkpoints/stage_d2_continuous_ctc
python -m ml.evaluate_v2 --mode continuous --checkpoint ml/checkpoints/stage_d2_continuous_ctc/best_ema.pt --manifest data/gislr-all --split val
python -m ml.continuous_ctc --dataset how2sign_holistic --manifest data/how2sign_features --gloss-manifest data/manifests/how2sign_glosses.parquet --stage c2_research_2731 --license-tier research --epochs 30 --device cuda --init-from ml/checkpoints/stage_d2_continuous_ctc/best_ema.pt --out-dir ml/checkpoints/stage_d2_how2sign
python -m ml.evaluate_v2 --mode continuous --checkpoint ml/checkpoints/stage_d2_how2sign/research_only/best_ema.pt --manifest data/how2sign_features --gloss-manifest data/manifests/how2sign_glosses.parquet --license-tier research --split val
```

`how2sign_glosses.parquet` (or JSON array) requires one row per cached clip with `clip_id`, exact `signer_id`, exact `split`, and `glosses` as a nonempty list of reviewed ASL sign labels. Do not infer glosses by splitting English sentences. Reject signer overlap and keep research weights separate. Expected targets: commercial `ml/checkpoints/stage_d2_continuous_ctc/best_ema.pt` with blank0, XY174, commercial metadata and validation `wer<=0.28`; research `ml/checkpoints/stage_d2_how2sign/research_only/best_ema.pt` with `non_commercial=true` and validation `wer<=0.35`. SHA256 values cannot be known before real training; record the actual artifact hashes and reports in the Phase 4 Handoff Note after generating them. All checkpoint paths remain gitignored.

For AC-4.3, use the existing server-only Gemini key to run the reviewed lattice/ambiguity examples and record actual semantics and service latency; never put the key in a browser or committed file. For AC-4.1/4.2, record a consented signer sequence with natural transitions, eyebrow expressions/headshakes and glasses/bangs variations; the library tests alone cannot establish webcam quality.

Resume automated verification after staging/training:

```powershell
$env:PYTHONPATH='server'
ml/.venv/Scripts/python -m pytest server/tests/ ml/tests/ -q
npm --prefix web test
npm --prefix web run build
npm --prefix web run lint
```

The Phase 4 handoff records synthetic metrics and current limitations. This section authorizes no Phase 5/6 integration, model promotion or deployment.
