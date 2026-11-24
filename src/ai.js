// Simultaneous-action search for offline analysis and live CPU battles.
import {roster,struggle} from './data.js';
import {makeTeam,resolveSequence,canUseMove,isTrapped,damage,hitLimit,rankedStat} from './battle.js';
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
 const sent={...a,lockedMove:null};const attack=bestHit(s,sent,d)/d.maxHp,defense=bestHit(s,d,sent)/a.maxHp;
 return Math.min(1,attack)-Math.min(1,defense)+.35*a.hp/a.maxHp+(rankedStat(a,5)>rankedStat(d,5)?.12:0)+(a.id==='margo'&&!s.psychicTerrain?.22:0)-(a.id==='ema'&&s.teams[side].filter(c=>c.hp>0).length>1?.2:0);
}
export function chooseReserve(s,side,list){return list.reduce((best,i)=>best==null||reserveValue(s,side,i)>reserveValue(s,side,best)?i:best,null)}
export function initialState(a,b){
 const s={teams:[makeTeam(a),makeTeam(b)],active:[0,0],turn:1,logs:[],winner:null,psychicTerrain:0,gravity:0};
 for(const side of [0,1]){const c=active(s,side);if(c.ability==='ふゆう')c.revealedAbility=true;if(!s.psychicTerrain&&c.ability==='サイコメイカー'){c.revealedAbility=true;s.psychicTerrain=c.item==='terrain'?8:5}}
 return s;
}
export function transition(s,a,b,rng){
 const steps=resolveSequence(s,a,rng,{opponentAction:b,chooseSwitch:chooseReserve,fast:true});return steps.at(-1)?.state??s;
}
function material(s,side){
 return s.teams[side].reduce((v,c,i)=>{
 if(c.hp<=0)return v;
 const on=i===s.active[side],fraction=c.hp/c.maxHp;
 return v+0.65+fraction+(c.item==='sash'&&c.hp===c.maxHp?.12:0)+(c.ability==='しにもどり'&&!c.revivalUsed?.24:0)-(c.status==='burn'?.10:0)-(c.status==='sleep'?.13:0)-(on&&c.confusion>0?.07:0)+(on?.085*(c.stages[1]+c.stages[3])+.035*(c.stages[2]+c.stages[4]+c.stages[5])+.045*(c.critRank??0):0);
 },0);
}
export function evaluate(s){
 if(s.winner!==null)return s.winner===0?1:-1;
 const a=active(s,0),b=active(s,1);
 let v=material(s,0)-material(s,1);
 if(a.hp>0&&b.hp>0){
  v+=.17*(Math.min(1,bestHit(s,a,b)/b.hp)-Math.min(1,bestHit(s,b,a)/a.hp));
  if(s.gravity&&s.psychicTerrain){v+=.035*(s.teams[0].some(c=>c.hp>0&&c.id==='hanna')-s.teams[1].some(c=>c.hp>0&&c.id==='hanna'))}
 }
 return Math.tanh(v/2.5);
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
    if(m.confuse&&!d.confusion&&s.teams[side].some((c,i)=>i!==s.active[side]&&c.hp>0))v=.45;
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
 return teams[draw([.48,.16,.16,.12,.08],rng)].slice();
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
export function liveCpuAction(s,{budget=850,rng=Math.random}={}){
 const states=cpuView(s),deadline=Date.now()+budget;
 const actions=legalActions(s,1);
 if(!actions.length)return null;
 let probs=actions.map(()=>0),count=0;
 // Start with a complete sweep of possible lineups; then extend the lookahead.
 const shuffled=states.map(state=>({state,key:rng()})).sort((a,b)=>a.key-b.key).map(x=>x.state);
 for(const depth of [1,2,3]){
  const next=actions.map(()=>0);let n=0;
  for(const state of shuffled){
   try{
    const result=search(state,{depth,samples:depth===1?4:2,rolloutTurns:1,iterations:64,rng,deadline});
    if(!result.col.length)continue;
    result.col.forEach((p,i)=>next[i]+=p);n++;
   }catch(e){if(e.message!=='search deadline')throw e;break;}
  }
  if(n===shuffled.length||!count&&n){probs=next;count=n}
  if(n<shuffled.length||Date.now()>deadline)break;
 }
 if(!count)return quickAction(states[0]??s,1);
 return actions[draw(probs.map(x=>x/count),rng)];
}
