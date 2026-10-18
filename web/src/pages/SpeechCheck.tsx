import { Badge, Button } from '../components/ui';
import { BirdScene } from '../components/BirdScene';
import { useEffect, useRef, useState } from 'react';
import { type Stt, type SttState } from '../lib/stt';
import { startScribe } from '../lib/scribe';
import './SpeechCheck.css';

type ViewState = SttState | 'idle';
type Phrase = { id: number; text: string };
const HISTORY_LIMIT = 50;
const stateText: Record<ViewState, { label: string; detail: string }> = {
  idle: { label: 'Microphone off', detail: 'Your microphone starts only when you choose Start captions.' },
  starting: { label: 'Starting microphone', detail: 'Allow microphone access if your browser asks.' },
  listening: { label: 'Listening', detail: '' },
  stopping: { label: 'Stopping recognition', detail: 'Waiting for the browser to close this session safely.' },
  retrying: { label: 'Reconnecting captions', detail: 'A short interruption. Some words may be missed while reconnecting.' },
  failed: { label: 'Needs attention', detail: 'Check the message below. You can try starting a fresh session.' },
  stopped: { label: 'Captions stopped', detail: '' },
};

function MicIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 10v2a6.5 6.5 0 0 0 13 0v-2M12 18.5V22M8.5 22h7" /></svg>;
}

export default function SpeechCheck() {
  const [state, setState] = useState<ViewState>('idle');
  const [consented, setConsented] = useState(false);
  const [draft, setDraft] = useState('');
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [message, setMessage] = useState('');
  const [supported] = useState(() => {
    return typeof navigator.mediaDevices?.getUserMedia === 'function';
  });
  const [secure] = useState(() => window.isSecureContext);
  const session = useRef<Stt | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const running = useRef(false);
  const nextPhrase = useRef(0);
  const busy = state === 'starting' || state === 'listening' || state === 'stopping' || state === 'retrying';

  useEffect(() => {
    mounted.current = true;
    const previousTitle = document.title;
    document.title = 'Speech check · SignLine';
    const release = () => {
      generation.current++;
      running.current = false;
      session.current?.stop();
      session.current = null;
    };
    const pageHidden = () => { release(); setDraft(''); setState('stopped'); };
    window.addEventListener('pagehide', pageHidden);
    return () => {
      mounted.current = false;
      window.removeEventListener('pagehide', pageHidden);
      release();
      document.title = previousTitle;
    };
  }, []);

  function stop() {
    generation.current++;
    running.current = false;
    const previous = session.current;
    session.current = null;
    previous?.stop();
    setDraft('');
    setMessage('');
    setState('stopped');
  }

  function start() {
    if (running.current || !consented || !supported || !secure) return;
    const attempt = ++generation.current;
    const current = () => mounted.current && generation.current === attempt;
    // Reserve ownership before startScribe: callbacks can happen synchronously.
    running.current = true;
    setDraft('');
    setMessage('');
    setState('starting');
    const handle = startScribe((text, final) => {
      if (!current()) return;
      if (final && text) {
        const phrase = { id: nextPhrase.current++, text };
        setPhrases(list => [...list, phrase].slice(-HISTORY_LIMIT));
        setDraft('');
      } else if (!final) setDraft(text);
    }, error => {
      if (current()) setMessage(error);
    }, next => {
      if (!current()) return;
      setState(next);
      if (next === 'listening') setMessage('');
      if (next === 'failed' || next === 'stopped') {
        running.current = false;
        session.current = null;
        setDraft('');
      }
    });
    // Navigation or a synchronous failure can invalidate ownership before return.
    if (!current() || !running.current) { handle?.stop(); return; }
    if (!handle) {
      running.current = false;
      setState('failed');
      return;
    }
    session.current = handle;
  }

  return (
    <main className="speech-check" id="main-content">
      <header className="speech-check__heading"><h1>Speech check</h1><p className="speech-check__lead">Test your microphone and see how your speech turns into captions before a call.</p></header>

      <div className="speech-check__layout">
        <div className="speech-check__workspace">
          <section className={`speech-check__live speech-check__live--${state}`} aria-labelledby="speech-live-title">
            <div className="speech-check__live-top">
              <h2 id="speech-live-title">Live draft</h2>
              <Badge tone={state === 'listening' ? 'positive' : state === 'failed' || state === 'retrying' ? 'warning' : 'neutral'}>{state === 'listening' ? 'Listening' : state === 'stopping' ? 'Stopping' : state === 'retrying' ? 'Reconnecting' : state === 'failed' ? 'Needs attention' : busy ? 'Connecting' : 'Microphone off'}</Badge>
            </div>
            <div className="speech-check__draft" aria-live="off">
              {draft || (!busy ? <BirdScene scene="singing" className="speech-check__illustration" /> : <p className="speech-check__placeholder">…</p>)}
            </div>
          </section>

          <section className="speech-check__history" aria-labelledby="speech-history-title">
            <div className="speech-check__history-top"><div><h2 id="speech-history-title">Captions</h2></div><span>{phrases.length} / {HISTORY_LIMIT}</span></div>
            <div className="speech-check__phrases" role="log" aria-live="polite" aria-relevant="additions" aria-label="Finished speech captions">
              {phrases.length ? phrases.map(phrase => <p key={phrase.id} className="speech-check__phrase">{phrase.text}</p>) : <div className="speech-check__empty"><p>No captions</p></div>}
            </div>
            <div className="speech-check__history-footer"><Button className="speech-check__clear" disabled={!phrases.length} onClick={() => { setDraft(''); setPhrases([]); }}>Clear text</Button></div>
          </section>
        </div>

        <aside className="speech-check__sidebar" aria-label="Microphone controls">
          <section className="speech-check__controls">
            <div role="status" aria-live="polite"><h2>{stateText[state].label}</h2>{stateText[state].detail && state !== 'idle' && <p className="speech-check__detail">{stateText[state].detail}</p>}</div>
            {!secure && <p className="speech-check__notice" role="alert">Open this page on localhost or HTTPS to use a microphone.</p>}
            {!supported && <p className="speech-check__notice" role="alert">Microphone streaming is unavailable in this browser. Use a current browser on HTTPS or localhost.</p>}
            {message && <p className="speech-check__notice" role={state === 'failed' ? 'alert' : 'status'}>{message}</p>}
            <label className="speech-check__consent"><input type="checkbox" checked={consented} onChange={event => { setConsented(event.target.checked); if (!event.target.checked && running.current) stop(); }} /><span>I agree to send my microphone audio to SignLine’s speech-to-text provider (ElevenLabs) for this test.</span></label>
            <div className="speech-check__buttons">
              <Button aria-describedby={!busy && supported && secure && !consented ? 'speech-start-hint' : undefined} variant={busy ? 'secondary' : 'primary'} className={busy ? 'speech-check__stop' : 'speech-check__start'} disabled={!busy && (!consented || !supported || !secure)} onClick={busy ? stop : start}>{busy ? <><span aria-hidden="true" />Stop</> : <><MicIcon />Start captions</>}</Button>
            </div>
            {!busy && supported && secure && !consented && <p id="speech-start-hint" className="speech-check__hint">Tick the consent box to start.</p>}
            <p className="speech-check__privacy">No audio saved. Captions stay in this tab.</p>
          </section>

        </aside>
      </div>

    </main>
  );
}
