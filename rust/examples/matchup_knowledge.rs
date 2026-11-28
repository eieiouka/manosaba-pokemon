// League self-play with frozen opponents and held-out Elo comparisons.
use manosaba_selfplay::{data,Action,Rng,State,FEATURES,predict};
use serde::{Deserialize,Serialize};
use std::{fs,path::Path,time::Instant};
type Trio=[usize;3];
#[derive(Clone,Serialize,Deserialize)]
struct Player{name:String,mode:String,games:u64,weights:Vec<f64>}
#[derive(Clone,Serialize,Deserialize)]
struct Match{a:usize,b:usize,games:u64,wins:u64,draws:u64}
#[derive(Serialize,Deserialize)]
struct League{schema:String,engine:String,pool:Vec<Player>,matches:Vec<Match>,champion:usize,elo:Vec<f64>,generation:u64,trained:u64}
fn mix(mut x:u64)->u32{x=x.wrapping_add(0x9e3779b97f4a7c15);x=(x^(x>>30)).wrapping_mul(0xbf58476d1ce4e5b9);x=(x^(x>>27)).wrapping_mul(0x94d049bb133111eb);(x^(x>>31))as u32}
fn rng(x:u64)->Rng{Rng(mix(x))}
fn team(r:&mut Rng)->Trio{let mut a=std::array::from_fn::<_,13,_>(|i|i);for i in (1..13).rev(){a.swap(i,r.index(i+1))}[a[0],a[1],a[2]]}

// Public six-member preview selection using the generation-15 3v3 payoff table.
const MATRIX:&[u8]=include_bytes!("../../public/ai-selection-gen15.bin");
const N:usize=1716;
fn six(r:&mut Rng)->[usize;6]{let mut a=std::array::from_fn::<_,13,_>(|i|i);for i in (1..13).rev(){a.swap(i,r.index(i+1))}a[..6].try_into().unwrap()}
fn idx(a:usize,b:usize,c:usize)->usize{a*132+(b-(b>a)as usize)*11+c-(c>a)as usize-(c>b)as usize}
fn choices(p:[usize;6])->Vec<(usize,Trio)>{let mut t=vec![];for a in p{for b in p{if a==b{continue}for c in p{if a!=c&&b!=c{t.push((idx(a,b,c),[a,b,c]))}}}}t.sort_by_key(|x|x.0);t}
fn payoff(i:usize,j:usize)->f64{let k=i*N+j;((MATRIX[k/3] as usize/[1,5,25][k%3])%5)as f64/4.}
fn preview_pair(r:&mut Rng,x:&Player,y:&Player,defense:bool)->(Trio,Trio){
 let a=six(r);let b=if defense{[6,7,8,11,12,1]}else{six(r)};let ac=choices(a);let bc=choices(b);let m=120;let mut pay=vec![0.;m*m];let mut ar=vec![0.;m];let mut br=vec![0.;m];
 for i in 0..m{for j in 0..m{let v=payoff(ac[i].0,bc[j].0);pay[i*m+j]=v;ar[i]+=v/m as f64;br[j]+=v/m as f64}}
 for i in 0..m{for j in 0..m{pay[i*m+j]=0.8*pay[i*m+j]+0.1*ar[i]+0.1*br[j]}}
 let mut av=vec![0.;m];let mut bv=vec![0.;m];let mut aa=[0usize;32];let mut bb=[0usize;32];
 for t in 0..32{let mut i0=0;let mut j0=0;let mut hi=f64::NEG_INFINITY;let mut lo=f64::INFINITY;for i in 0..m{let v=0.25*ar[i]+0.75*if t==0{ar[i]}else{av[i]/t as f64};if v>hi{hi=v;i0=i}}for j in 0..m{let v=0.25*br[j]+0.75*if t==0{br[j]}else{bv[j]/t as f64};if v<lo{lo=v;j0=j}}
 aa[t]=i0;bb[t]=j0;for i in 0..m{av[i]+=pay[i*m+j0]}for j in 0..m{bv[j]+=pay[i0*m+j]}}
 let weak=|p:&Player|p.mode=="quick"||p.mode=="weak";
 let own=if weak(x){[a[0],a[1],a[2]]}else{ac[aa[r.index(32)]].1};
 let opposing=if defense{let valid:Vec<_>=bc.iter().filter(|(_,t)|t.iter().filter(|&&i|matches!(i,6|7|8|11)).count()>=2).collect();valid[r.index(valid.len())].1}else if weak(y){[b[0],b[1],b[2]]}else{bc[bb[r.index(32)]].1};(own,opposing)
}

