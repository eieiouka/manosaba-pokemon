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
fn preview_pair(r:&mut Rng,x:&Player,y:&Player)->(Trio,Trio){
 let a=six(r);let b=six(r);let ac=choices(a);let bc=choices(b);let m=120;let mut pay=vec![0.;m*m];let mut ar=vec![0.;m];let mut br=vec![0.;m];
 for i in 0..m{for j in 0..m{let v=payoff(ac[i].0,bc[j].0);pay[i*m+j]=v;ar[i]+=v/m as f64;br[j]+=v/m as f64}}
 for i in 0..m{for j in 0..m{pay[i*m+j]=0.8*pay[i*m+j]+0.1*ar[i]+0.1*br[j]}}
 let mut av=vec![0.;m];let mut bv=vec![0.;m];let mut aa=[0usize;32];let mut bb=[0usize;32];
 for t in 0..32{let mut i0=0;let mut j0=0;let mut hi=f64::NEG_INFINITY;let mut lo=f64::INFINITY;for i in 0..m{let v=0.25*ar[i]+0.75*if t==0{ar[i]}else{av[i]/t as f64};if v>hi{hi=v;i0=i}}for j in 0..m{let v=0.25*br[j]+0.75*if t==0{br[j]}else{bv[j]/t as f64};if v<lo{lo=v;j0=j}}
 aa[t]=i0;bb[t]=j0;for i in 0..m{av[i]+=pay[i*m+j0]}for j in 0..m{bv[j]+=pay[i0*m+j]}}
 let weak=|p:&Player|p.mode=="quick"||p.mode=="weak";
 (if weak(x){[a[0],a[1],a[2]]}else{ac[aa[r.index(32)]].1},if weak(y){[b[0],b[1],b[2]]}else{bc[bb[r.index(32)]].1})
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
// Offline HP-conditioned matchup estimates. Keep original 503-weight evaluator
// unchanged for the control policies. All benchmark games use independent seeds.
const HP:[i32;5]=[10,25,50,75,100];
const DUEL_SAMPLES:usize=24;
const PAIR_CELLS:usize=13*13*5*5*4;
static PAIRS:std::sync::OnceLock<Vec<f64>>=std::sync::OnceLock::new();
fn pair_index(a:usize,b:usize,ha:usize,hb:usize,ba:usize,bb:usize)->usize{((((a*13+b)*5+ha)*5+hb)*2+ba)*2+bb}
fn trio(id:usize,r:&mut Rng)->Trio{let mut other:Vec<_>=(0..13).filter(|&i|i!=id).collect();let j=r.index(other.len());let x=other.swap_remove(j);let y=other[r.index(other.len())];[id,x,y]}
fn duel_pair(a:usize,b:usize,ha:usize,hb:usize,ba:usize,bb:usize,seed:u64)->f64{
 let mut r=rng(seed);let ta=trio(a,&mut r);let tb=trio(b,&mut r);
 let mut s=State::new(ta,tb);
 for (side,h,boost) in [(0,ha,ba),(1,hb,bb)]{let c=&mut s.teams[side][0];c.hp=(c.max()*HP[h]/100).max(1);
  if boost!=0{let k=if c.c().moves.iter().filter(|m|m.category=="physical").count()>=c.c().moves.iter().filter(|m|m.category=="special").count(){1}else{3};c.stages[k]=(c.stages[k]+2).min(6);}
 }
 for _ in 0..24{if s.winner.is_some()||s.active!=[0,0]||s.teams[0][0].hp==0||s.teams[1][0].hp==0{break}
  let a=s.rank(0).into_iter().find(|x|matches!(x,Action::Move(_))).unwrap_or(Action::Move(-1));
  let b=s.rank(1).into_iter().find(|x|matches!(x,Action::Move(_))).unwrap_or(Action::Move(-1));s.step([a,b],&mut r);
 }
 match (s.teams[0][0].hp>0,s.teams[1][0].hp>0){(true,false)=>1.,(false,true)=>0.,_=>0.5}
}
fn build_pairs(workers:usize)->Vec<f64>{
 let start=Instant::now();let chunks=std::thread::scope(|scope|{let mut jobs=vec![];for k in 0..workers{jobs.push(scope.spawn(move||{let mut out=vec![];
  for idx in (k..PAIR_CELLS).step_by(workers){let bb=idx%2;let ba=idx/2%2;let hb=idx/4%5;let ha=idx/20%5;let b=idx/100%13;let a=idx/1300;let mut sum=0.;
   for n in 0..DUEL_SAMPLES{sum+=duel_pair(a,b,ha,hb,ba,bb,0xb110_0000_0000+idx as u64*1000+n as u64)}out.push((idx,sum/DUEL_SAMPLES as f64));
  }out}))}jobs.into_iter().map(|j|j.join().unwrap()).collect::<Vec<_>>()});
 let mut p=vec![0.;PAIR_CELLS];for (i,v) in chunks.into_iter().flatten(){p[i]=v}
 // Symmetrize independently sampled directions to remove seat bias.
 let raw=p.clone();for a in 0..13{for b in 0..13{for ha in 0..5{for hb in 0..5{for ba in 0..2{for bb in 0..2{let i=pair_index(a,b,ha,hb,ba,bb);p[i]=(raw[i]+1.-raw[pair_index(b,a,hb,ha,bb,ba)])/2.;}}}}}}
 println!("PAIR_TABLE cells {} samples_per_cell {} total {} seconds {:.2}",PAIR_CELLS,DUEL_SAMPLES,PAIR_CELLS*DUEL_SAMPLES,start.elapsed().as_secs_f64());p
}
fn hp_bin(c:manosaba_selfplay::Fighter)->usize{let hp=c.hp as f64/c.max()as f64*100.;(0..5).min_by(|&i,&j|(HP[i] as f64-hp).abs().total_cmp(&(HP[j] as f64-hp).abs())).unwrap()}
fn boost(c:manosaba_selfplay::Fighter)->usize{usize::from(c.stages[1].max(c.stages[3])>=2)}
fn pair_score(a:manosaba_selfplay::Fighter,b:manosaba_selfplay::Fighter,ba:usize,bb:usize)->f64{
 if a.hp<=0{return -1.}if b.hp<=0{return 1.}
 2.*PAIRS.get().unwrap()[pair_index(a.id,b.id,hp_bin(a),hp_bin(b),ba,bb)]-1.
}
fn coverage(s:&State,side:usize)->f64{
 let mut n=0.;let mut v=0.;for (j,&b) in s.teams[1-side].iter().enumerate(){if b.hp<=0{continue}
 let best=s.teams[side].iter().enumerate().filter(|(_,a)|a.hp>0).map(|(i,&a)|pair_score(a,b,if i==s.active[side]{boost(a)}else{0},if j==s.active[1-side]{boost(b)}else{0})).fold(-1.,f64::max);
 v+=best;n+=1.;}if n>0.{v/n}else{0.}
}
fn hp_value(s:&State,side:usize,w:&[f64],direct_weight:f64,cover_weight:f64)->f64{
 let base=value(s,side,w);if s.winner.is_some(){return base}
 let a=s.a(side);let b=s.a(1-side);
 let direct=pair_score(a,b,boost(a),boost(b));
 let cover=if cover_weight>0.{(coverage(s,side)-coverage(s,1-side))*0.5}else{0.};
 (1.-direct_weight-cover_weight)*base+direct_weight*direct+cover_weight*cover
}
fn wide_hp(s:&State,side:usize,w:&[f64],r:&mut Rng,width:usize,samples:usize,direct_weight:f64,cover_weight:f64)->Action{
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
    let mut n=step(s,side,a,b,sd);let immediate=hp_value(&n,side,w,direct_weight,cover_weight);
    if n.winner.is_none(){
      let acts=[n.quick(0),n.quick(1)];
      n.step(acts,&mut Rng(sd^0x84351));
    }
    score+=weight*(0.45*immediate+0.55*hp_value(&n,side,w,direct_weight,cover_weight));
   }
  }
  if score>top{top=score;best=a}
 }
 best
}
fn action(s:&State,side:usize,p:&Player,r:&mut Rng)->Action{
    match p.mode.as_str(){"quick"=>s.quick(side),"weak"=>{if r.next()<0.25{let a=s.legal(side);a[r.index(a.len())]}else{s.quick(side)}},"legacy"=>s.learned(side,&p.weights,r,3,1),"deep3"=>deep(s,side,&p.weights,r,3),"deep4"=>deep(s,side,&p.weights,r,4),"deep5"=>deep(s,side,&p.weights,r,5),"wide2x4"=>wide(s,side,&p.weights,r,2,4,false),"wide4x4"=>wide(s,side,&p.weights,r,4,4,false),"wide6x4"=>wide(s,side,&p.weights,r,6,4,false),"wide4x1"=>wide(s,side,&p.weights,r,4,1,false),"learned2x2"=>wide(s,side,&p.weights,r,2,2,true),"wide2x8"=>wide(s,side,&p.weights,r,2,8,false),"wide2x16"=>wide(s,side,&p.weights,r,2,16,false),"wide2x32"=>wide(s,side,&p.weights,r,2,32,false),"wide6x8"=>wide(s,side,&p.weights,r,6,8,false),"hp10"=>wide_hp(s,side,&p.weights,r,2,16,0.10,0.),"hp25"=>wide_hp(s,side,&p.weights,r,2,16,0.25,0.),"hpcover"=>wide_hp(s,side,&p.weights,r,2,16,0.15,0.15),_=>smart(s,side,&p.weights,r)}
}
fn game(a:Trio,b:Trio,x:&Player,y:&Player,seed:u64,training:bool,learner:usize,trace:&mut Vec<[f64;FEATURES]>)->Option<usize>{
    let mut s=State::new(a,b);let mut r=rng(seed^0x1234);let mut q=rng(seed^0x1592);let mut e=rng(seed^0x6713);
    for t in 0..80{if s.winner.is_some(){break}if training&&t%2==0{trace.push(s.features())}
        let mut acts=[Action::Move(0);2];for (i,p) in [x,y].into_iter().enumerate(){acts[i]=if training&&i==learner&&q.next()<0.12{let a=s.legal(i);a[q.index(a.len())]}else{action(&s,i,p,if i==0{&mut q}else{&mut e})}}s.step(acts,&mut r);
    }s.winner
}
fn evaluate(a:usize,b:usize,pool:&[Player],workers:usize,n:u64,seed:u64)->Match{
    let results=std::thread::scope(|s|{let mut jobs=vec![];for k in 0..workers{jobs.push(s.spawn(move||{let mut wins=0;let mut draws=0;for i in (k as u64..n).step_by(workers){let sd=seed.wrapping_add(i/2);let mut r=rng(sd);let (x,y)=preview_pair(&mut r,&pool[a],&pool[b]);let mut trace=vec![];let side=(i%2)as usize;let w=if side==0{game(x,y,&pool[a],&pool[b],sd^0x975,false,0,&mut trace)}else{game(y,x,&pool[b],&pool[a],sd^0x348,false,1,&mut trace)};wins+=(w==Some(side))as u64;draws+=w.is_none()as u64} (wins,draws)}))}jobs.into_iter().map(|j|j.join().unwrap()).collect::<Vec<_>>()});
    Match{a,b,games:n,wins:results.iter().map(|x|x.0).sum(),draws:results.iter().map(|x|x.1).sum()}
}
fn rate(m:&Match)->f64{(m.wins as f64+0.5*m.draws as f64)/m.games as f64}
fn fit(l:&mut League){
    // Fit Elo's logistic expected-score model to all held-out games; pin quick at 1000.
    let mut r=vec![1000.;l.pool.len()];for _ in 0..600{let mut g=vec![0.;r.len()];let mut n=vec![0.;r.len()];for m in &l.matches{let expected=1./(1.+10_f64.powf((r[m.b]-r[m.a])/400.));let error=(rate(m)-expected)*m.games as f64;g[m.a]+=error;g[m.b]-=error;n[m.a]+=m.games as f64;n[m.b]+=m.games as f64}for i in 1..r.len(){if n[i]>0.{r[i]+=60.*g[i]/n[i]}}}l.elo=r
}
fn opponent(l:&League,r:&mut Rng)->usize{let x=r.next();if x<0.15{0}else if x<0.25{1}else if x<0.60{l.champion}else if l.pool.len()>2{2+r.index(l.pool.len()-2)}else{l.champion}}
fn train(l:&League,id:u64,n:u64,workers:usize)->Player{
    let mut p=l.pool[l.champion].clone();p.name=format!("gen-{id:03}");p.mode="wide2x16".into();
    let mut m=[0.;FEATURES];let mut v=[0.;FEATURES];let mut upd=0_i32;let start=Instant::now();let mut done=0;
    while done<n{let count=(workers as u64*128).min(n-done);let parts=std::thread::scope(|scope|{let mut jobs=vec![];for k in 0..workers{let p=&p;jobs.push(scope.spawn(move||{let mut grad=[0.;FEATURES];let mut ex=0u64;for j in (k as u64..count).step_by(workers){let sd=0xa700_0000_0000u64.wrapping_add(l.trained+done+j);let mut r=rng(sd);let foe=opponent(l,&mut r);let side=(j%2)as usize;let (a,b)=if side==0{preview_pair(&mut r,p,&l.pool[foe])}else{preview_pair(&mut r,&l.pool[foe],p)};let mut trace=vec![];let w=if side==0{game(a,b,p,&l.pool[foe],sd,true,side,&mut trace)}else{game(a,b,&l.pool[foe],p,sd,true,side,&mut trace)};let target=match w{Some(0)=>1.,Some(1)=>-1.,_=>0.};for f in trace{let err=target-predict(&f,&p.weights);ex+=1;for i in 0..FEATURES{grad[i]+=err*f[i]}}} (grad,ex)}))}jobs.into_iter().map(|j|j.join().unwrap()).collect::<Vec<_>>()});
        let ex=parts.iter().map(|x|x.1).sum::<u64>().max(1);upd+=1;for i in 0..FEATURES{let g=parts.iter().map(|x|x.0[i]).sum::<f64>()/ex as f64-0.0001*p.weights[i];m[i]=0.9*m[i]+0.1*g;v[i]=0.999*v[i]+0.001*g*g;p.weights[i]=(p.weights[i]+0.003*(m[i]/(1.-0.9_f64.powi(upd)))/((v[i]/(1.-0.999_f64.powi(upd))).sqrt()+1e-8)).clamp(-8.,8.)}done+=count;
        if done==n||done%32768<count{println!("TRAIN {} {}/{} {:.0} games/s",id,done,n,done as f64/start.elapsed().as_secs_f64())}
    }p.games+=n;p
}
fn save(path:&Path,l:&League){fs::create_dir_all(path).unwrap();fs::write(path.join("league.json.tmp"),serde_json::to_vec(l).unwrap()).unwrap();fs::rename(path.join("league.json.tmp"),path.join("league.json")).unwrap();let p=&l.pool[l.champion];fs::write(path.join("champion.json"),serde_json::to_vec(&serde_json::json!({"schema":l.schema,"engine":l.engine,"games":p.games,"name":p.name,"mode":p.mode,"elo":l.elo[l.champion],"weights":p.weights})).unwrap()).unwrap();}
fn selection_benchmark(p:&Player,workers:usize){
 let weak=Player{name:"random selection".into(),mode:"weak".into(),games:p.games,weights:p.weights.clone()};let p=&p;let weak=&weak;
 let results=std::thread::scope(|s|{let mut jobs=vec![];for k in 0..workers{jobs.push(s.spawn(move||{let mut wins=0u64;let mut draws=0u64;for i in (k..2000).step_by(workers){let sd=0x9140_0010u64+i as u64/2;let mut r=rng(sd);let (a,b)=preview_pair(&mut r,p,weak);let side=i%2;let mut trace=vec![];let w=if side==0{game(a,b,p,p,sd^0x32,false,0,&mut trace)}else{game(b,a,p,p,sd^0x72,false,1,&mut trace)};wins+=(w==Some(side))as u64;draws+=w.is_none()as u64}(wins,draws)}))}jobs.into_iter().map(|j|j.join().unwrap()).collect::<Vec<_>>()});
 let wins=results.iter().map(|x|x.0).sum::<u64>();let draws=results.iter().map(|x|x.1).sum::<u64>();println!("SELECTION_BENCHMARK games 2000 wins {wins} draws {draws} rate {}",(wins as f64+0.5*draws as f64)/2000.);
}
fn main(){
 let args:Vec<_>=std::env::args().collect();let path=Path::new(&args[1]);let workers:usize=args[2].parse().unwrap();let games:u64=args[3].parse().unwrap();
 let prior:League=serde_json::from_slice(&fs::read("analysis/sample-search-league-gen24.json").unwrap()).unwrap();
 let keep=["quick","weak","gen-019","wide2x16"];let mut pool:Vec<_>=keep.iter().map(|name|prior.pool.iter().find(|p|p.name==*name).unwrap().clone()).collect();
 for mode in ["hp10","hp25","hpcover"]{let mut p=pool[3].clone();p.name=mode.into();p.mode=mode.into();pool.push(p)}
 let mut l=League{schema:prior.schema,engine:prior.engine,pool,matches:vec![],champion:3,elo:vec![],generation:24,trained:prior.trained};
 assert!(workers>0);let pairs=build_pairs(workers);fs::create_dir_all(path).unwrap();
 fs::write(path.join("matchups.json"),serde_json::to_vec(&serde_json::json!({"schema":l.schema,"engine":l.engine,"hp_bins":HP,"samples":DUEL_SAMPLES,"boost":"0 or +2 dominant attacking stat","layout":"a,b,hp_a,hp_b,boost_a,boost_b","values":pairs})).unwrap()).unwrap();PAIRS.set(pairs).unwrap();
 for i in 0..l.pool.len(){for j in 0..i{let start=Instant::now();let m=evaluate(i,j,&l.pool,workers,games,0xb200_0000_0000+i as u64*100_000+j as u64*4000);println!("HP_DUEL {} {} games {} wins {} draws {} score {:.5} games_per_sec {:.2}",l.pool[i].name,l.pool[j].name,m.games,m.wins,m.draws,rate(&m),m.games as f64/start.elapsed().as_secs_f64());l.matches.push(m);fit(&mut l);save(path,&l);}}
 for (i,p) in l.pool.iter().enumerate(){println!("HP_ELO {} {:.2}",p.name,l.elo[i])}
}
