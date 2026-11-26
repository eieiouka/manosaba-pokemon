import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {availableParallelism} from 'node:os';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {roster} from '../src/data.js';
import {initialState,transition,quickAction,legalActions,seededRandom} from '../src/ai.js';
import {freshModel,validateModel,features,predictFeatures,learnedAction,featureCount} from '../src/learned-value.js';
const ids=roster.map(c=>c.id);
function team(r){const a=[...ids];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a.slice(0,3)}
function episode(index,opts,model,mode='train'){
 const seed=(opts.seed+Math.imul(index+1,0x9e3779b1))>>>0;
 const setup=seededRandom(seed^0x49f2),decision=seededRandom(seed^0x9123),random=seededRandom(seed^0x4567);
 const a=team(setup),b=team(setup);let s=initialState(a,b);const trace=[];
 const learnerSide=index%2;
 const choose=(side)=>{
  const legal=legalActions(s,side);if(!legal.length)return null;
  if(mode==='train'&&decision()<opts.epsilon)return legal[Math.floor(decision()*legal.length)];
  const use=mode==='eval'?side===learnerSide:opts.policy==='learned'&&decision()<opts.learnedRate;
  return use?learnedAction(s,side,model,decision,{candidates:opts.candidates,samples:opts.samples}):quickAction(s,side);
 };
 let turns=0;
 for(;turns<opts.maxTurns&&s.winner===null;turns++){
  if(mode==='train'&&turns%opts.stride===0)trace.push(features(s));
  const x=choose(0),y=choose(1);if(!x||!y)break;
  const next=transition(s,x,y,random);if(next===s)break;s=next;
 }
 return {trace,turns,winner:s.winner,learnerSide};
}
function batch({start,count,opts,model,mode}){
 const grad=new Float64Array(featureCount);let examples=0,loss=0,turns=0,draws=0,wins=0;
 for(let j=0;j<count;j++){
  const e=episode(start+j,opts,model,mode);turns+=e.turns;if(e.winner===null)draws++;
  if(mode==='eval'){if(e.winner===e.learnerSide)wins++;continue}
  const target=e.winner===null?0:e.winner===0?1:-1;
  for(const f of e.trace){const pred=predictFeatures(f,model.weights),err=target-pred;loss+=err*err;examples++;
   for(let i=0;i<f.length;i++)if(f[i])grad[i]+=err*f[i];
  }
 }
 return {grad:Array.from(grad),examples,loss,turns,draws,wins,count};
}
if(!isMainThread){parentPort.on('message',job=>parentPort.postMessage(batch(job)))}else{
 const args=process.argv.slice(2),val=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1]};
 const num=(k,d,min=0)=>{const n=Number(val(k,d));if(!Number.isSafeInteger(n)||n<min)throw Error('Invalid '+k);return n};
 const prob=(k,d)=>{const n=Number(val(k,d));if(!Number.isFinite(n)||n<0||n>1)throw Error('Invalid '+k);return n};
 if(args.includes('--help'))console.log('node scripts/train-ai.mjs --games 1000000 --workers 8 --out analysis/value.json [--policy learned|quick] [--epsilon .15] [--learned-rate .5] [--batch 64] [--candidates 3] [--samples 1] [--eval 200]');
 else await main();
 async function main(){
  const opts={seed:num('--seed',1),maxTurns:num('--max-turns',80,1),epsilon:prob('--epsilon',.15),learnedRate:prob('--learned-rate',.5),policy:val('--policy','learned'),candidates:num('--candidates',3),samples:num('--samples',1,1),stride:num('--stride',2,1)};
  if(!['quick','learned'].includes(opts.policy))throw Error('Invalid --policy');
  const games=num('--games',1000000),workers=num('--workers',Math.min(8,availableParallelism()),1),size=num('--batch',64,1),evalGames=num('--eval',200),rate=Number(val('--lr',.05));
  if(!(rate>0&&rate<=1))throw Error('Invalid --lr');
  const out=resolve(val('--out','analysis/value.json'));mkdirSync(dirname(out),{recursive:true});
  const hash=createHash('sha256');for(const p of ['data.js','battle.js','ai.js','learned-value.js'])hash.update(readFileSync(new URL('../src/'+p,import.meta.url)));hash.update(readFileSync(new URL(import.meta.url)));const engine=hash.digest('hex');
  let model={...freshModel(),engine,games:0,updates:0,examples:0,m:Array(featureCount).fill(0),v:Array(featureCount).fill(0),opts};
  if(existsSync(out)){model=validateModel(JSON.parse(readFileSync(out,'utf8')));if(model.engine!==engine)throw Error('Engine changed. Use a new --out file.');if(JSON.stringify(model.opts)!==JSON.stringify(opts))throw Error('Training options changed. Use a new --out file.');}
  const pool=Array.from({length:workers},()=>new Worker(new URL(import.meta.url)));
  const run=(w,job)=>new Promise((res,rej)=>{const msg=x=>{cleanup();res(x)},err=e=>{cleanup();rej(e)},exit=code=>err(Error('Worker exited '+code)),cleanup=()=>{w.off('message',msg);w.off('error',err);w.off('exit',exit)};w.once('message',msg);w.once('error',err);w.once('exit',exit);w.postMessage(job)});
  const save=()=>{writeFileSync(out+'.tmp',JSON.stringify(model));renameSync(out+'.tmp',out)};
  let started=Date.now(),initial=model.games,last=started;
  console.error('Training '+model.games+' → '+games+' games; '+workers+' workers; '+featureCount+' features');
  try{
   while(model.games<games){
    let start=model.games,jobs=[];for(let i=0;i<workers&&start<games;i++){const count=Math.min(size,games-start);jobs.push(run(pool[i],{start,count,opts,model:{schema:model.schema,weights:model.weights},mode:'train'}));start+=count}
    const results=await Promise.all(jobs),examples=results.reduce((v,x)=>v+x.examples,0);
    const step=++model.updates;
    if(examples)for(let i=0;i<featureCount;i++){
      const g=results.reduce((v,x)=>v+x.grad[i],0)/examples-.0001*model.weights[i];
      model.m[i]=.9*model.m[i]+.1*g;model.v[i]=.999*model.v[i]+.001*g*g;
      model.weights[i]=Math.max(-8,Math.min(8,model.weights[i]+rate*(model.m[i]/(1-Math.pow(.9,step)))/(Math.sqrt(model.v[i]/(1-Math.pow(.999,step)))+1e-8)));
    }
    model.games=start;model.examples+=examples;save();
    if(Date.now()-last>3000||model.games>=games){const speed=(model.games-initial)/Math.max(.001,(Date.now()-started)/1000);console.error(model.games+'/'+games+' ('+speed.toFixed(1)+' games/s) loss '+(results.reduce((v,x)=>v+x.loss,0)/Math.max(1,examples)).toFixed(4));last=Date.now()}
   }
   if(evalGames){let wins=0,draws=0,done=0;while(done<evalGames){const jobs=[];for(let i=0;i<workers&&done<evalGames;i++){const count=Math.min(size,evalGames-done);jobs.push(run(pool[i],{start:100000000+done,count,opts,model:{schema:model.schema,weights:model.weights},mode:'eval'}));done+=count}for(const x of await Promise.all(jobs)){wins+=x.wins;draws+=x.draws}}
    model.lastEvaluation={games:evalGames,wins,draws,rate:(wins+.5*draws)/evalGames};save();console.log(JSON.stringify(model.lastEvaluation,null,2));
   }
   console.error('Saved '+out);
  }finally{await Promise.all(pool.map(w=>w.terminate()))}
 }
}
