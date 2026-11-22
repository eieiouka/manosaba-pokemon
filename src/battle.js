import {roster,effectiveness} from './data.js';
export const makeTeam=ids=>ids.map(id=>{const c=roster.find(x=>x.id===id);const stats=c.base.map((v,i)=>Math.floor((2*v+31)*.5)+(i===0?60:5));return {...c,stats,hp:stats[0],maxHp:stats[0]}});
export function damage(a,d,m,random=1){const e=effectiveness(m.type,d.types);if(!e)return 0;const i=m.category==='physical'?1:3;return Math.max(1,Math.floor(Math.floor(Math.floor(22*m.power*a.stats[i]/d.stats[i+1])/50+2)*(a.types.includes(m.type)?1.5:1)*e*random))}
export function start(ids){const enemy=roster.map(c=>c.id).sort(()=>Math.random()-.5).slice(0,3);return {teams:[makeTeam(ids),makeTeam(enemy)],active:[0,0],turn:1,logs:['バトル開始！'],winner:null}}
export function chooseCpu(s){const a=s.teams[1][s.active[1]],d=s.teams[0][s.active[0]];return {kind:'move',index:a.moves.map((m,i)=>({i,score:damage(a,d,m)*m.accuracy/100})).sort((a,b)=>b.score-a.score)[0].i}}
// Each step contains a complete battle snapshot and a display duration.
export function resolveSequence(s,action,rng=Math.random){
  if(s.winner!==null)return [];
  const n=structuredClone(s),steps=[];
  const alive=side=>n.teams[side].some(c=>c.hp>0);
  const current=side=>n.teams[side][n.active[side]];
  const emit=(message,delay=850)=>{if(message)n.logs.push(message);steps.push({state:structuredClone(n),delay})};
  if(current(0).hp===0){
    if(action.kind!=='switch'||!n.teams[0][action.index]?.hp)return [];
    n.active[0]=action.index;
    emit(`いけ！ ${current(0).name}！`);
    return steps;
  }
  if(action.kind==='switch'&&(!n.teams[0][action.index]?.hp||action.index===n.active[0]))return [];
  if(action.kind==='move'&&!current(0).moves[action.index])return [];
  const actions=[action,chooseCpu(n)];
  const priority=side=>actions[side].kind==='switch'?6:current(side).moves[actions[side].index]?.name==='かげうち'?1:0;
  const difference=priority(0)-priority(1)||current(0).stats[5]-current(1).stats[5];
  const order=difference>0?[0,1]:difference<0?[1,0]:rng()<.5?[0,1]:[1,0];
  for(const side of order){
    const a=current(side),d=current(1-side),act=actions[side];
    if(a.hp<=0||d.hp<=0)continue;
    if(act.kind==='switch'){
      n.active[side]=act.index;
      emit(`${a.name}を戻した！ ${current(side).name}を繰り出した！`);
      continue;
    }
    const m=a.moves[act.index];if(!m)continue;
    emit(`${side===1?'相手の':''}${a.name}の${m.name}！`,850);
    const e=effectiveness(m.type,d.types);
    if(e===0){emit(`${side===0?'相手の':''}${d.name}には効果がないようだ…`);continue}
    if(rng()*100>=m.accuracy){emit('しかし外れてしまった！');continue}
    d.hp=Math.max(0,d.hp-damage(a,d,m,.85+rng()*.15));
    emit(null,400);
    if(e>=4)emit('効果はかなり抜群だ！');
    else if(e>1)emit('効果は抜群だ！');
    else if(e<=.25)emit('効果はかなりいまひとつだ！');
    else if(e<1)emit('効果はいまひとつだ！');
    if(!d.hp){d.fainted=true;emit(`${side===0?'相手の':''}${d.name}は倒れた！`,side===0?2300:1100)}
  }
  n.turn++;
  if(!alive(0)||!alive(1)){n.winner=alive(0)?0:1;emit(null,0)}
  else if(!current(1).hp){
    n.active[1]=n.teams[1].findIndex(c=>c.hp>0);
    emit(`CPUは ${current(1).name}を繰り出した！`);
  }else emit(null,0);
  return steps;
}
export function resolve(s,action,rng=Math.random){return resolveSequence(s,action,rng).at(-1)?.state??s}
