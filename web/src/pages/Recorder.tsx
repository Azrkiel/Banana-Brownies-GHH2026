import { useCallback, useEffect, useRef, useState } from 'react';
import { useCameraTracker } from '../lib/useCameraTracker';
import { Segmenter } from '../lib/segmenter';
import { LETTERS, RECORD_LABELS } from '../vocab';
import type { Clip, ClipKind, Frame, Session } from '../lib/types';

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
    <main>
      <h1>Record landmarks</h1>
      <p>We store hand/body landmark coordinates only, not video. Recordings train this project's model and are not published. Verify sign forms with the team before recording.</p>
      <label><input type="checkbox" checked={consent} onChange={(event) => {
        stopRecording(); setCamera(false); setConsent(event.target.checked);
      }} /> I consent to recording my landmarks for this project.</label>
      <div>
        <label>Signer ID <input placeholder="e.g. liv" value={signer} disabled={busy || clips.length > 0} onChange={(event) => setSigner(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} /></label>
        <label><input type="checkbox" checked={leftHanded} disabled={busy || clips.length > 0} onChange={(event) => setLeftHanded(event.target.checked)} /> Left-handed signer</label>
      </div>
      <button disabled={!consent} onClick={() => { stopRecording(); setCamera(!camera); }}>{camera ? 'Stop camera' : 'Start camera'}</button>
      <p role="status">{error || (camera && !ready ? 'Starting camera and models…' : ready ? 'Camera ready' : 'Camera off')}</p>
      <div>
        <label>Recording type <select aria-label="Recording type" value={kind} disabled={busy} onChange={(event) => {
          const next = event.target.value as ClipKind;
          setKind(next); setLabel(next === 'sign' ? RECORD_LABELS[0] : LETTERS[0]);
          segmenter.current = new Segmenter();
        }}><option value="sign">Signs</option><option value="letter">Letters</option></select></label>
        <label>Label <select aria-label="Label" value={label} disabled={busy} onChange={(event) => {
          setLabel(event.target.value); segmenter.current = new Segmenter();
        }}>{labels.map((value) => <option key={value} value={value}>{value} ({count(value)})</option>)}</select></label>
      </div>
      {kind === 'sign'
        ? <button disabled={!armed && (!ready || !signer || !consent)} onClick={() => {
          if (armed) { stopRecording(); return; }
          segmenter.current = new Segmenter();
          state.current.armed = true;
          setArmed(true); setMessage(`Recording ${label}. Sign, then lower your hands or pause.`);
        }}>{armed ? 'Stop' : 'Start'} recording {label}</button>
        : <button disabled={!ready || !signer || !consent || holding} onClick={holdLetter}>{holding ? 'Holding…' : `Hold ${label} for 2 s`}</button>}
      {holding && <button onClick={() => { stopRecording(); setMessage('Letter recording cancelled.'); }}>Cancel hold</button>}
      <button disabled={busy || !clips.length} onClick={() => setClips((current) => current.slice(0, -1))}>Undo last</button>
      <button disabled={busy || !clips.length || !signer} onClick={() => download({ version: 1, signer, leftHanded, recordedAt: new Date().toISOString(), clips })}>Download session ({clips.length} clips)</button>
      <p role="status">{message}</p>
      <p>Label counts: {labels.map((value) => `${value}:${count(value)}`).join(' · ')}</p>
      <video ref={video} muted playsInline className="mirror" width={480} />
      <p className="note">Download your session before leaving this page. Keep recordings in the ignored data/raw folder.</p>
    </main>
  );
}
