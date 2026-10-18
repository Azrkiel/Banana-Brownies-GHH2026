import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPersonalRecognizer, createWordRecognizer, type WordRecognizer } from '../lib/wordRecognition';
import { drawLive } from '../lib/landmarks';
import { useAuth } from '../lib/auth';
import { loadPersonalSamples } from '../lib/personalSigns';
import { trainPersonalModel } from '../lib/personalModel';
import type { WordPrediction } from '../lib/wordModel';
import { createDictation, type DictatedWord } from '../lib/dictation';
import { signLabel } from '../lib/signLabels';
import { sentenceOrFallback } from '../lib/signedSentence';
import { Button } from './ui';
import './SignerWords.css';

type State = 'off' | 'loading' | 'ready' | 'live' | 'capturing' | 'review' | 'failed';
type Preview = { words: DictatedWord[]; text: string | null };

/** Seconds the signer sees the sentence before it is sent on its own (when automatic sending is on). */
const PREVIEW_SECONDS = 6;
/** If the sentence is not ready by then, the preview shows the recognized words instead. */
const PREPARE_TIMEOUT_MS = 4000;
const AUTO_SEND_KEY = 'signline.autoSendPreview';
function readAutoSend(): boolean {
  try { return localStorage.getItem(AUTO_SEND_KEY) !== '0'; } catch { return true; }
}
const typingField = (el: Element | null) => el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(el.type)) || (el instanceof HTMLElement && el.isContentEditable);

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Why a guess was held back, in terms the signer can act on. */
function heldReason(prediction: WordPrediction): string {
  if ((prediction.framesWithHand ?? 0) < 24) return 'Keep your hands in view — the sign wasn’t clear enough.';
  return 'Not sure about this sign. Try again, or type the word yourself.';
}

type Props = {
  camera: RefObject<HTMLVideoElement | null>;
  /** True only while the call can send. A reconnect keeps this panel mounted and just pauses sending. */
  connected: boolean; reconnecting?: boolean;
  /** Tells the call whether recognized signs or a preview are waiting, so it can warn before the tab closes. */
  onPending?(pending: boolean): void;
  /** Turns dictated signs into the sentence shown in the preview. */
  onPrepare(words: DictatedWord[]): Promise<string>;
  /** Sends the previewed sentence; resolves to the text that was sent, or null if it was not. */
  onSentence(text: string): Promise<string | null>;
};

