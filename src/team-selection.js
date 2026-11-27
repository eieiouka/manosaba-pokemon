// Generation-15 empirical 3v3 payoff matrix, base-5 packed (3 scores/byte).
import {roster} from './data.js';
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
export function selectionMix(matrix,own,opponent,rounds=32){
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
 return a.map((idx,i)=>({team:triples[idx].map(v=>ids[v]),weight:ac[i]/rounds,uniformScore:ar[i],expectedScore:.25*ar[i]+.75*as[i]/rounds})).filter(x=>x.weight>0).sort((x,y)=>y.weight-x.weight);
}
export async function chooseOptimalTeam(own,opponent,rng=Math.random){
 if(roster.map(c=>c.id).join()!==ids.join())return null;
 const mix=selectionMix(await preloadSelection(),own,opponent);if(!mix?.length)return null;
 let u=rng();for(const x of mix){u-=x.weight;if(u<0)return x.team}return mix.at(-1).team;
}

export async function recommendTeam(own,opponent){
 if(roster.map(c=>c.id).join()!==ids.join())return null;
 return selectionMix(await preloadSelection(),own,opponent)?.[0]??null;
}
