# Voice-to-captions device validation

Date: 2026-10-17. Scope: standalone Phase 4 only; no call integration.
Base commit: 33ed3812e5ce19da0ab4753252581f2112422d8d plus local changes fingerprinted
in phase-4-handoff.md. This is not an immutable release commit.

## Actual results

| Check | Result | Evidence / limits |
| --- | --- | --- |
| Automated adapter/observer suite | PASS | 74 tests; mocked recognition and timers |
| All frontend tests | PASS | 117 tests, six files |
| TypeScript / production build / lint | PASS | Existing bundle-size warning remains |
| Development route excluded from production assets | PASS | No speech-check page strings in built assets |
| Initial idle and consent gate | PASS | Background browser QA: Start disabled before consent; consent alone stays idle |
| Idle navigation and return | PASS | Background QA: Back to SignLine then browser Back returns to Ready, unchecked consent and disabled Start/Stop; no active microphone tested |
| Embedded browser live recognition | FAIL | User reported recovery exhaustion in Codex browser; embedded environment is not accepted for microphone testing |
| Desktop Chrome basic speech | PASS, user reported | After opening Chrome as a separate Windows app, user confirmed “Captions work in the separate Chrome app” |
| Duplicate finals | PASS, user reported | Same sentence twice appears twice without extra copies |
| Stop and microphone indicator | PASS, user reported | No new text after Stop while speaking; microphone indicator turns off |
| Active navigation cleanup and idle return | PASS, user reported | Start, Back to SignLine and return: microphone stops; speech-check remains idle until Start |
| Permission denial and unavailable microphone recovery | PENDING | Mock coverage exists; actual device behavior not yet checked |
| Network interruption and Stop during recovery/startup | PENDING | Mock coverage exists; actual device behavior not yet checked |
| Ten start/stop cycles and ten-minute session | PENDING | Include two pauses of at least 60 seconds |
| Script word error rate and phrase meaning | PENDING | No recognized transcript retained or scored |
| Phrase-end-to-final latency | PENDING | No measured trials; no latency claim |

Known setup: user's Windows laptop, localhost development server, English (US).
Exact Chrome version, microphone model, network conditions and test time were not
supplied. Do not infer these from the bundled Node version or the embedded browser.
Basic live recognition is established by the user's latest explicit desktop Chrome
report. The earlier success selection was retracted as a misclick and is not used
as evidence. Failure inside Codex followed by success in desktop Chrome points to
an embedded environment/service limitation; its underlying cause is not independently
diagnosed. The user separately confirmed all three repeat/Stop/navigation checks
passed. Microphone release evidence is the user's observed browser indicator;
no independent operating-system capture instrumentation was used. No measured
accuracy or latency claim is made.

## Reopen the environment

Open http://localhost:5173/#/speech-check in desktop Google Chrome while the local
server is running. Open Chrome from the Windows Start menu and paste the address
into that app's address bar; clicking a link inside Codex may open its embedded
browser instead. From the repository root in PowerShell, restart the server with:

```powershell
& .\docs\subplans\voice-to-captions\start-speech-check.ps1
```

The launcher uses installed Vite and bundled Node (or Node on PATH), binds localhost,
and refuses to silently switch ports. Stop the server with Ctrl+C in its terminal.
No server process, camera, provider key, database or LiveKit room is needed. Do not
put credentials in frontend configuration. A browser-operated speech service may
receive audio; recognition is not guaranteed offline.

## Neutral accuracy reference

Read this fixed reference in a quiet room, naturally, with short pauses between
sentences. Use only consenting participants. Do not record audio.

> Today we are testing live captions in a quiet room. The window is open and a small
> plant sits beside the desk. I will speak clearly and pause between each sentence.
> Please bring a blue notebook and a glass of water. Our meeting starts after lunch
> near the main entrance. We can review the schedule together before we leave. If a
> word looks wrong, wait for the final caption and check it again. Everyone should
> have time to read and respond. Thank you for helping us make this conversation
> easier to follow. This is the end of our test today.

Five short meaning checks (score separately):

1. Please turn left at the next door.
2. The meeting starts at three thirty.
3. I need a glass of water.
4. Could you repeat the last sentence?
5. My notebook is on the table.

For scoring, lowercase both reference and final output, remove punctuation, and
split on whitespace. Spell spoken numbers as words consistently in both texts;
do not otherwise correct recognized words. Align words using minimum edit distance
with unit-cost substitutions, deletions and insertions. Report S, D, I, reference
word count N, and WER = (S + D + I) / N. Report word accuracy as 1 - WER (which can
be negative), alongside WER rather than silently clamping it. Demo target: WER <=10%
and correct meaning in all five short phrases. Targets are not achieved claims.

Use only the neutral script for scoring. Keep any temporary recognized text local
with participant consent, delete it after scoring, and save only aggregate results.

## Timing and stability protocol

For at least 20 trials, use the same microphone/browser/network and short phrase.
Have an observer use a stopwatch: start at the final spoken sound and stop when
the complete final phrase first appears in Finished phrases. This is a coarse
manual measure with human reaction error, not instrumented provider latency.
If a phrase fails to finalize, record a failure and elapsed timeout separately;
do not omit it from the report as a successful trial. Sort successful durations;
p50 and p95 use nearest rank, rank = ceil(percentile * trial count), starting at one.
Report successful/attempted trials, p50/p95, method and conditions. Demo target:
p95 under three seconds, with recognition failures explicitly counted.

Also run ten start/stop cycles and a ten-minute quiet-room session with two
60-second pauses. Check interim replacement, both legitimate repeated phrases,
stopping during startup/recovery, no text after Stop, microphone indicator off,
navigation cleanup and idle on return. For denial, block microphone permission
for this localhost site in Chrome, Start once, verify useful error and no prompt
loop, then restore permission yourself and explicitly Start again. Test offline
behavior only if convenient; restore the connection and start fresh if retries end.

Record PASS/FAIL/PENDING, device/browser versions and aggregate timings only.
No raw personal conversation, credentials or recordings belong in this record.
