# SignLine — Implementation Plan v2 (Girls Hoo Hack 2026)

> Written with the **xvant-plan** method: decisions first, ASCII diagrams with unhappy paths, a file map, then phases broken into small checkbox tasks (test → see it fail → code → see it pass → commit), and a self-review.
> **v2 (Sat Oct 17):** rebuilt around your answers — Kaggle GISLR pretraining on the RTX 3060, a 20-sign vocabulary drawn from the Kaggle set plus 4 recorded signs, "KEV" fingerspelling, one **ASL → voice** switch with auto-speak, eyebrow/headshake reading through **Presage** (MediaPipe fallback), 3 machines, and a Claude Code + Codex workflow. Every code block here was type-checked and tested before handing over (§11).

**Goal:** By Sunday 17:00, ship a two-laptop video call where Kev signs a 20-sign vocabulary plus "K-E-V" and the other person hears it spoken by ElevenLabs within ~2 s, while their speech shows up as captions for Kev.

**Architecture:** A small 1D-CNN is pretrained on the Kaggle "Isolated Sign Language Recognition" landmarks on the MSI's RTX 3060, fine-tuned on the demo vocabulary plus our own recordings, and exported to ONNX. In the signer's browser, MediaPipe turns the webcam into landmarks; a segmenter cuts out each sign; the ONNX model labels it. When the signer pauses, Gemini turns the glosses into English, and ElevenLabs speaks it into the LiveKit call. A thin FastAPI server on Vultr holds every key and logs timing and accuracy to Tiger Data. An optional local Presage sidecar reads eyebrows for question marking.

**Tech stack:** Vite + React + TypeScript · `@mediapipe/tasks-vision@1.1.1` · `onnxruntime-web@1.30.0` · `livekit-client` · PyTorch (CUDA on the 3060) + pandas/pyarrow for the Kaggle parquet files · FastAPI + `livekit-api` + `google-genai` + `httpx` + `asyncpg` · Gemini `gemini-3.5-flash-lite` · ElevenLabs `eleven_flash_v2_5` (Scribe v2 Realtime later) · Tiger Data · Vultr + Caddy · Presage `@smartspectra/node-sdk` (optional) · Claude Code + Codex as builders.

**Event clock (EDT):** hacking Sat 10:00 → Devpost deadline **Sun 17:00**. Pitch workshop Sun 09:00–10:00. Judging + live demos **Sun 17:45–19:15**, Rice 130. Winners ~21:00. Clock times below assume you are on pace. If you're behind, keep the order and use the cut list (§10).

---

## 0. Ground rules

