# Voice-to-captions: Phase 4 handoff

Historical Phase 4 record. The user later authorized the GitHub merge and Phase 5
call integration before the deferred Phase 4 measurements. See phase-5-handoff.md
for current integration status; remaining Phase 4 device checks are still pending.

Status: implementation ready; live captions, duplicate handling, Stop/microphone
release and active navigation cleanup confirmed by the user in the separate desktop
Chrome app. Remaining acceptance is pending in validation.md. Phase 5 has not started;
the user's explicit approval is required before moving to it.

Base commit: 33ed3812e5ce19da0ab4753252581f2112422d8d. Changes are local and
uncommitted. No remote update, merge, push or main-plan ledger change was performed.

## Delivered

- web/src/lib/stt.ts: optional third state observer; existing two-argument callers
  remain valid. SttState exports starting/listening/stopping/retrying/failed/stopped.
  Listening requires provider readiness; retrying requires a scheduled retry;
  stopping means recovery is waiting for confirmed closure. Explicit stop emits
  no callbacks; the caller owns its stopped state. Failure never emits stopped
  afterward. Callback ordering and synchronous cancellation have regression tests.
- web/src/lib/stt.test.ts: 11 additional observer tests (74 total adapter tests).
- web/src/pages/SpeechCheck.tsx and SpeechCheck.css: development microphone page,
  explicit disclosure and Start/Stop/Clear controls, interim draft and latest 50
  final phrases held in memory. No capture on mount or consent alone; generation
  guards and cleanup on route exit, unmount and pagehide.
- web/src/App.tsx: guarded development-only lazy route #/speech-check. Production
  assets exclude this page. No production call wiring was added.
- start-speech-check.ps1: repeatable localhost launcher using installed dependencies.
- validation.md: actual results, remaining device checks and neutral scoring script.

The embedded browser exhausted recovery. After clarifying an earlier misclick, the
user opened Chrome separately and confirmed captions work there. Network retry exhaustion now explicitly describes
the browser speech service connection and directs the user to desktop Chrome.
Other recovery exhaustion retains the generic message. Retry/watchdog timings were
not changed: there is no evidence yet to tune the Phase 3 defaults.

## Verification

Bundled Node 24.19.0; npm 11.21.1 via bundled pnpm. On 2026-10-17:

```text
npm --prefix web test
  PASS: 117 tests, six files (includes 74 speech tests).
npm --prefix web run build
  PASS: TypeScript and Vite; existing roughly 936 kB bundle warning.
npm --prefix web run lint
  PASS: exit 0.
Production asset search for speech-check / SpeechCheck / Your voice
  PASS: no matches.
Launcher PowerShell parse
  PASS.
HTTP localhost:5173
  PASS: 200; local Vite test environment running.
```

Automated recognition is mocked; it does not prove provider connectivity or actual
microphone release. Background browser QA checked initial control gating, idle after
consent alone and no horizontal overflow at the inspected desktop viewport. The
Chrome recognition, duplicate handling, Stop with no later text and indicator off,
and navigation cleanup with idle return passed by user report. Accuracy, latency,
long-session stability and live error-path recovery remain unverified. Microphone
release was checked by the user's browser indicator, without OS instrumentation.

SHA-256 fingerprints of tested local sources:

| File | SHA-256 |
| --- | --- |
| stt.ts | 3FF5BE47B54EACAEDA175A0BD1445638FF1FA764D72D18ACC48BA56859AA650A |
| stt.test.ts | B26B663624D1ADD6DC79F27D663E397356EA203659B7136AF52EF48D21419DE2 |
| SpeechCheck.tsx | EEF3228ED64987D702A291C147BAA668F4E895A80915D0A9797B07CCCB1E6ADD |
| SpeechCheck.css | AA937858A568D28BFE88172D6229C3292E7949CE0D70EC341DE617D9981DEDF7 |
| App.tsx | 63ADB76C7BA6FCD6EE8777DFA45474B2084D2EC35AF9BC0284AAABB153E81D47 |

## Integration boundary

LiveKit roles/consent/mute/leave coordination, remote caption ordering and draft
clearing, generated-voice echo prevention, and two-laptop behavior belong to Phase 5.
Scribe and provider fallback belong to Phase 6. Camera, ASL/ML, Gemini, TTS, metrics,
database, deployment and pitch remain with their existing project tasks.

The main plan, shared Caption types, Call.tsx, call.ts, manifests and locked
dependencies are unchanged. No provider credentials were loaded by this frontend
test environment or copied into the frontend. No parent task is marked complete.
