# Model v2 Architecture Decision Log

Append-only decisions for the phased model-v2 implementation.

## ADR-001 - 2026-10-18 - Phase 1 / Tasks 1.1-1.2: Canonical orientation and float32 boundary

**Context / Problem:** The 174-feature layout existed without automatic handedness canonicalization or a Python twin. Static/single-frame clips have no wrist displacement, tracking gaps can create artificial motion, and floating-point reflection can perturb equal-motion comparisons.

**Decision Made:** Keep the existing layout and resampling mathematics. Compare cumulative image-left/right wrist displacement only across consecutive observations, reset missing-side history, and mirror when right motion exceeds left. Treat absolute motion differences <= 1e-8 as ties and choose orientation from the first off-centre wrist, falling back to hand points when the wrist is centred. Use shoulder centre or x=0.5 without pose. Negate optional headYaw on reflection. Perform Python geometry/interpolation in double precision and convert to NumPy float32 only at output, matching JavaScript numbers and Float32Array.

**Rationale & Verification Evidence:** This preserves the schema while making moving, static, single-frame and centred-wrist examples mirror invariant. Seven deterministic TypeScript-generated cases match Python exactly after float32 conversion (max absolute difference 0.0); the frontend tests cover static ties, mirror invariance, zero filling and tracking gaps. The pinned Python 3.12 NumPy/pytest versions suffice for Phase 1; heavy training dependencies remain uninstalled under the documented CPU-only fallback.

## ADR-002 - 2026-10-18 - Phase 1 / Task 1.3: Per-model delegate fallback and head yaw

**Context / Problem:** GPU initialization can fail independently for hand, pose or face models; pose must still provide a headshake signal with face tracking disabled.

**Decision Made:** Default to GPU and retry each failed model once on CPU with a console warning. Explicit CPU initialization is not retried. Preserve cleanup on unrecoverable initialization failure. Define headYaw as (nose.x - ear midpoint.x) / absolute ear separation, returning undefined for missing, non-finite or collapsed anchors.

**Rationale & Verification Evidence:** Per-model fallback retains any working GPU models and prevents unsupported WebGL from blocking startup. Normalization removes image-scale dependence without changing the feature tensor. Tracker tests verify all three fallback paths, explicit CPU failure, cleanup, two-hand extraction, face cadence and normalized yaw without face inference.

## ADR-003 - 2026-10-18 - Phase 1 / Task 1.4: Preserve word-v1 capture and share overlay rendering

**Context / Problem:** The shipped forest and existing personal examples require mirrored one-hand 30 x 42 features, while live visualization needs both hands and body anchors. Pose assets may be missing in legacy environments.

**Decision Made:** Retain the live capture's CPU delegate, 0.6 hand confidence thresholds and offscreen horizontal flip. Request two hands, filter invalid 21-point arrays, expose both in LiveFrame, and pass orderHands(validHands)[0] to the unchanged wordFrame adapter. Attempt CPU pose loading separately and gracefully disable pose if loading or detection fails; brow remains null in this legacy capture path. The holistic developer tracker continues offering optional face inference. Centralize drawLive and drawLandmarksOverlay in landmarks.ts, ordering and colouring hands in displayed image coordinates. Bench/recorder overlays apply the same horizontal reflection and object-fit cover geometry as their video previews.

**Rationale & Verification Evidence:** This implements the phase's documented hands-only fallback while keeping the forest and saved personal samples compatible. Tests verify unchanged 1,260-value features, optional-pose detection failure, cancellation during pose loading, invalid-hand filtering, 42 skeleton strokes, primary/secondary colours, body-anchor dots and mirrored positions. Full frontend verification passes 250 tests, lint and build. Real camera accuracy and FPS remain human QA items.

## ADR-004 - 2026-10-18 - Phase 2 / Task 2.1: Explicit aliases and conservative lexical identity

**Context / Problem:** GISLR has 250 source labels, including collapsed English phrases. Identical English glosses across datasets do not establish equivalent ASL signs; ASL-LEX is a research-only resource.

**Decision Made:** Store all 250 source labels and reviewed project aliases in label_map.json, normalize commercial aliases deterministically, and retain sense numbers. Namespace unreviewed research classes by source instead of silently collapsing homonyms. ASL-LEX exact EntryID matches are lookup hints only, marked as unverified equivalence; missing IDs remain null. No lexical features or ASL-LEX videos enter commercial training. Research vocabularies require downloaded source label lists; unknown sources/tiers and implicit vocabulary truncation fail closed.

