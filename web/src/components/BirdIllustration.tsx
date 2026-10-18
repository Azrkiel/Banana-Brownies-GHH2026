import { useLayoutEffect, useRef } from 'react';
import { birdAssets } from '../lib/introAssets';
import './BirdIllustration.css';

/** The six registered poses are hand-drawn frames, not a transformed still image. */
export function BirdIllustration({ className = '', departing = false, onFlightEnd }: {
  className?: string; departing?: boolean; onFlightEnd?: () => void;
}) {
  const flight = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!departing || !flight.current) return;
    const bounds = flight.current.getBoundingClientRect();
    // Track the bird's chest, rather than the changing tips of its wings.
    flight.current.style.setProperty('--flight-x', `${window.innerWidth / 2 - bounds.left - bounds.width * .44}px`);
    flight.current.style.setProperty('--flight-y', `${window.innerHeight / 2 - bounds.top - bounds.height * .61}px`);
    flight.current.style.setProperty('--flight-scale', `${Math.min(window.innerWidth * .52, 320) / bounds.width}`);
  }, [departing]);
  return <div className={`bird-illustration ${departing ? 'bird-illustration--departing' : ''} ${className}`} aria-hidden="true">
    <img className="bird-illustration__hand" src={birdAssets.hand} alt="" width="1536" height="1024" draggable="false" />
    <span ref={flight} className="bird-illustration__flight" onAnimationEnd={event => {
      if (event.animationName === 'bird-flight') onFlightEnd?.();
    }}><span className="bird-illustration__sprite" style={{ backgroundImage: `url("${birdAssets.frames}")` }} /></span>
  </div>;
}
