# Repository workflow

The repository owner (azrkiel) has authorized committing, fetching/pulling,
merging, and pushing completed work to keep a recoverable history.

- Inspect existing changes before editing; preserve unrelated user work.
- Use the existing checkout. Fetch `origin/main` before integrating/pushing.
- Make small, descriptive commits after appropriate validation. Preserve commits
  when merging remote work; never force-push or rewrite shared history.
- Push completed work to `main` when it integrates cleanly and repository rules
  permit it; use a branch and report the blocker if direct pushes are restricted.
- Use repository-local Git identity `azrkiel <azrkiel@users.noreply.github.com>`
  unless the owner supplies a different preferred commit identity.
- Keep credentials, recordings, dependency installations, and generated model/runtime
  assets out of commits. `.env.example` contains names and non-secret defaults only.
- Report validation outcomes and outstanding setup tasks honestly.

See `README.md` for development commands and `docs/setup-checklist.md` for tasks
requiring the user's accounts or real-world participation.

# Project rules — SignLine plan v2 (Claude Code and Codex)

SignLine is a two-person video call: a signer's ASL (a small vocabulary + fingerspelled names) becomes spoken
English; the hearing person's speech becomes captions. Built at Girls Hoo Hack 2026 (deadline Sun Oct 18, 17:00 EDT).

**The spec is `plan.md`.** Each task there has the exact code, tests and expected
output. When asked to do "Task X", read that task, do exactly it, run its checks, show the output, then commit with
its commit message. Don't start other tasks.

## Layout
- `web/` Vite + React + TypeScript (browser: MediaPipe, ONNX classifier, LiveKit call, UI)
- `server/` FastAPI (holds every API key; LiveKit tokens, Gemini, ElevenLabs, Tiger Data)
- `ml/` Python: Kaggle GISLR conversion, training, ONNX export (GPU box: the MSI with the RTX 3060)
- `presage/` optional Node sidecar for Presage face analysis (runs on the signer laptop)
- `data/` never committed (Kaggle zip, recordings, features)

## Commands
- web: `cd web && npm run dev` · `npm test` · `npx tsc -b` · `npm run fixtures` (after changing features.ts)
- server: `cd server && source .venv/bin/activate && pytest -q` · `uvicorn app.main:app --reload --port 8000`
- ml: `pytest ml/tests` · `python ml/gislr_to_features.py ...` · `python ml/train.py pretrain|finetune ...`

## Rules
1. Secrets: keys live only in `server/.env` (gitignored) and the Presage key in the sidecar's environment. Never put
   a key in `web/`, in a `VITE_*` variable, in a commit, or in printed output.
2. Shared contracts — change only when the task says so, and tell the team in chat:
   `web/src/lib/types.ts`, `web/src/vocab.json`, `server/app/main.py` routes, `server/sql/schema.sql`,
   and the feature code. `web/src/lib/features.ts` and `ml/features.py` must stay identical in behavior:
   after touching either, run `cd web && npm run fixtures` then `pytest ml/tests/test_parity.py`.
3. TypeScript runs with the Vite template's `erasableSyntaxOnly` and `noUnusedLocals`: no constructor parameter
   properties (`constructor(private x)`), no `enum`, no `namespace`, no unused imports.
4. Stay in your track's files (see the plan's file map). Small commits; fetch and integrate `origin/main` before every push (see Repository workflow above).
5. Before saying a task is done: run its tests/commands and paste the result. If something can't be verified
   (needs a camera, a key, two laptops), say so instead of claiming it works.
6. No new dependencies unless the task lists them.
7. Product rules (they are judged): UI text says "Deaf", "hard of hearing", "signer" — never "mute", "deaf-mute",
   "hearing-impaired". Never claim the app "translates ASL" or "replaces interpreters". Auto-speak only voices
   sentences whose signs were all recognized confidently; anything unsure waits for the signer.
8. Credit: Kaggle GISLR / PopSign data (CC BY 4.0) in the README and Devpost; AI tools used (Claude Code, Codex).
