import { describe, it, expect } from 'vitest';
import { KinematicSegmenter as Segmenter, isFingerspellingCandidate } from '../segmenter';
import { Decoder } from '../decoder';
function frame(x = 0, y = -.1, a = 0) {
  const f = new Array(174).fill(0); f[172] = 1;
  for (let p = 0; p < 21; p++) { f[2*p] = x+p*.002; f[2*p+1] = y; f[42+2*p] = p*.02+(p ? a : 0); }
  return f;
}
describe('segmenter and decoder', () => {
  it('suppresses lowered hands, malformed data and stationary repeats', () => {
    const s = new Segmenter();
    for (let i = 0; i < 40; i++) expect(s.push(frame(0, 1)).trigger).toBeNull();
    expect(Array.from({length:60}, () => s.push(frame())).filter(x => x.trigger)).toHaveLength(1);
    expect(s.push([NaN]).state).toBe('REST');
    expect(s.push(new Array(174).fill(0)).trigger).toBeNull();
  });
  it('suppresses transitions versus stable fixed stride and resolves four holds with 350ms settling', () => {
    const s = new Segmenter(); let legacyFalse = 0, falseTriggers = 0, holds = 0, t = 0, repeats = 0, cooldownUntil = -1;
    const triggerTimes:number[]=[];
    const legacy = (transition:boolean) => {
      t++;
      if(t%3!==0) return;
      repeats=transition?repeats+1:0;
      if(repeats>=2 && t*33>=cooldownUntil) {legacyFalse++;cooldownUntil=t*33+900;}
    };
    for (let sign = 0; sign < 4; sign++) {
      for (let j = 0; j < 6; j++) {
        const d = s.push(frame(sign*1.5+j*.25));
        // Original stride=3, stability=2, cooldown=900ms with a wrong transition class.
        legacy(true);
        if (d.trigger) falseTriggers++;
      }
      for (let j = 0; j < 11; j++) { if (s.push(frame(sign*1.5+1.25)).trigger === 'isolated') {holds++;triggerTimes.push(t*33);} legacy(false); }
    }
    expect(legacyFalse).toBeGreaterThan(0); expect(falseTriggers).toBeLessThanOrEqual(legacyFalse*.5); expect(holds).toBe(4);
    expect(triggerTimes.slice(1).every((v,i)=>v-triggerTimes[i]<900)).toBe(true);
  });
  it('routes distal articulation but rejects whole-hand translation and two hands', () => {
    const fs = Array.from({length:80}, (_, i) => frame(0, -.1, Math.sin(i)*.2));
    expect(isFingerspellingCandidate(fs)).toBe(true);
    expect(isFingerspellingCandidate(fs.map((_, i) => frame(i*.03)))).toBe(false);
    expect(isFingerspellingCandidate(fs.map(x => { const f = x.slice(); f[173] = 1; return f; }))).toBe(false);
    const s = new Segmenter(); expect(fs.map(x => s.push(x)).some(d => d.trigger === 'fingerspelling' && d.frames.length >= 64)).toBe(true);
  });
  it('requires 64 frames for manual spelling and clears windows on loss', () => {
    const s = new Segmenter();
    for (let i = 0; i < 63; i++) expect(s.push(frame(), true).trigger).toBeNull();
    expect(s.push(frame(), true).trigger).toBe('fingerspelling'); s.push(new Array(174).fill(0)); expect(s.push(frame(), true).frames).toHaveLength(1);
  });
  it('emits sorted top three slots and distinct 90-feature spelling input', async () => {
    const d = new Decoder({isolated: async () => [{gloss:'A',score:.1},{gloss:'B',score:.8},{gloss:'C',score:.05},{gloss:'D',score:.02}], fingerspelling: async x => { expect(x[0]).toHaveLength(90); return 'LISA'; }});
    for (let i=0;i<8;i++) await d.push(frame());
    expect(d.slots[0].candidates.map(x=>x.gloss)).toEqual(['B','A','C']); d.reset();
    for (let i=0;i<64;i++) await d.push(frame(), {fingerspellMode:true,letterFeatures:new Array(90).fill(.1)});
    expect(d.slots[0]).toEqual({candidates:[{gloss:'@LISA',score:0}],nmm_tags:['FS']}); d.reset();
    for (let i=0;i<64;i++) await d.push(frame(), {fingerspellMode:true}); expect(d.slots).toHaveLength(0);
  });
  it('drops stale inference after reset', async () => {
    let finish: (x: {gloss:string;score:number}[])=>void = () => {};
    const d = new Decoder({isolated:()=>new Promise(resolve=>{finish=resolve;}),fingerspelling:async()=>''});
    for(let i=0;i<7;i++) await d.push(frame());
    const pending=d.push(frame()); await Promise.resolve(); d.reset(); finish([{gloss:'OLD',score:1}]); expect(await pending).toBeNull();
  });
  it('suppresses either hand during transitions and excludes transition frames from clips',()=>{
    const s=new Segmenter();
    let triggered=false;
    for(let i=0;i<16;i++) {
      const f=frame();f[173]=1;
      for(let p=0;p<21;p++) {f[84+2*p]=Math.min(i,5)*.25;f[85+2*p]=-.1;}
      const d=s.push(f);
      if(i<6) expect(d.trigger).toBeNull();
      if(d.trigger) {triggered=true;expect(d.frames.every(r=>r[84]===1.25)).toBe(true);}
    }
    expect(triggered).toBe(true);
  });
  it('revises a rolling fingerspelled prefix in one review-only slot',async()=>{
    let calls=0;
    const d=new Decoder({isolated:async()=>[],fingerspelling:async()=>++calls===1?'li':'lisa'});
    for(let i=0;i<128;i++) await d.push(frame(),{fingerspellMode:true,letterFeatures:new Array(90).fill(.1),nmmTags:['Q-YN']});
    expect(d.slots).toHaveLength(1);expect(d.slots[0]).toEqual({candidates:[{gloss:'@LISA',score:0}],nmm_tags:['Q-YN','FS']});
  });

  it('keeps completed boundaries through rest and queues the next sign during inference',async()=>{
    const resolvers: ((value:{gloss:string;score:number}[])=>void)[]=[];
    const d=new Decoder({isolated:()=>new Promise(resolve=>resolvers.push(resolve)),fingerspelling:async()=>''});
    const pending:Promise<unknown>[]=[];
    for(let i=0;i<20;i++) pending.push(d.push(frame()));
    await Promise.resolve();expect(resolvers).toHaveLength(1);
    for(let i=0;i<6;i++) pending.push(d.push(frame(i*.25)));
    for(let i=0;i<11;i++) pending.push(d.push(frame(1.25)));
    resolvers[0]([{gloss:'ONE',score:.9}]);
    // Drain microtasks so the queued model call starts.
    for(let i=0;i<10;i++) await Promise.resolve();
    expect(resolvers).toHaveLength(2);resolvers[1]([{gloss:'TWO',score:.9}]);
    await Promise.all(pending);expect(d.slots.map(s=>s.candidates[0].gloss)).toEqual(['ONE','TWO']);
  });

});
