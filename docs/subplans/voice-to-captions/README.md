# Voice-to-captions sub-plan

> Scope: voice-to-captions only. Phases 1-6 are local to this sub-plan and do not renumber, replace, or modify the main project phases or ledger. See [the sub-plan overview](README.md) and [the main project plan](../../../plan.md).


Published code: [13b6b5d](https://github.com/Azrkiel/Banana-Brownies-GHH2026/commit/13b6b5dca135b65510476777df20902db4ee4b86), pushed to main on October 17, 2026.

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

| Phase | Deliverable | Status and remaining proof |
| --- | --- | --- |
| [1: interface](phase-1-interface.md) | Standalone callback contract and scope | Complete: compatibility reviewed |
| [2: adapter](phase-2-adapter.md) | stt.ts with fake-provider tests | Complete: automated checks passed |
| [3: recovery](phase-3-recovery.md) | Bounded retry, cancellation, stale-event protection | Complete: timer/race regression checks passed |
| [4: microphone](phase-4-microphone-validation.md) | Development check page, state observer, device evidence | Code published; basic Chrome checks passed; stability, accuracy, timing and live error checks pending |
| [5: call integration](phase-5-call-integration.md) | Role/consent wiring, remote interim/final captions and draft removal | Code published; automated checks passed; two-laptop, live failure, latency, accessibility and echo checks pending |
| [6: optional Scribe](phase-6-scribe-optional.md) | Alternate provider with controlled fallback | Not started; requires explicit approval |

Implement in order. Phases 1-3 agree the small adapter interface; Phase 4 deliberately
adds an optional state observer for accurate UI. Phase 5 coordinates a small shared
caption/control protocol extension for ordered speech revisions and remote draft
clearing. These additive contracts are now implemented in the published code.
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
Phase 6 requires separate approval and has not started. The reviewed speech integration
has been committed and pushed in 13b6b5d; full live acceptance remains pending.
The final delivery includes the local speech-testing environment and launch instructions.
