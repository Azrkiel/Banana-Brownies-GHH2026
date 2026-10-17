# Voice-to-captions sub-plan: Phase 5 call integration and acceptance plan

> Scope: voice-to-captions only. Phases 1-6 are local to this sub-plan and do not renumber, replace, or modify the main project phases or ledger. See [the sub-plan overview](README.md) and [the main project plan](../../../plan.md).


Status: implementation and automated checks complete; live acceptance pending.
The user explicitly authorized call integration during the GitHub merge while Phase
4 stability/accuracy/timing remain pending. See phase-5-handoff.md for tested behavior
and limitations. This phase connects speech captions to the existing call.

## Outcome

After consent, a connected hearing participant enables speech captions and speaks.
Interim text updates on both screens, finalized text remains once, and stopping,
leaving, recovery, or failed recognition cannot leave stale drafts or microphones.
Typed captions and video calling continue to work if recognition is unavailable.

## Coordinate before editing shared integration files

Read current local source and active lane work; preserve user changes. The new speech
integration must survive the larger task 2.A3 Call.tsx work. Do not replace Call.tsx
with an old reference or rebuild unrelated ASL controls.

Proposed future files:
- web/src/lib/speechCaptions.ts and speechCaptions.test.ts: pure draft/final adapter,
  ordering, delivery state, and cleanup.
- web/src/lib/captions.ts and captions.test.ts: speech revision/removal rules while
  preserving existing typed/English caption and retraction behavior.
- web/src/lib/call.ts and call.test.ts: minimal sender metadata/protocol plumbing.
- web/src/pages/Call.tsx: small speech lifecycle wiring and controls.
- A small speech-specific component/CSS if useful; no general page redesign.
- web/src/lib/types.ts: only the explicitly coordinated additive protocol below.
- Existing Consent component/text: coordinate with its owner; do not implement the
  unrelated Chips, metrics, gloss, or ASL screen just to obtain it.

No backend redesign or new dependency. App.tsx needs no new production route.

## Caption lifecycle and remote clearing decision

The current Caption shape supports speech and final but has no revision or deletion
operation. The current upsert helper alone cannot remove a withdrawn remote draft.
Resolve this deliberately rather than sending an empty Caption or marking abandoned
speech as a signer retraction.

Proposed coordinated protocol addition for this integration:
- optional Caption.revision number for ordered speech updates; leave existing caption
  producers compatible;
- Ctrl variant { type: 'caption-clear'; id: string; revision: number };
- sender identity passed from the LiveKit text-stream metadata to onCaption, as already
  done for onCtrl. Track source identity internally, not by display name.

Announce these exact shared-contract changes to the team before implementation and
update all affected readers/tests together. If shared-file coordination is unavailable,
stop at a local integration prototype; do not claim full remote-interim acceptance.
These additive contract changes are now implemented under the user's integration request.

Allocate a new UUID for each utterance and keep it through interim revisions and its
final. Set kind='speech', role='hearing', speaker, timestamp, and monotonically increasing
revision. Use the existing Caption display and transport.

On an empty interim callback or requested stop, remove the local unfinished row and
send caption-clear for a previously transmitted unfinished row. Clear messages can
remove only speech drafts owned by the sending participant. They must never remove
finalized, typed, English, or retracted signer captions. Validate incoming payloads.

Serialize/coalesce sends and guard receivers against reordering: ignore stale revisions,
ignore interim updates after a final or clear for that ID, and retain bounded recent
terminal-ID records for the room session. Specify a size/time bound and test it; do
not create an unbounded transcript store. Clear/terminal state must not resurrect on
a late asynchronous text-stream read.

## Step 1: pure caption adapter and delivery

Keep recognizer callbacks independent of React and LiveKit. Inject send/update/remove
functions into the adapter so tests run with fake transcript events and deferred sends.

Coalesce interim sending to at most once every 200 ms; always keep the newest text.
A final cancels pending interim work for that utterance and is queued immediately.
A clear supersedes its queued interim updates. Use stable IDs for retries and preserve
utterance order; never generate a fresh ID just because a send failed.

Keep a small in-memory final retry queue: proposed maximum 20 items, maximum age
30 seconds, and at most two retries per item after 500 ms and 1500 ms while the same
room session is connected. Surface expired/overflow/failed delivery so the person can
type or retry explicitly. Do not silently drop final captions or replay speech into a
new room session. Typed captions retain their existing draft-on-failure behavior.

LiveKit send completion is not an end-user read acknowledgement. State delivery results
accurately and do not claim guaranteed exactly-once delivery across disconnects.

## Step 2: call and microphone ownership

- Require explicit speech-processing disclosure/consent before enabling recognition.
  Retain the full product's required consent screen through its separate integration.
- Start only for hearing role after successful connection and an explicit captions
  enable action. Joining as signer must never start speech recognition.