**Rationale & Verification Evidence:** Task 2.1 tests cover all requested aliases, the complete mapping, deterministic indices, class limits and tier exclusion: 10 passed; existing Python parity: 7 passed. Frontend: 250 passed, lint/build passed. Primary lexical metadata: https://github.com/ASL-LEX/asl-lex/blob/master/data-analysis/scripts/data/signdata_updated11-18.csv ; GISLR label metadata provenance is recorded in label_map.json.

## ADR-005 - 2026-10-18 - Phase 2 / Task 2.2: Fail-closed provenance and signer splits

**Context / Problem:** Source layouts vary; some metadata omits signer IDs. Publisher archive SHA256 values are absent from the registry. Large downloads are expressly deferred to the human.

**Decision Made:** Download preflight reads the registry, checks credentials/disk/existing targets, and offers an offline exit code 2. Guide generation is network-free and preserves Phase 1 QA. Stream archive/clip hashes and ZIP CRC checks; decode five files per format; accept separately trusted checksum JSON without inventing publisher hashes. Preserve official splits and reject signer leakage; otherwise hash the prefixed signer deterministically (80/10/10 buckets, approximate proportions). Require explicit clip metadata when source signer identity is absent. Validate registry license identity before filtering manifests and before opening research data in commercial mode.

**Rationale & Verification Evidence:** Synthetic corruption, unsafe archive paths, checksum mismatch, official split leakage, all six research exclusions, spoofed tiers, missing credentials/disk, dead-link logging and guide idempotence pass. Python: 30 tests passed including 7 parity and 10 vocabulary checks. Frontend remained unchanged since its passing 250-test/lint/build run. Installed only the pinned pyarrow 19.0.1 in ignored ml/.venv with the bundled NumPy/pytest/pandas runtime; real Parquet is tested, so the synthetic CSV/NPZ fallback need not substitute for Parquet tests. No datasets downloaded.

## ADR-006 - 2026-10-18 - Phase 2 / Task 2.3: Streaming shards, explicit landmark layouts and resumable extraction

**Context / Problem:** Full datasets exceed sandbox storage; ASLFR uses both long/wide Parquet and reduced coordinate-major NPY with source-dependent point order. Raw-video conversion is interruptible, while isolated and continuous models need different time layouts.

**Decision Made:** Stream fixed GISLR/Recorder shards as `(N,32,174)` little-endian float32; preserve ASLFR/How2Sign time with `(sum_frames,90/180)` arrays and `n+1` little-endian int64 offsets. Use exactly the browser's 48-feature handshape math plus 42 wrist-local normalized frame differences; reset differences after missing hands. Require explicit publisher selected_columns for reduced NPY instead of guessing hand indices from width. How2Sign uses the documented 1662-value pose/face/hand layout, zero-hand detection and six shoulder-normalized vertical face offsets at 70/105/336/300/13/14 relative to face point 1. Isolated features retain the Phase 1 twin unchanged.

**Rationale & Verification Evidence:** 45 Python tests pass with actual Parquet (PyArrow 19.0.1/pandas 2.2.3), including ZIP/folder/parallel byte parity, long/wide/NPY inputs, character offsets, browser/Python letter parity, and first-party sign parity. MediaPipe boundaries are mocked to prove two-hand/pose/optional-face configuration, dimensions, <=30 Hz timestamps and cleanup. Video/How2Sign caches fingerprint raw content, metadata, model assets and conversion schema; corrupt caches recompute, valid resume avoids extraction, changed input invalidates the cache. Manifest-bound conversion rechecks labels, signer identity and SHA256 before feature extraction. Explicit clips.csv overrides incompatible publisher metadata. 259 frontend tests, lint and build pass; standalone synthetic sessions produce 60 sign tensors and 252 letter templates. Full dataset timing/real detector quality remain unmeasured human checks.

**Implementation details:** Share archive access, registry/split/manifest utilities and Python letter math in small dataset helper modules; add a Python Recorder adapter and video/Recorder integration tests beyond the phase's minimum file list to verify every modality. Cache registry/label/path lookup and one indexed ASLFR shard per worker, and stream output instead of retaining corpus tensors in memory. Ignore raw data/runtime assets; do not commit generated synthetic templates or alter the shipped fallback model.


## ADR-007 - 2026-10-18 - Phase 3 / Tasks 3.1-3.2: Preserve the actual feature schema

