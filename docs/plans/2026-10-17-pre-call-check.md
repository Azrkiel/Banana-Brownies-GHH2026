# Pre-call checks implementation plan

Goal: check local camera and microphone before connecting to the selected conversation room.
Architecture: a cancellable media-check controller owns independent camera and microphone streams. A React PreCall component renders checks and an audio meter. CallRoom gates RoomSession; joining releases check streams before existing call acquisition.
Tech stack: React, TypeScript, getUserMedia, Web Audio, Vitest; no new dependencies.

Flow:
Lobby form -> room URL (name/room/role) -> PreCall
  -> Start camera -> local preview OR permission error -> retry
  -> Hearing: test microphone -> local meter OR permission error -> retry
  -> Signer: microphone off
  -> Join enabled when required tracks live -> stop test media -> RoomSession -> LiveKit
  -> cancel/navigation/pagehide -> invalidate pending requests -> stop tracks
  -> ended track -> checks incomplete -> retry

Files: lib/mediaCheck.ts owns media lifecycle; lib/mediaCheck.test.ts verifies permissions/races/cleanup; components/PreCall.tsx and PreCall.css own local preview/checks; pages/Call.tsx gates all room entry/reentry; lib/preCall.test.ts verifies the rendered entry gate.

- [x] Write lifecycle tests for independent acquisition, denied mic with working camera, cancellation, concurrent requests and ended tracks. Run `npm --prefix web test -- src/lib/mediaCheck.test.ts`: expect missing-module failure.
- [x] Implement `createMediaCheck` with `start(kind)`, `stop(kind)` and `dispose()`, guarded by a generation per device. Re-run targeted tests: expect all pass.
- [x] Build PreCall with explicit device controls and a microphone meter using AudioContext connected only to an analyser. Close context/cancel animation frame on stop/unmount. Add server-rendered gate tests covering signer/hearing/direct room URLs, required disabled Join and invalid room links.
- [x] Replace automatic room entry with PreCall then RoomSession, returning through PreCall on rejoin. Update lobby button and privacy text. Keep the existing room connection and speech code unchanged.
- [x] Run full frontend tests/build/lint, inspect privacy/resource paths and git diff. Record real-device checks as pending. Commit only feature files and fetch/integrate before push under repo workflow.

Validation: 167 frontend tests passed (9 added), production build passed, lint passed, git diff whitespace check passed. Build retains the existing large LiveKit chunk warning. SSR tests verify direct signer/hearing room links render the gate and preserve room/name. Controller tests verify denial/retry, independent devices, pending cancellation/disposal, duplicate requests and ended tracks. Source review covered local-only acquisition, stream cleanup, Web Audio cleanup and no speaker connection. No browser surfaces are available in this session; preview, meter movement, permission UI, responsive layout and two-laptop calls require desktop Chrome verification. Ledger cards unchanged; this is the user-requested pre-call scope, not the broader recognition roadmap.
