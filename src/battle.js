import {roster,effectiveness,items,struggle} from './data.js';
export const makeTeam=ids=>ids.map(id=>{const c=roster.find(x=>x.id===id);const stats=c.base.map((v,i)=>Math.floor((Math.floor((2*v+31)*.5)+(i===0?60:5)+(c.points?.[i]??0))*(c.nature?.[i]??100)/100));return {...c,stats,stages:[0,0,0,0,0,0],hp:stats[0],maxHp:stats[0],lockedMove:null,pp:c.moves.map(m=>m.pp),critRank:0,accuracyStage:0,evasionStage:0,initialItem:c.item??null,revealedItem:null,revealedAbility:false,revealedMoves:[],revivalUsed:false,status:null,sleepTurns:0,toxicCounter:0,drowsy:0,protectStreak:0,protectTurn:0,confusion:0,taunted:0,trappedBy:null}});
// Level 50 damage calculation, with integer rounding at each stage.
export function rankedStat(c,index,ignore=false){
 const stage=ignore?0:Math.max(-6,Math.min(6,Math.trunc(c.stages?.[index]??0)));
 const value=Math.max(1,Math.floor(c.stats[index]*(stage>=0?2+stage:2)/(stage>=0?2:2-stage)))*(index===1&&c.ability==='ちからもち'?2:1);
 return items[c.item]?.stat===index?Math.floor(value*1.5):value;
}
const roundHalfDown=(value,numerator,denominator)=>Math.floor((value*numerator+Math.floor((denominator-1)/2))/denominator);
const grounded=(c,s)=>!!s?.gravity||(!c.types.includes('flying')&&c.ability!=='ふゆう');
const matchup=(m,d,s)=>m.struggle?1:m.type==='ground'?(grounded(d,s)?effectiveness(m.type,d.types.filter(t=>t!=='flying')):0):effectiveness(m.type,d.types);
const terrainBlocked=(s,m,d)=>!!s?.psychicTerrain&&!m.protect&&movePriority(m)>0&&grounded(d,s);
export function damage(a,d,m,roll=100,critical=false,second=false,s=null){
 const e=matchup(m,d,s);
 if(!e)return 0;
 const i=m.category==='physical'?1:3;
 const attacker=m.foulPlay?{...d,item:a.item,ability:a.ability}:a;
 const attack=m.puppet?Math.max(d.stats[1],d.stats[3]):rankedStat(attacker,i,critical&&(attacker.stages?.[i]??0)<0);
 const defense=rankedStat(d,i+1,critical&&(d.stages?.[i+1]??0)>0);
 const basePower=m.storedPower?20+20*(a.stages.slice(1).reduce((sum,v)=>sum+Math.max(0,v),0)+Math.max(0,a.accuracyStage??0)+Math.max(0,a.evasionStage??0)):m.power;
 const power=s?.psychicTerrain&&m.type==='psychic'&&grounded(a,s)?roundHalfDown(basePower,5325,4096):basePower;
 let value=Math.floor(Math.floor(22*power*(m.latePower&&second?2:1)*attack/defense)/50)+2;
 if(critical)value=roundHalfDown(value,3,2);
 value=Math.floor(value*roll/100);
 if(!m.struggle&&a.types.includes(m.type))value=roundHalfDown(value,3,2);
 value=Math.floor(value*e);
 if(a.status==='burn'&&m.category==='physical')value=roundHalfDown(value,1,2);
 if(a.item==='orb')value=roundHalfDown(value,5324,4096);
 return Math.max(1,value);
}
const accuracyChance=(m,a,d,s)=>{const stage=Math.max(-6,Math.min(6,(a.accuracyStage??0)-(d.evasionStage??0)));return Math.min(100,m.accuracy*(stage>=0?3+stage:3)/(stage>=0?3:3-stage)*(s?.gravity?5/3:1))};
const criticalChance=(m,a)=>[1/24,1/8,1/2,1][Math.max(0,Math.min(3,(a.critRank??0)+(m.critStage??(m.name==='サイコカッター'?1:0))))];
export function startSequence(ids,enemy=roster.map(c=>c.id).sort(()=>Math.random()-.5).slice(0,3)){
 const s={teams:[makeTeam(ids),makeTeam(enemy)],active:[0,0],turn:1,logs:['バトル開始！'],winner:null,psychicTerrain:0,gravity:0};
 const steps=[{state:structuredClone(s),delay:950}];
 for(const side of [0,1]){
  const c=s.teams[side][0];c.seen=true;if(c.ability==='せんのう'){
   c.revealedAbility=true;const ability={side,name:c.name,ability:c.ability},target=s.teams[1-side][0],prefix=side===0?'相手の':'';
   s.logs.push(`${side===1?'相手の':''}${c.name}のせんのう！`);
   steps.push({state:structuredClone(s),delay:950,sound:'activate',ability});
   for(const [index,stat] of [[1,'攻撃'],[3,'特攻']]){
    if(target.stages[index]<=-6)continue;
    target.stages[index]--;s.logs.push(`${prefix}${target.name}の${stat}が下がった！`);
    steps.push({state:structuredClone(s),delay:850,sound:'down',ability,statNotice:{side:1-side,stat,delta:-1}});
   }
   continue;
  }if(c.ability==='ふゆう'){c.revealedAbility=true;const ability={side,name:c.name,ability:c.ability};s.logs.push(`${side===1?'相手の':''}${c.name}は宙に浮いている！`);steps.push({state:structuredClone(s),delay:950,sound:'activate',ability});continue}if(c.ability!=='サイコメイカー'||s.psychicTerrain)continue;
  c.revealedAbility=true;const ability={side,name:c.name,ability:c.ability};s.logs.push(`${side===1?'相手の':''}${c.name}のサイコメイカー！`);
  steps.push({state:structuredClone(s),delay:950,sound:'activate',ability});
  s.psychicTerrain=c.item==='terrain'?8:5;s.logs.push('サイコフィールドが広がった！');
  steps.push({state:structuredClone(s),delay:850,ability});
 }
 if(s.psychicTerrain)for(const side of [0,1]){
  const c=s.teams[side][0];if(c.item!=='psychicSeed'||c.stages[4]>=6)continue;
  c.revealedItem='psychicSeed';const itemNotice={side,name:c.name,item:items.psychicSeed.name};
  s.logs.push(`${side===1?'相手の':''}${c.name}のサイコシード！`);steps.push({state:structuredClone(s),delay:950,sound:'activate',itemNotice});
  c.item=null;c.stages[4]++;s.logs.push(`${side===1?'相手の':''}${c.name}の特防が上がった！`);steps.push({state:structuredClone(s),delay:850,sound:'up',itemNotice,statNotice:{side,stat:'特防',delta:1}});
 }
 return steps;
}
export function start(ids){return startSequence(ids).at(-1).state}
export const hitLimit=(s,m)=>m.multiHit==='fainted'?s.teams.flat().filter(c=>c.hp<=0).length:m.multiHit==='silver'?6:1;
export const isTrapped=(s,side)=>{const c=s.teams[side][s.active[side]],other=s.teams[1-side][s.active[1-side]];return !!c.trappedBy&&c.hp>0&&!c.types.includes('ghost')&&other.hp>0&&c.trappedBy===other.id};
// Estimate damage against the possible level-50 HP and relevant defense spreads.
const canBeneficialSwap=(a,d)=>d.hp*a.maxHp>a.hp*d.maxHp||a.stages.some((v,i)=>i>0&&v<d.stages[i])||['accuracyStage','evasionStage','critRank'].some(key=>(a[key]??0)<(d[key]??0))||!!a.status&&!d.status||(a.confusion??0)>(d.confusion??0)||(a.drowsy??0)>(d.drowsy??0);
export function damageRange(s,a,d,m){
 const visible=d.revealedAbility?d:{...d,ability:null};
 const e=terrainBlocked(s,m,visible)?0:matchup(m,visible,s);
 const hits=hitLimit(s,m);
 if(m.category==='status')return (m.soundMove&&a.silenced>0||a.taunted>0||m.sleep&&!!d.status||m.toxic&&(!!d.status||d.types.includes('poison')||d.types.includes('steel'))||m.yawn&&(!!d.status||d.drowsy>0)||m.recover&&a.hp>=a.maxHp||m.swapStages&&!canBeneficialSwap(a,d)||m.calmMind&&a.stages[3]>=6&&a.stages[4]>=6||m.gravity&&s.gravity>0||m.swordsDance&&a.stages[1]>=6||m.dance&&a.stages[1]>=6&&a.critRank>=3)?{label:'失敗',min:0,max:0}:{label:'変化',min:null,max:null};
 const label=e===0?'無効':e>=4?'かなり抜群':e>1?'抜群':e<=.25?'かなり半減':e<1?'半減':'';
 if(!hits||(m.soundMove&&a.silenced>0))return {label:'失敗',min:0,max:0};
 if(!e)return {label:'無効',min:0,max:0};
 const i=m.category==='physical'?2:4;
 const target=invested=>({...d,ability:d.revealedAbility?d.ability:null,item:d.revealedItem===d.item?d.item:null,stats:d.base.map((v,k)=>k===0?v+75+(invested?32:0):k===i?(invested?Math.floor((v+52)*1.1):v+20):(m.foulPlay&&k===1||m.puppet&&(k===1||k===3))&&!invested?Math.floor((v+52)*1.1):v+20)});
 const low=target(true),high=target(false);
 return {label,min:Math.floor(damage(a,low,m,85,criticalChance(m,a)===1,false,s)*100/low.stats[0]),max:Math.floor(damage(a,high,m,100,criticalChance(m,a)===1,false,s)*100/high.stats[0])};
}
export const canUseMove=(c,i)=>i===-1?!c.moves.some((m,k)=>canUseMove(c,k)):!!c.moves[i]&&(c.pp?.[i]??c.moves[i].pp)>0&&!((c.item==='vest'||c.taunted>0)&&c.moves[i].category==='status')&&(!items[c.item]?.choice||c.lockedMove==null||c.lockedMove===i);
const moveScore=(s,a,d,m)=>{
 if(terrainBlocked(s,m,d)||m.category==='status'||m.soundMove&&a.silenced>0||!accuracyChance(m,a,d,s))return 0;
 if(m.sucker&&!d.moves.some((other,i)=>other.category!=='status'&&canUseMove(d,i))&&!canUseMove(d,-1))return 0;
 return damage(a,d,m,100,criticalChance(m,a)===1,rankedStat(a,5)<rankedStat(d,5),s)*hitLimit(s,m);
};
const movePriority=m=>m?.priority??(m?.name==='かげうち'?1:0);
// Prefer a priority move when both attacks can finish the current opponent reliably.
function guaranteedKO(s,a,d,m){
 if(m.category==='status'||m.contact&&d.ability==='げんし'||!hitLimit(s,m)||terrainBlocked(s,m,d)||!matchup(m,d,s)||m.soundMove&&a.silenced>0||accuracyChance(m,a,d,s)<100)return false;
 if(m.sucker&&!d.moves.some((other,i)=>other.category!=='status'&&canUseMove(d,i))&&!canUseMove(d,-1))return false;
 const dealt=damage(a,d,m,85,criticalChance(m,a)===1,false,s);
 let hp=d.hp,item=d.item;
 for(let i=0;i<(m.multiHit==='silver'&&a.item!=='dice'?1:hitLimit(s,m));i++){
  if(item==='sash'&&hp===d.maxHp&&dealt>=hp){hp=1;item=null}
  else hp=Math.max(0,hp-dealt);
  if(hp===0)return true;
  if(item==='sitrus'&&hp*2<=d.maxHp){hp=Math.min(d.maxHp,hp+Math.max(1,Math.floor(d.maxHp/4)));item=null}
 }
 return false;
}
export function chooseCpu(s){
 const a=s.teams[1][s.active[1]],d=s.teams[0][s.active[0]];
 const best=a.moves.map((m,i)=>({i,score:moveScore(s,a,d,m),ko:guaranteedKO(s,a,d,m),priority:movePriority(m)})).filter(({i})=>canUseMove(a,i)).sort((x,y)=>(y.ko?y.priority:0)-(x.ko?x.priority:0)||y.score-x.score||y.priority-x.priority)[0];
 if(!best||(best.score===0&&a.lockedMove!=null)){
  const next=s.teams[1].map((c,i)=>({i,score:Math.max(...c.moves.map(m=>moveScore(s,c,d,m)))})).filter(({i,score})=>i!==s.active[1]&&s.teams[1][i].hp>0&&score>0).sort((a,b)=>b.score-a.score)[0];
  if(next&&!isTrapped(s,1))return {kind:'switch',index:next.i};
 }
 return {kind:'move',index:best?.i??-1};
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
export function resolveSequence(s,action,rng=Math.random,options={}){
  if(s.winner!==null)return [];
  const n=structuredClone(s),steps=[];
  const alive=side=>n.teams[side].some(c=>c.hp>0);
  const current=side=>n.teams[side][n.active[side]];
  const emit=(message,delay=850,sound=null,ability=null,itemNotice=null,statNotice=null)=>{if(message&&!options.fast)n.logs.push(message);if(options.fast)steps[0]={state:n,delay:0};else steps.push({state:structuredClone(n),delay,sound,ability,itemNotice,statNotice})};
  const itemNotice=(c,side,item)=>({side,name:c.name,item:items[item].name});
  const name=(c,side)=>`${side===1?'相手の':''}${c.name}`;
  const entryAbility=side=>{
    const c=current(side);c.seen=true;
    if(c.ability==='せんのう'){
      const d=current(1-side);if(d.hp<=0)return;
      c.revealedAbility=true;const ability={side,name:c.name,ability:c.ability};
      emit(null,650);emit(`${name(c,side)}のせんのう！`,950,'activate',ability);
      for(const [index,stat] of [[1,'攻撃'],[3,'特攻']]){
       if(d.stages[index]<=-6){emit(`${name(d,1-side)}の${stat}はこれ以上下がらない！`,850,null,ability);continue}
       d.stages[index]--;emit(`${name(d,1-side)}の${stat}が下がった！`,850,'down',ability,null,{side:1-side,stat,delta:-1});
      }
      return;
    }
    if(c.ability==='ふゆう'){emit(null,650);c.revealedAbility=true;emit(`${name(c,side)}は宙に浮いている！`,950,'activate',{side,name:c.name,ability:c.ability});if(n.gravity>0)emit(`${name(c,side)}は重力の効果で地面に落とされた！`,850);return}
    if(c.ability==='サイコメイカー'){if(n.psychicTerrain>0)return;emit(null,650);c.revealedAbility=true;const ability={side,name:c.name,ability:c.ability};emit(`${name(c,side)}のサイコメイカー！`,950,'activate',ability);n.psychicTerrain=c.item==='terrain'?8:5;emit('サイコフィールドが広がった！',850,null,ability);return}
    if(c.ability!=='まじょのあかし'||n.teams[side].filter(x=>x.hp>0).length!==1||c.hp<=0)return;
    c.revealedAbility=true;
    const ability={side,name:c.name,ability:c.ability};
    emit(`${name(c,side)}のまじょのあかし！`,950,'activate',ability);
    const old=c.stages[3];c.stages[3]=Math.min(6,old+1);
    if(c.stages[3]>old)emit(`${name(c,side)}の特攻が上がった！`,850,'up',ability,null,{side,stat:'特攻',delta:1});
    else emit(`${name(c,side)}の特攻はこれ以上上がらない！`,850,null,ability);
  };
  const faint=(c,side)=>{if(!c.hp&&!c.fainted){c.fainted=true;if(current(1-side).trappedBy===c.id)current(1-side).trappedBy=null;emit(`${name(c,side)}は倒れた！`,side===1?2300:1100,'faint')}};
  const activateItem=(c,side,item)=>{emit(null,650);c.revealedItem=item;const notice=itemNotice(c,side,item);emit(`${name(c,side)}の${items[item].name}！`,950,'activate',null,notice);return notice};
  const psychicSeeds=()=>{
    if(!n.psychicTerrain)return;
    for(const side of [0,1]){const c=current(side);if(c.hp<=0||c.item!=='psychicSeed'||c.stages[4]>=6)continue;
      const notice=activateItem(c,side,'psychicSeed');c.item=null;c.stages[4]++;
      emit(`${name(c,side)}の特防が上がった！`,850,'up',null,notice,{side,stat:'特防',delta:1});
    }
  };
  const onEntry=side=>{entryAbility(side);psychicSeeds()};
  const heal=(c,side,amount,item)=>{if(c.hp<=0||c.hp>=c.maxHp)return;const notice=activateItem(c,side,item);if(item==='sitrus')c.item=null;c.hp=Math.min(c.maxHp,c.hp+Math.max(1,amount));emit(`${name(c,side)}は${items[item].name}でHPを回復した！`,850,'heal',null,notice)};
  const berry=(c,side)=>{if(c.item==='sitrus'&&c.hp>0&&c.hp*2<=c.maxHp)heal(c,side,Math.floor(c.maxHp/4),'sitrus')};
  const resetStages=c=>{c.stages=[0,0,0,0,0,0];c.lockedMove=null;c.silenced=0;c.critRank=0;c.accuracyStage=0;c.evasionStage=0;c.confusion=0;c.drowsy=0;c.protectStreak=0;c.protectTurn=0;c.toxicCounter=0;c.taunted=0;c.trappedBy=null};
  const reserves=side=>n.teams[side].map((c,i)=>i).filter(i=>i!==n.active[side]&&n.teams[side][i].hp>0);
  const pickReserve=side=>{const list=reserves(side);const chosen=(side===1?options.cpuChooseSwitch??options.chooseSwitch:options.chooseSwitch)?.(n,side,list);return list.includes(chosen)?chosen:list[0]};
  const switchTo=(side,index)=>{const old=current(side);if(current(1-side).trappedBy===old.id)current(1-side).trappedBy=null;resetStages(old);n.active[side]=index;emit(`${name(old,side)}を戻した！ ${name(current(side),side)}を繰り出した！`,850,'switch');onEntry(side)};
  const revive=side=>{const c=current(side);if(c.hp!==0||c.ability!=='しにもどり'||c.revivalUsed||!reserves(side).length)return false;c.revivalUsed=true;c.revealedAbility=true;const ability={side,name:c.name,ability:c.ability};emit(`${name(c,side)}のしにもどり！`,950,'activate',ability);c.hp=1;c.fainted=false;c.status=null;c.sleepTurns=0;resetStages(c);emit(`${name(c,side)}はHP1で復活した！`,850,'heal',ability);return true};
  const pending=n.pendingSwitch;
  if(pending){
    if(action.kind!=='switch'||!reserves(0).includes(action.index))return [];
    n.pendingSwitch=null;switchTo(0,action.index);
    if(pending.reason==='revive')return steps;
  }
  if(!pending&&current(0).hp===0){
    if(action.kind!=='switch'||!n.teams[0][action.index]?.hp)return [];
    n.active[0]=action.index;
    emit(`いけ！ ${current(0).name}！`,850,'switch');
    onEntry(0);
    return steps;
  }
  if(!pending&&action.kind==='switch'&&(isTrapped(n,0)||!n.teams[0][action.index]?.hp||action.index===n.active[0]))return [];
  if(!pending&&action.kind==='move'&&(!canUseMove(current(0),action.index)))return [];
  const actions=pending?.actions??[action,options.opponentAction??chooseCpu(n)];
  if(!pending&&options.opponentAction){const x=actions[1];if(x.kind==='switch'&&(isTrapped(n,1)||!reserves(1).includes(x.index))||x.kind==='move'&&!canUseMove(current(1),x.index))return []}
  const priority=side=>actions[side].kind==='switch'?6:movePriority(current(side).moves[actions[side].index]);
  const difference=priority(0)-priority(1)||rankedStat(current(0),5)-rankedStat(current(1),5);
  const order=pending?.order??(difference>0?[0,1]:difference<0?[1,0]:rng()<.5?[0,1]:[1,0]);
  const flinched=new Set(pending?.flinched??[]);
  for(let pos=pending?.next??0;pos<order.length;pos++){
    const side=order[pos];
    const a=current(side),d=current(1-side),act=actions[side];
    if(a.hp<=0||d.hp<=0)continue;
    if(act.kind==='switch'){
      switchTo(side,act.index);
      continue;
    }
    if(flinched.has(side)){emit(`${name(a,side)}はひるんで動けなかった！`);continue}
    if(a.status==='sleep'){if(a.sleepTurns>0){a.sleepTurns--;emit(`${name(a,side)}はぐうぐう眠っている！`,850,'sleep');continue}a.status=null;emit(`${name(a,side)}は目を覚ました！`)}
    if(a.confusion>0){a.confusion--;if(a.confusion===0)emit(`${name(a,side)}の混乱が解けた！`);else{emit(`${name(a,side)}は混乱している！`);if(rng()<1/3){const selfDamage=damage({...a,item:null},a,{type:'normal',category:'physical',power:40,struggle:true},100);a.hp=Math.max(0,a.hp-selfDamage);emit(`${name(a,side)}はわけもわからず自分を攻撃した！`,850,'hit');faint(a,side);continue}}}
    const m=act.index===-1?struggle:a.moves[act.index];if(m?.category==='status'&&a.taunted>0){emit(`${name(a,side)}はちょうはつされて変化技が出せない！`);continue}if(!m||!canUseMove(a,act.index))continue;
    if(act.index!==-1){a.pp[act.index]--;if(items[a.item]?.choice)a.lockedMove=act.index;}
    if(act.index!==-1&&!a.revealedMoves.includes(act.index))a.revealedMoves.push(act.index);
    emit(`${side===1?'相手の':''}${a.name}の${m.name}！`,850);
    if(terrainBlocked(n,m,d)){emit('サイコフィールドに守られた！');continue}
    if(m.soundMove&&a.silenced>0){emit(`${name(a,side)}は音の技が出せない！`);continue}
    if(m.protect){
      if(actions[1-side].kind==='switch'){a.protectStreak=0;a.protectTurn=0;emit('しかし上手く決まらなかった！');continue}
      const streak=a.protectTurn===n.turn-1?a.protectStreak??0:0;
      if(streak&&rng()>=Math.pow(1/3,streak)){a.protectStreak=0;emit('しかし上手く決まらなかった！');continue}
      a.protectStreak=streak+1;a.protectTurn=n.turn;
      emit(`${name(a,side)}は守りの体勢に入った！`,850,'protect');continue;
    }
    if(d.protectTurn===n.turn&&(m.category!=='status'||m.toxic||m.yawn||m.sleep||m.confuse||m.taunt||m.swapStages)){
      emit(`${name(d,1-side)}は攻撃から身を守った！`,850);continue;
    }
    if(m.swapStages){
      const labels=['HP','攻撃','防御','特攻','特防','素早さ'];
      const changes=[];const swap=(key,label,index=null)=>{
        const av=index===null?(a[key]??0):a[key][index],dv=index===null?(d[key]??0):d[key][index];
        if(av>=dv)return;
        if(index===null){a[key]=dv;d[key]=av}else{a[key][index]=dv;d[key][index]=av}
        changes.push({side,stat:label,delta:dv-av},{side:1-side,stat:label,delta:av-dv});
      };
      for(let i=1;i<=5;i++)swap('stages',labels[i],i);
      swap('accuracyStage','命中率');swap('evasionStage','回避率');swap('critRank','急所');
      let swapped=false;
      if(d.hp*a.maxHp>a.hp*d.maxHp){
        const ah=a.hp,dh=d.hp;a.hp=Math.min(a.maxHp,Math.max(1,Math.floor(dh*a.maxHp/d.maxHp)));d.hp=Math.min(d.maxHp,Math.max(1,Math.floor(ah*d.maxHp/a.maxHp)));
        swapped=true;emit(`${name(a,side)}と${name(d,1-side)}のHP割合が入れ替わった！`,950,'heal');berry(a,side);berry(d,1-side);
      }
      if(a.status&&!d.status){
        for(const key of ['status','sleepTurns','toxicCounter']){[a[key],d[key]]=[d[key],a[key]]}
        swapped=true;emit(`${name(a,side)}の状態異常が${name(d,1-side)}に移った！`,950);
      }
      for(const [key,label] of [['confusion','混乱'],['drowsy','ねむけ']]){
        if((a[key]??0)>(d[key]??0)){[a[key],d[key]]=[d[key]??0,a[key]??0];swapped=true;emit(`${name(a,side)}と${name(d,1-side)}の${label}が入れ替わった！`,850)}
      }
      if(!changes.length&&!swapped){emit('しかし上手く決まらなかった！');continue}
      if(changes.length)emit(`${name(a,side)}と${name(d,1-side)}の能力変化が入れ替わった！`,950);
      for(const change of changes)emit(null,450,change.delta>0?'up':'down',null,null,{...change,delta:Math.sign(change.delta)*Math.min(6,Math.abs(change.delta))});
      continue;
    }
    if(m.calmMind){
      if(a.stages[3]>=6&&a.stages[4]>=6){emit('しかし上手く決まらなかった！');continue}
      for(const [index,stat] of [[3,'特攻'],[4,'特防']])if(a.stages[index]<6){a.stages[index]++;emit(`${name(a,side)}の${stat}が上がった！`,850,'up',null,null,{side,stat,delta:1})}
      continue;
    }
    if(m.recover){
      if(a.hp>=a.maxHp){emit('しかし上手く決まらなかった！');continue}
      a.hp=Math.min(a.maxHp,a.hp+Math.max(1,Math.floor(a.maxHp/2)));emit(`${name(a,side)}はHPを回復した！`,850,'heal');continue;
    }
    if(m.toxic){
      if(d.types.includes('poison')||d.types.includes('steel')){emit(`${name(d,1-side)}には効果がないようだ…`);continue}
      if(d.status){emit('しかし上手く決まらなかった！');continue}
      if(!a.types.includes('poison')&&accuracyChance(m,a,d,n)<=rng()*100){emit('しかし外れてしまった！');continue}
      d.status='toxic';d.toxicCounter=0;d.drowsy=0;emit(`${name(d,1-side)}は猛毒を浴びた！`,850,'poison');continue;
    }
    if(m.yawn){
      if(d.status||d.drowsy>0){emit('しかし上手く決まらなかった！');continue}
      d.drowsy=2;emit(`${name(d,1-side)}は眠気をもよおした！`,850);continue;
    }
    if(m.gravity){if(n.gravity>0){emit('しかし上手く決まらなかった！');continue}n.gravity=5;emit('重力が強くなった！');continue}
    if(m.sleep||m.confuse||m.taunt){
      if(accuracyChance(m,a,d,n)<=rng()*100){emit('しかし外れてしまった！');continue}
      if(m.sleep||m.confuse){if(m.sleep?!!d.status:d.confusion>0){emit('しかし上手く決まらなかった！');continue}if(m.sleep){d.status='sleep';d.sleepTurns=1+Math.floor(rng()*3);emit(`${name(d,1-side)}は眠ってしまった！`,850,'sleep')}else{d.confusion=2+Math.floor(rng()*4);emit(`${name(d,1-side)}は混乱した！`,850)}if(reserves(side).length){if(side===1||options.chooseSwitch)switchTo(side,pickReserve(side));else{n.pendingSwitch={reason:'pivot',actions,order,next:pos+1,flinched:[...flinched]};emit('交代する魔法少女を選択！',0);return steps}}}
      else{if(d.taunted>0){emit('しかし上手く決まらなかった！');continue}d.taunted=3;emit(`${name(d,1-side)}はちょうはつに乗った！`)}continue;
    }
    if(m.swordsDance){if(a.stages[1]>=6){emit('しかし上手く決まらなかった！');continue}const delta=Math.min(2,6-a.stages[1]);a.stages[1]+=delta;emit(`${name(a,side)}の攻撃が${delta===2?'ぐーんと':''}上がった！`,850,'up',null,null,{side,stat:'攻撃',delta});continue}
    if(m.dance){
      if(a.stages[1]>=6&&a.critRank>=3){emit('しかし上手く決まらなかった！');continue}
      if(a.stages[1]<6){const boost=Math.min(2,6-a.stages[1]);a.stages[1]+=boost;emit(`${name(a,side)}の攻撃が${boost===2?'ぐーんと':''}上がった！`,850,'up',null,null,{side,stat:'攻撃',delta:boost})}
      const delta=Math.min(1,3-a.critRank);if(delta>0){a.critRank+=delta;emit(`${name(a,side)}の急所ランクが上がった！`,850,'up',null,null,{side,stat:'急所',delta})}continue;
    }
    if(m.sucker&&(side!==order[0]||actions[1-side].kind!=='move'||current(1-side).moves[actions[1-side].index]?.category==='status')){emit('しかし上手く決まらなかった！');continue}
    const limit=m.multiHit==='silver'?(a.item==='dice'?6:1+Math.floor(rng()*6)):hitLimit(n,m);
    if(m.soundMove&&a.silenced>0){emit(`${name(a,side)}は音の技が出せない！`);continue}
    if(!limit){emit('しかし上手く決まらなかった！');continue}
    const e=matchup(m,d,n);
    if(m.type==='ground'&&d.ability==='ふゆう'&&!n.gravity){d.revealedAbility=true;emit(`${name(d,1-side)}のふゆう！`,950,'activate',{side:1-side,name:d.name,ability:d.ability})}
    if(e===0){emit(`${side===0?'相手の':''}${d.name}には効果がないようだ…`);continue}
    let hits=0,totalDamage=0;
    for(let i=0;i<limit&&d.hp>0&&a.hp>0;i++){
      if((m.multiHit!=='silver'||i===0)&&rng()*100>=accuracyChance(m,a,d,n)){if(!hits)emit('しかし外れてしまった！');break}
      if(i===0&&m.contact&&d.ability==='げんし'&&rng()<.2){d.revealedAbility=true;emit(`${name(d,1-side)}のげんし！`,950,'activate',{side:1-side,name:d.name,ability:d.ability});emit(`${name(d,1-side)}は攻撃をかわした！`);break}
      const critical=rng()<criticalChance(m,a);
      const roll=85+Math.min(15,Math.floor(rng()*16));
      const dealt=damage(a,d,m,roll,critical,side===order[1]&&actions[1-side].kind==='move',n);
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
      if(m.contact&&d.item==='helmet'&&a.hp>0){
       const notice=activateItem(d,1-side,'helmet');
       a.hp=Math.max(0,a.hp-Math.max(1,Math.floor(a.maxHp/6)));
       emit(`${name(a,side)}はゴツゴツメットでダメージを受けた！`,850,'hit',null,notice);
      }
    }
    if(!hits)continue;
    if(e>=4)emit('効果はかなり抜群だ！');
    else if(e>1)emit('効果は抜群だ！');
    else if(e<=.25)emit('効果はかなりいまひとつだ！');
    else if(e<1)emit('効果はいまひとつだ！');
    if(m.multiHit)emit(`${hits}回当たった！`);
    if(d.hp>0&&m.trap&&!d.types.includes('ghost')&&d.trappedBy!==a.id){d.trappedBy=a.id;emit(`${name(d,1-side)}は逃げられなくなった！`)}
    if(d.hp>0&&m.burnChance&&!d.status&&!d.types.includes('fire')&&rng()*100<m.burnChance){emit(null,650);d.status='burn';emit(`${name(d,1-side)}はやけどを負った！`,850,'burn')}
    if(m.raiseCrit&&a.critRank<3){emit(null,650);const delta=Math.min(m.raiseCrit,3-a.critRank);a.critRank+=delta;emit(`${name(a,side)}の急所ランクが上がった！`,850,'up',null,null,{side,stat:'急所',delta})}
    if(m.selfDefenseDown){emit(null,650);for(const [index,stat] of [[2,'防御'],[4,'特防']])if(a.stages[index]>-6){a.stages[index]--;emit(`${name(a,side)}の${stat}が下がった！`,850,'down',null,null,{side,stat,delta:-1})}}
    if(d.hp>0&&m.silence){emit(null,650);d.silenced=2;emit(`${name(d,1-side)}は音の技が出せなくなった！`)}
    if(d.hp>0&&d.stages[3]>-6&&(m.lowerSpA||m.lowerSpAChance&&rng()*100<m.lowerSpAChance)){emit(null,650);d.stages[3]--;emit(`${name(d,1-side)}の特攻が下がった！`,850,'down',null,null,{side:1-side,stat:'特攻',delta:-1})}
    if(d.hp>0&&m.lowerAtkChance&&d.stages[1]>-6&&rng()*100<m.lowerAtkChance){emit(null,650);d.stages[1]--;emit(`${name(d,1-side)}の攻撃が下がった！`,850,'down',null,null,{side:1-side,stat:'攻撃',delta:-1})}
    if(d.hp>0&&m.flinchChance&&side===order[0]&&actions[1-side].kind==='move'&&rng()*100<m.flinchChance){emit(null,650);flinched.add(1-side);}
    if(m.drain&&totalDamage>0&&a.hp>0&&a.hp<a.maxHp){emit(null,650);a.hp=Math.min(a.maxHp,a.hp+Math.max(1,Math.floor(totalDamage*m.drain)));emit(`${name(a,side)}はHPを回復した！`,850,'heal')}
    faint(d,1-side);faint(a,side);
    if(m.struggle&&a.hp>0){a.hp=Math.max(0,a.hp-Math.max(1,Math.floor(a.maxHp/4)));emit(`${name(a,side)}は反動でHPが減った！`,850);faint(a,side)}
    if(a.item==='orb'&&!m.struggle&&a.hp>0){
      const notice=activateItem(a,side,'orb');
      a.hp=Math.max(0,a.hp-Math.max(1,Math.floor(a.maxHp/10)));
      emit(`${name(a,side)}はいのちのたまでHPが減った！`,850,null,null,notice);
      faint(a,side);
    }
    if(m.pivot&&a.hp>0&&reserves(side).length&&alive(1-side)){
      if(side===1||options.chooseSwitch)switchTo(side,pickReserve(side));
      else{n.pendingSwitch={reason:'pivot',actions,order,next:pos+1,flinched:[...flinched]};emit('交代する魔法少女を選択！',0);return steps}
    }
  }
  if(alive(0)&&alive(1)){
    for(const side of order){const c=current(side);if(c.item==='leftovers')heal(c,side,Math.floor(c.maxHp/16),'leftovers')}
  }
  for(const side of order){const c=current(side);if(c.hp>0&&c.status==='burn'){c.hp=Math.max(0,c.hp-Math.max(1,Math.floor(c.maxHp/16)));emit(`${name(c,side)}はやけどのダメージを受けた！`,850,'burn');faint(c,side)}}
  for(const side of order){
    const c=current(side);
    if(c.hp>0&&c.status==='toxic'){emit(null,650);c.toxicCounter=Math.min(15,(c.toxicCounter??0)+1);c.hp=Math.max(0,c.hp-Math.max(1,Math.floor(c.maxHp*c.toxicCounter/16)));emit(`${name(c,side)}は毒のダメージを受けた！`,850,'poison');berry(c,side);faint(c,side)}
    if(c.hp>0&&c.drowsy>0&&!--c.drowsy&&!c.status){c.status='sleep';c.sleepTurns=1+Math.floor(rng()*3);emit(`${name(c,side)}は眠ってしまった！`,850,'sleep')}
  }
  for(const side of [0,1]){const c=current(side);if(c.silenced>0)c.silenced--;if(c.taunted>0&&!--c.taunted)emit(`${name(c,side)}のちょうはつが解けた！`)}
  if(n.psychicTerrain>0&&!--n.psychicTerrain)emit('サイコフィールドが消えた！');
  if(n.gravity>0&&!--n.gravity)emit('重力が元に戻った！');
  const playerRevived=revive(0),cpuRevived=revive(1);
  n.turn++;
  if(!alive(0)||!alive(1)){n.winner=alive(0)?0:1;emit(null,0,n.winner===0?'victory':'defeat')}
  else{
    if(cpuRevived)switchTo(1,pickReserve(1));
    else if(!current(1).hp){n.active[1]=pickReserve(1);emit(`CPUは ${current(1).name}を繰り出した！`,850,'switch');onEntry(1)}
    if(playerRevived){if(options.chooseSwitch)switchTo(0,pickReserve(0));else{n.pendingSwitch={reason:'revive'};emit('交代する魔法少女を選択！',0)}}else if(options.chooseSwitch&&!current(0).hp){n.active[0]=pickReserve(0);emit(`いけ！ ${current(0).name}！`,850,'switch');onEntry(0)}else emit(null,0);
  }
  return steps;
}
export function resolve(s,action,rng=Math.random){return resolveSequence(s,action,rng).at(-1)?.state??s}
