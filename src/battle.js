import {roster,effectiveness,items} from './data.js';
export const makeTeam=ids=>ids.map(id=>{const c=roster.find(x=>x.id===id);const stats=c.base.map((v,i)=>Math.floor((Math.floor((2*v+31)*.5)+(i===0?60:5)+(c.points?.[i]??0))*(c.nature?.[i]??100)/100));return {...c,stats,stages:[0,0,0,0,0,0],hp:stats[0],maxHp:stats[0],lockedMove:null,initialItem:c.item??null,revealedItem:null,revealedAbility:false}});
// Level 50 damage calculation, with integer rounding at each stage.
export function rankedStat(c,index,ignore=false){
 const stage=ignore?0:Math.max(-6,Math.min(6,Math.trunc(c.stages?.[index]??0)));
 const value=Math.max(1,Math.floor(c.stats[index]*(stage>=0?2+stage:2)/(stage>=0?2:2-stage)))*(index===1&&c.ability==='ちからもち'?2:1);
 return items[c.item]?.stat===index?Math.floor(value*1.5):value;
}
const roundHalfDown=(value,numerator,denominator)=>Math.floor((value*numerator+Math.floor((denominator-1)/2))/denominator);
export function damage(a,d,m,roll=100,critical=false,second=false){
 const e=effectiveness(m.type,d.types);
 if(!e)return 0;
 const i=m.category==='physical'?1:3;
 const attack=rankedStat(a,i,critical&&(a.stages?.[i]??0)<0);
 const defense=rankedStat(d,i+1,critical&&(d.stages?.[i+1]??0)>0);
 let value=Math.floor(Math.floor(22*m.power*(m.latePower&&second?2:1)*attack/defense)/50)+2;
 if(critical)value=roundHalfDown(value,3,2);
 value=Math.floor(value*roll/100);
 if(a.types.includes(m.type))value=roundHalfDown(value,3,2);
 value=Math.floor(value*e);
 if(a.item==='orb')value=roundHalfDown(value,5324,4096);
 return Math.max(1,value);
}
const criticalChance=m=>[1/24,1/8,1/2,1][Math.max(0,Math.min(3,m.critStage??(m.name==='サイコカッター'?1:0)))];
export function start(ids){const enemy=roster.map(c=>c.id).sort(()=>Math.random()-.5).slice(0,3);return {teams:[makeTeam(ids),makeTeam(enemy)],active:[0,0],turn:1,logs:['バトル開始！'],winner:null}}
export const hitLimit=(s,m)=>m.multiHit==='fainted'?s.teams.flat().filter(c=>c.hp<=0).length:1;
// Estimate damage against the possible level-50 HP and relevant defense spreads.
export function damageRange(s,a,d,m){
 const e=effectiveness(m.type,d.types);
 const hits=hitLimit(s,m);
 if(m.category==='status')return {label:'変化',min:null,max:null};
 const label=e===0?'無効':e>=4?'かなり抜群':e>1?'抜群':e<=.25?'かなり半減':e<1?'半減':'';
 if(!hits||(m.soundMove&&a.silenced>0))return {label:'失敗',min:0,max:0};
 if(!e)return {label:'無効',min:0,max:0};
 const i=m.category==='physical'?2:4;
 const target=invested=>({...d,item:d.revealedItem===d.item?d.item:null,stats:d.base.map((v,k)=>k===0?v+75+(invested?32:0):k===i?(invested?Math.floor((v+52)*1.1):v+20):v+20)});
 const low=target(true),high=target(false);
 return {label,min:Math.floor(damage(a,low,m,85)*100/low.stats[0]),max:Math.floor(damage(a,high,m,100)*100/high.stats[0])};
}
export const canUseMove=(c,i)=>!!c.moves[i]&&!(c.item==='vest'&&c.moves[i].category==='status')&&(!items[c.item]?.choice||c.lockedMove==null||c.lockedMove===i);
const moveScore=(s,a,d,m)=>m.soundMove&&a.silenced>0?0:Array.from({length:16},(_,i)=>damage(a,d,m,85+i,false,rankedStat(a,5)<rankedStat(d,5))).reduce((sum,v)=>sum+v,0)/16*Array.from({length:hitLimit(s,m)},(_,i)=>(m.accuracy/100)**(i+1)).reduce((sum,v)=>sum+v,0);
export function chooseCpu(s){
 const a=s.teams[1][s.active[1]],d=s.teams[0][s.active[0]];
 const best=a.moves.map((m,i)=>({i,score:moveScore(s,a,d,m)})).filter(({i})=>canUseMove(a,i)).sort((a,b)=>b.score-a.score)[0];
 if(best.score===0&&a.lockedMove!=null){
  const next=s.teams[1].map((c,i)=>({i,score:Math.max(...c.moves.map(m=>moveScore(s,c,d,m)))})).filter(({i,score})=>i!==s.active[1]&&s.teams[1][i].hp>0&&score>0).sort((a,b)=>b.score-a.score)[0];
  if(next)return {kind:'switch',index:next.i};
 }
 return {kind:'move',index:best.i};
}
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
  const emit=(message,delay=850,sound=null,ability=null,itemNotice=null,statNotice=null)=>{if(message)n.logs.push(message);steps.push({state:structuredClone(n),delay,sound,ability,itemNotice,statNotice})};
  const itemNotice=(c,side,item)=>({side,name:c.name,item:items[item].name});
  const name=(c,side)=>`${side===1?'相手の':''}${c.name}`;
  const onEntry=side=>{
    const c=current(side);
    if(c.ability!=='魔女の証'||n.teams[side].filter(x=>x.hp>0).length!==1||c.hp<=0)return;
    c.revealedAbility=true;
    const ability={side,name:c.name,ability:c.ability};
    emit(`${name(c,side)}の魔女の証！`,950,'activate',ability);
    const old=c.stages[3];c.stages[3]=Math.min(6,old+1);
    if(c.stages[3]>old)emit(`${name(c,side)}の特攻が上がった！`,850,'up',ability,null,{side,stat:'特攻',delta:1});
    else emit(`${name(c,side)}の特攻はこれ以上上がらない！`,850,null,ability);
  };
  const faint=(c,side)=>{if(!c.hp&&!c.fainted){c.fainted=true;emit(`${name(c,side)}は倒れた！`,side===1?2300:1100,'faint')}};
  const activateItem=(c,side,item)=>{emit(null,650);c.revealedItem=item;const notice=itemNotice(c,side,item);emit(`${name(c,side)}の${items[item].name}！`,950,'activate',null,notice);return notice};
  const heal=(c,side,amount,item)=>{if(c.hp<=0||c.hp>=c.maxHp)return;const notice=activateItem(c,side,item);if(item==='sitrus')c.item=null;c.hp=Math.min(c.maxHp,c.hp+Math.max(1,amount));emit(`${name(c,side)}は${items[item].name}でHPを回復した！`,850,'heal',null,notice)};
  const berry=(c,side)=>{if(c.item==='sitrus'&&c.hp>0&&c.hp*2<=c.maxHp)heal(c,side,Math.floor(c.maxHp/4),'sitrus')};
  if(current(0).hp===0){
    if(action.kind!=='switch'||!n.teams[0][action.index]?.hp)return [];
    n.active[0]=action.index;
    emit(`いけ！ ${current(0).name}！`,850,'switch');
    onEntry(0);
    return steps;
  }
  if(action.kind==='switch'&&(!n.teams[0][action.index]?.hp||action.index===n.active[0]))return [];
  if(action.kind==='move'&&(!current(0).moves[action.index]||!canUseMove(current(0),action.index)))return [];
  const actions=[action,chooseCpu(n)];
  const priority=side=>actions[side].kind==='switch'?6:(current(side).moves[actions[side].index]?.priority??(current(side).moves[actions[side].index]?.name==='かげうち'?1:0));
  const difference=priority(0)-priority(1)||rankedStat(current(0),5)-rankedStat(current(1),5);
  const order=difference>0?[0,1]:difference<0?[1,0]:rng()<.5?[0,1]:[1,0];
  const flinched=new Set();
  for(const side of order){
    const a=current(side),d=current(1-side),act=actions[side];
    if(a.hp<=0||d.hp<=0)continue;
    if(act.kind==='switch'){
      a.stages=[0,0,0,0,0,0];a.lockedMove=null;a.silenced=0;
      n.active[side]=act.index;
      emit(`${a.name}を戻した！ ${current(side).name}を繰り出した！`,850,'switch');
      onEntry(side);
      continue;
    }
    if(flinched.has(side)){emit(`${name(a,side)}はひるんで動けなかった！`);continue}
    const m=a.moves[act.index];if(!m||!canUseMove(a,act.index))continue;
    if(items[a.item]?.choice)a.lockedMove=act.index;
    emit(`${side===1?'相手の':''}${a.name}の${m.name}！`,850);
    const limit=hitLimit(n,m);
    if(m.soundMove&&a.silenced>0){emit(`${name(a,side)}は音の技が出せない！`);continue}
    if(!limit){emit('しかし上手く決まらなかった！');continue}
    const e=effectiveness(m.type,d.types);
    if(e===0){emit(`${side===0?'相手の':''}${d.name}には効果がないようだ…`);continue}
    let hits=0,totalDamage=0;
    for(let i=0;i<limit&&d.hp>0;i++){
      if(rng()*100>=m.accuracy){if(!hits)emit('しかし外れてしまった！');break}
      const critical=rng()<criticalChance(m);
      const roll=85+Math.min(15,Math.floor(rng()*16));
      const dealt=damage(a,d,m,roll,critical,side===order[1]&&actions[1-side].kind==='move');
      const sash=d.item==='sash'&&d.hp===d.maxHp&&dealt>=d.hp;
      totalDamage+=sash?d.hp-1:Math.min(d.hp,dealt);
      hits++;
      if(sash){
        d.hp=1;
        emit(null,400,attackSound(m));
        const notice=activateItem(d,1-side,'sash');
        d.item=null;
        emit(`${name(d,1-side)}はきあいのタスキで持ちこたえた！`,850,null,null,notice);
        if(critical)emit('急所に当たった！');
      }else{
        d.hp=Math.max(0,d.hp-dealt);
        emit(null,400,attackSound(m));
        if(critical)emit('急所に当たった！');
      }
      berry(d,1-side);
    }
    if(!hits)continue;
    if(e>=4)emit('効果はかなり抜群だ！');
    else if(e>1)emit('効果は抜群だ！');
    else if(e<=.25)emit('効果はかなりいまひとつだ！');
    else if(e<1)emit('効果はいまひとつだ！');
    if(m.multiHit)emit(`${hits}回当たった！`);
    if(d.hp>0&&m.silence){emit(null,650);d.silenced=2;emit(`${name(d,1-side)}は音の技が出せなくなった！`)}
    if(d.hp>0&&m.lowerSpA&&d.stages[3]>-6){emit(null,650);d.stages[3]--;emit(`${name(d,1-side)}の特攻が下がった！`,850,'down',null,null,{side:1-side,stat:'特攻',delta:-1})}
    if(d.hp>0&&m.lowerAtkChance&&d.stages[1]>-6&&rng()*100<m.lowerAtkChance){emit(null,650);d.stages[1]--;emit(`${name(d,1-side)}の攻撃が下がった！`,850,'down',null,null,{side:1-side,stat:'攻撃',delta:-1})}
    if(d.hp>0&&m.flinchChance&&side===order[0]&&actions[1-side].kind==='move'&&rng()*100<m.flinchChance){emit(null,650);flinched.add(1-side);}
    if(m.drain&&totalDamage>0&&a.hp<a.maxHp){emit(null,650);a.hp=Math.min(a.maxHp,a.hp+Math.max(1,Math.floor(totalDamage*m.drain)));emit(`${name(a,side)}はHPを回復した！`,850,'heal')}
    faint(d,1-side);
    if(a.item==='orb'){
      const notice=activateItem(a,side,'orb');
      a.hp=Math.max(0,a.hp-Math.max(1,Math.floor(a.maxHp/10)));
      emit(`${name(a,side)}はいのちのたまでHPが減った！`,850,null,null,notice);
      faint(a,side);
    }
  }
  if(alive(0)&&alive(1)){
    for(const side of order){const c=current(side);if(c.item==='leftovers')heal(c,side,Math.floor(c.maxHp/16),'leftovers')}
  }
  for(const side of [0,1]){const c=current(side);if(c.silenced>0)c.silenced--}
  n.turn++;
  if(!alive(0)||!alive(1)){n.winner=alive(0)?0:1;emit(null,0,n.winner===0?'victory':'defeat')}
  else if(!current(1).hp){
    n.active[1]=n.teams[1].findIndex(c=>c.hp>0);
    emit(`CPUは ${current(1).name}を繰り出した！`,850,'switch');
    onEntry(1);
  }else emit(null,0);
  return steps;
}
export function resolve(s,action,rng=Math.random){return resolveSequence(s,action,rng).at(-1)?.state??s}
