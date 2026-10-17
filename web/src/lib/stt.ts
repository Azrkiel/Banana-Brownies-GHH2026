export type OnTranscript = (text: string, final: boolean) => void;
export type Stt = { kind: 'webspeech' | 'scribe'; stop(): void };
export type SttState = 'starting' | 'listening' | 'stopping' | 'retrying' | 'failed' | 'stopped';

type RecognitionResult = { readonly isFinal: boolean; readonly [index: number]: { transcript: string } };
type ResultEvent = { readonly resultIndex: number; readonly results: ArrayLike<RecognitionResult> };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: ResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  abort(): void;
};
type RecognitionBrowser = {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
type State = 'starting' | 'listening' | 'closing' | 'waiting' | 'stopped';
type Timer = ReturnType<typeof setTimeout>;
type Attempt = {
  id: number;
  rec: Recognition;
  ended: boolean;
  abortRequested: boolean;
  draft: string;
  committed: Set<number>;
  watchdog?: Timer;
  healthyTimer?: Timer;
};

// Project defaults: validate/tune on the actual microphone/browser in Phase 4.
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const HEALTHY_MS = 30000;
const START_TIMEOUT_MS = 15000;
const CLOSE_TIMEOUT_MS = 2000;
const UNAVAILABLE = 'Speech captions are unavailable in this browser. Try desktop Chrome; you can still type captions.';
const START_FAILED = 'Could not start speech captions. Check microphone permissions and start again.';
const NETWORK_FAILED = 'Speech captions lost their network connection. Trying to reconnect.';
const EXHAUSTED = 'Speech captions could not recover. Check your microphone and connection, then start again.';
const NETWORK_EXHAUSTED = 'Your browser\'s speech service could not connect after three retries. Open this address in desktop Chrome, check your internet connection, and start captions again.';
const CLOSE_FAILED = 'Speech recognition could not close safely. Stop microphone access in your browser and start captions again.';
const PROVIDER_FAILED = 'Speech recognition failed unexpectedly. Check your microphone and start captions again.';

function permanentError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Speech recognition access is blocked. Check microphone permission and browser speech-service settings, then start again.';
    case 'audio-capture':
      return 'Speech captions cannot access a microphone. Check your microphone and start again.';
    case 'language-not-supported':
      return 'English speech recognition is unavailable in this browser. You can still type captions.';
    case 'aborted':
      return 'Speech recognition was interrupted. Start captions again when you are ready.';
    default:
      return PROVIDER_FAILED;
  }
}

/**
 * Standalone adapter: caller starts after consent and owns one logical session.
 * Startup requested is not microphone-ready. Recognition may process audio remotely.
 * Only confirmed-ended attempts restart, with bounded backoff; gaps can lose speech.
 * This module persists no audio/text. Live verification and call wiring are later phases.
 */
