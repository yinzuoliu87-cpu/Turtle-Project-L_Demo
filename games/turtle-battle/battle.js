/* ═══════════════════════════════════════════════════════════
   龟龟对战 — 2V2 回合制战斗引擎
   护盾(白条) / 直接伤害(红) / 穿透伤害(紫) / 治疗(绿)
   多段伤害技能 / 持久浮动数字
   ═══════════════════════════════════════════════════════════ */

// ── PET DATABASE ──────────────────────────────────────────
/* Base stats are normalized — rarity bonus applied in createFighter()
   Each rarity tier = +3% to HP/ATK/DEF/SPD over previous tier
   C=1.00  B=1.03  A=1.06  S=1.09  SS=1.12  SSS=1.15
   New stats: crit (暴击率 0~1)
   res (抗性) auto from rarity: C=12% B=13% A=14% S=15% SS=16% SSS=17%  */
const RARITY_MULT = { C:1.00, B:1.03, A:1.06, S:1.09, SS:1.12, SSS:1.15 };
const RARITY_RES  = { C:12,   B:13,   A:14,   S:15,   SS:16,   SSS:17   };
/* Buff/Debuff effects on skills:
   dot:     { dmg, turns }       — 持续伤害(每回合开始)
   atkDown: { pct, turns }       — 攻击削减(百分比)
   defDown: { pct, turns }       — 防御削减(百分比)
   (spdDown removed — no speed stat)                                    */