**Context / Problem:** The Phase 3 blueprint calls 174 features XYZ hands/pose/face with 63-value hand blocks. The actual Phase 1 browser/Python twins and all Phase 2 isolated caches use 84-value body/local XY hand blocks, four anchor offsets and two flags. There is no schema JSON or legacy `ml/train.py` in this checkout. Reinterpreting these caches as XYZ would corrupt every training example.

**Decision Made:** Preserve XY174 and Stage B's variable ASLFR90. Mirror the real two-hand slots and reconcile the first index-tip anchor offsets; retain the one-visible-hand slot convention. Never geometrically transform presence flags. Recompute wrist-local coordinates after scale/camera jitter. Project sampled SO(3) rotations of planar z=0 points back to XY rather than invent discarded depth. Derive ten planar wrist-to-tip lengths/angles for a 368-wide isolated stem (174 positions + 174 velocities + 20 bone features). Use a 180-wide position/velocity stem for ASLFR90. Channel LayerNorm replaces convolution BatchNorm to keep missing/padded frames from altering batch statistics. Relative bias clips distances at 127 while retaining longer sequences. Add a learned empty embedding so all-zero idle clips can train the cosine classifier.

**Rationale & Verification Evidence:** Direct comparison against `frame_features(mirror_frame(frame))` proves one/two-hand mirror geometry at 1e-6 and is stronger than a double-reflection test alone. All architectures/stages pass forward/backward, zero-input and padding-invariance checks. Dynamic ONNX checker/ORT comparisons cover both Conformer and BiGRU at multiple batch/time dimensions. Existing 7 browser/Python parity fixtures remain unchanged and pass.

## ADR-008 - 2026-10-18 - Phase 3 / Tasks 3.3-3.4: Reuse provenance-bound Phase 2 caches and explicit license tiers

**Context / Problem:** The blueprint assumes NPZ-only processed manifests, while Phase 2 actually writes mmap X.f32/meta.json, variable offsets and per-shard local label/character indices. Commercial training must never consume research features or initialize from research weights. CTC labels may contain repeated/unsupported characters.

**Decision Made:** Support native converter directories, Parquet/NPZ rows, and explicit provenance-manifest/cache joins. Check signer identity and all split assignments before filtering; match joined clip/source/signer/split/license/gloss metadata. Recheck registry license identity before accessing any feature file. Always force C1 commercial; other research runs require both --license-tier research and --license-filter all. Keep their outputs in research_only. Remap isolated labels with _idle=0 and text into the fixed 40-token CTC vocabulary; reject unsupported characters and impossible repeated-character alignments. Use p(sample) proportional to 1/sqrt(class_count), label smoothing .1/logit adjustment tau=.5/focal gamma=2, cosine margin .15/scale24 and .1 auxiliary activity loss. Supplement isolated training batches with 5% empty backgrounds; real rest/transition recordings remain mandatory for quality validation. Preserve explicit recording domains and label synthetic data as synthetic.

**Rationale & Verification Evidence:** Tests reject signer leakage, spoofed licenses, inconsistent provenance joins, truncated shards, unknown characters and impossible CTC targets. Commercial filtering succeeds without even opening the absent research feature file. Native mmap/offset and NPZ paths are tested. Evaluation reports supported-class macro metrics, idle FPR, actual-hand presence strata, source/domain breakdowns, empty-stratum nulls and confusion pairs. Prefix-beam repeated-character probabilities agree with exhaustive path enumeration.

## ADR-009 - 2026-10-18 - Phase 3 / Task 3.3: CPU proof, validation calibration and export boundaries

**Context / Problem:** No real corpus/GPU is available. The existing repository requirements/environment differ from the older blueprint dependency table. Calibration on test data or claiming synthetic accuracy would invalidate acceptance evidence.

**Decision Made:** Use full 4-block production Conformer smoke runs on disk-backed synthetic shards (48/12/12 clips, disjoint signer per split), two epochs, CPU threads2, seed42. Production defaults: AdamW lr1.5e-3/weight_decay.01, batch128/60epochs, five-epoch linear warmup then cosine to1e-5, EMA.995, CUDA-only AMP and deterministic PyTorch. Select EMA checkpoint by validation loss, fit positive bounded scalar temperature via validation NLL (sequence CTC NLL for fingerspelling), bake inverse temperature once into head scale, and keep a no-worse-NLL fallback. Export development opset17 ONNX using the tested legacy exporter with explicit dynamic axes; compare actual ORT CPU outputs at multiple dimensions. Checkpoints/ONNX remain ignored; no browser bundle is promoted. The explicit evaluation wrapper is kept in eval mode across export to prevent export's training-state restoration from re-enabling dropout during parity comparisons. Optional W&B is opt-in and requires its optional package.

