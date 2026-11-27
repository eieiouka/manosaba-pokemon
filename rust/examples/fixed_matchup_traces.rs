use manosaba_selfplay::{data,Action,Rng,State,FEATURES,predict};
use serde::Serialize;
use std::{collections::HashMap,fs,path::Path,time::Instant};
const HP:[i32;5]=[10,25,50,75,100];
const N:usize=13;
const LIMIT:usize=32;
fn mix(mut x:u64)->u32{x=x.wrapping_add(0x9e3779b97f4a7c15);x=(x^(x>>30)).wrapping_mul(0xbf58476d1ce4e5b9);x=(x^(x>>27)).wrapping_mul(0x94d049bb133111eb);(x^(x>>31))as u32}
fn trio(id:usize,r:&mut Rng)->[usize;3]{let mut rest:Vec<_>=(0..N).filter(|&x|x!=id).collect();let i=r.index(rest.len());let a=rest.swap_remove(i);let b=rest[r.index(rest.len())];[id,a,b]}
fn moves(s:&State,side:usize)->Vec<Action>{s.rank(side).into_iter().filter(|a|matches!(a,Action::Move(_))).collect()}
fn quick(s:&State,side:usize)->Action{moves(s,side).first().copied().unwrap_or(Action::Move(-1))}
fn outcome(s:&State)->Option<usize>{
 match (s.teams[0][0].hp>0,s.teams[1][0].hp>0){
  (true,false)=>Some(0),(false,true)=>Some(1),(false,false)=>Some(2),(true,true) if s.active!=[0,0]=>Some(3),_=>None
 }
}
fn v(s:&State,side:usize,w:&[f64])->f64{
 let base=match outcome(s){Some(0)=>1.,Some(1)=>-1.,Some(2)=>0.,_=>match s.winner{Some(0)=>1.,Some(1)=>-1.,None=>predict(&s.features(),w),_=>0.}};
 if side==0{base}else{-base}
}
fn learned(s:&State,side:usize,w:&[f64],r:&mut Rng)->Action{
 let own=moves(s,side);if own.len()<=1{return own.first().copied().unwrap_or(Action::Move(-1))}
 let foe=moves(s,1-side);if foe.is_empty(){return own[0]}
 let seed=r.0;r.next();let mut best=own[0];let mut top=f64::NEG_INFINITY;
 for a in own{let mut score=0.;for (j,&b) in foe.iter().take(2).enumerate(){let weight=if foe.len()==1{1.}else if j==0{0.65}else{0.35};
  for k in 0..2{let sd=mix(seed as u64^(k+1)*0x9e3779b9);let mut n=*s;n.step(if side==0{[a,b]}else{[b,a]},&mut Rng(sd));let first=v(&n,side,w);
   if outcome(&n).is_none()&&n.winner.is_none(){let acts=[quick(&n,0),quick(&n,1)];n.step(acts,&mut Rng(sd^0x84291));}
   score+=weight*0.5*(0.45*first+0.55*v(&n,side,w));
  }
 }if score>top{top=score;best=a}}
 best
}
#[derive(Clone,Copy)]
struct Condition{a:usize,b:usize,ha:usize,hb:usize,last:bool,stage_side:Option<usize>,stat:usize,stage:i32,learned:bool,samples:usize}
#[derive(Clone,Serialize)]
struct Turn{order:[usize;2],selected:[i32;2],attempted:[Option<i32>;2],hp:[i32;2],stage:[[i32;6];2],status:[i32;2]}
#[derive(Serialize)]
struct Trace{count:usize,outcome:usize,turns:Vec<Turn>}
#[derive(Serialize)]
struct Cell{a:usize,b:usize,hp:[i32;2],last:bool,stage_side:Option<usize>,stat:usize,stage:i32,policy:&'static str,samples:usize,outcomes:[usize;5],first_order:[usize;2],first_attempt:[usize;3],first_selected:[[usize;5];2],turns:usize,paths:Vec<Trace>}
fn code(a:Action)->i32{match a{Action::Move(i)=>i,_=>-2}}
fn simulate(c:Condition,w:&[f64],seed:u64,record:bool)->(usize,usize,[usize;2],[Option<i32>;2],[i32;2],Vec<Turn>){
 let mut r=Rng(mix(seed));let a=trio(c.a,&mut r);let b=trio(c.b,&mut r);let mut s=State::new(a,b);
 if c.last{for side in 0..2{for i in 1..3{s.teams[side][i].hp=0}if s.teams[side][0].id==0{s.teams[side][0].stages[3]=(s.teams[side][0].stages[3]+1).min(6)}}}
 for (side,h) in [(0,c.ha),(1,c.hb)]{let f=&mut s.teams[side][0];f.hp=(f.max()*HP[h]/100).max(1);}
 if let Some(side)=c.stage_side{let f=&mut s.teams[side][0];match c.stat{1..=5=>f.stages[c.stat]=c.stage,6=>f.accuracy=c.stage,7=>f.evasion=c.stage,8=>f.crit=c.stage,_=>{}}}
 let mut policy_rng=Rng(mix(seed^0x277136));let mut path=Vec::new();let mut first_order=[0,1];let mut first_attempt=[None,None];let mut first_selected=[-2,-2];
 for t in 0..LIMIT{
  let acts=std::array::from_fn(|side|if c.learned{learned(&s,side,w,&mut policy_rng)}else{quick(&s,side)});
  let selected=acts.map(code);let (order,attempted)=s.step_traced(acts,&mut r);
  if t==0{first_order=order;first_attempt=attempted;first_selected=selected;}
  if record{path.push(Turn{order,selected,attempted,hp:[s.teams[0][0].hp,s.teams[1][0].hp],stage:[s.teams[0][0].stages,s.teams[1][0].stages],status:[s.teams[0][0].status,s.teams[1][0].status]});}
  if let Some(o)=outcome(&s){return (o,t+1,first_order,first_attempt,first_selected,path)}
 }
 (4,LIMIT,first_order,first_attempt,first_selected,path)
}
fn cell(c:Condition,w:&[f64],seed:u64,record:bool)->Cell{
 let mut out=Cell{a:c.a,b:c.b,hp:[HP[c.ha],HP[c.hb]],last:c.last,stage_side:c.stage_side,stat:c.stat,stage:c.stage,policy:if c.learned{"learned-2x2"}else{"quick"},samples:c.samples,outcomes:[0;5],first_order:[0;2],first_attempt:[0;3],first_selected:[[0;5];2],turns:0,paths:vec![]};
 let mut paths:HashMap<String,Trace>=HashMap::new();
 for i in 0..c.samples{let (o,n,order,attempted,selected,path)=simulate(c,w,seed+i as u64,record);
  out.outcomes[o]+=1;out.turns+=n;out.first_order[order[0]]+=1;
  let first=order.iter().copied().find(|&i|attempted[i].is_some()).unwrap_or(2);out.first_attempt[first]+=1;
  for side in 0..2{if (-1..=3).contains(&selected[side]){out.first_selected[side][(selected[side]+1)as usize]+=1}}
  if record{let key=format!("{o}:{:?}",path.iter().map(|t|(t.order,t.selected,t.attempted)).collect::<Vec<_>>());
   paths.entry(key).and_modify(|p|p.count+=1).or_insert(Trace{count:1,outcome:o,turns:path});
  }
 }
 if record{let mut paths:Vec<_>=paths.into_iter().collect();paths.sort_by(|(ka,a),(kb,b)|b.count.cmp(&a.count).then(ka.cmp(kb)));out.paths=paths.into_iter().take(2).map(|(_,v)|v).collect();}
 assert_eq!(out.outcomes.iter().sum::<usize>(),c.samples);assert_eq!(out.first_order.iter().sum::<usize>(),c.samples);out
}
fn run(conditions:&[Condition],w:&[f64],workers:usize,seed:u64,record:bool)->Vec<Cell>{
 let jobs=std::thread::scope(|scope|{let mut tasks=vec![];for k in 0..workers{tasks.push(scope.spawn(move||{let mut rows=vec![];for i in (k..conditions.len()).step_by(workers){rows.push((i,cell(conditions[i],w,seed+i as u64*4096,record)))}rows}))}tasks.into_iter().flat_map(|x|x.join().unwrap()).collect::<Vec<_>>()});
 let mut jobs=jobs;jobs.sort_by_key(|(i,_)|*i);jobs.into_iter().map(|(_,row)|row).collect()
}
fn save(path:&Path,name:&str,conditions:&[Condition],w:&[f64],workers:usize,seed:u64,record:bool){
 let start=Instant::now();let rows=run(conditions,w,workers,seed,record);let trials=conditions.iter().map(|c|c.samples).sum::<usize>();fs::write(path.join(name),serde_json::to_vec(&rows).unwrap()).unwrap();println!("MATCHUP {} cells {} trials {} seconds {:.2}",name,rows.len(),trials,start.elapsed().as_secs_f64());
}
fn main(){
 let args:Vec<_>=std::env::args().collect();let path=Path::new(&args[1]);let workers:usize=args[2].parse().unwrap();assert!(workers>0);fs::create_dir_all(path).unwrap();
 let prior:serde_json::Value=serde_json::from_slice(&fs::read("analysis/sample-search-league-gen24.json").unwrap()).unwrap();
 let p=prior["pool"].as_array().unwrap().iter().find(|x|x["name"]=="wide2x16").unwrap();let w:Vec<f64>=serde_json::from_value(p["weights"].clone()).unwrap();assert_eq!(w.len(),FEATURES);
 let mut base=vec![];let mut hp=vec![];let mut stages=vec![];
 for a in 0..N{for b in 0..N{
  let c=Condition{a,b,ha:4,hb:4,last:false,stage_side:None,stat:0,stage:0,learned:false,samples:128};
  for last in [false,true]{base.push(Condition{last,..c});base.push(Condition{last,learned:true,samples:64,..c});}
  for ha in 0..5{for hb in 0..5{hp.push(Condition{ha,hb,samples:24,..c});}}
  for side in 0..2{for stat in 1..=8{for stage in -6..=6{if stage==0||stat==8&&(stage<1||stage>3){continue}stages.push(Condition{stage_side:Some(side),stat,stage,samples:24,..c});}}}
 }}
 let roster:Vec<_>=data().chars.iter().map(|c|serde_json::json!({"id":c.id,"stats":c.stats,"item":c.item,"moves":c.moves.iter().map(|m|&m.name).collect::<Vec<_>>()})).collect();
 fs::write(path.join("metadata.json"),serde_json::to_vec(&serde_json::json!({"schema":prior["schema"],"baseline_engine":prior["engine"],"model_weights":w,"roster":roster,"hp_bins":HP,"turn_limit":LIMIT,"outcomes":["a_ko_b","b_ko_a","double_ko","both_alive_pivot","limit"],"first_selected_index":"struggle,move0,move1,move2,move3","first_attempt":"a,b,none","stages":["unused","A","B","C","D","S","accuracy","evasion","crit"],"stage_interpretation":"absolute chosen stat after entry effects; others retain entry values","last_context":"both sides fresh full HP and other two allies fainted; EMA entry C+1 applied","scope":"no voluntary switches; pivot ends the initial encounter; reserves randomized, control uses rank heuristic, learned uses two-turn two replies two random samples on move-only policy; not solved optimal play","trace":"representative example from top two most frequent exact selected/attempted/order sequences; hp after end of turn, not mean"})).unwrap()).unwrap();
 save(path,"baseline.json",&base,&w,workers,0xe100_0000_0000,true);
 save(path,"hp-grid.json",&hp,&w,workers,0xe200_0000_0000,false);
 save(path,"stage-grid.json",&stages,&w,workers,0xe300_0000_0000,false);
}