// img: path relative to project root (../../assets/pets/...)
// sprite: { frames, frameW, frameH, duration } for animated sprite sheets
const ALL_PETS = [
  // C级 — base stats (crit=暴击率, res按稀有度自动计算)
  // passive: { type, desc, ...params }
  //   bonusDmgAbove60  — 对HP>60%的敌人+X%伤害
  //   deathExplode     — 死亡时对击杀者造成自身最大HP*X%伤害
  //   turnScaleHp      — 每回合+X%最大生命
  //   turnScaleAtk     — 每回合+X%攻击
  //   lowHpCrit        — HP<30%时暴击率+X%
  //   shieldOnHit      — 受击时获得X护盾(每回合1次)
  //   healOnKill       — 击杀时恢复X%最大HP
  //   counterAttack    — X%概率反击(造成基础攻击50%伤害)
  { id:'basic',     name:'小龟',     emoji:'🐢',      rarity:'C',   hp:320,  atk:38,  def:12, spd:10, crit:0.08,
    img:'../../assets/pets/基础小龟v1.png', sprite:{frames:8,frameW:64,frameH:64,duration:800},
    passive:{ type:'turnScaleAtk', pct:3, desc:'每回合攻击+3%' },
    skills:[
      { name:'龟拳',     type:'physical', hits:1, power:40,  pierce:0,   desc:'普通一击',         cd:0 },
      { name:'缩壳防御', type:'shield',   hits:1, power:0,   shield:60,  desc:'获得60护盾',       cd:3 },
      { name:'头槌猛击', type:'physical', hits:1, power:65,  pierce:0,   desc:'全力头槌',         cd:2, atkDown:{pct:15,turns:2} },
    ]},
  { id:'stone',     name:'石头龟',   emoji:'🪨🐢',    rarity:'C',   hp:380,  atk:35,  def:18, spd:6, crit:0.05,
    img:'../../assets/pets/石头龟v1.png', sprite:{frames:10,frameW:500,frameH:500,duration:1000},
    passive:{ type:'stoneWall', defGain:2, maxDef:16, reflectBase:10, reflectPerDef:1, desc:'每回合+2防御(上限+16)，受伤反弹(10%+1%×防御)伤害' },
    skills:[
      { name:'打击',     type:'physical', hits:2, power:0,   pierce:0,   desc:'2段共(0.5×ATK+2×DEF)伤害', cd:0, atkScale:0.5, defScale:2 },
      { name:'岩石护甲', type:'shield',   hits:1, power:0,   shield:0,   desc:'全体友军护盾(20+15%最大HP)3回合', cd:3, aoeAlly:true, shieldFlat:20, shieldHpPct:15, shieldDuration:3 },
      { name:'磐石',     type:'heal',     hits:1, power:0,   heal:0,     desc:'目标防御+20%持续3回合', cd:4, defUpPct:{pct:20,turns:3} },
    ]},
  { id:'bamboo',    name:'竹叶龟',   emoji:'🎋🐢',    rarity:'C',   hp:300,  atk:40,  def:10, spd:12, crit:0.10,
    img:'../../assets/pets/竹叶龟v1.png', sprite:{frames:10,frameW:500,frameH:400,duration:1000},
    passive:{ type:'turnScaleHp', pct:3, desc:'每回合最大生命+3%' },
    skills:[
      { name:'竹鞭',     type:'physical', hits:2, power:22,  pierce:0,   desc:'连抽2下',          cd:0 },
      { name:'叶刃风暴', type:'physical', hits:3, power:20,  pierce:5,   desc:'3段叶刃，5穿透',   cd:3, dot:{dmg:15,turns:2} },
      { name:'自然恢复', type:'heal',     hits:1, power:0,   heal:50,    desc:'恢复50HP',         cd:3 },
    ]},
  // B级
  { id:'angel',     name:'天使龟',   emoji:'😇🐢',    rarity:'B',   hp:330,  atk:40,  def:13, spd:11, crit:0.08,
    img:'../../assets/pets/天使龟v1.png', sprite:{frames:8,frameW:248,frameH:200,duration:800},
    passive:{ type:'healOnKill', pct:25, desc:'击杀时恢复25%最大HP' },
    skills:[
      { name:'圣光弹',   type:'magic',    hits:1, power:45,  pierce:15,  desc:'魔法攻击，15穿透', cd:0 },
      { name:'天使祝福', type:'heal',     hits:1, power:0,   heal:70,    desc:'恢复70HP',         cd:3 },
      { name:'神圣制裁', type:'magic',    hits:2, power:35,  pierce:20,  desc:'2段神圣，减攻20%', cd:3, atkDown:{pct:20,turns:2} },
    ]},
  { id:'ice',       name:'寒冰龟',   emoji:'❄️🐢',    rarity:'B',   hp:340,  atk:38,  def:14, spd:9, crit:0.08,
    img:'../../assets/pets/寒冰龟.png',
    passive:{ type:'bonusDmgAbove60', pct:20, desc:'对HP>60%敌人+20%伤害' },
    skills:[
      { name:'冰锥',     type:'magic',    hits:1, power:42,  pierce:10,  desc:'冰系攻击，减防20%',cd:0, defDown:{pct:20,turns:2} },
      { name:'冰霜护盾', type:'shield',   hits:1, power:0,   shield:70,  desc:'获得70护盾',       cd:3 },
      { name:'暴风雪',   type:'magic',    hits:4, power:18,  pierce:8,   desc:'4段冰暴，减攻30%', cd:4, atkDown:{pct:30,turns:2} },
    ]},
  { id:'ninja',     name:'忍者龟',   emoji:'🥷🐢',    rarity:'B',   hp:290,  atk:42,  def:9,  spd:15, crit:0.20,
    img:'../../assets/pets/忍者龟.png',
    passive:{ type:'lowHpCrit', pct:30, desc:'HP<30%时暴击率+30%' },
    skills:[
      { name:'手里剑',   type:'physical', hits:3, power:18,  pierce:5,   desc:'投掷3枚',          cd:0 },
      { name:'影分身',   type:'shield',   hits:1, power:0,   shield:50,  desc:'分身挡伤50',       cd:2 },
      { name:'暗杀术',   type:'physical', hits:1, power:90,  pierce:30,  desc:'致命一击，30穿透', cd:4 },
    ]},
  { id:'two_head',  name:'双头龟',   emoji:'🐢🐢',    rarity:'B',   hp:370,  atk:36,  def:16, spd:7, crit:0.06,
    img:'../../assets/pets/双头龟.png',
    passive:{ type:'counterAttack', pct:25, desc:'25%概率反击' },
    skills:[
      { name:'双重咬击', type:'physical', hits:2, power:25,  pierce:0,   desc:'双头各咬一口',     cd:0 },
      { name:'双重护盾', type:'shield',   hits:1, power:0,   shield:90,  desc:'获得90护盾',       cd:3 },
      { name:'龙息吐息', type:'magic',    hits:3, power:28,  pierce:12,  desc:'3段龙息，灼烧',    cd:3, dot:{dmg:18,turns:3} },
    ]},
  { id:'ghost',     name:'幽灵龟',   emoji:'👻🐢',    rarity:'B',   hp:280,  atk:42,  def:8,  spd:14, crit:0.12,
    img:'../../assets/pets/幽灵龟v1.png', sprite:{frames:17,frameW:500,frameH:500,duration:1700},
    passive:{ type:'deathExplode', pct:30, desc:'死亡时对击杀者造成30%最大HP伤害' },
    skills:[
      { name:'幽魂触碰', type:'magic',    hits:1, power:44,  pierce:25,  desc:'灵体攻击，减防20%',cd:0, defDown:{pct:20,turns:2} },
      { name:'虚化',     type:'shield',   hits:1, power:0,   shield:40,  desc:'虚化护盾40',       cd:2 },
      { name:'灵魂风暴', type:'magic',    hits:5, power:15,  pierce:20,  desc:'5段灵魂冲击',      cd:4, dot:{dmg:12,turns:3} },
    ]},
  { id:'diamond',   name:'钻石龟',   emoji:'💎🐢',    rarity:'B',   hp:350,  atk:35,  def:20, spd:8, crit:0.06,
    img:'../../assets/pets/钻石龟.png',
    passive:{ type:'shieldOnHit', amount:20, desc:'受击时获得20护盾(每回合1次)' },
    skills:[
      { name:'钻石切割', type:'physical', hits:1, power:42,  pierce:15,  desc:'锋利切割，减防15%',cd:0, defDown:{pct:15,turns:2} },
      { name:'钻石壁垒', type:'shield',   hits:1, power:0,   shield:100, desc:'获得100护盾',      cd:4 },
      { name:'折射光线', type:'magic',    hits:3, power:22,  pierce:10,  desc:'3段折射',          cd:3 },
    ]},
  { id:'fortune',   name:'财神龟',   emoji:'🧧🐢',    rarity:'B',   hp:330,  atk:38,  def:13, spd:10, crit:0.10,
    img:'../../assets/pets/财神龟v1.png', sprite:{frames:18,frameW:500,frameH:500,duration:1800},
    passive:{ type:'turnScaleAtk', pct:3, desc:'每回合攻击+3%' },
    skills:[
      { name:'金币投掷', type:'physical', hits:2, power:24,  pierce:0,   desc:'扔2枚金币',        cd:0 },
      { name:'招财进宝', type:'heal',     hits:1, power:0,   heal:60,    desc:'恢复60HP',         cd:3 },
      { name:'黄金暴雨', type:'physical', hits:6, power:12,  pierce:5,   desc:'6段金币雨',        cd:4, atkDown:{pct:10,turns:2} },
    ]},
  { id:'dice',      name:'骰子龟',   emoji:'🎲🐢',    rarity:'B',   hp:320,  atk:40,  def:11, spd:11, crit:0.15,
    img:'../../assets/pets/骰子龟v1.png',
    passive:{ type:'lowHpCrit', pct:25, desc:'HP<30%时暴击率+25%' },
    skills:[
      { name:'骰子攻击', type:'physical', hits:1, power:50,  pierce:0,   desc:'随机倍率',         cd:0, random:true },
      { name:'幸运护盾', type:'shield',   hits:1, power:0,   shield:65,  desc:'获得65护盾',       cd:3 },
      { name:'全押！',   type:'physical', hits:3, power:30,  pierce:15,  desc:'3段赌命攻击',      cd:3, random:true },
    ]},
  // A级
  { id:'rainbow',   name:'彩虹龟',   emoji:'🌈🐢',    rarity:'A',   hp:340,  atk:40,  def:14, spd:12, crit:0.10,
    img:'../../assets/pets/彩虹龟.png',
    passive:{ type:'turnScaleAtk', pct:3, desc:'每回合攻击+3%' },
    skills:[
      { name:'七彩光束', type:'magic',    hits:1, power:50,  pierce:15,  desc:'彩虹攻击',         cd:0 },
      { name:'棱镜护盾', type:'shield',   hits:1, power:0,   shield:75,  desc:'获得75护盾',       cd:3 },
      { name:'全色风暴', type:'magic',    hits:7, power:14,  pierce:10,  desc:'七色各一击，减防',  cd:4, defDown:{pct:20,turns:2} },
    ]},
  { id:'gambler',   name:'赌神龟',   emoji:'🃏🐢',    rarity:'A',   hp:310,  atk:44,  def:10, spd:13, crit:0.25,
    img:'../../assets/pets/赌神龟v1.png', sprite:{frames:8,frameW:500,frameH:500,duration:800},
    passive:{ type:'healOnKill', pct:30, desc:'击杀时恢复30%最大HP' },
    skills:[
      { name:'纸牌飞刀', type:'physical', hits:3, power:20,  pierce:10,  desc:'3张牌切割',        cd:0 },
      { name:'梭哈',     type:'physical', hits:1, power:120, pierce:40,  desc:'全押致命，40穿透', cd:5 },
      { name:'底牌恢复', type:'heal',     hits:1, power:0,   heal:80,    desc:'恢复80HP',         cd:4 },
    ]},
  { id:'hunter',    name:'猎人龟',   emoji:'🏹🐢',    rarity:'A',   hp:320,  atk:42,  def:12, spd:14, crit:0.18,
    img:'../../assets/pets/猎人龟v1.png', sprite:{frames:15,frameW:500,frameH:500,duration:1500},
    passive:{ type:'hunterKill', hpThresh:10, stealPct:15, desc:'回合结束时猎杀HP<10%敌人(99999穿透)，获取其15%属性' },
    skills:[
      { name:'射箭',     type:'hunterShot', hits:3, power:0, pierce:0, desc:'3段共1.4×ATK，目标<40%HP时+40%暴击+20%暴击伤害', cd:0, atkScale:1.4, execThresh:40, execCrit:40, execCritDmg:20 },
      { name:'连珠箭',   type:'hunterBarrage', hits:10, power:0, pierce:0, desc:'10根箭随机分布，每根0.15×ATK穿透', cd:3, arrowScale:0.15 },
      { name:'隐蔽',     type:'hunterStealth', hits:1, power:0, pierce:0, desc:'0.8×ATK伤害+25%闪避3回合+1.2×ATK护盾3回合', cd:4, dmgScale:0.8, dodgePct:25, dodgeTurns:3, shieldScale:1.2, shieldTurns:3 },
    ]},
  { id:'pirate',    name:'海盗龟',   emoji:'🏴‍☠️🐢',  rarity:'A',   hp:350,  atk:39,  def:14, spd:11, crit:0.12,
    img:'../../assets/pets/海盗龟.png',
    passive:{ type:'deathHook', pct:25, desc:'死亡时钩锁击杀者，造成25%最大HP穿透伤害' },
    skills:[
      { name:'弯刀',     type:'physical', hits:4, power:0,   pierce:0,   desc:'4段共(ATK×1.2)普通伤害', cd:0, atkScale:1.2 },
      { name:'火炮齐射', type:'physical', hits:6, power:0,   pierce:0,   desc:'对所有敌人×6段(0.9×ATK+10%最大HP)',cd:4, aoe:true, atkScale:0.9, hpPct:10 },
      { name:'朗姆酒',   type:'heal',     hits:1, power:0,   heal:0,     desc:'4回合回复150HP，防御+3持续2回合', cd:3, hot:{hpPerTurn:38,turns:4}, defUp:{val:3,turns:2} },
    ]},
  { id:'candy',     name:'糖果龟',   emoji:'🍬🐢',    rarity:'A',   hp:340,  atk:38,  def:14, spd:11, crit:0.08,
    img:'../../assets/pets/糖果龟v1.png', sprite:{frames:10,frameW:500,frameH:500,duration:1000},
    passive:{ type:'turnScaleHp', pct:3, desc:'每回合最大生命+3%' },
    skills:[
      { name:'糖果弹',   type:'magic',    hits:2, power:26,  pierce:8,   desc:'2颗糖果弹，减攻',  cd:0, atkDown:{pct:15,turns:2} },
      { name:'棉花糖盾', type:'shield',   hits:1, power:0,   shield:85,  desc:'获得85护盾',       cd:3 },
      { name:'糖衣炮弹', type:'magic',    hits:4, power:20,  pierce:12,  desc:'4段甜蜜打击',      cd:3 },
    ]},
  { id:'bubble',    name:'泡泡龟',   emoji:'🫧🐢',    rarity:'A',   hp:320,  atk:40,  def:11, spd:13, crit:0.10,
    img:'../../assets/pets/气泡龟v1.png', sprite:{frames:8,frameW:500,frameH:500,duration:800},
    passive:{ type:'bubbleStore', pct:30, healPct:50, desc:'受伤储存30%为泡泡值，每回合回复储存值50%' },
    skills:[
      { name:'泡泡盾',   type:'bubbleShield', hits:1, power:0, pierce:0, desc:'给目标套泡泡护盾(1.5×ATK)，3回合后自然破碎对敌全体造成0.8×ATK伤害', cd:3, atkScale:1.5, duration:3, burstScale:0.8 },
      { name:'泡泡攻击', type:'magic',    hits:3, power:0,   pierce:0,   desc:'3段共(1×ATK)普通伤害', cd:0, atkScale:1.0 },
      { name:'泡泡束缚', type:'bubbleBind', hits:1, power:0, pierce:0, desc:'标记敌人3回合，友方攻击它获得伤害×30%的永久护盾', cd:4, duration:3, bindPct:30 },
    ]},
  { id:'line',      name:'线条龟',   emoji:'✏️🐢',    rarity:'A',   hp:300,  atk:44,  def:9,  spd:15, crit:0.15,
    img:'../../assets/pets/线条龟v1.png', sprite:{frames:14,frameW:500,frameH:500,duration:1400},
    passive:{ type:'bonusDmgAbove60', pct:20, desc:'对HP>60%敌人+20%伤害' },
    skills:[
      { name:'一笔穿心', type:'physical', hits:1, power:55,  pierce:30,  desc:'极高穿透',         cd:0 },
      { name:'涂鸦乱舞', type:'physical', hits:5, power:15,  pierce:15,  desc:'5段乱画，减攻15%', cd:3, atkDown:{pct:15,turns:2} },
      { name:'橡皮擦',   type:'heal',     hits:1, power:0,   heal:70,    desc:'擦去伤痕回70HP',   cd:4 },
    ]},
  { id:'lightning', name:'闪电龟',   emoji:'⚡🐢',    rarity:'A',   hp:310,  atk:43,  def:8,  spd:17, crit:0.12,
    img:'../../assets/pets/闪电龟.png',
    passive:{ type:'lowHpCrit', pct:25, desc:'HP<30%时暴击率+25%' },
    skills:[
      { name:'电击',     type:'magic',    hits:1, power:50,  pierce:20,  desc:'雷电打击，减防25%',cd:0, defDown:{pct:25,turns:2} },
      { name:'闪电连锁', type:'magic',    hits:4, power:22,  pierce:15,  desc:'4段连锁雷电',      cd:3, dot:{dmg:15,turns:2} },
      { name:'雷暴领域', type:'magic',    hits:8, power:12,  pierce:10,  desc:'8段雷暴',          cd:5 },
    ]},
  // S级
  { id:'phoenix',   name:'凤凰龟',   emoji:'🔥🐢',    rarity:'S',   hp:340,  atk:42,  def:14, spd:13, crit:0.12,
    img:'../../assets/pets/凤凰龟.png',
    passive:{ type:'deathExplode', pct:40, desc:'死亡时对击杀者造成40%最大HP伤害' },
    skills:[
      { name:'烈焰吐息', type:'magic',    hits:2, power:32,  pierce:15,  desc:'双段火焰，灼烧',   cd:0, dot:{dmg:20,turns:3} },
      { name:'涅槃重生', type:'heal',     hits:1, power:0,   heal:120,   desc:'恢复120HP',        cd:5 },
      { name:'凤凰烈焰', type:'magic',    hits:6, power:18,  pierce:20,  desc:'6段凤凰火，减防',  cd:4, defDown:{pct:25,turns:2} },
    ]},
  { id:'lava',      name:'熔岩龟',   emoji:'🌋🐢',    rarity:'S',   hp:380,  atk:38,  def:18, spd:7, crit:0.08,
    img:'../../assets/pets/熔岩龟.png',
    passive:{ type:'counterAttack', pct:30, desc:'30%概率反击' },
    skills:[
      { name:'熔岩喷发', type:'magic',    hits:1, power:58,  pierce:18,  desc:'熔岩攻击，灼烧',   cd:0, dot:{dmg:25,turns:3} },
      { name:'岩浆护甲', type:'shield',   hits:1, power:0,   shield:110, desc:'获得110护盾',      cd:3 },
      { name:'火山爆发', type:'magic',    hits:5, power:22,  pierce:25,  desc:'5段火山，减攻25%', cd:4, atkDown:{pct:25,turns:2} },
    ]},
  { id:'cyber',     name:'赛博龟',   emoji:'🤖🐢',    rarity:'S',   hp:330,  atk:43,  def:13, spd:15, crit:0.14,
    img:'../../assets/pets/赛博龟.png',
    passive:{ type:'turnScaleAtk', pct:3, desc:'每回合攻击+3%' },
    skills:[
      { name:'激光炮',   type:'magic',    hits:1, power:55,  pierce:25,  desc:'高科技激光，减防',  cd:0, defDown:{pct:20,turns:2} },
      { name:'能量屏障', type:'shield',   hits:1, power:0,   shield:90,  desc:'获得90护盾',       cd:3 },
      { name:'全弹发射', type:'magic',    hits:8, power:14,  pierce:15,  desc:'8发导弹，减攻25%', cd:5, atkDown:{pct:25,turns:2} },
    ]},
  { id:'crystal',   name:'水晶龟',   emoji:'🔮🐢',    rarity:'S',   hp:350,  atk:40,  def:16, spd:11, crit:0.10,
    img:'../../assets/pets/水晶龟v1.png', sprite:{frames:11,frameW:500,frameH:500,duration:1100},
    passive:{ type:'shieldOnHit', amount:25, desc:'受击时获得25护盾(每回合1次)' },
    skills:[
      { name:'水晶刺',   type:'magic',    hits:2, power:30,  pierce:12,  desc:'双段水晶',         cd:0 },
      { name:'水晶壁垒', type:'shield',   hits:1, power:0,   shield:100, desc:'获得100护盾',      cd:3 },
      { name:'碎晶风暴', type:'magic',    hits:7, power:16,  pierce:18,  desc:'7段碎晶，灼烧',    cd:4, dot:{dmg:18,turns:3} },
    ]},
  { id:'chest',     name:'宝箱龟',   emoji:'📦🐢',    rarity:'S',   hp:360,  atk:39,  def:15, spd:10, crit:0.10,
    img:'../../assets/pets/宝箱龟v1.png', sprite:{frames:11,frameW:300,frameH:200,duration:1100},
    passive:{ type:'healOnKill', pct:30, desc:'击杀时恢复30%最大HP' },
    skills:[
      { name:'宝箱砸击', type:'physical', hits:1, power:50,  pierce:10,  desc:'砸！减防20%',      cd:0, defDown:{pct:20,turns:2} },
      { name:'开箱惊喜', type:'heal',     hits:1, power:0,   heal:100,   desc:'开箱回100HP',      cd:4 },
      { name:'财宝风暴', type:'physical', hits:6, power:16,  pierce:12,  desc:'6段宝物飞射',      cd:4, atkDown:{pct:15,turns:2} },
    ]},
  { id:'space',     name:'星际龟',   emoji:'🚀🐢',    rarity:'S',   hp:320,  atk:44,  def:12, spd:16, crit:0.15,
    img:'../../assets/pets/星际龟v1.png', sprite:{frames:12,frameW:500,frameH:500,duration:1200},
    passive:{ type:'bonusDmgAbove60', pct:25, desc:'对HP>60%敌人+25%伤害' },
    skills:[
      { name:'星光射线', type:'magic',    hits:1, power:56,  pierce:22,  desc:'宇宙射线',         cd:0, dot:{dmg:15,turns:2} },
      { name:'星际跃迁', type:'shield',   hits:1, power:0,   shield:80,  desc:'跃迁护盾80',       cd:3 },
      { name:'流星暴雨', type:'magic',    hits:10,power:10,  pierce:15,  desc:'10段流星，减防',    cd:5, defDown:{pct:20,turns:2} },
    ]},
  // SS级
  { id:'hiding',    name:'缩头乌龟', emoji:'🫣🐢',    rarity:'SS',  hp:380,  atk:35,  def:22, spd:5, crit:0.05,
    img:'../../assets/pets/缩头乌龟v1.png', sprite:{frames:14,frameW:500,frameH:500,duration:1400},
    passive:{ type:'turnScaleHp', pct:3, desc:'每回合最大生命+3%' },
    skills:[
      { name:'突然袭击', type:'physical', hits:1, power:60,  pierce:20,  desc:'从壳中突袭',       cd:0 },
      { name:'龟壳堡垒', type:'shield',   hits:1, power:0,   shield:150, desc:'获得150护盾',      cd:4 },
      { name:'绝对防御', type:'shield',   hits:1, power:0,   shield:200, desc:'超级护盾200',      cd:6 },
    ]},
  { id:'headless',  name:'无头龟',   emoji:'💀🐢',    rarity:'SS',  hp:340,  atk:46,  def:10, spd:14, crit:0.18,
    img:'../../assets/pets/无头龟v1.png', sprite:{frames:17,frameW:500,frameH:500,duration:1700},
    passive:{ type:'deathExplode', pct:50, desc:'死亡时对击杀者造成50%最大HP伤害' },
    skills:[
      { name:'无头冲撞', type:'physical', hits:1, power:65,  pierce:35,  desc:'疯狂冲撞，减攻25%',cd:0, atkDown:{pct:25,turns:2} },
      { name:'亡灵召唤', type:'magic',    hits:4, power:25,  pierce:25,  desc:'4段亡灵，持续伤害',cd:3, dot:{dmg:22,turns:3} },
      { name:'死亡风暴', type:'magic',    hits:8, power:16,  pierce:30,  desc:'8段死亡，减防30%', cd:5, defDown:{pct:30,turns:2} },
    ]},
  // SSS级
  { id:'shell',     name:'龟壳',     emoji:'🐚',      rarity:'SSS', hp:360,  atk:42,  def:18, spd:12, crit:0.15,
    img:'../../assets/pets/龟壳v1.png', sprite:{frames:20,frameW:500,frameH:500,duration:2000},
    passive:{ type:'turnScaleAtk', pct:3, desc:'每回合攻击+3%' },
    skills:[
      { name:'壳击波',   type:'magic',    hits:2, power:38,  pierce:25,  desc:'双段壳击，减攻20%',cd:0, atkDown:{pct:20,turns:2} },
      { name:'终极护盾', type:'shield',   hits:1, power:0,   shield:180, desc:'获得180护盾',      cd:4 },
      { name:'龟皇降临', type:'magic',    hits:10,power:14,  pierce:20,  desc:'10段终极，灼烧',   cd:5, dot:{dmg:25,turns:3} },
      { name:'龟皇再生', type:'heal',     hits:1, power:0,   heal:150,   desc:'恢复150HP',        cd:5 },
    ]},
];

