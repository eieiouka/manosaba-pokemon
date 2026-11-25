// Simultaneous-action search for offline analysis and live CPU battles.
import {roster,struggle} from './data.js';
import {makeTeam,resolveSequence,canUseMove,isTrapped,damage,hitLimit,rankedStat,chooseCpu,startSequence} from './battle.js';
export function seededRandom(seed=1){let x=seed>>>0;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296}}
const active=(s,i)=>s.teams[i][s.active[i]];
const priority=m=>m?.priority??(m?.name==='かげうち'?1:0);
const ground=(c,s)=>!!s.gravity||(!c.types.includes('flying')&&c.ability!=='ふゆう');
const crit=(a,m)=>(a.critRank??0)+(m.critStage??(m.name==='サイコカッター'?1:0))>=3;
export function legalActions(s,side){
 const a=active(s,side),out=[];
 const forced=a.hp<=0||(side===0&&s.pendingSwitch);
 if(forced||!isTrapped(s,side))s.teams[side].forEach((c,i)=>{if(c.hp>0&&i!==s.active[side])out.push({kind:'switch',index:i})});
 if(!forced){a.moves.forEach((m,i)=>{if(canUseMove(a,i))out.push({kind:'move',index:i})});if(canUseMove(a,-1))out.push({kind:'move',index:-1})}
 return out;
}
function attackValue(s,a,d,m){
 if(!m||m.category==='status'||m.soundMove&&a.silenced>0||s.psychicTerrain&&priority(m)>0&&ground(d,s))return 0;
 const hits=m.multiHit==='silver'?(a.item==='dice'?6:3.5):hitLimit(s,m);
 let value=damage(a,d,m,93,crit(a,m),rankedStat(a,5)<rankedStat(d,5),s)*hits;
 value*=Math.min(1,m.accuracy/100*(s.gravity?5/3:1));if(m.contact&&d.ability==='げんし')value*=.8;
 if(m.sucker)value*=.8;
 return value;
}
function bestHit(s,a,d){
 return Math.max(0,...a.moves.map((m,i)=>canUseMove(a,i)?attackValue(s,a,d,m):0));
}
function reserveValue(s,side,i){
 const a=s.teams[side][i],d=active(s,1-side);if(d.hp<=0)return a.hp/a.maxHp+(a.id==='ema'&&s.teams[side].filter(c=>c.hp>0).length>1?-.6:0);
 const sent={...a,lockedMove:null};const weakened=a.ability==='せんのう'?{...d,stages:d.stages.map((v,i)=>i===1||i===3?Math.max(-6,v-1):v)}:d;const attack=bestHit(s,sent,weakened)/d.maxHp,defense=bestHit(s,weakened,sent)/a.maxHp;
 return Math.min(1,attack)-Math.min(1,defense)+.35*a.hp/a.maxHp+(rankedStat(a,5)>rankedStat(d,5)?.12:0)+(a.id==='margo'&&!s.psychicTerrain?.22:0)-(a.id==='ema'&&s.teams[side].filter(c=>c.hp>0).length>1?.2:0);
}
export function chooseReserve(s,side,list){return list.reduce((best,i)=>best==null||reserveValue(s,side,i)>reserveValue(s,side,best)?i:best,null)}
export function initialState(a,b){
 return startSequence(a,b).at(-1).state;
}
export function transition(s,a,b,rng){
 const steps=resolveSequence(s,a,rng,{opponentAction:b,chooseSwitch:chooseReserve,fast:true});return steps.at(-1)?.state??s;
}
function material(s,side){
 return s.teams[side].reduce((v,c,i)=>{
 if(c.hp<=0)return v;
 const on=i===s.active[side],fraction=c.hp/c.maxHp;
 return v+0.65+fraction+(c.item==='sash'&&c.hp===c.maxHp?.12:0)+(c.ability==='しにもどり'&&!c.revivalUsed?.24:0)-(c.status==='burn'?.10:0)-(c.status==='sleep'?.13:0)-(on&&c.confusion>0?.18:0)-(on&&c.taunted>0&&c.moves.some(m=>m.dance||m.swordsDance||m.confuse||m.gravity)?.09:0)+(on?.085*(c.stages[1]+c.stages[3])+.035*(c.stages[2]+c.stages[4]+c.stages[5])+.045*(c.critRank??0):0);
 },0);
}
export function evaluate(s){
 if(s.winner!==null)return s.winner===0?1:-1;
 const a=active(s,0),b=active(s,1);
 let v=material(s,0)-material(s,1);
 if(a.hp>0&&b.hp>0){
  v+=.17*(Math.min(1,bestHit(s,a,b)/b.hp)-Math.min(1,bestHit(s,b,a)/a.hp));
  v+=.18*initiative(s,0);
  if(s.psychicTerrain)v+=terrainValue(s,0)-terrainValue(s,1);
 }
 return Math.tanh(v/2.5);
}
// Value the actual protection afforded by terrain against surviving priority users.
function terrainValue(s,side){
 const duration=Math.min(1,s.psychicTerrain/4),friends=s.teams[side].filter(c=>c.hp>0),foes=s.teams[1-side].filter(c=>c.hp>0);
 let benefit=0;
 for(const c of friends){
  if(!ground(c,s))continue;
  let threat=0;
  for(const d of foes)for(const m of d.moves){
   if(priority(m)<=0||m.category==='status')continue;
   const hit=attackValue({...s,psychicTerrain:0},d,c,m);
   threat=Math.max(threat,Math.min(1,hit/c.hp));
  }
  benefit+=threat*(c.moves.some(m=>m.dance||m.swordsDance)?.10:.055);
 }
 return duration*benefit;
}
function quickAction(s,side){
 const a=active(s,side),d=active(s,1-side),actions=legalActions(s,side);
 const best=bestHit(s,a,d),incoming=bestHit(s,d,a);
 let out=actions[0],max=-Infinity;
 for(const x of actions){
  let v;
  if(x.kind==='switch'){v=reserveValue(s,side,x.index)-reserveValue(s,side,s.active[side])-.35;if(best>=d.hp)v-=.8}
  else{
   const m=x.index<0?struggle:a.moves[x.index];
   if(m.category==='status'){
    v=-1;
    if((m.dance||m.swordsDance)&&a.stages[1]<4&&best<d.hp&&(incoming<a.hp*.55||(a.item==='sash'&&a.hp===a.maxHp)))v=.7+Math.min(best/d.hp,.4);
    if(m.gravity&&!s.gravity&&s.psychicTerrain>2&&s.teams[side].some(c=>c.id==='hanna'&&c.hp>0))v=.55;
    if(m.confuse&&!d.confusion&&!(m.soundMove&&a.silenced>0)&&s.teams[side].some((c,i)=>i!==s.active[side]&&c.hp>0))v=.55*Math.min(1,m.accuracy/100*(s.gravity?5/3:1));
    if(m.taunt&&!d.taunted&&d.moves.some(t=>t.dance||t.swordsDance||t.gravity))v=.35;
   }else{const dmg=attackValue(s,a,d,m);v=dmg/Math.max(1,d.hp);if(dmg>=d.hp&&priority(m)>0)v+=.7}
  }
  if(v>max){max=v;out=x}
 }
 return out;
}
function rollout(s,rng,turns){
 for(let i=0;i<turns&&s.winner===null;i++){
  const a=quickAction(s,0),b=quickAction(s,1);if(!a||!b)break;
  const next=transition(s,a,b,rng);if(next===s)break;s=next;
 }
 return evaluate(s);
}
// Fictitious play estimates mixed strategies of the simultaneous zero-sum game.
// No player gets to observe the other's selected action before committing.
function equilibrium(payoff,iterations=48){
 const rows=payoff.length,cols=payoff[0].length,r=Array(rows).fill(1),c=Array(cols).fill(1);
 for(let t=0;t<iterations;t++){
  const u=payoff.map(row=>row.reduce((sum,x,j)=>sum+x*c[j],0));
  const v=Array.from({length:cols},(_,j)=>payoff.reduce((sum,row,i)=>sum+row[j]*r[i],0));
  r[u.indexOf(Math.max(...u))]++;c[v.indexOf(Math.min(...v))]++;
 }
 const rn=r.reduce((x,y)=>x+y),cn=c.reduce((x,y)=>x+y),row=r.map(x=>x/rn),col=c.map(x=>x/cn);
 const value=payoff.reduce((sum,line,i)=>sum+row[i]*line.reduce((v,x,j)=>v+x*col[j],0),0);
 return {row,col,value};
}
export function search(s,{depth=1,samples=2,rolloutTurns=1,iterations=48,rng=Math.random,deadline=Infinity}={}){
 const actions=[legalActions(s,0),legalActions(s,1)];
 if(s.winner!==null||!actions[0].length||!actions[1].length)return {actions,value:evaluate(s),row:[],col:[]};
 const seeds=Array.from({length:samples},()=>Math.floor(rng()*4294967296));
 const payoff=actions[0].map(a=>actions[1].map(b=>seeds.reduce((sum,seed)=>{
  if(Date.now()>deadline)throw new Error('search deadline');
  const random=seededRandom(seed);const next=transition(s,a,b,random);
  const v=next.winner!==null?evaluate(next):depth>1?search(next,{depth:depth-1,samples,rolloutTurns,iterations,rng:random,deadline}).value:rollout(next,random,rolloutTurns);
  return sum+v;
 },0)/samples));
 return {actions,payoff,...equilibrium(payoff,iterations)};
}
function draw(p,rng){let x=rng();for(let i=0;i<p.length;i++){x-=p[i];if(x<=0)return i}return p.length-1}
export function simulate(a,b,{seed=1,depth=1,samples=2,rolloutTurns=1,iterations=48,maxTurns=80}={}){
 let s=initialState(a,b);const rng=seededRandom(seed);let turns=0;
 for(;turns<maxTurns&&s.winner===null;turns++){
  const q=search(s,{depth,samples,rolloutTurns,iterations,rng});if(!q.row.length||!q.col.length)break;
  const next=transition(s,q.actions[0][draw(q.row,rng)],q.actions[1][draw(q.col,rng)],rng);if(next===s)break;s=next;
 }
 return {winner:s.winner,turns,state:s};
}
export function allSelections(){const ids=roster.map(c=>c.id),out=[];for(const a of ids)for(const b of ids)for(const c of ids)if(a!==b&&a!==c&&b!==c)out.push([a,b,c]);return out}

