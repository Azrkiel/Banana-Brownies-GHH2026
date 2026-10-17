# Voice-to-captions sub-plan: Phase 3 recovery and cancellation plan

> Scope: voice-to-captions only. Phases 1-6 are local to this sub-plan and do not renumber, replace, or modify the main project phases or ledger. See [the sub-plan overview](README.md) and [the main project plan](../../../plan.md).


Status: implemented; automated checks passed. See [the handoff](phase-3-handoff.md).
Prerequisites: implement and verify Phase 2 before beginning this work.
Scope: make the standalone Web Speech adapter recover predictably without restart loops,
stale transcripts, overlapping recognizers, or microphone sessions surviving explicit stop.
This document supplements Phase 1/2 and plan.md; it does not complete task 2.A2.

## Outcome and file boundaries

Extend only web/src/lib/stt.ts and web/src/lib/stt.test.ts during future implementation.
Preserve OnTranscript, Stt, and startWebSpeech signatures. Keep provider types, states,
attempt identifiers, timer handles, and policy constants private. Add no dependencies.

For this planning request create only this document. Do not change source, prior phase
plans, server/.env, manifests, task statuses, or Git history. Remote updates to the
Downloads clone continue to require the user's explicit approval.

This phase intentionally replaces Phase 2's temporary close-on-every-end behavior with
controlled recovery. Update its lifecycle tests to the explicitly specified behavior;
retain all existing transcript-normalization and explicit-stop regression coverage.
Do not weaken repository task-verification checks.

## Private state model

Use private string-union states, not TypeScript enums:

- starting: start requested; waiting for the provider's start event.
- listening: provider signaled start; result events may be accepted.
- closing: recovering attempt is being aborted; its results are no longer accepted.
- waiting: the old attempt has ended; one delayed retry is pending.
- stopped: terminal due to explicit stop, permanent error, watchdog, or exhausted retries.

A logical session is one startWebSpeech invocation and its returned stop handle.
An attempt is one underlying browser recognizer instance within that session. Give
attempts a generation ID and compare it in every callback. A separate wanted flag
prevents any automatic restart after explicit stop or terminal failure.

No constructor or microphone access on module import. The caller still owns starting
one logical session at a time and stopping it before replacement. This module must
not manage call-wide state, other microphone tracks, or global recognizer singletons.

## Error decisions

The following are project policy decisions, to be checked on the real browser in Phase 4.

| Signal | Policy |
| --- | --- |
| no-speech | Recoverable silence; suppress a user-facing error while bounded recovery remains available |
| end without an error | Recover if wanted; apply the same restart budget so repeated immediate endings cannot spin |
| network | Recover with the bounded policy; report one plain message per failure episode, then a distinct terminal message if exhausted |
| not-allowed / service-not-allowed | Stop permanently; explain permission/service access and require explicit user retry |
| audio-capture | Stop; ask the user to check their microphone and retry explicitly |
| language-not-supported | Stop; explain the configured language is unavailable |
| aborted caused by our own stop/cleanup | Expected cleanup event; no extra error or restart |
| unexpected aborted | Stop and ask for explicit retry; do not silently reacquire the microphone |
| unknown error, unsupported configuration, malformed unexpected provider failure | Stop with a safe message; no speculative retry |
| initial constructor or synchronous start exception | Preserve Phase 2: one error and null return, without automatic startup retries |
| exception constructing/starting a recovery attempt | Abort/detach the failed attempt; consume the next retry only for recognized transient failure with confirmed teardown; otherwise terminate |

Use fixed, actionable messages based on error categories. Never include raw provider
objects, transcript content, keys, or environment values. Service errors do not change
call status, remove typed captions, or disable the LiveKit microphone.

## Bounded recovery policy

Choose these initial private constants; they are implementation defaults, not API guarantees:

| Setting | Initial value |
| --- | --- |
| Retry delays in one failure episode | 1000 ms, 2000 ms, 4000 ms |
| Maximum recovery starts per episode | 3 after the initial attempt |
| Healthy listening period that resets the episode | 30000 ms after provider start, with no error/end in that interval |
| Startup watchdog | 15000 ms from each start request |
| Closing watchdog | 2000 ms after aborting an attempt for recovery |