const RARITY_COLORS = { C:'#06d6a0', B:'#4cc9f0', A:'#3a9abf', S:'#c77dff', SS:'#ffd93d', SSS:'#ff6b6b' };

// ── GAME STATE ────────────────────────────────────────────
let gameMode   = null;   // 'pve' | 'pvp-online'
let difficulty = 'normal';
let turnNum    = 1;
let turnQueue  = [];
let currentIdx = 0;
let leftTeam   = [];
let rightTeam  = [];
let allFighters = [];
let selecting   = 'left';
let selectedIds = [];
let battleOver  = false;
let animating   = false;

// Online
let onlineRoom = null;
let onlineSide = null;
let onlinePeer = null;

// ── SCREENS ───────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── MENU ──────────────────────────────────────────────────
function startMode(mode) {
  gameMode = mode;
  resetBattleState();
  if (mode === 'pve') {
    difficulty = 'normal'; // wild encounter — default difficulty
    selecting = 'left';
    selectedIds = [];
    showSelectScreen('选择你的队伍（选2只龟）');
  } else if (mode === 'pvp-online') {
    showScreen('screenLobby');
  }
}

// ── ONLINE LOBBY ──────────────────────────────────────────
function createRoom() {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  onlineRoom = code;
  onlineSide = 'left';
  document.getElementById('roomCodeDisplay').style.display = 'flex';
  document.getElementById('roomCodeText').textContent = code;
  document.getElementById('lobbyStatus').textContent = '等待对手加入…';
  setupOnlineChannel(code);
  sendOnline({ type:'create', room:code });
}

function joinRoom() {
  const code = document.getElementById('joinRoomInput').value.trim();
  if (code.length !== 6) { showToast('请输入6位房间号'); return; }
  onlineRoom = code;
  onlineSide = 'right';
  setupOnlineChannel(code);
  sendOnline({ type:'join', room:code });
  document.getElementById('lobbyStatus').textContent = '正在加入房间…';
}

function copyRoomCode() {
  navigator.clipboard.writeText(onlineRoom).then(() => showToast('已复制房间号'));
}

function setupOnlineChannel(code) {
  onlinePeer = new BroadcastChannel('turtle-battle-' + code);
  onlinePeer.onmessage = e => handleOnlineMessage(e.data);
}
function sendOnline(msg) { if (onlinePeer) onlinePeer.postMessage(msg); }

function handleOnlineMessage(msg) {
  switch (msg.type) {
    case 'join':
      document.getElementById('lobbyStatus').textContent = '对手已加入！';
      setTimeout(() => {
        selecting = onlineSide;
        selectedIds = [];
        showSelectScreen(onlineSide === 'left' ? '你是左方 — 选择队伍' : '你是右方 — 选择队伍');
      }, 500);
      if (onlineSide === 'left') sendOnline({ type:'start' });
      break;
    case 'start':
      selecting = onlineSide;
      selectedIds = [];
      showSelectScreen(onlineSide === 'left' ? '你是左方 — 选择队伍' : '你是右方 — 选择队伍');
      break;
    case 'team-ready':
      if (msg.side === 'left')  leftTeam  = msg.team.map(id => createFighter(id,'left'));
      if (msg.side === 'right') rightTeam = msg.team.map(id => createFighter(id,'right'));
      if (leftTeam.length === 2 && rightTeam.length === 2) startBattle();
      break;
    case 'action':
      executeAction(msg.action);
      break;
  }
}

// ── SELECT SCREEN ─────────────────────────────────────────
function showSelectScreen(title) {
  document.getElementById('selectTitle').textContent = title;
  renderPetGrid();
  updateSlots();
  document.getElementById('btnConfirmTeam').disabled = true;
  showScreen('screenSelect');
}

function renderPetGrid() {
  const grid = document.getElementById('petGrid');
  let owned = null;
  try {
    const ps = JSON.parse(localStorage.getItem('petState'));
    if (ps && ps.pets) owned = ps.pets.filter(p => p.owned).map(p => p.id);
  } catch(e) {}
  const pets = owned ? ALL_PETS.filter(p => owned.includes(p.id)) : ALL_PETS;

  grid.innerHTML = pets.map(p => `
    <div class="pet-card ${selectedIds.includes(p.id)?'selected':''}"
         style="--rc:${RARITY_COLORS[p.rarity]}" data-id="${p.id}"
         onclick="togglePet('${p.id}')">
      <div class="pet-avatar">${buildPetImgHTML(p, 56)}</div>
      <div class="pet-name">${p.name}</div>
      <div class="pet-rarity" style="color:${RARITY_COLORS[p.rarity]}">${p.rarity}</div>
      <div class="pet-stats-mini">
        <span>HP${p.hp}</span><span>ATK${p.atk}</span><span>DEF${p.def}</span>
      </div>
    </div>`).join('');
}

function togglePet(id) {
  const idx = selectedIds.indexOf(id);
  if (idx >= 0) selectedIds.splice(idx,1);
  else { if (selectedIds.length >= 2) return showToast('最多选2只'); selectedIds.push(id); }
  renderPetGrid();
  updateSlots();
  document.getElementById('btnConfirmTeam').disabled = selectedIds.length !== 2;
}

function updateSlots() {
  for (let i = 0; i < 2; i++) {
    const slot = document.getElementById('slot'+i);
    if (selectedIds[i]) {
      const p = ALL_PETS.find(x => x.id === selectedIds[i]);
      slot.innerHTML = `<div class="slot-filled" style="border-color:${RARITY_COLORS[p.rarity]}">
        <div class="slot-avatar">${buildPetImgHTML(p, 40)}</div><span>${p.name}</span></div>`;
    } else {
      slot.innerHTML = `<div class="slot-empty">空位 ${i+1}</div>`;
    }
  }
}

function confirmTeam() {
  if (selectedIds.length !== 2) return;
  if (gameMode === 'pve') {
    leftTeam = selectedIds.map(id => createFighter(id,'left'));
    const pool = ALL_PETS.filter(p => !selectedIds.includes(p.id));
    const shuffled = pool.sort(() => Math.random() - 0.5);
    rightTeam = [createFighter(shuffled[0].id,'right'), createFighter(shuffled[1].id,'right')];
    startBattle();
  } else if (gameMode === 'pvp-online') {
    const side = onlineSide, team = selectedIds.slice();
    if (side === 'left')  leftTeam  = team.map(id => createFighter(id,'left'));
    if (side === 'right') rightTeam = team.map(id => createFighter(id,'right'));
    sendOnline({ type:'team-ready', side, team });
    showToast('等待对手选择…');
    if (leftTeam.length === 2 && rightTeam.length === 2) startBattle();
  }
}

function goBackFromSelect() {
  showScreen('screenMenu');
}

// ── FIGHTER FACTORY ───────────────────────────────────────
function createFighter(petId, side) {
  const b = ALL_PETS.find(p => p.id === petId);
  const m = RARITY_MULT[b.rarity] || 1;  // +3% per rarity tier
  const hp  = Math.round(b.hp  * m);
  const atk = Math.round(b.atk * m);
  const def = Math.round(b.def * m);
  const spd = Math.round(b.spd * m);
  return {
    id:b.id, name:b.name, emoji:b.emoji, rarity:b.rarity, side,
    img:b.img, sprite:b.sprite || null,
    maxHp:hp, hp:hp, shield:0,
    baseAtk:atk, baseDef:def, baseSpd:spd,
    atk, def, spd,
    crit: b.crit || 0.08,
    res:  RARITY_RES[b.rarity] || 12,
    passive: b.passive || null,
    passiveUsedThisTurn: false,  // for once-per-turn passives like shieldOnHit
    alive:true,
    buffs: [],
    bubbleStore: 0,      // 泡泡龟被动储存值
    bubbleShieldVal: 0,  // 泡泡盾当前值(与普通护盾分开)
    bubbleShieldTurns: 0,// 泡泡盾剩余回合
    bubbleShieldOwner: null, // 谁施加的泡泡盾(用于计算爆炸伤害)
    skills: b.skills.map(s => ({ ...s, cdLeft:0 })),
  };
}