**Rationale & Verification Evidence:** 31 new tests / 76 total ML tests and 259 frontend tests pass; frontend lint/build pass. PyTorch 2.14.1+cpu, ONNX1.23.2, ORT1.31.0 satisfy current repository bounds and are recorded in the handoff; no requirement pins were changed. Both CPU training/calibration/evaluation/export runs succeed. Exact synthetic metrics, temperatures, export errors/sizes and runnable real-data GPU commands are recorded in the Phase 3 Handoff Note. Raw exports total about18.6MB and are explicitly not shipping/quantized artifacts. Real character/C1/C2 accuracy, idle rejection, two-hand lift, webcam quality and browser latency remain unverified human/GPU acceptance. The user's file scope is honored by placing GPU instructions in the handoff instead of creating the fallback notebook or later-phase export/integration files.


## ADR-010 - 2026-10-18 - Phase 4 / Task 4.1: Continuous gates alongside the recorder contract

**Context / Problem:** The blueprint assumes a missing segmenter and face-containing feature vector. The checkout already has a Frame-based recorder Segmenter with 11 regression tests; XY174 actually contains two 84-value hand slots, four index-tip anchor offsets and two presence flags. Stage B requires ASLFR90, not XY174.

**Decision Made:** Preserve the recorder Segmenter API and add KinematicSegmenter for REST/ONSET/STROKE_HOLD/TRANSITION decoding. In shoulder units, use wrist/five-tip squared motion energy idle=0.0003, transition=0.04; signing-space wrist y<=0.65; 12 idle frames, 3 settling frames, minimum 8 frames for a hold, or a maximum 32-frame active window. Require three aligned wrist deltas (cosine>0.8) on either hand for ballistic gating; remove those frames from classifier clips. The spelling router checks 20 frames, wrist displacement<0.08, local fingertip/wrist variance ratio>4.5, one hand near the upper body, and routes 64-128 ASLFR90 frames. Explicit inference adapters keep model loading/resampling outside this phase. Serialize boundary inference, invalidate on explicit reset, and revise rolling CTC name prefixes in one FS slot. Spelling text without calibrated probabilities receives score=0 for signer review.

**Rationale & Verification Evidence:** Nine new tests plus all 11 recorder tests pass. An adversarial four-sign fixture using the old stride=3, stability=2, cooldown=900ms produces 2 false transitional emissions versus 0 with the kinematic gate (100% reduction). All four holds are emitted at 462/1023/1584/2145ms with 11-frame (~363ms) settling periods; intervals are 561ms, below the old lockout. A local 10,000-frame microbenchmark averages 0.03758ms/step; this is not simultaneous webcam/WebRTC latency. Full frontend: 295 tests, lint/build pass. Legacy forest/personal signs and call wiring remain unchanged; browser model integration is Phase 5.


## ADR-011 - 2026-10-18 - Phase 4 / Task 4.2: Explicit facial inputs and rest-only calibration

**Context / Problem:** XY174 has no eight-face-point block. The actual tracker exposes brow raise/furrow blendshapes plus optional pose headYaw. Geometry-derived facial ratios and blendshape probabilities have different units, and missing/unstable face points must not fabricate questions.

**Decision Made:** NMMDetector accepts the existing tracker signals or an explicit ordered eight-XYZ-point face input. Use 3D Euclidean brow/eye distances normalized by interocular distance; this is invariant to uniform scale and rigid pitch/roll, not arbitrary nonrigid perspective changes. Furrow combines brow-to-nose distances and inter-brow contraction. Use a five-second time-based neutral EMA updated only at REST, >=30 neutral observations, a standard-deviation floor of 0.02, and ten consecutive elevated/furrowed frames at +2/-1.8 standard deviations. Reject low visibility/nonfinite points, collapsed eyes and raw interocular standard deviation>=0.015. Source switches recalibrate; >250ms gaps clear expression histories. Headshake uses 24 yaw observations, a +/-0.03 dead band, at least two crossings and peak-to-peak amplitude>0.12. Lexical WH punctuation remains available with no face signal.

