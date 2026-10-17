import type { Caption } from '../lib/types';

export function CaptionLane({ captions, me }: { captions: Caption[]; me: string }) {
  return (
    <div className="lane" aria-live="polite">
      {captions.slice(-8).map((c) => (
        <p key={c.id} className={`cap${c.final ? '' : ' interim'}${c.speaker === me ? ' mine' : ''}`}>
          <b>{c.speaker}:</b>{' '}
          {c.retracted ? <><s>{c.text}</s> <em>(recognition error — {c.speaker} took this back)</em></> : c.text}
        </p>
      ))}
    </div>
  );
}
