import { useEffect, useRef, useState } from 'react';
import { createTracker, type Tracker } from './landmarks';
import type { Frame } from './types';

/** One owner for the camera, model instances, and animation loop. */
export function useCameraTracker(enabled: boolean, withFace: boolean, onFrame: (frame: Frame, detectMs: number) => void, interleaved = false) {
  const video = useRef<HTMLVideoElement>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let tracker: Tracker | null = null;
    const element = video.current;
    const release = () => {
      cancelAnimationFrame(raf);
      tracker?.close();
      tracker = null;
      stream?.getTracks().forEach((track) => track.stop());
      if (element && element.srcObject === stream) element.srcObject = null;
    };
    void (async () => {
      await Promise.resolve();
      if (stopped) return;
      setPreviewReady(false);
      setReady(false);
      setError('');
      try {
        if (!element || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('camera unavailable');
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: 30 }, audio: false });
        if (stopped) { release(); return; }
        element.srcObject = stream;
        await element.play();
        if (stopped) { release(); return; }
        // Live video is available before the tracking models finish loading.
        setPreviewReady(true);
        tracker = await createTracker({ withFace, interleaved });
        if (stopped) { release(); return; }
        setReady(true);
        let lastTime = -1;
        const loop = () => {
          if (stopped) return;
          try {
            if (element.readyState >= 2 && element.currentTime !== lastTime) {
              lastTime = element.currentTime;
              const start = performance.now();
              const frame = tracker!.detect(element, start);
              onFrame(frame, performance.now() - start);
            }
            raf = requestAnimationFrame(loop);
          } catch {
            release();
            setPreviewReady(false);
            setReady(false);
            setError('Tracking stopped. Restart the camera and try again.');
          }
        };
        loop();
      } catch (cause) {
        release();
        if (!stopped) {
          setPreviewReady(false);
          setReady(false);
          setError(cause instanceof DOMException && cause.name === 'NotAllowedError'
            ? 'Camera access was denied. Allow camera access, then try again.'
            : 'Could not start tracking. Check your camera and local model files, then try again.');
        }
      }
    })();
    return () => { stopped = true; release(); };
  }, [enabled, withFace, onFrame, interleaved]);

  return { video, previewReady: enabled && previewReady, ready: enabled && ready, error: enabled ? error : '' };
}
