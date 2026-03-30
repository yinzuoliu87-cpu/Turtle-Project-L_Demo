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
   DEF reduction formula: reduction% = DEF/(DEF+40), diminishing returns
   穿甲(armorPen): 计算减伤时无视目标X点防御                              */
const RARITY_MULT = { C:1.00, B:1.03, A:1.06, S:1.09, SS:1.12, SSS:1.15 };
const DEF_CONSTANT = 40; // DEF/(DEF+K) formula constant
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
    passive:{ type:'judgement', hpPct:9, desc:'每段攻击附带目标当前9%HP普通伤害' },
    skills:[
      { name:'裁决', type:'physical', hits:4, power:0, pierce:0,
        desc:'4次共1.2×ATK普通伤害，每段触发被动裁决', cd:0, atkScale:1.2 },
      { name:'祝福', type:'angelBless', hits:1, power:0, pierce:0,
        desc:'友方获得1.2×ATK护盾4回合 + 防御+0.12×ATK 4回合',
        cd:4, shieldScale:1.2, shieldTurns:4, defBoostScale:0.12, defBoostTurns:4 },
      { name:'平等', type:'angelEquality', hits:2, power:0, pierce:0,
        desc:'0.6×ATK普通+0.6×ATK穿透，S级以上必暴击并回复总伤10%HP',
        cd:5, normalScale:0.6, pierceScale:0.6,
        antiHighRarity:['S','SS'], forceCrit:true, healPctOfDmg:10 },
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
    passive:{ type:'ninjaInstinct', critBonus:30, critDmgBonus:20, armorPen:5, desc:'+30%暴击+20%爆伤+5穿甲' },
    skills:[
      { name:'飞镖',     type:'ninjaShuriken', hits:1, power:0, pierce:0, desc:'1.5×ATK普通伤害，暴击转穿透', cd:0, atkScale:1.5 },
      { name:'陷阱',     type:'ninjaTrap', hits:1, power:0, pierce:0, desc:'给友方上隐形夹子，被攻击时触发2×ATK伤害', cd:3, trapScale:2 },
      { name:'炸弹',     type:'ninjaBomb', hits:1, power:0, pierce:0, desc:'全体敌方0.8×ATK伤害+25%破甲3回合', cd:4, atkScale:0.8, armorBreak:{pct:25,turns:3} },
    ]},
  { id:'two_head',  name:'双头龟',   emoji:'🐢🐢',    rarity:'B',   hp:370,  atk:36,  def:16, spd:7, crit:0.06,
    img:'../../assets/pets/双头龟.png',
    passive:{ type:'twoHeadVitality', shieldPct:25, desc:'开局+50%血时各获25%最大HP永久护盾' },
    skills:[
      { name:'撕咬',   type:'physical', hits:2, power:0, pierce:0, desc:'2段共(0.8ATK+10%目标HP)', cd:0, atkScale:0.8, hpPct:10 },
      { name:'恐吓',   type:'twoHeadFear', hits:1, power:0, pierce:0, desc:'1×ATK伤害+恐惧3回合(对双头龟伤害-30%)', cd:3, atkScale:1.0, fearTurns:3, fearReduction:30 },
      { name:'窃取',   type:'twoHeadSteal', hits:1, power:0, pierce:0, desc:'窃取目标随机一个技能并立即释放', cd:4 },
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
    passive:{ type:'fortuneGold', desc:'每回合获得1~6金币，单位阵亡+8金币' },
    skills:[
      { name:'打击',     type:'physical', hits:3, power:0, pierce:0, desc:'3段共1.2×ATK普通伤害', cd:0, atkScale:1.2 },
      { name:'骰子',     type:'fortuneDice', hits:1, power:0, pierce:0, desc:'获得1~6金币+回复10%最大HP', cd:0, healPct:10 },
      { name:'梭哈',     type:'fortuneAllIn', hits:1, power:0, pierce:0, desc:'一场限一次！消耗全部金币，每枚造成(0.2ATK穿透+0.2ATK普通)', cd:999, perCoinAtkPierce:0.2, perCoinAtkNormal:0.2, oneTimeUse:true },
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
    passive:{ type:'gamblerMultiHit', chance:40, dmgScale:0.6, desc:'每段攻击40%触发额外0.6ATK打击(可连锁)' },
    skills:[
      { name:'卡牌射击', type:'gamblerCards', hits:3, power:0, pierce:0, desc:'3段(每段随机0.3~0.6ATK)普通伤害', cd:0, minScale:0.3, maxScale:0.6 },
      { name:'抽牌',     type:'gamblerDraw', hits:1, power:0, pierce:0, desc:'随机：回复/炸弹牌/强化自身', cd:2 },
      { name:'赌注',     type:'gamblerBet', hits:6, power:0, pierce:0, desc:'消耗50%HP强化攻击6段，多重打击概率+20%。需HP>50%', cd:4, hpCostPct:50, multiBonus:20 },
    ]},
  { id:'hunter',    name:'猎人龟',   emoji:'🏹🐢',    rarity:'A',   hp:320,  atk:42,  def:12, spd:14, crit:0.18,
    img:'../../assets/pets/猎人龟v1.png', sprite:{frames:15,frameW:500,frameH:500,duration:1500},
    passive:{ type:'hunterKill', hpThresh:10, stealPct:20, lifesteal:10, desc:'任意攻击后猎杀HP<10%敌人，获取20%属性+10%吸血' },
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
    passive:{ type:'lightningStorm', shockScale:1.0, stackMax:8, desc:'每回合电击随机敌人1×ATK穿透；造成伤害叠电击层，8层触发1×ATK穿透' },
    skills:[
      { name:'闪电打击', type:'lightningStrike', hits:5, power:0, pierce:0, desc:'5次共1.3×ATK普通伤害，每次对次目标造成25%溅射', cd:0, atkScale:1.3, splashPct:25 },
      { name:'威力增幅', type:'lightningBuff', hits:1, power:0, pierce:0, desc:'全体友方ATK+25%持续4回合', cd:4, atkUpPct:25, atkUpTurns:4 },
      { name:'雷暴',     type:'lightningBarrage', hits:20, power:0, pierce:0, desc:'20次每次0.15×ATK随机分布敌军', cd:5, arrowScale:0.15 },
    ]},
  // S级
  { id:'phoenix',   name:'凤凰龟',   emoji:'🔥🐢',    rarity:'S',   hp:340,  atk:42,  def:14, spd:13, crit:0.12,
    img:'../../assets/pets/凤凰龟.png',
    passive:{ type:'phoenixRebirth', revivePct:25, desc:'首次死亡时以25%HP复活' },
    skills:[
      { name:'灼烧',   type:'phoenixBurn',   hits:1, power:0, pierce:0, desc:'1×ATK伤害+灼烧5回合(0.3ATK+5%最大HP/回合)', cd:0, atkScale:1.0, burnTurns:5, burnAtkScale:0.3, burnHpPct:5 },
      { name:'熔岩盾', type:'phoenixShield', hits:1, power:0, pierce:0, desc:'获得1×ATK熔岩盾4回合，被攻击每段反击0.25×ATK', cd:4, shieldScale:1.0, duration:4, counterScale:0.25 },
      { name:'烫伤',   type:'phoenixScald',  hits:1, power:0, pierce:0, desc:'0.7×ATK伤害，攻防各-15%3回合，破坏50%护盾', cd:3, atkScale:0.7, atkDown:{pct:15,turns:3}, defDown:{pct:15,turns:3}, shieldBreak:50 },
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
    passive:{ type:'summonAlly', hpPct:40, maxRarity:'A',
              desc:'开局召唤一只A级以下龟(40%HP，属性/被动正常)，攻击后随从自动出招' },
    skills:[
      { name:'防御', type:'hidingDefend', hits:1, power:0, pierce:0,
        desc:'获得20%最大HP护盾4回合，到期回复剩余盾20%HP',
        cd:3, shieldHpPct:20, shieldDuration:4, shieldHealPct:20 },
      { name:'攻击', type:'physical', hits:1, power:0, pierce:0,
        desc:'1×ATK伤害+自身防御+20%2回合',
        cd:0, atkScale:1.0, selfDefUpPct:{pct:20,turns:2} },
      { name:'指挥', type:'hidingCommand', hits:1, power:0, pierce:0,
        desc:'命令随从立即放一个技能，回合结束随从再自动放一个（共2次）',
        cd:2 },
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
    armorPen: 0,  // 穿甲值，计算减伤时无视目标X点防御
    passive: b.passive || null,
    passiveUsedThisTurn: false,  // for once-per-turn passives like shieldOnHit
    alive:true,
    buffs: [],
    bubbleStore: 0,      // 泡泡龟被动储存值
    bubbleShieldVal: 0,  // 泡泡盾当前值(与普通护盾分开)
    bubbleShieldTurns: 0,// 泡泡盾剩余回合
    bubbleShieldOwner: null,
    _shockStacks: 0,
    _goldCoins: 0,
    _dmgDealt: 0,            // 伤害统计：总造成
    _dmgTaken: 0,            // 伤害统计：总承受
    _pierceDmgDealt: 0,      // 穿透伤害造成
    _normalDmgDealt: 0,      // 普通伤害造成
    _summon: null,            // 缩头乌龟随从
    _summonElId: null,        // 随从卡片DOM id
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
  try { sfxBattleStart(); } catch(e) {}
  // Apply one-time passives (like ninjaInstinct)
  allFighters.forEach(f => {
    if (f.passive && f.passive.type === 'ninjaInstinct') {
      f.crit += f.passive.critBonus / 100;
      f._extraCritDmgPerm = (f.passive.critDmgBonus || 0) / 100;
      f.armorPen += f.passive.armorPen || 0;
    }
    // Two-head vitality: opening shield
    if (f.passive && f.passive.type === 'twoHeadVitality') {
      const shieldAmt = Math.round(f.maxHp * f.passive.shieldPct / 100);
      f.shield += shieldAmt;
      f._twoHeadHalfTriggered = false;
    }
    // Summon ally: create a random C/B/A turtle as summon
    if (f.passive && f.passive.type === 'summonAlly') {
      const teamIds = allFighters.map(t => t.id);
      const maxR = f.passive.maxRarity || 'A';
      const validRarities = [];
      if (maxR === 'A') validRarities.push('C','B','A');
      else if (maxR === 'B') validRarities.push('C','B');
      else validRarities.push('C');
      const candidates = ALL_PETS.filter(p => validRarities.includes(p.rarity) && !teamIds.includes(p.id));
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const m = RARITY_MULT[pick.rarity] || 1;
        const sHp = Math.round(Math.round(pick.hp * m) * f.passive.hpPct / 100);
        const summon = {
          id:pick.id, name:pick.name, emoji:pick.emoji, rarity:pick.rarity, side:f.side,
          img:pick.img, sprite:pick.sprite || null,
          maxHp:sHp, hp:sHp, shield:0,
          baseAtk:Math.round(pick.atk * m), baseDef:Math.round(pick.def * m), baseSpd:Math.round(pick.spd * m),
          atk:Math.round(pick.atk * m), def:Math.round(pick.def * m), spd:Math.round(pick.spd * m),
          crit: pick.crit || 0.08,
          armorPen: 0,
          passive: pick.passive || null,  // summon passive enabled
          passiveUsedThisTurn: false,
          alive: true,
          buffs: [],
          bubbleStore:0, bubbleShieldVal:0, bubbleShieldTurns:0, bubbleShieldOwner:null,
          _shockStacks:0, _goldCoins:0,
          _dmgDealt:0, _dmgTaken:0, _pierceDmgDealt:0, _normalDmgDealt:0,
          _summon:null, _summonElId:null,
          _isSummon: true,       // mark as summon (not independent fighter)
          _owner: f,             // reference to owner
          skills: pick.skills.map(s => ({ ...s, cdLeft:0 })),
        };
        f._summon = summon;
        // Add summon to allFighters so passives/buffs process correctly
        allFighters.push(summon);
        // Apply one-time passives on summon
        if (summon.passive && summon.passive.type === 'ninjaInstinct') {
          summon.crit += summon.passive.critBonus / 100;
          summon._extraCritDmgPerm = (summon.passive.critDmgBonus || 0) / 100;
          summon.armorPen += summon.passive.armorPen || 0;
        }
        if (summon.passive && summon.passive.type === 'twoHeadVitality') {
          summon.shield += Math.round(summon.maxHp * summon.passive.shieldPct / 100);
          summon._twoHeadHalfTriggered = false;
        }
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">召唤了 ${summon.emoji}${summon.name} 作为随从！(${sHp}HP)</span>`);
      }
    }
  });
  renderFighters();
  updateDmgStats();
  beginTurn();
}

function renderFighters() {
  leftTeam.forEach((f,i)  => renderFighterCard(f,'leftFighter'+i));
  rightTeam.forEach((f,i) => renderFighterCard(f,'rightFighter'+i));
  // Render summon mini-cards
  allFighters.forEach(f => {
    if (f._summon) renderSummonMiniCard(f);
  });
}

function renderFighterCard(f, elId) {
  const card = document.getElementById(elId);
  if (!card) return;
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

function renderSummonMiniCard(owner) {
  const summon = owner._summon;
  if (!summon) return;
  const ownerElId = getFighterElId(owner);
  const ownerCard = document.getElementById(ownerElId);
  if (!ownerCard) return;

  // Create a unique ID for the summon card
  const summonElId = 'summon_' + ownerElId;
  summon._summonElId = summonElId;

  // Remove existing summon card if any
  const existing = document.getElementById(summonElId);
  if (existing) existing.remove();

  const mini = document.createElement('div');
  mini.id = summonElId;
  mini.className = 'summon-mini' + (summon.alive ? '' : ' dead');
  const avatarHTML = summon.img
    ? `<img src="${summon.img}" class="summon-avatar" alt="${summon.name}">`
    : `<span class="summon-emoji">${summon.emoji}</span>`;
  mini.innerHTML = `
    <div class="summon-header">
      ${avatarHTML}
      <span class="summon-name" style="color:${RARITY_COLORS[summon.rarity]}">${summon.name}</span>
      <span class="summon-tag">随从</span>
    </div>
    <div class="summon-hp-bar">
      <div class="summon-hp-fill"></div>
      <div class="summon-shield-fill"></div>
    </div>
    <div class="summon-hp-text"></div>
  `;
  ownerCard.appendChild(mini);
  updateSummonHpBar(summon);
}

function updateSummonHpBar(summon) {
  if (!summon || !summon._summonElId) return;
  const card = document.getElementById(summon._summonElId);
  if (!card) return;
  const fill = card.querySelector('.summon-hp-fill');
  const shieldFill = card.querySelector('.summon-shield-fill');
  const text = card.querySelector('.summon-hp-text');
  if (!fill) return;

  const totalEff = summon.hp + summon.shield;
  const barMax = Math.max(summon.maxHp, totalEff);
  const hpPct = summon.hp / barMax * 100;
  fill.style.width = hpPct + '%';
  fill.style.background = (summon.hp/summon.maxHp) > 0.5 ? '#06d6a0' : (summon.hp/summon.maxHp) > 0.25 ? '#ffd93d' : '#ff6b6b';

  if (shieldFill) {
    const sPct = summon.shield / barMax * 100;
    shieldFill.style.left = hpPct + '%';
    shieldFill.style.width = sPct + '%';
  }

  let hpStr = `HP ${Math.ceil(summon.hp)}/${summon.maxHp}`;
  if (summon.shield > 0) hpStr += ` 🛡${Math.ceil(summon.shield)}`;
  if (text) text.textContent = hpStr;

  card.classList.toggle('dead', !summon.alive);
}

const PASSIVE_ICONS = {
  turnScaleAtk:'⚔️', turnScaleHp:'💗', bonusDmgAbove60:'🎯',
  lowHpCrit:'💢', deathExplode:'💥', deathHook:'🪝', shieldOnHit:'🛡',
  healOnKill:'💚', counterAttack:'⚡', bubbleStore:'🫧', stoneWall:'🪨', hunterKill:'🏹', ninjaInstinct:'🥷', phoenixRebirth:'🔥', lightningStorm:'⚡', fortuneGold:'🪙', twoHeadVitality:'🐢', gamblerMultiHit:'🃏', summonAlly:'🫣', judgement:'⚖️'
};

function updateFighterStats(f, elId) {
  if (f._isSummon) return; // summon uses mini-card, no stats row
  const card = document.getElementById(elId);
  if (!card) return;
  const statsEl = card.querySelector('.fighter-stats');
  if (!statsEl) return;
  // Show current stats with debuff highlighting
  const atkClass = f.atk < f.baseAtk ? 'stat-down' : f.atk > f.baseAtk ? 'stat-up' : '';
  const defClass = f.def < f.baseDef ? 'stat-down' : f.def > f.baseDef ? 'stat-up' : '';
  const passiveIcon = f.passive ? `<span class="passive-icon" title="${f.passive.desc}">${PASSIVE_ICONS[f.passive.type]||'⭐'}</span>` : '';
  statsEl.innerHTML =
    `<span class="${atkClass}">⚔攻击${f.atk}</span>` +
    `<span class="${defClass}">🛡防御${f.def}(${Math.round(f.def/(f.def+DEF_CONSTANT)*100)}%减伤)</span>` +
    (f.armorPen > 0 ? `<span class="stat-up">🗡穿甲${f.armorPen}</span>` : '') +
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
  // Summon: use dedicated mini-card HP bar
  if (f._isSummon) { updateSummonHpBar(f); return; }
  const card = document.getElementById(elId);
  // Scale bar to fit HP + all shields
  const totalEff = f.hp + f.shield + (f.bubbleShieldVal || 0);
  const barMax = Math.max(f.maxHp, totalEff); // expand bar if shields overflow
  const hpPct = Math.max(0, f.hp / barMax * 100);
  const fill = card.querySelector('.hp-fill');
  fill.style.width = hpPct + '%';
  fill.style.background = (f.hp/f.maxHp) > 0.5 ? '#06d6a0' : (f.hp/f.maxHp) > 0.25 ? '#ffd93d' : '#ff6b6b';

  // Shield = white bar after HP
  const shieldPct = f.shield / barMax * 100;
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
  const bsPct = (f.bubbleShieldVal || 0) / barMax * 100;
  let bsEl = card.querySelector('.bubble-shield-fill');
  if (!bsEl) {
    bsEl = document.createElement('div');
    bsEl.className = 'bubble-shield-fill';
    card.querySelector('.hp-bar').appendChild(bsEl);
  }
  if (f.bubbleShieldVal > 0) {
    bsEl.style.display = 'block';
    bsEl.style.left = (hpPct + shieldPct) + '%';
    bsEl.style.width = bsPct + '%';
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

// Get all alive enemies including summons (for AOE)
function getAliveEnemiesWithSummons(side) {
  const team = side === 'left' ? rightTeam : leftTeam;
  const targets = team.filter(e => e.alive);
  // Add enemy summons
  team.forEach(e => {
    if (e._summon && e._summon.alive) targets.push(e._summon);
  });
  return targets;
}

function getFighterElId(f) {
  if (f._summonElId) return f._summonElId;
  if (f.side === 'left') return 'leftFighter' + leftTeam.indexOf(f);
  return 'rightFighter' + rightTeam.indexOf(f);
}

// ── TURN SYSTEM ───────────────────────────────────────────
async function beginTurn() {
  document.getElementById('turnBanner').textContent = `第 ${turnNum} 回合`;
  // Reduce cooldowns
  allFighters.forEach(f => {
    f.skills.forEach(s => { if (s.cdLeft > 0) s.cdLeft--; });
    // Also tick summon CDs
    if (f._summon && f._summon.alive) {
      f._summon.skills.forEach(s => { if (s.cdLeft > 0) s.cdLeft--; });
    }
  });
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
  try { sfxTurnStart(); } catch(e) {}
  nextBatch();
}

// ── BATCH TURN SYSTEM ─────────────────────────────────────
// 左A → 右CD → 左AB → 右CD → 左AB → ...
// batchPhase: 0=left×1(game start), then odd=right all, even=left all
let batchPhase = 0;
let batchesThisRound = 0;

async function nextBatch() {
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
    // After every 2 batches (both sides acted) → round ended
    if (batchesThisRound >= 2) {
      // End-of-round passives (lightning/fortune/hunter)
      await processFortuneGold();
      if (battleOver) return;
      await processLightningStorm();
      if (battleOver) return;
      turnNum++;
      batchesThisRound = 0;
      beginTurn();
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
    // Phoenix burn DoT (0.3×ATK + 5%maxHP per turn)
    const pBurns = f.buffs.filter(b => b.type === 'phoenixBurnDot');
    for (const pb of pBurns) {
      const burnDmg = pb.value + Math.round(f.maxHp * pb.hpPct / 100);
      f.hp = Math.max(0, f.hp - burnDmg);
      spawnFloatingNum(elId, `-${burnDmg}`, 'dot-dmg', 50, 0);
      updateHpBar(f, elId);
      addLog(`${f.emoji}${f.name} 受到 <span class="log-dot">${burnDmg}灼烧</span>（剩余${pb.turns-1}回合）`);
      hadTick = true;
      if (f.hp <= 0) { f.alive = false; break; }
    }
    if (!f.alive) {
      checkDeaths(null);
      if (checkBattleEnd()) return;
      continue;
    }
    // Lava shield tick
    if (f._lavaShieldTurns > 0) {
      f._lavaShieldTurns--;
      if (f._lavaShieldTurns <= 0) {
        f._lavaShieldVal = 0;
        f._lavaShieldCounter = 0;
        addLog(`${f.emoji}${f.name} 的熔岩盾消散了`);
      }
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
    // HidingShield expiry: heal 20% of remaining shield before removing
    const hidingShields = f.buffs.filter(b => b.type === 'hidingShield' && b.turns <= 1);
    for (const hs of hidingShields) {
      const remaining = Math.min(f.shield, hs.shieldVal);
      if (remaining > 0) {
        const heal = Math.round(remaining * hs.healPct / 100);
        const before = f.hp;
        f.hp = Math.min(f.maxHp, f.hp + heal);
        f.shield = Math.max(0, f.shield - remaining); // remove expired shield
        const actual = Math.round(f.hp - before);
        if (actual > 0) {
          spawnFloatingNum(elId, `+${actual}`, 'heal-num', 0, 0);
          addLog(`${f.emoji}${f.name} 缩头护盾到期：<span class="log-heal">剩余盾${remaining}→回复${actual}HP</span>`);
          hadTick = true;
        }
        updateHpBar(f, elId);
      } else {
        addLog(`${f.emoji}${f.name} 缩头护盾到期（护盾已被消耗）`);
      }
    }
    // Tick down all buffs, remove expired
    f.buffs.forEach(b => b.turns--);
    f.buffs = f.buffs.filter(b => b.turns > 0);
    renderStatusIcons(f);
  }
  if (hadTick) await sleep(800);
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
      if (b.type === 'atkUp')   f.atk += b.value;
    }
  });
}

function renderStatusIcons(f) {
  const elId = getFighterElId(f);
  const card = document.getElementById(elId);
  if (!card) return;
  const box = card.querySelector('.status-icons');
  if (!box) return;
  // Only debuff icons — passive is now shown in stats row
  box.innerHTML = f.buffs.map(b => {
    if (b.type === 'dot')     return `<span class="status-dot" title="持续伤害${b.value}/回合 剩${b.turns}回合">🔥${b.turns}</span>`;
    if (b.type === 'phoenixBurnDot') return `<span class="status-dot" title="灼烧(${b.value}+${b.hpPct}%HP)/回合 剩${b.turns}回合">🔥${b.turns}</span>`;
    if (b.type === 'atkDown') return `<span class="status-atkdown" title="攻击-${b.value}% 剩${b.turns}回合">⬇攻${b.turns}</span>`;
    if (b.type === 'defDown') return `<span class="status-defdown" title="防御-${b.value}% 剩${b.turns}回合">⬇防${b.turns}</span>`;
    if (b.type === 'hot')     return `<span class="status-hot" title="回复${b.value}/回合 剩${b.turns}回合">💚${b.turns}</span>`;
    if (b.type === 'defUp')   return `<span class="status-defup" title="防御+${b.value} 剩${b.turns}回合">⬆防${b.turns}</span>`;
    if (b.type === 'atkUp')   return `<span class="status-defup" title="攻击+${b.value} 剩${b.turns}回合">⬆攻${b.turns}</span>`;
    if (b.type === 'bubbleBind') return `<span class="status-bubble" title="被束缚：攻击者获得${b.value}%伤害护盾 剩${b.turns}回合">🫧${b.turns}</span>`;
    if (b.type === 'dodge') return `<span class="status-dodge" title="闪避${b.value}% 剩${b.turns}回合">💨${b.turns}</span>`;
    if (b.type === 'fear')  return `<span class="status-atkdown" title="恐惧：对双头龟伤害-${b.value}% 剩${b.turns}回合">😱${b.turns}</span>`;
    if (b.type === 'gamblerPierceConvert') return `<span class="status-defup" title="${b.value}%伤害转穿透 剩${b.turns}回合">🗡${b.turns}</span>`;
    if (b.type === 'hidingShield') return `<span class="status-defup" title="缩头护盾 剩${b.turns}回合，到期回复剩余盾${b.healPct}%HP">🛡${b.turns}</span>`;
    return '';
  }).join('');
  // Gold coins indicator
  if (f._goldCoins > 0) {
    box.innerHTML += `<span class="status-defup" title="金币${f._goldCoins}" style="color:#ffd93d;background:rgba(255,217,61,.15)">🪙${f._goldCoins}</span>`;
  }
  // Shock stacks indicator
  if (f._shockStacks > 0) {
    box.innerHTML += `<span class="status-dot" title="电击层${f._shockStacks}/8" style="color:#ffd700;background:rgba(255,215,0,.15)">⚡${f._shockStacks}</span>`;
  }
  // Lava shield indicator
  if (f._lavaShieldTurns > 0) {
    box.innerHTML += `<span class="status-dot" title="熔岩盾 剩${f._lavaShieldTurns}回合 被攻击每段反击">🌋${f._lavaShieldTurns}</span>`;
  }
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
  const activeEl = document.getElementById(getFighterElId(f));
  if (activeEl) activeEl.classList.add('active-turn');

  const isPlayer =
    (gameMode === 'pve' && f.side === 'left') ||
    (gameMode === 'pvp-online' && f.side === onlineSide);

  if (isPlayer) {
    renderActionButtons(f);
    panel.classList.add('show');
  } else if (gameMode === 'pve') {
    panel.classList.remove('show');
    setTimeout(() => aiAction(f), 1200);
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
      // Build damage formula display for all attack types
      const parts = [];
      if (s.atkScale)   parts.push(`${s.atkScale}×ATK`);
      if (s.defScale)   parts.push(`${s.defScale}×DEF`);
      if (s.dmgScale)   parts.push(`${s.dmgScale}×ATK`);
      if (s.arrowScale) parts.push(`${s.arrowScale}×ATK/段`);
      if (s.hpPct)      parts.push(`${s.hpPct}%HP`);
      if (s.power > 0)  parts.push(`${s.power}`);
      if (s.perCoinAtkPierce) parts.push(`每币${s.perCoinAtkPierce}×ATK穿+${s.perCoinAtkNormal}×ATK`);
      if (parts.length) {
        infoText = `造成 ${parts.join('+')} 伤害`;
      } else if (s.shieldScale) {
        infoText = `${s.shieldScale}×ATK 护盾`;
      } else if (s.trapScale) {
        infoText = `夹子 ${s.trapScale}×ATK`;
      } else if (s.atkUpPct) {
        infoText = `全体ATK+${s.atkUpPct}%`;
      } else {
        infoText = s.desc || '特殊';
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
    // Always show detail for custom skill types and any skill with special effects
    const customTypes = ['bubbleShield','bubbleBind','hunterShot','hunterBarrage','hunterStealth','ninjaShuriken','ninjaTrap','ninjaBomb','phoenixBurn','phoenixShield','phoenixScald','lightningStrike','lightningBuff','lightningBarrage','fortuneDice','fortuneAllIn'];
    const hasDetail = s.pierce || s.dot || s.atkDown || s.defDown || s.aoe || s.hot || s.defUp || s.defUpPct || s.atkScale || s.defScale || s.hpPct || s.armorBreak || s.shieldBreak || s.oneTimeUse || customTypes.includes(s.type);
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

  // ── Type label ──
  const typeMap = {
    physical:'⚔️ 物理', magic:'✨ 魔法', heal:'💚 治疗', shield:'🛡 护盾',
    bubbleShield:'🫧 泡泡盾', bubbleBind:'🫧 泡泡束缚',
    hunterShot:'🏹 猎人射击', hunterBarrage:'🏹 箭雨', hunterStealth:'🏹 隐蔽',
    ninjaShuriken:'🥷 飞镖', ninjaTrap:'🥷 陷阱', ninjaBomb:'🥷 炸弹',
    phoenixBurn:'🔥 灼烧', phoenixShield:'🔥 熔岩盾', phoenixScald:'🔥 烫伤',
    lightningStrike:'⚡ 闪电打击', lightningBuff:'⚡ 增幅', lightningBarrage:'⚡ 雷暴',
    fortuneDice:'🪙 骰子', fortuneAllIn:'🪙 梭哈',
    hidingDefend:'🛡 缩头防御', hidingCommand:'🫣 指挥',
    angelBless:'😇 祝福', angelEquality:'⚖️ 平等',
  };
  lines.push(`<b>类型</b> ${typeMap[s.type] || s.type}`);

  // ── Damage formula ──
  const dmgParts = [];
  if (s.power > 0) dmgParts.push(`${s.power}`);
  if (s.atkScale)  dmgParts.push(`${s.atkScale}×ATK`);
  if (s.defScale)  dmgParts.push(`${s.defScale}×DEF`);
  if (s.hpPct)     dmgParts.push(`${s.hpPct}%目标HP`);
  if (dmgParts.length) {
    const hitsStr = s.hits > 1 ? `，${s.hits}段均分` : '';
    lines.push(`<b>伤害</b> ${dmgParts.join(' + ')}${hitsStr}`);
  }
  if (s.pierce > 0) lines.push(`<b>穿透</b> <span class="detail-pierce">${s.pierce}</span> (无视防御，打护盾)`);

  // ── Target / Range ──
  if (s.aoe)     lines.push(`<b>范围</b> 🎯 全体敌方`);
  if (s.aoeAlly) lines.push(`<b>范围</b> 🎯 全体友方`);

  // ── Cooldown ──
  if (s.cd > 0 && s.cd < 100) lines.push(`<b>冷却</b> ${s.cd}回合`);
  if (s.oneTimeUse) lines.push(`<b>⚠限制</b> <span class="detail-debuff">一场限一次</span>`);

  // ── Heal / Shield ──
  if (s.heal > 0)    lines.push(`<b>回复</b> ${s.heal} HP`);
  if (s.healPct)     lines.push(`<b>回复</b> ${s.healPct}%最大HP`);
  if (s.shield > 0)  lines.push(`<b>护盾</b> +${s.shield}`);
  if (s.shieldFlat || s.shieldHpPct) {
    const p = [];
    if (s.shieldFlat)  p.push(`${s.shieldFlat}`);
    if (s.shieldHpPct) p.push(`${s.shieldHpPct}%施法者HP`);
    lines.push(`<b>护盾</b> ${p.join(' + ')}`);
  }

  // ── Debuffs ──
  if (s.dot)     lines.push(`<b>🔥持续伤害</b> <span class="detail-dot">${s.dot.dmg}/回合</span> ${s.dot.turns}回合`);
  if (s.atkDown) lines.push(`<b>⬇攻击削减</b> <span class="detail-debuff">-${s.atkDown.pct}%</span> ${s.atkDown.turns}回合`);
  if (s.defDown) lines.push(`<b>⬇防御削减</b> <span class="detail-debuff">-${s.defDown.pct}%</span> ${s.defDown.turns}回合`);
  if (s.armorBreak) lines.push(`<b>🔨破甲</b> <span class="detail-debuff">-${s.armorBreak.pct}%防御</span> ${s.armorBreak.turns}回合`);
  if (s.shieldBreak) lines.push(`<b>💥破盾</b> 破坏目标 <span class="detail-debuff">${s.shieldBreak}%</span> 护盾值`);

  // ── Buffs ──
  if (s.hot)      lines.push(`<b>💚持续回复</b> <span class="log-heal">${s.hot.hpPerTurn}/回合</span> ${s.hot.turns}回合（可叠加）`);
  if (s.defUp)    lines.push(`<b>⬆防御</b> <span class="log-passive">+${s.defUp.val}</span> ${s.defUp.turns}回合`);
  if (s.defUpPct) lines.push(`<b>⬆防御</b> <span class="log-passive">+${s.defUpPct.pct}%</span> ${s.defUpPct.turns}回合`);
  if (s.selfDefUpPct) lines.push(`<b>⬆自身防御</b> <span class="log-passive">+${s.selfDefUpPct.pct}%</span> ${s.selfDefUpPct.turns}回合`);
  if (s.atkUpPct) lines.push(`<b>⬆攻击</b> <span class="log-passive">+${s.atkUpPct}%</span> 全体友方 ${s.atkUpTurns}回合`);

  // ── Random ──
  if (s.random) lines.push(`<b>🎲随机</b> 伤害×0.5~1.5倍率`);

  // ── Special mechanics ──
  // Bubble
  if (s.type === 'bubbleShield') {
    lines.push(`<b>🫧泡泡盾</b> ${s.atkScale}×ATK 持续${s.duration}回合`);
    lines.push(`<b>💥自然破碎</b> 到期未打破→敌全体${s.burstScale}×ATK伤害`);
  }
  if (s.type === 'bubbleBind') {
    lines.push(`<b>🫧束缚</b> 标记${s.duration}回合`);
    lines.push(`<b>效果</b> 攻击被标记目标→获得伤害×${s.bindPct}%永久护盾`);
  }
  // Hunter
  if (s.type === 'hunterShot') {
    lines.push(`<b>猎人本能</b> 目标HP<${s.execThresh}%时：<span class="log-crit">+${s.execCrit}%暴击 +${s.execCritDmg}%爆伤</span>`);
  }
  if (s.type === 'hunterBarrage') {
    lines.push(`<b>分布</b> ${s.hits}根箭随机射向敌方`);
    lines.push(`<b>每根</b> <span class="detail-pierce">${s.arrowScale}×ATK穿透</span>`);
  }
  if (s.type === 'hunterStealth') {
    lines.push(`<b>伤害</b> ${s.dmgScale}×ATK普通伤害`);
    lines.push(`<b>💨闪避</b> +${s.dodgePct}% ${s.dodgeTurns}回合`);
    lines.push(`<b>🛡护盾</b> +${s.shieldScale}×ATK`);
  }
  // Ninja
  if (s.type === 'ninjaShuriken') {
    lines.push(`<b>🥷暴击转穿</b> 暴击时全部伤害转为穿透（无视防御）`);
  }
  if (s.type === 'ninjaTrap') {
    lines.push(`<b>🪤夹子</b> 隐形布置在友方身上`);
    lines.push(`<b>触发</b> 被攻击时弹出，造成${s.trapScale}×ATK普通伤害`);
    lines.push(`<b>隐蔽</b> 对手看不到谁身上有夹子`);
  }
  if (s.type === 'ninjaBomb') {
    lines.push(`<b>🔨破甲</b> <span class="detail-debuff">${s.armorBreak.pct}%防御削减</span> ${s.armorBreak.turns}回合`);
  }
  // Phoenix
  if (s.type === 'phoenixBurn') {
    lines.push(`<b>🔥灼烧</b> ${s.burnTurns}回合，每回合${s.burnAtkScale}×ATK + ${s.burnHpPct}%目标HP`);
    lines.push(`<b>不叠加</b> 同一凤凰龟的灼烧只刷新持续时间`);
  }
  if (s.type === 'phoenixShield') {
    lines.push(`<b>🌋熔岩盾</b> ${s.shieldScale}×ATK护盾 ${s.duration}回合`);
    lines.push(`<b>🔥反击</b> 被攻击每段反击${s.counterScale}×ATK伤害`);
  }
  if (s.type === 'phoenixScald') {
    lines.push(`<b>💥破盾</b> 先破坏${s.shieldBreak}%护盾，再造成伤害`);
  }
  // Lightning
  if (s.type === 'lightningStrike') {
    lines.push(`<b>⚡溅射</b> 每段对次目标造成${s.splashPct}%伤害`);
    lines.push(`<b>⚡电击层</b> 每段叠1层（主+次目标各叠）`);
  }
  if (s.type === 'lightningBuff') {
    lines.push(`<b>⬆全体增幅</b> 全体友方ATK+${s.atkUpPct}% ${s.atkUpTurns}回合`);
  }
  if (s.type === 'lightningBarrage') {
    lines.push(`<b>⚡分布</b> ${s.hits}次随机命中敌方，每次${s.arrowScale}×ATK`);
    lines.push(`<b>⚡电击层</b> 每次命中叠1层`);
  }
  // Fortune
  if (s.type === 'fortuneDice') {
    lines.push(`<b>🎲骰子</b> 获得1~6枚金币`);
    lines.push(`<b>💚回复</b> ${s.healPct}%最大HP`);
  }
  if (s.type === 'fortuneAllIn') {
    lines.push(`<b>🪙梭哈</b> 消耗全部金币，每枚1段伤害`);
    lines.push(`<b>每段</b> ${s.perCoinAtkPierce}×ATK<span class="detail-pierce">穿透</span> + ${s.perCoinAtkNormal}×ATK普通`);
    lines.push(`<b>⚠限制</b> <span class="detail-debuff">一场只能使用一次</span>`);
  }

  // Hiding turtle
  if (s.type === 'hidingDefend') {
    lines.push(`<b>🛡护盾</b> ${s.shieldHpPct}%最大HP 持续${s.shieldDuration}回合`);
    lines.push(`<b>💚到期回复</b> 剩余护盾值×${s.shieldHealPct}% 转为HP`);
  }
  if (s.type === 'hidingCommand') {
    lines.push(`<b>🫣指挥</b> 命令随从立即释放一个随机可用技能`);
    lines.push(`<b>⚠注意</b> 随从阵亡则无效`);
  }

  // Angel turtle
  if (s.type === 'angelBless') {
    lines.push(`<b>🛡护盾</b> ${s.shieldScale}×ATK 持续${s.shieldTurns}回合`);
    lines.push(`<b>⬆防御</b> +${s.defBoostScale}×ATK ${s.defBoostTurns}回合`);
  }
  if (s.type === 'angelEquality') {
    lines.push(`<b>⚔️第一段</b> ${s.normalScale}×ATK 普通伤害`);
    lines.push(`<b>💜第二段</b> <span class="detail-pierce">${s.pierceScale}×ATK 穿透伤害</span>`);
    lines.push(`<b>⚖️克制</b> 对S/SS级目标：<span class="log-crit">必定暴击</span> + 回复总伤${s.healPctOfDmg}%HP`);
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
  try { sfxClick(); } catch(e) {}
  const f = turnQueue[currentIdx];
  const skill = f.skills[idx];
  pendingSkillIdx = idx;
  const isAlly = skill.type === 'heal' || skill.type === 'shield' || skill.type === 'bubbleShield' || skill.type === 'ninjaTrap' || skill.type === 'angelBless';

  // Self-cast: no target selection
  if (skill.type === 'fortuneDice' || skill.type === 'phoenixShield' || skill.type === 'gamblerDraw' || skill.type === 'hidingDefend' || skill.type === 'hidingCommand') {
    executePlayerAction(f, skill, f);
    return;
  }
  // AOE / auto-target: no target selection needed
  if (skill.aoe || skill.aoeAlly || skill.type === 'hunterBarrage' || skill.type === 'ninjaBomb' || skill.type === 'lightningBuff' || skill.type === 'lightningBarrage') {
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
    // AOE: hit all alive enemies (including summons)
    const enemies = getAliveEnemiesWithSummons(f.side);
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
  } else if (skill.type === 'gamblerCards') {
    const target = allFighters[action.targetId];
    await doGamblerCards(f, target, skill);
  } else if (skill.type === 'gamblerDraw') {
    await doGamblerDraw(f, skill);
  } else if (skill.type === 'gamblerBet') {
    const target = allFighters[action.targetId];
    await doGamblerBet(f, target, skill);
  } else if (skill.type === 'hidingDefend') {
    await doHidingDefend(f, skill);
  } else if (skill.type === 'hidingCommand') {
    await doHidingCommand(f, skill);
  } else if (skill.type === 'angelBless') {
    const target = allFighters[action.targetId];
    await doAngelBless(f, target, skill);
  } else if (skill.type === 'angelEquality') {
    const target = allFighters[action.targetId];
    await doAngelEquality(f, target, skill);
  } else if (skill.type === 'twoHeadFear') {
    const target = allFighters[action.targetId];
    await doTwoHeadFear(f, target, skill);
  } else if (skill.type === 'twoHeadSteal') {
    const target = allFighters[action.targetId];
    await doTwoHeadSteal(f, target, skill);
  } else if (skill.type === 'fortuneDice') {
    await doFortuneDice(f, skill);
  } else if (skill.type === 'fortuneAllIn') {
    const target = allFighters[action.targetId];
    await doFortuneAllIn(f, target, skill);
  } else if (skill.type === 'lightningStrike') {
    const target = allFighters[action.targetId];
    await doLightningStrike(f, target, skill);
  } else if (skill.type === 'lightningBuff') {
    await doLightningBuff(f, skill);
  } else if (skill.type === 'lightningBarrage') {
    await doLightningBarrage(f, skill);
  } else if (skill.type === 'phoenixBurn') {
    const target = allFighters[action.targetId];
    await doPhoenixBurn(f, target, skill);
  } else if (skill.type === 'phoenixShield') {
    await doPhoenixShield(f, skill);
  } else if (skill.type === 'phoenixScald') {
    const target = allFighters[action.targetId];
    await doPhoenixScald(f, target, skill);
  } else if (skill.type === 'ninjaShuriken') {
    const target = allFighters[action.targetId];
    await doNinjaShuriken(f, target, skill);
  } else if (skill.type === 'ninjaTrap') {
    const target = allFighters[action.targetId];
    await doNinjaTrap(f, target, skill);
  } else if (skill.type === 'ninjaBomb') {
    await doNinjaBomb(f, skill);
  } else {
    const target = allFighters[action.targetId];
    await doDamage(f, target, skill);
  }

  atkEl.classList.remove('attack-anim');

  updateDmgStats();

  checkDeaths(f);
  if (checkBattleEnd()) { animating=false; return; }

  // Hunter passive: check after every action
  await processHunterKill();
  if (checkBattleEnd()) { animating=false; return; }

  // Summon auto-follow-up: after owner attacks (not hidingCommand), summon auto-attacks
  if (f.passive && f.passive.type === 'summonAlly' && f._summon && f._summon.alive && skill.type !== 'hidingCommand') {
    addLog(`${f._summon.emoji}${f._summon.name}(随从) 跟随出招！`);
    await sleep(400);
    await summonUseRandomSkill(f._summon, f);
    if (checkBattleEnd()) { animating=false; return; }
  }

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
      spawnFloatingNum(tElId, '闪避!', 'dodge-num', 0, yOff);
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
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
    if (isCrit) totalCrits++;

    // DEF reduction: DEF/(DEF+40), attacker's armorPen reduces effective DEF
    const effectiveDef = Math.max(0, target.def - (attacker.armorPen || 0));
    const defReduction = effectiveDef / (effectiveDef + DEF_CONSTANT);

    // Normal damage = basePower (minus pierce portion) × crit, reduced by DEF
    const normalBase = Math.max(0, basePower - (skill.pierce || 0));
    let normalDmg = Math.max(1, Math.round(normalBase * critMult * (1 - defReduction)));
    // Passive: bonusDmgAbove60
    if (attacker.passive && attacker.passive.type === 'bonusDmgAbove60' && target.hp / target.maxHp > 0.6) {
      normalDmg = Math.round(normalDmg * (1 + attacker.passive.pct / 100));
    }
    // Fear: attacker with fear debuff deals less normal damage to the source
    const fearBuff = attacker.buffs.find(b => b.type === 'fear' && allFighters[b.sourceId] === target);
    if (fearBuff) {
      normalDmg = Math.round(normalDmg * (1 - fearBuff.value / 100));
    }
    // Gambler pierce convert: X% of normal damage becomes pierce
    const pcBuff = attacker.buffs.find(b => b.type === 'gamblerPierceConvert');
    let convertedPierce = 0;
    if (pcBuff) {
      convertedPierce = Math.round(normalDmg * pcBuff.value / 100);
      normalDmg -= convertedPierce;
    }
    const normalPart = normalDmg;
    // Pierce damage: ignores DEF entirely, but hits shield
    const piercePart = Math.round((skill.pierce || 0) * critMult) + convertedPierce;
    const totalHit = normalPart + piercePart;

    // Damage absorption: bubbleShield → shield → HP
    // Track normal vs pierce separately: suppress applyRawDmg auto-tracking, do it manually
    const { hpLoss, shieldAbs } = applyRawDmg(null, target, totalHit); // null source = skip auto tracking
    attacker._normalDmgDealt += normalPart;
    attacker._pierceDmgDealt += piercePart;
    attacker._dmgDealt += totalHit;
    // target._dmgTaken already tracked by applyRawDmg via target check
    updateDmgStats();

    totalDirect += normalPart;
    totalPierce += piercePart;
    totalShieldDmg += shieldAbs;

    // Floating numbers — immediate (delay=0), since loop timing is controlled by sleep
    const yOff = (i % 4) * 24;
    if (isCrit) spawnFloatingNum(tElId, '暴击!', 'crit-label', 0, yOff - 18);
    if (shieldAbs > 0) spawnFloatingNum(tElId, `-${shieldAbs}`, 'shield-dmg', 0, yOff);
    if (hpLoss > 0 && piercePart > 0) {
      const normalHp = Math.min(normalPart, hpLoss);
      const pierceHp = hpLoss - normalHp;
      if (normalHp > 0) spawnFloatingNum(tElId, `-${normalHp}`, isCrit ? 'crit-dmg' : 'direct-dmg', 80, yOff);
      if (pierceHp > 0) spawnFloatingNum(tElId, `-${pierceHp}`, 'pierce-dmg', 200, yOff);
    } else if (hpLoss > 0) {
      spawnFloatingNum(tElId, `-${hpLoss}`, isCrit ? 'crit-dmg' : 'direct-dmg', 80, yOff);
    }
    if (piercePart > 0 && shieldAbs >= totalHit) {
      spawnFloatingNum(tElId, `穿${piercePart}`, 'pierce-dmg', 200, yOff);
    }

    // All on-hit effects (trap, reflect, bubble, lightning, etc.)
    await triggerOnHitEffects(attacker, target, totalHit);

    // Passive: judgement — extra damage based on target's current HP
    if (attacker.passive && attacker.passive.type === 'judgement' && target.alive) {
      const judgePct = attacker.passive.hpPct / 100;
      const judgeRaw = Math.round(target.hp * judgePct);
      // Apply as normal damage (reduced by DEF)
      const judgeReduced = Math.max(1, Math.round(judgeRaw * (1 - defReduction) * critMult));
      const judgeResult = applyRawDmg(attacker, target, judgeReduced, false);
      totalDirect += judgeReduced;
      // Track for angelEquality heal
      if (skill._judgeTotal !== undefined) skill._judgeTotal += judgeReduced;
      spawnFloatingNum(tElId, `⚖${judgeReduced}`, 'passive-num', 400, yOff);
      updateHpBar(target, tElId);
      await sleep(200);
    }

    // Shake
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(700);
    tEl.classList.remove('hit-shake');
    await sleep(200);

    // Passive: gamblerMultiHit
    await tryGamblerMultiHit(attacker, target, tElId);
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

  // Lifesteal is now handled in triggerOnHitEffects per hit

  // Self buff: selfDefUpPct (used by 缩头乌龟 attack skill)
  if (skill.selfDefUpPct && attacker.alive) {
    const defGain = Math.round(attacker.baseDef * skill.selfDefUpPct.pct / 100);
    attacker.buffs.push({ type:'defUp', value:defGain, turns:skill.selfDefUpPct.turns });
    recalcStats();
    const aElId = getFighterElId(attacker);
    spawnFloatingNum(aElId, `+${defGain}防`, 'passive-num', 300, 0);
    renderStatusIcons(attacker);
    addLog(`${attacker.emoji}${attacker.name} 自身 <span class="log-passive">防御+${defGain}(${skill.selfDefUpPct.pct}%)</span> ${skill.selfDefUpPct.turns}回合`);
  }
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
  await sleep(1000);
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
  await sleep(1000);
}

// ── ON-HIT EFFECTS (shared helper for all damage sources) ──
async function triggerOnHitEffects(attacker, target, dmg) {
  if (!target.alive || !attacker.alive || dmg <= 0) return;
  const tElId = getFighterElId(target);
  // TwoHead vitality — shield at 50%
  if (target.passive && target.passive.type === 'twoHeadVitality' && !target._twoHeadHalfTriggered && target.hp / target.maxHp < 0.5) {
    target._twoHeadHalfTriggered = true;
    const s = Math.round(target.maxHp * target.passive.shieldPct / 100);
    target.shield += s;
    spawnFloatingNum(tElId, `+${s}🛡`, 'shield-num', 100, 0);
    updateHpBar(target, tElId);
  }
  // ShieldOnHit
  if (target.passive && target.passive.type === 'shieldOnHit' && !target.passiveUsedThisTurn) {
    target.shield += target.passive.amount;
    target.passiveUsedThisTurn = true;
    spawnFloatingNum(tElId, `+${target.passive.amount}🛡`, 'passive-num', 150, 0);
  }
  // BubbleStore
  if (target.passive && target.passive.type === 'bubbleStore') {
    const stored = Math.round(dmg * target.passive.pct / 100);
    target.bubbleStore += stored;
    spawnFloatingNum(tElId, `+${stored}🫧`, 'bubble-num', 200, 0);
  }
  // BubbleBind — attacker gains shield
  const bindBuff = target.buffs.find(b => b.type === 'bubbleBind');
  if (bindBuff && attacker.alive) {
    const gained = Math.round(dmg * bindBuff.value / 100);
    attacker.shield += gained;
    spawnFloatingNum(getFighterElId(attacker), `+${gained}🛡`, 'bubble-num', 200, 0);
    updateHpBar(attacker, getFighterElId(attacker));
  }
  // Trap
  const trapB = target.buffs.find(b => b.type === 'trap');
  if (trapB && attacker.alive) {
    const tDef = Math.max(0, attacker.def);
    const tRed = tDef / (tDef + DEF_CONSTANT);
    const tDmg = Math.max(1, Math.round(trapB.value * (1 - tRed)));
    attacker.hp = Math.max(0, attacker.hp - tDmg);
    const aElId = getFighterElId(attacker);
    spawnFloatingNum(aElId, `-${tDmg}`, 'counter-dmg', 0, 0);
    spawnFloatingNum(aElId, '夹子!', 'crit-label', 0, -20);
    updateHpBar(attacker, aElId);
    try { sfxTrap(); } catch(e) {}
    if (attacker.hp <= 0) attacker.alive = false;
    target.buffs = target.buffs.filter(b => b !== trapB);
  }
  // StoneWall reflect
  if (target.passive && target.passive.type === 'stoneWall' && attacker.alive) {
    const reflectPct = target.passive.reflectBase + target.passive.reflectPerDef * target.def;
    const reflectDmg = Math.round(dmg * reflectPct / 100);
    if (reflectDmg > 0) {
      applyRawDmg(null, attacker, reflectDmg);
      spawnFloatingNum(getFighterElId(attacker), `-${reflectDmg}`, 'counter-dmg', 250, 0);
      updateHpBar(attacker, getFighterElId(attacker));
      if (attacker.hp <= 0) attacker.alive = false;
    }
  }
  // Lava shield counter
  if (target._lavaShieldTurns > 0 && target._lavaShieldCounter > 0 && attacker.alive) {
    const cDmg = Math.round(target.atk * target._lavaShieldCounter);
    attacker.hp = Math.max(0, attacker.hp - cDmg);
    spawnFloatingNum(getFighterElId(attacker), `-${cDmg}🌋`, 'counter-dmg', 300, 0);
    updateHpBar(attacker, getFighterElId(attacker));
    if (attacker.hp <= 0) attacker.alive = false;
  }
  // Lightning shock stacks
  if (attacker.passive && attacker.passive.type === 'lightningStorm' && target.alive) {
    target._shockStacks = (target._shockStacks || 0) + 1;
    if (target._shockStacks >= attacker.passive.stackMax) {
      const sDmg = Math.round(attacker.atk * attacker.passive.shockScale);
      applyRawDmg(attacker, target, sDmg);
      target._shockStacks = 0;
      spawnFloatingNum(tElId, `⚡${sDmg}`, 'pierce-dmg', 300, 0);
    }
  }
  // Lifesteal
  if (attacker._lifestealPct && attacker.alive && dmg > 0) {
    const healAmt = Math.round(dmg * attacker._lifestealPct / 100);
    const before = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmt);
    const actual = Math.round(attacker.hp - before);
    if (actual > 0) {
      spawnFloatingNum(getFighterElId(attacker), `+${actual}吸血`, 'heal-num', 300, 0);
      updateHpBar(attacker, getFighterElId(attacker));
    }
  }
}

// ── GAMBLER MULTI-HIT (shared helper) ─────────────────────
async function tryGamblerMultiHit(attacker, target, tElId) {
  if (!target.alive || !attacker.alive || !attacker.passive || attacker.passive.type !== 'gamblerMultiHit') return;
  let multiChance = attacker.passive.chance + (attacker._multiBonus || 0);
  while (target.alive && attacker.alive && Math.random() * 100 < multiChance) {
    const extraDmg = Math.round(attacker.atk * attacker.passive.dmgScale);
    const eDef = Math.max(0, target.def - (attacker.armorPen || 0));
    const eRed = eDef / (eDef + DEF_CONSTANT);
    const eFinal = Math.max(1, Math.round(extraDmg * (1 - eRed)));
    applyRawDmg(attacker, target, eFinal);
    if (!tElId) tElId = getFighterElId(target);
    spawnFloatingNum(tElId, `-${eFinal}🃏`, 'crit-dmg', 0, (Math.random()-0.5)*30);
    updateHpBar(target, tElId);

    // All on-hit effects
    await triggerOnHitEffects(attacker, target, eFinal);

    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    await sleep(400);
    tEl.classList.remove('hit-shake');
    await sleep(100);
    multiChance *= 0.8;
  }
}

// ── GAMBLER SKILLS ────────────────────────────────────────
async function doGamblerCards(attacker, target, skill) {
  // 3 hits, each random 0.3~0.6 ATK
  const tElId = getFighterElId(target);
  let totalDmg = 0;
  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) break;
    const scale = skill.minScale + Math.random() * (skill.maxScale - skill.minScale);
    const baseDmg = Math.round(attacker.atk * scale);
    const eDef = Math.max(0, target.def - (attacker.armorPen || 0));
    const defRed = eDef / (eDef + DEF_CONSTANT);
    const dmg = Math.max(1, Math.round(baseDmg * (1 - defRed)));
    applyRawDmg(attacker, target, dmg);
    totalDmg += dmg;
    spawnFloatingNum(tElId, `-${dmg}`, 'direct-dmg', 0, (i % 3) * 20);
    await triggerOnHitEffects(attacker, target, dmg);
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(700);
    tEl.classList.remove('hit-shake');
    await sleep(200);
    await tryGamblerMultiHit(attacker, target, tElId);
  }
  addLog(`${attacker.emoji}${attacker.name} <b>卡牌射击</b> → ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}伤害</span>`);
}

async function doGamblerDraw(caster, _skill) {
  const roll = Math.floor(Math.random() * 3);
  const fElId = getFighterElId(caster);

  if (roll === 0) {
    // 1: Heal 10%HP + 5%HP shield
    const healAmt = Math.round(caster.maxHp * 0.10);
    const shieldAmt = Math.round(caster.maxHp * 0.05);
    const before = caster.hp;
    caster.hp = Math.min(caster.maxHp, caster.hp + healAmt);
    const actual = Math.round(caster.hp - before);
    caster.shield += shieldAmt;
    spawnFloatingNum(fElId, `🃏回复牌`, 'passive-num', 0, -20);
    if (actual > 0) spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 200, 0);
    spawnFloatingNum(fElId, `+${shieldAmt}🛡`, 'shield-num', 400, 0);
    updateHpBar(caster, fElId);
    addLog(`${caster.emoji}${caster.name} <b>抽牌</b>：🃏回复牌！<span class="log-heal">+${actual}HP</span> <span class="log-shield">+${shieldAmt}护盾</span>`);
  } else if (roll === 1) {
    // 2: Bomb card — 0.9ATK to all enemies
    spawnFloatingNum(fElId, `🃏炸弹牌`, 'crit-label', 0, -20);
    const enemies = (caster.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
    const baseDmg = Math.round(caster.atk * 0.9);
    for (const e of enemies) {
      const eDef = Math.max(0, e.def - (caster.armorPen || 0));
      const defRed = eDef / (eDef + DEF_CONSTANT);
      const dmg = Math.max(1, Math.round(baseDmg * (1 - defRed)));
      applyRawDmg(caster, e, dmg);
      const eId = getFighterElId(e);
      spawnFloatingNum(eId, `-${dmg}`, 'direct-dmg', 0, 0);
      updateHpBar(e, eId);
    }
    addLog(`${caster.emoji}${caster.name} <b>抽牌</b>：🃏炸弹牌！对全体敌方 <span class="log-direct">${baseDmg}伤害</span>`);
  } else {
    // 3: Self buff — +15%ATK, +25%crit, +15%critDmg, 20% dmg→pierce, 3 turns
    const atkGain = Math.round(caster.baseAtk * 0.15);
    caster.buffs.push({ type:'atkUp', value:atkGain, turns:3 });
    caster.crit += 0.25;
    caster._extraCritDmgPerm = (caster._extraCritDmgPerm || 0) + 0.15;
    caster.buffs.push({ type:'gamblerPierceConvert', value:20, turns:3 });
    spawnFloatingNum(fElId, `🃏强化牌`, 'crit-label', 0, -20);
    spawnFloatingNum(fElId, `+ATK+暴击+爆伤+穿透`, 'passive-num', 200, 0);
    recalcStats();
    renderStatusIcons(caster);
    updateFighterStats(caster, fElId);
    addLog(`${caster.emoji}${caster.name} <b>抽牌</b>：🃏强化牌！<span class="log-passive">+15%ATK +25%暴击 +15%爆伤 20%伤害转穿透 3回合</span>`);
  }
  await sleep(1000);
}

async function doGamblerBet(attacker, target, skill) {
  // Must have >50% HP
  if (attacker.hp / attacker.maxHp <= 0.5) {
    addLog(`${attacker.emoji}${attacker.name} <b>赌注</b>：HP不足50%，无法使用！`);
    await sleep(1000);
    return;
  }
  // Cost 50% HP directly (not through shield)
  const hpCost = Math.round(attacker.hp * skill.hpCostPct / 100);
  attacker.hp -= hpCost;
  const fElId = getFighterElId(attacker);
  spawnFloatingNum(fElId, `-${hpCost}HP`, 'direct-dmg', 0, 0);
  updateHpBar(attacker, fElId);
  addLog(`${attacker.emoji}${attacker.name} <b>赌注！</b>消耗 <span class="log-direct">${hpCost}HP</span>！`);
  await sleep(500);

  // Temporarily boost multi-hit chance by 20% (only for this skill)
  attacker._multiBonus = (attacker._multiBonus || 0) + skill.multiBonus;

  // 6 hits of boosted damage (hpCost split into 6 hits as pierce bonus)
  const tElId = getFighterElId(target);
  const piercePer = Math.round(hpCost / skill.hits);
  const normalPer = Math.round(attacker.atk * 0.3);
  let totalDmg = 0;

  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) break;
    const eDef = Math.max(0, target.def - (attacker.armorPen || 0));
    const defRed = eDef / (eDef + DEF_CONSTANT);
    const normalDmg = Math.max(1, Math.round(normalPer * (1 - defRed)));
    const total = normalDmg + piercePer;
    applyRawDmg(attacker, target, total);
    totalDmg += total;
    spawnFloatingNum(tElId, `-${total}🃏`, 'crit-dmg', 0, (i % 4) * 18);
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(500);
    tEl.classList.remove('hit-shake');
    await sleep(100);
    // Multi-hit passive (boosted to 60% for this skill)
    await tryGamblerMultiHit(attacker, target, tElId);
  }
  addLog(`→ ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}伤害</span>（每段含${piercePer}穿透）`);

  // Remove temporary multi-hit bonus after this skill
  attacker._multiBonus = Math.max(0, (attacker._multiBonus || 0) - skill.multiBonus);
  await sleep(200);
}

// ── TWO-HEAD SKILLS ───────────────────────────────────────
async function doTwoHeadFear(attacker, target, skill) {
  // Deal 1×ATK normal damage
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const effectiveDef = Math.max(0, target.def - (attacker.armorPen || 0));
  const defRed = effectiveDef / (effectiveDef + DEF_CONSTANT);
  const dmg = Math.max(1, Math.round(baseDmg * (1 - defRed)));
  applyRawDmg(attacker, target, dmg);
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `-${dmg}`, 'direct-dmg', 0, 0);
  await triggerOnHitEffects(attacker, target, dmg);
  const tEl = document.getElementById(tElId);
  tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(700);
  tEl.classList.remove('hit-shake');

  // Apply fear debuff
  if (target.alive) {
    const existing = target.buffs.find(b => b.type === 'fear' && b.sourceId === allFighters.indexOf(attacker));
    if (existing) {
      existing.turns = skill.fearTurns;
    } else {
      target.buffs.push({ type:'fear', value:skill.fearReduction, turns:skill.fearTurns, sourceId:allFighters.indexOf(attacker) });
    }
    spawnFloatingNum(tElId, '恐惧!', 'debuff-label', 200, 0);
    renderStatusIcons(target);
    addLog(`${attacker.emoji}${attacker.name} <b>恐吓</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span> + <span class="log-debuff">恐惧${skill.fearTurns}回合(对双头龟伤害-${skill.fearReduction}%)</span>`);
  }
  await sleep(200);
}

async function doTwoHeadSteal(attacker, target, _skill) {
  // Pick a random skill from target (excluding the steal skill itself)
  const stealable = target.skills.filter(s => s.type !== 'twoHeadSteal' && s.cdLeft === 0);
  if (!stealable.length) {
    addLog(`${attacker.emoji}${attacker.name} <b>窃取</b>：${target.emoji}${target.name} 没有可窃取的技能！`);
    await sleep(1000);
    return;
  }
  const stolen = stealable[Math.floor(Math.random() * stealable.length)];
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `窃取: ${stolen.name}`, 'crit-label', 0, 0);
  addLog(`${attacker.emoji}${attacker.name} <b>窃取</b>了 ${target.emoji}${target.name} 的 <b>${stolen.name}</b>！立即释放！`);
  await sleep(800);

  // Execute the stolen skill as if attacker used it
  // Determine target for stolen skill
  const isAlly = stolen.type === 'heal' || stolen.type === 'shield' || stolen.type === 'bubbleShield' || stolen.type === 'ninjaTrap' || stolen.type === 'angelBless';
  const isAoe = stolen.aoe || stolen.aoeAlly || stolen.type === 'hunterBarrage' || stolen.type === 'ninjaBomb' || stolen.type === 'lightningBarrage';
  const isSelf = stolen.type === 'phoenixShield' || stolen.type === 'fortuneDice' || stolen.type === 'lightningBuff';

  let stolenTarget;
  if (isSelf || isAoe) {
    stolenTarget = attacker;
  } else if (isAlly) {
    const allies = (attacker.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
    stolenTarget = allies[Math.floor(Math.random() * allies.length)];
  } else {
    // Attack skill → use on the original target
    stolenTarget = target.alive ? target : (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive)[0];
  }
  if (!stolenTarget) { await sleep(500); return; }

  const fakeAction = {
    attackerId: allFighters.indexOf(attacker),
    skillIdx: -1, // not from attacker's own skills
    targetId: allFighters.indexOf(stolenTarget),
    aoe: isAoe && !stolen.aoeAlly,
    _stolenSkill: stolen
  };

  // Temporarily assign stolen skill for executeAction
  const savedSkills = attacker.skills;
  attacker.skills = [...savedSkills, { ...stolen, cdLeft: 0 }];
  fakeAction.skillIdx = attacker.skills.length - 1;

  // Re-enter executeAction for the stolen skill (without the wrapper animations)
  const stolenSkillRef = attacker.skills[fakeAction.skillIdx];
  if (stolenSkillRef.cd > 0) stolenSkillRef.cdLeft = 0; // don't set CD on attacker

  const atkEl = document.getElementById(getFighterElId(attacker));
  atkEl.classList.add('attack-anim');

  if (fakeAction.aoe) {
    const enemies = (attacker.side==='left'?rightTeam:leftTeam).filter(e => e.alive);
    for (const enemy of enemies) { await doDamage(attacker, enemy, stolenSkillRef); if (battleOver) break; }
  } else if (stolenSkillRef.type === 'heal') {
    await doHeal(attacker, stolenTarget, stolenSkillRef);
  } else if (stolenSkillRef.type === 'shield') {
    await doShield(attacker, stolenTarget, stolenSkillRef);
  } else if (stolenSkillRef.type === 'physical' || stolenSkillRef.type === 'magic') {
    await doDamage(attacker, stolenTarget, stolenSkillRef);
  } else {
    // For complex custom types, fall back to doDamage
    await doDamage(attacker, stolenTarget, stolenSkillRef);
  }

  atkEl.classList.remove('attack-anim');
  // Restore original skills
  attacker.skills = savedSkills;
}

// ── HIDING TURTLE SKILLS ──────────────────────────────────
async function doHidingDefend(caster, skill) {
  const shieldAmt = Math.round(caster.maxHp * skill.shieldHpPct / 100);
  caster.shield += shieldAmt;
  // Track shield for expiry heal
  caster.buffs.push({ type:'hidingShield', turns:skill.shieldDuration, shieldVal:shieldAmt, healPct:skill.shieldHealPct });
  const elId = getFighterElId(caster);
  spawnFloatingNum(elId, `+${shieldAmt}🛡`, 'shield-num', 0, 0);
  updateHpBar(caster, elId);
  renderStatusIcons(caster);
  addLog(`${caster.emoji}${caster.name} <b>防御</b>：<span class="log-shield">+${shieldAmt}护盾</span>（${skill.shieldDuration}回合，到期回复剩余盾${skill.shieldHealPct}%HP）`);
  await sleep(800);
}

async function doHidingCommand(owner, _skill) {
  const summon = owner._summon;
  if (!summon || !summon.alive) {
    const elId = getFighterElId(owner);
    spawnFloatingNum(elId, '随从已阵亡', 'passive-num', 0, 0);
    addLog(`${owner.emoji}${owner.name} <b>指挥</b>：随从已阵亡，技能无效！`);
    await sleep(800);
    return;
  }
  addLog(`${owner.emoji}${owner.name} <b>指挥</b>：命令 ${summon.emoji}${summon.name} 出击！`);
  await sleep(400);
  await summonUseRandomSkill(summon, owner);
}

// Helper: make a summon use a random available skill
async function summonUseRandomSkill(summon, owner) {
  if (!summon || !summon.alive) return;
  const ready = summon.skills.filter(s => s.cdLeft === 0);
  if (!ready.length) {
    addLog(`${summon.emoji}${summon.name}(随从) 没有可用技能！`);
    await sleep(500);
    return;
  }
  const skill = ready[Math.floor(Math.random() * ready.length)];
  if (skill.cd > 0) skill.cdLeft = skill.cd;

  const enemies = (summon.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  const allies = (summon.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
  // Add owner to allies list for heal/shield targeting
  if (owner && owner.alive && !allies.includes(owner)) allies.push(owner);

  const isAlly = skill.type === 'heal' || skill.type === 'shield' || skill.type === 'bubbleShield' || skill.type === 'ninjaTrap' || skill.type === 'angelBless';
  const isAoe = skill.aoe || skill.aoeAlly || skill.type === 'hunterBarrage' || skill.type === 'ninjaBomb' || skill.type === 'lightningBarrage';
  const isSelf = skill.type === 'phoenixShield' || skill.type === 'fortuneDice' || skill.type === 'lightningBuff' || skill.type === 'hidingDefend' || skill.type === 'hidingCommand';

  let target;
  if (isSelf) {
    target = summon;
  } else if (isAoe) {
    target = null; // handled below
  } else if (isAlly) {
    target = allies.sort((a,b) => (a.hp/a.maxHp) - (b.hp/b.maxHp))[0];
  } else {
    target = enemies.length ? enemies.sort((a,b) => a.hp - b.hp)[0] : null;
  }

  if (!target && !isAoe) { await sleep(500); return; }

  const sElId = getFighterElId(summon);
  const sCard = document.getElementById(sElId);
  if (sCard) sCard.classList.add('attack-anim');

  addLog(`${summon.emoji}${summon.name}(随从) 使用 <b>${skill.name}</b>！`);

  // Execute the skill effect
  if (isAoe && !skill.aoeAlly) {
    for (const enemy of enemies) {
      await doDamage(summon, enemy, skill);
      if (battleOver) break;
    }
  } else if (skill.type === 'heal') {
    await doHeal(summon, target, skill);
  } else if (skill.type === 'shield') {
    await doShield(summon, target, skill);
  } else if (skill.type === 'angelBless') {
    await doAngelBless(summon, target, skill);
  } else if (skill.type === 'angelEquality') {
    const eTarget = enemies.length ? enemies.sort((a,b) => a.hp - b.hp)[0] : null;
    if (eTarget) await doAngelEquality(summon, eTarget, skill);
  } else if (skill.type === 'physical' || skill.type === 'magic') {
    await doDamage(summon, target, skill);
  } else {
    // Fallback for complex types
    if (target && enemies.includes(target)) {
      await doDamage(summon, target, skill);
    } else {
      await doDamage(summon, enemies[0] || target, skill);
    }
  }

  if (sCard) sCard.classList.remove('attack-anim');

  // Check deaths after summon action
  checkDeaths(summon);
}

// ── ANGEL TURTLE SKILLS ───────────────────────────────────
async function doAngelBless(caster, target, skill) {
  const shieldAmt = Math.round(caster.atk * skill.shieldScale);
  const defGain = Math.round(caster.atk * skill.defBoostScale);
  target.shield += shieldAmt;
  target.buffs.push({ type:'defUp', value:defGain, turns:skill.defBoostTurns });
  recalcStats();
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `+${shieldAmt}🛡`, 'shield-num', 0, 0);
  spawnFloatingNum(tElId, `+${defGain}防`, 'passive-num', 300, 0);
  updateHpBar(target, tElId);
  renderStatusIcons(target);
  addLog(`${caster.emoji}${caster.name} <b>祝福</b> → ${target.emoji}${target.name}：<span class="log-shield">+${shieldAmt}护盾</span>(${skill.shieldTurns}回合) + <span class="log-passive">防御+${defGain}</span>(${skill.defBoostTurns}回合)`);
  await sleep(1000);
}

async function doAngelEquality(attacker, target, skill) {
  const tElId = getFighterElId(target);
  const isHighRarity = skill.antiHighRarity.includes(target.rarity);
  let totalDmgDealt = 0;

  // Track judgement passive damage for this skill
  skill._judgeTotal = 0;

  // Effective crit
  let effectiveCrit = attacker.crit;
  if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
    effectiveCrit += attacker.passive.pct / 100;
  }
  const forceCrit = isHighRarity && skill.forceCrit;
  const isCrit = forceCrit || Math.random() < effectiveCrit;
  const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;

  const effectiveDef = Math.max(0, target.def - (attacker.armorPen || 0));
  const defReduction = effectiveDef / (effectiveDef + DEF_CONSTANT);

  // ── Hit 1: normal damage ──
  const normalRaw = Math.round(attacker.atk * skill.normalScale);
  let normalDmg = Math.max(1, Math.round(normalRaw * critMult * (1 - defReduction)));
  // Passive bonusDmgAbove60
  if (attacker.passive && attacker.passive.type === 'bonusDmgAbove60' && target.hp / target.maxHp > 0.6) {
    normalDmg = Math.round(normalDmg * (1 + attacker.passive.pct / 100));
  }
  applyRawDmg(attacker, target, normalDmg, false);
  totalDmgDealt += normalDmg;

  if (isCrit) spawnFloatingNum(tElId, '暴击!', 'crit-label', 0, 0);
  spawnFloatingNum(tElId, `-${normalDmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 80, 0);
  updateHpBar(target, tElId);
  await triggerOnHitEffects(attacker, target, normalDmg);

  // Judgement passive on hit 1
  if (attacker.passive && attacker.passive.type === 'judgement' && target.alive) {
    const judgeRaw = Math.round(target.hp * attacker.passive.hpPct / 100);
    const judgeReduced = Math.max(1, Math.round(judgeRaw * (1 - defReduction) * critMult));
    applyRawDmg(attacker, target, judgeReduced, false);
    totalDmgDealt += judgeReduced;
    skill._judgeTotal += judgeReduced;
    spawnFloatingNum(tElId, `⚖${judgeReduced}`, 'passive-num', 400, 0);
    updateHpBar(target, tElId);
  }

  const tEl1 = document.getElementById(tElId);
  if (tEl1) { tEl1.classList.add('hit-shake'); }
  await sleep(700);
  if (tEl1) { tEl1.classList.remove('hit-shake'); }
  await sleep(200);

  // ── Hit 2: pierce damage ──
  if (target.alive) {
    const pierceRaw = Math.round(attacker.atk * skill.pierceScale);
    const pierceDmg = Math.max(1, Math.round(pierceRaw * critMult)); // pierce ignores DEF
    applyRawDmg(attacker, target, pierceDmg, true);
    totalDmgDealt += pierceDmg;

    if (isCrit) spawnFloatingNum(tElId, '暴击!', 'crit-label', 0, 24);
    spawnFloatingNum(tElId, `-${pierceDmg}`, 'pierce-dmg', 80, 24);
    updateHpBar(target, tElId);
    await triggerOnHitEffects(attacker, target, pierceDmg);

    // Judgement passive on hit 2
    if (attacker.passive && attacker.passive.type === 'judgement' && target.alive) {
      const judgeRaw = Math.round(target.hp * attacker.passive.hpPct / 100);
      const judgeReduced = Math.max(1, Math.round(judgeRaw * (1 - defReduction) * critMult));
      applyRawDmg(attacker, target, judgeReduced, false);
      totalDmgDealt += judgeReduced;
      skill._judgeTotal += judgeReduced;
      spawnFloatingNum(tElId, `⚖${judgeReduced}`, 'passive-num', 400, 24);
      updateHpBar(target, tElId);
    }

    const tEl2 = document.getElementById(tElId);
    if (tEl2) { tEl2.classList.add('hit-shake'); }
    await sleep(700);
    if (tEl2) { tEl2.classList.remove('hit-shake'); }
    await sleep(200);
  }

  // Log
  const parts = [];
  parts.push(`<span class="log-direct">普通${Math.round(attacker.atk * skill.normalScale)}</span>`);
  parts.push(`<span class="log-pierce">穿透${Math.round(attacker.atk * skill.pierceScale)}</span>`);
  if (skill._judgeTotal > 0) parts.push(`<span class="log-passive">⚖裁决${skill._judgeTotal}</span>`);
  if (isCrit) parts.push(`<span class="log-crit">暴击</span>`);
  addLog(`${attacker.emoji}${attacker.name} <b>平等</b> → ${target.emoji}${target.name}：${parts.join(' + ')}${isHighRarity ? ' <span class="log-crit">[克制S级以上]</span>' : ''}`);

  // Anti-high-rarity heal
  if (isHighRarity && attacker.alive) {
    const healAmt = Math.round(totalDmgDealt * skill.healPctOfDmg / 100);
    const before = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmt);
    const actual = Math.round(attacker.hp - before);
    if (actual > 0) {
      const aElId = getFighterElId(attacker);
      spawnFloatingNum(aElId, `+${actual}`, 'heal-num', 0, 0);
      updateHpBar(attacker, aElId);
      addLog(`${attacker.emoji}${attacker.name} 平等克制：<span class="log-heal">回复${actual}HP</span>（总伤${totalDmgDealt}×${skill.healPctOfDmg}%）`);
    }
  }

  // Clean up temp tracking
  delete skill._judgeTotal;
}

// ── FORTUNE SKILLS ────────────────────────────────────────
async function doFortuneDice(caster, skill) {
  const roll = 1 + Math.floor(Math.random() * 6);
  caster._goldCoins += roll;
  const fElId = getFighterElId(caster);
  spawnFloatingNum(fElId, `🎲${roll} +${roll}🪙`, 'passive-num', 0, 0);
  // Heal 10% max HP
  const healAmt = Math.round(caster.maxHp * skill.healPct / 100);
  const before = caster.hp;
  caster.hp = Math.min(caster.maxHp, caster.hp + healAmt);
  const actual = Math.round(caster.hp - before);
  if (actual > 0) spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 300, 0);
  updateHpBar(caster, fElId);
  addLog(`${caster.emoji}${caster.name} <b>骰子</b>：🎲${roll}！<span class="log-passive">+${roll}金币（共${caster._goldCoins}）</span> <span class="log-heal">+${actual}HP</span>`);
  await sleep(1000);
}

async function doFortuneAllIn(attacker, target, skill) {
  const coins = attacker._goldCoins;
  if (coins <= 0) {
    addLog(`${attacker.emoji}${attacker.name} <b>梭哈</b>：没有金币！`);
    await sleep(700);
    return;
  }
  attacker._goldCoins = 0;
  const piercePer = Math.round(attacker.atk * skill.perCoinAtkPierce);
  const normalPer = Math.round(attacker.atk * skill.perCoinAtkNormal);
  const tElId = getFighterElId(target);
  let totalPierce = 0, totalNormal = 0;

  addLog(`${attacker.emoji}${attacker.name} <b>梭哈！</b> ${coins}枚金币全部投出！`);

  for (let i = 0; i < coins; i++) {
    if (!target.alive) break;
    // Normal part through DEF
    const effectiveDef = Math.max(0, target.def - (attacker.armorPen || 0));
    const defRed = effectiveDef / (effectiveDef + DEF_CONSTANT);
    const normalDmg = Math.max(1, Math.round(normalPer * (1 - defRed)));
    const totalHit = normalDmg + piercePer;
    applyRawDmg(attacker, target, totalHit);
    totalPierce += piercePer;
    totalNormal += normalDmg;
    // Stagger visuals
    const yOff = (i % 6) * 18;
    spawnFloatingNum(tElId, `-${totalHit}🪙`, i < 10 ? 'crit-dmg' : 'direct-dmg', 0, yOff);
    if (i % 3 === 0) {
      const tEl = document.getElementById(tElId);
      tEl.classList.add('hit-shake');
      updateHpBar(target, tElId);
      await sleep(180);
      tEl.classList.remove('hit-shake');
    }
  }
  updateHpBar(target, tElId);
  addLog(`→ ${target.emoji}${target.name}：<span class="log-direct">${totalNormal}普通</span> + <span class="log-pierce">${totalPierce}穿透</span>（${coins}枚金币）`);
  // Mark as used (cd=999 already prevents reuse)
  await sleep(1000);
}

// ── LIGHTNING SKILLS ───────────────────────────────────────
async function doLightningStrike(attacker, mainTarget, skill) {
  // 5 hits on main target, each hit splashes 25% to secondary target
  const totalDmg = Math.round(attacker.atk * skill.atkScale);
  const perHit = Math.round(totalDmg / skill.hits);
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  const secondaryTarget = enemies.find(e => e !== mainTarget && e.alive);
  const tElId = getFighterElId(mainTarget);
  let totalMain = 0, totalSplash = 0;

  for (let i = 0; i < skill.hits; i++) {
    if (!mainTarget.alive) break;
    // Main target: normal damage through DEF
    const effectiveDef = Math.max(0, mainTarget.def - (attacker.armorPen || 0));
    const defRed = effectiveDef / (effectiveDef + DEF_CONSTANT);
    const dmg = Math.max(1, Math.round(perHit * (1 - defRed)));
    applyRawDmg(attacker, mainTarget, dmg);
    totalMain += dmg;
    spawnFloatingNum(tElId, `-${dmg}`, 'direct-dmg', 0, 0);
    await triggerOnHitEffects(attacker, mainTarget, dmg);
    // Splash to secondary
    if (secondaryTarget && secondaryTarget.alive) {
      const splashDmg = Math.max(1, Math.round(dmg * skill.splashPct / 100));
      applyRawDmg(attacker, secondaryTarget, splashDmg);
      totalSplash += splashDmg;
      const sElId = getFighterElId(secondaryTarget);
      spawnFloatingNum(sElId, `-${splashDmg}`, 'direct-dmg', 200, 0);
      updateHpBar(secondaryTarget, sElId);
      await triggerOnHitEffects(attacker, secondaryTarget, splashDmg);
    }
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    updateHpBar(mainTarget, tElId);
    await sleep(600);
    tEl.classList.remove('hit-shake');
    await sleep(100);
  }
  let logStr = `${attacker.emoji}${attacker.name} <b>闪电打击</b> → ${mainTarget.emoji}${mainTarget.name}：<span class="log-direct">${totalMain}伤害</span>`;
  if (totalSplash > 0 && secondaryTarget) logStr += ` + ${secondaryTarget.emoji}溅射<span class="log-direct">${totalSplash}</span>`;
  addLog(logStr);
}

async function doLightningBuff(caster, skill) {
  const allies = (caster.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
  for (const ally of allies) {
    const val = Math.round(ally.baseAtk * skill.atkUpPct / 100);
    const existing = ally.buffs.find(b => b.type === 'atkUp');
    if (existing) { existing.value = Math.max(existing.value, val); existing.turns = Math.max(existing.turns, skill.atkUpTurns); }
    else ally.buffs.push({ type: 'atkUp', value: val, turns: skill.atkUpTurns });
    const aElId = getFighterElId(ally);
    spawnFloatingNum(aElId, `+${val}攻`, 'passive-num', 0, 0);
    renderStatusIcons(ally);
  }
  recalcStats();
  addLog(`${caster.emoji}${caster.name} <b>威力增幅</b>：全体友方 <span class="log-passive">攻击+${skill.atkUpPct}% ${skill.atkUpTurns}回合</span>`);
  await sleep(1000);
}

async function doLightningBarrage(attacker, skill) {
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  if (!enemies.length) return;
  const perHitDmg = Math.round(attacker.atk * skill.arrowScale);

  for (let i = 0; i < skill.hits; i++) {
    const alive = enemies.filter(e => e.alive);
    if (!alive.length) break;
    const target = alive[Math.floor(Math.random() * alive.length)];
    // Normal damage through DEF
    const effectiveDef = Math.max(0, target.def - (attacker.armorPen || 0));
    const defRed = effectiveDef / (effectiveDef + DEF_CONSTANT);
    const dmg = Math.max(1, Math.round(perHitDmg * (1 - defRed)));
    applyRawDmg(attacker, target, dmg);
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, `-${dmg}`, 'direct-dmg', 0, (i % 5) * 15);
    await triggerOnHitEffects(attacker, target, dmg);
    updateHpBar(target, tElId);
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    await sleep(100);
    tEl.classList.remove('hit-shake');
  }
  addLog(`${attacker.emoji}${attacker.name} <b>雷暴</b> ${skill.hits}次随机闪电，每次 <span class="log-direct">${perHitDmg}伤害</span>`);
}

// ── PHOENIX SKILLS ────────────────────────────────────────
async function doPhoenixBurn(attacker, target, skill) {
  // Deal 1×ATK normal damage
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const effectiveDef = Math.max(0, target.def - (attacker.armorPen || 0));
  const defRed = effectiveDef / (effectiveDef + DEF_CONSTANT);
  const dmg = Math.max(1, Math.round(baseDmg * (1 - defRed)));
  const tElId = getFighterElId(target);
  applyRawDmg(attacker, target, dmg);
  spawnFloatingNum(tElId, `-${dmg}`, 'direct-dmg', 0, 0);
  await triggerOnHitEffects(attacker, target, dmg);
  const tEl = document.getElementById(tElId);
  tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(450);
  tEl.classList.remove('hit-shake');

  // Apply phoenix burn DoT — same caster's burn only refreshes duration, not stack
  if (target.alive) {
    const casterId = allFighters.indexOf(attacker);
    const existing = target.buffs.find(b => b.type === 'phoenixBurnDot' && b.casterId === casterId);
    if (existing) {
      existing.turns = skill.burnTurns; // refresh only
      spawnFloatingNum(tElId, `🔥刷新${skill.burnTurns}回合`, 'debuff-label', 200, 0);
      addLog(`${attacker.emoji}${attacker.name} <b>灼烧</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span> + <span class="log-dot">灼烧刷新至${skill.burnTurns}回合</span>`);
    } else {
      const dotDmg = Math.round(attacker.atk * skill.burnAtkScale);
      target.buffs.push({ type:'phoenixBurnDot', value:dotDmg, hpPct:skill.burnHpPct, turns:skill.burnTurns, casterId });
      spawnFloatingNum(tElId, `🔥灼烧${skill.burnTurns}回合`, 'debuff-label', 200, 0);
      addLog(`${attacker.emoji}${attacker.name} <b>灼烧</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span> + <span class="log-dot">灼烧${skill.burnTurns}回合</span>`);
    }
    renderStatusIcons(target);
  }
  await sleep(80);
}

async function doPhoenixShield(caster, skill) {
  const amount = Math.round(caster.atk * skill.shieldScale);
  caster._lavaShieldVal = amount;
  caster._lavaShieldTurns = skill.duration;
  caster._lavaShieldCounter = skill.counterScale;
  // Also add as normal shield for visual
  caster.shield += amount;
  const fElId = getFighterElId(caster);
  spawnFloatingNum(fElId, `+${amount}🌋`, 'passive-num', 0, 0);
  updateHpBar(caster, fElId);
  renderStatusIcons(caster);
  addLog(`${caster.emoji}${caster.name} <b>熔岩盾</b>：+${amount}护盾 ${skill.duration}回合，被攻击每段反击${Math.round(skill.counterScale*100)}%ATK`);
  await sleep(1000);
}

async function doPhoenixScald(attacker, target, skill) {
  const tElId = getFighterElId(target);

  // Break 50% of target's shields first
  if (skill.shieldBreak && (target.shield > 0 || target.bubbleShieldVal > 0)) {
    const breakPct = skill.shieldBreak / 100;
    if (target.bubbleShieldVal > 0) {
      const broken = Math.round(target.bubbleShieldVal * breakPct);
      target.bubbleShieldVal -= broken;
      spawnFloatingNum(tElId, `-${broken}🫧`, 'shield-dmg', 0, -15);
    }
    if (target.shield > 0) {
      const broken = Math.round(target.shield * breakPct);
      target.shield -= broken;
      spawnFloatingNum(tElId, `-${broken}🛡`, 'shield-dmg', 100, -15);
    }
    addLog(`${attacker.emoji}${attacker.name} 烫伤破盾！<span class="log-debuff">破坏${skill.shieldBreak}%护盾</span>`);
    updateHpBar(target, tElId);
    await sleep(300);
  }

  // Deal 0.7×ATK normal damage
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const effectiveDef = Math.max(0, target.def - (attacker.armorPen || 0));
  const defRed = effectiveDef / (effectiveDef + DEF_CONSTANT);
  const dmg = Math.max(1, Math.round(baseDmg * (1 - defRed)));
  applyRawDmg(attacker, target, dmg);
  spawnFloatingNum(tElId, `-${dmg}`, 'direct-dmg', 0, 0);
  await triggerOnHitEffects(attacker, target, dmg);
  const tEl = document.getElementById(tElId);
  tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(450);
  tEl.classList.remove('hit-shake');

  // Apply debuffs
  if (target.alive) {
    applySkillDebuffs(skill, target);
  }
  addLog(`${attacker.emoji}${attacker.name} <b>烫伤</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span>`);
  await sleep(80);
}

// ── NINJA SKILLS ──────────────────────────────────────────
async function doNinjaShuriken(attacker, target, skill) {
  // 1.5×ATK damage, if crits → entire damage becomes pierce (ignores DEF)
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const isCrit = Math.random() < attacker.crit;
  const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
  const tElId = getFighterElId(target);

  if (isCrit) {
    const pierceDmg = Math.round(baseDmg * critMult);
    applyRawDmg(attacker, target, pierceDmg);
    spawnFloatingNum(tElId, '暴击!转穿透', 'crit-label', 0, -18);
    spawnFloatingNum(tElId, `-${pierceDmg}`, 'pierce-dmg', 100, 0);
    addLog(`${attacker.emoji}${attacker.name} <b>飞镖</b> → ${target.emoji}${target.name}：<span class="log-crit">暴击!</span> <span class="log-pierce">${pierceDmg}穿透</span>`);
    await triggerOnHitEffects(attacker, target, pierceDmg);
  } else {
    const effectiveDef = Math.max(0, target.def - (attacker.armorPen || 0));
    const defRed = effectiveDef / (effectiveDef + DEF_CONSTANT);
    const dmg = Math.max(1, Math.round(baseDmg * (1 - defRed)));
    applyRawDmg(attacker, target, dmg);
    spawnFloatingNum(tElId, `-${dmg}`, 'direct-dmg', 100, 0);
    addLog(`${attacker.emoji}${attacker.name} <b>飞镖</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span>`);
    await triggerOnHitEffects(attacker, target, dmg);
  }

  const tEl = document.getElementById(tElId);
  tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(450);
  tEl.classList.remove('hit-shake');
  // Trap triggers when the buffed ally is attacked, not here
  await sleep(80);
}

async function doNinjaTrap(caster, target, skill) {
  // Place hidden trap on ally — enemy can't see who has it
  // Remove old trap from this caster
  const allies = (caster.side === 'left' ? leftTeam : rightTeam);
  allies.forEach(a => { a.buffs = a.buffs.filter(b => !(b.type === 'trap' && b.casterId === allFighters.indexOf(caster))); });
  // Add trap
  target.buffs.push({ type:'trap', value: Math.round(caster.atk * skill.trapScale), turns:99, casterId: allFighters.indexOf(caster), hidden:true });
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, '夹子已布置', 'passive-num', 0, 0);
  // Don't reveal which ally has it in the log (hidden from enemy)
  addLog(`${caster.emoji}${caster.name} <b>${skill.name}</b>：在友方布置了隐形夹子`);
  // Don't show trap in status icons (hidden)
  await sleep(1000);
}

async function doNinjaBomb(attacker, skill) {
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);

  for (const e of enemies) {
    const effectiveDef = Math.max(0, e.def - (attacker.armorPen || 0));
    const defRed = effectiveDef / (effectiveDef + DEF_CONSTANT);
    const dmg = Math.max(1, Math.round(baseDmg * (1 - defRed)));
    applyRawDmg(attacker, e, dmg);
    const eId = getFighterElId(e);
    spawnFloatingNum(eId, `-${dmg}`, 'direct-dmg', 0, 0);
    updateHpBar(e, eId);
    await triggerOnHitEffects(attacker, e, dmg);

    // Apply armor break (defDown by %)
    if (skill.armorBreak) {
      const ab = skill.armorBreak;
      const existing = e.buffs.find(b => b.type === 'defDown');
      if (existing) { existing.value = Math.max(existing.value, ab.pct); existing.turns = Math.max(existing.turns, ab.turns); }
      else e.buffs.push({ type:'defDown', value:ab.pct, turns:ab.turns });
      spawnFloatingNum(eId, `破甲${ab.pct}%`, 'debuff-label', 200, 0);
      renderStatusIcons(e);
    }
  }
  recalcStats();
  addLog(`${attacker.emoji}${attacker.name} <b>炸弹</b> → 全体敌方：<span class="log-direct">${baseDmg}伤害</span> + <span class="log-debuff">破甲${skill.armorBreak.pct}% ${skill.armorBreak.turns}回合</span>`);
  await sleep(1000);
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
    // Pierce damage — ignores DEF, hits shields
    applyRawDmg(attacker, target, arrowDmg, true); // isPierce
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, `-${arrowDmg}`, 'pierce-dmg', 0, (i % 4) * 20);
    await triggerOnHitEffects(attacker, target, arrowDmg);
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(320);
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
  await sleep(1000);
}

async function doBubbleBind(caster, target, skill) {
  // Remove existing bind on this target
  target.buffs = target.buffs.filter(b => b.type !== 'bubbleBind');
  target.buffs.push({ type:'bubbleBind', value:skill.bindPct, turns:skill.duration });
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, '🫧束缚', 'bubble-num', 0, 0);
  renderStatusIcons(target);
  addLog(`${caster.emoji}${caster.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-passive">泡泡束缚${skill.duration}回合（攻击者获得${skill.bindPct}%伤害护盾）</span>`);
  await sleep(1000);
}

// ── FLOATING NUMBERS — persistent 2.5s ────────────────────
function spawnFloatingNum(elId, text, cls, delayMs, yOffset) {
  setTimeout(() => {
    const parent = document.getElementById(elId);
    if (!parent) return;
    const num = document.createElement('div');
    num.className = 'floating-num ' + cls;
    num.textContent = text;
    const ox = (Math.random() - 0.5) * 44;
    num.style.left = `calc(50% + ${ox}px)`;
    num.style.setProperty('--y-start', `-${20 + (yOffset||0)}px`);
    num.style.setProperty('--y-end', `-${60 + (yOffset||0)}px`);
    parent.appendChild(num);
    setTimeout(() => num.remove(), 4000);
    // SFX based on type
    const sfxMap = {
      'direct-dmg': sfxHit, 'crit-dmg': sfxCrit, 'crit-label': sfxCrit,
      'pierce-dmg': sfxPierce, 'shield-dmg': sfxShieldBreak,
      'shield-num': sfxShield, 'heal-num': sfxHeal,
      'dot-dmg': sfxFire, 'counter-dmg': sfxCounter,
      'bubble-num': sfxShield, 'bubble-burst': sfxExplosion,
      'passive-num': sfxBuff, 'debuff-label': sfxDebuff,
      'dodge-num': sfxDodge, 'death-explode': sfxExplosion,
    };
    const fn = sfxMap[cls];
    if (fn) try { fn(); } catch(e) {}
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
  else if (skill.type==='shield' || skill.type==='hidingDefend' || skill.type==='hidingCommand') target = f; // self-cast
  else if (skill.type==='angelBless') target = allies.sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0]; // bless weakest ally
  else target = enemies.sort((a,b)=>a.hp-b.hp)[0];

  executeAction({ attackerId:allFighters.indexOf(f), skillIdx:f.skills.indexOf(skill), targetId:allFighters.indexOf(target) });
}

// ── DEATH & WIN ───────────────────────────────────────────
function checkDeaths(attacker) {
  allFighters.forEach(f => {
    if (f.hp <= 0 && f.alive) {
      // Phoenix rebirth: revive once
      if (f.passive && f.passive.type === 'phoenixRebirth' && !f._rebirthUsed) {
        f._rebirthUsed = true;
        f.hp = Math.round(f.maxHp * f.passive.revivePct / 100);
        f.alive = true;
        const elId = getFighterElId(f);
        spawnFloatingNum(elId, '涅槃重生!', 'crit-label', 0, -25);
        spawnFloatingNum(elId, `+${f.hp}HP`, 'heal-num', 200, 0);
        updateHpBar(f, elId);
        addLog(`${f.emoji}${f.name} <span class="log-passive">涅槃重生！以${f.passive.revivePct}%HP复活！</span>`);
        try { sfxRebirth(); } catch(e) {}
        return; // skip death processing
      }

      f.alive = false; f.hp = 0;
      const elId = getFighterElId(f);
      const deadEl = document.getElementById(elId);
      if (deadEl) deadEl.classList.add('dead');
      updateHpBar(f, elId);
      addLog(`${f.emoji}${f.name} 被击败！`,'death');
      try { sfxDeath(); } catch(e) {}

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

      // Fortune gold: all alive fortune turtles gain 8 coins on any death
      allFighters.forEach(fg => {
        if (fg.alive && fg.passive && fg.passive.type === 'fortuneGold') {
          fg._goldCoins += 8;
          const fgElId = getFighterElId(fg);
          spawnFloatingNum(fgElId, `+8🪙`, 'passive-num', 500, 0);
          addLog(`${fg.emoji}${fg.name} 被动：<span class="log-passive">阵亡金币+8（共${fg._goldCoins}）</span>`);
        }
      });
    }
  });
  // Check summon deaths (summons are not in allFighters)
  allFighters.forEach(f => {
    if (f._summon && f._summon.alive && f._summon.hp <= 0) {
      f._summon.alive = false;
      f._summon.hp = 0;
      const sElId = getFighterElId(f._summon);
      const sCard = document.getElementById(sElId);
      if (sCard) sCard.classList.add('dead');
      updateSummonHpBar(f._summon);
      addLog(`${f._summon.emoji}${f._summon.name}(随从) 被击败！`,'death');
    }
  });
}

function checkBattleEnd() {
  const lA = leftTeam.some(f=>f.alive), rA = rightTeam.some(f=>f.alive);
  if (!lA || !rA) {
    battleOver = true;
    document.getElementById('actionPanel').classList.remove('show');
    setTimeout(() => showResult(lA), 1200);
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
    try { sfxVictory(); } catch(e) {}
  } else {
    icon.textContent = '💔';
    title.textContent = '失败…';
    sub.textContent = `坚持了 ${turnNum} 回合`;
    rewards.innerHTML = `<div class="reward-line">🪙 +5 龟币</div>`;
    try { sfxDefeat(); } catch(e) {}
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

        // Steal 20% stats + 10% lifesteal
        const sAtk = Math.round(e.baseAtk * f.passive.stealPct / 100);
        const sDef = Math.round(e.baseDef * f.passive.stealPct / 100);
        const sHp  = Math.round(e.maxHp   * f.passive.stealPct / 100);
        f.baseAtk += sAtk; f.baseDef += sDef; f.maxHp += sHp; f.hp += sHp;
        // Lifesteal: permanent % of damage dealt heals hunter
        if (f.passive.lifesteal && !f._lifestealApplied) {
          f._lifestealPct = f.passive.lifesteal;
          f._lifestealApplied = true;
        }
        const fElId = getFighterElId(f);
        spawnFloatingNum(fElId, `+${sAtk}攻+${sDef}防+${sHp}HP`, 'passive-num', 300, 0);
        spawnFloatingNum(fElId, `吸血${f.passive.lifesteal}%`, 'heal-num', 500, -15);
        updateHpBar(f, fElId);
        updateFighterStats(f, fElId);
        addLog(`${f.emoji}${f.name} 吸收属性：<span class="log-passive">攻+${sAtk} 防+${sDef} HP+${sHp} 吸血${f.passive.lifesteal}%</span>`);

        if (checkBattleEnd()) return;
        await sleep(600);
      }
    }
  }
}

// ── FORTUNE GOLD PASSIVE (per batch end) ──────────────────
async function processFortuneGold() {
  for (const f of allFighters) {
    if (!f.alive || !f.passive || f.passive.type !== 'fortuneGold') continue;
    const roll = 1 + Math.floor(Math.random() * 6);
    f._goldCoins += roll;
    const fElId = getFighterElId(f);
    spawnFloatingNum(fElId, `+${roll}🪙`, 'passive-num', 0, 0);
    addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">获得${roll}金币（共${f._goldCoins}）</span>`);
    await sleep(300);
  }
}

// ── LIGHTNING STORM PASSIVE (per batch end) ───────────────
async function processLightningStorm() {
  for (const f of allFighters) {
    if (!f.alive || !f.passive || f.passive.type !== 'lightningStorm') continue;
    const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
    if (!enemies.length) continue;
    const target = enemies[Math.floor(Math.random() * enemies.length)];
    const shockDmg = Math.round(f.atk * f.passive.shockScale);
    // Pierce damage through applyRawDmg
    applyRawDmg(f, target, shockDmg, true);
    const eElId = getFighterElId(target);
    spawnFloatingNum(eElId, `⚡${shockDmg}`, 'pierce-dmg', 0, 0);
    updateHpBar(target, eElId);
    addLog(`${f.emoji}${f.name} 被动：<span class="log-pierce">⚡电击${target.emoji}${target.name} ${shockDmg}穿透</span>`);
    // Trigger on-hit effects (shock stack, trap, reflect, etc.)
    await triggerOnHitEffects(f, target, shockDmg);
    checkDeaths(f);
    if (checkBattleEnd()) return;
    await sleep(600);
  }
}

// ── DAMAGE STATS PANEL ────────────────────────────────────
function updateDmgStats() {
  const body = document.getElementById('dmgStatsBody');
  if (!body || !allFighters.length || body.classList.contains('ds-hidden')) return;

  const byDealt = [...allFighters].sort((a,b) => b._dmgDealt - a._dmgDealt);
  const byTaken = [...allFighters].sort((a,b) => b._dmgTaken - a._dmgTaken);
  const maxDealt = Math.max(1, ...byDealt.map(f => f._dmgDealt));
  const maxTaken = Math.max(1, ...byTaken.map(f => f._dmgTaken));

  function dealtRow(f, max) {
    const total = f._dmgDealt || 0;
    const normal = f._normalDmgDealt || 0;
    const pierce = f._pierceDmgDealt || 0;
    const normalPct = total > 0 ? normal / max * 100 : 0;
    const piercePct = total > 0 ? pierce / max * 100 : 0;
    const side = f.side === 'left' ? 'ds-left' : 'ds-right';
    const dead = f.alive ? '' : 'ds-dead';
    return `<div class="ds-row ${side} ${dead}">
      <div class="ds-name">${f.emoji} ${f.name}</div>
      <div class="ds-val">${total} <span class="ds-normal">${normal}</span>/<span class="ds-pierce">${pierce}</span></div>
      <div class="ds-bar-wrap">
        <div class="ds-bar ds-bar-normal" style="width:${normalPct}%"></div>
        <div class="ds-bar ds-bar-pierce" style="width:${piercePct}%;left:${normalPct}%"></div>
      </div>
    </div>`;
  }

  function takenRow(f, max) {
    const val = f._dmgTaken || 0;
    const pct = val / max * 100;
    const side = f.side === 'left' ? 'ds-left' : 'ds-right';
    const dead = f.alive ? '' : 'ds-dead';
    return `<div class="ds-row ${side} ${dead}">
      <div class="ds-name">${f.emoji} ${f.name}</div>
      <div class="ds-val">${val}</div>
      <div class="ds-bar-wrap"><div class="ds-bar ds-bar-taken" style="width:${pct}%"></div></div>
    </div>`;
  }

  body.innerHTML =
    `<div class="ds-section-title">⚔ 造成伤害 <span class="ds-legend"><span class="ds-normal">普通</span>/<span class="ds-pierce">穿透</span></span></div>` +
    byDealt.map(f => dealtRow(f, maxDealt)).join('') +
    `<div class="ds-section-title ds-section-gap">🛡 承受伤害</div>` +
    byTaken.map(f => takenRow(f, maxTaken)).join('');
}

function toggleDmgStats() {
  const body = document.getElementById('dmgStatsBody');
  const toggle = document.querySelector('.dmg-toggle');
  const hidden = body.classList.toggle('ds-hidden');
  toggle.textContent = hidden ? '▶' : '▼';
  if (!hidden) updateDmgStats();
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
// Helper: apply raw damage to target (through shields), track stats
// Returns { hpLoss, shieldAbs, bubbleAbs }
function applyRawDmg(source, target, amount, isPierce) {
  let rem = amount, bubbleAbs = 0, shieldAbs = 0;
  if (target.bubbleShieldVal > 0) { bubbleAbs = Math.min(target.bubbleShieldVal, rem); target.bubbleShieldVal -= bubbleAbs; rem -= bubbleAbs; }
  if (target.shield > 0 && rem > 0) { shieldAbs = Math.min(target.shield, rem); target.shield -= shieldAbs; rem -= shieldAbs; }
  target.hp = Math.max(0, target.hp - rem);
  if (target.hp <= 0) target.alive = false;
  // Real-time tracking for custom skills (doDamage tracks its own)
  if (source && source._dmgDealt !== undefined) {
    source._dmgDealt += amount;
    if (isPierce) source._pierceDmgDealt += amount;
    else source._normalDmgDealt += amount;
  }
  if (target._dmgTaken !== undefined) target._dmgTaken += amount;
  updateDmgStats();
  return { hpLoss: rem, shieldAbs, bubbleAbs };
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
