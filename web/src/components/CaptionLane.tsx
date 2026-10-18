import { useEffect, useRef, useState } from 'react';
import type { Caption } from '../lib/types';

const NEAR_BOTTOM_PX = 64;
const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** One log region announces new final captions; in-progress lines are hidden from screen readers until they settle. */
export function CaptionLane({ captions, me }: { captions: Caption[]; me: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState(false);
  const toBottom = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // Follow new captions only while the reader is already at the bottom; otherwise offer a jump.
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX) el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
    else setAway(true);
  }, [captions]);
  return (
    <div className="caption-body">
      <div className="caption-scroll" ref={scroller} role="region" aria-label="Call captions" tabIndex={0}
        onScroll={event => { const el = event.currentTarget; setAway(el.scrollHeight - el.scrollTop - el.clientHeight > NEAR_BOTTOM_PX); }}>
        {!captions.length && <div className="caption-empty"><p>Captions will appear here as people sign or speak.</p></div>}
        <div className="lane" role="log" aria-label="Captions" aria-live="polite" aria-relevant="additions">
          {captions.map(c => {
            const mine = c.speaker === me;
            return (
              <p key={c.final ? `${c.id}:final` : c.id} aria-hidden={c.final ? undefined : true} className={`cap${c.final ? '' : ' interim'}${mine ? ' mine' : ''}`}>
                <b>{mine ? 'You' : c.speaker}{c.final && <time dateTime={new Date(c.ts).toISOString()}> · {clock(c.ts)}</time>}</b>
                {c.retracted ? <><s>{c.text}</s> <em>({c.speaker} corrected this)</em></>
                  : c.final ? c.text : <><i>{c.text}…</i> <span className="cap-sr">(in progress)</span></>}
              </p>
            );
          })}
        </div>
      </div>
      {away && <button type="button" className="caption-jump" onClick={() => { toBottom(); setAway(false); }}>Jump to latest</button>}
    </div>
  );
}
