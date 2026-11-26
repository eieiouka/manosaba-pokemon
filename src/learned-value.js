// Lightweight learned value function; browser-independent, no ML dependencies.
import {roster} from './data.js';
import {evaluate,rankActions,quickAction,legalActions,transition,seededRandom} from './ai.js';
const ids=roster.map(c=>c.id),n=ids.length,idx=new Map(ids.map((id,i)=>[id,i]));
const K=12,base=1,synergy=base+n*K,matchup=synergy+n*n;
export const featureCount=matchup+n*n+8;
export const featureSchema='manosaba-value-v1:'+ids.join(',');
export function freshModel(){const weights=Array(featureCount).fill(0);weights[0]=1;return {schema:featureSchema,weights}}
export function validateModel(m){if(m?.schema!==featureSchema||!Array.isArray(m.weights)||m.weights.length!==featureCount||!m.weights.every(Number.isFinite))throw Error('Incompatible learned model');return m}
export function features(s){
 const f=new Float64Array(featureCount),h=Math.max(-.999,Math.min(.999,evaluate(s)));f[0]=Math.atanh(h);
 for(const side of [0,1]){
  const sign=side===0?1:-1,team=s.teams[side],active=team[s.active[side]],living=team.filter(c=>c.hp>0);
  for(const c of team){const i=idx.get(c.id);if(i===undefined||c.hp<=0)continue;const k=base+i*K,on=c===active,frac=c.hp/c.maxHp;
   f[k]+=sign;f[k+1]+=sign*frac;f[k+2]+=sign*(on?1:0);
   f[k+3]+=sign*(on?(c.stages[1]+c.stages[3])/6:0);
   f[k+4]+=sign*(on?(c.stages[2]+c.stages[4])/6:0);
   f[k+5]+=sign*(on?c.stages[5]/6:0);
   f[k+6]+=sign*(on?(c.evasionStage??0)/6:0);
   f[k+7]+=sign*(c.status?1:0);
   f[k+8]+=sign*(c.item?1:0);
   f[k+9]+=sign*(on?(c.subHp??0)/c.maxHp:0);
   f[k+10]+=sign*(on?((c.taunted??0)+(c.encoreTurns??0)+(c.confusion??0))/8:0);
   f[k+11]+=sign*c.pp.reduce((v,p,j)=>v+p/(c.moves[j].pp||1),0)/Math.max(1,c.pp.length);
  }
  for(let i=0;i<living.length;i++)for(let j=i+1;j<living.length;j++){const x=idx.get(living[i].id),y=idx.get(living[j].id);if(x===undefined||y===undefined)continue;f[synergy+Math.min(x,y)*n+Math.max(x,y)]+=sign}
  const i=idx.get(active.id),j=idx.get(s.teams[1-side][s.active[1-side]].id);
  if(i!==undefined&&j!==undefined&&active.hp>0)f[matchup+i*n+j]+=sign;
  const e=matchup+n*n;
  f[e]+=sign*living.length/3;f[e+1]+=sign*living.reduce((v,c)=>v+c.hp/c.maxHp,0)/3;
  f[e+2]+=sign*(s.psychicTerrain?living.filter(c=>c.id==='miria'||c.id==='margo').length*s.psychicTerrain/8:0);
  f[e+3]+=sign*(s.trickRoom?living.filter(c=>c.stats[5]<100).length*s.trickRoom/5:0);
  f[e+4]+=sign*(active.hp>0&&active.status==='sleep'?1:0);
  f[e+5]+=sign*(active.hp>0&&active.status==='burn'?1:0);
  f[e+6]+=sign*(active.hp>0&&active.status==='toxic'?1:0);
  f[e+7]+=sign*(active.hp>0?(active.critRank??0)/3:0);
 }
 return f;
}
export function predictFeatures(f,weights){let v=0;for(let i=0;i<f.length;i++)v+=f[i]*weights[i];return Math.tanh(v)}
export function learnedValue(s,model){if(s.winner!==null)return s.winner===0?1:-1;return predictFeatures(features(s),model.weights)}
export function learnedAction(s,side,model,rng,{candidates=3,epsilon=0,samples=1}={}){
 const actions=legalActions(s,side);if(actions.length<2)return actions[0];
 if(rng()<epsilon)return actions[Math.floor(rng()*actions.length)];
 const shortlist=candidates===0?actions:rankActions(s,side).slice(0,candidates).map(x=>x.action);
 const opponent=quickAction(s,1-side);if(!opponent)return shortlist[0];
 const seeds=Array.from({length:samples},()=>Math.floor(rng()*4294967296));
 let best=shortlist[0],score=-Infinity;
 for(const a of shortlist){let v=0;for(const seed of seeds){
   const random=seededRandom(seed),next=side===0?transition(s,a,opponent,random):transition(s,opponent,a,random);
   v+=(side===0?1:-1)*learnedValue(next,model);
  }if(v>score){score=v;best=a}
 }
 return best;
}
