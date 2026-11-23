import React,{useState,useLayoutEffect,useEffect,useCallback,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {createPortal} from 'react-dom';
import {roster,types,colors,items} from './data.js';
import {start,resolveSequence,makeTeam,canUseMove} from './battle.js';
import './style.css';
import {unlockAttackAudio,playAttackSound} from './sounds.js';
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
 return <div className="portrait" onPointerDown={begin} onPointerMove={move} onPointerUp={cancelHold} onPointerCancel={cancelHold} onPointerLeave={cancelHold} onContextMenu={e=>e.preventDefault()} onClickCapture={e=>{if(pressed.current){e.preventDefault();e.stopPropagation();pressed.current=false}}} style={{'--accent':c.color,position:'relative',overflow:'hidden',...(ready?{background:'transparent',borderColor:'transparent'}:{})}}>
 {!ready&&<span>{c.mark}</span>}
 <img key={c.id} src={`/characters/${c.id}.png`} alt={c.name} onLoad={()=>setLoadedId(c.id)} onError={()=>setLoadedId(null)} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',visibility:ready&&!showFaint?'visible':'hidden',filter:fainted?'grayscale(1)':'none'}}/>
 {fainted&&<img key={c.id+'-down'} src={`/characters/${c.id}_down.png`} alt={c.name+'（瀕死）'} onLoad={()=>setFaintId(c.id)} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',visibility:showFaint?'visible':'hidden'}}/>}
 </div>
}
const statLabels=['HP','攻撃','防御','特攻','特防','素早さ'];
function StageMarks({stage=0}){
 const count=Math.min(6,Math.abs(Math.trunc(stage)||0));
 if(!count)return <span className="stage-neutral" aria-label="変化なし">－</span>;
 return <span className={'stage-marks '+(stage>0?'stage-up':'stage-down')} aria-label={`${stage>0?'上昇':'下降'}${count}段階`}>{Array.from({length:count},(_,i)=><span key={i}>{stage>0?'▲':'▼'}</span>)}</span>
}
function statRange(base,index){
 const min=index===0?base+60:Math.floor((base+5)*9/10);
 const max=index===0?base+107:Math.floor((base+52)*11/10);
 return <>{min}<span style={{color:"#fff"}}>～</span>{max}</>;
}
function ItemLabel({item,onInspect}){
 const hold=useRef(null),pressed=useRef(false),origin=useRef(null);
 const cancel=()=>{clearTimeout(hold.current);hold.current=null};
 useEffect(()=>()=>clearTimeout(hold.current),[]);
 if(!items[item])return <span className="held-item empty">持ち物なし</span>;
 return <span className="held-item" onPointerDown={e=>{if(e.button!==0)return;cancel();pressed.current=false;origin.current=[e.clientX,e.clientY];hold.current=setTimeout(()=>{pressed.current=true;onInspect(items[item])},500)}} onPointerMove={e=>{if(origin.current&&Math.hypot(e.clientX-origin.current[0],e.clientY-origin.current[1])>10)cancel()}} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onContextMenu={e=>e.preventDefault()} onClickCapture={e=>{if(pressed.current){pressed.current=false;e.preventDefault();e.stopPropagation()}}}>{items[item].name}</span>
}
function MoveButton({m,disabled,locked,onUse,onInspect}){
 const hold=useRef(null),pressed=useRef(false),origin=useRef(null);
 const cancel=()=>{clearTimeout(hold.current);hold.current=null};
 useEffect(()=>()=>clearTimeout(hold.current),[]);
 return <button type="button" className="move-button" disabled={disabled} aria-disabled={locked||undefined} onPointerDown={e=>{if(e.button!==0)return;cancel();pressed.current=false;origin.current=[e.clientX,e.clientY];hold.current=setTimeout(()=>{pressed.current=true;onInspect(m)},500)}} onPointerMove={e=>{if(origin.current&&Math.hypot(e.clientX-origin.current[0],e.clientY-origin.current[1])>10)cancel()}} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onContextMenu={e=>e.preventDefault()} onClick={e=>{if(pressed.current){pressed.current=false;e.preventDefault();return}if(!locked)onUse()}}><div><Type type={m.type}/><small>{m.category==='physical'?'物理':m.category==='status'?'変化':'特殊'}</small></div><strong>{m.name}</strong></button>
}
function InfoModal({character,move,item,onClose,inBattle,opponent=false}){
 const [statTab,setStatTab]=useState('base');
 const closeRef=useRef(null);
 useEffect(()=>{const previous=document.activeElement;closeRef.current?.focus();const key=e=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);previous?.focus?.()}},[onClose]);
 return createPortal(<div className="info-backdrop" onClick={onClose}><section role="dialog" aria-modal="true" aria-label={item?item.name+'の詳細':move?move.name+'の詳細':character?character.name+'の種族値':'How to play'} className="info-dialog" onClick={e=>e.stopPropagation()}>
 <div className="info-heading"><h2>{item?item.name:move?move.name:character?character.name:'How to play'}</h2><button ref={closeRef} className="ghost" onClick={onClose}>閉じる</button></div>
 {item?<><h3>持ち物の効果</h3><p>{item.description}</p></>:move?<><div className="type-list"><Type type={move.type}/><span>{move.category==='physical'?'物理':move.category==='status'?'変化':'特殊'}</span></div><dl className="stats-list move-stats"><div><dt>威力</dt><dd>{move.power||'－'}</dd></div><div><dt>命中</dt><dd>{move.accuracy??'－'}</dd></div></dl><h3>技の効果</h3><p>{move.description??(move.name==='かげうち'?'相手より先に攻撃する。':move.name==='サイコカッター'?'急所に当たりやすい攻撃。':'相手に'+(move.category==='physical'?'物理':'特殊')+'ダメージを与える。')}</p></>:character?<><div className="info-character"><Portrait c={character}/><div className="info-character-meta"><div className="type-list">{character.types.map(t=><Type key={t} type={t}/>)}</div>{inBattle&&!opponent&&<span className={"held-item"+(!character.item?" spent":"")}>{items[character.item??roster.find(c=>c.id===character.id)?.item]?.name??"持ち物なし"}</span>}</div></div>
 <div className="stat-tabs" role="group" aria-label="能力表示">{[['base','種族値'],['actual','実数値'],['stage','能力変化']].map(([id,label])=><button key={id} type="button" aria-pressed={statTab===id} className={statTab===id?'active':''} onClick={()=>setStatTab(id)}>{label}</button>)}</div>
 <dl className={'stats-list '+(statTab==='stage'?'stage-list':'')}>{statLabels.map((label,i)=><div key={label}><dt>{label}</dt><dd style={statTab==='actual'?{color:'#f48bbd',...(opponent?{whiteSpace:'nowrap'}:{})}:undefined}>{statTab==='base'?character.base[i]:statTab==='actual'?(opponent?statRange(character.base[i],i):(character.stats??makeTeam([character.id])[0].stats)[i]):<StageMarks stage={i===0?0:character.stages?.[i]??0}/>}</dd></div>)}</dl></>:<>
 {inBattle?<><h3>毎ターンの行動</h3><p>技を選ぶか、控えの魔法少女に交代します。基本的に素早さの高い側から行動しますが、先制技や交代は優先されます。</p>
 <h3>技の確認</h3><p>技ボタンを長押しすると、威力・命中・効果を確認できます。</p><h3>勝利条件</h3><p>魔法少女のHPが0になると倒れ、控えと交代します。相手の3人を全員倒すと勝利です。</p></>:<><h3>選出</h3><p>6人の魔法少女から、バトルに参加させる3人を選びます。1人目に選んだ魔法少女が最初に場に出ます。</p></>}
 {!inBattle&&<><h3>持ち物の確認</h3><p>持ち物名を長押しすると、効果を確認できます。</p></>}<h3>ステータスの確認</h3><p>立ち絵を長押しすると、魔法少女の種族値・実数値・能力変化を確認できます。</p>
 </>}
 </section></div>,document.body)
}
function SelectionTimer({onExpire}){
 const [seconds,setSeconds]=useState(60);
 useEffect(()=>{
  const deadline=Date.now()+60000;
  const tick=()=>{const remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));setSeconds(remaining);if(remaining===0){clearInterval(timer);onExpire()}};
  const timer=setInterval(tick,200);
  return()=>clearInterval(timer);
 },[onExpire]);
 return <div className="selection-heading"><span>3体選んでください</span><span className="selection-timer">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span></div>
}
function BattleTimer({busy}){
 const [seconds,setSeconds]=useState(30);
 useEffect(()=>{
  if(busy)return;
  setSeconds(30);
  const deadline=Date.now()+30000;
  const timer=setInterval(()=>{const remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));setSeconds(remaining);if(remaining===0)clearInterval(timer)},200);
  return()=>clearInterval(timer);
 },[busy]);
 return <time className="battle-timer" aria-label="残り時間">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</time>;
}
function App(){
 const [gameScale,setGameScale]=useState(1);
 const [info,setInfo]=useState(null);
 const closeInfo=useCallback(()=>setInfo(null),[]);
 const inspect=useCallback((c,opponent=false)=>setInfo({character:c,opponent}),[]);
 useLayoutEffect(()=>{const resize=()=>setGameScale(Math.min(1,window.innerWidth/920,window.innerHeight/640));resize();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[]);
 const [selected,setSelected]=useState([]),[battle,setBattle]=useState(null),[tab,setTab]=useState('move');
 const expireSelection=useCallback(()=>setBattle(b=>b??start(roster.slice(0,3).map(c=>c.id))),[]);
 const toggle=id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):s.length<3?[...s,id]:s);
 const [busy,setBusy]=useState(false);
 const busyRef=useRef(false),playbackTimer=useRef(null);
 useEffect(()=>()=>clearTimeout(playbackTimer.current),[]);
 const act=(action)=>{
  if(busyRef.current||!battle)return;
  unlockAttackAudio();
  const steps=resolveSequence(battle,action);
  if(!steps.length)return;
  busyRef.current=true;setBusy(true);setTab('move');
  const play=i=>{
   if(i>=steps.length){busyRef.current=false;setBusy(false);return}
   setBattle(steps[i].state);
   if(steps[i].sound)playAttackSound(steps[i].sound);
   playbackTimer.current=setTimeout(()=>play(i+1),steps[i].delay);
  };
  play(0);
 };
 const reset=()=>{setBattle(null);setSelected([]);setTab('move')};
 const active=battle?.teams.map((t,i)=>t[battle.active[i]]);
 return <main style={{'--game-scale':gameScale}}> <header><div><div className="eyebrow">MANOSABA POKEMON</div><h1>まのさばポケモン</h1></div><button className="badge help-button" onClick={()=>setInfo({})}>How to play</button></header>
 {!battle?<><SelectionTimer onExpire={expireSelection}/><div className="preview-top">
 <section className="enemy"><div><h3>CPUのパーティ</h3></div><div className="enemy-list">{roster.map(c=><div className="mini" key={c.id}><Portrait c={c} onInspect={c=>inspect(c,true)}/><span>{c.short}</span></div>)}</div></section></div>
 
 <div className="cards">{roster.map(c=>{const index=selected.indexOf(c.id);return <button key={c.id} className={'card '+(index>=0?'selected':'')} aria-disabled={index<0&&selected.length===3} onClick={()=>toggle(c.id)}><Portrait c={c} onInspect={inspect}/><div className="card-info"><strong>{c.name}</strong><div className="type-list">{c.types.map(t=><Type key={t} type={t}/>)}</div><ItemLabel item={c.item} onInspect={item=>setInfo({item})}/></div>{index>=0&&<span className="num" style={{fontSize:"var(--selection-number-size, 3.0375em)",lineHeight:1}}>{index+1}</span>}</button>})}</div>
 <div className="selection-bar" style={{justifyContent:'flex-end'}}><button className="primary" disabled={selected.length!==3} onClick={()=>{unlockAttackAudio();setBattle(b=>b??start(selected))}}>対戦開始</button></div>
 </>:<><div className="arena" style={{marginTop:10}}>{[1,0].map(side=>{const c=active[side];return <div className={'fighter side'+side} key={side}><div className="fighter-info"><h2>{c.name} </h2><div className="fighter-meta"><div className="type-list">{c.types.map(t=><Type key={t} type={t}/>)}</div><div className="hp-number">HP {side===1?`${Math.ceil(c.hp/c.maxHp*100)}%`:`${c.hp} / ${c.maxHp}`}</div></div><div className="hp" key={c.id}><div style={{width:(c.hp/c.maxHp*100)+'%',background:c.hp/c.maxHp<.25?'#e26a6a':c.hp/c.maxHp<.5?'#e0b45d':'#69cf9c'}}/></div></div><Portrait c={c} fainted={!!c.fainted} onInspect={c=>inspect(c,side===1)}/></div>})}</div>
 <div className="log" aria-live="polite">{battle.logs.at(-1)}</div>
 {battle.winner!==null&&!busy?<section className="result"><h2>{battle.winner===0?'勝利！':'敗北…'}</h2><p>バトル終了</p><button className="primary" onClick={reset}>もう一度対戦する</button></section>:<section className="actions"><div className="tabs"><button className={tab==='move'?'on':''} disabled={busy||!active[0].hp} onClick={()=>setTab('move')}>技を選ぶ</button><button className={tab==='switch'||!active[0].hp?'on':''} disabled={busy} onClick={()=>setTab('switch')}>交代</button><BattleTimer busy={busy}/></div>
 {!active[0].hp||tab==='switch'?<><p>{active[0].hp?'交代する魔法少女を選択':'次に戦う魔法少女を選択'}</p><div className="switches">{battle.teams[0].map((c,i)=><button key={c.id} aria-disabled={busy||!c.hp||i===battle.active[0]} onClick={()=>{if(!busy&&c.hp&&i!==battle.active[0])act({kind:'switch',index:i})}}><Portrait c={c} onInspect={inspect}/><strong>{c.short}</strong><small>{c.hp}/{c.maxHp} HP</small></button>)}</div></>:<div className="moves">{active[0].moves.map((m,i)=><MoveButton key={active[0].id+':'+m.name} m={m} disabled={busy} locked={!canUseMove(active[0],i)} onUse={()=>act({kind:'move',index:i})} onInspect={move=>setInfo({move})}/>)}</div>}</section>}
 </>}
 {info&&<InfoModal item={info.item} move={info.move} character={info.character} onClose={closeInfo} inBattle={!!battle} opponent={info.opponent}/>}
 </main>
}
createRoot(document.getElementById('root')).render(<App/>);
