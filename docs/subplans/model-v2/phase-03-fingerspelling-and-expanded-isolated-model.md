# Phase 03: Fingerspelling & Expanded Isolated-Sign Model Design, Training & Evaluation

**Status:** `[ ]` Pending  
**Target Stages:** Stage B (Dynamic Fingerspelling: `A-Z`, `0-9`, space/delete) & Stage C (Large Isolated Vocabulary: Stage C1 250-sign Commercial Core + Stage C2 1,000–2,731-sign Research Tier)  
**Estimated Effort:** 8–12 hours (3–4 coding agent sessions + GPU training time)  
**Compute Requirements:**
- **Stage B (Fingerspelling) & Stage C1 (250-sign GISLR):** 1× NVIDIA T4 (16 GB VRAM, free Google Colab / Kaggle GPU) or 1× RTX 3060/4090 for ~1.5–2.5 hours per run using cached `.npz` landmarks from Phase 02.
- **Stage C2 (1,000–2,731 signs on ASL Citizen + WLASL):** 1× NVIDIA A100 (40 GB) or L4 (24 GB) for ~3–5 hours (~$3–$6 on cloud GPU) or 2× T4 sessions on Kaggle.

---

## 1. Objective and Why It Matters

### 1.1 Current State & Problem
1. **7-Word Toy Model (`web/public/trained-words.json`):** The live call interface (`web/src/components/SignerWords.tsx` + `web/src/lib/wordModel.ts`) currently loads a 100-tree `scikit-learn==1.9.1` `RandomForestClassifier` trained on 105 clips (7 words × 15 samples) from a single signer (`Lisa Ou`, commit `405afe03bae60eac7313f8d58dfa426b9d301862`), using 1-hand `(x, y)` coordinates flattened to `1,260` floats.
2. **Existing PyTorch Architecture (`ml/train.py:88-107`):** The repo already includes a compact 1D-CNN + BiGRU + additive attention network (`SignNet`, `~500K` parameters) operating on `(B, T=32, F=174)` holistic landmarks, plus basic spatial jitter, horizontal flip, and temporal speed perturbation (`ml/train.py:34-61`). However:
   - Its `flip_augment()` (`ml/train.py:42-48`) negates raw `x` coordinates **without swapping the Left Hand `[0:63]` and Right Hand `[63:126]` slots** or swapping Left/Right shoulder/elbow/wrist pose indices, corrupting two-hand signs during training.
   - Its training script (`ml/train.py:130-156`) uses a random `85/15` stratified split across clips rather than a **signer-independent split** (`participant_id`), which inflates validation accuracy via signer leakage.
   - Its capacity (`hidden=128`, 2 Conv1d layers + 1 BiGRU layer) saturates around ~250 classes and underfits when scaled to 1,000–2,731 classes or variable-length fingerspelling sequences.
3. **No Dynamic Fingerspelling Model:** The existing `vocab.json` lists only 3 static letters (`K, E, V` under `letters`) and cannot recognize `A–Z` (including dynamic `J` and `Z`), numbers `0–9`, or continuous fingerspelled words (names, proper nouns, out-of-vocabulary terms).

