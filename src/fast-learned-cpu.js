// Fast live policy using the 2-million-game Rust checkpoint.
// Only public team-preview information and previously seen opponents are used.
import {cpuView,legalActions,quickAction,transition,seededRandom} from './ai.js';
import {learnedValue,validateModel} from './learned-value.js';
import checkpoint from './cpu-model.json' with {type:'json'};
const model=validateModel(checkpoint);
export function fastLearnedCpu(s,{budget=45,maxRounds=6,rng=Math.random}={}){
 const actions=legalActions(s,1);
 if(actions.length<=1)return actions[0];
 const deadline=performance.now()+budget;
 const hypotheses=cpuView(s);
 if(!hypotheses.length)return undefined;
 // Fisher-Yates: sample unseen reserve combinations without consulting actual hidden slots.
 for(let i=hypotheses.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[hypotheses[i],hypotheses[j]]=[hypotheses[j],hypotheses[i]]}
 const totals=actions.map(()=>0);let rounds=0;
 for(let j=0;j<maxRounds;j++){
  if(j&&performance.now()>=deadline)break;
  const h=hypotheses[j%hypotheses.length],opponent=quickAction(h,0);
  if(!opponent)break;
  const seed=Math.floor(rng()*4294967296);
  const scores=actions.map(a=>-learnedValue(transition(h,opponent,a,seededRandom(seed)),model));
  scores.forEach((v,i)=>totals[i]+=v);rounds++;
 }
 if(!rounds)return quickAction(hypotheses[0],1);
 return actions[totals.indexOf(Math.max(...totals))];
}
