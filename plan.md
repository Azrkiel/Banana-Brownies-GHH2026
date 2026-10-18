# SignLine — Build Blueprint v3 (for coding agents)

SignLine is a two-laptop video call. A signer signs a 20-sign ASL vocabulary plus the fingerspelled name K-E-V. The other
person hears it as English speech within about 2 s, and their speech appears as captions for the signer. Built at
Girls Hoo Hack 2026; the Devpost deadline is **Sun Oct 18, 17:00 EDT**.

**This file is the entry point and the only status record.** Read sections 0–3 before you touch code.

- `plan/tasks/<ID>.md` has one card per task: intent, exact steps, reference code, and a runnable "Done when" block.
- `plan/context.md` has product context: scope, diagrams, the demo script, pitch wording, and risks. Read it when a
  card points you there or when you need to know *why*.
- `plan/verify.py` picks the next task, runs a card's checks, and updates the ledger.

---

## 0. Read this first: current state

### Snapshot — updated October 18, 2026 at `8239bb7`

**Direction change (owner, October 18).** The canonical v2 recognizer (ONNX classifier, canonical features, GISLR/Kaggle
training, fingerspelling, recorded datasets and the ASL switch screen) is no longer being built. SignLine instead uses
**Lisa Ou's committed seven-word model** (commit `405afe0`, exported to `web/public/trained-words.json`), plus
**personal signs** each user teaches in the browser. No new model will be trained. Gemini is used only to turn signed
words into an English sentence. The ledger in §3 marks the abandoned cards `DROPPED` and the cards whose goal shipped
another way `SUPERSEDED` (see §2).

**Working now, deployed at https://signline-api.fly.dev:**

- **Two-person LiveKit call** with typed captions, and **ElevenLabs Scribe speech captions** for the hearing participant.
- **Signer recognition** (`web/src/components/SignerWords.tsx`): Lisa's forest (DEMO, FOOD, GOODBYE, HELLO, LISA, MY,
  NAME), or "Shared words + my signs", which checks personal signs first and then falls back to the shared forest
  (`d16f79c`, `7a54221`). One personal sign with three examples is enough.
- **Live view** (`3ce3d68`, `56b7ae9`): the frame the hand model sees, with its landmarks, and a running guess that
  updates every frame. Held-back guesses say why (too few tracked frames, or low score).
- **Live dictation** (`0f36b58`, `web/src/lib/dictation.ts`): confident signs are added as they are signed (about
  350 ms hold; repeats need a pause). Lowering the hand for 1.5 s sends the sentence with no button press. Send now and
  Clear remain, and dictation can be turned off for the confirm-each-word flow.
- **Gemini sentence polish** (`web/src/lib/signedSentence.ts`): `/api/gloss` turns `MY NAME LISA` into
  "My name is Lisa.", with recent hearing captions as context. Below 0.6 confidence, on error, or after 5 s, the
  signed words are sent unchanged, so Gemini never adds content that was not signed.
- **ASL to speech** (`4c9b4a7`, `web/src/lib/signerVoice.ts`): each sent signer caption is spoken with an ElevenLabs
  voice into a WebAudio track published as the signer's call microphone, so the hearing side hears it through the
  call. A `tts` control pauses the listener's speech captions during playback. The signer can turn it off and pick a
  voice.
- **Personal signs** (`#/training`, `3d8733e`): GitHub sign-in through Supabase, private per-user samples with
  row-level security, and an in-browser nearest-neighbour model.
- Server routes, Gemini prompt/eval, Tiger Data schema and the stats page (`#/stats`), as before.

**Verified in this session (Oct 18):** 224 frontend tests, type-check, lint and build pass, and
`python plan/verify.py ledger` passes for every DONE/NEEDS-HUMAN row. On the live site, headless Chromium and Brave
with a fake camera tracked a hand and ran the live guess; a still, non-signing hand dictated nothing in 8 s; and with
two browsers in one room, a signer caption reached the hearing side as text and as audio. A real signed sentence
through dictation has not been run automatically, because a fake camera cannot sign. The two-laptop golden path is a
human check.

