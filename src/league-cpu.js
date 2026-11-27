// Adaptive live search. Preview hypotheses never use unrevealed selections.
import {cpuView,legalActions,rankActions,quickAction,transition,seededRandom} from './ai.js';
import {learnedValue,validateModel} from './learned-value.js';
import checkpoint from './league-champion.json' with {type:'json'};
const model=validateModel(checkpoint);
const score=s=>-learnedValue(s,model);
const seedOf=rng=>Math.floor(rng()*4294967296);
export function fastLearnedCpu(s,{budget=45,maxRounds=6,rng=Math.random,recommendations=false}={}){
 const actions=legalActions(s,1);
 const single=a=>recommendations?(a?[a]:[]):a;
 const near=order=>recommendations?order.filter(x=>order[0].v-x.v<=.05).map(x=>x.a):order[0].a;
 if(actions.length<=1)return single(actions[0]);
 const deadline=performance.now()+budget, hypotheses=cpuView(s);
 if(!hypotheses.length)return single(undefined);
 for(let i=hypotheses.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[hypotheses[i],hypotheses[j]]=[hypotheses[j],hypotheses[i]]}
 const totals=actions.map(()=>0),batch=[];
 for(let j=0;j<maxRounds;j++){
  if(j&&performance.now()>=deadline)break;
  const h=hypotheses[j%hypotheses.length],foes=rankActions(h,0).slice(0,2).map(x=>x.action);
  if(!foes.length)break;
  const weights=foes.length===1?[1]:[.65,.35],seed=seedOf(rng);
  actions.forEach((a,i)=>{for(let z=0;z<foes.length;z++)totals[i]+=weights[z]*score(transition(h,foes[z],a,seededRandom(seed)))});
  batch.push({h,foes,weights,seed});
 }
 if(!batch.length)return single(quickAction(hypotheses[0],1));
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
    if(n.winner===null){const a=quickAction(n,0),b=quickAction(n,1);if(a&&b)n=transition(n,a,b,seededRandom((seed^0x785ab)>>>0))}
    refined[i]+=weights[z]*score(n);
   }
  }rounds++;
 }
 if(!rounds)return near(order);
 const reranked=order.slice(0,count).map((x,i)=>({...x,v:.45*x.v+.55*refined[i]/rounds})).sort((a,b)=>b.v-a.v);
 return near(reranked);
}
