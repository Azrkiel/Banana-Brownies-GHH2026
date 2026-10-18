import { describe, expect, it, vi } from 'vitest';
import { speakToRoom, spokenText, type SignerVoice } from './signerVoice';
import type { Ctrl } from './types';

function fakeVoice(speak: SignerVoice['speak']): SignerVoice {
  return { track: {} as MediaStreamTrack, speak, close: vi.fn() };
}

describe('signer voice', () => {
  it('speaks uppercase glosses as a sentence and leaves typed text alone', () => {
    expect(spokenText('  MY   NAME LISA ')).toBe('My name lisa');
    expect(spokenText('Hi, I am Kevin.')).toBe('Hi, I am Kevin.');
    expect(spokenText('   ')).toBe('');
  });

  it('pauses listeners around playback, in order', async () => {
    const events: string[] = [];
    const sendCtrl = vi.fn(async (message: Ctrl) => { events.push(`ctrl ${JSON.stringify(message)}`); });
    const voice = fakeVoice(async (text, id) => { events.push(`speak ${text} ${id}`); });
    await speakToRoom({ text: 'HELLO', voiceId: 'voice123', voice, sendCtrl });
    expect(events).toEqual(['ctrl {"type":"tts","on":true}', 'speak Hello voice123', 'ctrl {"type":"tts","on":false}']);
  });

  it('always resumes listeners when speech fails, and still reports the failure', async () => {
    const sendCtrl = vi.fn(async () => {});
    const voice = fakeVoice(async () => { throw new Error('/api/tts 502'); });
    await expect(speakToRoom({ text: 'hello', voiceId: 'voice123', voice, sendCtrl })).rejects.toThrow('502');
    expect(sendCtrl).toHaveBeenLastCalledWith({ type: 'tts', on: false });
  });

  it('keeps speaking when a pause message cannot be delivered', async () => {
    const speak = vi.fn(async () => {});
    await speakToRoom({ text: 'hello', voiceId: 'voice123', voice: fakeVoice(speak), sendCtrl: async () => { throw new Error('offline'); } });
    expect(speak).toHaveBeenCalledOnce();
  });

  it('does not call the voice for empty or over-long captions', async () => {
    const speak = vi.fn(async () => {});
    const sendCtrl = vi.fn(async () => {});
    await speakToRoom({ text: ' ', voiceId: 'voice123', voice: fakeVoice(speak), sendCtrl });
    await expect(speakToRoom({ text: 'a'.repeat(401), voiceId: 'voice123', voice: fakeVoice(speak), sendCtrl })).rejects.toThrow('400');
    expect(speak).not.toHaveBeenCalled();
    expect(sendCtrl).not.toHaveBeenCalled();
  });
});