fn value(s:&State,side:usize,w:&[f64])->f64{let v=match s.winner{Some(0)=>1.,Some(1)=>-1.,_=>predict(&s.features(),w)};if side==0{v}else{-v}}
fn step(s:&State,side:usize,a:Action,b:Action,seed:u32)->State{let mut n=*s;n.step(if side==0{[a,b]}else{[b,a]},&mut Rng(seed));n}
fn smart(s:&State,side:usize,w:&[f64],r:&mut Rng)->Action{
    let own=s.rank(side);if own.len()==1{return own[0]}
    let mut foe=s.rank(1-side);foe.truncate(2);let weights=if foe.len()==1{vec![1.]}else{vec![0.65,0.35]};
    let seed=r.0.wrapping_add(0x921);r.next();let mut scored=vec![];
    for &a in &own{let mut v=0.;for (j,&b) in foe.iter().enumerate(){let n=step(s,side,a,b,seed);v+=weights[j]*value(&n,side,w);}scored.push((a,v));}
    scored.sort_by(|a,b|b.1.total_cmp(&a.1));
    // Near ties and tactical switching/setup: two-turn check, using a fresh random draw.
    if scored[0].1-scored[1].1<0.16 || matches!(scored[0].0,Action::Switch(_)) {
        let mut best=scored[0].0;let mut top=f64::NEG_INFINITY;
        for &(a,prior) in scored.iter().take(2){let mut v=0.;for (j,&b) in foe.iter().enumerate(){let mut n=step(s,side,a,b,seed^0x84291);if n.winner.is_none(){let q=[n.quick(0),n.quick(1)];n.step(q,&mut Rng(seed^0x785ab));}v+=weights[j]*value(&n,side,w);}let score=0.45*prior+0.55*v;if score>top{top=score;best=a}}return best
    }scored[0].0
}
// Root candidates use two opponent replies and two independent chance draws.
// Subsequent turns use tactical rollout; blended horizon estimates limit overcommitment.
fn deep(s:&State,side:usize,w:&[f64],r:&mut Rng,depth:usize)->Action{
 let own=s.rank(side);if own.len()==1{return own[0]}
 let mut foe=s.rank(1-side);foe.truncate(2);
 let seeds=[r.0.wrapping_add(0x91f),r.0^0x6a09e667];r.next();
 let mut best=own[0];let mut top=f64::NEG_INFINITY;
 for a in own {
  let mut score=0.;
  for (j,&b) in foe.iter().enumerate(){
   let weight=if foe.len()==1{1.}else if j==0{0.65}else{0.35};
   for seed in seeds {
    let mut n=step(s,side,a,b,seed);
    let immediate=value(&n,side,w);let mut sum=immediate;
    for t in 1..depth {
     if n.winner.is_none(){let q=[n.quick(0),n.quick(1)];n.step(q,&mut Rng(seed.wrapping_add((t as u32).wrapping_mul(0x9e3779b9))));}
     sum+=value(&n,side,w);
    }
    score+=weight*0.5*(0.25*immediate+0.25*sum/depth as f64+0.50*value(&n,side,w));
   }
  }
  if score>top{top=score;best=a}
 }
 best
}
// Compare width/sample variance separately; learned rollout uses frozen champion weights.
fn wide(s:&State,side:usize,w:&[f64],r:&mut Rng,width:usize,samples:usize,learned_rollout:bool)->Action{
 let own=s.rank(side);if own.len()==1{return own[0]}
 let mut foe=s.rank(1-side);foe.truncate(width);
 let seed=r.0;r.next();
 let norm=(0..foe.len()).map(|j|0.6_f64.powi(j as i32)).sum::<f64>();
 let mut best=own[0];let mut top=f64::NEG_INFINITY;
 for a in own{
  let mut score=0.;
  for (j,&b) in foe.iter().enumerate(){
   let weight=0.6_f64.powi(j as i32)/norm/samples as f64;
   for k in 0..samples{
    let sd=mix(seed as u64 ^ ((k as u64+1)*0x9e3779b9));
    let mut n=step(s,side,a,b,sd);let immediate=value(&n,side,w);
    if n.winner.is_none(){
      let mut q=Rng(sd^0x482913);
      let acts=if learned_rollout{[smart(&n,0,w,&mut q),smart(&n,1,w,&mut q)]}else{[n.quick(0),n.quick(1)]};
      n.step(acts,&mut Rng(sd^0x84351));
    }
    score+=weight*(0.45*immediate+0.55*value(&n,side,w));
   }
  }
  if score>top{top=score;best=a}
 }
 best
}