**Not built (known gaps):** "That was wrong" caption retraction, latency/event logging into `#/stats` (`metrics.ts`,
so the dashboard stays empty), an offline TTS fallback (if ElevenLabs is down, the caption is still sent as text),
and measured recognition accuracy. Lisa's model was trained on 105 samples of one signer, so it is rarely confident
on other people; the demo should rely on taught personal signs.

### Deployment

Hosting is **Fly.io only** (the Vultr VM was never created; GitHub Pages was removed on October 17). Fly app
`signline-api` (root `Dockerfile`, `fly.toml`) serves the API and its own build of the web app on one origin. Server
keys are Fly secrets. The Supabase URL and publishable key are public browser config and live in `fly.toml`
`[build.args]` (`56b7ae9`): earlier deploys without them (v14, v17) silently broke GitHub sign-in. Pushing does
**not** redeploy: run `flyctl deploy --remote-only --depot=false` from the repo root. The machine sleeps when idle, so
the first request takes about 2.5 s, and the first recognition start downloads about 21 MB of hand model and runtime.

### What is left

The only open agent row is **2.A2** (`PARTIAL`): metrics logging and Chips. `python plan/verify.py next` selects it.
It is optional for the demo; drop it if the team will not build it.

Optional work, if time allows (none of it is a ledger card):

- [ ] "That was wrong": let the signer retract a sent sentence (`Caption.retracted` already exists in `types.ts`).
- [ ] Log utterance latency events so `#/stats` shows real numbers (the 2.A2 metrics subset).
- [ ] Tune the dictation timings in `web/src/lib/dictation.ts` after rehearsal (hold 350 ms, end 1.5 s).
- [ ] Add the live view to the My signs page's "Test a fresh sign".

Human checks and tasks, in working order:

- [ ] **0.3:** learn Lisa's seven words and the personal signs you will teach for the demo.
- [ ] **Teach demo signs** on `#/training` with three to five examples each, using the hand and framing you will
  use on stage.
- [ ] **1.A1 / 3.3:** two-laptop golden path: teach signs, dictate a sentence, hear the voice and read the caption on
  the other laptop. If the hearing laptop shows **Enable audio**, click it.
- [ ] **1.B1:** Bench FPS on both laptops.
- [ ] **1.C1 / 1.C5 / 1.C4:** mark VERIFIED (live health, token, stats and HTTPS checks already pass; see Evidence).
- [ ] **1.C2:** run the 12-case Gemini eval and record p50 in the README.
- [ ] **1.C3:** pick the demo voice in the call.
- [ ] **4.2:** after a golden-path run, check the stats page.
- [ ] **4.1 / 4.6 / 4.7 / 5:** golden path on the deployed URL, pitch and slides (include the limitations slide),
  backup video, failure drills, then freeze, rehearse and submit by Sun Oct 18, 17:00 EDT.

Dropped in the current direction (see each ledger row): 1.0, 1.B2, 1.B4, 2.B2, 2.B3, 4.3, 2.B4, 1.B5, 1.B6, 0.2,
1.D1, 4.8. Superseded by shipped work: 2.B1, 2.B5, 3.1, 2.A1, 2.C1, 2.A3, 3.2, 4.4, 4.5.

### Status rules

Earlier sessions ended with "everything is done" after the scaffold. That was wrong. The rules below exist to
prevent it:

1. **The ledger decides what is done, not your judgment.** A task is done only when
   `python plan/verify.py done <ID>` passes and flips its row. Do not edit Status cells by hand, except to set
   `BLOCKED` with a reason.
2. **A scaffold, stub, placeholder, or TODO comment is not done.** Every card's check rejects stub markers, missing
   exports, missing tests, and a failing build.
3. **"Needs a camera / key / GPU / second laptop" is not a reason to stop.** It is a *Human check*. Write the code,
   pass the automated checks, and the row becomes `NEEDS-HUMAN`. Then move to the next task. Agents never wait on
   humans.
4. **Never weaken a check.** Do not edit a verify block, delete or rename a test, loosen a tolerance, or add `skip`
   to make something pass. If a check is wrong, report it in your final message and leave the task `PARTIAL`.
