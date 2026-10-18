import { useEffect, useRef, useState } from 'react';
import { Classifier } from '../lib/classifier';
import { createTracker, type Tracker } from '../lib/landmarks';
import { V2Stream } from '../lib/v2Recognition';
import type { RecognitionMode } from '../lib/onnxProtocol';
import type { DictatedWord } from '../lib/dictation';
import { inferLandmarks } from '../lib/api';
import { useAuth } from '../lib/auth';
import { loadPersonalSamples } from '../lib/personalSigns';
import { predictPersonalSign, trainPersonalModel, type PersonalModel } from '../lib/personalModel';
import type { SignerWordsProps } from './SignerWords';
import { Button } from './ui';

const typing = (target: EventTarget | null) => target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName));
/** V2 review never converts a low recognition score into automatic permission to speak. */
export function V2SignerWords(props: SignerWordsProps & { onFallback(): void }) {
  const latest = useRef(props); latest.current = props;
  const { user } = useAuth();
  const [running, setRunning] = useState(false), [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<RecognitionMode>('auto'), [cloud, setCloud] = useState(false);
  const [personal, setPersonal] = useState(false);
  const [words, setWords] = useState<DictatedWord[]>([]), [text, setText] = useState('');
  const [preparing, setPreparing] = useState(false), [error, setError] = useState('');
  const [metrics, setMetrics] = useState(''), [cadence, setCadence] = useState('REST');
  const controller = useRef<AbortController | null>(null), tracker = useRef<Tracker | null>(null);
  const classifier = useRef<Classifier | null>(null), stream = useRef<V2Stream | null>(null);
  const privateModel = useRef<PersonalModel | null>(null), raf = useRef(0), epoch = useRef(0);
  const currentWords = useRef(words); currentWords.current = words;
  const spellingIndex = useRef<number | null>(null);
  const reviewGeneration = useRef(0), paused = useRef(false), sending = useRef(false);
  const consent = useRef(cloud); consent.current = cloud;
  function invalidate() { reviewGeneration.current++; setText(''); }
  function stop() {
    epoch.current++; controller.current?.abort(); controller.current = null;
    cancelAnimationFrame(raf.current); stream.current?.reset(); stream.current = null;
    tracker.current?.close(); tracker.current = null; classifier.current?.close(); classifier.current = null;
    privateModel.current = null; latest.current.onFrame?.(null); latest.current.onHypothesis?.([]); latest.current.onPending?.(false);
    setRunning(false); setLoading(false); paused.current = false; invalidate();
  }
  useEffect(() => {
    const hide = () => stop();
    window.addEventListener('pagehide', hide);
    return () => { window.removeEventListener('pagehide', hide); stop(); };
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (stream.current) stream.current.serverConsent = cloud; }, [cloud]);
  useEffect(() => { if (stream.current) { stream.current.mode = mode; stream.current.reset(); spellingIndex.current = null; } }, [mode]);
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => stop(), [user?.id]);
  useEffect(() => { latest.current.onPending?.(words.length > 0 || !!text); }, [words, text]);
  useEffect(() => { latest.current.onHypothesis?.(words); }, [words]);
  function replace(next: DictatedWord[]) { currentWords.current = next; setWords(next); invalidate(); }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Backspace' || typing(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      if (currentWords.current.length) { paused.current = false; replace(currentWords.current.slice(0, -1)); spellingIndex.current = null; }
      else latest.current.onRetract?.();
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  async function start() {
    if (!props.connected || !props.camera.current || loading) return;
    stop(); const attempt = epoch.current, abort = new AbortController(); controller.current = abort;
    setLoading(true); setError('');
    try {
      classifier.current = await Classifier.create(abort.signal);
      if (personal && user) privateModel.current = trainPersonalModel(await loadPersonalSamples(user.id, abort.signal), 1);
      const activeTracker = await createTracker({ withFace: true, interleaved: true });
      if (attempt !== epoch.current || abort.signal.aborted) { activeTracker.close(); return; }
      tracker.current = activeTracker;
      const pipeline = new V2Stream(classifier.current, features => inferLandmarks(features, abort.signal, () => consent.current, classifier.current!.manifest.c1_sha256));
      stream.current = pipeline; pipeline.mode = mode; pipeline.serverConsent = cloud;
      setRunning(true); setLoading(false);
      const image = document.createElement('canvas'), context = image.getContext('2d');
      let lastTime = -1, count = 0, started = performance.now();
      const latencies: number[] = [];
      const loop = () => {
        if (attempt !== epoch.current || abort.signal.aborted) return;
        try {
          const video = latest.current.camera.current;
          if (video && video.readyState >= 2 && video.currentTime !== lastTime && context) {
            lastTime = video.currentTime; const now = performance.now();
            const frame = activeTracker.detect(video, now);
            // Tracker sees the raw video; mirror only the overlay for the displayed tile.
            latest.current.onFrame?.({ ...frame, overlayPalette: 'v2', hands: frame.hands.map(h => h.map(p => ({ ...p, x: 1-p.x }))),
              pose: frame.pose?.map(p => ({ ...p, x: 1-p.x })) ?? null, points: null, image, sample: null });
            if (pipeline.segmenter.state === 'REST') spellingIndex.current = null;
            if (!paused.current) pipeline.push(frame, (result, tags, spelling, features) => {
              if (attempt !== epoch.current) return;
              latencies.push(result.latencyMs); if (latencies.length > 120) latencies.shift();
              const samples = latencies.slice().sort((a, b) => a-b);
              setMetrics(value => value.split(' · worker')[0] + ` · worker p50 ${samples[Math.floor(samples.length*.5)].toFixed(1)} ms / p95 ${samples[Math.min(samples.length-1, Math.floor(samples.length*.95))].toFixed(1)} ms`);
              let personalAccepted = false;
              let top = result.topK.filter(c => c.gloss !== '_idle');
              if (!spelling && privateModel.current) {
                let mine = predictPersonalSign(privateModel.current, { features: Array.from(result.embedding), framesWithHand: 32,
                  featureVersion: 'holistic_v2_emb192', modelSha256: classifier.current!.manifest.c1_sha256 });
                if (!mine.accepted) mine = predictPersonalSign(privateModel.current, { features: Array.from(features), framesWithHand: 32, featureVersion: 'holistic-v2' });
                if (mine.accepted) { personalAccepted = true; top = [{ gloss: mine.label, prob: mine.score }, ...top].filter((c,i,all) => all.findIndex(v => v.gloss === c.gloss) === i).slice(0, 3); }
              }
              if ((!spelling && (!top.length || (!personalAccepted && (result.handActivityProb < .5 || result.topK[0]?.gloss === '_idle')))) || (spelling && !result.text)) return;
              const next: DictatedWord = spelling ? { label: '@'+result.text, score: 0, nmmTags: [...tags, 'FS'] } :
                { label: top[0].gloss, score: top[0].prob, alternatives: top.slice(1).map(c => ({ gloss: c.gloss, p: c.prob })), nmmTags: tags };
              if (!spelling && next.score < .6) return;
              const draft = [...currentWords.current];
              if (spelling && spellingIndex.current !== null && draft[spellingIndex.current]?.label.startsWith('@')) draft[spellingIndex.current] = next;
              else if (draft.length < 20) { if (spelling) spellingIndex.current = draft.length; draft.push(next); }
              replace(draft);
            }, () => { stop(); latest.current.onFallback(); });
            setCadence(pipeline.segmenter.state); count++;
            if (now - started >= 1000) { setMetrics(value => `Tracking ${(count*1000/(now-started)).toFixed(1)} FPS · ${value.split(' · worker')[1] ? 'worker'+value.split(' · worker')[1] : 'collecting latency samples'}`); count = 0; started = now; }
          }
          raf.current = requestAnimationFrame(loop);
        } catch { stop(); latest.current.onFallback(); }
      };
      // Pause inference during review/send while keeping camera tracking visible.
      loop();
    } catch {
      if (attempt !== epoch.current) return;
      stop(); latest.current.onFallback();
    }
  }
  async function review() {
    if (!words.length || preparing) return;
    paused.current = true; stream.current?.reset(); setPreparing(true); setError('');
    const attempt = ++reviewGeneration.current, snapshot = words.slice();
    try {
      const sentence = await props.onPrepare(snapshot);
      if (attempt === reviewGeneration.current) setText(sentence);
    } catch { if (attempt === reviewGeneration.current) setText(snapshot.map(w => w.label).join(' ')); }
    finally { setPreparing(false); }
  }
  async function send() {
    if (!text || !props.connected || sending.current) return;
    sending.current = true;
    const attempt = epoch.current;
    const sent = await props.onSentence(text, { confidence: Math.min(...words.map(w => w.score)), nmmTags: [...new Set(words.flatMap(w => w.nmmTags ?? []))],
      allowSpeak: words.every(w => w.score >= .8) }).catch(() => null);
    sending.current = false;
    if (attempt !== epoch.current) return;
    if (sent) { paused.current = false; replace([]); spellingIndex.current = null; stream.current?.reset(); }
    else setError('Your sentence was not sent. Please retry.');
  }
  return <section className="signer-words" aria-label="Sign recognition">
    <h2>Sign recognition</h2>
    <p>Recognition runs on this device. Camera video is shared with your call partner; it is never uploaded for model inference.</p>
    <div className="button-row"><Button variant="primary" disabled={loading || !props.connected} onClick={() => running ? stop() : void start()}>{loading ? 'Loading recognition…' : running ? 'Stop recognition' : 'Enable sign recognition'}</Button>
      <Button disabled={!props.connected} onClick={props.onRetract}>That was wrong</Button></div>
    <label>Recognition mode <select value={mode} onChange={e => setMode(e.target.value as RecognitionMode)}>
      <option value="auto">Auto</option><option value="isolated">Isolated</option><option value="fingerspell">Fingerspell A-Z</option></select></label>
    <p role="status">{running ? (cadence === 'REST' ? 'Ready for next sign' : 'Signing…') : props.reconnecting ? 'Reconnecting…' : 'Recognition is off.'} {metrics}</p>
    <div className="v2-gloss-strip" aria-label="Signed words">{words.map((word, i) => <span key={i} className={word.score >= .8 ? 'v2-gloss high' : 'v2-gloss medium'}>
      <label>{word.label} {Math.round(word.score*100)}% <select aria-label={`Correct sign ${i+1}`} value={word.label} onChange={e => {
        const choices = [ { gloss: word.label, p: word.score }, ...(word.alternatives ?? []) ];
        const chosen = choices.find(c => c.gloss === e.target.value)!;
        replace(words.map((w, j) => j === i ? { ...w, label: chosen.gloss, score: chosen.p, alternatives: choices.filter(c => c.gloss !== chosen.gloss) } : w));
      }}>{[ { gloss: word.label, p: word.score }, ...(word.alternatives ?? []) ].map(c => <option key={c.gloss} value={c.gloss}>{c.gloss} {Math.round(c.p*100)}%</option>)}</select></label>
      {(word.nmmTags ?? []).map(tag => <span key={tag} className="v2-nmm">{({ 'Q-YN': '[? Yes/No]', 'Q-WH': '[? Wh-]', NEG: '[¬ Neg]', FS: '[Spelled]' } as Record<string, string>)[tag]}</span>)}
    </span>)}</div>
    <div className="button-row"><Button disabled={!words.length || preparing} onClick={() => void review()}>{preparing ? 'Preparing…' : 'Review sentence'}</Button>
      <Button onClick={() => { paused.current = false; replace([]); spellingIndex.current = null; stream.current?.reset(); }}>Clear</Button></div>
    {text && <div><p>{text}</p>{words.some(w => w.score < .8) && <p>Some signs need review. This sentence will be sent as text only.</p>}
      <Button variant="primary" disabled={!props.connected} onClick={() => void send()}>Send now</Button></div>}
    <label className="check-field"><input type="checkbox" checked={cloud} onChange={e => { setCloud(e.target.checked); if (!e.target.checked && stream.current) stream.current.serverConsent = false; }} /><span>Allow server assistance if local inference is slow. Only 174 landmark values per frame are sent, with no video or audio. Landmarks can be identifying; no telemetry is collected.</span></label>
    {user && <label className="check-field"><input type="checkbox" checked={personal} disabled={running || loading} onChange={e => setPersonal(e.target.checked)} /><span>Load my private saved signs for this call.</span></label>}
    <p><a href="#/training">Teach or manage my signs</a></p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
