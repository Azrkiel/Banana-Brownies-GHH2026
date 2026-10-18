import { birdAssets } from '../lib/introAssets';
import './BirdIllustration.css';

/** The six registered poses are hand-drawn frames, not a transformed still image. */
export function BirdIllustration({ className = '', departing = false, onFlightEnd }: {
  className?: string; departing?: boolean; onFlightEnd?: () => void;
}) {
  return <div className={`bird-illustration ${departing ? 'bird-illustration--departing' : ''} ${className}`} aria-hidden="true">
    <img className="bird-illustration__hand" src={birdAssets.hand} alt="" width="1536" height="1024" draggable="false" />
    <span className="bird-illustration__flight" onAnimationEnd={event => {
      if (event.animationName === 'bird-flight') onFlightEnd?.();
    }}><span className="bird-illustration__sprite" style={{ backgroundImage: `url("${birdAssets.frames}")` }} /></span>
  </div>;
}
