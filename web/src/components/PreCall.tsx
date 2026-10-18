import { useEffect, useRef, useState } from 'react';
import { createMediaCheck, idleCheck, type DeviceCheck, type DeviceKind } from '../lib/mediaCheck';
import type { Role } from '../lib/types';
import { Badge, Button, Icon, PageHeader, Surface } from './ui';
import '../pages/Studio.css';
import './PreCall.css';

function MicrophoneLevel({ stream }: { stream: MediaStream }) {
  const [level, setLevel] = useState(0);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState(false);
  const context = useRef<AudioContext | null>(null);
  useEffect(() => {
    let audio: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let frame = 0;
    let active = true;
    try {
      audio = new AudioContext();
      context.current = audio;
      source = audio.createMediaStreamSource(stream);
      analyser = audio.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser); // Never connect the microphone to speakers.
      const samples = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser!.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length);
        setLevel(Math.min(100, Math.round(rms * 400)));
        setPaused(audio!.state !== 'running');
        frame = requestAnimationFrame(tick);
      };
      tick();
    } catch { queueMicrotask(() => { if (active) setFailed(true); }); }
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      source?.disconnect();
      analyser?.disconnect();
      context.current = null;
      void audio?.close().catch(() => {});
    };
  }, [stream]);
  return <div className="precall-meter">
    <label htmlFor="mic-level">Microphone input level</label>
    <meter id="mic-level" min={0} max={100} value={level}>{level}%</meter>
    <p className="note">{failed ? 'The level meter is unavailable in this browser. Microphone access works, but sound has not been verified.' : 'Say a few words. The bar should move; silence keeps it low.'}</p>
    {paused && !failed && <Button onClick={() => void context.current?.resume().catch(() => setFailed(true))}>Enable level meter</Button>}
  </div>;
}

