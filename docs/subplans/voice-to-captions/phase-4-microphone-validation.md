# Voice-to-captions sub-plan: Phase 4 microphone validation plan

> Scope: voice-to-captions only. Phases 1-6 are local to this sub-plan and do not renumber, replace, or modify the main project phases or ledger. See [the sub-plan overview](README.md) and [the main project plan](../../../plan.md).


Status: implementation and automated verification complete; live captions, repeat
handling, Stop/microphone release and navigation cleanup confirmed by the user in
desktop Chrome. Accuracy, timing, stability and error-path live checks remain pending.
See phase-4-handoff.md and validation.md for actual evidence.
Outcome: prove the standalone recognizer on the actual demo laptop/browser and record
its real limitations before connecting it to LiveKit. This is a focused test page,
not the production call screen.

## Implementation boundaries

Implementation files:
- web/src/pages/SpeechCheck.tsx and SpeechCheck.css: isolated test page.
- web/src/App.tsx: one small development-only hash-route addition.
- web/src/lib/stt.ts and stt.test.ts: additive state observer and targeted fixes
  supported by real-device findings.
- docs/subplans/voice-to-captions/validation.md: sanitized results and known limitations.

Expose #/speech-check only under import.meta.env.DEV. Keep the existing conditional
router; do not add routing or UI dependencies. Do not edit Call.tsx, call.ts, CaptionLane,
server routes, shared Caption types, ASL logic, metrics, or production consent here.
Tell the App.tsx owner before the small route edit; preserve other lane changes.

## Resolve observable state before building the page

Retain existing exports and two-argument calls. Add an optional third callback:
onState?: (state: SttState) => void, with exported SttState =
'starting' | 'listening' | 'stopping' | 'retrying' | 'failed' | 'stopped'.

Implementation refinement: stopping describes recovery while awaiting the provider's
end event. It prevents the UI showing listening after capture has been asked to close.
It does not change explicit stop(), which still emits no callbacks.

This is a deliberate additive refinement of Phase 1's interface, scoped to this phase.
starting follows the start request; listening requires the provider start event;
retrying follows an actual scheduled recovery; failed means terminal failure.
The caller sets idle/stopped on explicit stop: stop() still emits no callbacks.
Do not emit stopped after failed and hide the failure. Use stopped only for a
non-error natural terminal path, if one is supported. Define event ordering in tests.

A handle alone never means permission was granted. Guard observer callbacks by
logical session/attempt, including callbacks invoked synchronously during startup.
After a terminal failure, pressing Start creates a fresh session. Include interface
changes in the handoff so the call and optional provider implement identical semantics.

## Page behavior

Show a clear disclosure before Start: the selected browser recognition service may
receive microphone audio; this prototype does not save audio or transcripts itself.
Let the person explicitly choose Start. No microphone starts on navigation, mount,
reload, or disclosure acceptance alone.

Show starting/listening/retrying/error accurately, plus a separate mutable interim
line and finalized phrases. Provide Stop and Clear text; clearing text must not start
capture. Bound displayed history, keep it memory-only, and avoid console transcripts.
On Stop clear unfinished text locally. On route exit/unmount stop the active session
and invalidate late callbacks. Keep start attempts single-flight; prevent rapid clicks
or React lifecycle behavior from creating duplicate sessions.

Use desktop Chrome on localhost or HTTPS initially. Do not call getUserMedia merely
to show a microphone icon or request a camera. No real provider keys are needed for
Web Speech. Do not promise offline or entirely on-device recognition.

## Test sequence

1. Fake-provider tests verify observer ordering and compatibility with existing callers.
2. With no permission granted, open the page: no prompt or capture before Start.
3. Start, allow microphone, speak several ordinary phrases, pause, and continue.
4. Verify interim revisions replace the draft and each final appears once.
5. Say the same phrase twice: both phrases must remain.
6. Stop during speaking, startup, and a retry; verify no later transcript or restart.
7. Deny permission, test an unavailable microphone if feasible, and recover explicitly.
8. Simulate a network interruption; observe bounded recovery and useful terminal UI.
9. Navigate away/back and repeat start/stop ten times; check for surviving capture,
   duplicate results, browser errors, and leftover timers.
10. Run a ten-minute quiet-room session including at least two 60-second pauses;
    record silence-timeout behavior and whether Phase 3 defaults need adjustment.

Use consenting participants and neutral text. Record browser/OS version, laptop,
microphone, network, outcomes, and measured timings. Do not store raw audio, personal
speech, credentials, or screenshots containing secrets. Human checks still pending
must remain explicitly pending; synthetic input cannot establish real accuracy.

## Accuracy and timing evidence

Use a fixed neutral script of about 100 words plus five short phrases. Locally compare
final output to the reference and report substitutions/deletions/insertions and word
error rate, with the scoring normalization documented. If a short-lived transcript
is needed for scoring, obtain consent, keep it local, and delete it after scoring;
commit only aggregate results and neutral reference text.

Record phrase-end-to-final latency for repeated trials using one consistent method.
Report trial count, p50/p95, and conditions. Proposed demo targets: at least 90% word
accuracy on the quiet scripted trial, correct meaning for all five short phrases,
and p95 phrase-end-to-final latency under 3 seconds. These are project targets to
evaluate, not achieved claims or guarantees for accents/noise. A failure needs a
recorded decision: fix/tune, constrain supported conditions, or consider Phase 6.

Tune retry/watchdog timings only from observed results; document each change and add
regression tests. Preserve bounded retries, explicit-stop behavior, and no prompt loops.

## Acceptance

Frontend tests, build, and lint pass. Real-device checks are recorded against an exact
commit, with pass/fail/pending labels. No capture before Start or after stopping/leaving,
no duplicate finals, and correct state labels. Quiet-script/latency targets are measured.
If no human/device check can run, the code can be ready but Phase 4 live acceptance
remains pending. The overall 2.A2 task is not complete just because this page works.

## Deferred and handoff

Leave LiveKit, roles, remote captions, delivery retries, global consent, microphone
publication, and generated-voice echo coordination to Phase 5. Leave Scribe to Phase 6.
Leave camera/sign tracking, Gemini, TTS, metrics, database, deployment, and model work
to their existing owners.

Handoff: files changed, observer contract, exact automated check outputs, actual browser
results, measured accuracy/latency, tuned constants, pending live checks, and integration
limitations. Describe any permission behavior that requires browser settings recovery.

## Sources

- Browser microphone context and permission considerations:
  https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- Existing phase-1-interface.md through phase-3-recovery.md.
