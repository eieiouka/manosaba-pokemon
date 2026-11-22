import {roster,effectiveness} from './data.js';
export const makeTeam=ids=>ids.map(id=>{const c=roster.find(x=>x.id===id);const stats=c.base.map((v,i)=>Math.floor((2*v+31)*.5)+(i===0?60:5));return {...c,stats,stages:[0,0,0,0,0,0],hp:stats[0],maxHp:stats[0]}});
// Level 50 damage calculation, with integer rounding at each stage.
export function rankedStat(c,index,ignore=false){
 const stage=ignore?0:Math.max(-6,Math.min(6,Math.trunc(c.stages?.[index]??0)));
 return Math.max(1,Math.floor(c.stats[index]*(stage>=0?2+stage:2)/(stage>=0?2:2-stage)));
}
const roundHalfDown=(value,numerator,denominator)=>Math.floor((value*numerator+Math.floor((denominator-1)/2))/denominator);
export function damage(a,d,m,roll=100,critical=false){
 const e=effectiveness(m.type,d.types);
 if(!e)return 0;
 const i=m.category==='physical'?1:3;
 const attack=rankedStat(a,i,critical&&(a.stages?.[i]??0)<0);
 const defense=rankedStat(d,i+1,critical&&(d.stages?.[i+1]??0)>0);
 let value=Math.floor(Math.floor(22*m.power*attack/defense)/50)+2;
 if(critical)value=roundHalfDown(value,3,2);
 value=Math.floor(value*roll/100);
 if(a.types.includes(m.type))value=roundHalfDown(value,3,2);
 value=Math.floor(value*e);
 return Math.max(1,value);
}
const criticalChance=m=>[1/24,1/8,1/2,1][Math.max(0,Math.min(3,m.critStage??(m.name==='サイコカッター'?1:0)))];
export function start(ids){const enemy=roster.map(c=>c.id).sort(()=>Math.random()-.5).slice(0,3);return {teams:[makeTeam(ids),makeTeam(enemy)],active:[0,0],turn:1,logs:['バトル開始！'],winner:null}}
export function chooseCpu(s){const a=s.teams[1][s.active[1]],d=s.teams[0][s.active[0]];return {kind:'move',index:a.moves.map((m,i)=>({i,score:Array.from({length:16},(_,i)=>damage(a,d,m,85+i)).reduce((sum,v)=>sum+v,0)/16*m.accuracy/100})).sort((a,b)=>b.score-a.score)[0].i}}
// Attack sound mapping. Individual moves can override the default with sound.
const attackSounds={
 'のしかかり':'hit','シャドーボール':'explosion','かえんほうしゃ':'explosion','ムーンフォース':'explosion',
 'サイコキネシス':'explosion','マジカルシャイン':'explosion','10まんボルト':'electrical_shot','れいとうビーム':'gun_shot',
 'エアスラッシュ':'cut','ぼうふう':'cut','ねっぷう':'explosion','エナジーボール':'explosion',
 'サイコカッター':'cut','インファイト':'hit','アイアンヘッド':'hit',
 'かげうち':'cut','かみくだく':'hit','じゃれつく':'hit','どくづき':'cut',
 'ラスターカノン':'gun_shot','あくのはどう':'explosion','だいちのちから':'explosion'
};
const attackSound=m=>m.sound??attackSounds[m.name]??(m.type==='electric'?'electrical_shot':m.category==='physical'?'hit':'explosion');
// Each step contains a complete battle snapshot and a display duration.
export function resolveSequence(s,action,rng=Math.random){
  if(s.winner!==null)return [];
  const n=structuredClone(s),steps=[];
  const alive=side=>n.teams[side].some(c=>c.hp>0);
  const current=side=>n.teams[side][n.active[side]];
  const emit=(message,delay=850,sound=null)=>{if(message)n.logs.push(message);steps.push({state:structuredClone(n),delay,sound})};
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
  const difference=priority(0)-priority(1)||rankedStat(current(0),5)-rankedStat(current(1),5);
  const order=difference>0?[0,1]:difference<0?[1,0]:rng()<.5?[0,1]:[1,0];
  for(const side of order){
    const a=current(side),d=current(1-side),act=actions[side];
    if(a.hp<=0||d.hp<=0)continue;
    if(act.kind==='switch'){
      a.stages=[0,0,0,0,0,0];
      n.active[side]=act.index;
      emit(`${a.name}を戻した！ ${current(side).name}を繰り出した！`);
      continue;
    }
    const m=a.moves[act.index];if(!m)continue;
    emit(`${side===1?'相手の':''}${a.name}の${m.name}！`,850);
    const e=effectiveness(m.type,d.types);
    if(e===0){emit(`${side===0?'相手の':''}${d.name}には効果がないようだ…`);continue}
    if(rng()*100>=m.accuracy){emit('しかし外れてしまった！');continue}
    const critical=rng()<criticalChance(m);
    const roll=85+Math.min(15,Math.floor(rng()*16));
    d.hp=Math.max(0,d.hp-damage(a,d,m,roll,critical));
    emit(null,400,attackSound(m));
    if(critical)emit('急所に当たった！');
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
