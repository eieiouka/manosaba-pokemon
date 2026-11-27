// Offline 6-choose-3 team preview evaluation, using the native battle engine.
use manosaba_selfplay::{data,Action,Rng,State,FEATURES,predict};
use serde::{Deserialize,Serialize};
use std::{fs,path::Path,time::Instant};
type Trio=[usize;3];
type Party=[usize;6];
#[derive(Deserialize)]
struct Model{schema:String,games:u64,weights:Vec<f64>,engine:String}
#[derive(Clone,Serialize)]
struct Score{party:Party,points:f64,games:u64,wins:u64,draws:u64,rate:f64,picks:Vec<(Trio,u64)>}
#[derive(Serialize)]
struct Duel{a:u64,b:u64,games:u64,a_wins:u64,draws:u64,a_rate:f64}
fn mix(mut x:u64)->u32{x=x.wrapping_add(0x9e3779b97f4a7c15);x=(x^(x>>30)).wrapping_mul(0xbf58476d1ce4e5b9);x=(x^(x>>27)).wrapping_mul(0x94d049bb133111eb);(x^(x>>31))as u32}
fn rng(seed:u64)->Rng{Rng(mix(seed))}
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
fn game(a:Trio,b:Trio,wa:&[f64],wb:&[f64],seed:u64)->Option<usize>{
    let mut s=State::new(a,b);let mut x=rng(seed^0xabc1);let mut y=rng(seed^0xabc2);let mut r=rng(seed^0xabc3);
    for _ in 0..80{if s.winner.is_some(){break}let ac=smart(&s,0,wa,&mut x);let bc=smart(&s,1,wb,&mut y);s.step([ac,bc],&mut r);}s.winner
}
fn result(w:Option<usize>,side:usize)->u8{match w{Some(t)if t==side=>2,None=>1,_=>0}}
fn trios()->Vec<Trio>{let mut v=vec![];for a in 0..13{for b in 0..13{if b==a{continue}for c in 0..13{if c!=a&&c!=b{v.push([a,b,c])}}}}v}
fn parties()->Vec<Party>{let mut v=vec![];for mask in 0u16..(1<<13){if mask.count_ones()==6{let mut p=[0;6];let mut k=0;for j in 0..13{if mask&(1<<j)!=0{p[k]=j;k+=1}}v.push(p)}}v}
fn choices(p:Party,ts:&[Trio])->Vec<usize>{ts.iter().enumerate().filter(|(_,t)|t.iter().all(|x|p.contains(x))).map(|(i,_)|i).collect()}
fn random_trio(r:&mut Rng)->Trio{let mut a=std::array::from_fn::<_,13,_>(|i|i);for i in (1..13).rev(){a.swap(i,r.index(i+1))}[a[0],a[1],a[2]]}
fn parallel<T:Send,F:Fn(usize)->T+Sync>(n:usize,workers:usize,f:F)->Vec<T>{
    std::thread::scope(|s|{let mut jobs=vec![];for k in 0..workers{let f=&f;jobs.push(s.spawn(move||{let mut out=vec![];for i in (k..n).step_by(workers){out.push((i,f(i)))}out}));}let mut out:Vec<_>=jobs.into_iter().flat_map(|j|j.join().unwrap()).collect();out.sort_unstable_by_key(|t|t.0);out.into_iter().map(|t|t.1).collect()})
}
fn tournament(ms:&[Model],workers:usize)->(usize,Vec<Duel>){
    let mut points=vec![0.;ms.len()];let mut duels=vec![];
    for i in 0..ms.len(){for j in i+1..ms.len(){
        let n=2000;let results=parallel(n,workers,|k|{
            let seed=0x472e_0000_0000u64+k as u64/2;let mut r=rng(seed);let a=random_trio(&mut r);let b=random_trio(&mut r);
            if k%2==0{result(game(a,b,&ms[i].weights,&ms[j].weights,seed),0)}else{result(game(b,a,&ms[j].weights,&ms[i].weights,seed^0x321),1)}
        });let wins=results.iter().filter(|&&x|x==2).count()as u64;let draws=results.iter().filter(|&&x|x==1).count()as u64;let rate=(wins as f64+0.5*draws as f64)/n as f64;points[i]+=rate;points[j]+=1.-rate;let d=Duel{a:ms[i].games,b:ms[j].games,games:n as u64,a_wins:wins,draws,a_rate:rate};println!("MODEL_DUEL {}",serde_json::to_string(&d).unwrap());duels.push(d);
    }}
    let idx=(0..ms.len()).max_by(|&a,&b|points[a].total_cmp(&points[b])).unwrap();println!("MODEL_SELECTED {} score {:?}",ms[idx].games,points);(idx,duels)
}
fn samples(n:usize,total:usize,seed:u64)->Vec<usize>{let mut a:Vec<_>=(0..total).collect();let mut r=rng(seed);for i in (1..total).rev(){a.swap(i,r.index(i+1))}a.truncate(n.min(total));a}
fn best(candidates:&[usize],opponents:&[usize],matrix:&[u8],n:usize)->usize{
    *candidates.iter().max_by_key(|&&i|opponents.iter().map(|&j|matrix[i*n+j]as u32).sum::<u32>()).unwrap()
}
fn score(p:usize,opponents:&[usize],ps:&[Party],cs:&[Vec<usize>],ts:&[Trio],matrix:&[u8],w:&[f64],repeats:usize,seed:u64)->Score{
    let n=ts.len();let mut wins=0;let mut draws=0;let mut picks=vec![0u64;n];let mut games=0;
    for &q in opponents{if p==q{continue}let a=best(&cs[p],&cs[q],matrix,n);let b=best(&cs[q],&cs[p],matrix,n);picks[a]+=1;
        for k in 0..repeats{let sd=seed^((q as u64)<<20)^(k as u64/2);let v=if k%2==0{result(game(ts[a],ts[b],w,w,sd),0)}else{result(game(ts[b],ts[a],w,w,sd^0x842),1)};games+=1;wins+=(v==2)as u64;draws+=(v==1)as u64;}
    }
    let points=wins as f64+draws as f64*0.5;let mut picks:Vec<_>=picks.iter().enumerate().filter(|(_,x)|**x>0).map(|(i,&x)|(ts[i],x)).collect();picks.sort_by_key(|p|std::cmp::Reverse(p.1));picks.truncate(5);
    Score{party:ps[p],points,games,wins,draws,rate:points/games as f64,picks}
}
fn save(path:&Path,name:&str,val:&impl Serialize){fs::create_dir_all(path).unwrap();fs::write(path.join(name),serde_json::to_vec_pretty(val).unwrap()).unwrap()}
fn main(){
    let args:Vec<String>=std::env::args().collect();assert!(args.len()>=4,"team_eval output_dir workers model.json ...");let output=Path::new(&args[1]);let workers:usize=args[2].parse().unwrap();assert!(workers>0);
    let models:Vec<Model>=args[3..].iter().map(|p|serde_json::from_slice(&fs::read(p).unwrap()).unwrap()).collect();
    let schema=format!("manosaba-value-v1:{}",data().chars.iter().map(|c|c.id.as_str()).collect::<Vec<_>>().join(","));
    assert_eq!(data().chars.len(),13);assert!(models.iter().all(|m|m.schema==schema&&m.engine==models[0].engine&&m.weights.len()==FEATURES&&m.weights.iter().all(|x|x.is_finite())));
    let start=Instant::now();let (selected,duels)=tournament(&models,workers);let model=&models[selected];save(output,"model-duels.json",&serde_json::json!({"selected":model.games,"duels":duels}));
    let ts=trios();let ps=parties();let n=ts.len();assert_eq!(n,1716);assert_eq!(ps.len(),1716);let cs:Vec<_>=ps.iter().map(|&p|choices(p,&ts)).collect();assert!(cs.iter().all(|c|c.len()==120));let w=&model.weights;
    // Both sides alternate positions in two independent bouts. Row scores are integer half-win points in [0,4].
    let rows=parallel(n,workers,|i|{let mut row=vec![2;n];for j in i+1..n{let seed=0x7a91_0000_0000u64^((i as u64)<<16)^j as u64;row[j]=result(game(ts[i],ts[j],w,w,seed),0)+result(game(ts[j],ts[i],w,w,seed^0x8f0),1)}if i%100==0{eprintln!("matrix row {} of {} ({:.1}s)",i,n,start.elapsed().as_secs_f64())}row});
    let mut matrix=vec![2u8;n*n];for i in 0..n{for j in i+1..n{let v=rows[i][j];matrix[i*n+j]=v;matrix[j*n+i]=4-v}}drop(rows);fs::write(output.join("matchup-matrix.bin"),&matrix).unwrap();
    save(output,"matrix-index.json",&ts);println!("MATRIX_DONE {} games {:.1}s",n*(n-1),start.elapsed().as_secs_f64());
    let opponents=samples(64,ps.len(),0x88d4);let m=&matrix;let mut first=parallel(ps.len(),workers,|p|(p,score(p,&opponents,&ps,&cs,&ts,m,w,2,0x9482_0000_0000)));
    first.sort_by(|a,b|b.1.rate.total_cmp(&a.1.rate));save(output,"all-parties.json",&first.iter().map(|x|&x.1).collect::<Vec<_>>());println!("ALL_PARTIES_DONE {:.1}s",start.elapsed().as_secs_f64());
    // Independent roster holdout excludes every coarse-stage opponent, not only a new seed.
    let holdout:Vec<_>=samples(ps.len(),ps.len(),0xc071).into_iter().filter(|q|!opponents.contains(q)).take(192).collect();let shortlist:Vec<_>=first.iter().take(32).map(|x|x.0).collect();
    let mut final_scores=parallel(shortlist.len(),workers,|i|score(shortlist[i],&holdout,&ps,&cs,&ts,m,w,8,0xe423_0000_0000));final_scores.sort_by(|a,b|b.rate.total_cmp(&a.rate));
    save(output,"final-parties.json",&serde_json::json!({"modelGames":model.games,"characterIds":data().chars.iter().map(|c|&c.id).collect::<Vec<_>>(),"coarseOpponentParties":opponents.iter().map(|&i|ps[i]).collect::<Vec<_>>(),"holdoutOpponentParties":holdout.iter().map(|&i|ps[i]).collect::<Vec<_>>(),"rankings":final_scores}));
    for x in final_scores.iter().take(10){println!("TOP_PARTY {}",serde_json::to_string(x).unwrap())}
    println!("DONE {:.1}s",start.elapsed().as_secs_f64())
}