// ── BATTLE START ──────────────────────────────────────────
function resetBattleState() {
  turnNum=1; currentIdx=0; leftTeam=[]; rightTeam=[];
  allFighters=[]; turnQueue=[]; battleOver=false; animating=false;
  batchPhase=0; batchesThisRound=0;
}

function startBattle() {
  allFighters = [...leftTeam, ...rightTeam];
  battleOver = false; turnNum = 1;
  showScreen('screenBattle');
  // Set team labels
  const ll = document.getElementById('teamLabelLeft');
  const lr = document.getElementById('teamLabelRight');
  if (gameMode === 'pve') { ll.textContent = '我方'; lr.textContent = '野生'; }
  else { ll.textContent = onlineSide==='left'?'我方':'对手'; lr.textContent = onlineSide==='right'?'我方':'对手'; }
  document.getElementById('battleLog').innerHTML = '';
  renderFighters();
  beginTurn();
}

function renderFighters() {
  leftTeam.forEach((f,i)  => renderFighterCard(f,'leftFighter'+i));
  rightTeam.forEach((f,i) => renderFighterCard(f,'rightFighter'+i));
}

function renderFighterCard(f, elId) {
  const card = document.getElementById(elId);
  const avatarEl = card.querySelector('.fighter-emoji');
  if (f.img) {
    avatarEl.innerHTML = buildPetImgHTML(f, 72);
  } else {
    avatarEl.textContent = f.emoji;
  }
  card.querySelector('.fighter-name').textContent = f.name;
  card.querySelector('.fighter-name').style.color = RARITY_COLORS[f.rarity];
  updateFighterStats(f, elId);
  updateHpBar(f, elId);
  card.classList.toggle('dead', !f.alive);
  renderStatusIcons(f);
}

const PASSIVE_ICONS = {
  turnScaleAtk:'⚔️', turnScaleHp:'💗', bonusDmgAbove60:'🎯',
  lowHpCrit:'💢', deathExplode:'💥', deathHook:'🪝', shieldOnHit:'🛡',
  healOnKill:'💚', counterAttack:'⚡', bubbleStore:'🫧', stoneWall:'🪨', hunterKill:'🏹'
};

function updateFighterStats(f, elId) {
  const card = document.getElementById(elId);
  const statsEl = card.querySelector('.fighter-stats');
  if (!statsEl) return;
  // Show current stats with debuff highlighting
  const atkClass = f.atk < f.baseAtk ? 'stat-down' : '';
  const defClass = f.def < f.baseDef ? 'stat-down' : f.def > f.baseDef ? 'stat-up' : '';
  const passiveIcon = f.passive ? `<span class="passive-icon" title="${f.passive.desc}">${PASSIVE_ICONS[f.passive.type]||'⭐'}</span>` : '';
  statsEl.innerHTML =
    `<span class="${atkClass}">⚔攻击${f.atk}</span>` +
    `<span class="${defClass}">🛡防御${f.def}</span>` +
    `<span>🔰抗性${f.res}%</span>` +
    passiveIcon;
}

// Sprite / static image helper — matches pet center (petImgHTML) approach
// Uses background-position animation for sprite sheets
var _spriteKF = {};
function buildPetImgHTML(pet, size) {
  if (pet.sprite && pet.img) {
    var s = pet.sprite, sc = size / s.frameH;
    var fw = Math.round(s.frameW * sc);          // single frame display width
    var tw = Math.round(s.frameW * s.frames * sc); // total sheet width
    var kfName = 'sprKF_' + pet.id + '_' + size;
    if (!_spriteKF[kfName]) {
      var st = document.createElement('style');
      st.textContent = '@keyframes ' + kfName + '{from{background-position:0 0}to{background-position:-' + tw + 'px 0}}';
      document.head.appendChild(st);
      _spriteKF[kfName] = true;
    }
    return '<div class="sprite-wrap" style="width:' + fw + 'px;height:' + size + 'px;">'
      + '<div class="sprite-inner" style="width:' + fw + 'px;height:' + size + 'px;'
      + 'background-image:url(\'' + pet.img + '\');background-size:' + tw + 'px ' + size + 'px;'
      + 'animation:' + kfName + ' ' + (s.duration / 1000) + 's steps(' + s.frames + ') infinite;"></div></div>';
  }
  if (pet.img) {
    return '<img src="' + pet.img + '" alt="' + pet.name + '" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;">';
  }
  return '<span style="font-size:' + Math.round(size * 0.75) + 'px;line-height:1;">' + pet.emoji + '</span>';
}

function updateHpBar(f, elId) {
  const card = document.getElementById(elId);
  const hpPct = Math.max(0, f.hp / f.maxHp * 100);
  const fill = card.querySelector('.hp-fill');
  fill.style.width = hpPct + '%';
  fill.style.background = hpPct > 50 ? '#06d6a0' : hpPct > 25 ? '#ffd93d' : '#ff6b6b';

  // Shield = white bar layered on top of HP, starting at hpPct position
  // Visual: [===green hp===][===white shield===][---empty---]
  const shieldPct = Math.min(f.shield / f.maxHp * 100, 100 - hpPct);
  let shieldEl = card.querySelector('.shield-fill');
  if (!shieldEl) {
    shieldEl = document.createElement('div');
    shieldEl.className = 'shield-fill';
    card.querySelector('.hp-bar').appendChild(shieldEl);
  }
  if (f.shield > 0) {
    shieldEl.style.display = 'block';
    shieldEl.style.left = hpPct + '%';
    shieldEl.style.width = shieldPct + '%';
  } else {
    shieldEl.style.display = 'none';
  }

  // Bubble shield = cyan bar (separate from normal shield)
  const bsPct = Math.min((f.bubbleShieldVal || 0) / f.maxHp * 100, 100 - hpPct - shieldPct);
  let bsEl = card.querySelector('.bubble-shield-fill');
  if (!bsEl) {
    bsEl = document.createElement('div');
    bsEl.className = 'bubble-shield-fill';
    card.querySelector('.hp-bar').appendChild(bsEl);
  }
  if (f.bubbleShieldVal > 0) {
    bsEl.style.display = 'block';
    bsEl.style.left = (hpPct + shieldPct) + '%';
    bsEl.style.width = Math.max(0, bsPct) + '%';
  } else {
    bsEl.style.display = 'none';
  }

  // HP text line
  let hpStr = `HP ${Math.ceil(f.hp)}/${f.maxHp}`;
  if (f.shield > 0) hpStr += ` <span class="shield-val">🛡${Math.ceil(f.shield)}</span>`;
  if (f.bubbleShieldVal > 0) hpStr += ` <span class="bubble-val">🫧${Math.ceil(f.bubbleShieldVal)}<small>${f.bubbleShieldTurns}回合</small></span>`;
  card.querySelector('.hp-text').innerHTML = hpStr;

  // Bubble store bar (only for fighters with bubbleStore passive)
  let bBar = card.querySelector('.bubble-store-bar');
  if (f.passive && f.passive.type === 'bubbleStore') {
    if (!bBar) {
      bBar = document.createElement('div');
      bBar.className = 'bubble-store-bar';
      bBar.innerHTML = '<div class="bubble-store-fill"></div>';
      card.querySelector('.hp-bar').parentNode.insertBefore(bBar, card.querySelector('.hp-text'));
    }
    const maxStore = f.maxHp * 0.5; // visual cap
    const storePct = Math.min(f.bubbleStore / maxStore * 100, 100);
    bBar.querySelector('.bubble-store-fill').style.width = storePct + '%';
    bBar.setAttribute('title', `泡泡储存: ${Math.round(f.bubbleStore)} (每回合回复${f.passive.healPct}%)`);
    // Label
    let label = bBar.querySelector('.bubble-store-label');
    if (!label) { label = document.createElement('span'); label.className = 'bubble-store-label'; bBar.appendChild(label); }
    label.textContent = `🫧 ${Math.round(f.bubbleStore)}`;
    bBar.style.display = f.bubbleStore > 0 ? '' : 'none';
  } else if (bBar) {
    bBar.style.display = 'none';
  }
}

function getFighterElId(f) {
  if (f.side === 'left') return 'leftFighter' + leftTeam.indexOf(f);
  return 'rightFighter' + rightTeam.indexOf(f);
}

// ── TURN SYSTEM ───────────────────────────────────────────
async function beginTurn() {
  document.getElementById('turnBanner').textContent = `第 ${turnNum} 回合`;
  // Reduce cooldowns
  allFighters.forEach(f => f.skills.forEach(s => { if (s.cdLeft > 0) s.cdLeft--; }));
  // Passive: per-turn scaling
  for (const f of allFighters) {
    if (!f.alive || !f.passive) continue;
    f.passiveUsedThisTurn = false; // reset once-per-turn passives
    if (f.passive.type === 'turnScaleAtk') {
      const gain = Math.round(f.baseAtk * f.passive.pct / 100);
      f.baseAtk += gain;
      spawnFloatingNum(getFighterElId(f), `+${gain}攻`, 'passive-num', 0, 0);
      addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">攻击+${gain}</span>`);
    }
    if (f.passive.type === 'turnScaleHp') {
      const gain = Math.round(f.maxHp * f.passive.pct / 100);
      f.maxHp += gain;
      f.hp += gain;
      const elId = getFighterElId(f);
      spawnFloatingNum(elId, `+${gain}HP`, 'passive-num', 0, 0);
      updateHpBar(f, elId);
      addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">最大HP+${gain}</span>`);
    }
    if (f.passive.type === 'stoneWall') {
      // Permanent def gain per turn, capped
      if (!f._stoneDefGained) f._stoneDefGained = 0;
      if (f._stoneDefGained < f.passive.maxDef) {
        const gain = Math.min(f.passive.defGain, f.passive.maxDef - f._stoneDefGained);
        f.baseDef += gain;
        f._stoneDefGained += gain;
        spawnFloatingNum(getFighterElId(f), `+${gain}防`, 'passive-num', 0, 0);
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">防御+${gain}(已+${f._stoneDefGained}/${f.passive.maxDef})</span>`);
      }
    }
  }
  // Process buffs/debuffs at turn start
  await processBuffs();
  // Recalculate stats after buff changes
  recalcStats();
  addLog(`── 第 ${turnNum} 回合 ──`, 'round-sep');
  nextBatch();
}

// ── BATCH TURN SYSTEM ─────────────────────────────────────
// 左A → 右CD → 左AB → 右CD → 左AB → ...
// batchPhase: 0=left×1(game start), then odd=right all, even=left all
let batchPhase = 0;
let batchesThisRound = 0;

async function nextBatch() {
  if (battleOver) return;
  // Hunter passive: check for low HP enemies to execute
  await processHunterKill();
  if (battleOver) return;
  const lAlive = leftTeam.filter(f => f.alive);
  const rAlive = rightTeam.filter(f => f.alive);
  turnQueue = [];
  currentIdx = 0;

  if (batchPhase === 0) {
    // Game start: left sends 1 fighter
    if (lAlive.length > 0) turnQueue.push(lAlive[0]);
    batchPhase = 1;
    batchesThisRound = 0;
  } else {
    // After every 2 batches (both sides acted) → new round
    if (batchesThisRound >= 2) {
      turnNum++;
      batchesThisRound = 0;
      beginTurn(); // beginTurn calls nextBatch at the end
      return;
    }
    if (batchPhase % 2 === 1) {
      turnQueue.push(...rAlive);
    } else {
      turnQueue.push(...lAlive);
    }
    batchPhase++;
    batchesThisRound++;
  }

  if (turnQueue.length === 0) { nextBatch(); return; }
  renderSideIndicator();
  nextAction();
}

