import { useCallback, useRef, useState } from 'react';
import { useCameraTracker } from '../lib/useCameraTracker';
import type { Frame } from '../lib/types';

export default function Bench() {
  const [enabled, setEnabled] = useState(false);
  const [withFace, setWithFace] = useState(true);
  const [info, setInfo] = useState('Start the camera to measure tracking performance.');
  const stats = useRef({ count: 0, ms: 0, start: 0 });
  const onFrame = useCallback((frame: Frame, detectMs: number) => {
    const s = stats.current;
    if (!s.start) s.start = frame.t;
    s.count++; s.ms += detectMs;
    const elapsed = frame.t - s.start;
    if (elapsed >= 1000) {
      setInfo(`FPS ${(s.count * 1000 / elapsed).toFixed(1)} · detect ${(s.ms / s.count).toFixed(1)} ms · hands ${frame.hands.length} · pose ${frame.pose ? 'yes' : 'no'} · brow ${frame.brow ? frame.brow.raise.toFixed(2) + '/' + frame.brow.furrow.toFixed(2) : '-'}`);
      stats.current = { count: 0, ms: 0, start: frame.t };
    }
  }, []);
  const { video, ready, error } = useCameraTracker(enabled, withFace, onFrame);
  return (
    <main>
      <h1>Camera benchmark</h1>
      <p>No video is recorded or uploaded. Aim for at least 20 FPS on the signer laptop.</p>
      <label><input type="checkbox" checked={withFace} onChange={(e) => {
        stats.current = { count: 0, ms: 0, start: 0 };
        setWithFace(e.target.checked);
      }} /> Include face model</label>
      <button onClick={() => {
        stats.current = { count: 0, ms: 0, start: 0 };
        setEnabled(!enabled);
      }}>{enabled ? 'Stop camera' : 'Start camera'}</button>
      <p role="status">{error || (enabled && !ready ? 'Starting camera and models…' : info)}</p>
      <video ref={video} muted playsInline className="mirror" width={480} />
    </main>
  );
}
