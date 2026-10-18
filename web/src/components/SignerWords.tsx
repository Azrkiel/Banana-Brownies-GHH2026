import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPersonalRecognizer, createWordRecognizer, type LiveFrame, type WordRecognizer } from '../lib/wordRecognition';
import { useAuth } from '../lib/auth';
import { loadPersonalSamples } from '../lib/personalSigns';
import { trainPersonalModel } from '../lib/personalModel';
import type { WordPrediction } from '../lib/wordModel';
import { createDictation, type DictatedWord } from '../lib/dictation';
import { Button } from './ui';
import './SignerWords.css';

type State = 'off' | 'loading' | 'ready' | 'live' | 'capturing' | 'review' | 'failed';
type Preview = { words: DictatedWord[]; text: string | null };

/** Seconds the signer sees the sentence before it is sent on its own. */
const PREVIEW_SECONDS = 3;

const HAND_LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

const COMPOUNDS: Record<string, string> = { THANKYOU: 'Thank you', GOODBYE: 'Goodbye', GOODMORNING: 'Good morning', GOODNIGHT: 'Good night' };
/** Sign keys like HELLO or _idle become labels a person would read. */
function signLabel(key: string): string {
  if (key === '_idle') return 'Resting (no sign)';
  const known = COMPOUNDS[key.toUpperCase()];
  if (known) return known;
  return key.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, letter => letter.toUpperCase());
}

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Draws the mirrored frame the hand model saw, with its landmarks, so the signer can see what is tracked. */
function drawLive(canvas: HTMLCanvasElement | null, frame: LiveFrame) {
  const context = canvas?.getContext('2d');
  if (!canvas || !context || !frame.image.width) return;
  canvas.width = 320; canvas.height = Math.round(320 * frame.image.height / frame.image.width);
  context.drawImage(frame.image, 0, 0, canvas.width, canvas.height);
  if (!frame.points) return;
  const at = (i: number) => [frame.points![i].x * canvas.width, frame.points![i].y * canvas.height];
  context.strokeStyle = '#3ddc84'; context.fillStyle = '#ffffff'; context.lineWidth = 2;
  for (const [a, b] of HAND_LINKS) { context.beginPath(); context.moveTo(...at(a) as [number, number]); context.lineTo(...at(b) as [number, number]); context.stroke(); }
  for (let i = 0; i < 21; i++) { const [x, y] = at(i); context.beginPath(); context.arc(x, y, 3, 0, Math.PI * 2); context.fill(); }
}

/** Why a guess was held back, in terms the signer can act on. */
function heldReason(prediction: WordPrediction): string {
  if ((prediction.framesWithHand ?? 0) < 24) return 'Keep your hands in view — the sign wasn’t clear enough.';
  return 'Not sure about this sign. Try again, or type the word yourself.';
}
type Props = {
  camera: RefObject<HTMLVideoElement | null>; connected: boolean; onUse(word: string): boolean;
  /** Turns dictated signs into the sentence shown in the preview. */
  onPrepare(words: DictatedWord[]): Promise<string>;
  /** Sends the previewed sentence; resolves to the text that was sent, or null if it was not. */
  onSentence(text: string): Promise<string | null>;
};

/** Signer-only. Live dictation previews confident signs before sending; capture mode always waits for confirmation. */
export function SignerWords(props: Props) {
  // A connection change invalidates the entire recognition session and its review.
  return <SignerWordSession key={props.connected ? 'connected' : 'disconnected'} {...props} />;
}