function renderSideIndicator() {
  const el = document.getElementById('sideIndicator');
  if (!el) return;
  if (currentIdx >= turnQueue.length) { el.innerHTML = ''; return; }
  const f = turnQueue[currentIdx];
  const isLeft = f.side === 'left';
  el.innerHTML = `<span class="side-ind ${isLeft?'side-ind-left':'side-ind-right'}">${isLeft?'◀ 我方行动':'敌方行动 ▶'}</span>`;
}

async function processBuffs() {
  let hadTick = false;
  for (const f of allFighters) {
    if (!f.alive) continue;
    const elId = getFighterElId(f);
    // DoT damage
    const dots = f.buffs.filter(b => b.type === 'dot');
    for (const d of dots) {
      f.hp = Math.max(0, f.hp - d.value);
      spawnFloatingNum(elId, `-${d.value}`, 'dot-dmg', 0, 0);
      updateHpBar(f, elId);
      addLog(`${f.emoji}${f.name} 受到 <span class="log-dot">${d.value}持续伤害</span>（剩余${d.turns-1}回合）`);
      hadTick = true;
      if (f.hp <= 0) { f.alive = false; break; }
    }
    if (!f.alive) {
      checkDeaths(null);
      if (checkBattleEnd()) return;
      continue;
    }
    // HOT heal (stackable — each hot ticks independently)
    const hots = f.buffs.filter(b => b.type === 'hot');
    for (const h of hots) {
      const before = f.hp;
      f.hp = Math.min(f.maxHp, f.hp + h.value);
      const actual = Math.round(f.hp - before);
      if (actual > 0) {
        spawnFloatingNum(elId, `+${actual}`, 'heal-num', 0, 0);
        updateHpBar(f, elId);
        addLog(`${f.emoji}${f.name} <span class="log-heal">持续回复${actual}HP</span>（剩余${h.turns-1}回合）`);
        hadTick = true;
      }
    }
    // BubbleStore passive: heal 50% of stored value, then clear
    if (f.passive && f.passive.type === 'bubbleStore' && f.bubbleStore > 0) {
      const heal = Math.round(f.bubbleStore * f.passive.healPct / 100);
      const before = f.hp;
      f.hp = Math.min(f.maxHp, f.hp + heal);
      const actual = Math.round(f.hp - before);
      f.bubbleStore -= heal;
      if (f.bubbleStore < 1) f.bubbleStore = 0;
      if (actual > 0) {
        spawnFloatingNum(elId, `+${actual}🫧`, 'bubble-num', 100, 0);
        updateHpBar(f, elId);
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">泡泡回复${actual}HP</span>（剩余储存${Math.round(f.bubbleStore)}）`);
        hadTick = true;
      }
    }
    // BubbleShield tick down
    if (f.bubbleShieldTurns > 0) {
      f.bubbleShieldTurns--;
      if (f.bubbleShieldTurns <= 0 && f.bubbleShieldVal > 0) {
        // Natural expiry — bubble pops, deal AOE damage to enemies
        const owner = f.bubbleShieldOwner;
        if (owner && owner.alive) {
          const burstDmg = Math.round(owner.atk * 0.8);
          const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
          for (const e of enemies) {
            e.hp = Math.max(0, e.hp - burstDmg);
            const eId = getFighterElId(e);
            spawnFloatingNum(eId, `-${burstDmg}`, 'bubble-burst', 0, 0);
            updateHpBar(e, eId);
            if (e.hp <= 0) e.alive = false;
          }
          addLog(`${f.emoji}${f.name} 的泡泡盾自然破碎！<span class="log-passive">对敌方全体造成${burstDmg}伤害</span>`);
          hadTick = true;
        }
        f.bubbleShieldVal = 0;
        f.bubbleShieldOwner = null;
      }
    }
    // Tick down all buffs, remove expired
    f.buffs.forEach(b => b.turns--);
    f.buffs = f.buffs.filter(b => b.turns > 0);
    renderStatusIcons(f);
  }
  if (hadTick) await sleep(400);
}

function recalcStats() {
  allFighters.forEach(f => {
    // Reset to base
    f.atk = f.baseAtk;
    f.def = f.baseDef;
    // Apply debuffs & buffs
    for (const b of f.buffs) {
      if (b.type === 'atkDown') f.atk = Math.round(f.atk * (1 - b.value / 100));
      if (b.type === 'defDown') f.def = Math.round(f.def * (1 - b.value / 100));
      if (b.type === 'defUp')   f.def += b.value;
    }
  });
}

function renderStatusIcons(f) {
  const elId = getFighterElId(f);
  const card = document.getElementById(elId);
  if (!card) return;
  const box = card.querySelector('.status-icons');
  // Only debuff icons — passive is now shown in stats row
  box.innerHTML = f.buffs.map(b => {
    if (b.type === 'dot')     return `<span class="status-dot" title="持续伤害${b.value}/回合 剩${b.turns}回合">🔥${b.turns}</span>`;
    if (b.type === 'atkDown') return `<span class="status-atkdown" title="攻击-${b.value}% 剩${b.turns}回合">⬇攻${b.turns}</span>`;
    if (b.type === 'defDown') return `<span class="status-defdown" title="防御-${b.value}% 剩${b.turns}回合">⬇防${b.turns}</span>`;
    if (b.type === 'hot')     return `<span class="status-hot" title="回复${b.value}/回合 剩${b.turns}回合">💚${b.turns}</span>`;
    if (b.type === 'defUp')   return `<span class="status-defup" title="防御+${b.value} 剩${b.turns}回合">⬆防${b.turns}</span>`;
    if (b.type === 'bubbleBind') return `<span class="status-bubble" title="被束缚：攻击者获得${b.value}%伤害护盾 剩${b.turns}回合">🫧${b.turns}</span>`;
    if (b.type === 'dodge') return `<span class="status-dodge" title="闪避${b.value}% 剩${b.turns}回合">💨${b.turns}</span>`;
    return '';
  }).join('');
  // Also refresh stats row to show debuff color changes
  updateFighterStats(f, elId);
}

function nextAction() {
  if (battleOver) return;
  while (currentIdx < turnQueue.length && !turnQueue[currentIdx].alive) currentIdx++;
  if (currentIdx >= turnQueue.length) {
    nextBatch();
    return;
  }
  renderSideIndicator();
  showActionPanel(turnQueue[currentIdx]);
}

function showActionPanel(f) {
  const panel = document.getElementById('actionPanel');
  document.getElementById('actingName').textContent = f.name;
  document.getElementById('actingName').style.color = RARITY_COLORS[f.rarity];
  document.querySelectorAll('.fighter-card').forEach(c => c.classList.remove('active-turn'));
  document.getElementById(getFighterElId(f)).classList.add('active-turn');

  const isPlayer =
    (gameMode === 'pve' && f.side === 'left') ||
    (gameMode === 'pvp-online' && f.side === onlineSide);

  if (isPlayer) {
    renderActionButtons(f);
    panel.classList.add('show');
  } else if (gameMode === 'pve') {
    panel.classList.remove('show');
    setTimeout(() => aiAction(f), 600);
  } else {
    panel.classList.remove('show');
    addLog('等待对手操作…','sys');
  }
}

function renderActionButtons(f) {
  const box = document.getElementById('actionButtons');
  box.innerHTML = f.skills.map((s,i) => {
    const ready = s.cdLeft === 0;
    const iconMap = {physical:'⚔️',magic:'✨',heal:'💚',shield:'🛡',bubbleShield:'🫧',bubbleBind:'🫧'};
    const icon = iconMap[s.type] || '⚔️';
    const hitsLabel = s.hits > 1 ? ` ×${s.hits}` : '';
    // Main info line
    let infoText = '';
    if (s.type === 'heal') {
      if (s.hot && !s.heal) infoText = `回复 ${s.hot.hpPerTurn}×${s.hot.turns}回合`;
      else if (s.heal) infoText = `回复 ${s.heal} HP`;
      else if (s.defUpPct) infoText = `防御+${s.defUpPct.pct}% ${s.defUpPct.turns}回合`;
      else if (s.defUp) infoText = `防御+${s.defUp.val} ${s.defUp.turns}回合`;
      else infoText = '增益';
    } else if (s.type === 'shield') {
      if (s.shieldFlat || s.shieldHpPct) {
        const p = [];
        if (s.shieldFlat) p.push(s.shieldFlat);
        if (s.shieldHpPct) p.push(`${s.shieldHpPct}%HP`);
        infoText = `护盾 ${p.join('+')}`;
        if (s.aoeAlly) infoText += ' 全体';
      } else {
        infoText = `护盾 +${s.shield}`;
      }
    } else if (s.type === 'bubbleShield') {
      infoText = `泡泡盾 ${s.atkScale}×ATK`;
    } else if (s.type === 'bubbleBind') {
      infoText = `束缚 ${s.duration}回合`;
    } else {
      // Calculate total base damage for display
      let totalBase = s.power * (s.hits || 1);
      if (s.atkScale) totalBase = Math.round(f.atk * s.atkScale);
      if (s.hpPct) totalBase += '?' ; // can't know target HP, show formula
      if (s.atkScale || s.defScale || s.hpPct) {
        const parts = [];
        if (s.atkScale) parts.push(`${s.atkScale}×攻击力`);
        if (s.defScale) parts.push(`${s.defScale}×防御力`);
        if (s.hpPct)    parts.push(`${s.hpPct}%最大HP`);
        infoText = `造成 ${parts.join('+')} 伤害`;
      } else {
        infoText = `造成 ${totalBase} 伤害`;
      }
    }
    // Pierce as separate line
    const pierceLine = s.pierce ? `<span class="skill-pierce">穿透伤害 ${s.pierce}</span>` : '';
    // Debuff tags (short)
    const tags = [];
    if (s.dot)     tags.push('<span class="debuff-tag dot-tag">🔥</span>');
    if (s.atkDown) tags.push('<span class="debuff-tag atk-tag">⬇攻</span>');
    if (s.defDown) tags.push('<span class="debuff-tag def-tag">⬇防</span>');
    if (s.aoe)     tags.push('<span class="debuff-tag aoe-tag">🎯全体</span>');
    if (s.hot)     tags.push('<span class="debuff-tag hot-tag">💚HOT</span>');
    if (s.defUp)   tags.push('<span class="debuff-tag defup-tag">⬆防</span>');
    if (s.type === 'bubbleShield') tags.push('<span class="debuff-tag bubble-tag">🫧盾</span>');
    if (s.type === 'bubbleBind')  tags.push('<span class="debuff-tag bubble-tag">🫧缚</span>');
    const hasDetail = s.pierce || s.dot || s.atkDown || s.defDown || s.aoe || s.hot || s.defUp || s.type==='bubbleShield' || s.type==='bubbleBind';
    return `<div class="skill-btn-wrap">
      <button class="btn-skill ${ready?'':'disabled'}" ${ready?`onclick="pickSkill(${i})"`:''}>
        <span class="skill-icon">${icon}</span>
        <span class="skill-name">${s.name}${hitsLabel}</span>
        <span class="skill-info">${infoText}</span>
        ${pierceLine}
        ${tags.length?'<span class="skill-tags">'+tags.join('')+'</span>':''}
        ${!ready?`<span class="cd-tag">CD${s.cdLeft}</span>`:''}
      </button>
      ${hasDetail?`<button class="btn-detail" onclick="toggleSkillDetail(event,${i})">详细</button>`:''}
      <div class="skill-detail" id="skillDetail${i}" style="display:none">
        ${buildSkillDetail(s)}
      </div>
    </div>`;
  }).join('');
  document.getElementById('targetSelect').style.display = 'none';
}

