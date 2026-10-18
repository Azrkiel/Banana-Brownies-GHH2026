import { BirdScene } from '../components/BirdScene';
import { Button, Badge, Icon, PageHeader, Surface } from '../components/ui';
import { useCallback, useRef, useState } from 'react';
import { drawLandmarksOverlay } from '../lib/landmarks';
import { useCameraTracker } from '../lib/useCameraTracker';
import type { Frame } from '../lib/types';
import './Studio.css';

export default function Bench() {
  const [enabled, setEnabled] = useState(false);
  const [withFace, setWithFace] = useState(true);
  const [info, setInfo] = useState('Not started');
  const stats = useRef({ count: 0, ms: 0, start: 0 });
  const overlay = useRef<HTMLCanvasElement>(null);
  const onFrame = useCallback((frame: Frame, detectMs: number) => {
    if (overlay.current) {
      overlay.current.width = frame.w; overlay.current.height = frame.h;
      drawLandmarksOverlay(overlay.current, frame, { mirror: true });
    }
    const s = stats.current;
    if (!s.start) s.start = frame.t;
    s.count++; s.ms += detectMs;
    const elapsed = frame.t - s.start;
    if (elapsed >= 1000) {
      setInfo(`FPS ${(s.count * 1000 / elapsed).toFixed(1)} · detect ${(s.ms / s.count).toFixed(1)} ms · hands ${frame.hands.length} · pose ${frame.pose ? 'yes' : 'no'} · brow ${frame.brow ? frame.brow.raise.toFixed(2) + '/' + frame.brow.furrow.toFixed(2) : '-'}`);
      stats.current = { count: 0, ms: 0, start: frame.t };
    }
  }, []);
  const { video, previewReady, ready, error } = useCameraTracker(enabled, withFace, onFrame);
  const status = error || (enabled && !ready ? previewReady ? 'Loading tracking models…' : 'Starting camera…' : info);
  return (
    <main className="studio-page" id="main-content">
      <PageHeader title="Camera check"
        accessory={<Badge tone={previewReady ? 'positive' : 'neutral'}>{previewReady ? 'Camera ready' : enabled && !error ? 'Starting camera' : 'Camera off'}</Badge>} />
      <p className="studio-lead">Make sure your hands are in frame and tracked smoothly.</p>
      <div className="studio-layout">
        <div className="recorder-workspace">
          <section className="camera-stage" aria-label="Camera preview">
            <video ref={video} muted playsInline className="mirror" width={480} />
            <canvas ref={overlay} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', visibility: enabled && ready ? 'visible' : 'hidden' }} />
            {(!enabled || error) && <div className="camera-stage__placeholder"><BirdScene scene="flight" className="camera-illustration" /></div>}
            {previewReady && <span className="camera-stage__label"><span className="status-dot" />Local preview · Mirrored</span>}
          </section>
          <div className="recorder-camera-controls"><p role="status">{error}</p><Button variant={enabled ? 'secondary' : 'primary'} onClick={() => {
            stats.current = { count: 0, ms: 0, start: 0 };
            setEnabled(!enabled);
          }}><Icon name="camera" />{enabled ? 'Stop camera' : 'Start camera'}</Button></div>
        </div>
        <aside className="studio-sidebar">
          <Surface aria-labelledby="bench-details"><details className="studio-details"><summary id="bench-details">Technical details</summary>
            <label className="check-field"><input type="checkbox" checked={withFace} onChange={(e) => {
              stats.current = { count: 0, ms: 0, start: 0 };
              setWithFace(e.target.checked);
            }} /><span>Include face model</span></label>
            <p className="studio-target">20<span> FPS target</span></p><p className="studio-status" role="status">{status}</p>
          </details></Surface>
        </aside>
      </div>
      <p className="studio-privacy"><Icon name="shield" />On-device processing. Nothing recorded.</p>
    </main>
  );
}
