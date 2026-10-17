# Voice-to-captions sub-plan: Phase 1 interface plan

> Scope: voice-to-captions only. Phases 1-6 are local to this sub-plan and do not renumber, replace, or modify the main project phases or ledger. See [the sub-plan overview](README.md) and [the main project plan](../../../plan.md).


Status: planning only. No recognizer implementation or live validation is complete.
Scope: the hearing participant's speech-to-text module, extracted from task 2.A2.
This document supplements plan.md; it does not replace its ledger or task checks.

## Outcome

Specify a browser speech-to-text module that can be built and checked independently.
Its output is transcript callbacks. A later integration phase assigns caption IDs,
participant metadata and timestamps, renders captions, and sends them through LiveKit.

Flow: local microphone -> recognition provider -> transcript callback -> later caption adapter.

## Existing repository interfaces

- web/src/lib/stt.ts does not exist in the inspected clone.
- plan/tasks/2.A2.md specifies OnTranscript, Stt, and startWebSpeech. It also includes
  metrics, Chips, and Consent; those remain separate work.
- web/src/lib/types.ts already defines Caption with kind 'speech', final, id,
  speaker, role, text, and ts. No shared-type change is required for this module.
- web/src/lib/captions.ts updates existing captions by ID through upsertCaption.
- web/src/lib/call.ts sends Caption objects through sendCaption.
- web/src/components/CaptionLane.tsx already styles interim captions.

## Public API to preserve

Future implementation location: web/src/lib/stt.ts.

```ts
export type OnTranscript = (text: string, final: boolean) => void;
export type Stt = { kind: 'webspeech' | 'scribe'; stop(): void };

export function startWebSpeech(
  onText: OnTranscript,
  onError: (message: string) => void,
): Stt | null;
```

startWebSpeech is synchronous. It returns a session handle once startup is requested,
not proof that permission was granted or listening has begun. Unsupported environments
and immediate startup failures report an error and return null. Later permission,
service, and network failures report through onError. A later status API, if needed,
requires an explicit interface decision; callers must not infer microphone readiness
from a non-null handle.

The module does not import React, LiveKit, Caption, API clients, metrics, or sign logic.
Provider-specific browser event types stay private. Merely importing it never opens
or requests a microphone. Use English (en-US) initially, with interim results enabled.
The first provider is Web Speech; the scribe kind reserves compatibility for later work.

## Transcript semantics

- Trim leading/trailing whitespace; preserve recognized wording and punctuation.
- final=false replaces the current unfinished phrase. It is a revision, not an append.
- final=true commits a phrase and finishes its current revision sequence.
- Process changed browser results in order. Final results are emitted once per
  recognition-session result index, even if later events repeat earlier results.
- Identical wording in a later phrase is valid; do not deduplicate by text alone.
- If a browser event has multiple finalized results, emit each in order. Combine any
  remaining unfinished result fragments into one interim callback so the API has
  only one active draft at a time.
- Empty final results are ignored. An empty interim callback may clear an abandoned
  draft; it must never become an empty Caption message. An abandoned draft can occur
  when the provider retracts interim text, a session restarts, or recognition fails.
- No translation, paraphrasing, AI sentence cleanup, or confidence score is added.
- No audio or transcript is saved to disk or a database by this module.

The empty-interim and normalization rules refine the task's reference implementation
while preserving its exports. They must be covered by tests before implementation is
considered usable; the whole 2.A2 card must not be marked done for this subset.

## Lifecycle semantics

- The caller explicitly starts a session after user interaction and appropriate disclosure.
- The caller owns the single active session and stops it before replacing it.
- stop() is idempotent, cancels pending restarts, releases recognition resources,
  detaches listeners, and suppresses all later text/error callbacks for that session.
- Final text that arrives after explicit stop is intentionally discarded.
- Silence is normal. Recoverable endings can restart while the session is wanted.
- Permission denial, unavailable audio capture, unsupported language/service, and
  unsupported browsers terminate the attempt without repeated permission prompts.
- Network/repeated-start failures use a bounded recovery policy, specified and tested
  during Phase 3. Exhaustion reports an actionable error and requires explicit retry.
