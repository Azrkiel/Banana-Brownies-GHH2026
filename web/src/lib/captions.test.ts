import { describe, expect, it } from 'vitest';
import { createCaptionHistory, isCaption, isCtrl, upsertCaption } from './captions';
import type { Caption } from './types';

const caption = (id: string, text = 'Hello'): Caption => ({ id, text, speaker: 'Kev', role: 'signer', kind: 'english', final: true, ts: 1 });

describe('caption history', () => {
  it('replaces interim captions by ID and preserves the original list', () => {
    const original = [{ ...caption('a', 'Hel'), final: false }, caption('b')];
    const updated = upsertCaption(original, caption('a', 'Hello!'));
    expect(updated).toEqual([caption('a', 'Hello!'), caption('b')]);
    expect(original[0].text).toBe('Hel');
  });
  it('keeps retractions on the original caption rather than appending a second sentence', () => {
    const updated = upsertCaption([caption('a')], { ...caption('a'), retracted: true });
    expect(updated).toHaveLength(1);
    expect(updated[0].retracted).toBe(true);
  });
  it('bounds the retained history at 200 captions', () => {
    const original = Array.from({ length: 200 }, (_, index) => caption(String(index)));
    const updated = upsertCaption(original, caption('200'));
    expect(updated).toHaveLength(200);
    expect(updated[0].id).toBe('1');
    expect(updated.at(-1)?.id).toBe('200');
  });
});

const speech = (id = 'a', revision = 1, final = false): Caption => ({ ...caption(id), role: 'hearing', kind: 'speech', revision, final });
describe('room caption ownership and ordering', () => {
  function setup() {
    let rows: Caption[] = [];
    const history = createCaptionHistory(next => { rows = next; });
    return { history, rows: () => rows };
  }
  it('keeps one row for revisions and rejects stale drafts after a final', () => {
    const { history, rows } = setup();
    history.receive(speech('a', 2), 'peer');
    history.receive(speech('a', 1), 'peer');
    expect(rows()[0].revision).toBe(2);
    history.receive(speech('a', 3, true), 'peer');
    history.receive(speech('a', 9), 'peer');
    expect(rows()).toHaveLength(1);
    expect(rows()[0].revision).toBe(3);
    expect(rows()[0].final).toBe(true);
  });
  it('clear arriving before its draft prevents resurrection', () => {
    const { history, rows } = setup();
    history.clear('a', 2, 'peer');
    history.receive(speech(), 'peer');
    history.receive(speech('a', 3, true), 'peer');
    expect(rows()).toEqual([]);
  });
  it('scopes wire IDs to authenticated sender rather than equal names', () => {
    const { history, rows } = setup();
    history.receive(speech(), 'one'); history.receive(speech(), 'two');
    history.clear('a', 2, 'one');
    expect(rows()).toHaveLength(1);
    expect(rows()[0].id).toBe(JSON.stringify(['two', 'a']));
  });
  it('a clear cannot remove final speech, English, or a retraction', () => {
    const { history, rows } = setup();
    history.receive(speech('a', 1, true), 'peer');
    history.receive({ ...caption('b'), retracted: true }, 'peer');
    history.clear('a', 10, 'peer'); history.clear('b', 10, 'peer');
    expect(rows()).toHaveLength(2);
    expect(rows()[1].retracted).toBe(true);
  });
  it('removes only a departed participant drafts and retains finals', () => {
    const { history, rows } = setup();
    history.receive(speech(), 'one'); history.receive(speech('b', 1, true), 'one');
    history.receive(speech(), 'two'); history.clearDrafts('one');
    expect(rows()).toHaveLength(2);
    history.receive(speech('a', 3), 'one');
    expect(rows()).toHaveLength(2);
    history.clearDrafts(); expect(rows()).toHaveLength(1);
  });
  it('bounds display rows and forgets old session IDs on reset', () => {
    const { history, rows } = setup();
    for (let i = 0; i < 600; i++) history.receive(speech(String(i), 1, true), 'peer');
    expect(rows()).toHaveLength(200);
    history.receive(speech('599', 2), 'peer');
    expect(rows().at(-1)?.final).toBe(true);
    history.reset(); history.receive(speech('599'), 'peer');
    expect(rows()).toHaveLength(1); expect(rows()[0].final).toBe(false);
  });
  it('keeps legacy English retraction behavior', () => {
    const { history, rows } = setup();
    history.receive(caption('a'), 'peer');
    history.receive({ ...caption('a'), retracted: true }, 'peer');
    expect(rows()).toHaveLength(1); expect(rows()[0].retracted).toBe(true);
  });
  it('ignores stale clears and attempts to change a speech row into English', () => {
    const { history, rows } = setup();
    history.receive(speech('a', 2), 'peer'); history.clear('a', 1, 'peer');
    history.receive(caption('a'), 'peer');
    expect(rows()[0].kind).toBe('speech'); expect(rows()[0].revision).toBe(2);
  });
  it('validates caption fields and control variants', () => {
    expect(isCaption(speech())).toBe(true); expect(isCaption(caption('a'))).toBe(true);
    for (const invalid of [null, {}, { ...speech(), revision: -1 }, { ...speech(), revision: Infinity },
      { ...speech(), role: 'signer' }, { ...speech(), text: '' }, { ...speech(), retracted: true },
      { ...speech(), ts: NaN }, { ...speech(), speaker: 'x'.repeat(41) }]) expect(isCaption(invalid)).toBe(false);
    expect(isCtrl({ type: 'caption-clear', id: 'a', revision: 1 })).toBe(true);
    expect(isCtrl({ type: 'caption-clear', id: 'a', revision: 0 })).toBe(false);
    expect(isCtrl({ type: 'tts', on: 'yes' })).toBe(false);
    expect(isCtrl({ type: 'tts', on: true })).toBe(true);
    expect(isCtrl({ type: 'unknown' })).toBe(false);
  });
});
