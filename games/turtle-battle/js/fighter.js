// ══════════════════════════════════════════════════════════
// fighter.js — Fighter creation, passive skills, loadouts
// Depends on: engine.js (globals)
// ══════════════════════════════════════════════════════════

// ── FIGHTER FACTORY ───────────────────────────────────────
function createFighter(petId, side, equippedIdxs) {
  const b = ALL_PETS.find(p => p.id === petId);
  const hp  = b.hp;
  const atk = b.atk;
  const def = b.def;
  const mr  = b.mr !== undefined ? b.mr : b.def;
  return {
    id:b.id, name:b.name, emoji:b.emoji, rarity:b.rarity, side,
    img:b.img, sprite:b.sprite || null,
    _equippedIdxs: equippedIdxs || (b.defaultSkills) || [0,1,2],
    maxHp:hp, hp:hp, shield:0,
    baseAtk:atk, baseDef:def, baseMr:mr,
    atk, def, mr,
    // Initial snapshot (never modified, for UI color comparison)
    _initHp:hp, _initAtk:atk, _initDef:def, _initMr:mr, _initCrit: b.crit || 0.08, _initArmorPen:0, _initMagicPen:0, _initLifesteal:0,
    crit: b.crit || 0.08,
    armorPen: 0,
    armorPenPct: 0,  // 百分比护甲穿透
    magicPen: 0,
    magicPenPct: 0,  // 百分比魔抗穿透
    passive: b.passive || null,
    passiveUsedThisTurn: false,  // for once-per-turn passives like shieldOnHit
    _position: 'front', // front or back (set by player in formation screen)
    alive:true,
    buffs: [],
    bubbleStore: 0,      // 泡泡龟被动储存值
    bubbleShieldVal: 0,  // 泡泡盾当前值(与普通护盾分开)
    bubbleShieldTurns: 0,// 泡泡盾剩余回合
    bubbleShieldOwner: null,
    _shockStacks: 0,
    _goldCoins: 0,
    _drones: [],
    _twoHeadForm: 'ranged',  // 双头龟形态
    _formHpGain: 0, _formDefGain: 0, _formAtkLoss: 0, // 形态切换记录
    _rangedSkills: null,     // 保存远程技能组
    _isMech: false,
    _starEnergy: 0,          // 星际龟星能
    _deathProcessed: false,
    _dmgDealt: 0,            // 伤害统计：总造成
    _dmgTaken: 0,            // 伤害统计：总承受
    _physDmgDealt: 0, _magicDmgDealt: 0, _trueDmgDealt: 0,
    _physDmgTaken: 0, _magicDmgTaken: 0, _trueDmgTaken: 0,
    _summon: null,            // 缩头乌龟随从
    _summonElId: null,        // 随从卡片DOM id
    _storedEnergy: 0,         // 龟壳储能值
    _auraAwakened: false,     // 龟壳气场觉醒标记
    _auraLifesteal: 0,        // 龟壳觉醒生命偷取
    _auraReflect: 0,          // 龟壳觉醒反伤
    _bambooCharged: false,    // 竹叶龟竹编充能状态
    _bambooCounter: 0,       // 竹叶龟充能计数器
    _bambooGainedHp: 0,      // 竹叶龟被动累计获得HP
    _hunterKills: 0,         // 猎人龟斩杀计数
    _hunterStolenAtk: 0,     // 猎人龟累计吸收攻击
    _hunterStolenDef: 0,     // 猎人龟累计吸收防御
    _hunterStolenHp: 0,      // 猎人龟累计吸收HP
    _diamondCollideCount: {},  // 钻石龟碰撞计数 {fighterIdx: count}
    _inkStacks: 0,            // 线条龟墨迹层数(被标记方)
    _inkLink: null,           // 线条龟连笔链接 {partner:fighterRef, turns:N, transferPct:30}
    _undeadLockTurns: 0,      // 无头龟锁血剩余回合
    _undeadLockUsed: false,   // 无头龟锁血是否已用
    _lavaRage: 0,             // 熔岩龟怒气值
    _lavaTransformed: false,  // 熔岩龟是否已变身
    _lavaTransformTurns: 0,   // 熔岩龟变身剩余回合
    _lavaSpent: false,        // 熔岩龟变身已用完
    _lavaSmallSkills: null,   // 熔岩龟小形态技能备份
    _chestTreasure: 0,        // 宝箱龟财宝值
    _chestEquips: [],         // 宝箱龟已装备列表 [{id,icon,name,desc,stat,...}]
    _chestTier: 0,            // 宝箱龟当前装备层数
    _goldLightning: 0,        // 宝箱龟雷刃金闪电层数
    _crystallize: 0,          // 水晶龟结晶层数(被标记方)
    _collideStacks: 0,        // 钻石龟碰撞标记(被标记方)
    skills: (function() {
      const pool = b.skillPool || b.skills || [];
      if (pool.length > 0) {
        const idxs = equippedIdxs || b.defaultSkills || [0,1,2];
        return idxs.filter(i => i < pool.length).map(i => ({ ...pool[i], cdLeft:0 })).filter(s => !s.passiveSkill);
      }
      return (b.skills || []).map(s => ({ ...s, cdLeft:0 })).filter(s => !s.passiveSkill);
    })(),
    _passiveSkills: (function() {
      const pool = b.skillPool || b.skills || [];
      if (pool.length > 0) {
        const idxs = equippedIdxs || b.defaultSkills || [0,1,2];
        return idxs.filter(i => i < pool.length).map(i => ({ ...pool[i] })).filter(s => s.passiveSkill);
      }
      return (b.skills || []).map(s => ({ ...s })).filter(s => s.passiveSkill);
    })(),
  };
}