**Rationale & Verification Evidence:** Six frontend NMM cases and ten Python parametrizations cover all markers, neutral scale 0.7/1.0/1.4, rigid pitch +/-0.4 radians, occlusion and tracker signals. A direct comparison over 1,566 identical generated frames matches tags exactly; maximum ratio difference is 1.1102230246251565e-16. Full ML suite including original parity: 99 passed after all Phase 4 additions. Face points are not inferred from hand features; no tracker or feature schema change is required. Live glasses/bangs/camera QA remains human work.


## ADR-012 - 2026-10-18 - Phase 4 / Task 4.3: Preserve confidence-rich API requests and bound upstream time

**Context / Problem:** The actual /api/gloss contract is signs/tags/context -> english/sentence_type/confidence/uncertain, rather than the blueprint's glosses-only description. Existing callers rely on probability and uncertainty fields. Network outages must produce readable captions without increasing recognition confidence.

**Decision Made:** Keep all existing response fields and signs rendering. Add optional glosses (<=30), lattice (<=30 slots, 1-3 candidates, finite scores in [0,1]), NMM/FS tags and bounded previous-English context. Lattice takes precedence, then signs, then flat glosses when callers supply more than one representation. Offline rules choose the highest-scoring candidate per slot, combine request/slot/inline markers and conservatively retain unknown content with confidence<=0.45. Shared Python/browser rules cover pronouns, copulas, articles, names, tense/time topics, lexical WH signs and NEG/questions. Missing keys, upstream exceptions, malformed JSON and the actual cancellable 1.5s generation deadline use rules; the route's existing 2.5s emergency error guard remains compatible with the original failure test. The LLM sees all scored slot alternatives, per-slot/global markers and context, with explicit no-added-content instructions. Translation confidence cannot exceed the minimum top recognizer score; uncertain spelling remains review-only.

**Rationale & Verification Evidence:** All 51 backend tests pass, including existing tests unchanged; 20 shared grammar fixtures produce exactly the same browser/Python strings (21 frontend grammar tests). Actual local TestClient POST /api/gloss offline timings after 10 warmups over 100 requests: median1.31535ms, p95 1.75940ms, below the 5ms offline target. This is local CPU evidence, not deployed network latency. The DEER/THIRSTY lattice selection is tested with a mocked response and cannot certify the live model's semantics or <250ms service time. No API key was used for live generation. Frontend full suite, lint/build remain passing; no dependencies or shipped call behavior were changed.


## ADR-013 - 2026-10-18 - Phase 4 / Task 4.4: Signer-bound streams and explicit real gloss annotations

**Context / Problem:** Phase 2 isolated caches are XY174, while How2Sign preserves variable time and appends six facial summaries (180 features). Its canonical labels can be normalized English sentences, which are not ASL gloss sequences. There is no real corpus/GPU accuracy evidence in this checkout.

**Decision Made:** Reuse the full four-block, 192-wide Phase 3 Conformer encoder with a vocabulary-level CTC head (blank=0). Stitch 2-5 non-idle isolated clips sampled with replacement from one signer within one split; validation/test use 3-5 signs and independent deterministic seeds. Allocate all signs/transitions within 128 frames, using 4-8 interior cubic-Hermite samples with endpoint velocity tangents and Gaussian sigma0.002 trajectory noise tapered to zero at endpoints. Repair wrist-local geometry and binary hand presence after interpolation; preserve missing-hand zeros. Train with AdamW lr0.0015/decay0.01, warmup/cosine, gradient clip5, deterministic seed42 and validation-selected EMA0.995; fail on impossible/nonfinite CTC alignments. Keep greedy and beam10 gloss edit-distance WER separate from character metrics. The six-line evaluate_v2 dispatch is necessary for the phase's required --mode continuous command and preserves all earlier modes.

**Rationale & Verification Evidence:** Thirteen continuous tests verify deterministic same-signer sampling, temporal/visibility geometry, Hermite constant-velocity interpolation, production-model gradients/padding, repeated glosses, WER edit accounting, real-cache loading, signer leakage, spoofed licenses, annotation joins, commercial/research initialization and CPU train/save/reload. All 99 ML +51 backend tests pass together (150); all 295 frontend tests, lint/build and repository preflight pass. Research inputs require explicit --license-tier research, write under research_only, set non_commercial=true and cannot initialize commercial weights. How2Sign drops only the six appended summaries and requires reviewed per-clip gloss lists with matching clip/signer/split identities; it never splits English sentence labels into pretend gloss targets.

