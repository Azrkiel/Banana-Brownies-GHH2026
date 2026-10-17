# SignLine · Banana-Brownies-GHH2026

A planned two-person video call where a signer can confirm English captions and
voice generated from a small vocabulary of isolated signs. See [plan.md](plan.md)
for the implementation roadmap, consent requirements, and limitations.

## Current status

Phase 0's frontend and Python server scaffolds are implemented. The frontend
shows the planned vocabulary. Phase 1's shared types and landmark feature extraction
are implemented and unit-tested. Task 1.C1 adds the backend health, token, gloss,
TTS, voices, Scribe token, events, and stats routes. Calling, camera tracking,
and recognition are not implemented yet. No recognition accuracy has been measured.

## Development setup

Use the existing checkout; a separate Git worktree is not required. Validated with
Node.js 24, npm 11, and Python 3.12. Node.js 22.12+ is required by the Vite toolchain.
Run the following from the repository root:

```sh
npm --prefix web ci
python3 -m venv server/.venv
server/.venv/bin/python -m pip install -r server/requirements.txt
npm --prefix web run setup:assets
```

If your home directory is read-only in the cloud environment, use
`npm --cache /workspace/.npm-cache --prefix web ci` and add
`--cache-dir /workspace/.pip-cache` to the pip command.

The asset command copies MediaPipe WASM and ONNX WASM/ES modules from the locked
npm installation, then downloads version 1 of the three official MediaPipe model
bundles over HTTPS from `storage.googleapis.com`. It checks bundle integrity and
requires each model to exceed 1 MB. Existing valid models are reused; partial
failed downloads are removed. Model bundles and generated runtime assets are
ignored by Git. Re-run the command after changing runtime package versions.

To work on the scaffold without network access to the model bucket:

```sh
npm --prefix web run setup:assets -- --runtime-only
```

This mode does **not** prepare the three models needed for later camera tracking.
Model downloads from `storage.googleapis.com` have been verified in the cloud
workspace. All three bundles are present locally and reused on subsequent runs.
If a new environment blocks the bucket, allow this hostname in its network settings
and retry the full asset command.

## Run and check

```sh
cd web
npm run dev
```

In a second terminal, start the backend:

```sh
cd server
.venv/bin/uvicorn app.main:app --reload --port 8000
```

The backend reads ignored `server/.env`. Vite proxies `/api` to port 8000 by
default. Set `VITE_API_PROXY` when using a backend on another host.
`GET /api/health` reports setting presence; it does not test provider connectivity.
Health and local LiveKit token signing were validated with the configured settings.
Live provider calls and database schema setup remain separate integration tasks.

```sh
# From the repository root:
npm --prefix web run build
npm --prefix web run lint
server/.venv/bin/python -m pip check
(cd server && .venv/bin/python -m pytest -q)
```

`npm --prefix web test` runs the landmark feature extraction tests, including
normalization, mirroring, tracking loss, and temporal resampling.
The dataset script is not registered until its implementation arrives in Phase 2.

## Credentials and team tasks

See the [complete setup checklist](docs/setup-checklist.md) for account steps,
secure credential handling, team decisions, and optional deployment tasks.

When implementing Phase 1, copy `server/.env.example` to `server/.env` and fill it
through a secure local editor or environment settings. Never commit `.env`, put
keys in frontend code, or send key values in chat. The server example records the
plan's model defaults; availability still needs verification with the provider.
No provider account, cloud VM, database service, or paid subscription was created.

Remaining Phase 0 tasks:

- Create/configure LiveKit, Gemini, ElevenLabs, and Tiger Data accounts; arrange
  Vultr deployment only when the team is ready to provision it.
- Answer organizer questions Q1–Q6 in the plan.
- Confirm the default demo name (LIV) and letters with the team.
- Verify each sign against Lifeprint/Handspeak, add verified form descriptions to
  `web/src/vocab.ts`, and teach the agreed forms before collecting recordings.

Only record consenting participants. Keep recordings in ignored `data/` paths.
This project targets a small set of isolated signs and slow fingerspelling, not
continuous or fluent signing, or medical, legal, or emergency use.

## Credits

Frontend scaffold: Vite, React, and TypeScript. Planned browser tracking: MediaPipe;
inference: ONNX Runtime Web; calls: LiveKit. This implementation used OpenAI Codex;
the original plan credits Claude. Document AI assistance in the event submission.
If publicly sharing audio generated on ElevenLabs' free plan, verify and follow
its current attribution terms (the plan calls for `elevenlabs.io` in video titles).