1. **Event rules.** All project code is written during the event. Public pretrained/open data is fine with credit (Kaggle GISLR is CC BY 4.0 — confirm on the competition's Data tab and credit it). List **Claude Code and Codex** in Devpost "Built with" — MLH requires disclosing AI tools. Public repo, public demo video ≤ 3 min.
2. **Keys never touch the browser or git.** Only `server/.env` and the Presage sidecar's environment hold keys. `.env*` is ignored from the first commit.
3. **The signer controls the voice.** One switch, **ASL → voice**. When it's on, sentences whose signs were all recognized confidently are spoken automatically; anything unsure waits for a tap. **That was wrong** crosses out the last sentence on both screens and says "Sorry, that came out wrong."
4. **Honest claims only** (§9): "recognizes a 20-sign vocabulary plus fingerspelled names", never "translates ASL" or "replaces interpreters". Say plainly that Kev is learning ASL.
5. **Recordings.** Only teammates are recorded, as landmarks (no video), and only after they say yes. Raw recordings stay out of the public repo.
6. **Terminology.** "Deaf", "deaf", "hard of hearing", "signer". Never "mute", "deaf-mute", "hearing-impaired".
7. **Agents follow `AGENTS.md`** (Task 0.4). Claude Code reads it through `CLAUDE.md`; Codex reads it directly.

---

## 1. Decisions (your answers, Oct 17)

| # | Question | Decision |
|---|---|---|
| Q1 | Pretrained data? | **Yes — Kaggle GISLR** (`asl-signs`, 250 signs, ~94k clips, 21 signers). Pretrain on all 250; fine-tune on the demo set. |
| Q2 | Best Beginner? | Not entering. |
| Q3 | Demo format | **3-minute table demo on two laptops.** |
| Q4 | Tracks | Best Overall is automatic. Event tracks: **Best AI/ML, Best Live Demo, Next Giant Leap**. |
| Q5 | GoDaddy domain | Not now. Use the free `sslip.io` hostname; claim a domain only if there's spare time (Task 4.1, 15 min). |
| Q6 | Deaf tester | No — **the team is learning ASL**. Learn each Kaggle sign from its PopSign video (Task 0.3). |
| Q7/Q8 | Team & machines | **Two Macs + Kev's MSI with an RTX 3060.** MSI = training box (and likely the signer laptop). Builders: **Claude Code + Codex**. |
| Q10 | Fingerspelled name | **KEV** (letters K, E, V). |
| Q11 | Wellness app? | Pivoted. This plan is the ASL call app. |
| Q13 | Confirm vs auto-speak | **Auto-speak by default** via the ASL → voice switch (rule 3 above). |
| Q14 | Eyebrows/headshake | **Presage if time** (Task 4.3), MediaPipe as the automatic fallback, manual "?" button as the last resort. |
| Q15 | Female Empowerment | No. |
| — | MLH sponsor prizes | Priority: **Gemini, Tiger Data, Vultr**, then Presage. GoDaddy later. DEV post after the event. Skip Solana. |

**Still open (answer when convenient; defaults in bold):**
- How many people? **Plan assumes 3 (one per machine). With 2, the Mac person takes Tracks A + C.**
- Spend ~$7 for safety (ElevenLabs Starter + Gemini Tier-1 billing)? **Yes.**
- Are both Macs Apple Silicon? Presage's Node SDK runs on **Apple Silicon Macs and Windows x64** only, not Intel Macs. **Default: Presage runs on the MSI.**
- Who plays the hearing person in the demo? **A teammate, and invite each judge to try.**

---

## 2. Scope

### In (MVP — must work on stage)
- Two-laptop LiveKit call: video both ways, captions both ways.
- **ASL → voice** switch: on = recognition runs, confident sentences are spoken automatically, unsure ones wait; off = nothing is read or spoken.
- 20-sign vocabulary + `_idle`, fingerspelling **K/E/V** in spell mode.
- Gemini gloss → English; ElevenLabs voice inside the call; "That was wrong" retraction.
- Hearing side: speech → captions (Web Speech first).
- Fallbacks: rule-based English, cached demo MP3s, the hearing laptop's built-in voice.
- Real numbers: held-out-signer accuracy (Kaggle signers and our signers), latency p50/p95.

### Stretch (Phase 4, in this order)
1. Tiger Data logging + live stats page.
2. Vultr deployment.
3. Eyebrows/headshake → question/negation tags via **Presage** (MediaPipe fallback).
4. Scribe captions (echo-cancelled, any browser).
5. "Teach my sign" per-user calibration.
6. More Kaggle signs — no recording needed, just retrain (Task 4.8).
7. GoDaddy domain.

### Out (say so in the pitch)
Continuous/fluent signing, classifiers, directional verbs, mouth morphemes, emotion in the voice, fast fingerspelling, mobile, more than 2 people, medical/legal use, Solana.

### Vocabulary

**From Kaggle (no recording needed) — 16:** `HELLO, BYE, THANKYOU, PLEASE, YES, NO, HUNGRY, PIZZA, WATER, WHERE, GO, NOW, LATER, WAIT, TOMORROW, STORE`.
**Recorded by us (not in the Kaggle set) — 4 + idle:** `ME, YOU, NAME, WHAT` and `_idle`.
**Letters:** `K, E, V` only. Spell mode can only output letters it was trained on, which keeps "KEV" reliable. (E is a closed fist and K/V share two raised fingers, so record them carefully, Task 1.D1.)

Why these: the Kaggle set is the PopSign list of 250 everyday words. It has HELLO, THANKYOU, WHERE, PIZZA… but **not** NAME, YOU, ME, WHAT, NICE, MEET, DEAF or AGAIN, so the four we need for introductions are recorded. Avoided on purpose: chest-located signs that look alike (`MINEMY`, `HAPPY`, `LIKE` next to `PLEASE`/`HUNGRY`).

All of it lives in one file, `web/src/vocab.json`, which both the browser and Python training read. Adding a Kaggle sign later is one line plus a retrain (Task 4.8).

`_idle` = non-sign motion with hands up: scratching your face, adjusting glasses, waving someone off, typing in the air, reaching for a cup, a half-started sign.

### Demo script (≈ 3 min at the table; Kev signs, a teammate or the judge speaks)

| Who | Does | Screen / sound |
|---|---|---|
| Kev | Flips **ASL → voice: ON** | Hearing laptop shows "ASL voice on" |
| Hearing | "Hi! I'm Priya." | Caption on Kev's screen |
| Kev | `HELLO` `ME` `NAME` · spell `K-E-V` · pause | "Hello! My name is Kev." spoken automatically |
| Kev | `YOU` `NAME` `WHAT` (brows down) | "What's your name?" |
| Hearing | "Priya. Are you hungry?" | Caption |
| Kev | `ME` `HUNGRY` · `YOU` `HUNGRY` (brows up) | "I'm hungry. Are you hungry?" |
| Hearing | "Starving." | Caption |
| Kev | `PIZZA` `WHERE` | "Where can we get pizza?" |
| Hearing | Says a place, quickly | Caption |
| Kev | `GO` `NOW` | "Let's go now!" |
| Kev | `THANKYOU` `BYE` | "Thank you! Bye!" |
| Presenter | Points at the stats tab; offers the judge a try | Live p50/p95 latency (Tiger Data) |

If a sign comes out wrong on stage, press **That was wrong** — showing the recovery is better than hiding it.

---

## 3. Diagrams

### 3.1 Data flow (happy path)

```
TRAINING (MSI, RTX 3060) — before the demo
Kaggle asl-signs.zip ──gislr_to_features.py──> data/gislr-all (250 signs) ──train.py pretrain──> ml/out/pretrain.pt
                     └─────────────────────────> data/gislr-demo (16 signs) ─┐
our recordings (#/record) ──build-dataset.ts──> data/processed (ME YOU NAME WHAT _idle) ─┴─train.py finetune──>
        web/public/models/{sign.onnx, sign_meta.json, knn.*}   (+ letters.* for K E V)

LIVE
SIGNER BROWSER (Chrome)                            FASTAPI on Vultr (keys)              VENDORS
webcam --getUserMedia (once)--+--> LiveKit publishTrack(camera) ----------------------> LiveKit Cloud
                              +--> MediaPipe Hand(2)+Pose(+Face) --> Frame
                              +--> (ASL on, optional) PresageLink --frames--> presage sidecar (localhost) --> face scores
   ASL → voice ON:
   Frame --> Segmenter --end--> clipFeatures (canonical handedness) --> ONNX CNN --> Pred{label,p,alts,accepted}
                                                                                       |
   Nmm (Presage brows | MediaPipe brows | "?" button) + headshake --> tags            v
   GlossBuffer chips --pause 1.1 s--> POST /api/gloss --> Gemini 3.5 Flash-Lite (JSON) --> {english, confidence}
        all signs accepted AND confidence >= 0.6 ?  --yes--> speak()   --no--> hold for the signer's tap
   speak(): caption via sendText + POST /api/tts --> ElevenLabs flash_v2_5 --> WebAudio --> LiveKit voice track
HEARING BROWSER: hears the voice · sees captions · mic --Web Speech/Scribe--> caption --> signer
BOTH --sendBeacon /api/events--> Tiger Data hypertables --> /api/stats --> #/stats
```

### 3.2 Signer user flow

```
[Open] -> [Consent] --declines--> [stays on consent screen; nothing starts]
   -> [Setup: name, room, voice] --voices fail--> [banner; backup voice]
   -> [Join] --camera denied--> [banner + retry]   --token 5xx--> [banner "call server unreachable"]
   -> [In call, models preload] --model files missing--> [banner "Sign recognition could not start" (call still works)]
   -> [ASL → voice OFF]  (video still shared; nothing read or spoken)
   -> flip ON --> [recognizing]
        sign --hands out of frame--> ["Move back" hint]
             --_idle / too short--> [ignored]
             --low confidence--> ["?" chip with alternatives]
        pause 1.1 s --> Gemini --fails/slow--> [offline rules English]
             all chips confident & Gemini >= 0.6 --> [SPOKEN automatically + caption]
             otherwise --> [held: "Not sure about this one"] --tap chip / Speak (Enter)--> [spoken]  --Esc--> [dropped]
        spoken wrong? --> [That was wrong] --> [caption crossed out on both screens + "Sorry, that came out wrong."]
        TTS fails --> [hearing laptop reads it with its built-in voice]
   -> flip OFF --> [chips cleared; recognition paused; models stay loaded]
```

### 3.3 Hearing user flow

```
[Join as "I'm speaking"] --audio blocked--> ["Click to enable audio"]
   -> [mic -> Web Speech (later Scribe)] --not Chrome--> [banner "Use Chrome"] --silence/onend--> [auto-restart]
   -> [sees "ASL voice on" / "Kev is signing…"] -> [hears voice, sees captions]
   -> [caption crossed out] = signer retracted it      -> [presses "I didn't catch that"] -> signer sees a flash
   while the signer's voice plays: own mic transcripts dropped (+300 ms) so the voice isn't captioned back
```

### 3.4 Segmenter (handedness-agnostic)

```
                 any hand visible AND any wrist above rest line AND fastest hand > 0.8 S/s for 3 frames
   +--------+ ---------------------------------------------------------------------------> +--------+
   |  IDLE  |   (keeps last 8 frames as pre-roll)                                           | ACTIVE |
   +--------+ <----+                                                                        +--------+
        ^          | t >= coolUntil                                                            |
        |     +----------+   end when ANY of:  fastest hand < 0.4 S/s for 8 frames  -> 'still'  |
        +-----| COOLDOWN | <-------------------  all visible hands below rest line   -> 'lowered'|
              |  300 ms  |                       no hands for 10 frames              -> 'lost'   |
              +----------+                       longer than 3000 ms                 -> 'timeout'+
   S = shoulder width; rest line = shoulder y + 0.8 S; hands matched frame-to-frame by nearest wrist.
   On end: clipFeatures() mirrors the clip if the image-right hand did the moving (left-handed signer).
```

### 3.5 Error and fallback map

```
FAILURE                           DETECTED BY                         WHAT HAPPENS
--------------------------------  ----------------------------------  ---------------------------------------------
Kaggle download slow/blocked      ETA > 90 min                        demo-signs-only fetch (Task 0.2 fallback)
GISLR aspect ratio unknown        estimate_aspect output              --aspect flag; x-stretch augmentation absorbs the rest
Model files missing               loadOnnx + Knn.load reject          banner; call still works; ?dev simulator
Gemini 429 / 5xx / > 2.5 s        server timeout + named excepts      502 -> offline rules English (still auto-spoken)
Auto-speak says a wrong sentence  the signer                          "That was wrong": strike-through + apology phrase
ElevenLabs 429/402/5xx            /api/tts non-200                    cached MP3 if text matches; else hearing laptop's speechSynthesis
LiveKit disconnect                Reconnecting/Disconnected events    banner; resend last 3 captions on reconnect
TTS echo into hearing captions    ctrl {tts on/off}                   transcripts dropped; headphones on stage
Presage sidecar not running       connect() times out (1.5 s)         MediaPipe brows; then the "?" button
Presage key check needs internet  'status' hints from sidecar         same fallback; hint shown next to "brows:"
Chrome blocks localhost socket    connect() fails                     run the web app from localhost on the signer laptop
Hands out of frame / low light    edge landmarks / no hands           "Move back" hint; tracking dot turns grey
Venue Wi-Fi down                  fetch errors                        phone hotspot; recorded backup video
Key pushed to GitHub              —                                   keys only in .env; rotate after the event
```

### 3.6 Deployment

```
   Vultr VM (Ubuntu 24.04), hostname <ip-with-dashes>.sslip.io (domain optional, Task 4.1)
     Caddy :443 auto-HTTPS:  /api/* -> 127.0.0.1:8000 (flush_interval -1)   /* -> /srv/signline/web (SPA)
     systemd: uvicorn app.main:app
   -> LiveKit Cloud · Gemini · ElevenLabs · Tiger Cloud
   Signer laptop also runs: presage/sidecar.mjs on 127.0.0.1:8788 (optional)
   Dev: npm run dev (localhost:5173, proxies /api -> localhost:8000)
```

### 3.7 Training pipeline and evaluation

```
gislr-all (250 signs, 21 Kaggle signers) --pretrain--> backbone (hold out every 5th signer -> top-1 over 250)
                                                         | conv weights
gislr-demo (16 signs, ≤300 clips each) + our clips ×3 --finetune, new head (21 labels)-->
   folds: hold out ONE of our signers + a fixed set of Kaggle signers
   report: our held-out signer acc (mean) · Kaggle held-out acc · temperature · tau (90% precision) · coverage
   final model: all data -> sign.onnx (single file) -> parity check vs PyTorch (< 1e-3) -> sign_meta.json
```

---

## 4. File map

```
signline/
  AGENTS.md                       rules for Claude Code + Codex (Task 0.4)
  CLAUDE.md                       one line: @AGENTS.md
  .gitignore                      .env*, node_modules, .venv, data/, __pycache__, web/dist, ml/out
  README.md                       run instructions, credits (Kaggle GISLR/PopSign CC BY 4.0, AI tools, ElevenLabs)
  plan.md   this file — the spec agents follow
  web/                            Track A (call/UI) + Track B (recognition)
    tsconfig.app.json             + "resolveJsonModule": true
    vite.config.ts                dev proxy /api -> :8000, vitest
    public/mediapipe/wasm/ public/ort/      runtime files copied locally (offline-safe)
    public/models/                hand/pose/face .task files; sign.onnx, sign_meta.json, knn.*, letters.*
    public/tts-cache/             demo MP3s + index.json
    scripts/build-dataset.ts      our recordings -> data/processed + starter kNN/letter templates
    scripts/export-fixtures.ts    parity fixtures for ml/tests
    src/vocab.json                THE vocabulary (browser + Python read it)
    src/vocab.ts                  typed view of vocab.json
    src/config.ts                 PAUSE_MS, AUTO_SPEAK_MIN_CONFIDENCE, USE_FACE, DEV
    src/lib/types.ts              Frame, Caption (+retracted), Ctrl (+asl) …            [contract]
    src/lib/landmarks.ts          MediaPipe Hand(numHands 2)+Pose(+Face blendshapes)
    src/lib/features.ts           anchors, canonicalize, clipFeatures (T=32, F=174)    [contract, = ml/features.py]
    src/lib/segmenter.ts          IDLE/ACTIVE/COOLDOWN, any-hand speed
    src/lib/classifier.ts         Pred, softmax, decide()
    src/lib/onnx.ts               loadOnnx()
    src/lib/knn.ts                kNN fallback + "teach my sign"
    src/lib/letters.ts            letterHand, letterFeatures, LetterKnn, LetterDecoder
    src/lib/gloss.ts              GlossBuffer, ruleBasedEnglish
    src/lib/nmm.ts                brows (Presage | MediaPipe) + headshake -> tags
    src/lib/presage.ts            PresageLink: frames -> local sidecar -> face scores
    src/lib/signerPipeline.ts     per-frame loop: start/pause with the ASL switch
    src/lib/api.ts call.ts voice.ts stt.ts metrics.ts
    src/pages/Call.tsx Recorder.tsx Bench.tsx Stats.tsx
    src/components/CaptionLane.tsx Chips.tsx Consent.tsx
    src/App.tsx                   hash routes: #/ #/record #/bench #/stats
  ml/                             Track B (MSI)
    requirements.txt
    features.py                   Python twin of features.ts                             [contract]
    gislr_to_features.py          Kaggle zip -> data/gislr-* (+ --estimate-aspect-from)
    train.py                      pretrain | finetune -> ONNX + meta + kNN
    eval_report.py                confusion matrix, per-class F1, coverage curve
    tests/test_parity.py, tests/fixtures/parity.json
  server/                         Track C
    app/main.py gloss.py db.py · sql/schema.sql · scripts/eval_gloss.py cache_tts.py · tests/ · deploy/
  presage/                        optional sidecar (signer laptop): package.json, sidecar.mjs
  data/                           NOT in git: asl-signs.zip, raw/, processed/, gislr-demo/, gislr-all/
```

---

## 5. Team, machines, agents, timeline

### 5.1 Who does what

| Track | Machine | Owns | Demo role |
|---|---|---|---|
| **B — Recognition & ML** | **Kev's MSI (RTX 3060)** | Kaggle data, `features`/`segmenter`/`letters`/`signerPipeline`, `ml/`, Recorder, Bench, Presage sidecar | **Signer laptop** (pending the Bench check in Task 1.B1) |
| **A — Call & UI** | Mac 1 | `call.ts`, `voice.ts`, `stt.ts`, `Call.tsx`, captions, consent | **Hearing laptop** |
| **C — Server, sponsors & pitch** | Mac 2 | `server/`, Gemini prompt, Vultr, Tiger Data, `Stats.tsx`, Devpost, slides, video | Presenter; drives the stats tab |

Two people instead of three: the Mac person takes A + C; Kev keeps B and records the backup video.
Everyone: learn the signs (Task 0.3), record (Task 1.D1), rehearse.

### 5.2 Building with Claude Code and Codex

- **One spec.** This file is `plan.md` at the repo root. `AGENTS.md` tells both tools to treat it as the spec. Codex reads `AGENTS.md` directly; Claude Code reads `CLAUDE.md`, which imports it with `@AGENTS.md`.
- **One task per prompt.** Paste this, changing the task number:
  ```
  Do Task 1.B2 from plan.md exactly as written. Follow AGENTS.md.
  Run the checks the task lists and paste their output. Then commit with the task's commit message.
  ```
- **One agent per track at a time.** Two agents editing the same files will collide. If you want a second agent on the same machine, give it another track's files or use a separate git worktree.
- **Review before you push.** Read the diff of anything marked [contract] in §4. Run the tests yourself if the agent didn't paste output.
- **Debugging prompt:** "Here is the console error / failing test: … Reproduce it with a test first, then fix it. Don't change unrelated files."
- **Things agents must not do:** touch `.env`, print keys, `git push --force`, delete `data/`, "simplify" the parity-checked feature code.
- **Use them where they're strongest:** pasting and wiring the plan's code, chasing type errors, writing glue. Keep humans on the parts agents can't see: camera lighting, how a sign looks, how the demo feels.

### 5.3 Timeline

```
Sat 10 ─── P0 Setup ─── P1 Foundations ─── 17 ─── P2 Recognize + voice ─── 23 ─── P3 Golden path ─── Sun 02
           Kev: Kaggle download starts FIRST (long pole), CUDA PyTorch
                          A call+captions | B features/segmenter/recorder/parity/converter | C api+deploy+schema
                          everyone: record ME YOU NAME WHAT _idle + K E V (≈ 25 min each)
                                           B pretrain (250) → finetune | A ASL switch + autospeak (simulator) | C gloss+tts
                                                                             all: two-laptop run, tag golden-path
Sun 02-07 sleep in shifts (≥ 4 h each) ── 07 P4 Harden + sponsors (Presage, Tiger, Vultr) ── 13 P5 freeze, video, Devpost ── 17:00 submit
```

**Checkpoints (stop and check together):**
- **CP1 — Sat 17:00:** two-laptop call with typed captions · Recorder saves clips · parity test green · Kaggle demo subset converted · `/api/gloss` + `/api/tts` work with curl.
- **CP2 — Sat 23:00:** fine-tuned model recognizes the 20 signs live on Bench · ASL switch + auto-speak works end to end with the simulator.
- **CP3 — Sun 02:00 (golden path):** the full demo script works live. `git tag golden-path`. Nothing after this may break it.
- **CP4 — Sun 13:00:** deployed URL works on both laptops (or the local fallback is rehearsed) · backup video recorded.

---

## 6. Phases and tasks

Conventions: `[A]` `[B]` `[C]` = track owner. Each code task: test → see it fail → code → see it pass → commit (`git add -A && git commit -m "<message>"`). Commands are bash. On the MSI use Git Bash or WSL, and activate venvs with `.venv\Scripts\activate` instead of `source .venv/bin/activate`.

### Phase 0 — Setup (Sat 10:00–12:00)

#### Task 0.1 [C] Accounts and keys (≈ 45 min)
- [ ] **LiveKit Cloud** (free, no card) → project → Settings → Keys: `LIVEKIT_URL` (`wss://…livekit.cloud`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
- [ ] **Google AI Studio** → new Cloud project just for this → `GEMINI_API_KEY`. Open aistudio.google.com/rate-limit and screenshot the limits for `gemini-3.5-flash-lite` (limits are per project). Link billing for Tier 1 (costs ≈ $0.20) and claim MLH's $10/month Google credit. `gemini-2.0-flash` is shut down, so old tutorials will fail.
- [ ] **ElevenLabs**: each teammate makes a free account for development. Keep one "demo" account untouched until rehearsal. On the free plan, a public video using the voice needs "elevenlabs.io" in its title; Starter removes that.
- [ ] **Tiger Data** via the MLH quickstart link (30-day trial, no card) → service → `DATABASE_URL` (keep `?sslmode=require`).
- [ ] **Vultr** with the MLH promo code → deploy an Ubuntu 24.04 VM now (1 vCPU / 1–2 GB, New Jersey or Atlanta) so any account verification shows up early. Note `VULTR_IP`.
- [ ] **Presage** (for Task 4.3): create an account at physiology.presagetech.com through the MLH Presage page; copy the API key to Kev.
- [ ] **GitHub**: public repo `signline`, everyone added. Keys go to C through a private message, never into the repo or a public channel.

#### Task 0.2 [B, MSI] Start the Kaggle download first, then CUDA PyTorch (≈ 30 min hands-on; the download runs in the background)
- [ ] On kaggle.com: open the **"Google - Isolated Sign Language Recognition"** competition (`kaggle.com/competitions/asl-signs`), click **Late Submission / Join** and accept the rules (required before download). On the **Data** tab, note the license (expected CC BY 4.0) for the README.
- [ ] kaggle.com → Settings → **Create New Token** → save `kaggle.json` to `~/.kaggle/kaggle.json` (Windows: `C:\Users\<you>\.kaggle\kaggle.json`).
- [ ] Start the download (≈ 40 GB). Plugging into ethernet helps:
```bash
mkdir -p data && python -m pip install kaggle && kaggle competitions download -c asl-signs -p data
```
Expected: a progress bar, ending with `data/asl-signs.zip`. **Do not unzip it.** The converter reads straight from the zip.
- [ ] **If the ETA is over ~90 minutes**, use the fallback instead: create a Kaggle **Notebook** on the competition page (the data is already attached, usually at `/kaggle/input/asl-signs`), upload `ml/features.py` + `ml/gislr_to_features.py` (Task 1.B6), run
`python gislr_to_features.py --dir /kaggle/input/asl-signs --csv /kaggle/input/asl-signs/train.csv --signs all --out gislr-all --workers 4`
and download the `gislr-all` folder (≈ 2 GB of features instead of 40 GB).
- [ ] While it downloads, set up CUDA PyTorch: create `ml/.venv`, then use the selector at **pytorch.org/get-started/locally** (your OS, Pip, CUDA) and run the command it gives you. Then:
```bash
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```
Expected: `… True NVIDIA GeForce RTX 3060 …`. If you see `False`, update the NVIDIA driver and use the selector's CUDA build, not the default CPU wheel.
- [ ] Then `pip install -r ml/requirements.txt` (after Task 1.B5 creates it). The torch line there is already satisfied.

#### Task 0.3 [All] Learn the signs (≈ 30 min, together)
- [ ] For the **16 Kaggle signs**, learn each one from its **PopSign video** (signdata.cc.gatech.edu → PopSign v1.0 → game signs). The model learned from those recordings, so sign it the way they do. Cross-check on Lifeprint or Handspeak.
- [ ] For **ME, YOU, NAME, WHAT**, use Lifeprint / Handspeak, and agree on one form each.
- [ ] Practise fingerspelling **K, E, V** slowly at chest height, palm toward the camera.
- [ ] Kev runs the demo script (§2) five times out loud. The goal is consistent, slightly slow signs with a clear pause and hands lowered between sentences.

#### Task 0.4 [A] Repo scaffold + agent rules (≈ 40 min)
- [ ] Run:
```bash
git clone https://github.com/Azrkiel/banana-brownies-ghh2026 && cd banana-brownies-ghh2026
printf '.env*\n!.env.example\nnode_modules/\n.venv/\n__pycache__/\ndata/\nweb/dist/\nml/out/\n' > .gitignore
npm create vite@latest web -- --template react-ts
cd web
npm install
npm install livekit-client @mediapipe/tasks-vision@1.1.1 onnxruntime-web@1.30.0
npm install -D vitest tsx @types/node
mkdir -p public/mediapipe public/models public/ort public/tts-cache
cp -r node_modules/@mediapipe/tasks-vision/wasm public/mediapipe/wasm
cp node_modules/onnxruntime-web/dist/*.wasm node_modules/onnxruntime-web/dist/*.mjs public/ort/
curl -L -o public/models/hand_landmarker.task https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task
curl -L -o public/models/pose_landmarker_lite.task https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task
curl -L -o public/models/face_landmarker.task https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task
ls -la public/models
```
Expected: three `.task` files, each over 1 MB.
- [ ] Replace `web/vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': process.env.VITE_API_PROXY ?? 'http://localhost:8000' } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```
- [ ] In `web/package.json` → `"scripts"`, add `"test": "vitest run"`, `"dataset": "tsx scripts/build-dataset.ts"`, `"fixtures": "tsx scripts/export-fixtures.ts"`.
- [ ] In `web/tsconfig.app.json` → `"compilerOptions"`, add `"resolveJsonModule": true`. Keep the template's other settings (`erasableSyntaxOnly`, `noUnusedLocals`); all code here passes under them.
- [ ] In `web/src/main.tsx`, remove the `<StrictMode>` wrapper (render `<App />` directly). In development StrictMode runs effects twice, which opens the camera twice.
- [ ] Create `web/src/vocab.json`:
```json
{
  "gislr": ["hello", "bye", "thankyou", "please", "yes", "no", "hungry", "pizza", "water", "where", "go", "now", "later", "wait", "tomorrow", "store"],
  "own": ["ME", "YOU", "NAME", "WHAT"],
  "idle": "_idle",
  "letters": ["K", "E", "V"],
  "wh": ["WHAT", "WHERE", "WHO", "WHY", "HOW"]
}
```
- [ ] Create `web/src/vocab.ts`:
```ts
// Single source of truth for labels: vocab.json (Python training reads the same file).
import vocab from './vocab.json';

export const IDLE: string = vocab.idle;                                  // '_idle'
export const GISLR_SIGNS: string[] = vocab.gislr.map((s) => s.toUpperCase()); // from the Kaggle dataset, no recording needed
export const OWN_SIGNS: string[] = vocab.own;                            // not in the Kaggle set: we record these
export const DEMO_SIGNS: string[] = [...GISLR_SIGNS, ...OWN_SIGNS];
export const LETTERS: string[] = vocab.letters;                          // spell mode knows only these
export const WH_SIGNS = new Set<string>(vocab.wh);
export const RECORD_LABELS: string[] = [...OWN_SIGNS, IDLE, ...GISLR_SIGNS]; // own + idle required; GISLR signs optional (adaptation)
```
- [ ] Create `AGENTS.md` at the repo root:
```markdown
# SignLine — rules for coding agents (Claude Code and Codex read this file)

SignLine is a two-person video call: a signer's ASL (a small vocabulary + fingerspelled names) becomes spoken
English; the hearing person's speech becomes captions. Built at Girls Hoo Hack 2026 (deadline Sun Oct 18, 17:00 EDT).

**The spec is `plan.md`.** Each task there has the exact code, tests and expected
output. When asked to do "Task X", read that task, do exactly it, run its checks, show the output, then commit with
its commit message. Don't start other tasks.

## Layout
- `web/` Vite + React + TypeScript (browser: MediaPipe, ONNX classifier, LiveKit call, UI)
- `server/` FastAPI (holds every API key; LiveKit tokens, Gemini, ElevenLabs, Tiger Data)
- `ml/` Python: Kaggle GISLR conversion, training, ONNX export (GPU box: the MSI with the RTX 3060)
- `presage/` optional Node sidecar for Presage face analysis (runs on the signer laptop)
- `data/` never committed (Kaggle zip, recordings, features)

## Commands
- web: `cd web && npm run dev` · `npm test` · `npx tsc -b` · `npm run fixtures` (after changing features.ts)
- server: `cd server && source .venv/bin/activate && pytest -q` · `uvicorn app.main:app --reload --port 8000`
- ml: `pytest ml/tests` · `python ml/gislr_to_features.py ...` · `python ml/train.py pretrain|finetune ...`

## Rules
1. Secrets: keys live only in `server/.env` (gitignored) and the Presage key in the sidecar's environment. Never put
   a key in `web/`, in a `VITE_*` variable, in a commit, or in printed output.
2. Shared contracts — change only when the task says so, and tell the team in chat:
   `web/src/lib/types.ts`, `web/src/vocab.json`, `server/app/main.py` routes, `server/sql/schema.sql`,
   and the feature code. `web/src/lib/features.ts` and `ml/features.py` must stay identical in behavior:
   after touching either, run `cd web && npm run fixtures` then `pytest ml/tests/test_parity.py`.
3. TypeScript runs with the Vite template's `erasableSyntaxOnly` and `noUnusedLocals`: no constructor parameter
   properties (`constructor(private x)`), no `enum`, no `namespace`, no unused imports.
4. Stay in your track's files (see the plan's file map). Small commits; `git pull --rebase` before every push.
5. Before saying a task is done: run its tests/commands and paste the result. If something can't be verified
   (needs a camera, a key, two laptops), say so instead of claiming it works.
6. No new dependencies unless the task lists them.
7. Product rules (they are judged): UI text says "Deaf", "hard of hearing", "signer" — never "mute", "deaf-mute",
   "hearing-impaired". Never claim the app "translates ASL" or "replaces interpreters". Auto-speak only voices
   sentences whose signs were all recognized confidently; anything unsure waits for the signer.
8. Credit: Kaggle GISLR / PopSign data (CC BY 4.0) in the README and Devpost; AI tools used (Claude Code, Codex).
```
- [ ] Create `CLAUDE.md` at the repo root containing exactly one line: `@AGENTS.md`
- [ ] `npm run dev` → http://localhost:5173 shows the Vite page. Commit: `scaffold web + agent rules`.

#### Task 0.5 [C] Server scaffold (≈ 20 min)
- [ ] Run:
```bash
mkdir -p server/app server/tests server/sql server/scripts server/deploy && cd server
python3 -m venv .venv && source .venv/bin/activate
pip install fastapi "uvicorn[standard]" httpx livekit-api google-genai asyncpg python-dotenv pytest pyjwt
pip freeze > requirements.txt
touch app/__init__.py
```
- [ ] Create `server/.env.example`, then copy it to `server/.env` and fill in real values:
```
LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
ELEVENLABS_API_KEY=
ELEVEN_MODEL=eleven_flash_v2_5
DATABASE_URL=
```
- [ ] Commit: `scaffold server`.

---

### Phase 1 — Foundations (Sat 12:00–17:00)

#### Task 1.0 [A] Shared types (≈ 10 min, before anything else in A/B)
- [ ] Create `web/src/lib/types.ts`:
```ts
export type Pt = { x: number; y: number; z: number };
export type Brow = { raise: number; furrow: number };
/** One video frame of landmarks. Coordinates are MediaPipe-normalized (0..1, y down). */
export type Frame = {
  t: number;            // performance.now() in ms
  w: number; h: number; // video size, for aspect correction
  pose: Pt[] | null;    // pose landmarks 0..16 only (face + shoulders + arms)
  hands: Pt[][];        // 0..2 hands x 21 points, NOT labeled left/right
  brow: Brow | null;    // face blendshapes (updated every 3rd frame), null if face model off
};
export type ClipKind = 'sign' | 'letter';
export type Clip = { kind: ClipKind; label: string; frames: Frame[] };
export type Session = { version: 1; signer: string; recordedAt: string; clips: Clip[] };
export type Role = 'signer' | 'hearing';
export type Caption = {
  id: string; speaker: string; role: Role;
  kind: 'english' | 'speech'; text: string; final: boolean; ts: number;
  retracted?: boolean;  // signer marked a spoken sentence as a recognition error
};
export type Ctrl =
  | { type: 'signing'; on: boolean }
  | { type: 'tts'; on: boolean }
  | { type: 'clarify' }
  | { type: 'attention' }
  | { type: 'speak-local'; text: string }
  | { type: 'asl'; on: boolean };
```
- [ ] Commit: `shared types`.

#### Track C — Backend

##### Task 1.C1 Health, LiveKit token, gloss/tts/events routes (≈ 40 min)
- [ ] Write the failing tests `server/tests/test_api.py`:
```python
import asyncio

import jwt
from fastapi.testclient import TestClient

from app import gloss, main

client = TestClient(main.app)
SECRET = "devsecret-devsecret-devsecret-1234"


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["ok"] is True


def test_token_has_room_grant(monkeypatch):
    monkeypatch.setenv("LIVEKIT_API_KEY", "devkey")
    monkeypatch.setenv("LIVEKIT_API_SECRET", SECRET)
    monkeypatch.setenv("LIVEKIT_URL", "wss://example.livekit.cloud")
    r = client.post("/api/token", json={"room": "demo-room", "name": "Liv", "role": "signer"})
    assert r.status_code == 200
    claims = jwt.decode(r.json()["token"], SECRET, algorithms=["HS256"])
    assert claims["video"]["room"] == "demo-room"
    assert claims["video"]["roomJoin"] is True


def test_token_rejects_bad_room():
    r = client.post("/api/token", json={"room": "Demo Room!", "name": "Liv", "role": "signer"})
    assert r.status_code == 422


def test_gloss_failure_returns_502(monkeypatch):
    async def boom(_req):
        raise asyncio.TimeoutError()

    monkeypatch.setattr(gloss, "translate", boom)
    r = client.post("/api/gloss", json={"signs": [{"gloss": "HELLO", "p": 0.9}]})
    assert r.status_code == 502


def test_tts_rejects_bad_voice_id():
    r = client.post("/api/tts", json={"text": "Hello", "voice_id": "../../etc"})
    assert r.status_code == 422


def test_events_without_db_is_204(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    r = client.post("/api/events", json={"signs": [], "utterances": []})
    assert r.status_code == 204
```
- [ ] `cd server && pytest -q` → expected: `ModuleNotFoundError: No module named 'app.main'`.
- [ ] Create `server/app/gloss.py`:
```python
"""ASL gloss -> English with Gemini (JSON schema output)."""
from __future__ import annotations

import os
from typing import Literal

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")


class Alt(BaseModel):
    gloss: str = Field(max_length=40)
    p: float


class Sign(BaseModel):
    gloss: str = Field(max_length=40)
    p: float
    alts: list[Alt] = []


class GlossRequest(BaseModel):
    signs: list[Sign] = Field(min_length=1, max_length=20)
    tags: list[Literal["Q-YN", "Q-WH", "NEG"]] = []
    context: list[str] = Field(default=[], max_length=3)


class GlossResult(BaseModel):
    english: str
    sentence_type: Literal["statement", "yes_no_question", "wh_question"]
    confidence: float
    uncertain: list[str]


SYSTEM = """You turn the output of an American Sign Language (ASL) sign recognizer into ONE short, natural English utterance for a live video call.

Input: the recognized signs in order (uppercase ASL glosses) with the recognizer's confidence and up to 2 alternatives, optional face tags, and optional recent captions from the hearing person.

Rules:
- ASL word order differs from English. Time signs come first (TOMORROW ME GO STORE = "I'm going to the store tomorrow."). Topic-comment order is common. ASL leaves out is/am/are and articles; add them.
- ME = I/me. YOU = you. THANKYOU = thank you. A token like fs-KEV is a fingerspelled name: write it in Title Case ("Kev").
- A WH-sign (WHAT, WHERE, WHO, WHY, HOW) at the end makes a question: YOU NAME WHAT = "What's your name?"
- Tag Q-YN = raised eyebrows = yes/no question. Tag Q-WH = WH-question. Tag NEG = headshake = negate the main verb.
- If a low-confidence sign has an alternative that fits the sentence much better, you may use the alternative. Put every English word you are unsure about in "uncertain".
- Never add facts, names, places, feelings, or intensity that the signs do not contain. Prefer a short sentence over a guess.
- A single greeting stays short: HELLO = "Hello!", THANKYOU = "Thank you!", BYE = "Bye!"
- confidence = your 0-1 estimate that the English says what the signer meant. Use below 0.6 when the signs do not form a sensible sentence.

Examples:
HELLO ME NAME fs-KEV -> {"english":"Hello! My name is Kev.","sentence_type":"statement","confidence":0.95,"uncertain":[]}
YOU NAME WHAT -> {"english":"What's your name?","sentence_type":"wh_question","confidence":0.95,"uncertain":[]}
ME HUNGRY -> {"english":"I'm hungry.","sentence_type":"statement","confidence":0.95,"uncertain":[]}
YOU HUNGRY [Q-YN] -> {"english":"Are you hungry?","sentence_type":"yes_no_question","confidence":0.9,"uncertain":[]}
ME HUNGRY [NEG] -> {"english":"I'm not hungry.","sentence_type":"statement","confidence":0.9,"uncertain":[]}
PIZZA WHERE -> {"english":"Where can we get pizza?","sentence_type":"wh_question","confidence":0.85,"uncertain":["can we get"]}
GO NOW -> {"english":"Let's go now!","sentence_type":"statement","confidence":0.85,"uncertain":[]}
TOMORROW ME GO STORE -> {"english":"I'm going to the store tomorrow.","sentence_type":"statement","confidence":0.9,"uncertain":[]}
WATER STORE BYE -> {"english":"Water, store, bye?","sentence_type":"statement","confidence":0.3,"uncertain":["water","store"]}"""

_client: genai.Client | None = None


def client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return _client


def render(r: GlossRequest) -> str:
    lines = ["SIGNS:"]
    for i, s in enumerate(r.signs, 1):
        alts = ", ".join(f"{a.gloss} ({a.p:.2f})" for a in s.alts[:2])
        lines.append(f"{i}. {s.gloss} ({s.p:.2f})" + (f" alts: {alts}" if alts else ""))
    lines.append("FACE TAGS: " + (" ".join(r.tags) if r.tags else "none"))
    if r.context:
        lines.append("RECENT HEARING-SIDE CAPTIONS: " + " | ".join(r.context))
    return "\n".join(lines)


async def translate(r: GlossRequest) -> GlossResult:
    resp = await client().aio.models.generate_content(
        model=MODEL,
        contents=render(r),
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM,
            response_mime_type="application/json",
            response_schema=GlossResult,
            temperature=0.2,
            max_output_tokens=150,
        ),
    )
    return GlossResult.model_validate_json(resp.text)
```
- [ ] Create `server/app/db.py`:
```python
"""Tiger Data (TimescaleDB) writer + stats. Everything is a no-op when DATABASE_URL is unset."""
from __future__ import annotations

import os

import asyncpg

_pool: asyncpg.Pool | None = None


async def pool() -> asyncpg.Pool | None:
    global _pool
    url = os.environ.get("DATABASE_URL")
    if not url:
        return None
    if _pool is None:
        _pool = await asyncpg.create_pool(url, min_size=1, max_size=4, command_timeout=5)
    return _pool


SIGN_SQL = """INSERT INTO sign_events
 (ts, session_id, gloss, confidence, accepted, alt1, alt1_p, classify_ms, model_version)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)"""
UTT_SQL = """INSERT INTO utterance_events
 (ts, session_id, n_signs, gloss_seq, english, sentence_type, source, edited,
  gloss_ms, tts_ttfb_ms, end_to_end_ms)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)"""


async def insert_events(signs: list, utterances: list) -> None:
    p = await pool()
    if p is None or (not signs and not utterances):
        return
    async with p.acquire() as c:
        if signs:
            await c.executemany(SIGN_SQL, [
                (s.ts, s.session_id, s.gloss, s.confidence, s.accepted, s.alt1, s.alt1_p,
                 s.classify_ms, s.model_version) for s in signs])
        if utterances:
            await c.executemany(UTT_SQL, [
                (u.ts, u.session_id, u.n_signs, u.gloss_seq, u.english, u.sentence_type, u.source,
                 u.edited, u.gloss_ms, u.tts_ttfb_ms, u.end_to_end_ms) for u in utterances])


STATS_SQL = """
SELECT count(*) AS utterances,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY end_to_end_ms) AS e2e_p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY end_to_end_ms) AS e2e_p95,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY gloss_ms)      AS gloss_p50,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY tts_ttfb_ms)   AS tts_p50,
       avg((source = 'rules')::int)                                AS fallback_rate
FROM utterance_events WHERE ts > now() - interval '15 minutes'"""
TREND_SQL = """SELECT bucket, utterances, avg_e2e_ms, max_e2e_ms
FROM latency_1m WHERE bucket > now() - interval '30 minutes' ORDER BY bucket"""
SIGNS_SQL = """SELECT gloss, count(*) AS n, avg(confidence) AS avg_conf, avg(accepted::int) AS accept_rate
FROM sign_events WHERE ts > now() - interval '30 minutes' GROUP BY gloss ORDER BY accept_rate ASC LIMIT 8"""


async def stats() -> dict:
    p = await pool()
    if p is None:
        return {"configured": False}
    async with p.acquire() as c:
        summary = dict(await c.fetchrow(STATS_SQL))
        trend = [dict(r) for r in await c.fetch(TREND_SQL)]
        signs = [dict(r) for r in await c.fetch(SIGNS_SQL)]
    for row in trend:
        row["bucket"] = row["bucket"].isoformat()
    return {"configured": True, "summary": summary, "trend": trend, "weakest_signs": signs}
```
- [ ] Create `server/app/main.py`:
```python
"""SignLine API. Every vendor key stays here; the browser only calls /api/*."""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import StreamingResponse
from google.genai import errors as genai_errors
from livekit import api as lk
from pydantic import BaseModel, Field, ValidationError

load_dotenv()

from . import db, gloss  # noqa: E402  (imported after .env is loaded)

app = FastAPI(title="SignLine API")
ELEVEN = "https://api.elevenlabs.io"


def env(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        raise HTTPException(503, f"{name} is not configured on the server")
    return value


@app.get("/api/health")
def health():
    keys = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "GEMINI_API_KEY", "ELEVENLABS_API_KEY", "DATABASE_URL"]
    return {"ok": True, "configured": {k: bool(os.environ.get(k)) for k in keys}}


class TokenReq(BaseModel):
    room: str = Field(pattern=r"^[a-z0-9-]{3,32}$")
    name: str = Field(min_length=1, max_length=40)
    role: Literal["signer", "hearing"]


@app.post("/api/token")
def token(r: TokenReq):
    identity = f"{r.role}-{uuid.uuid4().hex[:8]}"  # opaque identity, display name separate
    grants = lk.VideoGrants(room_join=True, room=r.room, can_publish=True,
                            can_subscribe=True, can_publish_data=True)
    jwt_token = (lk.AccessToken(env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"))
                 .with_identity(identity).with_name(r.name)
                 .with_metadata(json.dumps({"role": r.role}))
                 .with_grants(grants).to_jwt())
    return {"token": jwt_token, "url": env("LIVEKIT_URL"), "identity": identity}


@app.post("/api/gloss", response_model=gloss.GlossResult)
async def gloss_route(r: gloss.GlossRequest):
    try:
        return await asyncio.wait_for(gloss.translate(r), timeout=2.5)
    except asyncio.TimeoutError:
        raise HTTPException(502, "gloss timeout")
    except genai_errors.APIError as e:  # 429 quota, 5xx, bad model name
        raise HTTPException(502, f"gemini error {getattr(e, 'code', '?')}")
    except (ValidationError, ValueError):  # model returned text that is not our schema
        raise HTTPException(502, "gemini returned invalid JSON")


class TtsReq(BaseModel):
    text: str = Field(min_length=1, max_length=400)
    voice_id: str = Field(pattern=r"^[A-Za-z0-9]{8,40}$")


@app.post("/api/tts")
async def tts(r: TtsReq):
    client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=3.0))
    req = client.build_request(
        "POST", f"{ELEVEN}/v1/text-to-speech/{r.voice_id}/stream",
        params={"output_format": "mp3_44100_128"},
        headers={"xi-api-key": env("ELEVENLABS_API_KEY")},
        json={"text": r.text, "model_id": os.environ.get("ELEVEN_MODEL", "eleven_flash_v2_5")},
    )
    upstream = await client.send(req, stream=True)
    if upstream.status_code != 200:
        detail = (await upstream.aread()).decode(errors="ignore")[:200]
        await upstream.aclose()
        await client.aclose()
        status = 429 if upstream.status_code == 429 else 502
        raise HTTPException(status, f"elevenlabs {upstream.status_code}: {detail}")

    async def body():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(body(), media_type="audio/mpeg")


_voices: list[dict] | None = None


@app.get("/api/voices")
async def voices():
    global _voices
    if _voices is None:
        async with httpx.AsyncClient(timeout=5) as c:
            res = await c.get(f"{ELEVEN}/v1/voices", headers={"xi-api-key": env("ELEVENLABS_API_KEY")})
        if res.status_code != 200:
            raise HTTPException(502, f"elevenlabs voices {res.status_code}")
        all_voices = res.json().get("voices", [])
        premade = [v for v in all_voices if v.get("category") == "premade"] or all_voices
        _voices = [{"id": v["voice_id"], "name": v["name"], "labels": v.get("labels") or {}}
                   for v in premade[:8]]
    return _voices


@app.post("/api/scribe-token")
async def scribe_token():
    async with httpx.AsyncClient(timeout=5) as c:
        res = await c.post(f"{ELEVEN}/v1/single-use-token/realtime_scribe",
                           headers={"xi-api-key": env("ELEVENLABS_API_KEY")})
    if res.status_code != 200:
        raise HTTPException(502, f"scribe token {res.status_code}")
    return {"token": res.json()["token"]}


class SignEvent(BaseModel):
    ts: datetime
    session_id: str
    gloss: str
    confidence: float
    accepted: bool
    alt1: str | None = None
    alt1_p: float | None = None
    classify_ms: float
    model_version: str


class UtteranceEvent(BaseModel):
    ts: datetime
    session_id: str
    n_signs: int
    gloss_seq: str
    english: str
    sentence_type: str
    source: Literal["gemini", "rules"]
    edited: bool
    gloss_ms: float
    tts_ttfb_ms: float | None = None
    end_to_end_ms: float | None = None


class Events(BaseModel):
    signs: list[SignEvent] = []
    utterances: list[UtteranceEvent] = []


@app.post("/api/events", status_code=204)
async def events(e: Events):
    await db.insert_events(e.signs, e.utterances)
    return Response(status_code=204)


@app.get("/api/stats")
async def stats():
    return await db.stats()
```
- [ ] `pytest -q` → expected `6 passed`.
- [ ] Run `uvicorn app.main:app --reload --port 8000`, then:
```bash
curl -s localhost:8000/api/health
curl -s -X POST localhost:8000/api/token -H 'content-type: application/json' -d '{"room":"demo-room","name":"Kev","role":"signer"}' | head -c 120
```
Expected: health shows the configured keys as `true`; the token response starts with `{"token":"eyJ`.
- [ ] Commit: `api: health, token, gloss, tts, voices, events`.

##### Task 1.C2 Gemini prompt check (≈ 30 min)
- [ ] Write the failing test `server/tests/test_gloss.py`:
```python
from app.gloss import GlossRequest, render


def test_render_lists_alts_tags_and_context():
    req = GlossRequest(
        signs=[{"gloss": "YOU", "p": 0.91},
               {"gloss": "NAME", "p": 0.55, "alts": [{"gloss": "CHAIR", "p": 0.3}]},
               {"gloss": "WHAT", "p": 0.88}],
        tags=["Q-WH"], context=["Hi, I'm Priya"])
    text = render(req)
    assert "2. NAME (0.55) alts: CHAIR (0.30)" in text
    assert "FACE TAGS: Q-WH" in text
    assert "Hi, I'm Priya" in text
```
- [ ] `pytest -q` → passes. (If it fails, fix `render`, not the test.)
- [ ] Create `server/scripts/eval_gloss.py`:
```python
"""Run 12 glosses through Gemini; print English + latency. Usage: PYTHONPATH=. python scripts/eval_gloss.py"""
import asyncio
import time

from dotenv import load_dotenv

load_dotenv()
from app.gloss import GlossRequest, translate  # noqa: E402

CASES = [
    (["HELLO", "ME", "NAME", "fs-KEV"], []), (["YOU", "NAME", "WHAT"], ["Q-WH"]), (["ME", "HUNGRY"], []),
    (["YOU", "HUNGRY"], ["Q-YN"]), (["ME", "HUNGRY"], ["NEG"]), (["PIZZA", "WHERE"], ["Q-WH"]), (["GO", "NOW"], []),
    (["TOMORROW", "ME", "GO", "STORE"], []), (["PLEASE", "WAIT"], []), (["THANKYOU", "BYE"], []), (["YES"], []),
    (["LATER", "WATER"], []),
]


async def main() -> None:
    times = []
    for glosses, tags in CASES:
        req = GlossRequest(signs=[{"gloss": g, "p": 0.9} for g in glosses], tags=tags)
        t0 = time.perf_counter()
        out = await translate(req)
        ms = (time.perf_counter() - t0) * 1000
        times.append(ms)
        print(f"{ms:6.0f} ms  {' '.join(glosses):30s} -> {out.english}  [{out.sentence_type} {out.confidence:.2f}]")
    times.sort()
    print(f"p50 {times[len(times) // 2]:.0f} ms   max {times[-1]:.0f} ms")


asyncio.run(main())
```
- [ ] `PYTHONPATH=. python scripts/eval_gloss.py` → 12 sensible sentences, p50 under ~1000 ms. The last case (`LATER WATER`) should come back with low confidence, because auto-speak relies on that. If an output invents content, add that case as another example in `SYSTEM` and rerun. Save the p50 for the slides.
- [ ] `429`/`RESOURCE_EXHAUSTED` → check AI Studio limits / enable Tier 1. `404 model not found` → confirm the model name at ai.google.dev/gemini-api/docs/models and update `GEMINI_MODEL`.
- [ ] Commit: `gloss prompt + eval`.

##### Task 1.C3 TTS check (≈ 20 min)
- [ ] With the server running:
```bash
curl -s localhost:8000/api/voices | python3 -m json.tool | head -20
VOICE=$(curl -s localhost:8000/api/voices | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
time curl -s -X POST localhost:8000/api/tts -H 'content-type: application/json' \
  -d "{\"text\":\"Hello! My name is Kev.\",\"voice_id\":\"$VOICE\"}" -o /tmp/hello.mp3
```
Expected: a voice list, and an MP3 (~20–40 KB) in well under 2 s. Play it. Kev picks the demo voice and writes its ID in `README.md`.

##### Task 1.C4 Early Vultr deploy of the skeleton (≈ 60 min)
- [ ] `ssh root@VULTR_IP`, then:
```bash
apt update && apt install -y python3-venv git caddy ufw
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
mkdir -p /srv/signline/web && cd /srv/signline
git clone https://github.com/Azrkiel/banana-brownies-ghh2026.git repo
cd repo/server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
nano .env      # same keys as your local server/.env
```
- [ ] Create `server/deploy/signline.service` (commit it) and install it:
```ini
[Unit]
Description=SignLine API
After=network.target

[Service]
WorkingDirectory=/srv/signline/repo/server
ExecStart=/srv/signline/repo/server/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```
```bash
cp /srv/signline/repo/server/deploy/signline.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now signline && systemctl status signline --no-pager
```
- [ ] Create `server/deploy/Caddyfile`, using your IP with dashes plus `.sslip.io` (free HTTPS hostname, no domain needed):
```
149-28-1-2.sslip.io {
	encode zstd gzip
	handle /api/* {
		reverse_proxy 127.0.0.1:8000 {
			flush_interval -1
		}
	}
	handle {
		root * /srv/signline/web
		try_files {path} /index.html
		file_server
	}
}
```
```bash
cp /srv/signline/repo/server/deploy/Caddyfile /etc/caddy/Caddyfile && systemctl reload caddy
curl -s https://149-28-1-2.sslip.io/api/health
```
Expected: `{"ok":true,…}` over HTTPS (the first request can take ~20 s while the certificate is issued). `flush_interval -1` keeps TTS audio streaming. Commit: `deploy files`.

##### Task 1.C5 Tiger Data schema (≈ 30 min)
- [ ] Create `server/sql/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS sign_events (
  ts            timestamptz NOT NULL,
  session_id    text        NOT NULL,
  gloss         text        NOT NULL,
  confidence    real        NOT NULL,
  accepted      boolean     NOT NULL,
  alt1          text,
  alt1_p        real,
  classify_ms   real        NOT NULL,
  model_version text        NOT NULL
) WITH (tsdb.hypertable, tsdb.partition_column = 'ts');

CREATE TABLE IF NOT EXISTS utterance_events (
  ts            timestamptz NOT NULL,
  session_id    text        NOT NULL,
  n_signs       int         NOT NULL,
  gloss_seq     text        NOT NULL,
  english       text        NOT NULL,
  sentence_type text        NOT NULL,
  source        text        NOT NULL,      -- 'gemini' | 'rules'
  edited        boolean     NOT NULL,      -- signer fixed a chip before speaking
  gloss_ms      real        NOT NULL,
  tts_ttfb_ms   real,
  end_to_end_ms real                       -- last sign end -> voice starts, minus human confirm time
) WITH (tsdb.hypertable, tsdb.partition_column = 'ts');

CREATE MATERIALIZED VIEW IF NOT EXISTS latency_1m
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 minute', ts) AS bucket,
       count(*)                   AS utterances,
       avg(end_to_end_ms)         AS avg_e2e_ms,
       max(end_to_end_ms)         AS max_e2e_ms,
       avg(gloss_ms)              AS avg_gloss_ms,
       avg(tts_ttfb_ms)           AS avg_tts_ms
FROM utterance_events
GROUP BY bucket
WITH NO DATA;

-- include not-yet-materialized rows so the live dashboard is current
ALTER MATERIALIZED VIEW latency_1m SET (timescaledb.materialized_only = false);

SELECT add_continuous_aggregate_policy('latency_1m',
  start_offset => INTERVAL '2 hours', end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');
```
- [ ] `psql "$DATABASE_URL" -f sql/schema.sql` (or paste into the Tiger Cloud SQL editor). Expected: `CREATE TABLE` ×2, `CREATE MATERIALIZED VIEW`, `ALTER MATERIALIZED VIEW`, one job id. If `WITH (tsdb.hypertable …)` errors, remove those two `WITH (...)` clauses, rerun, then `SELECT create_hypertable('sign_events','ts'); SELECT create_hypertable('utterance_events','ts');`.
- [ ] Add `DATABASE_URL` to local and Vultr `.env`, restart; `curl -s localhost:8000/api/stats` → `{"configured":true,…}`. Commit: `tiger data schema`.

#### Track A — Call skeleton

##### Task 1.A1 API client, LiveKit call module, caption lane, routes (≈ 60 min)
- [ ] Create `web/src/lib/api.ts`:
```ts
import type { Role } from './types';

async function post<T>(path: string, body: unknown, timeoutMs = 8000): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return (await res.json()) as T;
}

export const getToken = (room: string, name: string, role: Role) =>
  post<{ token: string; url: string; identity: string }>('/api/token', { room, name, role });

export type GlossSign = { gloss: string; p: number; alts: { gloss: string; p: number }[] };
export type GlossResult = {
  english: string;
  sentence_type: 'statement' | 'yes_no_question' | 'wh_question';
  confidence: number;
  uncertain: string[];
};
export const translateGloss = (signs: GlossSign[], tags: string[], context: string[]) =>
  post<GlossResult>('/api/gloss', { signs, tags, context }, 3000);

export async function fetchTts(text: string, voiceId: string): Promise<Blob> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voiceId }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`/api/tts ${res.status}`);
  return res.blob();
}

export type VoiceInfo = { id: string; name: string; labels: Record<string, string> };
export async function getVoices(): Promise<VoiceInfo[]> {
  const res = await fetch('/api/voices', { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`/api/voices ${res.status}`);
  return (await res.json()) as VoiceInfo[];
}

export const getScribeToken = () => post<{ token: string }>('/api/scribe-token', {});
```
- [ ] Create `web/src/lib/call.ts`:
```ts
import { Room, RoomEvent, Track, type RemoteTrack, type RemoteParticipant } from 'livekit-client';
import { getToken } from './api';
import type { Caption, Ctrl, Role } from './types';

export type CallStatus = 'connected' | 'reconnecting' | 'disconnected' | 'audio-blocked';
export type CallHandlers = {
  onCaption(c: Caption): void;
  onCtrl(m: Ctrl, fromIdentity: string): void;
  onRemoteVideo(track: RemoteTrack | null): void;
  onStatus(s: CallStatus): void;
  onPeer(name: string | null): void;
};
export type Call = {
  room: Room;
  sendCaption(c: Caption): Promise<void>;
  sendCtrl(m: Ctrl): Promise<void>;
  leave(): Promise<void>;
};

export async function joinCall(o: {
  room: string; name: string; role: Role;
  camera: MediaStreamTrack;          // the SAME track MediaPipe reads; never opened twice
  voice?: MediaStreamTrack;          // signer only: synthesized voice from VoiceOut
  h: CallHandlers;
}): Promise<Call> {
  const { token, url } = await getToken(o.room, o.name, o.role);
  const room = new Room({ adaptiveStream: true, dynacast: true });

  room
    .on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video) o.h.onRemoteVideo(track);
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.style.display = 'none';
        document.body.appendChild(el);
      }
    })
    .on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Video) o.h.onRemoteVideo(null);
      track.detach().forEach((el) => el.remove());
    })
    .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => o.h.onPeer(p.name || p.identity))
    .on(RoomEvent.ParticipantDisconnected, () => o.h.onPeer(null))
    .on(RoomEvent.Reconnecting, () => o.h.onStatus('reconnecting'))
    .on(RoomEvent.Reconnected, () => o.h.onStatus('connected'))
    .on(RoomEvent.Disconnected, () => o.h.onStatus('disconnected'))
    .on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (!room.canPlaybackAudio) o.h.onStatus('audio-blocked');
    });

  room.registerTextStreamHandler('caption', async (reader) => {
    try { o.h.onCaption(JSON.parse(await reader.readAll()) as Caption); }
    catch (e) { console.warn('bad caption message', e); }
  });
  room.registerTextStreamHandler('ctrl', async (reader, info) => {
    try { o.h.onCtrl(JSON.parse(await reader.readAll()) as Ctrl, info.identity); }
    catch (e) { console.warn('bad ctrl message', e); }
  });

  await room.connect(url, token);
  await room.localParticipant.publishTrack(o.camera, { source: Track.Source.Camera });
  if (o.voice) await room.localParticipant.publishTrack(o.voice, { source: Track.Source.Microphone, name: 'voice' });
  if (o.role === 'hearing') await room.localParticipant.setMicrophoneEnabled(true);
  for (const p of room.remoteParticipants.values()) o.h.onPeer(p.name || p.identity);
  o.h.onStatus('connected');

  return {
    room,
    sendCaption: async (c) => { await room.localParticipant.sendText(JSON.stringify(c), { topic: 'caption' }); },
    sendCtrl: async (m) => { await room.localParticipant.sendText(JSON.stringify(m), { topic: 'ctrl' }); },
    leave: () => room.disconnect(),
  };
}
```
- [ ] Create `web/src/components/CaptionLane.tsx`:
```tsx
import type { Caption } from '../lib/types';

export function upsertCaption(list: Caption[], c: Caption): Caption[] {
  const i = list.findIndex((x) => x.id === c.id);
  if (i === -1) return [...list, c].slice(-50);
  const next = list.slice();
  next[i] = c;
  return next;
}

export function CaptionLane({ captions, me }: { captions: Caption[]; me: string }) {
  return (
    <div className="lane" aria-live="polite">
      {captions.slice(-8).map((c) => (
        <p key={c.id} className={`cap${c.final ? '' : ' interim'}${c.speaker === me ? ' mine' : ''}`}>
          <b>{c.speaker}:</b>{' '}
          {c.retracted ? <><s>{c.text}</s> <em>(recognition error — {c.speaker} took this back)</em></> : c.text}
        </p>
      ))}
    </div>
  );
}
```
- [ ] Create `web/src/pages/Call.tsx` (a first version that proves video + captions between two laptops; Task 2.A3 replaces it):
```tsx
import { useRef, useState } from 'react';
import { joinCall, type Call as CallT } from '../lib/call';
import { CaptionLane, upsertCaption } from '../components/CaptionLane';
import type { Caption, Role } from '../lib/types';

export default function Call() {
  const [room, setRoom] = useState('demo-room');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('signer');
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [status, setStatus] = useState('');
  const [draft, setDraft] = useState('');
  const local = useRef<HTMLVideoElement>(null);
  const remote = useRef<HTMLVideoElement>(null);
  const call = useRef<CallT | null>(null);

  async function join() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 }, audio: false });
    local.current!.srcObject = stream;
    call.current = await joinCall({
      room, name, role, camera: stream.getVideoTracks()[0],
      h: {
        onCaption: (c) => setCaptions((l) => upsertCaption(l, c)),
        onCtrl: () => {},
        onRemoteVideo: (t) => { if (t && remote.current) t.attach(remote.current); },
        onStatus: setStatus,
        onPeer: () => {},
      },
    });
  }

  async function send() {
    const c: Caption = { id: crypto.randomUUID(), speaker: name, role, kind: 'english', text: draft, final: true, ts: Date.now() };
    setCaptions((l) => upsertCaption(l, c));
    await call.current?.sendCaption(c);
    setDraft('');
  }

  return (
    <main>
      <p>{status}</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      <input value={room} onChange={(e) => setRoom(e.target.value)} />
      <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
        <option value="signer">Signer</option><option value="hearing">Hearing</option>
      </select>
      <button onClick={join} disabled={!name}>Join</button>
      <video ref={local} autoPlay muted playsInline className="mirror" width={320} />
      <video ref={remote} autoPlay playsInline width={320} />
      <CaptionLane captions={captions} me={name} />
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
    </main>
  );
}
```
- [ ] Create `web/src/App.tsx`:
```tsx
import { useEffect, useState, type ReactElement } from 'react';
import Call from './pages/Call';

const routes: Record<string, () => ReactElement> = {
  '': () => <Call />,
  // later tasks add routes here
};

export default function App() {
  const [hash, setHash] = useState(location.hash.replace('#/', ''));
  useEffect(() => {
    const on = () => setHash(location.hash.replace('#/', ''));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const Page = routes[hash] ?? routes[''];
  return <Page />;
}
```
- [ ] Add to `web/src/index.css`: `.mirror{transform:scaleX(-1)} .lane{font-size:1.4rem;max-width:40rem} .cap.interim{opacity:.55} .cap.mine{color:#2563eb}`. Mirror only the local preview, never the published track.
- [ ] Two-laptop test: laptop 1 runs the server with `uvicorn app.main:app --host 0.0.0.0 --port 8000` plus `npm run dev`. Laptop 2 runs `VITE_API_PROXY=http://<laptop-1-LAN-IP>:8000 npm run dev`. Both open http://localhost:5173 and join `demo-room`. Expected: each sees the other's video, and typed captions appear on both screens.
- [ ] Commit: `call skeleton with captions`.

#### Track B — Landmarks, features, data (Kev, MSI)

##### Task 1.B1 Tracker + benchmark (≈ 45 min) — also picks the signer laptop
- [ ] Create `web/src/lib/landmarks.ts`:
```ts
import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Brow, Frame, Pt } from './types';

export type Tracker = { detect(video: HTMLVideoElement, t: number): Frame; close(): void };

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
const toPt = (p: { x: number; y: number; z: number }): Pt => ({ x: r4(p.x), y: r4(p.y), z: r4(p.z) });

/** Hand (2 hands!) + Pose lite, optional Face blendshapes every 3rd frame. All files served locally. */
export async function createTracker(opts: { withFace: boolean }): Promise<Tracker> {
  const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
  const hand = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: '/models/hand_landmarker.task', delegate: 'GPU' },
    runningMode: 'VIDEO', numHands: 2, // default is 1 — two-handed signs would silently lose a hand
  });
  const pose = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate: 'GPU' },
    runningMode: 'VIDEO', numPoses: 1,
  });
  const face = opts.withFace
    ? await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'GPU' },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
      })
    : null;

  let n = 0;
  let brow: Brow | null = null;
  return {
    detect(video, t) {
      const h = hand.detectForVideo(video, t);
      const p = pose.detectForVideo(video, t);
      if (face && n++ % 3 === 0) {
        const cats = face.detectForVideo(video, t).faceBlendshapes?.[0]?.categories ?? [];
        const g = (name: string) => cats.find((c) => c.categoryName === name)?.score ?? 0;
        brow = cats.length
          ? { raise: (g('browInnerUp') + g('browOuterUpLeft') + g('browOuterUpRight')) / 3,
              furrow: (g('browDownLeft') + g('browDownRight')) / 2 }
          : null;
      }
      return {
        t, w: video.videoWidth, h: video.videoHeight,
        pose: p.landmarks[0] ? p.landmarks[0].slice(0, 17).map(toPt) : null,
        hands: h.landmarks.map((hl) => hl.map(toPt)),
        brow,
      };
    },
    close() { hand.close(); pose.close(); face?.close(); },
  };
}
```
- [ ] Create `web/src/pages/Bench.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { createTracker } from '../lib/landmarks';

export default function Bench() {
  const video = useRef<HTMLVideoElement>(null);
  const [withFace, setWithFace] = useState(true);
  const [info, setInfo] = useState('loading…');

  useEffect(() => {
    let raf = 0; let stop = false;
    (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 } });
      video.current!.srcObject = stream;
      await video.current!.play();
      const tracker = await createTracker({ withFace });
      let frames = 0; let t0 = performance.now(); let detectMs = 0;
      const loop = () => {
        if (stop) return;
        const a = performance.now();
        const f = tracker.detect(video.current!, a);
        detectMs += performance.now() - a; frames++;
        if (performance.now() - t0 > 1000) {
          setInfo(`FPS ${frames} · detect ${(detectMs / frames).toFixed(1)} ms · hands ${f.hands.length} · pose ${f.pose ? 'yes' : 'no'} · brow ${f.brow ? f.brow.raise.toFixed(2) + '/' + f.brow.furrow.toFixed(2) : '-'}`);
          frames = 0; detectMs = 0; t0 = performance.now();
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
    })();
    return () => { stop = true; cancelAnimationFrame(raf); };
  }, [withFace]);

  return (
    <main>
      <label><input type="checkbox" checked={withFace} onChange={(e) => setWithFace(e.target.checked)} /> face model</label>
      <p>{info}</p>
      <video ref={video} muted playsInline className="mirror" width={480} />
    </main>
  );
}
```
- [ ] Add the route:
<!-- edit: web/src/App.tsx -->
**Edit 1 — find:**
```tsx
import Call from './pages/Call';
```
**Replace with:**
```tsx
import Call from './pages/Call';
import Bench from './pages/Bench';
```
<!-- edit: web/src/App.tsx -->
**Edit 2 — find:**
```tsx
  // later tasks add routes here
```
**Replace with:**
```tsx
  bench: () => <Bench />,
  // later tasks add routes here
```
- [ ] Open http://localhost:5173/#/bench **on each laptop** (plugged in, other tabs closed) and note the FPS with the face model on. The signer laptop is the one with ≥ 20 FPS and the best webcam image (default: the MSI). FPS 12–20 → set `USE_FACE = false` in `config.ts` later (eyebrows then come from Presage or the "?" button). Below 12 → use 480×360 capture.
- [ ] Hold up only your right hand → `hands 1`; then both → `hands 2`. MediaPipe's left/right labels are never used; handedness is handled per sign in Task 1.B2.
- [ ] Commit: `tracker + bench`.

##### Task 1.B2 Features with canonical handedness (≈ 60 min, TDD)
- [ ] Write the failing test `web/src/lib/features.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { canonicalize, clipFeatures, FEAT_PER_FRAME, frameFeatures, anchors, mirrorFrame, orderHands, resample, T } from './features';
import type { Frame, Pt } from './types';

const P = (x: number, y: number): Pt => ({ x, y, z: 0 });
function pose(dx = 0, s = 1): Pt[] {
  const pts = Array.from({ length: 17 }, () => P(0.5, 0.3));
  pts[0] = P(0.5, 0.3); pts[9] = P(0.48, 0.38); pts[10] = P(0.52, 0.38);
  pts[11] = P(0.4, 0.6); pts[12] = P(0.6, 0.6);
  return pts.map((p) => P(0.5 + (p.x - 0.5) * s + dx, 0.5 + (p.y - 0.5) * s));
}
function hand(cx: number, cy: number, dx = 0, s = 1): Pt[] {
  return Array.from({ length: 21 }, (_, i) =>
    P(0.5 + (cx + 0.01 * (i % 5) - 0.5) * s + dx, 0.5 + (cy - 0.01 * Math.floor(i / 5) - 0.5) * s));
}
const frame = (hands: Pt[][], dx = 0, s = 1): Frame =>
  ({ t: 0, w: 640, h: 480, pose: pose(dx, s), hands: hands.map((h) => h.map((p) => P(0.5 + (p.x - 0.5) * s + dx, 0.5 + (p.y - 0.5) * s))), brow: null });

describe('features', () => {
  it('has the documented size', () => {
    const f = frame([hand(0.45, 0.4)]);
    expect(frameFeatures(f, anchors(f, null)!)).toHaveLength(FEAT_PER_FRAME);
  });
  it('is invariant to translation and scale of the whole scene', () => {
    const a = frame([hand(0.45, 0.4), hand(0.6, 0.45)]);
    const b = frame([hand(0.45, 0.4), hand(0.6, 0.45)], 0.07, 1.25);
    const fa = frameFeatures(a, anchors(a, null)!); const fb = frameFeatures(b, anchors(b, null)!);
    fa.forEach((v, i) => expect(fb[i]).toBeCloseTo(v, 5));
  });
  it('mirrors a clip whose image-right hand does the moving (left-handed signer)', () => {
    const still = hand(0.3, 0.45);
    const clip = Array.from({ length: 10 }, (_, i) => frame([still, hand(0.65, 0.3 + 0.02 * i)]));
    const c = canonicalize(clip);
    expect(c[0].hands[0][0].x).toBeCloseTo(1 - clip[0].hands[0][0].x, 6);
    const rightHanded = Array.from({ length: 10 }, (_, i) => frame([hand(0.35, 0.3 + 0.02 * i), hand(0.7, 0.45)]));
    expect(canonicalize(rightHanded)).toBe(rightHanded);
  });
  it('gives the same features for a sign and its mirror image', () => {
    const clip = Array.from({ length: 12 }, (_, i) => frame([hand(0.35 + 0.01 * i, 0.3 + 0.02 * i)]));
    const a = clipFeatures(clip), b = clipFeatures(clip.map(mirrorFrame));
    a.forEach((v, i) => expect(b[i]).toBeCloseTo(v, 5));
  });
  it('puts the image-left hand first (dominant after canonical mirroring)', () => {
    const left = hand(0.3, 0.4); const right = hand(0.7, 0.4);
    expect(orderHands([right, left])[0]).toBe(left);
    expect(orderHands([right])[1]).toBeNull();
  });
  it('zero-fills a missing hand and sets presence flags', () => {
    const f = frame([hand(0.45, 0.4)]);
    const v = frameFeatures(f, anchors(f, null)!);
    expect(v.slice(84, 168).every((x) => x === 0)).toBe(true);
    expect(v.slice(-2)).toEqual([1, 0]);
  });
  it('mirrors x for left-handed signers', () => {
    const f = frame([hand(0.3, 0.4)]);
    expect(mirrorFrame(f).hands[0][0].x).toBeCloseTo(1 - f.hands[0][0].x, 6);
  });
  it('resamples any length to T frames and keeps endpoints', () => {
    const seq = Array.from({ length: 50 }, (_, i) => [i, 2 * i]);
    const r = resample(seq, T);
    expect(r).toHaveLength(T);
    expect(r[0]).toEqual([0, 0]);
    expect(r[T - 1]).toEqual([49, 98]);
  });
  it('clipFeatures returns T x F floats', () => {
    const frames = Array.from({ length: 20 }, () => frame([hand(0.45, 0.4)]));
    expect(clipFeatures(frames)).toHaveLength(T * FEAT_PER_FRAME);
  });
});
```
- [ ] `npm test` → fails (`Cannot find module './features'`).
- [ ] Create `web/src/lib/features.ts`:
```ts
import type { Frame, Pt } from './types';

// KEEP IN SYNC with ml/features.py — `pytest ml/tests/test_parity.py` fails if they drift.
export const T = 32;                                 // frames per sign after resampling (~1 s at 30 fps)
export const FEAT_PER_FRAME = 2 * (42 + 42) + 4 + 2; // 174
// layout: [dom global 42][dom local 42][non-dom global 42][non-dom local 42][face 4][presence 2]
// everything before the last 2 values is (x, y) pairs, so rotation augmentation can rotate pairs.

type XY = [number, number];
export type Anchors = { c: XY; s: number; nose: XY; mouth: XY; restY: number };

const NOSE = 0, MOUTH_L = 9, MOUTH_R = 10, SH_L = 11, SH_R = 12;
const xy = (p: Pt, aspect: number): XY => [p.x * aspect, p.y];   // aspect-corrected: x and y in image-height units
const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const len = (a: XY) => Math.hypot(a[0], a[1]);

/** Shoulder-centred frame of reference; falls back to the previous anchors when pose is missing. */
export function anchors(f: Frame, prev: Anchors | null): Anchors | null {
  if (!f.pose || f.pose.length < 13) return prev;
  const asp = f.w / f.h;
  const l = xy(f.pose[SH_L], asp), r = xy(f.pose[SH_R], asp);
  const s = len(sub(l, r));
  if (s < 1e-3) return prev;
  const m1 = xy(f.pose[MOUTH_L], asp), m2 = xy(f.pose[MOUTH_R], asp);
  const c: XY = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2];
  return { c, s, nose: xy(f.pose[NOSE], asp), mouth: [(m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2], restY: c[1] + 0.8 * s };
}

/** Image-left hand first. After canonicalize(), that is the active (dominant) hand. */
export function orderHands(hands: Pt[][]): [Pt[] | null, Pt[] | null] {
  if (hands.length === 0) return [null, null];
  if (hands.length === 1) return [hands[0], null];
  const [a, b] = hands;
  return a[0].x <= b[0].x ? [a, b] : [b, a];
}

export function mirrorFrame(f: Frame): Frame {
  const m = (p: Pt): Pt => ({ x: 1 - p.x, y: p.y, z: p.z });
  return { ...f, pose: f.pose ? f.pose.map(m) : null, hands: f.hands.map((h) => h.map(m)) };
}

/** Normalized x of the shoulder midpoint (0.5 when pose is missing). */
export function bodyCenterX(f: Frame): number {
  return f.pose && f.pose.length >= 13 ? (f.pose[SH_L].x + f.pose[SH_R].x) / 2 : 0.5;
}

/** Per-clip handedness. If the image-right hand moved more than the image-left hand, mirror the whole clip,
 *  so the active hand is always image-left. Handles left-handed signers and datasets with unknown mirroring. */
export function canonicalize(frames: Frame[]): Frame[] {
  let left = 0, right = 0;
  let pl: Pt | null = null, pr: Pt | null = null;
  for (const f of frames) {
    let l: Pt | null = null, r: Pt | null = null;
    if (f.hands.length >= 2) {
      const [a, b] = orderHands(f.hands);
      l = a![0]; r = b![0];
    } else if (f.hands.length === 1) {
      const w = f.hands[0][0];
      if (w.x <= bodyCenterX(f)) l = w; else r = w;
    }
    if (l && pl) left += Math.hypot(l.x - pl.x, l.y - pl.y);
    if (r && pr) right += Math.hypot(r.x - pr.x, r.y - pr.y);
    pl = l; pr = r;
  }
  return right > left ? frames.map(mirrorFrame) : frames;
}

function pushHand(out: number[], hand: Pt[] | null, a: Anchors, asp: number) {
  if (!hand) { for (let i = 0; i < 84; i++) out.push(0); return; }
  const pts = hand.map((p) => xy(p, asp));
  for (const p of pts) out.push((p[0] - a.c[0]) / a.s, (p[1] - a.c[1]) / a.s);      // where the hand is
  const w = pts[0];
  const scale = len(sub(pts[9], w)) || 1e-3;
  for (const p of pts) out.push((p[0] - w[0]) / scale, (p[1] - w[1]) / scale);       // handshape
}

export function frameFeatures(f: Frame, a: Anchors): number[] {
  const asp = f.w / f.h;
  const [dom, non] = orderHands(f.hands);
  const out: number[] = [];
  pushHand(out, dom, a, asp);
  pushHand(out, non, a, asp);
  if (dom) {
    const tip = xy(dom[8], asp);
    out.push((tip[0] - a.nose[0]) / a.s, (tip[1] - a.nose[1]) / a.s, (tip[0] - a.mouth[0]) / a.s, (tip[1] - a.mouth[1]) / a.s);
  } else out.push(0, 0, 0, 0);
  out.push(dom ? 1 : 0, non ? 1 : 0);
  return out;
}

export function resample(seq: number[][], n: number): number[][] {
  if (seq.length === 0) return [];
  if (seq.length === 1) return Array.from({ length: n }, () => seq[0].slice());
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const pos = (i * (seq.length - 1)) / (n - 1);
    const lo = Math.floor(pos), hi = Math.min(lo + 1, seq.length - 1), w = pos - lo;
    out.push(seq[lo].map((v, k) => v * (1 - w) + seq[hi][k] * w));
  }
  return out;
}

/** Raw frames of one sign -> Float32Array(T * FEAT_PER_FRAME). Same steps as ml/features.py clip_features(). */
export function clipFeatures(raw: Frame[]): Float32Array {
  const frames = canonicalize(raw);
  let first = frames.findIndex((f) => f.hands.length > 0);
  let last = frames.length - 1 - [...frames].reverse().findIndex((f) => f.hands.length > 0);
  if (first === -1) { first = 0; last = frames.length - 1; }
  let a: Anchors | null = null;
  for (const f of frames) { a = anchors(f, a); if (a) break; }       // seed with first valid pose
  const seq: number[][] = [];
  for (const f of frames.slice(first, last + 1)) {
    a = anchors(f, a);
    seq.push(a ? frameFeatures(f, a) : new Array(FEAT_PER_FRAME).fill(0));
  }
  const out = new Float32Array(T * FEAT_PER_FRAME);
  resample(seq, T).forEach((row, i) => out.set(row, i * FEAT_PER_FRAME));
  return out;
}
```
- [ ] `npm test` → expected `9 passed`. The two new tests prove a left-handed signer and a mirrored dataset give the same features as a right-handed one, so no "left-handed" setting is needed.
- [ ] Commit: `landmark features with canonical handedness`.

##### Task 1.B3 Segmenter (≈ 50 min, TDD)
- [ ] Write the failing test `web/src/lib/segmenter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Segmenter, type SegEvent } from './segmenter';
import type { Frame, Pt } from './types';

const P = (x: number, y: number): Pt => ({ x, y, z: 0 });
const pose = (): Pt[] => {
  const p = Array.from({ length: 17 }, () => P(0.5, 0.3));
  p[11] = P(0.4, 0.6); p[12] = P(0.6, 0.6);
  return p;
};
const hand = (x: number, y: number): Pt[] => Array.from({ length: 21 }, (_, i) => P(x + 0.005 * (i % 5), y - 0.005 * Math.floor(i / 5)));
let t = 0;
const fr = (h: Pt[] | null): Frame => ({ t: (t += 33), w: 640, h: 480, pose: pose(), hands: h ? [h] : [], brow: null });

function run(seg: Segmenter, frames: Frame[]): SegEvent[] {
  return frames.map((f) => seg.push(f)).filter((e): e is SegEvent => e !== null);
}
const endReason = (ev: SegEvent[]) => { const e = ev.at(-1); return e?.kind === 'end' ? e.reason : null; };
const moving = (n: number, y = 0.4) => Array.from({ length: n }, (_, i) => fr(hand(0.45 + (i % 2 ? 0.03 : -0.03), y)));
const still = (n: number, y = 0.4) => Array.from({ length: n }, () => fr(hand(0.45, y)));

describe('Segmenter', () => {
  it('never starts without hands', () => {
    expect(run(new Segmenter(), Array.from({ length: 60 }, () => fr(null)))).toEqual([]);
  });
  it('starts on fast motion and ends when the hand holds still', () => {
    const ev = run(new Segmenter(), [...still(5), ...moving(15), ...still(30)]);
    expect(ev.map((e) => e.kind)).toEqual(['start', 'end']);
    const end = ev[1];
    expect(end.kind === 'end' && end.reason).toBe('still');
    expect(end.kind === 'end' && end.frames.length).toBeGreaterThanOrEqual(15);
  });
  it('ends when the hand drops below the rest line', () => {
    const ev = run(new Segmenter(), [...moving(15), ...still(3, 0.95)]);
    expect(endReason(ev)).toBe('lowered');
  });
  it('ends when hands disappear', () => {
    const ev = run(new Segmenter(), [...moving(15), ...Array.from({ length: 12 }, () => fr(null))]);
    expect(endReason(ev)).toBe('lost');
  });
  it('works when the moving hand is on the image-right side (left-handed signer)', () => {
    const lefty = (n: number) => Array.from({ length: n }, (_, i) => fr(hand(0.62 + (i % 2 ? 0.03 : -0.03), 0.4)));
    const ev = run(new Segmenter(), [...lefty(15), ...Array.from({ length: 30 }, () => fr(hand(0.62, 0.4)))]);
    expect(ev.map((e) => e.kind)).toEqual(['start', 'end']);
  });
  it('can start again after cooldown', () => {
    const ev = run(new Segmenter(), [...moving(15), ...still(30), ...moving(15), ...still(30)]);
    expect(ev.filter((e) => e.kind === 'end')).toHaveLength(2);
  });
});
```
- [ ] `npm test` → fails. Create `web/src/lib/segmenter.ts`:
```ts
import { anchors, type Anchors } from './features';
import type { Frame } from './types';

export type SegReason = 'still' | 'lowered' | 'lost' | 'timeout';
export type SegEvent = { kind: 'start'; t: number } | { kind: 'end'; t: number; frames: Frame[]; reason: SegReason };

export type SegConfig = {
  onSpeed: number;    // shoulder-widths per second needed to start
  offRatio: number;   // "still" when speed < onSpeed * offRatio
  onFrames: number;   // consecutive fast frames to start
  offFrames: number;  // consecutive still frames to end
  lostFrames: number; // frames without any hand to end
  maxMs: number;      // force an end
  minFrames: number;  // drop shorter segments
  preroll: number;    // frames kept from before the onset
  cooldownMs: number;
  alpha: number;      // EMA smoothing for speed
};
export const DEFAULT_SEG: SegConfig = {
  onSpeed: 0.8, offRatio: 0.5, onFrames: 3, offFrames: 8, lostFrames: 10,
  maxMs: 3000, minFrames: 8, preroll: 8, cooldownMs: 300, alpha: 0.3,
};

const TRACKED = [0, 4, 8, 12]; // wrist, thumb tip, index tip, middle tip
type HandPts = [number, number][];

/** Cuts the landmark stream into one-sign segments. Uses whichever hand moves, so it works for either handedness. */
export class Segmenter {
  state: 'IDLE' | 'ACTIVE' | 'COOLDOWN' = 'IDLE';
  speed = 0;
  anchors: Anchors | null = null;
  private cfg: SegConfig;
  private ring: Frame[] = [];
  private buf: Frame[] = [];
  private prev: { t: number; hands: HandPts[] } | null = null;
  private fast = 0; private slow = 0; private lost = 0;
  private startT = 0; private coolUntil = 0;

  constructor(cfg: SegConfig = DEFAULT_SEG) { this.cfg = cfg; } // explicit field: Vite's template forbids parameter properties

  push(f: Frame): SegEvent | null {
    this.anchors = anchors(f, this.anchors);
    const a = this.anchors;
    this.updateSpeed(f, a);
    const hands = f.hands.length > 0;
    const high = !!a && f.hands.some((h) => h[0].y < a.restY); // any hand above the rest line

    if (this.state === 'COOLDOWN') {
      if (f.t < this.coolUntil) return null;
      this.state = 'IDLE';
    }
    if (this.state === 'IDLE') {
      this.ring.push(f);
      if (this.ring.length > this.cfg.preroll) this.ring.shift();
      this.fast = hands && high && this.speed > this.cfg.onSpeed ? this.fast + 1 : 0;
      if (this.fast < this.cfg.onFrames) return null;
      this.state = 'ACTIVE';
      this.buf = [...this.ring];
      this.startT = f.t; this.slow = 0; this.lost = 0;
      return { kind: 'start', t: f.t };
    }

    // ACTIVE
    this.buf.push(f);
    this.lost = hands ? 0 : this.lost + 1;
    this.slow = this.speed < this.cfg.onSpeed * this.cfg.offRatio ? this.slow + 1 : 0;
    const reason: SegReason | null =
      this.lost >= this.cfg.lostFrames ? 'lost'
      : hands && a && !high ? 'lowered'
      : this.slow >= this.cfg.offFrames ? 'still'
      : f.t - this.startT > this.cfg.maxMs ? 'timeout'
      : null;
    if (!reason) return null;

    const frames = this.buf;
    this.buf = []; this.ring = []; this.fast = 0;
    this.state = 'COOLDOWN';
    this.coolUntil = f.t + this.cfg.cooldownMs;
    if (frames.filter((x) => x.hands.length > 0).length < this.cfg.minFrames) return null;
    return { kind: 'end', t: f.t, frames, reason };
  }

  /** Speed of the fastest hand, in shoulder widths per second. Hands are matched to the previous frame by nearest wrist. */
  private updateSpeed(f: Frame, a: Anchors | null) {
    if (!f.hands.length || !a) { this.prev = null; this.speed *= 1 - this.cfg.alpha; return; }
    const asp = f.w / f.h;
    const cur: HandPts[] = f.hands.map((h) => TRACKED.map((i) => [h[i].x * asp, h[i].y] as [number, number]));
    if (this.prev && this.prev.hands.length && f.t > this.prev.t) {
      const dt = (f.t - this.prev.t) / 1000;
      let fastest = 0;
      for (const c of cur) {
        let nearest = Infinity;
        for (const p of this.prev.hands) {
          const d = c.reduce((sum, q, i) => sum + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0) / c.length;
          nearest = Math.min(nearest, d);
        }
        fastest = Math.max(fastest, nearest);
      }
      this.speed = this.cfg.alpha * (fastest / a.s / dt) + (1 - this.cfg.alpha) * this.speed;
    }
    this.prev = { t: f.t, hands: cur };
  }
}
```
- [ ] `npm test` → all segmenter tests pass. Tune thresholds later on the Bench page (Task 2.B5), never by editing tests.
- [ ] Commit: `segmenter`.

##### Task 1.B4 Recorder page (≈ 50 min)
- [ ] Create `web/src/pages/Recorder.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { createTracker, type Tracker } from '../lib/landmarks';
import { Segmenter } from '../lib/segmenter';
import { LETTERS, RECORD_LABELS } from '../vocab';
import type { Clip, ClipKind, Frame, Session } from '../lib/types';

const LETTER_HOLD_MS = 2000;

function download(session: Session) {
  const body = JSON.stringify(session, (_k, v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  a.download = `${session.signer}-${Date.now()}.json`;
  a.click();
}

export default function Recorder() {
  const video = useRef<HTMLVideoElement>(null);
  const tracker = useRef<Tracker | null>(null);
  const seg = useRef(new Segmenter());
  const [signer, setSigner] = useState('');
  const [kind, setKind] = useState<ClipKind>('sign');
  const [label, setLabel] = useState(RECORD_LABELS[0]);
  const [armed, setArmed] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [msg, setMsg] = useState('');
  const letterBuf = useRef<Frame[] | null>(null);
  const state = useRef({ armed, kind, label });
  state.current = { armed, kind, label };

  useEffect(() => {
    let raf = 0; let stop = false;
    (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 } });
      video.current!.srcObject = stream; await video.current!.play();
      tracker.current = await createTracker({ withFace: false });
      const loop = () => {
        if (stop) return;
        const f = tracker.current!.detect(video.current!, performance.now()); // raw: handedness is normalized later, per clip
        const s = state.current;
        if (s.armed && s.kind === 'sign') {
          const ev = seg.current.push(f);
          if (ev?.kind === 'end') setClips((c) => [...c, { kind: 'sign', label: s.label, frames: ev.frames }]);
        }
        if (letterBuf.current && f.hands.length) letterBuf.current.push(f);
        raf = requestAnimationFrame(loop);
      };
      loop();
    })();
    return () => { stop = true; cancelAnimationFrame(raf); tracker.current?.close(); };
  }, []);

  function holdLetter() {
    letterBuf.current = [];
    setMsg('Hold the letter still…');
    setTimeout(() => {
      const frames = letterBuf.current ?? [];
      letterBuf.current = null;
      if (frames.length < 20) { setMsg(`Only ${frames.length} frames with a hand — try again closer to the camera`); return; }
      setClips((c) => [...c, { kind: 'letter', label, frames }]);
      setMsg(`Saved ${label} (${frames.length} frames)`);
    }, LETTER_HOLD_MS);
  }

  const count = (l: string) => clips.filter((c) => c.label === l).length;
  const labels = kind === 'sign' ? RECORD_LABELS : LETTERS;
  const session = (): Session => ({ version: 1, signer, recordedAt: new Date().toISOString(), clips });

  return (
    <main>
      <p><b>Consent:</b> we store hand/body landmark coordinates only (no video). Data is used to train this project's model and is not published.</p>
      <input placeholder="signer id (e.g. liv)" value={signer} onChange={(e) => setSigner(e.target.value.toLowerCase())} />
      <select value={kind} onChange={(e) => { setKind(e.target.value as ClipKind); setLabel(e.target.value === 'sign' ? RECORD_LABELS[0] : LETTERS[0]); }}>
        <option value="sign">Signs</option><option value="letter">Letters</option>
      </select>
      <select value={label} onChange={(e) => setLabel(e.target.value)}>
        {labels.map((l) => <option key={l} value={l}>{l} ({count(l)})</option>)}
      </select>
      {kind === 'sign'
        ? <button onClick={() => setArmed(!armed)} disabled={!signer}>{armed ? 'Stop' : 'Start'} recording {label}</button>
        : <button onClick={holdLetter} disabled={!signer}>Hold {label} for 2 s</button>}
      <button onClick={() => setClips((c) => c.slice(0, -1))}>Undo last</button>
      <button onClick={() => download(session())} disabled={!clips.length}>Download session ({clips.length} clips)</button>
      <p>{msg} · last label counts: {labels.map((l) => `${l}:${count(l)}`).join(' ')}</p>
      <video ref={video} muted playsInline className="mirror" width={480} />
    </main>
  );
}
```
- [ ] Add the route:
<!-- edit: web/src/App.tsx -->
**Edit 1 — find:**
```tsx
import Bench from './pages/Bench';
```
**Replace with:**
```tsx
import Bench from './pages/Bench';
import Recorder from './pages/Recorder';
```
<!-- edit: web/src/App.tsx -->
**Edit 2 — find:**
```tsx
  // later tasks add routes here
```
**Replace with:**
```tsx
  record: () => <Recorder />,
  // later tasks add routes here
```
- [ ] Try it: Start recording `ME`, sign it, drop your hands, repeat 3×. The count goes up once per repetition. Download → a JSON file.
- [ ] Commit: `recorder`.

##### Task 1.B5 Python twin of the features + parity test (≈ 40 min)
- [ ] Create `ml/requirements.txt`, then `pip install -r ml/requirements.txt` in the CUDA venv from Task 0.2:
```text
torch
numpy
onnx
onnxscript
onnxruntime
scikit-learn
matplotlib
pandas
pyarrow
pytest
kaggle
```
- [ ] Create `web/scripts/export-fixtures.ts`:
```ts
/* Writes ml/tests/fixtures/parity.json: synthetic clips + the features TypeScript computes for them.
   Usage (from web/): npm run fixtures   — then: pytest ml/tests/test_parity.py */
import { mkdirSync, writeFileSync } from 'node:fs';
import { clipFeatures, FEAT_PER_FRAME, T } from '../src/lib/features';
import type { Frame, Pt } from '../src/lib/types';

let seed = 42;
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const P = (x: number, y: number): Pt => ({ x: +x.toFixed(4), y: +y.toFixed(4), z: +((rand() - 0.5) * 0.1).toFixed(4) });
const pose = (dx: number): Pt[] => {
  const p = Array.from({ length: 17 }, () => P(0.5 + dx + (rand() - 0.5) * 0.05, 0.3 + (rand() - 0.5) * 0.05));
  p[11] = P(0.4 + dx, 0.6); p[12] = P(0.6 + dx, 0.6);
  return p;
};
const hand = (cx: number, cy: number): Pt[] => Array.from({ length: 21 }, (_, i) => P(cx + 0.012 * (i % 5) + rand() * 0.004, cy - 0.015 * Math.floor(i / 5) + rand() * 0.004));

function clip(n: number, opts: { two?: boolean; lefty?: boolean; dropPose?: number[]; dropHands?: number[]; w?: number; h?: number }): Frame[] {
  return Array.from({ length: n }, (_, i) => {
    const moving = hand(opts.lefty ? 0.62 + 0.01 * i : 0.35 + 0.01 * i, 0.32 + 0.012 * i);
    const still = hand(opts.lefty ? 0.33 : 0.66, 0.5);
    const hands = opts.dropHands?.includes(i) ? [] : opts.two ? [still, moving] : [moving];
    return { t: i * 33, w: opts.w ?? 640, h: opts.h ?? 480, pose: opts.dropPose?.includes(i) ? null : pose(0), hands, brow: null };
  });
}

const cases = [
  { name: 'one hand', frames: clip(24, {}) },
  { name: 'two hands', frames: clip(30, { two: true }) },
  { name: 'left-handed two hands', frames: clip(28, { two: true, lefty: true }) },
  { name: 'left-handed one hand', frames: clip(20, { lefty: true }) },
  { name: 'missing pose and hands', frames: clip(26, { dropPose: [0, 1, 7], dropHands: [0, 1, 12, 25] }) },
  { name: 'portrait aspect', frames: clip(40, { two: true, w: 0.75, h: 1 }) },
  { name: 'single frame', frames: clip(1, {}) },
].map((c) => ({ ...c, features: Array.from(clipFeatures(c.frames)) }));

mkdirSync('../ml/tests/fixtures', { recursive: true });
writeFileSync('../ml/tests/fixtures/parity.json', JSON.stringify({ T, F: FEAT_PER_FRAME, cases }));
console.log(`wrote ${cases.length} parity cases`);
```
- [ ] `cd web && npm run fixtures` → `wrote 7 parity cases`.
- [ ] Write the failing test `ml/tests/test_parity.py`:
```python
"""The browser (features.ts) and training (features.py) must compute identical features.
Regenerate the fixture after changing features.ts:  cd web && npm run fixtures"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from features import FEAT_PER_FRAME, T, clip_features  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures" / "parity.json"


def test_python_features_match_typescript():
    data = json.loads(FIXTURE.read_text())
    assert data["T"] == T and data["F"] == FEAT_PER_FRAME
    for i, case in enumerate(data["cases"]):
        frames = [{"w": f["w"], "h": f["h"],
                   "pose": [[p["x"], p["y"], p["z"]] for p in f["pose"]] if f["pose"] else None,
                   "hands": [[[p["x"], p["y"], p["z"]] for p in h] for h in f["hands"]]} for f in case["frames"]]
        got = clip_features(frames).reshape(-1)
        want = np.asarray(case["features"], dtype=np.float32)
        diff = float(np.abs(got - want).max())
        assert diff < 1e-4, f"case {i} ({case['name']}): max diff {diff}"
```
- [ ] `pytest ml/tests/test_parity.py` → fails (`No module named 'features'`).
- [ ] Create `ml/features.py`:
```python
"""Python port of web/src/lib/features.ts. KEEP IN SYNC — tests/test_parity.py checks both give the same numbers.

A frame is a dict: {"w": float, "h": float, "pose": [[x, y, z], ...] or None, "hands": [[[x, y, z] x 21], ...]}
(pose holds landmarks 0..16; hands are unlabeled, 0..2 of them).
"""
from __future__ import annotations

import math

import numpy as np

T = 32
FEAT_PER_FRAME = 2 * (42 + 42) + 4 + 2  # 174
NOSE, MOUTH_L, MOUTH_R, SH_L, SH_R = 0, 9, 10, 11, 12


def _xy(p, asp):
    return (p[0] * asp, p[1])


def anchors(f, prev):
    pose = f.get("pose")
    if not pose or len(pose) < 13:
        return prev
    asp = f["w"] / f["h"]
    l, r = _xy(pose[SH_L], asp), _xy(pose[SH_R], asp)
    s = math.hypot(l[0] - r[0], l[1] - r[1])
    if s < 1e-3:
        return prev
    m1, m2 = _xy(pose[MOUTH_L], asp), _xy(pose[MOUTH_R], asp)
    c = ((l[0] + r[0]) / 2, (l[1] + r[1]) / 2)
    return {"c": c, "s": s, "nose": _xy(pose[NOSE], asp), "mouth": ((m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2),
            "restY": c[1] + 0.8 * s}


def order_hands(hands):
    if len(hands) == 0:
        return None, None
    if len(hands) == 1:
        return hands[0], None
    a, b = hands[0], hands[1]
    return (a, b) if a[0][0] <= b[0][0] else (b, a)


def mirror_frame(f):
    m = lambda p: [1 - p[0], p[1], p[2]]  # noqa: E731
    pose = f.get("pose")
    return {**f, "pose": [m(p) for p in pose] if pose else None, "hands": [[m(p) for p in h] for h in f["hands"]]}


def body_center_x(f):
    pose = f.get("pose")
    return (pose[SH_L][0] + pose[SH_R][0]) / 2 if pose and len(pose) >= 13 else 0.5


def canonicalize(frames):
    left = right = 0.0
    pl = pr = None
    for f in frames:
        l = r = None
        if len(f["hands"]) >= 2:
            a, b = order_hands(f["hands"])
            l, r = a[0], b[0]
        elif len(f["hands"]) == 1:
            w = f["hands"][0][0]
            if w[0] <= body_center_x(f):
                l = w
            else:
                r = w
        if l is not None and pl is not None:
            left += math.hypot(l[0] - pl[0], l[1] - pl[1])
        if r is not None and pr is not None:
            right += math.hypot(r[0] - pr[0], r[1] - pr[1])
        pl, pr = l, r
    return [mirror_frame(f) for f in frames] if right > left else frames


def _push_hand(out, hand, a, asp):
    if hand is None:
        out.extend([0.0] * 84)
        return
    pts = [_xy(p, asp) for p in hand]
    for p in pts:
        out.extend(((p[0] - a["c"][0]) / a["s"], (p[1] - a["c"][1]) / a["s"]))
    w = pts[0]
    scale = math.hypot(pts[9][0] - w[0], pts[9][1] - w[1]) or 1e-3
    for p in pts:
        out.extend(((p[0] - w[0]) / scale, (p[1] - w[1]) / scale))


def frame_features(f, a):
    asp = f["w"] / f["h"]
    dom, non = order_hands(f["hands"])
    out: list[float] = []
    _push_hand(out, dom, a, asp)
    _push_hand(out, non, a, asp)
    if dom is not None:
        tip = _xy(dom[8], asp)
        out.extend(((tip[0] - a["nose"][0]) / a["s"], (tip[1] - a["nose"][1]) / a["s"],
                    (tip[0] - a["mouth"][0]) / a["s"], (tip[1] - a["mouth"][1]) / a["s"]))
    else:
        out.extend([0.0] * 4)
    out.extend((1.0 if dom is not None else 0.0, 1.0 if non is not None else 0.0))
    return out


def resample(seq: np.ndarray, n: int) -> np.ndarray:
    if len(seq) == 0:
        return np.zeros((0, seq.shape[1] if seq.ndim == 2 else 0))
    if len(seq) == 1:
        return np.repeat(seq, n, axis=0)
    pos = np.arange(n) * (len(seq) - 1) / (n - 1)
    lo = np.floor(pos).astype(int)
    hi = np.minimum(lo + 1, len(seq) - 1)
    w = (pos - lo)[:, None]
    return seq[lo] * (1 - w) + seq[hi] * w


def clip_features(raw_frames) -> np.ndarray:
    """Same steps as clipFeatures() in features.ts. Returns float32 array of shape (T, FEAT_PER_FRAME)."""
    frames = canonicalize(raw_frames)
    with_hands = [i for i, f in enumerate(frames) if f["hands"]]
    first, last = (with_hands[0], with_hands[-1]) if with_hands else (0, len(frames) - 1)
    a = None
    for f in frames:
        a = anchors(f, a)
        if a:
            break
    seq = []
    for f in frames[first:last + 1]:
        a = anchors(f, a)
        seq.append(frame_features(f, a) if a else [0.0] * FEAT_PER_FRAME)
    if not seq:
        return np.zeros((T, FEAT_PER_FRAME), np.float32)
    return resample(np.asarray(seq, dtype=np.float64), T).astype(np.float32)
```
- [ ] `pytest ml/tests/test_parity.py` → `1 passed`. This test is what keeps training and the browser computing the same numbers. Commit the fixture too: `python features + parity test`.

##### Task 1.B6 Convert the Kaggle data (≈ 30 min of code; conversion runs in the background)
- [ ] Create `ml/gislr_to_features.py`:
```python
"""Convert the Kaggle "Google - Isolated Sign Language Recognition" data (competition asl-signs) into our features.

Reads straight from the downloaded zip (no need to extract ~57 GB), or from a folder of .parquet files.
  python ml/gislr_to_features.py --zip data/asl-signs.zip --signs demo --out data/gislr-demo
  python ml/gislr_to_features.py --zip data/asl-signs.zip --signs all  --out data/gislr-all
  python ml/gislr_to_features.py --dir /kaggle/input/asl-signs --csv /kaggle/input/asl-signs/train.csv --signs all --out gislr-all
      (inside a Kaggle notebook, where the competition data is already mounted — no 40 GB download)
Estimate the video aspect ratio from our own recordings (prints a number for --aspect):
  python ml/gislr_to_features.py --zip data/asl-signs.zip --estimate-aspect-from data/raw

Each parquet file is one sign: rows (frame, row_id, type, landmark_index, x, y, z); type is face / left_hand /
pose / right_hand; missing landmarks are NaN. Data: CC BY 4.0 (check the competition's Data tab) — credit it.
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import zipfile
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import FEAT_PER_FRAME, T, clip_features  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
_zip: zipfile.ZipFile | None = None
_src: dict = {}


def _init(src: dict) -> None:
    global _zip, _src
    _src = src
    _zip = zipfile.ZipFile(src["zip"]) if src.get("zip") else None


def _read(path: str) -> pd.DataFrame:
    if _zip is not None:
        return pd.read_parquet(io.BytesIO(_zip.read(path)), columns=["frame", "type", "landmark_index", "x", "y", "z"])
    d = Path(_src["dir"])  # a Kaggle notebook mount (keeps train_landmark_files/<id>/) or a flat folder of files
    full = d / path if (d / path).exists() else d / Path(path).name
    return pd.read_parquet(full, columns=["frame", "type", "landmark_index", "x", "y", "z"])


def _block(df: pd.DataFrame, kind: str, n: int, nframes: int) -> np.ndarray | None:
    sub = df[df["type"] == kind].sort_values(["frame", "landmark_index"])
    if len(sub) != n * nframes:
        return None
    return sub[["x", "y", "z"]].to_numpy(np.float64).reshape(nframes, n, 3)


def to_frames(df: pd.DataFrame, aspect: float) -> list[dict]:
    """One parquet -> our frame dicts (pose 0..16, unlabeled hands, w/h = aspect)."""
    nframes = df["frame"].nunique()
    pose, left, right = (_block(df, "pose", 33, nframes), _block(df, "left_hand", 21, nframes),
                         _block(df, "right_hand", 21, nframes))
    if pose is None or left is None or right is None:
        raise ValueError("unexpected row layout")
    frames = []
    for i in range(nframes):
        hands = [h[i].tolist() for h in (left, right) if not np.isnan(h[i]).any()]
        p = pose[i, :17]
        frames.append({"w": aspect, "h": 1.0, "pose": None if np.isnan(p).any() else p.tolist(), "hands": hands})
    return frames


def _convert(job):
    path, label, signer, aspect = job
    try:
        return clip_features(to_frames(_read(path), aspect)), label, signer
    except Exception as e:  # a corrupt or odd file must not kill a 40-minute run
        return None, f"{path}: {e}", signer


def _demo_signs() -> list[str]:
    return json.loads((ROOT / "web" / "src" / "vocab.json").read_text())["gislr"]


def _load_csv(args) -> pd.DataFrame:
    if args.csv:
        return pd.read_csv(args.csv)
    with zipfile.ZipFile(args.zip) as z:
        return pd.read_csv(io.BytesIO(z.read("train.csv")))


def estimate_aspect(args, csv: pd.DataFrame) -> None:
    """GISLR does not store the video size. Compare shoulder width / shoulder-to-nose height with our own videos."""
    def ratio(f, asp):
        p = f.get("pose")
        if not p:
            return None
        dx = abs(p[11][0] - p[12][0]) * asp
        dy = (p[11][1] + p[12][1]) / 2 - p[0][1]
        return dx / dy if dy > 1e-3 else None

    own = []
    for fn in Path(args.estimate_aspect_from).glob("*.json"):
        for clip in json.loads(fn.read_text())["clips"]:
            for f in clip["frames"][::5]:
                fr = {"pose": [[q["x"], q["y"], q["z"]] for q in f["pose"]] if f["pose"] else None}
                r = ratio(fr, f["w"] / f["h"])
                if r:
                    own.append(r)
    _init({"zip": args.zip, "dir": args.dir})
    gis = []
    for path in csv.sample(min(300, len(csv)), random_state=0)["path"]:
        for f in to_frames(_read(path), 1.0)[::5]:
            r = ratio(f, 1.0)
            if r:
                gis.append(r)
    if not own or not gis:
        sys.exit("need recordings in --estimate-aspect-from and readable GISLR files")
    est = float(np.median(own) / np.median(gis))
    print(f"own videos: median ratio {np.median(own):.3f} ({len(own)} frames); GISLR at aspect 1: {np.median(gis):.3f}")
    print(f"estimated GISLR aspect (w/h): {est:.3f}   -> pass --aspect {est:.2f}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip")
    ap.add_argument("--dir")
    ap.add_argument("--csv")
    ap.add_argument("--signs", default="demo", help="demo | all | comma list of GISLR sign names")
    ap.add_argument("--out", default="data/gislr-demo")
    ap.add_argument("--aspect", type=float, default=0.75, help="video width/height; PopSign videos are portrait")
    ap.add_argument("--max-per-sign", type=int, default=0, help="0 = all")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--estimate-aspect-from")
    args = ap.parse_args()
    if not args.zip and not (args.dir and args.csv):
        sys.exit("give --zip, or --dir with --csv")

    csv = _load_csv(args)
    if args.estimate_aspect_from:
        estimate_aspect(args, csv)
        return
    signs = _demo_signs() if args.signs == "demo" else sorted(csv["sign"].unique()) if args.signs == "all" \
        else [s.strip() for s in args.signs.split(",")]
    missing = sorted(set(signs) - set(csv["sign"]))
    if missing:
        sys.exit(f"not in the dataset: {missing}")
    rows = csv[csv["sign"].isin(signs)]
    if args.max_per_sign:
        rows = rows.groupby("sign", group_keys=False).apply(lambda g: g.sample(min(len(g), args.max_per_sign), random_state=0))
    labels = sorted({s.upper() for s in signs})
    jobs = [(r.path, r.sign.upper(), str(r.participant_id), args.aspect) for r in rows.itertuples()]
    print(f"{len(jobs)} clips, {len(labels)} signs, {rows.participant_id.nunique()} signers")

    X, y, signers, errors = [], [], [], []
    with Pool(args.workers, initializer=_init, initargs=({"zip": args.zip, "dir": args.dir},)) as pool:
        for i, (feat, label, signer) in enumerate(pool.imap(_convert, jobs, chunksize=64)):
            if feat is None:
                errors.append(label)
            else:
                X.append(feat)
                y.append(labels.index(label))
                signers.append(signer)
            if (i + 1) % 2000 == 0:
                print(f"  {i + 1}/{len(jobs)}")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    np.asarray(X, dtype="<f4").tofile(out / "X.f32")
    (out / "meta.json").write_text(json.dumps({
        "n": len(X), "T": T, "F": FEAT_PER_FRAME, "labels": labels, "y": y, "signers": signers,
        "source": "gislr", "aspect": args.aspect}))
    print(f"wrote {len(X)} clips to {out}  ({len(errors)} skipped)")
    for e in errors[:5]:
        print("  skipped", e)


if __name__ == "__main__":
    main()
```
- [ ] As soon as the zip has finished downloading, convert the **demo signs** first (minutes), then **all 250 signs** for pretraining (≈ 15–30 min on 8 cores):
```bash
python ml/gislr_to_features.py --zip data/asl-signs.zip --signs demo --out data/gislr-demo --workers 8
python ml/gislr_to_features.py --zip data/asl-signs.zip --signs all  --out data/gislr-all  --workers 8
```
Expected: `… clips, 16 signs, 21 signers` then `wrote … clips to data/gislr-demo (N skipped)`, where N is a small fraction.
- [ ] After the first recordings exist (Task 1.D1), check the video aspect ratio, which the Kaggle data doesn't store:
```bash
python ml/gislr_to_features.py --zip data/asl-signs.zip --estimate-aspect-from data/raw
```
If the estimate differs from 0.75 by more than ~0.1, rerun both conversions with `--aspect <estimate>`. Training also randomly stretches x by ±10%, so small mismatches don't matter.
- [ ] Commit (code only; `data/` is ignored): `kaggle converter`.

#### Recording session (everyone, from ≈ 15:00)

##### Task 1.D1 Record our signs, idle and letters (≈ 25 min per person, on the signer laptop if possible)
- [ ] On `#/record`, each person records:
  - **ME, YOU, NAME, WHAT:** 12 reps each. Do 6 close (elbows in frame) and 6 farther (waist in frame), with half facing the window and half side-lit. Drop your hands to your lap between reps.
  - **`_idle`:** 20 reps of scratching your face, adjusting glasses, waving someone off, typing in the air, reaching for a cup, half-started signs.
  - **Letters K, E, V** (switch to Letters): 4 holds each, tilting the wrist a little between holds.
  - Optional but helpful: 5 reps of each Kaggle sign (adapts the model to your webcams).
- [ ] Download every ~50 clips (a refresh loses unsaved clips). Put all session files into the MSI's `data/raw/`. They are git-ignored and never pushed.
- [ ] Kev records on the **actual demo laptop**, in demo lighting if possible.

**▶ CP1 — Sat 17:00:** call with typed captions · Recorder works · parity green · `data/gislr-demo` exists · `/api/gloss` + `/api/tts` work · Vultr `/api/health` over HTTPS · ≥ 3 people recorded.

---

### Phase 2 — Recognize and speak (Sat 17:00–23:00)

Track A builds the whole call screen against a **gloss simulator**: open `?dev`, switch ASL on, and type `HELLO ME NAME fs-KEV`. That way voice, captions, Gemini and auto-speak are finished before recognition is. Track B makes recognition real on the MSI. Phase 3 plugs them together.

#### Track B — Recognition (Kev)

##### Task 2.B1 Classifier plumbing: decide(), ONNX loader, kNN (≈ 40 min, TDD)
- [ ] Write the failing test `web/src/lib/classifier.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { decide, softmax } from './classifier';
import { Knn } from './knn';

const labels = ['HELLO', 'NAME', '_idle'];

describe('decide', () => {
  it('never accepts _idle', () => {
    expect(decide([0.05, 0.05, 0.9], labels, 0.6, 0.2, 0, 'onnx').accepted).toBe(false);
  });
  it('rejects a confident-but-close call (margin rule)', () => {
    expect(decide([0.55, 0.45, 0], labels, 0.5, 0.2, 0, 'onnx').accepted).toBe(false);
  });
  it('accepts a clear winner and lists non-idle alternatives', () => {
    const p = decide([0.8, 0.05, 0.15], labels, 0.6, 0.2, 0, 'onnx');
    expect(p.accepted).toBe(true);
    expect(p.alts.map((a) => a.label)).toEqual(['NAME']);
  });
});

describe('softmax', () => {
  it('sums to 1 and flattens with temperature > 1', () => {
    const a = softmax([2, 1, 0], 1), b = softmax([2, 1, 0], 3);
    expect(a.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 6);
    expect(b[0]).toBeLessThan(a[0]);
  });
});

describe('Knn', () => {
  it('votes by cosine similarity', async () => {
    const k = new Knn(['A', 'B', '_idle'], 3, 0.6, 0.2);
    const v = (x: number, y: number) => new Float32Array([x, y]);
    k.add('A', v(1, 0.1)); k.add('A', v(1, 0)); k.add('A', v(0.9, 0.1));
    k.add('B', v(0, 1)); k.add('B', v(0.1, 1));
    const p = await k.predict(v(1, 0.05));
    expect(p.label).toBe('A');
    expect(p.accepted).toBe(true);
  });
});
```
- [ ] `npm test` → fails. Create `web/src/lib/classifier.ts` (pure logic, no ONNX import, so tests run in Node):
```ts
import { IDLE } from '../vocab';

export type Alt = { label: string; p: number };
export type Pred = { label: string; p: number; alts: Alt[]; accepted: boolean; ms: number; source: 'onnx' | 'knn' };
export interface SignClassifier { version: string; predict(x: Float32Array): Promise<Pred> }
export type SignMeta = { labels: string[]; T: number; F: number; temperature: number; tau: number; margin: number; version: string };

export function softmax(logits: ArrayLike<number>, temperature = 1): Float32Array {
  const z = Array.from(logits, (v) => v / temperature);
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return Float32Array.from(e, (v) => v / s);
}

/** Accept only a non-idle top class with p >= tau that beats the runner-up by >= margin. */
export function decide(probs: ArrayLike<number>, labels: string[], tau: number, margin: number, t0: number, source: Pred['source']): Pred {
  const order = Array.from({ length: labels.length }, (_, i) => i).sort((a, b) => probs[b] - probs[a]);
  const p1 = probs[order[0]];
  const p2 = order.length > 1 ? probs[order[1]] : 0;
  const label = labels[order[0]];
  const alts = order.slice(1).filter((i) => labels[i] !== IDLE).slice(0, 2).map((i) => ({ label: labels[i], p: probs[i] }));
  return { label, p: p1, alts, accepted: label !== IDLE && p1 >= tau && p1 - p2 >= margin, ms: performance.now() - t0, source };
}
```
- [ ] Create `web/src/lib/onnx.ts`:
```ts
import * as ort from 'onnxruntime-web';
import { decide, softmax, type SignClassifier, type SignMeta } from './classifier';
import { FEAT_PER_FRAME, T } from './features';

/** Loads the trained CNN. Throws if files are missing or were built with different features (caller falls back to kNN). */
export async function loadOnnx(): Promise<SignClassifier> {
  ort.env.wasm.wasmPaths = '/ort/';
  ort.env.wasm.numThreads = 1; // multithreading needs cross-origin isolation headers; not worth it for a tiny model
  const meta = (await (await fetch('/models/sign_meta.json')).json()) as SignMeta;
  if (meta.T !== T || meta.F !== FEAT_PER_FRAME) throw new Error(`sign model expects T=${meta.T} F=${meta.F}`);
  const session = await ort.InferenceSession.create('/models/sign.onnx', { executionProviders: ['wasm'] });
  return {
    version: meta.version,
    async predict(x) {
      const t0 = performance.now();
      const out = await session.run({ x: new ort.Tensor('float32', x, [1, T, FEAT_PER_FRAME]) });
      return decide(softmax(out.logits.data as Float32Array, meta.temperature), meta.labels, meta.tau, meta.margin, t0, 'onnx');
    },
  };
}
```
- [ ] Create `web/src/lib/knn.ts`:
```ts
import { decide, type Pred, type SignClassifier } from './classifier';
import { FEAT_PER_FRAME, T } from './features';

const norm = (x: Float32Array) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s); };
const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Baseline before the CNN exists, and the classifier for per-user calibration (Task 4.5). */
export class Knn implements SignClassifier {
  version = 'knn-v1';
  private rows: { label: string; x: Float32Array; n: number }[] = [];
  private labels: string[];
  private k: number;
  private tau: number;
  private margin: number;
  constructor(labels: string[], k = 5, tau = 0.6, margin = 0.2) {
    this.labels = labels; this.k = k; this.tau = tau; this.margin = margin;
  }

  add(label: string, x: Float32Array) {
    if (!this.labels.includes(label)) this.labels.push(label);
    this.rows.push({ label, x, n: norm(x) });
  }

  async predict(x: Float32Array): Promise<Pred> {
    const t0 = performance.now();
    const nx = norm(x) || 1e-9;
    const top = this.rows
      .map((r) => ({ label: r.label, s: dot(r.x, x) / ((r.n || 1e-9) * nx) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, this.k);
    const probs = new Float32Array(this.labels.length);
    for (const t of top) probs[this.labels.indexOf(t.label)] += 1 / top.length;
    return decide(probs, this.labels, this.tau, this.margin, t0, 'knn');
  }

  static async load(): Promise<Knn> {
    const meta = (await (await fetch('/models/knn.json')).json()) as { labels: string[]; T: number; F: number };
    if (meta.T !== T || meta.F !== FEAT_PER_FRAME) throw new Error('kNN templates were built with different features');
    const all = new Float32Array(await (await fetch('/models/knn.f32')).arrayBuffer());
    const knn = new Knn([...new Set(meta.labels)].sort());
    const n = T * FEAT_PER_FRAME;
    meta.labels.forEach((label, i) => knn.add(label, all.subarray(i * n, (i + 1) * n)));
    return knn;
  }
}
```
- [ ] `npm test` → green. Commit: `classifier + knn`.

##### Task 2.B2 Letters: spelling hand, features, kNN, debounced decoder (≈ 50 min, TDD)
- [ ] Write the failing test `web/src/lib/letters.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { LETTER_F, LetterDecoder, letterFeatures, letterHand } from './letters';
import type { Frame } from './types';
import type { Pt } from './types';

const hand = (): Pt[] => Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + 0.01 * (i % 4) + 0.002 * i, y: 0.5 - 0.012 * Math.floor(i / 4), z: 0 }));
const rotate = (h: Pt[], deg: number, k = 1): Pt[] => {
  const a = (deg * Math.PI) / 180, w = h[0];
  return h.map((p) => {
    const x = (p.x - w.x) * k, y = (p.y - w.y) * k;
    return { x: w.x + x * Math.cos(a) - y * Math.sin(a), y: w.y + x * Math.sin(a) + y * Math.cos(a), z: 0 };
  });
};

describe('letterFeatures', () => {
  it('has LETTER_F values and ignores in-plane rotation and size for the shape block', () => {
    const a = letterFeatures(hand(), 1), b = letterFeatures(rotate(hand(), 30, 1.4), 1);
    expect(a).toHaveLength(LETTER_F);
    for (let i = 0; i < 42; i++) expect(b[i]).toBeCloseTo(a[i], 4);
  });
});

describe('letterHand', () => {
  const frame = (hands: Pt[][]): Frame => ({ t: 0, w: 640, h: 480, pose: null, hands, brow: null });
  it('mirrors a hand on the image-right side so letters look right-handed', () => {
    const h = hand().map((p) => ({ ...p, x: p.x + 0.2 }));
    expect(letterHand(frame([h]))![0].x).toBeCloseTo(1 - h[0].x, 6);
    const l = hand().map((p) => ({ ...p, x: p.x - 0.2 }));
    expect(letterHand(frame([l]))).toBe(l);
  });
  it('picks the higher hand when two are visible', () => {
    const low = hand().map((p) => ({ ...p, x: p.x - 0.2, y: p.y + 0.3 }));
    const high = hand().map((p) => ({ ...p, x: p.x - 0.2 }));
    expect(letterHand(frame([low, high]))).toBe(high);
    expect(letterHand(frame([]))).toBeNull();
  });
});

describe('LetterDecoder', () => {
  const run = (d: LetterDecoder, n: number, probs: Record<string, number>, speed: number) =>
    Array.from({ length: n }, () => d.push(probs, speed)).filter(Boolean);

  it('emits a held letter once', () => {
    expect(run(new LetterDecoder(), 30, { L: 1 }, 0.1)).toEqual(['L']);
  });
  it('emits a double letter after a small bounce', () => {
    const d = new LetterDecoder();
    expect([...run(d, 15, { L: 1 }, 0.1), ...run(d, 3, { L: 1 }, 2), ...run(d, 15, { L: 1 }, 0.1)]).toEqual(['L', 'L']);
  });
  it('spells two different letters in a row', () => {
    const d = new LetterDecoder();
    expect([...run(d, 15, { L: 1 }, 0.1), ...run(d, 20, { I: 1 }, 0.1)]).toEqual(['L', 'I']);
  });
  it('ignores a moving hand and no-hand frames', () => {
    const d = new LetterDecoder();
    expect([...run(d, 20, { L: 1 }, 2), ...run(d, 20, { _none: 1 }, 0.1)]).toEqual([]);
  });
});
```
- [ ] `npm test` → fails. Create `web/src/lib/letters.ts`:
```ts
import { bodyCenterX } from './features';
import type { Frame, Pt } from './types';

export const LETTER_F = 48;
export const NONE = '_none';

/** The spelling hand: the higher hand if two are visible, mirrored when it is on the image-right side of the body
 *  (a left hand), so letters always look right-handed. Used by the recorder data, training and live spell mode. */
export function letterHand(f: Frame): Pt[] | null {
  if (!f.hands.length) return null;
  const hand = f.hands.reduce((best, h) => (h[0].y < best[0].y ? h : best));
  return hand[0].x > bodyCenterX(f) ? hand.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })) : hand;
}

/** Handshape of one hand, invariant to position, size and in-plane rotation. */
export function letterFeatures(hand: Pt[], aspect: number): Float32Array {
  const pts = hand.map((p) => [p.x * aspect, p.y] as [number, number]);
  const w = pts[0];
  const vx = pts[9][0] - w[0], vy = pts[9][1] - w[1];
  const scale = Math.hypot(vx, vy) || 1e-3;
  const theta = Math.atan2(vx, -vy); // 0 when wrist -> middle knuckle points straight up
  const c = Math.cos(-theta), s = Math.sin(-theta);
  const out = new Float32Array(LETTER_F);
  let k = 0;
  for (const p of pts) {
    const x = (p[0] - w[0]) / scale, y = (p[1] - w[1]) / scale;
    out[k++] = x * c - y * s;
    out[k++] = x * s + y * c;
  }
  out[k++] = Math.sin(theta); // orientation separates H/U, G/Q, K/P
  out[k++] = Math.cos(theta);
  const ax = pts[5][0] - w[0], ay = pts[5][1] - w[1], bx = pts[17][0] - w[0], by = pts[17][1] - w[1];
  out[k++] = Math.sign(ax * by - ay * bx); // palm vs back toward the camera
  const d = (i: number, j: number) => Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) / scale;
  out[k++] = d(4, 8); out[k++] = d(4, 12); out[k++] = d(8, 12); // thumb-index, thumb-middle, index-middle
  return out;
}

export class LetterKnn {
  private rows: { label: string; x: Float32Array }[] = [];
  private maxDist: number;
  private k: number;
  constructor(maxDist: number, k = 5) { this.maxDist = maxDist; this.k = k; }
  add(label: string, x: Float32Array) { this.rows.push({ label, x }); }

  /** Vote shares of the k nearest templates; {_none: 1} when nothing is close enough. */
  probs(x: Float32Array): Record<string, number> {
    const near = this.rows
      .map((r) => { let s = 0; for (let i = 0; i < x.length; i++) s += (r.x[i] - x[i]) ** 2; return { label: r.label, d: Math.sqrt(s) }; })
      .sort((a, b) => a.d - b.d)
      .slice(0, this.k);
    if (!near.length || near[0].d > this.maxDist) return { [NONE]: 1 };
    const out: Record<string, number> = {};
    for (const n of near) out[n.label] = (out[n.label] ?? 0) + 1 / near.length;
    return out;
  }

  static async load(): Promise<LetterKnn> {
    const meta = (await (await fetch('/models/letters.json')).json()) as { labels: string[]; F: number; maxDist: number };
    if (meta.F !== LETTER_F) throw new Error('letter templates were built with different features');
    const all = new Float32Array(await (await fetch('/models/letters.f32')).arrayBuffer());
    const knn = new LetterKnn(meta.maxDist);
    meta.labels.forEach((label, i) => knn.add(label, all.subarray(i * LETTER_F, (i + 1) * LETTER_F)));
    return knn;
  }
}

export type DecoderCfg = { alpha: number; accept: number; frames: number; stillMax: number; releaseSpeed: number };
export const DEFAULT_DECODER: DecoderCfg = { alpha: 0.4, accept: 0.8, frames: 8, stillMax: 0.6, releaseSpeed: 1.2 };

/** Smooths per-frame letter votes; emits a letter after ~8 steady frames; repeats only after a release (bounce or change). */
export class LetterDecoder {
  private ema: Record<string, number> = {};
  private streak = 0;
  private cand: string | null = null;
  private last: string | null = null;
  private released = true;
  private cfg: DecoderCfg;
  constructor(cfg: DecoderCfg = DEFAULT_DECODER) { this.cfg = cfg; }

  push(probs: Record<string, number>, speed: number): string | null {
    for (const k of new Set([...Object.keys(this.ema), ...Object.keys(probs)])) {
      this.ema[k] = this.cfg.alpha * (probs[k] ?? 0) + (1 - this.cfg.alpha) * (this.ema[k] ?? 0);
    }
    let top = NONE, best = 0;
    for (const [k, v] of Object.entries(this.ema)) if (v > best) { best = v; top = k; }
    if (speed > this.cfg.releaseSpeed || top !== this.last || (this.ema[this.last] ?? 0) < 0.5) this.released = true;
    const ok = top !== NONE && best >= this.cfg.accept && speed < this.cfg.stillMax;
    this.streak = ok && top === this.cand ? this.streak + 1 : ok ? 1 : 0;
    this.cand = ok ? top : null;
    if (this.streak >= this.cfg.frames && this.released) {
      this.last = top; this.released = false; this.streak = 0;
      return top;
    }
    return null;
  }

  reset() { this.ema = {}; this.streak = 0; this.cand = null; this.last = null; this.released = true; }
}
```
- [ ] `npm test` → green. Commit: `fingerspelling letters`.

##### Task 2.B3 Build our dataset (≈ 30 min)
- [ ] Create `web/scripts/build-dataset.ts`:
```ts
/* Usage (from web/): npm run dataset -- ../data/raw ../data/processed
   Reads OUR recorder sessions; writes training tensors (same layout as ml/gislr_to_features.py)
   plus starter kNN and letter templates for the browser. */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clipFeatures, FEAT_PER_FRAME, T } from '../src/lib/features';
import { LETTER_F, letterFeatures, letterHand } from '../src/lib/letters';
import { IDLE } from '../src/vocab';
import type { Session } from '../src/lib/types';

const [rawDir = '../data/raw', outDir = '../data/processed'] = process.argv.slice(2);
const pubDir = 'public/models';
mkdirSync(outDir, { recursive: true });
mkdirSync(pubDir, { recursive: true });
const f32 = (a: Float32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

const sessions: Session[] = readdirSync(rawDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(rawDir, f), 'utf8')) as Session);
const signClips = sessions.flatMap((s) => s.clips.filter((c) => c.kind === 'sign').map((c) => ({ ...c, signer: s.signer })));
const letterClips = sessions.flatMap((s) => s.clips.filter((c) => c.kind === 'letter').map((c) => ({ ...c, signer: s.signer })));

// ---- signs: one T x F matrix per clip (features computed by the same code the browser runs)
const labels = [...new Set(signClips.map((c) => c.label))].sort();
if (!labels.includes(IDLE)) throw new Error('No _idle clips — record _idle before training');
const N = T * FEAT_PER_FRAME;
const X = new Float32Array(signClips.length * N);
signClips.forEach((c, i) => X.set(clipFeatures(c.frames), i * N));
writeFileSync(join(outDir, 'X.f32'), f32(X));
writeFileSync(join(outDir, 'meta.json'), JSON.stringify({
  n: signClips.length, T, F: FEAT_PER_FRAME, labels,
  y: signClips.map((c) => labels.indexOf(c.label)), signers: signClips.map((c) => c.signer),
}));

// ---- kNN templates for the browser: up to 12 per label, spread over the recording order
const byLabel = new Map<string, number[]>();
signClips.forEach((c, i) => byLabel.set(c.label, [...(byLabel.get(c.label) ?? []), i]));
const pick = [...byLabel.values()].flatMap((idx) => {
  const step = Math.max(1, Math.floor(idx.length / 12));
  return idx.filter((_, j) => j % step === 0).slice(0, 12);
});
const K = new Float32Array(pick.length * N);
pick.forEach((i, j) => K.set(X.subarray(i * N, (i + 1) * N), j * N));
writeFileSync(join(pubDir, 'knn.f32'), f32(K));
writeFileSync(join(pubDir, 'knn.json'), JSON.stringify({ labels: pick.map((i) => signClips[i].label), T, F: FEAT_PER_FRAME }));

// ---- letters: every 3rd frame of each 2 s hold
const L: { label: string; x: Float32Array }[] = [];
for (const c of letterClips) c.frames.forEach((f, j) => {
  const hand = letterHand(f);
  if (hand && j % 3 === 0) L.push({ label: c.label, x: letterFeatures(hand, f.w / f.h) });
});
const dist = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return Math.sqrt(s); };
const nearestSame = L.map((r, i) => Math.min(...L.filter((o, j) => j !== i && o.label === r.label).map((o) => dist(o.x, r.x)))).filter(Number.isFinite).sort((a, b) => a - b);
// floor of 0.5: very steady holds give near-zero distances, which would reject every live letter
const maxDist = Math.max(0.5, nearestSame.length ? nearestSame[Math.floor(0.95 * (nearestSame.length - 1))] * 1.5 : 1.0);
const LX = new Float32Array(L.length * LETTER_F);
L.forEach((r, i) => LX.set(r.x, i * LETTER_F));
writeFileSync(join(pubDir, 'letters.f32'), f32(LX));
writeFileSync(join(pubDir, 'letters.json'), JSON.stringify({ labels: L.map((r) => r.label), F: LETTER_F, maxDist }));

const count = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {}));
console.log(`signs: ${signClips.length} clips, ${labels.length} labels`, count(signClips.map((c) => c.label)));
console.log('signers:', count(signClips.map((c) => c.signer)));
console.log(`letters: ${L.length} templates, maxDist ${maxDist.toFixed(3)}`, count(L.map((r) => r.label)));
```
- [ ] `npm run dataset -- ../data/raw ../data/processed`. Expected: ME/YOU/NAME/WHAT/_idle each at ≥ 30 clips across ≥ 3 signers; letters K/E/V with a few hundred templates; files in `data/processed/` and `web/public/models/`.
- [ ] Commit the script and the small `letters.*` files (raw data stays out): `dataset builder`.

##### Task 2.B4 Pretrain on Kaggle, fine-tune on the demo vocabulary (≈ 40 min of code; training on the 3060)
- [ ] Create `ml/train.py`:
```python
"""Sign classifier training (runs on CUDA if available — the RTX 3060 — else Apple MPS, else CPU).

1) Pretrain a backbone on the Kaggle data (all 250 signs gives the best backbone; the demo subset also works):
     python ml/train.py pretrain --gislr data/gislr-all --epochs 40
2) Finetune on the demo vocabulary: Kaggle clips of the demo signs + our own recordings (own signs and _idle):
     python ml/train.py finetune --gislr data/gislr-demo --own data/processed --epochs 60
   Writes web/public/models/{sign.onnx, sign_meta.json, knn.f32, knn.json} and ml/out/oof.npz (for eval_report.py).
"""
from __future__ import annotations

import argparse
import copy
import json
import math
import time
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
import torch.nn as nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "ml" / "out"
PAIRS = 86  # each frame = 86 (x, y) pairs + 2 presence flags = 174
IDLE = "_idle"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")


class SignCNN(nn.Module):
    def __init__(self, f: int, n_classes: int, d: int = 128, p: float = 0.3):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv1d(f, d, 5, padding=2), nn.BatchNorm1d(d), nn.ReLU(), nn.Dropout(p),
            nn.Conv1d(d, d, 5, padding=2), nn.BatchNorm1d(d), nn.ReLU(), nn.Dropout(p),
            nn.Conv1d(d, d, 3, padding=1), nn.BatchNorm1d(d), nn.ReLU())
        self.head = nn.Sequential(nn.Dropout(p), nn.Linear(d, n_classes))

    def forward(self, x):                 # x: (B, T, F)
        h = self.net(x.transpose(1, 2))   # (B, d, T)
        return self.head(h.mean(dim=2))


def augment(x: torch.Tensor) -> torch.Tensor:
    """Batched: rotation ±15°, x-stretch ±10% (aspect mismatch), temporal crop ≤15% per end, hand dropout, jitter."""
    B, T, _ = x.shape
    dev = x.device
    ang = (torch.rand(B, 1, 1, device=dev) * 2 - 1) * math.radians(15)
    sx = 0.9 + 0.2 * torch.rand(B, 1, 1, device=dev)
    xy = x[..., :PAIRS * 2].reshape(B, T, PAIRS, 2)
    px, py = xy[..., 0] * sx, xy[..., 1]
    c, s = torch.cos(ang), torch.sin(ang)
    rot = torch.stack([px * c - py * s, px * s + py * c], dim=-1).reshape(B, T, PAIRS * 2)
    x = torch.cat([rot, x[..., PAIRS * 2:]], dim=-1)
    cut = max(1, int(0.15 * T))
    a = torch.randint(0, cut + 1, (B, 1), device=dev).float()
    b = (T - 1 - torch.randint(0, cut + 1, (B, 1), device=dev)).float()
    pos = a + (b - a) * torch.linspace(0, 1, T, device=dev)[None]
    lo = pos.floor().long().clamp(0, T - 1)
    hi = (lo + 1).clamp(max=T - 1)
    w = (pos - lo.float()).unsqueeze(-1)
    idx = lambda i: i.unsqueeze(-1).expand(B, T, x.shape[2])  # noqa: E731
    x = torch.gather(x, 1, idx(lo)) * (1 - w) + torch.gather(x, 1, idx(hi)) * w
    drop = (torch.rand(B, T, 1, device=dev) < 0.1).float()
    x = x.clone()
    x[..., 84:168] *= 1 - drop            # non-dominant hand flickers out
    x[..., 173:174] *= 1 - drop           # ...and its presence flag
    noise = torch.randn_like(x) * 0.02
    noise[..., -2:] = 0
    return x + noise * (x != 0)


def load(d: str | Path, tag: str):
    d = Path(d)
    meta = json.loads((d / "meta.json").read_text())
    X = np.fromfile(d / "X.f32", dtype="<f4").reshape(meta["n"], meta["T"], meta["F"])
    labels = [str(meta["labels"][i]) for i in meta["y"]]
    signers = [f"{tag}:{s}" for s in meta["signers"]]
    return X, np.array(labels, dtype=object), np.array(signers, dtype=object)


def run_epochs(model, X, y, epochs, lr, Xva=None, yva=None, repeat=None, batch=128):
    """Trains in place. Returns (best_val_acc, best_val_logits, best_epoch, best_state)."""
    model.to(DEVICE)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-2)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, epochs))
    Xt, yt = torch.from_numpy(X), torch.from_numpy(y)
    base = np.arange(len(X)) if repeat is None else np.repeat(np.arange(len(X)), repeat)
    best = (-1.0, None, epochs, None)
    for ep in range(epochs):
        model.train()
        order = torch.from_numpy(np.random.permutation(base))
        for i in range(0, len(order), batch):
            idx = order[i:i + batch]
            xb, yb = Xt[idx].to(DEVICE), yt[idx].to(DEVICE)
            loss = F.cross_entropy(model(augment(xb)), yb, label_smoothing=0.1)
            opt.zero_grad()
            loss.backward()
            opt.step()
        sched.step()
        if Xva is not None and len(Xva):
            logits = predict(model, Xva)
            acc = float((logits.argmax(1) == yva).mean())
            if acc > best[0]:
                best = (acc, logits, ep + 1, copy.deepcopy(model.state_dict()))
    return best


@torch.no_grad()
def predict(model, X, batch=1024):
    model.eval()
    out = [model(torch.from_numpy(X[i:i + batch]).to(DEVICE)).float().cpu().numpy() for i in range(0, len(X), batch)]
    return np.concatenate(out) if out else np.zeros((0, model.head[-1].out_features), np.float32)


def holdout_signers(signers: np.ndarray, every: int = 5) -> set[str]:
    uniq = sorted(set(signers))
    return set(uniq[::every]) if len(uniq) > 1 else set()


def fit_temperature(logits: np.ndarray, y: np.ndarray) -> float:
    lt, yt = torch.from_numpy(logits), torch.from_numpy(y)
    t = torch.ones(1, requires_grad=True)
    opt = torch.optim.LBFGS([t], lr=0.1, max_iter=100)

    def closure():
        opt.zero_grad()
        loss = F.cross_entropy(lt / t.clamp(0.5, 5.0), yt)
        loss.backward()
        return loss

    opt.step(closure)
    # bounded: with perfectly separable held-out data the optimum runs to 0 and confidences become meaningless
    return float(t.clamp(0.5, 5.0).item())


def choose_tau(probs, y, idle, margin=0.2, target=0.9):
    """Smallest threshold whose accepted (non-idle) predictions are >= 90% correct on held-out signers."""
    top = probs.argmax(1)
    srt = np.sort(probs, 1)
    p1, p2 = srt[:, -1], srt[:, -2]
    signs = y != idle
    for tau in np.arange(0.5, 0.96, 0.05):
        m = (p1 >= tau) & (p1 - p2 >= margin) & (top != idle) & signs
        if m.sum() and (top[m] == y[m]).mean() >= target:
            return round(float(tau), 2), float(m.sum() / signs.sum())
    return 0.7, float("nan")


def pretrain(args):
    X, lab, sig = load(args.gislr, "g")
    labels = sorted({str(v) for v in lab})  # plain str: torch.load(weights_only=True) rejects numpy strings
    y = np.array([labels.index(v) for v in lab], dtype=np.int64)
    va = np.isin(sig, list(holdout_signers(sig)))
    print(f"pretrain on {DEVICE}: {len(X)} clips, {len(labels)} signs, {len(set(sig))} signers ({va.sum()} held out)")
    model = SignCNN(X.shape[2], len(labels))
    acc, _, ep, state = run_epochs(model, X[~va], y[~va], args.epochs, 1e-3, X[va], y[va], batch=256)
    if state is not None:
        model.load_state_dict(state)
    print(f"held-out-signer top-1 over {len(labels)} signs: {acc:.3f} (best epoch {ep})")
    OUT.mkdir(parents=True, exist_ok=True)
    torch.save({"state": model.state_dict(), "labels": labels, "F": int(X.shape[2]), "heldout_acc": float(acc)}, OUT / "pretrain.pt")
    print(f"saved {OUT / 'pretrain.pt'}")


def finetune(args):
    demo = {s.upper() for s in json.loads((ROOT / "web" / "src" / "vocab.json").read_text())["gislr"]}
    empty = np.array([], dtype=object)
    Xg, lg, sg = load(args.gislr, "g") if args.gislr else (np.zeros((0, 32, 174), np.float32), empty, empty)
    keep = np.isin(lg, list(demo))
    Xg, lg, sg = Xg[keep], lg[keep], sg[keep]
    if args.gislr_per_sign and len(lg):
        rng = np.random.default_rng(0)
        idx = np.concatenate([rng.permutation(np.where(lg == c)[0])[:args.gislr_per_sign] for c in sorted(set(lg))])
        Xg, lg, sg = Xg[idx], lg[idx], sg[idx]
    if args.own and (Path(args.own) / "meta.json").exists():
        Xo, lo, so = load(args.own, "own")
    else:
        print("WARNING: no own recordings -> no _idle class and no own signs; expect false positives on fidgeting.")
        Xo, lo, so = np.zeros((0,) + Xg.shape[1:], np.float32), np.array([], dtype=object), np.array([], dtype=object)
    labels = sorted({str(v) for v in lg} | {str(v) for v in lo})
    idle = labels.index(IDLE) if IDLE in labels else -1
    X = np.concatenate([Xg, Xo]).astype(np.float32)
    y = np.array([labels.index(v) for v in np.concatenate([lg, lo])], dtype=np.int64)
    sig = np.concatenate([sg, so])
    own = np.concatenate([np.zeros(len(Xg), bool), np.ones(len(Xo), bool)])
    repeat = np.where(own, args.own_weight, 1)
    gval = np.isin(sig, list(holdout_signers(sg)))          # fixed Kaggle signers held out in every fold
    own_signers = sorted({str(v) for v in so})
    folds = own_signers if len(own_signers) >= 2 else [None]
    print(f"finetune on {DEVICE}: {len(labels)} labels | Kaggle {len(Xg)} clips | own {len(Xo)} clips from {own_signers}")

    def new_model():
        m = SignCNN(X.shape[2], len(labels))
        init = Path(args.init)
        if init.exists():
            ck = torch.load(init, map_location="cpu")
            m.net.load_state_dict({k[4:]: v for k, v in ck["state"].items() if k.startswith("net.")})
        return m

    lr = 5e-4 if Path(args.init).exists() else 1e-3
    print("init:", args.init if Path(args.init).exists() else "random (run pretrain first for better accuracy)")
    oof_logits, oof_y, own_accs, g_logits, best_eps = [], [], [], None, []
    for s in folds:
        va = gval | ((sig == s) if s else np.zeros(len(X), bool))
        acc, logits, ep, _ = run_epochs(new_model(), X[~va], y[~va], args.epochs, lr, X[va], y[va], repeat[~va])
        best_eps.append(ep)
        if logits is None:
            continue
        vidx = np.where(va)[0]
        is_own = sig[vidx] == s if s else np.zeros(len(vidx), bool)
        if s:
            oof_logits.append(logits[is_own])
            oof_y.append(y[vidx][is_own])
            own_accs.append(float((logits[is_own].argmax(1) == y[vidx][is_own]).mean()))
            print(f"held-out own signer {s.split(':', 1)[1]:>10}: acc {own_accs[-1]:.3f}  (best epoch {ep})")
        if g_logits is None and (~is_own).any():
            g_logits, g_y = logits[~is_own], y[vidx][~is_own]
    g_acc = float((g_logits.argmax(1) == g_y).mean()) if g_logits is not None else float("nan")
    print(f"held-out Kaggle signers, demo vocabulary: acc {g_acc:.3f}")
    own_acc = float(np.mean(own_accs)) if own_accs else float("nan")
    if own_accs:
        print(f"mean held-out own-signer accuracy: {own_acc:.3f}")

    parts = [(lg_, yy) for lg_, yy in zip(oof_logits, oof_y)] + ([(g_logits, g_y)] if g_logits is not None else [])
    if parts:
        L = np.concatenate([p[0] for p in parts])
        Y = np.concatenate([p[1] for p in parts])
        temp = fit_temperature(L, Y)
        z = L / temp
        probs = np.exp(z - z.max(1, keepdims=True))
        probs /= probs.sum(1, keepdims=True)
        tau, coverage = choose_tau(probs, Y, idle)
    else:
        L, Y, temp, tau, coverage = np.zeros((0, len(labels))), np.zeros(0, np.int64), 1.0, 0.7, float("nan")
    print(f"temperature {temp:.2f}  tau {tau}  coverage {coverage:.2f}")
    OUT.mkdir(parents=True, exist_ok=True)
    np.savez(OUT / "oof.npz", labels=np.array(labels), y=Y, logits=L, mask=np.ones(len(Y), bool), temperature=temp)

    final_epochs = max(15, int(np.median(best_eps)))
    model = new_model()
    run_epochs(model, X, y, final_epochs, lr, repeat=repeat)
    model = model.cpu().eval()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    onnx_path = out / "sign.onnx"
    torch.onnx.export(model, torch.zeros(1, X.shape[1], X.shape[2]), onnx_path, input_names=["x"], output_names=["logits"])
    # Recent PyTorch writes weights to sign.onnx.data; the browser loads one file, so inline them.
    onnx.save_model(onnx.load(str(onnx_path)), str(onnx_path), save_as_external_data=False)
    onnx_path.with_name(onnx_path.name + ".data").unlink(missing_ok=True)
    sess = ort.InferenceSession(str(onnx_path))
    with torch.no_grad():
        ref = model(torch.from_numpy(X[:1])).numpy()
    diff = float(np.abs(ref - sess.run(["logits"], {"x": X[:1]})[0]).max())
    assert diff < 1e-3, f"ONNX output differs from PyTorch by {diff}"
    print(f"exported {onnx_path} (max |torch - onnx| = {diff:.2e})")

    # kNN fallback templates for the browser: up to 12 per label, our own clips first
    pick = []
    for c in range(len(labels)):
        idx = np.where(y == c)[0]
        pick.extend(sorted(idx, key=lambda i: not own[i])[:12])
    X[pick].astype("<f4").tofile(out / "knn.f32")
    (out / "knn.json").write_text(json.dumps({"labels": [labels[y[i]] for i in pick], "T": X.shape[1], "F": X.shape[2]}))

    version = time.strftime("cnn-%m%d-%H%M")
    (out / "sign_meta.json").write_text(json.dumps({
        "labels": labels, "T": X.shape[1], "F": X.shape[2], "temperature": temp, "tau": tau, "margin": 0.2,
        "version": version, "heldout_own_signer_accuracy": own_acc, "heldout_kaggle_signer_accuracy": g_acc,
        "kaggle_clips": int(len(Xg)), "own_clips": int(len(Xo))}, indent=2))
    print(f"wrote sign_meta.json + knn templates ({version})")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("pretrain")
    p.add_argument("--gislr", default="data/gislr-all")
    p.add_argument("--epochs", type=int, default=40)
    f = sub.add_parser("finetune")
    f.add_argument("--gislr", default="data/gislr-demo")
    f.add_argument("--own", default="data/processed")
    f.add_argument("--init", default=str(OUT / "pretrain.pt"))
    f.add_argument("--out", default=str(ROOT / "web" / "public" / "models"))
    f.add_argument("--epochs", type=int, default=60)
    f.add_argument("--gislr-per-sign", type=int, default=300)
    f.add_argument("--own-weight", type=int, default=3, help="how many times each own clip appears per epoch")
    args = ap.parse_args()
    torch.manual_seed(0)
    np.random.seed(0)
    pretrain(args) if args.cmd == "pretrain" else finetune(args)


if __name__ == "__main__":
    main()
```
- [ ] Create `ml/eval_report.py`:
```python
"""Charts for the slide deck from ml/out/oof.npz. Usage (repo root): python ml/eval_report.py"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from sklearn.metrics import confusion_matrix, f1_score  # noqa: E402

out = Path("ml/out")
d = np.load(out / "oof.npz")
labels = [str(s) for s in d["labels"]]
mask = d["mask"]
y, logits, temp = d["y"][mask], d["logits"][mask], float(d["temperature"])
z = logits / temp
p = np.exp(z - z.max(1, keepdims=True))
p /= p.sum(1, keepdims=True)
pred = p.argmax(1)
idx = list(range(len(labels)))

cm = confusion_matrix(y, pred, labels=idx, normalize="true")
fig, ax = plt.subplots(figsize=(9, 8))
im = ax.imshow(np.nan_to_num(cm), cmap="Blues", vmin=0, vmax=1)
ax.set_xticks(idx, labels, rotation=90)
ax.set_yticks(idx, labels)
ax.set_xlabel("predicted")
ax.set_ylabel("true")
ax.set_title("Confusion on held-out signers (row-normalized)")
fig.colorbar(im)
fig.tight_layout()
fig.savefig(out / "confusion.png", dpi=150)

f1 = f1_score(y, pred, labels=idx, average=None, zero_division=0)
fig, ax = plt.subplots(figsize=(10, 4))
ax.bar(labels, f1)
ax.set_ylim(0, 1)
ax.set_ylabel("F1")
ax.set_title("Per-sign F1, held-out signers")
plt.xticks(rotation=90)
fig.tight_layout()
fig.savefig(out / "per_class_f1.png", dpi=150)

idle = labels.index("_idle")
p1 = p.max(1)
signs = y != idle
taus = np.linspace(0.2, 0.95, 16)
cov, acc = [], []
for t in taus:
    m = (p1 >= t) & (pred != idle) & signs
    cov.append(m.sum() / max(1, signs.sum()))
    acc.append((pred[m] == y[m]).mean() if m.sum() else np.nan)
fig, ax = plt.subplots(figsize=(5, 4))
ax.plot(cov, acc, marker="o")
for t, c_, a_ in zip(taus[::3], cov[::3], acc[::3]):
    ax.annotate(f"τ={t:.2f}", (c_, a_))
ax.set_xlabel("share of signs answered")
ax.set_ylabel("accuracy when answered")
ax.set_title("Answer less, be right more")
fig.tight_layout()
fig.savefig(out / "coverage.png", dpi=150)

off = np.nan_to_num(cm.copy())
np.fill_diagonal(off, 0)
pairs = sorted(((off[i, j], labels[i], labels[j]) for i in idx for j in idx if off[i, j] > 0), reverse=True)[:5]
metrics = {
    "heldout_signer_accuracy": float((pred == y).mean()),
    "macro_f1": float(f1.mean()),
    "top_confusions": [{"true": a, "pred": b, "rate": round(float(r), 3)} for r, a, b in pairs],
}
(out / "metrics.json").write_text(json.dumps(metrics, indent=2))
print(json.dumps(metrics, indent=2))
```
- [ ] **Pretrain** on all 250 Kaggle signs (start it as soon as `data/gislr-all` exists; it can run while you do other tasks):
```bash
python ml/train.py pretrain --gislr data/gislr-all --epochs 40
```
Expected: `pretrain on cuda: … clips, 250 signs, 21 signers (… held out)`, then `held-out-signer top-1 over 250 signs: …` and `saved ml/out/pretrain.pt`. For reference, the Kaggle winners reached ~89% with far bigger models; anything above ~0.5 makes a useful backbone. If `data/gislr-all` isn't ready, pretrain on `data/gislr-demo` instead.
- [ ] **Fine-tune** after Task 2.B3:
```bash
python ml/train.py finetune --gislr data/gislr-demo --own data/processed --epochs 60
python ml/eval_report.py
```
Expected: one line per held-out signer of ours, `held-out Kaggle signers, demo vocabulary: acc …`, temperature/tau, `exported …/sign.onnx (max |torch - onnx| = …e-06)`, and `wrote sign_meta.json + knn templates`. `web/public/models/` should contain `sign.onnx` (one file, ~1 MB, no `.data` file), `sign_meta.json`, `knn.f32`, `knn.json`.
- [ ] **Targets:** Kaggle held-out ≥ 0.80 and our held-out signer ≥ 0.75 over the 21 labels. Below that, open `ml/out/confusion.png`. Usually one pair causes most errors: re-record it more distinctly, or drop one of the pair from `vocab.json`.
- [ ] Commit `ml/` code plus `web/public/models/sign.onnx`, `sign_meta.json`, `knn.*`: `trained model v1`.

##### Task 2.B5 Tune live on the Bench page (≈ 30 min)
- [ ] Replace `web/src/pages/Bench.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { createTracker } from '../lib/landmarks';
import { clipFeatures } from '../lib/features';
import { Segmenter } from '../lib/segmenter';
import type { SignClassifier } from '../lib/classifier';
import { loadOnnx } from '../lib/onnx';
import { Knn } from '../lib/knn';

/** #/bench — FPS, tracking, segmenter state and live predictions, for tuning thresholds on the real laptop. */
export default function Bench() {
  const video = useRef<HTMLVideoElement>(null);
  const [withFace, setWithFace] = useState(true);
  const [info, setInfo] = useState('loading…');

  useEffect(() => {
    let raf = 0; let stop = false;
    (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 } });
      video.current!.srcObject = stream;
      await video.current!.play();
      const tracker = await createTracker({ withFace });
      const seg = new Segmenter();
      const model: SignClassifier | null = await loadOnnx().catch(() => Knn.load()).catch(() => null); // null before any training
      let last = '';
      let frames = 0; let t0 = performance.now(); let detectMs = 0;
      const loop = () => {
        if (stop) return;
        const a = performance.now();
        const f = tracker.detect(video.current!, a);
        detectMs += performance.now() - a; frames++;
        const ev = seg.push(f);
        if (ev?.kind === 'end' && model) void model.predict(clipFeatures(ev.frames)).then((p) => {
          last = `${p.label} ${(p.p * 100).toFixed(0)}% ${p.accepted ? '✓' : '✗'} (${ev.reason}, ${ev.frames.length} frames, ${p.ms.toFixed(1)} ms, ${p.source})`;
        });
        if (performance.now() - t0 > 1000) {
          setInfo(`FPS ${frames} · detect ${(detectMs / frames).toFixed(1)} ms · hands ${f.hands.length} · pose ${f.pose ? 'yes' : 'no'}`
            + ` · brow ${f.brow ? f.brow.raise.toFixed(2) + '/' + f.brow.furrow.toFixed(2) : '-'}`
            + ` · ${seg.state} speed ${seg.speed.toFixed(2)} · ${model ? last || 'sign something' : 'no model yet'}`);
          frames = 0; detectMs = 0; t0 = performance.now();
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
    })();
    return () => { stop = true; cancelAnimationFrame(raf); };
  }, [withFace]);

  return (
    <main>
      <label><input type="checkbox" checked={withFace} onChange={(e) => setWithFace(e.target.checked)} /> face model</label>
      <p>{info}</p>
      <video ref={video} muted playsInline className="mirror" width={480} />
    </main>
  );
}
```
- [ ] On the signer laptop, sign each demo sign 3×. Signs cut off early → raise `offFrames` to 10. Fidgets starting segments → raise `onSpeed` to 1.0. Change only `DEFAULT_SEG`; keep `npm test` green.
- [ ] Commit: `bench live readout + tuned segmenter`.

#### Track A — Voice, captions, the ASL switch

##### Task 2.A1 Voice output into the call (≈ 45 min)
- [ ] Create `web/src/lib/voice.ts`:
```ts
import { fetchTts } from './api';

export type VoiceHooks = { onStart(ttfbMs: number): void; onEnd(): void; onFail(err: unknown): void };

/** TTS -> <audio> -> WebAudio -> one MediaStreamTrack published once at join (silent between sentences). */
export class VoiceOut {
  readonly ctx = new AudioContext();
  private dest = this.ctx.createMediaStreamDestination();
  private el = new Audio();
  private queue: Promise<void> = Promise.resolve();
  private cache: Record<string, string> = {};

  constructor() {
    this.ctx.createMediaElementSource(this.el).connect(this.dest); // not connected to speakers on purpose
    fetch('/tts-cache/index.json')
      .then((r) => (r.ok ? r.json() : {}))
      .then((c: Record<string, string>) => { this.cache = c; })
      .catch(() => { this.cache = {}; });
  }

  get track(): MediaStreamTrack { return this.dest.stream.getAudioTracks()[0]; }

  /** Call inside the Join click handler; browsers keep audio suspended until a user gesture. */
  unlock(): Promise<void> { return this.ctx.resume(); }

  /** Serialized: the free ElevenLabs tier allows ~2 concurrent requests, and sentences must not overlap. */
  speak(text: string, voiceId: string, h: VoiceHooks): Promise<void> {
    this.queue = this.queue.then(() => this.play(text, voiceId, h));
    return this.queue;
  }

  private async play(text: string, voiceId: string, h: VoiceHooks) {
    const t0 = performance.now();
    const cached = this.cache[`${voiceId}|${text}`];
    let url: string;
    try {
      url = cached ? `/tts-cache/${cached}` : URL.createObjectURL(await fetchTts(text, voiceId));
      this.el.src = url;
      await this.el.play();
    } catch (e) {
      h.onFail(e);
      return;
    }
    h.onStart(performance.now() - t0);
    await new Promise<void>((resolve) => { this.el.onended = () => resolve(); this.el.onerror = () => resolve(); });
    if (!cached) URL.revokeObjectURL(url);
    h.onEnd();
  }
}
```
- [ ] Create `server/scripts/cache_tts.py`:
```python
"""Pre-generate demo MP3s. Usage (from server/): PYTHONPATH=. python scripts/cache_tts.py VOICE_ID"""
import hashlib
import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()
SENTENCES = [  # must equal ruleBasedEnglish() outputs in web/src/lib/gloss.ts (+ the retract phrase in Call.tsx)
    "Hello!", "Hello! My name is Kev.", "My name is Kev.", "What's your name?", "I'm hungry.", "Are you hungry?",
    "I'm not hungry.", "Where can we get pizza?", "Let's go now!", "Please wait.", "I'm going to the store tomorrow.",
    "Thank you!", "Bye!", "Thank you! Bye!", "Yes.", "No.", "Wait.", "Later.", "Sorry, that came out wrong.",
]
voice = sys.argv[1]
out = Path(__file__).resolve().parents[2] / "web" / "public" / "tts-cache"
out.mkdir(parents=True, exist_ok=True)
index_path = out / "index.json"
index = json.loads(index_path.read_text()) if index_path.exists() else {}
for text in SENTENCES:
    name = hashlib.sha1(f"{voice}|{text}".encode()).hexdigest()[:12] + ".mp3"
    r = httpx.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
        params={"output_format": "mp3_44100_128"},
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"]},
        json={"text": text, "model_id": os.environ.get("ELEVEN_MODEL", "eleven_flash_v2_5")},
        timeout=20,
    )
    r.raise_for_status()
    (out / name).write_bytes(r.content)
    index[f"{voice}|{text}"] = name
    print("cached:", text)
index_path.write_text(json.dumps(index, indent=2))
```
- [ ] Run once for the demo voice (`PYTHONPATH=. python scripts/cache_tts.py VOICE_ID`) → `web/public/tts-cache/` holds 19 MP3s + `index.json`. Commit: `voice out + tts cache`.

##### Task 2.A2 Speech-to-text, metrics, small components (≈ 40 min)
- [ ] Create `web/src/lib/stt.ts`:
```ts
export type OnTranscript = (text: string, final: boolean) => void;
export type Stt = { kind: 'webspeech' | 'scribe'; stop(): void };

/** Chrome's built-in recognizer (audio goes to Google). Restarts itself after Chrome's silence timeout. */
export function startWebSpeech(onText: OnTranscript, onError: (msg: string) => void): Stt | null {
  const w = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) { onError('Live captions need Chrome on this laptop. You can still type below.'); return null; }
  let wanted = true;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  rec.onresult = (e: any) => {
    for (let i = e.resultIndex; i < e.results.length; i++) onText(e.results[i][0].transcript.trim(), e.results[i].isFinal);
  };
  rec.onerror = (e: any) => { if (e.error !== 'no-speech' && e.error !== 'aborted') onError(`Speech recognition: ${e.error}`); };
  rec.onend = () => { if (wanted) { try { rec.start(); } catch { /* already running */ } } };
  rec.start();
  return { kind: 'webspeech', stop: () => { wanted = false; rec.stop(); } };
}
```
- [ ] Create `web/src/lib/metrics.ts`:
```ts
const session = crypto.randomUUID();
let modelVersion = 'none';
export const setModelVersion = (v: string) => { modelVersion = v; };

export type SignLog = { gloss: string; confidence: number; accepted: boolean; alt1?: string; alt1_p?: number; classify_ms: number };
export type UtteranceLog = {
  n_signs: number; gloss_seq: string; english: string; sentence_type: string;
  source: 'gemini' | 'rules'; edited: boolean; gloss_ms: number; tts_ttfb_ms?: number; end_to_end_ms?: number;
};

const q: { signs: object[]; utterances: object[] } = { signs: [], utterances: [] };
export function logSign(e: SignLog) { q.signs.push({ ts: new Date().toISOString(), session_id: session, model_version: modelVersion, ...e }); }
export function logUtterance(e: UtteranceLog) { q.utterances.push({ ts: new Date().toISOString(), session_id: session, ...e }); }

function flush() {
  if (!q.signs.length && !q.utterances.length) return;
  const body = JSON.stringify(q);
  q.signs = []; q.utterances = [];
  navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' })); // never blocks the UI
}
setInterval(flush, 5000);
addEventListener('pagehide', flush);
```
- [ ] Create `web/src/components/Chips.tsx`:
```tsx
import type { Token } from '../lib/gloss';

export function Chips({ tokens, onChoose, onRemove }: {
  tokens: Token[]; onChoose(id: string, gloss: string): void; onRemove(id: string): void;
}) {
  return (
    <div className="chips">
      {tokens.map((t) => (
        <span key={t.id} className={`chip ${t.accepted ? 'ok' : 'unsure'}`} title={`${Math.round(t.p * 100)}% sure`}>
          <button onClick={() => onChoose(t.id, t.gloss)}>{t.accepted ? t.gloss : `${t.gloss}?`}</button>
          {!t.accepted && t.alts.map((a) => <button key={a.label} className="alt" onClick={() => onChoose(t.id, a.label)}>{a.label}</button>)}
          <button aria-label={`remove ${t.gloss}`} onClick={() => onRemove(t.id)}>×</button>
        </span>
      ))}
    </div>
  );
}
```
- [ ] Create `web/src/components/Consent.tsx`:
```tsx
export function Consent({ onAccept }: { onAccept(): void }) {
  return (
    <section className="consent">
      <h2>Before you join</h2>
      <ul>
        <li>Your camera video goes only to the person you call.</li>
        <li>Hand and body positions are computed on this laptop. Your video is never recorded or uploaded for recognition.</li>
        <li>When you switch <b>ASL → voice</b> on, signs it recognizes confidently are turned into English by Google Gemini and spoken by ElevenLabs automatically. Anything it is unsure about waits for you to check it. Switch it off any time.</li>
        <li>If something comes out wrong, press <b>That was wrong</b>: the caption is crossed out on both screens.</li>
        <li>Gemini's free tier may use the recognized words (like HELLO) to improve Google products. We log timing numbers and recognized words, never video or audio.</li>
        <li>This is a student prototype for casual conversation. It knows a small vocabulary and makes mistakes. Don't use it for medical, legal, or emergency conversations.</li>
      </ul>
      <button onClick={onAccept}>I understand — continue</button>
    </section>
  );
}
```
- [ ] Commit: `stt, metrics, chips, consent` (`npx tsc -b` passes once Task 2.C1's `gloss.ts` exists).

##### Task 2.A3 The call screen with the ASL → voice switch (≈ 2 h)
- [ ] Create `web/src/config.ts`:
```ts
export const PAUSE_MS = 1100;                  // no new sign for this long -> the sentence is done
export const AUTO_SPEAK_MIN_CONFIDENCE = 0.6;  // Gemini's own confidence needed to speak without a tap
export const USE_FACE = true;                  // set from the Bench benchmark (Task 1.B1)
export const DEV = new URLSearchParams(location.search).has('dev'); // ?dev shows the gloss simulator
```
- [ ] Replace `web/src/pages/Call.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { joinCall, type Call as CallT, type CallStatus } from '../lib/call';
import { CaptionLane, upsertCaption } from '../components/CaptionLane';
import { Chips } from '../components/Chips';
import { Consent } from '../components/Consent';
import { VoiceOut } from '../lib/voice';
import { startWebSpeech, type Stt } from '../lib/stt';
import { getVoices, translateGloss, type GlossResult, type VoiceInfo } from '../lib/api';
import { GlossBuffer, ruleBasedEnglish, type Tag, type Token } from '../lib/gloss';
import { logUtterance } from '../lib/metrics';
import { AUTO_SPEAK_MIN_CONFIDENCE, DEV, PAUSE_MS } from '../config';
import { WH_SIGNS } from '../vocab';
import type { Caption, Ctrl, Role } from '../lib/types';

type Preview = {
  tokens: Token[]; tags: Tag[]; english: string; source: 'gemini' | 'rules';
  result: GlossResult | null; waitMs: number; glossMs: number; edited: boolean;
};
type Form = { room: string; name: string; role: Role; voiceId: string };
const RETRACT_PHRASE = 'Sorry, that came out wrong.';

const readConsent = () => { try { return localStorage.getItem('consent') === '1'; } catch { return false; } };
const saveConsent = () => { try { localStorage.setItem('consent', '1'); } catch { /* private window */ } };

export default function Call() {
  const [consented, setConsented] = useState(readConsent);
  const [form, setForm] = useState<Form>({ room: 'demo-room', name: '', role: 'signer', voiceId: '' });
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState<CallStatus | 'idle'>('idle');
  const [banner, setBanner] = useState('');
  const [flash, setFlash] = useState('');
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [chips, setChips] = useState<Token[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [aslOn, setAslOn] = useState(false);       // the one switch: on = read signs + speak confident sentences
  const [question, setQuestion] = useState(false); // manual yes/no-question toggle (fallback for eyebrow reading)
  const [peer, setPeer] = useState<string | null>(null);
  const [peerSigning, setPeerSigning] = useState(false);
  const [peerAsl, setPeerAsl] = useState(false);
  const [hud, setHud] = useState('');
  const [sim, setSim] = useState('');

  const local = useRef<HTMLVideoElement>(null);
  const remote = useRef<HTMLVideoElement>(null);
  const call = useRef<CallT | null>(null);
  const voice = useRef<VoiceOut | null>(null);
  const stt = useRef<Stt | null>(null);
  const buf = useRef(new GlossBuffer());
  const idle = useRef(true);                                      // Phase 3: the recognizer updates this
  const onAslChange = useRef<(on: boolean) => void>(() => {});    // Phase 3: starts/pauses the recognizer
  const tagsFor = useRef<(sinceT: number, hasWh: boolean) => Tag[]>(() => []); // Task 4.3: eyebrows/headshake
  const lastSpoken = useRef<Caption | null>(null);
  const ttsUntil = useRef(0);
  const sttId = useRef(crypto.randomUUID());
  const translating = useRef(false);
  const formRef = useRef(form); formRef.current = form;
  const previewRef = useRef(preview); previewRef.current = preview;
  const captionsRef = useRef(captions); captionsRef.current = captions;
  const questionRef = useRef(question); questionRef.current = question;
  const aslRef = useRef(aslOn); aslRef.current = aslOn;

  useEffect(() => {
    getVoices()
      .then((v) => { setVoices(v); setForm((f) => ({ ...f, voiceId: f.voiceId || v[0]?.id || '' })); })
      .catch(() => setBanner('Could not load voices — the backup voice will be used.'));
  }, []);

  // Sentence boundary check (works for the simulator now and the recognizer in Phase 3).
  useEffect(() => {
    if (!joined || formRef.current.role !== 'signer') return;
    const id = setInterval(maybeFlush, 100);
    return () => clearInterval(id);
  }, [joined]);

  // Keyboard: Enter = speak a held sentence, Escape = discard it.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Enter' && previewRef.current) speak(previewRef.current);
      if (e.key === 'Escape') setPreview(null);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, []);

  function showFlash(text: string) { setFlash(text); setTimeout(() => setFlash(''), 3000); }

  function caption(c: Pick<Caption, 'id' | 'kind' | 'text' | 'final'>): Caption {
    const f = formRef.current;
    const full: Caption = { ...c, speaker: f.name, role: f.role, ts: Date.now() };
    setCaptions((l) => upsertCaption(l, full));
    void call.current?.sendCaption(full);
    return full;
  }

  function resendRecent() {
    const mine = captionsRef.current.filter((c) => c.speaker === formRef.current.name && c.final).slice(-3);
    mine.forEach((c) => void call.current?.sendCaption(c));
  }

  function onCtrl(m: Ctrl) {
    if (m.type === 'signing') setPeerSigning(m.on);
    if (m.type === 'asl') setPeerAsl(m.on);
    if (m.type === 'tts') ttsUntil.current = m.on ? Number.POSITIVE_INFINITY : performance.now() + 300;
    if (m.type === 'clarify') showFlash("They didn't catch that — sign it again.");
    if (m.type === 'attention') showFlash('Your partner wants your attention');
    if (m.type === 'speak-local') speechSynthesis.speak(new SpeechSynthesisUtterance(m.text));
  }

  function startListening() {
    stt.current = startWebSpeech((text, final) => {
      if (!text || performance.now() < ttsUntil.current) return; // don't caption the signer's voice coming out of our speakers
      caption({ id: sttId.current, kind: 'speech', text, final });
      if (final) sttId.current = crypto.randomUUID();
    }, setBanner);
  }

  async function join() {
    setBanner('');
    const f = formRef.current;
    try {
      const v = f.role === 'signer' ? (voice.current ??= new VoiceOut()) : null;
      await v?.unlock(); // must happen inside this click
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 }, audio: false });
      local.current!.srcObject = stream;
      await local.current!.play();
      call.current = await joinCall({
        room: f.room, name: f.name, role: f.role, camera: stream.getVideoTracks()[0], voice: v?.track,
        h: {
          onCaption: (c) => setCaptions((l) => upsertCaption(l, c)),
          onCtrl,
          onRemoteVideo: (t) => { if (t && remote.current) t.attach(remote.current); },
          onStatus: (s) => { setStatus(s); if (s === 'connected') resendRecent(); },
          onPeer: setPeer,
        },
      });
      if (f.role === 'hearing') startListening();
      setJoined(true);
      // Phase 3 (Task 3.2) adds: if (f.role === 'signer') await prepareSigner();
    } catch (e) {
      setBanner(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Camera blocked — allow it in the address bar, then press Join again.'
        : `Could not join: ${(e as Error).message}`);
    }
  }

  function setAsl(on: boolean) {
    setAslOn(on);
    aslRef.current = on;
    void call.current?.sendCtrl({ type: 'asl', on });
    if (!on) { buf.current.take(); setChips([]); idle.current = true; }
    onAslChange.current(on);
  }

  function addToken(tok: Token) {
    if (!aslRef.current) return;
    buf.current.add(tok);
    setChips([...buf.current.tokens]);
  }

  function maybeFlush() {
    if (previewRef.current || translating.current) return;
    if (!buf.current.ready(performance.now(), idle.current, PAUSE_MS)) return;
    const waitMs = performance.now() - buf.current.lastAt;
    const tokens = buf.current.take();
    setChips([]);
    const hasWh = tokens.some((t) => WH_SIGNS.has(t.gloss));
    const tags = [...new Set([...tagsFor.current(tokens[0].t - 500, hasWh), ...(questionRef.current ? (['Q-YN'] as Tag[]) : [])])];
    setQuestion(false);
    translating.current = true;
    void translate(tokens, tags, waitMs, false).finally(() => { translating.current = false; });
  }

  async function translate(tokens: Token[], tags: Tag[], waitMs: number, edited: boolean) {
    const t0 = performance.now();
    const context = captionsRef.current.filter((c) => c.role === 'hearing' && c.final).slice(-2).map((c) => c.text);
    let p: Preview;
    try {
      const r = await translateGloss(
        tokens.map((t) => ({ gloss: t.gloss, p: t.p, alts: t.alts.map((a) => ({ gloss: a.label, p: a.p })) })), tags, context);
      p = { tokens, tags, english: r.english, source: 'gemini', result: r, waitMs, glossMs: performance.now() - t0, edited };
    } catch {
      p = { tokens, tags, english: ruleBasedEnglish(tokens.map((t) => t.gloss), tags), source: 'rules', result: null, waitMs, glossMs: performance.now() - t0, edited };
    }
    // Auto-speak: every sign was recognized confidently and the translation is confident (or the offline rules made it).
    const sure = tokens.every((t) => t.accepted)
      && (p.source === 'rules' || (p.result !== null && p.result.confidence >= AUTO_SPEAK_MIN_CONFIDENCE));
    if (aslRef.current && sure) speak(p);
    else setPreview(p); // unsure: hold it, the signer taps Speak or fixes a chip
  }

  function editPreview(id: string, gloss: string) {
    const p = previewRef.current;
    if (!p) return;
    const tokens = p.tokens.map((t) => (t.id === id ? { ...t, gloss, p: 1, accepted: true, alts: [] } : t));
    setPreview(null);
    void translate(tokens, p.tags, p.waitMs, true);
  }

  function removeFromPreview(id: string) {
    const p = previewRef.current;
    if (!p) return;
    const tokens = p.tokens.filter((t) => t.id !== id);
    setPreview(null);
    if (tokens.length) void translate(tokens, p.tags, p.waitMs, true);
  }

  function say(text: string, onStart: (ttfb: number) => void) {
    void call.current?.sendCtrl({ type: 'tts', on: true });
    void voice.current?.speak(text, formRef.current.voiceId, {
      onStart,
      onEnd: () => void call.current?.sendCtrl({ type: 'tts', on: false }),
      onFail: () => {
        void call.current?.sendCtrl({ type: 'speak-local', text });
        void call.current?.sendCtrl({ type: 'tts', on: false });
        setBanner('Voice service failed — their laptop is reading it with the backup voice.');
      },
    });
  }

  function speak(p: Preview) {
    setPreview(null);
    lastSpoken.current = caption({ id: crypto.randomUUID(), kind: 'english', text: p.english, final: true });
    say(p.english, (ttfb) => {
      logUtterance({
        n_signs: p.tokens.length, gloss_seq: p.tokens.map((t) => t.gloss).join(' '), english: p.english,
        sentence_type: p.result?.sentence_type ?? 'statement', source: p.source, edited: p.edited,
        gloss_ms: p.glossMs, tts_ttfb_ms: ttfb, end_to_end_ms: p.waitMs + p.glossMs + ttfb, // machine time only
      });
      setHud(`pause ${p.waitMs.toFixed(0)} · gloss ${p.glossMs.toFixed(0)} · voice ${ttfb.toFixed(0)} ms · ${p.source}`);
    });
  }

  /** Auto-speak got it wrong: strike the caption on both screens and say a short apology. */
  function retract() {
    const c = lastSpoken.current;
    if (!c || c.retracted) return;
    const r: Caption = { ...c, retracted: true };
    lastSpoken.current = r;
    setCaptions((l) => upsertCaption(l, r));
    void call.current?.sendCaption(r);
    say(RETRACT_PHRASE, () => {});
  }

  function simulate() { // ?dev only: type glosses instead of signing (needs ASL on)
    sim.trim().split(/\s+/).forEach((g) => addToken({ id: crypto.randomUUID(), gloss: g.toUpperCase().replace(/^FS-/, 'fs-'), p: 0.95, alts: [], accepted: true, t: performance.now() }));
    setSim('');
  }

  if (!consented) return <Consent onAccept={() => { saveConsent(); setConsented(true); }} />;

  const isSigner = form.role === 'signer';
  return (
    <main className={`call ${form.role}`}>
      {banner && <p className="banner" role="alert">{banner}</p>}
      {status === 'reconnecting' && <p className="banner">Reconnecting…</p>}
      {status === 'audio-blocked' && <button className="banner" onClick={() => call.current?.room.startAudio()}>Click to enable audio</button>}
      {flash && <p className="flash" role="status">{flash}</p>}

      {!joined && (
        <section className="setup">
          <input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value.toLowerCase() })} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="signer">I'm signing</option><option value="hearing">I'm speaking</option>
          </select>
          {isSigner && (
            <select value={form.voiceId} onChange={(e) => setForm({ ...form, voiceId: e.target.value })}>
              {voices.map((v) => <option key={v.id} value={v.id}>{v.name} {Object.values(v.labels).slice(0, 2).join(' · ')}</option>)}
            </select>
          )}
          <button onClick={join} disabled={!form.name}>Join</button>
        </section>
      )}

      <section className="stage">
        <div className="tile">
          <video ref={remote} autoPlay playsInline />
          {peerSigning && <span className="badge">{peer ?? 'They'} is signing…</span>}
          {!isSigner && peerAsl && !peerSigning && <span className="badge quiet">ASL voice on</span>}
          <span className="name">{peer ?? 'Waiting for the other person…'}</span>
        </div>
        <div className="tile self">
          <video ref={local} autoPlay muted playsInline className="mirror" />
          {isSigner && <Chips tokens={chips} onChoose={(id, g) => { buf.current.choose(id, g); setChips([...buf.current.tokens]); }} onRemove={(id) => { buf.current.remove(id); setChips([...buf.current.tokens]); }} />}
        </div>
      </section>

      {isSigner && preview && (
        <section className={`preview ${preview.source}`}>
          <p className="hold">Not sure about this one — check it before it's spoken.</p>
          <Chips tokens={preview.tokens} onChoose={editPreview} onRemove={removeFromPreview} />
          <p className="english">{preview.english}{preview.source === 'rules' && <small> (offline translation)</small>}</p>
          <button onClick={() => speak(preview)}>Speak (Enter)</button>
          <button onClick={() => setPreview(null)}>Clear (Esc)</button>
        </section>
      )}

      <CaptionLane captions={captions} me={form.name} />

      {joined && (
        <section className="actions">
          {isSigner && (
            <button className={`asl ${aslOn ? 'on' : ''}`} aria-pressed={aslOn} onClick={() => setAsl(!aslOn)}>
              ASL → voice: {aslOn ? 'ON' : 'OFF'}
            </button>
          )}
          {isSigner && <button onClick={retract} disabled={!lastSpoken.current || lastSpoken.current.retracted}>That was wrong</button>}
          {isSigner && <button aria-pressed={question} onClick={() => setQuestion(!question)}>? question</button>}
          {!isSigner && <button onClick={() => call.current?.sendCtrl({ type: 'clarify' })}>I didn't catch that</button>}
          <button onClick={() => call.current?.sendCtrl({ type: 'attention' })}>Get attention</button>
          {DEV && isSigner && aslOn && <input placeholder="simulate: HELLO ME NAME fs-KEV" value={sim} onChange={(e) => setSim(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && simulate()} />}
          {hud && <small className="hud">{hud}</small>}
        </section>
      )}
    </main>
  );
}
```
- [ ] Add the styles to `web/src/index.css`:
```css
:root { font-family: system-ui, sans-serif; }
.banner { background: #fde68a; padding: .5rem 1rem; }
.flash { background: #2563eb; color: #fff; padding: 1rem; font-size: 1.4rem; }
.stage { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; }
.tile { position: relative; } .tile video { width: 100%; border-radius: 12px; background: #111; }
.badge { position: absolute; top: .5rem; left: .5rem; background: #16a34a; color: #fff; padding: .25rem .6rem; border-radius: 999px; }
.badge.quiet { background: #334155; }
.name { position: absolute; bottom: .5rem; left: .5rem; color: #fff; text-shadow: 0 0 4px #000; }
.chips { display: flex; flex-wrap: wrap; gap: .4rem; margin: .5rem 0; }
.chip { border-radius: 999px; padding: .2rem .4rem; background: #dcfce7; } .chip.unsure { background: #fef3c7; }
.chip button { border: 0; background: transparent; font-weight: 600; cursor: pointer; } .chip .alt { font-weight: 400; text-decoration: underline; }
.preview { border: 2px solid #f59e0b; border-radius: 12px; padding: .75rem; } .hold { margin: 0; color: #92400e; }
.english { font-size: 1.6rem; margin: .4rem 0; }
.lane { font-size: 1.5rem; } .hud { color: #6b7280; margin-left: 1rem; }
.asl { font-size: 1.2rem; padding: .6rem 1rem; border-radius: 999px; } .asl.on { background: #16a34a; color: #fff; }
.dot.ok { color: #16a34a; } .dot.warn { color: #d97706; } .dot.off { color: #9ca3af; }
```
- [ ] Two-laptop test with `?dev` on the signer: join, flip **ASL → voice: ON** (the hearing laptop shows "ASL voice on"), type `HELLO ME NAME fs-KEV` → Enter. Expected within ~2 s, with no tap: the hearing laptop **hears** "Hello! My name is Kev." and both see the caption. Press **That was wrong** → the caption is crossed out on both screens and the apology plays. Type `WATER STORE BYE` → Gemini answers with low confidence → it's **held** ("Not sure about this one") until you press Enter. Flip ASL off → simulator hidden, nothing spoken.
- [ ] Stop the API server and repeat → "(offline translation)" path, still spoken automatically.
- [ ] Commit: `call screen with ASL switch + auto-speak`.

#### Track C — Offline English

##### Task 2.C1 Gloss buffer + rule-based English (≈ 30 min, TDD)
- [ ] Write the failing test `web/src/lib/gloss.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { GlossBuffer, ruleBasedEnglish } from './gloss';

describe('ruleBasedEnglish', () => {
  it('handles the demo script', () => {
    expect(ruleBasedEnglish(['HELLO', 'ME', 'NAME', 'fs-KEV'])).toBe('Hello! My name is Kev.');
    expect(ruleBasedEnglish(['YOU', 'NAME', 'WHAT'])).toBe("What's your name?");
    expect(ruleBasedEnglish(['ME', 'HUNGRY', 'YOU', 'HUNGRY'])).toBe("I'm hungry. Are you hungry?");
    expect(ruleBasedEnglish(['PIZZA', 'WHERE'])).toBe('Where can we get pizza?');
    expect(ruleBasedEnglish(['GO', 'NOW'])).toBe("Let's go now!");
    expect(ruleBasedEnglish(['THANKYOU', 'BYE'])).toBe('Thank you! Bye!');
  });
  it('uses the negation tag', () => {
    expect(ruleBasedEnglish(['ME', 'HUNGRY'], ['NEG'])).toBe("I'm not hungry.");
  });
  it('falls back to word-by-word with sensible punctuation', () => {
    expect(ruleBasedEnglish(['LATER', 'ME', 'GO', 'HOME'])).toBe('Later. I go home.');
    expect(ruleBasedEnglish(['STORE', 'WHERE'])).toBe('Store where?');
    expect(ruleBasedEnglish(['YOU', 'GO'], ['Q-YN'])).toBe('You go?');
  });
});

describe('GlossBuffer', () => {
  it('is ready only after a pause while idle', () => {
    const b = new GlossBuffer();
    b.add({ id: '1', gloss: 'HELLO', p: 0.9, alts: [], accepted: true, t: 1000 });
    expect(b.ready(1500, true, 1100)).toBe(false);
    expect(b.ready(2200, false, 1100)).toBe(false);
    expect(b.ready(2200, true, 1100)).toBe(true);
    expect(b.take()).toHaveLength(1);
    expect(b.ready(9999, true, 1100)).toBe(false);
  });
});
```
- [ ] `npm test` → fails. Create `web/src/lib/gloss.ts`:
```ts
import type { Alt } from './classifier';
import { WH_SIGNS } from '../vocab';

export type Tag = 'Q-YN' | 'Q-WH' | 'NEG';
export type Token = { id: string; gloss: string; p: number; alts: Alt[]; accepted: boolean; t: number };

export class GlossBuffer {
  tokens: Token[] = [];
  lastAt = 0;
  add(tok: Token) { this.tokens.push(tok); this.lastAt = tok.t; }
  choose(id: string, gloss: string) {
    const t = this.tokens.find((x) => x.id === id);
    if (t) { t.gloss = gloss; t.p = 1; t.accepted = true; t.alts = []; }
  }
  remove(id: string) { this.tokens = this.tokens.filter((t) => t.id !== id); }
  ready(now: number, idle: boolean, pauseMs: number) { return this.tokens.length > 0 && idle && now - this.lastAt >= pauseMs; }
  take(): Token[] { const t = this.tokens; this.tokens = []; return t; }
}

// ---- Offline fallback. Its phrases must match server/scripts/cache_tts.py SENTENCES exactly.
const FS = '*FS';
type Pattern = { seq: string[]; out: (names: string[], tags: Tag[]) => string };
const RAW_PATTERNS: Pattern[] = [
  { seq: ['ME', 'NAME', FS], out: ([n]) => `My name is ${n}.` },
  { seq: ['YOU', 'NAME', 'WHAT'], out: () => "What's your name?" },
  { seq: ['ME', 'HUNGRY'], out: (_, t) => (t.includes('NEG') ? "I'm not hungry." : "I'm hungry.") },
  { seq: ['YOU', 'HUNGRY'], out: () => 'Are you hungry?' },
  { seq: ['PIZZA', 'WHERE'], out: () => 'Where can we get pizza?' },
  { seq: ['WATER', 'WHERE'], out: () => 'Where can I get water?' },
  { seq: ['GO', 'NOW'], out: () => "Let's go now!" },
  { seq: ['PLEASE', 'WAIT'], out: () => 'Please wait.' },
  { seq: ['WAIT', 'PLEASE'], out: () => 'Please wait.' },
  { seq: ['TOMORROW', 'ME', 'GO', 'STORE'], out: () => "I'm going to the store tomorrow." },
  { seq: ['TOMORROW', 'GO', 'STORE'], out: () => "I'm going to the store tomorrow." },
  { seq: ['THANKYOU'], out: () => 'Thank you!' },
  { seq: ['HELLO'], out: () => 'Hello!' },
  { seq: ['BYE'], out: () => 'Bye!' },
  { seq: ['YES'], out: () => 'Yes.' },
  { seq: ['NO'], out: () => 'No.' },
  { seq: ['WAIT'], out: () => 'Wait.' },
  { seq: ['LATER'], out: () => 'Later.' },
];
const PATTERNS = [...RAW_PATTERNS].sort((a, b) => b.seq.length - a.seq.length); // longest match wins

const WORDS: Record<string, string> = { ME: 'I', YOU: 'you', THANKYOU: 'thank you' };
const fsName = (g: string) => g.charAt(3) + g.slice(4).toLowerCase(); // fs-LIV -> Liv

function matchAt(glosses: string[], i: number, seq: string[]): string[] | null {
  const names: string[] = [];
  for (let k = 0; k < seq.length; k++) {
    const g = glosses[i + k];
    if (g === undefined) return null;
    if (seq[k] === FS) { if (!g.startsWith('fs-')) return null; names.push(fsName(g)); }
    else if (seq[k] !== g) return null;
  }
  return names;
}

export function ruleBasedEnglish(glosses: string[], tags: Tag[] = []): string {
  const parts: string[] = [];
  let loose: string[] = [];
  const flushLoose = () => {
    if (!loose.length) return;
    const question = tags.includes('Q-YN') || tags.includes('Q-WH') || loose.some((g) => WH_SIGNS.has(g));
    const words = loose.map((g) => (g.startsWith('fs-') ? fsName(g) : WORDS[g] ?? g.toLowerCase()));
    if (tags.includes('NEG')) words.splice(1, 0, 'not');
    const s = words.join(' ');
    parts.push(s.charAt(0).toUpperCase() + s.slice(1) + (question ? '?' : '.'));
    loose = [];
  };
  for (let i = 0; i < glosses.length;) {
    let hit: { p: Pattern; names: string[] } | null = null;
    for (const p of PATTERNS) { const names = matchAt(glosses, i, p.seq); if (names) { hit = { p, names }; break; } }
    if (hit) { flushLoose(); parts.push(hit.p.out(hit.names, tags)); i += hit.p.seq.length; }
    else { loose.push(glosses[i]); i++; }
  }
  flushLoose();
  return parts.join(' ');
}
```
- [ ] `npm test` → green. Its sentences must match `cache_tts.py` exactly. Commit: `gloss buffer + offline English`.

#### Track C (evening): slides skeleton, Devpost draft (Inspiration · What it does · How we built it (diagram 3.1) · Challenges · What we learned per person · What's next · Built with), and rehearse the script with the simulator.

**▶ CP2 — Sat 23:00:** fine-tuned model recognizes the 20 signs on Bench · simulator drives auto-speak, holds, retraction and offline fallback · accuracies and Gemini p50 written in README.

---

### Phase 3 — Golden path (Sat 23:00 – Sun 02:00)

##### Task 3.1 [B] Signer pipeline with pause/resume (≈ 45 min)
- [ ] Create `web/src/lib/signerPipeline.ts`:
```ts
import { anchors, clipFeatures, type Anchors } from './features';
import { Segmenter } from './segmenter';
import { LetterDecoder, letterFeatures, letterHand, NONE, type LetterKnn } from './letters';
import { logSign } from './metrics';
import type { Pred, SignClassifier } from './classifier';
import type { Tracker } from './landmarks';
import type { Frame } from './types';
import { IDLE } from '../vocab';

export type PipelineEvents = {
  onSigning(on: boolean): void;
  onPred(p: Pred, tEnd: number): void;          // every non-idle segment (accepted or not)
  onLetters(spelled: string): void;
  onTracking(q: { fps: number; hands: number; edge: boolean }): void;
  onFrame?(f: Frame, a: Anchors | null, idle: boolean): void; // eyebrow/headshake reader (Task 4.3)
};

export type PipelineOptions = {
  video: HTMLVideoElement; tracker: Tracker; model: SignClassifier; letters: LetterKnn | null; ev: PipelineEvents;
};

/** Runs every animation frame on the signer's laptop while ASL is on: landmarks -> segment -> classify, or spell mode. */
export class SignerPipeline {
  seg = new Segmenter();
  readonly decoder = new LetterDecoder();
  spelling = false;
  spelled = '';
  /** Task 4.5: while set, finished segments go here instead of to the classifier. */
  calibrate: ((x: Float32Array) => void) | null = null;
  private raf = 0;
  private running = false;
  private a: Anchors | null = null;
  private prevWrist: { t: number; x: number; y: number } | null = null;
  private count = 0; private countT = performance.now();
  private o: PipelineOptions;

  constructor(o: PipelineOptions) { this.o = o; }

  get idle() { return this.seg.state !== 'ACTIVE'; }
  get isRunning() { return this.running; }
  setModel(m: SignClassifier) { this.o.model = m; }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => { if (!this.running) return; this.tick(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  /** ASL switched off: stop reading signs, keep models loaded so switching back on is instant. */
  pause() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.seg.state === 'ACTIVE') this.o.ev.onSigning(false);
    this.seg = new Segmenter();
    this.setSpelling(false);
  }
  stop() { this.pause(); this.o.tracker.close(); }
  setSpelling(on: boolean) { this.spelling = on; this.spelled = ''; this.decoder.reset(); this.o.ev.onLetters(''); }
  backspace() { this.spelled = this.spelled.slice(0, -1); this.o.ev.onLetters(this.spelled); }

  private tick() {
    const v = this.o.video;
    if (v.readyState < 2) return;
    const f = this.o.tracker.detect(v, performance.now()); // raw frames: clipFeatures() normalizes handedness per sign
    this.a = anchors(f, this.a);
    this.track(f);
    if (this.spelling) { this.spell(f); this.o.ev.onFrame?.(f, this.a, true); return; }
    const ev = this.seg.push(f);
    this.o.ev.onFrame?.(f, this.a, this.idle);
    if (ev?.kind === 'start') this.o.ev.onSigning(true);
    if (ev?.kind === 'end') { this.o.ev.onSigning(false); void this.classify(ev.frames, ev.t); }
  }

  private async classify(frames: Frame[], tEnd: number) {
    const x = clipFeatures(frames);
    if (this.calibrate) { this.calibrate(x); return; }
    const p = await this.o.model.predict(x);
    logSign({ gloss: p.label, confidence: p.p, accepted: p.accepted, alt1: p.alts[0]?.label, alt1_p: p.alts[0]?.p, classify_ms: p.ms });
    if (p.label !== IDLE && this.running) this.o.ev.onPred(p, tEnd);
  }

  private spell(f: Frame) {
    const hand = letterHand(f);
    if (!hand || !this.o.letters || !this.a) { this.prevWrist = null; this.decoder.push({ [NONE]: 1 }, 0); return; }
    const asp = f.w / f.h;
    const w = { t: f.t, x: hand[0].x * asp, y: hand[0].y };
    const speed = this.prevWrist && f.t > this.prevWrist.t
      ? Math.hypot(w.x - this.prevWrist.x, w.y - this.prevWrist.y) / this.a.s / ((f.t - this.prevWrist.t) / 1000) : 0;
    this.prevWrist = w;
    const ch = this.decoder.push(this.o.letters.probs(letterFeatures(hand, asp)), speed);
    if (ch) { this.spelled += ch; this.o.ev.onLetters(this.spelled); }
  }

  private track(f: Frame) {
    this.count++;
    const now = performance.now();
    if (now - this.countT < 1000) return;
    const edge = f.hands.some((h) => h.some((p) => p.x < 0.02 || p.x > 0.98 || p.y < 0.02 || p.y > 0.98));
    this.o.ev.onTracking({ fps: this.count, hands: f.hands.length, edge });
    this.count = 0; this.countT = now;
  }
}
```
- [ ] `npx tsc -b` → no errors. Commit: `signer pipeline`.

##### Task 3.2 [A+B] Connect the recognizer to the ASL switch (≈ 45 min)
Apply these edits to `web/src/pages/Call.tsx` in order. Each **Find** text appears exactly once.
<!-- edit: web/src/pages/Call.tsx -->
**Edit 1 — find:**
```tsx
import type { Caption, Ctrl, Role } from '../lib/types';
```
**Replace with:**
```tsx
import type { Caption, Ctrl, Role } from '../lib/types';
import { createTracker } from '../lib/landmarks';
import { loadOnnx } from '../lib/onnx';
import { Knn } from '../lib/knn';
import { LetterKnn } from '../lib/letters';
import { SignerPipeline } from '../lib/signerPipeline';
import { setModelVersion } from '../lib/metrics';
import { USE_FACE } from '../config';
```
<!-- edit: web/src/pages/Call.tsx -->
**Edit 2 — find:**
```tsx
  const [sim, setSim] = useState('');
```
**Replace with:**
```tsx
  const [sim, setSim] = useState('');
  const pipe = useRef<SignerPipeline | null>(null);
  const [spelled, setSpelled] = useState<string | null>(null); // null = not in spell mode
  const [tracking, setTracking] = useState({ fps: 0, hands: 0, edge: false });
```
<!-- edit: web/src/pages/Call.tsx -->
**Edit 3 — find:**
```tsx
  function showFlash(text: string) {
```
**Replace with:**
```tsx
  useEffect(() => () => pipe.current?.stop(), []);

  /** Loads MediaPipe + the sign model when the signer joins, so flipping ASL on is instant. */
  async function prepareSigner() {
    const [tracker, model, letters] = await Promise.all([
      createTracker({ withFace: USE_FACE }),
      loadOnnx().catch(() => Knn.load()),      // trained CNN if present, else kNN templates
      LetterKnn.load().catch(() => null),
    ]);
    setModelVersion(model.version);
    pipe.current = new SignerPipeline({
      video: local.current!, tracker, model, letters,
      ev: {
        onSigning: (on) => { idle.current = !on; void call.current?.sendCtrl({ type: 'signing', on }); },
        onPred: (p, tEnd) => addToken({ id: crypto.randomUUID(), gloss: p.label, p: p.p, alts: p.alts, accepted: p.accepted, t: tEnd }),
        onLetters: (s) => setSpelled(s),
        onTracking: setTracking,
      },
    });
    onAslChange.current = (on) => {
      if (on) pipe.current?.start();
      else { pipe.current?.pause(); setSpelled(null); }
    };
  }

  function finishSpelling() {
    const name = pipe.current?.spelled ?? '';
    pipe.current?.setSpelling(false);
    setSpelled(null);
    if (name) addToken({ id: crypto.randomUUID(), gloss: `fs-${name}`, p: 1, alts: [], accepted: true, t: performance.now() });
  }

  function showFlash(text: string) {
```
<!-- edit: web/src/pages/Call.tsx -->
**Edit 4 — find:**
```tsx
      // Phase 3 (Task 3.2) adds: if (f.role === 'signer') await prepareSigner();
```
**Replace with:**
```tsx
      if (f.role === 'signer') await prepareSigner().catch((e: Error) => setBanner(`Sign recognition could not start: ${e.message}`));
```
<!-- edit: web/src/pages/Call.tsx -->
**Edit 5 — find:**
```tsx
          {DEV && isSigner && aslOn &&
```
**Replace with:**
```tsx
          {isSigner && aslOn && (spelled === null
            ? <button onClick={() => { pipe.current?.setSpelling(true); setSpelled(''); }}>Spell a name</button>
            : <span className="spell">Spelling: <b>{spelled || '…'}</b>
                <button onClick={() => pipe.current?.backspace()}>⌫</button>
                <button onClick={finishSpelling}>Done</button></span>)}
          {isSigner && aslOn && <span className={`dot ${tracking.edge ? 'warn' : tracking.hands ? 'ok' : 'off'}`}
            title={`${tracking.fps} fps`}>{tracking.edge ? 'Move back so both hands are visible' : `${tracking.fps} fps`}</span>}
          {DEV && isSigner && aslOn &&
```
- [ ] `npx tsc -b` → no errors. Commit: `recognizer on the ASL switch`.

##### Task 3.3 [All] Golden path on two laptops (≈ 60 min)
- [ ] Signer laptop at http://localhost:5173 (no `?dev`); hearing laptop with headphones. Run the demo script (§2) **three times**.
- [ ] Log each run: failed signs, wrong English, held sentences, HUD timings. Expected: ≥ 2 of 3 runs complete; machine latency (pause + gloss + voice) ≲ 2.5 s.
- [ ] Fix only what broke the script (segment thresholds, one confusable sign, letter holds). No new features tonight.
- [ ] `git tag golden-path && git push --tags`.

**▶ CP3 — Sun 02:00.** Sleep in shifts (≥ 4 h each). The last person up pushes everything.

---

### Phase 4 — Harden and add sponsor depth (Sun 07:00–13:00)

Rule: **every change is tested against the golden-path script before it's merged.** If something breaks the script and isn't fixed within 30 minutes, revert it.

##### Task 4.1 [C] Deploy the web app to Vultr (≈ 30 min; domain optional)
- [ ] From a laptop: `cd web && npm run build && scp -r dist/* root@VULTR_IP:/srv/signline/web/`. On the VM: `cd /srv/signline/repo && git pull && systemctl restart signline`.
- [ ] Open `https://<ip-with-dashes>.sslip.io` on both laptops → consent → join → run the golden path once.
- [ ] Optional, only with 15 spare minutes: redeem the GoDaddy Registry domain through the MLH coach, add `A @ → VULTR_IP`, put the domain on the first line of the `Caddyfile` instead of the sslip.io name, and `systemctl reload caddy`.
- [ ] If anything about Vultr fails today, the demo runs from laptop 1's local server exactly as in Phase 3. Commit: `deployed`.

##### Task 4.2 [C] Live stats page (Tiger Data) (≈ 45 min)
- [ ] Create `web/src/pages/Stats.tsx`:
```tsx
import { useEffect, useState } from 'react';

type Summary = { utterances: number; e2e_p50: number | null; e2e_p95: number | null; gloss_p50: number | null; tts_p50: number | null; fallback_rate: number | null };
type Trend = { bucket: string; utterances: number; avg_e2e_ms: number | null; max_e2e_ms: number | null };
type Weak = { gloss: string; n: number; avg_conf: number; accept_rate: number };
type StatsT = { configured: boolean; summary?: Summary; trend?: Trend[]; weakest_signs?: Weak[] };
const ms = (v: number | null | undefined) => (v == null ? '–' : `${Math.round(Number(v))} ms`);

export default function Stats() {
  const [s, setS] = useState<StatsT | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const load = () => fetch('/api/stats').then((r) => r.json()).then((d: StatsT) => { setS(d); setErr(''); }).catch(() => setErr('Stats unavailable'));
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);
  if (err) return <p>{err}</p>;
  if (!s) return <p>Loading…</p>;
  if (!s.configured) return <p>Database not configured.</p>;
  const trend = s.trend ?? [];
  const max = Math.max(1, ...trend.map((t) => Number(t.avg_e2e_ms ?? 0)));
  const pts = trend.map((t, i) => `${(i / Math.max(1, trend.length - 1)) * 300},${78 - (Number(t.avg_e2e_ms ?? 0) / max) * 70}`).join(' ');
  const sum = s.summary;
  return (
    <main className="stats">
      <h2>Live pipeline stats — last 15 minutes (Tiger Data)</h2>
      <div className="kpis">
        <div><b>{ms(sum?.e2e_p50)}</b><span>median sign → voice</span></div>
        <div><b>{ms(sum?.e2e_p95)}</b><span>p95 sign → voice</span></div>
        <div><b>{ms(sum?.gloss_p50)}</b><span>Gemini median</span></div>
        <div><b>{ms(sum?.tts_p50)}</b><span>voice start median</span></div>
        <div><b>{sum?.utterances ?? 0}</b><span>sentences</span></div>
        <div><b>{sum?.fallback_rate == null ? '–' : `${Math.round(Number(sum.fallback_rate) * 100)}%`}</b><span>offline fallbacks</span></div>
      </div>
      <svg viewBox="0 0 300 80" width="600" height="160" role="img" aria-label="Average sign-to-voice latency per minute, last 30 minutes">
        <polyline fill="none" stroke="#2563eb" strokeWidth="2" points={pts} />
      </svg>
      <table>
        <thead><tr><th>sign</th><th>seen</th><th>avg confidence</th><th>accepted</th></tr></thead>
        <tbody>
          {(s.weakest_signs ?? []).map((w) => (
            <tr key={w.gloss}><td>{w.gloss}</td><td>{w.n}</td><td>{Number(w.avg_conf).toFixed(2)}</td><td>{Math.round(Number(w.accept_rate) * 100)}%</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
```
- [ ] Add the route:
<!-- edit: web/src/App.tsx -->
**Edit 1 — find:**
```tsx
import Recorder from './pages/Recorder';
```
**Replace with:**
```tsx
import Recorder from './pages/Recorder';
import Stats from './pages/Stats';
```
<!-- edit: web/src/App.tsx -->
**Edit 2 — find:**
```tsx
  // later tasks add routes here
```
**Replace with:**
```tsx
  stats: () => <Stats />,
  // later tasks add routes here
```
- [ ] CSS: `.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}.kpis b{font-size:2rem;display:block}`.
- [ ] Run the golden path twice, then open `#/stats`. Expected: sentence count, p50/p95, a trend line, and the weakest signs. Empty trend → run `CALL refresh_continuous_aggregate('latency_1m', NULL, NULL);` once.
- [ ] Commit: `tiger data stats page`.

##### Task 4.3 [B] Eyebrows + headshake → question/negation, via Presage (≈ 90 min) — Q14
Presage has no browser SDK, so a tiny local Node process (the "sidecar") receives camera frames from the page and runs Presage's on-device face model. Its expression model reports **"surprise" when the brows go up and "anger" when they go down**. In ASL those are grammar, not emotion: raised brows mark a yes/no question and lowered brows a WH-question. So we use them only as question markers, never to color the voice. If the sidecar isn't running, the same code falls back to MediaPipe's eyebrow blendshapes, then to the "?" button.
- [ ] Write the failing test `web/src/lib/nmm.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { headshake, Nmm } from './nmm';
import type { Anchors } from './features';
import type { Frame } from './types';

describe('headshake', () => {
  it('detects two side-to-side cycles', () => {
    const xs = Array.from({ length: 36 }, (_, i) => 0.1 * Math.sin((i / 36) * 4 * Math.PI));
    expect(headshake(xs)).toBe(true);
  });
  it('ignores small jitter', () => {
    const xs = Array.from({ length: 36 }, (_, i) => 0.02 * Math.sin((i / 36) * 4 * Math.PI));
    expect(headshake(xs)).toBe(false);
  });
  it('ignores a single head turn', () => {
    const xs = Array.from({ length: 36 }, (_, i) => (i < 18 ? 0 : 0.15));
    expect(headshake(xs)).toBe(false);
  });
});

describe('Nmm', () => {
  const a: Anchors = { c: [0.5, 0.6], s: 0.2, nose: [0.5, 0.3], mouth: [0.5, 0.38], restY: 0.76 };
  const frame = (t: number, raise: number, furrow: number, hands = 0): Frame =>
    ({ t, w: 640, h: 480, pose: null, hands: Array.from({ length: hands }, () => []), brow: { raise, furrow } });
  const face = (surprise: number, anger: number) => ({ surprise, anger, neutral: 50, talking: false, stable: true });

  it('uses Presage when it is streaming: surprise -> yes/no question, anger -> WH-question', () => {
    const n = new Nmm();
    for (let t = 0; t < 1000; t += 100) { n.push(frame(t, 0.1, 0.1), a, true); n.pushPresage(face(5, 5), t); }
    for (let t = 1000; t < 2000; t += 100) { n.push(frame(t, 0.1, 0.1, 1), a, false); n.pushPresage(face(60, 5), t); }
    expect(n.tags(1000, false)).toEqual(['Q-YN']);
    for (let t = 2000; t < 3000; t += 100) { n.push(frame(t, 0.1, 0.1, 1), a, false); n.pushPresage(face(5, 55), t); }
    expect(n.tags(2000, false)).toEqual(['Q-WH']);
  });
  it('falls back to MediaPipe brows without Presage', () => {
    const n = new Nmm();
    for (let t = 0; t < 1000; t += 33) n.push(frame(t, 0.1, 0.1), a, true);
    for (let t = 1000; t < 2000; t += 33) n.push(frame(t, 0.4, 0.1, 1), a, false);
    expect(n.tags(1000, false)).toEqual(['Q-YN']);
    expect(n.tags(1000, true)).toEqual(['Q-WH']); // a WH sign always makes a WH-question
  });
});
```
- [ ] `npm test` → fails. Create `web/src/lib/presage.ts`:
```ts
/** Face readings from the local Presage sidecar (presage/sidecar.mjs). Percentages 0..100. */
export type PresageFace = { surprise: number; anger: number; neutral: number; talking: boolean | null; stable: boolean };
type Msg = ({ type: 'face' } & PresageFace) | { type: 'status'; hint: string };

/** Streams the signer's camera frames to the Presage sidecar and reports its face readings. Optional: if the sidecar
 *  isn't running, connect() resolves false and eyebrow reading falls back to MediaPipe. */
export class PresageLink {
  private ws: WebSocket | null = null;
  private timer = 0;
  private canvas = document.createElement('canvas');
  private url: string;

  constructor(url = 'ws://127.0.0.1:8788') { this.url = url; }

  get connected() { return this.ws?.readyState === WebSocket.OPEN; }

  connect(onFace: (f: PresageFace) => void, onStatus: (hint: string) => void): Promise<boolean> {
    return new Promise((resolve) => {
      const ws = new WebSocket(this.url);
      ws.binaryType = 'arraybuffer';
      const giveUp = setTimeout(() => { ws.close(); resolve(false); }, 1500);
      ws.onopen = () => { clearTimeout(giveUp); this.ws = ws; resolve(true); };
      ws.onerror = () => { clearTimeout(giveUp); resolve(false); };
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.stop(); } };
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(String(e.data)) as Msg;
          if (m.type === 'face') onFace(m); else onStatus(m.hint);
        } catch { /* ignore malformed */ }
      };
    });
  }

  /** Send ~fps frames per second; skips frames when the socket is backed up. */
  start(video: HTMLVideoElement, fps = 8) {
    this.stop();
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    this.timer = window.setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 2_000_000 || video.readyState < 2) return;
      const w = video.videoWidth, h = video.videoHeight;
      if (!w || !h) return;
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
      ctx.drawImage(video, 0, 0, w, h);
      const rgba = ctx.getImageData(0, 0, w, h).data;
      const msg = new Uint8Array(8 + rgba.length);
      const head = new DataView(msg.buffer);
      head.setUint32(0, w, true);
      head.setUint32(4, h, true);
      msg.set(rgba, 8);
      ws.send(msg);
    }, 1000 / fps);
  }

  stop() { window.clearInterval(this.timer); this.timer = 0; }
  close() { this.stop(); this.ws?.close(); this.ws = null; }
}
```
- [ ] Create `web/src/lib/nmm.ts`:
```ts
import type { Anchors } from './features';
import type { Tag } from './gloss';
import type { PresageFace } from './presage';
import type { Frame } from './types';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** xs = nose x relative to the shoulder centre, in shoulder widths, over ~1.5 s. */
export function headshake(xs: number[], minAmp = 0.08, minCrossings = 3): boolean {
  if (xs.length < 12) return false;
  if (Math.max(...xs) - Math.min(...xs) < minAmp) return false;
  const m = mean(xs);
  let crossings = 0;
  let prev = 0;
  for (const x of xs) {
    const s = Math.sign(x - m);
    if (s !== 0 && prev !== 0 && s !== prev) crossings++;
    if (s !== 0) prev = s;
  }
  return crossings >= minCrossings;
}

export type NmmCfg = {
  raise: number; furrow: number;               // MediaPipe blendshape deltas above this person's neutral face
  presageRaise: number; presageFurrow: number; // Presage percentage-point deltas above neutral
};
export const DEFAULT_NMM: NmmCfg = { raise: 0.15, furrow: 0.15, presageRaise: 20, presageFurrow: 20 };

type Sample = { t: number; a: number; b: number };
class Baseline { // running mean of a signal while the face is neutral (hands down, not signing)
  v = 0; n = 0;
  add(x: number) { const k = Math.min(this.n++, 300); this.v = (this.v * k + x) / (k + 1); }
}

/** Non-manual markers -> tags for Gemini. Raised brows = yes/no question, lowered brows = WH-question, headshake = NEG.
 *  Brow source: Presage's expression model when the sidecar runs (its "surprise" fires on raised brows, "anger" on
 *  lowered brows; in ASL these are grammar, not emotion), otherwise MediaPipe face blendshapes. */
export class Nmm {
  private cfg: NmmCfg;
  private nose: { t: number; x: number }[] = [];
  private mp: Sample[] = [];
  private ps: Sample[] = [];
  private bRaise = new Baseline(); private bFurrow = new Baseline();
  private bSurprise = new Baseline(); private bAnger = new Baseline();
  private neutralNow = false;

  constructor(cfg: NmmCfg = DEFAULT_NMM) { this.cfg = cfg; }

  push(f: Frame, a: Anchors | null, idle: boolean) {
    this.neutralNow = idle && f.hands.length === 0;
    if (a) this.nose.push({ t: f.t, x: (a.nose[0] - a.c[0]) / a.s });
    if (f.brow) {
      this.mp.push({ t: f.t, a: f.brow.raise, b: f.brow.furrow });
      if (this.neutralNow) { this.bRaise.add(f.brow.raise); this.bFurrow.add(f.brow.furrow); }
    }
    this.trim(f.t);
  }

  pushPresage(face: PresageFace, t: number) {
    this.ps.push({ t, a: face.surprise, b: face.anger });
    if (this.neutralNow) { this.bSurprise.add(face.surprise); this.bAnger.add(face.anger); }
    this.trim(t);
  }

  /** Current brow deltas for the Bench readout: [raise, furrow] per source. */
  delta() {
    const m = this.mp.at(-1), p = this.ps.at(-1);
    return {
      mediapipe: m ? [m.a - this.bRaise.v, m.b - this.bFurrow.v] : null,
      presage: p ? [p.a - this.bSurprise.v, p.b - this.bAnger.v] : null,
    };
  }

  tags(sinceT: number, hasWh: boolean): Tag[] {
    const tags: Tag[] = [];
    const ps = this.ps.filter((s) => s.t >= sinceT);
    const mp = this.mp.filter((s) => s.t >= sinceT);
    let raised = false, furrowed = false;
    if (ps.length >= 3) {
      raised = mean(ps.map((s) => s.a)) - this.bSurprise.v > this.cfg.presageRaise;
      furrowed = mean(ps.map((s) => s.b)) - this.bAnger.v > this.cfg.presageFurrow;
    } else if (mp.length >= 5) {
      raised = mean(mp.map((s) => s.a)) - this.bRaise.v > this.cfg.raise;
      furrowed = mean(mp.map((s) => s.b)) - this.bFurrow.v > this.cfg.furrow;
    }
    if (hasWh || furrowed) tags.push('Q-WH');
    else if (raised) tags.push('Q-YN');
    const end = this.nose.at(-1)?.t ?? 0;
    if (headshake(this.nose.filter((n) => n.t >= end - 1500).map((n) => n.x))) tags.push('NEG');
    return tags;
  }

  private trim(now: number) {
    for (const arr of [this.nose, this.mp, this.ps] as { t: number }[][]) {
      while (arr.length && now - arr[0].t > 8000) arr.shift();
    }
  }
}
```
- [ ] `npm test` → green.
- [ ] Create `presage/package.json` for the sidecar:
```json
{
  "name": "signline-presage-sidecar",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": { "start": "node sidecar.mjs" },
  "dependencies": {
    "@smartspectra/node-sdk": "latest",
    "ws": "^8.18.0"
  }
}
```
- [ ] Create `presage/sidecar.mjs`:
```js
// Presage sidecar: the browser streams the signer's camera frames here; Presage's on-device face model reads them;
// we send back expression scores. Presage has no browser SDK, so this small local process bridges the two.
// Run on the SIGNER laptop:   cd presage && npm install && PRESAGE_API_KEY=... npm start
// Listens on 127.0.0.1 only. Never put the key in the web app.
import { WebSocketServer } from 'ws';
import { PixelFormat, SmartSpectraSDK, decodeMetrics, faceMetrics } from '@smartspectra/node-sdk';

const PORT = Number(process.env.PRESAGE_PORT ?? 8788);
const KEY = process.env.PRESAGE_API_KEY;
if (!KEY) { console.error('Set PRESAGE_API_KEY (from physiology.presagetech.com)'); process.exit(1); }

const NAMES = ['UNSPECIFIED', 'ANGRY', 'CONTEMPT', 'DISGUST', 'FEAR', 'HAPPY', 'NEUTRAL', 'SAD', 'SURPRISE'];
const nameOf = (t) => (typeof t === 'number' ? NAMES[t] : String(t).replace(/^.*_/, '')) ?? 'UNSPECIFIED';

let client = null;
const send = (msg) => { if (client?.readyState === 1) client.send(JSON.stringify(msg)); };

// Face analysis only: pulse/breathing readings are unreliable while someone is signing (large arm motion).
const sdk = new SmartSpectraSDK({ apiKey: KEY, requestedMetrics: [...faceMetrics] });
sdk.on('metrics', (buf) => {
  const m = decodeMetrics(buf);
  if (Buffer.isBuffer(m)) return; // undecodable payload
  const e = m.face?.expression?.at(-1);
  if (!e?.scores?.length) return;
  const s = Object.fromEntries(e.scores.map((x) => [nameOf(x.type), x.confidence])); // 0..100
  send({ type: 'face', surprise: s.SURPRISE ?? 0, anger: s.ANGRY ?? 0, neutral: s.NEUTRAL ?? 0,
         talking: m.face?.talking?.at(-1)?.detected ?? null, stable: !!e.stable });
});
sdk.on('validationStatus', (code, _ts, hint) => { if (code !== 0) send({ type: 'status', hint: hint || `code ${code}` }); });
sdk.on('error', (code, message, retryable) => {
  console.error('Presage error', code, message, retryable ? '(retryable)' : '');
  send({ type: 'status', hint: `Presage error ${code}: ${message}` });
});
sdk.useCustomInput();
sdk.start();

// Binary message from the browser: [u32 width LE][u32 height LE][RGBA bytes]
const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT, maxPayload: 16 * 1024 * 1024 });
wss.on('connection', (ws) => {
  client?.close();
  client = ws;
  console.log('browser connected');
  ws.on('message', (data, isBinary) => {
    if (!isBinary || data.length < 8) return;
    const w = data.readUInt32LE(0), h = data.readUInt32LE(4);
    if (data.length !== 8 + w * h * 4) return;
    const tsUs = Math.round(performance.now() * 1000); // monotonic microseconds
    sdk.sendFrame(data.subarray(8), w, h, w * 4, PixelFormat.kRGBA, tsUs);
  });
  ws.on('close', () => { if (client === ws) client = null; });
});
console.log(`Presage sidecar on ws://127.0.0.1:${PORT}`);

process.on('SIGINT', async () => { wss.close(); await sdk.stopAsync(); await sdk.destroy(); process.exit(0); });
```
- [ ] On the **signer laptop** (Node ≥ 20; Apple Silicon Mac or Windows x64): `cd presage && npm install` (downloads a few hundred MB of native runtimes, so do it early on good Wi-Fi), then start it. On macOS/Git Bash: `PRESAGE_API_KEY=… npm start`. In PowerShell: `$env:PRESAGE_API_KEY="…"; npm start`. Expected: `Presage sidecar on ws://127.0.0.1:8788`. Presage checks the key online, so it needs internet.
- [ ] Apply these edits to `web/src/pages/Call.tsx`:
<!-- edit: web/src/pages/Call.tsx -->
**Edit 1 — find:**
```tsx
import { USE_FACE } from '../config';
```
**Replace with:**
```tsx
import { USE_FACE } from '../config';
import { Nmm } from '../lib/nmm';
import { PresageLink } from '../lib/presage';
```
<!-- edit: web/src/pages/Call.tsx -->
**Edit 2 — find:**
```tsx
  const [tracking, setTracking] = useState({ fps: 0, hands: 0, edge: false });
```
**Replace with:**
```tsx
  const [tracking, setTracking] = useState({ fps: 0, hands: 0, edge: false });
  const [faceSource, setFaceSource] = useState('');
  const [faceHint, setFaceHint] = useState('');
```
<!-- edit: web/src/pages/Call.tsx -->
**Edit 3 — find:**
```tsx
    setModelVersion(model.version);
    pipe.current = new SignerPipeline({
```
**Replace with:**
```tsx
    setModelVersion(model.version);
    const nmm = new Nmm();
    const presage = new PresageLink();
    const presageOk = await presage.connect((face) => nmm.pushPresage(face, performance.now()), setFaceHint);
    setFaceSource(presageOk ? 'Presage' : USE_FACE ? 'MediaPipe' : 'off');
    tagsFor.current = (since, hasWh) => nmm.tags(since, hasWh);
    pipe.current = new SignerPipeline({
```
<!-- edit: web/src/pages/Call.tsx -->
**Edit 4 — find:**
```tsx
        onTracking: setTracking,
      },
    });
```
**Replace with:**
```tsx
        onTracking: setTracking,
        onFrame: (f, a, isIdle) => nmm.push(f, a, isIdle),
      },
    });
```
<!-- edit: web/src/pages/Call.tsx -->
**Edit 5 — find:**
```tsx
    onAslChange.current = (on) => {
      if (on) pipe.current?.start();
      else { pipe.current?.pause(); setSpelled(null); }
    };
```
**Replace with:**
```tsx
    onAslChange.current = (on) => {
      if (on) { pipe.current?.start(); if (presageOk) presage.start(local.current!); }
      else { pipe.current?.pause(); presage.stop(); setSpelled(null); }
    };
```
<!-- edit: web/src/pages/Call.tsx -->
**Edit 6 — find:**
```tsx
          {DEV && isSigner && aslOn &&
```
**Replace with:**
```tsx
          {isSigner && aslOn && faceSource && <small className="hud">brows: {faceSource}{faceHint ? ` · ${faceHint}` : ''}</small>}
          {DEV && isSigner && aslOn &&
```
- [ ] Apply these edits to `web/src/pages/Bench.tsx` (MediaPipe brow readout for tuning):
<!-- edit: web/src/pages/Bench.tsx -->
**Edit 1 — find:**
```tsx
import { Knn } from '../lib/knn';
```
**Replace with:**
```tsx
import { Knn } from '../lib/knn';
import { Nmm } from '../lib/nmm';
```
<!-- edit: web/src/pages/Bench.tsx -->
**Edit 2 — find:**
```tsx
      const seg = new Segmenter();
```
**Replace with:**
```tsx
      const seg = new Segmenter();
      const nmm = new Nmm();
```
<!-- edit: web/src/pages/Bench.tsx -->
**Edit 3 — find:**
```tsx
        const ev = seg.push(f);
```
**Replace with:**
```tsx
        const ev = seg.push(f);
        nmm.push(f, seg.anchors, seg.state !== 'ACTIVE');
```
<!-- edit: web/src/pages/Bench.tsx -->
**Edit 4 — find:**
```tsx
            + ` · ${seg.state} speed
```
**Replace with:**
```tsx
            + ` · brow Δ ${nmm.delta().mediapipe?.map((v) => v.toFixed(2)).join('/') ?? '-'}`
            + ` · ${seg.state} speed
```
- [ ] Run the web app **from the signer laptop** (`npm run dev`, http://localhost:5173), because a page on a public HTTPS site may be blocked from talking to localhost. If Chrome asks to allow access to devices on your local network, click **Allow**. Join, flip ASL on → the HUD shows `brows: Presage`.
- [ ] Tune: sign `YOU HUNGRY` 3× with neutral brows and 3× with raised brows. In DevTools → Network → `/api/gloss` → Payload, `tags` should be `[]` vs `["Q-YN"]`. If not, lower `presageRaise` in `DEFAULT_NMM` (start at 20 percentage points). Do the same for `YOU NAME WHAT` with lowered brows (`Q-WH`) and a headshake on `ME HUNGRY` (`NEG` → "I'm not hungry.").
- [ ] Without the sidecar running, confirm the HUD says `brows: MediaPipe` and the same tests mostly work (tune `raise`/`furrow` on Bench). Keep the "? question" button either way.
- [ ] Commit: `eyebrows + headshake via presage with mediapipe fallback`.

##### Task 4.4 [A] Robust captions with ElevenLabs Scribe (≈ 40 min)
- [ ] `cd web && npm install @elevenlabs/client@^1.28.0` (the code below type-checks against 1.28).
- [ ] Replace `web/src/lib/stt.ts`:
```ts
import { getScribeToken } from './api';

export type OnTranscript = (text: string, final: boolean) => void;
export type Stt = { kind: 'webspeech' | 'scribe'; stop(): void };

/** Chrome's built-in recognizer (audio goes to Google). Restarts itself after Chrome's silence timeout. */
export function startWebSpeech(onText: OnTranscript, onError: (msg: string) => void): Stt | null {
  const w = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) { onError('Live captions need Chrome on this laptop. You can still type below.'); return null; }
  let wanted = true;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  rec.onresult = (e: any) => {
    for (let i = e.resultIndex; i < e.results.length; i++) onText(e.results[i][0].transcript.trim(), e.results[i].isFinal);
  };
  rec.onerror = (e: any) => { if (e.error !== 'no-speech' && e.error !== 'aborted') onError(`Speech recognition: ${e.error}`); };
  rec.onend = () => { if (wanted) { try { rec.start(); } catch { /* already running */ } } };
  rec.start();
  return { kind: 'webspeech', stop: () => { wanted = false; rec.stop(); } };
}

/** Task 4.4 — ElevenLabs Scribe v2 Realtime: any modern browser, echo cancellation on, key stays on the server. */
export async function startScribe(onText: OnTranscript, onError: (msg: string) => void): Promise<Stt> {
  const { Scribe, CommitStrategy, RealtimeEvents } = await import('@elevenlabs/client');
  const { token } = await getScribeToken();
  const conn = Scribe.connect({
    token,
    modelId: 'scribe_v2_realtime',
    commitStrategy: CommitStrategy.VAD,
    vadSilenceThresholdSecs: 0.7,
    microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  conn.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (m: { text: string }) => onText(m.text, false));
  conn.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (m: { text: string }) => onText(m.text, true));
  conn.on(RealtimeEvents.ERROR, (e: unknown) => onError(`Captions: ${String((e as { message?: string })?.message ?? e)}`));
  return { kind: 'scribe', stop: () => conn.close() };
}
```
- [ ] Apply this edit to `web/src/pages/Call.tsx`:
<!-- edit: web/src/pages/Call.tsx -->
**Edit 1 — find:**
```tsx
import { startWebSpeech, type Stt } from '../lib/stt';
```
**Replace with:**
```tsx
import { startScribe, startWebSpeech, type Stt } from '../lib/stt';
```
<!-- edit: web/src/pages/Call.tsx -->
**Edit 2 — find:**
```tsx
  function startListening() {
    stt.current = startWebSpeech((text, final) => {
      if (!text || performance.now() < ttsUntil.current) return; // don't caption the signer's voice coming out of our speakers
      caption({ id: sttId.current, kind: 'speech', text, final });
      if (final) sttId.current = crypto.randomUUID();
    }, setBanner);
  }
```
**Replace with:**
```tsx
  function startListening() {
    const onText = (text: string, final: boolean) => {
      if (!text || performance.now() < ttsUntil.current) return; // don't caption the signer's voice coming out of our speakers
      caption({ id: sttId.current, kind: 'speech', text, final });
      if (final) sttId.current = crypto.randomUUID();
    };
    startScribe(onText, setBanner)
      .then((s) => { stt.current = s; })
      .catch(() => { stt.current = startWebSpeech(onText, setBanner); }); // token or network failure -> Chrome recognizer
  }
```
- [ ] Test: the hearing laptop speaks → gray interim captions, then final. Temporarily break the ElevenLabs key on the server → falls back to Web Speech. Commit: `scribe captions with fallback`.

##### Task 4.5 [B] "Teach my sign" — per-user calibration (optional, ≈ 30 min)
- [ ] Apply these edits to `web/src/pages/Call.tsx`:
<!-- edit: web/src/pages/Call.tsx -->
**Edit 1 — find:**
```tsx
import { WH_SIGNS } from '../vocab';
```
**Replace with:**
```tsx
import { DEMO_SIGNS, WH_SIGNS } from '../vocab';
```
<!-- edit: web/src/pages/Call.tsx -->
**Edit 2 — find:**
```tsx
  const [faceHint, setFaceHint] = useState('');
```
**Replace with:**
```tsx
  const [faceHint, setFaceHint] = useState('');
  const calib = useRef<Knn | null>(null);
  const [teachLabel, setTeachLabel] = useState(DEMO_SIGNS[0]);
```
<!-- edit: web/src/pages/Call.tsx -->
**Edit 3 — find:**
```tsx
  function finishSpelling() {
```
**Replace with:**
```tsx
  /** "Teach it your sign": 3 examples of one sign, added to a kNN that then replaces the CNN for this session. */
  async function teach(label: string) {
    if (!pipe.current) return;
    calib.current ??= await Knn.load();
    if (!aslRef.current) setAsl(true);
    let n = 0;
    setBanner(`Sign ${label} 3 times, lowering your hands between each.`);
    pipe.current.calibrate = (x) => {
      calib.current!.add(label, x); calib.current!.add(label, x); // weight the user's own examples double
      n++;
      setBanner(`${label}: ${n}/3`);
      if (n === 3) { pipe.current!.calibrate = null; pipe.current!.setModel(calib.current!); setBanner(`Learned your ${label}.`); }
    };
  }

  function finishSpelling() {
```
<!-- edit: web/src/pages/Call.tsx -->
**Edit 4 — find:**
```tsx
          {DEV && isSigner && aslOn &&
```
**Replace with:**
```tsx
          {isSigner && <span className="teach">
            <select value={teachLabel} onChange={(e) => setTeachLabel(e.target.value)}>{DEMO_SIGNS.map((l) => <option key={l}>{l}</option>)}</select>
            <button onClick={() => void teach(teachLabel)}>Teach my sign</button></span>}
          {DEV && isSigner && aslOn &&
```
- [ ] Demo use: a judge who wants to try teaches HELLO and THANKYOU (≈ 30 s), then signs them. Commit: `per-user calibration`.

##### Task 4.6 [C] Pitch workshop + slides (09:00–10:00 workshop, then ≈ 90 min)
- [ ] One person attends the 09:00 "How to Pitch Your Project" workshop.
- [ ] Six slides max: the problem in one human sentence · live demo · how it works (diagram 3.1) · what we measured (confusion matrix, coverage curve, Kaggle vs our-signer accuracy, latency p50/p95) · what it can't do (§9) · what's next + what each of us learned.
- [ ] Kev runs `python ml/eval_report.py` on the final model and sends the PNGs + `ml/out/metrics.json`.

##### Task 4.7 [All] Failure drills (≈ 45 min, 11:30–12:15)
- [ ] Stop the API server → "(offline translation)", still spoken.
- [ ] `GEMINI_MODEL=wrong` + restart → same, no crash.
- [ ] Hearing laptop Wi-Fi off for 10 s → "Reconnecting…" → recovers, last captions resent.
- [ ] Deny the camera → banner; allow → join works.
- [ ] Signer at the frame edge → "Move back" hint.
- [ ] Unplug the hearing laptop's headphones during a sentence → no echo captions.
- [ ] Kill the Presage sidecar mid-call → HUD falls back to `brows: MediaPipe` after the next ASL off/on. Nothing else breaks.
- [ ] Both laptops on a phone hotspot → the full golden path works.
- [ ] Hard refresh mid-call → rejoin works; consent remembered.

##### Task 4.8 [B] More Kaggle signs, no recording (optional, ≈ 20 min each round)
- [ ] Add 2–6 words from the Kaggle list to `"gislr"` in `web/src/vocab.json` (good ones: `food`, `drink`, `home`, `time`, `finish`, `sleepy`). Avoid chest signs that look like PLEASE/HUNGRY.
- [ ] `python ml/gislr_to_features.py --zip data/asl-signs.zip --signs demo --out data/gislr-demo` → `python ml/train.py finetune …` → `python ml/eval_report.py`.
- [ ] Ship only if no existing demo sign's F1 drops by more than 0.05. Add a few Gemini examples for the new words if they're in the demo.

**▶ CP4 — Sun 13:00:** deployed URL (or rehearsed local fallback) · stats page live · drills pass · slides drafted.

---

### Phase 5 — Freeze, rehearse, submit (Sun 13:00–17:00)
- [ ] **13:00–13:30 Record the backup video** (≤ 3 min): the golden path on two laptops, a 20-second "how it works", limitations. Upload publicly (YouTube). On ElevenLabs' free plan, put "elevenlabs.io" in the title.
- [ ] **14:30 Code freeze.** `git tag demo && git push --tags`. After this, only fixes of a few lines.
- [ ] **14:30–16:00 Rehearse 5×** with a timer. Roles: Kev signs; Mac 1 person plays the hearing side; Mac 2 person presents and fields questions.
- [ ] **By 16:30 Devpost submitted:**
  - [ ] Title, tagline, event tracks **Best AI/ML, Best Live Demo, Next Giant Leap**; MLH tracks **Gemini, Vultr, Tiger Data** (+ **Presage** only if Task 4.3 works on stage; + GoDaddy if you registered a domain).
  - [ ] Public GitHub + public video links.
  - [ ] Built with: MediaPipe, ONNX Runtime Web, PyTorch, LiveKit, Gemini API, ElevenLabs, FastAPI, Tiger Data, Vultr, Presage, React, Vite — **and Claude Code + Codex (AI coding tools)**.
  - [ ] One paragraph per sponsor (§8).
  - [ ] What we learned: each person's background before the weekend and what they learned (a judging criterion).
  - [ ] Data & credit: "Google – Isolated Sign Language Recognition" (Kaggle) / PopSign, CC BY 4.0; our own consented landmark recordings (not published).
  - [ ] Limitations (§9) verbatim.
- [ ] **16:30–17:00** README final, push. **17:15** demo setup (§7).

### Phase 6 — After the event (by Sat Oct 31)
- [ ] DEV Writing Challenge post tagged `#mlhacks`: architecture, real latency numbers from Tiger Data, the confusion matrix, "what failed" (why an LLM isn't the recognizer: ~24% zero-shot in a 2026 benchmark), how auto-speak + retraction keeps the signer in control, the demo video. Share it in the event Discord and on LinkedIn.
- [ ] Rotate every API key used during the event.

---

## 7. Demo-day runbook (Sun 17:15)
- [ ] Both laptops on power; Chrome only; notifications off; screen sleep off.
- [ ] Signer laptop: light in front of Kev, plain background, camera at chest-to-head height, sleeves above the wrist, ~1 m back. Presage sidecar running (if used) and the app on localhost.
- [ ] Hearing laptop: **headphones on**, volume tested.
- [ ] Both in `demo-room` 10 minutes early; one test sentence each way. Leave **ASL → voice OFF** until the demo starts, then flip it on as the first beat.
- [ ] Third tab on `#/stats`; backup video downloaded; phone hotspot ready.
- [ ] Last resort, said out loud: if the venue lights defeat the hand tracker, use `?dev` and say "lighting is beating the hand tracker, so I'm typing the glosses. Everything after recognition is live."

| Likely question | Owner | Short answer |
|---|---|---|
| How accurate is it? | Kev | "On Kaggle signers it never saw: X% over our 20 signs. On a teammate it never trained on: Y%. It only auto-speaks when confident; at that threshold it's right Z% of the time." |
| Why not have Gemini watch the video? | Kev | "A 2026 benchmark found LLMs get ~24% of isolated signs zero-shot. We trained a classifier on 94k Kaggle clips for recognition and use Gemini for language: word order, questions, picking between our top guesses." |
| Isn't auto-speak risky? | Mac 2 | "The signer controls the switch, only confident sentences are spoken, unsure ones wait, and 'That was wrong' retracts on both screens." |
| Did Deaf people help? | Mac 2 | "Not yet — I'm (Kev) learning ASL, and testing with Deaf signers is the first next step. We designed the controls around what Deaf researchers have published." |
| Replace interpreters? | Mac 2 | "No. It's for casual moments where no interpreter is booked anyway." |
| What does Presage do here? | Kev | "It reads raised vs lowered eyebrows — ASL's question grammar — so 'YOU HUNGRY' becomes 'Are you hungry?'. We deliberately don't turn faces into voice emotion." |
| Privacy? | Mac 1 | "Landmarks are computed on the laptop; video never goes to our server or the AI. Only recognized words and English text leave the device." |
| How fast? | Mac 2 | Point at the stats tab: p50/p95. |

---

## 8. Prize tracks

**Event tracks:** Best Overall (automatic) + **Best AI/ML**, **Best Live Demo**, **Next Giant Leap**.

| Track | What the judges should see |
|---|---|
| Best AI/ML | A model pretrained on 94k Kaggle clips and fine-tuned this weekend; held-out-signer accuracy for Kaggle and our signers; calibrated confidence that decides what auto-speaks; a train/serve parity test; Gemini used for language, not vision. |
| Best Live Demo | A real two-laptop call, voice + captions both ways in 3 minutes, a judge invited to try, live latency numbers, and a visible recovery ("That was wrong"). |
| Next Giant Leap | Two-way conversation across a language barrier, built consent-first, with ASL grammar (eyebrows) taken seriously. |

**MLH tracks** (Devpost paragraphs — edit to match what shipped):

| Track | Enter? | Paragraph |
|---|---|---|
| **Gemini API** | Yes | "Gemini 3.5 Flash-Lite turns recognized ASL glosses into natural English using a JSON schema (english, sentence type, confidence, uncertain words). It sees our classifier's top alternatives and the hearing person's last captions, plus eyebrow/headshake tags for questions and negation. Its confidence decides whether a sentence is auto-spoken or held for the signer. Median latency: X ms. We don't use Gemini to recognize signs from video (published zero-shot accuracy ~24%); a trained classifier does recognition, Gemini does language." |
| **Tiger Data** | Yes | "Every recognized sign and spoken sentence is a time-series event in two hypertables; a real-time continuous aggregate powers a live dashboard of sign-to-voice latency (p50/p95), Gemini and voice latency, offline-fallback rate, and the signs our model is least sure about — which told us what to re-record." |
| **Vultr** | Yes | "Our app runs on a Vultr VM: Caddy serves the site with automatic HTTPS and proxies a FastAPI server that holds every API key, mints LiveKit tokens, and streams ElevenLabs audio without buffering." |
| **Presage** | If Task 4.3 works on stage | "Presage's on-device face model runs in a local sidecar fed by our page. Its expression scores rise for raised brows ('surprise') and lowered brows ('anger'). In ASL those are grammar, marking yes/no and WH questions, so we map them to question tags for Gemini instead of treating them as emotion, and we never put emotion into the voice." |
| GoDaddy Registry | Only if a domain is registered | Use it as the live URL. |
| DEV Writing | After the event | Phase 6. |
| Solana | No | No honest fit. |

---

## 9. Pitch wording and limitations

**60-second opener:** "Most video calls give Deaf signers two options: book an interpreter, or type in the chat. For a quick 'want to grab pizza?', neither feels like a conversation. SignLine is a two-way prototype. You flip on ASL → voice, sign, and the other person hears it. They talk, you read it. I'm Kev — I'm hearing and learned these signs this weekend, so watch the system, not my signing."

| Say | Don't say |
|---|---|
| "recognizes a 20-sign vocabulary plus fingerspelled names" | "translates ASL" |
| "for casual, low-stakes conversations where no interpreter is booked anyway" | "replaces interpreters" |
| "the signer controls the switch; only confident sentences are spoken; one tap takes it back" | "gives Deaf people a voice" / "breaks the silence" |
| "X% on Kaggle signers it never saw, Y% on a teammate it never trained on" | "99% accurate" |
| "we read eyebrows and headshakes for questions and negation" | "understands ASL grammar" |
| "Deaf", "hard of hearing", "signer" | "mute", "deaf-mute", "hearing-impaired" |

**Limitations slide (verbatim):**
- Isolated signs from a 20-sign vocabulary; no continuous or fluent signing.
- Fingerspelling is slow and knows only the letters K, E, V.
- Facial grammar: eyebrows (questions) and headshake (negation) only; no mouth morphemes, classifiers or directional verbs.
- Trained on Kaggle/PopSign recordings plus a few hearing teammates learning ASL; accuracy drops for new signers and regional variants (including Black ASL).
- Auto-speak can still say a wrong sentence; that's why the retract button exists.
- Not for medical, legal or emergency use.
- Privacy: landmarks are computed on-device; recognized words go to Google Gemini (the free tier may use them to improve products) and English text to ElevenLabs.

---

## 10. Cut list and risks

**Behind? Cut in this order:** GoDaddy → more Kaggle signs (4.8) → teach-my-sign (4.5) → Scribe (keep Web Speech) → Presage (keep MediaPipe brows) → MediaPipe brows (keep the "?" button) → stats page (keep logging) → Vultr (run from laptop 1) → pretraining on all 250 (fine-tune from the demo subset only) → the CNN (ship the kNN templates) → spell mode (type "fs-KEV" in the simulator, said out loud).

**Never cut:** consent screen, the ASL switch, holding unsure sentences, "That was wrong", offline fallbacks, cached MP3s, the backup video, the limitations slide.

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| 40 GB Kaggle download too slow | Medium | High | Start first; ethernet; Kaggle-notebook conversion fallback; `--signs demo` first | Kev |
| Kev's signs differ from the PopSign versions | Medium | High | Learn from PopSign videos; record 5 reps of each Kaggle sign; fine-tune on them | Kev |
| GISLR aspect ratio unknown | Medium | Low | `--estimate-aspect-from`; x-stretch augmentation | Kev |
| Auto-speak says a wrong sentence on stage | Medium | Medium | Confidence gating + holds; "That was wrong"; rehearse | A |
| Presage key check / localhost blocked | Medium | Low | Automatic MediaPipe fallback; run the app from localhost | Kev |
| Venue lighting breaks hand tracking | Medium | High | Lamp in front; rehearse in Rice 130; honest simulator fallback | Kev |
| Gemini 429 (limits reset 3:00 AM EDT, per project) | Medium | Medium | Tier-1 billing; offline rules; cached MP3s | C |
| ElevenLabs credits run out | Medium | Medium | Dev on teammates' accounts; demo account untouched; Starter | C |
| Two agents edit the same file | High | Medium | One agent per track; small commits; `git pull --rebase` | All |
| Echo of the voice into captions | High w/o headphones | Medium | Headphones; tts gating; Scribe echo cancellation | A |
| Wi-Fi drops | Medium | High | Hotspot; reconnect banner; backup video | A |
| Burnout → Sunday bugs | High | High | golden-path tag; sleep shifts; 14:30 freeze | All |
| Overclaiming to ASL-aware judges | Medium | High | §9 table; limitations slide; "Kev is learning" | C |

---

## 11. Self-review (xvant)

**Your answers → where they landed**

| Answer | Where |
|---|---|
| Kaggle pretrained data | §1, §2 vocabulary, diagram 3.7, Tasks 0.2, 1.B5, 1.B6, 2.B4, 4.8 |
| No Best Beginner / no Female Empowerment; Best Overall auto + 3 tracks | §1, §8 |
| 3-minute table demo on two laptops | §2 demo script, §7 |
| GoDaddy not now | §1, Task 4.1 (optional), cut list |
| Learning ASL ourselves | Task 0.3 (PopSign videos), §7 Q&A, §9 |
| Claude Code + Codex, 2 Macs + MSI 3060 | §5.1, §5.2, `AGENTS.md`/`CLAUDE.md` (Task 0.4), Task 0.2 (CUDA) |
| "KEV" | vocabulary, letters, Gemini examples, offline rules, cached audio |
| Auto-speak by default, one ASL toggle | rule 0.3, diagram 3.2, Task 2.A3 (`setAsl`, `sure` gate, `retract`) |
| Q14 via Presage | Task 4.3 (sidecar + `PresageLink` + `Nmm`), §8 Presage paragraph |
| MLH sponsors first | §8 (Gemini, Tiger Data, Vultr, Presage) |

**Verified before handing over (Oct 17), by walking this document in order the way an agent would:** create/replace every file it lists and apply every find/replace edit in sequence, then check the result at each checkpoint.
- All **27 find/replace edits** applied; each anchor matched exactly once.
- The web app **type-checks at CP1, CP2, CP3, CP4 and at the end** under today's `create-vite` React-TS template (TypeScript 6, React 19, `erasableSyntaxOnly`). `vite build` succeeds.
- Frontend tests: **31 pass at CP2, 36 at the end** (vitest 5).
- Server tests: **7/7** (FastAPI, `livekit-api`, `google-genai` 2.31). Gemini request config builds.
- **Parity:** TypeScript and Python features agree on 7 cases (one hand, two hands, left-handed ×2, missing pose/hands, portrait aspect, single frame). A deliberate mismatch makes the test fail.
- **ML end to end on a fake Kaggle zip with the real parquet schema:**
  - The converter's zip and folder modes produce byte-identical output.
  - Pretrain and fine-tune both run, with leave-one-signer-out including a left-handed signer.
  - Charts are written.
  - `sign.onnx` is a single file matching PyTorch to ~1e-6.
  - **onnxruntime-web 1.30 and Python give identical predictions** (85/92 on the check set).
- **Presage:** the real `@smartspectra/node-sdk` 3.4.0 loads its native runtime, and the sidecar accepts our frame protocol without crashing. It stopped at Presage's online key check, which this sandbox can't reach, so a real key and internet are needed at the venue.
- Package APIs exist in current versions: `livekit-client` 2.23 (`sendText`, `registerTextStreamHandler`), `@elevenlabs/client` 1.28 (`Scribe`, `CommitStrategy`, `RealtimeEvents`), `@smartspectra/node-sdk` 3.4 (`SmartSpectraSDK`, `faceMetrics`, `decodeMetrics`, `PixelFormat`).
- **Bugs this round caught and fixed:**
  - Labels stored as NumPy strings made `torch.load` fail on current PyTorch.
  - Recent PyTorch splits ONNX weights into a second file the browser wouldn't load.
  - The temperature fit collapsed on perfectly separable data.
  - The letter-distance threshold could be zero.
  - One task's wording would have let an agent skip a file.

**Not testable here — each has a check step in its task:**
- The real Kaggle download and license page (Task 0.2).
- Live LiveKit, Gemini and ElevenLabs calls (Tasks 1.C1–1.C3, 1.A1).
- The Tiger schema syntax on your service version (Task 1.C5 has a fallback).
- MediaPipe in a real browser with a camera, including blendshape names (Task 1.B1 Bench).
- Presage with a real key (Task 4.3 tuning step).
- Chrome's local-network prompt for the sidecar (Task 4.3).

**Placeholders that are yours by nature:** the example IP `149-28-1-2.sslip.io`, the voice ID, and the X/Y/Z numbers on slides that come from your runs.

**Name consistency:**
- `vocab.json` → `vocab.ts`, `gislr_to_features.py --signs demo`, `train.py finetune`.
- `T=32`, `F=174` → `features.ts` = `features.py` → `meta.json` → `train.py` → `sign_meta.json` → `onnx.ts` / `knn.ts`.
- `_idle` → `vocab.json`, `classifier.ts`, `train.py`.
- Glosses are the uppercase Kaggle names (`THANKYOU`) → Gemini prompt, `gloss.ts`, `cache_tts.py`.
- `Ctrl` `asl`/`tts`/`signing` → `Call.tsx` both roles.
- `/api/*` → `main.py` ↔ `api.ts` / `metrics.ts` / `Stats.tsx`.
- Event fields → `main.py` ↔ `schema.sql` ↔ `metrics.ts`.

---

## 12. Sources

Event and data
- Girls Hoo Hack 2026 Devpost — https://girls-hoo-hack-2026.devpost.com/ (rules, dates)
- MLH standard rules — https://github.com/MLH/mlh-policies/blob/main/standard-hackathon-rules.md
- Kaggle "Google – Isolated Sign Language Recognition" — https://www.kaggle.com/competitions/asl-signs
- PopSign v1.0 sign list (the 250 Kaggle words) — https://signdata.cc.gatech.edu/view/datasets/popsign_v1_0/non-game/index.html · game signs: https://signdata.cc.gatech.edu/view/datasets/popsign_v1_0/game/index.html
- GISLR 1st-place notebook (preprocessing/augmentation ideas, MIT) — https://github.com/hoyso48/Google---Isolated-Sign-Language-Recognition-1st-place-solution

ASL and Deaf-community perspective
- Lifeprint lessons and minimal pairs — https://www.lifeprint.com/asl101/lessons/lesson01.htm · https://www.lifeprint.com/asl101/topics/minimalpairs.htm
- Tran, Ladner & Bragg (ASSETS 2023) — https://microsoft.com/en-us/research/uploads/prod/2023/10/Automatic_Sign_Language_Translation_Perspectives.pdf
- EUD Ethical Framework on AI and sign language — https://eud.eu/wp-content/uploads/2025/07/ETHICAL-FRAMEWORK-ON-AI-AND-SIGN-LANGUAGE.pdf
- LLMs on isolated sign recognition (~24% zero-shot) — https://arxiv.org/pdf/2604.11225

Stack and sponsors
- MediaPipe Hand/Holistic (web) — https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- ONNX Runtime Web — https://onnxruntime.ai/docs/tutorials/web/
- LiveKit tokens & text streams — https://docs.livekit.io/home/server/generating-tokens/ · https://docs.livekit.io/transport/data/text-streams/
- Gemini models & rate limits — https://ai.google.dev/gemini-api/docs/models · https://ai.google.dev/gemini-api/docs/rate-limits
- ElevenLabs models & Scribe JS SDK — https://elevenlabs.io/docs/models · https://elevenlabs.io/docs/eleven-api/resources/libraries/scribe-stt/javascript-scribe/llms.txt
- Presage SmartSpectra Node.js SDK — https://github.com/Presage-Security/SmartSpectra/tree/main/nodejs
- Tiger Data continuous aggregates — https://www.tigerdata.com/docs/use-timescale/latest/continuous-aggregates/create-a-continuous-aggregate
- Claude Code project instructions (`CLAUDE.md` imports, `AGENTS.md`) — https://code.claude.com/docs/en/memory
- Chrome autoplay policy — https://developer.chrome.com/blog/autoplay