**Smoke metrics / limits:** Two-epoch CPU run, full production architecture, 12 streams per split, synthetic clips with independent train/val/test signers. Validation has43 reference glosses: greedy229 errors/43=5.32558139535 WER, beam424/43=9.86046511628. Test has49 reference glosses: greedy273/49=5.57142857143, beam462/49=9.42857142857. Insertions permit WER>100%; these intentionally tiny smoke weights are unsuitable for inference and fail AC-4.4. Losses are finite (train32.89553 ->17.89782; validation25.78179 ->25.40484); independent evaluator reload exactly reproduces test metrics. All tensors/checkpoints stay ignored. Real-data <=28% commercial / <=35% How2Sign WER, live NMM quality and Gemini latency remain human acceptance work; do not promote this model or enter Phase 5.

## ADR-014 - 2026-10-18 - Phase 5 / Task 5.1: Inline export, calibrated heads and smoke boundaries

**Context / Problem:** The blueprint refers to an exporter absent from this checkout. Existing Phase 3 checkpoints have four 192-wide blocks; Stage B consumes ASLFR90 and C1 consumes XY174. Temperature is already baked into the trained heads. UINT8 Stage B changes probabilities beyond the required 1e-3 tolerance.

**Decision Made:** Add the v2 exporter and compatibility entry point with inline initializers, opset17, logits/normalized embedding/activity outputs, SHA256 manifest and staged publication after validation. Compare 100 deterministic clips per model against the original training forward pass, including idle/tracking gaps and Stage B times64/96/128. Preserve all CTC time positions even for zero observations. FP16 stores weights at half precision with float32 casts/computation; activation FP16 was insufficiently accurate. C1 embeddings stay192; a narrower Stage B Mini embedding is normalized and zero-padded to192, never used for personal calibration. Runtime temperature is1 because calibration is baked.

**Rationale & Verification Evidence:** Four new exporter tests pass, including a two-block128-wide Stage B fixture within the strict2MB budget. Existing full smoke checkpoints export as single files4,791,566 /4,714,618 bytes, with probability errors3.844499588012695e-6 /0.0007962286472320557 across100 clips each. No tolerance was loosened. These full smoke files exceed the strict4MB/2MB shipping targets; the exporter allows their broader<5MB smoke proof only outside public/, marks the manifest deployable=false, and still enforces strict shipping budgets for production. No checkpoint/model/runtime artifact is committed.

## ADR-015 - 2026-10-18 - Phase 5 / Task 5.2: Worker ownership and verified cache

**Context / Problem:** There is no classifier.ts in the current checkout. Main-thread inference would compete with the call, and non-isolated pages cannot safely enable WASM threads2.

**Decision Made:** Create a bounded Classifier RPC client and dedicated WASM worker. Verify same-site manifest filenames, schema, label mapping, model size and SHA256 on every cached or downloaded buffer. IndexedDB is optional; blocked/quota/private-browser failures use verified downloads. Abort, timeout and worker errors terminate the worker and reject pending requests. Use threads1 without cross-origin isolation; otherwise min(2, hardwareConcurrency), SIMD on and local matching runtime files. Add opt-in interleaved pose/face scheduling and benchmark worker telemetry while preserving the original tracker defaults and legacy overlay colors.

**Rationale & Verification Evidence:** Actual Chromium executes both final ONNX files in a built worker with no browser errors;10 assertions cover smoke rejection, non-isolated initialization, C1/B inference, main-thread responsiveness, cache reuse, corrupt-cache replacement and bad input rejection. Warmed C1 p50/p95 about9/10.5ms locally; this is not webcam/WebRTC performance. Existing tracker regressions remain intact plus an explicit every-frame hands / alternating pose-face test.

## ADR-016 - 2026-10-18 - Phase 5 / Task 5.3: Extend actual immutable private rows

**Context / Problem:** Production uses personal_sign_samples.features real[], not the hypothetical personal_signs.vec byte column. Embeddings from different model weights cannot be compared safely.

**Decision Made:** CLI-generated migration20261018162231_personal_signs_v2.sql extends the real table in place. Match word-v1/holistic-v2/holistic_v2_emb192 to1260/5568/192 floats and their frame ranges; bound finite elements and embedding norm. Tie embeddings to the C1 SHA256. Preserve immutable rows, owner RLS, grants, deletion and serialized500-sample quota. Cosine prototypes require at least three compatible examples, similarity>=.78 and runner-up margin>=.05. Raw holistic and v1 use their own compatible coordinate models; schemas and model hashes never mix.