export function simulateQuick(a,b,{seed=1,maxTurns=80}={}){
 let s=initialState(a,b);const rng=seededRandom(seed);let turns=0;
 for(;turns<maxTurns&&s.winner===null;turns++){
  const x=quickAction(s,0),y=quickAction(s,1);if(!x||!y)break;
  const next=transition(s,x,y,rng);if(next===s)break;s=next;
 }
 return {winner:s.winner,turns,state:s};
}
export function rankSelections({candidates=allSelections(),opponents=allSelections(),repeats=1,seed=1,quick=false,onProgress=()=>{},...options}={}){
 const run=quick?simulateQuick:simulate;
 const results=candidates.map((team,index)=>{
  let wins=0,draws=0,games=0;
  opponents.forEach((opponent,j)=>{for(let k=0;k<repeats;k++){
   const result=run(team,opponent,{...options,seed:(seed+Math.imul(index+1,100003)+Math.imul(j+1,1009)+Math.imul(k+1,10000019))>>>0});
   games++;if(result.winner===0)wins++;else if(result.winner===null)draws++;
  }});
  const row={team,wins,draws,games,rate:(wins+draws*.5)/games};onProgress(index+1,candidates.length,row);return row;
 });
 return results.sort((a,b)=>b.rate-a.rate);
}

