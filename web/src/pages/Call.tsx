import { Songbirds } from '../components/Songbirds';
import { CallBranch } from '../components/CallBranch';
import { Badge, Button, Icon } from '../components/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { RemoteTrack } from 'livekit-client';
import { joinCall, joinErrorMessage, SECURE_CONTEXT_ERROR, type Call as CallT, type CallStatus } from '../lib/call';
import { CaptionLane } from '../components/CaptionLane';
import { PreCall } from '../components/PreCall';
import { SignerWords } from '../components/SignerWords';
import { counterAnnouncement, createCaptionHistory, LOCAL_SOURCE } from '../lib/captions';
import { createSpeechCaptions } from '../lib/speechCaptions';
import { createCallSpeech, type CallSpeechState } from '../lib/callSpeech';
import { getVoices, translateGloss, type VoiceInfo } from '../lib/api';
import { glossToEnglish } from '../lib/signedSentence';
import { createSignerVoice, speakToRoom, spokenText, MAX_SPOKEN_CHARS, type SignerVoice } from '../lib/signerVoice';
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
  reconnecting: 'Reconnecting…', disconnected: 'Call ended', 'audio-blocked': 'Audio blocked',
};
const statusTone = (status: Status): 'neutral' | 'positive' | 'warning' =>
  status === 'connected' ? 'positive' : status === 'reconnecting' || status === 'audio-blocked' || status === 'joining' ? 'warning' : 'neutral';

const CAPTION_SIZES = ['small', 'medium', 'large'] as const;
type CaptionSize = typeof CAPTION_SIZES[number];
const SIZE_KEY = 'signline.captionSize';
function readCaptionSize(): CaptionSize {
  try { const saved = localStorage.getItem(SIZE_KEY); return CAPTION_SIZES.find(size => size === saved) ?? 'medium'; }
  catch { return 'medium'; }
}
/** Where "Leave" should send the browser: a same-page hash when possible, otherwise the full address. */
function navTarget(href: string): string {
  try { const url = new URL(href, window.location.href); if (url.origin === window.location.origin && url.pathname === window.location.pathname) return url.hash || '#/'; }
  catch { /* fall through to the raw address */ }
  return href;
}
const typingTarget = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const ROOM_PATTERN = /^[a-z0-9-]{3,32}$/;

function roomUrl(room: string, name: string, role: Role): string {
  const params = new URLSearchParams({ room, name, role });
  return `/room?${params}`;
}

