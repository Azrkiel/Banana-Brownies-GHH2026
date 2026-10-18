import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPersonalRecognizer, createWordRecognizer, type LiveFrame, type WordRecognizer } from '../lib/wordRecognition';
import { LETTERS, LETTER_DECODER, createSpeller, loadBuiltinLetters, loadTaughtLetters, saveTaughtLetters, spellingHand, type LetterGuess, type TaughtLetters } from '../lib/letterModel';
import { useAuth } from '../lib/auth';
import { loadPersonalSamples } from '../lib/personalSigns';
import { trainPersonalModel } from '../lib/personalModel';
import type { WordPrediction } from '../lib/wordModel';
import { createDictation, type DictatedWord } from '../lib/dictation';
import { signLabel } from '../lib/signLabels';
import { sentenceOrFallback } from '../lib/signedSentence';
import { Button } from './ui';
import './SignerWords.css';
import { V2SignerWords } from './V2SignerWords';

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


/** A letter-mode word ends after the spelling hand has been out of view this long. */
const WORD_END_MS = 1200;
/** In letter mode, with no hand for this long, the sentence so far goes to review. */
const SENTENCE_END_MS = 3000;
const FS = 'fs-';
/** Sentence chips show a spelled word as its letters (K-E-V); everywhere else it reads as a name ("Kev"). */
const chipLabel = (key: string) => key.startsWith(FS) ? key.slice(FS.length).split('').join('-') : signLabel(key);

/** Why a guess was held back, in terms the signer can act on. */
function heldReason(prediction: WordPrediction): string {
  if ((prediction.framesWithHand ?? 0) < 24) return 'Keep your hands in view — the sign wasn’t clear enough.';
  return 'Not sure about this sign. Try again, or type the word yourself.';
}

export type SentenceDetails = { confidence: number; nmmTags: string[]; allowSpeak: boolean };
export type SignerWordsProps = {
  camera: RefObject<HTMLVideoElement | null>;
  /** True only while the call can send. A reconnect keeps this panel mounted and just pauses sending. */
  connected: boolean; reconnecting?: boolean;
  /** Tells the call whether recognized signs or a preview are waiting, so it can warn before the tab closes. */
  onPending?(pending: boolean): void;
  /** Every tracked frame while recognition is live (null when it stops), for drawing on the call's own video. */
  onFrame?(frame: LiveFrame | null): void;
  /** Turns dictated signs into the sentence shown in the preview. */
  onPrepare(words: DictatedWord[]): Promise<string>;
  /** Sends the previewed sentence; resolves to the text that was sent, or null if it was not. */
  onSentence(text: string, details?: SentenceDetails): Promise<string | null>;
  onRetract?(): void;
  onHypothesis?(words: DictatedWord[]): void;
};