5. **You may claim the project's agent work is complete only when `python plan/verify.py next` prints
   `NO AGENT TASKS LEFT`.** A lane agent may say its *lane* is finished only when
   `python plan/verify.py next --lane <lane>` prints it. Paste that output in your final message. `WAITING` means
   not finished.
6. **Plan v2's §11 "verified, 36 tests pass" describes the plan author's scratch copy, not this repo.** Ignore it as
   status.

---

## 1. Agent protocol

### Which mode you are in
- **"Do Task X"**: do only that card, then stop with the report in §1.4.
- **"Work lane X" / "you are the X agent"**: run the loop in §1.2 with `--lane X` on every `next`/`wait`. Do only
  that lane's tasks and stay inside the files it owns (§1.5). Other agents are working the other lanes at the same
  time.
- **"Continue", "keep building", "work on the plan", or no task named**: run the loop in §1.2 without `--lane`
  until `verify.py next` says `NO AGENT TASKS LEFT`, or until you run out of session. Do not stop after one task to
  ask whether to continue.

### 1.2 The loop
```
0. Preflight (once per session):  python plan/verify.py preflight [--lane X]   # deps installed?
   If it fails, install what it names (README "Development setup"), then rerun. Never skip preflight.
1. python plan/verify.py next [--lane X]   -> prints NEXT: <ID>
   If it prints WAITING (your next task depends on another lane): python plan/verify.py wait --lane X
   (pulls every 60 s for up to 30 min). Still WAITING after that? End the session with the §1.4 report.
2. Read plan/tasks/<ID>.md in full: Intent, Current repo state, Files, Steps, Done when, Not done if.
3. git fetch && integrate origin/main (AGENTS.md), so you build on the latest code.
4. Do the Steps, in order. Use the Reference implementation verbatim unless a Step says otherwise.
5. python plan/verify.py check <ID>  -> fix the code until PASS. (Run the whole web suite too: no regressions.)
6. python plan/verify.py done <ID>   -> re-runs the checks and sets the row to DONE or NEEDS-HUMAN.
7. git add -A && git commit -m "<the card's commit message>"   (code and plan.md together)
   git pull --rebase && git push      (other lanes push too; if the push is rejected, pull --rebase again and push)
   Push after EVERY task. Other lanes wait on your rows, and they only see them after you push.
8. Go to 1.
```
If a task cannot be completed (for example, a dependency cannot be installed or the reference code is broken), set
its Status to `BLOCKED`, put the one-line reason in Evidence, commit, and continue with `next`. Dependents of a
blocked task are skipped automatically.

### 1.3 Rules while working
- **Stay inside the card's Files list.** If you must touch another file, say why in the commit body.
- **Contracts** (§4) change only when a card says so.
- **Reference code and the repo disagree?** The card's "Current repo state" and Steps say which wins. If they are
  silent, keep the repo's extra robustness (guards, cleanup, extra tests) but match the reference's exported names,
  signatures, and behavior.
- **Find/replace anchor doesn't match?** Make the same change by intent and list it in the commit body. Never skip
  an edit.
- **No new dependencies** unless a card lists them.
- **Windows:** the venv python is `server\.venv\Scripts\python`. `verify.py` finds it automatically and runs checks
  with Git Bash.

### 1.4 Final message (every session, every mode)
```
Ledger: <paste `python plan/verify.py status`>
This session: <ID> -> <new status>, <ID> -> <new status>, ...
Next agent task: <paste `python plan/verify.py next`>
Human checks now waiting: <each NEEDS-HUMAN row: ID + the card's "Human check" in one line>
Problems: <BLOCKED rows, checks you believe are wrong, anything you could not verify>
```

### 1.5 Running several agents at once (lanes)

The ledger is split into four agent lanes. Each lane owns a set of files (listed above its table in §3), so lanes
can run at the same time without editing the same files. All four lanes have work available right away. When a
lane needs another lane's output, `next --lane` prints `WAITING` and `wait --lane` pulls until it is ready.

