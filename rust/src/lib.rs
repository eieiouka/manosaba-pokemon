use serde::{Deserialize, Serialize};
use std::sync::OnceLock;

#[derive(Default, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Move {
    pub name:String, pub category:String, #[serde(rename="type")] pub typ:usize,
    pub power:i32, pub accuracy:i32, pub pp:i32, pub priority:i32,
    pub multi_hit:String, pub contact:bool, pub struggle:bool, pub late_power:bool,
    pub drain:f64, pub crit_stage:i32, pub raise_crit:i32, pub lower_sp_a:bool,
    pub lower_sp_a_chance:i32, pub lower_atk_chance:i32, pub flinch_chance:i32,
    pub freeze_chance:i32, pub burn_chance:i32, pub sound_move:bool, pub silence:bool,
    pub self_defense_down:bool, pub pivot:bool, pub sucker:bool, pub dance:bool,
    pub swords_dance:bool, pub sleep:bool, pub foul_play:bool, pub trick_room:bool,
    pub parting:bool, pub toxic:bool, pub protect:bool, pub recover:bool, pub puppet:bool,
    pub swap_stages:bool, pub calm_mind:bool, pub stored_power:bool, pub liquid_control:bool,
    pub amnesia:bool, pub rest:bool, pub encore:bool, pub ignite:bool, pub substitute:bool,
    pub baton:bool, pub clairvoyance:bool, pub taunt:bool, pub freeze_dry:bool, pub ohko:bool,
    pub yawn:bool, pub confuse:bool, pub gravity:bool, pub agility:bool, pub trap:bool,
}
pub const FEATURES:usize=503;
impl State{
    fn attack_value(&self,a:Fighter,d:Fighter,m:&Move)->f64{
        if m.category=="status"||m.sound_move&&a.silence>0||self.blocked(m,d){return 0.0}
        let hits=if m.multi_hit=="silver"{if a.item()=="dice"{6.0}else{3.5}}else{self.limit(m)as f64};
        let second=(ranked(a,5,false)-ranked(d,5,false))*if self.trick>0{-1}else{1}<0;
        let mut v=damage(self,a,d,m,93,a.crit+m.crit_stage>=3,second)as f64*hits;
        let stage=(a.accuracy-d.evasion).clamp(-6,6);v*=if m.ohko{if a.has(ICE){0.3}else{0.2}}else{(m.accuracy as f64/100.0*(3+stage.max(0))as f64/(3+(-stage).max(0))as f64*if self.gravity>0{5.0/3.0}else{1.0}).min(1.0)};
        if m.contact&&d.id==NANOKA{v*=0.8}if m.sucker{v*=0.8}v
    }
    fn best_hit(&self,a:Fighter,d:Fighter)->f64{(0..4).filter(|&i|a.usable(i)).map(|i|self.attack_value(a,d,&a.c().moves[i])).fold(0.0,f64::max)}
    fn reserve_score(&self,side:usize,i:usize)->f64{
        let mut a=self.teams[side][i];let mut d=self.a(1-side);let frac=a.hp as f64/a.max()as f64;
        if d.hp==0{return frac-if a.id==EMA&&self.living(side)>1{0.6}else{0.0}}
        a.locked=-1;if a.id==ANAN{d.change(1,-1);d.change(3,-1)}
        (self.best_hit(a,d)/d.max()as f64).min(1.0)-(self.best_hit(d,a)/a.max()as f64).min(1.0)+0.35*frac+if ranked(a,5,false)>ranked(d,5,false){0.12}else{0.0}+if a.id==MARGO&&self.terrain==0{0.22}else{0.0}-if a.id==EMA&&self.living(side)>1{0.2}else{0.0}
    }
    pub fn rank(&self,side:usize)->Vec<Action>{
        let a=self.a(side);let d=self.a(1-side);let best=self.best_hit(a,d);let incoming=self.best_hit(d,a);let hp=a.hp.max(1)as f64;let dh=d.hp.max(1)as f64;let max=a.max()as f64;let reserves=!self.reserves(side).is_empty();
        let mut result:Vec<_>=self.legal(side).into_iter().map(|act|{
            let mut v=match act{Action::Switch(i)=>{self.reserve_score(side,i)-self.reserve_score(side,self.active[side])-0.35+if a.drowsy==1{0.65}else{0.0}-if best>=dh{0.8}else{0.0}},Action::Move(i)=>{
                let m=move_at(a,i);if m.category=="status"{
                    let mut v=-1.0;
                    if (m.dance||m.swords_dance)&&a.stages[1]<4&&best<dh&&(incoming<hp*0.55||a.item()=="sash"&&a.hp==a.max()){v=0.7+(best/dh).min(0.4)}
                    if m.calm_mind&&(a.stages[3]<6||a.stages[4]<6)&&best<dh&&incoming<hp*0.65{v=0.58+(best/dh).min(0.35)}
                    if m.clairvoyance{let streak=if a.clair.max(a.protect)==self.turn-1{a.streak}else{0};let first=(ranked(a,5,false)-ranked(d,5,false))*if self.trick>0{-1}else{1}>0;v=(if a.evasion<6{0.4}else{0.06}+if first{0.25+incoming/hp*0.25}else{0.0})*(1.0_f64/3.0).powi(streak)}
                    if m.agility&&a.stages[5]<5&&incoming<hp*0.55{v=0.35+if a.stages[5]<2{0.2}else{0.0}}
                    if m.substitute&&a.sub==0&&hp>max/4.0&&incoming<hp*0.6{v=0.6}
                    if m.baton&&reserves{v=0.12+0.16*(a.stages[1].max(0)+a.stages[3].max(0))as f64+0.14*a.stages[5].max(0)as f64+if a.sub>0{0.2}else{0.0}}
                    if m.protect&&a.id==ARISA&&a.stages[5]<6&&a.protect!=self.turn-1{v=0.55}
                    if m.protect&&d.status==TOXIC&&a.protect!=self.turn-1&&incoming>0.0{v=0.45+(d.toxic as f64*0.09).min(0.5)}
                    if m.amnesia&&a.stages[4]<5&&d.c().moves.iter().any(|m|m.category=="special")&&incoming<hp*0.65{v=0.5}
                    if m.rest&&hp<max*0.55{v=0.55+if a.item()=="chesto"{0.5}else{0.0}+if a.status!=NONE{0.15}else{0.0}}
                    if m.recover&&hp<max*0.65{v=0.4+(1.0-hp/max).min(0.5)-(incoming/hp*0.2).min(0.4)}
                    if m.toxic&&d.status==NONE&&!d.has(POISON)&&!d.has(STEEL){v=0.55}
                    if m.yawn&&d.status==NONE&&d.drowsy==0{v=0.45}
                    if m.encore&&d.last>=0&&d.encore==0&&move_at(d,d.last).category=="status"&&d.pp[d.last as usize]>0{v=0.9}
                    if m.sleep&&d.status==NONE&&!(m.sound_move&&a.silence>0){v=0.75}
                    if m.trick_room&&self.trick==0&&ranked(a,5,false)<ranked(d,5,false){v=0.45}
                    if m.parting&&reserves&&!(m.sound_move&&a.silence>0)&&(d.stages[1]>-6||d.stages[3]>-6){v=0.5}
                    if m.gravity&&self.gravity==0&&self.terrain>2&&self.teams[side].iter().any(|c|c.id==HANNA&&c.hp>0){v=0.55}
                    if m.confuse&&d.confusion==0&&reserves&&!(m.sound_move&&a.silence>0){v=0.55*(m.accuracy as f64/100.0*if self.gravity>0{5.0/3.0}else{1.0}).min(1.0)}
                    if m.taunt&&d.taunt==0&&d.c().moves.iter().any(|m|m.dance||m.swords_dance||m.calm_mind||m.gravity){v=0.35}v
                }else{let dmg=self.attack_value(a,d,m);let mut v=dmg/dh;if dmg>=dh&&m.priority>0{v+=0.7}
                    if m.ignite&&dmg>0.0{v+=if d.status==NONE&&!d.has(FIRE)&&d.sub==0{0.65}else{0.0}+if a.stages[1]<6{0.3}else{0.0}}
                    if m.swap_stages{let weights=[0.0,0.15,0.1,0.15,0.1,0.1];let gain=(1..6).map(|i|(d.stages[i]-a.stages[i]).max(0)as f64*weights[i]).sum::<f64>()+0.08*((d.accuracy-a.accuracy).max(0)+(d.evasion-a.evasion).max(0)+(d.crit-a.crit).max(0))as f64;let status=if swap_status(a,d){0.35}else{0.0}+0.12*((a.confusion-d.confusion).max(0)+(a.drowsy-d.drowsy).max(0)+(a.taunt-d.taunt).max(0)+(a.silence-d.silence).max(0))as f64;if gain+status>0.0{v+=0.15+gain+status}}v}
            }};
            if !v.is_finite(){v=-1.0}(act,v)
        }).collect();result.sort_by(|a,b|b.1.total_cmp(&a.1));result.into_iter().map(|x|x.0).collect()
    }
    pub fn quick(&self,side:usize)->Action{self.rank(side)[0]}
    fn material(&self,side:usize)->f64{
        self.teams[side].iter().enumerate().filter(|(_,c)|c.hp>0).map(|(i,c)|{
            let on=i==self.active[side];let mut v=0.65+c.hp as f64/c.max()as f64;
            if c.item()=="sash"&&c.hp==c.max(){v+=0.12}if c.id==HIRO&&!c.revived{v+=0.24}v-=match c.status{BURN=>0.10,SLEEP|FREEZE=>0.13,POISONED=>0.12,TOXIC=>0.13+0.035*c.toxic.min(5)as f64,_=>0.0};
            if on{v+=c.sub as f64/c.max()as f64;if c.drowsy>0{v-=0.16}if c.confusion>0{v-=0.18}if c.taunt>0&&c.c().moves.iter().any(|m|m.dance||m.swords_dance||m.calm_mind||m.confuse||m.gravity){v-=0.09}v+=0.07*c.evasion as f64+0.035*c.accuracy as f64+0.085*(c.stages[1]+c.stages[3])as f64+0.035*(c.stages[2]+c.stages[4]+c.stages[5])as f64+0.045*c.crit as f64}v
        }).sum()
    }
    fn initiative(&self)->f64{
        let a=self.a(0);let d=self.a(1);let speed=(ranked(a,5,false)-ranked(d,5,false))*if self.trick>0{-1}else{1};
        let ours:Vec<_>=(0..4).filter(|&i|a.usable(i)).map(|i|(&a.c().moves[i],self.attack_value(a,d,&a.c().moves[i]))).filter(|x|x.1>0.0).collect();
        let theirs:Vec<_>=(0..4).filter(|&i|d.usable(i)).map(|i|(&d.c().moves[i],self.attack_value(d,a,&d.c().moves[i]))).filter(|x|x.1>0.0).collect();
        let before=|m:&Move,n:&Move|m.priority>n.priority||m.priority==n.priority&&speed>0;
        let own=ours.iter().map(|(m,v)|{let danger=theirs.iter().filter(|(n,_)|!before(m,n)).map(|x|x.1).fold(0.0,f64::max)/a.hp as f64;(v/d.hp as f64).min(1.0)*if danger>=1.0{0.15}else{1.0-0.35*danger}}).fold(0.0,f64::max);
        let enemy=theirs.iter().map(|(m,v)|{let danger=ours.iter().filter(|(n,_)|before(n,m)).map(|x|x.1).fold(0.0,f64::max)/d.hp as f64;(v/a.hp as f64).min(1.0)*if danger>=1.0{0.15}else{1.0-0.35*danger}}).fold(0.0,f64::max);own-enemy
    }
    fn terrain_value(&self,side:usize)->f64{let mut s=*self;s.terrain=0;let mut benefit=0.0;for &c in &self.teams[side]{if c.hp==0||!grounded(c,self){continue}let mut threat=0.0_f64;for &d in &self.teams[1-side]{if d.hp==0{continue}for m in &d.c().moves{if m.priority>0&&m.category!="status"{threat=threat.max((s.attack_value(d,c,m)/c.hp as f64).min(1.0))}}}benefit+=threat*if c.c().moves.iter().any(|m|m.dance||m.swords_dance||m.calm_mind){0.10}else{0.055}}benefit*(self.terrain as f64/4.0).min(1.0)}
    pub fn evaluate(&self)->f64{if let Some(w)=self.winner{return if w==0{1.0}else{-1.0}}let a=self.a(0);let d=self.a(1);let mut v=self.material(0)-self.material(1);if a.hp>0&&d.hp>0{v+=0.17*((self.best_hit(a,d)/d.hp as f64).min(1.0)-(self.best_hit(d,a)/a.hp as f64).min(1.0))+0.18*self.initiative();if self.terrain>0{v+=self.terrain_value(0)-self.terrain_value(1)}}(v/2.5).tanh()}
    pub fn features(&self)->[f64;FEATURES]{
        let mut f=[0.0;FEATURES];f[0]=self.evaluate().clamp(-0.999,0.999).atanh();
        for side in 0..2{let sign=if side==0{1.0}else{-1.0};let a=self.a(side);let d=self.a(1-side);
            let living:Vec<_>=self.teams[side].iter().filter(|c|c.hp>0).collect();
            for c in &living{let k=1+c.id*12;let on=c.id==a.id;let frac=c.hp as f64/c.max()as f64;
                let z=[1.0,frac,on as u8 as f64,if on{(c.stages[1]+c.stages[3])as f64/6.0}else{0.0},if on{(c.stages[2]+c.stages[4])as f64/6.0}else{0.0},if on{c.stages[5]as f64/6.0}else{0.0},if on{c.evasion as f64/6.0}else{0.0},(c.status!=NONE)as u8 as f64,c.item as u8 as f64,if on{c.sub as f64/c.max()as f64}else{0.0},if on{(c.taunt+c.encore+c.confusion)as f64/8.0}else{0.0},(0..4).map(|i|c.pp[i]as f64/c.c().moves[i].pp.max(1)as f64).sum::<f64>()/4.0];for i in 0..12{f[k+i]+=sign*z[i]}}
            for i in 0..living.len(){for j in i+1..living.len(){let x=living[i].id;let y=living[j].id;f[157+x.min(y)*13+x.max(y)]+=sign}}
            if a.hp>0{f[326+a.id*13+d.id]+=sign}let e=495;
            f[e]+=sign*living.len()as f64/3.0;f[e+1]+=sign*living.iter().map(|c|c.hp as f64/c.max()as f64).sum::<f64>()/3.0;
            f[e+2]+=sign*living.iter().filter(|c|c.id==MIRIA||c.id==MARGO).count()as f64*self.terrain as f64/8.0;f[e+3]+=sign*living.iter().filter(|c|c.c().stats[5]<100).count()as f64*self.trick as f64/5.0;
            f[e+4]+=sign*(a.hp>0&&a.status==SLEEP)as u8 as f64;f[e+5]+=sign*(a.hp>0&&a.status==BURN)as u8 as f64;f[e+6]+=sign*(a.hp>0&&a.status==TOXIC)as u8 as f64;f[e+7]+=sign*if a.hp>0{a.crit as f64/3.0}else{0.0}
        }f
    }
    pub fn learned(&self,side:usize,weights:&[f64],rng:&mut Rng,candidates:usize,samples:usize)->Action{
        let actions=self.rank(side);if actions.len()==1{return actions[0]}let opponent=self.quick(1-side);let seeds:Vec<_>=(0..samples).map(|_|(rng.next()*4294967296.0)as u32).collect();let mut best=actions[0];let mut value=f64::NEG_INFINITY;
        for act in actions.into_iter().take(if candidates==0{6}else{candidates}){let mut v=0.0;for &seed in &seeds{let mut s=*self;let mut a=[opponent;2];a[side]=act;s.step(a,&mut Rng(seed));let val=match s.winner{Some(0)=>1.0,Some(1)=>-1.0,_=>predict(&s.features(),weights)};v+=if side==0{val}else{-val}}if v>value{best=act;value=v}}best
    }
}
pub fn predict(f:&[f64],w:&[f64])->f64{f.iter().zip(w).map(|(a,b)|a*b).sum::<f64>().tanh()}
#[derive(Deserialize)]
pub struct Character {pub id:String, pub stats:[i32;6], pub types:Vec<usize>, pub item:String, pub moves:[Move;4]}
#[derive(Deserialize)]
pub struct Data {pub chars:Vec<Character>, pub chart:[[i32;18];18], pub struggle:Move}
pub fn data()->&'static Data {static DATA:OnceLock<Data>=OnceLock::new();DATA.get_or_init(||serde_json::from_str(include_str!("../data.json")).expect("invalid roster"))}
pub const EMA:usize=0;const SHERRY:usize=1;const HANNA:usize=2;const HIRO:usize=3;const MARGO:usize=4;const NANOKA:usize=5;const ANAN:usize=6;const MIRIA:usize=7;const NOA:usize=8;const REIA:usize=9;const ARISA:usize=10;const COCO:usize=11;const MERURU:usize=12;
const FIRE:usize=1;const WATER:usize=2;const GRASS:usize=4;const ICE:usize=5;const POISON:usize=7;const GROUND:usize=8;const FLYING:usize=9;const PSYCHIC:usize=10;const GHOST:usize=13;const STEEL:usize=16;
const NONE:i32=0;const BURN:i32=1;const SLEEP:i32=2;const FREEZE:i32=3;const TOXIC:i32=4;const POISONED:i32=5;
#[derive(Clone,Copy,Debug,Serialize)]
pub struct Fighter {
    pub id:usize,pub hp:i32,pub stages:[i32;6],pub pp:[i32;4],pub item:bool,
    pub locked:i32,pub last:i32,pub encore:i32,pub encore_move:i32,pub crit:i32,
    pub accuracy:i32,pub evasion:i32,pub status:i32,pub sleep:i32,pub toxic:i32,
    pub drowsy:i32,pub streak:i32,pub protect:i32,pub clair:i32,pub sub:i32,
    pub confusion:i32,pub taunt:i32,pub silence:i32,pub trapped:i32,pub revived:bool,
}
impl Fighter {
    pub fn new(id:usize)->Self {let c=&data().chars[id];Self{id,hp:c.stats[0],stages:[0;6],pp:c.moves.each_ref().map(|m|m.pp),item:!c.item.is_empty(),locked:-1,last:-1,encore:0,encore_move:-1,crit:0,accuracy:0,evasion:0,status:0,sleep:0,toxic:0,drowsy:0,streak:0,protect:0,clair:0,sub:0,confusion:0,taunt:0,silence:0,trapped:-1,revived:false}}
    pub fn c(&self)->&'static Character{&data().chars[self.id]}
    pub fn max(&self)->i32{self.c().stats[0]}
    pub fn has(&self,t:usize)->bool{self.c().types.contains(&t)}
    pub fn item(&self)->&'static str{if self.item{&self.c().item}else{""}}
    fn reset(&mut self){let mut new=Self::new(self.id);new.hp=self.hp;new.pp=self.pp;new.item=self.item;new.status=self.status;new.sleep=self.sleep;new.revived=self.revived;*self=new;}
    fn change(&mut self,k:usize,n:i32){self.stages[k]=(self.stages[k]+n).clamp(-6,6);}
    fn heal(&mut self,n:i32){if self.hp>0{self.hp=(self.hp+n.max(1)).min(self.max());}}
    fn hurt(&mut self,n:i32){self.hp=(self.hp-n.max(1)).max(0);}
    fn berry(&mut self){if self.hp>0&&self.hp*2<=self.max()&&self.item()=="sitrus"{self.item=false;self.heal(self.max()/4)}}
    fn wake(&mut self){if self.hp>0&&self.status==SLEEP&&self.item()=="chesto"{self.item=false;self.status=NONE;self.sleep=0}}
    fn choice(&self)->bool{matches!(self.item(),"band"|"scarf"|"specs")}
    pub fn usable(&self,i:usize)->bool{self.pp[i]>0&&!(self.c().moves[i].category=="status"&&(self.item()=="vest"||self.taunt>0))&&(!self.choice()||self.locked<0||self.locked==i as i32)&&(self.encore==0||self.encore_move==i as i32)}
}
#[derive(Clone,Copy,Debug,Serialize)]
pub struct State{pub teams:[[Fighter;3];2],pub active:[usize;2],pub turn:i32,pub winner:Option<usize>,pub terrain:i32,pub gravity:i32,pub trick:i32}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum Action{Switch(usize),Move(i32)}
#[derive(Clone,Copy)]
pub struct Rng(pub u32);
impl Rng{pub fn next(&mut self)->f64{self.0=self.0.wrapping_mul(1664525).wrapping_add(1013904223);self.0 as f64/4294967296.0}pub fn index(&mut self,n:usize)->usize{(self.next()*n as f64)as usize}}
fn half(v:i32,n:i32,d:i32)->i32{(v*n+(d-1)/2)/d}
fn ranked(c:Fighter,k:usize,ignore:bool)->i32{stat(c,k,ignore,c.id,c.item())}
fn stat(c:Fighter,k:usize,ignore:bool,ability:usize,item:&str)->i32{let s=if ignore{0}else{c.stages[k]};let mut v=(c.c().stats[k]*(2+s.max(0))/(2+(-s).max(0))).max(1);if k==1&&ability==SHERRY{v*=2}if matches!((item,k),("band",1)|("specs",3)|("vest",4)|("scarf",5)){v=v*3/2}v}
fn grounded(c:Fighter,s:&State)->bool{s.gravity>0||(!c.has(FLYING)&&c.id!=HANNA)}
fn matchup(a:Fighter,d:Fighter,m:&Move,s:&State)->i32{if m.struggle{return 4}if m.ohko{return if d.has(ICE){0}else{4}}if m.typ==GROUND&&d.id==HANNA&&s.gravity==0{return 0}if a.id==MIRIA||d.id==MIRIA{return 4}
    let mut e=4;for &t in &d.c().types{if m.typ==GROUND&&s.gravity>0&&t==FLYING{continue}let x=if (m.liquid_control&&(t==WATER||t==GRASS))||(m.freeze_dry&&t==WATER){4}else{data().chart[m.typ][t]};e=e*x/2;}e}
