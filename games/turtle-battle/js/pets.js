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
   穿甲: 固定穿甲(armorPen)无视X点防御 + 百分比穿甲(armorPenPct)无视X%防御  */
const RARITY_MULT = { C:1.00, B:1.03, A:1.06, S:1.09, SS:1.12, SSS:1.15 };
const DEF_CONSTANT = 40; // DEF/(DEF+K) formula constant
// 计算有效防御：先扣百分比穿甲，再扣固定穿甲
function calcEffDef(atk, tgt) {
  return Math.max(0, tgt.def * (1 - (atk.armorPenPct || 0)) - (atk.armorPen || 0));
}
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
  { id:'basic',     name:'小龟',     emoji:'🐢',      rarity:'C',   hp:320,  atk:38,  def:12, spd:10, crit:0.25,
    img:'../../assets/pets/基础小龟v1.png', sprite:{frames:8,frameW:64,frameH:64,duration:800},
    passive:{ type:'basicTurtle', bonusMap:{C:0,B:8,A:16,S:24,SS:32,SSS:48},
              desc:'对敌人按稀有度增伤(B+8%...SSS+48%)' },
    skills:[
      { name:'攻击', type:'physical', hits:2, power:0, pierce:0, cd:0, atkScale:0.6, selfAtkUpPct:{pct:15, turns:2},
        brief:'小龟攻击2段，共{N:0.6*ATK*2}普通伤害，自身攻击+15% 2回合',
        detail:'小龟对单体打击2段，每段 60%×(攻击力={ATK}) = {N:0.6*ATK} 普通伤害，共 120%×(攻击力={ATK}) = {N:0.6*ATK*2}。\n自身攻击+15% 2回合。' },
      { name:'龟盾', type:'turtleShieldBash', hits:1, power:0, pierce:0,
        desc:'0.8×ATK伤害，获得50%伤害值的永久护盾',
        cd:2, atkScale:0.8, shieldFromDmgPct:50 },
      { name:'打击', type:'basicBarrage', hits:10, power:0, pierce:0,
        desc:'10段共2.5×ATK随机分布敌方',
        cd:5, atkScale:2.5 },
    ]},
  { id:'stone',     name:'石头龟',   emoji:'🪨🐢',    rarity:'C',   hp:380,  atk:35,  def:18, spd:6, crit:0.25,
    img:'../../assets/pets/石头龟v1.png', sprite:{frames:10,frameW:500,frameH:500,duration:1000},
    passive:{ type:'stoneWall', defGain:2, maxDef:16, reflectBase:10, reflectPerDef:1, desc:'每回合+2防御(上限+16)；受伤反弹 (10%+1%×防御={DEF}) = {N:10+DEF}% 伤害' },
    skills:[
      { name:'打击',     type:'physical', hits:2, power:0, pierce:0, cd:0, atkScale:0.25, defScale:1,
        brief:'石头龟打击2段，共{N:0.25*ATK*2}+{D:1*DEF*2}普通伤害（攻击力+防御力加成）',
        detail:'石头龟对单体目标打击2段，每段造成 25%×(攻击力={ATK}) = {N:0.25*ATK} + 100%×(防御={DEF}) = {D:1*DEF} 普通伤害，共 {N:0.25*ATK*2}+{D:1*DEF*2} 普通伤害。' },
      { name:'岩石护甲', type:'shield', hits:1, power:0, shield:0, cd:3, aoeAlly:true, shieldFlat:20, shieldHpPct:15, shieldDuration:3,
        brief:'石头龟为全体友军施加{S:20+HP*0.15}护盾，持续3回合',
        detail:'石头龟为全体友军施加护盾，20 + 15%×(最大HP={HP}) = {S:20+HP*0.15} 护盾，持续3回合。\n冷却{cd}回合。' },
      { name:'磐石',     type:'heal', hits:1, power:0, heal:0, cd:4, defUpPct:{pct:20,turns:3},
        brief:'石头龟为友方提升防御{B:DEF*0.2}点（{defUpPctVal}%），持续{defUpPctTurns}回合',
        detail:'石头龟为友方单体目标提升防御 {defUpPctVal}% = {B:DEF*0.2}点，持续{defUpPctTurns}回合。\n冷却{cd}回合。' },
    ]},
  { id:'bamboo',    name:'竹叶龟',   emoji:'🎋🐢',    rarity:'C',   hp:300,  atk:40,  def:10, spd:12, crit:0.25,
    img:'../../assets/pets/竹叶龟v1.png', sprite:{frames:10,frameW:500,frameH:400,duration:1000},
    passive:{ type:'turnScaleHp', pct:3, desc:'每回合最大生命+3%' },
    skills:[
      { name:'竹鞭',     type:'physical', hits:2, power:22,  pierce:0,   desc:'连抽2下',          cd:0 },
      { name:'叶刃风暴', type:'physical', hits:3, power:20,  pierce:5,   desc:'3段叶刃，5穿透',   cd:3, dot:{dmg:15,turns:2} },
      { name:'自然恢复', type:'heal',     hits:1, power:0,   heal:50,    desc:'恢复50HP',         cd:3 },
    ]},
  // B级
  { id:'angel',     name:'天使龟',   emoji:'😇🐢',    rarity:'B',   hp:330,  atk:40,  def:13, spd:11, crit:0.25,
    img:'../../assets/pets/天使龟v1.png', sprite:{frames:8,frameW:248,frameH:200,duration:800},
    passive:{ type:'judgement', hpPct:9, desc:'每段攻击附带目标当前9%HP普通伤害' },
    skills:[
      { name:'裁决', type:'physical', hits:4, power:0, pierce:0, cd:0, atkScale:0.3,
        brief:'天使龟裁决4段，共{N:0.3*ATK*4}普通伤害，每段触发裁决被动',
        detail:'天使龟对单体打击4段，每段 30%×(攻击力={ATK}) = {N:0.3*ATK} 普通伤害，共 120%×(攻击力={ATK}) = {N:0.3*ATK*4}。\n每段触发被动裁决（按稀有度增伤）。' },
      { name:'祝福', type:'angelBless', hits:1, power:0, pierce:0,
        desc:'友方获得1.2×ATK护盾4回合 + 防御+0.12×ATK 4回合',
        cd:4, shieldScale:1.2, shieldTurns:4, defBoostScale:0.12, defBoostTurns:4 },
      { name:'平等', type:'angelEquality', hits:2, power:0, pierce:0,
        desc:'0.6×ATK普通+0.6×ATK穿透，S级以上必暴击并回复总伤10%HP',
        cd:5, normalScale:0.6, pierceScale:0.6,
        antiHighRarity:['S','SS'], forceCrit:true, healPctOfDmg:10 },
    ]},
  { id:'ice',       name:'寒冰龟',   emoji:'❄️🐢',    rarity:'B',   hp:340,  atk:38,  def:14, spd:9, crit:0.25,
    img:'../../assets/pets/寒冰龟.png',
    passive:{ type:'frostAura', atkDownPct:15, atkDownTurns:6,
              bonusTargets:['lava','phoenix'], bonusDmgPct:20,
              desc:'登场敌方全体ATK-15%持续6回合，对熔岩龟/凤凰龟+20%伤害' },
    skills:[
      { name:'冰锥', type:'iceSpike', hits:6, power:0, pierce:0,
        desc:'6段交替普通/穿透共1.2×ATK', cd:0, totalScale:1.2 },
      { name:'冰盾', type:'shield', hits:1, power:0, pierce:0, shield:0,
        desc:'友方获得1.2×ATK护盾', cd:3, shieldAtkScale:1.2 },
      { name:'冰霜', type:'iceFrost', hits:1, power:0, pierce:0,
        desc:'全体敌方1×ATK穿透伤害', cd:4, atkScale:1.0 },
    ]},
  { id:'ninja',     name:'忍者龟',   emoji:'🥷🐢',    rarity:'B',   hp:290,  atk:42,  def:9,  spd:15, crit:0.25,
    img:'../../assets/pets/忍者龟.png',
    passive:{ type:'ninjaInstinct', critBonus:30, critDmgBonus:20, armorPen:5, desc:'+30%暴击+20%爆伤+5穿甲' },
    skills:[
      { name:'飞镖',     type:'ninjaShuriken', hits:1, power:0, pierce:0, cd:0, atkScale:1.5,
        brief:'忍者龟投掷飞镖造成{N:atkScale*ATK}普通伤害，暴击时转为{P:atkScale*ATK}穿透伤害',
        detail:'忍者龟对单体目标投掷飞镖，造成 150%×(攻击力={ATK}) = {N:atkScale*ATK} 普通伤害。\n暴击时，全部伤害转为 {P:atkScale*ATK} 穿透伤害（无视防御）。' },
      { name:'陷阱',     type:'ninjaTrap', hits:1, power:0, pierce:0, cd:3, trapScale:2,
        brief:'忍者龟在友方身上布置隐形夹子，被攻击时触发{N:trapScale*ATK}普通伤害',
        detail:'忍者龟在友方单体身上布置隐形夹子（对手不可见）。\n该友方被攻击时触发，对攻击者造成 200%×(攻击力={ATK}) = {N:trapScale*ATK} 普通伤害，一次性消耗。\n冷却{cd}回合。' },
      { name:'炸弹',     type:'ninjaBomb', hits:1, power:0, pierce:0, cd:4, atkScale:0.8, armorBreak:{pct:25,turns:3},
        brief:'忍者龟对全体敌方造成{N:atkScale*ATK}普通伤害，施加{armorBreakPct}%破甲{armorBreakTurns}回合',
        detail:'忍者龟对全体敌方造成 80%×(攻击力={ATK}) = {N:atkScale*ATK} 普通伤害。\n施加 {armorBreakPct}% 破甲（防御削减）{armorBreakTurns}回合。\n冷却{cd}回合。' },
    ]},
  { id:'two_head',  name:'双头龟',   emoji:'🐢🐢',    rarity:'B',   hp:280,  atk:49,  def:10, spd:7, crit:0.25,
    img:'../../assets/pets/双头龟.png',
    passive:{ type:'twoHeadDual', hpScale:1.5, defScale:0.15, atkLossScale:0.3, shieldScale:1.0,
              desc:'双形态切换：远程(高攻低防) ↔ 近战(+{H:ATK*1.5}HP +{D:ATK*0.15}防 -{N:ATK*0.3}攻 +{S:ATK}盾)' },
    // 远程技能组（默认）
    skills:[
      { name:'魔法波', type:'twoHeadMagicWave', hits:4, power:0, pierce:0, cd:0, atkScale:0.4,
        brief:'双头龟发射4段魔法波，普通/穿透交替，共{N:0.4*ATK*4}伤害',
        detail:'双头龟对单体发射4段魔法波，奇数段造成 40%×(攻击力={ATK}) = {N:0.4*ATK} 普通伤害，偶数段造成 {P:0.4*ATK} 穿透伤害。\n共 160%×(攻击力={ATK}) = {N:0.4*ATK*4} 混合伤害。' },
      { name:'灵能冲击', type:'physical', hits:1, power:0, pierce:0, cd:4, aoe:true, atkScale:0.8, hpPct:9,
        brief:'双头龟对全体敌方造成{N:0.8*ATK}普通伤害+9%目标最大HP',
        detail:'双头龟对全体敌方造成 80%×(攻击力={ATK}) = {N:0.8*ATK} + 9%目标最大HP 普通伤害。\n冷却{cd}回合。' },
      { name:'切换近战', type:'twoHeadSwitch', hits:1, power:0, pierce:0, cd:3, switchTo:'melee',
        brief:'切换近战：+{H:ATK*1.5}HP +{D:ATK*0.15}防 -{N:ATK*0.3}攻，获得{S:ATK*1.0}护盾',
        detail:'双头龟切换为近战形态。\n最大HP +150%×ATK = {H:ATK*1.5}（当前HP按比例缩放）\n防御 +15%×ATK = {D:ATK*0.15}\n攻击 -30%×ATK = -{N:ATK*0.3}\n获得 100%×ATK = {S:ATK*1.0} 护盾\n冷却{cd}回合。' },
    ],
    // 近战技能组（切换后替换）
    meleeSkills:[
      { name:'锤击', type:'physical', hits:1, power:0, pierce:0, cd:0, atkScale:1.4,
        brief:'双头龟锤击造成{N:1.4*ATK}普通伤害',
        detail:'双头龟对单体目标造成 140%×(攻击力={ATK}) = {N:1.4*ATK} 普通伤害。' },
      { name:'吸收', type:'twoHeadAbsorb', hits:1, power:0, pierce:0, cd:2, atkScale:0.5, hpPct:5, healLostPct:12,
        brief:'双头龟造成{N:0.5*ATK}+5%目标HP普通伤害，回复12%已损生命值',
        detail:'双头龟对单体造成 50%×(攻击力={ATK}) = {N:0.5*ATK} + 5%目标最大HP 普通伤害。\n回复自身 12%已损生命值。\n冷却{cd}回合。' },
      { name:'切换远程', type:'twoHeadSwitch', hits:1, power:0, pierce:0, cd:3, switchTo:'ranged', atkScale:1.4, defReductionScale:0.1, defReductionTurns:4,
        brief:'切换远程并打出{N:1.4*ATK}普通伤害，减目标{D:ATK*0.1}防御4回合',
        detail:'双头龟切换为远程形态，属性还原。\n变形时打出 140%×(攻击力={ATK}) = {N:1.4*ATK} 普通伤害。\n减少目标 10%×ATK = {D:ATK*0.1} 防御值 4回合。\n冷却{cd}回合。' },
    ],
  },
  { id:'ghost',     name:'幽灵龟',   emoji:'👻🐢',    rarity:'B',   hp:280,  atk:42,  def:8,  spd:14, crit:0.25,
    img:'../../assets/pets/幽灵龟v1.png', sprite:{frames:17,frameW:500,frameH:500,duration:1700},
    passive:{ type:'deathExplode', pct:30, desc:'死亡时对击杀者造成 30%×(最大HP={HP}) = {N:HP*0.3} 伤害' },
    skills:[
      { name:'幽魂触碰', type:'magic',    hits:1, power:44,  pierce:25,  desc:'灵体攻击，减防20%',cd:0, defDown:{pct:20,turns:2} },
      { name:'虚化',     type:'shield',   hits:1, power:0,   shield:40,  desc:'虚化护盾40',       cd:2 },
      { name:'灵魂风暴', type:'magic',    hits:5, power:15,  pierce:20,  desc:'5段灵魂冲击',      cd:4, dot:{dmg:12,turns:3} },
    ]},
  { id:'diamond',   name:'钻石龟',   emoji:'💎🐢',    rarity:'B',   hp:350,  atk:35,  def:20, spd:8, crit:0.25,
    img:'../../assets/pets/钻石龟.png',
    passive:{ type:'shieldOnHit', amount:20, desc:'受击时获得20护盾(每回合1次)' },
    skills:[
      { name:'钻石切割', type:'physical', hits:1, power:42,  pierce:15,  desc:'锋利切割，减防15%',cd:0, defDown:{pct:15,turns:2} },
      { name:'钻石壁垒', type:'shield',   hits:1, power:0,   shield:100, desc:'获得100护盾',      cd:4 },
      { name:'折射光线', type:'magic',    hits:3, power:22,  pierce:10,  desc:'3段折射',          cd:3 },
    ]},
  { id:'fortune',   name:'财神龟',   emoji:'🧧🐢',    rarity:'B',   hp:330,  atk:38,  def:13, spd:10, crit:0.25,
    img:'../../assets/pets/财神龟v1.png', sprite:{frames:18,frameW:500,frameH:500,duration:1800},
    passive:{ type:'fortuneGold', desc:'每回合获得1~6金币，单位阵亡+8金币' },
    skills:[
      { name:'打击',     type:'physical', hits:3, power:0, pierce:0, cd:0, atkScale:0.4,
        brief:'财神龟打击3段，共{N:0.4*ATK*3}普通伤害',
        detail:'每段造成 40%×(攻击力={ATK}) = {N:0.4*ATK} 普通伤害 × 3段 = {N:0.4*ATK*3}' },
      { name:'骰子',     type:'fortuneDice', hits:1, power:0, pierce:0, cd:0, healPct:10,
        brief:'财神龟掷骰子获得1~6枚金币，并回复{H:HP*0.1}HP',
        detail:'财神龟掷骰子获得1~6枚金币，并回复 10%×(最大HP={HP}) = {H:HP*0.1} HP。' },
      { name:'梭哈',     type:'fortuneAllIn', hits:1, power:0, pierce:0, cd:999, perCoinAtkPierce:0.2, perCoinAtkNormal:0.2, oneTimeUse:true,
        brief:'财神龟消耗全部金币（当前{goldCoins}枚），每枚造成{N:ATK*0.2}普通+{P:ATK*0.2}穿透伤害（一场限一次）',
        detail:'财神龟消耗全部金币(当前{goldCoins}枚)，每枚造成1段混合伤害：\n20%×(攻击力={ATK}) = {N:ATK*0.2} 普通 + 20%×(攻击力={ATK}) = {P:ATK*0.2} 穿透。\n⚠ 一场只能使用一次。' },
    ]},
  { id:'dice',      name:'骰子龟',   emoji:'🎲🐢',    rarity:'B',   hp:320,  atk:40,  def:11, spd:11, crit:0.25,
    img:'../../assets/pets/骰子龟v1.png',
    passive:{ type:'lowHpCrit', pct:25, desc:'HP<30%时暴击率+25%' },
    skills:[
      { name:'骰子攻击', type:'physical', hits:1, power:50,  pierce:0,   desc:'随机倍率',         cd:0, random:true },
      { name:'幸运护盾', type:'shield',   hits:1, power:0,   shield:65,  desc:'获得65护盾',       cd:3 },
      { name:'全押！',   type:'physical', hits:3, power:30,  pierce:15,  desc:'3段赌命攻击',      cd:3, random:true },
    ]},
  // A级
  { id:'rainbow',   name:'彩虹龟',   emoji:'🌈🐢',    rarity:'A',   hp:340,  atk:40,  def:14, spd:12, crit:0.25,
    img:'../../assets/pets/彩虹龟.png',
    passive:{ type:'turnScaleAtk', pct:3, desc:'每回合攻击+3%' },
    skills:[
      { name:'七彩光束', type:'magic',    hits:1, power:50,  pierce:15,  desc:'彩虹攻击',         cd:0 },
      { name:'棱镜护盾', type:'shield',   hits:1, power:0,   shield:75,  desc:'获得75护盾',       cd:3 },
      { name:'全色风暴', type:'magic',    hits:7, power:14,  pierce:10,  desc:'七色各一击，减防',  cd:4, defDown:{pct:20,turns:2} },
    ]},
  { id:'gambler',   name:'赌神龟',   emoji:'🃏🐢',    rarity:'A',   hp:310,  atk:44,  def:10, spd:13, crit:0.25,
    img:'../../assets/pets/赌神龟v1.png', sprite:{frames:8,frameW:500,frameH:500,duration:800},
    passive:{ type:'gamblerMultiHit', chance:40, dmgScale:0.6, desc:'每段攻击40%概率触发额外 60%×(攻击力={ATK}) = {N:ATK*0.6} 打击（可连锁，递减）' },
    skills:[
      { name:'卡牌射击', type:'gamblerCards', hits:3, power:0, pierce:0, cd:0, minScale:0.3, maxScale:0.6,
        brief:'赌神龟射出3张牌，每段随机造成{N:ATK*0.3}~{N:ATK*0.6}普通伤害，可触发多重打击',
        detail:'赌神龟对单体目标射出3张牌，每段随机造成 30%~60%×(攻击力={ATK}) = {N:ATK*0.3}~{N:ATK*0.6} 普通伤害。\n每段可触发多重打击被动。' },
      { name:'抽牌',     type:'gamblerDraw', hits:1, power:0, pierce:0, cd:2,
        brief:'赌神龟随机抽一张牌：回复牌、炸弹牌或强化牌',
        detail:'赌神龟随机抽一张牌：\n💚回复牌：回复10%HP + 5%HP护盾\n💥炸弹牌：全体敌方 90%×(攻击力={ATK}) = {N:ATK*0.9} 伤害\n⚡强化牌：+15%ATK +25%暴击 +15%爆伤 +20%伤害转穿透 3回合\n冷却{cd}回合。' },
      { name:'赌注',     type:'gamblerBet', hits:6, power:0, pierce:0, cd:4, hpCostPct:50, multiBonus:20,
        brief:'赌神龟消耗50%当前HP化为6段强化攻击，多重打击概率提升至60%（需HP>50%）',
        detail:'赌神龟消耗当前50%HP，化为对单体目标的6段强化攻击。\n消耗的HP均分为每段穿透伤害加成。多重打击概率从40%提升至60%。\n需HP>50%才能使用。冷却{cd}回合。' },
    ]},
  { id:'hunter',    name:'猎人龟',   emoji:'🏹🐢',    rarity:'A',   hp:320,  atk:42,  def:12, spd:14, crit:0.25,
    img:'../../assets/pets/猎人龟v1.png', sprite:{frames:15,frameW:500,frameH:500,duration:1500},
    passive:{ type:'hunterKill', hpThresh:10, stealPct:20, lifesteal:10, desc:'任意攻击后猎杀HP<10%敌人，获取20%属性+10%吸血' },
    skills:[
      { name:'射箭',     type:'hunterShot', hits:3, power:0, pierce:0, cd:0, atkScale:0.47, execThresh:40, execCrit:40, execCritDmg:20,
        brief:'猎人龟打击3段，共{N:0.47*ATK*3}普通伤害，对低生命敌人获得额外暴击率和爆伤',
        detail:'猎人龟对单体目标射击3段，每段造成 47%×(攻击力={ATK}) = {N:0.47*ATK} 普通伤害，共 141%×(攻击力={ATK}) = {N:0.47*ATK*3} 普通伤害。\n如果目标HP低于{execThresh}%，则{hits}次攻击获得 {B:execCrit}% 额外暴击率和 {B:execCritDmg}% 额外爆伤。' },
      { name:'连珠箭',   type:'hunterBarrage', hits:10, power:0, pierce:0, cd:3, arrowScale:0.15,
        brief:'猎人龟发射{hits}根箭随机射向敌方，每根造成{P:arrowScale*ATK}穿透伤害，共{P:arrowScale*ATK*hits}',
        detail:'猎人龟发射{hits}根箭，随机分布到敌方单位。\n每根造成 15%×(攻击力={ATK}) = {P:arrowScale*ATK} 穿透伤害，共 150%×(攻击力={ATK}) = {P:arrowScale*ATK*hits} 穿透伤害。\n冷却{cd}回合。' },
      { name:'隐蔽',     type:'hunterStealth', hits:1, power:0, pierce:0, cd:4, dmgScale:0.8, dodgePct:25, dodgeTurns:3, shieldScale:1.2, shieldTurns:3,
        brief:'猎人龟射一箭造成{N:dmgScale*ATK}普通伤害，获得{B:dodgePct}%闪避{dodgeTurns}回合和{S:shieldScale*ATK}护盾',
        detail:'猎人龟对单体目标射一箭，造成 80%×(攻击力={ATK}) = {N:dmgScale*ATK} 普通伤害。\n随后获得 {B:dodgePct}% 闪避率 {dodgeTurns}回合，以及 120%×(攻击力={ATK}) = {S:shieldScale*ATK} 护盾。\n冷却{cd}回合。' },
    ]},
  { id:'pirate',    name:'海盗龟',   emoji:'🏴‍☠️🐢',  rarity:'A',   hp:350,  atk:39,  def:14, spd:11, crit:0.25,
    img:'../../assets/pets/海盗龟.png',
    passive:{ type:'deathHook', pct:25, desc:'死亡时钩锁击杀者，造成 25%×(最大HP={HP}) = {P:HP*0.25} 穿透伤害' },
    skills:[
      { name:'弯刀',     type:'physical', hits:4, power:0, pierce:0, cd:0, atkScale:0.3,
        brief:'海盗龟打击4段，共{N:0.3*ATK*4}普通伤害',
        detail:'海盗龟对单体目标打击4段，每段造成 30%×(攻击力={ATK}) = {N:0.3*ATK} 普通伤害，共 120%×(攻击力={ATK}) = {N:0.3*ATK*4} 普通伤害。' },
      { name:'火炮齐射', type:'physical', hits:6, power:0, pierce:0, cd:4, aoe:true, atkScale:0.15, hpPct:1.7,
        brief:'海盗龟对全体敌方开炮6段，共{N:0.15*ATK*6}普通伤害+10%目标最大HP',
        detail:'海盗龟对全体敌方开炮6段，每段造成 15%×(攻击力={ATK}) = {N:0.15*ATK} + 1.7%目标最大HP 普通伤害，共 90%×(攻击力={ATK}) = {N:0.15*ATK*6} + 10.2%目标最大HP 普通伤害。\n冷却{cd}回合。' },
      { name:'朗姆酒',   type:'heal', hits:1, power:0, heal:0, cd:3, hot:{hpPerTurn:38,turns:4}, defUp:{val:3,turns:2},
        brief:'海盗龟喝朗姆酒，持续回复{H:hotPerTurn}HP/回合共{hotTurns}回合，防御+{B:defUpVal}点{defUpTurns}回合',
        detail:'海盗龟喝朗姆酒，持续回复 {H:hotPerTurn}HP/回合 {hotTurns}回合（可叠加），并提升防御 +{B:defUpVal}点 持续{defUpTurns}回合。\n冷却{cd}回合。' },
    ]},
  { id:'candy',     name:'糖果龟',   emoji:'🍬🐢',    rarity:'A',   hp:340,  atk:38,  def:14, spd:11, crit:0.25,
    img:'../../assets/pets/糖果龟v1.png', sprite:{frames:10,frameW:500,frameH:500,duration:1000},
    passive:{ type:'turnScaleHp', pct:3, desc:'每回合最大生命+3%' },
    skills:[
      { name:'糖果弹',   type:'magic',    hits:2, power:26,  pierce:8,   desc:'2颗糖果弹，减攻',  cd:0, atkDown:{pct:15,turns:2} },
      { name:'棉花糖盾', type:'shield',   hits:1, power:0,   shield:85,  desc:'获得85护盾',       cd:3 },
      { name:'糖衣炮弹', type:'magic',    hits:4, power:20,  pierce:12,  desc:'4段甜蜜打击',      cd:3 },
    ]},
  { id:'bubble',    name:'泡泡龟',   emoji:'🫧🐢',    rarity:'A',   hp:320,  atk:40,  def:11, spd:13, crit:0.25,
    img:'../../assets/pets/气泡龟v1.png', sprite:{frames:8,frameW:500,frameH:500,duration:800},
    passive:{ type:'bubbleStore', pct:30, healPct:50, desc:'受伤储存30%为泡泡值，每回合回复储存值50%' },
    skills:[
      { name:'泡泡盾',   type:'bubbleShield', hits:1, power:0, pierce:0, cd:3, atkScale:1.5, duration:3, burstScale:0.8,
        brief:'泡泡龟为友方施加{S:atkScale*ATK}泡泡护盾{duration}回合，到期爆炸对敌全体造成{N:burstScale*ATK}普通伤害',
        detail:'泡泡龟为友方单体套上 150%×(攻击力={ATK}) = {S:atkScale*ATK} 泡泡护盾（与普通护盾独立），持续{duration}回合。\n自然到期（未被打破）时对全体敌方造成 80%×(攻击力={ATK}) = {N:burstScale*ATK} 普通伤害。\n冷却{cd}回合。' },
      { name:'泡泡攻击', type:'magic', hits:3, power:0, pierce:0, cd:0, atkScale:0.33,
        brief:'泡泡龟攻击3段，共{N:0.33*ATK*3}普通伤害',
        detail:'每段造成 33%×(攻击力={ATK}) = {N:0.33*ATK} 普通伤害 × 3段 = {N:0.33*ATK*3}' },
      { name:'泡泡束缚', type:'bubbleBind', hits:1, power:0, pierce:0, cd:4, duration:3, bindPct:30,
        brief:'泡泡龟标记敌方{duration}回合，友方攻击被标记目标获得伤害{bindPct}%的永久护盾',
        detail:'泡泡龟标记敌方单体{duration}回合。\n友方攻击被标记目标时，获得造成伤害×{bindPct}%的 {S:永久护盾}。\n冷却{cd}回合。' },
    ]},
  { id:'line',      name:'线条龟',   emoji:'✏️🐢',    rarity:'A',   hp:300,  atk:44,  def:9,  spd:15, crit:0.25,
    img:'../../assets/pets/线条龟v1.png', sprite:{frames:14,frameW:500,frameH:500,duration:1400},
    passive:{ type:'bonusDmgAbove60', pct:20, desc:'对HP>60%敌人+20%伤害' },
    skills:[
      { name:'一笔穿心', type:'physical', hits:1, power:55,  pierce:30,  desc:'极高穿透',         cd:0 },
      { name:'涂鸦乱舞', type:'physical', hits:5, power:15,  pierce:15,  desc:'5段乱画，减攻15%', cd:3, atkDown:{pct:15,turns:2} },
      { name:'橡皮擦',   type:'heal',     hits:1, power:0,   heal:70,    desc:'擦去伤痕回70HP',   cd:4 },
    ]},
  { id:'lightning', name:'闪电龟',   emoji:'⚡🐢',    rarity:'A',   hp:310,  atk:43,  def:8,  spd:17, crit:0.25,
    img:'../../assets/pets/闪电龟.png',
    passive:{ type:'lightningStorm', shockScale:1.0, stackMax:8, desc:'每回合电击随机敌人 100%×(攻击力={ATK}) = {P:ATK} 穿透；造成伤害叠电击层，满8层触发 {P:ATK} 穿透' },
    skills:[
      { name:'闪电打击', type:'lightningStrike', hits:5, power:0, pierce:0, cd:0, atkScale:0.26, splashPct:25,
        brief:'闪电龟打击5段，共{N:0.26*ATK*5}普通伤害，每段溅射{splashPct}%到次目标',
        detail:'闪电龟对单体目标打击5段，每段造成 26%×(攻击力={ATK}) = {N:0.26*ATK} 普通伤害，共 130%×(攻击力={ATK}) = {N:0.26*ATK*5} 普通伤害。\n每段对次目标造成主目标 {splashPct}% 溅射伤害。每段命中叠1层电击。' },
      { name:'威力增幅', type:'lightningBuff', hits:1, power:0, pierce:0, cd:4, atkUpPct:25, atkUpTurns:4,
        brief:'闪电龟为全体友方提升攻击力+{B:ATK*0.25}（{atkUpPct}%），持续{atkUpTurns}回合',
        detail:'闪电龟为全体友方提升攻击力 {atkUpPct}%×(攻击力={ATK}) = {B:ATK*0.25}点，持续{atkUpTurns}回合。\n冷却{cd}回合。' },
      { name:'雷暴',     type:'lightningBarrage', hits:20, power:0, pierce:0, cd:5, arrowScale:0.15,
        brief:'闪电龟释放{hits}次闪电随机命中敌方，每次{N:arrowScale*ATK}普通伤害，每次叠电击层',
        detail:'释放{hits}次闪电，随机分布到敌方。\n每次造成 15%×(攻击力={ATK}) = {N:arrowScale*ATK} 普通伤害。每次命中叠1层电击。\n冷却{cd}回合。' },
    ]},
  // S级
  { id:'phoenix',   name:'凤凰龟',   emoji:'🔥🐢',    rarity:'S',   hp:340,  atk:42,  def:14, spd:13, crit:0.25,
    img:'../../assets/pets/凤凰龟.png',
    passive:{ type:'phoenixRebirth', revivePct:25, desc:'首次死亡时以 25%×(最大HP={HP}) = {H:HP*0.25} HP复活' },
    skills:[
      { name:'灼烧',   type:'phoenixBurn',   hits:1, power:0, pierce:0, cd:0, atkScale:1.0, burnTurns:5, burnAtkScale:0.3, burnHpPct:5,
        brief:'凤凰龟造成{N:atkScale*ATK}普通伤害，施加灼烧{burnTurns}回合（每回合{N:burnAtkScale*ATK}+{burnHpPct}%目标HP）',
        detail:'凤凰龟对单体目标造成 100%×(攻击力={ATK}) = {N:atkScale*ATK} 普通伤害。\n施加灼烧{burnTurns}回合，每回合造成 30%×(攻击力={ATK}) = {N:burnAtkScale*ATK} + {burnHpPct}%目标最大HP 普通伤害。\n同一只凤凰龟的灼烧不叠加，重复施加只刷新持续时间。' },
      { name:'熔岩盾', type:'phoenixShield', hits:1, power:0, pierce:0, cd:4, shieldScale:1.0, duration:4, counterScale:0.25,
        brief:'凤凰龟获得{S:shieldScale*ATK}熔岩护盾{duration}回合，被攻击每段反击{N:counterScale*ATK}普通伤害',
        detail:'凤凰龟获得 100%×(攻击力={ATK}) = {S:shieldScale*ATK} 熔岩护盾，持续{duration}回合。\n有护盾时被攻击的每段反击 25%×(攻击力={ATK}) = {N:counterScale*ATK} 伤害。\n冷却{cd}回合。' },
      { name:'烫伤',   type:'phoenixScald',  hits:1, power:0, pierce:0, cd:3, atkScale:0.7, atkDown:{pct:15,turns:3}, defDown:{pct:15,turns:3}, shieldBreak:50,
        brief:'凤凰龟破坏{shieldBreak}%护盾，造成{N:atkScale*ATK}普通伤害，施加攻防各-{atkDownPct}%持续{atkDownTurns}回合',
        detail:'凤凰龟对单体目标施放烫伤。\n先破坏目标 {shieldBreak}% 的护盾值，再造成 70%×(攻击力={ATK}) = {N:atkScale*ATK} 普通伤害。\n施加攻击 -{atkDownPct}% 和防御 -{defDownPct}% 持续{atkDownTurns}回合。\n冷却{cd}回合。' },
    ]},
  { id:'lava',      name:'熔岩龟',   emoji:'🌋🐢',    rarity:'S',   hp:380,  atk:38,  def:18, spd:7, crit:0.25,
    img:'../../assets/pets/熔岩龟.png',
    passive:{ type:'counterAttack', pct:30, desc:'30%概率反击' },
    skills:[
      { name:'熔岩喷发', type:'magic',    hits:1, power:58,  pierce:18,  desc:'熔岩攻击，灼烧',   cd:0, dot:{dmg:25,turns:3} },
      { name:'岩浆护甲', type:'shield',   hits:1, power:0,   shield:110, desc:'获得110护盾',      cd:3 },
      { name:'火山爆发', type:'magic',    hits:5, power:22,  pierce:25,  desc:'5段火山，减攻25%', cd:4, atkDown:{pct:25,turns:2} },
    ]},
  { id:'cyber',     name:'赛博龟',   emoji:'🤖🐢',    rarity:'S',   hp:330,  atk:43,  def:13, spd:15, crit:0.25,
    img:'../../assets/pets/赛博龟.png',
    passive:{ type:'cyberDrone', droneScale:0.3, droneMaxAge:5, maxDrones:10, mechHpPer:30, mechAtkPer:5,
              desc:'每回合+1浮游炮（上限10），5回合后发射 30%×(攻击力={ATK}) = {N:ATK*0.3} 普通伤害；阵亡时浮游炮组装为机甲' },
    skills:[
      { name:'激光枪', type:'physical', hits:5, power:0, pierce:0, cd:0, atkScale:0.16, hpPct:2.4,
        brief:'赛博龟发射激光5段，共{N:0.16*ATK*5}普通伤害+12%目标最大HP',
        detail:'赛博龟对单体目标发射激光5段，每段造成 16%×(攻击力={ATK}) = {N:0.16*ATK} + 2.4%目标最大HP 普通伤害，共 80%×(攻击力={ATK}) = {N:0.16*ATK*5} + 12%目标最大HP 普通伤害。' },
      { name:'增益', type:'cyberBuff', hits:1, power:0, pierce:0, cd:3, selfAtkUpPct:{pct:35,turns:4},
        brief:'赛博龟提升自身攻击力{B:ATK*0.35}（35%），持续4回合',
        detail:'赛博龟提升自身攻击力 35%×(攻击力={ATK}) = {B:ATK*0.35}点，持续4回合。\n冷却3回合。' },
      { name:'部署', type:'cyberDeploy', hits:1, power:0, pierce:0, cd:2,
        brief:'赛博龟立即部署1个浮游炮（5回合后发射{N:ATK*0.3}普通伤害，上限10）',
        detail:'赛博龟立即生成1个浮游炮。\n浮游炮5回合后自动对随机敌人造成 30%×(攻击力={ATK}) = {N:ATK*0.3} 普通伤害。\n最多持有10个。冷却2回合。' },
    ]},
  { id:'crystal',   name:'水晶龟',   emoji:'🔮🐢',    rarity:'S',   hp:350,  atk:40,  def:16, spd:11, crit:0.25,
    img:'../../assets/pets/水晶龟v1.png', sprite:{frames:11,frameW:500,frameH:500,duration:1100},
    passive:{ type:'shieldOnHit', amount:25, desc:'受击时获得25护盾(每回合1次)' },
    skills:[
      { name:'水晶刺',   type:'magic',    hits:2, power:30,  pierce:12,  desc:'双段水晶',         cd:0 },
      { name:'水晶壁垒', type:'shield',   hits:1, power:0,   shield:100, desc:'获得100护盾',      cd:3 },
      { name:'碎晶风暴', type:'magic',    hits:7, power:16,  pierce:18,  desc:'7段碎晶，灼烧',    cd:4, dot:{dmg:18,turns:3} },
    ]},
  { id:'chest',     name:'宝箱龟',   emoji:'📦🐢',    rarity:'S',   hp:360,  atk:39,  def:15, spd:10, crit:0.25,
    img:'../../assets/pets/宝箱龟v1.png', sprite:{frames:11,frameW:300,frameH:200,duration:1100},
    passive:{ type:'healOnKill', pct:30, desc:'击杀时恢复30%最大HP' },
    skills:[
      { name:'宝箱砸击', type:'physical', hits:1, power:50,  pierce:10,  desc:'砸！减防20%',      cd:0, defDown:{pct:20,turns:2} },
      { name:'开箱惊喜', type:'heal',     hits:1, power:0,   heal:100,   desc:'开箱回100HP',      cd:4 },
      { name:'财宝风暴', type:'physical', hits:6, power:16,  pierce:12,  desc:'6段宝物飞射',      cd:4, atkDown:{pct:15,turns:2} },
    ]},
  { id:'space',     name:'星际龟',   emoji:'🚀🐢',    rarity:'S',   hp:320,  atk:44,  def:12, spd:16, crit:0.25,
    img:'../../assets/pets/星际龟v1.png', sprite:{frames:12,frameW:500,frameH:500,duration:1200},
    passive:{ type:'bonusDmgAbove60', pct:25, desc:'对HP>60%敌人+25%伤害' },
    skills:[
      { name:'星光射线', type:'magic',    hits:1, power:56,  pierce:22,  desc:'宇宙射线',         cd:0, dot:{dmg:15,turns:2} },
      { name:'星际跃迁', type:'shield',   hits:1, power:0,   shield:80,  desc:'跃迁护盾80',       cd:3 },
      { name:'流星暴雨', type:'magic',    hits:10,power:10,  pierce:15,  desc:'10段流星，减防',    cd:5, defDown:{pct:20,turns:2} },
    ]},
  // SS级
  { id:'hiding',    name:'缩头乌龟', emoji:'🫣🐢',    rarity:'SS',  hp:380,  atk:35,  def:22, spd:5, crit:0.25,
    img:'../../assets/pets/缩头乌龟v1.png', sprite:{frames:14,frameW:500,frameH:500,duration:1400},
    passive:{ type:'summonAlly', hpPct:40, maxRarity:'A',
              desc:'开局召唤一只A级以下龟(40%HP，属性/被动正常)，攻击后随从自动出招' },
    skills:[
      { name:'防御', type:'hidingDefend', hits:1, power:0, pierce:0, cd:3, shieldHpPct:20, shieldDuration:4, shieldHealPct:20,
        brief:'缩头乌龟获得{S:HP*0.2}护盾持续{shieldDuration}回合，到期回收剩余盾{shieldHealPct}%为HP',
        detail:'缩头乌龟获得 20%×(最大HP={HP}) = {S:HP*0.2} 护盾，持续{shieldDuration}回合。\n到期时将剩余护盾值的{shieldHealPct}%转化为HP回复。\n冷却{cd}回合。' },
      { name:'攻击', type:'physical', hits:1, power:0, pierce:0, cd:0, atkScale:1.0, selfDefUpPct:{pct:20,turns:2},
        brief:'缩头乌龟造成{N:atkScale*ATK}普通伤害，自身防御+{B:DEF*0.2}（20%）持续2回合',
        detail:'缩头乌龟对单体目标造成 100%×(攻击力={ATK}) = {N:atkScale*ATK} 普通伤害。\n自身防御提升 20%×(防御={DEF}) = {B:DEF*0.2}点，持续2回合。' },
      { name:'指挥', type:'hidingCommand', hits:1, power:0, pierce:0, cd:2,
        brief:'缩头乌龟命令随从出击，随从释放2次随机技能',
        detail:'缩头乌龟命令随从立即释放一个随机可用技能。\n回合结束后随从再自动释放一个（共2次出手）。\n如果随从已阵亡则无效。冷却{cd}回合。' },
    ]},
  { id:'headless',  name:'无头龟',   emoji:'💀🐢',    rarity:'SS',  hp:340,  atk:46,  def:10, spd:14, crit:0.25,
    img:'../../assets/pets/无头龟v1.png', sprite:{frames:17,frameW:500,frameH:500,duration:1700},
    passive:{ type:'deathExplode', pct:50, desc:'死亡时对击杀者造成 50%×(最大HP={HP}) = {N:HP*0.5} 伤害' },
    skills:[
      { name:'撕咬',   type:'physical', hits:2, power:0, pierce:0, cd:0, atkScale:0.4, hpPct:5,
        brief:'无头龟撕咬2段，共{N:0.4*ATK*2}普通伤害+{hpPct}%×2目标最大HP',
        detail:'每段造成 40%×(攻击力={ATK}) = {N:0.4*ATK} + {hpPct}%目标最大HP 普通伤害 × 2段' },
      { name:'恐吓',   type:'twoHeadFear', hits:1, power:0, pierce:0, cd:3, atkScale:1.0, fearTurns:3, fearReduction:30,
        brief:'无头龟造成{N:atkScale*ATK}普通伤害，施加恐惧{fearTurns}回合（对无头龟伤害-{fearReduction}%）',
        detail:'无头龟对单体目标造成 100%×(攻击力={ATK}) = {N:atkScale*ATK} 普通伤害。\n施加恐惧{fearTurns}回合：被恐惧目标对无头龟的普通伤害减少 {fearReduction}%（穿透伤害除外）。\n冷却{cd}回合。' },
      { name:'窃取',   type:'twoHeadSteal', hits:1, power:0, pierce:0, cd:4,
        brief:'无头龟窃取敌方目标一个随机技能并立即释放',
        detail:'无头龟窃取敌方单体目标的随机一个可用技能并立即以无头龟的属性释放。\n冷却{cd}回合。' },
    ]},
  // SSS级
  { id:'shell',     name:'龟壳',     emoji:'🐚',      rarity:'SSS', hp:360,  atk:42,  def:18, spd:12, crit:0.25,
    img:'../../assets/pets/龟壳v1.png', sprite:{frames:20,frameW:500,frameH:500,duration:2000},
    passive:{ type:'auraAwaken',
              awakenTurn:6,
              atkPct:10, defPct:10, hpPct:10,
              lifestealPct:10, reflectPct:10, armorPenPct:10,
              energyStore:true, energyReleaseTurn:9,
              energyDmgScale:0.008, energyShieldScale:0.01, energyShieldTurns:3,
              desc:'6回合后全面强化+10%；受伤储能，每9回合波击释放' },
    skills:[
      { name:'攻击', type:'shellStrike', hits:6, power:0, pierce:0,
        desc:'6段交替普通/穿透共1.2×ATK，每段溅射25%',
        cd:0, totalScale:1.2, splashPct:25 },
      { name:'复制', type:'shellCopy', hits:0, power:0, pierce:0,
        desc:'随机复制敌方2个技能并以60%效果释放',
        cd:4 },
    ]},
];

const RARITY_COLORS = { C:'#06d6a0', B:'#4cc9f0', A:'#3a9abf', S:'#c77dff', SS:'#ffd93d', SSS:'#ff6b6b' };