An episode ends only after a genuinely healthy listening period. onstart or a single
transcript must not reset the budget immediately. Repeated short sessions, rapid
no-speech events, and repeated network errors therefore reach a hard stop. A fresh
explicit startWebSpeech call begins a new logical session and budget.

A long healthy silent session can reset the budget; ordinary silence is not itself
an error notification. At the eventual end/no-speech event, it can restart using the
first delay. If a browser's silence timeout is consistently shorter than the healthy
window, this policy may exhaust during silence. Record that behavior in Phase 4 and
tune with evidence rather than adding an unbounded retry loop.

Schedule a retry only once the prior attempt has ended. For a recoverable error,
enter closing, reject its text immediately, clear an unfinished draft once, request
abort, and wait for its end event. For an ordinary end, retire it and schedule directly.
An error followed by end must schedule one retry, not two. Repeated errors from the
same closing attempt cannot consume extra budget or schedule additional timers.

If closure is not confirmed before the closing watchdog, stop with a useful error;
do not start another recognizer while capture might still be active. If startup never
signals start before the startup watchdog, retire/abort the attempt and terminate;
do not repeatedly dismiss and reopen a pending permission prompt.

At most one retry timer and one applicable watchdog may be active for an attempt.
Cancel the healthy-listening timer when leaving listening. On final exhaustion,
clear the pending draft, release resources, and require explicit user retry.

## Cancellation and stale-event rules

- Explicit stop works from starting, listening, closing, waiting, and stopped.
- Set wanted=false and stopped before invoking provider cleanup; invalidate the
  current generation, cancel every timer, detach handlers, and abort safely.
- Explicit stop emits no text/error callbacks. The later UI integration owns clearing
  its unfinished row when it calls stop.
- A callback already queued before handler detachment must check state, generation,
  and wanted before producing output or changing recovery state.
- Recheck those guards after invoking an application callback: onText/onError may
  synchronously call stop. Do not emit later results or schedule recovery afterward.
- An old attempt's late result/start/error/end cannot affect a replacement attempt.
- Suppress late finals from failed/retired attempts. Only accepted finals already
  delivered remain; recognition does not replay audio or reconstruct lost speech.
- Reset provider result indexes and unfinished-text bookkeeping for each attempt.
  Retain no committed-index set across provider restarts.
- Cleanup exceptions must not throw from stop or revive a session. No new attempt is
  allowed when teardown is unconfirmed; report limitations without promising that
  browser capture is controllable after a browser failure.

## Transcript behavior retained

Keep Phase 2's ordering, draft replacement, multiple-final handling, and per-attempt
index deduplication. Identical spoken phrases are allowed across attempts. Recovery
clears only an unfinished draft via onText('', false), once, while callbacks remain
allowed. An explicit-stop path clears no draft by callback. Never commit unfinished
speech automatically on timeout or retry, and do not concatenate text across an audio gap.

The unchanged public API cannot announce a listening/retrying state. onError carries
only useful error text, and recovery can be silent for normal silence. Before Phase 4
adds an accurate status display, make an explicit decision about an additive status
callback or hook. Do not label the UI 'Listening' merely because a handle was returned.
Keep that interface decision out of this phase's implementation.

## Implementation sequence

1. Review the actual Phase 2 module and tests; preserve unrelated user changes.
2. Add private session/attempt state and centralize guarded timer/cleanup ownership.
3. Add permanent-error decisions and idempotent stop from all states.
4. Add confirmed-end recovery and the one-timer retry policy.
5. Add budget reset, startup/closing watchdogs, and per-attempt transcript reset.
6. Extend the fake provider and add deterministic lifecycle/race tests.
7. Run the focused tests, all frontend tests, build, and lint; write the handoff.

## Planned tests using Vitest fake timers