// CPU selection is committed independently of the player's hidden selection.
// Diverse high-performing lineups from tactical self-play, weighted by results.
export function chooseCpuTeam(rng=Math.random){
 const teams=[['sherry','nanoka','ema'],['sherry','hanna','ema'],['sherry','hiro','nanoka'],['sherry','nanoka','hanna'],['hanna','sherry','nanoka']];
 if(teams.every(team=>team.every(id=>roster.some(c=>c.id===id))))return teams[draw([.48,.16,.16,.12,.08],rng)].slice();
 const ids=roster.map(c=>c.id);
 for(let i=ids.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]]}
 return ids.slice(0,3);
}
// Replace never-seen reserves with hypotheses drawn from the public roster.
// Only characters that have entered the field are supplied to the search.
export function cpuView(s){
 const visible=s.teams[0].filter((c,i)=>c.seen||i===s.active[0]);
 const known=visible.map(c=>c.id);
 const pool=roster.map(c=>c.id).filter(id=>!known.includes(id));
 const need=3-visible.length, hypotheses=[];
 function add(ids,start){if(ids.length===need){
  const team=[...visible,...makeTeam(ids)];
  hypotheses.push({...s,teams:[team,s.teams[1]],active:[team.findIndex(c=>c.id===s.teams[0][s.active[0]].id),s.active[1]]});return;
 }for(let i=start;i<pool.length;i++)add([...ids,pool[i]],i+1)}
 add([],0);return hypotheses;
}

