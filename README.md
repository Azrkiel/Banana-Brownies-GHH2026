# SignLine · Banana-Brownies-GHH2026

A planned two-person video call where a signer can confirm English captions and
voice generated from a small vocabulary of isolated signs. See [plan.md](plan.md)
for the implementation roadmap, consent requirements, and limitations.

## Current status

The **ledger in [plan.md](plan.md) §3** is the single source of truth for what is done.
Run `python plan/verify.py status` for counts and `python plan/verify.py next` for the next
task. Most of the app (ASL switch, recognition, voice, ML training) is not built yet.

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
Model bundles are local to each machine and are not included in a Git clone.
Downloads passed in an earlier cloud setup, but this instance currently receives
a proxy HTTP 403 from `storage.googleapis.com`. The hostname is saved in the
environment network draft; review/save the settings and publish the environment,
then retry the full asset command. On a laptop, run the full command before
opening the camera pages.

## Run and check

The root URL opens the [notebook welcome](docs/intro.md): **SignLine**, a hand-drawn
songbird perched on a hand, and **Begin**. Activating Begin plays a short drawn
takeoff with a gentle hand bounce. The view follows the bird into the center,
where its wingbeats replace the loading screen until the call form is ready.
Two songbirds facing each other on a branch illustrate the call page. Reduced motion
enters immediately. Shared `#/room?...` links and the camera,
recorder, speech, stats and design-kit routes open directly.

The interface uses textured paper, local Lora serif fonts and pencil-stroke
controls. Navigation and page copy are reduced to names, actions and necessary
consent/status messages. See [design system](docs/design-system.md) for the visual
rules, generated assets and font license. No camera or microphone is requested
from the welcome or call form.

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

`npm --prefix web test` runs feature extraction, segmenter, tracker, call lifecycle,
and caption-history tests. The call tests cover role-specific microphone behavior,
connection failures, cancellation, remote media cleanup, messages, and reconnect/audio states.
The dataset script is not registered until its implementation arrives in Phase 2.

### Conversation / two-laptop check

1. Start the API and frontend. On Windows, use the virtual environment's
   `server\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir server --port 8000`
   from the repository root; on macOS/Linux use the backend command above from `server/`.
2. Open the frontend in desktop Chrome on localhost or HTTPS. Enter a display
   name and a room (3–32 lowercase letters, numbers or hyphens), then select a role.
3. Choose **Join room** and allow camera access. The hearing participant also
   grants microphone access; the signer's microphone stays off. The same camera
   track supplies the local preview and LiveKit publication; only the preview is mirrored.
4. Join the same room on another laptop with a different name. Each frontend
   needs a reachable API. When sharing one API over the LAN, bind Uvicorn to
   `0.0.0.0` and start the second laptop's frontend with
   `VITE_API_PROXY=http://<server-LAN-IP>:8000 npm run dev` (PowerShell:
   `$env:VITE_API_PROXY="http://<server-LAN-IP>:8000"; npm run dev`).
   Keep each browser on its own localhost frontend for camera permissions.
5. Verify video both ways and the hearing microphone audio. Type a caption and
   press Enter or the send arrow; verify it appears on both screens.
6. If audio is blocked, choose **Enable audio**. Leave the room and verify camera
   use stops. Navigation away and cancellation also stop camera tracks.

Typed captions remain in memory only, with the latest eight displayed. A failed
send retains the draft for retry. The ASL voice switch and speech recognition
arrive in later tasks, so typing is the available caption input for now.

### Camera benchmark and recording

With the dev server running, choose **Camera check** or **Recorder**
in the navigation (`#/bench` and `#/record`). Camera access requires desktop Chrome
on localhost or HTTPS. The pages release the camera and models when stopped or
when navigating away.

1. On each candidate signer laptop, start the benchmark, compare face-on and
   face-off FPS, and check one-hand/two-hand tracking. Target at least 20 FPS.
2. In the recorder, read and accept consent, enter a pseudonymous signer ID, and
   select handedness. Start the camera; wait for **Camera ready**.
3. Select `ME`, start recording, sign once, then lower your hands or pause. Repeat
   three times; confirm one clip per repetition, then stop recording.
4. For letters, choose **Letters** and hold the selected letter for two seconds.
   At least 20 frames with a detected hand are required. Cancel discards that hold.
5. Undo unwanted clips and download the session JSON before leaving the page.
   Store it under ignored `data/raw/`; no video or recordings are uploaded.

Signer metadata locks after the first saved clip. Labels and modes lock during
capture to prevent mixing examples. The download preserves the existing version-1
session contract and raw landmarks; no handedness transform is applied in the
recorder. Start a new page/session for another signer after saving the current one.

Chromium checks with synthetic video and mocked models verified sign/letter
capture, consent gating, downloads, undo, cancellation, missing-hand rejection,
and camera cleanup. Actual MediaPipe inference, laptop FPS, and the three-repetition
`ME` check still need a real camera and the downloaded model bundles.

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
