import {fastLearnedCpu as legacy} from '../src/fast-learned-cpu.js';
import {fastLearnedCpu as adaptive} from '../src/adaptive-cpu.js';
import {fastLearnedCpu as champion} from '../src/league-cpu.js';
import {roster} from '../src/data.js';
import {initialState,seededRandom,quickAction,transition,legalActions} from '../src/ai.js';
const ids=roster.map(c=>c.id);
function six(r){const a=[...ids];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,6)}
function swap(s){return {...s,teams:[s.teams[1],s.teams[0]],active:[s.active[1],s.active[0]],preview:[s.preview[1],s.preview[0]]}}
const seed=(x)=>{x=(x^x>>>16)>>>0;x=Math.imul(x,0x7feb352d)>>>0;x=(x^x>>>15)>>>0;x=Math.imul(x,0x846ca68b)>>>0;return (x^x>>>16)>>>0};
const N=Number(process.argv[2]??1000);
const all=[['champion','legacy',champion],['champion','quick',champion],['champion','weak',champion],['adaptive-2m','legacy',adaptive]];
for(let mode=0;mode<all.length;mode++){
 const [name,opp,player]=all[mode],times=[];let wins=0,draws=0,turns=0;
 for(let g=0;g<N;g++){
  const k=seed(0x3684db37+Math.floor(g/2)+mode*100000),r=seededRandom(k),a=six(r),b=six(r),side=g%2;
  const teams=side?[b,a]:[a,b];let s=initialState(...teams.map(x=>x.slice(0,3)));s.preview=teams;
  const battle=seededRandom(seed(k^g^0x12bad71b)),ra=seededRandom(seed(k^g^0x1ef09c24)),rb=seededRandom(seed(k^g^0x67cdbaae));
  for(let t=0;t<80&&s.winner===null;t++){
   const xView=side===1?s:swap(s);const start=performance.now(),x=player(xView,{rng:ra});times.push(performance.now()-start);
   let y;if(opp==='legacy')y=legacy(side===0?s:swap(s),{rng:rb});
   else if(opp==='weak'&&rb()<.25){const acts=legalActions(s,1-side);y=acts[Math.floor(rb()*acts.length)]}
   else y=quickAction(s,1-side);
   if(!legalActions(s,side).some(z=>z.kind===x?.kind&&z.index===x?.index))throw Error('illegal player action');
   if(!legalActions(s,1-side).some(z=>z.kind===y?.kind&&z.index===y?.index))throw Error('illegal opponent action');
   s=side===0?transition(s,x,y,battle):transition(s,y,x,battle);turns++;
  }wins+=s.winner===side;draws+=s.winner===null;
 }
 times.sort((a,b)=>a-b);
 console.log(JSON.stringify({name,opponent:opp,games:N,wins,draws,losses:N-wins-draws,rate:(wins+.5*draws)/N,turns,medianMs:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],maxMs:times.at(-1)}));
}
