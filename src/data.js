// 仮設定。種族値は HP / A / B / C / D / S の順。
const ppTable={'まじょごろし':10,'マジカルフレイム':10,'ハイパーボイス':10,'あくのはどう':15,'ゴリラパンチ':10,'じゃれつく':10,'じごくづき':15,'マッハパンチ':30,'リーフブレード':15,'つじぎり':15,'かぜのやいば':5,'ふいうち':5,'しっとのまい':20,'サイコカッター':20,'インファイト':5,'ひかきぼう':10,'とんぼがえり':20,'アイアンヘッド':15,'シャドーボール':15,'かげうち':30,'かみくだく':15,'どくづき':20,'ラスターカノン':10,'10まんボルト':15,'だいちのちから':10,'げんわくのこえ':10,'イカサマ':15,'じゅうりょく':5,'ちょうはつ':20,'シルバーバレット':5,'かげぬい':10,'シャドークロー':15,'どくどく':10,'あくび':10,'まもる':10,'いれかわり':5,'めいそう':20,'アシストパワー':10,'ムーンフォース':15,'つきのひかり':5,'あさのひかり':5,'しんそく':5,'つるぎのまい':20};
const nonContactMoves=new Set(['かぜのやいば','シルバーバレット','かげぬい']);
const move=(name,type,category,power,accuracy=100,extra={})=>({name,type,category,power,accuracy,pp:Math.floor((ppTable[name]??10)*8/5),contact:category==='physical'&&!nonContactMoves.has(name),...extra});
export const struggle=move('わるあがき','normal','physical',50,100,{pp:null,struggle:true,description:'使える技がないときだけ使う。最大HPの1/4の反動を受ける。'});
export const types={normal:'ノーマル',fire:'ほのお',water:'みず',electric:'でんき',grass:'くさ',ice:'こおり',fighting:'かくとう',poison:'どく',ground:'じめん',flying:'ひこう',psychic:'エスパー',bug:'むし',rock:'いわ',ghost:'ゴースト',dragon:'ドラゴン',dark:'あく',steel:'はがね',fairy:'フェアリー'};
export const colors={normal:'#92999e',fire:'#dd693b',water:'#4189da',electric:'#c6a52c',grass:'#5d9c49',ice:'#60a5b9',fighting:'#b44f42',poison:'#9655ac',ground:'#b99153',flying:'#7d8ac9',psychic:'#cf548c',bug:'#82943c',rock:'#998b52',ghost:'#7462a2',dragon:'#6551c9',dark:'#54475e',steel:'#708897',fairy:'#cb79b0'};
export const items={
 scarf:{name:'こだわりスカーフ',description:'素早さが1.5倍になるが、最初に選んだ技しか使えなくなる。交代すると技の固定が解除される。',stat:5,choice:true},
 specs:{name:'こだわりメガネ',description:'特攻が1.5倍になるが、最初に選んだ技しか使えなくなる。交代すると技の固定が解除される。',stat:3,choice:true},
 band:{name:'こだわりハチマキ',description:'攻撃が1.5倍になるが、最初に選んだ技しか使えなくなる。交代すると技の固定が解除される。',stat:1,choice:true},
 sash:{name:'きあいのタスキ',description:'HPが満タンのとき、倒れるダメージを受けてもHPが1残る。一度使うとなくなる。'},
 orb:{name:'いのちのたま',description:'攻撃技のダメージが1.3倍になる。攻撃が命中すると、技の終了後に最大HPの1/10を失う。'},
 leftovers:{name:'たべのこし',description:'毎ターン終了時に最大HPの1/16を回復する。'},
 dice:{name:'いかさまダイス',description:'シルバーバレットの連続攻撃回数を6回に固定する。'},
 psychicSeed:{name:'サイコシード',description:'サイコフィールド中に特防が1段階上がる。一度使うとなくなる。'},
 terrain:{name:'グランドコート',description:'自分が展開するフィールドの持続時間を5ターンから8ターンに延ばす。'},
 helmet:{name:'ゴツゴツメット',description:'相手の接触技を受けるたび、相手の最大HPの1/6のダメージを与える。'},
 vest:{name:'とつげきチョッキ',description:'特防が1.5倍になるが、変化技を選べなくなる。',stat:4},
 sitrus:{name:'オボンのみ',description:'HPが最大HPの半分以下になると、最大HPの1/4を回復する。一度使うとなくなる。'}
};
export const originalRoster=[
{id:'ema',item:'scarf',name:'桜羽エマ',short:'エマ',mark:'桜',color:'#e89aaa',types:['normal','fairy'],ability:'まじょのあかし',abilityDescription:'自分が最後の1人として場に出たとき、特攻が1段階上がる。',points:[1,0,1,32,0,32],nature:[100,90,100,100,100,110],base:[83,62,78,83,80,65],moves:[move('まじょごろし','fairy','special',40,90,{multiHit:'fainted',sound:'gun_shot',description:'敵味方の倒れた魔法少女の人数だけ連続攻撃する。1発ごとに命中判定を行い、外すと攻撃が終了する。誰も倒れていない場合は失敗する。'}),move('マジカルフレイム','fire','special',75,100,{sound:'explosion',lowerSpA:true,description:'相手の特攻を1段階下げる。'}),move('ハイパーボイス','normal','special',90,100,{sound:'explosion',soundMove:true,description:'音の波で相手を攻撃する。'}),move('あくのはどう','dark','special',80,100,{flinchChance:20,description:'20%の確率で相手をひるませる。'})]},
{id:'sherry',item:'vest',name:'橘シェリー',short:'シェリー',mark:'橘',color:'#edb77a',types:['fairy','fighting'],ability:'ちからもち',abilityDescription:'攻撃の実数値が2倍になる。',points:[0,32,32,0,2,0],nature:[100,110,100,100,100,90],base:[103,65,123,63,85,48],moves:[move('ゴリラパンチ','fighting','physical',80,100,{latePower:true,drain:0.75,description:'後攻で攻撃すると威力が2倍になる。与えたダメージの3/4だけHPを回復する。'}),move('じゃれつく','fairy','physical',90,90,{lowerAtkChance:10,description:'10%の確率で相手の攻撃を1段階下げる。'}),move('じごくづき','dark','physical',80,100,{silence:true,description:'相手は2ターンの間、音を使う技を出せなくなる。'}),move('マッハパンチ','fighting','physical',40,100,{priority:1,description:'優先度+1で先に攻撃する。'})]},
{id:'hanna',item:'sash',name:'遠野ハンナ',short:'ハンナ',mark:'羽',color:'#8db5df',types:['grass','dark'],ability:'ふゆう',abilityDescription:'じめんタイプの技を無効にする。',base:[45,126,63,65,61,130],points:[2,32,0,0,0,32],nature:[100,100,100,90,100,110],moves:[move('リーフブレード','grass','physical',90,100,{critStage:1,sound:'cut',description:'急所に当たりやすい。'}),move('つじぎり','dark','physical',70,100,{critStage:1,sound:'cut',description:'急所に当たりやすい。'}),move('かぜのやいば','flying','physical',120,90,{critStage:1,raiseCrit:1,sound:'cut',description:'急所に当たりやすい。命中すると自分の急所ランクが1段階上がる。'}),move('しっとのまい','dark','status',0,100,{dance:true,description:'自分の攻撃を2段階、急所ランクを1段階上げる。'})]},
{id:'hiro',item:'band',name:'二階堂ヒロ',short:'ヒロ',mark:'衡',color:'#baa8df',types:['fire','fighting'],ability:'しにもどり',abilityDescription:'1バトルに1回、ひんしになるとHP1で復活し、控えと交代する。能力変化と状態異常を解除する。控えがいない場合は発動しない。',base:[91,113,87,62,82,95],points:[2,32,0,0,0,32],nature:[100,110,100,90,100,100],moves:[move('ひかきぼう','fire','physical',90,100,{burnChance:30,sound:'hit',description:'30%の確率で相手をやけどにする。'}),move('インファイト','fighting','physical',120,100,{selfDefenseDown:true,description:'自分の防御と特防が1段階下がる。'}),move('とんぼがえり','bug','physical',70,100,{pivot:true,description:'攻撃した後、控えの魔法少女と交代する。'}),move('ふいうち','dark','physical',70,100,{priority:1,sucker:true,description:'相手が攻撃技を選び、まだ行動していない場合に先制攻撃する。'})]},
{id:'margo',item:'terrain',name:'宝生マーゴ',short:'マーゴ',mark:'影',color:'#b58bb7',types:['psychic','dark'],ability:'サイコメイカー',abilityDescription:'場に出るとサイコフィールドを展開する。すでに展開中の場合は発動しない。地面にいる魔法少女は先制技を受けず、エスパー技の威力が上がる。',base:[107,58,103,67,96,44],points:[32,0,32,0,2,0],nature:[100,100,110,100,100,90],moves:[move('げんわくのこえ','fairy','status',0,90,{confuse:true,pivot:true,soundMove:true,description:'相手を混乱させ、自分は控えの魔法少女と交代する。'}),move('イカサマ','dark','physical',95,100,{foulPlay:true,description:'相手の攻撃実数値を使ってダメージを計算する。'}),move('ちょうはつ','dark','status',0,100,{taunt:true,description:'3ターンの間、相手は変化技を使えなくなる。'}),move('じゅうりょく','psychic','status',0,100,{gravity:true,description:'5ターンの間、全員を接地させ、技の命中率を5/3倍にする。'})]},
{id:'nanoka',item:'dice',name:'黒部ナノカ',short:'ナノカ',mark:'黒',color:'#a7c9bf',types:['steel','ghost'],ability:'げんし',abilityDescription:'相手の接触技を20%の確率で回避する。',base:[78,118,93,66,83,122],points:[32,2,0,0,0,32],nature:[100,100,100,90,100,110],moves:[move('シルバーバレット','steel','physical',15,95,{multiHit:'silver',sound:'gun_shot',description:'1～6回連続攻撃する。いかさまダイスを持つと6回に固定される。'}),move('シャドークロー','ghost','physical',70,100,{critStage:1,sound:'cut',description:'急所に当たりやすい。'}),move('しんそく','normal','physical',80,100,{priority:2,description:'優先度+2で先に攻撃する。'}),move('つるぎのまい','normal','status',0,100,{swordsDance:true,description:'自分の攻撃を2段階上げる。'})]}
];
// 第2期の調整用。技・タイプ・特性・育成は今後個別に決める。
const trialCharacter=(id,name,short,color)=>({
 id,name,short,color,mark:short[0],types:['normal'],ability:null,
 abilityDescription:'仮設定（特性未定）',item:null,
 base:[80,80,80,80,80,80],points:[2,32,0,32,0,0],nature:[100,100,100,100,100,100],
 moves:[
  move('のしかかり','normal','physical',85,100,{description:'調整用の仮技。'}),
  move('ハイパーボイス','normal','special',90,100,{soundMove:true,description:'調整用の仮技。'}),
  move('マジカルフレイム','fire','special',75,100,{lowerSpA:true,description:'相手の特攻を1段階下げる。'}),
  move('あくのはどう','dark','special',80,100,{flinchChance:20,description:'20%の確率で相手をひるませる。'})
 ]
});
export const nextRoster=[
 {...trialCharacter('anan','夏目アンアン','アンアン','#a6a4df'),types:['poison'],item:'leftovers',ability:'せんのう',abilityDescription:'場に出るたび、相手の攻撃と特攻を1段階ずつ下げる。',base:[77,52,83,70,72,58],points:[32,0,32,0,2,0],nature:[100,90,110,100,100,100],moves:[move('どくどく','poison','status',0,90,{toxic:true,description:'相手をもうどくにする。どくタイプが使うと必中。'}),move('まもる','normal','status',0,100,{protect:true,priority:4,description:'先制して相手の技から身を守る。連続で成功すると次の成功率が1/3ずつ下がる。'}),move('つきのひかり','fairy','status',0,100,{recover:true,description:'自分の最大HPの1/2を回復する。'}),move('あやつりにんぎょう','ghost','physical',100,100,{contact:false,puppet:true,description:'相手の攻撃と特攻の実数値のうち高い方を使って攻撃する。相手の攻撃・特攻ランクの変化は無視する。'})]},
 {...trialCharacter('miria','佐伯ミリア','ミリア','#a1c8d7'),types:['normal'],item:'psychicSeed',ability:'むこせい',abilityDescription:'自分が与える・受ける攻撃技のタイプ相性をすべて等倍にする。タイプ無効も無視する。',base:[82,74,84,81,77,76],points:[32,0,32,0,2,0],nature:[100,90,110,100,100,100],moves:[move('いれかわり','normal','status',0,100,{swapStages:true,description:'相手とHP割合・能力ランク・状態異常を、自分に有利な項目だけ入れ替える。双方が状態異常の場合、もうどくをどくと交換する場合のみ対象。'}),move('めいそう','psychic','status',0,100,{calmMind:true,description:'自分の特攻と特防を1段階ずつ上げる。'}),move('アシストパワー','psychic','special',20,100,{storedPower:true,description:'自分の能力ランクの上昇1段階につき威力が20上がる。急所ランクは含まない。'}),move('あさのひかり','normal','status',0,100,{recover:true,description:'自分の最大HPの1/2を回復する。'})]},
 trialCharacter('noa','城ヶ崎ノア','ノア','#e3b6c8'),
 trialCharacter('reia','蓮見レイア','レイア','#e0b683'),
 trialCharacter('arisa','紫藤アリサ','アリサ','#ba9dd3'),
 trialCharacter('coco','沢渡ココ','ココ','#d9b5e0')
];
export const roster=nextRoster;
// 攻撃側のタイプ相性。記載なしは等倍。
const chart={
normal:[[],['rock','steel'],['ghost']],fire:[['grass','ice','bug','steel'],['fire','water','rock','dragon'],[]],water:[['fire','ground','rock'],['water','grass','dragon'],[]],electric:[['water','flying'],['electric','grass','dragon'],['ground']],grass:[['water','ground','rock'],['fire','grass','poison','flying','bug','dragon','steel'],[]],ice:[['grass','ground','flying','dragon'],['fire','water','ice','steel'],[]],fighting:[['normal','ice','rock','dark','steel'],['poison','flying','psychic','bug','fairy'],['ghost']],poison:[['grass','fairy'],['poison','ground','rock','ghost'],['steel']],ground:[['fire','electric','poison','rock','steel'],['grass','bug'],['flying']],flying:[['grass','fighting','bug'],['electric','rock','steel'],[]],psychic:[['fighting','poison'],['psychic','steel'],['dark']],bug:[['grass','psychic','dark'],['fire','fighting','poison','flying','ghost','steel','fairy'],[]],rock:[['fire','ice','flying','bug'],['fighting','ground','steel'],[]],ghost:[['psychic','ghost'],['dark'],['normal']],dragon:[['dragon'],['steel'],['fairy']],dark:[['psychic','ghost'],['fighting','dark','fairy'],[]],steel:[['ice','rock','fairy'],['fire','water','electric','steel'],[]],fairy:[['fighting','dragon','dark'],['fire','poison','steel'],[]]};
export function effectiveness(type,defTypes){const [weak,resist,immune]=chart[type];return defTypes.reduce((n,t)=>n*(immune.includes(t)?0:weak.includes(t)?2:resist.includes(t)?.5:1),1)}
