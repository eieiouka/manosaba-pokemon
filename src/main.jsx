import React,{useState,useLayoutEffect,useEffect,useCallback,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {roster,types,colors,items,struggle} from './data.js';
import {start,startSequence,resolveSequence,makeTeam,canUseMove,damageRange,isTrapped} from './battle.js';
import './style.css';
import {chooseCpuTeam,chooseReserve} from './ai.js';
import {chooseOptimalTeam,preloadSelection} from './team-selection.js';
void preloadSelection();
import {unlockAttackAudio,playAttackSound} from './sounds.js';
function randomSix(){
 const pool=[...roster];
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
 return pool.slice(0,6);
}
function Type({type}){return <span className="type" style={{background:colors[type]}}>{types[type]}</span>}
function Portrait({c,fainted=false,onInspect}){
 const [loadedId,setLoadedId]=useState(null);
 const ready=loadedId===c.id;
 const [faintId,setFaintId]=useState(null);
 const showFaint=fainted&&faintId===c.id;
 const hold=useRef(null),pressed=useRef(false),origin=useRef(null);
 const cancelHold=()=>{clearTimeout(hold.current);hold.current=null};
 useEffect(()=>()=>clearTimeout(hold.current),[]);
 const begin=e=>{if(!onInspect||e.button!==0)return;cancelHold();pressed.current=false;origin.current=[e.clientX,e.clientY];hold.current=setTimeout(()=>{pressed.current=true;onInspect(c)},500)};
 const move=e=>{if(origin.current&&Math.hypot(e.clientX-origin.current[0],e.clientY-origin.current[1])>10)cancelHold()};
 return <div className="portrait" onPointerDown={begin} onPointerMove={move} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold} onContextMenu={e=>e.preventDefault()} onClickCapture={e=>{if(pressed.current){e.preventDefault();e.stopPropagation();pressed.current=false}}} style={{'--accent':c.color,position:'relative',overflow:'hidden',background:'transparent',borderColor:'transparent'}}>
 
 <img key={c.id} src={`/characters/${c.id}.png`} alt={c.name} onLoad={()=>setLoadedId(c.id)} onError={()=>setLoadedId(null)} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',visibility:ready&&!showFaint?'visible':'hidden',filter:fainted?'grayscale(1)':'none'}}/>
 {fainted&&<img key={c.id+'-down'} src={`/characters/${c.id}_down.png`} alt={c.name+'（瀕死）'} onLoad={()=>setFaintId(c.id)} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',visibility:showFaint?'visible':'hidden'}}/>}
 </div>
}
const statLabels=['HP','攻撃','防御','特攻','特防','素早さ'];
const stageLabels=['攻撃','防御','特攻','特防','素早さ','命中率','回避率','急所ランク'];
const stageValues=c=>[...(c.stages??[0,0,0,0,0,0]).slice(1,6),c.accuracyStage??0,c.evasionStage??0,c.critRank??0];
function StageMarks({stage=0}){
 const count=Math.min(6,Math.abs(Math.trunc(stage)||0));
 if(!count)return <span className="stage-neutral" aria-label="変化なし">－</span>;
 return <span className={'stage-marks '+(stage>0?'stage-up':'stage-down')} aria-label={`${stage>0?'上昇':'下降'}${count}段階`}>{Array.from({length:count},(_,i)=><span key={i}>{stage>0?'▲':'▼'}</span>)}</span>
}
function stageAdjusted(value,index,stage=0){
 if(index===0)return value;
 stage=Math.max(-6,Math.min(6,stage));
 return Math.max(1,Math.floor(value*(stage>=0?2+stage:2)/(stage>=0?2:2-stage)));
}
function statRange(base,index,stage=0){
 const min=index===0?base+60:Math.floor((base+5)*9/10);
 const max=index===0?base+107:Math.floor((base+52)*11/10);
 return <>{stageAdjusted(min,index,stage)}<span style={{color:"#fff"}}>～</span>{stageAdjusted(max,index,stage)}</>;
}
function ItemLabel({item,onInspect}){
 const hold=useRef(null),pressed=useRef(false),origin=useRef(null);
 const cancel=()=>{clearTimeout(hold.current);hold.current=null};
 useEffect(()=>()=>clearTimeout(hold.current),[]);
 if(!items[item])return <span className="held-item empty">持ち物なし</span>;
 return <span className="held-item" onPointerDown={e=>{if(e.button!==0)return;cancel();pressed.current=false;origin.current=[e.clientX,e.clientY];hold.current=setTimeout(()=>{pressed.current=true;onInspect(items[item])},500)}} onPointerMove={e=>{if(origin.current&&Math.hypot(e.clientX-origin.current[0],e.clientY-origin.current[1])>10)cancel()}} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onContextMenu={e=>e.preventDefault()} onClickCapture={e=>{if(pressed.current){pressed.current=false;e.preventDefault();e.stopPropagation()}}}>{items[item].name}</span>
}
function SelectionCard({c,index,full,onSelect,onInspect,onItem}){
 const hold=useRef(null),pressed=useRef(false),origin=useRef(null);
 const cancel=()=>{clearTimeout(hold.current);hold.current=null};
 useEffect(()=>()=>clearTimeout(hold.current),[]);
 const begin=e=>{if(e.button!==0)return;cancel();pressed.current=false;origin.current=[e.clientX,e.clientY];if(e.target.closest('.held-item:not(.empty)'))return;hold.current=setTimeout(()=>{pressed.current=true;onInspect(c)},500)};
 const move=e=>{if(origin.current&&Math.hypot(e.clientX-origin.current[0],e.clientY-origin.current[1])>10)cancel()};
 return <button type="button" className={'card '+(index>=0?'selected':'')} aria-disabled={index<0&&full} onPointerDown={begin} onPointerMove={move} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onContextMenu={e=>e.preventDefault()} onClick={e=>{if(pressed.current){pressed.current=false;e.preventDefault();return}onSelect(c.id)}}>
 <Portrait c={c}/><div className="card-info"><strong>{c.name}</strong><div className="type-list">{c.types.map(t=><Type key={t} type={t}/>)}</div><ItemLabel item={c.item} onInspect={onItem}/></div>{index>=0&&<span className="num" style={{fontSize:"var(--selection-number-size, 3.0375em)",lineHeight:1}}>{index+1}</span>}</button>
}
function MoveButton({m,pp,range,disabled,locked,onUse,onInspect}){
 const hold=useRef(null),pressed=useRef(false),origin=useRef(null);
 const cancel=()=>{clearTimeout(hold.current);hold.current=null};
 useEffect(()=>()=>clearTimeout(hold.current),[]);
 return <button type="button" className="move-button" disabled={disabled} aria-disabled={locked||undefined} onPointerDown={e=>{if(e.button!==0)return;cancel();pressed.current=false;origin.current=[e.clientX,e.clientY];hold.current=setTimeout(()=>{pressed.current=true;onInspect(m)},500)}} onPointerMove={e=>{if(origin.current&&Math.hypot(e.clientX-origin.current[0],e.clientY-origin.current[1])>10)cancel()}} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onContextMenu={e=>e.preventDefault()} onClick={e=>{if(pressed.current){pressed.current=false;e.preventDefault();return}if(!locked)onUse()}}><div className="move-meta"><Type type={m.type}/>{range.label&&range.label!=='変化'&&<span className={"effect-tag "+(range.label.includes('抜群')?'effective':range.label.includes('半減')?'resisted':'ineffective')}>{range.label}</span>}{m.pp!=null&&<small className="move-pp">PP {pp}/{m.pp}</small>}</div><div className="move-name-row"><strong>{m.name}</strong></div><small className="damage-range">{range.min===null?<span className="damage-value" aria-hidden="true">&nbsp;</span>:null}{range.min!==null&&<><span className="damage-value">{range.min===0&&range.max===0?'0':`${range.min}～${range.max}`}％</span><span className="damage-suffix">ダメージ</span></>}</small></button>
}
function InfoModal({character,move:initialMove,item,onClose,inBattle,opponent=false}){
 const [detailMove,setDetailMove]=useState(null);
 const move=initialMove??detailMove;
 const [statTab,setStatTab]=useState('base');
 const closeRef=useRef(null);
 useEffect(()=>{const previous=document.activeElement;closeRef.current?.focus();const key=e=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);previous?.focus?.()}},[onClose]);
 return createPortal(<div className="info-backdrop" onClick={onClose}><section role="dialog" aria-modal="true" aria-label={item?item.name+'の詳細':move?move.name+'の詳細':character?character.name+'の種族値':'How to play'} className="info-dialog" onClick={e=>e.stopPropagation()}>
 <div className="info-heading"><h2>{item?item.name:move?move.name:character?character.name:'How to play'}</h2><button ref={closeRef} className="ghost" onClick={detailMove?()=>setDetailMove(null):onClose}>{detailMove?"戻る":"閉じる"}</button></div>
 {item?<><h3>持ち物の効果</h3><p>{item.description}</p></>:move?<><div className="type-list"><Type type={move.type}/><span>{move.category==='physical'?'物理':move.category==='status'?'変化':'特殊'}</span></div><dl className="stats-list move-stats"><div><dt>威力</dt><dd>{move.power||'－'}</dd></div><div><dt>命中</dt><dd>{move.category==='status'&&!move.sleep&&!move.taunt&&!move.confuse&&!move.toxic&&!move.ignite&&!move.encore?'－':move.accuracy??'－'}</dd></div><div><dt>PP</dt><dd>{move.pp??'－'}</dd></div></dl><h3>技の効果</h3><p>{(move.priority??(move.name==='かげうち'?1:0))>0&&!/^優先度\+\d/.test(move.description??'')?`優先度+${move.priority??1}。`:''}{move.description??(move.name==='かげうち'?'相手より先に攻撃する。':move.name==='サイコカッター'?'急所に当たりやすい攻撃。':'相手に'+(move.category==='physical'?'物理':'特殊')+'ダメージを与える。')}</p></>:character?<><div className="info-character"><Portrait c={character}/><div className="info-character-meta"><div className="type-list">{character.types.map(t=><Type key={t} type={t}/>)}</div>{inBattle&&<span className={"held-item"+(opponent&&!character.revealedItem?" empty":!character.item?" spent":"")}>{opponent&&!character.revealedItem?"？？？":items[opponent?character.revealedItem:(character.item??character.initialItem??roster.find(c=>c.id===character.id)?.item)]?.name??"持ち物なし"}</span>}</div><div className="ability-info-button"><small>特性</small><strong>{opponent&&!character.revealedAbility?"？？？":character.ability??"なし"}</strong></div></div><div className="ability-description"><p>{opponent&&!character.revealedAbility?"？？？":character.abilityDescription??"特性の効果はありません。"}</p></div><div className="character-moves" aria-label="技一覧">{Array.from({length:4},(_,i)=>{const m=opponent?character.moves[character.revealedMoves?.[i]]:character.moves[i];return <button type="button" key={i} className="character-move" disabled={!m} onClick={()=>m&&setDetailMove(m)}>{m?<><Type type={m.type}/><strong>{m.name}</strong></>:<strong>？？？</strong>}</button>})}</div>
 <div className="stat-tabs" role="group" aria-label="能力表示">{[['base','種族値'],['actual','実数値'],['stage','能力変化']].map(([id,label])=><button key={id} type="button" aria-pressed={statTab===id} className={statTab===id?'active':''} onClick={()=>setStatTab(id)}>{label}</button>)}</div>
 <dl className={'stats-list '+(statTab==='stage'?'stage-list':'')}>{(statTab==='stage'?stageLabels:statLabels).map((label,i)=><div key={label}><dt>{label}</dt><dd style={statTab==='actual'?{color:'#f48bbd',...(opponent?{whiteSpace:'nowrap'}:{})}:undefined}>{statTab==='base'?character.base[i]:statTab==='actual'?(opponent?statRange(character.base[i],i,character.stages?.[i]??0):stageAdjusted((character.stats??makeTeam([character.id])[0].stats)[i],i,character.stages?.[i]??0)):<StageMarks stage={stageValues(character)[i]??0}/>}</dd></div>)}</dl></>:<>
 {inBattle?<><h3>毎ターンの行動</h3><p>技を選ぶか、控えの魔法少女に交代します。基本的に素早さの高い側から行動しますが、先制技や交代は優先されます。</p>
 <h3>勝利条件</h3><p>魔法少女のHPが0になると倒れ、控えと交代します。相手の3人を全員倒すと勝利です。</p><h3>技の確認</h3><p>技ボタンを長押しすると、威力・命中・効果を確認できます。</p></>:<><h3>選出</h3><p>6人の魔法少女から、バトルに参加させる3人を選びます。1人目に選んだ魔法少女が最初に場に出ます。</p></>}
 {!inBattle&&<><h3>持ち物の確認</h3><p>持ち物名を長押しすると、効果を確認できます。</p></>}<h3>ステータスの確認</h3><p>{inBattle?'立ち絵を長押しすると、魔法少女の種族値・実数値・能力変化を確認できます。':'キャラの選出カードを長押しすると、魔法少女の種族値・実数値・能力変化を確認できます。'}</p>
 </>}
 </section></div>,document.body)
}
// Run search off the UI thread, with a hard timeout for slow devices.
function thinkCpu(state){
 return new Promise(resolve=>{
  let worker,timer;
  const finish=action=>{clearTimeout(timer);worker?.terminate();resolve(action)};
  try{
   worker=new Worker(new URL('./cpu.worker.js',import.meta.url),{type:'module'});
   worker.onmessage=e=>finish(e.data);
   worker.onerror=()=>finish(undefined);
   timer=setTimeout(()=>finish(undefined),700);
   worker.postMessage(state);
  }catch{finish(undefined)}
 });
}
function SelectionTimer({onExpire}){
 const [seconds,setSeconds]=useState(60);
 useEffect(()=>{
  const deadline=Date.now()+60000;
  const tick=()=>{const remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));setSeconds(remaining);if(remaining===0){clearInterval(timer);/* 自動選出は一時停止中：再開時は onExpire() を呼ぶ */}};
  const timer=setInterval(tick,200);
  return()=>clearInterval(timer);
 },[onExpire]);
 return <div className="selection-heading"><span>3体選んでください</span><span className="selection-timer">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span></div>
}
function BattleTimer({busy,turn}){
 const limit=60;
 const [seconds,setSeconds]=useState(limit);
 useEffect(()=>{
  if(busy)return;
  setSeconds(limit);
  const deadline=Date.now()+limit*1000;
  const timer=setInterval(()=>{const remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));setSeconds(remaining);if(remaining===0)clearInterval(timer)},200);
  return()=>clearInterval(timer);
 },[busy,limit]);
 return <time className="battle-timer" aria-label="残り時間">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</time>;
}
function App(){
 const [gameScale,setGameScale]=useState(1);
 const [info,setInfo]=useState(null);
 const closeInfo=useCallback(()=>setInfo(null),[]);
 const inspect=useCallback((c,opponent=false)=>setInfo({character:c,opponent}),[]);
 useLayoutEffect(()=>{const resize=()=>setGameScale(Math.min(1,window.innerWidth/920,window.innerHeight/640));resize();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[]);
 const [parties,setParties]=useState(()=>[randomSix(),randomSix()]);
 const [selected,setSelected]=useState([]),[battle,setBattle]=useState(null),[tab,setTab]=useState('move');
 const expireSelection=useCallback(()=>setBattle(b=>b??startSequence(parties[0].slice(0,3).map(c=>c.id),chooseCpuTeam(Math.random,parties[1].map(c=>c.id)),parties.map(p=>p.map(c=>c.id))).at(-1).state),[parties]);
 const toggle=id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):s.length<3?[...s,id]:s);
 const [busy,setBusy]=useState(false);
 const [abilityNotice,setAbilityNotice]=useState(null);
 const [itemNotice,setItemNotice]=useState(null);
 const [statNotice,setStatNotice]=useState(null);
 const busyRef=useRef(false),playbackTimer=useRef(null),cpuThinkRef=useRef(null);
 useEffect(()=>()=>clearTimeout(playbackTimer.current),[]);
 useEffect(()=>{
  if(!battle||busy||battle.winner!==null||battle.pendingSwitch||!battle.teams[0][battle.active[0]].hp){cpuThinkRef.current=null;return}
  cpuThinkRef.current={state:battle,promise:thinkCpu(battle)};
 },[battle,busy]);
 const act=async(action)=>{
  if(busyRef.current||!battle)return;
  unlockAttackAudio();
  busyRef.current=true;setBusy(true);
  const cpuAction=battle.pendingSwitch||!battle.teams[0][battle.active[0]].hp?undefined:await (cpuThinkRef.current?.state===battle?cpuThinkRef.current.promise:thinkCpu(battle));
  const steps=resolveSequence(battle,action,Math.random,{opponentAction:cpuAction,cpuChooseSwitch:chooseReserve});
  if(!steps.length){busyRef.current=false;setBusy(false);return;}
  busyRef.current=true;setBusy(true);setTab('move');
  const play=i=>{
   if(i>=steps.length){busyRef.current=false;setBusy(false);setAbilityNotice(null);setItemNotice(null);setStatNotice(null);return}
   setBattle(steps[i].state);setAbilityNotice(steps[i].ability??null);setItemNotice(steps[i].itemNotice??null);setStatNotice(steps[i].statNotice??null);
   if(steps[i].sound)playAttackSound(steps[i].sound);
   playbackTimer.current=setTimeout(()=>play(i+1),steps[i].delay);
  };
  play(0);
 };
 const beginBattle=async()=>{if(battle||busyRef.current)return;unlockAttackAudio();busyRef.current=true;setBusy(true);const preview=parties.map(p=>p.map(c=>c.id));const chosen=await chooseOptimalTeam(preview[1],preview[0])??chooseCpuTeam(Math.random,preview[1]);const steps=startSequence(selected,chosen,preview);const play=i=>{if(i>=steps.length){setAbilityNotice(null);setItemNotice(null);setStatNotice(null);busyRef.current=false;setBusy(false);return}const step=steps[i];setBattle(step.state);setAbilityNotice(step.ability??null);setItemNotice(step.itemNotice??null);setStatNotice(step.statNotice??null);if(step.sound)playAttackSound(step.sound);playbackTimer.current=setTimeout(()=>play(i+1),step.delay)};play(0)};
 const reset=()=>{setParties([randomSix(),randomSix()]);setBattle(null);setSelected([]);setTab('move')};
 const active=battle?.teams.map((t,i)=>t[battle.active[i]]);
 const trapped=!!battle&&!battle.pendingSwitch&&isTrapped(battle,0);
 return <main style={{'--game-scale':gameScale}}> <header><div><div className="eyebrow">MANOSABA POKEMON</div><h1>まのさばポケモン</h1></div><button className="badge help-button" onClick={()=>setInfo({})}>How to play</button></header>
 {!battle?<><SelectionTimer onExpire={expireSelection}/><div className="preview-top">
 <section className="enemy"><div><h3>CPUのパーティ</h3></div><div className="enemy-list">{parties[1].map(c=><div className="mini" key={c.id}><Portrait c={c} onInspect={c=>inspect(c,true)}/><span>{c.short}</span></div>)}</div></section></div>
 
 <div className="cards">{parties[0].map(c=><SelectionCard key={c.id} c={c} index={selected.indexOf(c.id)} full={selected.length===3} onSelect={toggle} onInspect={inspect} onItem={item=>setInfo({item})}/>)}</div>
 <div className="selection-bar" style={{justifyContent:'flex-end'}}><button className="primary" disabled={selected.length!==3||busy} onClick={beginBattle}>対戦開始</button></div>
 </>:<><div className={"arena"+(battle.psychicTerrain>0?" psychic-field":"")} style={{marginTop:10}}>{(battle.psychicTerrain>0||battle.gravity>0||battle.trickRoom>0)&&<div className="field-indicators">{battle.psychicTerrain>0&&<span className="field-psychic">サイコフィールド <strong>{battle.psychicTerrain}</strong>ターン</span>}{battle.trickRoom>0&&<span className="field-gravity">トリックルーム <strong>{battle.trickRoom}</strong>ターン</span>}{battle.gravity>0&&<span className="field-gravity">じゅうりょく <strong>{battle.gravity}</strong>ターン</span>}</div>}{[1,0].map(side=>{const c=active[side];return <div className={'fighter side'+side} key={side}><div className="fighter-info"><h2>{c.name} {c.status==='burn'&&<small style={{color:'#ff9870'}}>やけど</small>}{c.status==='poison'&&<small style={{color:'#c689e9'}}> どく</small>}{c.status==='toxic'&&<small style={{color:'#c689e9'}}> もうどく</small>}{c.drowsy>0&&<small style={{color:'#c9b5fb'}}> ねむけ</small>}{c.status==='freeze'&&<small style={{color:'#9ed9ef'}}> こおり</small>}{c.status==='sleep'&&<small style={{color:'#c9b5fb'}}> ねむり</small>}{c.confusion>0&&<small style={{color:'#f9df69'}}> 混乱</small>}{c.encoreTurns>0&&<small style={{color:'#f9df69'}}> アンコール {c.encoreTurns}T</small>}{c.taunted>0&&<small style={{color:'#f9df69'}}> 挑発 {c.taunted}T</small>}{c.subHp>0&&<small style={{color:'#a8dfc0'}}> 身代わり</small>}</h2><div className="fighter-meta"><div className="type-list">{c.types.map(t=><Type key={t} type={t}/>)}</div><div className="hp-number">HP {side===1?`${Math.ceil(c.hp/c.maxHp*100)}%`:`${c.hp} / ${c.maxHp}`}</div></div><div className="hp" key={c.id}><div style={{width:(c.hp/c.maxHp*100)+'%',background:c.hp/c.maxHp<.25?'#e26a6a':c.hp/c.maxHp<.5?'#e0b45d':'#69cf9c'}}/></div></div><Portrait c={c.subHp>0?{...c,id:'substitute'}:c} fainted={!!c.fainted} onInspect={()=>inspect(c,side===1)}/>{abilityNotice?.side===side&&<div className="ability-notice" role="status"><small>{c.name}の特性</small><strong>{abilityNotice.ability}</strong></div>}{itemNotice?.side===side&&<div className="ability-notice item-notice" role="status"><small>{c.name}の持ち物</small><strong>{itemNotice.item}</strong></div>}{statNotice?.side===side&&<div className={'stat-notice '+(statNotice.delta>0?'stage-up':'stage-down')} role="status"><span>{statNotice.stat}</span><span className="stat-notice-arrows">{(statNotice.delta>0?'▲':'▼').repeat(Math.abs(statNotice.delta))}</span></div>}</div>})}</div>
 <div className="log" aria-live="polite">{battle.logs.at(-1)}</div>
 {battle.winner!==null&&!busy?<section className="result"><h2>{battle.winner===0?'勝利！':'敗北…'}</h2><p>バトル終了</p><button className="primary" onClick={reset}>もう一度対戦する</button></section>:<section className="actions"><div className="tabs"><button className={tab==='move'?'on':''} disabled={busy||!active[0].hp||!!battle.pendingSwitch} onClick={()=>setTab('move')}>技を選ぶ</button><button className={tab==='switch'||!active[0].hp||battle.pendingSwitch?'on':''} disabled={busy||trapped} onClick={()=>setTab('switch')}>交代</button><BattleTimer busy={busy} turn={battle.turn}/></div>
 {!active[0].hp||battle.pendingSwitch||tab==='switch'?<><p>{active[0].hp?'交代する魔法少女を選択':'次に戦う魔法少女を選択'}</p><div className="switches">{battle.teams[0].map((c,i)=><button key={c.id} aria-disabled={busy||trapped||!c.hp||i===battle.active[0]} onClick={()=>{if(!busy&&!trapped&&c.hp&&i!==battle.active[0])act({kind:'switch',index:i})}}><Portrait c={c} fainted={!!c.fainted} onInspect={inspect}/><strong>{c.short}</strong><small className="switch-hp-number">{c.hp}/{c.maxHp} HP</small><div className="hp switch-hp" role="meter" aria-label="HP" aria-valuemin={0} aria-valuemax={c.maxHp} aria-valuenow={c.hp}><div style={{width:(c.hp/c.maxHp*100)+'%',background:c.hp/c.maxHp<.25?'#e26a6a':c.hp/c.maxHp<.5?'#e0b45d':'#69cf9c'}}/></div><span className={"held-item"+(!c.item?" spent":"")}>{items[c.item??c.initialItem]?.name??"持ち物なし"}</span></button>)}</div></>:<div className="moves">{(active[0].moves.some((m,i)=>canUseMove(active[0],i))?active[0].moves:[struggle]).map((m,k)=>{const i=m.struggle?-1:k;return <MoveButton key={active[0].id+':'+m.name} m={m} pp={active[0].pp?.[i]??m.pp} range={damageRange(battle,active[0],active[1],m)} disabled={busy} locked={!canUseMove(active[0],i)} onUse={()=>act({kind:'move',index:i})} onInspect={move=>setInfo({move})}/>})}</div>}</section>}
 </>}
 {info&&<InfoModal item={info.item} move={info.move} character={battle&&info.character?(battle.teams[info.opponent?1:0].find(c=>c.id===info.character.id)??info.character):info.character} onClose={closeInfo} inBattle={!!battle} opponent={info.opponent}/>}
 </main>
}
createRoot(document.getElementById('root')).render(<App/>);
