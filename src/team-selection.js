// Generation-15 empirical 3v3 payoff matrix, base-5 packed (3 scores/byte).
import {roster} from './data.js';
import {initialState,transition,rankActions,seededRandom} from './ai.js';
import {isTrapped} from './battle.js';
const ids=['ema','sherry','hanna','hiro','margo','nanoka','anan','miria','noa','reia','arisa','coco','meruru'];
const n=1716, powers=[1,5,25];
const triples=[];const index=new Map();
for(let a=0;a<13;a++)for(let b=0;b<13;b++)if(a!==b)for(let c=0;c<13;c++)if(a!==c&&b!==c){index.set([a,b,c].join(','),triples.length);triples.push([a,b,c]);}
let loading;
export function preloadSelection(){
 if(!loading)loading=(async()=>{const res=await fetch(new URL(import.meta.env.BASE_URL+'ai-selection-gen15.bin',location.origin),{signal:AbortSignal.timeout(8000)});if(!res.ok)throw Error('selection table unavailable');const data=new Uint8Array(await res.arrayBuffer());if(data.length!==n*n/3||data.some(x=>x>=125))throw Error('invalid selection table');return data})().catch(()=>{loading=null;return null});
 return loading;
}
function choices(p){const a=p.map(id=>ids.indexOf(id));if(a.length!==6||new Set(a).size!==6||a.some(i=>i<0))return [];const result=[];for(const i of a)for(const j of a)if(i!==j)for(const k of a)if(i!==k&&j!==k)result.push(index.get([i,j,k].join(',')));return result.sort((a,b)=>a-b)}
function get(matrix,i,j){const k=i*n+j;return Math.floor(matrix[Math.floor(k/3)]/powers[k%3])%5/4}
export function selectionMix(matrix,own,opponent,rounds=32,all=false){
 const a=choices(own),b=choices(opponent);if(!matrix||!a.length||!b.length)return null;
 const m=a.length,k=b.length,pay=new Float64Array(m*k),ar=new Float64Array(m),br=new Float64Array(k);
 for(let i=0;i<m;i++)for(let j=0;j<k;j++){const x=get(matrix,a[i],b[j]);pay[i*k+j]=x;ar[i]+=x/k;br[j]+=x/m}
 // Fictitious play with 25% uniform prior, plus 20% shrinkage towards marginal
 // strength to reduce overfitting to the matrix's two games per exact selection pair.
 for(let i=0;i<m;i++)for(let j=0;j<k;j++)pay[i*k+j]=.8*pay[i*k+j]+.1*ar[i]+.1*br[j];
 const as=new Float64Array(m),bs=new Float64Array(k),ac=new Uint32Array(m),bc=new Uint32Array(k);
 for(let t=0;t<rounds;t++){let ai=0,bi=0,av=-Infinity,bv=Infinity;
  for(let i=0;i<m;i++){const v=.25*ar[i]+.75*(t?as[i]/t:ar[i]);if(v>av){av=v;ai=i}}
  for(let j=0;j<k;j++){const v=.25*br[j]+.75*(t?bs[j]/t:br[j]);if(v<bv){bv=v;bi=j}}
  ac[ai]++;bc[bi]++;for(let i=0;i<m;i++)as[i]+=pay[i*k+bi];for(let j=0;j<k;j++)bs[j]+=pay[ai*k+j];
 }
 const opponentTeams=b.map((idx,j)=>({team:triples[idx].map(v=>ids[v]),weight:bc[j]/rounds,j})).filter(x=>x.weight>0).sort((x,y)=>y.weight-x.weight).slice(0,5);
 return a.map((idx,i)=>({team:triples[idx].map(v=>ids[v]),weight:ac[i]/rounds,uniformScore:ar[i],expectedScore:.25*ar[i]+.75*as[i]/rounds,opponentTeams:opponentTeams.map(({team,weight,j})=>({team,weight,score:pay[i*k+j]}))})).filter(x=>all||x.weight>0).sort((x,y)=>y.weight-x.weight);
}
// Preview plan: sample direct matchups with real reserves, then test switching
// into the two hardest opponents. This is a fast heuristic, not a solved matchup.
const previewCache=new Map();
const samples=6;
function duel(own,foe,lead,target,reserve=null){
 let wins=0,entry=0;const ownTeam=[lead,...(reserve?[reserve]:[]),...own.filter(x=>x!==lead&&x!==reserve)].slice(0,3);
 const foeTeam=[target,...foe.filter(x=>x!==target)].slice(0,3);
 for(let k=0;k<samples;k++){
  let rng=seededRandom(0x3c91287+k*7919),s=initialState(ownTeam,foeTeam);
  const pick=side=>rankActions(s,side).find(x=>x.action.kind==='move')?.action;
  const ourId=reserve??lead;
  const get=(side,id)=>s.teams[side].find(c=>c.id===id);
  if(reserve){if(isTrapped(s,0))continue;const b=pick(1);if(!b)continue;
   s=transition(s,{kind:'switch',index:1},b,rng);
   if(!get(0,reserve)?.hp||s.teams[0][s.active[0]].id!==reserve)continue;entry++;
  }
  for(let turn=0;turn<18;turn++){
   const a=get(0,ourId),b=get(1,target);
   if(!a?.hp||!b?.hp||s.winner!==null||s.teams[0][s.active[0]].id!==ourId||s.teams[1][s.active[1]].id!==target)break;
   const x=pick(0),y=pick(1);if(!x||!y)break;
   const next=transition(s,x,y,rng);if(next===s)break;s=next;
  }
  const a=get(0,ourId),b=get(1,target);
  if(a?.hp&&!b?.hp)wins++;else if(a?.hp&&b?.hp)wins+=.5;
 }
 return {score:wins/samples,entry:reserve?entry/samples:1};
}
export function previewTactics(own,foe){
 const key=own.join(',')+'|'+foe.join(',');if(previewCache.has(key))return previewCache.get(key);
 const leaders=own.map(lead=>{
  const direct=foe.map(id=>({id,...duel(own,foe,lead,id)})).sort((a,b)=>a.score-b.score);
  const weak=direct.filter(x=>x.score<=.5).slice(0,2);
  const covers={};for(const id of own.filter(x=>x!==lead))covers[id]=weak.map(x=>({id:x.id,...duel(own,foe,lead,x.id,id)}));
  return {lead,direct,weak:weak.map(x=>x.id),covers,wins:direct.filter(x=>x.score>.5).length};
 });
 const plans=choices(own).map(idx=>{
  const team=triples[idx].map(v=>ids[v]),lead=leaders.find(x=>x.lead===team[0]);
  const cover=lead.weak.map(id=>({id, options:team.slice(1).map(c=>({reserve:c,...lead.covers[c].find(x=>x.id===id)})).sort((a,b)=>b.score-a.score||b.entry-a.entry)}));
  const covered=cover.filter(x=>x.options.some(y=>y.score>.5&&y.entry>=.75)).length;
  // 4+ favorable leads and all weak matchups covered is the preferred class.
  const viable=x=>x.options.filter(y=>y.score>.5&&y.entry>=.75);
  const distinct=cover.length<2||viable(cover[0]).some(a=>viable(cover[1]).some(b=>a.reserve!==b.reserve));
  const strict=lead.wins>=4&&covered===lead.weak.length&&distinct;
  return {team,leadWins:lead.wins,direct:lead.direct,cover,covered,strict,distinct,quality:lead.wins+covered};
 });
 if(previewCache.size>=8)previewCache.delete(previewCache.keys().next().value);
 previewCache.set(key,plans);return plans;
}
async function tacticalMix(own,opponent){
 if(roster.map(c=>c.id).join()!==ids.join())return null;
 const plans=previewTactics(own,opponent);
 const mix=selectionMix(await preloadSelection(),own,opponent,32,true);
 const byTeam=new Map((mix??[]).map(x=>[x.team.join(','),x]));
 const candidates=plans.map(p=>({...p,...(byTeam.get(p.team.join(','))??{weight:0,expectedScore:0,uniformScore:0,opponentTeams:[]})}));
 candidates.sort((a,b)=>Number(b.strict)-Number(a.strict)||b.quality-a.quality||b.expectedScore-a.expectedScore||b.leadWins-a.leadWins||b.weight-a.weight);
 const best=candidates[0];if(!best)return null;
 return {best,eligible:candidates.filter(x=>x.strict===best.strict&&x.quality===best.quality&&best.expectedScore-x.expectedScore<=.015),matrixAvailable:!!mix};
}
export async function chooseOptimalTeam(own,opponent,rng=Math.random){
 const result=await tacticalMix(own,opponent);if(!result)return null;
 return result.eligible[Math.min(result.eligible.length-1,Math.floor(rng()*result.eligible.length))]?.team??result.best.team;
}
export async function recommendTeam(own,opponent){
 const result=await tacticalMix(own,opponent);return result?{...result.best,matrixAvailable:result.matrixAvailable}:null;
}
