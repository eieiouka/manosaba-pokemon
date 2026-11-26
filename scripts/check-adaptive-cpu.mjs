import {fastLearnedCpu as old} from '../src/fast-learned-cpu.js';
import {fastLearnedCpu as improved} from '../src/adaptive-cpu.js';
import {roster} from '../src/data.js';
import {initialState,seededRandom,quickAction,transition,legalActions} from '../src/ai.js';
const ids=roster.map(c=>c.id);
function roster6(r){const a=[...ids];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,6)}
const swap=s=>({...s,teams:[s.teams[1],s.teams[0]],active:[s.active[1],s.active[0]],preview:[s.preview[1],s.preview[0]]});
for(const mode of ['old','quick']){
const times=[];let wins=0,draws=0;const N=400;
for(let g=0;g<N;g++){
 const r=seededRandom(71291+Math.floor(g/2)*9167),a=roster6(r),b=roster6(r),side=g%2;
 const teams=side===0?[a,b]:[b,a];let s=initialState(...teams.map(x=>x.slice(0,3)));s.preview=teams;
 const rng=seededRandom(21238+g*1177),rr=seededRandom(82721+g*239);
 for(let t=0;t<80&&s.winner===null;t++){
  const view=side===1?s:swap(s);const start=performance.now();const x=improved(view,{rng:rr});times.push(performance.now()-start);
  const y=mode==='quick'?quickAction(s,1-side):old(side===0?s:swap(s),{rng:rr});
  if(!legalActions(s,side).some(z=>z.kind===x?.kind&&z.index===x?.index))throw Error('illegal action');
  s=side===0?transition(s,x,y,rng):transition(s,y,x,rng);
 }
 wins+=s.winner===side;draws+=s.winner===null;
}
times.sort((a,b)=>a-b);console.log({mode,games:N,wins,draws,rate:(wins+.5*draws)/N,median:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1)});
}