/** Signer-only. Live dictation and single-sign capture both end in the same preview: Send now, Cancel, or send automatically. */
function LegacySignerWords({ camera, connected, reconnecting = false, onPending, onFrame, onPrepare, onSentence, onRetract }: SignerWordsProps) {
  const { user } = useAuth();
  const [source, setSource] = useState<'shared' | 'personal'>('shared');
  const [state, setState] = useState<State>('off');
  const [labels, setLabels] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [prediction, setPrediction] = useState<WordPrediction | null>(null);
  const [live, setLive] = useState<WordPrediction | null>(null);
  const [tracked, setTracked] = useState(0);
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
  // Letters mode: one steady handshape is one letter; End word (Space) or lowering the hand finishes the word.
  const [mode, setMode] = useState<'words' | 'letters'>('words');
  const modeRef = useRef<'words' | 'letters'>('words');
  const [spelling, setSpelling] = useState<string[]>([]);
  const spellingRef = useRef<string[]>([]);
  const [letterGuess, setLetterGuess] = useState<LetterGuess>(null);
  const [hold, setHold] = useState(0);
  const [taughtLetters, setTaughtLetters] = useState<TaughtLetters>(loadTaughtLetters);
  const taughtRef = useRef(taughtLetters);
  const [onlyTaught, setOnlyTaught] = useState(() => Object.values(loadTaughtLetters()).filter(rows => rows.length).length >= 2);
  const onlyTaughtRef = useRef(onlyTaught);
  const onlyTaughtTouched = useRef(false);
  const [teachLetter, setTeachLetter] = useState<string | null>(null);
  const teachRef = useRef<string | null>(null);
  const [lettersError, setLettersError] = useState('');
  const speller = useRef<ReturnType<typeof createSpeller> | null>(null);
  const handGoneAt = useRef<number | null>(null);
  const holdStreak = useRef<{ letter: string | null; frames: number }>({ letter: null, frames: 0 });
  /** Teaching: any steady hold (10 still frames) is saved; the next needs a move or a lowered hand first. */
  const teachHold = useRef<{ frames: number; locked: boolean }>({ frames: 0, locked: false });
  const retractRef = useRef(onRetract); retractRef.current = onRetract;
  const frameRef = useRef(onFrame);
  const dictatingRef = useRef(true);
  const connectedRef = useRef(connected);
  const sentenceRef = useRef(onSentence);
  const prepareRef = useRef(onPrepare);
  const pendingRef = useRef(onPending);
  const focusBefore = useRef<HTMLElement | null>(null);
  const focusMoved = useRef(false);
  useEffect(() => { sentenceRef.current = onSentence; prepareRef.current = onPrepare; pendingRef.current = onPending; dictatingRef.current = dictating; connectedRef.current = connected; frameRef.current = onFrame; });
  useEffect(() => { modeRef.current = mode; teachRef.current = teachLetter; onlyTaughtRef.current = onlyTaught; taughtRef.current = taughtLetters; });

  function setSpell(next: string[]) { spellingRef.current = next; setSpelling(next); }
  /** Finishes the spelled word: it joins the sentence as fs-WORD, which the sentence step writes as a name. */
  function endWord() {
    const letters = spellingRef.current;
    if (!letters.length) return;
    setSpell([]);
    const words = [...dictation.current.words, { label: FS + letters.join(''), score: 1 }];
    dictation.current.load(words); setSigned(dictation.current.words);
  }
  function chooseMode(next: 'words' | 'letters') {
    if (next === modeRef.current) return;
    if (modeRef.current === 'letters') endWord();
    modeRef.current = next; setMode(next);
    setLetterGuess(null); setHold(0); speller.current?.reset(); handGoneAt.current = null;
    if (next === 'letters' && !speller.current) {
      setLettersError('');
      loadBuiltinLetters().then(builtin => { speller.current = createSpeller(builtin); }).catch(() => setLettersError('Could not load the letter model. Taught letters still work after a reload.'));
    }
    if (next === 'words') { setTeachLetter(null); }
  }
  function saveLetterExample(letter: string, shape: number[]) {
    const next = { ...taughtRef.current, [letter]: [...(taughtRef.current[letter] ?? []), shape] };
    taughtRef.current = next; setTaughtLetters(next); saveTaughtLetters(next);
    if (!onlyTaughtTouched.current && Object.values(next).filter(rows => rows.length).length >= 2) { onlyTaughtRef.current = true; setOnlyTaught(true); }
  }
  function forgetLetter(letter: string) {
    const next = { ...taughtRef.current }; delete next[letter];
    taughtRef.current = next; setTaughtLetters(next); saveTaughtLetters(next);
  }
  // Space or Enter ends the spelled word, Backspace removes the last letter, L switches mode (never while typing).
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (typingField(document.activeElement) || event.metaKey || event.ctrlKey || event.altKey || !stopLive.current) return;
      if (event.key === 'l' || event.key === 'L') { chooseMode(modeRef.current === 'words' ? 'letters' : 'words'); event.preventDefault(); return; }
      if (modeRef.current !== 'letters') {
        if (event.key === 'Backspace') {
          const draft = dictation.current.words;
          if (draft.length) { const next = draft.slice(0, -1); dictation.current.load(next); setSigned(next); }
          else retractRef.current?.();
          event.preventDefault();
        }
        return;
      }
      if ((event.key === ' ' || event.key === 'Enter') && !(document.activeElement instanceof HTMLButtonElement)) { endWord(); event.preventDefault(); }
      if (event.key === 'Backspace') { setSpell(spellingRef.current.slice(0, -1)); event.preventDefault(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
    stopLive.current?.(); stopLive.current = null; frameRef.current?.(null);
    setSpell([]); speller.current?.reset(); handGoneAt.current = null;
    request.current?.abort(); request.current = null;
    engine.current?.close(); engine.current = null;
  }
  useEffect(() => {
    const hide = () => { release(); setState('off'); setPrediction(null); setLive(null); };
    window.addEventListener('pagehide', hide);
    return () => { window.removeEventListener('pagehide', hide); release(); };
  }, []);

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
      frameRef.current?.(frame);
      setTracked(frame.hands.length); setLive(guess);
      const now = performance.now();
      if (modeRef.current === 'letters') { spellFrame(frame, now); return; }
      if (!dictatingRef.current) return;
      const event = dictation.current.push(guess, Boolean(frame.points), now);
      if (event?.type === 'word') setSigned(event.words);
      if (event?.type === 'sentence') startPreview(event.words);
    });
  }
  /** Letters mode, per frame: steady handshapes become letters; a lowered hand ends the word, then the sentence. */
  function spellFrame(frame: LiveFrame, now: number) {
    const hand = spellingHand(frame.hands, frame.pose);
    if (!hand) {
      handGoneAt.current ??= now;
      speller.current?.push(null, 1, now, taughtRef.current, onlyTaughtRef.current);
      setLetterGuess(null); setHold(0); holdStreak.current = { letter: null, frames: 0 }; teachHold.current = { frames: 0, locked: false };
      if (now - handGoneAt.current >= WORD_END_MS && spellingRef.current.length && !teachRef.current) endWord();
      if (now - handGoneAt.current >= SENTENCE_END_MS && !spellingRef.current.length && dictation.current.words.length && !previewRef.current && !teachRef.current) startPreview(dictation.current.flush()?.words ?? []);
      return;
    }
    handGoneAt.current = null;
    if (!speller.current) return;
    const aspect = frame.image.width && frame.image.height ? frame.image.width / frame.image.height : 4 / 3;
    const result = speller.current.push(hand, aspect, now, taughtRef.current, onlyTaughtRef.current);
    setLetterGuess(result.guess);
    const teaching = teachRef.current;
    if (teaching) {
      const t = teachHold.current;
      if (t.locked) { if (result.speed > 1.6) teachHold.current = { frames: 0, locked: false }; setHold(0); return; }
      t.frames = result.speed < 0.9 ? t.frames + 1 : 0;
      setHold(Math.min(1, t.frames / 10));
      if (t.frames >= 10 && result.shape) { saveLetterExample(teaching, result.shape); teachHold.current = { frames: 0, locked: true }; setHold(0); }
      return;
    }
    const streak = holdStreak.current;
    holdStreak.current = result.guess && result.guess.letter === streak.letter && result.speed < 0.9 ? { letter: streak.letter, frames: streak.frames + 1 } : { letter: result.guess?.letter ?? null, frames: result.guess ? 1 : 0 };
    setHold(Math.min(1, holdStreak.current.frames / LETTER_DECODER.frames));
    if (!result.letter) return;
    holdStreak.current = { letter: null, frames: 0 }; setHold(0);
    setSpell([...spellingRef.current, result.letter]);
  }
  function unwatchLive() {
    stopLive.current?.(); stopLive.current = null; frameRef.current?.(null); dictation.current.clear(); setSpell([]);
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
  const letterTaughtCount = Object.values(taughtLetters).filter(rows => rows.length).length;
  const live_ = state === 'live';
  return <section className="signer-words" aria-labelledby="signer-words-title">
    <div className="signer-words__heading"><h2 id="signer-words-title">Sign recognition</h2><span>Signer only</span></div>
    <div className="signer-words__grid">
      <div className="signer-words__controls">
        <div className="button-row">
          {!enabled ? <Button variant="primary" disabled={!connected} aria-describedby={connected ? undefined : 'signer-words-status'} onClick={() => void enable()}>Enable sign recognition</Button> : <>
            <Button id="signer-words-live-toggle" variant={live_ ? undefined : 'primary'} disabled={busy} onClick={() => live_ ? unwatchLive() : watchLive()}>{live_ ? 'Pause live signing' : 'Start live signing'}</Button>
            <Button disabled={busy || !connected || mode === 'letters'} onClick={() => void capture()}>{state === 'capturing' ? 'Capturing…' : 'Capture one sign'}</Button>
            <Button onClick={stop}>Stop recognition</Button>
          </>}
        </div>
        <p id="signer-words-status" role="status">{live_ ? (mode === 'letters' ? 'Letters: hold each letter still until the bar fills. Tracking is drawn on your video.' : 'Words: sign naturally. Tracking is drawn on your video; tap it to make it large.') : statusText}</p>
        {state === 'loading' && <progress aria-label="Loading sign recognition" />}
        {enabled && <div className="signer-words__modes" role="group" aria-label="What to recognize">
          <button type="button" aria-pressed={mode === 'words'} onClick={() => chooseMode('words')}>Words</button>
          <button type="button" aria-pressed={mode === 'letters'} onClick={() => chooseMode('letters')}>Letters (spell)</button>
          <span className="note">Press <kbd>L</kbd> to switch</span>
        </div>}
        {live_ && mode === 'words' && <div className="signer-words__now" role="status" aria-live="off">
          <p>{tracked === 2 ? '2 hands tracked.' : tracked === 1 ? '1 hand tracked.' : 'No hands found. Raise your hands into view.'}</p>
          {live ? <>
            <p className="signer-words__word">{signLabel(live.label)} <span>{Math.round(live.score * 100)}% match</span></p>
            <p id="signer-words-live-hint" className="note">{live.accepted ? 'Confident match over the last second.' : heldReason(live)}</p>
            {!dictating && <Button variant="primary" disabled={!live.accepted || preview !== null} aria-describedby="signer-words-live-hint" onClick={() => { if (live.accepted) startPreview([{ label: live.label, score: live.score }]); }}>Review “{signLabel(live.label)}”</Button>}
          </> : <p className="note">Collecting the first second of frames…</p>}
          <label className="signer-words__dictate"><input type="checkbox" checked={dictating} onChange={event => {
            setDictating(event.target.checked);
            if (!event.target.checked) { dictation.current.clear(); setSigned([]); }
          }} /><span>Live dictation (add confident signs automatically)</span></label>
        </div>}
        {live_ && mode === 'letters' && <div className="signer-words__now signer-words__letters" role="status" aria-live="off">
          <p className={`signer-words__letter ${letterGuess && letterGuess.score < 0.55 ? 'unsure' : ''}`}>{letterGuess?.letter ?? '—'}</p>
          <div className="signer-words__hold" aria-hidden="true"><span style={{ width: `${Math.round(hold * 100)}%` }} /></div>
          <p className="note">{teachLetter ? `Teaching ${teachLetter}: hold it still until the bar fills, then move or lower your hand. Repeat 3–5 times.`
            : letterGuess ? `${letterGuess.source === 'taught' ? 'Your taught letter' : 'Built-in guess'} · ${Math.round(letterGuess.score * 100)}%` : tracked ? 'Hold a letter steady.' : 'Raise your spelling hand into view.'}</p>
          {lettersError && <p className="signer-words__error" role="alert">{lettersError}</p>}
          <details className="signer-words__teach" open={letterTaughtCount < 2 || undefined}>
            <summary>Teach my letters ({letterTaughtCount} taught){letterTaughtCount < 2 ? ' · recommended' : ''}</summary>
            <p className="note">Letters you teach are matched first and are far more accurate than the built-in guess (96% vs 47% in tests). Saved on this device only.</p>
            <div className="signer-words__alphabet">{LETTERS.map(letter => {
              const n = taughtLetters[letter]?.length ?? 0;
              return <span key={letter} className={`chip ${n ? 'has' : ''} ${teachLetter === letter ? 'active' : ''}`}>
                <button type="button" aria-pressed={teachLetter === letter} onClick={() => { const next = teachLetter === letter ? null : letter; setTeachLetter(next); teachRef.current = next; teachHold.current = { frames: 0, locked: false }; }}>{letter}{n ? <small>{n}</small> : null}</button>
                {n > 0 && <button type="button" className="x" aria-label={`Forget ${letter}`} onClick={() => forgetLetter(letter)}>×</button>}
              </span>;
            })}</div>
            {teachLetter && <Button size="small" onClick={() => { setTeachLetter(null); teachRef.current = null; }}>Done teaching {teachLetter}</Button>}
            <label className="signer-words__dictate"><input type="checkbox" checked={onlyTaught} disabled={letterTaughtCount < 2} onChange={event => { onlyTaughtTouched.current = true; setOnlyTaught(event.target.checked); }} /><span>Only my taught letters{letterTaughtCount < 2 ? ' (teach 2+ first)' : ''}</span></label>
          </details>
        </div>}
        <details className="signer-words__options">
          <summary>Recognition options</summary>
          <label className="field">Words to recognize<select value={source} disabled={enabled} onChange={event => { setSource(event.target.value as 'shared' | 'personal'); setLabels([]); setError(''); }}>
            <option value="shared">Shared words</option>
            {user && <option value="personal">Shared words + my signs</option>}
          </select></label>
          <p><a href="#/training">{user ? 'Teach or manage my signs' : 'Sign in with GitHub to teach your own signs'}</a></p>
          {modelWords.length > 0 && <p className="signer-words__vocabulary">Words recognized ({modelWords.length}): {modelWords.join(', ')}.</p>}
          <p className="note">{source === 'personal' ? 'My signs are checked first, then the shared words. Your saved examples are downloaded privately from your account; new examples captured in a call stay on this device.' : 'Recognition stays on this device and does not upload recordings or hand data.'} It can make mistakes.</p>
          <label className="signer-words__dictate"><input type="checkbox" checked={autoSend} onChange={event => chooseAutoSend(event.target.checked)} /><span>Send automatically after preview</span></label>
        </details>
      </div>

      <div className="signer-words__sentence" aria-labelledby="signer-words-sentence-title">
        <h3 id="signer-words-sentence-title">Your sentence</h3>
        {!preview && <>
          <p className="signer-words__signed">{signed.map(word => chipLabel(word.label)).join(' ')}{spelling.length > 0 && <span className="signer-words__spelling">{signed.length ? ' ' : ''}{spelling.join('-')}<span aria-hidden="true">_</span></span>}</p>
          {!signed.length && !spelling.length && <p className="note">{live_ ? (mode === 'letters' ? 'Spelled letters appear here. End the word with the button, Space, or by lowering your hand.' : 'Signed words appear here as you sign.') : 'Start live signing to build a sentence.'}</p>}
          {mode === 'letters' && live_ && <div className="button-row">
            <Button variant="primary" disabled={!spelling.length} onClick={endWord}>End word <kbd className="key-hint" aria-hidden="true">Space</kbd></Button>
            <Button disabled={!spelling.length} onClick={() => setSpell(spelling.slice(0, -1))}>⌫ Letter</Button>
          </div>}
          {(signed.length > 0 || spelling.length > 0) && <div className="button-row">
            <Button variant={mode === 'letters' ? undefined : 'primary'} onClick={() => { endWord(); startPreview(dictation.current.flush()?.words ?? []); }}>Review sentence</Button>
            <Button onClick={() => { dictation.current.clear(); setSigned([]); setSpell([]); }}>Clear</Button>
          </div>}
        </>}
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
        <p className="cap-sr" role="status" aria-live="polite">{announcement}</p>
        {state === 'capturing' && <progress aria-label="Sign capture progress" max={30} value={progress} />}
        {prediction && <div className="signer-words__review" role="status">
          <p>No confident match. Try again with one hand in view, or type your caption.</p><p className="note">{heldReason(prediction)}</p>
        </div>}
        {error && <p className="signer-words__error" role="alert">{error}</p>}
      </div>
    </div>
  </section>;
}

export function SignerWords(props: SignerWordsProps) {
  const [fallback, setFallback] = useState(false);
  return fallback ? <><p role="status">Using the fallback recognizer. Verified v2 models are unavailable on this device.</p>
    <Button onClick={props.onRetract} disabled={!props.connected}>That was wrong</Button><LegacySignerWords {...props} /></>
    : <V2SignerWords {...props} onFallback={() => setFallback(true)} />;
}
