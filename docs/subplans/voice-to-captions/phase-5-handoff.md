# Voice captions: GitHub merge and Phase 5 integration

Status: committed and pushed in [13b6b5d](https://github.com/Azrkiel/Banana-Brownies-GHH2026/commit/13b6b5dca135b65510476777df20902db4ee4b86); automated checks passed. Live two-laptop acceptance is
pending. The user explicitly requested call integration while Phase 4's stability,
accuracy and timing checks remain pending. Phase 6 has not started.

Incoming GitHub main: ff2471930036f4f1ab491953e8da4e31e9275104 (rechecked unchanged).
Previous local base: 33ed3812e5ce19da0ab4753252581f2112422d8d.
The local branch fast-forwarded over existing upstream commits. The user reviewed,
authorized and published the feature in 13b6b5d. GitHub main matched that full SHA
after push, with a clean working tree. The code has not been deployed to Fly.io by
this work; live acceptance is pending.

## How this fits current GitHub

Keep the newer lobby, separate #/room query route, MoonTrios visuals, purple theme,
API configuration and Fly.io files. Adapt the development-only speech-check page
to that theme and preserve it alongside the production room route. Key each room
session by its query so changing room/identity cannot reuse another session's state.

The hearing participant sees a speech disclosure and Start/Stop captions below the
video. Consent alone and joining alone never start recognition. The signer receives
captions without starting recognition. Typed captions retain their own composer.
Call microphone mute pauses recognition; unmute resumes only retained enabled intent.
Stopping captions leaves call audio on. Consent revocation, leave, navigation,
pagehide and terminal failure invalidate capture callbacks and unfinished drafts.

## Contracts and modules

- Caption.revision?: positive integer for speech; existing English producers stay
  compatible. Speech input requires role=hearing and a valid revision.
- Ctrl adds {type:'caption-clear', id:string, revision:number}.
- CallHandlers.onCaption adds authenticated LiveKit sender identity as its second
  argument. onPeerLeft and onMicrophoneMuted are optional observers.
- Call.setMicrophoneEnabled coordinates the existing published call microphone.
- captions.ts validates payloads and scopes wire IDs by sender, retaining 50 display
  rows and 512 recent ordering/terminal records. A peer cannot clear another sender's
  row; clear cannot erase English, finalized or retracted text. Late drafts after a
  final/clear are rejected. Very old terminal IDs may expire after 512 newer IDs.
- speechCaptions.ts turns callbacks into stable utterance IDs and revisions. Local
  updates are immediate; remote interims coalesce at 200 ms. Finals bypass draft
  timers. Serial delivery has a 20-item queue, 30-second item age, five-second send
  timeout and two retries for final/clear after 500/1500 ms. Failures/overflow are
  visible; SDK acceptance does not mean a peer read the caption. Timed-out SDK sends
  cannot be cancelled; receiver ordering guards their late completion.
- On reconnect, unsent finals are discarded with a visible warning rather than
  replayed unexpectedly. Up to 20 clear requests containing only IDs/revisions
  survive a brief disconnect in this same room and precede new utterances on rejoin.
  Disposal drops all room work. Peer departure also clears that peer's drafts.
- callSpeech.ts owns one recognizer with consent/role/connection/mute/voice gates,
  synchronous startup guards and terminal-error explicit restart. TTS control signals
  pause capture until all signaled speakers finish; a missing finish fails closed
  after 30 seconds. No generated-voice producer currently exists in upstream, so
  this wiring is fixture-tested only and actual speaker feedback remains unverified.
- CaptionLane suppresses interim live announcements and distinguishes final text.

No new dependency or backend route is introduced by the feature. ASL/ML, Gemini,
TTS generation, metrics/database and deployment retain their existing owners.

## Verification on the isolated merged source

```text
Locked frontend install: PASS (82 packages, 0 reported vulnerabilities).
Frontend: 158 tests in nine files PASS.
TypeScript / Vite production build: PASS.
Lint (oxlint): PASS.
Python requirements installed in separate venv: PASS.
pip check: PASS, no broken requirements.
Backend pytest: 10 PASS, one upstream Starlette deprecation warning.
```

The original bundle-size warning remains (about 954 kB); no unrelated optimization
was made to hide it. The backend TestClient initially stalled because the Windows
sandbox blocked asyncio's local socketpair. Re-running the same suite with normal
permission escalation passed in 1.76 seconds. Obsolete stalled runs were stopped.
No real provider keys were copied into the validation checkout or used in its tests.

GitHub reported zero check runs and zero commit status contexts for the incoming
base ff2471930036f4f1ab491953e8da4e31e9275104. Its
combined status is 'pending' with count zero: there is no CI success claim or failed
configured check. Validation therefore rests on the local checks above.

Browser QA: the new speech page renders in the current purple theme; the hearing
room shows captions off, unchecked disclosure and disabled Start while connecting.
Cancelling join leaves captions off; consent alone outside a connected room still
cannot enable Start. No camera/microphone permission was granted during this QA.

Original standalone Chrome recognition, repeated phrases, Stop/microphone indicator
and navigation checks passed by user report before this integration. They do not
establish integrated two-laptop delivery, live mute/reconnect, accuracy, latency,
screen-reader behavior or TTS echo safety. Those remain pending. See validation.md
and phase-5-call-integration.md for the real acceptance sequence.

## Review and local testing

The user's Downloads clone is the merged result. All 32 transferred feature paths
matched the validated candidate, and its frontend suite passed again (158 tests).
The original speech files,
App.tsx and sub-plan have a separate backup in the session workspace. Git retains
the prior base through refs/backup/voice-captions-before-ff247193. Feature files are
committed in 13b6b5d. server/.env and ignored recordings/model assets are preserved, never copied
to the candidate, included in a patch or printed.

Use desktop Chrome at http://localhost:5173/ with the local API on port 8000 for call
testing. Join two participants in the same room with distinct names/roles, enable
captions only for the hearing participant after disclosure, and check both screens.
Keep the standalone check at #/speech-check in development. Browser speech may send
audio to the browser's service and requires connectivity; Codex embedded recognition
failed in the earlier device test. No offline recognition guarantee is made.

Restart the local test environment in two PowerShell terminals at the repo root:

```powershell
& .\docs\subplans\voice-to-captions\start-caption-api.ps1
& .\docs\subplans\voice-to-captions\start-speech-check.ps1
```

Run one command per terminal. The first uses the ignored local Python environment;
the second runs the frontend. The API needs the existing LiveKit configuration for
actual rooms. No configuration values are written into these scripts.

Delivery check: Downloads frontend (5173) and API (8000) are running. Both direct
/api/health and the frontend proxy returned ok=true. The local server venv passes
pip check. No real room/token/provider request was used for this health check.
Temporary validation preview servers were stopped; source backups remain available.

Do not advance to optional Scribe/Phase 6 without separate user approval.

Source for LiveKit sender metadata/text-stream semantics:
https://docs.livekit.io/transport/data/text-streams/
