import { Songbirds } from '../components/Songbirds';
import { Button, Icon } from '../components/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { RemoteTrack } from 'livekit-client';
import { joinCall, type Call as CallT, type CallStatus } from '../lib/call';
import { CaptionLane } from '../components/CaptionLane';
import { PreCall } from '../components/PreCall';
import { createCaptionHistory } from '../lib/captions';
import { createSpeechCaptions } from '../lib/speechCaptions';
import { createCallSpeech, type CallSpeechState } from '../lib/callSpeech';
import type { Caption, Role } from '../lib/types';
import './CallSpeech.css';

const speechLabels: Record<CallSpeechState, string> = {
  disabled: 'Speech captions off', starting: 'Starting captions…', listening: 'Listening',
  stopping: 'Stopping recognition…', retrying: 'Reconnecting captions…',
  failed: 'Speech captions need attention', stopped: 'Speech captions stopped', paused: 'Speech captions paused',
};

type Status = CallStatus | 'idle' | 'joining';
const statusText: Record<Status, string> = {
  idle: 'Not connected', joining: 'Connecting…', connected: 'Connected',
  reconnecting: 'Reconnecting…', disconnected: 'Call ended', 'audio-blocked': 'Enable audio',
};

function friendlyError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Camera or microphone access was denied. Allow access in your browser, then try again.';
    if (error.name === 'NotFoundError') return 'No camera or microphone was found. Connect your devices and try again.';
    if (error.name === 'NotReadableError') return 'Your camera may be in use by another app. Close it there and try again.';
  }
  return 'We couldn’t join the room. Check your connection, make sure the API server is running, and try again.';
}

const ROOM_PATTERN = /^[a-z0-9-]{3,32}$/;

function roomUrl(room: string, name: string, role: Role): string {
  const params = new URLSearchParams({ room, name, role });
  return `${window.location.pathname}#/room?${params}`;
}

function readRoomParams(query: string): { room: string; name: string; role: Role } | null {
  const params = new URLSearchParams(query);
  const room = params.get('room') ?? '';
  const name = (params.get('name') ?? '').trim();
  const role = params.get('role');
  if (!ROOM_PATTERN.test(room) || !name || name.length > 40) return null;
  if (role !== 'signer' && role !== 'hearing') return null;
  return { room, name, role };
}

export default function Call() {
  const [room, setRoom] = useState('demo-room');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('signer');
  const [error, setError] = useState('');

  function open(event: FormEvent) {
    event.preventDefault();
    const tab = window.open(roomUrl(room, name.trim(), role), '_blank');
    setError(tab ? '' : 'Your browser blocked the new tab. Allow pop-ups for this site, then try again.');
  }

  return (
    <main className="call-page home-page" id="main-content">
      <header className="home-heading"><h1>Call</h1></header>
      <div className="home-layout">
        <Songbirds className="home-illustration" />
        <section className="home-join" aria-label="Join a call">
          <form className="join-bar" onSubmit={open}>
            <label>Name<input autoComplete="given-name" placeholder="Your name" value={name} maxLength={40} required onChange={event => setName(event.target.value)} /></label>
            <label>Room<input value={room} pattern="(?:[a-z0-9]|-){3,32}" title="3–32 lowercase letters, numbers or hyphens" required onChange={event => setRoom(event.target.value)} /></label>
            <label>Role<select value={role} onChange={event => setRole(event.target.value as Role)}><option value="signer">Signer</option><option value="hearing">Hearing participant</option></select></label>
            <Button variant="primary" type="submit" disabled={!name.trim()}>Join <Icon name="arrow" /></Button>
          </form>
          {error && <div className="error-banner" role="alert">{error}</div>}
        </section>
      </div>
    </main>
  );
}

export function CallRoom({ query }: { query: string }) {
  const [checked, setChecked] = useState(false);
  const params = readRoomParams(query);
  if (!params) {
    return (
      <main className="call-page" id="main-content">
        <div className="error-banner" role="alert">This room link is missing a valid name, room, or role. <a href="#/conversation">Go back and join a room</a>.</div>
      </main>
    );
  }
  return checked ? <RoomSession {...params} onRecheck={() => setChecked(false)} /> : <PreCall {...params} onJoin={() => setChecked(true)} />;
}

