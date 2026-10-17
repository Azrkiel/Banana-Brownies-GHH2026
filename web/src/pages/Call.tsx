import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { RemoteTrack } from 'livekit-client';
import { joinCall, type Call as CallT, type CallStatus } from '../lib/call';
import { CaptionLane } from '../components/CaptionLane';
import { MoonTrios } from '../components/MoonTrios';
import { upsertCaption } from '../lib/captions';
import type { Caption, Role } from '../lib/types';

type Status = CallStatus | 'idle' | 'joining';
const statusText: Record<Status, string> = {
  idle: 'Ready when you are', joining: 'Connecting…', connected: 'Connected',
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
    <main className="call-page home-page">
      <MoonTrios />
      <div className="home-center">
      <header className="call-heading">
        <div><p className="eyebrow">A SPACE TO CONNECT · HACK TO THE MOON</p><h1>Every conversation<br />starts with you.</h1></div>
        <p className="intro">See each other. Take your time.<br /> Keep the conversation in view.</p>
      </header>

      <form className="join-bar" onSubmit={open}>
        <label>Your name<input autoComplete="given-name" placeholder="e.g. Kev" value={name} maxLength={40} required onChange={event => setName(event.target.value)} /></label>
        <label>Room name<input value={room} pattern="[a-z0-9-]{3,32}" title="3–32 lowercase letters, numbers or hyphens" required onChange={event => setRoom(event.target.value)} /></label>
        <label>I’m joining as<select value={role} onChange={event => setRole(event.target.value as Role)}><option value="signer">Signer</option><option value="hearing">Hearing participant</option></select></label>
        <button className="primary-button" type="submit" disabled={!name.trim()}>Join room <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 13 13 3M3 3h10v10" /></svg></button>
      </form>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <p className="home-note">Floating signs are simplified emoji sketches. Learn exact forms from Lifeprint or a Deaf signer.</p>
      </div>
    </main>
  );
}

export function CallRoom({ query }: { query: string }) {
  const params = readRoomParams(query);
  if (!params) {
    return (
      <main className="call-page">
        <div className="error-banner" role="alert">This room link is missing a valid name, room, or role. <a href="#/">Go back and join a room</a>.</div>
      </main>
    );
  }
  return <RoomSession {...params} />;
}

function RoomSession({ room, name, role }: { room: string; name: string; role: Role }) {
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [peer, setPeer] = useState<string | null>(null);
  const [remoteVisible, setRemoteVisible] = useState(false);
  const [sending, setSending] = useState(false);
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

  useEffect(() => {
    document.title = `${room} · SignLine`;
    void join();
  // Join once on load; the room and identity come from this tab's link and never change.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    generation.current++;
    connectionAbort.current?.abort();
    stream.current?.getTracks().forEach(track => track.stop());
    if (remote.current) remoteTrack.current?.detach(remote.current);
    void call.current?.leave().catch(() => {});
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
    setCaptions([]);
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
          onCaption: caption => { if (active()) setCaptions(list => upsertCaption(list, caption)); },
          onCtrl: () => {},
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
            if (next === 'disconnected') {
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
    } catch (cause) {
      if (!active()) return;
      resetMedia();
      setStatus('idle');
      setError(friendlyError(cause));
    } finally {
      if (active()) joining.current = false;
    }
  }

  async function leave() {
    generation.current++;
    connectionAbort.current?.abort();
    joining.current = false;
    const previous = call.current;
    call.current = null;
    resetMedia();
    setStatus('disconnected');
    setError('');
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
      setCaptions(list => upsertCaption(list, caption));
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

  return (
    <main className="call-page">
      <header className="room-heading">
        <div><p className="eyebrow">CONVERSATION ROOM</p><h1>{room}</h1></div>
        <p className="intro">Joined as <strong>{name}</strong> · {role === 'signer' ? 'Signer' : 'Hearing participant'}</p>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="call-workspace">
        <div className="stage-column">
          <div className="stage" aria-label="Video call">
            <div className="stage-top"><span className="room-label">{room}</span><span className={`connection-status ${inRoom ? 'online' : ''}`} role="status"><span className="status-dot" />{statusText[status]}</span></div>
            <video ref={remote} autoPlay playsInline className={`remote-video ${remoteVisible ? 'visible' : ''}`} aria-label="Other participant’s video" />
            {!remoteVisible && <div className="stage-placeholder">
              <div className="conversation-mark" aria-hidden="true"><span /><span /></div>
              <h2>{inRoom ? peer ? `${peer} is here` : 'A seat for someone.' : status === 'joining' ? 'Making the connection.' : 'Meet in the middle.'}</h2>
              <p>{inRoom ? peer ? 'Their video will appear when their camera is on.' : 'Ask someone to join the same room to get started.' : status === 'joining' ? 'Allow camera access when your browser asks.' : status === 'disconnected' ? 'You left the room. Rejoin when you’re ready.' : 'Choose Rejoin to try connecting again.'}</p>
            </div>}
            <div className="local-tile"><video ref={local} autoPlay muted playsInline className="mirror local-video" aria-label="Your camera preview" />{!busy && <span className="camera-off" aria-hidden="true">Camera off</span>}<span className="video-label">{inRoom ? name : 'You'} <span>· {role === 'signer' ? 'Signer' : 'Hearing'}</span></span></div>
            {remoteVisible && <span className="peer-label">{peer ?? 'Other participant'}</span>}
          </div>
          <div className="call-toolbar"><p><span className="privacy-dot" />{busy ? role === 'signer' ? 'Camera on · microphone off' : 'Camera and microphone enabled during the call' : 'Camera and microphone stay off until you join.'}</p><div>{status === 'audio-blocked' && <button onClick={enableAudio}>Enable audio</button>}{busy ? <button className="leave-button" onClick={leave}>{status === 'joining' ? 'Cancel' : 'Leave room'}</button> : <button className="primary-button" onClick={() => void join()}>Rejoin</button>}</div></div>
          <div className="scope-note"><span className="note-icon" aria-hidden="true">i</span><p><strong>One step at a time.</strong> Video calls and typed captions are available here. Automatic sign recognition and speech captions are still being built.</p></div>
        </div>

        <section className="caption-panel" aria-labelledby="caption-title">
          <div className="caption-header"><div><p className="eyebrow">WORDS, IN VIEW</p><h2 id="caption-title">Conversation</h2></div><span className="text-badge" aria-hidden="true">Aa</span></div>
          <div className="caption-scroll">{captions.length ? <CaptionLane captions={captions} me={name} /> : <div className="caption-empty"><span className="caption-empty-lines" aria-hidden="true"><i /><i /><i /></span><h3>A little room for words.</h3><p>Captions you send and receive will appear here, so you can follow along at your own pace.</p></div>}</div>
          <form className="caption-composer" onSubmit={send}><label htmlFor="caption-draft">Type a caption</label><div className="composer-input"><input id="caption-draft" value={draft} maxLength={1000} disabled={!canSend} placeholder={canSend ? 'Say something…' : 'Connect to send a caption'} onChange={event => setDraft(event.target.value)} /><button type="submit" aria-label="Send caption" disabled={!canSend || !draft.trim() || sending}>{sending ? '…' : '↑'}</button></div><p>{canSend ? 'Press Enter to send to the room.' : 'Your conversation will appear when you connect.'}</p></form>
        </section>
      </div>
      <footer className="call-footer"><span>Built for connection. Designed with care.</span><span>Limited vocabulary · No medical, legal, or emergency use</span></footer>
    </main>
  );
}