| Lane | What it builds | Starts with | Waits on other lanes for |
|---|---|---|---|
| `recog` | vocab/types (contracts everyone uses), features, classifier, letters, Recorder, Bench, signer pipeline, eyebrows | 0.4 → 1.0 → 2.B1 → 1.B2 (these unblock the other lanes; do them first and push each one immediately) | 3.1 needs `metrics.ts` (call 2.A2); 4.3 needs 3.2 (call) |
| `call` | voice, offline English, STT, Chips/Consent, the ASL-switch call screen, recognizer wiring, Scribe, teach-my-sign | 2.A1 | 2.C1 needs 0.4 + 2.B1 (recog); 2.A3 needs 1.0 (recog); 3.2 needs 3.1 (recog) |
| `server` | requirements fix, Gemini test/eval, schema, deploy files, stats page | 0.5 | nothing |
| `ml` | train/eval/ONNX with a synthetic smoke test, Python feature twin + parity, Kaggle converter | 2.B4 | 1.B5 needs 1.B2 (recog) |

Rules for parallel agents:
1. **Each agent needs its own checkout**: a separate Codex cloud task, a separate `git clone`, or
   `git worktree add ../signline-<lane> main`. Two agents in one folder overwrite each other's files.
2. **Only touch your lane's files.** A card may tell you to edit another lane's file (4.3 edits `Call.tsx`). Then
   `git pull --rebase` right before the edit, keep it small, and push right after.
3. **Contracts** (`types.ts`, `vocab.json`, `features.ts`, API routes, schema) belong to the lane that owns them.
   Other lanes import them and never edit them. If a contract blocks you, report it instead of patching it.
4. **The ledger is one table per lane**, so `verify.py done` in different lanes changes lines that are far apart
   and `git pull --rebase` merges them cleanly. Never edit another lane's rows.
5. `python plan/verify.py lanes` shows every lane's progress and what it is waiting on.

Prompt for each agent (change the lane name):
```
You are the <recog|call|server|ml> lane agent. Follow plan.md §1 with --lane <lane>: run
`python plan/verify.py next --lane <lane>`, do that card, `python plan/verify.py done <ID>`, commit,
pull --rebase, push, repeat. If WAITING, run `python plan/verify.py wait --lane <lane>`. Stay in your lane's
files. Stop only when `next --lane <lane>` prints NO AGENT TASKS LEFT, then give the §1.4 report.
```

### 1.6 Lane managers + subagents (optional mode)

Instead of one agent per lane, each lane can run as a **manager** that plans and verifies, plus **subagents** that
do one phase each. The manager writes `plan/managers/<lane>.md`: notes, then phases that group the lane's tasks.
Each subagent finishes one phase, writes a handoff to `plan/handoffs/<lane>/<P#>.md` (what it did, successes,
challenges, next steps, verify output), and checks off its phase with `python plan/verify.py tick --lane <lane>
<P#>`. That command refuses until the phase's tasks pass and the handoff is complete. Roles, file formats, the
manager prompt, and the subagent prompt are in [`plan/managers/README.md`](plan/managers/README.md).

---

## 2. Status values

| Status | Meaning | Who sets it |
|---|---|---|
| `TODO` | Nothing exists yet. | — |
| `PARTIAL` | Some code exists but the card's checks fail. The card's "Current repo state" lists the gaps. | — |
| `DONE` | The agent task's checks pass. | `verify.py done` |
| `NEEDS-HUMAN` | Code is done and its checks pass; a live check (camera, key, laptops) is waiting. It counts as done for dependencies. | `verify.py done` |
| `BLOCKED` | The agent cannot finish. The reason is in Evidence. | agent, by hand |
| `HUMAN` | A person must do this (accounts, recording, training on the GPU, demo). It is never an agent's job. | — |
| `VERIFIED` | A human did the live check. | human, by hand |
| `SUPERSEDED` | The card's goal shipped through a different implementation; Evidence names the commits. Its card checks were not run against the new code. | owner decision, by hand |
| `DROPPED` | Abandoned in the current direction; Evidence gives the reason. | owner decision, by hand |

Owner `AGENT` means only code. `AGENT then HUMAN-CHECK` means the agent does the code and a person does a live check
afterwards. `HUMAN` means people only.

