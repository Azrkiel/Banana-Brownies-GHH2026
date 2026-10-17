# SignLine — Implementation Plan (Girls Hoo Hack 2026)

> Written with the **xvant-plan** method: file map first, ASCII diagrams of data / user / error flows, phases broken into small checkbox steps (test → code → pass → commit), no placeholders, then a self-review.
> "SignLine" is a working name. Rename it whenever you pick your domain.

**Goal:** In 31 hours, ship a two-laptop video call where a Deaf signer's ASL (a ~16–27 sign vocabulary + slow fingerspelling) becomes confirmed English captions and an ElevenLabs voice, and the hearing person's speech becomes captions for the signer.

**Architecture:** Everything that touches the camera runs in the signer's browser: MediaPipe landmarks → segmenter → a small classifier we train at the event → gloss chips. A thin FastAPI server (hosted on Vultr) holds every API key and does four jobs: LiveKit tokens, Gemini gloss→English, ElevenLabs TTS streaming, and logging timing/quality events to Tiger Data. LiveKit Cloud carries video, the synthesized voice track, and caption text between the two browsers.

**Tech stack:** Vite + React + TypeScript · `@mediapipe/tasks-vision@1.1.1` · `onnxruntime-web@1.30.0` · `livekit-client` · PyTorch (training only) · FastAPI + `livekit-api` + `google-genai` + `httpx` + `asyncpg` · Gemini `gemini-3.5-flash-lite` · ElevenLabs `eleven_flash_v2_5` (+ Scribe v2 Realtime later) · Tiger Data (TimescaleDB) · Vultr VM + Caddy · GoDaddy Registry domain.

**Event clock (all times EDT):** hacking started **Sat 10:00** (H0). Devpost deadline **Sun 17:00** (H31). Pitch workshop Sun 09:00–10:00. Judging + live demos **Sun 17:45–19:15**, Rice 130. Winners ~21:00. If you are starting later than H0, keep the phase *order* and use the cut list in §10.

---

## 0. Ground rules (read once, then follow)

