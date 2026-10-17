# Voice-to-captions sub-plan: optional Phase 6 Scribe upgrade plan

> Scope: voice-to-captions only. Phases 1-6 are local to this sub-plan and do not renumber, replace, or modify the main project phases or ledger. See [the sub-plan overview](README.md) and [the main project plan](../../../plan.md).


Status: planning only. Optional; it must not delay a working Web Speech demo.
Prerequisites: Phases 2-5 complete for the supported baseline; coordinate with task
4.4's actual dependencies, including the task 2.A3 call screen. Keep the baseline
available until the new provider and fallback pass acceptance.

## Outcome

Add an alternative realtime speech provider with the same transcript/lifecycle contract.
Use the existing server's short-lived token route; the permanent provider key stays on
the server. Fall back to Web Speech on eligible provider failures without running two
microphone recognizers or replaying stale partial text.

## First resolve dependency compatibility

Task 4.4 references @elevenlabs/client ^1.28.0, while current official client-side
examples use different SDK packages. Before installing, inspect the locked project,
verify the intended package's actual Scribe APIs, and document the chosen compatible
version. Prefer the task's permitted dependency when verified to work. A different
package requires a deliberate recorded task/dependency decision; do not silently
substitute a library, rewrite task checks, or install multiple SDK stacks.

No SDK or account changes are made while planning. Do not buy credits, change billing,
or increase quotas without the user's separate authorization.

## Files and boundaries

Expected integration files: stt.ts/stt.test.ts, a small provider supervisor and tests if
needed, api.ts, Call.tsx, and the approved web package/lockfile. Verify the existing
/api/scribe-token route with the backend owner; adjust backend code/tests only where
the actual token contract or safe endpoint access requires it. Avoid changes to the
recognizer, ASL, vocabulary, Gemini, TTS, database, and unrelated UI.

Retain OnTranscript and Stt. Support the optional state observer introduced in Phase 4.
Maintain startWebSpeech. Preserve startScribe's existing promised Stt result where the
task expects it; own cancellation of its asynchronous startup in the supervisor or a
documented additive AbortSignal parameter. Existing calls remain compatible.

## Provider lifecycle

1. Read current official provider documentation and verify actual SDK events, model,
   token response, and microphone configuration before implementation.
2. Fetch a fresh short-lived token through the local backend. Never ship the permanent
   key in frontend code, a VITE variable, browser storage, logs, or this plan.
3. Treat token acquisition, connecting, and listening as different states. Do not
   report listening before the provider confirms readiness.
4. Normalize partial and committed results into the existing draft/final semantics,
   using provider event identifiers where available. Keep real repeated phrases valid.
5. Request echoCancellation/noiseSuppression when supported. These are aids, not proof
   that generated-audio feedback is solved; retain Phase 5 playback coordination.
6. On explicit stop/navigation, cancel token fetch/startup where possible, invalidate
   the session, and close any provider handle that resolves late.
7. On runtime failure after startup, terminate/confirm closure before fallback. Handling
   only the initial promise rejection is insufficient.
8. Clear the unfinished draft when switching providers. Keep finalized captions already
   shown; never concatenate an old provider's draft into the new provider's phrase.

## Fallback policy

Use a single logical session owner, not competing independent restart loops.
Eligible cases include token/network/provider-service failures. Switch to Web Speech
at most once in the current logical session after Scribe closes. Do not automatically
switch back or ping-pong. A new explicit start may prefer Scribe again.

Permission denial or deliberate microphone disable is terminal; never bypass it with
another provider. On unsupported Web Speech or fallback failure, stop safely, show the
reason, and leave typing available. Share a bounded attempt policy across startup,
runtime failures, and fallback; do not stack unbounded provider retries on Phase 3's
own budget. Honor current hearing role, consent, mute state, connection, and playback
pause before any fallback starts.

A fallback cannot recover audio lost during the transition. State the gap plainly.
Update consent to explain the selected audio processor and possible fallback before
capture. Make provider changes visible without claiming automatic accuracy improvements.

## Token route verification with backend owner

Confirm that the permanent key is read only server-side, response contains the expected
short-lived credential, errors are sanitized, and token values are not logged/cached.
Prevent an openly deployed endpoint from granting arbitrary unauthenticated use of
the team's paid quota: agree appropriate room/session authorization and rate limits
with the backend owner before public deployment. This targeted coordination does not
authorize a broad authentication or backend redesign.

Use fake tokens and mocked requests in automated tests. A minimal live token/provider
check needs the configured development account and must not perform purchases or
unbounded requests. Keep provider credentials and token values out of evidence.

## Required tests

- SDK adapter normalizes partial/committed text and state events.
- Token rejection, malformed response, connection timeout, and late successful startup.
- Stop during token request/connection and while a fallback is pending.
- Startup failure and runtime error/disconnect each invoke fallback at most once.
- Permission denial invokes no fallback; both-provider failure leaves typed input.
- No concurrent provider capture, stale callbacks, duplicate committed rows, or orphan
  sockets/tracks/timers after any terminal path.
- Call mute, role switch, navigation, reconnect, or TTS playback cancels/guards provider
  transitions just as for the baseline.
- Existing Phase 2-5 tests continue to pass; run web tests/build/lint and affected backend
  tests. Keep task 4.4's full checks and human acceptance intact.

Live acceptance: repeat the Phase 4/5 neutral script, recording accuracy/latency on the
actual demo browsers; exercise a controlled service failure and verify fallback;
test headphones/speakers and leave cleanup. Compare measured outcomes with baseline,
not marketing claims. Browser compatibility must be observed on each supported browser.

## Completion and handoff

Optional phase is ready only after correct token handling, runtime fallback, no-capture
overlap, automated checks, and real acceptance are recorded. If optional tests fail,
keep or select the validated Web Speech baseline for the demo and document the failure.
Do not silently remove the fallback or call task 4.4 complete with live checks pending.

Handoff includes chosen SDK/version, actual APIs, provider state contract, fallback
limits, sanitized test results, baseline comparison, required server configuration
names only, and pending service/account checks.

## Leave out

No custom STT model training, multilingual UI, durable transcript history, recorded
audio upload/replay, TTS voice selection, ASL features, analytics/database, full auth
redesign, deployment provisioning, or paid-account changes.

## Sources and distinctions

- Existing plan/tasks/4.4.md is project intent, not proof that its old SDK snippet is current.
- Current provider client-side guidance:
  https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/client-side-streaming
- Earlier speech phase plans define the baseline contracts and acceptance.
- Fallback and cancellation policies above are project decisions to implement/test.