/** Signer-only. Live dictation and single-sign capture both end in the same preview: Send now, Cancel, or send automatically. */
export function SignerWords({ camera, connected, reconnecting = false, onPending, onPrepare, onSentence }: Props) {
  const { user } = useAuth();
  const [source, setSource] = useState<'shared' | 'personal'>('shared');
  const [state, setState] = useState<State>('off');
  const [labels, setLabels] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [prediction, setPrediction] = useState<WordPrediction | null>(null);
  const [live, setLive] = useState<WordPrediction | null>(null);
  const [tracked, setTracked] = useState(0);
  const liveCanvas = useRef<HTMLCanvasElement>(null);
  const stopLive = useRef<(() => void) | null>(null);
  const [error, setError] = useState('');
  const engine = useRef<WordRecognizer | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [dictating, setDictating] = useState(true);
  const [autoSend, setAutoSend] = useState(readAutoSend);
  const [signed, setSigned] = useState<DictatedWord[]>([]);
  const [sentStatus, setSentStatus] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [remaining, setRemaining] = useState(PREVIEW_SECONDS);
  const previewRef = useRef<Preview | null>(null);
  const dictation = useRef(createDictation());
  const dictatingRef = useRef(true);
  const connectedRef = useRef(connected);
  const sentenceRef = useRef(onSentence);
  const prepareRef = useRef(onPrepare);
  const pendingRef = useRef(onPending);
  const focusBefore = useRef<HTMLElement | null>(null);
  const focusMoved = useRef(false);
  useEffect(() => { sentenceRef.current = onSentence; prepareRef.current = onPrepare; pendingRef.current = onPending; dictatingRef.current = dictating; connectedRef.current = connected; });
  const previewReady = Boolean(preview?.text);

  /** Every dictated or captured sentence waits here: the signer sees it, and can send it now or cancel, before it goes out. */
  function startPreview(words: DictatedWord[]) {
    if (!words.length) return;
    if (previewRef.current) { dictation.current.load(words); setSigned(words); return; }
    const attempt = generation.current;
    const entry: Preview = { words, text: null };
    previewRef.current = entry;
    dictation.current.clear(); setSigned([]); setSentStatus(''); setPreview(entry); setRemaining(PREVIEW_SECONDS);
    let timer = 0;
    const slow = new Promise<null>(resolve => { timer = window.setTimeout(() => resolve(null), PREPARE_TIMEOUT_MS); });
    Promise.race([prepareRef.current(words).catch(() => null), slow]).then(text => {
      window.clearTimeout(timer);
      if (attempt !== generation.current || previewRef.current !== entry) return;
      const ready: Preview = { words, text: sentenceOrFallback(text, words, signLabel) };
      previewRef.current = ready; setPreview(ready); setRemaining(PREVIEW_SECONDS);
    });
  }
  async function confirmPreview() {
    const entry = previewRef.current;
    if (!entry?.text || !connectedRef.current) return;
    previewRef.current = null; setPreview(null);
    const attempt = generation.current;
    setSentStatus('Sending…');
    const sent = await sentenceRef.current(entry.text).catch(() => null);
    if (attempt === generation.current) setSentStatus(sent ? `Sent: ${sent}` : 'That sentence was not sent. Sign it again or type it.');
  }
  function cancelPreview() {
    const entry = previewRef.current;
    previewRef.current = null; setPreview(null);
    if (!entry) return;
    if (stopLive.current) {
      dictation.current.load([...entry.words, ...dictation.current.words]); setSigned(dictation.current.words);
      setSentStatus('Cancelled. Your words are kept as pending words.');
    } else setSentStatus('Cancelled. Nothing was sent.');
  }
  function chooseAutoSend(value: boolean) {
    setAutoSend(value);
    try { localStorage.setItem(AUTO_SEND_KEY, value ? '1' : '0'); } catch { /* storage may be blocked */ }
  }
  // The countdown only runs while the call can send; with automatic sending off the preview waits for the signer.
  useEffect(() => {
    if (!preview?.text || !autoSend || !connected) return;
    if (remaining <= 0) { void confirmPreview(); return; }
    const timer = setTimeout(() => setRemaining(seconds => seconds - 1), 1000);
    return () => clearTimeout(timer);
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, remaining, autoSend, connected]);
  // After a reconnect the signer gets the full time again rather than an instant send.
  useEffect(() => { if (connected) setRemaining(PREVIEW_SECONDS); }, [connected]);
  // Focus moves to "Send now" when the preview appears (unless the signer is typing), and returns when it closes.
  useEffect(() => {
    if (previewReady) {
      const active = document.activeElement;
      if (typingField(active)) { focusMoved.current = false; return; }
      focusBefore.current = active instanceof HTMLElement && active !== document.body ? active : null;
      document.getElementById('signer-words-send')?.focus(); focusMoved.current = true;
    } else if (focusMoved.current) {
      focusMoved.current = false;
      if (document.activeElement && document.activeElement !== document.body) return;
      const back = focusBefore.current?.isConnected ? focusBefore.current : document.getElementById('signer-words-live-toggle');
      back?.focus();
    }
  }, [previewReady]);
  const pending = signed.length > 0 || preview !== null;
  useEffect(() => { pendingRef.current?.(pending); }, [pending]);
  useEffect(() => () => pendingRef.current?.(false), []);

  function release() {
    generation.current++;
    previewRef.current = null; setPreview(null);
    dictation.current.clear(); setSigned([]);
    stopLive.current?.(); stopLive.current = null;
    request.current?.abort(); request.current = null;
    engine.current?.close(); engine.current = null;
  }
  useEffect(() => {
    const hide = () => { release(); setState('off'); setPrediction(null); setLive(null); };
    window.addEventListener('pagehide', hide);
    return () => { window.removeEventListener('pagehide', hide); release(); };
  }, []);
  useEffect(() => {
    // The panel sits below the call video; bring the live view on screen when it opens.
    if (state === 'live') liveCanvas.current?.parentElement?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [state]);

  async function enable() {
    if (!connected || !camera.current || request.current) return;
    release();
    const attempt = generation.current;
    const controller = new AbortController();
    request.current = controller;
    setError(''); setPrediction(null); setState('loading');
    try {
      const recognizer = source === 'personal' && user
        ? await createPersonalRecognizer(camera.current, controller.signal, trainPersonalModel(await loadPersonalSamples(user.id, controller.signal), 1))
        : await createWordRecognizer(camera.current, controller.signal);
      if (generation.current !== attempt) { recognizer.close(); return; }
      engine.current = recognizer;
      // Start in live view so the signer immediately sees whether their hand is tracked.
      setLabels(recognizer.labels); watchLive();
    } catch (cause) {
      if (generation.current !== attempt) return;
      release();
      setError(source === 'personal' && cause instanceof Error ? cause.message : 'Could not start sign recognition. Try again or type your caption.');
      setState('failed');
    }
  }
  function watchLive() {
    const recognizer = engine.current;
    if (!connected || !recognizer || stopLive.current) return;
    setPrediction(null); setError(''); setState('live');
    dictation.current.clear(); setSigned([]);
    stopLive.current = recognizer.watch((frame, guess) => {
      drawLive(liveCanvas.current, frame);
      setTracked(frame.hands.length); setLive(guess);
      if (!dictatingRef.current) return;
      const event = dictation.current.push(guess, Boolean(frame.points), performance.now());
      if (event?.type === 'word') setSigned(event.words);
      if (event?.type === 'sentence') startPreview(event.words);
    });
  }
  function unwatchLive() {
    stopLive.current?.(); stopLive.current = null; dictation.current.clear();
    setSigned([]); setLive(null); setTracked(0); setState('ready');
  }
  async function capture() {
    const recognizer = engine.current;
    if (!connected || !recognizer || state === 'capturing') return;
    if (stopLive.current) unwatchLive();
    const attempt = generation.current;
    setPrediction(null); setError(''); setProgress(0); setState('capturing');
    try {
      const result = await recognizer.capture(frames => { if (attempt === generation.current) setProgress(frames); });
      if (attempt !== generation.current) return;
      // A confident capture goes through the same preview as live dictation; an unsure one waits for the signer.
      if (result.accepted) { setState('ready'); startPreview([{ label: result.label, score: result.score }]); }
      else { setPrediction(result); setState('review'); }
    } catch {
      if (attempt !== generation.current) return;
      release(); setState('failed');
      setError('Capture stopped. Keep your hand in view and enable recognition to try again.');
    }
  }
  function stop() { release(); setState('off'); setPrediction(null); setLive(null); setError(''); setProgress(0); }
  const enabled = !['off', 'failed'].includes(state);
  const busy = state === 'loading' || state === 'capturing';
  const modelWords = labels.map(signLabel);
  const announcement = preview?.text ? `Ready to send: ${preview.text}. ${autoSend && connected ? `Sends in ${PREVIEW_SECONDS} seconds.` : 'Press Send now or Cancel.'}` : '';
  const statusText = !connected ? (reconnecting ? 'Reconnecting… recognition keeps running and sending resumes in a moment.' : 'Join the call to use sign recognition.')
    : state === 'loading' ? 'Loading hand tracking and words… the first time can take a few seconds.' : state === 'capturing' ? 'Sign now…'
    : state === 'ready' ? 'Ready. Choose Capture a sign and sign one word over about one second, or Show live view to watch the model guess as you sign.'
    : state === 'live' ? 'Live view on. Sign a word and watch the guess.' : state === 'off' ? 'Sign recognition is off.' : '';
  return <section className="signer-words" aria-labelledby="signer-words-title">
    <div className="signer-words__heading"><h2 id="signer-words-title">Sign recognition</h2><span>Signer only</span></div>
    <p>Sign live and your confident signs become a sentence you can review before it is sent. Or capture one sign at a time; it gets the same review.</p>
    <label className="field">Words to recognize<select value={source} disabled={enabled} onChange={event => { setSource(event.target.value as 'shared' | 'personal'); setLabels([]); setError(''); }}>
      <option value="shared">Shared words</option>
      {user && <option value="personal">Shared words + my signs</option>}
    </select></label>
    <p><a href="#/training">{user ? 'Teach or manage my signs' : 'Sign in with GitHub to teach your own signs'}</a></p>
    {modelWords.length > 0 && <p className="signer-words__vocabulary">Words recognized ({modelWords.length}): {modelWords.join(', ')}.</p>}
    <p className="note">{source === 'personal' ? 'My signs are checked first, then the shared words. Your saved examples are downloaded privately from your account; new examples captured in a call stay on this device.' : 'Recognition stays on this device and does not upload recordings or hand data.'} It can make mistakes.</p>
    <label className="signer-words__dictate"><input type="checkbox" checked={autoSend} onChange={event => chooseAutoSend(event.target.checked)} /><span>Send automatically after preview</span></label>
    <div className="button-row">
      {!enabled ? <Button variant="primary" disabled={!connected} aria-describedby={connected ? undefined : 'signer-words-status'} onClick={() => void enable()}>Enable sign recognition</Button> : <>
        <Button variant="primary" disabled={busy || !connected} aria-describedby={connected ? undefined : 'signer-words-status'} onClick={() => void capture()}>{state === 'capturing' ? 'Capturing…' : 'Capture a sign'}</Button>
        <Button id="signer-words-live-toggle" disabled={busy} onClick={() => state === 'live' ? unwatchLive() : watchLive()}>{state === 'live' ? 'Hide live view' : 'Show live view'}</Button>
        <Button onClick={stop}>Stop sign recognition</Button>
      </>}
    </div>
    <p id="signer-words-status" role="status">{statusText}</p>
    <p className="cap-sr" role="status" aria-live="polite">{announcement}</p>
    {state === 'loading' && <progress aria-label="Loading sign recognition" />}
    {state === 'live' && <div className="signer-words__live">
      <canvas ref={liveCanvas} aria-label="What the hand model sees" />
      <div role="status" aria-live="off">
        <label className="signer-words__dictate"><input type="checkbox" checked={dictating} onChange={event => {
          setDictating(event.target.checked);
          if (!event.target.checked) { dictation.current.clear(); setSigned([]); }
        }} /><span>Live dictation</span></label>
        <p className="note">Confident signs are added as you sign. Lower your hand to review the sentence before it is sent.</p>
        <p>{tracked === 2 ? '2 hands tracked.' : tracked === 1 ? '1 hand tracked.' : 'No hands found. Raise your hands into view.'}</p>
        {live ? <>
          <p className="signer-words__word">{signLabel(live.label)} <span>{Math.round(live.score * 100)}% match</span></p>
          <p id="signer-words-live-hint">{live.accepted ? 'Confident match over the last second.' : heldReason(live)}</p>
          {!dictating && <Button variant="primary" disabled={!live.accepted || preview !== null} aria-describedby="signer-words-live-hint" onClick={() => { if (live.accepted) startPreview([{ label: live.label, score: live.score }]); }}>Review “{signLabel(live.label)}”</Button>}
        </> : <p>Collecting the first second of frames…</p>}
      </div>
      {dictating && !preview && <div className="signer-words__dictation">
        <p className="signer-words__signed">{signed.map(word => signLabel(word.label)).join(' ')}</p>
        {!signed.length && <p className="note">Sign a word to start a sentence.</p>}
        {signed.length > 0 && <div className="button-row">
          <Button variant="primary" onClick={() => startPreview(dictation.current.flush()?.words ?? [])}>Review sentence</Button>
          <Button onClick={() => { dictation.current.clear(); setSigned([]); }}>Clear</Button>
        </div>}
      </div>}
    </div>}
    {preview && <div className="signer-words__preview" role="group" aria-label="Sentence ready to send">
      {preview.text ? <>
        <p className="note">{autoSend && connected ? 'About to send' : 'Ready to send'}</p>
        <p className="signer-words__signed">{preview.text}</p>
        {autoSend && connected && <>
          <p className="note" aria-hidden="true">Sending in {Math.max(remaining, 0)}s…</p>
          <progress aria-hidden="true" max={PREVIEW_SECONDS} value={PREVIEW_SECONDS - remaining} />
        </>}
        {!connected && <p className="note" id="signer-words-preview-hint">Reconnecting… you can send again in a moment.</p>}
        <div className="button-row">
          <Button id="signer-words-send" variant="primary" disabled={!connected} aria-describedby={connected ? undefined : 'signer-words-preview-hint'} onClick={() => void confirmPreview()}>Send now</Button>
          <Button onClick={cancelPreview}>Cancel</Button>
        </div>
      </> : <>
        <p>Preparing your sentence…</p>
        <div className="button-row"><Button onClick={cancelPreview}>Cancel</Button></div>
      </>}
    </div>}
    {sentStatus && <p className="note" role="status">{sentStatus}</p>}
    {state === 'capturing' && <progress aria-label="Sign capture progress" max={30} value={progress} />}
    {prediction && <div className="signer-words__review" role="status">
      <p>No confident match. Try again with one hand in view, or type your caption.</p><p className="note">{heldReason(prediction)}</p>
    </div>}
    {error && <p className="signer-words__error" role="alert">{error}</p>}
  </section>;
}