function RoomSession({ room, name, role, onRecheck }: { room: string; name: string; role: Role; onRecheck(): void }) {
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [peer, setPeer] = useState<string | null>(null);
  const [remoteVisible, setRemoteVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [speechState, setSpeechState] = useState<CallSpeechState>('disabled');
  const [speechError, setSpeechError] = useState('');
  const [deliveryError, setDeliveryError] = useState('');
  const [consented, setConsented] = useState(false);
  const [muted, setMuted] = useState(false);
  const [muting, setMuting] = useState(false);
  const [history] = useState(() => createCaptionHistory(setCaptions));
  const speech = useRef<ReturnType<typeof createCallSpeech> | null>(null);
  const delivery = useRef<ReturnType<typeof createSpeechCaptions> | null>(null);
  const mutingRef = useRef(false);
  const local = useRef<HTMLVideoElement>(null);
  const remote = useRef<HTMLVideoElement>(null);
  const remoteTrack = useRef<RemoteTrack | null>(null);
  const call = useRef<CallT | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const connectionAbort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const joining = useRef(false);
  const sendingRef = useRef(false);
  const inRoom = status === 'connected' || status === 'reconnecting' || status === 'audio-blocked';
  const busy = inRoom || status === 'joining';
  const canSend = status === 'connected' || status === 'audio-blocked';
  const speechEnabled = !['disabled', 'failed', 'stopped'].includes(speechState);

  useEffect(() => {
    document.title = `${room} · SignLine`;
    void join();
  // Join once on load; the room and identity come from this tab's link and never change.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const release = () => {
      generation.current++;
      joining.current = false;
      speech.current?.dispose(); speech.current = null;
      delivery.current?.dispose(); delivery.current = null;
      connectionAbort.current?.abort();
      stream.current?.getTracks().forEach(track => track.stop());
      if (remote.current) remoteTrack.current?.detach(remote.current);
      const previous = call.current; call.current = null;
      void previous?.leave().catch(() => {});
    };
    const hidden = () => { release(); resetMedia(); setStatus('disconnected'); setSpeechState('disabled'); };
    window.addEventListener('pagehide', hidden);
    return () => { window.removeEventListener('pagehide', hidden); release(); };
  // Refs own cleanup for this room tab, including StrictMode's setup/cleanup cycle.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetMedia() {
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (local.current) local.current.srcObject = null;
    if (remote.current) {
      remoteTrack.current?.detach(remote.current);
      remote.current.srcObject = null;
    }
    remoteTrack.current = null;
    setRemoteVisible(false);
    setPeer(null);
  }

  async function join(event?: FormEvent) {
    event?.preventDefault();
    if (joining.current || call.current) return;
    const attempt = ++generation.current;
    const active = () => generation.current === attempt;
    joining.current = true;
    connectionAbort.current = new AbortController();
    setStatus('joining');
    setError('');
    speech.current?.dispose();
    delivery.current?.dispose();
    history.reset();
    setSpeechState('disabled'); setSpeechError(''); setDeliveryError(''); setConsented(false);
    setMuted(false); setMuting(false); mutingRef.current = false;
    const sender = createSpeechCaptions({
      speaker: name,
      local: caption => { if (active()) history.receive(caption, 'local'); },
      remove: (id, revision) => { if (active()) history.clear(id, revision, 'local'); },
      send: async message => {
        const current = call.current;
        if (!active() || !current) throw new Error('Room session ended.');
        if ('type' in message) await current.sendCtrl(message);
        else await current.sendCaption(message);
      },
      onError: message => { if (active()) setDeliveryError(message); },
    });
    const recognizer = createCallSpeech({
      role, transcript: sender.transcript, clearDraft: sender.clearDraft,
      onState: next => { if (active()) { setSpeechState(next); if (next === 'listening') setSpeechError(''); } },
      onError: message => { if (active()) setSpeechError(message); },
    });
    delivery.current = sender; speech.current = recognizer;
    setDraft('');
    setSending(false);
    sendingRef.current = false;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access requires a secure browser context.');
      }
      const media = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 }, audio: false });
      if (!active()) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      if (local.current) local.current.srcObject = media;
      const connected = await joinCall({
        room, name, role, camera: media.getVideoTracks()[0], signal: connectionAbort.current.signal,
        h: {
          onCaption: (caption, identity) => { if (active()) history.receive(caption, identity); },
          onCtrl: (message, identity) => {
            if (!active()) return;
            if (message.type === 'caption-clear') history.clear(message.id, message.revision, identity);
            if (message.type === 'tts') recognizer.playback(identity, message.on);
          },
          onPeerLeft: identity => { if (active()) { history.clearDrafts(identity); recognizer.playback(identity, false); } },
          onMicrophoneMuted: value => { if (active()) { setMuted(value); recognizer.mute(value); } },
          onRemoteVideo: track => {
            if (!active()) return;
            if (remote.current) {
              remoteTrack.current?.detach(remote.current);
              remote.current.srcObject = null;
              track?.attach(remote.current);
            }
            remoteTrack.current = track;
            setRemoteVisible(!!track);
          },
          onStatus: next => {
            if (!active()) return;
            setStatus(next);
            const online = next === 'connected' || next === 'audio-blocked';
            sender.connection(online && !!call.current);
            recognizer.connection(online && !!call.current);
            if (next === 'reconnecting') history.clearDrafts();
            if (next === 'disconnected') {
              recognizer.dispose(); sender.dispose(); history.clearDrafts();
              setSpeechState('disabled');
              generation.current++;
              call.current = null;
              joining.current = false;
              sendingRef.current = false;
              setSending(false);
              resetMedia();
            }
          },
          onPeer: next => { if (active()) setPeer(next); },
        },
      });
      if (!active()) { await connected.leave(); return; }
      call.current = connected;
      sender.connection(true); recognizer.connection(true);
    } catch (cause) {
      if (!active()) return;
      recognizer.dispose(); sender.dispose();
      resetMedia();
      setStatus('idle');
      setError(friendlyError(cause));
    } finally {
      if (active()) joining.current = false;
    }
  }

  async function leave() {
    speech.current?.enable(false);
    speech.current?.dispose(); speech.current = null;
    delivery.current?.dispose(); delivery.current = null;
    history.clearDrafts();
    generation.current++;
    connectionAbort.current?.abort();
    joining.current = false;
    const previous = call.current;
    call.current = null;
    resetMedia();
    setStatus('disconnected');
    setError('');
    setSpeechState('disabled'); setSpeechError(''); setDeliveryError(''); setConsented(false);
    setSending(false);
    sendingRef.current = false;
    try { await previous?.leave(); }
    catch { setError('The connection closed unexpectedly. Your camera has been stopped.'); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    const current = call.current;
    if (!text || !current || !canSend || sendingRef.current) return;
    const attempt = generation.current;
    sendingRef.current = true;
    setSending(true);
    setError('');
    const caption: Caption = { id: crypto.randomUUID(), speaker: name, role, kind: 'english', text, final: true, ts: Date.now() };
    try {
      await current.sendCaption(caption);
      if (generation.current !== attempt) return;
      history.receive(caption, 'local');
      setDraft(value => value === draft ? '' : value);
    } catch {
      if (generation.current === attempt) setError('Your caption wasn’t sent. Your text is still here; try sending it again.');
    } finally {
      if (generation.current === attempt) { setSending(false); sendingRef.current = false; }
    }
  }

  async function enableAudio() {
    try { await call.current?.room.startAudio(); }
    catch { setError('Audio is still blocked. Check browser permissions and try again.'); }
  }

  async function toggleMicrophone() {
    const current = call.current;
    if (!current || !canSend || mutingRef.current) return;
    const attempt = generation.current;
    const nextMuted = !muted;
    mutingRef.current = true; setMuting(true);
    if (nextMuted) speech.current?.mute(true);
    try { await current.setMicrophoneEnabled(!nextMuted); }
    catch {
      if (generation.current === attempt) {
        speech.current?.enable(false);
        speech.current?.mute(muted);
        setError('Could not change the call microphone. Speech captions are off; check your microphone and try again.');
      }
    } finally {
      if (generation.current === attempt) { mutingRef.current = false; setMuting(false); }
    }
  }

  return (
    <main className="call-page" id="main-content">
      <header className="room-heading">
        <div><h1>{room}</h1></div>
        <p className="intro"><strong>{name}</strong> · {role === 'signer' ? 'Signer' : 'Hearing participant'}</p>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="call-workspace">
        <div className="stage-column">
          <div className="stage" aria-label="Video call">
            <div className="stage-top"><span className="room-label">{room}</span><span className={`connection-status ${inRoom ? 'online' : ''}`} role="status"><span className="status-dot" />{statusText[status]}</span></div>
            <video ref={remote} autoPlay playsInline className={`remote-video ${remoteVisible ? 'visible' : ''}`} aria-label="Other participant’s video" />
            {!remoteVisible && <div className="stage-placeholder">
              <Songbirds className="stage-illustration" />
              <h2>{inRoom ? peer ? `${peer} is here` : 'Waiting for participant' : status === 'joining' ? 'Connecting…' : 'Not connected'}</h2>
              <p>{inRoom ? peer ? 'Their video will appear when their camera is on.' : 'Ask someone to join the same room to get started.' : status === 'joining' ? 'Allow camera access when your browser asks.' : status === 'disconnected' ? 'You left the room. Rejoin when you’re ready.' : 'Choose Rejoin to try connecting again.'}</p>
            </div>}
            <div className="local-tile"><video ref={local} autoPlay muted playsInline className="mirror local-video" aria-label="Your camera preview" />{!busy && <span className="camera-off" aria-hidden="true">Camera off</span>}<span className="video-label">{inRoom ? name : 'You'} <span>· {role === 'signer' ? 'Signer' : 'Hearing'}</span></span></div>
            {remoteVisible && <span className="peer-label">{peer ?? 'Other participant'}</span>}
          </div>
          <div className="call-toolbar"><p><span className="privacy-dot" />{status === 'joining' ? 'Waiting for camera access and call connection' : inRoom ? role === 'signer' ? 'Camera on · microphone off' : muted ? 'Call microphone muted · speech recognition paused' : 'Camera and call microphone enabled' : 'Camera and microphone stay off until you join.'}</p><div className="call-actions">{role === 'hearing' && inRoom && <Button disabled={!canSend || muting} onClick={() => void toggleMicrophone()}>{muting ? 'Changing microphone…' : muted ? 'Unmute microphone' : 'Mute microphone'}</Button>}{status === 'audio-blocked' && <Button onClick={enableAudio}>Enable audio</Button>}{busy ? <Button variant="danger" onClick={leave}>{status === 'joining' ? 'Cancel' : 'Leave room'}</Button> : <Button variant="primary" onClick={onRecheck}>Rejoin</Button>}</div></div>
          {role === 'hearing' && <section className="call-speech" aria-labelledby="call-speech-title">
            <div className="call-speech__heading"><h2 id="call-speech-title">Speech captions</h2><span role="status">{speechLabels[speechState]}</span></div>
            <label><input type="checkbox" checked={consented} onChange={event => { setConsented(event.target.checked); speech.current?.consent(event.target.checked); }} /><span>I agree to send microphone audio to my browser’s speech service and share the recognized text with this room.</span></label>
            <div className="call-speech__actions"><Button variant="primary" disabled={!speechEnabled && (!consented || !canSend || muted)} onClick={() => { setSpeechError(''); speech.current?.enable(!speechEnabled); }}>{speechEnabled ? 'Stop captions' : 'Start captions'}</Button><p>Powered by ElevenLabs Scribe. Stopping captions leaves call audio on. Mute the microphone to pause both.</p></div>
            {speechError && <p className="call-speech__error" role="alert">{speechError}</p>}
            {deliveryError && <p className="call-speech__error" role="alert">{deliveryError}</p>}
          </section>}
          <div className="scope-note"><span className="note-icon" aria-hidden="true">i</span><p>Speech recognition can make mistakes. Sign recognition is not yet available.</p></div>
        </div>

        <section className="caption-panel" aria-labelledby="caption-title">
          <div className="caption-header"><div><h2 id="caption-title">Captions</h2></div><span className="text-badge" aria-hidden="true">Aa</span></div>
          <div className="caption-scroll">{captions.length ? <CaptionLane captions={captions} me={name} /> : <div className="caption-empty"><p>No captions</p></div>}</div>
          <form className="caption-composer" onSubmit={send}><label htmlFor="caption-draft">Type a caption</label><div className="composer-input"><input id="caption-draft" value={draft} maxLength={1000} disabled={!canSend} placeholder={canSend ? 'Say something…' : 'Connect to send a caption'} onChange={event => setDraft(event.target.value)} /><Button type="submit" aria-label="Send caption" disabled={!canSend || !draft.trim() || sending}>{sending ? '…' : '↑'}</Button></div><p>{canSend ? 'Press Enter to send to the room.' : 'Your conversation will appear when you connect.'}</p></form>
        </section>
      </div>

    </main>
  );
}
