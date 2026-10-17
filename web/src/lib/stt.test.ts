import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startWebSpeech, type OnTranscript, type Stt, type SttState } from './stt';

type Result = { 0: { transcript: string }; length: number; isFinal: boolean };
type ResultEvent = { resultIndex: number; results: ArrayLike<Result> };
type RecognitionError = { error: string; message?: string };

const instances: FakeRecognition[] = [];
const sessions: Stt[] = [];
const failure = { constructor: false, start: false, abort: false, configure: false };
const behavior = { autoStart: true, autoEndOnAbort: true };

class FakeRecognition {
  continuous = false;
  interimResults = false;
  private language = '';
  onresult: ((event: ResultEvent) => void) | null = null;
  onerror: ((event: RecognitionError) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  handlersAtStart = false;

  constructor() {
    if (failure.constructor) throw new Error('private provider details');
    instances.push(this);
  }

  get lang() { return this.language; }
  set lang(value: string) {
    if (failure.configure) throw new Error('private provider details');
    this.language = value;
  }

  start = vi.fn(() => {
    this.handlersAtStart = !!(this.onresult && this.onerror && this.onend && this.onstart);
    if (failure.start) throw new Error('private provider details');
    if (behavior.autoStart) this.onstart?.();
  });
  abort = vi.fn(() => {
    if (failure.abort) throw new Error('private provider details');
    if (behavior.autoEndOnAbort) this.onend?.();
  });
  stop = vi.fn();

  result(results: Result[], resultIndex = 0) { this.onresult?.(event(results, resultIndex)); }
  error(error = 'network') { this.onerror?.({ error, message: 'private provider details' }); }
  end() { this.onend?.(); }
  ready() { this.onstart?.(); }
  capture() { return { result: this.onresult, error: this.onerror, end: this.onend, ready: this.onstart }; }
}

const result = (text: string, final = false): Result => ({ 0: { transcript: text }, length: 1, isFinal: final });
// A browser result list is array-like, with no Array methods.
const event = (results: Result[], resultIndex = 0): ResultEvent => ({
  resultIndex, results: Object.assign({ length: results.length }, results),
});

function begin(
  onText = vi.fn<OnTranscript>(),
  onError = vi.fn<(message: string) => void>(),
  onState?: (state: SttState) => void,
) {
  const session = startWebSpeech(onText, onError, onState);
  if (session) sessions.push(session);
  return { session, rec: instances.at(-1)!, onText, onError };
}

function expectDetached(rec: FakeRecognition) {
  expect(rec.onresult).toBeNull();
  expect(rec.onerror).toBeNull();
  expect(rec.onend).toBeNull();
  expect(rec.onstart).toBeNull();
}

beforeEach(() => {
  instances.length = 0;
  Object.assign(failure, { constructor: false, start: false, abort: false, configure: false });
  Object.assign(behavior, { autoStart: true, autoEndOnAbort: true });
  vi.useFakeTimers();
  vi.stubGlobal('window', { SpeechRecognition: FakeRecognition });
});

describe('Web Speech observable state', () => {
  it('reports starting until the actual provider start event', () => {
    behavior.autoStart = false;
    const onState = vi.fn<(state: SttState) => void>();
    const { rec, session } = begin(undefined, undefined, onState);
    expect(session).not.toBeNull();
    expect(onState.mock.calls).toEqual([['starting']]);
    rec.ready();
    rec.ready();
    expect(onState.mock.calls).toEqual([['starting'], ['listening']]);
  });

  it('reports stopping while capture closes and retrying only after recovery is scheduled', () => {
    behavior.autoEndOnAbort = false;
    const onState = vi.fn<(state: SttState) => void>();
    const { rec } = begin(undefined, undefined, onState);
    rec.error('no-speech');
    expect(onState.mock.calls).toEqual([['starting'], ['listening'], ['stopping']]);
    rec.end();
    expect(onState.mock.calls.at(-1)).toEqual(['retrying']);
    vi.advanceTimersByTime(1000);
    expect(onState.mock.calls.slice(-2)).toEqual([['starting'], ['listening']]);
  });

  it('keeps failed as the terminal state and never emits stopped after a failure', () => {
    const onState = vi.fn<(state: SttState) => void>();
    const { rec, session } = begin(undefined, undefined, onState);
    rec.error('not-allowed');
    session?.stop();
    expect(onState.mock.calls).toEqual([['starting'], ['listening'], ['failed']]);
  });

  it('does not emit any states after explicit stop, including already queued events', () => {
    const onState = vi.fn<(state: SttState) => void>();
    const { rec, session } = begin(undefined, undefined, onState);
    const queued = rec.capture();
    onState.mockClear();
    session?.stop();
    queued.ready?.(); queued.end?.(); queued.error?.({ error: 'network' });
    vi.advanceTimersByTime(60000);
    expect(onState).not.toHaveBeenCalled();
  });

  it.each(['constructor', 'start'] as const)('reports a %s failure before its safe error message', point => {
    failure[point] = true;
    const events: string[] = [];
    const { session } = begin(undefined, vi.fn<(message: string) => void>(() => { events.push('error'); }), state => events.push(state));
    expect(session).toBeNull();
    expect(events).toEqual(['starting', 'failed', 'error']);
  });

  it('reports an unsupported browser without claiming the microphone started', () => {
    vi.stubGlobal('window', {});
    const onState = vi.fn<(state: SttState) => void>();
    expect(begin(undefined, undefined, onState).session).toBeNull();
    expect(onState.mock.calls).toEqual([['failed']]);
  });

  it.each(['retrying', 'stopping'] as const)('honors explicit stop during a %s observer callback', target => {
    let session: Stt | null = null;
    const onState = vi.fn<(state: SttState) => void>(state => { if (state === target) session?.stop(); });
    const current = begin(undefined, undefined, onState);
    session = current.session;
    current.rec.error('no-speech');
    vi.advanceTimersByTime(60000);
    expect(instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    expectDetached(current.rec);
  });

  it('honors explicit stop during the starting state of a replacement attempt', () => {
    let session: Stt | null = null;
    let starts = 0;
    const current = begin(undefined, undefined, state => {
      if (state === 'starting' && ++starts === 2) session?.stop();
    });
    session = current.session;
    current.rec.end();
    vi.advanceTimersByTime(1000);
    expect(instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honors stop from the failed-state observer before delivering another error callback', () => {
    let session: Stt | null = null;
    const current = begin(undefined, undefined, state => { if (state === 'failed') session?.stop(); });
    session = current.session;
    current.rec.error('not-allowed');
    expect(current.onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

afterEach(() => {
  for (const session of sessions.splice(0)) session.stop();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('Web Speech capability and startup', () => {
  it('can be imported without a browser and without requesting audio', async () => {
    vi.stubGlobal('window', undefined);
    vi.resetModules();
    const module = await import('./stt');
    expect(module.startWebSpeech).toBeTypeOf('function');
    expect(instances).toHaveLength(0);
  });

  it.each([undefined, {}])('reports unavailable recognition with window=%j', browser => {
    vi.stubGlobal('window', browser);
    const { session, onText, onError } = begin();
    expect(session).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/browser|Chrome/i);
    expect(onText).not.toHaveBeenCalled();
    expect(instances).toHaveLength(0);
  });

  it('prefers the standard recognizer when both constructors exist', () => {
    let prefixedUsed = false;
    class PrefixedRecognition extends FakeRecognition {
      constructor() { super(); prefixedUsed = true; }
    }
    vi.stubGlobal('window', { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: PrefixedRecognition });
    expect(begin().session?.kind).toBe('webspeech');
    expect(prefixedUsed).toBe(false);
  });

  it('supports the prefixed browser recognizer', () => {
    vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition });
    const { session, rec } = begin();
    expect(session?.kind).toBe('webspeech');
    expect(rec.start).toHaveBeenCalledTimes(1);
  });

  it('configures English continuous interim results and handlers before starting', () => {
    const { session, rec, onText, onError } = begin();
    expect(session?.kind).toBe('webspeech');
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);
    expect(rec.lang).toBe('en-US');
    expect(rec.handlersAtStart).toBe(true);
    expect(rec.start).toHaveBeenCalledTimes(1);
    expect(onText).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(['constructor', 'configure', 'start'] as const)('handles a %s exception without exposing its details', point => {
    failure[point] = true;
    const { session, onError, onText } = begin();
    expect(session).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/start|microphone/i);
    expect(onError.mock.calls[0][0]).not.toContain('private provider details');
    expect(onText).not.toHaveBeenCalled();
    if (instances.length) {
      expectDetached(instances[0]);
      expect(instances[0].abort).toHaveBeenCalledTimes(1);
    }
  });
});

describe('Web Speech transcript normalization', () => {
  it('replaces interim revisions and commits the phrase once', () => {
    const { rec, onText } = begin();
    rec.result([result('Are you')]);
    rec.result([result('Are you hungry')]);
    rec.result([result('Are you hungry?', true)]);
    expect(onText.mock.calls).toEqual([
      ['Are you', false], ['Are you hungry', false], ['Are you hungry?', true],
    ]);
  });

  it('does not replay finalized indexes, including during later changes', () => {
    const { rec, onText } = begin();
    rec.result([result('Hello!', true)]);
    rec.result([result('Hello!', true)]);
    rec.result([result('Hello!', true), result('How are')], 1);
    rec.result([result('Hello!', true), result('How are you?', true)], 1);
    expect(onText.mock.calls).toEqual([['Hello!', true], ['How are', false], ['How are you?', true]]);
  });

  it('keeps identical phrases at different indexes', () => {
    const { rec, onText } = begin();
    rec.result([result('Hello', true)]);
    rec.result([result('Hello', true), result('Hello', true)], 1);
    expect(onText.mock.calls).toEqual([['Hello', true], ['Hello', true]]);
  });

  it('emits several finals in order followed by one combined draft', () => {
    const { rec, onText } = begin();
    rec.result([result('Hello.', true), result('I am here.', true), result('Are'), result('you ready')]);
    expect(onText.mock.calls).toEqual([['Hello.', true], ['I am here.', true], ['Are you ready', false]]);
  });

  it('retains unchanged earlier interim fragments when a later one changes', () => {
    const { rec, onText } = begin();
    rec.result([result('Are'), result('you')]);
    rec.result([result('Are'), result('you hungry')], 1);
    expect(onText.mock.calls).toEqual([['Are you', false], ['Are you hungry', false]]);
  });

  it('re-emits identical draft wording when it belongs to the next phrase', () => {
    const { rec, onText } = begin();
    rec.result([result('Hello')]);
    rec.result([result('Hello', true), result('Hello')]);
    expect(onText.mock.calls).toEqual([['Hello', false], ['Hello', true], ['Hello', false]]);
  });

  it('does not emit unchanged draft text repeatedly', () => {
    const { rec, onText } = begin();
    rec.result([result('Hello')]);
    rec.result([result('Hello')]);
    expect(onText.mock.calls).toEqual([['Hello', false]]);
  });

  it('clears a removed interim draft once even when resultIndex equals the new length', () => {
    const { rec, onText } = begin();
    rec.result([result('Hello', true), result('unfinished')]);
    rec.result([result('Hello', true)], 1);
    rec.result([result('Hello', true)], 1);
    expect(onText.mock.calls).toEqual([['Hello', true], ['unfinished', false], ['', false]]);
  });

  it('updates a draft when the interim list shrinks', () => {
    const { rec, onText } = begin();
    rec.result([result('Are'), result('you hungry')]);
    rec.result([result('Are')], 1);
    expect(onText.mock.calls).toEqual([['Are you hungry', false], ['Are', false]]);
  });

  it('ignores blank results without sending an empty final', () => {
    const { rec, onText } = begin();
    rec.result([result('   ')]);
    rec.result([result('   ', true)]);
    expect(onText).not.toHaveBeenCalled();
  });

  it('clears an existing draft when the provider replaces it with a blank final', () => {
    const { rec, onText } = begin();
    rec.result([result('discard me')]);
    rec.result([result(' ', true)]);
    expect(onText.mock.calls).toEqual([['discard me', false], ['', false]]);
  });

  it('trims outer whitespace and preserves punctuation and internal spacing', () => {
    const { rec, onText } = begin();
    rec.result([result('  Hello,  friend!  ', true)]);
    expect(onText.mock.calls).toEqual([['Hello,  friend!', true]]);
  });

  it('handles empty result lists without emitting a caption', () => {
    const { rec, onText } = begin();
    rec.result([]);
    expect(onText).not.toHaveBeenCalled();
  });
});

describe('Web Speech stop and terminal lifecycle', () => {
  it('stops idempotently, discards its draft, and detaches listeners', () => {
    const { rec, session, onText, onError } = begin();
    rec.result([result('unfinished')]);
    onText.mockClear();
    session?.stop();
    session?.stop();
    expect(rec.abort).toHaveBeenCalledTimes(1);
    expect(rec.stop).not.toHaveBeenCalled();
    expectDetached(rec);
    expect(onText).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('ignores already queued results, errors, and end after stop', () => {
    const { rec, session, onText, onError } = begin();
    const queued = rec.capture();
    session?.stop();
    queued.result?.(event([result('late', true)]));
    queued.error?.({ error: 'network' });
    queued.end?.();
    expect(onText).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(rec.start).toHaveBeenCalledTimes(1);
    expect(instances).toHaveLength(1);
  });

  it.each(['not-allowed', 'service-not-allowed'])('clears a pending draft and terminates on %s without restarting', code => {
    const { rec, session, onText, onError } = begin();
    rec.result([result('unfinished')]);
    const queued = rec.capture();
    rec.error(code);
    queued.error?.({ error: code });
    queued.end?.();
    queued.result?.(event([result('late final', true)]));
    session?.stop();
    expect(onText.mock.calls).toEqual([['unfinished', false], ['', false]]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/microphone|permission|connection/i);
    expect(onError.mock.calls[0][0]).not.toContain('private provider details');
    expectDetached(rec);
    expect(rec.abort).toHaveBeenCalledTimes(1);
    expect(rec.start).toHaveBeenCalledTimes(1);
  });

  it('clears a draft on normal end without reporting an error before delayed recovery', () => {
    const { rec, onText, onError } = begin();
    rec.result([result('unfinished')]);
    rec.end();
    expect(onText.mock.calls).toEqual([['unfinished', false], ['', false]]);
    expect(onError).not.toHaveBeenCalled();
    expectDetached(rec);
    expect(rec.start).toHaveBeenCalledTimes(1);
  });

  it('does not clear or replay a finalized phrase on end', () => {
    const { rec, onText } = begin();
    rec.result([result('Hello', true)]);
    rec.end();
    expect(onText.mock.calls).toEqual([['Hello', true]]);
  });

  it('absorbs abort failures after deactivating and detaching', () => {
    const { rec, session, onText, onError } = begin();
    const queued = rec.capture();
    failure.abort = true;
    expect(() => session?.stop()).not.toThrow();
    expect(() => session?.stop()).not.toThrow();
    queued.result?.(event([result('late', true)]));
    expectDetached(rec);
    expect(rec.abort).toHaveBeenCalledTimes(1);
    expect(onText).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('allows a fresh session to reuse result index zero', () => {
    const first = begin();
    const queued = first.rec.capture();
    first.rec.result([result('Hello', true)]);
    first.session?.stop();
    const second = begin();
    queued.result?.(event([result('old', true)]));
    queued.error?.({ error: 'network' });
    second.rec.result([result('Hello', true)]);
    expect(first.onText.mock.calls).toEqual([['Hello', true]]);
    expect(second.onText.mock.calls).toEqual([['Hello', true]]);
    expect(second.onError).not.toHaveBeenCalled();
  });

  it('honors stop from inside a transcript callback before processing more results', () => {
    let session: Stt | null = null;
    const onText = vi.fn<OnTranscript>(() => session?.stop());
    const current = begin(onText);
    session = current.session;
    current.rec.result([result('first', true), result('second', true), result('draft')]);
    expect(onText.mock.calls).toEqual([['first', true]]);
    expectDetached(current.rec);
  });

  it('honors stop during terminal draft clearing before reporting an error', () => {
    let session: Stt | null = null;
    const onText = vi.fn<OnTranscript>((text) => { if (!text) session?.stop(); });
    const current = begin(onText);
    session = current.session;
    current.rec.result([result('unfinished')]);
    current.rec.error();
    expect(onText.mock.calls).toEqual([['unfinished', false], ['', false]]);
    expect(current.onError).not.toHaveBeenCalled();
  });
});

describe('Web Speech bounded recovery', () => {
  it('restarts once after an ordinary end and resets provider result indexes', () => {
    const { rec, onText } = begin();
    rec.result([result('Hello', true)]);
    rec.end();
    expectDetached(rec);
    vi.advanceTimersByTime(999);
    expect(instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(instances).toHaveLength(2);
    instances[1].result([result('Hello', true)]);
    expect(onText.mock.calls).toEqual([['Hello', true], ['Hello', true]]);
  });

  it('recovers after silence without reporting an error or duplicating the retry', () => {
    const { rec, onText, onError } = begin();
    rec.result([result('unfinished')]);
    const queued = rec.capture();
    rec.error('no-speech');
    queued.error?.({ error: 'no-speech' });
    queued.end?.();
    expect(onText.mock.calls).toEqual([['unfinished', false], ['', false]]);
    expect(onError).not.toHaveBeenCalled();
    expect(rec.abort).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(instances).toHaveLength(2);
  });

  it('reports a network interruption once per episode and terminates after three recovery starts', () => {
    const { onError } = begin();
    for (const [index, delay] of [1000, 2000, 4000].entries()) {
      const rec = instances.at(-1)!;
      rec.result([result('progress', true)]);
      rec.error('network');
      vi.advanceTimersByTime(delay - 1);
      expect(instances).toHaveLength(index + 1);
      vi.advanceTimersByTime(1);
      expect(instances).toHaveLength(index + 2);
    }
    instances.at(-1)!.error('network');
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls[0][0]).toMatch(/network|connection/i);
    expect(onError.mock.calls[1][0]).toMatch(/retry|restart|start.*again/i);
    expect(onError.mock.calls[1][0]).toMatch(/speech service.*connect/i);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60000);
    expect(instances).toHaveLength(4);
  });

  it('bounds repeated rapid normal endings even when every restart signals ready', () => {
    const { onError } = begin();
    for (const delay of [1000, 2000, 4000]) {
      instances.at(-1)!.end();
      vi.advanceTimersByTime(delay);
    }
    instances.at(-1)!.end();
    expect(instances).toHaveLength(4);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resets retries and network reporting only after thirty seconds of healthy listening', () => {
    const { rec, onError } = begin();
    rec.error('network');
    vi.advanceTimersByTime(1000);
    const recovered = instances.at(-1)!;
    vi.advanceTimersByTime(30000);
    recovered.error('network');
    expect(onError).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(999);
    expect(instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(instances).toHaveLength(3);
  });

  it('does not reset retries just before the healthy listening threshold', () => {
    const { rec } = begin();
    rec.end();
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(29999);
    instances.at(-1)!.end();
    vi.advanceTimersByTime(1000);
    expect(instances).toHaveLength(2);
    vi.advanceTimersByTime(1000);
    expect(instances).toHaveLength(3);
  });

  it.each(['audio-capture', 'language-not-supported', 'aborted', 'unrecognized-code'])('terminates %s without retrying or exposing provider data', code => {
    const { rec, onError } = begin();
    rec.error(code);
    expectDetached(rec);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).not.toContain('private provider details');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60000);
    expect(instances).toHaveLength(1);
  });

  it.each(['constructor', 'configure', 'start'] as const)('terminates safely when the recovery attempt fails at %s', point => {
    const { rec, onError } = begin();
    rec.end();
    failure[point] = true;
    vi.advanceTimersByTime(1000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    for (const instance of instances) expectDetached(instance);
  });

  it('cannot restart when stopped during the backoff delay', () => {
    const { rec, session, onError } = begin();
    rec.end();
    session?.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60000);
    expect(instances).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('waits for confirmed closure before scheduling recovery', () => {
    behavior.autoEndOnAbort = false;
    const { rec, onText, onError } = begin();
    const queued = rec.capture();
    rec.result([result('unfinished')]);
    rec.error('network');
    queued.result?.(event([result('late final', true)]));
    queued.ready?.();
    queued.error?.({ error: 'aborted' });
    vi.advanceTimersByTime(1000);
    expect(instances).toHaveLength(1);
    rec.end();
    vi.advanceTimersByTime(999);
    expect(instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(instances).toHaveLength(2);
    expect(onText.mock.calls).toEqual([['unfinished', false], ['', false]]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('ends the session when abort is not confirmed within two seconds', () => {
    behavior.autoEndOnAbort = false;
    const { rec, onError } = begin();
    const queued = rec.capture();
    rec.error('no-speech');
    vi.advanceTimersByTime(1999);
    expect(onError).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/stop|close|browser/i);
    expectDetached(rec);
    expect(rec.abort).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    queued.end?.();
    vi.advanceTimersByTime(60000);
    expect(instances).toHaveLength(1);
  });

  it('does not restart if abort itself throws', () => {
    const { rec, onError } = begin();
    failure.abort = true;
    rec.error('no-speech');
    expect(onError).toHaveBeenCalledTimes(1);
    expectDetached(rec);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60000);
    expect(instances).toHaveLength(1);
  });

  it('times out a start that never receives the ready event', () => {
    behavior.autoStart = false;
    const { rec, onText, onError } = begin();
    const queued = rec.capture();
    rec.result([result('before ready', true)]);
    vi.advanceTimersByTime(14999);
    expect(onError).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/start|permission/i);
    expectDetached(rec);
    queued.ready?.();
    queued.result?.(event([result('after timeout', true)]));
    expect(onText).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(instances).toHaveLength(1);
  });

  it.each(['starting', 'listening', 'closing'] as const)('stop from %s cancels all timers and callbacks', state => {
    behavior.autoStart = state !== 'starting';
    behavior.autoEndOnAbort = false;
    const { rec, session, onText, onError } = begin();
    if (state === 'closing') rec.error('no-speech');
    const queued = rec.capture();
    session?.stop();
    session?.stop();
    queued.ready?.();
    queued.result?.(event([result('late', true)]));
    queued.error?.({ error: 'network' });
    queued.end?.();
    vi.advanceTimersByTime(60000);
    expect(onText).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expectDetached(rec);
    expect(rec.abort).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(instances).toHaveLength(1);
  });

  it('ignores callbacks from a retired attempt while its replacement is listening', () => {
    const { rec, onText, onError } = begin();
    const queued = rec.capture();
    rec.end();
    vi.advanceTimersByTime(1000);
    const replacement = instances.at(-1)!;
    queued.ready?.();
    queued.result?.(event([result('stale', true)]));
    queued.error?.({ error: 'not-allowed' });
    queued.end?.();
    replacement.result([result('fresh', true)]);
    expect(onText.mock.calls).toEqual([['fresh', true]]);
    expect(onError).not.toHaveBeenCalled();
    expect(instances).toHaveLength(2);
  });

  it('honors stop inside the network error callback before abort or retry scheduling', () => {
    let session: Stt | null = null;
    const onError = vi.fn<(message: string) => void>(() => session?.stop());
    const current = begin(vi.fn<OnTranscript>(), onError);
    session = current.session;
    current.rec.error('network');
    expect(onError).toHaveBeenCalledTimes(1);
    expectDetached(current.rec);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60000);
    expect(instances).toHaveLength(1);
  });

  it('does not re-emit finalized speech while clearing a draft for recovery', () => {
    const { rec, onText } = begin();
    rec.result([result('Committed.', true), result('unfinished')]);
    rec.error('no-speech');
    vi.advanceTimersByTime(1000);
    expect(onText.mock.calls).toEqual([['Committed.', true], ['unfinished', false], ['', false]]);
    instances.at(-1)!.result([result('Next.', true)]);
    expect(onText.mock.calls.at(-1)).toEqual(['Next.', true]);
  });

  it('bounds transient constructor failures where no new capture session was created', () => {
    let constructions = 0;
    class NetworkConstructor extends FakeRecognition {
      constructor() {
        if (++constructions > 1) throw new DOMException('private provider details', 'NetworkError');
        super();
      }
    }
    vi.stubGlobal('window', { SpeechRecognition: NetworkConstructor });
    const { rec, onError } = begin();
    rec.end();
    for (const delay of [1000, 2000, 4000]) vi.advanceTimersByTime(delay);
    expect(constructions).toBe(4);
    expect(instances).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls.flat().join(' ')).not.toContain('private provider details');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('can recover after a transient constructor failure without an overlapping session', () => {
    let constructions = 0;
    class NetworkConstructor extends FakeRecognition {
      constructor() {
        if (++constructions === 2) throw new DOMException('private provider details', 'NetworkError');
        super();
      }
    }
    vi.stubGlobal('window', { SpeechRecognition: NetworkConstructor });
    const { rec, onText } = begin();
    rec.end();
    vi.advanceTimersByTime(1000);
    expect(instances).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(instances).toHaveLength(2);
    instances[1].result([result('Recovered.', true)]);
    expect(onText.mock.calls).toEqual([['Recovered.', true]]);
  });

  it('applies the startup watchdog again to a recovery attempt', () => {
    const { rec, onError } = begin();
    rec.end();
    behavior.autoStart = false;
    vi.advanceTimersByTime(1000);
    expect(instances).toHaveLength(2);
    vi.advanceTimersByTime(15000);
    expect(onError).toHaveBeenCalledTimes(1);
    expectDetached(instances[1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { resultIndex: -1, results: { length: 0 } },
    { resultIndex: 0, results: { length: 1, 0: { isFinal: true, 0: { transcript: 42 } } } },
    { resultIndex: 0, results: { length: 1 } },
  ])('rejects malformed provider results without leaking an unfinished draft', malformed => {
    const { rec, onText, onError } = begin();
    rec.result([result('unfinished')]);
    rec.onresult?.(malformed as unknown as ResultEvent);
    expect(onText.mock.calls).toEqual([['unfinished', false], ['', false]]);
    expect(onError).toHaveBeenCalledTimes(1);
    expectDetached(rec);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('terminates a malformed error event safely', () => {
    const { rec, onError } = begin();
    expect(() => rec.onerror?.(null as unknown as RecognitionError)).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
    expectDetached(rec);
    expect(vi.getTimerCount()).toBe(0);
  });
});