**Rationale & Verification Evidence:** Real PGlite/Postgres migration tests retain a pre-existing v1 row and verify v2 inserts, shape/norm rejection, owner isolation, immutable rows, anonymous denial and quota. Existing v1 tests pass unchanged. Cloud save/load supports explicit versions; training captures embeddings when verified ONNX is available, otherwise raw holistic or the preserved legacy capture. Remote migration remains a human release prerequisite.

## ADR-017 - 2026-10-18 - Phase 5 / Task 5.4: Reviewable Stage D1 integration and owned corrections

**Context / Problem:** Latest main adds taught-letter behavior that must survive fallback. The live continuous CTC smoke checkpoint is unsuitable for recognition. Existing speech drafts already use caption-clear with revisions.

**Decision Made:** Prefer verified local C1/B workers with the Phase 4 kinematic segmenter/NMM detector, explicit Auto/Isolated/Fingerspell modes, ASLFR90 adapter, top-three correction pills, live gloss controls and sentence review. Keep the complete forest/personal/taught-letter UI as automatic failure fallback. Pause inference during sentence review; spelling has no calibrated recognition confidence and stays text-only. Confidence<.8 never starts v2 TTS. Add clear/captionId without changing speech caption-clear. Sender-scoped terminal tombstones handle correction-before-caption and retries; local retraction cancels active/queued speech and protects an in-flight caption send. No landmark telemetry is added.

**Rationale & Verification Evidence:**316 frontend tests pass, including worker abort, incompatible personal schemas, corrected controls and owned/reordered retraction. Build/lint pass. Non-isolated real worker verification passes. Two existing browser harnesses fail identically on unchanged68eea84: check-personal-signs waits for an enabled Capture before filling the required sign label (line115); check-camera-startup supplies an incomplete landmarks module mock (line62 timeout). Those checks were not modified or weakened. Actual two-person call, NMM visibility, FPS and network/TTS latency still require live verification.

## ADR-018 - 2026-10-18 - Phase 5 / Task 5.5: Disabled-by-default, bounded CPU assistance

**Context / Problem:** The512MB server must not load PyTorch/video inference. The old blueprint pins conflict with the installed Python3.12/NumPy2/ORT environment.

**Decision Made:** Pin verified numpy2.3.5/onnxruntime1.31.0 consistently with the ML environment, import lazily, and default INFER_ENABLED=0. Only explicit consent plus exact11,136-byte little-endian float16 XY174 windows are accepted; reject images/JSON, extra bytes, nonfinite/out-of-range values and invalid presence. Check browser/server model hashes. Serialize requests with a bounded busy response, one CPU thread, disabled arenas/patterns and basic graph optimization. Browser assistance requires consent plus observed local latency>120ms; server failure returns to local inference. No request payload is stored.

**Rationale & Verification Evidence:**10 endpoint tests pass. A separate real uvicorn subprocess handles110 synthetic requests using an isolated temporary test manifest:99.7MB baseline /144.9MB active RSS for the complete Windows process tree, compute p50~4.0ms/p95~5.0ms. Test-only manifests never enter public/ or dist/. The production loader rejects smoke manifests; real Linux/Fly memory and live network behavior remain release checks.

## ADR-019 - 2026-10-18 - Phase 5 integration: Preserve main changes on the testing branch

**Context / Problem:** The user changed the requested destination from main to a new testing branch. Before pushing, origin/main advanced from68eea84 tofd7ee05 with trained-word source controls, sentence shortcuts and homepage spacing.

**Decision Made:** Keep all Phase5 work on phase-05-browser-onnx. Merge origin/main without rewriting history; preserve the new known/trained-word controls, partial-example helper, Start over/Escape and double-Enter behavior alongside Phase5 Backspace retraction and v2 styles. Merge commit0c2e673 follows documentation commitf6a32d3.

**Rationale & Verification Evidence:** Post-merge frontend tests316/316 pass, including the new main test; build and lint pass. Final backend/ML164/164 pass before this frontend-only merge. No main push, deployment, remote migration or Phase6 work was performed.

## ADR-020 — 2026-10-18 — Real Kaggle data and bounded CPU production-format exports

