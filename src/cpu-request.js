import {fastLearnedCpu} from './league-cpu.js';

// Never leave the UI waiting for a worker that has failed to start or timed out.
// The tiny local search uses the same rules, hidden-team hypotheses and evaluator.
export function thinkCpu(state,recommendations=false,onProgress,options={}){
 const {signal,createWorker=()=>new Worker(new URL('./cpu.worker.js',import.meta.url),{type:'module'}),localSearch=fastLearnedCpu,firstMs=250,timeoutMs=recommendations?2500:700}=options;
 return new Promise(resolve=>{
  let worker,timer,firstTimer,latest,done=false,localTried=false;
  const valid=actions=>Array.isArray(actions)&&actions.length>0;
  const tag=(actions,provisional,limited=false)=>actions.map(a=>({...a,detail:{...a.detail,provisional,limited}}));
  const local=()=>{
   if(done||latest||localTried||!recommendations)return;
   localTried=true;
   try{
    const result=localSearch(state,{budget:20,maxRounds:1,recommendations:true});
    if(valid(result)){latest=tag(result,true);onProgress?.(latest)}
   }catch{/* The UI still has its tactical fallback. */}
  };
  const cleanup=()=>{clearTimeout(timer);clearTimeout(firstTimer);worker?.terminate();signal?.removeEventListener('abort',abort)};
  const abort=()=>{if(done)return;done=true;cleanup();resolve(undefined)};
  const finish=action=>{
   if(done)return;
   if(recommendations&&!valid(action)){local();action=latest?tag(latest,false,true):undefined}
   done=true;cleanup();resolve(action);
  };
  if(signal?.aborted){abort();return}
  signal?.addEventListener('abort',abort,{once:true});
  try{
   worker=createWorker();
   worker.onmessage=e=>{
    if(done)return;
    if(recommendations&&e.data?.partial===true){
     if(valid(e.data.actions)){latest=e.data.actions;clearTimeout(firstTimer);onProgress?.(latest)}
     return;
    }
    finish(e.data);
   };
   worker.onerror=()=>finish(undefined);
   worker.onmessageerror=()=>finish(undefined);
   if(recommendations)firstTimer=setTimeout(local,firstMs);
   timer=setTimeout(()=>finish(undefined),timeoutMs);
   worker.postMessage(recommendations?{state,recommendations:true}:state);
  }catch{finish(undefined)}
 });
}
