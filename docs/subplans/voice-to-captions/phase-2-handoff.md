# Voice-to-captions: Phase 2 handoff

Status: standalone adapter implemented and automated checks passed.
Next gate: explicit user approval before Phase 3. No real microphone or call test run.
Base local commit: 33ed381 (vocab v2). Code remains local for review; no pull or push performed.

## What changed

- web/src/lib/stt.ts: OnTranscript, Stt, and startWebSpeech exports; standard/prefixed
  browser detection; English continuous interim configuration; safe startup failure;
  array-like result processing; draft replacement; once-per-index finals; repeated
  phrase support; empty-interim clearing; idempotent abort/handler cleanup.
- web/src/lib/stt.test.ts: fake recognizer and 32 cases including lifecycle, queued
  events, cleanup exceptions, and stopping synchronously inside callbacks.
- Updated only this sub-plan's progress/handoff documentation, not the main project ledger.

The adapter reads no provider keys and creates no call/network client or recording.
Browser recognition may itself use a remote speech service once enabled in a future UI.
No application import starts a microphone. A returned session means start requested,
not microphone-ready. Explicit stop suppresses later callbacks and discards the draft;
its future caller must clear the displayed draft itself.

## Actual verification

Used bundled Node 24.19.0. npm is not on the shell PATH, so the bundled pnpm launcher
ran npm 11.21.1 via --package=npm@11 dlx npm. Commands below are the npm arguments used:

```text
npm --prefix web ci --no-audit --no-fund
  PASS: 82 locked packages installed; manifests/lockfile unchanged.
python plan/verify.py preflight --lane call
  PASS: PREFLIGHT OK (bundled Python used).
npm --prefix web test -- src/lib/stt.test.ts
  Initial RED: could not import ./stt before the implementation existed.
  Final PASS: 1 test file, 32 tests passed.
npm --prefix web test
  PASS: 6 test files, 75 tests passed.
npm --prefix web run build
  PASS: tsc -b and Vite build passed.
npm --prefix web run lint
  PASS: oxlint exited 0.
```

Build reports a nonfatal chunk-size warning (main chunk about 936 kB minified).
Dependency installation reports upstream install-script policy notices; checks above
still passed. No unrelated optimization, dependency upgrade, or install policy change
was made to remove those notices.

Scope review passed: plan.md, package.json, package-lock.json, types.ts, call.ts, and
Call.tsx are unchanged. server/.env, web/node_modules, and web/dist are Git-ignored.
Only the two intended source files and sub-plan documents are new/changed.

## Behavioral coverage

- Import without window and unavailable browser return behavior.
- Preference for standard constructor and fallback to the prefixed constructor.
- Constructor, configuration, and start exceptions without exposing raw details.
- Interim replacement, multiple finals in order, repeated words at different indexes.
- Unchanged earlier interim fragments and shrinking result lists.
- Blank result filtering, draft withdrawal, and punctuation preservation.
- Explicit stop twice, already queued events after stop, and cleanup failure.
- Terminal network/permission error and normal end without a restart loop.
- Fresh sessions reusing index zero; stop inside transcript or draft-clearing callbacks.

## Limits and next phase

End/error currently closes the recognizer and requires explicit new startup. Automatic
silence restarts, error classification, bounded retries, watchdogs, and recovery timers
are Phase 3 and have not been started. The public interface has no readiness observer;
that deliberate additive decision remains in Phase 4.

No real microphone, recognition accuracy, provider connectivity, browser permission
UI, remote caption delivery, or generated-audio echo behavior has been validated.
The local microphone test environment is Phase 4; two-laptop integration is Phase 5.
Scribe is Phase 6, after a separate approval. This subset does not complete task 2.A2.

## Main project status (unchanged)

Ledger: DONE 3; HUMAN 12; NEEDS-HUMAN 7; PARTIAL 3; TODO 16.
Main call lane's next task remains 2.A1 (voice output), which is outside this approved
speech sub-plan phase. Existing live checks 1.B1, 1.A1, 1.C1, 1.C2, 1.C5, 1.C4, and
4.2 remain pending; see the main ledger for their detailed checks.

Remote main was compared read-only and is newer than this local base. It was not pulled
or applied, in accordance with the user's approval rule. Preserve the local adapter and
sub-plan files when reviewing a future remote update; do not overwrite incoming conflicts.