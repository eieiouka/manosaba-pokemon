// Offline ablation: only change one character's typing, preserving all live rules.
import {roster} from '../src/data.js';
import {initialState,seededRandom,transition,quickAction,legalActions} from '../src/ai.js';
import {fastLearnedCpu as cpu} from '../src/league-cpu.js';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {writeFileSync,mkdirSync} from 'node:fs';
const candidates=[['hanna',['grass','flying']],['arisa',['fire','electric']],['anan',['poison','bug']],['noa',['water','ground']],['meruru',['ice','dragon']],['reia',['steel','rock']]];
const ids=roster.map(c=>c.id),top=['sherry','hiro','nanoka','noa','reia','coco'];
const N=Number(process.argv[2]??250);
function shuffle(xs,r){const a=[...xs];for(let i=a.length-1;i>0;i--){const k=Math.floor(r()*(i+1));[a[i],a[k]]=[a[k],a[i]]}return a}
function swapped(s){return {...s,teams:[s.teams[1],s.teams[0]],active:[s.active[1],s.active[0]],preview:[s.preview[1],s.preview[0]]}}
function mix(n){n=(n^(n>>>16))>>>0;n=Math.imul(n,0x7feb352d)>>>0;n=(n^(n>>>15))>>>0;n=Math.imul(n,0x846ca68b)>>>0;return (n^(n>>>16))>>>0}
function simulate(id,g,mode){
 const seed=mix(0x41a2cabc+g),r=seededRandom(seed),side=g%2;
 const own=shuffle([id,...shuffle(ids.filter(x=>x!==id),r).slice(0,2)],r);
 const foes=shuffle((mode==='elite'?top:ids).filter(x=>x!==id),r).slice(0,3);
 const preview=(chosen,exclude=[])=>[...chosen,...shuffle(ids.filter(x=>!chosen.includes(x)&&!exclude.includes(x)),r).slice(0,3)];
 const previews=[preview(own),preview(foes,[id])],teams=side?[foes,own]:[own,foes];
 let s=initialState(...teams);s.preview=side?[previews[1],previews[0]]:previews;
 const ra=seededRandom(mix(seed^0x131)),rb=seededRandom(mix(seed^0x232)),battle=seededRandom(mix(seed^0x443));
 let entered=false,turns=0;
 for(let t=0;t<80&&s.winner===null;t++){if(s.teams[side][s.active[side]].id===id)entered=true;turns++;
  const x=cpu(swapped(s),{rng:ra,budget:Infinity}),y=cpu(s,{rng:rb,budget:Infinity});
  if(!legalActions(s,0).some(a=>a.kind===x?.kind&&a.index===x?.index)||!legalActions(s,1).some(a=>a.kind===y?.kind&&a.index===y?.index))throw Error('invalid action');
  s=transition(s,x,y,battle);
 }
 return {score:s.winner===null?.5:Number(s.winner===side),entered,turns};
}
function benchmark(id,types,n){
 const c=roster.find(c=>c.id===id),original=c.types.slice(),result={id,original,types,modes:{}};
 for(const mode of ['random','elite']){
  const a=[],b=[];c.types=original;for(let g=0;g<n;g++)a.push(simulate(id,g,mode));
  c.types=types;for(let g=0;g<n;g++)b.push(simulate(id,g,mode));
  c.types=original;const base=a.reduce((v,x)=>v+x.score,0),changed=b.reduce((v,x)=>v+x.score,0);
  const diff=b.map((x,i)=>x.score-a[i].score),mean=diff.reduce((v,x)=>v+x,0)/n,se=Math.sqrt(diff.reduce((v,x)=>v+(x-mean)**2,0)/(n-1)/n);
  result.modes[mode]={games:n,before:base/n,after:changed/n,delta:mean,approx95:[mean-1.96*se,mean+1.96*se],enteredBefore:a.filter(x=>x.entered).length,enteredAfter:b.filter(x=>x.entered).length};
 }
 return result;
}
if(!isMainThread){parentPort.postMessage(benchmark(...workerData));}else{
 const result=[];for(let i=0;i<candidates.length;i+=2){
  const batch=await Promise.all(candidates.slice(i,i+2).map(c=>new Promise((resolve,reject)=>{const w=new Worker(new URL(import.meta.url),{workerData:[...c,N]});w.once('message',resolve);w.once('error',reject);w.once('exit',x=>{if(x)reject(Error('worker '+x))})})));
  result.push(...batch);for(const r of batch)console.log('BALANCE_RESULT '+JSON.stringify(r));
 }
 const out=process.argv[3]??'/tmp/balance-screen';mkdirSync(out,{recursive:true});writeFileSync(out+'/results.json',JSON.stringify({model:'gen-015',gamesPerVariantPerOpponent:N,note:'Fixed AI weights; randomized 3v3 selection; type-only experiment, not a revised metagame.',results:result},null,2));
}
