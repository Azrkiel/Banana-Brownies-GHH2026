import { useEffect, useRef, useState } from 'react';
import { isNearBottom, isOwnCaption } from '../lib/captions';
import type { Caption } from '../lib/types';

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const roleName = (role: Caption['role']) => role === 'signer' ? 'Signer' : 'Hearing participant';

/** One log region announces new final captions; in-progress lines are hidden from screen readers until they settle. */
export function CaptionLane({ captions }: { captions: Caption[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState(false);
  // Whether the reader was at the bottom before the latest update; measured on scroll, never after new text lands.
  const atBottom = useRef(true);
  const jumping = useRef(false);
  const lastKey = useRef('');
  const toBottom = (smooth: boolean) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
  };
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const last = captions[captions.length - 1];
    const key = last ? last.id : '';
    const ownNew = !!last && isOwnCaption(last) && key !== lastKey.current;
    lastKey.current = key;
    if (jumping.current) return;
    // Follow while the reader was at the bottom; always follow the reader's own new caption.
    if (ownNew || atBottom.current) { toBottom(false); atBottom.current = true; setAway(false); }
    else setAway(true);
  }, [captions]);
  const jump = () => {
    const el = scroller.current;
    setAway(false); atBottom.current = true;
    if (!el) return;
    el.focus({ preventScroll: true });
    jumping.current = true;
    toBottom(true);
    // Ignore scroll events (and new-caption bookkeeping) until the smooth scroll settles.
    const done = () => { jumping.current = false; el.removeEventListener('scrollend', done); window.clearTimeout(timer); toBottom(false); };
    const timer = window.setTimeout(done, reducedMotion() ? 0 : 700);
    el.addEventListener('scrollend', done, { once: true });
  };
  return (
    <div className="caption-body">
      <div className="caption-scroll" ref={scroller} role="region" aria-label="Call captions" tabIndex={0}
        onScroll={event => {
          if (jumping.current) return;
          const el = event.currentTarget;
          atBottom.current = isNearBottom(el.scrollHeight, el.scrollTop, el.clientHeight);
          setAway(!atBottom.current);
        }}>
        {!captions.length && <div className="caption-empty"><p>Captions will appear here as people sign or speak.</p></div>}
        <div className="lane" role="log" aria-label="Captions" aria-live="polite" aria-relevant="additions">
          {captions.map(c => {
            const mine = isOwnCaption(c);
            return (
              <p key={c.final ? `${c.id}:final` : c.id} aria-hidden={c.final ? undefined : true} className={`cap${c.final ? '' : ' interim'}${mine ? ' mine' : ''}`}>
                <b>{mine ? 'You' : <>{c.speaker} <span className="cap-role">· {roleName(c.role)}</span></>}{c.final && <time dateTime={new Date(c.ts).toISOString()}> · {clock(c.ts)}</time>}</b>
                {c.retracted ? <><s>{c.text}</s> <em>({mine ? 'You corrected this' : `${c.speaker} corrected this`})</em></>
                  : c.final ? c.text : <><i>{c.text}…</i> <span className="cap-sr">(in progress)</span></>}
              </p>
            );
          })}
        </div>
      </div>
      {away && <button type="button" className="caption-jump" onClick={jump}>Jump to latest</button>}
    </div>
  );
}
