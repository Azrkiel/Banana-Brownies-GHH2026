import { useEffect, useRef, useState } from 'react';
import { Button, Badge, Icon, PageHeader, Surface } from '../components/ui';
import { createWordRecognizer, type WordRecognizer } from '../lib/wordRecognition';
import { WORD_FEATURES, WORD_FRAMES, type WordPrediction } from '../lib/wordModel';
import './Studio.css';

type Phase = 'off' | 'starting' | 'ready' | 'countdown' | 'capturing' | 'failed';
type Kept = { label: string; features: number[]; framesWithHand: number; modelPrediction: WordPrediction };

const WORD = /^[A-Z][A-Z ]{0,39}$/;
const MIN_HAND_FRAMES = 24;
const TARGET = 30;
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const percent = (value: number) => `${Math.round(value * 100)}%`;

function download(signer: string, modelSha256: string | null, samples: Kept[]) {
  const body = JSON.stringify({
    version: 1, kind: 'signline-word-samples', preprocessing: 'mirrored-one-hand-wrist-relative-xy',
    frames: WORD_FRAMES, featuresPerFrame: WORD_FEATURES, signer, recordedAt: new Date().toISOString(), modelSha256, samples,
  }, (_key, value) => typeof value === 'number' ? Math.round(value * 1e5) / 1e5 : value);
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${signer}-words-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function WordTrainer() {
  const [signer, setSigner] = useState('');
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>('off');
  const [words, setWords] = useState<string[]>([]);
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [word, setWord] = useState('');
  const [draft, setDraft] = useState('');
  const [samples, setSamples] = useState<Kept[]>([]);
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const engine = useRef<WordRecognizer | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);

  function release() {
    generation.current++;
    request.current?.abort(); request.current = null;
    engine.current?.close(); engine.current = null;
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  useEffect(() => {
    const hide = () => { release(); setPhase('off'); };
    window.addEventListener('pagehide', hide);
    return () => { window.removeEventListener('pagehide', hide); release(); };
  }, []);

  async function start() {
    if (!consent || !video.current || request.current) return;
    release();
    const attempt = generation.current;
    const controller = new AbortController();
    request.current = controller;
    setError(''); setMessage(''); setPhase('starting');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 }, audio: false });
      if (generation.current !== attempt) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const element = video.current;
      if (!element) throw new Error('Camera preview is unavailable.');
      element.srcObject = media;
      await element.play();
      const recognizer = await createWordRecognizer(element, controller.signal);
      if (generation.current !== attempt) { recognizer.close(); return; }
      engine.current = recognizer;
      setVocabulary(recognizer.labels);
      const merged = [...recognizer.labels, ...words.filter(value => !recognizer.labels.includes(value))];
      setWords(merged); setWord(previous => merged.includes(previous) ? previous : merged[0]);
      setPhase('ready');
    } catch {
      if (generation.current !== attempt) return;
      release();
      setError('Could not start the camera or the word model. Check camera permission and try again.');
      setPhase('failed');
    }
  }
  function stop() { release(); setPhase('off'); setProgress(0); setCountdown(0); setMessage(''); }

  async function capture() {
    const recognizer = engine.current;
    if (!recognizer || !word || phase !== 'ready') return;
    const attempt = generation.current;
    setError(''); setMessage(''); setProgress(0); setPhase('countdown');
    try {
      for (let step = 3; step > 0; step--) {
        setCountdown(step);
        await wait(500);
        if (generation.current !== attempt) return;
      }
      setPhase('capturing');
      const sample = await recognizer.captureSample(frames => { if (generation.current === attempt) setProgress(frames); });
      if (generation.current !== attempt) return;
      setPhase('ready');
      if (sample.framesWithHand < MIN_HAND_FRAMES) {
        setMessage(`Only ${sample.framesWithHand} of ${WORD_FRAMES} frames had a hand, so this sample was not kept. Keep one hand in view and try again.`);
        return;
      }
      const modelPrediction = recognizer.predict(sample.features, sample.framesWithHand);
      const total = samples.filter(item => item.label === word).length + 1;
      setSamples(current => [...current, { label: word, ...sample, modelPrediction }]);
      setMessage(`Saved sample ${total} for ${word}. Current model guessed: ${modelPrediction.label} (${percent(modelPrediction.score)}, ${modelPrediction.accepted ? 'accepted' : 'not confident'}).`);
    } catch {
      if (generation.current !== attempt) return;
      release(); setPhase('failed');
      setError('Capture stopped. Start the camera to try again.');
    }
  }

  function addWord() {
    const value = draft.trim().toUpperCase().replace(/ +/g, ' ');
    if (!WORD.test(value)) { setError('Use letters and spaces only, starting with a letter, up to 40 characters.'); return; }
    if (words.includes(value)) { setError(`${value} is already in the list.`); return; }
    setError(''); setWords(current => [...current, value]); setWord(value); setDraft('');
  }

  const busy = phase === 'countdown' || phase === 'capturing';
  const live = phase === 'ready' || busy;
  const count = (value: string) => samples.filter(item => item.label === value).length;
  const right = (value: string) => samples.filter(item => item.label === value && item.modelPrediction.accepted && item.modelPrediction.label === value).length;
  const known = samples.filter(item => vocabulary.includes(item.label));
  const knownRight = known.filter(item => item.modelPrediction.accepted && item.modelPrediction.label === item.label).length;
  const status = error || message || (phase === 'starting' ? 'Starting camera and word model…' : phase === 'countdown' ? `Get ready… ${countdown}` : phase === 'capturing' ? 'Sign now…' : phase === 'ready' ? 'Ready. Choose a word, then Capture sample and sign it once.' : '');

  return (
    <main className="studio-page" id="main-content">
      <PageHeader title="Train words" accessory={<Badge tone={busy ? 'warning' : live ? 'positive' : 'neutral'}>{busy ? 'Capturing' : live ? 'Camera ready' : 'Local capture'}</Badge>} />
      <div className="recorder-consent ui-surface"><Icon name="shield" /><div><h2>Consent</h2>
        <p>Samples are hand landmark numbers, not video. They stay on this device until you download them; nothing is uploaded. Recognition also runs locally, and this page does not change the shipped model.</p>
        <label className="check-field"><input type="checkbox" checked={consent} onChange={event => { if (!event.target.checked) stop(); setConsent(event.target.checked); }} /><span>I consent to recording my hand landmarks for this project.</span></label>
      </div></div>
      <div className="studio-layout recorder-layout">
        <div className="recorder-workspace">
          <section className="camera-stage" aria-label="Training camera preview">
            <video ref={video} muted playsInline className="mirror" width={480} />
            {!live && <div className="camera-stage__placeholder">{phase === 'starting' && <p>Loading camera…</p>}</div>}
            <span className="camera-stage__label"><span className="status-dot" />{busy ? 'Capturing landmarks' : live ? 'Local preview · Mirrored' : 'Camera off'}</span>
          </section>
          <div className="recorder-camera-controls"><p role="status">{status}</p>
            {live || phase === 'starting'
              ? <Button disabled={busy} onClick={stop}><Icon name="camera" />Stop camera</Button>
              : <Button disabled={!consent} onClick={() => void start()}><Icon name="camera" />Start camera</Button>}
          </div>
          {phase === 'capturing' && <progress className="trainer-progress" aria-label="Sample capture progress" max={WORD_FRAMES} value={progress} />}
          <Surface className="clip-library" aria-labelledby="trainer-table-title"><div className="panel-heading"><h2 id="trainer-table-title">Samples</h2><Badge>{samples.length} samples</Badge></div>
            <p className="note">Aim for {TARGET}+ samples per word. Vary distance, position and lighting a little between samples.</p>
            <table className="trainer-table"><thead><tr><th scope="col">Word</th><th scope="col">Samples</th><th scope="col">Current model right</th></tr></thead>
              <tbody>{words.map(value => <tr key={value}><th scope="row">{value}</th><td>{count(value)} / {TARGET}</td><td>{vocabulary.includes(value) ? `${right(value)} of ${count(value)}` : 'new word'}</td></tr>)}</tbody></table>
            <p className="studio-status" role="status">{known.length ? `Current model: correct ${knownRight} of ${known.length} samples for words it knows.` : 'Record samples to check the current model.'}</p>
            <div className="button-row"><Button disabled={busy || !samples.length} onClick={() => setSamples(current => current.slice(0, -1))}>Undo last</Button>
              <Button disabled={busy || !samples.length || !signer || !consent} onClick={() => download(signer, engine.current?.modelSha256 ?? null, samples)}><Icon name="download" />Download ({samples.length})</Button></div>
            <p className="note">Download before leaving; samples are not saved online.</p>
          </Surface>
        </div>
        <aside className="studio-sidebar">
          <Surface aria-labelledby="trainer-session"><h2 id="trainer-session">Session</h2>
            <label className="field">Signer ID <input placeholder="e.g. liv" value={signer} disabled={busy || samples.length > 0} onChange={event => setSigner(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} /></label>
            <p className="note">Use a pseudonym. Locks after the first sample.</p>
          </Surface>
          <Surface aria-labelledby="trainer-capture"><h2 id="trainer-capture">Capture</h2>
            <label className="field">Word <select aria-label="Word" value={word} disabled={busy || !words.length} onChange={event => setWord(event.target.value)}>{words.map(value => <option key={value} value={value}>{value} ({count(value)})</option>)}</select></label>
            <Button variant="primary" disabled={phase !== 'ready' || !word} onClick={() => void capture()}><Icon name="record" />{busy ? 'Capturing…' : 'Capture sample'}</Button>
            <label className="field">Add a word <input placeholder="e.g. THANK YOU" value={draft} maxLength={40} disabled={busy} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') addWord(); }} /></label>
            <Button disabled={busy || !draft.trim()} onClick={addWord}>Add word</Button>
            <p className="note">Sign the word once over about one second, with one hand in view. Samples with fewer than {MIN_HAND_FRAMES} hand frames are discarded.</p>
          </Surface>
        </aside>
      </div>
    </main>
  );
}
