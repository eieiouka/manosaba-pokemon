import {spawnSync} from 'node:child_process';
import {roster} from '../src/data.js';
import {initialState,legalActions,transition,seededRandom,quickAction} from '../src/ai.js';
import {features} from '../src/learned-value.js';
const ids=roster.map(c=>c.id), status=[null,'burn','sleep','freeze','toxic','poison'];
const n=Number(process.argv[2]??200);
const inputs=[], expected=[];
function normalize(s){
 return {teams:s.teams.map(t=>t.map(c=>({id:ids.indexOf(c.id),hp:c.hp,stages:c.stages,pp:c.pp,item:!!c.item,locked:c.lockedMove??-1,last:c.lastMove??-1,encore:c.encoreTurns??0,encore_move:c.encoreMove??-1,crit:c.critRank??0,accuracy:c.accuracyStage??0,evasion:c.evasionStage??0,status:status.indexOf(c.status??null),sleep:c.sleepTurns??0,toxic:c.toxicCounter??0,drowsy:c.drowsy??0,streak:c.protectStreak??0,protect:c.protectTurn??0,clair:c.clairvoyanceTurn??0,sub:c.subHp??0,confusion:c.confusion??0,taunt:c.taunted??0,silence:c.silenced??0,trapped:ids.indexOf(c.trappedBy),revived:!!c.revivalUsed}))),active:s.active,turn:s.turn,winner:s.winner,terrain:s.psychicTerrain,gravity:s.gravity,trick:s.trickRoom};
}
for(let i=0;i<n;i++){
 const seed=(i*0x9e3779b1+1234)>>>0, r=seededRandom(seed^999), rng=seededRandom(seed);
 const team=()=>{let a=ids.slice();for(let j=a.length-1;j>0;j--){const k=Math.floor(r()*(j+1));[a[j],a[k]]=[a[k],a[j]]}return a.slice(0,3)};
 const teams=[team(),team()];let s=initialState(...teams);
 const actions=[], states=[{state:normalize(s),features:[...features(s)]}];
 for(let t=0;t<80&&s.winner===null;t++){
  const p=[0,1].map(i=>{const legal=legalActions(s,i);return r()<.35?legal[Math.floor(r()*legal.length)]:quickAction(s,i)});
  actions.push(p);s=transition(s,...p,rng);states.push({state:normalize(s),features:[...features(s)]});
 }
 inputs.push({teams,seed,actions});expected.push(states);
}
const run=spawnSync('cargo',['run','--release','--manifest-path','rust/Cargo.toml','--','--trace'],{input:inputs.map(v=>JSON.stringify(v)).join('\n')+'\n',encoding:'utf8',maxBuffer:128*1024*1024});
if(run.status!==0){console.error(run.stderr||run.error);process.exit(1)}
const results=run.stdout.trim().split('\n').map(JSON.parse);
let errors=0, turns=0;
for(let i=0;i<n;i++){
 for(let t=0;t<expected[i].length;t++){
  const a=expected[i][t],b=results[i]?.[t];turns++;
  const diff=(x,y,path='')=>{if(typeof x==='number'&&typeof y==='number')return Math.abs(x-y)>1e-8?path:null;if(x===null||y===null||typeof x!=='object'||typeof y!=='object')return x===y?null:path;for(const k of Object.keys(x)){const p=diff(x[k],y[k],path+'.'+k);if(p)return p}return null};
  const path=diff(a,b);
  if(path){errors++;console.error('Mismatch',i,'turn',t,path,'seed',inputs[i].seed,'teams',inputs[i].teams);if(errors<=3){const get=(v,p)=>p.split('.').slice(1).reduce((v,k)=>v?.[k],v);console.error('JS',get(a,path),'Rust',get(b,path));console.error(JSON.stringify({...inputs[i],actions:inputs[i].actions.slice(0,t)}))}break}
 }
}
console.log(`${n-errors}/${n} games matched; ${turns} states checked`);
if(errors)process.exit(1);