#[derive(Deserialize)]
struct Cell{a:usize,b:usize,hp:[usize;2],last:bool,stage_side:Option<usize>,stat:usize,stage:i32,policy:String,samples:usize,outcomes:[usize;5]}
struct Knowledge{base:Vec<f64>,hp:Vec<f64>,stage:Vec<f64>}
static KNOW:std::sync::OnceLock<Knowledge>=std::sync::OnceLock::new();
fn table_score(r:&Cell)->f64{(r.outcomes[0] as f64-r.outcomes[1] as f64)/(r.samples as f64+8.)}
fn stage_idx(a:usize,b:usize,side:usize,stat:usize,rank:i32)->usize{(((a*13+b)*2+side)*9+stat)*13+(rank+6)as usize}
fn load_knowledge(path:&Path)->Knowledge{
 let read=|name:&str|->Vec<Cell>{serde_json::from_slice(&fs::read(path.join(name)).unwrap()).unwrap()};
 let mut k=Knowledge{base:vec![0.;338],hp:vec![0.;4225],stage:vec![0.;13*13*2*9*13]};
 let base=read("baseline.json");let hp=read("hp-grid.json");let stage=read("stage-grid.json");
 assert_eq!((base.len(),hp.len(),stage.len()),(676,4225,29406));
 let bins=[10,25,50,75,100];for r in base.iter().filter(|r|r.policy=="learned-2x2"){k.base[(r.a*13+r.b)*2+r.last as usize]=table_score(r)}
 for r in hp{let a=bins.iter().position(|&v|v==r.hp[0]).unwrap();let b=bins.iter().position(|&v|v==r.hp[1]).unwrap();k.hp[(r.a*13+r.b)*25+a*5+b]=table_score(&r);}
 for r in stage{k.stage[stage_idx(r.a,r.b,r.stage_side.unwrap(),r.stat,r.stage)]=table_score(&r);}
 k
}
fn bin(h:f64)->(usize,usize,f64){let bins=[0.10,0.25,0.50,0.75,1.0];for i in 0..4{if h<=bins[i+1]{return(i,i+1,((h-bins[i])/(bins[i+1]-bins[i])).clamp(0.,1.))}}(4,4,0.)}
fn lookup(k:&Knowledge,a:manosaba_selfplay::Fighter,b:manosaba_selfplay::Fighter,last:bool)->f64{
 let p=a.id*13+b.id;let ah=a.hp as f64/a.max()as f64;let bh=b.hp as f64/b.max()as f64;
 let (i,j,t)=bin(ah);let (u,v,z)=bin(bh);let get=|i,j|k.hp[p*25+i*5+j];
 let hp=(1.-t)*((1.-z)*get(i,u)+z*get(i,v))+t*((1.-z)*get(j,u)+z*get(j,v));
 let full=get(4,4);let mut delta=0.;let mut n=0.;
 for (side,c,other) in [(0,a,b),(1,b,a)]{for (stat,rank) in [(1,c.stages[1]),(2,c.stages[2]),(3,c.stages[3]),(4,c.stages[4]),(5,c.stages[5]),(6,c.accuracy),(7,c.evasion),(8,c.crit)]{
 // The grid overwrites one absolute stage after entry. Skip the default entry debuff and EMA last boost.
 let default=if other.id==6&&(stat==1||stat==3){-1}else if last&&c.id==0&&stat==3{1}else{0};
 if rank==default||rank==0||stat==8&&!(1..=3).contains(&rank){continue}
 delta+=k.stage[stage_idx(a.id,b.id,side,stat,rank.clamp(-6,6))]-full;n+=1.;
 }}
 let correction=if n>0.{(delta/n.max(1.0_f64).sqrt()).clamp(-1.,1.)}else{0.};
 (k.base[p*2+last as usize]+0.7*(hp-full)+0.5*correction).clamp(-1.,1.)
}
fn knowledge_value(s:&State,side:usize,w:&[f64],weight:f64)->f64{
 let base=value(s,side,w);if s.winner.is_some(){return base}let a=s.a(side);let b=s.a(1-side);if a.hp<=0||b.hp<=0{return base}
 let last=s.teams.iter().all(|t|t.iter().filter(|c|c.hp>0).count()==1);
 let k=KNOW.get().unwrap();let pair=(lookup(k,a,b,last)-lookup(k,b,a,last))*0.5;
 // Fresh-matchup records do not describe status, locks, spent items, substitutes or fields.
 let mut confidence=1.;for c in [a,b]{if c.status!=0||c.sub>0||c.taunt>0||c.encore>0||c.locked>=0||c.confusion>0||c.silence>0||!c.item{confidence*=0.5}}
 if s.terrain>0||s.gravity>0||s.trick>0{confidence*=0.5}
 (base+weight*confidence*pair*(1.-base.abs())).clamp(-1.,1.)
}
fn wide_knowledge(s:&State,side:usize,w:&[f64],r:&mut Rng,width:usize,samples:usize,learned_rollout:bool,weight:f64)->Action{
 let own=s.rank(side);if own.len()==1{return own[0]}
 let mut foe=s.rank(1-side);foe.truncate(width);
 let seed=r.0;r.next();
 let norm=(0..foe.len()).map(|j|0.6_f64.powi(j as i32)).sum::<f64>();
 let mut best=own[0];let mut top=f64::NEG_INFINITY;
 for a in own{
  let mut score=0.;
  for (j,&b) in foe.iter().enumerate(){
   let weight=0.6_f64.powi(j as i32)/norm/samples as f64;
   for k in 0..samples{
    let sd=mix(seed as u64 ^ ((k as u64+1)*0x9e3779b9));
    let mut n=step(s,side,a,b,sd);let immediate=knowledge_value(&n,side,w,weight);
    if n.winner.is_none(){
      let mut q=Rng(sd^0x482913);
      let acts=if learned_rollout{[smart(&n,0,w,&mut q),smart(&n,1,w,&mut q)]}else{[n.quick(0),n.quick(1)]};
      n.step(acts,&mut Rng(sd^0x84351));
    }
    score+=weight*(0.45*immediate+0.55*knowledge_value(&n,side,w,weight));
   }
  }
  if score>top{top=score;best=a}
 }
 best
}

