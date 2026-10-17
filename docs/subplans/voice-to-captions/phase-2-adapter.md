# Voice-to-captions sub-plan: Phase 2 implementation plan

> Scope: voice-to-captions only. Phases 1-6 are local to this sub-plan and do not renumber, replace, or modify the main project phases or ledger. See [the sub-plan overview](README.md) and [the main project plan](../../../plan.md).


Status: implemented; automated verification passed. See [the handoff](phase-2-handoff.md).
Predecessor: phase-1-interface.md. Scope: standalone Web Speech adapter and fake-provider tests.
This is the speech subset of task 2.A2, not completion of the full card.

## Deliverable and stopping point

Create a module that converts browser recognition events into predictable interim/final
text callbacks. Demonstrate its behavior with Vitest in the existing Node environment.
Stop once the standalone module, its tests, and existing frontend checks pass. This
milestone is not live microphone validation, resilient continuous captioning, or call integration.

No API keys, provider account, microphone, camera, backend, or second laptop are needed
for these mocked checks. Real microphone behavior remains a later acceptance check.

## File boundaries

Future implementation may create only:
- web/src/lib/stt.ts: public exports, private browser types, session lifecycle, result handling.
- web/src/lib/stt.test.ts: fake recognition constructor, event builders, behavior tests.

Keep test helpers inside stt.test.ts while they are small. Do not add a test framework,
DOM emulator, dependency, package script, global TypeScript declaration, or browser route.
The existing Vite configuration discovers src/**/*.test.ts under test.environment=node.
Use Vitest global stubs and restore them after each test.

For this planning request, add only this document. Preserve Phase 1, source code,
server/.env, dependency manifests, plan.md statuses, Git history, and remote main.
Do not fetch/pull or apply remote updates to the Downloads clone without the user's
specific approval. Before future implementation, inspect local changes and compare
remote state separately; a plan file does not authorize an update.

## Public interface

Keep the names and signature expected by tasks 2.A2 and 2.A3:

```ts
export type OnTranscript = (text: string, final: boolean) => void;
export type Stt = { kind: 'webspeech' | 'scribe'; stop(): void };
export function startWebSpeech(
  onText: OnTranscript,
  onError: (message: string) => void,
): Stt | null;
```

Only kind 'webspeech' is constructed now. A non-null return means startup was requested;
it does not establish that the browser granted permission or started capturing audio.
No callbacks carry Caption objects, identities, room information, timestamps, or IDs.

## Step 1: define the smallest browser boundary

Inside stt.ts, define private structural types for the constructor, instance, result
list, alternative transcript, and error events actually used. Avoid broad any types,
new dependencies, enums, and constructor parameter properties.

Read browser globals only inside startWebSpeech. Prefer SpeechRecognition and fall back
to webkitSpeechRecognition. A Node import with no window must succeed without side
effects. Calling the function without a supported constructor reports an actionable
error and returns null.

Configure continuous=true, interimResults=true, and lang='en-US'. Install handlers
before calling start(). Catch constructor/start exceptions, release a partially created
session, report one safe error, and return null. Error messages must never contain
configuration values or credentials.

## Step 2: build the fake recognizer before result logic

The fake constructor records each instance and start/abort/stop calls. It supports:
- configured constructor and start failures;
- a result event with resultIndex and an array-like results list;
- interim and final alternatives at numeric indexes;
- explicit error and end events;
- invoking previously captured handlers after teardown to model already queued events.

Stub window with the fake constructor for supported tests; remove it for unsupported
and import-safety tests. Restore globals, mocks, and module state after each test.
Use the real exported startWebSpeech in tests; do not export internals solely for testing.

## Step 3: normalize results

Maintain session-local bookkeeping: active flag, committed result indexes, and the last
unfinished text. Read alternative zero, trim only surrounding whitespace, and preserve
wording/punctuation. Do not correct grammar or call an AI service.

For each result event:
1. Ignore it if the session is inactive.
2. Process changed result indexes in order. Emit each nonempty newly final result once
   as onText(text, true). Mark an empty finalized index processed without emitting text.
3. Rebuild the unfinished draft from all currently interim results, including fragments
   before resultIndex that remain present and unchanged. Join trimmed nonempty fragments
   with a single space.
4. Emit one combined onText(draft, false) if a nonempty draft changed or follows a newly
   committed phrase. This allows an identical draft string after a commit to represent
   the next phrase correctly.
5. If an unfinished draft was removed without a final callback consuming it, emit
   onText('', false) to clear it once. Do not emit a redundant empty callback after a
   final has already consumed the last draft.

Deduplicate committed results by provider result index within this session, never by
text. Two different finalized indexes can legitimately contain exactly the same text.
The ordered callbacks must also work when one event commits several phrases and
introduces another draft. No result state is shared between separate adapter instances.

## Step 4: basic shutdown and errors

Implement minimum safe lifecycle behavior in Phase 2:
- stop() marks the session inactive before interacting with the provider; repeated
  calls are harmless. Detach handlers and abort recognition so late finals are discarded.
