import {roster,effectiveness} from './data.js';
export const makeTeam=ids=>ids.map(id=>{const c=roster.find(x=>x.id===id);const stats=c.base.map((v,i)=>Math.floor((2*v+31)*.5)+(i===0?60:5));return {...c,stats,hp:stats[0],maxHp:stats[0]}});
export function damage(a,d,m,random=1){const e=effectiveness(m.type,d.types);if(!e)return 0;const i=m.category==='physical'?1:3;return Math.max(1,Math.floor(Math.floor(Math.floor(22*m.power*a.stats[i]/d.stats[i+1])/50+2)*(a.types.includes(m.type)?1.5:1)*e*random))}
export function start(ids){const enemy=roster.map(c=>c.id).sort(()=>Math.random()-.5).slice(0,3);return {teams:[makeTeam(ids),makeTeam(enemy)],active:[0,0],turn:1,logs:['バトル開始！'],winner:null}}
export function chooseCpu(s){const a=s.teams[1][s.active[1]],d=s.teams[0][s.active[0]];return {kind:'move',index:a.moves.map((m,i)=>({i,score:damage(a,d,m)*m.accuracy/100})).sort((a,b)=>b.score-a.score)[0].i}}
export function resolve(s,action,rng=Math.random){
  if(s.winner!==null)return s;
  const n=structuredClone(s), log=[];
  const alive=side=>n.teams[side].some(c=>c.hp>0);
  const current=side=>n.teams[side][n.active[side]];
  if(current(0).hp===0){if(action.kind!=='switch'||!n.teams[0][action.index]?.hp)return s;n.active[0]=action.index;return {...n,logs:[...n.logs,`いけ！ ${current(0).name}！`]}}
  const cpu=chooseCpu(n), actions=[action,cpu];
  if(action.kind==='switch'&&(!n.teams[0][action.index]?.hp||action.index===n.active[0]))return s;
  const priority=(side)=>actions[side].kind==='switch'?6:current(side).moves[actions[side].index]?.name==='かげうち'?1:0;
  const order=[0,1].sort((a,b)=>priority(b)-priority(a)||current(b).stats[5]-current(a).stats[5]||(rng()>.5?1:-1));
  for(const side of order){
    const a=current(side),d=current(1-side),act=actions[side];
    if(a.hp<=0||d.hp<=0)continue;
    if(act.kind==='switch'){n.active[side]=act.index;log.push(`${a.name}を戻した！ ${current(side).name}を繰り出した！`);continue}
    const m=a.moves[act.index];if(!m)continue;
    log.push(`${a.name}の ${m.name}！`);
    if(rng()*100>=m.accuracy){log.push('しかし、攻撃は外れた！');continue}
    const e=effectiveness(m.type,d.types), hit=damage(a,d,m,.85+rng()*.15);
    d.hp=Math.max(0,d.hp-hit);
    log.push(e===0?'効果がないようだ…':e>1?'効果は抜群だ！':e<1?'効果はいまひとつ…':`${d.short}に ${hit} ダメージ！`);
    if(!d.hp)log.push(`${d.name}は倒れた！`);
  }
  if(!alive(0)||!alive(1))n.winner=alive(0)?0:1;
  else if(!current(1).hp){n.active[1]=n.teams[1].findIndex(c=>c.hp>0);log.push(`CPUは ${current(1).name}を繰り出した！`)}
  return {...n,turn:n.turn+1,logs:[...n.logs,...log]};
}