`SUPERSEDED` and `DROPPED` rows are closed: `verify.py next` skips them. A superseded row satisfies its dependents
(its goal shipped); a dropped row does not.
Only the owner sets them. Reopen a row by setting it back to `TODO` or `PARTIAL`.

---

## 3. Ledger

One table per lane. Within a lane, rows are in execution order. `verify.py next --lane X` returns the first AGENT
row in that lane that is TODO or PARTIAL and whose dependencies (in any lane) are all DONE, NEEDS-HUMAN, or VERIFIED.
Without `--lane`, it scans the lanes in the order below. Phase 4 rows (4.x) are stretch work and sit at the end of
each lane.

<!-- LEDGER:START -->

### Lane recog — recognition in the browser: vocab, types, features, classifier, letters, Recorder, Bench, signer pipeline, eyebrows

Owns: `web/src/vocab.*`, `web/src/lib/{types,features,segmenter,landmarks,useCameraTracker,classifier,onnx,knn,letters,signerPipeline,nmm,presage}.ts`, `web/src/pages/{Bench,Recorder}.tsx`, `web/scripts/{build-dataset,fake-sessions}.ts`, `presage/`, `.gitignore`

| ID | Task | Owner | Depends on | Status | Evidence |
|---|---|---|---|---|---|
| [0.4](plan/tasks/0.4.md) | Repo scaffold + vocabulary v2 | AGENT | — | DONE | verify PASS 2026-10-17 on 0a3d55f+ |
| [1.0](plan/tasks/1.0.md) | Shared types v2 | AGENT | 0.4 | DROPPED | owner 2026-10-18: no v2 ONNX/ASL-switch pipeline; recognition runs on the existing types |
| [2.B1](plan/tasks/2.B1.md) | Classifier, ONNX loader, kNN | AGENT | 0.4 | SUPERSEDED | Lisa's 7-word random forest in wordModel.ts (d16f79c) + personal kNN in personalModel.ts (3d8733e, 7a54221); no ONNX |
| [1.B2](plan/tasks/1.B2.md) | Features with canonical handedness | AGENT | 1.0 | DROPPED | owner 2026-10-18: features are the recovered trainer's 30x42 wrist-relative layout (wordModel.ts) |
| [1.B3](plan/tasks/1.B3.md) | Segmenter | AGENT | 1.B2 | DONE | audit 2026-10-17 on 9dced31 |
| [1.B1](plan/tasks/1.B1.md) | Tracker + benchmark | AGENT then HUMAN-CHECK | 1.0 | NEEDS-HUMAN | code on 9dced31; FPS check on laptops pending |
| [1.B4](plan/tasks/1.B4.md) | Recorder page on vocab v2 | AGENT then HUMAN-CHECK | 1.0 | DROPPED | owner 2026-10-18: shared-model recording replaced by per-user teaching on #/training (3d8733e) |
| [2.B2](plan/tasks/2.B2.md) | Fingerspelling letters K E V | AGENT | 1.B2 | DROPPED | owner 2026-10-18: fingerspelling cut; a name can be taught as a personal sign |
| [2.B3](plan/tasks/2.B3.md) | Dataset builder + synthetic sessions | AGENT then HUMAN-CHECK | 1.0, 1.B2, 2.B2 | DROPPED | owner 2026-10-18: no dataset build or retraining |
| [2.B5](plan/tasks/2.B5.md) | Bench live readout | AGENT then HUMAN-CHECK | 1.B2, 2.B1 | SUPERSEDED | live hand skeleton + running guess in the call signer panel (3ce3d68, 56b7ae9) |
| [3.1](plan/tasks/3.1.md) | Signer pipeline with pause/resume | AGENT | 1.B2, 1.B3, 2.B1, 2.B2, 2.A2 | SUPERSEDED | dictation.ts: confident-only words after ~350 ms hold, hand down 1.5 s ends the sentence (0f36b58) |
| [4.3](plan/tasks/4.3.md) | Eyebrows + headshake (Presage / MediaPipe) | AGENT then HUMAN-CHECK | 3.2, 2.C1 | DROPPED | owner 2026-10-18: stretch cut |