const normalizeRoom = (value: string) => value.toLowerCase().replace(/\s+/g, '-');
function randomRoom(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `call-${Array.from(bytes, byte => 'abcdefghijklmnopqrstuvwxyz0123456789'[byte % 36]).join('')}`;
}
function initialRoom(): string {
  const requested = normalizeRoom(new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('room') ?? '');
  return ROOM_PATTERN.test(requested) ? requested : randomRoom();
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

const roleOptions: { value: Role; label: string; help: string }[] = [
  { value: 'signer', label: 'Signer', help: 'You sign; recognized signs are spoken aloud for the other person.' },
  { value: 'hearing', label: 'Hearing participant', help: 'You speak; your speech appears as captions for the signer.' },
];

export default function Call({ welcomeFlight = false, onLanded }: { welcomeFlight?: boolean; onLanded?: () => void }) {
  const [flightEntry] = useState(welcomeFlight);
  const [room, setRoom] = useState(initialRoom);
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('signer');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const roomValid = ROOM_PATTERN.test(room);
  const canJoin = Boolean(name.trim()) && roomValid;
  const hint = !name.trim() ? 'Enter your name to join' : !roomValid ? 'Fix the room name to join' : '';

  function open(event: FormEvent) {
    event.preventDefault();
    if (!canJoin) return;
    window.location.hash = roomUrl(room, name.trim(), role);
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#/conversation?room=${encodeURIComponent(room)}`);
      setCopyError('');
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch { setCopied(false); setCopyError('Couldn’t copy the link. Copy it from the address bar after joining.'); }
  }

  return (
    <main className={`call-page home-page${flightEntry ? ' home-page--flight-entry' : ''}`} id="main-content">
      <div className="home-content">
        <header className="home-heading"><h1>Call</h1></header>
        <div className="home-layout">
          <Songbirds className="home-illustration" landing={welcomeFlight} onLanded={onLanded} />
          <section className="home-join" aria-label="Join a call">
            <form className="join-bar" onSubmit={open}>
              <label>Name<input autoComplete="given-name" placeholder="Your name" value={name} maxLength={40} required onChange={event => setName(event.target.value)} /></label>
              <div className="join-field">
                <label>Room name<input value={room} required spellCheck={false} autoCapitalize="none" aria-invalid={!roomValid || undefined} aria-describedby={roomValid ? 'room-help' : 'room-help room-error'} onChange={event => setRoom(normalizeRoom(event.target.value))} onBlur={() => setRoom(value => normalizeRoom(value).replace(/^-+|-+$/g, ''))} /></label>
                <p className="join-help" id="room-help">3–32 lowercase letters, numbers or hyphens. Share the invite link so the other person joins the same room.</p>
                {!roomValid && <p className="join-error" id="room-error">Use 3–32 lowercase letters, numbers or hyphens.</p>}
                <div className="join-invite">
                  <Button type="button" onClick={() => void copyInvite()} disabled={!roomValid}>Copy invite link</Button>
                  <span role="status" className="join-help">{copied ? 'Copied' : ''}</span>
                </div>
                {copyError && <p className="join-error" role="alert">{copyError}</p>}
              </div>
              <fieldset className="join-roles"><legend>Role</legend>
                {roleOptions.map(option => <label className="role-option" key={option.value}>
                  <input type="radio" name="role" value={option.value} checked={role === option.value} aria-describedby={`role-${option.value}`} onChange={() => setRole(option.value)} />
                  <span><span className="role-option__label">{option.label}</span><span className="join-help" id={`role-${option.value}`}>{option.help}</span></span>
                </label>)}
              </fieldset>
              <Button variant="primary" type="submit" disabled={!canJoin} aria-describedby="join-hint">Join <Icon name="arrow" /></Button>
              <p className="join-help" id="join-hint">{hint ? `${hint}. ` : ''}Next: a quick camera and microphone check before you join.</p>
            </form>
          </section>
        </div>
      </div>
      <CallBranch />
    </main>
  );
}

export function CallRoom({ query }: { query: string }) {
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    if (!checked) return;
    const main = document.querySelector<HTMLElement>('main');
    if (main) { main.tabIndex = -1; main.focus({ preventScroll: true }); }
  }, [checked]);
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
  const [peerLeft, setPeerLeft] = useState<string | null>(null);
  const [remoteVisible, setRemoteVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [speechState, setSpeechState] = useState<CallSpeechState>('disabled');
  const [speechError, setSpeechError] = useState('');
  const [deliveryError, setDeliveryError] = useState('');
  const [consented, setConsented] = useState(false);
  const [muted, setMuted] = useState(false);
  const [muting, setMuting] = useState(false);
  const [history] = useState(() => createCaptionHistory(setCaptions));
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [voicesLoaded, setVoicesLoaded] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceId, setVoiceId] = useState('');
  const [speakAloud, setSpeakAloud] = useState(true);
  const [polish, setPolish] = useState(true);
  const [speaking, setSpeaking] = useState(0);
  const [voiceError, setVoiceError] = useState('');
  const [failedSpeech, setFailedSpeech] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [endReason, setEndReason] = useState<'left' | 'dropped' | null>(null);
  const [pendingWords, setPendingWords] = useState(false);
  const [counterNote, setCounterNote] = useState('');
  const [textSize, setTextSize] = useState<CaptionSize>(readCaptionSize);
  const voice = useRef<SignerVoice | null>(null);
  const speechQueue = useRef<Promise<void>>(Promise.resolve());
  const speakEpoch = useRef(0);
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
  const peerName = useRef<string | null>(null);
  const pendingNav = useRef<string | null>(null);
  const focusAfterLeave = useRef(false);
  const focusOnJoin = useRef(false);
  const leaveOpener = useRef<HTMLElement | null>(null);
  const focusStay = useRef(false);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const shortcuts = useRef<{ mute(): void }>({ mute: () => {} });
  const inRoom = status === 'connected' || status === 'reconnecting' || status === 'audio-blocked';
  const busy = inRoom || status === 'joining';
  const canSend = status === 'connected' || status === 'audio-blocked';
  const speechEnabled = !['disabled', 'failed', 'stopped'].includes(speechState);
  const voiceReady = voiceSupported && !!voiceId;
  const voiceUnavailable = role === 'signer' && inRoom && voicesLoaded && !voiceReady;
  const reconnecting = status === 'reconnecting';
  // One voice message at a time: a specific error wins over the general "unavailable" note.
  const voiceNote = voiceError || (voiceUnavailable && speakAloud ? 'Voice unavailable — captions are text only.' : '');
  const spokenAloud = role === 'signer' && speakAloud && voiceReady;
  const startHint = speechEnabled ? '' : !consented ? 'Agree above to start captions.' : !canSend ? 'Join the call to start captions.' : muted ? 'Unmute your microphone to start captions.' : '';

  useEffect(() => {
    if (role !== 'signer') return;
    let live = true;
    getVoices().then(list => { if (live) { setVoicesLoaded(true); if (list.length) { setVoices(list); setVoiceId(id => id || list[0].id); } } },
      () => { if (live) { setVoicesLoaded(true); setVoiceError('Voices could not be loaded. Captions are still sent as text.'); } });
    return () => { live = false; };
  }, [role]);

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
      voice.current?.close(); voice.current = null;
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

  function openLeave() {
    const active = document.activeElement;
    leaveOpener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    setConfirmLeave(true);
  }
  // While in the call, the site nav is hidden (CSS), the brand link and browser Back/hash changes ask first.
  useEffect(() => {
    if (!inRoom) { setConfirmLeave(false); return; }
    document.body.dataset.inCall = '1';
    const guardLinks = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('.site-header a') : null;
      if (!link) return;
      event.preventDefault(); event.stopPropagation();
      pendingNav.current = link.getAttribute('href');
      openLeave();
    };
    const requestLeave = (event: Event) => {
      const href = event instanceof CustomEvent ? (event.detail as { href?: string } | null)?.href : undefined;
      if (!href) return;
      pendingNav.current = navTarget(href);
      openLeave();
    };
    document.addEventListener('click', guardLinks, true);
    window.addEventListener('signline:leave-request', requestLeave);
    return () => {
      delete document.body.dataset.inCall;
      document.removeEventListener('click', guardLinks, true);
      window.removeEventListener('signline:leave-request', requestLeave);
    };
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [inRoom]);

  // Closing the tab only warns when something would be lost: someone else is here, or there is unsent text or pending words.
  const warnUnload = inRoom && (!!peer || draft.trim().length > 0 || pendingWords);
  useEffect(() => {
    if (!warnUnload) return;
    const guardUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guardUnload);
    return () => window.removeEventListener('beforeunload', guardUnload);
  }, [warnUnload]);

  useEffect(() => {
    if (confirmLeave) { document.getElementById('leave-stay')?.focus(); return; }
    if (!focusStay.current) return;
    focusStay.current = false;
    const opener = leaveOpener.current; leaveOpener.current = null;
    (opener?.isConnected ? opener : document.getElementById('leave-call'))?.focus();
  }, [confirmLeave]);
  useEffect(() => {
    if (status === 'disconnected' && focusAfterLeave.current) { focusAfterLeave.current = false; stageHeading.current?.focus(); }
    if (status === 'joining' && focusOnJoin.current) { focusOnJoin.current = false; stageHeading.current?.focus(); }
  }, [status]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !typingTarget(event.target)) {
        const input = document.getElementById('caption-draft');
        if (input instanceof HTMLInputElement && !input.disabled) { event.preventDefault(); input.focus(); }
      } else if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyM' && role === 'hearing') {
        event.preventDefault(); shortcuts.current.mute();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [role]);

  function chooseSize(size: CaptionSize) {
    setTextSize(size);
    try { localStorage.setItem(SIZE_KEY, size); } catch { /* storage may be blocked */ }
  }

  function resetMedia() {
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    voice.current?.close(); voice.current = null;
    setVoiceSupported(false);
    setSpeaking(0);
    if (local.current) local.current.srcObject = null;
    if (remote.current) {
      remoteTrack.current?.detach(remote.current);
      remote.current.srcObject = null;
    }
    remoteTrack.current = null;
    setRemoteVisible(false);
    setPeer(null); setPeerLeft(null); peerName.current = null;
  }

  async function join(event?: FormEvent) {
    event?.preventDefault();
    if (joining.current || call.current) return;
    const attempt = ++generation.current;
    const active = () => generation.current === attempt;
    joining.current = true;
    connectionAbort.current = new AbortController();
    setStatus('joining');
    setError(''); setEndReason(null);
    speech.current?.dispose();
    delivery.current?.dispose();
    history.reset();
    setSpeechState('disabled'); setSpeechError(''); setDeliveryError(''); setConsented(false);
    setMuted(false); setMuting(false); mutingRef.current = false;
    const sender = createSpeechCaptions({
      speaker: name,
      local: caption => { if (active()) history.receive(caption, LOCAL_SOURCE); },
      remove: (id, revision) => { if (active()) history.clear(id, revision, LOCAL_SOURCE); },
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
        throw new Error(SECURE_CONTEXT_ERROR);
      }
      const media = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 }, audio: false });
      if (!active()) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      if (local.current) local.current.srcObject = media;
      // The signer's spoken captions travel as this call's microphone track.
      voice.current?.close();
      voice.current = null;
      if (role === 'signer') {
        try { voice.current = createSignerVoice(); setVoiceSupported(true); }
        catch { setVoiceSupported(false); setVoiceError('This browser cannot play a voice into the call. Captions are still sent as text.'); }
      }
      const connected = await joinCall({
        room, name, role, camera: media.getVideoTracks()[0], voice: voice.current?.track, signal: connectionAbort.current.signal,
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
              setEndReason('dropped');
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
          onPeer: next => {
            if (!active()) return;
            setPeer(next);
            if (next) { peerName.current = next; setPeerLeft(null); }
            else if (peerName.current) { setPeerLeft(peerName.current); peerName.current = null; }
          },
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
      setError(joinErrorMessage(cause));
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
    speakEpoch.current++;
    connectionAbort.current?.abort();
    joining.current = false;
    const previous = call.current;
    call.current = null;
    resetMedia();
    setStatus('disconnected'); setEndReason('left');
    setError(''); setFailedSpeech(null);
    setSpeechState('disabled'); setSpeechError(''); setDeliveryError(''); setConsented(false);
    setSending(false);
    sendingRef.current = false;
    try { await previous?.leave(); }
    catch { setError('The connection closed unexpectedly. Your camera has been stopped.'); }
  }

  async function confirmedLeave() {
    const next = pendingNav.current; pendingNav.current = null;
    setConfirmLeave(false);
    focusAfterLeave.current = !next;
    await leave();
    if (next) { delete document.body.dataset.inCall; if (next.startsWith('#')) window.location.hash = next; else window.location.assign(next); }
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
      history.receive(caption, LOCAL_SOURCE);
      setDraft(value => value === draft ? '' : value);
      if (role === 'signer' && speakAloud) speak(text);
    } catch {
      if (generation.current === attempt) setError('Your caption wasn’t sent. Your text is still here; try sending it again.');
    } finally {
      if (generation.current === attempt) { setSending(false); sendingRef.current = false; }
    }
  }

  /** Turns dictated signs into the sentence the signer sees in the preview before anything is sent. */
  async function prepareSigned(words: { label: string; score: number }[]): Promise<string> {
    const context = captions.filter(caption => caption.role === 'hearing' && caption.final && !caption.retracted).slice(-3).map(caption => caption.text);
    return spokenText(polish ? await glossToEnglish(words, context, translateGloss) : words.map(word => word.label).join(' '));
  }

  /** Sends a sentence the signer confirmed (or let the preview countdown confirm): only confident signs reach here. */
  async function sendSigned(text: string): Promise<string | null> {
    const current = call.current;
    if (!current || !canSend || !text.trim()) return null;
    const attempt = generation.current;
    const caption: Caption = { id: crypto.randomUUID(), speaker: name, role, kind: 'english', text, final: true, ts: Date.now() };
    try {
      await current.sendCaption(caption);
      if (generation.current !== attempt) return null;
      history.receive(caption, LOCAL_SOURCE);
      if (speakAloud) speak(text);
      return text;
    } catch {
      // The signer panel reports this failure next to the preview, so it is not repeated in the page banner.
      return null;
    }
  }

  /** Queued so consecutive captions are spoken in order rather than cutting each other off. */
  function speak(text: string) {
    const current = call.current;
    const signerVoice = voice.current;
    if (!current || !signerVoice || !voiceId) return;
    const attempt = generation.current;
    const epoch = speakEpoch.current;
    setSpeaking(count => count + 1); setVoiceError(''); setFailedSpeech(null);
    speechQueue.current = speechQueue.current.then(async () => {
      try {
        if (generation.current !== attempt || speakEpoch.current !== epoch) return;
        await speakToRoom({ text, voiceId, voice: signerVoice, sendCtrl: message => current.sendCtrl(message) });
      } catch (cause) {
        if (generation.current === attempt && speakEpoch.current === epoch) {
          if (cause instanceof Error && cause.message.includes(`${MAX_SPOKEN_CHARS}`)) setVoiceError(cause.message);
          else { setVoiceError('Couldn’t speak this caption. It was still sent as text.'); setFailedSpeech(text); }
        }
      } finally { if (generation.current === attempt) setSpeaking(count => Math.max(0, count - 1)); }
    });
  }

  function stopSpeaking() {
    speakEpoch.current++;
    voice.current?.stop();
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
  shortcuts.current.mute = () => { if (inRoom) void toggleMicrophone(); };

  const roleLabel = role === 'signer' ? 'Signer' : 'Hearing participant';
  const sendHint = canSend ? spokenAloud ? 'Press Enter to send. It is also spoken aloud to the call.' : 'Press Enter to send to the call.' : reconnecting ? 'Reconnecting… you can send again in a moment.' : 'Join the call to send captions.';

  return (
    <main className="call-page room-page" id="main-content">
      <header className="room-heading">
        <div><h1>{room}</h1></div>
        <p className="intro"><strong>{name}</strong> · {roleLabel}</p>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="call-notices" role="status">
        {status === 'reconnecting' && <p className="call-notice">Reconnecting… Your draft is kept.</p>}
        {status === 'audio-blocked' && <p className="call-notice">Your browser blocked call audio. <Button size="small" onClick={enableAudio}>Turn on audio</Button></p>}
        {inRoom && !peer && peerLeft && <p className="call-notice">{peerLeft} left the call.</p>}
      </div>
      <div className="call-workspace">
        <div className="stage-column">
          <div className="stage" aria-label="Video call">
            <div className="stage-top"><span className="room-label">{room}</span><span className="connection-status" role="status"><Badge tone={statusTone(status)}>{statusText[status]}</Badge></span></div>
            <video ref={remote} autoPlay playsInline className={`remote-video ${remoteVisible ? 'visible' : ''}`} aria-label="The other person’s video" />
            {!remoteVisible && <div className="stage-placeholder">
              <Songbirds className="stage-illustration" />
              <h2 ref={stageHeading} tabIndex={-1}>{inRoom ? peer ? `${peer} is here` : peerLeft ? `${peerLeft} left the call` : 'Waiting for the other person to join' : status === 'joining' ? 'Connecting…' : status === 'disconnected' ? 'Call ended' : 'Not connected'}</h2>
              <p>{inRoom ? peer ? 'Their video will appear when their camera is on.' : peerLeft ? 'They can rejoin with the same link.' : 'Ask someone to join this call to get started.' : status === 'joining' ? 'Allow camera access when your browser asks.' : status === 'disconnected' ? `${endReason === 'dropped' ? 'The call ended.' : 'You left the call.'} Rejoin when you’re ready, or check your devices first.` : 'Choose Rejoin to try connecting again.'}</p>
            </div>}
            <div className="local-tile"><video ref={local} autoPlay muted playsInline className="mirror local-video" aria-label="Your camera preview" />{!busy && <span className="camera-off" aria-hidden="true"><Badge>Camera off</Badge></span>}<span className="video-label">{inRoom ? name : 'You'} <span>· {role === 'signer' ? 'Signer' : 'Hearing participant'}</span></span></div>
            {remoteVisible && <span className="peer-label">{peer ?? 'The other person'}</span>}
          </div>
          <div className="call-toolbar"><p><span className="privacy-dot" />{status === 'joining' ? 'Waiting for camera access and call connection' : inRoom ? role === 'signer' ? spokenAloud ? 'Camera on · captions spoken aloud' : 'Camera on · captions are text only' : muted ? 'Call microphone muted · speech recognition paused' : 'Camera and call microphone enabled' : 'Camera and microphone stay off until you join.'}</p>
            <div className="call-actions">
              {role === 'hearing' && inRoom && <Button disabled={!canSend || muting} aria-keyshortcuts="Alt+M" onClick={() => void toggleMicrophone()}>{muting ? 'Changing microphone…' : muted ? 'Unmute microphone' : 'Mute microphone'} <kbd className="key-hint" aria-hidden="true">Alt+M</kbd></Button>}
              {status === 'joining' && <Button variant="danger" onClick={() => { focusAfterLeave.current = true; void leave(); }}>Cancel</Button>}
              {inRoom && (confirmLeave
                ? <div className="leave-confirm" role="group" aria-label="Leave call?"><span>Leave call?</span><Button variant="danger" onClick={() => void confirmedLeave()}>Leave</Button><Button id="leave-stay" onClick={() => { pendingNav.current = null; focusStay.current = true; setConfirmLeave(false); }}>Stay</Button></div>
                : <Button id="leave-call" variant="danger" onClick={openLeave}>Leave call</Button>)}
              {!busy && <><Button variant="primary" onClick={() => { focusOnJoin.current = true; void join(); }}>Rejoin <Icon name="arrow" /></Button><Button onClick={onRecheck}>Check devices</Button></>}
            </div></div>
        </div>
        <section className="caption-panel" aria-labelledby="caption-title" data-size={textSize}>
          <div className="caption-header"><div><h2 id="caption-title">Captions</h2></div>
            <div className="size-control" role="group" aria-label="Caption text size">{CAPTION_SIZES.map(size => <button key={size} type="button" className="size-btn" data-size={size} aria-pressed={size === textSize} aria-label={`${size[0].toUpperCase()}${size.slice(1)} caption text`} onClick={() => chooseSize(size)}>Aa</button>)}</div></div>
          <CaptionLane captions={captions} />
          <form className="caption-composer" onSubmit={send}><label htmlFor="caption-draft">Type a caption</label><div className="composer-input"><input id="caption-draft" value={draft} maxLength={1000} disabled={!canSend && !reconnecting} placeholder={canSend || reconnecting ? 'Type a caption…' : 'Join the call to type'} onChange={event => {
                const value = event.target.value;
                const note = counterAnnouncement(draft.length, value.length);
                setCounterNote(note ?? (value.length < draft.length ? '' : counterNote));
                setDraft(value);
              }} /><Button type="submit" disabled={!canSend || !draft.trim() || sending} aria-describedby="composer-hint">{sending ? 'Sending…' : 'Send'}</Button></div>
            <p id="composer-hint">{sendHint}</p><span className="composer-count">{draft.length > 800 ? `${draft.length} of 1000 characters` : ''}</span><span className="cap-sr" role="status" aria-live="polite">{draft.length >= 800 ? counterNote : ''}</span>
            {role === 'signer' && <div className="signer-voice">
              <label className="signer-voice__toggle"><input type="checkbox" checked={speakAloud} onChange={event => setSpeakAloud(event.target.checked)} /><span>Speak my captions aloud</span></label>
              <details className="voice-settings"><summary>Voice settings</summary>
                <label className="signer-voice__toggle"><input type="checkbox" checked={polish} onChange={event => setPolish(event.target.checked)} /><span>Turn signed words into English sentences</span></label>
                <label className="signer-voice__select">Voice<select value={voiceId} disabled={!voices.length} onChange={event => setVoiceId(event.target.value)}>
                  {voices.map(option => <option key={option.id} value={option.id}>{option.name.split(' - ')[0]}</option>)}
                </select></label>
              </details>
              {voiceNote && <p className={voiceError ? 'call-speech__error' : undefined} role={voiceError ? 'alert' : 'status'}>{voiceNote}</p>}
              <p role="status">{speaking ? 'Speaking to the call…' : ''}</p>
              {speaking > 0 && <Button size="small" onClick={stopSpeaking}>Stop speaking</Button>}
              {failedSpeech && !speaking && <Button size="small" onClick={() => speak(failedSpeech)}>Try speaking again</Button>}
            </div>}</form>
        </section>
        <div className="call-details">
          {role === 'hearing' && <section className="call-speech" aria-labelledby="call-speech-title" data-consented={consented || undefined}>
            <div className="call-speech__heading"><h2 id="call-speech-title">Speech captions</h2><span role="status">{speechLabels[speechState]}</span></div>
            <label><input type="checkbox" checked={consented} onChange={event => { setConsented(event.target.checked); speech.current?.consent(event.target.checked); }} /><span>I agree to send my microphone audio to SignLine’s speech-to-text provider (ElevenLabs) for captions, and to share the recognized text with this call.</span></label>
            <div className="call-speech__actions"><Button variant="primary" disabled={!speechEnabled && (!consented || !canSend || muted)} aria-describedby={startHint ? 'start-hint' : undefined} onClick={() => { setSpeechError(''); speech.current?.enable(!speechEnabled); }}>{speechEnabled ? 'Stop captions' : 'Start captions'}</Button><p>Stopping captions leaves call audio on. Mute the microphone to pause both.</p>{startHint && <p id="start-hint">{startHint}</p>}</div>
            {speechError && <p className="call-speech__error" role="alert">{speechError}</p>}
            {deliveryError && <p className="call-speech__error" role="alert">{deliveryError}</p>}
          </section>}
          {role === 'signer' && <SignerWords key={busy ? 'call' : 'ended'} camera={local} connected={canSend} reconnecting={reconnecting} onPending={setPendingWords} onPrepare={prepareSigned} onSentence={sendSigned} />}
          <div className="scope-note"><span className="note-icon" aria-hidden="true">i</span><p>Speech and sign recognition can make mistakes. The shared words are a small vocabulary; only confident signs are dictated automatically.</p></div>
          <p className="shortcuts">Shortcuts: <kbd>/</kbd> focus the caption box{role === 'hearing' && <> · <kbd>Alt</kbd>+<kbd>M</kbd> mute or unmute your microphone</>}</p>
        </div>
      </div>

    </main>
  );
}
