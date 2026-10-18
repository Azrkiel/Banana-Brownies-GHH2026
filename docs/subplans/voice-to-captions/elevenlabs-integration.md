# ElevenLabs caption integration — 2026-10-17

The user requested ElevenLabs for both failing browser-recognition paths. Source
inspection confirmed that Speech check and CallSpeech used startWebSpeech and
never called the existing Scribe token endpoint. The deployed token endpoint
returned HTTP 200; a real Scribe WebSocket accepted the token and transcribed
locally generated synthetic speech. No personal microphone audio was used.

Before:
Speech check / CallSpeech -> startWebSpeech -> browser speech service -> network failure
Existing Scribe token endpoint -> unused by the frontend

After:
Consent + Start -> shared startScribe -> server single-use token -> Scribe WebSocket
  -> partial/final text -> standalone display OR existing caption delivery -> peer
  -> stop/mute/leave/cancel -> close capture and ignore late callbacks

The long-lived ElevenLabs credential remains server-side. The browser receives only
a single-use token. SDK 1.28.0 owns microphone encoding and cleanup, including late
permission grants after close, verified from the installed SDK source. Startup has
a 20-second watchdog; failures remain visible and require explicit restart. No
automatic fallback returns users to the failing browser service. Consent copy
names ElevenLabs. The browser adapter remains separately tested.

Validation: 178 frontend tests, production build, and lint passed. Nine new tests
cover default call wiring through Scribe to caption transport, cancellation,
startup timeout, provider close, token failures, quota/auth/terms/rate errors,
mute cleanup and late callbacks. A live provider test returned `Hello.` from
synthetic audio. Real browser microphone and two-laptop acceptance remain pending;
there are no browser surfaces available to automation in this session.

Task 4.4 permits this SDK dependency. Its broader ledger dependencies and ASL-switch
work remain unchanged; this scoped integration does not complete the whole roadmap.

Reference: https://elevenlabs.io/docs/eleven-api/resources/libraries/scribe-stt/javascript-scribe
