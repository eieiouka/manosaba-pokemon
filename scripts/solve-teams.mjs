import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {availableParallelism} from 'node:os';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,appendFileSync,existsSync,renameSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {roster} from '../src/data.js';
import {initialState,transition,search,simulateQuick,seededRandom} from '../src/ai.js';

const ids=roster.map(c=>c.id);
const combinations=(xs,n,start=0)=>n===0?[[]]:xs.slice(start).flatMap((x,i)=>combinations(xs,n-1,start+i+1).map(t=>[x,...t]));
const ints=ids.map((_,i)=>i);
const triples=ints.flatMap(lead=>combinations(ints.filter(i=>i!==lead),2).map(t=>[lead,...t]));
const builds=combinations(ints,6);
const mask=t=>t.reduce((m,i)=>m|(1<<i),0);
const tripleMasks=triples.map(mask);
const choices=team=>{const m=mask(team);return triples.map((_,i)=>i).filter(i=>(tripleMasks[i]&m)===tripleMasks[i])};
const draw=(p,r)=>{let v=r();for(let i=0;i<p.length;i++){v-=p[i];if(v<=0)return i}return p.length-1};
const shuffle=(xs,r)=>{const a=[...xs];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
function battle(a,b,o,seed){
 if(o.quick)return simulateQuick(a,b,{seed,maxTurns:o.maxTurns}).winner;
 let state=initialState(a,b),decision=seededRandom(seed^0xdea110c),random=seededRandom(seed^0x9e3779b9);
 for(let t=0;t<o.maxTurns&&state.winner===null;t++){
  const q=search(state,{depth:o.depth,samples:o.samples,rolloutTurns:o.rollout,iterations:o.iterations,rng:decision});
  if(!q.row.length||!q.col.length)break;
  state=transition(state,q.actions[0][draw(q.row,decision)],q.actions[1][draw(q.col,decision)],random);
 }
 return state.winner;
}
function pair(i,j,o){
 let training=0,validation=0,nt=0,nv=0,draws=0;
 for(let r=0;r<o.repeats;r++){
  const seed=(o.seed+Math.imul(i+1,100003)+Math.imul(j+1,1009)+Math.imul(r+1,10000019))>>>0;
  const result=battle(triples[i].map(v=>ids[v]),triples[j].map(v=>ids[v]),o,seed);
  const score=result===0?1:result===1?0:.5;
  if(result===null)draws++;
  if(r%2===0){training+=score;nt++}else{validation+=score;nv++}
 }
 return [i,j,training/nt,nv?validation/nv:training/nt,draws];
}
if(!isMainThread){
 parentPort.on('message',([i,j])=>parentPort.postMessage(pair(i,j,workerData)));
}else{
 const args=process.argv.slice(2);
 const val=(name,def)=>{const i=args.indexOf(name);return i<0?def:args[i+1]};
 const num=(name,def,min=1)=>{const v=Number(val(name,def));if(!Number.isSafeInteger(v)||v<min)throw Error('Invalid '+name);return v};
 if(args.includes('--help')){
  console.log('node scripts/solve-teams.mjs [--quick] [--depth 2] [--samples 1] [--rollout 1] [--repeats 2] [--opponents 16] [--opponent-choices 3] [--workers 8] [--shortlist results.json --top 10] [--out results.json] [--checkpoint checkpoint.jsonl] [--seed 1] [--max-turns 80]');
 }else await main();
 async function main(){
  const opts={quick:args.includes('--quick'),depth:num('--depth',2),samples:num('--samples',1),rollout:num('--rollout',1,0),repeats:num('--repeats',2),iterations:num('--iterations',64),seed:num('--seed',1,0),maxTurns:num('--max-turns',80)};
  const workers=num('--workers',Math.min(8,availableParallelism())),opponentCount=num('--opponents',16),opponentChoices=num('--opponent-choices',3),top=num('--top',10);
  const out=resolve(val('--out','analysis/teams.json')),checkpoint=resolve(val('--checkpoint',out+'.jsonl'));
  const shortlist=val('--shortlist',null),rng=seededRandom(opts.seed^0xa7415);
  if(out===checkpoint)throw Error('Output and checkpoint must be different files');
  if(roster.length<6)throw Error('At least six characters required');
  let candidates=builds;
  if(shortlist){
   const source=JSON.parse(readFileSync(shortlist,'utf8'));
   candidates=source.rankings.slice(0,top).map(x=>x.team.map(id=>ids.indexOf(id)));
   if(!candidates.length||candidates.some(t=>t.length!==6||new Set(t).size!==6||t.includes(-1)))throw Error('Invalid shortlist');
  }
  const foes=shuffle(builds,rng).slice(0,opponentCount).map(team=>({team,choices:shuffle(choices(team),rng).slice(0,opponentChoices)}));
  const ownChoices=candidates.map(choices),left=[...new Set(ownChoices.flat())],right=[...new Set(foes.flatMap(x=>x.choices))];
  const hash=createHash('sha256');
  for(const file of ['data.js','battle.js','ai.js'])hash.update(readFileSync(new URL('../src/'+file,import.meta.url)));
  hash.update(readFileSync(new URL(import.meta.url)));
  hash.update(JSON.stringify({opts,candidates,foes}));const fingerprint=hash.digest('hex');
  const total=left.length*right.length,done=new Map(),key=(i,j)=>i*triples.length+j;
  mkdirSync(dirname(checkpoint),{recursive:true});mkdirSync(dirname(out),{recursive:true});
  if(existsSync(checkpoint)){
   const raw=readFileSync(checkpoint,'utf8'),lines=raw.split('\n'),header=JSON.parse(lines.shift());
   if(header.fingerprint!==fingerprint)throw Error('Checkpoint belongs to different engine/settings. Use another --checkpoint.');
   for(let n=0;n<lines.length;n++){
    if(!lines[n])continue;
    let row;try{row=JSON.parse(lines[n])}catch(e){if(n!==lines.length-1)throw e;break}
    done.set(key(row[0],row[1]),row);
   }
   // A crash may leave an incomplete final line. Reconstruct only the valid records.
   if(!raw.endsWith('\n'))writeFileSync(checkpoint,JSON.stringify(header)+'\n'+[...done.values()].map(x=>JSON.stringify(x)+'\n').join(''));
  }else writeFileSync(checkpoint,JSON.stringify({fingerprint,opts,candidates,foes})+'\n');
  const pending=[];for(const i of left)for(const j of right)if(!done.has(key(i,j)))pending.push([i,j]);
  console.error('Builds: '+candidates.length+' / '+builds.length+'; pairings: '+total+'; repeats: '+opts.repeats+'; workers: '+workers+'; restored: '+done.size);
  if(opts.repeats<2)console.error('Warning: no independent validation samples; ranking will be optimistic.');
  let cursor=0,completed=done.size,last=Date.now(),started=last,initial=completed;
  if(pending.length)await new Promise((resolveWork,reject)=>{
   let idle=0,failed=false;const pool=[];
   const abort=err=>{if(failed)return;failed=true;for(const w of pool)w.terminate();reject(err)};
   for(let n=0;n<Math.min(workers,pending.length);n++){
    const w=new Worker(new URL(import.meta.url),{workerData:opts});pool.push(w);
    let stopping=false;
    const next=()=>{if(cursor<pending.length){w.postMessage(pending[cursor++]);return}stopping=true;w.terminate();if(++idle===Math.min(workers,pending.length))resolveWork()};
    w.on('message',row=>{
     if(failed)return;
     try{appendFileSync(checkpoint,JSON.stringify(row)+'\n');done.set(key(row[0],row[1]),row);completed++;
      if(Date.now()-last>5000||completed===total){const elapsed=(Date.now()-started)/1000,rate=(completed-initial)/Math.max(.001,elapsed);console.error(completed+'/'+total+' ('+(100*completed/total).toFixed(1)+'%) '+(rate?Math.round((total-completed)/rate/60)+' min left':''));last=Date.now()}next();
     }catch(e){abort(e)}
    });w.on('error',abort);w.on('exit',code=>{if(!stopping&&!failed)abort(Error('Worker exited '+code))});next();
   }
  });
  function equilibrium(payoff){
   const rows=payoff.length,cols=payoff[0].length,rc=Array(rows).fill(1/rows),cc=Array(cols).fill(1/cols);
   for(let t=0;t<64;t++){
    let ri=0,rmax=-Infinity,ci=0,cmin=Infinity;
    for(let i=0;i<rows;i++){let v=0;for(let j=0;j<cols;j++)v+=payoff[i][j]*cc[j];if(v>rmax){rmax=v;ri=i}}
    for(let j=0;j<cols;j++){let v=0;for(let i=0;i<rows;i++)v+=payoff[i][j]*rc[i];if(v<cmin){cmin=v;ci=j}}
    rc[ri]++;cc[ci]++;
   }
   const rs=rc.reduce((a,b)=>a+b,0),cs=cc.reduce((a,b)=>a+b,0);
   return [rc.map(x=>x/rs),cc.map(x=>x/cs)];
  }
  const rankings=candidates.map((team,index)=>{
   const options=ownChoices[index];let score=0,train=0,selection={};
   for(const foe of foes){
    const values=options.map(i=>foe.choices.map(j=>done.get(key(i,j))));
    const [p,q]=equilibrium(values.map(row=>row.map(v=>v[2])));
    for(let i=0;i<p.length;i++)for(let j=0;j<q.length;j++){
     train+=p[i]*q[j]*values[i][j][2];score+=p[i]*q[j]*values[i][j][3];
    }
    for(let i=0;i<p.length;i++){const name=triples[options[i]].map(v=>ids[v]).join('/');selection[name]=(selection[name]??0)+p[i]/foes.length}
   }
   return {team:team.map(i=>ids[i]),score:score/foes.length,trainingScore:train/foes.length,selections:Object.entries(selection).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([team,rate])=>({team:team.split('/'),rate}))};
  }).sort((a,b)=>b.score-a.score);
  const report={engine:fingerprint,opts,opponents:foes.map(f=>({team:f.team.map(i=>ids[i]),selections:f.choices.map(i=>triples[i].map(v=>ids[v]))})),pairings:total,games:total*opts.repeats,draws:[...done.values()].reduce((s,x)=>s+x[4],0),rankings};
  writeFileSync(out+'.tmp',JSON.stringify(report,null,2));renameSync(out+'.tmp',out);
  console.log(JSON.stringify(rankings.slice(0,20),null,2));console.error('Saved '+out);
 }
}