pub fn damage(s:&State,a:Fighter,d:Fighter,m:&Move,roll:i32,critical:bool,second:bool)->i32{
    let e=matchup(a,d,m,s);if e==0{return 0}if m.ohko{return d.hp.max(d.sub)}
    let k=if m.category=="physical"{1}else{3};let source=if m.foul_play{d}else{a};
    let attack=if m.puppet{[1,3].iter().map(|&i|stat(d,i,critical&&d.stages[i]<0,a.id,a.item())).max().unwrap()}else{stat(source,k,(d.id==NOA&&!m.foul_play)||(a.id==NOA&&m.foul_play)||critical&&source.stages[k]<0,a.id,a.item())};
    let defense=ranked(d,k+1,a.id==NOA||critical&&d.stages[k+1]>0);
    let mut p=if m.stored_power{20+20*(a.stages[1..].iter().map(|x|(*x).max(0)).sum::<i32>()+a.accuracy.max(0)+a.evasion.max(0))}else{m.power};
    if m.liquid_control&&d.status!=NONE{p*=2}if s.terrain>0&&m.typ==PSYCHIC&&grounded(a,s){p=half(p,5325,4096)}if a.item()=="neverMeltIce"&&m.typ==ICE{p=half(p,4915,4096)}if m.late_power&&second{p*=2}
    let mut v=22*p*attack/defense/50+2;if critical{v=half(v,3,2)}v=v*roll/100;if !m.struggle&&a.has(m.typ){v=half(v,3,2)}v=v*e/4;if a.status==BURN&&k==1{v=half(v,1,2)}if a.item()=="orb"{v=half(v,5324,4096)}v.max(1)
}
fn accuracy(s:&State,a:Fighter,d:Fighter,m:&Move)->f64{if m.ohko{return if a.has(ICE){0.3}else{0.2}}let stage=((if d.id==NOA{0}else{a.accuracy})-(if a.id==NOA{0}else{d.evasion})).clamp(-6,6);(m.accuracy as f64/100.0*(3+stage.max(0))as f64/(3+(-stage).max(0))as f64*if s.gravity>0{5.0/3.0}else{1.0}).min(1.0)}
fn crit(a:Fighter,m:&Move)->f64{[1.0/24.0,0.125,0.5,1.0][(a.crit+m.crit_stage).clamp(0,3)as usize]}
fn move_at(a:Fighter,i:i32)->&'static Move{if i<0{&data().struggle}else{&a.c().moves[i as usize]}}
fn swap_status(a:Fighter,d:Fighter)->bool{a.status!=NONE&&(d.status==NONE||a.status==TOXIC&&d.status==POISONED)}
impl State{
    pub fn new(a:[usize;3],b:[usize;3])->Self{let mut s=Self{teams:[a.map(Fighter::new),b.map(Fighter::new)],active:[0,0],turn:1,winner:None,terrain:0,gravity:0,trick:0};s.entry(0);s.entry(1);s.seeds();s}
    pub fn a(&self,side:usize)->Fighter{self.teams[side][self.active[side]]}
    fn put(&mut self,side:usize,c:Fighter){self.teams[side][self.active[side]]=c}
    fn living(&self,side:usize)->usize{self.teams[side].iter().filter(|c|c.hp>0).count()}
    fn reserves(&self,side:usize)->Vec<usize>{(0..3).filter(|&i|i!=self.active[side]&&self.teams[side][i].hp>0).collect()}
    fn seeds(&mut self){if self.terrain>0{for side in 0..2{let mut c=self.a(side);if c.hp>0&&c.item()=="psychicSeed"&&c.stages[4]<6{c.item=false;c.change(4,1);self.put(side,c)}}}}
    fn entry(&mut self,side:usize){let mut a=self.a(side);let mut d=self.a(1-side);match a.id{ANAN if d.hp>0=>{d.change(1,-1);d.change(3,-1);self.put(1-side,d)},MARGO if self.terrain==0=>self.terrain=if a.item()=="terrain"{8}else{5},EMA if self.living(side)==1=>{a.change(3,1);self.put(side,a)},_=>{}}}
    fn enter(&mut self,side:usize){self.entry(side);self.seeds()}
    fn switch(&mut self,side:usize,i:usize,baton:bool){let mut a=self.a(side);let mut d=self.a(1-side);if d.trapped==a.id as i32{d.trapped=-1;self.put(1-side,d)}let old=a;a.reset();self.put(side,a);self.active[side]=i;if baton{let mut c=self.a(side);c.stages=old.stages;c.accuracy=old.accuracy;c.evasion=old.evasion;c.crit=old.crit;c.sub=old.sub;self.put(side,c)}self.enter(side)}
    pub fn legal(&self,side:usize)->Vec<Action>{let a=self.a(side);let d=self.a(1-side);let mut out=Vec::with_capacity(6);if a.hp==0||d.hp==0||!(d.id==REIA||a.trapped==d.id as i32&&!a.has(GHOST)){out.extend(self.reserves(side).into_iter().map(Action::Switch));}if a.hp>0{let old=out.len();out.extend((0..4).filter(|&i|a.usable(i)).map(|i|Action::Move(i as i32)));if old==out.len(){out.push(Action::Move(-1))}}out}
    fn limit(&self,m:&Move)->i32{match m.multi_hit.as_str(){"fainted"=>self.teams.iter().flatten().filter(|c|c.hp==0).count()as i32,"silver"=>6,"double"=>2,_=>1}}
    fn blocked(&self,m:&Move,d:Fighter)->bool{self.terrain>0&&m.priority>0&&!m.protect&&!m.clairvoyance&&grounded(d,self)}
    fn pick(&self,side:usize)->Option<usize>{let mut best=None;let mut v=f64::NEG_INFINITY;for i in self.reserves(side){let x=self.reserve_score(side,i);if x>v{best=Some(i);v=x}}best}
    fn pivot(&mut self,side:usize,baton:bool){if let Some(i)=self.pick(side){self.switch(side,i,baton)}}
    fn clear_traps(&mut self){let mut a=self.a(0);let mut b=self.a(1);if a.hp==0&&b.trapped==a.id as i32{b.trapped=-1}if b.hp==0&&a.trapped==b.id as i32{a.trapped=-1}self.put(0,a);self.put(1,b);}
    pub fn step(&mut self,actions:[Action;2],rng:&mut Rng){let _=self.step_traced(actions,rng);}
    // Experimental instrumentation: scheduling order and attempted move indices.
    pub fn step_traced(&mut self,mut actions:[Action;2],rng:&mut Rng)->([usize;2],[Option<i32>;2]){
        if self.winner.is_some(){return ([0,1],[None,None])}
        let mut attempted=[None,None];
        let priority=|side:usize|match actions[side]{Action::Switch(_)=>6,Action::Move(i)=>move_at(self.a(side),i).priority};
        let mut diff=priority(0)-priority(1);if diff==0{diff=(ranked(self.a(0),5,false)-ranked(self.a(1),5,false))*if self.trick>0&&actions.iter().all(|a|matches!(a,Action::Move(_))){-1}else{1}}
        let order=if diff>0||diff==0&&rng.next()<0.5{[0,1]}else{[1,0]};
        let mut flinch=[false;2];
        for (pos,&side) in order.iter().enumerate(){
            let mut a=self.a(side);let mut d=self.a(1-side);if a.hp==0||d.hp==0{continue}
            let mut i=match actions[side]{Action::Switch(i)=>{self.switch(side,i,false);continue},Action::Move(i)=>i};
            if flinch[side]{continue}
            if a.status==FREEZE{if rng.next()<0.2{a.status=NONE}else{continue}}
            if a.status==SLEEP{if a.sleep>0{a.sleep-=1;self.put(side,a);continue}else{a.status=NONE}}
            if a.confusion>0{a.confusion-=1;if a.confusion>0&&rng.next()<1.0/3.0{let mut src=a;src.item=false;let mut m=data().struggle.clone();m.power=40;a.hurt(damage(self,src,a,&m,100,false,false));self.put(side,a);self.clear_traps();continue}}
            if a.encore>0&&(i!=a.encore_move||i<0||!a.usable(i as usize)){i=if a.encore_move>=0&&a.usable(a.encore_move as usize){a.encore_move}else{-1};actions[side]=Action::Move(i)}
            let m=move_at(a,i);
            if i>=0&&!a.usable(i as usize)||i<0&&(0..4).any(|j|a.usable(j)){self.put(side,a);continue}
            attempted[side]=Some(i);
            if i>=0{a.pp[i as usize]-=1;if a.choice(){a.locked=i}}a.last=i;self.put(side,a);
            if self.blocked(m,d)||m.sound_move&&a.silence>0{continue}
            let targeted=m.category!="status"||m.toxic||m.yawn||m.sleep||m.confuse||m.taunt||m.swap_stages||m.ignite||m.parting||m.encore;
            if m.clairvoyance||m.protect{
                if m.protect&&(pos>0||matches!(actions[1-side],Action::Switch(_))){a.streak=0;a.protect=0;self.put(side,a);continue}
                let streak=if a.clair.max(a.protect)==self.turn-1{a.streak}else{0};
                if streak>0&&rng.next()>=(1.0_f64/3.0).powi(streak){a.streak=0}else{a.streak=streak+1;if m.clairvoyance{a.clair=self.turn;a.evasion=(a.evasion+1).min(6)}else{a.protect=self.turn}}self.put(side,a);continue
            }
            if targeted&&(d.clair==self.turn||d.protect==self.turn){continue}
            if m.category=="status"{
                let mut pivot=false;let mut baton=false;
                if m.substitute{let cost=(a.max()/4).max(1);if a.sub==0&&a.hp>cost{a.hp-=cost;a.sub=cost;a.berry()}}
                else if m.baton{pivot=true;baton=true}
                else if d.sub>0&&!m.sound_move&&(m.toxic||m.yawn||m.sleep||m.confuse||m.parting){}
                else if m.calm_mind{a.change(3,1);a.change(4,1)}
                else if m.amnesia{a.change(4,2)}
                else if m.agility{a.change(5,2)}
                else if m.rest{if a.hp<a.max(){a.hp=a.max();a.status=SLEEP;a.sleep=2;a.toxic=0;a.drowsy=0;a.wake()}}
                else if m.recover{a.heal(a.max()/2)}
                else if m.toxic{if !d.has(POISON)&&!d.has(STEEL)&&d.status==NONE&&(a.has(POISON)||rng.next()<accuracy(self,a,d,m)){d.status=TOXIC;d.toxic=0;d.drowsy=0}}
                else if m.yawn{if d.status==NONE&&d.drowsy==0{d.drowsy=2}}
                else if m.trick_room{self.trick=if self.trick>0{0}else{5}}
                else if m.gravity{if self.gravity==0{self.gravity=5}}
                else if m.encore{if d.last>=0&&d.encore==0&&!move_at(d,d.last).encore&&d.pp[d.last as usize]>0&&rng.next()<accuracy(self,a,d,m){d.encore_move=d.last;d.encore=3}}
                else if m.parting{if !self.reserves(side).is_empty()&&(d.stages[1]>-6||d.stages[3]>-6)&&rng.next()<accuracy(self,a,d,m){d.change(1,-1);d.change(3,-1);pivot=true}}
                else if m.sleep||m.confuse||m.taunt{if rng.next()<accuracy(self,a,d,m){if m.sleep&&d.status==NONE{d.status=SLEEP;d.sleep=1+rng.index(3)as i32;d.wake();pivot=m.pivot}else if m.confuse&&d.confusion==0{d.confusion=2+rng.index(4)as i32;pivot=m.pivot}else if m.taunt&&d.taunt==0{d.taunt=3}}}
                else if m.dance||m.swords_dance{a.change(1,2);if m.dance{a.crit=(a.crit+1).min(3)}}
                self.put(side,a);self.put(1-side,d);if pivot{self.pivot(side,baton)}continue
            }
            if m.sucker&&(pos>0||match actions[1-side]{Action::Switch(_)=>true,Action::Move(j)=>move_at(d,j).category=="status"}){continue}
            let limit=if m.multi_hit=="silver"&&a.item()!="dice"{1+rng.index(6)as i32}else{self.limit(m)};
            if limit==0||matchup(a,d,m,self)==0{continue}
            let mut hits=0;let mut body=0;let mut total=0;
            for h in 0..limit{if a.hp==0||d.hp==0{break}if (h==0||!matches!(m.multi_hit.as_str(),"silver"|"double"))&&rng.next()>=accuracy(self,a,d,m){break}if h==0&&m.contact&&d.id==NANOKA&&rng.next()<0.2{break}
                let critical=!m.ohko&&rng.next()<crit(a,m);let roll=85+rng.index(16)as i32;let dealt=damage(self,a,d,m,roll,critical,pos>0&&matches!(actions[1-side],Action::Move(_)));hits+=1;
                if d.sub>0&&!m.sound_move{d.sub=(d.sub-dealt).max(0);continue}body+=1;let before=d.hp;if d.item()=="sash"&&d.hp==d.max()&&dealt>=d.hp{d.hp=1;d.item=false}else{d.hurt(dealt)}total+=before-d.hp;d.berry();if m.contact&&d.item()=="helmet"&&a.hp>0{a.hurt(a.max()/6)}
            }
            if hits==0{continue}
            if m.ignite&&a.hp>0{if body>0&&d.hp>0&&d.status==NONE&&!d.has(FIRE){d.status=BURN;d.drowsy=0}a.change(1,1)}
            if body>0&&m.swap_stages&&a.hp>0&&d.hp>0{
                for k in 1..6{if a.stages[k]<d.stages[k]{std::mem::swap(&mut a.stages[k],&mut d.stages[k])}}
                macro_rules! higher{($k:ident)=>{if a.$k<d.$k{std::mem::swap(&mut a.$k,&mut d.$k)}}}
                macro_rules! lower{($k:ident)=>{if a.$k>d.$k{std::mem::swap(&mut a.$k,&mut d.$k)}}}
                higher!(accuracy);higher!(evasion);higher!(crit);if swap_status(a,d){std::mem::swap(&mut a.status,&mut d.status);std::mem::swap(&mut a.sleep,&mut d.sleep);std::mem::swap(&mut a.toxic,&mut d.toxic);a.wake();d.wake()}lower!(confusion);lower!(drowsy);lower!(taunt);lower!(silence);
            }
            if body>0&&d.hp>0{if m.trap&&!d.has(GHOST){d.trapped=a.id as i32}if d.status==FREEZE&&m.typ==FIRE{d.status=NONE}if m.freeze_chance>0&&d.status==NONE&&!d.has(ICE)&&rng.next()*100.0<(m.freeze_chance as f64){d.status=FREEZE;d.drowsy=0}if m.burn_chance>0&&d.status==NONE&&!d.has(FIRE)&&rng.next()*100.0<(m.burn_chance as f64){d.status=BURN}if m.silence{d.silence=2}if d.stages[3]>-6&&(m.lower_sp_a||m.lower_sp_a_chance>0&&rng.next()*100.0<(m.lower_sp_a_chance as f64)){d.change(3,-1)}if m.lower_atk_chance>0&&d.stages[1]>-6&&rng.next()*100.0<(m.lower_atk_chance as f64){d.change(1,-1)}if m.flinch_chance>0&&pos==0&&matches!(actions[1-side],Action::Move(_))&&rng.next()*100.0<(m.flinch_chance as f64){flinch[1-side]=true}}
            a.crit=(a.crit+m.raise_crit).min(3);if m.self_defense_down{a.change(2,-1);a.change(4,-1)}if m.drain>0.0&&total>0{a.heal((total as f64*m.drain)as i32)}if a.hp>0{if m.struggle{a.hurt(a.max()/4)}else if a.item()=="orb"{a.hurt(a.max()/10)}}
            self.put(side,a);self.put(1-side,d);self.clear_traps();if m.pivot&&a.hp>0&&self.living(1-side)>0{self.pivot(side,false)}
        }
        self.end(rng);(order,attempted)
    }
    fn end(&mut self,rng:&mut Rng){
        let diff=ranked(self.a(0),5,false)-ranked(self.a(1),5,false);let order=if diff>0||diff==0&&rng.next()<0.5{[0,1]}else{[1,0]};
        if self.living(0)>0&&self.living(1)>0{for side in order{let mut c=self.a(side);if c.item()=="leftovers"||c.item()=="blackSludge"&&c.has(POISON){c.heal(c.max()/16)}else if c.item()=="blackSludge"&&c.hp>0{c.hurt(c.max()/8)}self.put(side,c)}}
        for side in order{let mut c=self.a(side);if c.hp>0&&c.status==BURN{c.hurt(c.max()/16)}self.put(side,c)}
        for side in order{let mut c=self.a(side);if c.hp>0&&c.status==POISONED{c.hurt(c.max()/8);c.berry()}if c.hp>0&&c.status==TOXIC{c.toxic=(c.toxic+1).min(15);c.hurt(c.max()*c.toxic/16);c.berry()}if c.hp>0&&c.drowsy>0{c.drowsy-=1;if c.drowsy==0&&c.status==NONE{c.status=SLEEP;c.sleep=1+rng.index(3)as i32;c.wake()}}if c.encore>0{c.encore-=1;if c.encore==0||c.pp[c.encore_move as usize]==0{c.encore=0;c.encore_move=-1}}c.silence=(c.silence-1).max(0);c.taunt=(c.taunt-1).max(0);self.put(side,c)}
        self.terrain=(self.terrain-1).max(0);self.trick=(self.trick-1).max(0);self.gravity=(self.gravity-1).max(0);
        for side in order{let mut c=self.a(side);if c.hp==0{continue}match c.id{ARISA=>c.change(5,1),MERURU=>{c.status=NONE;c.sleep=0;c.toxic=0;c.heal(c.max()/8)},COCO=>{let up:Vec<_>=(1..6).filter(|&i|c.stages[i]<6).collect();let u=if up.is_empty(){0}else{up[rng.index(up.len())]};let down:Vec<_>=(1..6).filter(|&i|i!=u&&c.stages[i]>-6).collect();if !down.is_empty(){let v=down[rng.index(down.len())];c.change(v,-1)}if u>0{c.change(u,2)}},_=>{}}self.put(side,c)}
        self.clear_traps();let mut revive=[false;2];for side in 0..2{let mut c=self.a(side);if c.hp==0&&c.id==HIRO&&!c.revived&&!self.reserves(side).is_empty(){c.hp=1;c.revived=true;c.status=NONE;c.sleep=0;c.reset();self.put(side,c);revive[side]=true}}
        self.turn+=1;if self.living(0)==0||self.living(1)==0{self.winner=Some(if self.living(0)>0{0}else{1});return}
        for side in [1,0]{if revive[side]{self.pivot(side,false)}else if self.a(side).hp==0{if let Some(i)=self.pick(side){self.active[side]=i;self.enter(side)}}}
    }
}
