const names=['hit','explosion','cut','gun_shot','electrical_shot'];
let context=null;
const buffers=new Map(),pending=new Map();
const url=name=>'/sounds/attacks/'+name+'.mp3';
function load(name){
 if(!context)return Promise.resolve(null);
 if(buffers.has(name))return Promise.resolve(buffers.get(name));
 if(!pending.has(name)){
  pending.set(name,fetch(url(name)).then(r=>{if(!r.ok)throw Error('Missing sound');return r.arrayBuffer()}).then(data=>context.decodeAudioData(data)).then(buffer=>{buffers.set(name,buffer);return buffer}).catch(()=>null).finally(()=>pending.delete(name)));
 }
 return pending.get(name);
}
export function unlockAttackAudio(){
 try{
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext)return;
  context??=new AudioContext();
  if(context.state!=='running')context.resume().catch(()=>{});
  for(const name of names)load(name);
 }catch{}
}
export function playAttackSound(name){
 if(!names.includes(name))return;
 try{
  if(!context){const audio=new Audio(url(name));audio.volume=.6;audio.play().catch(()=>{});return}
  load(name).then(buffer=>{
   if(!buffer||context.state!=='running')return;
   const source=context.createBufferSource(),gain=context.createGain();
   source.buffer=buffer;gain.gain.value=.6;source.connect(gain);gain.connect(context.destination);source.start();
  }).catch(()=>{});
 }catch{}
}
