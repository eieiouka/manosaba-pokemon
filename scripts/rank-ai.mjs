import {allSelections,rankSelections} from '../src/ai.js';
const args=process.argv.slice(2);
const num=(key,fallback)=>{const index=args.indexOf(key);if(index<0)return fallback;const value=Number(args[index+1]);if(!Number.isInteger(value)||value<0)throw Error('Invalid '+key);return value};
const depth=num('--depth',1),samples=num('--samples',2),repeats=num('--repeats',1),rolloutTurns=num('--rollout',1),top=num('--top',120),opponentCount=num('--opponents',120);
const quick=args.includes('--quick');
if(depth<1||samples<1||repeats<1||top<1||opponentCount<1)throw Error('Positive depth, samples, repeats, top and opponents required');
const all=allSelections();
const report=(i,n,row)=>console.error(i+'/'+n,row.team.join('/'),(row.rate*100).toFixed(1)+'%');
let candidates=all;
if(top<all.length){console.error('Screening all 120 selections using the fast tactical policy');candidates=rankSelections({quick:true,onProgress:(i,n)=>{if(i%20===0)console.error(i+'/'+n)}}).slice(0,top).map(x=>x.team)}
const opponents=opponentCount>=all.length?all:Array.from({length:opponentCount},(_,i)=>all[Math.floor(i*all.length/opponentCount)]);
console.error('Running '+candidates.length+' candidates vs '+opponents.length+' opponents; '+repeats+' repeats, '+(quick?'quick':'depth='+depth+' samples='+samples+' rollout='+rolloutTurns));
const results=rankSelections({candidates,opponents,repeats,depth,samples,rolloutTurns,quick,onProgress:report});
console.log(JSON.stringify(results,null,2));