The token and accepted Kaggle rules enabled authenticated acquisition. Preflight found approximately
632 GiB free on C:, PyTorch 2.14.1+cpu, no CUDA GPU, and Kaggle 2.2.4 installed into ml/.venv.
The clean checkout was actually phase-05-browser-onnx at 0464dd8; local main was fast-forwarded
through origin/main and that Phase 5 history before training-code commit fdde375.
Full archives were downloaded alongside deterministic original-ZIP range subsets. Selected members
passed original CRC checks, then verify.py recorded observed SHA256 and validated provenance/splits.
No trusted publisher SHA256 was available; observed hashes are integrity records, not authenticity guarantees.

## Real-data CPU baseline — October 18, 2026

Training code: `fdde3755e11a77cfa424b17eb5db7b78f9a48d5c` (started from `0464dd8`); Phase 6 has not started.
The browser bundle in `web/public/models/manifest.json` now has `deployable=true`,
250 real GISLR sign labels plus `_idle`, calibrated C1/B heads, and single-file FP16 weights.

| Held-out result | Measured value |
|---|---:|
| C1 Top-1 / Top-5, including no-hand background | 35.55% / 61.45% |
| C1 sign-only Top-1 / Top-5 | 29.10% / 57.60% |
| C1 macro F1 / ECE | 26.48% / 0.050577 |
| C1 idle false positives (tracking absence only) | 0.00% |
| C1 / B validation temperature | 1.51282299 / 1.09210696 |
| B greedy CER / WER | 45.23% / 95.93% |
| B beam-10 CER / WER | 43.88% / 94.31% |
| D2 stitched greedy / beam-10 gloss WER | 100.00% / 100.00% |

This is a bounded CPU run: GISLR uses 32/4/4 clips per sign in train/val/test,
plus 100 no-hand background windows in each split. All 250 labels occur in each split.
GISLR has 16/4/1 signers; ASLFR has 73/9/10 signers, with zero pairwise overlap within each dataset.
ASLFR has 1,528/77/77 eligible phrases after 78 impossible original CTC alignments were rejected;
phrases retain their text, use the existing supported alphabet, and raw frames are capped at 128
before velocities are computed. Ampersand has no training support. No individual GISLR Parquet files were extracted.
Data attribution: Google Research, Georgia Tech and DPAN GISLR/PopSign;
Google Research and collaborators ASLFR/FSboard (CC BY 4.0 per the reviewed dataset registry),
using the darraghdog NPY preprocessing mirror. Original sources:
[GISLR](https://www.kaggle.com/competitions/asl-signs/data),
[ASLFR](https://www.kaggle.com/competitions/asl-fingerspelling/data).

C1: 2 Conformer blocks of width 192, 40 epochs, batch 64, AdamW learning rate 0.0015.
B: 2 blocks of width 128, 60 epochs, batch 32, learning rate 0.002. Both use seed 42, EMA 0.95,
four CPU threads, validation-selected checkpoints and validation-only scalar calibration baked once
(runtime temperature 1). D2: 2 blocks of width 192 initialized from real C1, 8 epochs of 512
same-signer stitched streams, 12 independent validation/test streams, batch 16, two CPU threads.
D2 is experimental and fails the 28% WER acceptance target.

Export sizes: C1 2,580,338 bytes; B 1,162,437 bytes;
D2 2,580,768 bytes. Each is inline, below 5 MB, with no `.onnx.data` sidecar.
C1/B also satisfy the existing 4 MB/2 MB production limits. The real Stage B FP16 export initially failed parity at 0.0014935; preserving its output/normalization parameters in FP32 reduced the error to below 0.001 without relaxing that threshold. Export checks compare 100 clips per model
at probability error below 0.001. The real lab at http://127.0.0.1:8765 exposes every trained sign.

Accuracy acceptance remains unmet: C1 sign-only Top-1/Top-5 is below the 82%/94%
target, and this deterministic split has one test signer rather than the planned four.
Stage B CER is above 15%; isolated-character/J/Z accuracy has no held-out examples here.

`deployable` records exporter provenance/format eligibility. These subset metrics do not establish
physical-webcam accuracy or visible-hand rest rejection; first-party rest/transition recordings,
natural continuous signing and target-laptop/two-person QA remain outstanding.
Complete configs, checkpoint hashes, independent evaluations, confusion reports and acquisition/split evidence:
[real-v1 reports](reports/real-v1/training-report.json).

Automated validation: 169 ML/server tests and 316 frontend tests pass; the final web
production build passes. Chromium verifies all three real models, 251 C1 labels,
192-dimensional embeddings and no page errors using generated inputs with the camera off.
