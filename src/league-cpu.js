// Adaptive live search. Preview hypotheses never use unrevealed selections.
import {cpuView,legalActions,rankActions,quickAction,transition,seededRandom} from './ai.js';
import {struggle,roster} from './data.js';
import {learnedValue,validateModel,features} from './learned-value.js';
import checkpoint from './league-champion.json' with {type:'json'};
const model=validateModel(checkpoint);
const score=s=>-learnedValue(s,model);
const seedOf=rng=>Math.floor(rng()*4294967296);
export function fastLearnedCpu(s,{budget=45,maxRounds=6,rng=Math.random,recommendations=false}={}){
 const actions=legalActions(s,1);
 const single=a=>recommendations?(a?[{...a,detail:{method:actions.length===1?'only':'quick'}}]:[]):a;
 const near=(order,depth=1)=>recommendations?order.filter(x=>order[0].v-x.v<=.05).map(x=>({...x.a,detail:{method:'learned',value:x.v,gap:order[0].v-x.v,depth,samples:batch.length,...outcomes[x.i],prediction:topNames(opponentPredictions),nextPlan:topNames(plans[x.i]),hypotheses:teamSummary(),branches:branchSummary(x.i),drivers:driverSummary(x.i),alternatives:order.filter(y=>y.i!==x.i).map(y=>({label:actionName(s,1,y.a),value:y.v})),alternative:(()=>{const other=order.find(y=>y.i!==x.i);return other?{label:actionName(s,1,other.a),ownHp:outcomes[other.i].ownHp,foeHp:outcomes[other.i].foeHp,ownLoss:outcomes[other.i].ownLoss}:null})()}})):order[0].a;
 if(actions.length<=1)return single(actions[0]);
 const deadline=performance.now()+budget, hypotheses=cpuView(s);
 if(!hypotheses.length)return single(undefined);
 for(let i=hypotheses.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[hypotheses[i],hypotheses[j]]=[hypotheses[j],hypotheses[i]]}
 const totals=actions.map(()=>0),batch=[],outcomes=actions.map(()=>({ownHp:0,foeHp:0,ownLoss:0,foeLoss:0,boost:0}));
 const opponentPredictions={},plans=actions.map(()=>({})),scenarios=actions.map(()=>new Map()),drivers=actions.map(()=>({})),teamCounts=new Map();
 const known=s.teams[0].filter((c,i)=>c.seen||i===s.active[0]).map(c=>c.id);
 const teamSummary=()=>({known:known.map(id=>roster.find(c=>c.id===id)?.short??id),possible:hypotheses.length,sampled:new Set(batch.map(x=>x.h)).size,teams:[...teamCounts].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([team,count])=>({team,count}))});
 const branchSummary=i=>[...scenarios[i].values()].sort((a,b)=>b.weight-a.weight).slice(0,4).map(x=>({...x,ownHp:x.ownHp/x.weight,foeHp:x.foeHp/x.weight,ownLoss:x.ownLoss/x.weight,foeLoss:x.foeLoss/x.weight,value:x.value/x.weight,examples:[...x.examples.entries()].sort((a,b)=>b[1]-a[1]).slice(0,2).map(a=>a[0])}));
 const driverSummary=i=>Object.entries(drivers[i]).map(([label,v])=>({label,v:v/batch.length})).sort((a,b)=>Math.abs(b.v)-Math.abs(a.v)).slice(0,4);
 const group=k=>{if(!k)return '総合的な盤面評価';const n=roster.length,base=1,synergy=base+n*12,matchup=synergy+n*n,end=matchup+n*n;if(k<synergy){const j=(k-base)%12;return ['残存キャラ','HP','場にいるキャラ','攻撃・特攻の積み','防御・特防の積み','素早さ','回避率','状態異常','持ち物','身代わり','挑発・混乱など','残りPP'][j]}if(k<matchup)return '控えとの組み合わせ';if(k<end)return '現在の対面';return ['残存人数','チームHP','サイコフィールド','トリックルーム','眠り','やけど','猛毒','急所ランク'][k-end]??'盤面';};
 const groups=model.weights.map((_,k)=>group(k));
 function trace(i,h,next,foe,weight,baseFeatures){
  const label=actionName(h,0,foe,false),map=scenarios[i];let x=map.get(label);
  if(!x){x={label,weight:0,ownHp:0,foeHp:0,ownLoss:0,foeLoss:0,value:0,examples:new Map(),followup:null};map.set(label,x)}
  x.weight+=weight;x.ownHp+=weight*(hp(next.teams[1])-hp(h.teams[1]));x.foeHp+=weight*(hp(h.teams[0])-hp(next.teams[0]));x.ownLoss+=weight*(alive(h.teams[1])-alive(next.teams[1]));x.foeLoss+=weight*(alive(h.teams[0])-alive(next.teams[0]));x.value+=weight*score(next);
  const notes=[];for(const side of [1,0])for(const before of h.teams[side]){const after=next.teams[side].find(c=>c.id===before.id);if(!after)continue;const name=(side===0?'相手の':'自分の')+before.short;
    if(before.hp>0&&!after.hp)notes.push(name+'が倒れる');else if(after.hp-before.hp>before.maxHp*.07)notes.push(name+'が回復');else if(before.hp-after.hp>before.maxHp*.12)notes.push(name+'のHPが減る');
    if(after.hp>0){const names=['HP','攻撃','防御','特攻','特防','素早さ'];after.stages.forEach((v,k)=>{if(k&&v!==before.stages[k])notes.push(name+'の'+names[k]+(v>before.stages[k]?'上昇':'低下'))});if((after.evasionStage??0)>(before.evasionStage??0))notes.push(name+'の回避率上昇');if((after.critRank??0)>(before.critRank??0))notes.push(name+'の急所ランク上昇');if(after.status&&after.status!==before.status)notes.push(name+'が状態異常になる');if((after.subHp??0)>0&&!before.subHp)notes.push(name+'が身代わりを出す');}
  }if(next.winner!==null)notes.push(next.winner===1?'このターンで勝利':'このターンで敗北');
  if(x.followup===null&&next.winner===null){const follow=quickAction(next,1);if(follow)x.followup=next.teams[1][next.active[1]].short+'の次の行動候補：'+actionName(next,1,follow);}
  if(notes.length){const key=notes.slice(0,4).join('、');x.examples.set(key,(x.examples.get(key)??0)+weight)}
  if(next.winner===null){const f=features(next);for(let k=0;k<f.length;k++){const g=groups[k];drivers[i][g]=(drivers[i][g]??0)-weight*(f[k]-baseFeatures[k])*model.weights[k];}}
 }
 const actionName=(state,side,a,hideSwitch=false)=>a.kind==='switch'?(hideSwitch?'控えへの交代':'交代：'+state.teams[side][a.index]?.name):(a.index<0?struggle:state.teams[side][state.active[side]].moves[a.index])?.name??'技';
 const add=(map,label,weight)=>{map[label]=(map[label]??0)+weight};
 const topNames=map=>Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,2).map(x=>x[0]);
 const hp=team=>team.reduce((sum,c)=>sum+c.hp/c.maxHp,0);
 const alive=team=>team.filter(c=>c.hp>0).length;
 for(let j=0;j<maxRounds;j++){
  if(j&&performance.now()>=deadline)break;
  const h=hypotheses[j%hypotheses.length],foes=rankActions(h,0).slice(0,2).map(x=>x.action);
  if(!foes.length)break;
  const weights=foes.length===1?[1]:[.65,.35],seed=seedOf(rng);
  const baseFeatures=recommendations?features(h):null;
  if(recommendations){foes.forEach((f,z)=>add(opponentPredictions,actionName(h,0,f,true),weights[z]));const key=h.teams[0].filter(c=>!known.includes(c.id)).map(c=>c.short).sort().join('・')||'未判明なし';teamCounts.set(key,(teamCounts.get(key)??0)+1);}
  actions.forEach((a,i)=>{for(let z=0;z<foes.length;z++){
   const next=transition(h,foes[z],a,seededRandom(seed)),weight=weights[z];totals[i]+=weight*score(next);
   if(recommendations){trace(i,h,next,foes[z],weight,baseFeatures);const o=outcomes[i];o.ownHp+=weight*(hp(next.teams[1])-hp(h.teams[1]));o.foeHp+=weight*(hp(h.teams[0])-hp(next.teams[0]));o.ownLoss+=weight*(alive(h.teams[1])-alive(next.teams[1]));o.foeLoss+=weight*(alive(h.teams[0])-alive(next.teams[0]));const before=h.teams[1][h.active[1]],after=next.teams[1].find(c=>c.id===before.id);if(after)o.boost+=weight*after.stages.reduce((sum,v,k)=>sum+Math.max(0,v-before.stages[k]),0);}
  }});
  batch.push({h,foes,weights,seed});
 }
 if(!batch.length)return single(quickAction(hypotheses[0],1));
 if(recommendations)for(const o of outcomes)for(const key of Object.keys(o))o[key]/=batch.length;
 const order=actions.map((a,i)=>({a,i,v:totals[i]/batch.length})).sort((a,b)=>b.v-a.v);
 // Tactical ties / switching: rerank two action candidates with a two-turn rollout.
 if(order[0].v-order[1].v>=.16&&order[0].a.kind!=='switch')return near(order);
 const count=recommendations?Math.max(2,order.filter(x=>order[0].v-x.v<=.05).length):2;
 const refined=Array(count).fill(0);let rounds=0;
 for(const {h,foes,weights,seed} of batch){
  if(performance.now()>=deadline)break;
  for(let i=0;i<count;i++){
   for(let z=0;z<foes.length;z++){
    const rand=seededRandom((seed^0x84291)>>>0);let n=transition(h,foes[z],order[i].a,rand);
    if(n.winner===null){const a=quickAction(n,0),b=quickAction(n,1);if(a&&b){if(recommendations)add(plans[order[i].i],actionName(n,1,b),weights[z]);n=transition(n,a,b,seededRandom((seed^0x785ab)>>>0))}}
    refined[i]+=weights[z]*score(n);
   }
  }rounds++;
 }
 if(!rounds)return near(order);
 const reranked=order.slice(0,count).map((x,i)=>({...x,v:.45*x.v+.55*refined[i]/rounds})).sort((a,b)=>b.v-a.v);
 return near(reranked,2);
}
