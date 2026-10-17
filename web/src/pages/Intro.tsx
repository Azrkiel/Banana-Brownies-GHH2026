import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import OrbitalStars from '../components/OrbitalStars';
import { Icon } from '../components/ui';
import './Intro.css';

const motionQuery = '(prefers-reduced-motion: reduce)';
function subscribeMotion(change: () => void) {
  const preference = window.matchMedia(motionQuery);
  preference.addEventListener('change', change);
  return () => preference.removeEventListener('change', change);
}
const readMotion = () => window.matchMedia(motionQuery).matches;

export default function Intro() {
  const reducedMotion = useSyncExternalStore(subscribeMotion, readMotion);
  const [paused, setPaused] = useState(false);
  const [departing, setDeparting] = useState(false);
  const transition = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.title = 'A little closer · SignLine';
    return () => { if (transition.current) clearTimeout(transition.current); };
  }, []);

  function begin() {
    if (departing) return;
    if (reducedMotion) { window.location.hash = '/conversation'; return; }
    setDeparting(true);
    transition.current = setTimeout(() => { window.location.hash = '/conversation'; }, 650);
  }

  return <main className={`intro-screen ${departing ? 'intro-screen--departing' : ''}`} id="main-content" aria-labelledby="intro-title" data-motion={paused || reducedMotion ? 'paused' : 'playing'}>
    <div className="intro-scene" aria-hidden="true">
      <img className="intro-landscape" src={`${import.meta.env.BASE_URL}intro/earthrise.png`} alt="" fetchPriority="high" />
      <OrbitalStars paused={paused} reducedMotion={reducedMotion} departing={departing} />
      <div className="intro-vignette" />
    </div>
    <header className="intro-header">
      <a className="intro-brand" href="#/welcome" aria-label="SignLine welcome"><Icon name="captions" />SignLine<span className="intro-brand__dot" /></a>
      <a className="intro-skip" href="#/conversation">Skip intro <Icon name="arrow" /></a>
    </header>
    <section className="intro-copy" aria-label="Welcome">
      <p className="intro-eyebrow"><span /> A DIFFERENT PERSPECTIVE</p>
      <h1 id="intro-title">A world<br />within reach.</h1>
      <p className="intro-description"><span>Different ways to speak.</span>{' '}<span>One place to connect.</span></p>
      <button className="intro-begin" type="button" onClick={begin} disabled={departing}><span>{departing ? 'Let’s begin' : 'Begin'}</span><Icon name="arrow" /></button>
    </section>
    <footer className="intro-footer">
      <p><span className="intro-coordinate">01 / EARTHRISE</span><span>A little closer. Even from here.</span></p>
      <button className="intro-motion" type="button" disabled={reducedMotion} aria-pressed={paused || reducedMotion} onClick={() => setPaused(value => !value)} aria-label={reducedMotion ? 'Animation off: reduced motion is enabled' : paused ? 'Play star animation' : 'Pause star animation'}><span className={`intro-motion__icon ${paused || reducedMotion ? 'intro-motion__icon--paused' : ''}`} aria-hidden="true" />{reducedMotion ? 'Motion off' : paused ? 'Play motion' : 'Pause motion'}</button>
    </footer>
  </main>;
}
