import type { Brow, Pt } from './types';
export type NMMTag = 'Q-YN' | 'Q-WH' | 'NEG';
export type NMMInput = { t: number; rest: boolean; face?: (Pt & { visibility?: number })[] | null; brow?: Brow | null; headYaw?: number };
const distance = (a: Pt, b: Pt) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
/** Explicit nose/eyes/mouth/chin/brows input; XY174 is not a face tensor. */
export function faceRatios(face: NMMInput['face']) {
  if (!face || face.length !== 8 || face.some(p => (p.visibility ?? 1) < .5 || ![p.x,p.y,p.z].every(Number.isFinite))) return null;
  const width = distance(face[1], face[2]); if (width < .001) return null;
  const mid = { x:(face[1].x+face[2].x)/2, y:(face[1].y+face[2].y)/2, z:(face[1].z+face[2].z)/2 };
  return { raise:(distance(face[6],face[1])+distance(face[7],face[2]))/(2*width),
    furrow:(distance(face[6],face[0])+distance(face[7],face[0])+distance(face[6],face[7]))/width,
    yaw:((face[0].x-mid.x)*(face[2].x-face[1].x)+(face[0].y-mid.y)*(face[2].y-face[1].y)+(face[0].z-mid.z)*(face[2].z-face[1].z))/(width*width), width };
}
export function headshakeScore(values: number[]): number {
  if (values.length < 12) return 0;
  // A dead band rejects jitter and one-sided head turns.
  const signs = values.map(v => v > .03 ? 1 : v < -.03 ? -1 : 0).filter(Boolean);
  const crossings = signs.slice(1).filter((s,i)=>s!==signs[i]).length;
  return crossings >= 2 && Math.max(...values)-Math.min(...values) > .12 ? crossings : 0;
}
export class NMMDetector {
  private source = '';
  private neutral = 0;
  private mean = [0,0];
  private variance = [0,0];
  private lastT: number | null = null;
  private tail: number[][] = [];
  private yaw: number[] = [];
  private widths: number[] = [];
  reset() { this.source=''; this.neutral=0; this.mean=[0,0]; this.variance=[0,0]; this.lastT=null; this.tail=[]; this.yaw=[]; this.widths=[]; }
  push(input: NMMInput): NMMTag[] {
    if (!Number.isFinite(input.t) || (this.lastT !== null && input.t <= this.lastT)) { this.reset(); return []; }
    const dt = this.lastT === null ? 1000/30 : Math.min(input.t-this.lastT, 5000);
    if (dt > 250) { this.tail=[]; this.yaw=[]; this.widths=[]; }
    this.lastT=input.t;
    const f=faceRatios(input.face);
    const b=input.brow;
    const values=f ? [f.raise,f.furrow] : b && [b.raise,b.furrow].every(Number.isFinite) ? [b.raise,1-b.furrow] : null;
    const source=f ? 'face' : values ? 'blendshape' : '';
    if (source && source!==this.source) { this.source=source; this.neutral=0; this.tail=[]; this.widths=[]; }
    if (f) { this.widths.push(f.width); if(this.widths.length>10) this.widths.shift(); }
    else this.widths=[];
    const widthMean=this.widths.reduce((a,b)=>a+b,0)/Math.max(this.widths.length,1);
    const stable=!f || Math.sqrt(this.widths.reduce((s,v)=>s+(v-widthMean)**2,0)/this.widths.length)<.015;
    if(input.rest) {
      this.tail=[]; this.yaw=[];
      if(values && stable) {
        const alpha=1-Math.exp(-dt/5000);
        if(!this.neutral) { this.mean=values.slice(); this.variance=[0,0]; }
        else values.forEach((v,i)=>{ const d=v-this.mean[i]; this.mean[i]+=alpha*d; this.variance[i]=(1-alpha)*(this.variance[i]+alpha*d*d); });
        this.neutral++;
      }
      return [];
    }
    if(values && stable && this.neutral>=30) { this.tail.push(values); if(this.tail.length>10) this.tail.shift(); } else this.tail=[];
    const yaw=f?.yaw ?? input.headYaw;
    if(yaw!==undefined && Number.isFinite(yaw)) { this.yaw.push(yaw); if(this.yaw.length>24) this.yaw.shift(); } else this.yaw=[];
    const tags:NMMTag[]=[];
    if(this.tail.length===10) {
      const raise=this.tail.every(v=>v[0]>this.mean[0]+2*Math.max(Math.sqrt(this.variance[0]),.02));
      const furrow=this.tail.every(v=>v[1]<this.mean[1]-1.8*Math.max(Math.sqrt(this.variance[1]),.02));
      if(furrow) tags.push('Q-WH'); else if(raise) tags.push('Q-YN');
    }
    if(headshakeScore(this.yaw)) tags.push('NEG');
    return tags;
  }
}