// Apply passive skill effects at battle start
function applyPassiveSkills(f) {
  if (!f._passiveSkills || !f._passiveSkills.length) return;
  for (const ps of f._passiveSkills) {
    // 竹叶龟 强化生长: enhance charge values
    if (ps.type === 'bambooCharged') {
      if (f.passive && f.passive.type === 'bambooCharge') {
        f.passive = { ...f.passive, atkPct:100, selfHpPct:16, healSelfHpPct:12, hpGainAtkPct:130 };
      }
    }
    // 天使龟 圣光(重生): grant revive
    if (ps.type === 'angelRevive') {
      f._angelRevive = true;
    }
    // 寒冰龟 极寒: burn immune + bonus vs fire types
    if (ps.type === 'iceBurnImmune') {
      f._burnImmune = true;
      f._bonusDmgTargets = ['lava','phoenix'];
      f._bonusDmgPct = 40;
    }
    // 忍者龟 忍者足: extra dodge + crit
    if (ps.type === 'ninjaFeet') {
      f._extraDodge = (f._extraDodge||0) + 25;
      f.crit += 0.40;
    }
    // 双头龟 融合: gain melee form stats without switching
    if (ps.type === 'twoHeadFusion') {
      f._fusionMode = true;
      if (f.passive && f.passive.type === 'twoHeadDual') {
        const hpGain = Math.round(f.atk * f.passive.hpScale);
        const defGain = Math.round(f.atk * f.passive.defScale);
        f.maxHp += hpGain; f.hp += hpGain;
        f.baseDef += defGain; f.def += defGain;
        f.baseMr += defGain; f.mr += defGain;
      }
      // Remove switch skills from active skills
      f.skills = f.skills.filter(s => s.type !== 'twoHeadSwitch');
    }
    // 幽灵龟 强化怨灵: curse on spawn + 50% curse damage
    if (ps.type === 'ghostEnhancedCurse') {
      f._ghostCurseOnSpawn = true;
      f._ghostCurseDmgMult = 1.5;
    }
    // 钻石龟 强化钻石结构: enhanced def amplification + flat reduction
    if (ps.type === 'diamondEnhanced') {
      f._diamondEnhanced = true;
      // Will be processed in passive application — overrides base passive values
    }
    // 赛博龟 强化浮游炮: 20 cap, 2/turn, 12% dmg, mech gets armor/mr
    if (ps.type === 'cyberEnhancedDrone') {
      f._cyberEnhanced = true;
      if (f.passive && f.passive.type === 'cyberDrone') {
        f.passive = { ...f.passive, maxDrones: 20, droneScale: 0.12, dronesPerTurn: 2 };
      }
    }
    // 凤凰龟 强化涅槃: revive at 100% HP + ATK boost
    if (ps.type === 'phoenixEnhancedRebirth') {
      f._phoenixEnhancedRebirth = true;
    }
    // 熔岩龟 强化熔岩之心: start with 100 rage (instant transform)
    if (ps.type === 'lavaEnhancedRage') {
      f._lavaStartFull = true;
    }
    // 宝箱龟 寻宝直觉: lower thresholds
    if (ps.type === 'chestIntuition') {
      if (f.passive && f.passive.type === 'chestTreasure') {
        f.passive = { ...f.passive, thresholds: [60, 120, 220, 350, 500] };
      }
    }
    // 宝箱龟 贪婪: +4%ATK +7%HP per equip
    if (ps.type === 'chestGreed') {
      f._chestGreed = true;
    }
    // 赌神龟 强化多重打击: lose 30% HP, multi-hit chance 40→60
    if (ps.type === 'gamblerEnhancedMulti') {
      const hpLoss = Math.round(f.maxHp * 0.3);
      f.maxHp -= hpLoss;
      f.hp = f.maxHp;
      f._initHp = f.maxHp;
      if (f.passive && f.passive.type === 'gamblerMultiHit') {
        f.passive = { ...f.passive, chance: 60 };
      }
    }
    // 赌神龟 命运之轮: mark for per-turn card draw
    if (ps.type === 'gamblerFateWheel') {
      f._fateWheel = true;
    }
    // 水晶龟 不朽: mark for turn 10 bonus
    if (ps.type === 'crystalImmortal') {
      f._crystalImmortal = true;
    }
    // 缩头乌龟 强化喊龟: self HP -50%, summon HP 40%→110%
    if (ps.type === 'hidingEnhancedSummon') {
      f._enhancedSummon = true;
      // Reduce own HP by 50%
      const hpLoss = Math.round(f.maxHp * 0.5);
      f.maxHp -= hpLoss;
      f.hp = f.maxHp;
      f._initHp = f.maxHp;
      // Boost summon HP — change passive hpPct from 40 to 110
      if (f.passive && f.passive.type === 'summonAlly') {
        f.passive = { ...f.passive, hpPct: 110 };
      }
    }
    // 海盗龟 海盗船: disable passive true damage, summon ship on turn 3
    if (ps.type === 'pirateShipPassive') {
      f._pirateShipEnabled = true;
      // Disable the passive true damage
      if (f.passive && f.passive.type === 'pirateBarrage') {
        f.passive.bombardPct = 0;
        f.passive.deathHookPct = 0;
      }
    }
    // 彩虹龟 强化棱镜: 7 colors, pick 2
    if (ps.type === 'rainbowEnhancedPrism') {
      f._enhancedPrism = true;
    }
    // 线条龟 速写: ink cap 7 + convert to true damage
    if (ps.type === 'lineSpeedWrite') {
      f._inkCapOverride = 7;
      f._inkTrueDmg = true;
    }
    // 骰子龟 真正的赌徒: convert all DEF→armorPen, MR→magicPen
    if (ps.type === 'diceGamblerConvert') {
      const defConvert = f.baseDef;
      const mrConvert = f.baseMr;
      f.armorPen += defConvert;
      f.magicPen += mrConvert;
      f.baseDef = 0; f.def = 0;
      f.baseMr = 0; f.mr = 0;
      f._diceGamblerConverted = true;
    }
  }
}