- Give captions a separate enable/disable control. Stopping captions stops recognition,
  not the hearing participant's published microphone track.
- A call microphone mute action must also pause recognition to honor the expected
  microphone privacy control. Resume only when captions remain enabled, consent is
  valid, and the user has unmuted in the current connected session.
- On reconnecting, stop recognition and remove unfinished drafts; retain captions intent.
  On reconnection, restart at most one session if still enabled/consented and not muted.
  Do not resume after explicit captions disable, terminal permission failure, or leave.
- On leave, cancellation, unmount, participant role change, or terminal disconnect:
  invalidate session callbacks, stop recognition, cancel sends/retries, and clear room
  draft state. Keep guards for promises resolving after navigation.
- Do not alter camera ownership or the existing LiveKit join/cancel/media cleanup.

## Step 3: accurate controls and caption presentation

Use Phase 4's state observer for starting/listening/retrying/failed states. Keep speech
status separate from call connection and audio-playback status. Maintain usable typed
captions and a clear retry action on terminal failure. Display partial versus final
text distinctly without announcing every word excessively to assistive technology;
verify keyboard focus, controls, contrast, and screen-reader behavior in browser QA.

Show the hearing participant and role consistently. Do not use display-name equality
as the sole message identity/security check. Do not save conversation text or audio
to localStorage, analytics, console, or database as part of this feature.

## Step 4: coordinate generated voice with its owner

Consume the existing/agreed generated-audio playback signals; do not implement TTS.
The voice owner must define actual playback start, finish, cancellation, and timeout.
Use those lifecycle events to pause/restart recognition where needed, rather than only
dropping callbacks by timestamp (late recognition results can otherwise leak echo).

Test headphones first, then speakers. Explain that pausing to avoid echo can miss
overlapping speech; request turn-taking for the demo. Echo-cancellation settings do
not prove that generated speech cannot be captioned. If the TTS feature is not ready,
use a clearly labeled simulated playback fixture for automated wiring checks and
leave the actual echo check pending.

## Planned tests and live check

Automated tests:
- draft revisions/final keep one ID; repeated phrases produce different IDs;
- coalescing keeps latest interim, finals are not delayed behind obsolete drafts;
- clear and final beat stale/interleaved updates; one peer cannot clear another's text;
- send rejection/timeout, retry budgets, queue expiry/overflow and reconnect handling;
- local-caption disable, call mute, role change, navigation, join cancellation, late
  promises, terminal permissions, and TTS pause/resume cannot create extra recognizers;
- existing typed caption, retraction, video, audio, and media cleanup tests still pass.

Run focused tests, the full frontend suite, build, and lint. If other affected checks
exist, run those too without changing their acceptance rules.

Real two-laptop acceptance:
1. Start with consent and captions off: no speech recognition on either laptop.
2. Join as hearing and signer; enable captions on hearing laptop only.
3. Read ten neutral phrases and repeat one twice. Verify interim replacement, correct
   speaker, one final per phrase, and no duplicates on both screens.
4. Stop mid-phrase and verify no stale interim remains remotely; restart explicitly.
5. Exercise mute/unmute, temporary disconnect/reconnect, denied permission, leave,
   and navigation. Confirm typed captions remain useful and no capture survives leave.
6. With voice feature available, run generated-speech feedback checks with headphones
   and speakers. Confirm any limitations and actual pause/resume behavior.
7. Measure speech-to-remote-final latency using a documented method; report trial count
   and p50/p95. Proposed demo target: remote-final p95 below 4 seconds under the tested
   network conditions. Separate local recognition and transmission contributions.
8. Rehearse a ten-minute conversation with pauses; record pass/fail/pending results
   against the exact tested commit without saving personal transcript/audio.

## Acceptance and deferred work

Speech captioning is ready only when automated checks and the required real two-laptop
checks pass. If the TTS owner is unavailable, speech-only integration may pass with the
echo acceptance explicitly pending; the whole product is not complete.

Leave ASL classifier/pipeline, Gemini gloss generation, TTS generation/cache, sign
correction/retraction controls, training, metrics/database, deployment, slides, and
submission to existing owners. Scribe remains optional Phase 6. Task 2.A2/2.A3/3.3
statuses can change only when their entire existing checks and human requirements pass;
this speech integration is only a subset of those cards.

Handoff: exact files/contracts, commands and outputs, two-laptop results, latency,
delivery/retry limits, consent text, pending voice checks, and known failures. Retain
a recoverable validated commit through the normal authorized repository workflow.
Updating this Downloads clone from remote still requires the user's approval.

## Sources

- Current repository Caption/Ctrl, captions.ts, call.ts, Call.tsx, and tasks 2.A2/2.A3.
- LiveKit text streams: https://docs.livekit.io/transport/data/text-streams/
- Protocol additions, queue bounds, and timing targets above are proposed project policy.
