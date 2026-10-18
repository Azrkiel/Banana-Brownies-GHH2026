import { describe, expect, it } from 'vitest';
import { NMMDetector, faceRatios, headshakeScore } from '../nmm';
const face = (raise = .04, contraction = .1, scale = 1, pitch = 0) => [[0,.04],[ -.1,0],[.1,0],[-.06,.12],[.06,.12],[0,.2],[-contraction,-raise],[contraction,-raise]].map(([x,y])=>({x:x*scale,y:y*Math.cos(pitch)*scale,z:y*Math.sin(pitch)*scale}));
function calibrated(scale=1, pitch=0) { const d=new NMMDetector(); for(let i=0;i<150;i++) d.push({t:i*33,rest:true,face:face(.04,.1,scale,pitch)}); return d; }
describe('NMM calibration and geometry',()=>{
  it.each([.7,1,1.4])('detects raises/furrows at scale %s without neutral pitch/distance false triggers',scale=>{
    for(const pitch of [0,.4,-.4]) {
      const d=calibrated();
      for(let i=0;i<15;i++) expect(d.push({t:5000+i*33,rest:false,face:face(.04,.1,scale,pitch)})).toEqual([]);
      const raised=calibrated(scale,pitch); let tags:string[]=[];
      for(let i=0;i<10;i++) tags=raised.push({t:5000+i*33,rest:false,face:face(.1,.1,scale,pitch)});
      expect(tags).toContain('Q-YN');
      const furrow=calibrated(scale,pitch);
      for(let i=0;i<10;i++) tags=furrow.push({t:5000+i*33,rest:false,face:face(.02,.05,scale,pitch)});
      expect(tags).toContain('Q-WH');
    }
  });
  it('normalizes exact geometric ratios',()=>{expect(faceRatios(face())!.raise).toBeCloseTo(.2,12);expect(faceRatios(face(.04,.1,1.4,.4))!.raise).toBeCloseTo(.2,12);});
  it('detects oscillation without tagging jitter, a single turn or missing yaw',()=>{
    expect(headshakeScore(Array.from({length:24},(_,i)=>Math.sin(i*Math.PI/5)*.1))).toBeGreaterThanOrEqual(2);
    expect(headshakeScore(Array.from({length:24},(_,i)=>Math.sin(i)*.01))).toBe(0);
    expect(headshakeScore(Array.from({length:24},(_,i)=>i*.01))).toBe(0);
    const d=new NMMDetector();let tags:string[]=[];
    for(let i=0;i<24;i++) tags=d.push({t:i*33,rest:false,headYaw:Math.sin(i*Math.PI/5)*.1});
    expect(tags).toContain('NEG'); expect(d.push({t:800,rest:false})).toEqual([]);
  });
  it('uses the existing tracker blendshapes, gates occlusion and clears stale utterances',()=>{
    const d=new NMMDetector(); for(let i=0;i<150;i++) d.push({t:i*33,rest:true,brow:{raise:.1,furrow:.1}});
    let tags:string[]=[];for(let i=0;i<10;i++) tags=d.push({t:5000+i*33,rest:false,brow:{raise:.5,furrow:.1}});
    expect(tags).toEqual(['Q-YN']); expect(d.push({t:5400,rest:true})).toEqual([]);
    const f=face();f[6]={...f[6],x:NaN}; expect(faceRatios(f)).toBeNull();
    expect(faceRatios(face().map(p=>({...p,visibility:.1})))).toBeNull();
    expect(d.push({t:6000,rest:false})).toEqual([]);
  });
});
