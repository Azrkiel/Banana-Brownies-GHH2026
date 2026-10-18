import { AstronomyArt } from '../components/AstronomyArt';
import { Button, Badge, Icon, PageHeader, Surface } from '../components/ui';
import { useCallback, useRef, useState } from 'react';
import { useCameraTracker } from '../lib/useCameraTracker';
import type { Frame } from '../lib/types';
import './Studio.css';

export default function Bench() {
  const [enabled, setEnabled] = useState(false);
  const [withFace, setWithFace] = useState(true);
  const [info, setInfo] = useState('Not started');
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
    <main className="studio-page" id="main-content">
      <PageHeader title="Camera"
        accessory={<Badge tone={ready ? 'positive' : 'neutral'}>{ready ? 'Camera ready' : 'Camera standby'}</Badge>} />
      <div className="studio-layout">
        <section className="camera-stage" aria-label="Camera benchmark preview">
          <video ref={video} muted playsInline className="mirror" width={480} />
          {!ready && <div className="camera-stage__placeholder"><AstronomyArt className="camera-astronomy" />{enabled && <p>Loading camera…</p>}</div>}
          <span className="camera-stage__label"><span className="status-dot" />{ready ? 'Local preview · Mirrored' : 'Camera off'}</span>
        </section>
        <aside className="studio-sidebar">
          <Surface aria-label="Camera controls">
            <label className="check-field"><input type="checkbox" checked={withFace} onChange={(e) => {
              stats.current = { count: 0, ms: 0, start: 0 };
              setWithFace(e.target.checked);
            }} /><span>Include face model</span></label>
            <Button variant={enabled ? 'secondary' : 'primary'} onClick={() => {
              stats.current = { count: 0, ms: 0, start: 0 };
              setEnabled(!enabled);
            }}><Icon name="camera" />{enabled ? 'Stop camera' : 'Start camera'}</Button>
          </Surface>
          <Surface aria-labelledby="bench-performance"><h2 id="bench-performance">Tracking</h2><p className="studio-target">20<span> FPS target</span></p><p className="studio-status" role="status">{error || (enabled && !ready ? 'Starting camera and models…' : info)}</p></Surface>
        </aside>
      </div>
      <p className="studio-privacy"><Icon name="shield" />On-device processing. Nothing recorded.</p>
    </main>
  );
}