### Lane call — the call screen: captions, voice, speech-to-text, ASL switch, auto-speak, wiring the recognizer in

Owns: `web/src/lib/{api,call,captions,voice,stt,metrics,gloss}.ts`, `web/src/components/`, `web/src/pages/Call.tsx`, `web/src/config.ts`, `web/src/index.css`, `web/public/tts-cache/`, `server/scripts/cache_tts.py`, `web/package*.json` (4.4 only)

| ID | Task | Owner | Depends on | Status | Evidence |
|---|---|---|---|---|---|
| [1.A1](plan/tasks/1.A1.md) | Call skeleton: API client, LiveKit, captions, routes | AGENT then HUMAN-CHECK | 1.0 | NEEDS-HUMAN | verify PASS 2026-10-18 on 8239bb7; two headless browsers on live site: join + signer caption and voice reach hearing side; two-laptop check pending |
| [2.A1](plan/tasks/2.A1.md) | Voice into the call + TTS cache script | AGENT then HUMAN-CHECK | 1.A1 | SUPERSEDED | signerVoice.ts plays ElevenLabs audio into a published call mic track (4c9b4a7); 2-browser live test heard it; MP3 cache + cache_tts.py dropped |
| [2.C1](plan/tasks/2.C1.md) | Gloss buffer + offline English | AGENT | 0.4, 2.B1 | SUPERSEDED | Gemini /api/gloss via signedSentence.ts, used only at confidence >= 0.6, else the signed words (0f36b58); offline English rules not built |
| [2.A2](plan/tasks/2.A2.md) | STT, metrics, Chips, Consent | AGENT | 1.A1, 2.C1 | PARTIAL | STT done: ElevenLabs Scribe call captions (13b6b5d, 766c965); consent = per-feature checkboxes; metrics.ts (event logging for #/stats) and Chips not built |
| [2.A3](plan/tasks/2.A3.md) | Call screen with the ASL → voice switch | AGENT then HUMAN-CHECK | 1.0, 2.A1, 2.A2, 2.C1 | SUPERSEDED | no ASL switch: live dictation, Send now/Clear, speak toggle, voice picker in the signer panel (0f36b58, 4c9b4a7); "That was wrong" retraction not built |
| [3.2](plan/tasks/3.2.md) | Recognizer on the ASL switch | AGENT then HUMAN-CHECK | 3.1, 2.A3 | SUPERSEDED | live dictation wired into Call.tsx; sentences sent and spoken without a button (0f36b58) |
| [4.4](plan/tasks/4.4.md) | Scribe captions with fallback | AGENT then HUMAN-CHECK | 2.A3 | SUPERSEDED | ElevenLabs Scribe in speech check + call captions (766c965); differs from the card's startScribe/fallback API |
| [4.5](plan/tasks/4.5.md) | Teach my sign | AGENT then HUMAN-CHECK | 3.2 | SUPERSEDED | My signs: GitHub sign-in, private Supabase samples, in-browser kNN that extends the shared words (3d8733e, 7a54221) |

### Lane server — FastAPI server, Gemini prompt, database schema, deploy files, stats page

Owns: `server/` (except `scripts/cache_tts.py`), `web/src/pages/Stats.{tsx,css}`, `web/src/App.tsx`

| ID | Task | Owner | Depends on | Status | Evidence |
|---|---|---|---|---|---|
| [0.5](plan/tasks/0.5.md) | Server scaffold (Windows-installable requirements) | AGENT | — | DONE | verify PASS 2026-10-17 on b16cf44+ |
| [1.C1](plan/tasks/1.C1.md) | API routes | AGENT then HUMAN-CHECK | 0.5 | NEEDS-HUMAN | code matches plan on 9dced31; live curl 2026-10-17 on signline-api.fly.dev: health all true, token eyJ… |
| [1.C2](plan/tasks/1.C2.md) | Gemini prompt test + eval script | AGENT then HUMAN-CHECK | 1.C1 | NEEDS-HUMAN | verify PASS 2026-10-17 on 8d6cd13+ |
| [1.C5](plan/tasks/1.C5.md) | Tiger Data schema | AGENT then HUMAN-CHECK | 1.C1 | NEEDS-HUMAN | verify PASS 2026-10-17 on f944542+; live /api/stats 2026-10-17 → configured:true (DB auth + schema OK) |
| [1.C4](plan/tasks/1.C4.md) | Deploy files (+ human VM deploy) | AGENT then HUMAN-CHECK | 1.C1 | NEEDS-HUMAN | verify PASS 2026-10-17 on 10a4f30+; VM never created — API deployed to Fly.io instead (86df6f7), HTTPS health OK |
| [4.2](plan/tasks/4.2.md) | Live stats page (Tiger Data) | AGENT then HUMAN-CHECK | 1.C5 | NEEDS-HUMAN | verify PASS 2026-10-17 on de011a8+; DB credentials fixed 2026-10-17 (live /api/stats configured:true, deployed #/stats loads); golden-path data + browser visual QA pending |

### Lane ml — Python training: train/eval with a synthetic smoke test, feature twin + parity, Kaggle converter

Owns: `ml/`, `web/scripts/export-fixtures.ts`

| ID | Task | Owner | Depends on | Status | Evidence |
|---|---|---|---|---|---|
| [2.B4](plan/tasks/2.B4.md) | Train + eval + ONNX export (smoke-tested) | AGENT then HUMAN-CHECK | — | DROPPED | owner 2026-10-18: no new model training; use Lisa's committed model (405afe0). Unmerged branch feat/word-retraining kept for reference |
| [1.B5](plan/tasks/1.B5.md) | Python features + parity test | AGENT | 1.B2 | DROPPED | owner 2026-10-18: no Python feature twin needed without training |
| [1.B6](plan/tasks/1.B6.md) | Kaggle GISLR converter + synthetic test | AGENT then HUMAN-CHECK | 1.B5 | DROPPED | owner 2026-10-18: no GISLR/Kaggle data in the current direction |

### Lane human — people only: accounts, recording, GPU training runs, live checks, demo

| ID | Task | Owner | Depends on | Status | Evidence |
|---|---|---|---|---|---|
| [0.1](plan/tasks/0.1.md) | Accounts and keys | HUMAN | — | HUMAN | all five server keys true on Fly /api/health; Supabase GitHub sign-in works on the live site 2026-10-18 |
| [0.2](plan/tasks/0.2.md) | Kaggle download + CUDA PyTorch on the MSI | HUMAN | — | DROPPED | owner 2026-10-18: no Kaggle data or GPU training |
| [0.3](plan/tasks/0.3.md) | Learn the signs | HUMAN | — | HUMAN | now: learn Lisa's 7 words and the personal signs taught for the demo |
| [1.C3](plan/tasks/1.C3.md) | TTS live check + pick voice | HUMAN | 1.C1 | HUMAN | live /api/tts 200 (~0.4 s to first audio), 8 voices; voice is chosen in the call; MP3 cache dropped with 2.A1 |
| [1.D1](plan/tasks/1.D1.md) | Record our signs, idle, letters | HUMAN | 1.B4 | DROPPED | owner 2026-10-18: replaced by teaching personal signs on #/training |
| [3.3](plan/tasks/3.3.md) | Golden path on two laptops | HUMAN | 3.2, 2.B4, 1.D1, 1.C3 | HUMAN | golden path is now: teach signs -> live dictation -> Gemini sentence -> voice + captions on two laptops |
| [4.1](plan/tasks/4.1.md) | Deploy web app to Vultr | HUMAN | 1.C4, 3.3 | HUMAN | deployed to Fly.io (https://signline-api.fly.dev) instead of Vultr; golden-path run on the deployed URL pending |
| [4.6](plan/tasks/4.6.md) | Pitch + slides | HUMAN | — | HUMAN |  |
| [4.7](plan/tasks/4.7.md) | Failure drills | HUMAN | 3.3 | HUMAN |  |
| [4.8](plan/tasks/4.8.md) | More Kaggle signs (retrain) | HUMAN | 2.B4 | DROPPED | owner 2026-10-18: no retraining |
| [5](plan/tasks/5.md) | Freeze, rehearse, submit | HUMAN | 3.3 | HUMAN |  |
| [6](plan/tasks/6.md) | After the event | HUMAN | 5 | HUMAN |  |

<!-- LEDGER:END -->

### Checkpoints (humans check these together; times assume the team is on pace)

| Checkpoint | Time | Needs ledger rows | Live proof |
|---|---|---|---|
| CP1 | Sat 17:00 | 1.A1, 1.B4, 1.B5, 1.B6, 1.C1–1.C5 | two-laptop call with typed captions; Recorder saves clips; `data/gislr-demo` exists; `/api/gloss` and `/api/tts` work with curl; at least 3 people recorded |
| CP2 | Sat 23:00 | 2.* | the fine-tuned model recognizes the 20 signs on Bench; the `?dev` simulator drives auto-speak, holds, retraction, and the offline fallback |
| CP3 | Sun 02:00 | 3.1, 3.2, 3.3 | full demo script live; `git tag golden-path` |
| CP4 | Sun 13:00 | 4.x as time allows | deployed URL or a rehearsed local fallback; backup video recorded |

*2026-10-18: of this list, the ASL switch and cached MP3s were dropped (see 2.A1/2.A3); holding unsure signs is
covered by confidence-only dictation, and "That was wrong" is not built.* If the team falls behind, follow the cut order in `plan/context.md` §10. **Never cut:** the consent screen, the ASL
switch, holding unsure sentences, "That was wrong", the offline fallbacks, the cached MP3s, the backup video, and the
limitations slide.

---

## 4. Contracts (change only when a card says so)

| Contract | Files | Why it is fixed |
|---|---|---|
| Vocabulary | `web/src/vocab.json` → `web/src/vocab.ts`, read by `ml/train.py` | Labels must agree across recorder, training, model meta, Gemini, and offline English |
| Shared types | `web/src/lib/types.ts` | Frame/Session/Caption/Ctrl shapes cross tracker, recorder, call, and captions |
| Features | `web/src/lib/features.ts` ≡ `ml/features.py` (T=32, F=174) | Train/serve parity. After touching either: `cd web && npm run fixtures`, then `ml/.venv/bin/python -m pytest ml/tests/test_parity.py` |
| API | `server/app/main.py` routes ↔ `web/src/lib/api.ts`, `metrics.ts`, `Stats.tsx` | Request/response shapes |
| Events schema | `server/sql/schema.sql` ↔ `server/app/db.py` SQL ↔ `metrics.ts` | Column names |
| Model files | `web/public/models/{sign.onnx, sign_meta.json, knn.*, letters.*}` | Written by `train.py`/`build-dataset.ts`, read by `onnx.ts`/`knn.ts`/`letters.ts` |

Speech integration in `13b6b5d` adds optional Caption.revision, Ctrl caption-clear (id/revision), and authenticated
sender identity on CallHandlers.onCaption. Preserve these additive contracts while completing shared types v2.
The standalone recognizer retains two-argument compatibility and adds an optional SttState observer; see its
sub-plan handoff for callback ordering, ownership, delivery bounds and known limitations.

Product rules (they are judged): UI text says "Deaf", "hard of hearing", "signer". It never says "mute",
"deaf-mute", or "hearing-impaired", and never claims the app "translates ASL" or "replaces interpreters". Auto-speak
voices only sentences whose signs were all accepted with confidence; anything unsure waits for the signer. Keys live
only in `server/.env`.

---

## 5. Layout (target)

```
web/      Vite + React + TS. lib/ = logic (tested in Node), pages/ = Call, Bench, Recorder, Stats; components/
server/   FastAPI. app/{main,gloss,db}.py, sql/schema.sql, scripts/, deploy/, tests/
ml/       Python training: features.py (twin), gislr_to_features.py, train.py, eval_report.py, tests/
presage/  optional Node sidecar (Task 4.3)
plan/     this blueprint: tasks/, context.md, verify.py
data/     never committed (Kaggle zip, recordings, features)
```

The full plan v2 monolith, before it was split into cards, is in git history: `git show 9dced31:plan.md`.
