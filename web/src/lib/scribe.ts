import { getScribeToken } from './api';
import type { OnTranscript, Stt, SttState } from './stt';
import type { RealtimeConnection } from '@elevenlabs/client';

/** One cancellable ElevenLabs session shared by Speech check and call captions.
 * The server exchanges its API key for a single-use token; only that token reaches
 * the SDK. Stop is synchronous even while token/SDK loading is in progress.
 */
export function startScribe(onText: OnTranscript, onError: (message: string) => void, onState?: (state: SttState) => void): Stt {
  let active = true, cancelled = false, listening = false;
  let connection: RealtimeConnection | null = null;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  function release() {
    active = false;
    listening = false;
    clearTimeout(watchdog);
    const previous = connection; connection = null;
    previous?.close();
  }
  function fail(message: string) {
    if (!active) return;
    release();
    if (!cancelled) onState?.('failed');
    if (!cancelled) onError(message);
  }
  onState?.('starting');
  watchdog = setTimeout(() => fail('ElevenLabs captions did not start in time. Check microphone permission and your connection, then start again.'), 20000);
  async function connect() {
    let phase: 'token' | 'connection' = 'token';
    try {
      const [sdk, { token }] = await Promise.all([import('@elevenlabs/client'), getScribeToken()]);
      if (!active) return;
      if (!token || typeof token !== 'string') throw new Error('Missing token');
      phase = 'connection';
      const { Scribe, RealtimeEvents: Events, CommitStrategy } = sdk;
      const current = Scribe.connect({
        token, modelId: 'scribe_v2_realtime', languageCode: 'en',
        commitStrategy: CommitStrategy.VAD, vadSilenceThresholdSecs: 0.7,
        microphone: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      connection = current;
      current.on(Events.SESSION_STARTED, () => {
        if (!active) return;
        clearTimeout(watchdog);
        listening = true;
        onState?.('listening');
      });
      current.on(Events.PARTIAL_TRANSCRIPT, data => { if (active && listening && typeof data.text === 'string') onText(data.text.trim(), false); });
      current.on(Events.COMMITTED_TRANSCRIPT, data => { if (active && listening && typeof data.text === 'string' && data.text.trim()) onText(data.text.trim(), true); });
      current.on(Events.AUTH_ERROR, () => fail('ElevenLabs rejected caption access. Check the server API key and Scribe permissions, then start again.'));
      current.on(Events.QUOTA_EXCEEDED, () => fail('ElevenLabs caption quota is exhausted. Check account credits before starting again.'));
      current.on(Events.UNACCEPTED_TERMS, () => fail('ElevenLabs requires the account owner to accept the Scribe terms in their dashboard.'));
      current.on(Events.RATE_LIMITED, () => fail('ElevenLabs captions are busy. Wait a moment, then start again.'));
      current.on(Events.INSUFFICIENT_AUDIO_ACTIVITY, () => fail('ElevenLabs ended this session after too little speech. Start captions again when you are ready.'));
      current.on(Events.SESSION_TIME_LIMIT_EXCEEDED, () => fail('The ElevenLabs caption session reached its time limit. Start captions again to continue.'));
      current.on(Events.ERROR, () => fail('ElevenLabs captions could not continue. Check microphone permissions and your connection, then start again.'));
      current.on(Events.CLOSE, () => fail('The ElevenLabs caption connection closed. Start captions again to reconnect.'));
    } catch {
      fail(phase === 'token'
        ? 'Could not get an ElevenLabs caption token. Check the server API key, Scribe permissions, account credits and connection.'
        : 'Could not connect to ElevenLabs captions. Check microphone permission and your connection, then start again.');
    }
  }
  void connect();
  return { kind: 'scribe', stop() { cancelled = true; release(); } };
}
