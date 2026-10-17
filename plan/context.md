# SignLine — Product context (plan v2, sections 0–5 and 7–12)

> This file is **context**, not instructions. What to build, in what order, and whether it is done lives in
> [`plan.md`](../plan.md) (protocol + ledger) and [`plan/tasks/`](tasks/) (one card per task).
> Section 6 (the task list) moved into `plan/tasks/`. File paths in §4 are the target layout, not what exists today.

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

Superseded by the agent protocol in [`plan.md`](../plan.md). Short version for humans: tell the agent
`Follow plan.md. Run python plan/verify.py next and keep going until it says NO AGENT TASKS LEFT.`
or, for one task, `Do Task 1.B2 from plan/tasks/1.B2.md, then python plan/verify.py done 1.B2.`
One agent per track at a time; two agents editing the same file collide.

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


---

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

## 11. Self-review (xvant) — plan author's scratch verification

> **Warning for agents:** everything in this section describes a throwaway copy the plan author built on Oct 17
> to test the plan. It is **not** evidence about this repository. Test counts below (31/36/7) are not this
> repo's counts. Only the ledger in `plan.md` and `python plan/verify.py` say what is done here.

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

