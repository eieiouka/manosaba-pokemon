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
fn action(s:&State,side:usize,p:&Player,r:&mut Rng)->Action{
    match p.mode.as_str(){"quick"=>s.quick(side),"weak"=>{if r.next()<0.25{let a=s.legal(side);a[r.index(a.len())]}else{s.quick(side)}},"legacy"=>s.learned(side,&p.weights,r,3,1),_=>smart(s,side,&p.weights,r)}
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
    let mut p=l.pool[l.champion].clone();p.name=format!("gen-{id:03}");p.mode="smart".into();
    let mut m=[0.;FEATURES];let mut v=[0.;FEATURES];let mut upd=0_i32;let start=Instant::now();let mut done=0;
    while done<n{let count=(workers as u64*128).min(n-done);let parts=std::thread::scope(|scope|{let mut jobs=vec![];for k in 0..workers{let p=&p;jobs.push(scope.spawn(move||{let mut grad=[0.;FEATURES];let mut ex=0u64;for j in (k as u64..count).step_by(workers){let sd=0x7000_0000_0000u64.wrapping_add(l.trained+done+j);let mut r=rng(sd);let foe=opponent(l,&mut r);let side=(j%2)as usize;let (a,b)=if side==0{preview_pair(&mut r,p,&l.pool[foe])}else{preview_pair(&mut r,&l.pool[foe],p)};let mut trace=vec![];let w=if side==0{game(a,b,p,&l.pool[foe],sd,true,side,&mut trace)}else{game(a,b,&l.pool[foe],p,sd,true,side,&mut trace)};let target=match w{Some(0)=>1.,Some(1)=>-1.,_=>0.};for f in trace{let err=target-predict(&f,&p.weights);ex+=1;for i in 0..FEATURES{grad[i]+=err*f[i]}}} (grad,ex)}))}jobs.into_iter().map(|j|j.join().unwrap()).collect::<Vec<_>>()});
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
    let a:Vec<_>=std::env::args().collect();assert!(a.len()>=5,"league output_dir workers generations games_per_generation [model...]");let path=Path::new(&a[1]);let workers:usize=a[2].parse().unwrap();let gens:u64=a[3].parse().unwrap();let games:u64=a[4].parse().unwrap();assert!(workers>0&&games>0);
    let schema=format!("manosaba-value-v1:{}",data().chars.iter().map(|c|c.id.as_str()).collect::<Vec<_>>().join(","));
    let mut l:League=if path.join("league.json").exists(){serde_json::from_slice(&fs::read(path.join("league.json")).unwrap()).unwrap()}else{
        assert_eq!(MATRIX.len(),N*N/3);let prior:League=serde_json::from_slice(&fs::read("analysis/league-gen16.json").unwrap()).unwrap();assert_eq!(prior.schema,schema);
        let keep=["quick","weak","legacy-2m","gen-002","gen-013","gen-015"];
        let p:Vec<_>=keep.iter().map(|name|prior.pool.iter().find(|p|p.name==*name).unwrap().clone()).collect();
        let mut l=League{schema:schema.clone(),engine:prior.engine,pool:p,matches:vec![],champion:5,elo:vec![],generation:16,trained:prior.trained};
        for i in 0..l.pool.len(){for j in i+1..l.pool.len(){let m=evaluate(i,j,&l.pool,workers,2000,0x6000_0000_0000+(i as u64)*100000+(j as u64)*4000);l.matches.push(m)}}fit(&mut l);save(path,&l);l
    };
    assert_eq!(l.schema,schema);selection_benchmark(&l.pool[l.champion],workers);for _ in 0..gens{let id=l.generation+1;let p=train(&l,id,games,workers);l.trained+=games;let old=l.champion;let i=l.pool.len();l.pool.push(p);
        for j in 0..i{let m=evaluate(i,j,&l.pool,workers,2000,0x6200_0000_0000+id*10_000_000+j as u64*4000);println!("DUEL {} {} {}",l.pool[i].name,l.pool[j].name,rate(&m));l.matches.push(m)}fit(&mut l);
        let vs=|x:usize,y:usize|{let m=l.matches.iter().find(|m|(m.a==x&&m.b==y)||(m.a==y&&m.b==x)).unwrap();if m.a==x{rate(m)}else{1.-rate(m)}};
        let head=vs(i,old);let quick=vs(i,0);let weak=vs(i,1);let old_quick=vs(old,0);let old_weak=vs(old,1);
        if head>=0.515&&quick+0.02>=old_quick&&weak+0.02>=old_weak&&l.elo[i]>l.elo[old]{l.champion=i}
        l.generation=id;println!("GEN {} champion {} challenger_elo {:.1} incumbent_elo {:.1} head {:.4} quick {:.4} weak {:.4}",id,l.pool[l.champion].name,l.elo[i],l.elo[old],head,quick,weak);save(path,&l);
    }
    for (i,p) in l.pool.iter().enumerate(){println!("ELO {} {:.1}",p.name,l.elo[i])}
}