function buildSkillDetail(s) {
  const lines = [];
  const typeLabel = s.type==='physical'?'物理': s.type==='magic'?'魔法': s.type==='heal'?'治疗':'护盾';
  lines.push(`<b>类型</b> ${typeLabel}`);
  if (s.type !== 'heal' && s.type !== 'shield') {
    lines.push(`<b>基础伤害</b> ${s.power}${s.hits>1?' ×'+s.hits+'段':''}`);
  }
  if (s.atkScale) lines.push(`<b>攻击系数</b> ${s.atkScale}×攻击力`);
  if (s.defScale) lines.push(`<b>防御系数</b> ${s.defScale}×防御力`);
  if (s.hpPct)    lines.push(`<b>额外伤害</b> +目标最大HP的${s.hpPct}%`);
  if (s.shieldFlat || s.shieldHpPct) {
    const parts = [];
    if (s.shieldFlat) parts.push(s.shieldFlat);
    if (s.shieldHpPct) parts.push(`${s.shieldHpPct}%最大HP`);
    lines.push(`<b>护盾量</b> ${parts.join('+')}`);
  }
  if (s.aoeAlly) lines.push(`<b>🎯范围</b> 对所有友军生效`);
  if (s.defUpPct) lines.push(`<b>⬆防御增强</b> +${s.defUpPct.pct}%防御力，持续${s.defUpPct.turns}回合`);
  if (s.pierce)  lines.push(`<b>穿透伤害</b> <span class="detail-pierce">${s.pierce}</span>（无视防御+抗性，打护盾）`);
  if (s.heal)    lines.push(`<b>回复量</b> ${s.heal} HP`);
  if (s.shield)  lines.push(`<b>护盾量</b> +${s.shield}`);
  if (s.cd > 0)  lines.push(`<b>冷却</b> ${s.cd} 回合`);
  if (s.random)  lines.push(`<b>随机</b> 伤害×0.5~1.5倍率`);
  if (s.dot)     lines.push(`<b>🔥灼烧</b> 每回合 <span class="detail-dot">${s.dot.dmg}伤害</span>，持续 ${s.dot.turns} 回合`);
  if (s.atkDown) lines.push(`<b>⬇攻击削减</b> <span class="detail-debuff">-${s.atkDown.pct}%</span> 攻击力，持续 ${s.atkDown.turns} 回合`);
  if (s.defDown) lines.push(`<b>⬇防御削减</b> <span class="detail-debuff">-${s.defDown.pct}%</span> 防御力，持续 ${s.defDown.turns} 回合`);
  if (s.aoe)     lines.push(`<b>🎯范围</b> 对所有敌人生效`);
  if (s.hot)     lines.push(`<b>💚持续回复</b> 每回合 <span class="log-heal">${s.hot.hpPerTurn}HP</span>，持续 ${s.hot.turns} 回合（可叠加）`);
  if (s.defUp)   lines.push(`<b>⬆防御增强</b> <span class="log-passive">+${s.defUp.val}防御</span>，持续 ${s.defUp.turns} 回合`);
  if (s.type === 'bubbleShield') {
    lines.push(`<b>🫧泡泡盾</b> ${s.atkScale}×攻击力，持续${s.duration}回合`);
    lines.push(`<b>💥自然破碎</b> 护盾到期未被打破时，对敌方全体造成${s.burstScale}×攻击力伤害`);
  }
  if (s.type === 'bubbleBind') {
    lines.push(`<b>🫧泡泡束缚</b> 标记敌人${s.duration}回合`);
    lines.push(`<b>效果</b> 友方攻击被标记目标获得 伤害×${s.bindPct}% 的永久护盾`);
  }
  return lines.map(l => `<div class="detail-line">${l}</div>`).join('');
}

function toggleSkillDetail(e, idx) {
  e.stopPropagation();
  const el = document.getElementById('skillDetail' + idx);
  // Close all others
  document.querySelectorAll('.skill-detail').forEach(d => { if (d !== el) d.style.display = 'none'; });
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

let pendingSkillIdx = null;

function pickSkill(idx) {
  const f = turnQueue[currentIdx];
  const skill = f.skills[idx];
  pendingSkillIdx = idx;
  const isAlly = skill.type === 'heal' || skill.type === 'shield' || skill.type === 'bubbleShield';

  // AOE / auto-target: no target selection needed
  if (skill.aoe || skill.aoeAlly || skill.type === 'hunterBarrage') {
    executePlayerAction(f, skill, null);
    return;
  }

  // bubbleBind targets enemies
  const targetsFromSide = (isAlly ? (f.side==='left'?leftTeam:rightTeam) : (f.side==='left'?rightTeam:leftTeam));
  const targets = targetsFromSide.filter(a => a.alive);
  if (targets.length === 1) executePlayerAction(f, skill, targets[0]);
  else showTargetSelect(targets, f, skill);
}

function showTargetSelect(targets) {
  const box = document.getElementById('targetButtons');
  box.innerHTML = targets.map(t => {
    const hpPct = Math.round(t.hp/t.maxHp*100);
    return `<button class="btn btn-target" onclick="selectTarget(${allFighters.indexOf(t)})">
      ${t.emoji} ${t.name} (HP${hpPct}%${t.shield>0?' 🛡'+Math.ceil(t.shield):''})
    </button>`;
  }).join('');
  document.getElementById('targetSelect').style.display = 'block';
}

function selectTarget(fi) {
  const f = turnQueue[currentIdx];
  const skill = f.skills[pendingSkillIdx];
  executePlayerAction(f, skill, allFighters[fi]);
}
function cancelTarget() { document.getElementById('targetSelect').style.display='none'; pendingSkillIdx=null; }

function executePlayerAction(f, skill, target) {
  document.getElementById('targetSelect').style.display = 'none';
  const action = { attackerId:allFighters.indexOf(f), skillIdx:f.skills.indexOf(skill), targetId: target ? allFighters.indexOf(target) : -1, aoe:!!skill.aoe };
  if (gameMode === 'pvp-online') sendOnline({ type:'action', action });
  executeAction(action);
}

// ── ACTION EXECUTION ──────────────────────────────────────
async function executeAction(action) {
  if (animating || battleOver) return;
  animating = true;
  const f = allFighters[action.attackerId];
  const skill = f.skills[action.skillIdx];

  if (skill.cd > 0) skill.cdLeft = skill.cd;

  const atkEl = document.getElementById(getFighterElId(f));
  atkEl.classList.add('attack-anim');

  if (action.aoe) {
    // AOE: hit all alive enemies
    const enemies = (f.side==='left'?rightTeam:leftTeam).filter(e => e.alive);
    for (const enemy of enemies) {
      await doDamage(f, enemy, skill);
      if (battleOver) break;
    }
  } else if (skill.type === 'heal') {
    const target = allFighters[action.targetId];
    await doHeal(f, target, skill);
  } else if (skill.type === 'shield') {
    if (skill.aoeAlly) {
      // AOE ally shield
      const allies = (f.side==='left'?leftTeam:rightTeam).filter(a => a.alive);
      for (const ally of allies) await doShield(f, ally, skill);
    } else {
      const target = allFighters[action.targetId];
      await doShield(f, target, skill);
    }
  } else if (skill.type === 'bubbleShield') {
    const target = allFighters[action.targetId];
    await doBubbleShield(f, target, skill);
  } else if (skill.type === 'bubbleBind') {
    const target = allFighters[action.targetId];
    await doBubbleBind(f, target, skill);
  } else if (skill.type === 'hunterShot') {
    const target = allFighters[action.targetId];
    await doHunterShot(f, target, skill);
  } else if (skill.type === 'hunterBarrage') {
    await doHunterBarrage(f, skill);
  } else if (skill.type === 'hunterStealth') {
    const target = allFighters[action.targetId];
    await doHunterStealth(f, target, skill);
  } else {
    const target = allFighters[action.targetId];
    await doDamage(f, target, skill);
  }

  atkEl.classList.remove('attack-anim');
  checkDeaths(f);
  if (checkBattleEnd()) { animating=false; return; }
  animating = false;
  currentIdx++;
  nextAction();
}

/* ── DAMAGE — multi-hit with crit, floating numbers, debuff application ── */
async function doDamage(attacker, target, skill) {
  const hits = skill.hits;
  const tElId = getFighterElId(target);
  let totalDirect = 0, totalPierce = 0, totalShieldDmg = 0, totalCrits = 0;

  for (let i = 0; i < hits; i++) {
    if (!target.alive) break;

    // Dodge check
    const dodgeBuff = target.buffs.find(b => b.type === 'dodge');
    if (dodgeBuff && Math.random() < dodgeBuff.value / 100) {
      const yOff = i * 28;
      spawnFloatingNum(tElId, '闪避!', 'dodge-num', i * 300, yOff);
      await sleep(280);
      continue;
    }

    let basePower = skill.power;
    if (skill.atkScale) basePower += Math.round(attacker.atk * skill.atkScale);
    if (skill.defScale) basePower += Math.round(attacker.def * skill.defScale);
    if (skill.hpPct) basePower += Math.round(target.maxHp * skill.hpPct / 100);
    // If scaling used, total is split across hits
    if ((skill.atkScale || skill.defScale || skill.hpPct) && hits > 1) basePower = Math.round(basePower / hits);
    if (skill.random) basePower = Math.round(basePower * (0.5 + Math.random() * 1.5));

    // Passive: lowHpCrit — extra crit when HP < 30%
    let effectiveCrit = attacker.crit;
    if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
      effectiveCrit += attacker.passive.pct / 100;
    }
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0)) : 1;
    if (isCrit) totalCrits++;

    // Normal damage goes through DEF formula + resistance
    const normalBase = Math.max(0, basePower - (skill.pierce || 0));
    let normalDmg = Math.max(0, Math.round(normalBase * (attacker.atk / (attacker.atk + target.def)) * critMult));
    // Passive: bonusDmgAbove60
    if (attacker.passive && attacker.passive.type === 'bonusDmgAbove60' && target.hp / target.maxHp > 0.6) {
      normalDmg = Math.round(normalDmg * (1 + attacker.passive.pct / 100));
    }
    // Resistance reduces normal damage
    const normalPart = Math.max(0, Math.round(normalDmg * (1 - target.res / 100)));
    // Pierce damage: raw value, ignores DEF and resistance, but hits shield
    const piercePart = Math.round((skill.pierce || 0) * critMult);
    const totalHit = normalPart + piercePart;

    // Damage absorption: bubbleShield first → normal shield → HP
    let remaining = totalHit;
    let bubbleAbs = 0, shieldAbs = 0, hpLoss = 0;
    // 1) Bubble shield absorbs first (separate from normal shield)
    if (target.bubbleShieldVal > 0 && remaining > 0) {
      bubbleAbs = Math.min(target.bubbleShieldVal, remaining);
      target.bubbleShieldVal -= bubbleAbs;
      remaining -= bubbleAbs;
    }
    // 2) Normal shield absorbs next
    if (target.shield > 0 && remaining > 0) {
      shieldAbs = Math.min(target.shield, remaining);
      target.shield -= shieldAbs;
      remaining -= shieldAbs;
    }
    // 3) Remaining goes to HP
    hpLoss = remaining;
    target.hp = Math.max(0, target.hp - hpLoss);
    if (target.hp <= 0) target.alive = false;

    totalDirect += normalPart;
    totalPierce += piercePart;
    totalShieldDmg += shieldAbs;

    // Floating numbers per hit — stagger vertically
    const yOff = i * 28;
    if (isCrit) spawnFloatingNum(tElId, '暴击!', 'crit-label', i*300, yOff - 18);
    if (shieldAbs > 0) spawnFloatingNum(tElId, `-${shieldAbs}`, 'shield-dmg', i*300, yOff);
    if (hpLoss > 0 && piercePart > 0) {
      // Show normal + pierce separately
      const normalHp = Math.min(normalPart, hpLoss);
      const pierceHp = hpLoss - normalHp;
      if (normalHp > 0) spawnFloatingNum(tElId, `-${normalHp}`, isCrit ? 'crit-dmg' : 'direct-dmg', i*300+80, yOff);
      if (pierceHp > 0) spawnFloatingNum(tElId, `-${pierceHp}`, 'pierce-dmg', i*300+160, yOff);
    } else if (hpLoss > 0) {
      spawnFloatingNum(tElId, `-${hpLoss}`, isCrit ? 'crit-dmg' : 'direct-dmg', i*300+80, yOff);
    }
    if (piercePart > 0 && shieldAbs >= totalHit) {
      // All absorbed by shield but still show pierce tag
      spawnFloatingNum(tElId, `穿${piercePart}`, 'pierce-dmg', i*300+160, yOff);
    }

    // Passive: shieldOnHit — target gains shield when hit (once per turn)
    if (target.alive && target.passive && target.passive.type === 'shieldOnHit' && !target.passiveUsedThisTurn) {
      target.shield += target.passive.amount;
      target.passiveUsedThisTurn = true;
      spawnFloatingNum(tElId, `+${target.passive.amount}🛡`, 'passive-num', i*300+200, yOff);
    }

    // Passive: stoneWall reflect — reflect (10% + 1%×def) of damage back
    if (target.alive && target.passive && target.passive.type === 'stoneWall' && hpLoss > 0 && attacker.alive) {
      const reflectPct = target.passive.reflectBase + target.passive.reflectPerDef * target.def;
      const reflectDmg = Math.round(hpLoss * reflectPct / 100);
      if (reflectDmg > 0) {
        attacker.hp = Math.max(0, attacker.hp - reflectDmg);
        const aElId = getFighterElId(attacker);
        spawnFloatingNum(aElId, `-${reflectDmg}`, 'counter-dmg', i*300+280, yOff);
        updateHpBar(attacker, aElId);
        if (attacker.hp <= 0) attacker.alive = false;
      }
    }

    // Passive: bubbleStore — store 30% of HP damage taken as bubble value
    if (target.alive && target.passive && target.passive.type === 'bubbleStore' && hpLoss > 0) {
      const stored = Math.round(hpLoss * target.passive.pct / 100);
      target.bubbleStore += stored;
      spawnFloatingNum(tElId, `+${stored}🫧`, 'bubble-num', i*300+250, yOff);
    }

    // BubbleBind: attacker gains permanent shield = damage dealt × bindPct
    const bindBuff = target.buffs.find(b => b.type === 'bubbleBind');
    if (bindBuff && hpLoss > 0 && attacker.alive) {
      const gained = Math.round(hpLoss * bindBuff.value / 100);
      attacker.shield += gained;
      const aElId = getFighterElId(attacker);
      spawnFloatingNum(aElId, `+${gained}🛡`, 'bubble-num', i*300+280, yOff);
      updateHpBar(attacker, aElId);
    }

    // Shake
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(280);
    tEl.classList.remove('hit-shake');
    await sleep(40);
  }

  // Apply debuffs from skill (only if target still alive)
  if (target.alive) {
    applySkillDebuffs(skill, target);
  }

  // Passive: counterAttack — target may counter
  if (target.alive && target.passive && target.passive.type === 'counterAttack') {
    if (Math.random() < target.passive.pct / 100) {
      const counterDmg = Math.round(target.baseAtk * 0.5);
      attacker.hp = Math.max(0, attacker.hp - counterDmg);
      const aElId = getFighterElId(attacker);
      spawnFloatingNum(aElId, `-${counterDmg}`, 'counter-dmg', 0, 0);
      updateHpBar(attacker, aElId);
      addLog(`${target.emoji}${target.name} <span class="log-passive">反击！</span>对 ${attacker.emoji}${attacker.name} 造成 <span class="log-direct">${counterDmg}伤害</span>`);
      if (attacker.hp <= 0) attacker.alive = false;
    }
  }

  // Log
  const h = hits > 1 ? ` ${hits}段` : '';
  const parts = [];
  if (totalShieldDmg > 0) parts.push(`<span class="log-shield-dmg">${totalShieldDmg}护盾</span>`);
  if (totalDirect > 0)    parts.push(`<span class="log-direct">${totalDirect}伤害</span>`);
  if (totalPierce > 0)    parts.push(`<span class="log-pierce">${totalPierce}穿透</span>`);
  if (totalCrits > 0)     parts.push(`<span class="log-crit">${totalCrits}暴击</span>`);
  addLog(`${attacker.emoji}${attacker.name} <b>${skill.name}</b>${h} → ${target.emoji}${target.name}：${parts.join(' + ')}`);
}

