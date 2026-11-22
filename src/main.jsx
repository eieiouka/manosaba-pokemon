import React,{useState,useLayoutEffect,useEffect,useCallback,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {roster,types,colors} from './data.js';
import {start,resolveSequence} from './battle.js';
import './style.css';
function Type({type}){return <span className="type" style={{background:colors[type]}}>{types[type]}</span>}
function Portrait({c,fainted=false}){
 const [loadedId,setLoadedId]=useState(null);
 const ready=loadedId===c.id;
 const [faintId,setFaintId]=useState(null);
 const showFaint=fainted&&faintId===c.id;
 return <div className="portrait" style={{'--accent':c.color,position:'relative',overflow:'hidden',...(ready?{background:'transparent',borderColor:'transparent'}:{})}}>
 {!ready&&<span>{c.mark}</span>}
 <img key={c.id} src={`/characters/${c.id}.png`} alt={c.name} onLoad={()=>setLoadedId(c.id)} onError={()=>setLoadedId(null)} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',visibility:ready&&!showFaint?'visible':'hidden',filter:fainted?'grayscale(1)':'none'}}/>
 {fainted&&<img key={c.id+'-down'} src={`/characters/${c.id}_down.png`} alt={c.name+'（瀕死）'} onLoad={()=>setFaintId(c.id)} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',visibility:showFaint?'visible':'hidden'}}/>}
 </div>
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
function App(){
 const [gameScale,setGameScale]=useState(1);
 useLayoutEffect(()=>{const resize=()=>setGameScale(Math.min(1,window.innerWidth/920,window.innerHeight/640));resize();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[]);
 const [selected,setSelected]=useState([]),[battle,setBattle]=useState(null),[tab,setTab]=useState('move');
 const expireSelection=useCallback(()=>setBattle(b=>b??start(roster.slice(0,3).map(c=>c.id))),[]);
 const toggle=id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):s.length<3?[...s,id]:s);
 const [busy,setBusy]=useState(false);
 const busyRef=useRef(false),playbackTimer=useRef(null);
 useEffect(()=>()=>clearTimeout(playbackTimer.current),[]);
 const act=(action)=>{
  if(busyRef.current||!battle)return;
  const steps=resolveSequence(battle,action);
  if(!steps.length)return;
  busyRef.current=true;setBusy(true);setTab('move');
  const play=i=>{
   if(i>=steps.length){busyRef.current=false;setBusy(false);return}
   setBattle(steps[i].state);
   playbackTimer.current=setTimeout(()=>play(i+1),steps[i].delay);
  };
  play(0);
 };
 const reset=()=>{setBattle(null);setSelected([]);setTab('move')};
 const active=battle?.teams.map((t,i)=>t[battle.active[i]]);
 return <main style={{'--game-scale':gameScale}}> <header><div><div className="eyebrow">MANOSABA POKEMON</div><h1>まのさばポケモン</h1></div><div className="badge">SINGLE</div></header>
 {!battle?<><SelectionTimer onExpire={expireSelection}/><div className="preview-top">
 <section className="enemy"><div><h3>CPUのパーティ</h3></div><div className="enemy-list">{roster.map(c=><div className="mini" key={c.id}><Portrait c={c}/><span>{c.short}</span></div>)}</div></section></div>
 
 <div className="cards">{roster.map(c=>{const index=selected.indexOf(c.id);return <button key={c.id} className={'card '+(index>=0?'selected':'')} disabled={index<0&&selected.length===3} onClick={()=>toggle(c.id)}><Portrait c={c}/><div className="card-info"><strong>{c.name}</strong><div className="type-list">{c.types.map(t=><Type key={t} type={t}/>)}</div></div>{index>=0&&<span className="num" style={{fontSize:"2.025em",lineHeight:1}}>{index+1}</span>}</button>})}</div>
 <div className="selection-bar" style={{justifyContent:'flex-end'}}><button className="primary" disabled={selected.length!==3} onClick={()=>setBattle(b=>b??start(selected))}>対戦開始</button></div>
 </>:<><div className="arena" style={{marginTop:10}}>{[1,0].map(side=>{const c=active[side];return <div className={'fighter side'+side} key={side}><div className="fighter-info"><h2>{c.name} </h2><div className="type-list">{c.types.map(t=><Type key={t} type={t}/>)}</div><div className="hp"><div style={{width:(c.hp/c.maxHp*100)+'%',background:c.hp/c.maxHp<.25?'#e26a6a':c.hp/c.maxHp<.5?'#e0b45d':'#69cf9c'}}/></div><div className="hp-number">HP {side===1?`${Math.ceil(c.hp/c.maxHp*100)}%`:`${c.hp} / ${c.maxHp}`}</div></div><Portrait c={c} fainted={!!c.fainted}/></div>})}</div>
 <div className="log" aria-live="polite">{battle.logs.at(-1)}</div>
 {battle.winner!==null&&!busy?<section className="result"><h2>{battle.winner===0?'勝利！':'敗北…'}</h2><p>バトル終了</p><button className="primary" onClick={reset}>もう一度対戦する</button></section>:<section className="actions"><div className="tabs"><button className={tab==='move'?'on':''} disabled={busy||!active[0].hp} onClick={()=>setTab('move')}>技を選ぶ</button><button className={tab==='switch'||!active[0].hp?'on':''} disabled={busy} onClick={()=>setTab('switch')}>交代</button></div>
 {!active[0].hp||tab==='switch'?<><p>{active[0].hp?'交代する魔法少女を選択':'次に戦う魔法少女を選択'}</p><div className="switches">{battle.teams[0].map((c,i)=><button key={c.id} disabled={busy||!c.hp||i===battle.active[0]} onClick={()=>act({kind:'switch',index:i})}><Portrait c={c}/><strong>{c.short}</strong><small>{c.hp}/{c.maxHp} HP</small></button>)}</div></>:<div className="moves">{active[0].moves.map((m,i)=><button key={m.name} disabled={busy} onClick={()=>act({kind:'move',index:i})}><div><Type type={m.type}/><small>{m.category==='physical'?'物理':'特殊'}</small></div><strong>{m.name}</strong></button>)}</div>}</section>}
 </>}
 </main>
}
createRoot(document.getElementById('root')).render(<App/>);
