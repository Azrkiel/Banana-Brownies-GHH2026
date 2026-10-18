# Repository workflow

The repository owner (azrkiel) has authorized committing, fetching/pulling,
merging, and pushing completed work to keep a recoverable history.

- Inspect existing changes before editing; preserve unrelated user work.
- Use the existing checkout. Fetch `origin/main` before integrating/pushing.
- Make small, descriptive commits after appropriate validation. Preserve commits
  when merging remote work; never force-push or rewrite shared history.
- Push completed work to `main` when it integrates cleanly and repository rules
  permit it; use a branch and report the blocker if direct pushes are restricted.
- Use repository-local Git identity `Ansonii21 <299691781+Ansonii21@users.noreply.github.com>`
  unless the owner supplies a different preferred commit identity.
- The owner's aliases include Kevin Jiang, Lianqi Weng, and
  `jiang.kevin28@gmail.com`; `.mailmap` records confirmed commit identities.
  For work performed for azrkiel, use the owner identity above and do not append
  Claude or other AI `Co-authored-by` trailers. Keep AI-tool disclosures in the
  project credits. Preserve other contributors' attribution and existing history.
- Keep credentials, recordings, dependency installations, and generated model/runtime
  assets out of commits. `.env.example` contains names and non-secret defaults only.
- Report validation outcomes and outstanding setup tasks honestly.

See `README.md` for development commands and `docs/setup-checklist.md` for tasks
requiring the user's accounts or real-world participation.

# Project rules — SignLine plan v2 (Claude Code and Codex)

SignLine is a two-person video call: a signer's ASL (a small vocabulary + fingerspelled names) becomes spoken
English; the hearing person's speech becomes captions. Built at Girls Hoo Hack 2026 (deadline Sun Oct 18, 17:00 EDT).

**Start at `plan.md` and follow its agent protocol (§1).** It holds the ledger, the only record of what is done.
Each task is a card in `plan/tasks/<ID>.md` with its intent, exact steps, reference code, and a runnable
"Done when" block. `plan/verify.py` picks the next task (`next`), runs a card's checks (`check <ID>`), and marks a
task done only when they pass (`done <ID>`).

- "Do Task X": do only that card, then report.
- "You are the <lane> lane agent": several agents run in parallel, one per lane (`recog`, `call`, `server`, `ml`).
  Use `--lane <lane>` on every `next`/`wait`, touch only that lane's files, and push after every task
  (`plan.md` §1.5).
- "You are the MANAGER of the <lane> lane" or "you are a subagent of the <lane> manager": follow
  `plan/managers/README.md`. Managers plan, delegate, and verify. Subagents do one phase, write its handoff, and
  check it off with `verify.py tick`.
- "Continue", "keep going", or no task named: loop with `python plan/verify.py next` until it prints
  `NO AGENT TASKS LEFT`. A task that needs a camera, key, GPU, or second laptop becomes `NEEDS-HUMAN`; it is
  not a reason to stop.
- Never say the work is finished unless `verify.py next` prints `NO AGENT TASKS LEFT`. End every session with the
  report format in `plan.md` §1.4.

## Layout
- `web/` Vite + React + TypeScript (browser: MediaPipe, ONNX classifier, LiveKit call, UI)
- `server/` FastAPI (holds every API key; LiveKit tokens, Gemini, ElevenLabs, Tiger Data)
- `ml/` Python: Kaggle GISLR conversion, training, ONNX export (GPU box: the MSI with the RTX 3060)
- `presage/` optional Node sidecar for Presage face analysis (runs on the signer laptop)
- `data/` never committed (Kaggle zip, recordings, features)

## Commands
- web: `cd web && npm run dev` · `npm test` · `npx tsc -b` · `npm run fixtures` (after changing features.ts)
- server: `cd server && .venv/bin/python -m pytest -q` (Windows: `.venv\Scripts\python`) · `uvicorn app.main:app --reload --port 8000`
- ml: `ml/.venv/bin/python -m pytest ml/tests` · `python ml/gislr_to_features.py ...` · `python ml/train.py pretrain|finetune ...`
- plan: `python plan/verify.py next` · `check <ID>` · `done <ID>` · `ledger` · `status`

## Rules
1. Secrets: keys live only in `server/.env` (gitignored) and the Presage key in the sidecar's environment. Never put
   a key in `web/`, in a `VITE_*` variable, in a commit, or in printed output.
2. Shared contracts — change only when the task says so, and tell the team in chat:
   `web/src/lib/types.ts`, `web/src/vocab.json`, `server/app/main.py` routes, `server/sql/schema.sql`,
   and the feature code. `web/src/lib/features.ts` and `ml/features.py` must stay identical in behavior:
   after touching either, run `cd web && npm run fixtures` then `pytest ml/tests/test_parity.py`.
3. TypeScript runs with the Vite template's `erasableSyntaxOnly` and `noUnusedLocals`: no constructor parameter
   properties (`constructor(private x)`), no `enum`, no `namespace`, no unused imports.
4. Stay inside the card's Files list. Small commits; fetch and integrate `origin/main` before every push (see Repository workflow above).
5. A task is done only when `python plan/verify.py done <ID>` passes. Paste its output. Never edit a verify block,
   delete a test, or loosen a check to pass. Live checks (camera, key, two laptops) go in the report as human checks.
6. No new dependencies unless the task lists them.
7. Product rules (they are judged): UI text says "Deaf", "hard of hearing", "signer" — never "mute", "deaf-mute",
   "hearing-impaired". Never claim the app "translates ASL" or "replaces interpreters". Auto-speak only voices
   sentences whose signs were all recognized confidently; anything unsure waits for the signer.
8. Credit: Kaggle GISLR / PopSign data (CC BY 4.0) in the README and Devpost; AI tools used (Claude Code, Codex).
