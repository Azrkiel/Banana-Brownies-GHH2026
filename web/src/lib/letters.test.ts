import { afterEach, describe, expect, it, vi } from 'vitest';
import { LETTER_F, LetterDecoder, LetterKnn, letterFeatures, letterHand } from './letters';
import type { Frame } from './types';
import type { Pt } from './types';

const hand = (): Pt[] => Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + 0.01 * (i % 4) + 0.002 * i, y: 0.5 - 0.012 * Math.floor(i / 4), z: 0 }));
const rotate = (h: Pt[], deg: number, k = 1): Pt[] => {
  const a = (deg * Math.PI) / 180, w = h[0];
  return h.map((p) => {
    const x = (p.x - w.x) * k, y = (p.y - w.y) * k;
    return { x: w.x + x * Math.cos(a) - y * Math.sin(a), y: w.y + x * Math.sin(a) + y * Math.cos(a), z: 0 };
  });
};

afterEach(() => vi.unstubAllGlobals());

describe('LetterKnn assets', () => {
  it('loads builder-compatible templates and rejects truncated data', async () => {
    const feature = letterFeatures(hand(), 1);
    const mock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ labels: ['K'], F: LETTER_F, maxDist: 1 })))
      .mockResolvedValueOnce(new Response(new Float32Array(feature).buffer));
    vi.stubGlobal('fetch', mock);
    expect((await LetterKnn.load()).probs(feature)).toEqual({ K: 1 });
    mock.mockResolvedValueOnce(new Response(JSON.stringify({ labels: ['K'], F: LETTER_F, maxDist: 1 })))
      .mockResolvedValueOnce(new Response(new ArrayBuffer(4)));
    await expect(LetterKnn.load()).rejects.toThrow('Truncated');
  });
  it('rejects invalid vectors and failed metadata fetches', async () => {
    const knn = new LetterKnn(1);
    expect(knn.probs(new Float32Array(1))).toEqual({ _none: 1 });
    expect(() => knn.add('K', new Float32Array(1))).toThrow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(LetterKnn.load()).rejects.toThrow('metadata');
  });
});

describe('letterFeatures', () => {
  it('has LETTER_F values and ignores in-plane rotation and size for the shape block', () => {
    const a = letterFeatures(hand(), 1), b = letterFeatures(rotate(hand(), 30, 1.4), 1);
    expect(a).toHaveLength(LETTER_F);
    for (let i = 0; i < 42; i++) expect(b[i]).toBeCloseTo(a[i], 4);
  });
});

describe('letterHand', () => {
  const frame = (hands: Pt[][]): Frame => ({ t: 0, w: 640, h: 480, pose: null, hands, brow: null });
  it('mirrors a hand on the image-right side so letters look right-handed', () => {
    const h = hand().map((p) => ({ ...p, x: p.x + 0.2 }));
    expect(letterHand(frame([h]))![0].x).toBeCloseTo(1 - h[0].x, 6);
    const l = hand().map((p) => ({ ...p, x: p.x - 0.2 }));
    expect(letterHand(frame([l]))).toBe(l);
  });
  it('picks the higher hand when two are visible', () => {
    const low = hand().map((p) => ({ ...p, x: p.x - 0.2, y: p.y + 0.3 }));
    const high = hand().map((p) => ({ ...p, x: p.x - 0.2 }));
    expect(letterHand(frame([low, high]))).toBe(high);
    expect(letterHand(frame([]))).toBeNull();
  });
});

describe('LetterDecoder', () => {
  const run = (d: LetterDecoder, n: number, probs: Record<string, number>, speed: number) =>
    Array.from({ length: n }, () => d.push(probs, speed)).filter(Boolean);

  it('emits a held letter once', () => {
    expect(run(new LetterDecoder(), 30, { L: 1 }, 0.1)).toEqual(['L']);
  });
  it('emits a double letter after a small bounce', () => {
    const d = new LetterDecoder();
    expect([...run(d, 15, { L: 1 }, 0.1), ...run(d, 3, { L: 1 }, 2), ...run(d, 15, { L: 1 }, 0.1)]).toEqual(['L', 'L']);
  });
  it('spells two different letters in a row', () => {
    const d = new LetterDecoder();
    expect([...run(d, 15, { L: 1 }, 0.1), ...run(d, 20, { I: 1 }, 0.1)]).toEqual(['L', 'I']);
  });
  it('ignores a moving hand and no-hand frames', () => {
    const d = new LetterDecoder();
    expect([...run(d, 20, { L: 1 }, 2), ...run(d, 20, { _none: 1 }, 0.1)]).toEqual([]);
  });
});
