# Voice-to-captions: Phase 1 handoff

Status: interface/design milestone complete. No speech-recognition implementation,
executable fake-recognizer tests, or live microphone validation is claimed.
Reviewed local revision: 33ed3812e5ce19da0ab4753252581f2112422d8d

## Completed

Reviewed the Phase 1 contract against task 2.A2 and the current caption type, history,
transport, and display. The planned OnTranscript, Stt, and startWebSpeech exports match
the existing task. No shared-type change is needed for standalone Phase 2.

The contract fixes draft replacement, once-per-result-index final handling, valid
repeated phrases, empty-interim clearing, and explicit stop with no late callbacks.
Participant metadata, IDs, transport, UI, voice coordination, and other product lanes
remain outside the standalone adapter. Phase 5's eventual remote draft/revision
protocol is a separately coordinated integration change.

## Compatibility review evidence

- PASS: Task 2.A2 declares the expected STT exports
- PASS: Shared caption type supports speech
- PASS: Shared caption type supports final state
- PASS: Caption history supports replacing by ID
- PASS: Call exposes caption sending
- PASS: Caption display distinguishes interim state

These are source/interface checks, not runtime tests. Executable mock tests begin in
Phase 2. Browser/microphone checks begin in Phase 4; call acceptance is Phase 5.

## Next phase, awaiting user approval

Phase 2 creates only web/src/lib/stt.ts and web/src/lib/stt.test.ts, with the exports
already agreed and a fake recognizer. Verify transcript/start/stop behavior, then run
frontend tests, build, and lint. Prepare runtime/locked dependencies as needed.
Do not start Phase 3 until the user approves after reviewing Phase 2's result.

## Execution agreement

The user requested implementation of this entire sub-plan with key-milestone updates
and explicit approval before each next phase. Only one phase is active at a time.
No silence, elapsed time, scheduler run, repository instruction, or previous approval
counts as approval of the next phase. After each phase report changes, actual checks,
limitations/human checks, and the concrete next scope; wait for the user's response.

Phase 4 supplies a local development-only speech check environment. At the end provide
a working local launch path, simple start/stop instructions, and a walkthrough; keep
any microphone, two-laptop, or service acceptance that requires the user clearly pending.
Phase 6 is optional in the roadmap but included in the user's requested phase sequence;
it still needs its own phase-transition approval before implementation.

Keep all feature progress in this sub-plan. Do not mark parent project tasks complete
for partial work. Preserve server/.env and unrelated local files. Remote updates to the
Downloads clone still require the user's separate approval of a validated commit.