export function PreCall({ room, name, role, onJoin }: { room: string; name: string; role: Role; onJoin(): void }) {
  const [camera, setCamera] = useState<DeviceCheck>({ ...idleCheck });
  const [microphone, setMicrophone] = useState<DeviceCheck>({ ...idleCheck });
  const video = useRef<HTMLVideoElement>(null);
  const check = useRef<ReturnType<typeof createMediaCheck> | null>(null);
  const departing = useRef(false);
  useEffect(() => {
    const controller = createMediaCheck((kind, next) => {
      if (kind === 'camera') setCamera(next);
      else setMicrophone(next);
    });
    check.current = controller;
    const hide = () => { controller.stop('camera'); controller.stop('microphone'); };
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pagehide', hide);
      controller.dispose();
      check.current = null;
    };
  }, []);
  useEffect(() => {
    const element = video.current;
    if (element) element.srcObject = camera.stream;
    return () => { if (element) element.srcObject = null; };
  }, [camera.stream]);

  const ready = camera.status === 'ready' && (role === 'signer' || microphone.status === 'ready');
  const roleLabel = role === 'signer' ? 'Signer' : 'Hearing participant';
  const needed = [camera.status === 'ready' ? '' : 'start your camera', role === 'hearing' && microphone.status !== 'ready' ? 'test your microphone' : ''].filter(Boolean);
  function start(kind: DeviceKind) { void check.current?.start(kind); }
  function join() {
    if (!ready || departing.current) return;
    const streams = role === 'hearing' ? [camera.stream, microphone.stream] : [camera.stream];
    if (streams.some(stream => !stream || !stream.getTracks().length || stream.getTracks().some(track => track.readyState !== 'live'))) return;
    departing.current = true;
    check.current?.dispose();
    onJoin();
  }
  return <main className="studio-page precall-page" id="main-content">
    <p className="eyebrow precall-room">Call · {room}</p>
    <PageHeader title={role === 'signer' ? 'Check your camera' : 'Check your camera and mic'}
      accessory={<Badge tone={ready ? 'positive' : 'neutral'}>{ready ? 'Ready to join' : 'Checks needed'}</Badge>} />
    <div className="studio-layout">
      <div className="precall-stage"><section className="camera-stage" aria-label="Pre-call camera preview">
        <video ref={video} autoPlay muted playsInline className="mirror" aria-label="Your local camera preview" />
        <div className={`precall-camera-content${camera.status === 'ready' ? ' precall-camera-content--ready' : ''}`}>
          {camera.status !== 'ready' && <div className="precall-camera-prompt"><h2>A moment to get ready.</h2><p>{camera.status === 'starting' ? 'Allow camera access when your browser asks.' : 'Start your camera to check your framing and lighting.'}</p></div>}
          {camera.error && <p className="precall-error" role="alert">{camera.error}</p>}
          <div className="precall-camera-actions">
            <Button variant={camera.status === 'ready' ? 'secondary' : 'primary'} disabled={camera.status === 'starting'} onClick={() => camera.status === 'ready' ? check.current?.stop('camera') : start('camera')}><Icon name="camera" />{camera.status === 'ready' ? 'Stop camera' : camera.status === 'starting' ? 'Starting camera…' : 'Start camera'}</Button>
            {camera.status === 'starting' && <Button onClick={() => check.current?.stop('camera')}>Cancel camera check</Button>}
          </div>
        </div>
        <span className="camera-stage__label"><span className="status-dot" />{camera.status === 'ready' ? 'Local preview · Mirrored' : 'Camera off'}</span>
      </section>
      <p className="precall-caption">Only you can see this preview.</p></div>
      <aside className="studio-sidebar">
        <Surface aria-labelledby="precall-camera-title"><h2 id="precall-camera-title">Camera check</h2>
          <p className="note">Keep your face and hands in view, with light in front of you.</p>
          <p className="precall-status" role="status">{camera.status === 'ready' ? 'Camera ready' : camera.status === 'starting' ? 'Starting camera…' : 'Camera not checked'}</p>
        </Surface>
        <Surface aria-labelledby="precall-mic-title"><h2 id="precall-mic-title">Microphone check</h2>
          {role === 'signer' ? <p className="note">You’re joining as a signer. Your microphone stays off; only a camera check is needed. Your signs from My signs are available after you join.</p> : <>
            <p className="precall-status" role="status">{microphone.status === 'ready' ? 'Microphone access ready' : microphone.status === 'starting' ? 'Starting microphone…' : 'Microphone not checked'}</p>
            {microphone.stream && <MicrophoneLevel stream={microphone.stream} />}
            {microphone.error && <p className="precall-error" role="alert">{microphone.error}</p>}
            <Button disabled={microphone.status === 'starting'} onClick={() => microphone.status === 'ready' ? check.current?.stop('microphone') : start('microphone')}>{microphone.status === 'ready' ? 'Stop microphone test' : 'Test microphone'}</Button>
            {microphone.status === 'starting' && <Button onClick={() => check.current?.stop('microphone')}>Cancel microphone check</Button>}
          </>}
        </Surface>
      </aside>
    </div>
    <p className="studio-privacy"><Icon name="shield" />Checks stay on this device. Nothing is recorded or sent to the call until you join. {role === 'signer' ? 'Your browser’s default camera is used.' : 'Your browser’s default camera and microphone are used.'}</p>
    <div className={`precall-join${ready ? " precall-join--ready" : ""}`} role="group" aria-label="Join the call">
      <div className="precall-join__info"><p className="precall-join__title">Joining as {name} · {roleLabel}</p>
        <p className="note" id="precall-join-hint">{ready ? 'Checks passed. You can join.' : `Still needed: ${needed.join(' and ')}.`}</p></div>
      <Button variant="primary" disabled={!ready} aria-describedby="precall-join-hint" onClick={join}>Join call <Icon name="arrow" /></Button>
    </div>
    <a className="precall-back" href="#/call">Back to call setup</a>
  </main>;
}
