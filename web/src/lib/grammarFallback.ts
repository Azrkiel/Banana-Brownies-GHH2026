const pronouns: Record<string,string> = { ME:'I', I:'I', YOU:'you', HE:'he', SHE:'she', WE:'we', THEY:'they', IT:'it' };
const possessives: Record<string,string> = { MY:'my', YOUR:'your', HIS:'his', HER:'her', OUR:'our', THEIR:'their' };
const verbs: Record<string,string[]> = { WANT:['want','wanted','wants'], NEED:['need','needed','needs'], KNOW:['know','knew','knows'], LIKE:['like','liked','likes'], GO:['go','went','goes'], EAT:['eat','ate','eats'], DRINK:['drink','drank','drinks'], HAVE:['have','had','has'], HELP:['help','helped','helps'], UNDERSTAND:['understand','understood','understands'] };
const predicates: Record<string,string> = { HUNGRY:'hungry', THIRSTY:'thirsty', HAPPY:'happy', GOOD:'good', TIRED:'tired', DEAF:'Deaf', STUDENT:'a student', TEACHER:'a teacher' };
const whWords = new Set(['WHAT','WHERE','WHO','WHEN','WHY','HOW']);
const markers = new Set(['Q-YN','Q-WH','NEG','FS']);
const title = (x:string) => x.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const word = (x:string) => x.startsWith('@') ? title(x.slice(1)) : x.startsWith('FS-') ? title(x.slice(3)) : pronouns[x] ?? possessives[x] ?? x.toLowerCase().replaceAll('_',' ');
const marker = (x:string) => x.replace(/^\[|\]$/g,'').toUpperCase();
export function grammarResult(glosses: string[], nmmTags: string[] = []): { english:string; supported:boolean } {
  const tags=new Set(nmmTags.map(marker));
  const words:string[]=[];
  for(const raw of glosses) { const token=raw.trim().toUpperCase(); if(markers.has(marker(token))) tags.add(marker(token)); else if(token) words.push(token); }
  if(!words.length) return {english:'',supported:false};
  const finish=(text:string,question=false) => ({english:text[0].toUpperCase()+text.slice(1)+(question?'?':'.'),supported:true});
  const greetings:Record<string,string>={HELLO:'Hello!',HI:'Hi!',BYE:'Bye!',GOODBYE:'Goodbye!',THANKYOU:'Thank you!',THANK_YOU:'Thank you!'};
  if(words.length===1 && greetings[words[0]]) return {english:greetings[words[0]],supported:true};
  const time=['YESTERDAY','TODAY','TOMORROW'].includes(words[0]) ? words.shift()! : '';
  const prefix=time ? title(time)+' ' : '', past=time==='YESTERDAY',future=time==='TOMORROW',neg=tags.has('NEG');
  const wh=whWords.has(words.at(-1)??'') ? words.pop()! : '';
  const question=!!wh||tags.has('Q-YN')||tags.has('Q-WH');
  if(words.length>=2 && words[1]==='NAME' && (possessives[words[0]]||['ME','I','YOU'].includes(words[0]))) {
    const owner=possessives[words[0]]??({ME:'my',I:'my',YOU:'your'} as Record<string,string>)[words[0]];
    if(wh==='WHAT' && words.length===2) return finish(`${prefix}what is ${owner} name`,true);
    if(words.length===3 && !question && !neg) return finish(`${prefix}${owner} name is ${word(words[2])}`);
  }
  if(words.length>=2 && pronouns[words[0]]) {
    const subject=pronouns[words[0]],third=['he','she','it'].includes(subject),predicate=words[1];
    if(predicates[predicate] && words.length===2) {
      const copula=past ? ['I','he','she','it'].includes(subject)?'was':'were' : subject==='I'?'am':third?'is':'are';
      let body=predicates[predicate],text:string;
      if(future) {body='be '+(neg?'not ':'')+body;text=question?`will ${subject} ${body}`:`${subject} will ${body}`;}
      else text=question?`${copula} ${subject} ${neg?'not ':''}${body}`:`${subject} ${copula} ${neg?'not ':''}${body}`;
      if(wh) text=wh.toLowerCase()+' '+text;
      return finish(prefix+text,question);
    }
    if(verbs[predicate] && (!wh||['WHERE','WHEN','WHY','HOW','WHAT'].includes(wh))) {
      const [base,preterite,singular]=verbs[predicate];let obj=words.slice(2).map(word).join(' ');
      if(predicate==='GO'&&words.length===3&&words[2]==='STORE') obj='to the store';
      const auxiliary=future?'will':past?'did':third?'does':'do';let text:string;
      if(question) text=(wh?wh.toLowerCase()+' ':'')+`${auxiliary} ${subject} ${neg?'not ':''}${base}`;
      else if(neg) text=`${subject} ${future?'will not':past?"didn't":third?"doesn't":"don't"} ${base}`;
      else text=`${subject} ${future?'will '+base:past?preterite:third?singular:base}`;
      return finish(prefix+text+(obj?' '+obj:''),question);
    }
  }
  const literal=[...(time?[time]:[]),...words,...(wh?[wh]:[])].map(word).join(' ');
  return {english:literal?literal[0].toUpperCase()+literal.slice(1)+(question?'?':'.'):'',supported:false};
}
export function fallbackGlossToEnglish(glosses:string[],nmmTags:string[]=[]):string {return grammarResult(glosses,nmmTags).english;}