- The stop path emits no callbacks. The future caller clears its own unfinished UI row
  when it requests stop, as specified by Phase 1.
- Captured/queued callbacks check active so detaching handlers alone is not relied on.
- A normal provider end clears an outstanding draft before closing the session.
- A provider error clears an outstanding draft, reports a useful error, and closes the
  session. Permission denial must not cause a retry loop.
- If cleanup itself throws, absorb that cleanup error after deactivation and handler
  removal; do not throw from repeated stop or revive a failed session.

For this intermediate milestone, provider end/error terminates the session. Do not add
an immediate restart loop. Phase 3 introduces deliberate silence handling, error
classification, bounded retries, recovery timers, and cancellation during those retries.
Document this temporary limitation in stt.ts so the module is not integrated early.

## Planned acceptance tests

| Case | Observable expected result |
| --- | --- |
| Import with no window | No microphone request, constructor call, or import exception |
| No recognition constructor | Error once, null return |
| Standard and prefixed constructors both exist | Standard constructor selected |
| Only prefixed constructor exists | Prefixed constructor works |
| Constructor/start throws | Null return, one error, handlers/resources cleaned up |
| Start succeeds | Requested configuration applied; kind='webspeech'; start called once |
| Interim 'Are you', revised 'Are you hungry', final 'Are you hungry?' | Callback sequence false, false, true with replacement text |
| Previously finalized index appears again | No duplicate final callback |
| Final 'Hello' at indexes 0 and 1 | Two final callbacks |
| Two finals and one draft in one event | Both final callbacks in order, then one combined interim |
| Earlier interim fragment unchanged while later fragment changes | Revised draft retains the earlier fragment |
| Several interim fragments | One combined interim callback |
| Results list shrinks/removes all interim text | One empty interim clears the existing draft |
| Empty/whitespace final result | No empty final callback |
| Surrounding whitespace plus punctuation | Outer whitespace trimmed; punctuation preserved |
| stop() twice | No throw; provider teardown only once |
| Queued result/error/end after stop | No transcript/error callbacks and no restart |
| Error or normal end with a pending draft | Draft cleared; appropriate error behavior; session closed |
| New adapter instance after one stops | Fresh result index zero accepted |

Test observable behavior and resource cleanup rather than private helper names or source
text. Mocking proves the adapter's logic; it does not prove recognition accuracy.

## Verification sequence during implementation

From the repository root, after installing locked web dependencies if absent:

```sh
npm --prefix web test -- src/lib/stt.test.ts
npm --prefix web test
npm --prefix web run build
npm --prefix web run lint
```

Use a compatible Node runtime per README. Run checks only against the intended local
revision; preserve local work. If a command cannot run or an unrelated existing failure
occurs, record it honestly and distinguish it from a new STT regression. Do not weaken
checks, edit unrelated code to hide failures, or claim a passing result that was not run.
Never load server/.env or use real service credentials in these tests.

The full task 2.A2 verifier also requires metrics.ts, Chips.tsx, and Consent.tsx. Do not
mark 2.A2 DONE or loosen its verification block for this standalone milestone. Record
subset progress in the handoff; any parent-ledger changes require the applicable
repository workflow and checks.

## Explicitly deferred work

| Deferred work | Assigned phase / part |
| --- | --- |
| Error categories, retry budgets/backoff, silence restarts, retry cancellation | Phase 3 |
| Real microphone page, permission disclosure, listening UI, browser accuracy checks | Phase 4 |
| Caption IDs, names, timestamps, shared Caption construction | Phase 5 caption adapter |
| Clear local draft when stop is requested, interim coalescing, ordered sending/retry | Phase 5 caption adapter / transport |
| LiveKit, join/leave/reconnect, hearing-role enforcement and microphone publication | Phase 5 call integration |
| Generated-voice echo coordination, headphones/speaker acceptance | Phase 5 voice/call integration |
| Production consent screen, Chips, metrics, database and dashboard | Other task 2.A2 work and existing owners |
| ASL recognition, Gemini, generated speech, model training | Their existing plan cards |
| ElevenLabs Scribe, tokens, provider fallback, new SDK dependency | Optional task 4.4 after baseline works |
| Browser status callback or richer per-segment public protocol | Explicit future interface decision if required |

## Required handoff after implementation

Report created files, exported interface, exact passing/failing commands, and known
limitations. Explicitly state that automatic restart is pending Phase 3, real microphone
verification is pending Phase 4, and two-laptop delivery is pending Phase 5. Include no
API key values, transcripts from real participants, or claims that all of 2.A2 is done.

## References checked for this plan

- Existing plan/tasks/2.A2.md and docs/subplans/voice-to-captions/phase-1-interface.md.
- Existing Node Vitest configuration and web/src/lib/captions.test.ts.
- Web Speech API event/result semantics: https://webaudio.github.io/web-speech-api/#speechreco-event
- Vitest global stubbing: https://vitest.dev/api/vi.html#vi-stubglobal