### 1.2 Why This Phase Matters
This phase compares candidate neural architectures for landmark sequences, fixes the data augmentation and split bugs, and trains two production-ready models on the Phase 02 `.npz` shard caches:
1. **Stage B — Dynamic Fingerspelling Model (`FingerspellingCTCMini`):** Recognizes both isolated characters (`A–Z`, `0–9`) and continuous fingerspelled words/names using a lightweight 1D Depthwise-Separable Conv + BiGRU/Squeezeformer CTC network trained on [Kaggle ASLFR](https://www.google.com/search?q=https%3A%2F%2Fwww.kaggle.com%2Fcompetitions%2Fasl-fingerspelling%2Fdata).
2. **Stage C — Expanded Isolated-Sign Classifier (`SignConformerV2` / `SignBiGRUV2`):** Scales isolated recognition from 7 words to **Stage C1 (250 commercial-safe signs from [Kaggle GISLR](https://www.google.com/search?q=https%3A%2F%2Fwww.kaggle.com%2Fcompetitions%2Fasl-signs%2Fdata))** and **Stage C2 (1,000–2,731 research signs from [ASL Citizen](https://www.google.com/search?q=https%3A%2F%2Fwww.microsoft.com%2Fen-us%2Fresearch%2Fproject%2Fasl-citizen%2F) + [WLASL](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fdxli94%2FWLASL))**, with temperature-calibrated probabilities, an explicit `_idle` / background rejection head, and a webcam domain evaluation suite.

---

## 2. Prerequisites and Dependencies

- **Phase 01 Complete:** Canonical `F = 174` feature specification (`docs/schemas/holistic_v2_schema.json`) and Python/TS parity tests (`ml/features.py` ↔ `web/src/lib/features.ts`) passing.
- **Phase 02 Complete:**
  - Unified manifest (`data/processed/holistic_v2/manifest.parquet`) with `split in {'train', 'val', 'test'}`, `license_tier`, and zero `signer_id` overlap across splits.
  - Label maps (`data/processed/holistic_v2/label_map_c1_250.json`, `label_map_c2_2731.json`, `label_map_b_chars.json`).
  - Cached `.npz` shards under `data/processed/holistic_v2/shards/` and `data/processed/aslfr_v2/shards/`.

---

## 3. Candidate Architecture Comparison (Topic 4)

Before writing training code, we evaluate three candidate model families for 3D landmark sequences `(B, T, F=174)` under our deployment constraints (**browser WASM latency `<= 35 ms`, quantized ONNX size `<= 5 MB`, single-GPU training time `<= 4 hours`**):

| Criterion | Candidate 1: Multi-Scale 1D-CNN + BiGRU + Attention (`SignBiGRUV2`, upgraded from `ml/train.py`) | Candidate 2: 1D Depthwise Conv + Conformer / Squeezeformer (`SignConformerV2`, Kaggle GISLR/ASLFR 1st-place family) | Candidate 3: Spatio-Temporal Graph Convolutional Network (`ST-GCN` / `CTR-GCN` on skeletal graph) |
|---|---|---|---|
| **Inductive Bias** | Local temporal receptive fields (kernels `k=3, 5, 7`) + recurrent state tracking across `T=32..128` frames | Pointwise feature projection + 1D depthwise temporal convolution + multi-head self-attention for long-range phase alignment | Explicit intra-frame skeletal graph adjacency matrix $A \in \mathbb{R}^{58 \times 58}$ + temporal 1D convolution |
| **Isolated Top-1 Accuracy (250 signs, GISLR benchmark)** | **79% – 82%** Top-1 | **85% – 89%** Top-1 (proven winning architecture on [Kaggle GISLR](https://www.google.com/search?q=https%3A%2F%2Fwww.kaggle.com%2Fcompetitions%2Fasl-signs) & [ASLFR](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FChristofHenkel%2Fkaggle-asl-fingerspelling-1st-place-solution)) | **81% – 84%** Top-1 (strong on raw joints, underperforms when velocity/bone-angle features are already pre-concatenated) |
| **Isolated Top-1 Accuracy (2,731 signs, ASL Citizen)** | **55% – 60%** Top-1 | **63% – 68%** Top-1 (**85%+** Top-5) | **59% – 63%** Top-1 |
| **Continuous Fingerspelling (CTC CER on ASLFR)** | **14% – 17%** CER | **9% – 12%** CER | Poor fit for character-rate CTC without heavy temporal upsampling |
| **ONNX Runtime Web (WASM SIMD) Compatibility** | Good, though `nn.GRU` exports to scan/loop ops in ONNX that run sequentially in WASM (~8–14 ms for `T=32`) | **Excellent** — purely feed-forward (`Conv1d`, `Linear`, `LayerNorm`, `MultiheadAttention`, `SiLU`), fully vectorizable in WASM SIMD (~4–9 ms for `T=32`) | Moderate — custom Einstein summations (`einsum` over graph adjacency) often decompose into slow gather/transpose ops in WASM |
| **Parameter Count & INT8/FP16 ONNX Size** | `~1.1M` params (`~2.2 MB` FP16) | `~1.8M` params (`~3.6 MB` FP16 / `~1.9 MB` INT8) | `~2.4M` params (`~4.8 MB` FP16) |

### Architecture Decision & Justification
1. **Primary Architecture (`SignConformerV2` — 4-Block Conv1D-Squeezeformer Encoder):**
   - **Selected for both Stage B (with a CTC linear head over `T=128`) and Stage C (with masked attention pooling + cosine classifier head over `T=32`).**
   - **Why:** First-place solutions on both [Kaggle GISLR](https://www.google.com/search?q=https%3A%2F%2Fwww.kaggle.com%2Fcompetitions%2Fasl-signs) and [Kaggle ASLFR](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2FChristofHenkel%2Fkaggle-asl-fingerspelling-1st-place-solution) demonstrated that 1D Depthwise-Separable Convolution paired with Transformer Self-Attention (`Conformer` / `Squeezeformer` blocks) outperforms pure RNNs and pure ST-GCNs on canonicalized MediaPipe landmark tensors while exporting to loop-free, SIMD-accelerated ONNX graphs.
2. **Baseline / Low-Resource Architecture (`SignBiGRUV2`):**
   - Kept in `ml/models/bigru.py` as a fast baseline and ablation comparator (`--arch bigru` vs. `--arch conformer`) because `ml/train.py` already uses a smaller variant of this architecture.

---

## 4. Concrete Tasks (Ordered for Agent Sessions)

### Task 3.1: Physically Correct 3D Landmark & Handedness Data Augmentation (`ml/augment.py`)
Create `ml/augment.py` to replace the buggy augmentation logic in `ml/train.py:34-61`. Every augmentation operates on the raw `(T, 543, 3)` or canonicalized `(T, 174)` tensor **before** or **consistently with** canonicalization:
1. **`mirror_hands_and_pose(seq_174: np.ndarray, p: float = 0.5) -> np.ndarray`:**
   - Simulates left-handed vs. right-handed signers accurately:
   - **Swaps the Left Hand `[0:63]` and Right Hand `[63:126]` feature blocks** first, then negates all `x` coordinates (`0::3` within `[0:126]`).
   - **Swaps Left and Right upper-body pose landmarks** within `[126:150]` (swapping `L_shoulder (0) <-> R_shoulder (1)`, `L_elbow (2) <-> R_elbow (3)`, `L_wrist (4) <-> R_wrist (5)`, `L_hip (6) <-> R_hip (7)`) and negates their `x` coordinates.
   - **Swaps symmetric face landmarks** within `[150:174]` (`L_eye (1) <-> R_eye (2)`, `L_mouth (3) <-> R_mouth (4)`, `L_brow (6) <-> R_brow (7)`) and negates their `x` coordinates.
2. **`random_3d_rotation_and_camera_tilt(seq_174: np.ndarray, max_yaw_deg=15.0, max_pitch_deg=12.0, max_roll_deg=10.0)`:**
   - Applies a random SO(3) rotation matrix $R(\psi, \theta, \phi)$ to each 3D `(x, y, z)` triplet across `[0:174]` to simulate laptop webcams angled from below or phone cameras held at an angle.
3. **`random_temporal_resample(seq_174: np.ndarray, speed_range=(0.75, 1.30))`:**
   - Linearly interpolates temporal trajectories along axis 0 (for non-zero frames) to simulate fast and slow signers, then re-pads or crops to `T`.
4. **`random_hand_dropout_and_occlusion(seq_174: np.ndarray, frame_drop_prob=0.08, nondom_hand_drop_prob=0.05)`:**
   - Randomly zeros out `1–3` contiguous frames of one hand to simulate MediaPipe motion-blur dropouts on 30 FPS webcams.
5. **`random_scale_and_perspective_jitter(seq_174: np.ndarray, scale_range=(0.85, 1.15), noise_std=0.012)`:**
   - Multiplies hand and pose coordinates by a random isotropic/anisotropic scale factor and adds zero-mean Gaussian landmark jitter.
   - *Note on lighting & skin-tone robustness:* Because our inference pipeline runs on normalized 3D skeletal keypoints extracted by MediaPipe (`hand_landmarker.task` / `holistic`), invariant to background clutter once landmarks are detected, skin-tone and lighting robustness is governed by:
     1. Training across diverse signers (52 signers in ASL Citizen, 119 in WLASL, 147 in ASLFR) whose MediaPipe detections reflect real-world tracking noise across varied skin tones and lighting.
     2. Simulating low-light camera jitter (`noise_std=0.012–0.025`) and tracking dropouts (`frame_drop_prob=0.08`) during landmark training.
     3. Evaluating end-to-end on video clips stratified by lighting and signer diversity in Phase 06.

### Task 3.2: Implement Modular Model Architectures (`ml/models/`)
Create `ml/models/__init__.py`, `ml/models/bigru.py`, `ml/models/conformer.py`, and `ml/models/heads.py`:
1. **Input Stem (`LandmarkStem`):**
   - Accepts `(B, T, F=174)`.
   - Computes on-the-fly first-order temporal velocity $\Delta X_t = X_t - X_{t-1}$ (`174` dims) and bone-vector lengths/angles for the 10 finger tips (`20` dims), concatenating to `F_aug = 368` inside the PyTorch/ONNX graph so the browser only has to pass the `174`-dim frame vector!
   - Applies `MaskedLayerNorm` (ignoring all-zero missing frames) + `Linear(368, d_model=192)` + `Dropout(0.1)`.
2. **`SignConformerV2` Encoder (`ml/models/conformer.py`):**
   - `num_layers = 4`, `d_model = 192`, `num_heads = 4`, `conv_kernel_size = 7`, `ffn_mult = 2`.
   - Each block contains:
     - Half-step Macaron Feed-Forward module (`Linear(192, 384) -> SiLU -> Dropout -> Linear(384, 192)`).
     - Multi-Head Self-Attention with relative positional bias (`max_len=128`).
     - 1D Depthwise-Separable Convolution module (`Pointwise Conv1d -> GLU -> Depthwise Conv1d(k=7, groups=192) -> BatchNorm1d -> SiLU -> Pointwise Conv1d`).
     - Second half-step Feed-Forward module + `LayerNorm`.
3. **Task Heads (`ml/models/heads.py`):**
   - **`IsolatedAttentiveClassifierHead` (Stage C1 & C2):**
     - Attentive temporal pooling over valid (non-zero) frames + **Cosine Margin Linear Classifier** (`scale=24.0`) with a dedicated `_idle` / background class at index `0` and an auxiliary binary `hand_activity_logit` head.
     - Supports **Label Smoothing Cross-Entropy (`smoothing=0.1`)** + **Logit Adjustment / Class-Balanced Focal Loss** (`tau=0.5`) to prevent frequent signs from dominating rare signs in 2,731-class training.
   - **`FingerspellingCTCHead` (Stage B):**
     - `Linear(192, num_chars=40)` (`0: <blank>`, `1..26: A-Z`, `27..36: 0-9`, `37: <space>`, `38: &`, `39: -`) trained with `nn.CTCLoss(blank=0, zero_infinity=True)`.

### Task 3.3: Unified Reproducible Training & Temperature Calibration Script (`ml/train_v2.py`)
Create `ml/train_v2.py` (preserving legacy `ml/train.py` for backward compatibility):
1. **Strict Determinism:**
   - Seeds `random`, `np.random`, `torch.manual_seed`, `torch.cuda.manual_seed_all(seed=42)` and sets `torch.backends.cudnn.deterministic = True`.
2. **Dataset & Sampler (`ml/dataset_v2.py`):**
   - Reads `data/processed/holistic_v2/manifest.parquet` filtered by:
     - `--stage {b_fingerspelling, c1_commercial_250, c2_research_2731}`
     - `--license-filter {commercial_safe, all}` (automatically forces `commercial_safe` when `--stage c1_commercial_250` is selected).
   - Verifies at startup with an `assert` that `set(train.signer_id).isdisjoint(set(val.signer_id))` and `set(train.signer_id).isdisjoint(set(test.signer_id))`.
   - Uses a square-root class-balanced sampler ($p_c \propto N_c^{0.5}$) so rare signs in WLASL/ASL Citizen are sampled sufficiently without overfitting.
3. **Optimization & Mixed Precision:**
   - `AdamW(lr=1.5e-3, weight_decay=1e-2)` with 5-epoch linear warmup + cosine annealing to `1e-5` over `60` epochs (`batch_size=128` on GPU).
   - Automatic Mixed Precision (`torch.amp.autocast('cuda', dtype=torch.float16)`).
   - Exponential Moving Average (`ModelEMA(decay=0.995)`) for evaluation and export.
4. **Post-Training Temperature Scaling (`ml/calibrate.py`):**
   - After training completes, optimizes a single scalar temperature parameter $T_{\text{temp}} > 0$ on the validation split via L-BFGS to minimize Negative Log-Likelihood (NLL) and Expected Calibration Error (ECE).
   - Bakes $1 / T_{\text{temp}}$ directly into the final classifier scale before exporting to ONNX, ensuring that the `0.60` confidence threshold in the browser corresponds to true empirical accuracy.
5. **Experiment Tracking:**
   - Writes structured JSONL metrics (`epoch, train_loss, val_loss, val_top1, val_top5, val_macro_f1, val_ece, lr, wall_time_s`) to `ml/checkpoints/<run_id>/metrics.jsonl` and optional Weights & Biases (`--wandb` flag, off by default for offline environments).

### Task 3.4: Comprehensive Evaluation, Confusion Analysis & Webcam Domain Suite (`ml/evaluate_v2.py`)
Create `ml/evaluate_v2.py` to evaluate trained checkpoints on both the held-out signer-independent test split and webcam-domain recordings:
1. **Isolated Metrics (Stage C1 & C2):**
   - Overall Top-1, Top-5, Macro-averaged Top-1, Macro F1, Expected Calibration Error (ECE), and False Positive Rate on `_idle` / non-signing clips.
   - Stratified breakdown by **1-hand vs. 2-hand signs** (`is_two_handed` flag computed from whether both hand blocks `[0:63]` and `[63:126]` are active in `>30%` of frames).
   - Stratified breakdown by **dataset source** (`gislr`, `asl_citizen`, `wlasl`) and **webcam vs. studio**.
2. **Fingerspelling Metrics (Stage B):**
   - Isolated character Top-1 accuracy (`A–Z`, `0–9`, dynamic `J`/`Z`).
   - Continuous Character Error Rate (`CER`) and Word Error Rate (`WER`) using greedy CTC decoding and prefix beam search (`beam_width=10`).
3. **Automated Confusion Analysis:**
   - Outputs `ml/checkpoints/<run_id>/confusion_report.json` and `confusion_top50_pairs.md` listing the top-50 most confused sign pairs (e.g. minimal pairs that differ only in facial expression, thumb orientation, or small finger motion) so Phase 04's gloss-to-English LLM/rescorer can exploit top-3 candidate confusion priors.

---

## 5. Exact Files and Directories to Create or Modify

| File Path | Action | Description |
|---|---|---|
| `ml/augment.py` | **Create** | Physically valid 3D landmark augmentations (L/R hand & pose slot swapping on mirror, SO(3) camera rotation, temporal resampling, hand dropout). |
| `ml/dataset_v2.py` | **Create** | PyTorch `Dataset` for cached `.npz` shards (Stage B & Stage C) with signer-disjoint assertions and square-root class-balanced sampling. |
| `ml/models/__init__.py` | **Create** | Model registry (`build_model(arch, stage, num_classes)`). |
| `ml/models/bigru.py` | **Create** | Upgraded `SignBiGRUV2` baseline (`LandmarkStem` + multi-scale Conv1d + 2-layer BiGRU). |
| `ml/models/conformer.py` | **Create** | Primary `SignConformerV2` (4-layer Conv1D-Squeezeformer with on-the-fly velocity & bone-vector stem). |
| `ml/models/heads.py` | **Create** | `IsolatedAttentiveClassifierHead` (cosine margin + `_idle` head) and `FingerspellingCTCHead`. |
| `ml/calibrate.py` | **Create** | Validation-split temperature scaling (`T_temp`) and Expected Calibration Error (ECE) computation. |
| `ml/train_v2.py` | **Create** | Reproducible training pipeline with AMP, EMA, signer-independent validation, and JSONL experiment logging. |
| `ml/evaluate_v2.py` | **Create** | Evaluation CLI producing Top-1/Top-5/Macro-F1/CER/ECE, 1-hand vs. 2-hand breakdown, and top-50 confusion pairs report. |
| `ml/tests/test_augment_and_models.py` | **Create** | Unit tests for L/R hand mirror symmetry, forward shapes, masked padding invariance, and ONNX exportability. |

---

## 6. Commands, Tools & Pinned Libraries

### 6.1 Pinned Python Dependencies (`ml/requirements.txt`)
```text
torch==2.4.1
numpy==1.26.4
scipy==1.14.1
scikit-learn==1.5.2
pyarrow==17.0.0
pandas==2.2.3
onnx==1.17.0
onnxruntime==1.19.2
tqdm==4.66.5
pytest==8.3.3
```

### 6.2 Verification & Training Commands
```bash
# 1. Run unit tests for 3D augmentations, model forward passes, and ONNX trace checks (runs on CPU in <15s)
pytest ml/tests/test_augment_and_models.py -v

# 2. Smoke-test training pipeline on a synthetic or 100-sample micro-shard on CPU
python -m ml.train_v2 \
  --manifest data/processed/holistic_v2/manifest.parquet \
  --stage c1_commercial_250 \
  --arch conformer \
  --epochs 2 \
  --batch-size 16 \
  --smoke-test \
  --out-dir ml/checkpoints/smoke_c1

# 3. Full Stage B Training (Dynamic Fingerspelling CTC on ASLFR)
python -m ml.train_v2 \
  --manifest data/processed/aslfr_v2/manifest.parquet \
  --stage b_fingerspelling \
  --arch conformer \
  --epochs 50 \
  --batch-size 128 \
  --lr 1.5e-3 \
  --seed 42 \
  --out-dir ml/checkpoints/stage_b_conformer

# 4. Full Stage C1 Training (250-Sign Commercial Core on GISLR)
python -m ml.train_v2 \
  --manifest data/processed/holistic_v2/manifest.parquet \
  --stage c1_commercial_250 \
  --license-filter commercial_safe \
  --arch conformer \
  --epochs 60 \
  --batch-size 128 \
  --lr 1.5e-3 \
  --seed 42 \
  --out-dir ml/checkpoints/stage_c1_conformer_250

# 5. Full Stage C2 Training (2,731-Sign Research Tier on ASL Citizen + WLASL + GISLR)
python -m ml.train_v2 \
  --manifest data/processed/holistic_v2/manifest.parquet \
  --stage c2_research_2731 \
  --license-filter all \
  --arch conformer \
  --epochs 65 \
  --batch-size 128 \
  --lr 1.2e-3 \
  --seed 42 \
  --out-dir ml/checkpoints/stage_c2_conformer_2731

# 6. Evaluate and generate confusion report
python -m ml.evaluate_v2 \
  --checkpoint ml/checkpoints/stage_c1_conformer_250/best_ema.pt \
  --manifest data/processed/holistic_v2/manifest.parquet \
  --split test
```

---

## 7. Acceptance Criteria

- [ ] **AC-3.1 (Mirror Augmentation Correctness):** `pytest ml/tests/test_augment_and_models.py` verifies that applying `mirror_hands_and_pose()` twice (`p=1.0`) is the exact identity transformation (`np.allclose(x, mirror(mirror(x)), atol=1e-6)`) and that a right-handed sign in `[63:126]` moves into `[0:63]` with negated `x` coordinates after a single mirror.
- [ ] **AC-3.2 (Zero Signer Leakage):** `ml/train_v2.py` logs the exact number of unique signers in `train`, `val`, and `test` and passes the disjointness assertion.
- [ ] **AC-3.3 (Stage B Fingerspelling Accuracy):** On the signer-independent test split, Stage B achieves `>= 88%` Top-1 accuracy on isolated characters (`A–Z`, `0–9`, including dynamic `J` and `Z`) and `<= 15%` Character Error Rate (`CER`) on continuous fingerspelled sequences.
- [ ] **AC-3.4 (Stage C1 250-Sign Commercial Core Accuracy):** On the signer-independent GISLR test split (`4` held-out signers), `SignConformerV2` achieves `>= 82%` Top-1 accuracy, `>= 94%` Top-5 accuracy, and `<= 5%` Expected Calibration Error (`ECE`) after temperature scaling.
- [ ] **AC-3.5 (Stage C2 Large-Vocabulary Research Tier Accuracy):** On the official ASL Citizen test split (`1,000` to `2,731` signs), `SignConformerV2` achieves `>= 72%` Top-1 / `>= 90%` Top-5 on the 1,000-sign subset (`>= 63%` Top-1 / `>= 85%` Top-5 on full 2,731 signs), outperforming the published ASL Citizen I3D video baseline (`63.10%` Top-1) at `<1%` of the compute cost.
- [ ] **AC-3.6 (Two-Hand Sign Lift):** `ml/evaluate_v2.py` confirms that two-handed signs achieve within `3%` Top-1 accuracy of one-handed signs (eliminating the one-hand bottleneck from the repo audit).

---

## 8. Risks, Fallbacks & "If This Fails, Do X"

1. **Risk: Overfitting on Rare Classes in Stage C2 (2,731 classes where some WLASL classes have `<10` clips).**
   - *If this fails:* Initialize the Stage C2 `SignConformerV2` backbone from the converged Stage C1 (GISLR 250-sign) weights (`--init-from ml/checkpoints/stage_c1_conformer_250/best_ema.pt`), freeze the first 2 Conformer blocks for 5 epochs, increase `dropout` from `0.15` to `0.25`, and apply Mixup (`alpha=0.2`) in latent space before the cosine classifier head.
2. **Risk: Only CPU is available in the executing agent's current sandbox.**
   - *If this fails:* Run `--smoke-test` on CPU to verify that `ml/train_v2.py`, `ml/calibrate.py`, and `ml/evaluate_v2.py` execute end-to-end and generate valid checkpoints and ONNX exports. Then generate a ready-to-run Colab/Kaggle notebook (`ml/notebooks/train_stage_b_c.ipynb`) that mounts the `.npz` shards and runs the 2-hour GPU training job.
3. **Risk: High False-Positive Triggers When User Is Resting or Adjusting Glasses (`_idle` class confusion).**
   - *If this fails:* Add synthetic `_idle` clips generated during Phase 02 (random walk of hands near lap, single-frame hand entry/exit, static hand on chin) as `5%` of every training batch, and train the auxiliary `hand_activity_logit` head with binary cross-entropy.

---

## 9. Handoff Note for Executing Agent

> **Handoff Context (Phase 03):**  
> Start by inspecting `ml/train.py` (`lines 34-107`) to see how the existing 1D-CNN + BiGRU (`SignNet`) was written. Do **not** delete `ml/train.py`; create the new modular package under `ml/models/`, `ml/augment.py`, `ml/dataset_v2.py`, `ml/train_v2.py`, `ml/calibrate.py`, and `ml/evaluate_v2.py`. Pay special attention to `mirror_hands_and_pose()` in `ml/augment.py`: the `F=174` feature layout has Left Hand at `[0:63]` and Right Hand at `[63:126]`, so horizontal mirroring **must** swap those two 63-float slices before negating `x`. Write and pass `ml/tests/test_augment_and_models.py` first before running any training jobs. When done, record your validation/test Top-1, Top-5, CER, and calibrated temperature `T_temp` in `docs/subplans/model-v2/DECISIONS.md` and mark Phase 03 complete in `docs/subplans/model-v2/README.md`.
