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
