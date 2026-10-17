import { Button, Badge, Icon, PageHeader, Surface } from '../components/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCameraTracker } from '../lib/useCameraTracker';
import { Segmenter } from '../lib/segmenter';
import { LETTERS, RECORD_LABELS } from '../vocab';
import type { Clip, ClipKind, Frame, Session } from '../lib/types';
import './Studio.css';

const LETTER_HOLD_MS = 2000;

function download(session: Session) {
  const body = JSON.stringify(session, (_key, value) => typeof value === 'number' ? Math.round(value * 1e4) / 1e4 : value);
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${session.signer}-${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Recorder() {
  const [signer, setSigner] = useState('');
  const [leftHanded, setLeftHanded] = useState(false);
  const [consent, setConsent] = useState(false);
  const [camera, setCamera] = useState(false);
  const [kind, setKind] = useState<ClipKind>('sign');
  const [label, setLabel] = useState<string>(RECORD_LABELS[0]);
  const [armed, setArmed] = useState(false);
  const [holding, setHolding] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [message, setMessage] = useState('');
  const segmenter = useRef(new Segmenter());
  const letter = useRef<{ label: string; frames: Frame[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const state = useRef({ armed, label });
  useEffect(() => { state.current = { armed, label }; }, [armed, label]);

  const onFrame = useCallback((frame: Frame) => {
    if (state.current.armed) {
      const event = segmenter.current.push(frame);
      if (event?.kind === 'end') {
        const saved: Clip = { kind: 'sign', label: state.current.label, frames: event.frames };
        setClips((current) => [...current, saved]);
        setMessage(`Saved ${saved.label} (${saved.frames.length} frames)`);
      }
    }
    if (letter.current && frame.hands.length) letter.current.frames.push(frame);
  }, []);
  const { video, ready, error } = useCameraTracker(camera && consent, false, onFrame);
  const busy = armed || holding;
  const labels = kind === 'sign' ? RECORD_LABELS : LETTERS;
  const count = (value: string) => clips.filter((clip) => clip.kind === kind && clip.label === value).length;

  function stopRecording() {
    state.current.armed = false;
    setArmed(false);
    segmenter.current = new Segmenter();
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    letter.current = null;
    setHolding(false);
  }

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
    letter.current = null;
  }, []);

  function holdLetter() {
    if (!ready || busy) return;
    letter.current = { label, frames: [] };
    setHolding(true);
    setMessage('Hold the letter still…');
    timer.current = setTimeout(() => {
      const captured = letter.current;
      letter.current = null;
      timer.current = null;
      setHolding(false);
      if (!captured) return;
      if (captured.frames.length < 20) {
        setMessage(`Only ${captured.frames.length} frames with a hand — try again closer to the camera`);
        return;
      }
      setClips((current) => [...current, { kind: 'letter', ...captured }]);
      setMessage(`Saved ${captured.label} (${captured.frames.length} frames)`);
    }, LETTER_HOLD_MS);
  }

  return (
    <main className="studio-page" id="main-content">
      <PageHeader eyebrow="SIGNLINE / RECORDER" title="A little motion. A little meaning."
        description="Capture hand and body landmarks to help train this project’s model. Verify sign forms with the team before recording."
        accessory={<Badge tone={busy ? 'warning' : ready ? 'positive' : 'neutral'}>{busy ? 'Recording in progress' : ready ? 'Camera ready' : 'Local capture'}</Badge>} />
      <div className="recorder-consent glass"><Icon name="shield" /><div><h2>Your landmarks. Your choice.</h2><p>We store coordinates only, never video. Recordings train this project’s model and are not published.</p>
        <label className="check-field"><input type="checkbox" checked={consent} onChange={(event) => {
          stopRecording(); setCamera(false); setConsent(event.target.checked);
        }} /><span>I consent to recording my landmarks for this project.</span></label>
      </div></div>
      <div className="studio-layout recorder-layout">
        <div className="recorder-workspace">
          <section className="camera-stage" aria-label="Recording camera preview">
            <video ref={video} muted playsInline className="mirror" width={480} />
            {!ready && <div className="camera-stage__placeholder"><span className="camera-stage__icon"><Icon name="record" /></span><h2>Every movement matters.</h2><p>{camera && consent ? 'Preparing your camera and tracking models…' : 'Give consent, then start your camera.'}</p></div>}
            <span className="camera-stage__label"><span className="status-dot" />{busy ? 'Recording landmarks' : ready ? 'Local preview · Mirrored' : 'Camera off'}</span>
          </section>
          <div className="recorder-camera-controls"><p role="status">{error || (camera && !ready ? 'Starting camera and models…' : ready ? 'Camera ready' : 'Camera off')}</p><Button disabled={!consent} onClick={() => { stopRecording(); setCamera(!camera); }}><Icon name="camera" />{camera ? 'Stop camera' : 'Start camera'}</Button></div>
          <Surface className="clip-library" aria-labelledby="clip-library-title"><div className="panel-heading"><h2 id="clip-library-title">Your session</h2><Badge>{clips.length} clips</Badge></div>
            <div className="clip-counts" aria-label="Label counts">{labels.map(value => <span key={value}><b>{value}</b><span>{count(value)}</span></span>)}</div>
            <p className="studio-status" role="status">{message || 'Your captured landmarks will collect here.'}</p>
            <div className="button-row"><Button disabled={busy || !clips.length} onClick={() => setClips((current) => current.slice(0, -1))}>Undo last</Button><Button variant="primary" disabled={busy || !clips.length || !signer} onClick={() => download({ version: 1, signer, leftHanded, recordedAt: new Date().toISOString(), clips })}><Icon name="download" />Download session ({clips.length} clips)</Button></div>
            <p className="note">Download your session before leaving. Keep recordings in the ignored data/raw folder.</p>
          </Surface>
        </div>
        <aside className="studio-sidebar">
          <Surface aria-labelledby="recorder-settings"><p className="eyebrow">01 / MAKE IT YOURS</p><h2 id="recorder-settings">Session details</h2>
            <label className="field">Signer ID <input placeholder="e.g. liv" value={signer} disabled={busy || clips.length > 0} onChange={(event) => setSigner(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} /></label>
            <label className="check-field"><input type="checkbox" checked={leftHanded} disabled={busy || clips.length > 0} onChange={(event) => setLeftHanded(event.target.checked)} /><span>Left-handed signer</span></label>
            <p className="note">Use a pseudonym. These details lock after your first clip.</p>
          </Surface>
          <Surface aria-labelledby="capture-settings"><p className="eyebrow">02 / CAPTURE A MOMENT</p><h2 id="capture-settings">What are you signing?</h2>
            <label className="field">Recording type <select aria-label="Recording type" value={kind} disabled={busy} onChange={(event) => {
              const next = event.target.value as ClipKind;
              setKind(next); setLabel(next === 'sign' ? RECORD_LABELS[0] : LETTERS[0]);
              segmenter.current = new Segmenter();
            }}><option value="sign">Signs</option><option value="letter">Letters</option></select></label>
            <label className="field">Label <select aria-label="Label" value={label} disabled={busy} onChange={(event) => {
              setLabel(event.target.value); segmenter.current = new Segmenter();
            }}>{labels.map((value) => <option key={value} value={value}>{value} ({count(value)})</option>)}</select></label>
            {kind === 'sign'
              ? <Button variant={armed ? 'danger' : 'primary'} disabled={!armed && (!ready || !signer || !consent)} onClick={() => {
                if (armed) { stopRecording(); return; }
                segmenter.current = new Segmenter();
                state.current.armed = true;
                setArmed(true); setMessage(`Recording ${label}. Sign, then lower your hands or pause.`);
              }}><Icon name="record" />{armed ? 'Stop' : 'Start'} recording {label}</Button>
              : <Button variant="primary" disabled={!ready || !signer || !consent || holding} onClick={holdLetter}>{holding ? 'Holding…' : `Hold ${label} for 2 s`}</Button>}
            {holding && <Button variant="ghost" onClick={() => { stopRecording(); setMessage('Letter recording cancelled.'); }}>Cancel hold</Button>}
            <p className="note">{kind === 'sign' ? 'Sign once, then lower your hands or pause to save a clip.' : 'Hold still for two seconds with your hand in view.'}</p>
          </Surface>
        </aside>
      </div>
    </main>
  );
}
