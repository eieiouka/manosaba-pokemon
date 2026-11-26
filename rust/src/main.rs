use manosaba_selfplay::*;
use serde::{Deserialize,Serialize};
use std::{fs,path::Path,time::Instant};

#[derive(Clone,Serialize,Deserialize,PartialEq)]
struct Options { seed:u32,max_turns:usize,epsilon:f64,learned_rate:f64,candidates:usize,samples:usize,stride:usize,policy:String,lr:f64 }
#[derive(Serialize,Deserialize)]
struct Model { schema:String,engine:String,games:u64,updates:u64,examples:u64,weights:Vec<f64>,m:Vec<f64>,v:Vec<f64>,opts:Options }
fn schema()->String{format!("manosaba-value-v1:{}",data().chars.iter().map(|c|c.id.as_str()).collect::<Vec<_>>().join(","))}
fn engine()->String{let mut h=14695981039346656037u64;for b in include_bytes!("lib.rs").iter().chain(include_bytes!("main.rs")).chain(include_bytes!("../data.json")){h=(h^*b as u64).wrapping_mul(1099511628211)}format!("rust-{h:016x}")}
fn team(r:&mut Rng)->[usize;3]{let mut ids=std::array::from_fn::<_,13,_>(|i|i);for i in (1..13).rev(){ids.swap(i,r.index(i+1))}[ids[0],ids[1],ids[2]]}
struct Batch{grad:[f64;FEATURES],examples:u64,loss:f64,draws:u64,wins:u64}
fn batch(start:u64,count:u64,o:&Options,w:&[f64],eval:bool)->Batch{
    let mut b=Batch{grad:[0.0;FEATURES],examples:0,loss:0.0,draws:0,wins:0};
    for index in start..start+count{
        let seed=o.seed.wrapping_add((index as u32).wrapping_add(1).wrapping_mul(0x9e3779b1));
        let mut setup=Rng(seed^0x49f2);let mut decision=Rng(seed^0x9123);let mut random=Rng(seed^0x4567);
        let mut s=State::new(team(&mut setup),team(&mut setup));let mut trace=Vec::new();
        for t in 0..o.max_turns{
            if s.winner.is_some(){break}if !eval&&t%o.stride==0{trace.push(s.features())}
            let mut actions=[Action::Move(0);2];
            for side in 0..2{
                actions[side]=if !eval&&decision.next()<o.epsilon{let legal=s.legal(side);legal[decision.index(legal.len())]}else if if eval{side==index as usize%2}else{o.policy=="learned"&&decision.next()<o.learned_rate}{s.learned(side,w,&mut decision,o.candidates,o.samples)}else{s.quick(side)};
            }
            s.step(actions,&mut random);
        }
        if s.winner.is_none(){b.draws+=1}if eval{if s.winner==Some(index as usize%2){b.wins+=1}continue}
        // Only completed games teach a win/loss target; capped games are recorded as draws.
        let target=match s.winner{Some(0)=>1.0,Some(1)=>-1.0,_=>0.0};
        for f in trace{let err=target-predict(&f,w);b.examples+=1;b.loss+=err*err;for i in 0..FEATURES{b.grad[i]+=err*f[i]}}
    }b
}
fn save(path:&Path,m:&Model){if let Some(p)=path.parent(){if !p.as_os_str().is_empty(){fs::create_dir_all(p).unwrap()}}let tmp=path.with_extension("tmp");fs::write(&tmp,serde_json::to_vec(m).unwrap()).unwrap();fs::rename(tmp,path).unwrap()}
fn main(){
    let args:Vec<_>=std::env::args().collect();let val=|k:&str,d:&str|args.iter().position(|x|x==k).map(|i|args.get(i+1).expect("missing argument").as_str().to_owned()).unwrap_or_else(||d.to_owned());
    if args.iter().any(|a|a=="--help"){println!("--games 1000000 --workers 8 --out analysis/value-rust.json --policy learned|quick --epsilon 0.15 --learned-rate 0.5 --batch 128 --candidates 3 --samples 1 --eval 200");return}
    if args.iter().any(|a|a=="--trace"){
        use std::io::{self,BufRead};for line in io::stdin().lock().lines(){let line=line.unwrap();let v:serde_json::Value=serde_json::from_str(&line).unwrap();let teams=v["teams"].as_array().unwrap();let ids=|i:usize|std::array::from_fn(|j|data().chars.iter().position(|c|c.id==teams[i][j].as_str().unwrap()).unwrap());let mut s=State::new(ids(0),ids(1));let mut rng=Rng(v["seed"].as_u64().unwrap()as u32);let mut rows=vec![serde_json::json!({"state":s,"features":s.features().to_vec()})];for pair in v["actions"].as_array().unwrap(){let a=std::array::from_fn(|i|{let x=&pair[i];let j=x["index"].as_i64().unwrap();if x["kind"]=="switch"{Action::Switch(j as usize)}else{Action::Move(j as i32)}});if s.winner.is_some(){break}s.step(a,&mut rng);rows.push(serde_json::json!({"state":s,"features":s.features().to_vec()}));}println!("{}",serde_json::to_string(&rows).unwrap());}return
    }
    let games:u64=val("--games","1000000").parse().unwrap();let default_workers=std::thread::available_parallelism().map(|x|x.get()).unwrap_or(1).to_string();let workers:usize=val("--workers",&default_workers).parse().unwrap();let size:u64=val("--batch","128").parse().unwrap();let eval:u64=val("--eval","200").parse().unwrap();
    let opts=Options{seed:val("--seed","1").parse().unwrap(),max_turns:val("--max-turns","80").parse().unwrap(),epsilon:val("--epsilon","0.15").parse().unwrap(),learned_rate:val("--learned-rate","0.5").parse().unwrap(),candidates:val("--candidates","3").parse().unwrap(),samples:val("--samples","1").parse().unwrap(),stride:val("--stride","2").parse().unwrap(),policy:val("--policy","learned"),lr:val("--lr","0.05").parse().unwrap()};
    assert!(workers>0&&size>0&&opts.max_turns>0&&opts.samples>0&&opts.stride>0&&(0.0..=1.0).contains(&opts.epsilon)&&(0.0..=1.0).contains(&opts.learned_rate)&&opts.lr>0.0&&opts.lr<=1.0&&matches!(opts.policy.as_str(),"quick"|"learned"));
    assert_eq!(data().chars.iter().map(|c|c.id.as_str()).collect::<Vec<_>>(),["ema","sherry","hanna","hiro","margo","nanoka","anan","miria","noa","reia","arisa","coco","meruru"],"Roster layout changed; update feature mapping");
    let out=val("--out","analysis/value-rust.json");let path=Path::new(&out);
    let mut m=if path.exists(){let m:Model=serde_json::from_slice(&fs::read(path).unwrap()).unwrap();assert!(m.engine==engine()&&m.schema==schema()&&m.opts==opts&&m.weights.len()==FEATURES&&m.m.len()==FEATURES&&m.v.len()==FEATURES,"Incompatible checkpoint; use a new --out");m}else{let mut w=vec![0.0;FEATURES];w[0]=1.0;Model{engine:engine(),schema:schema(),games:0,updates:0,examples:0,weights:w,m:vec![0.0;FEATURES],v:vec![0.0;FEATURES],opts:opts.clone()}};
    let started=Instant::now();let initial=m.games;let mut last=Instant::now();eprintln!("Rust training {} -> {} games; {} workers",initial,games,workers);
    while m.games<games{
        let (end,results)=std::thread::scope(|scope|{let mut jobs=Vec::new();let mut start=m.games;for _ in 0..workers{let count=size.min(games-start);if count==0{break}let w=&m.weights;let o=&opts;let x=start;jobs.push(scope.spawn(move||batch(x,count,o,w,false)));start+=count}(start,jobs.into_iter().map(|j|j.join().unwrap()).collect::<Vec<_>>())});
        let ex=results.iter().map(|b|b.examples).sum::<u64>();m.updates+=1;let step=m.updates as f64;if ex>0{for i in 0..FEATURES{let g=results.iter().map(|b|b.grad[i]).sum::<f64>()/ex as f64-0.0001*m.weights[i];m.m[i]=0.9*m.m[i]+0.1*g;m.v[i]=0.999*m.v[i]+0.001*g*g;m.weights[i]=(m.weights[i]+opts.lr*(m.m[i]/(1.0-0.9_f64.powf(step)))/((m.v[i]/(1.0-0.999_f64.powf(step))).sqrt()+1e-8)).clamp(-8.0,8.0)}}
        m.games=end;m.examples+=ex;if last.elapsed().as_secs()>=3||m.games==games{save(path,&m);last=Instant::now();eprintln!("{}/{} ({:.1} games/s), loss {:.4}",m.games,games,(m.games-initial)as f64/started.elapsed().as_secs_f64(),results.iter().map(|b|b.loss).sum::<f64>()/ex.max(1)as f64)}
    }
    if eval>0{let results=std::thread::scope(|scope|{let mut jobs=Vec::new();let mut start=0;for i in 0..workers{let n=eval/workers as u64+if (i as u64)<eval%workers as u64{1}else{0};let w=&m.weights;let o=&opts;let x=start;jobs.push(scope.spawn(move||batch(100_000_000+x,n,o,w,true)));start+=n}jobs.into_iter().map(|j|j.join().unwrap()).collect::<Vec<_>>()});let wins=results.iter().map(|b|b.wins).sum::<u64>();let draws=results.iter().map(|b|b.draws).sum::<u64>();println!("{{\"games\":{eval},\"wins\":{wins},\"draws\":{draws},\"rate\":{}}}",(wins as f64+0.5*draws as f64)/eval as f64)}
}
