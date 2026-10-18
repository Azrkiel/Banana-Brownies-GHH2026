import { useEffect, useRef, useState } from 'react';
import { createWordCapture, type WordCapture } from './wordRecognition';

/** Training owns one video-only camera and closes it on stop, navigation, or account switch. */
export function useSignCapture(enabled: boolean, onHidden: () => void) {
  const video = useRef<HTMLVideoElement>(null);
  const engine = useRef<WordCapture | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let stream: MediaStream | null = null;
    let ownedCapture: WordCapture | null = null;
    const element = video.current;
    const release = () => {
      controller.abort();
      ownedCapture?.close();
      if (engine.current === ownedCapture) engine.current = null;
      stream?.getTracks().forEach(track => track.stop());
      if (element && element.srcObject === stream) element.srcObject = null;
    };
    const hidden = () => { release(); onHidden(); };
    window.addEventListener('pagehide', hidden);
    void (async () => {
      setReady(false); setError('');
      try {
        if (!element || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera unavailable');
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 }, audio: false });
        if (controller.signal.aborted) { release(); return; }
        element.srcObject = stream;
        await element.play();
        controller.signal.throwIfAborted();
        let capture: WordCapture;
        try { const { createV2Capture } = await import('./v2Recognition'); capture = await createV2Capture(element, controller.signal); }
        catch { controller.signal.throwIfAborted(); capture = await createWordCapture(element, controller.signal); }
        if (controller.signal.aborted) { capture.close(); return; }
        ownedCapture = capture;
        engine.current = capture;
        setReady(true);
      } catch (cause) {
        const cancelled = controller.signal.aborted;
        release();
        if (!cancelled) {
          setReady(false);
          setError(cause instanceof DOMException && cause.name === 'NotAllowedError'
            ? 'Camera permission was denied. Allow it and restart the camera.'
            : 'Could not start the camera. Check the camera and hand model, then restart it.');
        }
      }
    })();
    return () => { window.removeEventListener('pagehide', hidden); release(); };
  }, [enabled, onHidden]);
  return { video, engine, ready: enabled && ready, error: enabled ? error : '' };
}