// Forecast likely opposing attacks, while retaining a chance of every legal
// switch, setup move and counter-read. The old damage policy is a useful prior.
function opposingDamageAction(s){
 return chooseCpu({...s,teams:[s.teams[1],s.teams[0]],active:[s.active[1],s.active[0]]});
}

// Estimate the next-turn initiative, including the chance of acting before a KO.
// A switch that merely immunizes one hit but leaves a losing matchup has little value.
function initiative(s,side){
 const a=active(s,side),d=active(s,1-side);
 if(!a.hp||!d.hp)return 0;
 function options(att,def){
  return att.moves.map((m,i)=>({m,value:canUseMove(att,i)?attackValue(s,att,def,m):0})).filter(x=>x.value>0);
 }
 const ours=options(a,d),theirs=options(d,a);
 const speed=rankedStat(a,5)-rankedStat(d,5);
 const before=(m,n)=>priority(m)>priority(n)||priority(m)===priority(n)&&speed>0;
 const own=Math.max(0,...ours.map(({m,value})=>{
  const danger=Math.max(0,...theirs.filter(x=>!before(m,x.m)).map(x=>x.value))/a.hp;
  return Math.min(1,value/d.hp)*(danger>=1?.15:1-.35*danger);
 }));
 const enemy=Math.max(0,...theirs.map(({m,value})=>{
  const danger=Math.max(0,...ours.filter(x=>before(x.m,m)).map(x=>x.value))/d.hp;
  return Math.min(1,value/a.hp)*(danger>=1?.15:1-.35*danger);
 }));
 return own-enemy;
}
function switchCost(before,after,action){
 if(action.kind!=='switch'||after.winner!==null)return 0;
 const outgoing=active(before,1),incoming=active(after,1);
 if(incoming.id===outgoing.id||incoming.hp<=0)return .055;
 const old=initiative(before,1),next=initiative(after,1);
 // A modest tempo cost, larger when the replacement cannot threaten the opponent.
 // Good defensive pivots and escapes from a losing/locked matchup remain attractive.
 const improvement=next-old;
 return .025+.055*Math.max(0,.25-next)+.055*Math.max(0,.15-improvement);
}

export function liveCpuAction(s,{budget=850,rng=Math.random,maxRounds=60}={}){
 const states=cpuView(s),deadline=Date.now()+budget,actions=legalActions(s,1);
 if(!actions.length)return null;
 if(actions.length===1)return actions[0];
 let scores=actions.map(()=>0),rounds=0;
 const shuffled=states.map(state=>({state,key:rng()})).sort((a,b)=>a.key-b.key).map(x=>x.state);
 for(let j=0;j<maxRounds;j++){
  const h=shuffled[j%shuffled.length],opponents=legalActions(h,0),likely=opposingDamageAction(h),tactical=quickAction(h,0);
  if(!opponents.length)break;
  const same=(a,b)=>a.kind===b?.kind&&a.index===b?.index;
  const weights=opponents.map(a=>.20/opponents.length+(same(a,likely)?.55:0)+(same(a,tactical)?.25:0));
  const sum=weights.reduce((a,b)=>a+b,0),seed=Math.floor(rng()*4294967296);
  const batch=actions.map(()=>0);let complete=true;
  for(let i=0;i<actions.length;i++){
   for(let z=0;z<opponents.length;z++){
    if(Date.now()>deadline){complete=false;break}
    const r=seededRandom(seed);
    let n=transition(h,opponents[z],actions[i],r);
    const immediate=-evaluate(n),cost=switchCost(h,n,actions[i]);let futureCost=0;
    for(let t=0;t<2&&n.winner===null;t++){
     const prior=n,reply=t===0?quickAction(n,1):chooseCpu(n);
     n=transition(n,t===0?quickAction(n,0):opposingDamageAction(n),reply,r);
     if(reply.kind==='switch'&&n.winner===null)futureCost+=.5*switchCost(prior,n,reply);
    }
    batch[i]+=(.40*immediate-.60*evaluate(n)-cost-futureCost)*weights[z]/sum;
   }
   if(!complete)break;
  }
  if(!complete)break;
  batch.forEach((v,i)=>scores[i]+=v);rounds++;
 }
 if(!rounds)return chooseCpu(states[0]??s);
 return actions[scores.indexOf(Math.max(...scores))];
}