export function startWebSpeech(
  onText: OnTranscript,
  onError: (message: string) => void,
  onState?: (state: SttState) => void,
): Stt | null {
  const browser = typeof window === 'undefined' ? undefined : window as unknown as RecognitionBrowser;
  const Ctor = browser?.SpeechRecognition ?? browser?.webkitSpeechRecognition;
  if (!Ctor) {
    onState?.('failed');
    onError(UNAVAILABLE);
    return null;
  }
  const Constructor: new () => Recognition = Ctor;

  let wanted = true;
  let cancelled = false;
  let state: State = 'waiting';
  let generation = 0;
  let current: Attempt | undefined;
  let retryTimer: Timer | undefined;
  let retries = 0;
  let networkReported = false;

  const isCurrent = (a: Attempt) => wanted && current === a && a.id === generation;
  const acceptsText = (a: Attempt) => isCurrent(a) && state === 'listening';

  function clearAttemptTimers(a: Attempt) {
    clearTimeout(a.watchdog);
    clearTimeout(a.healthyTimer);
    a.watchdog = undefined;
    a.healthyTimer = undefined;
  }

  function detach(a: Attempt) {
    a.rec.onresult = null;
    a.rec.onerror = null;
    a.rec.onend = null;
    a.rec.onstart = null;
    clearAttemptTimers(a);
    a.committed.clear();
  }

  function abort(a: Attempt) {
    if (a.ended || a.abortRequested) return;
    a.abortRequested = true;
    a.rec.abort();
  }

  function shutdown() {
    wanted = false;
    state = 'stopped';
    generation++;
    clearTimeout(retryTimer);
    retryTimer = undefined;
    const a = current;
    current = undefined;
    if (!a) return;
    a.draft = '';
    detach(a);
    try { abort(a); }
    catch { /* No callbacks/restarts after terminal cleanup, even if the browser fails. */ }
  }

  function stop() {
    cancelled = true;
    shutdown();
  }

  function fail(message: string) {
    if (!wanted) return;
    const clearDraft = !!current?.draft;
    shutdown();
    if (clearDraft && !cancelled) onText('', false);
    // An application callback is allowed to stop the session synchronously.
    if (!cancelled) onState?.('failed');
    if (!cancelled) onError(message);
  }

  function clearDraft(a: Attempt): boolean {
    if (a.draft) {
      a.draft = '';
      onText('', false);
    }
    return isCurrent(a);
  }

  function reportNetwork(): boolean {
    if (!networkReported) {
      networkReported = true;
      onError(NETWORK_FAILED);
    }
    return wanted;
  }

  function scheduleRecovery() {
    if (!wanted || retryTimer !== undefined) return;
    if (retries >= RETRY_DELAYS_MS.length) {
      fail(networkReported ? NETWORK_EXHAUSTED : EXHAUSTED);
      return;
    }
    state = 'waiting';
    const expectedGeneration = generation;
    const delay = RETRY_DELAYS_MS[retries++];
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (wanted && state === 'waiting' && generation === expectedGeneration) launch(false);
    }, delay);
    onState?.('retrying');
  }

  function ended(a: Attempt) {
    if (!isCurrent(a) || a.ended) return;
    a.ended = true;
    state = 'closing';
    clearAttemptTimers(a);
    if (!clearDraft(a)) return;
    detach(a);
    current = undefined;
    generation++;
    scheduleRecovery();
  }

  function recover(a: Attempt, code: string) {
    if (!isCurrent(a) || state === 'closing') return;
    state = 'closing';
    clearAttemptTimers(a);
    onState?.('stopping');
    if (!isCurrent(a)) return;
    if (!clearDraft(a)) return;
    if (code === 'network' && (!reportNetwork() || !isCurrent(a))) return;
    // Install before abort(): a browser can dispatch end synchronously.
    a.watchdog = setTimeout(() => {
      if (isCurrent(a) && state === 'closing') fail(CLOSE_FAILED);
    }, CLOSE_TIMEOUT_MS);
    try { abort(a); }
    catch { fail(CLOSE_FAILED); }
  }

  function transcript(a: Attempt, event: ResultEvent) {
    if (!acceptsText(a)) return;
    let rows: { text: string; final: boolean }[];
    try {
      const { resultIndex, results } = event;
      if (!Number.isInteger(resultIndex) || resultIndex < 0 ||
          !Number.isInteger(results.length) || results.length < resultIndex) throw new Error();
      rows = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (!result || typeof result.isFinal !== 'boolean') throw new Error();
        const text = result[0]?.transcript ?? '';
        if (typeof text !== 'string') throw new Error();
        rows.push({ text: text.trim(), final: result.isFinal });
      }
    } catch {
      fail(PROVIDER_FAILED);
      return;
    }
    for (let i = event.resultIndex; i < rows.length; i++) {
      const row = rows[i];
      if (!row.final || a.committed.has(i)) continue;
      a.committed.add(i);
      if (row.text) {
        a.draft = '';
        onText(row.text, true);
        if (!acceptsText(a)) return;
      }
    }
    // Earlier unchanged interim fragments still belong to the draft; lists can shrink.
    const draft = rows.filter(row => !row.final && row.text).map(row => row.text).join(' ');
    if (draft !== a.draft) {
      a.draft = draft;
      onText(draft, false);
    }
  }

  function launch(initial: boolean): boolean {
    state = 'starting';
    onState?.('starting');
    if (!wanted) return false;
    let rec: Recognition;
    try {
      rec = new Constructor();
    } catch (error) {
      // A transient constructor failure created no capture session, so teardown is known.
      if (!initial && error instanceof DOMException && error.name === 'NetworkError') {
        if (reportNetwork()) scheduleRecovery();
      } else fail(START_FAILED);
      return wanted;
    }
    const a: Attempt = {
      id: ++generation, rec, ended: false, abortRequested: false, draft: '', committed: new Set(),
    };
    current = a;
    state = 'starting';
    try {
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      rec.onresult = event => transcript(a, event);
      rec.onerror = event => {
        if (!isCurrent(a) || state === 'closing') return;
        if (!event || typeof event.error !== 'string') { fail(PROVIDER_FAILED); return; }
        if (event.error === 'network' || event.error === 'no-speech') recover(a, event.error);
        else fail(permanentError(event.error));
      };
      rec.onend = () => ended(a);
      rec.onstart = () => {
        if (!isCurrent(a) || state !== 'starting') return;
        clearAttemptTimers(a);
        state = 'listening';
        a.healthyTimer = setTimeout(() => {
          a.healthyTimer = undefined;
          if (acceptsText(a)) { retries = 0; networkReported = false; }
        }, HEALTHY_MS);
        onState?.('listening');
      };
      a.watchdog = setTimeout(() => {
        if (isCurrent(a) && state === 'starting') fail(START_FAILED);
      }, START_TIMEOUT_MS);
      rec.start();
    } catch {
      // A failed start cannot be assumed to have released capture: do not retry it.
      if (wanted) fail(START_FAILED);
    }
    return wanted;
  }

  return launch(true) ? { kind: 'webspeech', stop } : null;
}
