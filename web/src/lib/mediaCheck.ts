export type DeviceKind = 'camera' | 'microphone';
export type DeviceCheck = { status: 'idle' | 'starting' | 'ready' | 'error'; stream: MediaStream | null; error: string };
export const idleCheck: DeviceCheck = { status: 'idle', stream: null, error: '' };

function errorText(kind: DeviceKind, error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return `Allow ${kind} access in your browser, then try again.`;
    if (error.name === 'NotFoundError') return `No ${kind} was found. Connect one, then try again.`;
    if (error.name === 'NotReadableError') return `Your ${kind} may be in use by another app. Close it there and try again.`;
  }
  return `Could not start your ${kind}. Use HTTPS or localhost, check your device and browser permissions, then try again.`;
}

/** Owns local-only test streams. No API, recording, speech service or room connection. */
export function createMediaCheck(
  update: (kind: DeviceKind, state: DeviceCheck) => void,
  acquire: (constraints: MediaStreamConstraints) => Promise<MediaStream> = constraints => navigator.mediaDevices.getUserMedia(constraints),
) {
  let disposed = false;
  const devices = {
    camera: { epoch: 0, pending: false, stream: null as MediaStream | null, detach: () => {} },
    microphone: { epoch: 0, pending: false, stream: null as MediaStream | null, detach: () => {} },
  };
  function release(kind: DeviceKind) {
    const device = devices[kind];
    device.epoch++;
    device.pending = false;
    device.detach();
    device.detach = () => {};
    device.stream?.getTracks().forEach(track => track.stop());
    device.stream = null;
  }
  function stop(kind: DeviceKind) {
    release(kind);
    if (!disposed) update(kind, { ...idleCheck });
  }
  return {
    async start(kind: DeviceKind) {
      const device = devices[kind];
      if (disposed || device.pending || device.stream) return;
      const epoch = ++device.epoch;
      device.pending = true;
      const active = () => !disposed && device.epoch === epoch;
      update(kind, { status: 'starting', stream: null, error: '' });
      try {
        const stream = await acquire(kind === 'camera'
          ? { video: { width: 640, height: 480, frameRate: 30 }, audio: false }
          : { video: false, audio: true });
        if (!active()) { stream.getTracks().forEach(track => track.stop()); return; }
        device.stream = stream;
        const ended = () => { if (active()) stop(kind); };
        const tracks = stream.getTracks();
        if (!tracks.length || tracks.some(track => track.readyState === 'ended')) {
          stop(kind);
          return;
        }
        tracks.forEach(track => track.addEventListener('ended', ended));
        device.detach = () => tracks.forEach(track => track.removeEventListener('ended', ended));
        update(kind, { status: 'ready', stream, error: '' });
      } catch (error) {
        if (active()) update(kind, { status: 'error', stream: null, error: errorText(kind, error) });
      } finally {
        if (active()) device.pending = false;
      }
    },
    stop,
    dispose() {
      disposed = true;
      release('camera');
      release('microphone');
    },
  };
}
