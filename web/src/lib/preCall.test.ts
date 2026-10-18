import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CallRoom } from '../pages/Call';

describe('room entry gate', () => {
  it.each(['signer', 'hearing'])('opens direct %s room links in pre-call checks without joining', role => {
    const html = renderToStaticMarkup(createElement(CallRoom, { query: `room=my-room-42&name=Kev&role=${role}` }));
    expect(html).toContain('Before you join');
    expect(html).toContain('my-room-42');
    expect(html).toContain('Kev');
    expect(html).toContain('Start camera');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Join conversation/);
    expect(html.includes('Test microphone')).toBe(role === 'hearing');
    expect(html).not.toContain('caption-composer');
  });
  it('retains validation for invalid room links', () => {
    expect(renderToStaticMarkup(createElement(CallRoom, { query: 'room=x' }))).toContain('missing a valid name');
  });
});
