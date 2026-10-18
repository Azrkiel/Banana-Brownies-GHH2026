import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPersonalRecognizer, createWordRecognizer, type WordRecognizer } from '../lib/wordRecognition';
import { useAuth } from '../lib/auth';
import { loadPersonalSamples } from '../lib/personalSigns';
import { trainPersonalModel } from '../lib/personalModel';
import type { WordPrediction } from '../lib/wordModel';
import { Button } from './ui';
import './SignerWords.css';

type State = 'off' | 'loading' | 'ready' | 'capturing' | 'review' | 'failed';
type Props = { camera: RefObject<HTMLVideoElement | null>; connected: boolean; onUse(word: string): boolean };

/** Signer-only, explicit capture and confirmation; suggestions never send themselves. */
export function SignerWords(props: Props) {
  // A connection change invalidates the entire recognition session and its review.
  return <SignerWordSession key={props.connected ? 'connected' : 'disconnected'} {...props} />;
}

function SignerWordSession({ camera, connected, onUse }: Props) {
  const { user } = useAuth();
  const [source, setSource] = useState<'shared' | 'personal'>('shared');
  const [state, setState] = useState<State>('off');
  const [labels, setLabels] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [prediction, setPrediction] = useState<WordPrediction | null>(null);
  const [error, setError] = useState('');
  const engine = useRef<WordRecognizer | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);

  function release() {
    generation.current++;
    request.current?.abort(); request.current = null;
    engine.current?.close(); engine.current = null;
  }
  useEffect(() => {
    const hide = () => { release(); setState('off'); setPrediction(null); };
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
      setLabels(recognizer.labels); setState('ready');
    } catch (cause) {
      if (generation.current !== attempt) return;
      release();
      setError(source === 'personal' && cause instanceof Error ? cause.message : 'Could not start sign recognition. Try again or type your caption.');
      setState('failed');
    }
  }
  async function capture() {
    const recognizer = engine.current;
    if (!connected || !recognizer || state === 'capturing') return;
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
  function stop() { release(); setState('off'); setPrediction(null); setError(''); setProgress(0); }
  const enabled = !['off', 'failed'].includes(state);
  return <section className="signer-words" aria-labelledby="signer-words-title">
    <div className="signer-words__heading"><h2 id="signer-words-title">Your trained signs</h2><span>Signer only</span></div>
    <p>Capture one trained word, then review it before adding it to your caption.</p>
    <label className="field">Recognition model<select value={source} disabled={enabled} onChange={event => { setSource(event.target.value as 'shared' | 'personal'); setLabels([]); setError(''); }}>
      <option value="shared">Shared seven-word model</option>
      {user && <option value="personal">Shared words + my signs</option>}
    </select></label>
    <p><a href="#/training">{user ? 'Teach or manage your personal signs' : 'Sign in with GitHub to teach your own signs'}</a></p>
    {labels.length > 0 && <p className="signer-words__vocabulary">Trained words: {labels.join(', ')}.</p>}
    <p className="note">{source === 'personal' ? 'Your signs are checked first, then the shared words. Your saved examples are downloaded privately from your account; new call captures stay on this device.' : 'Recognition stays on this device and does not upload recordings or hand data.'} It can make mistakes.</p>
    <div className="button-row">
      {!enabled ? <Button variant="primary" disabled={!connected} onClick={() => void enable()}>Enable sign recognition</Button> : <>
        <Button variant="primary" disabled={state === 'loading' || state === 'capturing'} onClick={() => void capture()}>{state === 'capturing' ? 'Capturing…' : 'Capture a sign'}</Button>
        <Button onClick={stop}>Stop sign recognition</Button>
      </>}
    </div>
    <p role="status">{!connected ? 'Connect to the room to use your trained signs.' : state === 'loading' ? 'Starting sign recognition…' : state === 'capturing' ? 'Sign now…' : state === 'ready' ? 'Ready. Choose Capture a sign and sign one word over about one second, keeping one hand in view.' : state === 'off' ? 'Sign recognition is off.' : ''}</p>
    {state === 'capturing' && <progress aria-label="Sign capture progress" max={30} value={progress} />}
    {prediction && <div className="signer-words__review" role="status">
      {prediction.accepted ? <>
        <p className="signer-words__word">{prediction.label}</p>
        <p>Model score {Math.round(prediction.score * 100)}%. Does this match your sign?</p>
        <Button variant="primary" onClick={() => {
          if (onUse(prediction.label)) { setPrediction(null); setState('ready'); }
        }}>Add {prediction.label} to caption</Button>
        <p className="note">Review or edit the caption, then choose Send. Nothing is sent automatically.</p>
      </> : <p>No confident match. Try again with one hand in view, or type your caption.</p>}
    </div>}
    {error && <p className="signer-words__error" role="alert">{error}</p>}
  </section>;
}