/* Apply debuffs: dot, atkDown, defDown */
function applySkillDebuffs(skill, target) {
  const debuffs = [];
  if (skill.dot)     debuffs.push({ type:'dot',     value:skill.dot.dmg,     turns:skill.dot.turns });
  if (skill.atkDown) debuffs.push({ type:'atkDown', value:skill.atkDown.pct, turns:skill.atkDown.turns });
  if (skill.defDown) debuffs.push({ type:'defDown', value:skill.defDown.pct, turns:skill.defDown.turns });

  for (const d of debuffs) {
    const finalTurns = d.turns;
    // Don't stack same type, refresh instead
    const existing = target.buffs.find(b => b.type === d.type);
    if (existing) {
      existing.value = Math.max(existing.value, d.value);
      existing.turns = Math.max(existing.turns, finalTurns);
    } else {
      target.buffs.push({ type:d.type, value:d.value, turns:finalTurns });
    }
    // Floating indicator
    const tElId = getFighterElId(target);
    const labels = { dot:'🔥灼烧', atkDown:'⬇️攻击', defDown:'⬇️防御' };
    spawnFloatingNum(tElId, labels[d.type], 'debuff-label', 200, -10);
    addLog(`${target.emoji}${target.name} 被施加 <span class="log-debuff">${labels[d.type]} ${finalTurns}回合</span>`);
  }
  renderStatusIcons(target);
  recalcStats();
}

async function doHeal(caster, target, skill) {
  const logParts = [];
  // Instant heal
  if (skill.heal > 0) {
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + skill.heal);
    const actual = Math.round(target.hp - before);
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, `+${actual}`, 'heal-num', 0, 0);
    updateHpBar(target, tElId);
    logParts.push(`<span class="log-heal">回复${actual}HP</span>`);
  }
  // HOT (heal over time) — stackable buff
  if (skill.hot) {
    target.buffs.push({ type:'hot', value:skill.hot.hpPerTurn, turns:skill.hot.turns });
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, `+HOT`, 'passive-num', 200, 0);
    logParts.push(`<span class="log-heal">持续回复${skill.hot.hpPerTurn}/回合 ${skill.hot.turns}回合</span>`);
    renderStatusIcons(target);
  }
  // DefUp buff (flat)
  if (skill.defUp) {
    const existing = target.buffs.find(b => b.type === 'defUp');
    if (existing) { existing.value += skill.defUp.val; existing.turns = Math.max(existing.turns, skill.defUp.turns); }
    else target.buffs.push({ type:'defUp', value:skill.defUp.val, turns:skill.defUp.turns });
    spawnFloatingNum(getFighterElId(target), `+${skill.defUp.val}防`, 'passive-num', 300, 0);
    logParts.push(`<span class="log-passive">防御+${skill.defUp.val} ${skill.defUp.turns}回合</span>`);
    recalcStats();
    renderStatusIcons(target);
  }
  // DefUpPct buff (percentage-based)
  if (skill.defUpPct) {
    const val = Math.round(target.baseDef * skill.defUpPct.pct / 100);
    const existing = target.buffs.find(b => b.type === 'defUp');
    if (existing) { existing.value += val; existing.turns = Math.max(existing.turns, skill.defUpPct.turns); }
    else target.buffs.push({ type:'defUp', value:val, turns:skill.defUpPct.turns });
    spawnFloatingNum(getFighterElId(target), `+${val}防(${skill.defUpPct.pct}%)`, 'passive-num', 300, 0);
    logParts.push(`<span class="log-passive">防御+${skill.defUpPct.pct}%(+${val}) ${skill.defUpPct.turns}回合</span>`);
    recalcStats();
    renderStatusIcons(target);
  }
  addLog(`${caster.emoji}${caster.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：${logParts.join(' ')}`);
  await sleep(500);
}

async function doShield(caster, target, skill) {
  // Calculate shield amount: fixed + % of caster's maxHP
  let amount = skill.shield || 0;
  if (skill.shieldFlat) amount += skill.shieldFlat;
  if (skill.shieldHpPct) amount += Math.round(caster.maxHp * skill.shieldHpPct / 100);
  target.shield += amount;
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `+${amount}🛡`, 'shield-num', 0, 0);
  updateHpBar(target, tElId);
  addLog(`${caster.emoji}${caster.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-shield">+${amount}护盾</span>`);
  await sleep(500);
}

// ── HUNTER SKILLS ─────────────────────────────────────────
async function doHunterShot(attacker, target, skill) {
  // If target < execThresh% HP: +execCrit% crit, +execCritDmg% crit damage
  const isExec = target.hp / target.maxHp < skill.execThresh / 100;
  const savedCrit = attacker.crit;
  if (isExec) {
    attacker.crit += skill.execCrit / 100;
    addLog(`${attacker.emoji}${attacker.name} 猎人本能！目标血量低，<span class="log-crit">暴击率+${skill.execCrit}% 暴击伤害+${skill.execCritDmg}%</span>`);
  }
  // Temporarily boost crit damage multiplier
  attacker._extraCritDmg = isExec ? skill.execCritDmg / 100 : 0;
  await doDamage(attacker, target, skill);
  attacker.crit = savedCrit;
  attacker._extraCritDmg = 0;
}

async function doHunterBarrage(attacker, skill) {
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  if (!enemies.length) return;
  const arrowDmg = Math.round(attacker.atk * skill.arrowScale);

  for (let i = 0; i < skill.hits; i++) {
    const alive = enemies.filter(e => e.alive);
    if (!alive.length) break;
    const target = alive[Math.floor(Math.random() * alive.length)];
    // Pierce damage — ignores DEF and resistance, but hits shields
    let rem = arrowDmg;
    if (target.bubbleShieldVal > 0) {
      const ba = Math.min(target.bubbleShieldVal, rem);
      target.bubbleShieldVal -= ba; rem -= ba;
    }
    if (target.shield > 0 && rem > 0) {
      const sa = Math.min(target.shield, rem);
      target.shield -= sa; rem -= sa;
    }
    target.hp = Math.max(0, target.hp - rem);
    if (target.hp <= 0) target.alive = false;
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, `-${arrowDmg}`, 'pierce-dmg', i * 150, (i % 4) * 20);
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(130);
    tEl.classList.remove('hit-shake');
  }
  addLog(`${attacker.emoji}${attacker.name} <b>${skill.name}</b> ${skill.hits}根箭随机射出，每根 <span class="log-pierce">${arrowDmg}穿透</span>`);
}

async function doHunterStealth(attacker, target, skill) {
  // 1) Deal damage
  const dmgSkill = { ...skill, power: 0, atkScale: skill.dmgScale, hits: 1, type: 'physical' };
  await doDamage(attacker, target, dmgSkill);

  // 2) Gain dodge buff
  const existing = attacker.buffs.find(b => b.type === 'dodge');
  if (existing) { existing.turns = Math.max(existing.turns, skill.dodgeTurns); }
  else attacker.buffs.push({ type: 'dodge', value: skill.dodgePct, turns: skill.dodgeTurns });

  // 3) Gain shield
  const shieldAmt = Math.round(attacker.atk * skill.shieldScale);
  attacker.shield += shieldAmt;

  const fElId = getFighterElId(attacker);
  spawnFloatingNum(fElId, `+${shieldAmt}🛡`, 'shield-num', 200, 0);
  spawnFloatingNum(fElId, `闪避${skill.dodgePct}%`, 'passive-num', 400, -15);
  updateHpBar(attacker, fElId);
  renderStatusIcons(attacker);
  addLog(`${attacker.emoji}${attacker.name} 进入隐蔽：<span class="log-passive">闪避${skill.dodgePct}% ${skill.dodgeTurns}回合</span> + <span class="log-shield">护盾+${shieldAmt}</span>`);
}

