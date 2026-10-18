import { useEffect, useState } from 'react';
import { birdAssets } from '../lib/introAssets';
import './BirdIllustration.css';
import './BirdLoading.css';

/** Continue the welcome flight while React waits for the working screen. */
export function BirdLoading() {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let disposed = false;
    const image = new Image();
    image.src = birdAssets.frames;
    void image.decode().catch(() => { if (!disposed) setMissing(true); });
    return () => { disposed = true; };
  }, []);
  return <main id="main-content" className={`bird-loading ${missing ? 'bird-loading--missing' : ''}`} aria-busy="true">
    <p className="bird-loading__status" role="status">Loading…</p>
    <span className="bird-loading__flight" aria-hidden="true">
      <span className="bird-illustration__sprite" style={{ backgroundImage: `url("${birdAssets.frames}")` }} />
    </span>
  </main>;
}