Use explicit time advancement; avoid real sleeps and runAllTimers on recovery loops.
Restore timers/globals after every test. Assert callbacks, provider starts/aborts, and
pending timers rather than private implementation names.

| Scenario | Expected result |
| --- | --- |
| Normal end while wanted | One restart after the first delay; fresh result indexes |
| no-speech then end | One scheduled retry and no duplicate error notification |
| network then repeated error/end | One retry, budget charged once |
| Three short failed recovery starts | Delays 1, 2, 4 seconds; no fourth recovery start; terminal error |
| Start event or one result on every rapidly failing attempt | Retry budget does not reset |
| Listening remains healthy for 30 seconds | Next failure begins at first delay again |
| Permission or service denied | No retry after any timer advancement |
| Audio capture, unsupported language, unknown error | One terminal error and cleanup |
| Initial constructor/start throws | Null return, one error, no timers |
| Stop during retry delay | Timer canceled; no later provider construction/start |
| Stop while starting/listening/closing | Safe cleanup; no later callbacks or recovery |
| Stop called twice | No extra abort, callback, or timer |
| Application callback synchronously calls stop | Processing halts before further callbacks/retry work |
| Old attempt sends late start/result/error/end | Replacement session remains unaffected |
| New attempt finalizes result index zero | Transcript accepted even if prior attempt used index zero |
| Start event never arrives | Startup watchdog closes session; no restart loop |
| Abort never receives an end | Closing watchdog terminates; no overlapping recognizer |
| Abort throws during cleanup | Safe terminal behavior; no unconfirmed retry |
| Retry produces speech identical to a prior finalized phrase | New final accepted; no text-only deduplication |
| Recovery discards pending draft | One empty interim; no fabricated final |
| Explicit stop with a pending draft | No callback; integration must clear its UI draft |
| Every terminal path | No remaining timers or reachable active handlers |

## Verification and definition of done

After implementation, run from the repository root:

```sh
npm --prefix web test -- src/lib/stt.test.ts
npm --prefix web test
npm --prefix web run build
npm --prefix web run lint
```

Done for this standalone milestone requires passing Phase 2 transcript tests, the new
recovery/cancellation tests, and applicable frontend checks, with unchanged public
exports and documented recovery defaults. Record actual output and distinguish
pre-existing failures or unavailable runtimes. Do not run provider calls or load keys.
Do not mark all of task 2.A2 DONE; its other components remain separately required.

## Leave out for later parts

| Deferred work | Later phase / owner |
| --- | --- |
| Actual microphone/browser permission behavior and policy tuning | Phase 4 real-device acceptance |
| Listening/retrying/error visual states and any agreed status API extension | Phase 4 harness/interface decision |
| Full consent screen, preferences, device selector, language selector | UI integration / separate approved scope |
| Caption metadata/IDs, empty-draft removal, interim throttling and delivery retries | Phase 5 caption adapter and transport |
| LiveKit connection recovery, microphone publication and hearing-role enforcement | Phase 5 call integration |
| Generated-voice echo coordination and speaker/headphone testing | Phase 5 voice/call integration |
| Metrics/database, ASL, Gemini, TTS and model training | Existing separate tasks |
| Scribe tokens, SDK, billing and provider fallback | Optional task 4.4 |
| Offline speech model, recorded-audio replay, durable transcripts | Outside the initial speech-captioning scope |

## Handoff requirements

Report changed files, actual check results, retry/watchdog defaults, tested race cases,
and limits of mocked verification. List remaining Phase 4 browser/permission checks
and Phase 5 integration obligations. No claims about live accuracy or uninterrupted
captioning until those checks exist and pass. Mention that a timed-out provider may
require browser-level recovery and that retry gaps can lose speech.

## References

- docs/subplans/voice-to-captions/phase-1-interface.md and docs/subplans/voice-to-captions/phase-2-adapter.md.
- Browser error categories: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognitionErrorEvent/error
- Deterministic timer tests: https://vitest.dev/guide/mocking/timers
- Timing defaults and recovery decisions above are proposed project policy, not browser guarantees.