async function doBubbleShield(caster, target, skill) {
  const amount = Math.round(caster.atk * skill.atkScale);
  target.bubbleShieldVal = amount;
  target.bubbleShieldTurns = skill.duration;
  target.bubbleShieldOwner = caster;
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `+${amount}🫧`, 'bubble-num', 0, 0);
  updateHpBar(target, tElId);
  renderStatusIcons(target);
  addLog(`${caster.emoji}${caster.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-passive">泡泡盾+${amount}（${skill.duration}回合）</span>`);
  await sleep(500);
}

async function doBubbleBind(caster, target, skill) {
  // Remove existing bind on this target
  target.buffs = target.buffs.filter(b => b.type !== 'bubbleBind');
  target.buffs.push({ type:'bubbleBind', value:skill.bindPct, turns:skill.duration });
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, '🫧束缚', 'bubble-num', 0, 0);
  renderStatusIcons(target);
  addLog(`${caster.emoji}${caster.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-passive">泡泡束缚${skill.duration}回合（攻击者获得${skill.bindPct}%伤害护盾）</span>`);
  await sleep(500);
}

// ── FLOATING NUMBERS — persistent 2.5s ────────────────────
function spawnFloatingNum(elId, text, cls, delayMs, yOffset) {
  setTimeout(() => {
    const parent = document.getElementById(elId);
    const num = document.createElement('div');
    num.className = 'floating-num ' + cls;
    num.textContent = text;
    const ox = (Math.random() - 0.5) * 44;
    num.style.left = `calc(50% + ${ox}px)`;
    num.style.setProperty('--y-start', `-${20 + (yOffset||0)}px`);
    num.style.setProperty('--y-end', `-${60 + (yOffset||0)}px`);
    parent.appendChild(num);
    setTimeout(() => num.remove(), 2500);
  }, delayMs);
}

// ── AI ────────────────────────────────────────────────────
function aiAction(f) {
  const enemies = leftTeam.filter(e => e.alive);
  const allies  = rightTeam.filter(a => a.alive);
  if (!enemies.length) return;
  const ready = f.skills.filter(s => s.cdLeft === 0);

  let skill;
  if (difficulty === 'easy') {
    skill = ready[Math.floor(Math.random()*ready.length)];
  } else {
    // normal & hard share logic with different thresholds
    const hpThresh = difficulty === 'hard' ? 0.35 : 0.4;
    const healS = ready.find(s => s.type==='heal');
    if (healS && allies.some(a => a.hp/a.maxHp < hpThresh)) { skill = healS; }
    else {
      const shieldS = ready.find(s => s.type==='shield');
      if (shieldS && allies.some(a => a.shield < 30)) skill = shieldS;
      else {
        const dmg = ready.filter(s => s.type!=='heal' && s.type!=='shield');
        if (difficulty === 'hard' && dmg.length) {
          const lo = enemies.sort((a,b)=>a.hp-b.hp)[0];
          const best = dmg.sort((a,b)=>(b.power*b.hits+(b.pierce||0))-(a.power*a.hits+(a.pierce||0)))[0];
          skill = lo.hp < best.power*best.hits*0.6 ? best : (dmg[Math.floor(Math.random()*dmg.length)]);
        } else skill = dmg.length ? dmg[Math.floor(Math.random()*dmg.length)] : ready[0];
      }
    }
  }
  if (!skill) skill = ready[0];

  let target;
  if (skill.type==='heal') target = allies.sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0];
  else if (skill.type==='shield') target = allies.sort((a,b)=>a.shield-b.shield)[0];
  else target = enemies.sort((a,b)=>a.hp-b.hp)[0];

  executeAction({ attackerId:allFighters.indexOf(f), skillIdx:f.skills.indexOf(skill), targetId:allFighters.indexOf(target) });
}

// ── DEATH & WIN ───────────────────────────────────────────
function checkDeaths(attacker) {
  allFighters.forEach(f => {
    if (f.hp <= 0 && f.alive) {
      f.alive = false; f.hp = 0;
      const elId = getFighterElId(f);
      document.getElementById(elId).classList.add('dead');
      updateHpBar(f, elId);
      addLog(`${f.emoji}${f.name} 被击败！`,'death');

      // Passive: deathExplode — deal % maxHP damage to killer
      if (f.passive && f.passive.type === 'deathExplode' && attacker && attacker.alive) {
        const dmg = Math.round(f.maxHp * f.passive.pct / 100);
        attacker.hp = Math.max(0, attacker.hp - dmg);
        const aElId = getFighterElId(attacker);
        spawnFloatingNum(aElId, `-${dmg}`, 'death-explode', 200, 0);
        updateHpBar(attacker, aElId);
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">死亡爆炸！</span>对 ${attacker.emoji}${attacker.name} 造成 <span class="log-direct">${dmg}伤害</span>`);
        if (attacker.hp <= 0) { attacker.alive = false; }
      }

      // Passive: deathHook — deal % maxHP as PIERCE damage to killer (bypasses shield+res)
      if (f.passive && f.passive.type === 'deathHook' && attacker && attacker.alive) {
        const dmg = Math.round(f.maxHp * f.passive.pct / 100);
        // Pierce: bypass shield, directly to HP
        attacker.hp = Math.max(0, attacker.hp - dmg);
        const aElId = getFighterElId(attacker);
        spawnFloatingNum(aElId, `-${dmg}`, 'pierce-dmg', 200, 0);
        updateHpBar(attacker, aElId);
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">钩锁！</span>对 ${attacker.emoji}${attacker.name} 造成 <span class="log-pierce">${dmg}穿透伤害</span>`);
        if (attacker.hp <= 0) { attacker.alive = false; }
      }

      // Passive: healOnKill — killer heals
      if (attacker && attacker.alive && attacker.passive && attacker.passive.type === 'healOnKill') {
        const heal = Math.round(attacker.maxHp * attacker.passive.pct / 100);
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
        const aElId = getFighterElId(attacker);
        spawnFloatingNum(aElId, `+${heal}`, 'heal-num', 400, 0);
        updateHpBar(attacker, aElId);
        addLog(`${attacker.emoji}${attacker.name} 被动：<span class="log-passive">击杀回血${heal}HP</span>`);
      }
    }
  });
}

function checkBattleEnd() {
  const lA = leftTeam.some(f=>f.alive), rA = rightTeam.some(f=>f.alive);
  if (!lA || !rA) {
    battleOver = true;
    document.getElementById('actionPanel').classList.remove('show');
    setTimeout(() => showResult(lA), 800);
    return true;
  }
  return false;
}

// ── RESULT ────────────────────────────────────────────────
function showResult(leftWon) {
  let isWin;
  if (gameMode==='pve') isWin = leftWon;
  else if (gameMode==='pvp-online') isWin = (leftWon&&onlineSide==='left')||(!leftWon&&onlineSide==='right');
  else isWin = null;

  const icon = document.getElementById('resultIcon');
  const title = document.getElementById('resultTitle');
  const sub = document.getElementById('resultSub');
  const rewards = document.getElementById('resultRewards');

  if (isWin === null) {
    icon.textContent = leftWon ? '🟢' : '🔴';
    title.textContent = leftWon ? '左方获胜！' : '右方获胜！';
    sub.textContent = `历经 ${turnNum} 回合`;
    rewards.innerHTML = '';
  } else if (isWin) {
    icon.textContent = '🏆';
    title.textContent = '胜利！';
    const coins = 30 + turnNum*2;
    sub.textContent = `历经 ${turnNum} 回合`;
    rewards.innerHTML = `<div class="reward-line">🪙 +${coins} 龟币</div>`;
    addCoins(coins); saveRecord(true);
  } else {
    icon.textContent = '💔';
    title.textContent = '失败…';
    sub.textContent = `坚持了 ${turnNum} 回合`;
    rewards.innerHTML = `<div class="reward-line">🪙 +5 龟币</div>`;
    addCoins(5); saveRecord(false);
  }
  showScreen('screenResult');
}

function rematch() {
  if (gameMode==='pvp-online') showScreen('screenLobby');
  else startMode(gameMode);
}

// ── RECORD / COINS ────────────────────────────────────────
function saveRecord(won) {
  const rec = JSON.parse(localStorage.getItem('turtleBattleRecord')||'{"wins":0,"losses":0}');
  if (won) rec.wins++; else rec.losses++;
  localStorage.setItem('turtleBattleRecord', JSON.stringify(rec));
  updateRecordDisplay();
}
function updateRecordDisplay() {
  const rec = JSON.parse(localStorage.getItem('turtleBattleRecord')||'{"wins":0,"losses":0}');
  const total = rec.wins+rec.losses, rate = total ? Math.round(rec.wins/total*100) : 0;
  document.getElementById('recordStats').innerHTML =
    `<span class="rec-w">胜${rec.wins}</span> / <span class="rec-l">负${rec.losses}</span>  胜率${rate}%`;
}
function addCoins(n) {
  try {
    const ps = JSON.parse(localStorage.getItem('petState')||'{}');
    ps.coins = (ps.coins||0)+n;
    localStorage.setItem('petState', JSON.stringify(ps));
    document.getElementById('coinDisplay').textContent = '🪙 ' + ps.coins;
  } catch(e){}
}
function loadCoins() {
  try {
    const ps = JSON.parse(localStorage.getItem('petState')||'{}');
    document.getElementById('coinDisplay').textContent = '🪙 ' + (ps.coins||0);
  } catch(e){}
}

// ── HUNTER KILL PASSIVE ───────────────────────────────────
async function processHunterKill() {
  for (const f of allFighters) {
    if (!f.alive || !f.passive || f.passive.type !== 'hunterKill') continue;
    const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
    for (const e of enemies) {
      if (e.hp / e.maxHp < f.passive.hpThresh / 100) {
        // Execute!
        const eElId = getFighterElId(e);
        spawnFloatingNum(eElId, '猎杀!', 'crit-label', 0, -20);
        spawnFloatingNum(eElId, '-99999', 'pierce-dmg', 100, 0);
        e.hp = 0; e.alive = false;
        document.getElementById(eElId).classList.add('dead');
        updateHpBar(e, eElId);
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">🏹猎杀！</span>${e.emoji}${e.name} 被强化弩箭击杀！`,'death');

        // Steal 15% stats
        const sAtk = Math.round(e.baseAtk * f.passive.stealPct / 100);
        const sDef = Math.round(e.baseDef * f.passive.stealPct / 100);
        const sHp  = Math.round(e.maxHp   * f.passive.stealPct / 100);
        f.baseAtk += sAtk; f.baseDef += sDef; f.maxHp += sHp; f.hp += sHp;
        const fElId = getFighterElId(f);
        spawnFloatingNum(fElId, `+${sAtk}攻+${sDef}防+${sHp}HP`, 'passive-num', 300, 0);
        updateHpBar(f, fElId);
        updateFighterStats(f, fElId);
        addLog(`${f.emoji}${f.name} 吸收属性：<span class="log-passive">攻+${sAtk} 防+${sDef} HP+${sHp}</span>`);

        if (checkBattleEnd()) return;
        await sleep(600);
      }
    }
  }
}

// ── HELP PANEL ────────────────────────────────────────────
function toggleHelp() {
  const el = document.getElementById('helpPanel');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ── LOG / UTIL ────────────────────────────────────────────
function addLog(html, cls='') {
  const log = document.getElementById('battleLog');
  const e = document.createElement('div');
  e.className = 'log-entry ' + cls;
  e.innerHTML = html;
  log.appendChild(e);
  log.scrollTop = log.scrollHeight;
}
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2000);
}

// ── INIT ──────────────────────────────────────────────────
loadCoins();
updateRecordDisplay();
