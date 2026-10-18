import { useEffect, useLayoutEffect, useRef } from 'react';
import { birdAssets } from '../lib/introAssets';
import './BirdIllustration.css';
import './Songbirds.css';

/** The welcome bird joins a blue bird on the left, using the same drawn poses. */
export function Songbirds({ className = '', landing = false, onLanded }: {
  className?: string; landing?: boolean; onLanded?: () => void;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const bird = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!landing || !scene.current || !bird.current) return;
    const bounds = scene.current.getBoundingClientRect();
    const perch = bird.current;
    // Layout offsets remain stable during StrictMode's effect replay, unlike an
    // animated bounding rectangle. Match the chest anchor in the welcome/loader.
    const chestX = bounds.left + perch.offsetLeft + perch.offsetWidth * .44;
    const chestY = bounds.top + perch.offsetTop + perch.offsetHeight * .61;
    perch.style.setProperty('--landing-x', `${window.innerWidth / 2 - chestX}px`);
    perch.style.setProperty('--landing-y', `${window.innerHeight / 2 - chestY}px`);
    perch.style.setProperty('--landing-scale', `${Math.min(window.innerWidth * .52, 320) / perch.offsetWidth}`);
  }, [landing]);
  useEffect(() => {
    if (!landing) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const contrast = window.matchMedia('(forced-colors: active)');
    const finish = () => onLanded?.();
    const preference = () => { if (motion.matches || contrast.matches) finish(); };
    const skip = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(); };
    preference();
    // Entry stays usable when CSS animation events are disabled or interrupted.
    const timer = setTimeout(finish, 1500);
    motion.addEventListener('change', preference);
    contrast.addEventListener('change', preference);
    window.addEventListener('keydown', skip);
    window.addEventListener('resize', finish);
    return () => {
      clearTimeout(timer);
      motion.removeEventListener('change', preference);
      contrast.removeEventListener('change', preference);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('resize', finish);
    };
  }, [landing, onLanded]);
  return <div ref={scene} className={`songbirds ${landing ? 'songbirds--landing' : ''} ${className}`} aria-hidden="true">
    <img className="songbirds__branch" src={birdAssets.branch} alt="" width="1536" height="1024" draggable="false" onError={() => onLanded?.()} />
    <span ref={bird} className="songbirds__welcome" onAnimationEnd={event => {
      if (event.animationName === 'bird-branch-landing') onLanded?.();
    }}><span className="bird-illustration__sprite" style={{ backgroundImage: `url("${birdAssets.frames}")` }} /></span>
  </div>;
}
