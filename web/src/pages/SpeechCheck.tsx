import { Button } from '../components/ui';
import { useEffect, useRef, useState } from 'react';
import { startWebSpeech, type Stt, type SttState } from '../lib/stt';
import './SpeechCheck.css';

type ViewState = SttState | 'idle';
type Phrase = { id: number; text: string };
const HISTORY_LIMIT = 50;
const stateText: Record<ViewState, { label: string; detail: string }> = {
  idle: { label: 'Ready when you are', detail: 'Your microphone starts only when you choose Start captions.' },
  starting: { label: 'Starting microphone', detail: 'Allow microphone access if your browser asks.' },
  listening: { label: 'Listening', detail: 'Speak naturally. Your words will appear below.' },
  stopping: { label: 'Stopping recognition', detail: 'Waiting for the browser to close this session safely.' },
  retrying: { label: 'Reconnecting captions', detail: 'A short interruption. Some words may be missed while reconnecting.' },
  failed: { label: 'Needs attention', detail: 'Check the message below. You can try starting a fresh session.' },
  stopped: { label: 'Captions stopped', detail: 'Choose Start captions whenever you want to try again.' },
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
    const browser = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return typeof browser.SpeechRecognition === 'function' || typeof browser.webkitSpeechRecognition === 'function';
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
    // Reserve ownership before startWebSpeech: callbacks can happen synchronously.
    running.current = true;
    setDraft('');
    setMessage('');
    setState('starting');
    const handle = startWebSpeech((text, final) => {
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
      <header className="speech-check__heading">
        <div>
          <p className="speech-check__eyebrow">SIGNLINE / VOICE TO CAPTIONS</p>
          <h1>Speech check</h1>
          <p className="speech-check__intro">A little space to try live captions.<br />Speak naturally. Take your time.</p>
        </div>
        <div className="speech-check__environment"><span /> Local microphone check<br /><small>English (US) · Browser recognition</small></div>
      </header>

      <div className="speech-check__layout">
        <div className="speech-check__workspace">
          <section className={`speech-check__live speech-check__live--${state}`} aria-labelledby="speech-live-title">
            <div className="speech-check__live-top">
              <h2 id="speech-live-title">Live draft</h2>
              <span className="speech-check__badge"><span />{state === 'listening' ? 'LIVE' : state === 'stopping' ? 'STOPPING' : state === 'retrying' ? 'RETRYING' : state === 'failed' ? 'ATTENTION' : busy ? 'CONNECTING' : 'STANDBY'}</span>
            </div>
            <div className="speech-check__draft" aria-live="off">
              {draft || <p className="speech-check__placeholder">Your words will appear here<br />while you speak.</p>}
            </div>
            <p className="speech-check__draft-note">This line updates as the browser recognizes your speech.</p>
          </section>

          <section className="speech-check__history" aria-labelledby="speech-history-title">
            <div className="speech-check__history-top"><div><p className="speech-check__eyebrow">WORDS, KEPT IN VIEW</p><h2 id="speech-history-title">Finished phrases</h2></div><span>{phrases.length} / {HISTORY_LIMIT}</span></div>
            <div className="speech-check__phrases" role="log" aria-live="polite" aria-relevant="additions" aria-label="Finished speech captions">
              {phrases.length ? phrases.map(phrase => <p key={phrase.id} className="speech-check__phrase">{phrase.text}</p>) : <div className="speech-check__empty"><span aria-hidden="true">Aa</span><p>A sentence starts here.</p><small>Finished phrases will stay in this tab until you clear them or leave.</small></div>}
            </div>
            <div className="speech-check__history-footer"><span>Latest {HISTORY_LIMIT} phrases · This tab only</span><Button className="speech-check__clear" disabled={!phrases.length && !draft} onClick={() => { setDraft(''); setPhrases([]); }}>Clear text</Button></div>
          </section>
        </div>

        <aside className="speech-check__sidebar" aria-label="Microphone controls">
          <section className="speech-check__controls">
            <div className="speech-check__mic" aria-hidden="true"><MicIcon /></div>
            <div role="status" aria-live="polite"><h2>{stateText[state].label}</h2><p className="speech-check__detail">{stateText[state].detail}</p></div>
            {!secure && <p className="speech-check__notice" role="alert">Open this page on localhost or HTTPS to use a microphone.</p>}
            {!supported && <p className="speech-check__notice" role="alert">Speech recognition is unavailable in this browser. Open this address in desktop Chrome to try it.</p>}
            {message && <p className="speech-check__notice" role={state === 'failed' ? 'alert' : 'status'}>{message}</p>}
            <label className="speech-check__consent"><input type="checkbox" checked={consented} onChange={event => { setConsented(event.target.checked); if (!event.target.checked && running.current) stop(); }} /><span>I understand my microphone audio may be sent to my browser’s speech service for recognition.</span></label>
            <div className="speech-check__buttons">
              <Button variant="primary" className="speech-check__start" disabled={busy || !consented || !supported || !secure} onClick={start}><MicIcon />Start captions</Button>
              <Button className="speech-check__stop" disabled={!busy} onClick={stop}><span aria-hidden="true" />Stop</Button>
            </div>
            <p className="speech-check__privacy">This page saves no audio or captions. Recognition needs your browser’s permission and may need an internet connection.</p>
          </section>

          <section className="speech-check__guide" aria-labelledby="speech-guide-title"><p className="speech-check__eyebrow">TRY IT OUT</p><h2 id="speech-guide-title">One phrase at a time.</h2><ol><li>Allow the microphone when your browser asks.</li><li>Wait for <strong>Listening</strong>, then say a short sentence.</li><li>Pause to let the phrase finish. Choose Stop when you’re done.</li></ol><blockquote>“Hello. I’m testing live captions today.”</blockquote><p>Try saying it twice. Both phrases should appear.</p></section>
        </aside>
      </div>
      <footer className="speech-check__footer"><span>Browser speech can make mistakes. Check the words as you go.</span><a href="#/">Back to SignLine <span aria-hidden="true">↗</span></a></footer>
    </main>
  );
}