function getSkillPool(petId) {
  const b = ALL_PETS.find(p => p.id === petId);
  return b ? (b.skillPool || b.skills || []) : [];
}

function getSavedLoadout(petId) {
  try {
    const data = JSON.parse(localStorage.getItem('skillLoadouts') || '{}');
    return data[petId] || null;
  } catch(e) { return null; }
}

function saveLoadout(petId, indices) {
  try {
    const data = JSON.parse(localStorage.getItem('skillLoadouts') || '{}');
    data[petId] = indices;
    localStorage.setItem('skillLoadouts', JSON.stringify(data));
  } catch(e) {}
}

function aiPickSkills(petId) {
  const b = ALL_PETS.find(p => p.id === petId);
  if (!b || !b.skillPool || b.skillPool.length <= 3) return null;
  const pool = b.skillPool;
  // Always include skill 0 (basic attack)
  const indices = [0];
  // Pick 2 more from remaining (exclude passiveSkills for AI, at most 1 passive allowed)
  const available = pool.map((s,i) => i).filter(i => i !== 0);
  // Prefer active skills, allow max 1 passive
  const actives = available.filter(i => !pool[i].passiveSkill);
  const passives = available.filter(i => pool[i].passiveSkill);
  // Pick 1 active damage skill first
  const dmgIdxs = actives.filter(i => !pool[i].isAlly && pool[i].type !== 'heal' && pool[i].type !== 'shield');
  if (dmgIdxs.length) indices.push(dmgIdxs[Math.floor(Math.random() * dmgIdxs.length)]);
  // Fill to 3: prefer actives, 30% chance to pick passive
  const remaining = available.filter(i => !indices.includes(i));
  while (indices.length < 3 && remaining.length) {
    const usePassive = passives.length && Math.random() < 0.3 && !indices.some(i => pool[i].passiveSkill);
    const pickFrom = usePassive ? passives.filter(i => !indices.includes(i)) : actives.filter(i => !indices.includes(i));
    const src = pickFrom.length ? pickFrom : remaining.filter(i => !indices.includes(i));
    if (!src.length) break;
    indices.push(src[Math.floor(Math.random() * src.length)]);
  }
  return indices.sort((a,b) => a-b);
}
