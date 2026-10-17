# Voice-to-captions: Phase 3 handoff

Status: standalone recovery/cancellation implemented; automated checks passed.
Next gate: user approval before Phase 4 (local microphone testing environment).
Base local commit: 33ed3812e5ce19da0ab4753252581f2112422d8d. Changes remain local.

## Update monitor closure

The user cancelled the scheduled GitHub update task. The automation tool confirmed
it was deleted. The monitor had used a separate temporary checkout and did not pull,
merge, or otherwise change the Downloads clone or its Git metadata.

Before Phase 3 editing, both Phase 2 file hashes matched their recorded versions:
- stt.ts: 0FD5620FB7081DA42049CDE6993C6B59E13C9E8C5FC681F089DFE0E913082E5F
- stt.test.ts: 216413E872D67201016AB0DFCA4B85F69BBAB2E316D7BEA121E821A88C20F195

Your source work and local API configuration were unaffected by that monitor.
The newer GitHub main was never applied. The saved update-approval request is cancelled.

## Implementation

Changed web/src/lib/stt.ts and stt.test.ts; public exports/signatures are unchanged.
Added private starting/listening/closing/waiting/stopped state, attempt generations,
per-attempt result history, timer ownership, and callback guards.

- End/no-speech/network recovery requires confirmed closure of the old recognizer.
- Three retry starts use 1, 2, and 4 second delays; rapid failures cannot reset the budget.
- Thirty healthy listening seconds reset retry and network-notification state.
- A startup without provider-ready times out after 15 seconds; closure without end
  times out after 2 seconds. Both end recovery safely with an actionable message.
- Permission/service denial, audio capture failure, unsupported language, unexpected
  abort, unknown failure, and malformed events terminate without a retry loop.
- A transient network constructor failure can consume the bounded budget because it
  creates no capture session. A failed start with unconfirmed teardown is terminal.
- stop() is idempotent, cancels all timers, invalidates stale callbacks, and emits no
  callbacks. It never changes unrelated LiveKit microphone tracks.
- Recovery clears only unfinished text; committed phrases are not replayed and speech
  during gaps is not fabricated. Raw provider details are absent from error messages.

The Phase 2 normal-end/network expectations were deliberately advanced to controlled
recovery as specified in the Phase 3 plan. Transcript and explicit-stop regression
coverage remains. No repository task verification block or dependency was changed.

## Actual verification

Bundled Node 24.19.0, npm 11.21.1 through bundled pnpm; no credentials loaded or live
provider/microphone calls made.

```text
python plan/verify.py preflight --lane call
  PASS: PREFLIGHT OK.
npm --prefix web test -- src/lib/stt.test.ts -t "restarts once after an ordinary end"
  Initial RED on Phase 2 implementation: expected replacement recognizer was absent.
npm --prefix web test -- src/lib/stt.test.ts
  Final PASS: 63 tests, 1 file.
npm --prefix web test
  PASS: 106 tests, 6 files.
npm --prefix web run build
  PASS: TypeScript and Vite.
npm --prefix web run lint
  PASS: oxlint exit 0.
```

The focused suite uses fake timers, restores globals/timers, and asserts no remaining
timers after each session is stopped. It covers repeated short failures, healthy reset,
closing confirmation, both watchdogs, stopping from every state, reentrant application
callbacks, late old events, constructor failure recovery, and malformed provider data.

Build retains the same nonfatal roughly 936 kB bundle-size warning. No unrelated
optimization or package update was made to silence it.

Current source hashes:
- stt.ts: BB6919D135A7AB8461EC246EE2742EB094DD9955184D5D93C8D48B997437FE8F
- stt.test.ts: 7B173847F0CD6E03FD3EDCCE545B938467C5F12F5636F7FD7AFFC86F43CFC667

## Remaining work and limits

These are mocked lifecycle checks. Real microphone/browser permission behavior,
recognition accuracy, timing targets, and silence-timeout tuning remain Phase 4.
Phase 4 will add the explicit state observer and local speech-check page with Start,
Stop, interim/final text, useful status, and clear launch instructions.

Do not enter Phase 4 until the human approves. Two-laptop delivery, caption protocol
coordination, roles/consent/mute wiring, and generated-voice feedback remain Phase 5.
Scribe remains Phase 6. No parent project task is marked complete for this subset.

The 30-second healthy window may exhaust on browsers with shorter recurring silence
timeouts; verify and tune with real evidence. Browser-level failures can require user
intervention to stop/recover capture. Retry gaps can lose speech. Default Web Speech
may send audio to a browser-operated service; offline/on-device operation is not claimed.

## Scope review

The main plan, shared types, Call.tsx, call.ts, package manifests, server configuration,
and unrelated product files are unchanged. No GitHub update, commit, push, or Phase 4
implementation was performed. Keep all progress in this voice-to-captions sub-plan.