function SignerWordSession({ camera, connected, onUse, onPrepare, onSentence }: Props) {
  const { user } = useAuth();
  const [source, setSource] = useState<'shared' | 'personal'>('shared');
  const [state, setState] = useState<State>('off');
  const [labels, setLabels] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [prediction, setPrediction] = useState<WordPrediction | null>(null);
  const [live, setLive] = useState<WordPrediction | null>(null);
  const [tracked, setTracked] = useState(false);
  const liveCanvas = useRef<HTMLCanvasElement>(null);
  const stopLive = useRef<(() => void) | null>(null);
  const [error, setError] = useState('');
  const engine = useRef<WordRecognizer | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [dictating, setDictating] = useState(true);
  const [signed, setSigned] = useState<DictatedWord[]>([]);
  const [sentStatus, setSentStatus] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [remaining, setRemaining] = useState(PREVIEW_SECONDS);
  const previewRef = useRef<Preview | null>(null);
  const dictation = useRef(createDictation());
  const dictatingRef = useRef(true);
  const sentenceRef = useRef(onSentence);
  const prepareRef = useRef(onPrepare);
  useEffect(() => { sentenceRef.current = onSentence; prepareRef.current = onPrepare; dictatingRef.current = dictating; });

  /** Every dictated sentence waits here: the signer sees it, and can send it now or cancel, before it goes out. */
  function startPreview(words: DictatedWord[]) {
    if (!words.length) return;
    if (previewRef.current) { dictation.current.load(words); setSigned(words); return; }
    const attempt = generation.current;
    const entry: Preview = { words, text: null };
    previewRef.current = entry;
    dictation.current.clear(); setSigned([]); setSentStatus(''); setPreview(entry); setRemaining(PREVIEW_SECONDS);
    prepareRef.current(words).catch(() => words.map(word => word.label).join(' ')).then(text => {
      if (attempt !== generation.current || previewRef.current !== entry) return;
      const ready: Preview = { words, text };
      previewRef.current = ready; setPreview(ready); setRemaining(PREVIEW_SECONDS);
    });
  }
  async function confirmPreview() {
    const entry = previewRef.current;
    if (!entry?.text) return;
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
    const restored = [...entry.words, ...dictation.current.words];
    dictation.current.load(restored); setSigned(dictation.current.words);
    setSentStatus('Cancelled. Your words are kept as a draft.');
  }
  useEffect(() => {
    if (!preview?.text) return;
    if (remaining <= 0) { void confirmPreview(); return; }
    const timer = setTimeout(() => setRemaining(seconds => seconds - 1), 1000);
    return () => clearTimeout(timer);
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, remaining]);

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
      setTracked(Boolean(frame.points)); setLive(guess);
      if (!dictatingRef.current) return;
      const event = dictation.current.push(guess, Boolean(frame.points), performance.now());
      if (event?.type === 'word') setSigned(event.words);
      if (event?.type === 'sentence') startPreview(event.words);
    });
  }
  function unwatchLive() {
    stopLive.current?.(); stopLive.current = null; dictation.current.clear();
    setSigned([]); setLive(null); setTracked(false); setState('ready');
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
      setPrediction(result); setState('review');
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
  return <section className="signer-words" aria-labelledby="signer-words-title">
    <div className="signer-words__heading"><h2 id="signer-words-title">Your trained signs</h2><span>Signer only</span></div>
    <p>Sign live and your confident signs become a sentence you can review before it is sent. Or capture one word at a time and add it to your caption.</p>
    <label className="field">Recognition model<select value={source} disabled={enabled} onChange={event => { setSource(event.target.value as 'shared' | 'personal'); setLabels([]); setError(''); }}>
      <option value="shared">Shared words</option>
      {user && <option value="personal">Shared words + my signs</option>}
    </select></label>
    <p><a href="#/training">{user ? 'Teach or manage your personal signs' : 'Sign in with GitHub to teach your own signs'}</a></p>
    {modelWords.length > 0 && <p className="signer-words__vocabulary">Trained words ({modelWords.length}): {modelWords.join(', ')}.</p>}
    <p className="note">{source === 'personal' ? 'Your signs are checked first, then the shared words. Your saved examples are downloaded privately from your account; new call captures stay on this device.' : 'Recognition stays on this device and does not upload recordings or hand data.'} It can make mistakes.</p>
    <div className="button-row">
      {!enabled ? <Button variant="primary" disabled={!connected} aria-describedby={connected ? undefined : 'signer-words-status'} onClick={() => void enable()}>Enable sign recognition</Button> : <>
        <Button variant="primary" disabled={busy} onClick={() => void capture()}>{state === 'capturing' ? 'Capturing…' : 'Capture a sign'}</Button>
        <Button disabled={busy} onClick={() => state === 'live' ? unwatchLive() : watchLive()}>{state === 'live' ? 'Hide live view' : 'Show live view'}</Button>
        <Button onClick={stop}>Stop sign recognition</Button>
      </>}
    </div>
    <p id="signer-words-status" role="status">{!connected ? 'Join the call to use your trained signs.' : state === 'loading' ? 'Loading sign recognition…' : state === 'capturing' ? 'Sign now…' : state === 'ready' ? 'Ready. Choose Capture a sign and sign one word over about one second, or Show live view to watch the model guess as you sign.' : state === 'live' ? 'Live view on. Sign a word and watch the guess.' : state === 'off' ? 'Sign recognition is off.' : ''}</p>
    {state === 'loading' && <progress aria-label="Loading sign recognition" />}
    {state === 'live' && <div className="signer-words__live">
      <canvas ref={liveCanvas} aria-label="What the hand model sees" />
      <div role="status" aria-live="off">
        <label className="signer-words__dictate"><input type="checkbox" checked={dictating} onChange={event => {
          setDictating(event.target.checked);
          if (!event.target.checked) { dictation.current.clear(); setSigned([]); }
        }} /><span>Live dictation</span></label>
        <p className="note">Confident signs are added as you sign. Lower your hand to review the sentence before it is sent.</p>
        <p>{tracked ? 'Hand tracked.' : 'No hand found. Raise one hand into view.'}</p>
        {live ? <>
          <p className="signer-words__word">{signLabel(live.label)} <span>{Math.round(live.score * 100)}% match</span></p>
          <p id="signer-words-live-hint">{live.accepted ? 'Confident match over the last second.' : heldReason(live)}</p>
          {!dictating && <Button variant="primary" disabled={!live.accepted} aria-describedby="signer-words-live-hint" onClick={() => { if (live.accepted) onUse(signLabel(live.label)); }}>Add “{signLabel(live.label)}” to caption</Button>}
        </> : <p>Collecting the first second of frames…</p>}
      </div>
      {dictating && <div className="signer-words__dictation" aria-live="polite">
        {preview ? <div className="signer-words__preview">
          {preview.text ? <>
            <p className="note">About to send</p>
            <p className="signer-words__signed">{preview.text}</p>
            <p className="note" aria-hidden="true">Sending in {Math.max(remaining, 0)}s…</p>
            <progress aria-hidden="true" max={PREVIEW_SECONDS} value={PREVIEW_SECONDS - remaining} />
            <div className="button-row">
              <Button variant="primary" onClick={() => void confirmPreview()}>Send now</Button>
              <Button onClick={cancelPreview}>Cancel</Button>
            </div>
          </> : <>
            <p>Preparing your sentence…</p>
            <div className="button-row"><Button onClick={cancelPreview}>Cancel</Button></div>
          </>}
        </div> : <>
          <p className="signer-words__signed">{signed.map(word => signLabel(word.label)).join(' ')}</p>
          {!signed.length && <p className="note">Sign a word to start a sentence.</p>}
          {signed.length > 0 && <div className="button-row">
            <Button variant="primary" onClick={() => startPreview(dictation.current.flush()?.words ?? [])}>Review sentence</Button>
            <Button onClick={() => { dictation.current.clear(); setSigned([]); }}>Clear</Button>
          </div>}
        </>}
        {sentStatus && <p className="note">{sentStatus}</p>}
      </div>}
    </div>}
    {state === 'capturing' && <progress aria-label="Sign capture progress" max={30} value={progress} />}
    {prediction && <div className="signer-words__review" role="status">
      {prediction.accepted ? <>
        <p className="signer-words__word">{signLabel(prediction.label)}</p>
        <p>Does this match your sign?</p>
        <Button variant="primary" onClick={() => {
          if (onUse(signLabel(prediction.label))) { setPrediction(null); setState('ready'); }
        }}>Add “{signLabel(prediction.label)}” to caption</Button>
        <p className="note">Review or edit the caption, then choose Send. Nothing is sent automatically.</p>
      </> : <><p>No confident match. Try again with one hand in view, or type your caption.</p><p className="note">{heldReason(prediction)}</p></>}
    </div>}
    {error && <p className="signer-words__error" role="alert">{error}</p>}
  </section>;
}
