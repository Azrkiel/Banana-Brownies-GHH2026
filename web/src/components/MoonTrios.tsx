import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import './MoonTrios.css';

// "Hack to the Moon" homepage decoration: each trio links a sign sequence, its English word,
// and a small picture. Sequences are simplified sketches of the forms on Lifeprint (lifeprint.com);
// `how` names the motion in words because emoji cannot show movement on their own.
type Term = { word: string; steps: string[]; how: string; visual: ReactNode; accent: string };

// No emoji shows a constellation, so draw a tiny one: stars joined by lines.
const constellation = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="currentColor" strokeWidth="1">
    <polyline points="3,17 8,9 14,12 20,4" fill="none" />
    <line x1="14" y1="12" x2="17" y2="20" />
    {[[3, 17], [8, 9], [14, 12], [20, 4], [17, 20]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.9" stroke="none" />)}
  </svg>
);

const TERMS: Term[] = [
  { word: 'MOON', steps: ['🤏', '👁️'], how: 'Curved index & thumb tap by the eye', visual: '🌕', accent: '#5b2ea6' },
  { word: 'STAR', steps: ['☝️', '☝️', '⇅'], how: 'Index fingers brush upward, alternating', visual: '⭐', accent: '#6f42c1' },
  { word: 'SUN', steps: ['🤌', '🔄', '🖐️'], how: 'Pinched hand circles, then opens downward', visual: '☀️', accent: '#7a3fc0' },
  { word: 'ROCKET', steps: ['✋', '🤞', '⬆️'], how: 'R-hand beside upright palm launches up', visual: '🚀', accent: '#4a2390' },
  { word: 'EARTH', steps: ['✊', '🤏', '↔️'], how: 'Thumb & middle finger hold fist, rock', visual: '🌍', accent: '#6a4c93' },
  { word: 'PLANET', steps: ['✊', '👉', '🔄'], how: 'P-hand orbits around a fist', visual: '🪐', accent: '#8b3fb8' },
  { word: 'SHOOTING STAR', steps: ['☝️', '↘️'], how: 'Index finger streaks across the sky', visual: '🌠', accent: '#3f2a7a' },
  { word: 'SKY', steps: ['✋', '⤴️'], how: 'Flat hand sweeps an arc overhead', visual: '🌌', accent: '#2e2140' },
  { word: 'CONSTELLATION', steps: ['☝️', '✨', '〰️'], how: 'Index finger traces the star pattern', visual: constellation, accent: '#5b2ea6' },
];

// Slots sit above and below the centered join bar so trios never cover it.
const SLOTS = ['top-a', 'top-b', 'top-c', 'top-d', 'bottom-a', 'bottom-b', 'bottom-c', 'bottom-d'];
// About LIFE_MS / SPAWN_MS ≈ 5.6 trios are on screen at once, capped at MAX_SHOWN.
const MAX_SHOWN = 6;
const LIFE_MS = 4500;
const SPAWN_MS = 800;

type Shown = { id: number; term: Term; slot: string };

function pick<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

const NARROW_QUERY = '(max-width: 760px)';

function useNarrow(): boolean {
  return useSyncExternalStore(change => {
    const query = window.matchMedia(NARROW_QUERY);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, () => window.matchMedia(NARROW_QUERY).matches);
}

export function MoonTrios() {
  // On phone widths the join form fills the screen, so there is no free space for trios.
  const narrow = useNarrow();
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // With reduced motion, show a fixed set instead of cycling.
  const [shown, setShown] = useState<Shown[]>(() =>
    reduced ? SLOTS.slice(0, MAX_SHOWN).map((slot, i) => ({ id: i, term: TERMS[i], slot })) : []);
  const nextId = useRef(0);

  useEffect(() => {
    if (reduced || narrow) return;
    const timers = new Set<number>();
    const spawn = () => setShown(current => {
      if (current.length >= MAX_SHOWN) return current;
      const slot = pick(SLOTS.filter(s => !current.some(c => c.slot === s)));
      const term = pick(TERMS.filter(t => !current.some(c => c.term === t)));
      if (!slot || !term) return current;
      const id = nextId.current++;
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        setShown(list => list.filter(item => item.id !== id));
      }, LIFE_MS);
      timers.add(timer);
      return [...current, { id, term, slot }];
    });
    spawn();
    const interval = window.setInterval(spawn, SPAWN_MS);
    return () => {
      window.clearInterval(interval);
      timers.forEach(timer => window.clearTimeout(timer));
      setShown([]); // their removal timers are gone; the next layout starts fresh
    };
  }, [narrow, reduced]);

  if (narrow) return null;
  return (
    <div className="moon-trios" aria-hidden="true">
      {shown.map(({ id, term, slot }) => (
        <div key={id} className={`trio trio-${slot}`} style={{ '--accent': term.accent, '--life': `${LIFE_MS}ms` } as CSSProperties}>
          <span className="trio-sign">
            <span className="trio-steps">{term.steps.map((step, i) => <span key={i} className="trio-step">{step}</span>)}</span>
            <small>{term.how}</small>
          </span>
          <span className="trio-link"><i /></span>
          <span className="trio-word">{term.word}</span>
          <span className="trio-link"><i /></span>
          <span className="trio-visual">{term.visual}</span>
        </div>
      ))}
    </div>
  );
}