// Explicit defensive policy, as an additional opponent (not claimed to be optimal).
fn defensive(a:manosaba_selfplay::Fighter)->bool{
 a.hp>0&&a.c().moves.iter().enumerate().any(|(i,m)|a.usable(i)&&(m.recover||m.rest||m.toxic||m.clairvoyance||m.amnesia||m.calm_mind))
}
fn defensive_action(s:&State,side:usize)->Option<Action>{
 let a=s.a(side);let d=s.a(1-side);if !defensive(a)||d.hp<=0{return None}
 let legal=s.rank(side);
 let choose=|predicate:&dyn Fn(&manosaba_selfplay::Move)->bool|legal.iter().copied().find(|x|matches!(x,Action::Move(i) if *i>=0&&predicate(&a.c().moves[*i as usize])));
 if a.hp*2<=a.max(){if let Some(m)=choose(&|m|m.recover||m.rest&&a.status!=2){return Some(m)}}
 if d.status==4&&a.protect!=s.turn-1{if let Some(m)=choose(&|m|m.protect){return Some(m)}}
 if d.status==0&&d.id!=12&&!d.c().types.contains(&7)&&!d.c().types.contains(&16)&&d.sub==0{if let Some(m)=choose(&|m|m.toxic){return Some(m)}}
 None
}
fn anti(s:&State,side:usize,w:&[f64],r:&mut Rng,depth:usize)->Action{
 if !defensive(s.a(1-side)){return wide(s,side,w,r,2,16,false)}
 let own=s.rank(side);if own.len()<=1{return own[0]}
 let ranked=s.rank(1-side);let mut foe:Vec<Action>=ranked.iter().take(2).copied().collect();
 let d=s.a(1-side);
 if let Some(a)=defensive_action(s,1-side){if !foe.contains(&a){foe.push(a)}}
 for &a in &ranked{if foe.len()>=4{break}if foe.contains(&a){continue}if let Action::Move(i)=a{if i>=0{let m=&d.c().moves[i as usize];if m.recover||m.rest||m.protect||m.toxic||m.clairvoyance||m.amnesia||m.calm_mind||m.taunt||m.substitute{foe.push(a)}}}}
 for &a in &ranked{if foe.len()>=4{break}if !foe.contains(&a){foe.push(a)}}
 if foe.is_empty(){return own[0]}let samples=(32/foe.len()).max(1);let seed=r.0;r.next();
 let norm=(0..foe.len()).map(|j|0.7_f64.powi(j as i32)).sum::<f64>();
 let mut best=own[0];let mut top=f64::NEG_INFINITY;
 for a in own{let mut score=0.;for (j,&b) in foe.iter().enumerate(){let weight=0.7_f64.powi(j as i32)/norm/samples as f64;
  for k in 0..samples{let sd=mix(seed as u64^((k as u64+1)*0x9e3779b9));let mut n=step(s,side,a,b,sd);let immediate=value(&n,side,w);
   for t in 1..depth{if n.winner.is_some(){break}let acts=std::array::from_fn(|i|defensive_action(&n,i).unwrap_or_else(||n.quick(i)));n.step(acts,&mut Rng(sd.wrapping_add((t as u32).wrapping_mul(0x9e3779b9))));}
   score+=weight*(0.45*immediate+0.55*value(&n,side,w));
  }
 }if score>top{top=score;best=a}}
 best
}
fn policy(s:&State,side:usize,p:&Player,r:&mut Rng)->Action{
 match p.mode.as_str(){"book05"=>wide_knowledge(s,side,&p.weights,r,2,16,false,0.05),"book15"=>wide_knowledge(s,side,&p.weights,r,2,16,false,0.15),"stall"=>defensive_action(s,side).unwrap_or_else(||wide(s,side,&p.weights,r,2,16,false)),_=>wide(s,side,&p.weights,r,2,16,false)}
}
fn game(a:Trio,b:Trio,x:&Player,y:&Player,seed:u64)->(Option<usize>,usize){
 let mut s=State::new(a,b);let mut r=rng(seed^0x1234);let mut q=rng(seed^0x1592);let mut e=rng(seed^0x6713);
 for t in 0..120{if s.winner.is_some(){return (s.winner,t)}let acts=[policy(&s,0,x,&mut q),policy(&s,1,y,&mut e)];s.step(acts,&mut r);}
 (s.winner,120)
}
#[derive(Serialize)]
struct ResultRow{policy:String,scenario:String,games:u64,wins:u64,draws:u64,turns:u64,games_per_sec:f64}
fn evaluate(x:&Player,y:&Player,scenario:usize,workers:usize,n:u64)->ResultRow{
 let start=Instant::now();let results=std::thread::scope(|s|{let mut jobs=vec![];for k in 0..workers{jobs.push(s.spawn(move||{let mut wins=0;let mut draws=0;let mut turns=0;for i in (k as u64..n).step_by(workers){let sd=0xe900_0000_0000+scenario as u64*100_000+i/2;let mut r=rng(sd);let (a,b)=preview_pair(&mut r,x,y,scenario>0);let side=(i%2)as usize;
  let (w,t)=if side==0{game(a,b,x,y,sd^0x975)}else{game(b,a,y,x,sd^0x348)};wins+=(w==Some(side))as u64;draws+=w.is_none()as u64;turns+=t as u64;
 }(wins,draws,turns)}))}jobs.into_iter().map(|j|j.join().unwrap()).collect::<Vec<_>>()});
 let row=ResultRow{policy:x.name.clone(),scenario:["ordinary","defensive-team","defensive-stall-policy"][scenario].into(),games:n,wins:results.iter().map(|x|x.0).sum(),draws:results.iter().map(|x|x.1).sum(),turns:results.iter().map(|x|x.2).sum(),games_per_sec:n as f64/start.elapsed().as_secs_f64()};
 println!("BOOK {} {} games {} wins {} draws {} score {:.5} mean_turns {:.2} games_per_sec {:.2}",row.policy,row.scenario,n,row.wins,row.draws,(row.wins as f64+0.5*row.draws as f64)/n as f64,row.turns as f64/n as f64,row.games_per_sec);row
}
fn main(){
 let args:Vec<_>=std::env::args().collect();let path=Path::new(&args[1]);let workers:usize=args[2].parse().unwrap();let games:u64=args[3].parse().unwrap();
 let prior:League=serde_json::from_slice(&fs::read("analysis/sample-search-league-gen24.json").unwrap()).unwrap();
 let base=prior.pool.iter().find(|p|p.name=="wide2x16").unwrap().clone();assert_eq!(base.weights.len(),FEATURES);assert!(workers>0&&games>0);
 KNOW.set(load_knowledge(Path::new(&args[4]))).ok().unwrap();
 let mut policies=vec![base.clone()];for mode in ["book05","book15"]{let mut p=base.clone();p.name=mode.into();p.mode=mode.into();policies.push(p)}
 let mut stall=base.clone();stall.mode="stall".into();
 fs::create_dir_all(path).unwrap();let mut rows=vec![];
 for scenario in 0..3{for p in &policies{rows.push(evaluate(p,if scenario==2{&stall}else{&base},scenario,workers,games));fs::write(path.join("results.json"),serde_json::to_vec(&serde_json::json!({"schema":prior.schema,"engine":prior.engine,"weights":base.weights,"games_per_condition":games,"defensive_roster":[6,7,8,11,12,1],"minimum_defensive_members":2,"turn_limit":120,"source_run":45975142382,"lookup_weights":[0.05,0.15],"results":rows})).unwrap()).unwrap();}}
}