- Reset provider-result bookkeeping on a new provider session; ignore events from
  prior sessions after stop or replacement.

## Mock scenarios for acceptance

These are planned checks, not tests already run.

| Input | Expected callback behavior |
| --- | --- |
| Interim 'Are you', revised 'Are you hungry', final 'Are you hungry?' | Two draft replacements followed by one commit |
| A result event repeats an already finalized index | No duplicate commit |
| Two separately spoken phrases both say 'Hello' | Two distinct commits |
| One event includes a final phrase and an unfinished next phrase | Final callback first, then one interim draft |
| Several unfinished fragments arrive together | One combined draft, not separate caption rows |
| Provider removes the unfinished result | Empty interim callback clears the draft |
| Unsupported browser or synchronous start failure | One useful error, null return, no microphone session |
| Permission denied after startup | Error callback, no restart loop |
| stop() twice, followed by delayed result/error/end events | No throw, callbacks, or restart |
| Recoverable end followed by a fresh recognition session | Fresh result indexes work; previous commits are not replayed |

Phase 1 planning is complete when this contract, file boundaries, and scenarios are
written and checked against the existing call interfaces. An executable fake-recognizer
harness and tests are the first verification deliverables during implementation;
planning alone does not establish that those checks pass.

## Implementation phases after this plan

1. Phase 2: create stt.ts and stt.test.ts; implement capability detection, basic
   start/stop, result normalization, and fake-provider tests.
2. Phase 3: add cancellation, error classification, bounded recovery, and lifecycle tests.
3. Phase 4: add an isolated development microphone check with disclosure, verify it
   in the target browser, and document limitations and integration instructions.
4. Phase 5: integrate in the call and perform the two-laptop acceptance check.
5. Optional later phase: Scribe provider and runtime fallback, following task 4.4.

Future implementation checks: npm --prefix web test, npm --prefix web run build,
and npm --prefix web run lint. No dependency install, provider call, or microphone
access is needed just to produce this Phase 1 plan.

## Leave out and hand off

| Work left out of the standalone module | Later owner / integration obligation |
| --- | --- |
| Room join/leave/reconnect and participant roles | Call integration: start only for hearing role after consent and connection; stop on leave, cancellation, and navigation |
| Caption IDs, names, role, timestamps | Caption adapter: preserve ID across draft revisions/finalization; new ID per committed phrase |
| Caption rendering and LiveKit sending | Call integration: reuse CaptionLane, upsertCaption, and sendCaption; coalesce rapid interim updates and preserve final-message order |
| Draft clearing | Caption adapter: remove its current unfinished row on empty interim or stop; never send an empty caption |
| Network interruption during delivery | Call integration: define stale-interim handling and final-caption delivery/retry behavior without duplicating messages |
| Microphone publication/mute policy | Call integration: coordinate call and recognizer lifecycle; stopping recognition must not disable an unrelated LiveKit microphone track |
| Generated voice echo | Voice/call integration: coordinate actual playback with recognition and test with headphones and speakers; request echo cancellation where supported without promising perfect suppression |
| Full consent screen and application settings | UI integration: include speech-provider processing disclosure before enabling recognition |
| Metrics, database storage and dashboard | Other 2.A2 work / server lane; do not log transcript content as part of STT |
| ASL, sign chips, Gemini, text-to-speech, model training | Their existing tasks; no dependencies added to standalone STT |
| API keys and Scribe token endpoint | Optional provider upgrade; browser Web Speech needs no application API key |
| New routes, App.tsx and production Call.tsx edits | Later integration; agree the development harness location when Phase 4 starts |

For this planning request, create only this document. Preserve application source,
server/.env, dependency manifests, plan.md statuses, and remote main. Future source
work must reconcile with the current repository before editing and must not weaken
existing verification blocks. A remote update still requires the user's approval.

## Remaining proof

Mock tests prove callback and lifecycle behavior, not recognition accuracy. A live
microphone/browser check and the later two-laptop check remain required. Default
browser recognition may process audio remotely; do not claim offline or entirely
on-device operation. No provider credentials belong in the frontend or this document.