1. **Event rules.** All project code is written during the event (this plan's code counts as event work because the clock is running). List AI tools (Claude) in the Devpost "Built with" / write-up — MLH requires it. Public GitHub repo, public demo video ≤ 3 min, code stays public after the event.
2. **Keys never touch the browser or git.** Only `server/.env` holds keys. `.env*` is in `.gitignore` from the first commit. Hackathon repos get scraped within minutes.
3. **Honest claims only.** Say "recognizes a 16-sign (later 27) vocabulary plus slow fingerspelling." Never say "translates ASL", "replaces interpreters", "gives Deaf people a voice", or quote training accuracy as real-world accuracy. Never pitch hospitals, courts, or emergencies. (§9 has the exact wording.)
4. **The signer stays in control.** Nothing is spoken until the signer approves it, unless they switch on auto-speak. A low-confidence guess is never spoken silently.
5. **Consent.** Landmarks only (no video) are recorded, only from people who said yes. Anyone outside the team signs a short consent note first. Their data does not go in the public repo.
6. **Terminology.** "Deaf", "deaf", "hard of hearing", "signer". Never "mute", "deaf-mute", or "hearing-impaired".

---

## 1. Open questions — answers change the plan

Each question has a **default** this plan uses until you answer it.

**Ask an organizer or the MLH coach today (blocking):**

| # | Question | Why it matters | Default if no answer |
|---|---|---|---|
| Q1 | May we start from a public pretrained ASL model or dataset (PopSign / Kaggle GISLR, CC BY 4.0)? | Decides whether Phase 2 can use a pretrained backbone. | Train only on data we record at the event; public data is not needed. |
| Q2 | What counts as a "beginner hacker" for Best Beginner? | Track eligibility. | Don't enter Best Beginner. |
| Q3 | How does the Live Demo Event work (stage or tables, minutes per team, sign-up)? | Demo script length, whether two laptops fit. | 3-minute table demo on two laptops. |
| Q4 | Does Best Overall count toward the 3 event tracks? Can one project win more than one event track? | Track picks. | Best Overall is automatic; pick 3 others (§8). |
| Q5 | How do we redeem the GoDaddy Registry free domain this year? | Domain + HTTPS timing. | Ask MLH coach at 12:00; fall back to `<ip>.sslip.io`. |
| Q6 | Is anyone Deaf or fluent in ASL at the event, or is there a UVA ASL club/program contact? | A Deaf tester is the single strongest credibility move. | Team learns signs from Lifeprint; one teammate owns sign accuracy. |

**Team decisions (answer in the first 30 minutes):**

| # | Question | Default |
|---|---|---|
| Q7 | How many people, and who knows Python / React / ML? Who are beginners? | 4 people, roles in §5. With 3, merge roles C and D. |
| Q8 | Which laptop is the signer machine? Does it have a decent GPU (M-series Mac or recent Windows laptop)? | Benchmark at H1 decides Hand+Pose vs Holistic. |
| Q9 | Spend up to ~$7 total? (ElevenLabs Starter $1 first month if the promo is still on, else $6; Gemini Tier-1 billing ≈ $0.20 of calls) | Yes — removes 429 risk on stage. |
| Q10 | Whose name gets fingerspelled in the demo? | Pick a name with letters outside the confusable cluster A/E/M/N/S/T (e.g. "LIV", "KOFI", "IVY"). |
| Q11 | **Your Claude Project says "wellness suite (phone app + watch data + website)" but this plan is the ASL call app.** Which are you building? | ASL call app. Don't mix them in 31 hours. |
| Q12 | Product name + domain? | "SignLine"; a `.co` or `.us` GoDaddy Registry domain. |

**Product decisions (default is the research-backed one):**

| # | Question | Default |
|---|---|---|
| Q13 | Confirm-before-speak or auto-speak by default? | Confirm by default; auto-speak toggle in settings. |
| Q14 | Do we read eyebrows/headshake for questions and negation? | Yes, as a Phase 4 feature with a manual "?" button fallback. |
| Q15 | Enter Best Female Empowerment? | Only if you have a genuine women-centered angle (e.g. a Deaf woman co-designer, or a use case you can back up). A general accessibility pitch did not win this track in 2025. |
| Q16 | Presage track? | Skip unless someone already knows Node/Electron. It has no browser SDK (6–10 h, high risk). |

---

## 2. Scope

### In (MVP — must work on stage)
- Two-person call on two laptops (LiveKit), signer video + hearing video.
- Signer: live sign chips with confidence → English preview (Gemini) → **Speak** → ElevenLabs voice inside the call + caption on both screens.
- Fingerspelling mode for names (letters you choose, debounced).
- Hearing side: speech → captions on the signer's screen (Web Speech first).
- "Signing…" indicator, "I didn't catch that" button, attention button.
- Fallbacks so the demo never goes silent: rule-based English, cached MP3s, receiver-side `speechSynthesis`.
- Evaluation numbers we actually measured (held-out-signer accuracy, latency p50/p95).

### Stretch (Phase 4, in this order)
1. Tiger Data event logging + live stats page (Tiger track, latency readout on stage).
2. Vultr deploy + GoDaddy domain (Vultr + GoDaddy tracks).
3. Eyebrow/headshake tags → question/negation (shows ASL grammar awareness).
4. Scribe v2 Realtime instead of Web Speech (robust captions, echo cancellation).
5. Per-user calibration (judge records 3 examples, k-NN adapts).
6. Tier-2 vocabulary (11 more signs).

### Out (say so in the pitch)
Continuous / fluent signing, classifiers, directional verbs, mouth morphemes, emotion from the face, fast fingerspelling, mobile, more than 2 people, medical/legal use, Presage, Solana.

### Vocabulary

**Tier 1 — record first (16 signs + idle):** `HELLO, NICE, MEET, YOU, ME, MY, NAME, WHAT, DEAF, HEARING, YES, NO, PLEASE, SLOW, AGAIN, THANK-YOU` + `_idle`.

**Tier 2 — only after Tier 1 hits target accuracy (11):** `UNDERSTAND, HELP, WHERE, WHO, HOW, LEARN, SIGN, GO, TOMORROW, STORE, BYE`.

**Letters:** only the letters in the demo name(s) plus 3–4 spares, e.g. `L I V K O F Y B C D`. Avoid the A/E/M/N/S/T cluster unless the name needs it.

**Deliberately excluded (look-alike pairs):** SORRY (vs PLEASE), GOOD (vs THANK-YOU), MOTHER/FATHER, THINK/KNOW, CHAIR (vs NAME). ME vs MY is kept — handshape features separate index vs flat hand — but watch it in the confusion matrix.

**`_idle` class:** non-sign motion that still moves your hands up: scratching your face, adjusting glasses, waving someone off, typing in the air, reaching for a cup. Record 1.5× as many as a sign.

> Person D verifies every sign against its Lifeprint or Handspeak video **before** anyone records. Everyone signs it the same way.

### Demo script (≈ 90 s, two laptops, judge plays the hearing person if willing)

| Who | Does | Screen shows |
|---|---|---|
| Hearing | Says "Hi! I'm Priya, nice to meet you." | Caption appears on the signer laptop |
| Signer | `HELLO` `NICE` `MEET` `YOU` · pause | Chips → "Hello, nice to meet you!" → Speak → voice plays on hearing laptop |
| Signer | `MY` `NAME` · spell mode `L-I-V` · pause | "My name is Liv." |
| Signer | `YOU` `NAME` `WHAT` (brows down) | "What's your name?" |
| Hearing | Answers fast and mumbled | Caption |
| Signer | `AGAIN` `PLEASE` `SLOW` | "Could you say that again, slowly please?" |
| Signer | `ME` `DEAF` · `YOU` `HEARING` (brows up) | "I'm Deaf." · "Are you hearing?" |
| Signer | `THANK-YOU` | "Thank you!" |
| Presenter | Points at the stats panel | Live p50/p95 latency from Tiger Data |

---

## 3. Diagrams

### 3.1 Data flow (happy path)

```
SIGNER BROWSER (Chrome)                          FASTAPI on Vultr (keys live here)     VENDORS
-----------------------                          ---------------------------------     -------
webcam --getUserMedia (once)--+--> LiveKit publishTrack(camera) ---------------------> LiveKit Cloud
                              |
                              +--> <video> --> MediaPipe Hand+Pose (+Face every 3rd frame)
                                                 | Frame{t, w, h, pose[17], hands[0..2][21], brow}
                                                 v
                                     mirrorFrame() if left-handed
                                                 |
                              +------------------+------------------+
                              v                                     v
                        Segmenter                                  Nmm
                  IDLE -> ACTIVE -> COOLDOWN               brow raise/furrow, headshake
                              | end(frames)                         |
                              v                                     |
                   clipFeatures -> Float32[32 x 174]                |
                              v                                     |
                   SignClassifier (ONNX CNN | kNN)                  |
                              | Pred{label, p, alts, accepted}      |
                              v                                     |
                   GlossBuffer: chips on screen                     |
                              | no new sign for 1.1 s               |
                              v                                     v
                   POST /api/gloss {signs, tags, context} --> gloss.translate() --> Gemini 3.5 Flash-Lite
                              | {english, sentence_type, confidence, uncertain}     (JSON schema)
                              v
                   Preview -> signer presses Speak (or auto-speak)
                              |
             +----------------+------------------------+
             v                                         v
   sendText(topic 'caption')               POST /api/tts --> httpx stream proxy --> ElevenLabs flash_v2_5
             |                                         | audio/mpeg
             |                                         v
             |                 <audio> -> AudioContext -> MediaStreamDestination
             |                                         | (track published once at join)
             v                                         v
   ===================== LiveKit room "demo-room" ======================
             |                                         |
             v                                         v
HEARING BROWSER: caption lane            hears the voice like a normal participant
HEARING BROWSER: mic --Web Speech (later Scribe)--> transcript --sendText('caption')--> SIGNER caption lane

BOTH BROWSERS --sendBeacon /api/events--> db.insert_events() --> Tiger Data hypertables
STATS PAGE <-- GET /api/stats (p50/p95 latency, accept rate) <-- continuous aggregates
```

### 3.2 Signer user flow (with failure branches)

```
[Open site] --> [Consent screen] --declines--> [Captions-only mode: reads hearing captions, types replies]
                     | accepts
                     v
[Setup: name, room, voice, left-handed?, auto-speak?] --voices fail to load--> [use first cached voice id]
                     |
                     v
[Join] --camera denied--> [banner: "Allow camera in the address bar", retry button]
   | --LiveKit token 5xx--> [banner: "Call server unreachable", retry; Offline mode keeps chips+captions local]
   v
[In call] --tracker FPS < 15--> [banner "Close other tabs"; drop face model]
   |
   v
[Sign] --hands out of frame--> [hint "Move back so both hands are visible"]
   |   --segment < 8 frames--> [ignored]
   |   --classifier says _idle--> [ignored, no chip]
   |   --low confidence--> ["?" chip with top-2 alternatives; tap to choose]
   v
[Chips] --pause 1.1 s--> [Preview "..."] --/api/gloss 502 or >2.5 s--> [rule-based English, marked "offline"]
   |                         |
   |                         v
   |                  [Speak? Enter / button] --Esc--> [clear]  --click chip--> [fix, re-translate]
   |                         |
   |                         v
   |                  [/api/tts] --cache hit--> [play cached MP3]
   |                         |  --fails (429/402/5xx)--> [ctrl speak-local: hearing laptop uses speechSynthesis]
   |                         v
   |                  [voice plays in call, caption sent]
   v
[Hearing pressed "?"] --> [signer screen flashes "They didn't catch that" -> repeat or fix]
[Network drops] --> ["Reconnecting..." banner -> on Reconnected resend last 3 captions]
```

### 3.3 Hearing user flow

```
[Join as hearing] --> [click Join (unlocks audio)] --audio blocked--> [banner "Click to enable audio" -> room.startAudio()]
     |
     v
[mic -> Web Speech] --unsupported browser--> [banner "Use Chrome"; type-to-caption box]
     |              --onend / no-speech--> [auto-restart if still joined]
     |              --TTS playing (ctrl tts on)--> [drop transcripts until tts off + 300 ms]
     v
[caption sent to signer]   [sees "Liv is signing..."]   [hears voice]   [presses "?" if unclear]
```

### 3.4 Segmenter state machine

```
                 hands visible AND wrist above rest line AND speed > 0.8 S/s for 3 frames
   +--------+ ------------------------------------------------------------------> +--------+
   |  IDLE  |   (keeps last 8 frames as pre-roll)                                  | ACTIVE |
   +--------+ <----+                                                               +--------+
        ^          |  t >= coolUntil                                                   |
        |     +----------+      end when ANY of:                                       |
        +-----| COOLDOWN | <----  speed < 0.4 S/s for 8 frames      -> 'still'   ------+
              |  300 ms  |        dominant wrist below rest line     -> 'lowered'
              +----------+        no hands for 10 frames             -> 'lost'
                                  longer than 3000 ms                -> 'timeout'
   emit end(frames) only if frames >= 8; classifier then decides sign vs _idle
   S = shoulder width (aspect-corrected); rest line = shoulder y + 0.8 S
```

### 3.5 Error and fallback map

```
FAILURE                         DETECTED BY                        WHAT THE USER SEES / SYSTEM DOES
------------------------------  ---------------------------------  -------------------------------------------------
Gemini 429 / 5xx / > 2.5 s      server wait_for + named excepts    502 -> client ruleBasedEnglish(), chip "offline"
ElevenLabs 429/402/5xx          /api/tts non-200 -> 429/502        cached MP3 if text matches; else speak-local on hearing side
ElevenLabs concurrency (~2)     client queue                       VoiceOut serializes; never 2 requests at once
LiveKit disconnect              RoomEvent.Reconnecting/Disconnected banner; resend last 3 captions on Reconnected
Captions lost while offline     data packets are not buffered      resend history on ParticipantConnected
TTS echo into hearing STT       ctrl {type:'tts', on}              hearing STT ignores transcripts; headphones on stage
Autoplay blocked                AudioContext 'suspended'           Join button resumes it; "Enable audio" banner
No camera / denied              getUserMedia rejects               banner + retry; captions-only mode
Hands out of frame              wrist x/y near 0 or 1              "Move back" hint
Low light / closed fist misses  hands.length == 0 while signing    tracking-quality dot turns amber
Model file missing / wrong F    loadOnnx() meta check throws       automatic switch to kNN classifier
Venue Wi-Fi down                fetch errors everywhere            phone hotspot; recorded backup video
API key leaked                  -                                  keys only in server/.env; rotate if pushed
DB down / not configured        asyncpg error                      /api/events still 204; stats page "no data"
```

### 3.6 Deployment

```
            GoDaddy Registry domain (e.g. signline.co)
                 |  A @   -> VULTR_IP
                 |  A www -> VULTR_IP
                 v
   +--------------------- Vultr VM (Ubuntu 24.04) ---------------------+
   |  Caddy :443 (auto HTTPS)                                          |
   |    /api/*  -> reverse_proxy 127.0.0.1:8000 (flush_interval -1)    |
   |    /*      -> /srv/signline/web/dist (SPA, models, tts-cache)     |
   |  systemd: uvicorn app.main:app --port 8000                        |
   +-------------------------------------------------------------------+
        |                |                 |                 |
   LiveKit Cloud     Gemini API       ElevenLabs        Tiger Cloud (Postgres, sslmode=require)

Local dev: web = `npm run dev` (localhost:5173, proxies /api -> localhost:8000); server = uvicorn on :8000.
Second laptop in dev: its own `npm run dev` with VITE_API_PROXY=http://<laptop-A-LAN-IP>:8000.
```

---

## 4. File map

```
signline/
  .gitignore                      .env*, node_modules, .venv, data/, __pycache__, web/dist
  README.md                       what it is, how to run, credits (datasets, AI tools, ElevenLabs)
  docs/plans/2026-10-17-signline-plan.md   this file
  web/                            Vite + React + TS (person A, B)
    vite.config.ts                dev proxy /api -> :8000, vitest config
    public/
      mediapipe/wasm/             copied from node_modules (offline-safe)
      models/                     hand_landmarker.task, pose_landmarker_lite.task, face_landmarker.task,
                                  sign.onnx, sign_meta.json, knn.f32, knn.json, letters.f32, letters.json
      ort/                        onnxruntime-web wasm files (offline-safe)
      tts-cache/                  index.json + demo-sentence MP3s
    scripts/build-dataset.ts      raw sessions -> features (X.f32, meta.json) + kNN/letter templates
    src/
      vocab.ts                    sign lists, letters, IDLE, WH set (single source of truth)
      config.ts                   PAUSE_MS, USE_FACE, DEV flag
      lib/types.ts                Pt, Frame, Clip, Session, Caption, Ctrl, Role
      lib/landmarks.ts            createTracker(): MediaPipe init + detect(video, t) -> Frame
      lib/features.ts             anchors, orderHands, mirrorFrame, frameFeatures, resample, clipFeatures
      lib/segmenter.ts            Segmenter state machine
      lib/classifier.ts           Pred/Alt types, softmax, decide() (pure, unit-tested)
      lib/onnx.ts                 loadOnnx(): onnxruntime-web session for the trained CNN
      lib/knn.ts                  Knn classifier (baseline + per-user calibration)
      lib/letters.ts              letterFeatures, LetterKnn, LetterDecoder
      lib/nmm.ts                  headshake(), Nmm (brows + headshake -> tags)
      lib/gloss.ts                GlossBuffer, ruleBasedEnglish
      lib/api.ts                  typed fetch wrappers for /api/*
      lib/call.ts                 joinCall(): LiveKit connect/publish/captions/ctrl
      lib/voice.ts                VoiceOut: TTS queue -> WebAudio -> LiveKit track, cache, fallback
      lib/stt.ts                  startWebSpeech(), startScribe()
      lib/metrics.ts              logSign/logUtterance -> sendBeacon('/api/events')
      lib/signerPipeline.ts       per-frame loop for the signer
      pages/Bench.tsx             FPS + live readouts for tuning thresholds
      pages/Recorder.tsx          data collection (signs + letters)
      pages/Call.tsx              the app
      pages/Stats.tsx             Tiger Data dashboard
      components/CaptionLane.tsx, Chips.tsx, Consent.tsx
      App.tsx                     hash routes: #/ (call), #/record, #/bench, #/stats
    src/**/*.test.ts              vitest unit tests next to each lib file
  ml/                             person B
    requirements.txt              torch, numpy, onnx, onnxruntime, scikit-learn, matplotlib
    train.py                      LOSO eval, temperature + threshold fit, ONNX export
    eval_report.py                confusion matrix, per-class F1, coverage curve, metrics.json
  server/                         person C
    requirements.txt
    .env.example
    app/__init__.py
    app/main.py                   routes: health, token, gloss, tts, voices, scribe-token, events, stats
    app/gloss.py                  Gemini prompt + schema + translate()
    app/db.py                     asyncpg pool, insert_events(), stats()
    sql/schema.sql                hypertables + continuous aggregates
    scripts/eval_gloss.py         latency + output check over 12 test glosses
    scripts/cache_tts.py          pre-generate demo MP3s into web/public/tts-cache
    tests/test_api.py, tests/test_gloss.py
    deploy/Caddyfile, deploy/signline.service
  data/                           NOT in git: raw/ (session JSON), processed/ (X.f32, meta.json)
```

---

## 5. Roles, tracks and timeline

| Person | Owns | Good fit for |
|---|---|---|
| **A — Call & UI** | `call.ts`, `voice.ts`, `stt.ts`, `Call.tsx`, captions, banners | React/TS experience |
| **B — ML** | `landmarks.ts`, `features.ts`, `segmenter.ts`, `letters.ts`, Recorder, Bench, `ml/` | Python + some TS |
| **C — Backend & sponsors** | `server/`, Gemini prompt, Vultr, domain, Tiger Data, `Stats.tsx` | Python; a confident beginner can do this |
| **D — Product, ASL & pitch** | vocab verification, consent, recording sessions, demo script, Devpost, video, slides, Deaf outreach, testing | Beginner-friendly and critical |

```
Sat 10 ---- 12 -------------- 17 ---------------- 23 ------ Sun 02 ..sleep.. 07 ------------- 13 ----- 14:30 ---- 17:00
    | P0 Setup | P1 Foundations | P2 Recognize+Voice | P3 Golden |  (stagger,   | P4 Harden +   | P5 Freeze, rehearse,
    |  H0-H2   |   H2-H7        |   H7-H13           |  path     |   >=4 h each)|  sponsors     |  video, Devpost
    |          | A call+captions| A voice track, STT |  H13-H16  |              |  H21-H27      |  H27-H31
    |          | B tracker+rec  | B train + segment  |  2-laptop |              |  09:00 one    |  freeze 14:30
    |          | C api+deploy   | C gloss+tts tuned  |  e2e run  |              |  person at    |  submit by 16:30
    |          | D vocab+record | D record+script    |  commit   |              |  pitch class  |
```

**Checkpoints (stop and check together):**
- **CP1 — Sat 17:00:** two laptops in a LiveKit call with typed captions; Recorder saves clips; `/api/gloss` and `/api/tts` work from curl.
- **CP2 — Sat 23:00:** Tier-1 signs recognized live with kNN or CNN; Speak plays the voice in the call.
- **CP3 — Sun 02:00 ("golden path"):** the full demo script works end to end once. Tag the commit `golden-path`. Everything after this is optional and must not break it.
- **CP4 — Sun 13:00:** deployed URL works on both laptops; backup video recorded.

---

## 6. Phases and tasks

Conventions: `[A]`…`[D]` = owner. Each code task follows **test → see it fail → code → see it pass → commit**. Commands assume macOS/Linux or Git Bash on Windows. Commit after every green step: `git add -A && git commit -m "<what>"`.

### Phase 0 — Setup (Sat 10:00–12:00, H0–H2)

#### Task 0.1 [C] Accounts and keys (≈ 45 min, do in parallel tabs)
- [ ] **LiveKit Cloud** (free Build plan, no card): create project → Settings → Keys → copy `LIVEKIT_URL` (`wss://…livekit.cloud`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
- [ ] **Google AI Studio**: create a new Google Cloud project just for this → create `GEMINI_API_KEY` → open aistudio.google.com/rate-limit and screenshot the limits for `gemini-3.5-flash-lite`. Limits are per *project*, so a second key in the same project does not help. Optional (Q9): link billing for Tier 1; claim MLH's $10/month Google credit from the MLH Gemini page.
- [ ] **ElevenLabs**: each teammate makes a free account for development (10k credits each). Keep one "demo" account untouched until rehearsal. Copy `ELEVENLABS_API_KEY` from the demo account. If you stay on the free plan, any public video using the voice needs "elevenlabs.io" in its title.
- [ ] **Tiger Data**: sign up through the MLH quickstart link (30-day $1,000 trial, no card) → create a service → copy the connection string as `DATABASE_URL` (keep `?sslmode=require`).
- [ ] **Vultr**: sign up with the MLH promo code ($100 credit) → deploy *now* an Ubuntu 24.04 Cloud Compute instance (1 vCPU / 1–2 GB, region New Jersey or Atlanta) so any deposit or verification surprise shows up early. Note `VULTR_IP`.
- [ ] **GitHub**: one public repo `signline`, everyone added.
- [ ] Put all keys in a shared password manager or a private message to C. Not in Slack/Discord channels, not in the repo.

#### Task 0.2 [D] Organizer questions (≈ 15 min)
- [ ] Ask Q1–Q6 from §1 at the organizer desk or in Discord. Write the answers at the top of this file under §1.

#### Task 0.3 [D] Lock the vocabulary (≈ 45 min)
- [ ] For each Tier-1 sign and each letter, open its Lifeprint (lifeprint.com) or Handspeak page, watch the video, and write a one-line description in `web/src/vocab.ts` comments (Task 0.4 creates the file).
- [ ] Pick the demo name (Q10) and the letter list.
- [ ] Teach the whole team the 16 signs together for 10 minutes so everyone records the same form.

#### Task 0.4 [A] Repo scaffold (≈ 30 min)
- [ ] Run:
```bash
git clone https://github.com/<your-org>/signline && cd signline
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
Expected: three `.task` files, each larger than 1 MB. (Files are copied locally so the demo does not depend on a CDN.)
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
- [ ] In `web/package.json` → `"scripts"`, add `"test": "vitest run"` and `"dataset": "tsx scripts/build-dataset.ts"`.
- [ ] In `web/src/main.tsx`, remove the `<StrictMode>` wrapper (render `<App />` directly). In development StrictMode runs every effect twice, which opens the camera twice and leaks a second MediaPipe tracker.
- [ ] Keep the template's TypeScript settings (`erasableSyntaxOnly`, `noUnusedLocals`). All code in this plan type-checks under them; that is why classes declare their fields explicitly instead of using `constructor(private x)`.
- [ ] Create `web/src/vocab.ts`:
```ts
// Single source of truth for labels. Person D: add a one-line form description per sign (Lifeprint/Handspeak).
export const IDLE = '_idle';
export const SIGNS_TIER1 = [
  'HELLO', 'NICE', 'MEET', 'YOU', 'ME', 'MY', 'NAME', 'WHAT',
  'DEAF', 'HEARING', 'YES', 'NO', 'PLEASE', 'SLOW', 'AGAIN', 'THANK-YOU',
] as const;
export const SIGNS_TIER2 = ['UNDERSTAND', 'HELP', 'WHERE', 'WHO', 'HOW', 'LEARN', 'SIGN', 'GO', 'TOMORROW', 'STORE', 'BYE'] as const;
export const LETTERS = ['L', 'I', 'V', 'K', 'O', 'F', 'Y', 'B', 'C', 'D'] as const; // demo-name letters + spares
export const WH_SIGNS = new Set(['WHAT', 'WHERE', 'WHO', 'HOW']);
export const RECORD_LABELS = [...SIGNS_TIER1, IDLE] as string[]; // add ...SIGNS_TIER2 when Tier 1 is solid
```
- [ ] `npm run dev` → open http://localhost:5173 → Vite page loads. Commit: `scaffold web`.

#### Task 0.5 [C] Server scaffold (≈ 20 min)
- [ ] Run:
```bash
mkdir -p server/app server/tests server/sql server/scripts server/deploy && cd server
python3 -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install fastapi "uvicorn[standard]" httpx livekit-api google-genai asyncpg python-dotenv pytest pyjwt
pip freeze > requirements.txt
touch app/__init__.py
```
- [ ] Create `server/.env.example` (copy to `server/.env` and fill in real values; `.env` is ignored by git):
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

### Phase 1 — Foundations (Sat 12:00–17:00, H2–H7)

Four tracks run in parallel. Shared contract first.

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
export type Session = { version: 1; signer: string; leftHanded: boolean; recordedAt: string; clips: Clip[] };
export type Role = 'signer' | 'hearing';
export type Caption = {
  id: string; speaker: string; role: Role;
  kind: 'english' | 'speech'; text: string; final: boolean; ts: number;
};
export type Ctrl =
  | { type: 'signing'; on: boolean }
  | { type: 'tts'; on: boolean }
  | { type: 'clarify' }
  | { type: 'attention' }
  | { type: 'speak-local'; text: string };
```
- [ ] Commit: `shared types`.

#### Track C — Backend (C)

##### Task 1.C1 Health + LiveKit token (≈ 40 min)
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
- [ ] Run `cd server && pytest -q` → expected: errors, `ModuleNotFoundError: No module named 'app.main'`.
- [ ] Create `server/app/gloss.py` (full file; Task 1.C2 tests it):
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
- ME = I/me. MY = my. YOU = you. A token like fs-LIV is a fingerspelled name: write it in Title Case ("Liv").
- A WH-sign (WHAT, WHERE, WHO, HOW) at the end makes a question: YOU NAME WHAT = "What's your name?"
- Tag Q-YN = raised eyebrows = yes/no question. Tag Q-WH = WH-question. Tag NEG = headshake = negate the main verb.
- If a low-confidence sign has an alternative that fits the sentence much better, you may use the alternative. Put every English word you are unsure about in "uncertain".
- Never add facts, names, places, feelings, or intensity that the signs do not contain. Prefer a short sentence over a guess.
- A single greeting stays short: HELLO = "Hello!", THANK-YOU = "Thank you!"
- confidence = your 0-1 estimate that the English says what the signer meant.

Examples:
HELLO NICE MEET YOU -> {"english":"Hello, nice to meet you!","sentence_type":"statement","confidence":0.95,"uncertain":[]}
MY NAME fs-LIV -> {"english":"My name is Liv.","sentence_type":"statement","confidence":0.95,"uncertain":[]}
YOU NAME WHAT [Q-WH] -> {"english":"What's your name?","sentence_type":"wh_question","confidence":0.95,"uncertain":[]}
YOU HEARING [Q-YN] -> {"english":"Are you hearing?","sentence_type":"yes_no_question","confidence":0.9,"uncertain":[]}
ME DEAF -> {"english":"I'm Deaf.","sentence_type":"statement","confidence":0.95,"uncertain":[]}
AGAIN PLEASE SLOW -> {"english":"Could you say that again, slowly please?","sentence_type":"yes_no_question","confidence":0.85,"uncertain":[]}
TOMORROW ME GO STORE -> {"english":"I'm going to the store tomorrow.","sentence_type":"statement","confidence":0.9,"uncertain":[]}
ME UNDERSTAND [NEG] -> {"english":"I don't understand.","sentence_type":"statement","confidence":0.9,"uncertain":[]}"""

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
> `gemini-3.5-flash-lite` already defaults to minimal thinking, so no thinking config is set. Old tutorials using `gemini-2.0-flash` will fail: that model is shut down.
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
- [ ] Run `pytest -q` → expected `6 passed`.
- [ ] Run the server: `uvicorn app.main:app --reload --port 8000`, then in another terminal:
```bash
curl -s localhost:8000/api/health
curl -s -X POST localhost:8000/api/token -H 'content-type: application/json' -d '{"room":"demo-room","name":"Liv","role":"signer"}' | head -c 120
```
Expected: health shows `"LIVEKIT_URL":true …`; token response starts with `{"token":"eyJ`.
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
- [ ] `pytest -q` → passes (render already exists; if it fails, fix render, not the test).
- [ ] Create `server/scripts/eval_gloss.py`:
```python
"""Run 12 glosses through Gemini; print English + latency. Usage: PYTHONPATH=. python scripts/eval_gloss.py"""
import asyncio
import time

from dotenv import load_dotenv

load_dotenv()
from app.gloss import GlossRequest, translate  # noqa: E402

CASES = [
    (["HELLO", "NICE", "MEET", "YOU"], []), (["MY", "NAME", "fs-LIV"], []),
    (["YOU", "NAME", "WHAT"], ["Q-WH"]), (["YOU", "HEARING"], ["Q-YN"]), (["ME", "DEAF"], []),
    (["AGAIN", "PLEASE", "SLOW"], []), (["THANK-YOU"], []), (["TOMORROW", "ME", "GO", "STORE"], []),
    (["ME", "UNDERSTAND"], ["NEG"]), (["WHERE", "YOU", "LEARN", "SIGN"], ["Q-WH"]),
    (["HELP", "PLEASE"], []), (["YES"], []),
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
- [ ] Run `PYTHONPATH=. python scripts/eval_gloss.py`. Expected: 12 sensible sentences, p50 under ~1000 ms. If any output adds content that isn't in the signs, add that case as another example line in `SYSTEM` and rerun. Save the printout; the p50 goes on the metrics slide.
- [ ] If you get `429` / `RESOURCE_EXHAUSTED`: check AI Studio limits; turn on Tier-1 billing (Q9). If you get `404 model not found`: confirm the model string at ai.google.dev/gemini-api/docs/models and update `GEMINI_MODEL` in `.env`.
- [ ] Commit: `gloss prompt + eval`.

##### Task 1.C3 TTS check (≈ 20 min)
- [ ] With the server running:
```bash
curl -s localhost:8000/api/voices | python3 -m json.tool | head -20
VOICE=$(curl -s localhost:8000/api/voices | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
time curl -s -X POST localhost:8000/api/tts -H 'content-type: application/json' \
  -d "{\"text\":\"Hello, nice to meet you!\",\"voice_id\":\"$VOICE\"}" -o /tmp/hello.mp3
ls -la /tmp/hello.mp3
```
Expected: a list of voices; an MP3 of roughly 20–40 KB in well under 2 s. Play it.
- [ ] D picks 4–6 voices for the picker with the signers (Q13: the Deaf user chooses their voice).
- [ ] Commit nothing new (no code). Write the chosen voice IDs in `README.md`.

##### Task 1.C4 Early Vultr deploy of the skeleton (≈ 60 min, de-risks Sunday)
- [ ] SSH in (`ssh root@VULTR_IP`) and run:
```bash
apt update && apt install -y python3-venv git caddy ufw
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
mkdir -p /srv/signline && cd /srv/signline
git clone https://github.com/<your-org>/signline.git repo
cd repo/server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
nano .env      # paste the same keys as your local server/.env
```
- [ ] Create `server/deploy/signline.service` in the repo (commit it) and install it:
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
- [ ] Create `server/deploy/Caddyfile` in the repo. Until the domain exists, use the free `sslip.io` hostname for your IP (dots in the IP become dashes, e.g. `149-28-1-2.sslip.io`):
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
`flush_interval -1` lets the TTS audio stream through without buffering. Then:
```bash
mkdir -p /srv/signline/web
cp /srv/signline/repo/server/deploy/Caddyfile /etc/caddy/Caddyfile && systemctl reload caddy
curl -s https://149-28-1-2.sslip.io/api/health
```
Expected: `{"ok":true,…}` over HTTPS (Caddy fetches the certificate automatically; the first request can take ~20 s).
- [ ] Commit: `deploy files`.

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
- [ ] Apply it: `psql "$DATABASE_URL" -f sql/schema.sql` (or paste into the Tiger Cloud SQL editor). Expected: `CREATE TABLE` ×2, `CREATE MATERIALIZED VIEW`, `ALTER MATERIALIZED VIEW`, one row with a job id.
- [ ] If `WITH (tsdb.hypertable …)` errors with "unrecognized parameter", your TimescaleDB is older: remove those two `WITH (...)` clauses, rerun, then run `SELECT create_hypertable('sign_events', 'ts'); SELECT create_hypertable('utterance_events', 'ts');`.
- [ ] Put `DATABASE_URL` in local and Vultr `.env`, restart, and check `curl -s localhost:8000/api/stats` → `{"configured":true,"summary":{"utterances":0,…}`.
- [ ] Commit: `tiger data schema`.

#### Track A — Call skeleton (A)

##### Task 1.A1 API client + LiveKit call module (≈ 60 min)
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
          <b>{c.speaker}:</b> {c.text}
        </p>
      ))}
    </div>
  );
}
```
- [ ] Create a first `web/src/pages/Call.tsx` (Phase 3 replaces it with the full version) that proves video + captions between two laptops:
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
- [ ] Create `web/src/App.tsx` (routes are filled in as pages appear):
```tsx
import { useEffect, useState, type ReactElement } from 'react';
import Call from './pages/Call';

const routes: Record<string, () => ReactElement> = { '': () => <Call /> };

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
- [ ] Add to `web/src/index.css`: `.mirror{transform:scaleX(-1)} .lane{font-size:1.4rem;max-width:40rem} .cap.interim{opacity:.55} .cap.mine{color:#2563eb}` (mirror only the local preview, never the published track).
- [ ] Test on two laptops: laptop A runs server + `npm run dev`; laptop B runs `VITE_API_PROXY=http://<laptop-A-LAN-IP>:8000 npm run dev`. Both open `http://localhost:5173`, join `demo-room`. Expected: each sees the other's video; typed captions appear on both. (Laptop A's server must listen on the LAN: `uvicorn app.main:app --host 0.0.0.0 --port 8000`.)
- [ ] Commit: `call skeleton with captions`.

#### Track B — Landmarks and data (B)

##### Task 1.B1 Tracker + benchmark (≈ 60 min) — decides Hand+Pose vs Holistic
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
- [ ] Create `web/src/pages/Bench.tsx` (FPS + live readouts; Task 2.B5 adds segmenter and classifier readouts, Task 4.3 adds eyebrow readouts):
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
- [ ] Add the route in `App.tsx`: `import Bench from './pages/Bench';` and `'bench': () => <Bench />`.
- [ ] Open `http://localhost:5173/#/bench` **on the signer laptop**, plugged in, other tabs closed. Expected: FPS ≥ 20 with the face model on. Record the number in README.
  - FPS ≥ 20 with face → keep Hand+Pose+Face (this plan's default).
  - FPS 12–20 → uncheck face (eyebrow tags become the manual "?" button only).
  - FPS < 12 → lower capture to 480×360 in every `getUserMedia` call; if still < 12, use the other laptop as signer.
- [ ] Hold up only your **right** hand and confirm `hands 1`; then both hands → `hands 2`. (We never use MediaPipe's left/right label; `orderHands` in 1.B2 decides.)
- [ ] Commit: `tracker + bench`.

##### Task 1.B2 Features (≈ 60 min, TDD)
- [ ] Write the failing test `web/src/lib/features.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { clipFeatures, FEAT_PER_FRAME, frameFeatures, anchors, mirrorFrame, orderHands, resample, T } from './features';
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
- [ ] `npm test` → expected: fails, `Cannot find module './features'`.
- [ ] Create `web/src/lib/features.ts`:
```ts
import type { Frame, Pt } from './types';

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

/** Dominant hand first. After mirrorFrame() for left-handed signers, the signer's dominant hand is image-left. */
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

/** Frames must already be mirrored for left-handed signers. Returns Float32Array(T * FEAT_PER_FRAME). */
export function clipFeatures(frames: Frame[]): Float32Array {
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
- [ ] `npm test` → expected: `7 passed`.
- [ ] Commit: `landmark features`.

##### Task 1.B3 Segmenter (≈ 60 min, TDD)
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
  it('can start again after cooldown', () => {
    const ev = run(new Segmenter(), [...moving(15), ...still(30), ...moving(15), ...still(30)]);
    expect(ev.filter((e) => e.kind === 'end')).toHaveLength(2);
  });
});
```
- [ ] `npm test` → fails (`Cannot find module './segmenter'`).
- [ ] Create `web/src/lib/segmenter.ts`:
```ts
import { anchors, orderHands, type Anchors } from './features';
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

export class Segmenter {
  state: 'IDLE' | 'ACTIVE' | 'COOLDOWN' = 'IDLE';
  speed = 0;
  anchors: Anchors | null = null;
  private ring: Frame[] = [];
  private buf: Frame[] = [];
  private prev: { t: number; pts: [number, number][] } | null = null;
  private fast = 0; private slow = 0; private lost = 0;
  private startT = 0; private coolUntil = 0;

  private cfg: SegConfig;
  constructor(cfg: SegConfig = DEFAULT_SEG) { this.cfg = cfg; } // explicit field: Vite's template forbids parameter properties (erasableSyntaxOnly)

  push(f: Frame): SegEvent | null {
    this.anchors = anchors(f, this.anchors);
    const a = this.anchors;
    const [dom] = orderHands(f.hands);
    this.updateSpeed(f, dom, a);
    const high = !!(dom && a && dom[0].y < a.restY);

    if (this.state === 'COOLDOWN') {
      if (f.t < this.coolUntil) return null;
      this.state = 'IDLE';
    }
    if (this.state === 'IDLE') {
      this.ring.push(f);
      if (this.ring.length > this.cfg.preroll) this.ring.shift();
      this.fast = dom && high && this.speed > this.cfg.onSpeed ? this.fast + 1 : 0;
      if (this.fast < this.cfg.onFrames) return null;
      this.state = 'ACTIVE';
      this.buf = [...this.ring];
      this.startT = f.t; this.slow = 0; this.lost = 0;
      return { kind: 'start', t: f.t };
    }

    // ACTIVE
    this.buf.push(f);
    this.lost = dom ? 0 : this.lost + 1;
    this.slow = this.speed < this.cfg.onSpeed * this.cfg.offRatio ? this.slow + 1 : 0;
    const reason: SegReason | null =
      this.lost >= this.cfg.lostFrames ? 'lost'
      : dom && a && !high ? 'lowered'
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

  private updateSpeed(f: Frame, dom: Frame['hands'][number] | null, a: Anchors | null) {
    if (!dom || !a) { this.prev = null; this.speed *= 1 - this.cfg.alpha; return; }
    const asp = f.w / f.h;
    const pts = TRACKED.map((i) => [dom[i].x * asp, dom[i].y] as [number, number]);
    if (this.prev && f.t > this.prev.t) {
      const dt = (f.t - this.prev.t) / 1000;
      const d = pts.reduce((sum, p, i) => sum + Math.hypot(p[0] - this.prev!.pts[i][0], p[1] - this.prev!.pts[i][1]), 0) / pts.length;
      const inst = d / a.s / dt;
      this.speed = this.cfg.alpha * inst + (1 - this.cfg.alpha) * this.speed;
    }
    this.prev = { t: f.t, pts };
  }
}
```
- [ ] `npm test` → expected: all segmenter tests pass. If "still" ends too early or late in real use, tune `onSpeed`/`offFrames` on the Bench page (Task 2.B5), **not** in the tests.
- [ ] Commit: `segmenter`.

##### Task 1.B4 Recorder page (≈ 75 min)
- [ ] Create `web/src/pages/Recorder.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { createTracker, type Tracker } from '../lib/landmarks';
import { mirrorFrame } from '../lib/features';
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
  const [leftHanded, setLeftHanded] = useState(false);
  const [kind, setKind] = useState<ClipKind>('sign');
  const [label, setLabel] = useState(RECORD_LABELS[0]);
  const [armed, setArmed] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [msg, setMsg] = useState('');
  const letterBuf = useRef<Frame[] | null>(null);
  const state = useRef({ armed, kind, label, leftHanded });
  state.current = { armed, kind, label, leftHanded };

  useEffect(() => {
    let raf = 0; let stop = false;
    (async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 } });
      video.current!.srcObject = stream; await video.current!.play();
      tracker.current = await createTracker({ withFace: false });
      const loop = () => {
        if (stop) return;
        const raw = tracker.current!.detect(video.current!, performance.now());
        const f = state.current.leftHanded ? mirrorFrame(raw) : raw;
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
  const labels = kind === 'sign' ? RECORD_LABELS : (LETTERS as readonly string[]);
  const session = (): Session => ({ version: 1, signer, leftHanded, recordedAt: new Date().toISOString(), clips });

  return (
    <main>
      <p><b>Consent:</b> we store hand/body landmark coordinates only (no video). Data is used to train this project's model and is not published.</p>
      <input placeholder="signer id (e.g. liv)" value={signer} onChange={(e) => setSigner(e.target.value.toLowerCase())} />
      <label><input type="checkbox" checked={leftHanded} onChange={(e) => setLeftHanded(e.target.checked)} /> I sign left-handed</label>
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
- [ ] Add route `'record': () => <Recorder />` in `App.tsx`.
- [ ] Try it: Start recording `HELLO`, sign HELLO, drop your hands, repeat 3×. Expected: the count goes up by one per repetition. Download → a JSON file under ~100 KB per clip.
- [ ] Commit: `recorder`.

#### Track D — Recording sessions (D leads, everyone records) — start ≈ 14:30

##### Task 1.D1 Record Tier-1 data (≈ 20 min per person, on their own laptop)
- [ ] Protocol per person, on `#/record`:
  - For each Tier-1 sign: **10 reps** — 5 close (elbows visible), 5 farther (waist visible); half with a window/light in front, half with it to the side; drop hands to your lap between reps.
  - `_idle`: **15 reps** of scratching your face, adjusting glasses, waving someone off, typing in the air, reaching for a cup, a half-started sign.
  - Letters (spell mode): each letter **3 holds**, tilting the wrist slightly between holds.
  - Download every ~50 clips (a refresh loses unsaved clips).
- [ ] Put all session files in a shared folder (Google Drive), then into everyone's local `data/raw/` (git-ignored).
- [ ] Target by 17:00: ≥ 3 signers × Tier 1 complete. If a Deaf or fluent signer joins (Q6), they sign a consent note, and their session is the most valuable one — prioritize it.
- [ ] D, in parallel: write the consent note (`docs/consent.md`), the demo script card, and start the Devpost draft (title, one-liner, team background — "Learning" is a judging criterion, so write what each person knew before and learned).

**▶ CP1 — Sat 17:00:** two-laptop call with typed captions · Recorder working · `/api/gloss` and `/api/tts` work with curl · Vultr serves `/api/health` over HTTPS · ≥ 3 signers recorded.

---

### Phase 2 — Recognize and speak (Sat 17:00–23:00, H7–H13)

Person A builds the whole signer/hearing UI against a **gloss simulator** (type `HELLO NICE MEET YOU` instead of signing), so the voice, captions and Gemini flow are finished before the recognizer is. Person B makes recognition real. Phase 3 plugs one into the other.

#### Track B — Recognition (B)

##### Task 2.B1 Classifier plumbing: `decide`, ONNX loader, kNN (≈ 45 min, TDD)
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
- [ ] `npm test` → fails (`Cannot find module './classifier'`).
- [ ] Create `web/src/lib/classifier.ts` (pure logic, no ONNX import, so unit tests run in Node):
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
- [ ] `npm test` → all green. Commit: `classifier + knn`.

##### Task 2.B2 Letters: features, kNN, debounced decoder (≈ 60 min, TDD)
- [ ] Write the failing test `web/src/lib/letters.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { LETTER_F, LetterDecoder, letterFeatures } from './letters';
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
import type { Pt } from './types';

export const LETTER_F = 48;
export const NONE = '_none';

/** Handshape of one hand, invariant to position, size and in-plane rotation. Mirror the frame first for left-handed signers. */
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
- [ ] `npm test` → all green. Commit: `fingerspelling letters`.

##### Task 2.B3 Dataset builder (≈ 45 min)
- [ ] Create `web/scripts/build-dataset.ts`:
```ts
/* Usage (from web/): npm run dataset -- ../data/raw ../data/processed
   Reads recorder sessions; writes training tensors + browser kNN/letter templates. */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clipFeatures, FEAT_PER_FRAME, orderHands, T } from '../src/lib/features';
import { LETTER_F, letterFeatures } from '../src/lib/letters';
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
  const [dom] = orderHands(f.hands);
  if (dom && j % 3 === 0) L.push({ label: c.label, x: letterFeatures(dom, f.w / f.h) });
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
- [ ] Run `npm run dataset -- ../data/raw ../data/processed`. Expected: a summary with every Tier-1 label at ≥ 30 clips, ≥ 3 signers, and letter counts. Files appear in `data/processed/` and `web/public/models/`.
- [ ] Commit (the script and the small template files in `public/models` are fine to commit; raw data is not): `dataset builder`.

##### Task 2.B4 Train, evaluate, export (≈ 60 min)
- [ ] Create `ml/requirements.txt` and install into a venv (`python3 -m venv .venv && source .venv/bin/activate && pip install -r ml/requirements.txt`):
```
torch
numpy
onnx
onnxscript
onnxruntime
scikit-learn
matplotlib
```
- [ ] Create `ml/train.py`:
```python
"""Train the sign classifier on features built by web/scripts/build-dataset.ts.
Usage (repo root): python ml/train.py --data data/processed --out web/public/models --epochs 60
Prints leave-one-signer-out accuracy, fits temperature + accept threshold, exports sign.onnx + sign_meta.json."""
import argparse
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

PAIRS = 86  # each frame = 86 (x, y) pairs + 2 presence flags = 174


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
    """Online augmentation on features: rotation, temporal crop, second-hand dropout, jitter."""
    B, T, _ = x.shape
    ang = (torch.rand(B, 1, 1) * 2 - 1) * math.radians(15)
    xy = x[..., :PAIRS * 2].reshape(B, T, PAIRS, 2)
    c, s = torch.cos(ang), torch.sin(ang)
    rot = torch.stack([xy[..., 0] * c - xy[..., 1] * s, xy[..., 0] * s + xy[..., 1] * c], dim=-1)
    x = torch.cat([rot.reshape(B, T, PAIRS * 2), x[..., PAIRS * 2:]], dim=-1)
    out = torch.empty_like(x)
    cut = max(1, int(0.15 * T))
    for i in range(B):
        a = int(torch.randint(0, cut + 1, ()))
        b = T - int(torch.randint(0, cut + 1, ()))
        out[i] = F.interpolate(x[i, a:b].T.unsqueeze(0), size=T, mode="linear", align_corners=True)[0].T
    drop = (torch.rand(B, T, 1) < 0.1).float()
    out[..., 84:168] *= 1 - drop          # non-dominant hand flickers out
    out[..., 173:174] *= 1 - drop         # ...and its presence flag
    noise = torch.randn_like(out) * 0.02
    noise[..., -2:] = 0
    return out + noise * (out != 0)


def train(Xtr, ytr, n_classes, epochs, Xva=None, yva=None, seed=0):
    torch.manual_seed(seed)
    model = SignCNN(Xtr.shape[2], n_classes)
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-2)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs)
    Xt, yt = torch.from_numpy(Xtr), torch.from_numpy(ytr)
    best = (-1.0, None, epochs)
    for ep in range(epochs):
        model.train()
        perm = torch.randperm(len(Xt))
        for i in range(0, len(Xt), 64):
            idx = perm[i:i + 64]
            loss = F.cross_entropy(model(augment(Xt[idx])), yt[idx], label_smoothing=0.1)
            opt.zero_grad()
            loss.backward()
            opt.step()
        sched.step()
        if Xva is not None:
            model.eval()
            with torch.no_grad():
                logits = model(torch.from_numpy(Xva)).numpy()
            acc = float((logits.argmax(1) == yva).mean())
            if acc > best[0]:
                best = (acc, logits, ep + 1)
    return model, best


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/processed")
    ap.add_argument("--out", default="web/public/models")
    ap.add_argument("--epochs", type=int, default=60)
    args = ap.parse_args()
    data, out, work = Path(args.data), Path(args.out), Path("ml/out")
    work.mkdir(parents=True, exist_ok=True)

    meta = json.loads((data / "meta.json").read_text())
    n, T, Fd, labels = meta["n"], meta["T"], meta["F"], meta["labels"]
    X = np.fromfile(data / "X.f32", dtype="<f4").reshape(n, T, Fd)
    y = np.array(meta["y"], dtype=np.int64)
    groups = np.array(meta["signers"])
    C, idle = len(labels), labels.index("_idle")

    oof = np.zeros((n, C), np.float32)
    mask = np.zeros(n, bool)
    folds, best_epochs = [], []
    signers = sorted(set(groups))
    if len(signers) >= 2:
        splits = [(s, groups == s) for s in signers]
    else:
        print("WARNING: one signer only -> random 20% split. This accuracy is signer-DEPENDENT and optimistic.")
        splits = [("random-20%", np.random.default_rng(0).random(n) < 0.2)]
    for name, va in splits:
        _, (acc, logits, ep) = train(X[~va], y[~va], C, args.epochs, X[va], y[va])
        oof[va], mask[va] = logits, True
        best_epochs.append(ep)
        folds.append({"held_out": name, "n": int(va.sum()), "acc": acc, "best_epoch": ep})
        print(f"held-out {name:>12}: acc {acc:.3f}  n={va.sum():4d}  best epoch {ep}")
    mean_acc = float(np.mean([f["acc"] for f in folds]))
    print(f"mean held-out-signer accuracy: {mean_acc:.3f}")

    temp = fit_temperature(oof[mask], y[mask])
    z = oof[mask] / temp
    probs = np.exp(z - z.max(1, keepdims=True))
    probs /= probs.sum(1, keepdims=True)
    tau, coverage = choose_tau(probs, y[mask], idle)
    print(f"temperature {temp:.2f}  tau {tau}  coverage {coverage:.2f}")
    np.savez(work / "oof.npz", labels=np.array(labels), y=y, logits=oof, mask=mask, temperature=temp)

    final_epochs = max(20, int(np.median(best_epochs)))
    model, _ = train(X, y, C, final_epochs)
    model.eval()
    onnx_path = out / "sign.onnx"
    torch.onnx.export(model, torch.zeros(1, T, Fd), onnx_path, input_names=["x"], output_names=["logits"])
    # Recent PyTorch writes weights to sign.onnx.data; the browser loads one file, so inline them.
    onnx.save_model(onnx.load(str(onnx_path)), str(onnx_path), save_as_external_data=False)
    onnx_path.with_name(onnx_path.name + ".data").unlink(missing_ok=True)

    sess = ort.InferenceSession(str(onnx_path))
    with torch.no_grad():
        ref = model(torch.from_numpy(X[:1])).numpy()
    got = sess.run(["logits"], {"x": X[:1]})[0]
    diff = float(np.abs(ref - got).max())
    assert diff < 1e-3, f"ONNX output differs from PyTorch by {diff}"
    print(f"exported {onnx_path} (max |torch - onnx| = {diff:.2e})")

    version = time.strftime("cnn-%m%d-%H%M")
    (out / "sign_meta.json").write_text(json.dumps({
        "labels": labels, "T": T, "F": Fd, "temperature": temp, "tau": tau, "margin": 0.2,
        "version": version, "heldout_signer_accuracy": mean_acc, "folds": folds}, indent=2))
    print(f"wrote sign_meta.json ({version})")


if __name__ == "__main__":
    main()
```
- [ ] Run `python ml/train.py`. Expected (on a laptop CPU, ~1,000 clips): a few minutes; one line per held-out signer, a mean, temperature/tau, then `exported web/public/models/sign.onnx (max |torch - onnx| = …e-06)`. Warnings about torchvision ops are harmless. Only `sign.onnx` and `sign_meta.json` should be in `web/public/models` (no `sign.onnx.data`).
- [ ] **Target for Tier 1:** mean held-out-signer accuracy ≥ 0.75. Below that, open the confusion matrix (next step) before recording more: usually one or two pairs cause most errors (ME/MY, NAME/NICE). Fix by re-recording those signs more distinctly or dropping one from the demo.
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
- [ ] Run `python ml/eval_report.py` → three PNGs + `metrics.json` in `ml/out/`. Send the confusion matrix to the team chat.
- [ ] Commit `ml/` code and `web/public/models/sign.onnx` + `sign_meta.json` (small files): `trained model v1`.

##### Task 2.B5 Tune live on the Bench page (≈ 30 min)
- [ ] Extend `Bench.tsx`'s loop to show the segmenter and classifier live. Add near the other refs, and inside `loop()` after `detect`:
```tsx
// imports to add:
import { clipFeatures } from '../lib/features';
import { Segmenter } from '../lib/segmenter';
import type { SignClassifier } from '../lib/classifier';
import { loadOnnx } from '../lib/onnx';
import { Knn } from '../lib/knn';
// inside the async IIFE, after createTracker:
const seg = new Segmenter();
const model: SignClassifier = await loadOnnx().catch(() => Knn.load());
let last = '';
// inside loop(), after `const f = tracker.detect(...)`:
const ev = seg.push(f);
if (ev?.kind === 'end') void model.predict(clipFeatures(ev.frames)).then((p) => {
  last = `${p.label} ${(p.p * 100).toFixed(0)}% ${p.accepted ? '✓' : '✗'} (${ev.reason}, ${ev.frames.length} frames, ${p.ms.toFixed(1)} ms, ${p.source})`;
});
// and append to the setInfo string:  ` · ${seg.state} speed ${seg.speed.toFixed(2)} · ${last}`
```
- [ ] Sign each Tier-1 sign 3×. If signs get cut off early → raise `offFrames` to 10. If idle fidgets start segments → raise `onSpeed` to 1.0. Change only `DEFAULT_SEG` values, rerun `npm test` (the tests use the defaults; keep them passing), then **re-record nothing** — clips were cut with the old settings, so if you change `onSpeed`/`offFrames` by a lot, rebuild the dataset only after recording new clips with the new settings.
- [ ] Commit: `bench live readout + tuned segmenter`.

#### Track A — Voice, captions, full call screen (A)

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
- [ ] Create `server/scripts/cache_tts.py` (pre-generates the demo sentences; the strings **must** equal the rule-based outputs in Task 2.C1 and your demo name):
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
SENTENCES = [
    "Hello!", "Hello, nice to meet you!", "Nice to meet you!", "My name is Liv.", "What's your name?",
    "I'm Deaf.", "Are you hearing?", "Are you Deaf?", "Could you say that again, slowly please?",
    "Slower, please.", "Thank you!", "Yes.", "No.",
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
- [ ] Run it once for the demo voice → `web/public/tts-cache/` has 13 MP3s + `index.json`. Commit: `voice out + tts cache`.

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
        <li>The recognized signs (words like HELLO) go to Google Gemini to become an English sentence. On the free tier Google may use them to improve its products.</li>
        <li>Nothing is spoken until you press Speak (unless you turn on auto-speak). The sentence goes to ElevenLabs to become a voice.</li>
        <li>We log timing numbers and recognized words, never video or audio, to measure speed and accuracy.</li>
        <li>This is a student prototype for casual conversation. It knows a small vocabulary and makes mistakes. Don't use it for medical, legal, or emergency conversations.</li>
      </ul>
      <button onClick={onAccept}>I understand — continue</button>
    </section>
  );
}
```
- [ ] `npm run build` → compiles with no type errors (after Task 2.C1 adds `gloss.ts`; do 2.C1 first if `Chips.tsx` complains). Commit: `stt, metrics, chips, consent`.

##### Task 2.A3 The full call screen with a gloss simulator (≈ 2 h)
- [ ] Create `web/src/config.ts`:
```ts
export const PAUSE_MS = 1100;   // no new sign for this long -> sentence is done
export const USE_FACE = true;   // set from the Bench benchmark (Task 1.B1)
export const DEV = new URLSearchParams(location.search).has('dev'); // ?dev shows the gloss simulator
```
- [ ] Replace `web/src/pages/Call.tsx` with the full screen:
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
import { DEV, PAUSE_MS } from '../config';
import { WH_SIGNS } from '../vocab';
import type { Caption, Ctrl, Role } from '../lib/types';

type Preview = {
  tokens: Token[]; tags: Tag[]; english: string; source: 'gemini' | 'rules';
  result: GlossResult | null; waitMs: number; glossMs: number; edited: boolean;
};
type Form = { room: string; name: string; role: Role; voiceId: string; leftHanded: boolean; autoSpeak: boolean };

const readConsent = () => { try { return localStorage.getItem('consent') === '1'; } catch { return false; } };
const saveConsent = () => { try { localStorage.setItem('consent', '1'); } catch { /* private window */ } };

export default function Call() {
  const [consented, setConsented] = useState(readConsent);
  const [form, setForm] = useState<Form>({ room: 'demo-room', name: '', role: 'signer', voiceId: '', leftHanded: false, autoSpeak: false });
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState<CallStatus | 'idle'>('idle');
  const [banner, setBanner] = useState('');
  const [flash, setFlash] = useState('');
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [chips, setChips] = useState<Token[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [question, setQuestion] = useState(false); // manual yes/no-question toggle (fallback for eyebrow reading)
  const [peer, setPeer] = useState<string | null>(null);
  const [peerSigning, setPeerSigning] = useState(false);
  const [hud, setHud] = useState('');
  const [sim, setSim] = useState('');

  const local = useRef<HTMLVideoElement>(null);
  const remote = useRef<HTMLVideoElement>(null);
  const call = useRef<CallT | null>(null);
  const voice = useRef<VoiceOut | null>(null);
  const stt = useRef<Stt | null>(null);
  const buf = useRef(new GlossBuffer());
  const idle = useRef(true);                         // Phase 3: the recognizer updates this
  const tagsFor = useRef<(sinceT: number, hasWh: boolean) => Tag[]>(() => []); // Phase 4: eyebrows/headshake
  const ttsUntil = useRef(0);
  const sttId = useRef(crypto.randomUUID());
  const translating = useRef(false);
  const formRef = useRef(form); formRef.current = form;
  const previewRef = useRef(preview); previewRef.current = preview;
  const captionsRef = useRef(captions); captionsRef.current = captions;
  const questionRef = useRef(question); questionRef.current = question;

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

  // Keyboard: Enter = speak preview, Escape = discard preview.
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

  function caption(c: Pick<Caption, 'id' | 'kind' | 'text' | 'final'>) {
    const f = formRef.current;
    const full: Caption = { ...c, speaker: f.name, role: f.role, ts: Date.now() };
    setCaptions((l) => upsertCaption(l, full));
    void call.current?.sendCaption(full);
  }

  function resendRecent() {
    const mine = captionsRef.current.filter((c) => c.speaker === formRef.current.name && c.final).slice(-3);
    mine.forEach((c) => void call.current?.sendCaption(c));
  }

  function onCtrl(m: Ctrl) {
    if (m.type === 'signing') setPeerSigning(m.on);
    if (m.type === 'tts') ttsUntil.current = m.on ? Number.POSITIVE_INFINITY : performance.now() + 300;
    if (m.type === 'clarify') showFlash("They didn't catch that — repeat it or fix a word.");
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
      // Phase 3 (Task 3.2) adds: if (f.role === 'signer') await startSigner();
    } catch (e) {
      setBanner(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'Camera blocked — allow it in the address bar, then press Join again.'
        : `Could not join: ${(e as Error).message}`);
    }
  }

  function addToken(tok: Token) { buf.current.add(tok); setChips([...buf.current.tokens]); }

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
    setPreview(p);
    const sure = tokens.every((t) => t.accepted) && !!p.result && p.result.confidence >= 0.7 && p.result.uncertain.length === 0;
    if (formRef.current.autoSpeak && sure) speak(p);
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

  function speak(p: Preview) {
    const f = formRef.current;
    setPreview(null);
    caption({ id: crypto.randomUUID(), kind: 'english', text: p.english, final: true });
    void call.current?.sendCtrl({ type: 'tts', on: true });
    void voice.current?.speak(p.english, f.voiceId, {
      onStart: (ttfb) => {
        logUtterance({
          n_signs: p.tokens.length, gloss_seq: p.tokens.map((t) => t.gloss).join(' '), english: p.english,
          sentence_type: p.result?.sentence_type ?? 'statement', source: p.source, edited: p.edited,
          gloss_ms: p.glossMs, tts_ttfb_ms: ttfb, end_to_end_ms: p.waitMs + p.glossMs + ttfb, // machine time, excludes the human confirm
        });
        setHud(`pause ${p.waitMs.toFixed(0)} · gloss ${p.glossMs.toFixed(0)} · voice ${ttfb.toFixed(0)} ms · ${p.source}`);
      },
      onEnd: () => void call.current?.sendCtrl({ type: 'tts', on: false }),
      onFail: () => {
        void call.current?.sendCtrl({ type: 'speak-local', text: p.english });
        void call.current?.sendCtrl({ type: 'tts', on: false });
        setBanner('Voice service failed — their laptop is reading it with the backup voice.');
      },
    });
  }

  function simulate() { // ?dev only: type glosses instead of signing
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
            <>
              <select value={form.voiceId} onChange={(e) => setForm({ ...form, voiceId: e.target.value })}>
                {voices.map((v) => <option key={v.id} value={v.id}>{v.name} {Object.values(v.labels).slice(0, 2).join(' · ')}</option>)}
              </select>
              <label><input type="checkbox" checked={form.leftHanded} onChange={(e) => setForm({ ...form, leftHanded: e.target.checked })} /> I sign left-handed</label>
              <label><input type="checkbox" checked={form.autoSpeak} onChange={(e) => setForm({ ...form, autoSpeak: e.target.checked })} /> Speak automatically when sure</label>
            </>
          )}
          <button onClick={join} disabled={!form.name}>Join</button>
        </section>
      )}

      <section className="stage">
        <div className="tile">
          <video ref={remote} autoPlay playsInline />
          {peerSigning && <span className="badge">{peer ?? 'They'} is signing…</span>}
          <span className="name">{peer ?? 'Waiting for the other person…'}</span>
        </div>
        <div className="tile self">
          <video ref={local} autoPlay muted playsInline className="mirror" />
          {isSigner && <Chips tokens={chips} onChoose={(id, g) => { buf.current.choose(id, g); setChips([...buf.current.tokens]); }} onRemove={(id) => { buf.current.remove(id); setChips([...buf.current.tokens]); }} />}
        </div>
      </section>

      {isSigner && preview && (
        <section className={`preview ${preview.source}`}>
          <Chips tokens={preview.tokens} onChoose={editPreview} onRemove={removeFromPreview} />
          <p className="english">{preview.english}{preview.source === 'rules' && <small> (offline translation)</small>}</p>
          <button onClick={() => speak(preview)}>Speak (Enter)</button>
          <button onClick={() => setPreview(null)}>Clear (Esc)</button>
        </section>
      )}

      <CaptionLane captions={captions} me={form.name} />

      {joined && (
        <section className="actions">
          {isSigner && <button aria-pressed={question} onClick={() => setQuestion(!question)}>? question</button>}
          {!isSigner && <button onClick={() => call.current?.sendCtrl({ type: 'clarify' })}>I didn't catch that</button>}
          <button onClick={() => call.current?.sendCtrl({ type: 'attention' })}>Get attention</button>
          {DEV && isSigner && <input placeholder="simulate: HELLO NICE MEET YOU" value={sim} onChange={(e) => setSim(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && simulate()} />}
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
.name { position: absolute; bottom: .5rem; left: .5rem; color: #fff; text-shadow: 0 0 4px #000; }
.chips { display: flex; flex-wrap: wrap; gap: .4rem; margin: .5rem 0; }
.chip { border-radius: 999px; padding: .2rem .4rem; background: #dcfce7; } .chip.unsure { background: #fef3c7; }
.chip button { border: 0; background: transparent; font-weight: 600; cursor: pointer; } .chip .alt { font-weight: 400; text-decoration: underline; }
.preview { border: 2px solid #2563eb; border-radius: 12px; padding: .75rem; } .preview.rules { border-color: #f59e0b; }
.english { font-size: 1.6rem; margin: .4rem 0; }
.lane { font-size: 1.5rem; } .hud { color: #6b7280; margin-left: 1rem; }
```
- [ ] Two-laptop test with `?dev` on the signer: `http://localhost:5173/?dev`. Type `HELLO NICE MEET YOU` → Enter. Expected within ~2 s: preview "Hello, nice to meet you!" → press Enter → the hearing laptop **hears** the voice and sees the caption; the signer HUD shows timings. Then the hearing person talks → captions appear on the signer laptop; the signer's voice does not come back as a caption (headphones on the hearing laptop).
- [ ] Stop the server for a moment and repeat → preview shows "(offline translation)" from the rule-based fallback.
- [ ] Commit: `full call screen with simulator`.

#### Track C/D — Rule-based fallback (D writes cases, C reviews)

##### Task 2.C1 Gloss buffer + rule-based English (≈ 40 min, TDD — a good beginner task)
- [ ] Write the failing test `web/src/lib/gloss.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { GlossBuffer, ruleBasedEnglish } from './gloss';

describe('ruleBasedEnglish', () => {
  it('handles the demo script', () => {
    expect(ruleBasedEnglish(['HELLO', 'NICE', 'MEET', 'YOU', 'MY', 'NAME', 'fs-LIV'])).toBe('Hello, nice to meet you! My name is Liv.');
    expect(ruleBasedEnglish(['YOU', 'NAME', 'WHAT'])).toBe("What's your name?");
    expect(ruleBasedEnglish(['YOU', 'HEARING'], ['Q-YN'])).toBe('Are you hearing?');
    expect(ruleBasedEnglish(['ME', 'DEAF'])).toBe("I'm Deaf.");
    expect(ruleBasedEnglish(['AGAIN', 'PLEASE', 'SLOW'])).toBe('Could you say that again, slowly please?');
    expect(ruleBasedEnglish(['THANK-YOU'])).toBe('Thank you!');
  });
  it('uses the negation tag', () => {
    expect(ruleBasedEnglish(['ME', 'UNDERSTAND'], ['NEG'])).toBe("I don't understand.");
  });
  it('falls back to word-by-word with sensible punctuation', () => {
    expect(ruleBasedEnglish(['TOMORROW', 'ME', 'GO', 'STORE'])).toBe('Tomorrow I go store.');
    expect(ruleBasedEnglish(['STORE', 'WHERE'])).toBe('Store where?');
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
  { seq: ['HELLO', 'NICE', 'MEET', 'YOU'], out: () => 'Hello, nice to meet you!' },
  { seq: ['NICE', 'MEET', 'YOU'], out: () => 'Nice to meet you!' },
  { seq: ['MY', 'NAME', FS], out: ([n]) => `My name is ${n}.` },
  { seq: ['ME', 'NAME', FS], out: ([n]) => `My name is ${n}.` },
  { seq: ['YOU', 'NAME', 'WHAT'], out: () => "What's your name?" },
  { seq: ['ME', 'DEAF'], out: () => "I'm Deaf." },
  { seq: ['ME', 'HEARING'], out: () => "I'm hearing." },
  { seq: ['YOU', 'DEAF'], out: () => 'Are you Deaf?' },
  { seq: ['YOU', 'HEARING'], out: () => 'Are you hearing?' },
  { seq: ['ME', 'UNDERSTAND'], out: (_, t) => (t.includes('NEG') ? "I don't understand." : 'I understand.') },
  { seq: ['AGAIN', 'PLEASE', 'SLOW'], out: () => 'Could you say that again, slowly please?' },
  { seq: ['PLEASE', 'SLOW'], out: () => 'Slower, please.' },
  { seq: ['THANK-YOU'], out: () => 'Thank you!' },
  { seq: ['HELLO'], out: () => 'Hello!' },
  { seq: ['YES'], out: () => 'Yes.' },
  { seq: ['NO'], out: () => 'No.' },
];
const PATTERNS = [...RAW_PATTERNS].sort((a, b) => b.seq.length - a.seq.length); // longest match wins

const WORDS: Record<string, string> = { ME: 'I', MY: 'my', YOU: 'you', 'THANK-YOU': 'thank you' };
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
- [ ] `npm test` → all green. Commit: `gloss buffer + offline English`.

#### Track D (evening)
- [ ] Record Tier 1 with any new signers; if B's held-out accuracy is ≥ 0.75, start Tier 2 (10 reps each, 3+ signers).
- [ ] Rehearse the demo script with the simulator (`?dev`) so the talk track is ready before recognition is.
- [ ] Devpost draft: Inspiration, What it does, How we built it (diagram 3.1), Challenges, Accomplishments, What we learned (per person), What's next, Built with.

**▶ CP2 — Sat 23:00:** CNN (or kNN) recognizes Tier 1 live on the Bench page · simulator drives the whole call: preview → Speak → voice in the call → captions both ways · held-out-signer accuracy and Gemini p50 written in README.

---

### Phase 3 — Golden path (Sat 23:00 – Sun 02:00, H13–H16)

##### Task 3.1 [B] Signer pipeline (≈ 60 min)
- [ ] Create `web/src/lib/signerPipeline.ts`:
```ts
import { anchors, clipFeatures, mirrorFrame, orderHands, type Anchors } from './features';
import { Segmenter } from './segmenter';
import { LetterDecoder, letterFeatures, NONE, type LetterKnn } from './letters';
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
  onFrame?(f: Frame, a: Anchors | null, idle: boolean): void; // Phase 4: eyebrow/headshake reader
};

export type PipelineOptions = {
  video: HTMLVideoElement; tracker: Tracker; model: SignClassifier; letters: LetterKnn | null;
  leftHanded: boolean; ev: PipelineEvents;
};

/** Runs every animation frame on the signer's laptop: landmarks -> segment -> classify, or spell mode. */
export class SignerPipeline {
  readonly seg = new Segmenter();
  readonly decoder = new LetterDecoder();
  spelling = false;
  spelled = '';
  private raf = 0;
  private a: Anchors | null = null;
  private prevWrist: { t: number; x: number; y: number } | null = null;
  private count = 0; private countT = performance.now();

  private o: PipelineOptions;
  constructor(o: PipelineOptions) { this.o = o; }

  get idle() { return this.seg.state !== 'ACTIVE'; }
  start() { const loop = () => { this.tick(); this.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
  stop() { cancelAnimationFrame(this.raf); this.o.tracker.close(); }
  setSpelling(on: boolean) { this.spelling = on; this.spelled = ''; this.decoder.reset(); this.o.ev.onLetters(''); }
  backspace() { this.spelled = this.spelled.slice(0, -1); this.o.ev.onLetters(this.spelled); }

  private tick() {
    const v = this.o.video;
    if (v.readyState < 2) return;
    const raw = this.o.tracker.detect(v, performance.now());
    const f = this.o.leftHanded ? mirrorFrame(raw) : raw;
    this.a = anchors(f, this.a);
    this.track(f);
    if (this.spelling) { this.spell(f); this.o.ev.onFrame?.(f, this.a, true); return; }
    const ev = this.seg.push(f);
    this.o.ev.onFrame?.(f, this.a, this.idle);
    if (ev?.kind === 'start') this.o.ev.onSigning(true);
    if (ev?.kind === 'end') { this.o.ev.onSigning(false); void this.classify(ev.frames, ev.t); }
  }

  private async classify(frames: Frame[], tEnd: number) {
    const p = await this.o.model.predict(clipFeatures(frames));
    logSign({ gloss: p.label, confidence: p.p, accepted: p.accepted, alt1: p.alts[0]?.label, alt1_p: p.alts[0]?.p, classify_ms: p.ms });
    if (p.label !== IDLE) this.o.ev.onPred(p, tEnd);
  }

  private spell(f: Frame) {
    const [dom] = orderHands(f.hands);
    if (!dom || !this.o.letters || !this.a) { this.prevWrist = null; this.decoder.push({ [NONE]: 1 }, 0); return; }
    const asp = f.w / f.h;
    const w = { t: f.t, x: dom[0].x * asp, y: dom[0].y };
    const speed = this.prevWrist && f.t > this.prevWrist.t
      ? Math.hypot(w.x - this.prevWrist.x, w.y - this.prevWrist.y) / this.a.s / ((f.t - this.prevWrist.t) / 1000) : 0;
    this.prevWrist = w;
    const ch = this.decoder.push(this.o.letters.probs(letterFeatures(dom, asp)), speed);
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
- [ ] `npm run build` → no type errors. Commit: `signer pipeline`.

##### Task 3.2 [A+B] Plug the recognizer into the call screen (≈ 45 min)
- [ ] In `Call.tsx`, add imports:
```tsx
import { createTracker } from '../lib/landmarks';
import { loadOnnx } from '../lib/onnx';
import { Knn } from '../lib/knn';
import { LetterKnn } from '../lib/letters';
import { SignerPipeline } from '../lib/signerPipeline';
import { setModelVersion } from '../lib/metrics';
import { USE_FACE } from '../config';
```
- [ ] Add state/refs next to the others:
```tsx
const pipe = useRef<SignerPipeline | null>(null);
const [spelled, setSpelled] = useState<string | null>(null); // null = not in spell mode
const [tracking, setTracking] = useState({ fps: 0, hands: 0, edge: false });
```
- [ ] Add this function inside the component:
```tsx
async function startSigner() {
  const [tracker, model, letters] = await Promise.all([
    createTracker({ withFace: USE_FACE }),
    loadOnnx().catch(() => Knn.load()),      // trained CNN if present, else kNN templates
    LetterKnn.load().catch(() => null),
  ]);
  setModelVersion(model.version);
  pipe.current = new SignerPipeline({
    video: local.current!, tracker, model, letters, leftHanded: formRef.current.leftHanded,
    ev: {
      onSigning: (on) => { idle.current = !on; void call.current?.sendCtrl({ type: 'signing', on }); },
      onPred: (p, tEnd) => addToken({ id: crypto.randomUUID(), gloss: p.label, p: p.p, alts: p.alts, accepted: p.accepted, t: tEnd }),
      onLetters: (s) => setSpelled(s),
      onTracking: setTracking,
    },
  });
  pipe.current.start();
}
function finishSpelling() {
  const name = pipe.current?.spelled ?? '';
  pipe.current?.setSpelling(false);
  setSpelled(null);
  if (name) addToken({ id: crypto.randomUUID(), gloss: `fs-${name}`, p: 1, alts: [], accepted: true, t: performance.now() });
}
```
- [ ] In `join()`, replace the comment line `// Phase 3 (Task 3.2) adds: …` with:
```tsx
if (f.role === 'signer') await startSigner();
```
- [ ] In the `actions` section, add the spell controls and the tracking dot (signer only):
```tsx
{isSigner && (spelled === null
  ? <button onClick={() => { pipe.current?.setSpelling(true); setSpelled(''); }}>Spell a name</button>
  : <span className="spell">Spelling: <b>{spelled || '…'}</b>
      <button onClick={() => pipe.current?.backspace()}>⌫</button>
      <button onClick={finishSpelling}>Done</button></span>)}
{isSigner && <span className={`dot ${tracking.edge ? 'warn' : tracking.hands ? 'ok' : 'off'}`}
  title={`${tracking.fps} fps`}>{tracking.edge ? 'Move back so both hands are visible' : `${tracking.fps} fps`}</span>}
```
and CSS: `.dot.ok{color:#16a34a}.dot.warn{color:#d97706}.dot.off{color:#9ca3af}`.
- [ ] Also stop the pipeline when leaving: in the component, `useEffect(() => () => pipe.current?.stop(), []);`.
- [ ] Commit: `recognizer wired into call`.

##### Task 3.3 [All] Golden path run on two laptops (≈ 60 min)
- [ ] Signer laptop: `http://localhost:5173` (no `?dev`), hearing laptop with headphones. Run the full demo script from §2 **three times**.
- [ ] For each run, write down: signs that failed, any wrong English, the HUD timings. Expected: ≥ 2 of 3 runs complete without the simulator; machine latency (pause + gloss + voice) ≲ 2.5 s.
- [ ] Fix only what broke the script (most common: segment thresholds, one confusable sign, spelling speed). No new features tonight.
- [ ] `git tag golden-path && git push --tags`.

**▶ CP3 — Sun 02:00:** full demo script works end to end. **Sleep in shifts (≥ 4 h each).** Whoever is up last pushes everything.

---

### Phase 4 — Harden and add sponsor depth (Sun 07:00–13:00, H21–H27)

Rule for this phase: **every change is tested against the golden-path script before it is merged.** If something breaks the script and isn't fixed in 30 minutes, revert it.

##### Task 4.1 [C] Deploy the web app to Vultr + GoDaddy Registry domain (≈ 60 min)
- [ ] Redeem the domain (MLH coach / Q5). Pick a short name on a GoDaddy Registry TLD (`.co`, `.us`, `.study`, `.design`…). Note: `.tech` is a different sponsor's prize.
- [ ] DNS at the registrar: `A @ → VULTR_IP`, `A www → VULTR_IP`. Check with `dig +short signline.co` (expect `VULTR_IP`; can take 5–30 min).
- [ ] Edit `server/deploy/Caddyfile`: replace the first line `149-28-1-2.sslip.io {` with `signline.co, www.signline.co {` (your domain). Commit, then on the VM: `cd /srv/signline/repo && git pull && cp server/deploy/Caddyfile /etc/caddy/Caddyfile && systemctl reload caddy && systemctl restart signline`.
- [ ] Build and upload the web app from a laptop:
```bash
cd web && npm run build
scp -r dist/* root@VULTR_IP:/srv/signline/web/
```
- [ ] Open `https://signline.co` on both laptops → consent → join → run the golden path once over the deployed site. Expected: identical behavior to localhost.
- [ ] If Vultr or DNS fails at any point today, the demo runs from laptop A's local server exactly as in Phase 3. Nothing on stage depends on the domain.
- [ ] Commit: `deploy on vultr + domain`.

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
- [ ] Route `'stats': () => <Stats />` in `App.tsx`; CSS: `.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}.kpis b{font-size:2rem;display:block}`.
- [ ] Run the golden path twice, open `#/stats`. Expected: non-zero sentences, p50/p95 numbers, a line, and a weakest-signs table. If `trend` is empty but `summary` works, run `CALL refresh_continuous_aggregate('latency_1m', NULL, NULL);` once in the SQL editor.
- [ ] Commit: `tiger data stats page`.

##### Task 4.3 [B] Eyebrows and headshake → question/negation tags (≈ 60 min, TDD)
- [ ] Write the failing test `web/src/lib/nmm.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { headshake } from './nmm';

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
```
- [ ] `npm test` → fails. Create `web/src/lib/nmm.ts`:
```ts
import type { Anchors } from './features';
import type { Tag } from './gloss';
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

export type NmmCfg = { raise: number; furrow: number };
export const DEFAULT_NMM: NmmCfg = { raise: 0.15, furrow: 0.15 };

/** Non-manual markers: raised brows -> yes/no question, lowered brows -> WH-question, headshake -> negation. */
export class Nmm {
  private hist: { t: number; nose: number; raise: number | null; furrow: number | null }[] = [];
  private base = { raise: 0, furrow: 0 };
  private baseN = 0;
  private cfg: NmmCfg;
  constructor(cfg: NmmCfg = DEFAULT_NMM) { this.cfg = cfg; }

  push(f: Frame, a: Anchors | null, idle: boolean) {
    if (!a) return;
    this.hist.push({ t: f.t, nose: (a.nose[0] - a.c[0]) / a.s, raise: f.brow?.raise ?? null, furrow: f.brow?.furrow ?? null });
    while (this.hist.length && f.t - this.hist[0].t > 8000) this.hist.shift();
    if (idle && f.brow && f.hands.length === 0) { // neutral face while hands are down = this person's baseline
      const k = Math.min(this.baseN++, 300);
      this.base.raise = (this.base.raise * k + f.brow.raise) / (k + 1);
      this.base.furrow = (this.base.furrow * k + f.brow.furrow) / (k + 1);
    }
  }

  /** Brow deltas right now, for the Bench readout. */
  delta(): { raise: number; furrow: number } {
    const last = [...this.hist].reverse().find((h) => h.raise !== null);
    return last ? { raise: last.raise! - this.base.raise, furrow: last.furrow! - this.base.furrow } : { raise: 0, furrow: 0 };
  }

  tags(sinceT: number, hasWh: boolean): Tag[] {
    const win = this.hist.filter((h) => h.t >= sinceT);
    const tags: Tag[] = [];
    const brows = win.filter((h) => h.raise !== null);
    const raise = brows.length >= 5 ? mean(brows.map((h) => h.raise!)) - this.base.raise : 0;
    const furrow = brows.length >= 5 ? mean(brows.map((h) => h.furrow!)) - this.base.furrow : 0;
    if (hasWh || furrow > this.cfg.furrow) tags.push('Q-WH');
    else if (raise > this.cfg.raise) tags.push('Q-YN');
    const end = win.at(-1)?.t ?? 0;
    if (headshake(win.filter((h) => h.t >= end - 1500).map((h) => h.nose))) tags.push('NEG');
    return tags;
  }
}
```
- [ ] `npm test` → green.
- [ ] Wire it in `Call.tsx` → `startSigner()`: add `const nmm = new Nmm();` before `new SignerPipeline(...)`, add `onFrame: (f, a, isIdle) => nmm.push(f, a, isIdle),` to `ev`, and after the pipeline is created: `tagsFor.current = (since, hasWh) => nmm.tags(since, hasWh);` (import `Nmm` from `../lib/nmm`).
- [ ] Tune on Bench: add `nmm.push(f, seg.anchors, seg.state !== 'ACTIVE')` and show `nmm.delta()` in the readout. Each signer: neutral face 5 s, then raised brows, then lowered brows. Set `DEFAULT_NMM` between the neutral and raised values. If it is unreliable for anyone, keep the manual "? question" button as the primary path and say so in the pitch.
- [ ] Golden path: `YOU HEARING` with raised brows → "Are you hearing?"; `ME UNDERSTAND` + headshake → "I don't understand." (record UNDERSTAND first if it is still Tier 2).
- [ ] Commit: `eyebrow + headshake tags`.

##### Task 4.4 [A] Robust captions with ElevenLabs Scribe (≈ 45 min)
- [ ] `cd web && npm install @elevenlabs/client@^1.28.0` (the code below type-checks against 1.28.0; if a newer major renames things, compare with the Scribe JS SDK page in §12).
- [ ] Append to `web/src/lib/stt.ts`:
```ts
import { getScribeToken } from './api';

/** ElevenLabs Scribe v2 Realtime: works in any modern browser, echo cancellation on, key stays on the server. */
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
(Move the `import` line to the top of the file.)
- [ ] In `Call.tsx`, replace the body of `startListening()` with:
```tsx
const onText = (text: string, final: boolean) => {
  if (!text || performance.now() < ttsUntil.current) return;
  caption({ id: sttId.current, kind: 'speech', text, final });
  if (final) sttId.current = crypto.randomUUID();
};
startScribe(onText, setBanner)
  .then((s) => { stt.current = s; })
  .catch(() => { stt.current = startWebSpeech(onText, setBanner); }); // token or network failure -> Chrome recognizer
```
(import `startScribe` alongside `startWebSpeech`).
- [ ] Test: hearing laptop speaks → interim gray captions, then final. Kill the server's ElevenLabs key temporarily → falls back to Web Speech with no banner spam.
- [ ] Commit: `scribe captions with fallback`.

##### Task 4.5 [B] Per-user calibration — "teach it your sign" (optional, ≈ 40 min)
- [ ] In `signerPipeline.ts`, add a public field and method, and divert segments while calibrating:
```ts
calibrate: ((x: Float32Array) => void) | null = null;
setModel(m: SignClassifier) { this.o.model = m; }
// first lines of classify():
const x = clipFeatures(frames);
if (this.calibrate) { this.calibrate(x); return; }
const p = await this.o.model.predict(x);   // replaces the old predict line
```
- [ ] In `Call.tsx`:
```tsx
const calib = useRef<Knn | null>(null);
async function teach(label: string) {
  calib.current ??= await Knn.load();
  let n = 0;
  setBanner(`Sign ${label} 3 times, lowering your hands between each.`);
  pipe.current!.calibrate = (x) => {
    calib.current!.add(label, x); calib.current!.add(label, x); // weight the user's own examples double
    n++;
    setBanner(`${label}: ${n}/3`);
    if (n === 3) { pipe.current!.calibrate = null; pipe.current!.setModel(calib.current!); setBanner(`Learned your ${label}.`); }
  };
}
```
plus a `<select>` of `SIGNS_TIER1` and a "Teach" button in the signer actions.
- [ ] Demo use: if a judge wants to try, they teach HELLO and THANK-YOU (≈ 30 s), then sign them.
- [ ] Commit: `per-user calibration`.

##### Task 4.6 [D] Pitch workshop + slides (09:00–10:00 workshop, then ≈ 90 min)
- [ ] One person attends the 09:00 "How to Pitch Your Project" workshop and brings back notes.
- [ ] Slides (6 max): problem in one human sentence · live demo · how it works (diagram 3.1) · what we measured (confusion matrix, coverage curve, latency p50/p95 from Stats) · what it can't do (limitations, §9) · what's next + team learning.
- [ ] B runs `python ml/eval_report.py` on the final model and hands D the PNGs + `metrics.json`.

##### Task 4.7 [All] Failure drills (≈ 45 min, 11:30–12:15)
Run each, confirm the expected behavior from diagram 3.5, fix what doesn't match:
- [ ] Stop the API server → preview shows "(offline translation)"; Speak → hearing laptop reads it aloud with the backup voice.
- [ ] Set `GEMINI_MODEL=wrong` and restart → same offline path, no crash.
- [ ] Turn Wi-Fi off on the hearing laptop for 10 s → "Reconnecting…" → recovers; last captions resent.
- [ ] Deny the camera → clear banner; allow → join works.
- [ ] Signer at the edge of frame → amber "Move back" hint.
- [ ] Hearing headphones unplugged during a spoken sentence → no echo captions appear (ttsUntil gating).
- [ ] Both laptops on a phone hotspot → full golden path works.
- [ ] Hard refresh during a call → rejoin works; consent remembered.

##### Task 4.8 [B] Tier 2 retrain (optional, only if Tier 1 ≥ 0.75 and ≥ 3 signers recorded Tier 2)
- [ ] Add `...SIGNS_TIER2` to `RECORD_LABELS`, rebuild the dataset, retrain, re-run eval. Ship it **only if** Tier-1 per-class F1 does not drop by more than 0.05; otherwise keep the Tier-1 model for the demo and mention Tier 2 as "trained, not yet reliable".

**▶ CP4 — Sun 13:00:** deployed URL works on both laptops (or local fallback is rehearsed) · stats page shows real numbers · failure drills pass · slides drafted.

---

### Phase 5 — Freeze, rehearse, submit (Sun 13:00–17:00, H27–H31)

- [ ] **13:00–13:30 [D+A] Record the backup video** (≤ 3 min): the golden path on two laptops, screen + room audio, a 20-second "how it works", limitations. Upload to YouTube (public). If you are on ElevenLabs' free plan, put "elevenlabs.io" in the video title.
- [ ] **14:30 [All] Code freeze.** `git tag demo && git push --tags`. After this only fixes of a few lines.
- [ ] **14:30–16:00 [All] Rehearse 5×** with a timer, swapping who plays the hearing person. Assign: presenter (D), signer (whoever signs most cleanly), laptop driver (A), Q&A backup (B, C).
- [ ] **By 16:30 [D] Devpost submitted** — checklist:
  - [ ] Title, tagline, the 3 event tracks (§8) + MLH tracks (Gemini, Vultr, Tiger Data, GoDaddy Registry).
  - [ ] Public GitHub link; public video link.
  - [ ] "Built with": MediaPipe, ONNX Runtime Web, PyTorch, LiveKit, Gemini API, ElevenLabs, FastAPI, Tiger Data, Vultr, GoDaddy Registry, React, Vite — and **Claude (AI assistant used for planning and code)**.
  - [ ] One paragraph per sponsor (§8) explaining why it is essential, not decorative.
  - [ ] What we learned: each teammate's background before the weekend and what they learned (a judging criterion).
  - [ ] Data & licenses: our own consented landmark data; MediaPipe Apache-2.0; any public dataset with its license and attribution.
  - [ ] Limitations (§9), verbatim.
- [ ] **16:30–17:00** README final (how to run, credits, consent), push. Submit any last fix before 17:00.
- [ ] **17:15** Demo-day setup (§7).

### Phase 6 — After the event (by Fri Oct 31, for the DEV Writing Challenge)
- [ ] One person writes the DEV post tagged `#mlhacks`: the architecture diagram, real latency numbers from Tiger Data, the confusion matrix, "what failed" (why an LLM can't be the recognizer: ~24% zero-shot vs our trained classifier), the Deaf-community perspective and consent choices, the demo video. Share it in the event Discord and on LinkedIn (community popularity is a criterion).
- [ ] Rotate every API key used during the event.

---

## 7. Demo-day runbook (Sun 17:15)

- [ ] Both laptops on power, Chrome only, all other apps closed, notifications and Do Not Disturb on, screen sleep off.
- [ ] Signer laptop: light source in front (window or lamp), plain background behind, camera at chest-to-head height, sleeves above the wrist, sit ~1 m back.
- [ ] Hearing laptop: **headphones on**, volume tested.
- [ ] Both joined to `demo-room` 10 minutes early; one test sentence each way.
- [ ] Third tab open on `#/stats`; backup video downloaded locally; phone hotspot on standby.
- [ ] Last-resort mode, used only if recognition fails under the venue lights: `?dev` simulator, **said out loud** to judges ("lighting is defeating the hand tracker, so I'm typing the glosses; everything after recognition is live").
- [ ] After each judge: refresh nothing; clear captions only if asked.

**Likely judge questions (have one owner each):**
| Question | Answer owner | Short answer |
|---|---|---|
| How accurate is it? | B | "On signers it never saw: X% top-1 (leave-one-signer-out). It answers only when confident: at our threshold it answers Y% of the time at Z% accuracy." |
| Why not let Gemini watch the video? | B | "A 2026 benchmark found LLMs get ~24% of isolated signs zero-shot. We use a trained classifier for recognition and Gemini where language helps: word order, picking between our top guesses, punctuation." |
| Did Deaf people help? | D | Answer truthfully (Q6). If not: "Not yet — it's the first thing we'll do; we built the confirm step and the limitations around what Deaf researchers have published." |
| Does this replace interpreters? | D | "No. It's for casual moments where no interpreter is booked anyway." |
| What about privacy? | A | "Landmarks are computed on the laptop; video never goes to our server or the AI. Only recognized words and English text leave the device, and we say so on the first screen." |
| How fast is it? | C | Point at Stats p50/p95. |
| What's next? | D | Continuous signing with Deaf co-researchers, more vocabulary with consented and paid data, facial grammar. |

---

## 8. Prize tracks

**Event tracks (pick 3; confirm Q4 about Best Overall):**

| Track | Enter? | What the judges should see |
|---|---|---|
| Best AI/ML (ML @ UVA) | **Yes** | A model we trained this weekend, held-out-signer accuracy, confusion matrix, calibrated confidence + rejection, and Gemini used where language (not vision) helps. |
| Best Live Demo | **Yes** | A real two-laptop call, a judge playing the hearing person, voice + captions both ways in < 90 s, live latency numbers. |
| Next Giant Leap | **Yes** | Two-way conversation across a language barrier, built consent-first. |
| Best Female Empowerment | Only if Q15 has a genuine answer | A women-centered angle you can stand behind; otherwise skip. |
| Best Beginner | Only if Q2 says the team qualifies | — |
| Most Sustainable | No (framing only) | Mention: recognition runs on the laptop, we send landmarks/words instead of video, one small LLM call per sentence. |
| Best Overall | Automatic or pick (Q4) | Everything above. Stress what's new versus 2025's hand-tracking winner: real-time two-way conversation and voice. |

**MLH tracks (unlimited):**

| Track | Enter? | Devpost paragraph (edit to match what you shipped) |
|---|---|---|
| Best Use of Gemini API | **Yes** | "Gemini 3.5 Flash-Lite turns recognized ASL glosses into natural English with a JSON schema (english, sentence type, confidence, uncertain words). It receives our classifier's top alternatives and the hearing person's last captions, so it can pick the word that fits the conversation, and it uses eyebrow/headshake tags for questions and negation. We measured p50 latency of X ms. We deliberately don't use Gemini to recognize signs from video: published zero-shot accuracy is ~24%, so a trained classifier does recognition and Gemini does language." |
| Best Use of Vultr | **Yes** | "Our whole app runs on a Vultr VM: Caddy serves the site with automatic HTTPS and proxies a FastAPI server that holds every API key, mints LiveKit tokens, and streams ElevenLabs audio without buffering." |
| Best Use of Tiger Data | **Yes** | "Every recognized sign and every spoken sentence is a time-series event in two hypertables. A continuous aggregate (refreshed every minute, real-time enabled) powers a live dashboard of sign-to-voice latency (p50/p95), Gemini and voice latency, offline-fallback rate, and the signs our model is least sure about — which told us what to re-record." |
| Best Domain Name (GoDaddy Registry) | **Yes** | Register it and use it as the live URL. |
| DEV Writing Challenge | **Yes, after the event** | Phase 6. |
| Best Use of Presage | No (default) | No browser SDK; vitals are unreliable during signing; its emotion classes would misread grammatical eyebrows. Revisit only if someone already knows Node/Electron. |
| Best Use of Solana | No | No honest fit for a live accessibility call. |

---

## 9. Pitch wording and limitations

**60-second opener (adapt):** "Most video calls give Deaf signers two options: book an interpreter, or type in the chat. For a quick study-group question or a coffee chat, neither feels like a conversation. SignLine is a two-way prototype: you sign, you see what it understood, you press Speak, and the other person hears it. They talk, you read it. Watch."

| Say | Don't say |
|---|---|
| "recognizes a 16-sign vocabulary (27 trained) plus slow fingerspelling for names" | "translates ASL" / "real-time ASL translation" |
| "for casual, low-stakes conversations where no interpreter is booked anyway" | "replaces interpreters" / "no need for an interpreter" |
| "the signer stays in control: nothing is spoken until they approve it" | "gives Deaf people a voice" / "breaks the silence" |
| "X% accurate on signers it never saw" | "99% accurate" (training/validation on your own data) |
| "Deaf", "deaf", "hard of hearing", "signer" | "mute", "deaf-mute", "hearing-impaired" |
| "we read eyebrows and headshakes for questions and negation" | "understands ASL grammar" |
| — | hospitals, courts, emergencies, mental health |

**Limitations slide (verbatim):**
- Isolated signs from a small vocabulary; no continuous or fluent signing.
- Fingerspelling is slow and limited to a few letters.
- Facial grammar: only eyebrows (questions) and headshake (negation); no mouth morphemes, classifiers, or directional verbs.
- Trained on N consented signers, mostly not fluent; accuracy drops for new signers and for regional variants (including Black ASL).
- Lighting and camera position matter; closed-fist handshapes are hardest to track.
- Not for medical, legal, or emergency use.
- Privacy: landmarks are computed on-device; video is never sent for recognition; recognized words go to Google Gemini (free tier may use them to improve products) and English text to ElevenLabs.

---

## 10. Cut list and risk register

**If you are behind, cut in this order (top first):** Tier 2 vocabulary → per-user calibration (4.5) → Scribe (keep Web Speech) → eyebrow/headshake tags (keep the manual "? question" button) → stats page (keep event logging) → Vultr + domain (run from laptop A) → trained CNN (ship kNN) → spell mode (type the name into the simulator box, said out loud).

**Never cut:** consent screen, confirm-before-speak, offline fallbacks, cached demo MP3s, the backup video, the limitations slide.

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Recognition fails under venue lighting | Medium | High | Rehearse in the venue room Sunday afternoon; lamp in front; `_idle` data; honest simulator fallback | B |
| Gemini free-tier 429 (resets 3:00 AM EDT, per project) | Medium | Medium | Tier-1 billing; rule-based fallback; cached MP3s match fallback text | C |
| ElevenLabs credits run out | Medium | Medium | Dev on teammates' free accounts; demo account untouched; Starter plan; cache | C |
| Accuracy on new signers < 60% | Medium | High | Small distinct vocabulary; confusion matrix → re-record pairs; per-user calibration | B |
| Echo: hearing STT captions the voice | High without headphones | Medium | Headphones; `tts` ctrl gating; Scribe echo cancellation | A |
| Wi-Fi drops | Medium | High | Phone hotspot; LiveKit reconnect banner; backup video | A |
| Vultr verification/deposit delays | Low–Medium | Low | Launched in Phase 0; local server fallback | C |
| Team burnout → bugs Sunday | High | High | Golden-path tag at 02:00; staggered sleep; code freeze 14:30 | All |
| Key leaked in a public repo | Low | High | `.env*` ignored from commit 1; rotate after event | C |
| Overclaiming in the pitch | Medium | High (with ASL-aware judges) | §9 table; limitations slide | D |

---

## 11. Self-review (xvant)

**Coverage — every request maps to a section:**

| You asked for | Where |
|---|---|
| The stack to integrate | Header, §3.1, §3.6, §4 |
| Nuances that need clarification | §1 (Q1–Q16, each with a default) |
| A detailed plan in phases | §6 Phases 0–6 with clock times, owners, checkpoints |
| Deep research on small details and edge cases (ASL, ML, stack) | §0, §2 vocabulary, §3.5 error map, Tasks 1.B2–1.B3, 2.B2, 4.3, §9; full report in `reports/ASL video call hackathon research.md` |
| Fit to the prize tracks | §8 |
| xvant plan format | File map (§4), ASCII diagrams with unhappy paths (§3), checkbox steps with tests and expected output (§6), this self-review |

**Placeholder scan.** No "TBD" or "add error handling" steps. The only values you must replace are yours by nature, and each is marked where it appears: `<your-org>` (GitHub org), the example IP `149-28-1-2.sslip.io`, the example domain `signline.co`, the demo name "Liv" (Q10 — also update `cache_tts.py` and the Gemini examples if you change it), the voice IDs, and the `X/Y/Z` numbers on slides that come from your own runs.

**Name consistency (defined → used):** `Frame`/`Pt`/`Caption`/`Ctrl` (`types.ts`) → everywhere · `FEAT_PER_FRAME`=174, `T`=32 (`features.ts`) → `onnx.ts`, `knn.ts`, `build-dataset.ts`, `train.py` (reads them from `meta.json`) · `IDLE`='_idle' (`vocab.ts`) → `classifier.ts`, `build-dataset.ts`, `train.py`, `eval_report.py` · `Token`/`Tag` (`gloss.ts`) → `Chips.tsx`, `Call.tsx`, `nmm.ts` · `Pred`/`Alt`/`SignClassifier` (`classifier.ts`) → `onnx.ts`, `knn.ts`, `signerPipeline.ts` · `/api/*` routes (`main.py`) → `api.ts`, `metrics.ts`, `Stats.tsx` · event fields (`main.py` models) ↔ `schema.sql` columns ↔ `metrics.ts` log types · cached sentences (`cache_tts.py`) ↔ `ruleBasedEnglish` outputs ↔ Gemini few-shot outputs.

**Things the research could not fully verify — each has a check step in its task:**
- `tsdb.hypertable` table syntax on your Tiger service version (Task 1.C5 gives the fallback).
- MediaPipe blendshape names `browInnerUp`/`browDown*`/`browOuterUp*` (Bench shows `brow -` if they don't match).
- Gemini free-tier limits (only visible in AI Studio; Task 0.1).
- ElevenLabs `/v1/voices` category `premade` (route falls back to any voices).
- Edge support for Web Speech is disputed → demo on desktop Chrome.

**Unit tests in this plan:** `features`, `segmenter`, `classifier`/`knn`, `letters`, `gloss`, `nmm` (vitest) and `test_api`, `test_gloss` (pytest).

**Verified before handing over (Oct 17, in a scratch copy built only from this document's code blocks):**
- Frontend: every file type-checks with the current `create-vite` React-TS template settings (TypeScript 6, React 19, `erasableSyntaxOnly`), including the Phase 3–4 edits to `Call.tsx` and `signerPipeline.ts` applied exactly as written. `vite build` succeeds.
- Frontend unit tests: **29/29 pass** (vitest 5).
- Server tests: **7/7 pass** (FastAPI, `livekit-api`, `google-genai` 2.31). The Gemini request config (JSON schema from the Pydantic model) builds without errors.
- Package APIs used by the plan exist in current versions: `livekit-client` 2.23 (`sendText`, `registerTextStreamHandler`), `@elevenlabs/client` 1.28 (`Scribe`, `CommitStrategy`, `RealtimeEvents`).
- `build-dataset.ts` runs on synthetic recordings and writes `X.f32`, `meta.json`, kNN and letter templates (this run caught the letter-threshold floor now in the script).
- `train.py` runs end to end on PyTorch 2.14 (leave-one-signer-out, temperature, threshold, export) in ~15 s on synthetic data; ONNX output matches PyTorch to ~1e-6; `eval_report.py` writes all three charts. This run caught two bugs now fixed: PyTorch 2.14 splits weights into `sign.onnx.data` (now inlined), and temperature collapsing on perfectly separable data (now bounded).
- The exported `sign.onnx` loads and runs in **onnxruntime-web 1.30** — the same runtime the browser uses.
- Not testable here: live calls to Gemini/ElevenLabs/LiveKit (no keys), the TimescaleDB schema, Caddy, and MediaPipe in a real browser — Phase 1's curl and two-laptop checks cover those.

---

## 12. Sources

Event and rules
- Girls Hoo Hack 2026 Devpost — https://girls-hoo-hack-2026.devpost.com/ (rules: /rules, dates: /details/dates)
- MLH standard hackathon rules — https://github.com/MLH/mlh-policies/blob/main/standard-hackathon-rules.md
- Girls Hoo Hack 2025 winners — https://girls-hoo-hack-2025.devpost.com/

ASL and Deaf-community perspective
- Lifeprint Lesson 1 and minimal pairs — https://www.lifeprint.com/asl101/lessons/lesson01.htm · https://www.lifeprint.com/asl101/topics/minimalpairs.htm
- Tran, Ladner & Bragg (ASSETS 2023), Deaf perspectives on sign translation — https://microsoft.com/en-us/research/uploads/prod/2023/10/Automatic_Sign_Language_Translation_Perspectives.pdf
- EUD Ethical Framework on AI and sign language — https://eud.eu/wp-content/uploads/2025/07/ETHICAL-FRAMEWORK-ON-AI-AND-SIGN-LANGUAGE.pdf
- De Meulder (2025) — https://arxiv.org/pdf/2505.02519
- ASL Citizen — https://arxiv.org/html/2304.05934v2

ML
- MediaPipe Holistic / Hand landmarker (web) — https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker/web_js · https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- GISLR 1st-place notebook (MIT) — https://github.com/hoyso48/Google---Isolated-Sign-Language-Recognition-1st-place-solution
- PopSign v1.0 (CC BY 4.0) — https://signdata.cc.gatech.edu/view/datasets/popsign_v1_0/
- Open-source fingerspelling interface (A/M/N/S/T confusions) — https://arxiv.org/pdf/2408.09311
- LLMs on isolated sign recognition (~24% zero-shot) — https://arxiv.org/pdf/2604.11225
- Temperature scaling — https://arxiv.org/abs/1706.04599
- ONNX Runtime Web — https://onnxruntime.ai/docs/tutorials/web/

Stack and sponsors
- LiveKit pricing, tokens, text streams — https://livekit.com/pricing · https://docs.livekit.io/home/server/generating-tokens/ · https://docs.livekit.io/transport/data/text-streams/
- Gemini models, rate limits, structured output — https://ai.google.dev/gemini-api/docs/models · https://ai.google.dev/gemini-api/docs/rate-limits · https://ai.google.dev/gemini-api/docs/structured-output
- ElevenLabs models, latency, Scribe JS SDK — https://elevenlabs.io/docs/models · https://elevenlabs.io/docs/best-practices/latency-optimization · https://elevenlabs.io/docs/eleven-api/resources/libraries/scribe-stt/javascript-scribe/llms.txt
- Chrome autoplay policy — https://developer.chrome.com/blog/autoplay
- Web Speech API — https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- Tiger Data continuous aggregates — https://www.tigerdata.com/docs/use-timescale/latest/continuous-aggregates/create-a-continuous-aggregate
- MLH partner pages (Gemini, Presage, Tiger Data) — https://www.mlh.com/partners/gemini · https://www.mlh.com/partners/presage · https://www.mlh.com/partners/tigerdata
