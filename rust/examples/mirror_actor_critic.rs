// Fixed-team, fully observed mirror self-play with a small actor-critic network.
// Independent held-out evaluation seeds; no production assets or game changes.
use manosaba_selfplay::{Action,Rng,State,FEATURES,predict};
use serde::{Serialize,Deserialize};
use std::{fs,path::Path,time::Instant};
const TEAM:[usize;3]=[1,2,0]; // Sherry / Hanna / Emma; identical order on both sides.
const ACTIONS:usize=8; // move 0..3, switch 0..2, struggle
const H:usize=48;
const OUT:usize=ACTIONS+1;
const LIMIT:usize=120;
const BATCH:usize=64;
fn mix(mut x:u64)->u32{x=x.wrapping_add(0x9e3779b97f4a7c15);x=(x^(x>>30)).wrapping_mul(0xbf58476d1ce4e5b9);x=(x^(x>>27)).wrapping_mul(0x94d049bb133111eb);(x^(x>>31))as u32}
fn rng(x:u64)->Rng{Rng(mix(x))}
fn code(a:Action)->usize{match a{Action::Move(i) if i>=0=>i as usize,Action::Move(_)=>7,Action::Switch(i)=>4+i}}
fn mask(s:&State,side:usize)->[bool;ACTIONS]{let mut m=[false;ACTIONS];for a in s.legal(side){m[code(a)]=true;}m}
fn decode(i:usize)->Action{match i{0..=3=>Action::Move(i as i32),4..=6=>Action::Switch(i-4),_=>Action::Move(-1)}}
fn input(s:&State,side:usize)->Vec<f32>{
 let mut x=Vec::with_capacity(300);
 for p in [side,1-side]{for (i,c) in s.teams[p].iter().enumerate(){
  for j in 0..13{x.push((c.id==j) as u8 as f32)}
  x.extend([c.hp as f32/c.max() as f32,(i==s.active[p])as u8 as f32,c.item as u8 as f32,c.revived as u8 as f32]);
  x.extend(c.stages[1..].iter().map(|&v|v as f32/6.0));
  x.extend([c.accuracy as f32/6.,c.evasion as f32/6.,c.crit as f32/3.,c.sub as f32/c.max() as f32]);
  for j in 0..6{x.push((c.status==j)as u8 as f32)}
  for j in 0..4{x.push(c.pp[j] as f32/c.c().moves[j].pp.max(1)as f32)}
  for j in -1..4{x.push((c.locked==j)as u8 as f32)}
  for j in -1..4{x.push((c.last==j)as u8 as f32)}
  x.extend([c.sleep as f32/3.,c.toxic as f32/15.,c.drowsy as f32/3.,c.confusion as f32/5.,c.taunt as f32/3.,c.silence as f32/3.,c.encore as f32/3.,c.streak.min(6)as f32/6.,(c.protect==s.turn-1)as u8 as f32,(c.clair==s.turn-1)as u8 as f32,(c.trapped>=0)as u8 as f32]);
  for j in -1..4{x.push((c.encore_move==j)as u8 as f32)}
 }}
 x.extend([s.terrain as f32/8.,s.gravity as f32/5.,s.trick as f32/5.,s.turn.min(LIMIT as i32)as f32/LIMIT as f32]);
 x
}
#[derive(Clone,Serialize,Deserialize)]
struct Net{dim:usize,hidden:usize,params:Vec<f32>}
impl Net{
 fn new(dim:usize)->Self{let mut r=rng(17);let n=H*(dim+1)+OUT*(H+1);
  let mut p=vec![0.;n];let scale=(6./(dim+H)as f32).sqrt();
  for j in 0..H{for i in 0..dim{p[j*(dim+1)+i]=(2.*r.next()as f32-1.)*scale}}
  let off=H*(dim+1);for j in 0..OUT{for i in 0..H{p[off+j*(H+1)+i]=(2.*r.next()as f32-1.)*0.02}}
  Self{dim,hidden:H,params:p}
 }
 fn forward(&self,x:&[f32],legal:&[bool;ACTIONS])->([f32;H],[f32;ACTIONS],f32){
  assert_eq!(x.len(),self.dim);let mut h=[0.;H];for j in 0..H{let off=j*(self.dim+1);let mut a=self.params[off+self.dim];for i in 0..self.dim{a+=self.params[off+i]*x[i]}h[j]=a.tanh()}
  let off=H*(self.dim+1);let mut y=[0.;OUT];for j in 0..OUT{let k=off+j*(H+1);let mut a=self.params[k+H];for i in 0..H{a+=self.params[k+i]*h[i]}y[j]=a;}
  let max=(0..ACTIONS).filter(|&i|legal[i]).map(|i|y[i]).fold(f32::NEG_INFINITY,f32::max);
  assert!(max.is_finite());let mut p=[0.;ACTIONS];let mut total=0.;for i in 0..ACTIONS{if legal[i]{p[i]=(y[i]-max).exp();total+=p[i]}}for i in 0..ACTIONS{p[i]/=total}
  (h,p,y[ACTIONS].tanh())
 }
 fn grad(&self,x:&[f32],legal:&[bool;ACTIONS],action:usize,target:f32,imitation:bool,g:&mut[f32]){
  let (h,p,v)=self.forward(x,legal);let mut dy=[0.;OUT];let adv=if imitation{1.}else{(target-v).clamp(-2.,2.)};
  let entropy_sum=(0..ACTIONS).filter(|&i|legal[i]).map(|i|p[i]*p[i].max(1e-8).ln()).sum::<f32>();
  for i in 0..ACTIONS{if legal[i]{dy[i]=adv*((i==action)as u8 as f32-p[i]);if !imitation{dy[i]-=0.015*p[i]*(p[i].max(1e-8).ln()-entropy_sum)}}}
  dy[ACTIONS]=0.5*(target-v)*(1.-v*v);
  let off=H*(self.dim+1);let mut dh=[0.;H];
  for j in 0..OUT{let k=off+j*(H+1);for i in 0..H{g[k+i]+=dy[j]*h[i];dh[i]+=dy[j]*self.params[k+i]}g[k+H]+=dy[j]}
  for j in 0..H{let d=dh[j]*(1.-h[j]*h[j]);let k=j*(self.dim+1);for i in 0..self.dim{g[k+i]+=d*x[i]}g[k+self.dim]+=d}
 }
}
fn pick(p:&[f32;ACTIONS],legal:&[bool;ACTIONS],r:&mut Rng,greedy:bool)->usize{
 if greedy{return (0..ACTIONS).filter(|&i|legal[i]).max_by(|&a,&b|p[a].total_cmp(&p[b])).unwrap()}
 let mut u=r.next()as f32;let mut last=0;for i in 0..ACTIONS{if legal[i]{last=i;u-=p[i];if u<=0.{return i}}}last
}
#[derive(Clone,Copy)]enum Opp<'a>{Net(&'a Net),Quick,Weak,Wide(&'a [f64])}
fn val(s:&State,side:usize,w:&[f64])->f64{let v=match s.winner{Some(0)=>1.,Some(1)=>-1.,None=>predict(&s.features(),w),_=>0.};if side==0{v}else{-v}}
fn wide(s:&State,side:usize,w:&[f64],r:&mut Rng)->Action{
 let own=s.rank(side);if own.len()<=1{return own[0]}let mut foe=s.rank(1-side);foe.truncate(2);let seed=r.0;r.next();let norm=if foe.len()==1{1.}else{1.6};
 let mut best=own[0];let mut top=f64::NEG_INFINITY;for a in own{let mut score=0.;for (j,&b) in foe.iter().enumerate(){let wt=0.6_f64.powi(j as i32)/norm/16.;for k in 0..16u64{let sd=mix(seed as u64^((k+1)*0x9e3779b9));let mut n=*s;n.step(if side==0{[a,b]}else{[b,a]},&mut Rng(sd));let immediate=val(&n,side,w);if n.winner.is_none(){let acts=[n.quick(0),n.quick(1)];n.step(acts,&mut Rng(sd^0x84351));}score+=wt*(0.45*immediate+0.55*val(&n,side,w));}}if score>top{top=score;best=a}}best
}
fn select(s:&State,side:usize,o:Opp,r:&mut Rng,greedy:bool)->Action{
 match o{Opp::Quick=>s.quick(side),Opp::Weak=>{if r.next()<0.25{let a=s.legal(side);a[r.index(a.len())]}else{s.quick(side)}},Opp::Wide(w)=>wide(s,side,w,r),Opp::Net(n)=>{let x=input(s,side);let m=mask(s,side);let (_,p,_)=n.forward(&x,&m);decode(pick(&p,&m,r,greedy))}}
}
struct Sample{x:Vec<f32>,legal:[bool;ACTIONS],action:usize,side:usize}
fn collect(net:&Net,league:&[Net],w:&[f64],seed:u64,imitation:bool)->(Vec<Sample>,Option<usize>){
 let mut s=State::new(TEAM,TEAM);let mut r=rng(seed^0xe124);let mut q=[rng(seed^0xb791),rng(seed^0x9381)];let mut chooser=rng(seed^0xff1234);
 let side=chooser.index(2);let u=chooser.next();let opponent=if u<0.10{Opp::Quick}else if u<0.20{Opp::Weak}else if u<0.25{Opp::Wide(w)}else if u<0.50&&!league.is_empty(){Opp::Net(&league[chooser.index(league.len())])}else{Opp::Net(net)};
 let both=imitation||u>=0.50;let mut trace=Vec::new();
 for _ in 0..LIMIT{if s.winner.is_some(){break}let mut acts=[Action::Move(0);2];for p in 0..2{
  if both||p==side{
   let x=input(&s,p);let legal=mask(&s,p);let a=if imitation{s.quick(p)}else{let (_,probs,_)=net.forward(&x,&legal);decode(pick(&probs,&legal,&mut q[p],false))};
   assert!(legal[code(a)]);acts[p]=a;trace.push(Sample{x,legal,action:code(a),side:p});
  }else{acts[p]=select(&s,p,opponent,&mut q[p],false)}
 }s.step(acts,&mut r);}
 (trace,s.winner)
}
fn train(net:&mut Net,league:&[Net],w:&[f64],start:u64,games:u64,workers:usize,imitation:bool,adam:&mut Adam){
 let clock=Instant::now();let dim=net.params.len();let mut done=0u64;let mut draws=0;let mut positions=0u64;
 while done<games{let count=(BATCH as u64).min(games-done);let results=std::thread::scope(|scope|{let snapshot:&Net=net;let mut tasks=vec![];for k in 0..workers{tasks.push(scope.spawn(move||{let mut g=vec![0.;dim];let mut n=0u64;let mut d=0u64;
  for j in (k as u64..count).step_by(workers){let seed=0xafd0_0000_0000u64+start+done+j;let (trace,winner)=collect(snapshot,league,w,seed,imitation);d+=winner.is_none()as u64;
   for e in trace{let target=match winner{Some(v) if v==e.side=>1.,Some(_)=>-1.,None=>0.};snapshot.grad(&e.x,&e.legal,e.action,target,imitation,&mut g);n+=1;}
  }(g,n,d)}))}tasks.into_iter().map(|t|t.join().unwrap()).collect::<Vec<_>>()});
  let n=results.iter().map(|x|x.1).sum::<u64>().max(1);positions+=n;draws+=results.iter().map(|x|x.2).sum::<u64>();let mut g=vec![0.;dim];for row in results{for (dst,v) in g.iter_mut().zip(row.0){*dst+=v/n as f32}}adam.apply(net,&g,if imitation{0.001}else{0.0005});done+=count;
  if done==games||done%5000<count{println!("RL_TRAIN phase {} games {}/{} total {} positions {} draws {} games_per_sec {:.2}",if imitation{"warmup"}else{"selfplay"},done,games,start+done,positions,draws,done as f64/clock.elapsed().as_secs_f64());}
 }
}
struct Adam{m:Vec<f32>,v:Vec<f32>,t:i32}
impl Adam{fn new(n:usize)->Self{Self{m:vec![0.;n],v:vec![0.;n],t:0}}
fn apply(&mut self,net:&mut Net,g:&[f32],lr:f32){self.t+=1;let c1=1.-0.9_f32.powi(self.t);let c2=1.-0.999_f32.powi(self.t);for i in 0..g.len(){let x=g[i].clamp(-1.,1.)-0.00001*net.params[i];self.m[i]=0.9*self.m[i]+0.1*x;self.v[i]=0.999*self.v[i]+0.001*x*x;net.params[i]=(net.params[i]+lr*(self.m[i]/c1)/((self.v[i]/c2).sqrt()+1e-8)).clamp(-8.,8.);assert!(net.params[i].is_finite())}}}
#[derive(Serialize)]struct ResultRow{generation:usize,opponent:String,mode:String,games:u64,wins:u64,draws:u64,turns:u64,games_per_sec:f64}
fn evaluate(net:&Net,opp:Opp,name:&str,gen:usize,n:u64,workers:usize,greedy:bool)->ResultRow{
 let start=Instant::now();let rs=std::thread::scope(|scope|{let mut jobs=vec![];for k in 0..workers{jobs.push(scope.spawn(move||{let mut wins=0;let mut draws=0;let mut turns=0;for i in (k as u64..n).step_by(workers){let seed=0xfab1_0000_0000u64+i/2;let side=(i%2)as usize;let mut s=State::new(TEAM,TEAM);let mut r=rng(seed^0x134);let mut q=[rng(seed^0x831),rng(seed^0x394)];let mut t=0;
 while t<LIMIT&&s.winner.is_none(){let a=std::array::from_fn(|p|select(&s,p,if p==side{Opp::Net(net)}else{opp},&mut q[p],if p==side{greedy}else{false}));s.step(a,&mut r);t+=1}turns+=t as u64;wins+=(s.winner==Some(side))as u64;draws+=s.winner.is_none()as u64;
 }(wins,draws,turns)}))}jobs.into_iter().map(|x|x.join().unwrap()).collect::<Vec<_>>()});
 let row=ResultRow{generation:gen,opponent:name.into(),mode:if greedy{"greedy".into()}else{"sampled".into()},games:n,wins:rs.iter().map(|x|x.0).sum(),draws:rs.iter().map(|x|x.1).sum(),turns:rs.iter().map(|x|x.2).sum(),games_per_sec:n as f64/start.elapsed().as_secs_f64()};
 println!("RL_EVAL gen {} foe {} mode {} games {} wins {} draws {} score {:.5} mean_turns {:.2} games_per_sec {:.2}",gen,name,row.mode,n,row.wins,row.draws,(row.wins as f64+0.5*row.draws as f64)/n as f64,row.turns as f64/n as f64,row.games_per_sec);row
}
fn main(){
 let args:Vec<_>=std::env::args().collect();let path=Path::new(&args[1]);let workers:usize=args[2].parse().unwrap();let epochs:usize=args[3].parse().unwrap();let per:u64=args[4].parse().unwrap();let eval:u64=args[5].parse().unwrap();assert!(workers>0&&per>0&&eval>0&&epochs>0);
 let json:serde_json::Value=serde_json::from_slice(&fs::read("analysis/sample-search-league-gen24.json").unwrap()).unwrap();let p=json["pool"].as_array().unwrap().iter().find(|p|p["name"]=="wide2x16").unwrap();let w:Vec<f64>=serde_json::from_value(p["weights"].clone()).unwrap();assert_eq!(w.len(),FEATURES);
 fs::create_dir_all(path).unwrap();let s=State::new(TEAM,TEAM);let mut net=Net::new(input(&s,0).len());let dim=net.dim;let mut adam=Adam::new(net.params.len());let mut league=vec![];let mut results=vec![];
 println!("RL_SCHEMA mirror-actor-critic-v1 team {:?} dim {} hidden {} actions {} params {}",TEAM,dim,H,ACTIONS,net.params.len());
 let warm=5000;train(&mut net,&[],&w,0,warm,workers,true,&mut adam);league.push(net.clone());
 for gen in 0..=epochs{
  if gen>0{train(&mut net,&league,&w,warm+(gen as u64-1)*per,per,workers,false,&mut adam)}
  fs::write(path.join(format!("model-gen-{gen}.json")),serde_json::to_vec(&net).unwrap()).unwrap();
  for (foe,name) in [(Opp::Quick,"quick"),(Opp::Weak,"weak"),(Opp::Wide(&w),"wide2x16")]{results.push(evaluate(&net,foe,name,gen,eval,workers,true));}
  if gen>0{results.push(evaluate(&net,Opp::Net(league.last().unwrap()),"previous",gen,eval,workers,true));results.push(evaluate(&net,Opp::Wide(&w),"wide2x16",gen,eval,workers,false));league.push(net.clone());}
  fs::write(path.join("results.json"),serde_json::to_vec(&serde_json::json!({"schema":"mirror-actor-critic-v1","engine":json["engine"],"base_schema":json["schema"],"team":TEAM,"dim":dim,"hidden":H,"actions":ACTIONS,"warmup":warm,"selfplay_games":gen as u64*per,"train_games_per_generation":per,"turn_limit":LIMIT,"baseline_weights":w,"results":results})).unwrap()).unwrap();
 }
}
