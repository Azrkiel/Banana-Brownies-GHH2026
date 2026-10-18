# Autonomous Agent Execution Guide (`AGENT_GUIDE.md`)

**Target Audience:** Google Antigravity, OpenAI Codex, Claude Code, and any other autonomous AI coding agent executing `docs/subplans/model-v2/`.  
**Golden Rule:** You are executing a production-grade upgrade on an active web and ML codebase (`Banana-Brownies-GHH2026`). Every session must leave the repository in a clean, building, test-passing, and demoable state.

---

## 1. Core Operating Rules

1. **Work Strictly One Phase (and One Task) at a Time:**
   - Start by reading [`docs/subplans/model-v2/README.md`](README.md) to check the **Phase Index & Status Checklist** and [docs/subplans/model-v2/DECISIONS.md](https://www.google.com/search?q=DECISIONS.md) (create `DECISIONS.md` on your first task if it does not exist yet).
   - Open the first phase file (`phase-01-...md` through `phase-06-...md`) that has unfinished tasks (`- [ ]`).
   - Read the phase's **Handoff Note** at the bottom of the previous phase file (if applicable) and the current phase's **Prerequisites**, **Concrete Tasks**, and **Acceptance Criteria** before modifying any file.
   - Complete **one ordered task at a time**. Do not jump ahead to later phases before all acceptance checks for the current phase pass.

2. **Run All Verification Tests Before Marking Any Task Done:**
   - Every task specifies exact verification commands. Before marking a task `[x]`, you **must** run:
     - Frontend type-check & build: `npm --prefix web run build`
     - Frontend linter: `npm --prefix web run lint`
     - Frontend unit tests: `npm --prefix web test`
     - Backend unit tests (if `server/` was touched or if `server/.venv` exists): `(cd server && .venv/bin/python -m pytest -q)`
     - ML unit & parity tests (if `ml/` was touched): `ml/.venv/bin/python -m pytest -q ml/tests`
   - **Never weaken, delete, skip (`it.skip` / `@pytest.mark.skip`), or loosen tolerances on any existing or new test** to make a check pass. If a test fails, fix the underlying implementation.

3. **Update the Checklist and Handoff Notes Continuously:**
   - Whenever you complete a task, update its checkbox from `- [ ]` to `- [x]` inside the `phase-0X-*.md` file.
   - When all tasks in a phase pass their acceptance criteria, update the phase status in [`docs/subplans/model-v2/README.md`](README.md) and append a concise session summary to the phase's **Handoff Note** section recording:
     - Commit hash(es) created
     - Exact test counts and metrics achieved
     - Any human actions still pending (e.g., full 40 GB dataset run or physical two-laptop webcam check)

4. **Record Every Non-Trivial Architectural or Implementation Decision in `DECISIONS.md`:**
   - Maintain `docs/subplans/model-v2/DECISIONS.md` as an append-only Architecture Decision Log (ADR format).
   - Whenever you choose a hyperparameter, resolve a library version conflict, adjust a tensor layout, or trigger a fallback specified in a phase's "If this fails, do X" section, append an entry with:
     - **Date & Phase/Task ID**
     - **Context / Problem**
     - **Decision Made**
     - **Rationale & Verification Evidence**

---

## 2. Data Safety, Privacy, and Git Hygiene

1. **Never Delete User Data or Existing Functionality:**
   - Do not drop or truncate existing tables (`public.personal_sign_samples`, `sign_events`, `utterance_events`) without a backward-compatible migration path.
   - Preserve the existing 7-word Random Forest (`web/public/trained-words.json`) and personal signs flow (`#/training`) as a fallback until the v2 ONNX models are verified in Phase 5.
   - Never overwrite or delete local user recordings in `data/raw/` or `data/legacy/`.

2. **Never Commit Raw Datasets, Video Clips, Large Checkpoints, or Secrets to Git:**
   - Raw datasets (`data/raw/`, `data/gislr*/`, `data/aslfr*/`, `data/asl_citizen*/`, `data/how2sign*/`, `*.zip`, `*.tgz`, `*.parquet`, `*.mp4`, `*.npy`, `*.f32` over 5 MB) and intermediate PyTorch checkpoints (`ml/out/*.pt`, `ml/out/*.npz`) **must remain gitignored**.
   - Only quantized, browser-ready model bundles under `web/public/models/` (`sign_v2.onnx`, `fingerspell_v2.onnx`, `*_meta.json`, `knn.*`, `letters.*`) that meet the size budget (`<= 10 MB` total) and small synthetic test fixtures (`ml/tests/fixtures/parity.json`) may be committed to git.
   - Before every `git commit`, run `git status` and `git diff --stat` to verify that no `.env`, API key, or file `> 10 MB` is staged.

3. **Git Identity and Commit Discipline (`AGENTS.md` Compliance):**
   - Use repository-local Git identity `Ansonii21 <299691781+Ansonii21@users.noreply.github.com>` unless instructed otherwise by the repo owner.
   - Do not append AI `Co-authored-by` trailers to commit messages; keep AI tool attribution in project documentation (`README.md` / `docs/MODEL_CARD.md`).
   - Make small, atomic commits after each verified task using clear commit messages (e.g., `phase-01: unify two-hand tracker and add canonicalize parity`).

---

## 3. Dataset Licensing & Legal Guardrails

Respecting dataset licenses is a hard legal and ethical requirement. Executing agents must enforce the two-tier licensing separation defined in [`DATASETS.md`](DATASETS.md) and [datasets.json](https://www.google.com/search?q=datasets.json):

| License Tier | Permitted Datasets | Allowed Usage | Output Model Artifact Path |
| :--- | :--- | :--- | :--- |
| **`commercial` (Default Ship Tier)** | • **Kaggle GISLR / PopSign v1.0 & v2.1** (`CC BY 4.0`)<br>• **Kaggle ASLFR / FSboard** (`CC BY 4.0`)<br>• **First-Party Consented Landmarks** (`MIT / Project Owned`) | Safe for public deployment, commercial hosting, and open-source redistribution with attribution in `README.md` and `docs/ATTRIBUTIONS.md`. | `web/public/models/sign_v2.onnx`<br>`web/public/models/fingerspell_v2.onnx` |
| **`research` (Non-Commercial Opt-In Tier)** | All `commercial` datasets PLUS:<br>• **ASL Citizen v1.0** (`Microsoft Research Data License — Research Only`)<br>• **How2Sign / How2Sign Holistic** (`CC BY-NC 4.0`)<br>• **WLASL / MS-ASL** (`C-UDA-1.0`)<br>• **DailyMoth-70h** (`CC BY-NC 4.0`)<br>• **OpenASL** (`CC BY-NC-ND 4.0` — evaluation/research only)<br>• **ASL-LEX 2.0** (`CC BY-NC 4.0` — lexical ID mapping) | Strictly academic, non-commercial research and benchmarking only. **Never ship `research`-tier model weights as the default bundle in a commercial deployment.** | `ml/out/research_only/sign_v2_research_2731.onnx` |

- Every preprocessing and training script in `ml/` must accept `--license-tier commercial` (default) or `--license-tier research` and filter `data/manifests/clip_manifest.parquet` accordingly before training.
- Never scrape or download videos from sign language dictionaries that prohibit automated scraping or redistribution (e.g., Handspeak, Lifeprint/ASLU, Signing Savvy).

---

## 4. Technical Contracts & Code Standards

1. **Feature Extraction Twin Contract (`web/src/lib/features.ts` ↔ `ml/features.py`):**
   - `web/src/lib/features.ts` and `ml/features.py` must compute identical `Float32Array` / `np.float32` tensors (`max |diff| < 1e-4`) across all 7 test cases in `ml/tests/fixtures/parity.json`.
   - Whenever you modify either file, you **must** immediately run:
     ```bash
     (cd web && npm run fixtures)
     ml/.venv/bin/python -m pytest -q ml/tests/test_parity.py
     ```
   - Never commit a change to `features.ts` or `features.py` if `test_parity.py` fails or if `ml/tests/fixtures/parity.json` has uncommitted diffs.

2. **TypeScript Compiler Constraints (`web/tsconfig.app.json`):**
   - The frontend uses TypeScript `~6.0.2` with `erasableSyntaxOnly: true` and `noUnusedLocals: true` plus `oxlint`.
   - **Prohibited syntax:** `enum`, `namespace`, parameter properties (`constructor(private x: number)`), and unused imports/variables. Use union types (`type Mode = 'sign' | 'letter'`) and explicit class field declarations instead.

3. **Product & Accessibility Terminology Rules (`AGENTS.md` Rule 7):**
   - In all UI copy, comments, and documentation, use **"Deaf"**, **"deaf"**, **"hard of hearing"**, and **"signer"**.
   - **Never** use outdated or offensive terms such as `"mute"`, `"deaf-mute"`, or `"hearing-impaired"`.
   - **Never** claim in UI copy or documentation that the model "translates unrestricted ASL" or "replaces human sign language interpreters".

---

## 5. Protocol When Blocked or When Human Action Is Required

Autonomous coding agents often execute in cloud containers or sandboxes with **no webcam, no GPU, no external internet access, or limited disk space**. Follow this exact protocol so you never stall or hallucinate results:

1. **Always Implement and Verify Using Synthetic Fixtures First:**
   - Every ML and data task in Phases 1–5 includes a deterministic synthetic-data test (e.g., `ml/tests/test_gislr_convert.py`, `ml/tests/test_train_smoke.py`, `web/scripts/fake-sessions.ts`, and mocked MediaPipe/LiveKit Vitest suites).
   - If the real 40 GB dataset or GPU is absent in your environment, **do not stop**. Write the complete production code, run the synthetic smoke tests on CPU to prove end-to-end correctness (including ONNX export and browser loader compatibility), and mark the code task `[x]` once all automated tests pass.

2. **Log Human-Required Actions in `docs/subplans/model-v2/NEEDS_HUMAN_ACTION.md`:**
   - When a step requires a human to:
     - Download a gated dataset (e.g., accepting Kaggle competition rules and placing `asl-signs.zip` in `data/raw/gislr/`),
     - Run a multi-hour GPU training job on the MSI RTX 3060 machine,
     - Supply live API credentials in `server/.env` (LiveKit, Gemini, ElevenLabs, Supabase), or
     - Perform a live two-person webcam call test,
   - Create or update `docs/subplans/model-v2/NEEDS_HUMAN_ACTION.md` with:
     - **Task ID & Phase**
     - **Exact Prerequisite Missing in Sandbox**
     - **Copy-Pasteable Commands for the Human**
     - **Exact Target File Path & Expected SHA256 / Output**
     - **Command to Resume Agent Verification Afterwards**

3. **If a Technical Blocker Occurs (e.g., Library Incompatibility or Failing Check):**
   - Execute the phase's documented **"If this fails, do X"** fallback first.
   - Record the fallback in `docs/subplans/model-v2/DECISIONS.md`.
   - If the blocker still cannot be resolved without violating a contract or weakening a test, leave the task checkbox as `- [ ]` (or mark `- [!] BLOCKED`), document the exact error output in the phase's **Handoff Note**, and stop cleanly without committing broken code.
