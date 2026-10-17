# Setup tasks for the team

Phase 0 code is implemented. The following steps require your accounts, secure
credentials, browser/camera, or decisions. You do not need to send secret values
in chat. None of the provider credentials are currently injected in this cloud
machine or declared in its saved configuration.

## 1. Enable model downloads in Codex

- [ ] Open this cloud environment's settings.
- [ ] Review and save the existing network draft adding `storage.googleapis.com`.
- [ ] Publish the environment to activate the prepared configuration.
- [ ] Tell Codex the change is saved so it can retry `npm --prefix web run setup:assets`.

Three official MediaPipe bundles are still missing because the running proxy
returns HTTP 403. npm dependencies and browser WASM runtime copies are installed.

## 2. Create the accounts needed for live integration

Use development accounts/keys where available. Paid upgrades are optional; verify
current pricing and event credits before spending money.

| Provider | Action | Values the server will need |
| --- | --- | --- |
| [LiveKit Cloud](https://cloud.livekit.io/) | Create a project, then open its keys/settings and create development API credentials. | `LIVEKIT_URL` (project WebSocket URL), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` |
| [Google AI Studio](https://aistudio.google.com/) | Create/select a project and an API key. Check which model is available and its quota. | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| [ElevenLabs](https://elevenlabs.io/) | Create an account and API key with access to the voices and text-to-speech APIs. Choose a voice you can use. | `ELEVENLABS_API_KEY`; share the non-secret voice ID later |
| [Tiger Data](https://www.tigerdata.com/) | Create a PostgreSQL/Timescale service when ready to implement event logging. Keep TLS enabled. | `DATABASE_URL` with the provider's required TLS settings |

The example uses `GEMINI_MODEL=gemini-3.5-flash-lite` and
`ELEVEN_MODEL=eleven_flash_v2_5` from the plan. These are defaults, not verified
model availability or successful API calls. Codex will check them during backend
implementation. Share model names, project hostnames, or voice IDs freely;
keep keys, passwords, and full database connection strings private.

For local development, run this from the repository root only if `server/.env`
does not already exist, then edit it in a secure editor:

```sh
cp -n server/.env.example server/.env
```

`.env` is ignored by Git. Never put these values in `web/`, a `VITE_*` variable,
a commit, an issue, or chat. `LIVEKIT_API_SECRET` must be available to the server
for local token signing, and `DATABASE_URL` for a direct database connection;
HTTPS proxy placeholders cannot replace those uses. For Codex cloud runtime
configuration, arrange a supported secure raw-value injection for those two
requirements rather than declaring them as HTTPS-only proxy credentials.
Codex can declare supported HTTPS credential requirements when implementing and
testing those integrations, after checking existing bindings.

## 3. Decisions and real-world checks

- [ ] Confirm **SignLine** as the working name, or provide a replacement.
- [ ] Confirm the default demo name **LIV** and planned letters in `web/src/vocab.ts`.
- [ ] Ask the organizer Q1–Q6 in `plan.md`: pretrained model/data rules, beginner
  eligibility, live demo format, track limits, domain redemption, and Deaf/ASL contacts.
- [ ] Have someone familiar with ASL verify each Tier-1 sign against
  Lifeprint/Handspeak and add accurate form notes before recording data.
- [ ] Choose two laptops with cameras, desktop Chrome, headphones, and consenting
  participants for the later call/recording checks.
- [ ] Agree on consent before recording. Only landmarks go in recordings;
  keep recordings under ignored `data/` paths.

No answers are required to continue the code foundations with the plan's defaults.
Live provider calls and camera/call checks require the corresponding prerequisites.

## 4. Deployment and submission, when ready

- [ ] If pursuing the Vultr track, redeem applicable credits and provision the
  plan's Ubuntu 24.04 VM (1 vCPU, 1–2 GB). This may incur charges; check the terms.
  Give Codex the public IP and an approved access method when deployment is requested.
- [ ] If pursuing the domain track, obtain a domain; point DNS at the deployment
  host once selected. A domain/VM is not required to work on the local scaffold.
- [ ] Verify sponsor track rules, AI-tool disclosure, and ElevenLabs attribution
  requirements before submitting or publishing demo audio.

Codex will handle repository code, locked dependency installation, tests/builds,
asset downloads after network access works, and backend startup once implemented.
It will report any additional provider hostname/network requirements from the
actual integrations; no provider calls have been validated yet.
