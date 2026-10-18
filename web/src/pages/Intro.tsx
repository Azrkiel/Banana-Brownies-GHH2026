import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { BirdIllustration } from '../components/BirdIllustration';
import { birdAssets } from '../lib/introAssets';
import { Icon } from '../components/ui';
import './Intro.css';

const motionQuery = '(prefers-reduced-motion: reduce)';
const contrastQuery = '(forced-colors: active)';
// The landing page skips the supabase bundle, so read its persisted session key instead of the auth context.
function hasStoredSession(): boolean {
  try { return Object.keys(localStorage).some(key => /^sb-.+-auth-token$/.test(key) && Boolean(localStorage.getItem(key))); } catch { return false; }
}
const preloadCall = () => { void import('./Call').catch(() => { /* Normal navigation can retry loading the route. */ }); };

export default function Intro({ onDepart }: { onDepart?: (animate: boolean) => void }) {
  const [departing, setDeparting] = useState(false);
  const [signedIn] = useState(hasStoredSession);
  const inFlight = useRef(false);
  const ready = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finish = useCallback((animate = false) => {
    if (!inFlight.current) return;
    inFlight.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    onDepart?.(animate);
    window.location.hash = '/conversation';
  }, [onDepart]);

  useEffect(() => {
    document.title = 'SignLine';
    let disposed = false;
    const assets = Object.values(birdAssets).map(src => {
      const image = new Image();
      image.src = src;
      return image.decode();
    });
    void Promise.all(assets).then(() => { if (!disposed) ready.current = true; }).catch(() => {
      // A missing illustration must never block entry to the working UI.
      ready.current = false;
    });
    const preference = window.matchMedia(motionQuery);
    const contrast = window.matchMedia(contrastQuery);
    const motionChanged = () => { if (preference.matches || contrast.matches) finish(); };
    const skip = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(); };
    preference.addEventListener('change', motionChanged);
    contrast.addEventListener('change', motionChanged);
    window.addEventListener('keydown', skip);
    return () => {
      disposed = true;
      inFlight.current = false;
      if (timer.current) clearTimeout(timer.current);
      preference.removeEventListener('change', motionChanged);
      contrast.removeEventListener('change', motionChanged);
      window.removeEventListener('keydown', skip);
    };
  }, [finish]);

  function begin(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (inFlight.current) return;
    preloadCall();
    inFlight.current = true;
    if (window.matchMedia(motionQuery).matches || window.matchMedia(contrastQuery).matches || !ready.current) { finish(); return; }
    setDeparting(true);
    // Animation completion is primary; this also covers disabled CSS or interrupted events.
    timer.current = setTimeout(finish, 600);
  }

  return <main className={`intro-screen ${departing ? 'intro-screen--departing' : ''}`} id="main-content" aria-labelledby="intro-title" aria-busy={departing || undefined}>
    <header className="intro-heading">
      <h1 id="intro-title">SignLine</h1>
      <p className="intro-tagline">Video calls. Shared captions.</p>
      <p className="intro-purpose">For a Deaf or hard of hearing signer and a hearing participant: recognized signs become spoken English, and speech becomes captions.</p>
      <a className="intro-account" href="#/training">{signedIn ? 'My signs' : 'Sign in with GitHub to save your own signs'}</a>
    </header>
    <div className="intro-stage"><BirdIllustration className="intro-illustration" departing={departing} onFlightEnd={() => finish(true)} /></div>
    <a className="ui-button ui-button--primary intro-begin" href="#/conversation" onClick={begin} onPointerEnter={preloadCall} onFocus={preloadCall} aria-disabled={departing || undefined}>Begin <Icon name="arrow" /></a>
  </main>;
}
