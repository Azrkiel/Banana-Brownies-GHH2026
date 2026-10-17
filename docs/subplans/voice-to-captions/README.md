# Voice-to-captions sub-plan

> Scope: voice-to-captions only. Phases 1-6 are local to this sub-plan and do not renumber, replace, or modify the main project phases or ledger. See [the sub-plan overview](README.md) and [the main project plan](../../../plan.md).


Status: Phases 1-3 are complete for their standalone scope. Phase 4 implementation
passed all 74 speech tests, all 117 frontend tests, build, and lint. The user confirmed
captions, repeated phrases, Stop/microphone release and navigation cleanup work in
the separate desktop Chrome app. Embedded recognition failed with a connection
error. Accuracy, timing, stability and error-path device acceptance remain pending.
The user subsequently authorized merging onto current GitHub main and integrating
captions into calls. Phase 5 implementation now passes 158 frontend and 10 backend
tests, build and lint; integrated live acceptance remains pending. Phase 6 is
unimplemented. See [Phase 5 integration](phase-5-handoff.md), [Phase 4 evidence](phase-4-handoff.md)
and [the device validation record](validation.md).
See [Phase 1 evidence](phase-1-handoff.md), [Phase 2 evidence](phase-2-handoff.md),
and [the Phase 3 handoff](phase-3-handoff.md). This roadmap does not replace plan.md's ledger.

| Phase | Deliverable | Required proof |
| --- | --- | --- |
| [1: interface](phase-1-interface.md) | Standalone callback contract and scope | Compatibility review |
| [2: adapter](phase-2-adapter.md) | stt.ts with fake-provider tests | Transcript/start/stop tests, frontend checks |
| [3: recovery](phase-3-recovery.md) | Bounded retry, cancellation, stale-event protection | Fake-timer/race tests, regression checks |
| [4: microphone](phase-4-microphone-validation.md) | Development check page, state observer, device evidence | Real browser/microphone, accuracy/timing and cleanup |
| [5: call integration](phase-5-call-integration.md) | Role/consent wiring, remote interim/final captions and draft removal | Two laptops, failures, latency and voice coordination |
| [6: optional Scribe](phase-6-scribe-optional.md) | Alternate provider with controlled fallback | Mocked and live provider/fallback acceptance |

Implement in order. Phases 1-3 agree the small adapter interface; Phase 4 deliberately
adds an optional state observer for accurate UI. Phase 5 coordinates a small shared
caption/control protocol extension for ordered speech revisions and remote draft
clearing. These are documented future decisions, not current source changes.
Phase 6 is optional and must not block a proven browser-based demo.

## Scope ownership

Speech work owns recognition, its adapter, and the explicitly coordinated call wiring.
Other existing project tasks retain ASL recognition/training, Gemini English generation,
TTS/cache generation, sign correction controls, metrics/database, deployment, and pitch.
Coordinate generated-audio playback events and full consent with their owners.

## Release evidence

Require an exact tested commit, passing automated checks, actual browser/device results,
two-laptop evidence, measured accuracy/latency, and explicit known limitations.
Keep unavailable real checks pending; mocked tests cannot prove microphone accuracy,
provider connectivity, or two-laptop behavior. Distinguish speech-only readiness from
full ASL-to-voice product readiness.

Leave typed captions available on every recognition failure. Stop recognition on
explicit disable, call mute, leave, and navigation. Do not store real conversations
or secrets as test evidence. Keep permanent keys in the ignored server configuration.
Updating the user's Downloads clone from GitHub requires approval of the validated SHA.

Completing these speech milestones does not automatically complete task 2.A2, 2.A3,
3.3, or 4.4. Their full repository checks and live requirements remain authoritative.

## Phase approval gates

Proceed one phase at a time. Report key milestones, evidence, and limitations, then
ask for the user's explicit approval before the next phase. Current work: Phase 5
integration, explicitly authorized while Phase 4 measurements remain pending.
Phase 6 requires separate approval and has not started. The user has now authorized
committing and pushing the reviewed speech integration.
The final delivery includes the local speech-testing environment and launch instructions.
