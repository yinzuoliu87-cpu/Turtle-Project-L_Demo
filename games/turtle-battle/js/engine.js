// ── SEEDED RANDOM (for online sync) ──────────────────────
const _origMathRandom = Math.random;
let _rngSeed = 0;
function seedBattleRng(seed) {
  _rngSeed = seed | 0;
  Math.random = function() {
    _rngSeed = (_rngSeed * 1664525 + 1013904223) | 0;
    return (_rngSeed >>> 0) / 4294967296;
  };
}
function unseedBattleRng() { Math.random = _origMathRandom; }

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

// ── COMBO SKILLS ─────────────────────────────────────────
let _comboCdLeft = {}; // { comboIdx: turnsLeft }

function getAvailableCombos(side) {
  if (typeof COMBO_SKILLS === 'undefined') return [];
  const team = side === 'left' ? leftTeam : rightTeam;
  const aliveIds = team.filter(f => f.alive).map(f => f.id);
  return COMBO_SKILLS.filter((c, i) => c.ids.every(id => aliveIds.includes(id)) && !(_comboCdLeft[i] > 0));
}

async function executeCombo(combo, side) {
  const team = side === 'left' ? leftTeam : rightTeam;
  const enemies = side === 'left' ? rightTeam : leftTeam;
  const fighters = combo.ids.map(id => team.find(f => f.id === id && f.alive));
  if (fighters.some(f => !f)) return;

  // Mark both fighters as acted
  fighters.forEach(f => actedThisSide.add(allFighters.indexOf(f)));

  // Set combo CD
  const comboIdx = COMBO_SKILLS.indexOf(combo);
  if (comboIdx >= 0 && combo.cd) _comboCdLeft[comboIdx] = combo.cd;

  // Announce
  showSkillAnnounce(fighters[0], { name: combo.name });
  addLog(`<b style="color:#ffd93d">🤝 连携技！${fighters.map(f=>f.name).join(' + ')} → ${combo.name}！</b>`);
  await sleep(800);

  // Use higher ATK of the two
  const atkVal = Math.max(fighters[0].atk, fighters[1].atk);

  if (combo.aoeAlly && combo.shieldDefScale) {
    // Shield combo (stone+diamond)
    const defVal = Math.max(fighters[0].def, fighters[1].def);
    const shieldVal = Math.round(defVal * combo.shieldDefScale);
    for (const ally of team.filter(a => a.alive)) {
      ally.shield += shieldVal;
      spawnFloatingNum(getFighterElId(ally), `+${shieldVal}`, 'shield-label', 0, 0);
      updateHpBar(ally, getFighterElId(ally));
    }
    addLog(`${combo.icon} ${combo.name}：全队获得 ${shieldVal} 护盾`);
  } else if (combo.stealHpPct) {
    // Steal HP combo (candy+bubble)
    const aliveEnemies = enemies.filter(e => e.alive);
    for (const e of aliveEnemies) {
      const steal = Math.round(e.maxHp * combo.stealHpPct / 100);
      e.hp = Math.max(1, e.hp - steal);
      updateHpBar(e, getFighterElId(e));
      spawnFloatingNum(getFighterElId(e), `-${steal}`, 'direct-dmg', 0, 0);
    }
    const totalSteal = Math.round(aliveEnemies.reduce((s,e) => s + e.maxHp * combo.stealHpPct / 100, 0));
    fighters.forEach(f => { f.hp = Math.min(f.maxHp, f.hp + Math.round(totalSteal / 2)); updateHpBar(f, getFighterElId(f)); });
    addLog(`${combo.icon} ${combo.name}：偷取全体敌人HP！`);
  } else {
    // Damage combo
    const totalDmg = Math.round(atkVal * combo.atkScale);
    const targets = combo.aoe ? enemies.filter(e => e.alive) : [enemies.filter(e => e.alive).sort((a,b) => a.hp - b.hp)[0]];
    for (const t of targets) {
      if (!t || !t.alive) continue;
      const dmgType = combo.dmgType || 'magic';
      const finalDmg = applyRawDmg(fighters[0], t, totalDmg + (combo.hpPct ? Math.round(t.hp * combo.hpPct / 100) : 0), dmgType);
      spawnFloatingNum(getFighterElId(t), `-${finalDmg}`, dmgType === 'true' ? 'true-dmg' : dmgType === 'magic' ? 'magic-dmg' : 'direct-dmg', 0, 0, {atkSide:side, amount:finalDmg});
      if (combo.burn) t.buffs.push({ type:'phoenixBurnDot', turns:combo.burnTurns||3, atkScale:0.4, hpPct:0.08, source:fighters[0] });
      if (combo.stun) t.buffs.push({ type:'stun' });
      if (combo.mrDown) t.buffs.push({ type:'mrDown', value:combo.mrDown.pct, turns:combo.mrDown.turns });
      if (combo.shieldBreak) t.shield = 0;
      if (combo.dot) t.buffs.push({ type:'dot', dmg:combo.dot.dmg, turns:combo.dot.turns });
      updateHpBar(t, getFighterElId(t));
      checkDeaths();
    }
    addLog(`${combo.icon} ${combo.name}：造成 ${totalDmg} ${combo.dmgType === 'true' ? '真实' : '魔法'}伤害！`);
  }

  await sleep(600);
  if (checkBattleEnd()) return;
}

// ── BATTLE START ──────────────────────────────────────────
function resetBattleState() {
  turnNum=1; currentIdx=0; leftTeam=[]; rightTeam=[];
  allFighters=[]; turnQueue=[]; battleOver=false; animating=false;
  _actionQueue=[]; _bossActionsThisRound=0;
  _comboCdLeft = {};
  currentActingFighter = null;
  pendingSkillIdx = null;
  resetTurnState();
  // Clean up DOM state from previous battle
  document.querySelectorAll('.fighter-card,.scene-turtle').forEach(el => {
    el.classList.remove('dead','death-anim','hit-shake','attack-anim','mech-transform-anim');
    el.style.opacity = '';
    el.style.display = '';
  });
  // Remove summon mini cards
  document.querySelectorAll('.summon-mini').forEach(el => el.remove());
  // Remove particles, floating numbers, and overlays
  document.querySelectorAll('.bamboo-orb,.mech-drone-particle,.mech-transform-flash,.death-screen-flash,.floating-num').forEach(el => el.remove());
  const overlay = document.getElementById('disconnectOverlay');
  if (overlay) overlay.remove();
  // Hide panels
  const panel = document.getElementById('actionPanel');
  if (panel) panel.classList.remove('show');
  const picker = document.getElementById('turtlePicker');
  if (picker) picker.style.display = 'none';
  const targetSel = document.getElementById('targetSelect');
  if (targetSel) targetSel.style.display = 'none';
  // Clear stun indicators and side indicator
  const sideInd = document.getElementById('sideIndicator');
  if (sideInd) sideInd.innerHTML = '';
  const turnBanner = document.getElementById('turnBanner');
  if (turnBanner) turnBanner.textContent = '';
  unseedBattleRng();
}


// ── HIT ANIMATION HELPER ──────────────────────────────────
function playHitAnim(elId, dmgType, isCrit) {
  const el = document.getElementById(elId);
  if (!el) return;
  // Remove all hit classes
  el.classList.remove('hit-shake','hit-physical','hit-magic','hit-true','hit-crit');
  void el.offsetWidth; // reflow to restart animation
  if (isCrit) {
    el.classList.add('hit-crit');
    // Screen flash for crits
    const flash = document.createElement('div');
    flash.className = 'screen-flash flash-crit';
    document.body.appendChild(flash);
    flash.addEventListener('animationend', () => flash.remove());
  } else if (dmgType === 'magic') {
    el.classList.add('hit-magic');
  } else if (dmgType === 'true') {
    el.classList.add('hit-true');
  } else {
    el.classList.add('hit-physical');
  }
  // Auto-remove after animation
  setTimeout(() => {
    el.classList.remove('hit-shake','hit-physical','hit-magic','hit-true','hit-crit');
  }, 500);
}

// Shield multiplier for battle rules (铁壁之日 = ×2)
function getShieldMult() {
  return (typeof _battleRule !== 'undefined' && _battleRule && _battleRule.id === 'shield') ? 2 : 1;
}
// Magic damage multiplier for battle rules (深海之日 = ×0.8)
function getMagicDmgMult() {
  return (typeof _battleRule !== 'undefined' && _battleRule && _battleRule.id === 'ocean') ? 0.8 : 1;
}

// ── EQUIPMENT SYSTEM (装备之日) ──────────────────────────
const EQUIP_POOL = [
  // Stat boost (8)
  { id:'e_blade', name:'海藻短刃', icon:'⚔️', desc:'攻击力 +15%', apply(f) { f.baseAtk = Math.round(f.baseAtk * 1.15); f.atk = f.baseAtk; } },
  { id:'e_armor', name:'珊瑚护甲', icon:'️', desc:'护甲 +20%', apply(f) { f.baseDef = Math.round(f.baseDef * 1.2); f.def = f.baseDef; } },
  { id:'e_shell', name:'深海贝壳', icon:'🐚', desc:'魔抗 +20%', apply(f) { f.baseMr = Math.round((f.baseMr||f.baseDef) * 1.2); f.mr = f.baseMr; } },
  { id:'e_pearl', name:'生命珍珠', icon:'💎', desc:'最大生命值 +60', apply(f) { f.maxHp += 60; f.hp += 60; } },
  { id:'e_tooth', name:'锋利鲨齿', icon:'🦷', desc:'暴击率 +20%', apply(f) { f.crit += 0.2; } },
  { id:'e_hammer', name:'重击锤', icon:'🔨', desc:'暴击伤害 +25%', apply(f) { f._extraCritDmgPerm = (f._extraCritDmgPerm||0) + 0.25; } },
  { id:'e_spike', name:'穿甲珊瑚刺', icon:'📌', desc:'护甲穿透 +6', apply(f) { f.armorPen += 6; } },
  { id:'e_crystal', name:'灵能水晶', icon:'🔮', desc:'魔法穿透 +6', apply(f) { f.magicPen = (f.magicPen||0) + 6; } },
  // Special effect (10)
  { id:'e_star', name:'吸血海星', icon:'🩸', desc:'生命偷取 +12%', apply(f) { f._lifestealPct = (f._lifestealPct||0) + 12; } },
  { id:'e_urchin', name:'荆棘海胆', icon:'🌵', desc:'受伤反弹 10%', apply(f) { f._equipReflect = (f._equipReflect||0) + 10; } },
  { id:'e_fire', name:'灼热火珊瑚', icon:'🔥', desc:'攻击附带灼烧4回合', apply(f) { f._equipBurn = true; } },
  { id:'e_jelly', name:'冰封水母', icon:'❄️', desc:'攻击15%概率眩晕1回合', apply(f) { f._equipStun = 15; } },
  { id:'e_anemone', name:'治愈海葵', icon:'💚', desc:'每回合回复5%最大HP', apply(f) { f._equipHot = 5; } },
  { id:'e_ghost', name:'幽灵墨鱼', icon:'👻', desc:'闪避率 +15%', apply(f) { f.buffs.push({type:'dodge',value:15,turns:999}); } },
  { id:'e_puffer', name:'愤怒河豚', icon:'🐡', desc:'HP低于30%时攻击力翻倍', apply(f) { f._equipRage = true; } },
  { id:'e_tshell', name:'坚韧龟壳', icon:'🐢', desc:'每段受伤固定减免5点', apply(f) { f._equipFlatReduce = (f._equipFlatReduce||0) + 5; } },
  { id:'e_octo', name:'连击章鱼爪', icon:'🐙', desc:'20%概率追加50%攻击力打击', apply(f) { f._equipMultiHit = 20; } },
  { id:'e_conch', name:'复活海螺', icon:'🐌', desc:'首次死亡以20%HP复活', apply(f) { f._equipRevive = true; } },
];

let _equipPickPending = false;
let _equipPickCallback = null;

function triggerEquipPick() {
  if (_equipPickPending) return;
  _equipPickPending = true;
  // Pause battle, show equip pick UI
  const pool = EQUIP_POOL.sort(() => _origMathRandom() - 0.5).slice(0, 3);
  const overlay = document.createElement('div');
  overlay.id = 'equipPickOverlay';
  overlay.className = 'equip-pick-overlay';
  overlay.innerHTML = `
    <div class="equip-pick-box">
      <h3 style="color:#ffd93d;margin-bottom:12px">🎁 选择一件装备</h3>
      <div class="equip-pick-items">${pool.map((e, i) => `
        <div class="equip-pick-item" onclick="pickEquipItem(${i})">
          <div style="font-size:32px">${e.icon}</div>
          <div style="font-weight:700;font-size:14px">${e.name}</div>
          <div style="font-size:11px;color:var(--fg2)">${e.desc}</div>
        </div>
      `).join('')}</div>
      <div class="equip-pick-targets" id="equipPickTargets" style="display:none">
        <p style="color:var(--fg2);font-size:12px;margin-bottom:8px">装给谁？</p>
        <div id="equipTargetBtns"></div>
      </div>
    </div>
  `;
  overlay._pool = pool;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 50);
}

function pickEquipItem(idx) {
  const overlay = document.getElementById('equipPickOverlay');
  if (!overlay) return;
  overlay._selectedIdx = idx;
  // Highlight selected
  overlay.querySelectorAll('.equip-pick-item').forEach((el, i) => {
    el.classList.toggle('selected', i === idx);
  });
  // Show target selection
  const allies = leftTeam.filter(f => f.alive && (!f._equips || f._equips.length < 2));
  const targetsEl = document.getElementById('equipTargetBtns');
  targetsEl.innerHTML = allies.map(f => {
    const equipCount = f._equips ? f._equips.length : 0;
    return `<button class="btn btn-target" onclick="applyEquipToFighter(${allFighters.indexOf(f)})" style="margin:4px">
      ${f.emoji} ${f.name} (${equipCount}/2)
    </button>`;
  }).join('');
  document.getElementById('equipPickTargets').style.display = 'block';
}

function applyEquipToFighter(fIdx) {
  const overlay = document.getElementById('equipPickOverlay');
  if (!overlay) return;
  const equip = overlay._pool[overlay._selectedIdx];
  const f = allFighters[fIdx];
  if (!f || !equip) return;
  // Apply
  if (!f._equips) f._equips = [];
  f._equips.push(equip);
  equip.apply(f);
  recalcStats();
  updateFighterStats(f, getFighterElId(f));
  updateHpBar(f, getFighterElId(f));
  renderStatusIcons(f);
  addLog(`${f.emoji}${f.name} 装备了 <span style="color:#ffd93d">${equip.icon} ${equip.name}</span>：${equip.desc}`);
  spawnFloatingNum(getFighterElId(f), `${equip.icon}${equip.name}`, 'crit-label', 0, -20);
  // Close overlay
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 300);
  _equipPickPending = false;
}

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
  // Debug: verify seed sync at turn boundaries (can remove in production)
  if (gameMode === 'pvp-online') console.log(`[${onlineSide.toUpperCase()}] T${turnNum} seed=${_rngSeed}`);
  // Reduce cooldowns
  allFighters.forEach(f => {
    f.skills.forEach(s => { if (s.cdLeft > 0) s.cdLeft--; });
    // Also tick summon CDs
    if (f._summon && f._summon.alive) {
      f._summon.skills.forEach(s => { if (s.cdLeft > 0) s.cdLeft--; });
    }
  });
  // Pirate ship: auto-fire cannon each turn (before passive loop, since ship has no passive)
  for (const f of allFighters) {
    if (!f._isPirateShip || !f.alive) continue;
    const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
    if (enemies.length) {
      const target = enemies[Math.floor(Math.random() * enemies.length)];
      const dmg = Math.round(f.atk * (f._shipFireScale || 0.2));
      const eDef = target.def - (f.armorPen || 0);
      const finalDmg = Math.max(1, Math.round(dmg * calcDmgMult(eDef)));
      applyRawDmg(f, target, finalDmg, false, false, 'physical');
      const tElId = getFighterElId(target);
      spawnFloatingNum(tElId, `-${finalDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:finalDmg});
      updateHpBar(target, tElId);
      addLog(`海盗船 开炮 → ${target.emoji}${target.name}：<span class="log-direct">${finalDmg}物理</span>`);
      await triggerOnHitEffects(f, target, finalDmg);
      checkDeaths(f);
      if (checkBattleEnd()) return;
    }
  }
  // Passive: per-turn scaling
  for (const f of allFighters) {
    if (!f.alive || !f.passive) continue;
    if (f._isSummon) continue; // summon passives handled in dedicated loop below
    f.passiveUsedThisTurn = false; // reset once-per-turn passives
    if (f.passive.type === 'turnScaleAtk') {
      const gain = Math.round(f.baseAtk * f.passive.pct / 100);
      f.baseAtk += gain;
      recalcStats();
      const elId = getFighterElId(f);
      updateFighterStats(f, elId);
      spawnFloatingNum(elId, `+${gain}攻`, 'passive-num', 0, 0);
      addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">攻击+${gain}</span>`);
    }
    if (f.passive.type === 'turnScaleHp') {
      const gain = Math.round(f.maxHp * f.passive.pct / 100);
      f.maxHp += gain;
      f.hp += gain;
      const elId = getFighterElId(f);
      updateHpBar(f, elId);
      updateFighterStats(f, elId);
      addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">最大HP+${gain}</span>`);
      spawnFloatingNum(elId, `+${gain}HP`, 'passive-num', 0, 0);
    }
    if (f.passive.type === 'stoneWall') {
      // Permanent def gain per turn, capped
      if (!f._stoneDefGained) f._stoneDefGained = 0;
      if (f._stoneDefGained < f.passive.maxDef) {
        const gain = Math.min(f.passive.defGain, f.passive.maxDef - f._stoneDefGained);
        f.baseDef += gain;
        f._stoneDefGained += gain;
        recalcStats();
        const elId = getFighterElId(f);
        updateFighterStats(f, elId);
        spawnFloatingNum(elId, `+${gain}护甲`, 'passive-num', 0, 0);
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">护甲+${gain}(已+${f._stoneDefGained}/${f.passive.maxDef})</span>`);
      }
    }
    // Passive: cyberDrone — generate drones per turn
    if (f.passive && f.passive.type === 'cyberDrone' && !f._isMech) {
      if (!f._drones) f._drones = [];
      const spawnCount = f.passive.dronesPerTurn || 1;
      let spawned = 0;
      for (let di = 0; di < spawnCount && f._drones.length < f.passive.maxDrones; di++) {
        f._drones.push({ age: 0 });
        spawned++;
      }
      if (spawned > 0) {
        const elId = getFighterElId(f);
        spawnFloatingNum(elId, `+${spawned}<img src="assets/passive/cyber-drone-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'passive-num', 0, 0);
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">生成${spawned}个浮游炮（${f._drones.length}/${f.passive.maxDrones}）</span>`);
      }
      // Every drone fires every turn at random enemy — speed scales with count
      const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
      const droneCount = f._drones.length;
      const perDroneDelay = 550;
      let totalDroneDmg = 0;
      for (let di = 0; di < droneCount; di++) {
        if (!enemies.filter(e => e.alive).length) break;
        const alive = enemies.filter(e => e.alive);
        const target = alive[Math.floor(Math.random() * alive.length)];
        const dmg = Math.round(f.atk * f.passive.droneScale);
        const eDef = target.def - (f.armorPen || 0);
        const finalDmg = Math.max(1, Math.round(dmg * calcDmgMult(eDef)));
        applyRawDmg(f, target, finalDmg, false, false, 'physical');
        totalDroneDmg += finalDmg;
        const tElId = getFighterElId(target);
        spawnFloatingNum(tElId, `-${finalDmg}<img src="assets/passive/cyber-drone-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'direct-dmg', 0, (di % 3) * 14, {atkSide:f.side, amount:finalDmg});
        const tEl = document.getElementById(tElId);
        if (tEl) tEl.classList.add('hit-shake');
        updateHpBar(target, tElId);
        await triggerOnHitEffects(f, target, finalDmg);
        checkDeaths(f);
        if (checkBattleEnd()) { await sleep(600); return; }
        await sleep(perDroneDelay);
        if (tEl) tEl.classList.remove('hit-shake');
      }
      if (droneCount > 0) {
        addLog(`${f.emoji}${f.name} ${droneCount}个浮游炮打击！共 <span class="log-direct">${totalDroneDmg}物理</span>`);
      }
    }
    // (Pirate ship cannon moved to before passive loop)
    // Passive: auraAwaken — awaken at turn N with full stat boost
    if (f.passive.type === 'auraAwaken' && !f._auraAwakened && turnNum >= f.passive.awakenTurn) {
      f._auraAwakened = true;
      const elId = getFighterElId(f);
      // ATK boost
      const atkGain = Math.round(f.baseAtk * f.passive.atkPct / 100);
      f.baseAtk += atkGain;
      // DEF boost
      const defGain = Math.round(f.baseDef * f.passive.defPct / 100);
      f.baseDef += defGain;
      // MaxHP boost (scale current HP proportionally)
      const hpGain = Math.round(f.maxHp * f.passive.hpPct / 100);
      const oldMax = f.maxHp;
      f.maxHp += hpGain;
      f.hp = Math.round(f.hp * f.maxHp / oldMax);
      // Lifesteal
      f._auraLifesteal = f.passive.lifestealPct / 100;
      // Reflect
      f._auraReflect = f.passive.reflectPct / 100;
      // Percentage armor penetration
      f.armorPenPct += f.passive.armorPenPct / 100;
      // Visual + log
      spawnFloatingNum(elId, '<img src="assets/passive/aura-awaken-icon.png" style="width:16px;height:16px;vertical-align:middle">气场觉醒!', 'crit-label', 0, -20);
      recalcStats();
      spawnFloatingNum(elId, `+${atkGain}攻 +${defGain}护甲 +${hpGain}HP`, 'passive-num', 0, 10);
      updateHpBar(f, elId);
      updateFighterStats(f, elId);
      addLog(`${f.emoji}${f.name} <span class="log-passive"><img src="assets/passive/aura-awaken-icon.png" style="width:16px;height:16px;vertical-align:middle">气场觉醒！ATK+${atkGain} DEF+${defGain} HP+${hpGain} 生命偷取${f.passive.lifestealPct}% 反伤${f.passive.reflectPct}% ${f.passive.armorPenPct}%穿甲</span>`);
    }
    // Passive: bambooCharge — charge every other turn, only consume on actual skill use
    if (f.passive.type === 'bambooCharge') {
      f._bambooFired = false;
      if (!f._bambooCharged) {
        // Not charged yet — accumulate
        f._bambooCounter = (f._bambooCounter || 0) + 1;
        if (f._bambooCounter >= 2) {
          f._bambooCharged = true;
          f._bambooCounter = 0;
          spawnFloatingNum(getFighterElId(f), '<img src="assets/passive/bamboo-charge-icon.png" style="width:16px;height:16px;vertical-align:middle">充能!', 'passive-num', 0, 0);
          addLog(`${f.emoji}${f.name} 被动：<span class="log-passive"><img src="assets/passive/bamboo-charge-icon.png" style="width:16px;height:16px;vertical-align:middle">竹编充能！本回合技能后追加强化攻击</span>`);
        }
      }
      // If still charged from last turn (didn't fire — stunned etc), keep it
    }
    // Undead lock countdown
    if (f._undeadLockTurns > 0) {
      f._undeadLockTurns--;
      if (f._undeadLockTurns <= 0) {
        f.hp = 1;
        const elId = getFighterElId(f);
        spawnFloatingNum(elId, '锁血结束', 'debuff-label', 0, -20);
        renderStatusIcons(f);
        addLog(`${f.emoji}${f.name} 亡灵之力消散，恢复正常`);
      }
    }
    // Candy pen countdown
    if (f._candyPenTurns > 0) {
      f._candyPenTurns--;
      if (f._candyPenTurns <= 0 && f._candyPenGain) {
        f.armorPen -= f._candyPenGain;
        f._candyPenGain = 0;
        updateFighterStats(f, getFighterElId(f));
      }
    }
    // Lava turtle: transform countdown + check rage
    processLavaCountdown(f);
    // Chest turtle: rum HoT (3% maxHP per turn)
    if (f.passive && f.passive.type === 'chestTreasure' && hasChestEquip(f, 'rum')) {
      const heal = Math.round(f.maxHp * 0.06);
      const before = f.hp;
      f.hp = Math.min(f.maxHp, f.hp + heal);
      const actual = Math.round(f.hp - before);
      if (actual > 0) {
        const elId = getFighterElId(f);
        spawnFloatingNum(elId, `+${actual}🍺`, 'heal-num', 0, 0);
        updateHpBar(f, elId);
      }
    }
    // Passive: candySteal — steal 18% maxHP from random enemy at turn 5
    if (f.passive.type === 'candySteal' && turnNum === f.passive.stealTurn) {
      const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      if (enemies.length) {
        const target = enemies[Math.floor(Math.random() * enemies.length)];
        const stealAmt = Math.round(target.maxHp * f.passive.stealPct / 100);
        // Reduce target maxHP and current HP
        target.maxHp -= stealAmt;
        target.hp = Math.min(target.hp, target.maxHp);
        if (target.hp <= 0) { target.hp = 1; } // don't kill from steal
        const tElId = getFighterElId(target);
        spawnFloatingNum(tElId, `-${stealAmt}HP🍬`, 'pierce-dmg', 0, 0);
        updateHpBar(target, tElId);
        updateFighterStats(target, tElId);
        // Add to candy turtle maxHP and current HP
        f.maxHp += stealAmt;
        f.hp += stealAmt;
        const fElId = getFighterElId(f);
        spawnFloatingNum(fElId, `+${stealAmt}HP🍬`, 'heal-num', 0, 0);
        updateHpBar(f, fElId);
        updateFighterStats(f, fElId);
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">🍬偷取${target.emoji}${target.name} ${stealAmt}最大生命值！</span>`);
        await sleep(800);
      }
    }
    // Passive: pirateShip — summon pirate ship at turn 3
    // Crystal immortal: turn 10 bonus
    if (f._crystalImmortal && !f._crystalImmortalTriggered && turnNum >= 10) {
      f._crystalImmortalTriggered = true;
      const hpGain = 5000;
      const atkGain = 400;
      f.maxHp += hpGain;
      f.hp += hpGain;
      f._initHp = f.maxHp;
      f.baseAtk += atkGain;
      f.atk += atkGain;
      f._initAtk = f.baseAtk;
      recalcStats();
      const elId = getFighterElId(f);
      spawnFloatingNum(elId, `不朽!`, 'crit-label', 0, -25);
      spawnFloatingNum(elId, `+${hpGain}HP +${atkGain}ATK`, 'passive-num', 200, 0);
      updateHpBar(f, elId);
      updateFighterStats(f, elId);
      addLog(`${f.emoji}${f.name} <span class="log-passive">🔮不朽价值觉醒！+${hpGain}最大HP +${atkGain}攻击力！</span>`);
      try { sfxRebirth(); } catch(e) {}
      await sleep(1000);
    }
    // Gambler fate wheel: draw a suit each turn for permanent stat gain
    if (f._fateWheel && f.alive) {
      const suit = Math.floor(Math.random() * 4); // 0=spade, 1=heart, 2=diamond, 3=club
      const elId = getFighterElId(f);
      const suits = ['♠','♥','♦','♣'];
      if (suit === 0) {
        f.baseAtk += 5; f.maxHp += 30; f.hp += 30; f._initHp = f.maxHp;
        spawnFloatingNum(elId, `${suits[0]}+5攻+30HP`, 'passive-num', 0, 0);
        addLog(`${f.emoji}${f.name} 命运之轮：<span class="log-passive">${suits[0]}黑桃 攻击+5 HP+30</span>`);
      } else if (suit === 1) {
        f.baseDef += 2; f.baseMr += 2;
        spawnFloatingNum(elId, `${suits[1]}+2甲+2魔抗`, 'passive-num', 0, 0);
        addLog(`${f.emoji}${f.name} 命运之轮：<span class="log-passive">${suits[1]}红心 护甲+2 魔抗+2</span>`);
      } else if (suit === 2) {
        f.crit += 0.08; f.armorPen += 2;
        spawnFloatingNum(elId, `${suits[2]}+8%暴击+2穿甲`, 'passive-num', 0, 0);
        addLog(`${f.emoji}${f.name} 命运之轮：<span class="log-passive">${suits[2]}方块 暴击+8% 穿甲+2</span>`);
      } else {
        f._lifestealPct = (f._lifestealPct||0) + 4;
        spawnFloatingNum(elId, `${suits[3]}+4%吸血`, 'passive-num', 0, 0);
        addLog(`${f.emoji}${f.name} 命运之轮：<span class="log-passive">${suits[3]}梅花 吸血+4%</span>`);
      }
      recalcStats();
      updateFighterStats(f, elId);
      updateHpBar(f, elId);
      await sleep(400);
    }
    if (f._pirateShipEnabled && !f._pirateShipSummoned && turnNum === 3) {
      f._pirateShipSummoned = true;
      const team = f.side === 'left' ? leftTeam : rightTeam;
      const frontCount = team.filter(t => t.alive && t._position === 'front').length;
      const shipPos = frontCount < 3 ? 'front' : 'back';
      // Create ship as a fighter-like entity
      const shipHp = Math.round(f.maxHp * 1.5);
      const shipAtk = f.atk;
      const ship = {
        id:'pirateShip_'+f.id, name:'海盗船', emoji:'🚢', rarity:f.rarity, side:f.side,
        img:'assets/battle/pirate-ship.png', sprite:null,
        _equippedIdxs:[0], maxHp:shipHp, hp:shipHp, shield:0,
        baseAtk:shipAtk, baseDef:0, baseMr:0, atk:shipAtk, def:0, mr:0,
        _initHp:shipHp, _initAtk:shipAtk, _initDef:0, _initMr:0, _initCrit:0,
        crit:0, armorPen:0, armorPenPct:0, magicPen:0, magicPenPct:0,
        passive:null, passiveUsedThisTurn:false,
        _position:shipPos, alive:true, buffs:[], bubbleStore:0,
        bubbleShieldVal:0, bubbleShieldTurns:0, bubbleShieldOwner:null,
        _shockStacks:0, _goldCoins:0, _drones:[], _twoHeadForm:'ranged',
        _formHpGain:0, _formDefGain:0, _formAtkLoss:0, _rangedSkills:null,
        _isMech:false, _starEnergy:0, _deathProcessed:false,
        _dmgDealt:0, _dmgTaken:0, _physDmgDealt:0, _magicDmgDealt:0, _trueDmgDealt:0,
        _physDmgTaken:0, _magicDmgTaken:0, _trueDmgTaken:0,
        _summon:null, _summonElId:null, _storedEnergy:0, _auraAwakened:false,
        _auraLifesteal:0, _auraReflect:0, _bambooCharged:false, _bambooCounter:0,
        _bambooGainedHp:0, _hunterKills:0, _hunterStolenAtk:0, _hunterStolenDef:0,
        _hunterStolenHp:0, _diamondCollideCount:{}, _inkStacks:0, _inkLink:null,
        _undeadLockTurns:0, _undeadLockUsed:false, _lavaRage:0, _lavaTransformed:false,
        _lavaTransformTurns:0, _lavaSpent:false, _lavaSmallSkills:null,
        _chestTreasure:0, _chestEquips:[], _chestTier:0, _goldLightning:0,
        _crystallize:0, _collideStacks:0,
        _isPirateShip:true, _shipOwner:f, _shipFireScale:0.2,
        skills:[{ name:'开炮', type:'physical', hits:1, power:0, pierce:0, cd:0, atkScale:0.2 }],
        _passiveSkills:[]
      };
      team.push(ship);
      allFighters.push(ship);
      f._pirateShip = ship;
      const elId = getFighterElId(f);
      spawnFloatingNum(elId, `海盗船登场!`, 'crit-label', 0, -25);
      addLog(`${f.emoji}${f.name} 的海盗船在${shipPos === 'front' ? '前排' : '后排'}登场！HP${shipHp} ATK${shipAtk}`);
      renderScene();
      await sleep(800);
    }
    // Passive: rainbowPrism — random team buff each turn
    if (f.passive.type === 'rainbowPrism') {
      const allies = (f.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
      const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      const enhanced = f._enhancedPrism;
      // Colors: 0=red, 1=blue, 2=green, 3=orange, 4=yellow, 5=cyan, 6=purple
      const picks = [];
      if (enhanced) {
        // Enhanced: pick 1 from red/blue/green + 1 from orange/yellow/cyan/purple
        const basePool = turnNum <= 1 ? [0, 1] : [0, 1, 2]; // skip green first turn
        picks.push(basePool[Math.floor(Math.random() * basePool.length)]);
        const extraPool = [3, 4, 5, 6];
        picks.push(extraPool[Math.floor(Math.random() * extraPool.length)]);
      } else {
        // Normal: pick 1 from red/blue/green
        const pool = turnNum <= 1 ? [0, 1] : [0, 1, 2];
        picks.push(pool[Math.floor(Math.random() * pool.length)]);
      }
      f._prismColor = picks[0]; // primary color for skill 1 bonus

      function applyPrismColor(color) {
        if (color === 0) {
          for (const a of allies) { const g = Math.round(a.baseAtk * f.passive.atkPct / 100); a.buffs.push({type:'atkUp',value:g,turns:2}); spawnFloatingNum(getFighterElId(a), `+${g}攻🔴`, 'passive-num', 0, 0); }
          addLog(`${f.emoji}${f.name} 🔴红光：全体攻击+${f.passive.atkPct}%`);
        } else if (color === 1) {
          for (const a of allies) { const dg = Math.round(a.baseDef * f.passive.defPct / 100); const mg = Math.round((a.baseMr||a.baseDef) * f.passive.defPct / 100); a.buffs.push({type:'defUp',value:dg,turns:2}); a.buffs.push({type:'mrUp',value:mg,turns:2}); spawnFloatingNum(getFighterElId(a), `+${dg}甲+${mg}抗🔵`, 'passive-num', 0, 0); }
          addLog(`${f.emoji}${f.name} 🔵蓝光：全体护甲/魔抗+${f.passive.defPct}%`);
        } else if (color === 2) {
          for (const a of allies) { const h = Math.round(a.maxHp * f.passive.healPct / 100); const b = a.hp; a.hp = Math.min(a.maxHp, a.hp + h); const ac = Math.round(a.hp - b); if (ac > 0) spawnFloatingNum(getFighterElId(a), `+${ac}🟢`, 'heal-num', 0, 0); updateHpBar(a, getFighterElId(a)); }
          addLog(`${f.emoji}${f.name} 🟢绿光：全体回复${f.passive.healPct}%HP`);
        } else if (color === 3) {
          // Orange: 10% lifesteal for all allies 1 turn
          for (const a of allies) { a.buffs.push({type:'lifesteal',value:10,turns:2}); spawnFloatingNum(getFighterElId(a), `+10%吸血🟠`, 'passive-num', 0, 0); }
          addLog(`${f.emoji}${f.name} 🟠橙光：全体友方获得10%吸血1回合`);
        } else if (color === 4) {
          // Yellow: burn random enemy
          if (enemies.length) { const t = enemies[Math.floor(Math.random()*enemies.length)]; applySkillDebuffs({burn:true}, t, f); spawnFloatingNum(getFighterElId(t), `<img src="assets/status/burn-icon.png" style="width:14px;height:14px;vertical-align:middle">灼烧`, 'debuff-num', 0, 0); renderStatusIcons(t); addLog(`${f.emoji}${f.name} 🟡黄光：${t.emoji}${t.name}被灼烧`); }
        } else if (color === 5) {
          // Cyan: chill random enemy 1 turn
          if (enemies.length) { const t = enemies[Math.floor(Math.random()*enemies.length)]; t.buffs.push({type:'chilled',value:1,turns:2}); spawnFloatingNum(getFighterElId(t), `<img src="assets/status/chilled-icon.png" style="width:14px;height:14px;vertical-align:middle">冰寒`, 'debuff-num', 0, 0); renderStatusIcons(t); addLog(`${f.emoji}${f.name} 🩵青光：${t.emoji}${t.name}被冰寒`); }
        } else if (color === 6) {
          // Purple: curse random enemy 3 turns
          if (enemies.length) { const t = enemies[Math.floor(Math.random()*enemies.length)]; const dotDmg = Math.round(t.maxHp * 0.09); t.buffs.push({type:'dot',value:dotDmg,turns:3,sourceSide:f.side}); spawnFloatingNum(getFighterElId(t), `<img src="assets/status/curse-debuff-icon.png" style="width:14px;height:14px;vertical-align:middle">诅咒`, 'debuff-num', 0, 0); renderStatusIcons(t); addLog(`${f.emoji}${f.name} 🟣紫光：${t.emoji}${t.name}被诅咒3回合`); }
        }
      }
      for (const c of picks) applyPrismColor(c);
      recalcStats();
      for (const a of allies) updateFighterStats(a, getFighterElId(a));
      renderStatusIcons(f);
      await sleep(500);
    }
  }
  // Summon per-turn passives (same logic as above, for summons)
  for (const f of allFighters) {
    if (!f._summon || !f._summon.alive || !f._summon.passive) continue;
    const s = f._summon;
    s.passiveUsedThisTurn = false;
    const p = s.passive;
    const sElId = s._summonElId || getFighterElId(s);
    if (p.type === 'turnScaleAtk') {
      const gain = Math.round(s.baseAtk * p.pct / 100);
      s.baseAtk += gain; s.atk = s.baseAtk;
      spawnFloatingNum(sElId, `+${gain}攻`, 'passive-num', 0, 0);
      addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">攻击+${gain}</span>`);
    }
    if (p.type === 'turnScaleHp') {
      const gain = Math.round(s.maxHp * p.pct / 100);
      s.maxHp += gain; s.hp += gain;
      spawnFloatingNum(sElId, `+${gain}HP`, 'passive-num', 0, 0);
      updateSummonHpBar(s);
      addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">最大HP+${gain}</span>`);
    }
    if (p.type === 'stoneWall') {
      if (!s._stoneDefGained) s._stoneDefGained = 0;
      if (s._stoneDefGained < p.maxDef) {
        const gain = Math.min(p.defGain, p.maxDef - s._stoneDefGained);
        s.baseDef += gain; s.def = s.baseDef; s._stoneDefGained += gain;
        spawnFloatingNum(sElId, `+${gain}护甲`, 'passive-num', 0, 0);
        addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">护甲+${gain}(已+${s._stoneDefGained}/${p.maxDef})</span>`);
      }
    }
    if (p.type === 'lightningStorm') {
      const enemies = allFighters.filter(e => e.alive && e.side !== s.side);
      if (enemies.length) {
        const t = enemies[Math.floor(Math.random() * enemies.length)];
        const sDmg = Math.round(s.atk * p.shockScale);
        applyRawDmg(s, t, sDmg, true);
        const tElId = getFighterElId(t);
        spawnFloatingNum(tElId, `<img src="assets/passive/lightning-storm-icon.png" style="width:14px;height:14px;vertical-align:middle">${sDmg}`, 'pierce-dmg', 0, 0);
        updateHpBar(t, tElId);
        addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive"><img src="assets/passive/lightning-storm-icon.png" style="width:14px;height:14px;vertical-align:middle">电击${t.emoji}${t.name} ${sDmg}真实</span>`);
      }
    }
    // Bamboo charge
    if (p.type === 'bambooCharge') {
      s._bambooFired = false;
      if (!s._bambooCharged) {
        s._bambooCounter = (s._bambooCounter || 0) + 1;
        if (s._bambooCounter >= 2) {
          s._bambooCharged = true; s._bambooCounter = 0;
          spawnFloatingNum(sElId, '<img src="assets/passive/bamboo-charge-icon.png" style="width:16px;height:16px;vertical-align:middle">充能!', 'passive-num', 0, 0);
          addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive"><img src="assets/passive/bamboo-charge-icon.png" style="width:16px;height:16px;vertical-align:middle">竹编充能！</span>`);
        }
      }
    }
    // Candy steal
    if (p.type === 'candySteal' && turnNum === p.stealTurn) {
      const enemies = (s.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      if (enemies.length) {
        const target = enemies[Math.floor(Math.random() * enemies.length)];
        const stealAmt = Math.round(target.maxHp * p.stealPct / 100);
        target.maxHp -= stealAmt; target.hp = Math.min(target.hp, target.maxHp);
        if (target.hp <= 0) target.hp = 1;
        const tElId = getFighterElId(target);
        spawnFloatingNum(tElId, `-${stealAmt}HP🍬`, 'pierce-dmg', 0, 0);
        updateHpBar(target, tElId);
        s.maxHp += stealAmt; s.hp += stealAmt;
        spawnFloatingNum(sElId, `+${stealAmt}HP🍬`, 'heal-num', 0, 0);
        updateSummonHpBar(s);
        addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">🍬偷取${target.emoji}${target.name} ${stealAmt}最大HP！</span>`);
      }
    }
    // Candy pen countdown
    if (s._candyPenTurns > 0) {
      s._candyPenTurns--;
      if (s._candyPenTurns <= 0 && s._candyPenGain) { s.armorPen -= s._candyPenGain; s._candyPenGain = 0; }
    }
    // Rainbow prism
    if (p.type === 'rainbowPrism') {
      const allies = (s.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
      // Include owner
      const owner = s._owner;
      if (owner && owner.alive && !allies.includes(owner)) allies.push(owner);
      const maxRoll = (turnNum <= 1) ? 2 : 3;
      const roll = Math.floor(Math.random() * maxRoll);
      s._prismColor = roll;
      if (roll === 0) {
        for (const a of allies) { const gain = Math.round(a.baseAtk * p.atkPct / 100); a.buffs.push({ type:'atkUp', value:gain, turns:2 }); }
        addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">🔴红光！友方攻击+${p.atkPct}%</span>`);
      } else if (roll === 1) {
        for (const a of allies) { const dg = Math.round(a.baseDef * p.defPct / 100); const mg = Math.round((a.baseMr||a.baseDef) * p.defPct / 100); a.buffs.push({ type:'defUp', value:dg, turns:2 }); a.buffs.push({ type:'mrUp', value:mg, turns:2 }); }
        addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">🔵蓝光！友方护甲/魔抗+${p.defPct}%</span>`);
      } else {
        for (const a of allies) { const heal = Math.round(a.maxHp * p.healPct / 100); a.hp = Math.min(a.maxHp, a.hp + heal); updateHpBar(a, getFighterElId(a)); }
        addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">🟢绿光！友方回复${p.healPct}%HP</span>`);
      }
      recalcStats();
    }
  }
  // Process buffs/debuffs at turn start
  await processBuffs();
  // Recalculate stats after buff changes
  recalcStats();
  // Equipment rule: trigger equip pick for player every 3 turns
  // Also apply equipment passive effects (HOT, rage, flat reduce)
  for (const f of allFighters) {
    if (!f.alive) continue;
    if (f._equipHot) {
      const heal = Math.round(f.maxHp * f._equipHot / 100);
      const actual = applyHeal(f, heal);
      if (actual > 0) { spawnFloatingNum(getFighterElId(f), `+${actual}💚`, 'heal-num', 0, 0); updateHpBar(f, getFighterElId(f)); }
    }
    if (f._equipRage && f.hp / f.maxHp < 0.3 && !f._equipRageActive) {
      f._equipRageActive = true;
      f.baseAtk = Math.round(f.baseAtk * 2); f.atk = f.baseAtk;
      spawnFloatingNum(getFighterElId(f), '🐡暴怒!', 'crit-label', 0, -20);
      recalcStats(); updateFighterStats(f, getFighterElId(f));
    }
  }

  addLog(`── 第 ${turnNum} 回合 ──`, 'round-sep');
  try { sfxTurnStart(); } catch(e) {}

  // Tick down combo CDs
  for (const k in _comboCdLeft) { if (_comboCdLeft[k] > 0) _comboCdLeft[k]--; }

  // Equipment day: pick equip every 3 turns
  if (typeof _battleRule !== 'undefined' && _battleRule && _battleRule.id === 'equip' && turnNum > 1 && turnNum % 3 === 1) {
    triggerEquipPick();
  }

  // Start new round: left acts first
  activeSide = 'left';
  actedThisSide = new Set(); _bossActionsThisRound = 0;
  sidesActedThisRound = 0;
  nextSideAction();
}

// ── TURN SYSTEM ───────────────────────────────────────────
// Round 1: left×1 → right×all → end
// Round 2+: left×all → right×all → end
// Player chooses which turtle acts each time
let activeSide = 'left';      // whose turn it is
let actedThisSide = new Set(); // fighter indices that already acted this side
let _bossActionsThisRound = 0; // boss actions counter per round
let isFirstRound = true;
let sidesActedThisRound = 0;  // 0, 1, or 2
let _processingEndOfRound = false; // prevent re-entry during summon actions

// ── TURN TIMER (40s countdown, auto-pick on timeout) ──────
let _turnTimerId = null;
let _turnTimerInterval = null;
function startTurnTimer(seconds, canAct) {
  clearTurnTimer();
  // Show timer UI
  let timerEl = document.getElementById('turnTimer');
  if (!timerEl) {
    timerEl = document.createElement('span');
    timerEl.id = 'turnTimer';
    timerEl.className = 'turn-timer';
    const banner = document.getElementById('turnBanner');
    if (banner) banner.appendChild(timerEl);
    else document.body.appendChild(timerEl);
  }
  let remaining = seconds;
  const fmtTime = (s) => s >= 60 ? Math.floor(s/60) + ':' + String(s%60).padStart(2,'0') : s + 's';
  timerEl.textContent = fmtTime(remaining);
  timerEl.style.display = 'inline-block';
  timerEl.classList.remove('timer-urgent');
  _turnTimerInterval = setInterval(() => {
    remaining--;
    timerEl.textContent = fmtTime(remaining);
    if (remaining <= 10) timerEl.classList.add('timer-urgent');
    if (remaining <= 0) {
      clearTurnTimer();
      autoPickAction(canAct);
    }
  }, 1000);
}
function clearTurnTimer() {
  if (_turnTimerInterval) { clearInterval(_turnTimerInterval); _turnTimerInterval = null; }
  const el = document.getElementById('turnTimer');
  if (el) el.style.display = 'none';
}
function autoPickAction(canAct) {
  // Auto-select: pick first alive fighter, use first available skill on lowest HP enemy
  const f = canAct && canAct.find(ff => ff.alive);
  if (!f || battleOver) return;
  actedThisSide.add(allFighters.indexOf(f));
  addLog(`<span style="color:#ffd93d">⏰ ${f.name} 超时！自动出招</span>`);
  aiAction(f);
}

function resetTurnState() {
  activeSide = 'left';
  actedThisSide = new Set(); _bossActionsThisRound = 0;
  isFirstRound = true;
  sidesActedThisRound = 0;
}

async function nextSideAction() {
  if (battleOver) return;
  // Safety: check if battle should end (catches edge cases like DOT kills)
  if (checkBattleEnd()) return;

  // Get alive fighters for active side that haven't acted yet
  const sideTeam = activeSide === 'left' ? leftTeam : rightTeam;
  // Boss mode: boss can act twice per round, use counter instead of Set
  const isBossSide = (gameMode === 'boss' || (gameMode === 'dungeon' && dungeonState && dungeonState.stage >= 5)) && activeSide === 'right';
  let canAct;
  if (isBossSide) {
    if (!_bossActionsThisRound) _bossActionsThisRound = 0;
    canAct = (_bossActionsThisRound < 3) ? sideTeam.filter(f => f.alive) : [];
  } else {
    canAct = sideTeam.filter(f => f.alive && !actedThisSide.has(allFighters.indexOf(f)));
  }

  // First round: left only sends 1
  const totalAlive = sideTeam.filter(f => f.alive).length;
  const maxActions = (isFirstRound && activeSide === 'left') ? Math.min(2, totalAlive) : (isBossSide ? 3 : totalAlive);
  const alreadyActed = isBossSide ? _bossActionsThisRound : (totalAlive - canAct.length);

  if (canAct.length === 0 || alreadyActed >= maxActions) {
    // This side is done, switch to other side or end round
    await finishSide();
    return;
  }

  renderSideIndicator();

  // Determine if player or AI controls this side
  const isPlayer =
    (gameMode === 'pve' && activeSide === 'left') ||
    (gameMode === 'boss' && activeSide === 'left') ||
    (gameMode === 'dungeon' && activeSide === 'left') ||
    (gameMode === 'pvp-online' && activeSide === onlineSide);

  // Skip pirate ships — they fire passively, not as regular actions
  canAct.filter(f => f._isPirateShip).forEach(f => actedThisSide.add(allFighters.indexOf(f)));
  canAct = canAct.filter(f => !f._isPirateShip);

  // Check for stunned fighters — auto-skip them (only once per stun)
  const stunned = canAct.filter(f => f.buffs.some(b => b.type === 'stun') && !f._stunUsed);
  if (stunned.length > 0) {
    for (const sf of stunned) {
      actedThisSide.add(allFighters.indexOf(sf));
      sf._stunUsed = true; // mark consumed, won't double-skip
      // Remove stun buff immediately after consuming
      sf.buffs = sf.buffs.filter(b => b.type !== 'stun');
      renderStatusIcons(sf);
      const sfElId = getFighterElId(sf);
      spawnFloatingNum(sfElId, '💫眩晕跳过', 'debuff-label', 0, 0);
      addLog(`${sf.emoji}${sf.name} 眩晕中，跳过行动！`);
    }
    await sleep(600);
    nextSideAction();
    return;
  }

  if (isPlayer) {
    // Player picks which turtle to use
    if (canAct.length === 1) {
      // Only one choice, auto-select
      actedThisSide.add(allFighters.indexOf(canAct[0]));
      showActionPanel(canAct[0]);
    } else {
      // Show turtle picker
      showTurtlePicker(canAct);
    }
    // Start 3-minute turn timer (auto-pick if timeout)
    startTurnTimer(180, canAct);
  } else if (gameMode === 'pvp-online') {
    // Online PVP: wait for opponent's action via network — hide UI, do nothing
    const panel = document.getElementById('actionPanel');
    if (panel) panel.classList.remove('show');
    const picker = document.getElementById('turtlePicker');
    if (picker) picker.style.display = 'none';
    // Action will come from handleOnlineMessage → executeAction
  } else {
    // PVE AI picks a turtle and acts
    const panel = document.getElementById('actionPanel');
    if (panel) panel.classList.remove('show');
    const picker = document.getElementById('turtlePicker');
    if (picker) picker.style.display = 'none';
    const f = canAct[Math.floor(Math.random() * canAct.length)];
    // Safety watchdog: if AI hangs for 8s, force next action
    const watchdog = setTimeout(() => {
      if (!battleOver && animating) { console.warn('AI watchdog triggered'); animating = false; onActionComplete(); }
    }, 8000);
    setTimeout(() => {
      clearTimeout(watchdog);
      actedThisSide.add(allFighters.indexOf(f));
      try { aiAction(f); } catch(e) { console.error('aiAction error:', e); animating = false; onActionComplete(); }
    }, 1200);
  }
}

async function finishSide() {
  if (battleOver) return;
  sidesActedThisRound++;
  if (sidesActedThisRound >= 2) {
    // Prevent re-entry (summon executeAction could trigger finishSide again)
    if (_processingEndOfRound) return;
    _processingEndOfRound = true;
    // Both sides acted → end of round (guest processes identically via seeded random)
    {
      // Summon auto-action at end of turn (once per summon)
      for (const f of allFighters) {
        if (battleOver) break;
        if (!f.alive || !f.passive || f.passive.type !== 'summonAlly') continue;
        if (f._summon && f._summon.alive) {
          addLog(`${f._summon.emoji}${f._summon.name}(随从) 回合末自动出招！`);
          await sleep(400);
          await summonAutoAction(f._summon, f);
          if (checkBattleEnd()) { _processingEndOfRound = false; return; }
        }
      }
      await processFortuneGold();
      if (battleOver) { _processingEndOfRound = false; return; }
      await processLightningStorm();
      if (battleOver) { _processingEndOfRound = false; return; }
      if (typeof processEnergyWave === 'function') { await processEnergyWave(); if (battleOver) { _processingEndOfRound = false; return; } }
    }
    _processingEndOfRound = false;
    isFirstRound = false;
    turnNum++;
    sidesActedThisRound = 0;
    beginTurn();
    return;
  }

  // Switch to other side
  activeSide = activeSide === 'left' ? 'right' : 'left';
  actedThisSide = new Set(); _bossActionsThisRound = 0;
  await sleep(300);
  nextSideAction();
}

// Called after a fighter finishes their action (from executeAction)
function onActionComplete() {
  if (battleOver || _processingEndOfRound) return;
  nextSideAction();
}

// Mark fighter as acted and show action panel
function selectTurtleToAct(fIdx) {
  const f = allFighters[fIdx];
  if (!f || !f.alive) return;
  actedThisSide.add(fIdx);
  const picker = document.getElementById('turtlePicker');
  if (picker) picker.style.display = 'none';
  showActionPanel(f);
}

function backToPicker() {
  // Un-mark current fighter as acted, go back to turtle picker (no timer reset)
  if (currentActingFighter) {
    const fIdx = allFighters.indexOf(currentActingFighter);
    actedThisSide.delete(fIdx);
    const el = document.getElementById(getFighterElId(currentActingFighter));
    if (el) el.classList.remove('active-turn');
  }
  const panel = document.getElementById('actionPanel');
  if (panel) panel.classList.remove('show');
  clearTargetHighlights();
  document.getElementById('targetSelect').style.display = 'none';
  // Show picker directly without resetting timer
  const sideTeam = activeSide === 'left' ? leftTeam : rightTeam;
  const canAct = sideTeam.filter(f => f.alive && !actedThisSide.has(allFighters.indexOf(f)));
  if (canAct.length > 1) showTurtlePicker(canAct);
  else if (canAct.length === 1) { actedThisSide.add(allFighters.indexOf(canAct[0])); showActionPanel(canAct[0]); }
}

function renderSideIndicator() {
  const el = document.getElementById('sideIndicator');
  if (!el) return;
  if (gameMode === 'pvp-online') {
    const isMyTurn = activeSide === onlineSide;
    el.innerHTML = `<span class="side-ind ${isMyTurn?'side-ind-left':'side-ind-right'}">${isMyTurn?'⚔️ 你的回合':'⏳ 等待对手操作…'}</span>`;
  } else {
    const isLeft = activeSide === 'left';
    el.innerHTML = `<span class="side-ind ${isLeft?'side-ind-left':'side-ind-right'}">${isLeft?'◀ 我方行动':'敌方行动 ▶'}</span>`;
  }
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
      spawnFloatingNum(elId, `-${d.value}`, 'dot-dmg', 0, 0, {atkSide: d.sourceSide, amount: d.value});
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
    // Burn DoT (magic damage — reduced by MR, blocked by shields)
    const pBurns = f.buffs.filter(b => b.type === 'phoenixBurnDot');
    for (const pb of pBurns) {
      const rawBurn = pb.value + Math.round(f.maxHp * pb.hpPct / 100);
      // Reduce by MR since burn is magic damage (negative MR = amplified)
      const burnDmg = Math.max(1, Math.round(rawBurn * calcDmgMult(f.mr)));
      const burnSource = (pb.sourceIdx !== undefined && pb.sourceIdx >= 0) ? allFighters[pb.sourceIdx] : null;
      const { hpLoss, shieldAbs } = applyRawDmg(burnSource, f, burnDmg, false, true, 'magic');
      if (shieldAbs > 0) spawnFloatingNum(elId, `-${shieldAbs}`, 'shield-dmg', 0, 0, {atkSide: pb.sourceSide, amount: shieldAbs});
      if (hpLoss > 0) spawnFloatingNum(elId, `-${hpLoss}`, 'magic-dmg', 50, 0, {atkSide: pb.sourceSide, amount: hpLoss});
      updateHpBar(f, elId);
      addLog(`${f.emoji}${f.name} 受到 <span class="log-dot">${burnDmg}灼烧</span>${shieldAbs>0?' (护盾吸收'+shieldAbs+')':''}（剩余${pb.turns-1}回合）`);
      hadTick = true;
      if (f.hp <= 0) break;
    }
    // Poison DoT (magic damage — reduced by MR)
    const poisons = f.buffs.filter(b => b.type === 'poison');
    for (const p of poisons) {
      const poisonRaw = p.value || 10;
      const poisonDmg = Math.max(1, Math.round(poisonRaw * calcDmgMult(f.mr)));
      f.hp = Math.max(0, f.hp - poisonDmg);
      spawnFloatingNum(elId, `-${poisonDmg}`, 'magic-dmg', 0, 14, {atkSide: p.sourceSide, amount: poisonDmg});
      updateHpBar(f, elId);
      addLog(`${f.emoji}${f.name} 受到 <span style="color:#6b8e23">${poisonDmg}中毒伤害</span>（剩余${p.turns-1}回合）`);
      hadTick = true;
      if (f.hp <= 0) break;
    }
    if (!f.alive) {
      checkDeaths(null);
      if (checkBattleEnd()) return;
      continue;
    }
    // Bleed DoT (物理伤害, reduced by DEF)
    const bleeds = f.buffs.filter(b => b.type === 'bleed');
    for (const bl of bleeds) {
      const bleedRaw = bl.value || 10;
      const bleedDmg = Math.max(1, Math.round(bleedRaw * calcDmgMult(f.def)));
      f.hp = Math.max(0, f.hp - bleedDmg);
      spawnFloatingNum(elId, `-${bleedDmg}`, 'direct-dmg', 0, 14, {atkSide: bl.sourceSide, amount: bleedDmg});
      updateHpBar(f, elId);
      addLog(`${f.emoji}${f.name} 受到 <span style="color:#cc3333">${bleedDmg}流血伤害</span>（剩余${bl.turns-1}回合）`);
      hadTick = true;
      if (f.hp <= 0) break;
    }
    if (!f.alive) {
      checkDeaths(null);
      if (checkBattleEnd()) return;
      continue;
    }
    // Ice-Fire combo: if target has both 冰寒(chilled) and 灼烧(burn), consume both → 30% maxHP magic damage
    const hasChill = f.buffs.some(b => b.type === 'chilled');
    const hasBurn = f.buffs.some(b => b.type === 'phoenixBurnDot');
    if (hasChill && hasBurn) {
      f.buffs = f.buffs.filter(b => b.type !== 'chilled' && b.type !== 'phoenixBurnDot');
      const comboDmg = Math.round(f.maxHp * 0.3);
      const finalDmg = Math.max(1, Math.round(comboDmg * calcDmgMult(f.mr)));
      f.hp = Math.max(0, f.hp - finalDmg);
      spawnFloatingNum(elId, `-${finalDmg}❄️🔥`, 'magic-dmg', 0, 0);
      updateHpBar(f, elId);
      addLog(`${f.emoji}${f.name} <span style="color:#4dabf7">❄️🔥冰火联动！</span>消耗冰寒+灼烧，造成 ${finalDmg} 魔法伤害`);
      hadTick = true;
      if (f.hp <= 0) { f.alive = false; }
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
      const actual = applyHeal(f, h.value);
      if (actual > 0) {
        spawnFloatingNum(elId, `+${actual}`, 'heal-num', 0, 0);
        updateHpBar(f, elId);
        addLog(`${f.emoji}${f.name} <span class="log-heal">持续回复${actual}HP</span>（剩余${h.turns-1}回合）`);
        hadTick = true;
      }
    }
    // BubbleStore passive: heal 25% + damage 25% of stored value
    if (f.passive && f.passive.type === 'bubbleStore' && f.bubbleStore > 0) {
      // Heal portion
      const healAmt = Math.round(f.bubbleStore * (f.passive.healPct || 25) / 100);
      const actual = applyHeal(f, healAmt);
      f.bubbleStore -= healAmt;
      if (actual > 0) {
        spawnFloatingNum(elId, `+${actual}<img src="assets/passive/bubble-store-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'bubble-num', 100, 0);
        updateHpBar(f, elId);
        hadTick = true;
      }
      // Damage portion: magic damage to random enemy
      if (f.passive.dmgPct) {
        const dmgAmt = Math.round(f.bubbleStore * f.passive.dmgPct / 100);
        f.bubbleStore -= dmgAmt;
        if (dmgAmt > 0) {
          const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
          if (enemies.length) {
            const target = enemies[Math.floor(Math.random() * enemies.length)];
            const effMr = calcEffDef(f, target, 'magic');
            const finalDmg = Math.max(1, Math.round(dmgAmt * calcDmgMult(effMr)));
            applyRawDmg(f, target, finalDmg, false, false, 'magic');
            const tElId = getFighterElId(target);
            spawnFloatingNum(tElId, `-${finalDmg}<img src="assets/passive/bubble-store-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'magic-dmg', 100, 0, { atkSide: f.side, amount: finalDmg });
            updateHpBar(target, tElId);
            hadTick = true;
          }
        }
      }
      if (f.bubbleStore < 1) f.bubbleStore = 0;
      updateHpBar(f, elId); // refresh bubble store bar
      addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">泡泡回复${actual}HP` + (f.passive.dmgPct ? ` + 泡泡伤害` : '') + `</span>（剩余储存${Math.round(f.bubbleStore)}）`);
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
    // Ink link tick-down
    if (f._inkLink && f._inkLink.turns > 0) {
      f._inkLink.turns--;
      if (f._inkLink.turns <= 0) {
        f._inkLink = null;
        addLog(`${f.emoji}${f.name} 的连笔链接消散了`);
      }
    }
    // Tick down all buffs, remove expired
    const hadPhysImmune = f.buffs.some(b => b.type === 'physImmune');
    const hadCritUp = f.buffs.find(b => b.type === 'critUp' && b.turns === 1); // about to expire
    f.buffs.forEach(b => b.turns--);
    f.buffs = f.buffs.filter(b => b.turns > 0);
    // CritUp expired: remove the crit bonus
    if (hadCritUp && !f.buffs.some(b => b.type === 'critUp')) {
      f.crit = Math.max(0, (f.crit || 0) - hadCritUp.value / 100);
    }
    // Ghost phantom: physImmune expired → trigger stored strike
    if (hadPhysImmune && !f.buffs.some(b => b.type === 'physImmune') && f._phantomStrike && f.alive) {
      const ps = f._phantomStrike;
      f._phantomStrike = null;
      const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      if (enemies.length) {
        const target = enemies.sort((a,b) => a.hp - b.hp)[0]; // auto-target lowest HP
        for (let h = 0; h < ps.hits; h++) {
          const dmg = Math.round(f.atk * ps.atkScale);
          applyRawDmg(f, target, dmg, false, false, 'true');
          spawnFloatingNum(getFighterElId(target), `-${dmg}`, 'direct-dmg', h * 80, 0, {atkSide:f.side, amount:dmg});
        }
        updateHpBar(target, getFighterElId(target));
        const totalDmg = Math.round(f.atk * ps.atkScale * ps.hits);
        addLog(`${f.emoji}${f.name} 虚化结束 → 幽冥突袭 ${target.emoji}${target.name}：${totalDmg} 真实伤害`);
        await triggerOnHitEffects(f, target, totalDmg);
        hadTick = true;
      }
    }
    renderStatusIcons(f);
  }
  if (hadTick) await sleep(800);
}

function recalcStats() {
  allFighters.forEach(f => {
    // Reset to base
    f.atk = f.baseAtk;
    f.def = f.baseDef;
    f.mr  = f.baseMr || f.baseDef;
    // Diamond structure: amplify armor/mr buffs for all allies
    const team = f.side === 'left' ? leftTeam : rightTeam;
    const diamond = team.find(t => t.alive && t.passive && t.passive.type === 'diamondStructure');
    let defAmp = 1;
    if (diamond) {
      const isSelf = f === diamond;
      const ampPct = (isSelf && diamond._diamondEnhanced) ? 100 : (diamond.passive.defBuffAmp || 50);
      defAmp = 1 + ampPct / 100;
    }
    // Chilled: ATK -20%
    if (f.buffs.some(b => b.type === 'chilled')) {
      f.atk = Math.round(f.atk * 0.8);
    }
    // Apply debuffs & buffs
    for (const b of f.buffs) {
      if (b.type === 'atkDown') f.atk = Math.round(f.atk * (1 - b.value / 100));
      if (b.type === 'defDown') f.def = Math.round(f.def * (1 - b.value / 100));
      if (b.type === 'mrDown')  f.mr  = Math.round(f.mr  * (1 - b.value / 100));
      if (b.type === 'defUp')   f.def += Math.round(b.value * defAmp);
      if (b.type === 'mrUp')    f.mr  += Math.round(b.value * defAmp);
      if (b.type === 'atkUp')   f.atk += b.value;
      // Dice fate crit buff (managed separately by gamblerBlood recalc below)
      if (b.type === 'diceFateCrit') f.crit = (f.crit || 0) + b.value / 100;
    }
    // UndeadRage: ATK scales with lost HP
    if (f.passive && f.passive.type === 'undeadRage' && f.maxHp > 0) {
      const lostPct = Math.max(0, 1 - f.hp / f.maxHp) * 100;
      const atkBonus = Math.min(f.passive.atkMaxBonus, lostPct * f.passive.atkPerLostPct);
      f.atk += Math.round(f.baseAtk * atkBonus / 100);
    }
    // GamblerBlood: dynamic crit based on lost HP
    if (f.passive && f.passive.type === 'gamblerBlood') {
      const lostPct = Math.max(0, 1 - f.hp / f.maxHp);
      const threshold = f.passive.maxCritAtLoss / 100;
      const maxGain = f.passive.maxCritGain / 100;
      const extraCrit = Math.min(maxGain, lostPct / threshold * maxGain);
      f.crit = (f._initCrit || 0.25) + extraCrit;
      // Re-apply diceFateCrit buff on top
      for (const b of f.buffs) {
        if (b.type === 'diceFateCrit') f.crit += b.value / 100;
      }
    }
  });
  // Auto-refresh UI for all fighters after stat recalc
  if (typeof updateFighterStats === 'function') {
    allFighters.forEach(f => {
      if (f.alive) updateFighterStats(f, getFighterElId(f));
    });
  }
}

function nextAction() {
  // Redirects to new turn system
  onActionComplete();
}

let pendingSkillIdx = null;
let currentActingFighter = null; // the turtle currently acting (set by showActionPanel)

function pickSkill(idx) {
  if (animating || battleOver) return; // prevent double-click
  try { sfxClick(); } catch(e) {}
  const f = currentActingFighter;
  if (!f) return;
  const skill = f.skills[idx];
  pendingSkillIdx = idx;
  const isAlly = skill.type === 'heal' || skill.type === 'shield' || skill.type === 'bubbleShield' || skill.type === 'ninjaTrap' || skill.type === 'angelBless' || skill.type === 'bubbleHeal' || skill.type === 'crystalResHeal' || skill.type === 'phoenixPurify' || skill.isAlly;

  // Self-cast: no target selection
  if (skill.selfCast || skill.type === 'fortuneDice' || skill.type === 'phoenixShield' || skill.type === 'gamblerDraw' || skill.type === 'hidingDefend' || skill.type === 'hidingCommand' || skill.type === 'cyberDeploy' || skill.type === 'cyberBuff' || skill.type === 'ghostPhase' || skill.type === 'diamondFortify' || skill.type === 'diceFate' || skill.type === 'chestOpen' || skill.type === 'chestCount' || skill.type === 'bambooHeal' || skill.type === 'iceShield' || skill.type === 'volcanoArmor' || skill.type === 'crystalBarrier' || skill.type === 'shellCopy' || (skill.type === 'twoHeadSwitch' && skill.switchTo === 'melee')) {
    executePlayerAction(f, skill, f);
    return;
  }
  // AOE / auto-target: no target selection needed
  // MechAttack: auto-target lowest HP enemy
  if (skill.type === 'mechAttack') {
    const enemies = (f.side==='left'?rightTeam:leftTeam).filter(e => e.alive);
    const target = enemies.sort((a,b) => a.hp - b.hp)[0];
    if (target) executePlayerAction(f, skill, target);
    return;
  }
  if (skill.aoe || skill.aoeAlly || skill.type === 'hunterBarrage' || skill.type === 'ninjaBomb' || skill.type === 'lightningBuff' || skill.type === 'lightningBarrage' || skill.type === 'iceFrost' || skill.type === 'basicBarrage' || skill.type === 'starMeteor' || skill.type === 'diceAllIn') {
    executePlayerAction(f, skill, null);
    return;
  }

  // bubbleBind targets enemies
  const targetsFromSide = (isAlly ? (f.side==='left'?leftTeam:rightTeam) : (f.side==='left'?rightTeam:leftTeam));
  let targets = targetsFromSide.filter(a => a.alive);
  // Taunt: if any enemy has taunt, forced to target them (single-target enemy skills only)
  if (!isAlly && !skill.ignoreRow) {
    const taunters = targets.filter(t => t.buffs.some(b => b.type === 'taunt'));
    if (taunters.length > 0) { targets = taunters; }
    else {
      // Stealth: filter out stealthed enemies
      const nonStealth = targets.filter(t => !t.buffs.some(b => b.type === 'stealth'));
      if (nonStealth.length > 0) targets = nonStealth;
      // Front row priority
      const frontTargets = targets.filter(t => t._position === 'front');
      if (frontTargets.length > 0) targets = frontTargets;
    }
  }
  if (targets.length === 1) executePlayerAction(f, skill, targets[0]);
  else showTargetSelect(targets, f, skill);
}

function showTargetSelect(targets, srcFighter, skill) {
  // Hide action panel
  const panel = document.getElementById('actionPanel');
  if (panel) panel.classList.remove('show');

  // Determine if targeting allies or enemies
  const isAllyTarget = skill && (skill.isAlly || skill.aoeAlly);
  const targetClass = isAllyTarget ? 'targetable targetable-ally' : 'targetable';

  // Clear old highlights
  document.querySelectorAll('.scene-turtle.targetable,.scene-turtle.targetable-ally').forEach(el => {
    el.classList.remove('targetable', 'targetable-ally');
    el._targetClick = null;
  });

  // Highlight targetable turtles on scene + make clickable
  targets.forEach(t => {
    const el = document.getElementById(getFighterElId(t));
    if (!el) return;
    targetClass.split(' ').forEach(c => el.classList.add(c));
    const fi = allFighters.indexOf(t);
    el._targetClick = () => selectTarget(fi);
    el.onclick = el._targetClick;
  });

  // Show cancel hint
  const hint = document.getElementById('targetHint');
  if (hint) {
    hint.querySelector('.target-hint-text').textContent = isAllyTarget ? '🎯 点击发光的龟选择友方目标' : '🎯 点击发光的龟选择目标';
    hint.style.display = 'flex';
  }

  // Also keep bottom fallback for accessibility
  const box = document.getElementById('targetButtons');
  box.innerHTML = targets.map(t => {
    const hpPct = Math.round(t.hp/t.maxHp*100);
    return `<button class="btn btn-target" onclick="selectTarget(${allFighters.indexOf(t)})">
      ${t.emoji} ${t.name} (HP${hpPct}%)
    </button>`;
  }).join('');
  document.getElementById('targetSelect').style.display = 'flex';
}

async function useCombo(comboIdx) {
  if (animating || battleOver) return;
  const combo = COMBO_SKILLS[comboIdx];
  if (!combo) return;
  const f = currentActingFighter;
  if (!f) return;
  animating = true;
  clearTurnTimer();
  const panel = document.getElementById('actionPanel');
  if (panel) panel.classList.remove('show');
  await executeCombo(combo, f.side);
  animating = false;
  onActionComplete();
}

function selectTarget(fi) {
  if (animating || battleOver) return;
  const f = currentActingFighter;
  if (!f) return;
  const skill = f.skills[pendingSkillIdx];
  clearTargetHighlights();
  executePlayerAction(f, skill, allFighters[fi]);
}
function cancelTarget() {
  clearTargetHighlights();
  document.getElementById('targetSelect').style.display='none';
  pendingSkillIdx=null;
  const panel = document.getElementById('actionPanel');
  if (panel) panel.classList.add('show');
}
function clearTargetHighlights() {
  document.querySelectorAll('.scene-turtle.targetable,.scene-turtle.targetable-ally').forEach(el => {
    el.classList.remove('targetable', 'targetable-ally');
    // Restore normal click handler
    const f = allFighters.find(f => getFighterElId(f) === el.id);
    if (f) el.onclick = () => showFighterDetail(f);
  });
  const hint = document.getElementById('targetHint');
  if (hint) hint.style.display = 'none';
}

function executePlayerAction(f, skill, target) {
  clearTargetHighlights();
  document.getElementById('targetSelect').style.display = 'none';
  // Hide action panel immediately to prevent double-click
  const panel = document.getElementById('actionPanel');
  if (panel) panel.classList.remove('show');
  const battle = document.getElementById('screenBattle');
  if (battle) battle.classList.remove('action-visible');
  const action = { attackerId:allFighters.indexOf(f), skillIdx:f.skills.indexOf(skill), targetId: target ? allFighters.indexOf(target) : -1, aoe:!!skill.aoe };
  if (gameMode === 'pvp-online') {
    if (onlineSide === 'left') {
      // Host: execute locally, then send action + sync to guest
      executeAction(action);
    } else {
      // Guest: send pick to host, do NOT execute locally — wait for host
      sendOnline({ type:'pick', action });
    }
    return;
  }
  executeAction(action);
}

// ── ACTION EXECUTION ──────────────────────────────────────
let _actionQueue = [];

// Guest replay mode: guest executes action but sync will overwrite state afterward
let _isGuestReplay = false;
async function executeAction(action) {
  if (battleOver) return;
  clearTurnTimer(); // player acted, stop countdown
  // Queue actions that arrive while animating (e.g. online opponent's action)
  if (animating) {
    _actionQueue.push(action);
    return;
  }
  animating = true;
  const f = allFighters[action.attackerId];
  if (!f) { console.error('executeAction: fighter not found', action); animating=false; return; }
  // Set currentActingFighter so floating numbers know attack direction (also for online guest)
  currentActingFighter = f;
  // Track this fighter as acted (needed for online: opponent actions come via network)
  actedThisSide.add(action.attackerId);
  if (gameMode === 'boss' && allFighters[action.attackerId]._isBoss) _bossActionsThisRound++;
  const skill = f.skills[action.skillIdx];
  if (!skill) { console.error('executeAction: skill not found', action, 'fighter:', f.name, 'skills:', f.skills.length); animating=false; onActionComplete(); return; }

  if (skill.cd > 0) skill.cdLeft = skill.cd;

  // Lava rage: check transform before action
  await processLavaTransform();
  if (battleOver) { animating=false; return; }
  // Re-read skill in case transform changed skill set
  const updatedSkill = f.skills[action.skillIdx];
  if (updatedSkill && updatedSkill.type !== skill.type) {
    // Skill set changed due to transform, use new skill 0 (basic attack)
    action.skillIdx = 0;
  }

  // Skill announce banner
  showSkillAnnounce(f, f.skills[action.skillIdx]);
  await sleep(600);

  const atkEl = document.getElementById(getFighterElId(f));
  if (atkEl) atkEl.classList.add('attack-anim');

  if (action.aoe && skill.type !== 'pirateCannonBarrage' && skill.type !== 'rainbowStorm' && skill.type !== 'chestStorm' && skill.type !== 'lavaQuake' && skill.type !== 'volcanoErupt' && skill.type !== 'candyBarrage' && skill.type !== 'soulReap' && skill.type !== 'crystalBurst' && skill.type !== 'starMeteor') {
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
  } else if (skill.type === 'turtleShieldBash') {
    const target = allFighters[action.targetId];
    await doTurtleShieldBash(f, target, skill);
  } else if (skill.type === 'basicBarrage') {
    await doBasicBarrage(f, skill);
  } else if (skill.type === 'iceSpike') {
    const target = allFighters[action.targetId];
    await doIceSpike(f, target, skill);
  } else if (skill.type === 'iceFrost') {
    await doIceFrost(f, skill);
  } else if (skill.type === 'angelBless') {
    const target = allFighters[action.targetId];
    await doAngelBless(f, target, skill);
  } else if (skill.type === 'angelEquality') {
    const target = allFighters[action.targetId];
    await doAngelEquality(f, target, skill);
  } else if (skill.type === 'twoHeadMagicWave') {
    const target = allFighters[action.targetId];
    await doTwoHeadMagicWave(f, target, skill);
  } else if (skill.type === 'twoHeadSwitch') {
    const target = allFighters[action.targetId];
    await doTwoHeadSwitch(f, target, skill);
  } else if (skill.type === 'twoHeadHammer') {
    const target = allFighters[action.targetId];
    await doTwoHeadHammer(f, target, skill);
  } else if (skill.type === 'twoHeadAbsorb') {
    const target = allFighters[action.targetId];
    await doTwoHeadAbsorb(f, target, skill);
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
  } else if (skill.type === 'starBeam') {
    const target = allFighters[action.targetId];
    await doStarBeam(f, target, skill);
  } else if (skill.type === 'starWormhole') {
    const target = allFighters[action.targetId];
    await doStarWormhole(f, target, skill);
  } else if (skill.type === 'starMeteor') {
    await doStarMeteor(f, skill);
  } else if (skill.type === 'ghostTouch') {
    const target = allFighters[action.targetId];
    await doGhostTouch(f, target, skill);
  } else if (skill.type === 'ghostPhase') {
    await doGhostPhase(f, skill);
  } else if (skill.type === 'ghostStorm') {
    const target = allFighters[action.targetId];
    await doGhostStorm(f, target, skill);
  } else if (skill.type === 'lineSketch') {
    const target = allFighters[action.targetId];
    await doLineSketch(f, target, skill);
  } else if (skill.type === 'lineLink') {
    const target = allFighters[action.targetId];
    await doLineLink(f, target, skill);
  } else if (skill.type === 'lineFinish') {
    const target = allFighters[action.targetId];
    await doLineFinish(f, target, skill);
  } else if (skill.type === 'cyberBuff') {
    // Self ATK buff
    if (skill.selfAtkUpPct) {
      const atkGain = Math.round(f.baseAtk * skill.selfAtkUpPct.pct / 100);
      f.buffs.push({ type:'atkUp', value:atkGain, turns:skill.selfAtkUpPct.turns });
      recalcStats();
      const elId = getFighterElId(f);
      spawnFloatingNum(elId, `+${atkGain}攻`, 'passive-num', 0, 0);
      renderStatusIcons(f);
      updateFighterStats(f, elId);
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-passive">自身攻击+${atkGain}(${skill.selfAtkUpPct.pct}%) ${skill.selfAtkUpPct.turns}回合</span>`);
    }
    await sleep(800);
  } else if (skill.type === 'cyberDeploy') {
    await doCyberDeploy(f, skill);
  } else if (skill.type === 'crystalSpike') {
    const target = allFighters[action.targetId];
    await doCrystalSpike(f, target, skill);
  } else if (skill.type === 'crystalBarrier') {
    await doCrystalBarrier(f, skill);
  } else if (skill.type === 'crystalBurst') {
    await doCrystalBurst(f, skill);
  } else if (skill.type === 'soulReap') {
    await doSoulReap(f, skill);
  } else if (skill.type === 'candyBarrage') {
    await doCandyBarrage(f, skill);
  } else if (skill.type === 'candyBomb') {
    // AOE 3-hit + armor pen
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) {
      for (let h = 0; h < (skill.hits||3); h++) {
        const dmg = Math.round(f.atk * (skill.atkScale||0.35));
        applyRawDmg(f, enemy, dmg, false, false, 'physical');
        spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', h * 60, 0, {atkSide:f.side, amount:dmg});
        if (battleOver) break;
      }
      updateHpBar(enemy, getFighterElId(enemy));
      await triggerOnHitEffects(f, enemy, Math.round(f.atk * (skill.atkScale||0.35) * (skill.hits||3)));
      if (battleOver) break;
    }
    // Temp armor pen
    if (skill.armorPen) { f.armorPen += skill.armorPen; }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：全体${skill.hits||3}段物理伤害`);
    await sleep(400);
  } else if (skill.type === 'iceFreeze') {
    // Single target magic damage + guaranteed stun
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const dmg = Math.round(f.atk * (skill.atkScale||0.6));
      applyRawDmg(f, target, dmg, false, false, 'magic');
      spawnFloatingNum(getFighterElId(target), `-${dmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:dmg});
      updateHpBar(target, getFighterElId(target));
      // Guaranteed stun
      if (target.alive) {
        target.buffs.push({ type:'stun', value:1, turns:1 });
        spawnFloatingNum(getFighterElId(target), `<img src="assets/status/stun-icon.png" style="width:14px;height:14px;vertical-align:middle">眩晕`, 'debuff-num', 200, 0);
        renderStatusIcons(target);
        addLog(`${target.emoji}${target.name} 被冰封眩晕！`);
      }
      await triggerOnHitEffects(f, target, dmg);
    }
    await sleep(400);
  } else if (skill.type === 'lavaSplash') {
    // Single target damage + burn
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      await doDamage(f, target, skill);
      if (target.alive) {
        applySkillDebuffs({ burn: true }, target, f);
        renderStatusIcons(target);
      }
    }
  } else if (skill.type === 'twoHeadDualStrike') {
    // Two hits: first physical, second true damage
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const physDmg = Math.round(f.atk * (skill.normalScale||0.8));
      applyRawDmg(f, target, physDmg, false, false, 'physical');
      spawnFloatingNum(getFighterElId(target), `-${physDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:physDmg});
      const trueDmg = Math.round(f.atk * (skill.pierceScale||0.6));
      applyRawDmg(f, target, trueDmg, false, false, 'true');
      spawnFloatingNum(getFighterElId(target), `-${trueDmg}`, 'true-dmg', 100, 0, {atkSide:f.side, amount:trueDmg});
      updateHpBar(target, getFighterElId(target));
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：${physDmg}物理 + ${trueDmg}真实`);
      await triggerOnHitEffects(f, target, physDmg + trueDmg);
    }
    await sleep(400);
  } else if (skill.type === 'twoHeadSmash') {
    // 2-hit physical with stun chance per hit
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      for (let h = 0; h < (skill.hits||2); h++) {
        const dmg = Math.round(f.atk * (skill.atkScale||0.9));
        applyRawDmg(f, target, dmg, false, false, 'physical');
        spawnFloatingNum(getFighterElId(target), `-${dmg}`, 'direct-dmg', h * 80, 0, {atkSide:f.side, amount:dmg});
        if (Math.random() < 0.20 && target.alive) {
          target.buffs.push({ type:'stun', value:1, turns:1 });
          spawnFloatingNum(getFighterElId(target), `<img src="assets/status/stun-icon.png" style="width:14px;height:14px;vertical-align:middle">眩晕`, 'debuff-num', 200, h * 80);
          renderStatusIcons(target);
        }
        if (battleOver) break;
      }
      updateHpBar(target, getFighterElId(target));
      await triggerOnHitEffects(f, target, Math.round(f.atk * (skill.atkScale||0.9) * (skill.hits||2)));
    }
    await sleep(400);
  } else if (skill.type === 'lavaBolt') {
    const target = allFighters[action.targetId];
    await doLavaBolt(f, target, skill);
  } else if (skill.type === 'lavaQuake') {
    await doLavaQuake(f, skill);
  } else if (skill.type === 'lavaSurge') {
    const target = allFighters[action.targetId];
    await doLavaSurge(f, target, skill);
  } else if (skill.type === 'volcanoSmash') {
    const target = allFighters[action.targetId];
    await doVolcanoSmash(f, target, skill);
  } else if (skill.type === 'volcanoArmor') {
    await doVolcanoArmor(f, skill);
  } else if (skill.type === 'volcanoErupt') {
    await doVolcanoErupt(f, skill);
  } else if (skill.type === 'chestSmash') {
    const target = allFighters[action.targetId];
    await doChestSmash(f, target, skill);
  } else if (skill.type === 'chestCount') {
    await doChestCount(f, skill);
  } else if (skill.type === 'chestStorm') {
    await doChestStorm(f, skill);
  } else if (skill.type === 'pirateCannonBarrage') {
    await doPirateCannonBarrage(f, skill);
  } else if (skill.type === 'rainbowStorm') {
    await doRainbowStorm(f, skill);
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
  } else if (skill.type === 'iceShield') {
    await doIceShield(f, skill);
  } else if (skill.type === 'bambooLeaf') {
    const target = allFighters[action.targetId];
    await doBambooLeaf(f, target, skill);
  } else if (skill.type === 'bambooHeal') {
    await doBambooHeal(f, skill);
  } else if (skill.type === 'diamondFortify') {
    await doDiamondFortify(f, skill);
  } else if (skill.type === 'diamondCollide') {
    const target = allFighters[action.targetId];
    await doDiamondCollide(f, target, skill);
  } else if (skill.type === 'diceAttack') {
    const target = allFighters[action.targetId];
    await doDiceAttack(f, target, skill);
  } else if (skill.type === 'diceAllIn') {
    await doDiceAllIn(f, skill);
  } else if (skill.type === 'diceFate') {
    await doDiceFate(f, skill);
  } else if (skill.type === 'diceStableShield') {
    // Permanent shield: 10% ATK + crit*100
    const shieldAmt = Math.round(Math.round(f.atk * 0.1 + f.crit * 100) * getShieldMult());
    f.shield += shieldAmt;
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `+${shieldAmt}`, 'shield-num', 0, 0);
    updateHpBar(f, elId);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-shield">+${shieldAmt}永久护盾</span>（10%ATK+暴击率×100）`);
    sfxShield();
    await sleep(800);
  } else if (skill.type === 'chestOpen') {
    await doChestOpen(f, skill);
  } else if (skill.type === 'mechAttack') {
    const target = allFighters[action.targetId];
    await doDamage(f, target, skill);
  } else if (skill.type === 'shellStrike') {
    const target = allFighters[action.targetId];
    await doShellStrike(f, target, skill);
  } else if (skill.type === 'shellCopy') {
    await doShellCopy(f, skill);
  } else if (skill.type === 'basicSlam') {
    // 过肩摔: main target + splash to others
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const mainDmg = Math.round(f.atk * skill.atkScale) + Math.round(target.maxHp * skill.targetHpPct / 100);
      const result = applyRawDmg(f, target, mainDmg, false, false, 'physical');
      spawnFloatingNum(getFighterElId(target), `-${result.hpLoss||mainDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:mainDmg});
      updateHpBar(target, getFighterElId(target));
      addLog(`${f.emoji}${f.name} 过肩摔 ${target.emoji}${target.name}！造成 ${mainDmg} 物理伤害`);
      await triggerOnHitEffects(f, target, mainDmg);
      // Splash to other enemies
      const others = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive && e !== target);
      for (const o of others) {
        const splashDmg = Math.round(f.atk * (skill.splashAtkScale||0.3)) + Math.round(target.maxHp * (skill.splashHpPct||20) / 100);
        applyRawDmg(f, o, splashDmg, false, false, 'physical');
        spawnFloatingNum(getFighterElId(o), `-${splashDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:splashDmg});
        updateHpBar(o, getFighterElId(o));
        addLog(`  溅射 ${o.emoji}${o.name} ${splashDmg} 物理伤害`);
      }
    }
  } else if (skill.type === 'ninjaBackstab') {
    // 背刺: +穿甲 then 3 hits
    const target = allFighters[action.targetId];
    if (skill.armorPenBuff) {
      f.armorPen += skill.armorPenBuff;
      spawnFloatingNum(getFighterElId(f), `+${skill.armorPenBuff}穿甲`, 'passive-num', 0, -20);
      addLog(`${f.emoji}${f.name} 获得 +${skill.armorPenBuff} 穿甲`);
    }
    await doDamage(f, target, skill);
    // Remove temp armor pen after
    if (skill.armorPenBuff) f.armorPen -= skill.armorPenBuff;

  // ═══════════════════════════════════════════════════
  // NEW SKILL HANDLERS (batch implementation)
  // ═══════════════════════════════════════════════════

  // ── AOE Ally Heals ──
  } else if (skill.type === 'bambooAoeHeal' || skill.type === 'rainbowHeal' || skill.type === 'fortuneBless') {
    // AOE ally heal: healAtkPct + healHpPct
    const allies = (f.side==='left'?leftTeam:rightTeam).filter(a => a.alive);
    for (const ally of allies) {
      const healAmt = Math.round(f.atk * (skill.healAtkPct||0) / 100) + Math.round(f.maxHp * (skill.healHpPct||0) / 100);
      const actual = applyHeal(ally, healAmt);
      const elId = getFighterElId(ally);
      if (actual > 0) {
        spawnFloatingNum(elId, `+${actual}`, 'heal-num', 0, 0);
        updateHpBar(ally, elId);
      }
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${ally.emoji}${ally.name}：<span class="log-heal">回复${actual}HP</span>`);
    }
    sfxHeal();
    await sleep(800);

  } else if (skill.type === 'bubbleHeal') {
    // Single ally heal: healAtkPct + healHpPct
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const healAmt = Math.round(f.atk * (skill.healAtkPct||0) / 100) + Math.round(f.maxHp * (skill.healHpPct||0) / 100);
      const actual = applyHeal(target, healAmt);
      const elId = getFighterElId(target);
      if (actual > 0) {
        spawnFloatingNum(elId, `+${actual}`, 'heal-num', 0, 0);
        updateHpBar(target, elId);
      }
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-heal">回复${actual}HP</span>`);
      sfxHeal();
    }
    await sleep(800);

  } else if (skill.type === 'crystalResHeal') {
    // Single ally heal: healMrScale * MR + healAtkPct * ATK
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const healAmt = Math.round(f.mr * (skill.healMrScale||0)) + Math.round(f.atk * (skill.healAtkPct||0) / 100);
      const actual = applyHeal(target, healAmt);
      const elId = getFighterElId(target);
      if (actual > 0) {
        spawnFloatingNum(elId, `+${actual}`, 'heal-num', 0, 0);
        updateHpBar(target, elId);
      }
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-heal">回复${actual}HP</span>`);
      sfxHeal();
    }
    await sleep(800);

  } else if (skill.type === 'phoenixPurify') {
    // Purify: remove all debuffs from ally, heal 10% maxHP per debuff removed
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const debuffTypes = ['atkDown','defDown','mrDown','healReduce','poison','bleed','burn','cursed','chilled','spdDown'];
      const removed = target.buffs.filter(b => debuffTypes.includes(b.type));
      target.buffs = target.buffs.filter(b => !debuffTypes.includes(b.type));
      recalcStats();
      const healAmt = Math.round(target.maxHp * 0.10 * removed.length);
      let actual = 0;
      if (healAmt > 0) {
        actual = applyHeal(target, healAmt);
        const elId = getFighterElId(target);
        if (actual > 0) {
          spawnFloatingNum(elId, `+${actual}`, 'heal-num', 0, 0);
          updateHpBar(target, elId);
        }
      }
      const elId = getFighterElId(target);
      if (removed.length > 0) spawnFloatingNum(elId, `净化×${removed.length}`, 'passive-num', 200, 0);
      renderStatusIcons(target);
      updateFighterStats(target, elId);
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-heal">净化${removed.length}个减益，回复${actual}HP</span>`);
      sfxHeal();
    }
    await sleep(800);

  } else if (skill.type === 'headlessRegen') {
    // Self heal: 25% lost HP + lifesteal buff
    const lostHp = f.maxHp - f.hp;
    const healAmt = Math.round(lostHp * (skill.healLostPct||25) / 100);
    const actual = applyHeal(f, healAmt);
    const elId = getFighterElId(f);
    if (actual > 0) {
      spawnFloatingNum(elId, `+${actual}`, 'heal-num', 0, 0);
      updateHpBar(f, elId);
    }
    if (skill.lifestealUp) {
      f.buffs.push({ type:'lifesteal', value:skill.lifestealUp.pct, turns:skill.lifestealUp.turns });
      spawnFloatingNum(elId, `+${skill.lifestealUp.pct}%吸血`, 'passive-num', 200, 0);
      renderStatusIcons(f);
    }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-heal">回复${actual}HP</span>${skill.lifestealUp ? ` <span class="log-passive">+${skill.lifestealUp.pct}%吸血 ${skill.lifestealUp.turns}回合</span>` : ''}`);
    sfxHeal();
    await sleep(800);

  // ── Shield Skills ──
  } else if (skill.type === 'commonTeamShield') {
    // AOE ally shield: shieldScale * ATK
    const allies = (f.side==='left'?leftTeam:rightTeam).filter(a => a.alive);
    for (const ally of allies) {
      const amount = Math.round(Math.round(f.atk * (skill.shieldScale||0.5)) * getShieldMult());
      ally.shield += amount;
      const elId = getFighterElId(ally);
      spawnFloatingNum(elId, `+${amount}`, 'shield-num', 0, 0);
      updateHpBar(ally, elId);
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${ally.emoji}${ally.name}：<span class="log-shield">+${amount}护盾</span>`);
    }
    sfxShield();
    await sleep(800);

  } else if (skill.type === 'rainbowBarrier') {
    // AOE ally shield: shieldAtkScale * ATK
    const allies = (f.side==='left'?leftTeam:rightTeam).filter(a => a.alive);
    for (const ally of allies) {
      const amount = Math.round(Math.round(f.atk * (skill.shieldAtkScale||0.8)) * getShieldMult());
      ally.shield += amount;
      const elId = getFighterElId(ally);
      spawnFloatingNum(elId, `+${amount}`, 'shield-num', 0, 0);
      updateHpBar(ally, elId);
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${ally.emoji}${ally.name}：<span class="log-shield">+${amount}护盾</span>`);
    }
    sfxShield();
    await sleep(800);

  } else if (skill.type === 'cyberFirewall') {
    // AOE ally shield + damage reduction buff
    const allies = (f.side==='left'?leftTeam:rightTeam).filter(a => a.alive);
    for (const ally of allies) {
      const amount = Math.round(Math.round(f.atk * (skill.shieldAtkScale||0.6)) * getShieldMult());
      ally.shield += amount;
      const elId = getFighterElId(ally);
      spawnFloatingNum(elId, `+${amount}`, 'shield-num', 0, 0);
      updateHpBar(ally, elId);
      if (skill.dmgReduction) {
        ally.buffs.push({ type:'dmgReduce', value:skill.dmgReduction.pct, turns:skill.dmgReduction.turns });
        spawnFloatingNum(elId, `-${skill.dmgReduction.pct}%受伤`, 'passive-num', 200, 0);
      }
      renderStatusIcons(ally);
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${ally.emoji}${ally.name}：<span class="log-shield">+${amount}护盾</span> <span class="log-passive">-${skill.dmgReduction?.pct||15}%受伤 ${skill.dmgReduction?.turns||3}回合</span>`);
    }
    sfxShield();
    await sleep(800);

  } else if (skill.type === 'starShield') {
    // Self shield from star energy (不消耗星能)
    const amount = Math.round(Math.round(f._starEnergy * (skill.shieldEnergyPct||80) / 100) * getShieldMult());
    f.shield += amount;
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `+${amount}`, 'shield-num', 0, 0);
    updateHpBar(f, elId);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-shield">星能转化+${amount}护盾</span>`);
    sfxShield();
    await sleep(800);

  } else if (skill.type === 'starShieldBreak') {
    // Break 50% shield on all enemies, then gain star energy
    const enemies = getAliveEnemiesWithSummons(f.side);
    let totalBroken = 0;
    for (const enemy of enemies) {
      if (enemy.shield > 0) {
        const broken = Math.round(enemy.shield * (skill.shieldBreakPct||50) / 100);
        enemy.shield -= broken;
        totalBroken += broken;
        const eElId = getFighterElId(enemy);
        spawnFloatingNum(eElId, `-${broken}`, 'shield-dmg', 0, 0);
        updateHpBar(enemy, eElId);
      }
      if (enemy.bubbleShieldVal > 0) {
        const broken = Math.round(enemy.bubbleShieldVal * (skill.shieldBreakPct||50) / 100);
        enemy.bubbleShieldVal -= broken;
        totalBroken += broken;
      }
    }
    // Gain star energy
    const energyGain = Math.round(f.atk * (skill.energyGainAtkScale||1.0));
    if (f.passive && f.passive.type === 'starEnergy') {
      const maxE = Math.round(f.maxHp * f.passive.maxChargePct / 100);
      f._starEnergy = Math.min(maxE, (f._starEnergy||0) + energyGain);
    }
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `+${energyGain}⭐`, 'passive-num', 0, 0);
    updateHpBar(f, elId);
    renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：破坏全体护盾${totalBroken}，获取${energyGain}星能`);
    await sleep(800);

  } else if (skill.type === 'shellEnergyShield') {
    // Self shield from stored energy (不消耗)
    const amount = Math.round(Math.round(f._storedEnergy * (skill.energyShieldScale||1.5)) * getShieldMult());
    f.shield += amount;
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `+${amount}`, 'shield-num', 0, 0);
    updateHpBar(f, elId);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-shield">储能转化+${amount}护盾</span>`);
    sfxShield();
    await sleep(800);

  } else if (skill.type === 'lightningShield') {
    // Self shield + counter
    const amount = Math.round(Math.round(f.atk * (skill.shieldScale||0.9)) * getShieldMult());
    f.shield += amount;
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `+${amount}`, 'shield-num', 0, 0);
    updateHpBar(f, elId);
    if (skill.counterScale) {
      f.buffs.push({ type:'counter', value:Math.round(f.atk * skill.counterScale), turns:3 });
      spawnFloatingNum(elId, `反击`, 'passive-num', 200, 0);
    }
    renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-shield">+${amount}护盾</span> <span class="log-passive">反击${Math.round(f.atk*(skill.counterScale||0.1))}</span>`);
    sfxShield();
    await sleep(800);

  // ── Buff/Debuff Skills ──
  } else if (skill.type === 'commonAtkBuff') {
    // AOE ally ATK buff
    const allies = (f.side==='left'?leftTeam:rightTeam).filter(a => a.alive);
    for (const ally of allies) {
      const atkGain = Math.round(ally.baseAtk * (skill.atkUpPct||15) / 100);
      ally.buffs.push({ type:'atkUp', value:atkGain, turns:skill.atkUpTurns||3 });
      const elId = getFighterElId(ally);
      spawnFloatingNum(elId, `+${atkGain}攻`, 'passive-num', 0, 0);
      renderStatusIcons(ally);
      updateFighterStats(ally, elId);
    }
    recalcStats();
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-passive">全体攻击+${skill.atkUpPct||15}% ${skill.atkUpTurns||3}回合</span>`);
    sfxBuff();
    await sleep(800);

  } else if (skill.type === 'pirateFlag') {
    // AOE ally ATK buff (pct object)
    const pct = typeof skill.atkUpPct === 'object' ? skill.atkUpPct.pct : (skill.atkUpPct||25);
    const turns = typeof skill.atkUpPct === 'object' ? skill.atkUpPct.turns : 3;
    const allies = (f.side==='left'?leftTeam:rightTeam).filter(a => a.alive);
    for (const ally of allies) {
      const atkGain = Math.round(ally.baseAtk * pct / 100);
      ally.buffs.push({ type:'atkUp', value:atkGain, turns });
      const elId = getFighterElId(ally);
      spawnFloatingNum(elId, `+${atkGain}攻`, 'passive-num', 0, 0);
      renderStatusIcons(ally);
      updateFighterStats(ally, elId);
    }
    recalcStats();
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-passive">全体攻击+${pct}% ${turns}回合</span>`);
    sfxBuff();
    await sleep(800);

  } else if (skill.type === 'stoneTaunt') {
    // Self DEF buff + taunt (enemies forced to target this)
    if (skill.defUp) {
      f.buffs.push({ type:'defUp', value:skill.defUp.val, turns:skill.defUp.turns });
      const elId = getFighterElId(f);
      spawnFloatingNum(elId, `+${skill.defUp.val}护甲`, 'passive-num', 0, 0);
    }
    f.buffs.push({ type:'taunt', value:1, turns:skill.defUp?.turns||3 });
    recalcStats();
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `嘲讽`, 'passive-num', 200, 0);
    renderStatusIcons(f);
    updateFighterStats(f, elId);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-passive">护甲+${skill.defUp?.val||8} ${skill.defUp?.turns||3}回合，嘲讽敌方</span>`);
    sfxBuff();
    await sleep(800);

  } else if (skill.type === 'ghostPhantom') {
    // Enter phantom state: immune to physical for N turns, then strike
    f.buffs.push({ type:'physImmune', value:1, turns:skill.phantomTurns||2 });
    // Store pending strike info
    f._phantomStrike = { turns:skill.phantomTurns||2, hits:skill.hits||2, atkScale:skill.atkScale||0.6 };
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `虚化!`, 'passive-num', 0, 0);
    spawnFloatingNum(elId, `免疫物理${skill.phantomTurns||2}回合`, 'passive-num', 200, 0);
    renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：进入虚化状态${skill.phantomTurns||2}回合，免疫物理伤害`);
    sfxDodge();
    await sleep(800);

  } else if (skill.type === 'ghostShadow') {
    // Self dodge + stealth
    f.buffs.push({ type:'dodge', value:skill.dodgePct||80, turns:skill.dodgeTurns||2 });
    if (skill.stealthTurns) f.buffs.push({ type:'stealth', value:1, turns:skill.stealthTurns });
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `闪避${skill.dodgePct||80}%`, 'passive-num', 0, 0);
    if (skill.stealthTurns) spawnFloatingNum(elId, `隐身`, 'passive-num', 200, 0);
    renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-passive">闪避${skill.dodgePct||80}% ${skill.dodgeTurns||2}回合</span>${skill.stealthTurns ? ` <span class="log-passive">隐身${skill.stealthTurns}回合</span>` : ''}`);
    sfxDodge();
    await sleep(800);

  } else if (skill.type === 'starWarp') {
    // Self dodge + counter on dodge
    f.buffs.push({ type:'dodge', value:skill.dodgePct||60, turns:skill.dodgeTurns||2 });
    if (skill.counterScale) f.buffs.push({ type:'dodgeCounter', value:Math.round(f.atk * skill.counterScale), turns:skill.dodgeTurns||2, dmgType:skill.counterDmgType||'magic' });
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `闪避${skill.dodgePct||60}%`, 'passive-num', 0, 0);
    if (skill.counterScale) spawnFloatingNum(elId, `闪避反击`, 'passive-num', 200, 0);
    renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-passive">闪避${skill.dodgePct||60}% ${skill.dodgeTurns||2}回合</span>${skill.counterScale ? ` <span class="log-passive">闪避时反击${Math.round(f.atk*skill.counterScale)}</span>` : ''}`);
    sfxDodge();
    await sleep(800);

  } else if (skill.type === 'hidingReflect') {
    // Self shield + reflect damage
    const shieldAmt = Math.round(Math.round(f.maxHp * (skill.shieldHpPct||15) / 100) * getShieldMult());
    f.shield += shieldAmt;
    f.buffs.push({ type:'reflect', value:skill.reflectPct||40, turns:skill.reflectTurns||3 });
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `+${shieldAmt}`, 'shield-num', 0, 0);
    spawnFloatingNum(elId, `反弹${skill.reflectPct||40}%`, 'passive-num', 200, 0);
    updateHpBar(f, elId);
    renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-shield">+${shieldAmt}护盾</span> <span class="log-passive">反弹${skill.reflectPct||40}% ${skill.reflectTurns||3}回合</span>`);
    sfxShield();
    await sleep(800);

  } else if (skill.type === 'gamblerCheat') {
    // Damage + steal one buff from target
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      await doDamage(f, target, skill);
      // Steal a random buff
      const stealable = target.buffs.filter(b => ['atkUp','defUp','mrUp','critUp','shield','dodge','lifesteal'].includes(b.type));
      if (stealable.length > 0) {
        const stolen = stealable[Math.floor(Math.random() * stealable.length)];
        target.buffs = target.buffs.filter(b => b !== stolen);
        f.buffs.push({ ...stolen });
        recalcStats();
        const tElId = getFighterElId(target);
        const fElId = getFighterElId(f);
        spawnFloatingNum(tElId, `被偷取`, 'debuff-num', 0, 0);
        spawnFloatingNum(fElId, `偷取成功`, 'passive-num', 0, 0);
        renderStatusIcons(target);
        renderStatusIcons(f);
        updateFighterStats(target, tElId);
        updateFighterStats(f, fElId);
        addLog(`${f.emoji}${f.name} 偷取了 ${target.emoji}${target.name} 的增益效果！`);
      }
    }

  // ── Medium-priority: Special Mechanic Skills ──
  } else if (skill.type === 'gamblerAllIn') {
    // Self-damage + high damage + crit bonus
    const selfDmg = Math.round(f.hp * (skill.selfDmgPct||30) / 100);
    f.hp -= selfDmg;
    if (f.hp < 1) f.hp = 1;
    const fElId = getFighterElId(f);
    spawnFloatingNum(fElId, `-${selfDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side==='left'?'right':'left', amount:selfDmg});
    updateHpBar(f, fElId);
    addLog(`${f.emoji}${f.name} 消耗 ${selfDmg}HP！`);
    // Temporarily boost crit
    const origCrit = f.crit;
    if (skill.critBonus) f.crit += skill.critBonus / 100;
    const target = allFighters[action.targetId];
    await doDamage(f, target, skill);
    f.crit = origCrit;

  } else if (skill.type === 'hunterSnipe') {
    // High damage, target below threshold = guaranteed crit
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const origCrit = f.crit;
      if (skill.execThresh && (target.hp / target.maxHp * 100) <= skill.execThresh) {
        f.crit = 1.0; // guaranteed crit
      }
      await doDamage(f, target, skill);
      f.crit = origCrit;
    }

  } else if (skill.type === 'hunterPoison') {
    // Damage + poison DOT + heal reduction
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      await doDamage(f, target, skill);
      if (skill.dot) {
        target.buffs.push({ type:'poison', value:skill.dot.dmg, turns:skill.dot.turns });
        const tElId = getFighterElId(target);
        spawnFloatingNum(tElId, `中毒`, 'debuff-num', 200, 0);
        renderStatusIcons(target);
        addLog(`${target.emoji}${target.name} 中毒 ${skill.dot.turns}回合（每回合${skill.dot.dmg}伤害）`);
      }
      if (skill.healReduce) {
        target.buffs.push({ type:'healReduce', value:50, turns:skill.dot?.turns||3 });
        addLog(`${target.emoji}${target.name} 治疗效果 -50%`);
      }
    }

  } else if (skill.type === 'fortuneGoldRain') {
    // AOE magic damage + coin gain per hit
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) {
      for (let h = 0; h < (skill.hits||8); h++) {
        const dmg = Math.round(f.atk * (skill.atkScale||0.12));
        applyRawDmg(f, enemy, dmg, false, false, 'magic');
        spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', h * 60, 0, {atkSide:f.side, amount:dmg});
        if (skill.coinGain) f._goldCoins += skill.coinGain;
        if (battleOver) break;
      }
      updateHpBar(enemy, getFighterElId(enemy));
      await triggerOnHitEffects(f, enemy, Math.round(f.atk * (skill.atkScale||0.12) * (skill.hits||8)));
      if (battleOver) break;
    }
    if (f._goldCoins > 0) {
      spawnFloatingNum(getFighterElId(f), `+${(skill.coinGain||2)*(skill.hits||8)}💰`, 'passive-num', 0, -20);
    }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：对全体敌方${skill.hits||8}段魔法伤害，获得${(skill.coinGain||2)*(skill.hits||8)}金币`);
    await sleep(400);

  } else if (skill.type === 'crystalDetonate') {
    // Consume crystallize stacks on target for bonus damage
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const stacks = target._crystallize || 0;
      const baseDmg = Math.round(f.atk * (skill.atkScale||0.5));
      const stackDmg = Math.round(f.atk * (skill.perStackScale||0.6) * stacks);
      const totalDmg = baseDmg + stackDmg;
      applyRawDmg(f, target, totalDmg, false, false, 'magic');
      const tElId = getFighterElId(target);
      spawnFloatingNum(tElId, `-${totalDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:totalDmg});
      updateHpBar(target, tElId);
      if (stacks > 0) spawnFloatingNum(tElId, `引爆${stacks}层`, 'debuff-num', 200, 0);
      if (skill.consumeStacks) target._crystallize = 0;
      renderStatusIcons(target);
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：引爆${stacks}层结晶，造成 ${totalDmg} 魔法伤害`);
      await triggerOnHitEffects(f, target, totalDmg);
    }
    await sleep(400);

  } else if (skill.type === 'bubbleBurst') {
    // Consume bubble store for damage
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const consumed = Math.round(f.bubbleStore * (skill.bubbleConsumePct||60) / 100);
      f.bubbleStore -= consumed;
      updateHpBar(f, getFighterElId(f)); // refresh bubble bar
      applyRawDmg(f, target, consumed, false, false, 'magic');
      const tElId = getFighterElId(target);
      spawnFloatingNum(tElId, `-${consumed}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:consumed});
      updateHpBar(target, tElId);
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：消耗${consumed}泡泡值，造成 ${consumed} 魔法伤害`);
      await triggerOnHitEffects(f, target, consumed);
    }
    await sleep(400);

  } else if (skill.type === 'shellAuraBurst') {
    // Consume all stored energy for AOE damage
    const enemies = getAliveEnemiesWithSummons(f.side);
    const baseDmg = Math.round(f.atk * (skill.atkScale||0.5));
    const energyDmg = Math.round(f._storedEnergy * (skill.energyDmgScale||1.2));
    const totalDmg = baseDmg + energyDmg;
    for (const enemy of enemies) {
      applyRawDmg(f, enemy, totalDmg, false, false, 'physical');
      spawnFloatingNum(getFighterElId(enemy), `-${totalDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:totalDmg});
      updateHpBar(enemy, getFighterElId(enemy));
      await triggerOnHitEffects(f, enemy, totalDmg);
      if (battleOver) break;
    }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：消耗${f._storedEnergy}储能，对全体造成 ${totalDmg} 物理伤害`);
    f._storedEnergy = 0;
    updateHpBar(f, getFighterElId(f)); // refresh energy bar
    await sleep(400);

  } else if (skill.type === 'piratePlunder') {
    // Break shield first, then damage + steal def
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      // Shield break
      if (skill.shieldBreakPct && target.shield > 0) {
        const broken = Math.round(target.shield * skill.shieldBreakPct / 100);
        target.shield -= broken;
        spawnFloatingNum(getFighterElId(target), `-${broken}`, 'shield-dmg', 0, 0);
        updateHpBar(target, getFighterElId(target));
        addLog(`${f.emoji}${f.name} 破坏 ${target.emoji}${target.name} ${broken}护盾！`);
      }
      if (skill.shieldBreakPct && target.bubbleShieldVal > 0) {
        const broken = Math.round(target.bubbleShieldVal * skill.shieldBreakPct / 100);
        target.bubbleShieldVal -= broken;
      }
      await doDamage(f, target, skill);
      const defSteal = Math.round(target.baseDef * (skill.stealDefPct||20) / 100);
      if (defSteal > 0) {
        target.buffs.push({ type:'defDown', value:defSteal, turns:skill.stealDefTurns||3 });
        f.buffs.push({ type:'defUp', value:defSteal, turns:skill.stealDefTurns||3 });
        recalcStats();
        const tElId = getFighterElId(target);
        const fElId = getFighterElId(f);
        spawnFloatingNum(tElId, `-${defSteal}护甲`, 'debuff-num', 200, 0);
        spawnFloatingNum(fElId, `+${defSteal}护甲`, 'passive-num', 200, 0);
        renderStatusIcons(target);
        renderStatusIcons(f);
        updateFighterStats(target, tElId);
        updateFighterStats(f, fElId);
        addLog(`${f.emoji}${f.name} 偷取 ${target.emoji}${target.name} ${defSteal}护甲！`);
      }
    }

  } else if (skill.type === 'candyTrap') {
    // Damage + speed down + atk down
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      await doDamage(f, target, skill);
      if (skill.atkDown) {
        const atkLoss = Math.round(target.baseAtk * skill.atkDown.pct / 100);
        target.buffs.push({ type:'atkDown', value:atkLoss, turns:skill.atkDown.turns });
        spawnFloatingNum(getFighterElId(target), `-${atkLoss}攻`, 'debuff-num', 200, 0);
      }
      if (skill.spdDown) {
        target.buffs.push({ type:'spdDown', value:skill.spdDown.pct, turns:skill.spdDown.turns });
        spawnFloatingNum(getFighterElId(target), `减速`, 'debuff-num', 300, 0);
      }
      recalcStats();
      renderStatusIcons(target);
      updateFighterStats(target, getFighterElId(target));
    }

  } else if (skill.type === 'lineInkBomb') {
    // AOE damage + add ink stacks
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) {
      for (let h = 0; h < (skill.hits||3); h++) {
        const dmg = Math.round(f.atk * (skill.atkScale||0.3));
        applyRawDmg(f, enemy, dmg, false, false, 'physical');
        spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', h * 60, 0, {atkSide:f.side, amount:dmg});
        if (battleOver) break;
      }
      updateHpBar(enemy, getFighterElId(enemy));
      if (skill.inkStacks) {
        enemy._inkStacks = (enemy._inkStacks||0) + skill.inkStacks;
        const maxInk = (f._passiveSkills && f._passiveSkills.some(p => p.type === 'lineRapid')) ? 7 : 5;
        enemy._inkStacks = Math.min(enemy._inkStacks, maxInk);
        spawnFloatingNum(getFighterElId(enemy), `+${skill.inkStacks}墨迹`, 'debuff-num', 200, 0);
        renderStatusIcons(enemy);
      }
      await triggerOnHitEffects(f, enemy, Math.round(f.atk * (skill.atkScale||0.3) * (skill.hits||3)));
      if (battleOver) break;
    }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：对全体${skill.hits||3}段物理伤害，叠加${skill.inkStacks||2}层墨迹`);
    await sleep(400);

  } else if (skill.type === 'lightningSurge') {
    // AOE true damage based on shock stacks, consume all
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) {
      const stacks = enemy._shockStacks || 0;
      if (stacks > 0) {
        const dmg = Math.round(f.atk * (skill.shockPerStackScale||0.10) * stacks);
        applyRawDmg(f, enemy, dmg, false, false, 'true');
        spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:dmg});
        updateHpBar(enemy, getFighterElId(enemy));
        addLog(`${f.emoji}${f.name} 感电 ${enemy.emoji}${enemy.name}：${stacks}层电击 → ${dmg} 真实伤害`);
        enemy._shockStacks = 0;
        renderStatusIcons(enemy);
        await triggerOnHitEffects(f, enemy, dmg);
        if (battleOver) break;
      }
    }
    await sleep(400);

  // ── Damage Skills with Special Modifiers ──
  } else if (skill.type === 'angelSmite') {
    // Damage, convert to true if target rarity <= A
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const rarityOrder = ['D','C','B','A','S'];
      const targetRarityIdx = rarityOrder.indexOf(target.rarity);
      const threshIdx = rarityOrder.indexOf(skill.convertTrueBelow || 'A');
      const dmgType = (targetRarityIdx >= 0 && targetRarityIdx <= threshIdx) ? 'true' : (skill.dmgType || 'physical');
      const baseDmg = Math.round(f.atk * (skill.atkScale||1.0));
      const hpDmg = Math.round(target.maxHp * (skill.hpPct||8) / 100);
      const totalDmg = baseDmg + hpDmg;
      applyRawDmg(f, target, totalDmg, false, false, dmgType);
      spawnFloatingNum(getFighterElId(target), `-${totalDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:totalDmg});
      updateHpBar(target, getFighterElId(target));
      if (dmgType === 'true') spawnFloatingNum(getFighterElId(target), `神罚`, 'debuff-num', 200, 0);
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：${totalDmg} ${dmgType==='true'?'真实':'物理'}伤害`);
      await triggerOnHitEffects(f, target, totalDmg);
    }
    await sleep(400);

  } else if (skill.type === 'headlessStorm') {
    // AOE physical 3 hits with temp lifesteal
    const origLifesteal = f._lifestealPct || 0;
    f._lifestealPct = origLifesteal + (skill.tempLifesteal||22);
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) {
      for (let h = 0; h < (skill.hits||3); h++) {
        const dmg = Math.round(f.atk * (skill.atkScale||0.5));
        applyRawDmg(f, enemy, dmg, false, false, 'physical');
        spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', h * 60, 0, {atkSide:f.side, amount:dmg});
        if (battleOver) break;
      }
      updateHpBar(enemy, getFighterElId(enemy));
      await triggerOnHitEffects(f, enemy, Math.round(f.atk * (skill.atkScale||0.5) * (skill.hits||3)));
      if (battleOver) break;
    }
    f._lifestealPct = origLifesteal; // restore
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：+${skill.tempLifesteal||22}%吸血，对全体3段共${Math.round(f.atk*(skill.atkScale||0.5)*(skill.hits||3))}物理伤害`);
    await sleep(400);

  } else if (skill.type === 'headlessSoulStrike') {
    // Single target: 1.5ATK + 25% target current HP magic damage
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const baseDmg = Math.round(f.atk * (skill.atkScale||1.5));
      const hpDmg = Math.round(target.hp * (skill.targetCurrentHpPct||25) / 100);
      const totalDmg = baseDmg + hpDmg;
      applyRawDmg(f, target, totalDmg, false, false, 'magic');
      spawnFloatingNum(getFighterElId(target), `-${totalDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:totalDmg});
      updateHpBar(target, getFighterElId(target));
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：${baseDmg}+${hpDmg}(25%当前HP) = ${totalDmg} 魔法伤害`);
      await triggerOnHitEffects(f, target, totalDmg);
    }
    await sleep(400);

  } else if (skill.type === 'stoneShield') {
    // Self shield: 20% maxHP, 3 turns
    const shieldAmt = Math.round(Math.round(f.maxHp * (skill.shieldHpPct||20) / 100) * getShieldMult());
    f.shield += shieldAmt;
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `+${shieldAmt}`, 'shield-num', 0, 0);
    updateHpBar(f, elId);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-shield">+${shieldAmt}护盾</span>`);
    sfxShield();
    await sleep(800);

  } else if (skill.type === 'bambooSmack') {
    // Single target (ignoreRow): physical damage + chilled + knock to front
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      await doDamage(f, target, skill);
      // Apply chilled
      if (skill.chilled) {
        target.buffs.push({ type:'chilled', value:1, turns:skill.chilled });
        spawnFloatingNum(getFighterElId(target), `❄️冰寒`, 'debuff-num', 200, 0);
        recalcStats();
        renderStatusIcons(target);
        addLog(`${target.emoji}${target.name} 被冰寒${skill.chilled}回合！`);
      }
      // Knock to front if target is in back row and front has space
      if (skill.knockToFront && target._position === 'back' && target.alive) {
        const enemyTeam = target.side === 'left' ? leftTeam : rightTeam;
        const frontCount = enemyTeam.filter(t => t.alive && t._position === 'front').length;
        if (frontCount < 3) {
          target._position = 'front';
          spawnFloatingNum(getFighterElId(target), `击至前排!`, 'passive-num', 300, 0);
          addLog(`${target.emoji}${target.name} 被击至前排！`);
          // Don't call renderScene() mid-action — just update position visually
          updateSceneHp(target);
        }
      }
    }

  } else if (skill.type === 'stoneQuake') {
    // AOE magic damage: atkScale*ATK + defScale*DEF, stun chance
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) {
      const dmg = Math.round(f.atk * (skill.atkScale||0.4)) + Math.round(f.def * (skill.defScale||0.8));
      applyRawDmg(f, enemy, dmg, false, false, 'magic');
      spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:dmg});
      updateHpBar(enemy, getFighterElId(enemy));
      // Stun chance
      if (skill.stunChance && Math.random() * 100 < skill.stunChance) {
        enemy.buffs.push({ type:'stun', value:1, turns:1 });
        spawnFloatingNum(getFighterElId(enemy), `眩晕`, 'debuff-num', 200, 0);
        renderStatusIcons(enemy);
        addLog(`${enemy.emoji}${enemy.name} 被眩晕！`);
      }
      await triggerOnHitEffects(f, enemy, dmg);
      if (battleOver) break;
    }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：对全体造成魔法伤害`);
    await sleep(400);

  } else if (skill.type === 'volcanoStomp') {
    // AOE magic damage + stun chance + self heal lost HP
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) {
      const dmg = Math.round(f.atk * (skill.atkScale||0.8));
      applyRawDmg(f, enemy, dmg, false, false, 'magic');
      spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:dmg});
      updateHpBar(enemy, getFighterElId(enemy));
      if (skill.stunChance && Math.random() * 100 < skill.stunChance) {
        enemy.buffs.push({ type:'stun', value:1, turns:1 });
        spawnFloatingNum(getFighterElId(enemy), `眩晕`, 'debuff-num', 200, 0);
        renderStatusIcons(enemy);
        addLog(`${enemy.emoji}${enemy.name} 被眩晕！`);
      }
      await triggerOnHitEffects(f, enemy, dmg);
      if (battleOver) break;
    }
    // Self heal lost HP
    if (skill.healLostPct) {
      const lostHp = f.maxHp - f.hp;
      const heal = Math.round(lostHp * skill.healLostPct / 100);
      const actual = applyHeal(f, heal);
      if (actual > 0) {
        spawnFloatingNum(getFighterElId(f), `+${actual}`, 'heal-num', 0, 0);
        updateHpBar(f, getFighterElId(f));
      }
    }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：对全体造成魔法伤害`);
    await sleep(400);

  } else if (skill.type === 'bambooSpikes') {
    // AOE multi-hit: atkScale*ATK + selfHpPct*maxHP per hit
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) {
      for (let h = 0; h < (skill.hits||5); h++) {
        const dmg = Math.round(f.atk * (skill.atkScale||0.18)) + Math.round(f.maxHp * (skill.selfHpPct||3) / 100);
        applyRawDmg(f, enemy, dmg, false, false, 'physical');
        spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', h * 60, 0, {atkSide:f.side, amount:dmg});
        if (battleOver) break;
      }
      updateHpBar(enemy, getFighterElId(enemy));
      await triggerOnHitEffects(f, enemy, (Math.round(f.atk * (skill.atkScale||0.18)) + Math.round(f.maxHp * (skill.selfHpPct||3) / 100)) * (skill.hits||5));
      if (battleOver) break;
    }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：对全体${skill.hits||5}段物理伤害`);
    await sleep(400);

  } else if (skill.type === 'hidingStrike') {
    // Single target: atkScale*ATK + defScale*DEF
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const dmg = Math.round(f.atk * (skill.atkScale||2.2)) + Math.round(f.def * (skill.defScale||0.5));
      applyRawDmg(f, target, dmg, false, false, 'physical');
      spawnFloatingNum(getFighterElId(target), `-${dmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:dmg});
      updateHpBar(target, getFighterElId(target));
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：${dmg} 物理伤害`);
      await triggerOnHitEffects(f, target, dmg);
    }
    await sleep(400);

  } else if (skill.type === 'diceDeathBet') {
    // Damage based on lost HP
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const baseDmg = Math.round(f.atk * (skill.atkScale||0.5));
      const lostHp = f.maxHp - f.hp;
      const lostHpBonus = Math.round(lostHp * (skill.lostHpBonusPct||200) / 100);
      const totalDmg = baseDmg + lostHpBonus;
      applyRawDmg(f, target, totalDmg, false, false, 'physical');
      spawnFloatingNum(getFighterElId(target), `-${totalDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:totalDmg});
      updateHpBar(target, getFighterElId(target));
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：${totalDmg} 物理伤害（+${lostHpBonus}已损生命加成）`);
      await triggerOnHitEffects(f, target, totalDmg);
    }
    await sleep(400);

  } else if (skill.type === 'diceLuckyCrit') {
    // Guaranteed crit with random multiplier
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const baseDmg = Math.round(f.atk * (skill.atkScale||1.0));
      const critRange = skill.randomCritMult || {min:150,max:350};
      const critMult = (critRange.min + Math.random() * (critRange.max - critRange.min)) / 100;
      const totalDmg = Math.round(baseDmg * critMult);
      applyRawDmg(f, target, totalDmg, false, false, 'physical');
      spawnFloatingNum(getFighterElId(target), `-${totalDmg}`, 'crit-dmg', 0, 0, {atkSide:f.side, amount:totalDmg});
      updateHpBar(target, getFighterElId(target));
      spawnFloatingNum(getFighterElId(target), `暴击×${Math.round(critMult*100)}%`, 'passive-num', 200, 0);
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：暴击×${Math.round(critMult*100)}% = ${totalDmg} 物理伤害`);
      sfxCrit();
      await triggerOnHitEffects(f, target, totalDmg);
    }
    await sleep(400);

  } else if (skill.type === 'diamondSmash') {
    // Single target: DEF + MR + 0.1ATK physical damage + bleed
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const dmg = Math.round(f.def * (skill.defScale||1.0)) + Math.round(f.mr * (skill.mrScale||1.0)) + Math.round(f.atk * (skill.atkScale||0.1));
      applyRawDmg(f, target, dmg, false, false, 'physical');
      spawnFloatingNum(getFighterElId(target), `-${dmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:dmg});
      updateHpBar(target, getFighterElId(target));
      // Apply bleed
      if (skill.bleedTurns) {
        target.buffs.push({ type:'bleed', value:skill.bleedValue||12, turns:skill.bleedTurns, sourceSide:f.side });
        spawnFloatingNum(getFighterElId(target), `🩸流血`, 'debuff-num', 200, 0);
        renderStatusIcons(target);
        addLog(`${target.emoji}${target.name} 流血${skill.bleedTurns}回合！`);
      }
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：${dmg} 物理伤害`);
      await triggerOnHitEffects(f, target, dmg);
    }
    await sleep(400);

  } else if (skill.type === 'fortuneBuyEquip') {
    // Consume 20 coins, draw equipment from chest pool, equip on chosen ally
    if ((f._goldCoins||0) < (skill.coinCost||20)) {
      addLog(`${f.emoji}${f.name} 金币不足（需要${skill.coinCost||20}枚，当前${f._goldCoins||0}枚）`);
      spawnFloatingNum(getFighterElId(f), `金币不足!`, 'debuff-num', 0, 0);
    } else {
      f._goldCoins -= (skill.coinCost||20);
      // Draw from chest equipment pools (basic→advanced→legend based on total draws)
      const drawCount = f._fortuneEquipDraws || 0;
      f._fortuneEquipDraws = drawCount + 1;
      // Use chest turtle's equipment pool definition
      const chestPet = ALL_PETS.find(p => p.id === 'chest');
      if (chestPet && chestPet.passive && chestPet.passive.pools) {
        const pools = chestPet.passive.pools;
        const poolIdx = drawCount < 2 ? 0 : drawCount < 4 ? 1 : 2;
        const pool = pools[Math.min(poolIdx, pools.length-1)];
        const owned = (f._fortuneEquips || []).map(e => e.id);
        const available = pool.filter(e => !owned.includes(e.id));
        if (available.length > 0) {
          const equip = available[Math.floor(Math.random() * available.length)];
          if (!f._fortuneEquips) f._fortuneEquips = [];
          f._fortuneEquips.push(equip);
          // Apply to self for now (TODO: ally selection UI)
          if (typeof applyChestEquip === 'function') applyChestEquip(f, equip);
          spawnFloatingNum(getFighterElId(f), `${equip.icon ? '' : '📦'}${equip.name}`, 'passive-num', 0, 0);
          addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：消耗20金币，获得装备「${equip.name}」！`);
        } else {
          addLog(`${f.emoji}${f.name} 装备池已空！`);
        }
      }
    }
    renderStatusIcons(f);
    sfxCoin();
    await sleep(800);

  } else if (skill.type === 'fortuneGainCoins') {
    // Gain coins
    f._goldCoins = (f._goldCoins||0) + (skill.coinGain||9);
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `+${skill.coinGain||9}💰`, 'passive-num', 0, 0);
    renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：获得${skill.coinGain||9}枚金币（共${f._goldCoins}枚）`);
    sfxCoin();
    await sleep(600);

  } else if (skill.type === 'rainbowGuard') {
    // Single ally: shield + ATK buff
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const shieldAmt = Math.round(Math.round(f.atk * (skill.shieldAtkScale||1.0)) * getShieldMult());
      target.shield += shieldAmt;
      const tElId = getFighterElId(target);
      spawnFloatingNum(tElId, `+${shieldAmt}`, 'shield-num', 0, 0);
      updateHpBar(target, tElId);
      if (skill.atkUpPct) {
        const atkGain = Math.round(target.baseAtk * skill.atkUpPct / 100);
        target.buffs.push({ type:'atkUp', value:atkGain, turns:skill.atkUpTurns||3 });
        spawnFloatingNum(tElId, `+${atkGain}攻`, 'passive-num', 200, 0);
        recalcStats();
        renderStatusIcons(target);
        updateFighterStats(target, tElId);
      }
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-shield">+${shieldAmt}护盾</span> <span class="log-passive">+${skill.atkUpPct}%攻击 ${skill.atkUpTurns||3}回合</span>`);
      sfxShield();
    }
    await sleep(800);

  } else if (skill.type === 'hunterMark') {
    // Damage + apply hunter mark (exec below threshold)
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      await doDamage(f, target, skill);
      if (target.alive && skill.markTurns) {
        target.buffs.push({ type:'hunterMark', value:skill.markExecPct||24, turns:skill.markTurns, sourceIdx:allFighters.indexOf(f) });
        spawnFloatingNum(getFighterElId(target), `🎯猎杀印记`, 'debuff-num', 200, 0);
        renderStatusIcons(target);
        addLog(`${target.emoji}${target.name} 被标记！HP<${skill.markExecPct||24}%时将被斩杀`);
      }
    }

  } else if (skill.type === 'hidingBuffSummon') {
    // Buff summon: +10%ATK, +10%DEF/MR, +10%lifesteal, +20%crit for 2 turns
    const summon = f._summon;
    if (summon && summon.alive) {
      const atkGain = Math.round(summon.baseAtk * 0.10);
      const defGain = Math.round(summon.baseDef * 0.10);
      const mrGain = Math.round((summon.baseMr||summon.baseDef) * 0.10);
      summon.buffs.push({ type:'atkUp', value:atkGain, turns:2 });
      summon.buffs.push({ type:'defUp', value:defGain, turns:2 });
      summon.buffs.push({ type:'mrUp', value:mrGain, turns:2 });
      summon.buffs.push({ type:'lifesteal', value:10, turns:2 });
      // Crit: add directly, use critUp buff as tracker for removal
      summon.crit = (summon.crit || 0.25) + 0.20;
      summon.buffs.push({ type:'critUp', value:20, turns:2 });
      recalcStats();
      const sElId = getFighterElId(summon) || (summon._summonElId);
      if (sElId) {
        spawnFloatingNum(sElId, `强化!`, 'passive-num', 0, 0);
        renderStatusIcons(summon);
      }
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：随从获得 +10%攻击/护甲/魔抗 +10%吸血 +20%暴击 2回合`);
    } else {
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：随从已阵亡，无效`);
    }
    sfxBuff();
    await sleep(800);

  } else if (skill.type === 'shellAbsorb') {
    // Steal 10% target maxHP
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const stealAmt = Math.round(target.maxHp * (skill.stealHpPct||10) / 100);
      // Reduce target
      target.maxHp -= stealAmt;
      target.hp = Math.min(target.hp, target.maxHp);
      if (target.hp <= 0) target.hp = 1;
      const tElId = getFighterElId(target);
      spawnFloatingNum(tElId, `-${stealAmt}HP`, 'pierce-dmg', 0, 0);
      updateHpBar(target, tElId);
      updateFighterStats(target, tElId);
      // Add to self
      f.maxHp += stealAmt;
      f.hp += stealAmt;
      f._initHp = f.maxHp;
      const fElId = getFighterElId(f);
      spawnFloatingNum(fElId, `+${stealAmt}HP`, 'heal-num', 0, 0);
      updateHpBar(f, fElId);
      updateFighterStats(f, fElId);
      // Track as damage dealt for stats
      f._dmgDealt += stealAmt;
      target._dmgTaken += stealAmt;
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：偷取 ${target.emoji}${target.name} ${stealAmt}最大HP`);
    }
    await sleep(800);

  } else if (skill.type === 'shellErode') {
    // Magic damage + permanent MR shred + CD reduces per use
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      await doDamage(f, target, skill);
      // Permanent MR reduction
      const mrShred = Math.round(f.atk * (skill.mrShredAtkPct||0.1));
      if (mrShred > 0) {
        target.baseMr = Math.max(0, target.baseMr - mrShred);
        recalcStats();
        spawnFloatingNum(getFighterElId(target), `-${mrShred}魔抗`, 'debuff-num', 200, 0);
        updateFighterStats(target, getFighterElId(target));
        addLog(`${target.emoji}${target.name} 永久魔抗-${mrShred}`);
      }
      // Reduce own CD permanently
      if (skill.cdReducePerUse && skill.cd > 0) {
        skill.cd = Math.max(0, skill.cd - skill.cdReducePerUse);
      }
    }

  } else if (skill.type === 'shellFortify') {
    // Physical damage + permanent self ATK gain + CD reduces per use
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      await doDamage(f, target, skill);
      // Permanent ATK gain
      const atkGain = Math.round(f.atk * (skill.selfAtkGainPct||0.1));
      if (atkGain > 0) {
        f.baseAtk += atkGain;
        recalcStats();
        spawnFloatingNum(getFighterElId(f), `+${atkGain}攻`, 'passive-num', 200, 0);
        updateFighterStats(f, getFighterElId(f));
        addLog(`${f.emoji}${f.name} 永久攻击+${atkGain}`);
      }
      // Reduce own CD permanently
      if (skill.cdReducePerUse && skill.cd > 0) {
        skill.cd = Math.max(0, skill.cd - skill.cdReducePerUse);
      }
    }

  } else {
    const target = allFighters[action.targetId];
    await doDamage(f, target, skill);
  }

  if (atkEl) atkEl.classList.remove('attack-anim');

  updateDmgStats();

  checkDeaths(f);

  // Process pending chest phoenix revive (animated)
  for (const ff of allFighters) {
    if (ff._pendingChestRevive) {
      ff._pendingChestRevive = false;
      const elId = getFighterElId(ff);
      const el = document.getElementById(elId);
      // Show death briefly
      ff.hp = 0; ff.alive = false;
      if (el) el.classList.add('dead');
      updateHpBar(ff, elId);
      addLog(`${ff.emoji}${ff.name} 被击败...凤凰雕像开始发光！`);
      await sleep(800);
      // Fire particles converging
      try {
        const cardRect = el ? el.getBoundingClientRect() : {left:100,top:100,width:100,height:50};
        for (let i = 0; i < 8; i++) {
          const p = document.createElement('div');
          p.className = 'mech-drone-particle';
          p.style.background = '#ff9f43';
          p.style.boxShadow = '0 0 8px #ff6600';
          const angle = (i / 8) * Math.PI * 2;
          const dist = 60 + _origMathRandom() * 40;
          p.style.left = (cardRect.left + cardRect.width/2 + Math.cos(angle) * dist) + 'px';
          p.style.top = (cardRect.top + cardRect.height/2 + Math.sin(angle) * dist) + 'px';
          document.body.appendChild(p);
          requestAnimationFrame(() => {
            p.style.transition = `all ${0.4 + i*0.05}s ease-in`;
            p.style.left = (cardRect.left + cardRect.width/2 - 6) + 'px';
            p.style.top = (cardRect.top + cardRect.height/2 - 6) + 'px';
            p.style.opacity = '0';
            p.style.transform = 'scale(0.3)';
          });
          setTimeout(() => p.remove(), 1500);
        }
      } catch(e) {}
      await sleep(800);
      // Flash
      try {
        const flash = document.createElement('div');
        flash.className = 'mech-transform-flash';
        flash.style.background = 'rgba(255,159,67,.4)';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 500);
      } catch(e) {}
      try { sfxRebirth(); } catch(e) {}
      await sleep(300);
      // Revive
      const revivePct = (ff._chestEquips.find(e => e.id === 'phoenix') || {}).pct || 25;
      ff.hp = Math.round(ff.maxHp * revivePct / 100);
      ff.alive = true;
      ff._deathProcessed = false;
      if (el) { el._pendingDead = false; el.classList.remove('dead','death-anim'); }
      updateHpBar(ff, elId);
      renderStatusIcons(ff);
      spawnFloatingNum(elId, '🐦凤凰重生!', 'crit-label', 0, -25);
      spawnFloatingNum(elId, `+${ff.hp}HP`, 'heal-num', 200, 0);
      addLog(`${ff.emoji}${ff.name} <span class="log-passive">🐦凤凰雕像！以${revivePct}%HP重生！</span>`);
      await sleep(800);
    }
  }

  // Process pending mech transforms (async with dramatic pause)
  for (const ff of allFighters) {
    if (ff._pendingMech) {
      const dc = ff._pendingMech;
      ff._pendingMech = null;
      const elId = getFighterElId(ff);
      // Show death briefly
      const el = document.getElementById(elId);
      // Show death immediately
      ff.hp = 0; ff.alive = false;
      if (el) el.classList.add('dead');
      updateHpBar(ff, elId);
      addLog(`${ff.emoji}${ff.name} 被击败...浮游炮开始组装！`);
      // Spawn drone assembly particles flying toward the card
      try {
        const cardRect = el ? el.getBoundingClientRect() : {left:100,top:100,width:100,height:50};
        for (let di = 0; di < dc; di++) {
          const particle = document.createElement('div');
          particle.className = 'mech-drone-particle';
          const angle = (di / dc) * Math.PI * 2;
          const dist = 80 + _origMathRandom() * 60;
          particle.style.left = (cardRect.left + cardRect.width/2 + Math.cos(angle) * dist) + 'px';
          particle.style.top = (cardRect.top + cardRect.height/2 + Math.sin(angle) * dist) + 'px';
          document.body.appendChild(particle);
          requestAnimationFrame(() => {
            particle.style.transition = `all ${0.4 + di*0.05}s ease-in`;
            particle.style.left = (cardRect.left + cardRect.width/2 - 6) + 'px';
            particle.style.top = (cardRect.top + cardRect.height/2 - 6) + 'px';
            particle.style.opacity = '0';
            particle.style.transform = 'scale(0.3)';
          });
          setTimeout(() => particle.remove(), 1500);
        }
      } catch(e) {}
      try { sfxExplosion(); } catch(e) {}
      await sleep(1000);
      // Screen flash for transform
      try {
        const flash = document.createElement('div');
        flash.className = 'mech-transform-flash';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 600);
      } catch(e) {}
      try { sfxRebirth(); } catch(e) {}
      await sleep(300);
      // Transform to mech
      const finalHp = ff.passive.mechHpPer * dc;
      const finalAtk = ff.passive.mechAtkPer * dc;
      ff.maxHp = finalHp;
      ff.hp = 0;
      ff.baseAtk = 0; ff.atk = 0;
      const mechDef = ff._cyberEnhanced ? dc : 0;
      ff.baseDef = mechDef; ff.def = mechDef;
      ff.baseMr = mechDef; ff.mr = mechDef;
      ff.shield = 0; ff.bubbleShieldVal = 0;
      ff.crit = 0.25; ff.armorPen = 0;
      ff.alive = true; ff._deathProcessed = false;
      ff.name = '机甲';
      ff.emoji = '🤖';
      ff.id = 'mech'; // for CSS flip exception
      ff.img = 'assets/passive/mech-form-icon.png';
      ff.buffs = [];
      ff.passive = { type:'mechBody', droneCount:dc, mechHpPer:30, mechAtkPer:5, desc:`由 ${dc} 个浮游炮组装而成。\n\n· 生命值 = 35 × ${dc} = ${finalHp}\n· 攻击力 = 5 × ${dc} = ${finalAtk}\n· 护甲 = 0\n· 暴击率 = 25%\n\n每回合自动攻击生命值最低的敌人，造成（150%×攻击力 = ${Math.round(finalAtk*1.5)}）物理伤害。` };
      ff.skills = [{ name:'机甲攻击', type:'mechAttack', hits:1, power:0, pierce:0, cd:0, cdLeft:0, atkScale:1.5,
        brief:'机甲自动攻击生命值最低的敌人，造成{N:1.5*ATK}物理伤害',
        detail:'机甲自动锁定生命值最低的敌方目标。\n造成 150%×(攻击力={ATK}) = {N:1.5*ATK} 物理伤害。' }];
      ff._initAtk = 0; ff._initDef = 0; ff._initHp = 0;
      if (el) {
        el.classList.remove('dead');
        el.classList.add('mech-transform-anim');
        setTimeout(() => el.classList.remove('mech-transform-anim'), 800);
      }
      renderFighterCard(ff, elId);
      updateHpBar(ff, elId);
      spawnFloatingNum(elId, `🤖机甲充能中...`, 'crit-label', 0, -25);
      // Ramp up HP and ATK over ~3 seconds
      const rampSteps = 20;
      const rampInterval = 150; // 20×150ms = 3000ms
      for (let ri = 1; ri <= rampSteps; ri++) {
        ff.hp = Math.round(finalHp * ri / rampSteps);
        ff.baseAtk = Math.round(finalAtk * ri / rampSteps);
        ff.atk = ff.baseAtk;
        updateHpBar(ff, elId);
        updateFighterStats(ff, elId);
        await sleep(rampInterval);
      }
      ff.hp = finalHp; ff.maxHp = finalHp;
      ff.baseAtk = finalAtk; ff.atk = finalAtk;
      updateHpBar(ff, elId);
      updateFighterStats(ff, elId);
      spawnFloatingNum(elId, `🤖机甲启动!`, 'crit-label', 0, -25);
      spawnFloatingNum(elId, `${dc}炮→HP${ff.hp} ATK${ff.atk}`, 'passive-num', 0, 0);
      addLog(`🤖${ff.name} <span class="log-passive">浮游炮×${dc}组装完成！HP${ff.hp} ATK${ff.atk}</span>`);
      const mechIdx = allFighters.indexOf(ff);
      if (actedThisSide.has(mechIdx)) actedThisSide.delete(mechIdx);
      await sleep(400);
    }
  }

  if (checkBattleEnd()) { animating=false; return; }

  // Hunter passive: check after every action
  await processHunterKill();
  if (checkBattleEnd()) { animating=false; return; }

  // Lava rage transform check
  await processLavaTransform();
  if (checkBattleEnd()) { animating=false; return; }

  // BambooCharge follow-up: extra pierce attack after skill
  if (f.alive && f.passive && f.passive.type === 'bambooCharge' && f._bambooCharged && !f._bambooFired) {
    const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
    if (enemies.length) {
      const skillTarget = action.targetId >= 0 ? allFighters[action.targetId] : null;
      const target = (skillTarget && skillTarget.alive && skillTarget.side !== f.side) ? skillTarget : enemies.sort((a,b) => a.hp - b.hp)[0];
      await doBambooChargeAttack(f, target);
      // Consume charge — will need to accumulate again
      f._bambooCharged = false;
      if (checkBattleEnd()) { animating=false; return; }
    }
  }

  // Summon: hidingCommand gives summon an extra action NOW
  // Normal summon auto-action happens at end of turn (processEndOfTurn)

  animating = false;

  // Host: send action to guest (guest re-executes with same seeded random)
  if (gameMode === 'pvp-online' && onlineSide === 'left') {
    sendOnline({ type:'action', action });
  }

  // Drain queued actions (online opponent sent action while we were animating)
  if (_actionQueue.length > 0) {
    const next = _actionQueue.shift();
    executeAction(next);
    return;
  }

  onActionComplete();
}

// Build lightweight state snapshot for online sync
function buildStateSync() {
  return {
    turnNum,
    activeSide,
    fighters: allFighters.map(f => ({
      hp: f.hp, maxHp: f.maxHp, shield: f.shield,
      atk: f.atk, def: f.def, mr: f.mr, baseAtk: f.baseAtk, baseDef: f.baseDef, baseMr: f.baseMr,
      alive: f.alive, crit: f.crit, armorPen: f.armorPen, armorPenPct: f.armorPenPct, magicPen: f.magicPen, magicPenPct: f.magicPenPct,
      _deathProcessed: f._deathProcessed, _isMech: f._isMech,
      _inkStacks: f._inkStacks, _shockStacks: f._shockStacks,
      _starEnergy: f._starEnergy, _goldCoins: f._goldCoins,
      _dmgDealt: f._dmgDealt, _dmgTaken: f._dmgTaken,
      _physDmgDealt: f._physDmgDealt, _magicDmgDealt: f._magicDmgDealt, _trueDmgDealt: f._trueDmgDealt,
      _physDmgTaken: f._physDmgTaken, _magicDmgTaken: f._magicDmgTaken, _trueDmgTaken: f._trueDmgTaken,
      _bambooCharged: f._bambooCharged, _bambooCounter: f._bambooCounter,
      _hunterKills: f._hunterKills, _lifestealPct: f._lifestealPct || 0,
      _drones: f._drones ? f._drones.length : 0,
      bubbleStore: f.bubbleStore, bubbleShieldVal: f.bubbleShieldVal, bubbleShieldTurns: f.bubbleShieldTurns,
      name: f.name, emoji: f.emoji,
      buffs: f.buffs.map(b => ({...b})),
      skills: f.skills.map(s => ({ cdLeft: s.cdLeft })),
    })),
  };
}

// Apply state sync from host (guest side)
function applyStateSync(state) {
  turnNum = state.turnNum;
  activeSide = state.activeSide;
  state.fighters.forEach((sf, i) => {
    if (!allFighters[i]) return;
    const f = allFighters[i];
    f.hp = sf.hp; f.maxHp = sf.maxHp; f.shield = sf.shield;
    f.atk = sf.atk; f.def = sf.def; f.mr = sf.mr; f.baseAtk = sf.baseAtk; f.baseDef = sf.baseDef; f.baseMr = sf.baseMr;
    f.alive = sf.alive; f.crit = sf.crit;
    f.armorPen = sf.armorPen; f.armorPenPct = sf.armorPenPct; f.magicPen = sf.magicPen || 0; f.magicPenPct = sf.magicPenPct || 0;
    f._deathProcessed = sf._deathProcessed; f._isMech = sf._isMech;
    f._inkStacks = sf._inkStacks; f._shockStacks = sf._shockStacks;
    f._starEnergy = sf._starEnergy; f._goldCoins = sf._goldCoins;
    f._dmgDealt = sf._dmgDealt; f._dmgTaken = sf._dmgTaken;
    f._physDmgDealt = sf._physDmgDealt; f._magicDmgDealt = sf._magicDmgDealt; f._trueDmgDealt = sf._trueDmgDealt;
    f._physDmgTaken = sf._physDmgTaken; f._magicDmgTaken = sf._magicDmgTaken; f._trueDmgTaken = sf._trueDmgTaken;
    f._bambooCharged = sf._bambooCharged; f._bambooCounter = sf._bambooCounter;
    f._hunterKills = sf._hunterKills; f._lifestealPct = sf._lifestealPct || 0;
    f.bubbleStore = sf.bubbleStore; f.bubbleShieldVal = sf.bubbleShieldVal; f.bubbleShieldTurns = sf.bubbleShieldTurns;
    if (sf.name) f.name = sf.name;
    if (sf.emoji) f.emoji = sf.emoji;
    f.buffs = sf.buffs;
    sf.skills.forEach((ss, si) => { if (f.skills[si]) f.skills[si].cdLeft = ss.cdLeft; });
    // Re-render
    const elId = getFighterElId(f);
    updateHpBar(f, elId);
    updateFighterStats(f, elId);
    renderStatusIcons(f);
    const card = document.getElementById(elId);
    if (card) card.classList.toggle('dead', !f.alive);
    // Summon sync
    if (f._summon) updateSummonHpBar(f._summon);
  });
  updateDmgStats();
}

/* ── DAMAGE — multi-hit with crit, floating numbers, debuff application ── */
async function doDamage(attacker, target, skill) {
  const hits = skill.hits;
  const tElId = getFighterElId(target);
  let totalDirect = 0, totalPierce = 0, totalShieldDmg = 0, totalCrits = 0;

  for (let i = 0; i < hits; i++) {
    if (!target.alive) continue;

    // Dodge check
    const dodgeBuff = target.buffs.find(b => b.type === 'dodge');
    const totalDodge = (dodgeBuff ? dodgeBuff.value : 0) + (target._extraDodge || 0);
    if (totalDodge > 0 && Math.random() < totalDodge / 100) {
      const yOff = i * 28;
      spawnFloatingNum(tElId, '闪避!', 'dodge-num', 0, yOff);
      // Dodge counter (e.g. starWarp): deal damage back on dodge
      const dodgeCounterBuff = target.buffs.find(b => b.type === 'dodgeCounter');
      if (dodgeCounterBuff && attacker.alive) {
        const cDmg = dodgeCounterBuff.value;
        applyRawDmg(target, attacker, cDmg, false, false, dodgeCounterBuff.dmgType || 'magic');
        spawnFloatingNum(getFighterElId(attacker), `-${cDmg}`, 'counter-dmg', 100, yOff);
        updateHpBar(attacker, getFighterElId(attacker));
        if (attacker.hp <= 0) attacker.alive = false;
      }
      await sleep(280);
      continue;
    }

    let basePower = skill.power;
    if (skill.atkScale) basePower += Math.round(attacker.atk * skill.atkScale);
    if (skill.defScale) basePower += Math.round(attacker.def * skill.defScale);
    if (skill.mrScale) basePower += Math.round((attacker.mr || attacker.def) * skill.mrScale);
    if (skill.hpPct) basePower += Math.round(target.maxHp * skill.hpPct / 100);
    if (skill.selfHpPct) basePower += Math.round(attacker.maxHp * skill.selfHpPct / 100);
    if (skill.random) basePower = Math.round(basePower * (0.5 + Math.random() * 1.5));

    // Crit calculation
    let effectiveCrit = attacker.crit;
    if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
      effectiveCrit += attacker.passive.pct / 100;
    }
    // GamblerBlood crit overflow → crit damage
    let overflowCritDmg = 0;
    if (effectiveCrit > 1.0) {
      overflowCritDmg = (effectiveCrit - 1.0) * (attacker.passive && attacker.passive.overflowMult || 1.5);
      effectiveCrit = 1.0;
    }
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0) + overflowCritDmg) : 1;
    if (isCrit) totalCrits++;

    // Determine damage type: physical (default), magic, true
    const dmgType = skill.dmgType || 'physical';

    // Defense reduction based on damage type (negative def = damage amplified)
    const effectiveDef = calcEffDef(attacker, target, dmgType);
    const defDmgMult = dmgType === 'true' ? 1 : calcDmgMult(effectiveDef);

    // Main damage = basePower (minus true damage flat) × crit, reduced/amplified by armor/mr
    let trueFlat = skill.trueDmg || skill.pierce || 0;
    if (skill.trueDmgScale || skill.pierceScale) trueFlat += Math.round(attacker.atk * (skill.trueDmgScale || skill.pierceScale));
    const mainBase = Math.max(0, basePower - (skill.trueDmg || skill.pierce || 0));
    let mainDmg = Math.max(1, Math.round(mainBase * critMult * defDmgMult));

    // Passive: bonusDmgAbove60
    if (attacker.passive && attacker.passive.type === 'bonusDmgAbove60' && target.hp / target.maxHp > 0.6) {
      mainDmg = Math.round(mainDmg * (1 + attacker.passive.pct / 100));
    }
    // Passive: frostAura bonus vs specific targets
    if (attacker.passive && attacker.passive.type === 'frostAura' && attacker.passive.bonusTargets && attacker.passive.bonusTargets.includes(target.id)) {
      mainDmg = Math.round(mainDmg * (1 + attacker.passive.bonusDmgPct / 100));
    }
    // Passive skill bonus damage (e.g. ice burn immune skill)
    if (attacker._bonusDmgTargets && attacker._bonusDmgTargets.includes(target.id)) {
      mainDmg = Math.round(mainDmg * (1 + (attacker._bonusDmgPct||0) / 100));
    }
    // Passive: basicTurtle — bonus damage based on target rarity
    if (attacker.passive && attacker.passive.type === 'basicTurtle' && attacker.passive.bonusMap) {
      const bonusPct = attacker.passive.bonusMap[target.rarity] || 0;
      if (bonusPct > 0) mainDmg = Math.round(mainDmg * (1 + bonusPct / 100));
    }
    // Fear: reduces physical/magic damage (not true)
    if (dmgType !== 'true') {
      const fearBuff = attacker.buffs.find(b => b.type === 'fear' && allFighters[b.sourceId] === target);
      if (fearBuff) mainDmg = Math.round(mainDmg * (1 - fearBuff.value / 100));
    }
    // Gambler convert: X% of main damage → true damage
    const pcBuff = attacker.buffs.find(b => b.type === 'gamblerPierceConvert');
    let convertedTrue = 0;
    if (pcBuff) { convertedTrue = Math.round(mainDmg * pcBuff.value / 100); mainDmg -= convertedTrue; }
    // Diamond structure: flat reduction per hit (physical + magic, not true)
    if (dmgType !== 'true' && target.passive && target.passive.type === 'diamondStructure') {
      const defPct = target._diamondEnhanced ? 20 : (target.passive.flatReductionPct || 20);
      const mrPct = target._diamondEnhanced ? 10 : 0;
      const flatReduce = Math.round(target.def * defPct / 100) + Math.round((target.mr||0) * mrPct / 100);
      mainDmg = Math.max(1, mainDmg - flatReduce);
    }
    let mainPart = mainDmg;
    // True damage portion: ignores all defenses, but hits shield
    let truePart = Math.round(trueFlat * critMult) + convertedTrue;
    // Ink mark amplification now handled in applyRawDmg
    const totalHit = mainPart + truePart;

    // Damage absorption
    const { hpLoss, shieldAbs, bubbleAbs } = applyRawDmg(null, target, totalHit);
    // Track by type
    if (dmgType === 'magic') attacker._magicDmgDealt = (attacker._magicDmgDealt||0) + mainPart;
    else if (dmgType === 'true') attacker._trueDmgDealt = (attacker._trueDmgDealt||0) + mainPart;
    else attacker._physDmgDealt = (attacker._physDmgDealt||0) + mainPart;
    if (truePart > 0) attacker._trueDmgDealt = (attacker._trueDmgDealt||0) + truePart;
    attacker._dmgDealt += totalHit;
    updateDmgStats();

    totalDirect += mainPart;
    totalPierce += truePart;
    totalShieldDmg += shieldAbs + bubbleAbs;

    // Floating number classes by damage type
    const mainCls = dmgType === 'magic' ? (isCrit ? 'crit-magic' : 'magic-dmg') : dmgType === 'true' ? (isCrit ? 'crit-true' : 'true-dmg') : (isCrit ? 'crit-dmg' : 'direct-dmg');
    const trueCls = isCrit ? 'crit-true' : 'true-dmg';
    const yOff = (i % 4) * 32;
    // Floating numbers: top→bottom: true(white) → magic(blue) → physical(red), no overlap
    if (bubbleAbs > 0) spawnFloatingNum(tElId, `-${bubbleAbs}<img src="assets/passive/bubble-store-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'shield-dmg', 0, yOff - 20, { atkSide: attacker.side, amount: bubbleAbs });
    if (shieldAbs > 0) spawnFloatingNum(tElId, `-${shieldAbs}`, 'shield-dmg', 0, yOff - 10, { atkSide: attacker.side, amount: shieldAbs });
    if (hpLoss > 0 && truePart > 0) {
      const mainHp = Math.min(mainPart, hpLoss);
      const trueHp = hpLoss - mainHp;
      // True on top, main below
      if (trueHp > 0) spawnFloatingNum(tElId, `-${trueHp}`, trueCls, 0, yOff, { atkSide: attacker.side, amount: trueHp });
      if (mainHp > 0) spawnFloatingNum(tElId, `-${mainHp}`, mainCls, 0, yOff + 20, { atkSide: attacker.side, amount: mainHp });
    } else if (hpLoss > 0) {
      spawnFloatingNum(tElId, `-${hpLoss}`, mainCls, 0, yOff, { atkSide: attacker.side, amount: hpLoss });
    }
    if (truePart > 0 && shieldAbs >= totalHit) {
      spawnFloatingNum(tElId, `-${truePart}`, trueCls, 0, yOff, { atkSide: attacker.side, amount: truePart });
    }

    // All on-hit effects (trap, reflect, bubble, lightning, etc.)
    await triggerOnHitEffects(attacker, target, totalHit);

    // Passive: judgement — extra magic damage based on target's current HP
    if (attacker.passive && attacker.passive.type === 'judgement' && target.alive) {
      const judgePct = attacker.passive.hpPct / 100;
      const judgeRaw = Math.round(target.hp * judgePct);
      // Apply as magic damage (reduced by MR)
      const effMr = calcEffDef(attacker, target, 'magic');
      const judgeReduced = Math.max(1, Math.round(judgeRaw * calcDmgMult(effMr) * critMult));
      applyRawDmg(attacker, target, judgeReduced, false, false, 'magic');
      totalDirect += judgeReduced;
      if (skill._judgeTotal !== undefined) skill._judgeTotal += judgeReduced;
      // Blue number above the main hit (yOff - 20 to sit above)
      spawnFloatingNum(tElId, `-${judgeReduced}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, yOff - 20, { atkSide: attacker.side, amount: judgeReduced });
      updateHpBar(target, tElId);
      await sleep(200);
    }

    // Hit animation based on damage type
    playHitAnim(tElId, dmgType, isCrit);
    updateHpBar(target, tElId);
    await sleep(500);

    // Passive: gamblerMultiHit
    await tryGamblerMultiHit(attacker, target, tElId);
  }

  // Rainbow prism bonus: skill with prismBonus gains extra effect based on current color
  if (skill.prismBonus && attacker._prismColor !== undefined && attacker.alive) {
    const fElId = getFighterElId(attacker);
    if (attacker._prismColor === 0 && target.alive) {
      // Red: bonus 20% damage as true
      const bonus = Math.round(totalDirect * 0.2);
      if (bonus > 0) {
        applyRawDmg(attacker, target, bonus, false, false, 'true');
        spawnFloatingNum(tElId, `-${bonus}🔴`, 'true-dmg', 100, 0, { atkSide: attacker.side, amount: bonus });
        updateHpBar(target, tElId);
      }
    } else if (attacker._prismColor === 1) {
      // Blue: gain small shield (20% ATK)
      const shieldAmt = Math.round(attacker.atk * 0.2);
      attacker.shield += shieldAmt;
      spawnFloatingNum(fElId, `+${shieldAmt}🔵`, 'shield-num', 100, 0);
      updateHpBar(attacker, fElId);
    } else if (attacker._prismColor === 2) {
      // Green: heal 5% maxHP
      const heal = Math.round(attacker.maxHp * 0.05);
      const before = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      const actual = Math.round(attacker.hp - before);
      if (actual > 0) {
        spawnFloatingNum(fElId, `+${actual}🟢`, 'heal-num', 100, 0);
        updateHpBar(attacker, fElId);
      }
    }
  }

  // Apply debuffs from skill (only if target still alive)
  if (target.alive) {
    applySkillDebuffs(skill, target, attacker);
  }

  // Passive: counterAttack — target may counter
  if (target.alive && target.passive && target.passive.type === 'counterAttack') {
    if (Math.random() < target.passive.pct / 100) {
      const counterDmg = Math.round(target.baseAtk * 0.5);
      attacker.hp = Math.max(0, attacker.hp - counterDmg);
      const aElId = getFighterElId(attacker);
      spawnFloatingNum(aElId, `-${counterDmg}`, 'counter-dmg', 0, 0);
      updateHpBar(attacker, aElId);
      addLog(`${target.emoji}${target.name} <span class="log-passive">反击！</span>对 ${attacker.emoji}${attacker.name} 造成 <span class="log-direct">${counterDmg}物理</span>`);
      if (attacker.hp <= 0) attacker.alive = false;
    }
  }

  // Log
  const h = hits > 1 ? ` ${hits}段` : '';
  const parts = [];
  if (totalShieldDmg > 0) parts.push(`<span class="log-shield-dmg">${totalShieldDmg}护盾</span>`);
  if (totalDirect > 0)    parts.push(`<span class="log-direct">${totalDirect}物理</span>`);
  if (totalPierce > 0)    parts.push(`<span class="log-pierce">${totalPierce}真实</span>`);
  if (totalCrits > 0)     parts.push(`<span class="log-crit">${totalCrits}暴击</span>`);
  addLog(`${attacker.emoji}${attacker.name} <b>${skill.name}</b>${h} → ${target.emoji}${target.name}：${parts.join(' + ')}`);

  // Lifesteal is now handled in triggerOnHitEffects per hit

  // Self buff: selfAtkUpPct
  if (skill.selfAtkUpPct && attacker.alive) {
    const atkGain = Math.round(attacker.baseAtk * skill.selfAtkUpPct.pct / 100);
    attacker.buffs.push({ type:'atkUp', value:atkGain, turns:skill.selfAtkUpPct.turns });
    recalcStats();
    const aElId = getFighterElId(attacker);
    spawnFloatingNum(aElId, `+${atkGain}攻`, 'passive-num', 300, 0);
    renderStatusIcons(attacker);
    addLog(`${attacker.emoji}${attacker.name} 自身 <span class="log-passive">攻击+${atkGain}(${skill.selfAtkUpPct.pct}%)</span> ${skill.selfAtkUpPct.turns}回合`);
  }
  // Self buff: selfDefUpPct (used by 缩头乌龟 attack skill)
  if (skill.selfDefUpPct && attacker.alive) {
    const defGain = Math.round(attacker.baseDef * skill.selfDefUpPct.pct / 100);
    attacker.buffs.push({ type:'defUp', value:defGain, turns:skill.selfDefUpPct.turns });
    recalcStats();
    const aElId = getFighterElId(attacker);
    spawnFloatingNum(aElId, `+${defGain}护甲`, 'passive-num', 300, 0);
    renderStatusIcons(attacker);
    addLog(`${attacker.emoji}${attacker.name} 自身 <span class="log-passive">护甲+${defGain}(${skill.selfDefUpPct.pct}%)</span> ${skill.selfDefUpPct.turns}回合`);
  }
}

/* Apply debuffs: dot, atkDown, defDown */
function applySkillDebuffs(skill, target, attacker) {
  const debuffs = [];
  if (skill.dot)     debuffs.push({ type:'dot',     value:skill.dot.dmg,     turns:skill.dot.turns, sourceSide: attacker ? attacker.side : null });
  if (skill.atkDown) debuffs.push({ type:'atkDown', value:skill.atkDown.pct, turns:skill.atkDown.turns });
  if (skill.defDown) debuffs.push({ type:'defDown', value:skill.defDown.pct, turns:skill.defDown.turns });
  if (skill.mrDown)  debuffs.push({ type:'mrDown',  value:skill.mrDown.pct,  turns:skill.mrDown.turns });

  // Unified burn: 0.4*ATK + 8%maxHP, magic damage, 4 turns, no stack (refresh)
  if (skill.burn && target.alive && attacker && !((target.passive && target.passive.burnImmune) || target._burnImmune)) {
    const burnVal = Math.round(attacker.atk * 0.4);
    const burnHp = 8;
    const existing = target.buffs.find(b => b.type === 'phoenixBurnDot');
    const srcIdx = allFighters.indexOf(attacker);
    if (existing) { existing.turns = 4; existing.value = Math.max(existing.value, burnVal); existing.sourceIdx = srcIdx; }
    else target.buffs.push({ type:'phoenixBurnDot', value:burnVal, hpPct:burnHp, turns:4, sourceSide: attacker.side, sourceIdx:srcIdx, dmgType:'magic' });
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, '🔥灼烧', 'debuff-label', 200, -10);
    addLog(`${target.emoji}${target.name} 被施加 <span class="log-debuff">🔥灼烧4回合（魔法伤害）</span>`);
    renderStatusIcons(target);
  }

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
    const labels = { dot:'🔥灼烧', atkDown:'⬇️攻击', defDown:'⬇️护甲', mrDown:'⬇️魔抗' };
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
    spawnFloatingNum(getFighterElId(target), `+${skill.defUp.val}护甲`, 'passive-num', 300, 0);
    logParts.push(`<span class="log-passive">护甲+${skill.defUp.val} ${skill.defUp.turns}回合</span>`);
    recalcStats();
    renderStatusIcons(target);
  }
  // DefUp buff (ATK% based — e.g. pirate rum)
  if (skill.defUpAtkPct) {
    const defGain = Math.round(caster.atk * skill.defUpAtkPct.pct / 100);
    target.buffs.push({ type:'defUp', value:defGain, turns:skill.defUpAtkPct.turns });
    spawnFloatingNum(getFighterElId(target), `+${defGain}护甲`, 'passive-num', 300, 0);
    logParts.push(`<span class="log-passive">护甲+${defGain} ${skill.defUpAtkPct.turns}回合</span>`);
    recalcStats();
    updateFighterStats(target, getFighterElId(target));
    renderStatusIcons(target);
  }
  // DefUpPct buff (percentage-based)
  if (skill.defUpPct) {
    const val = Math.round(target.baseDef * skill.defUpPct.pct / 100);
    const existing = target.buffs.find(b => b.type === 'defUp');
    if (existing) { existing.value += val; existing.turns = Math.max(existing.turns, skill.defUpPct.turns); }
    else target.buffs.push({ type:'defUp', value:val, turns:skill.defUpPct.turns });
    spawnFloatingNum(getFighterElId(target), `+${val}护甲(${skill.defUpPct.pct}%)`, 'passive-num', 300, 0);
    logParts.push(`<span class="log-passive">护甲+${skill.defUpPct.pct}%(+${val}) ${skill.defUpPct.turns}回合</span>`);
    recalcStats();
    renderStatusIcons(target);
  }
  // MrUpPct buff (percentage-based)
  if (skill.mrUpPct) {
    const val = Math.round((target.baseMr || target.baseDef) * skill.mrUpPct.pct / 100);
    const existing = target.buffs.find(b => b.type === 'mrUp');
    if (existing) { existing.value += val; existing.turns = Math.max(existing.turns, skill.mrUpPct.turns); }
    else target.buffs.push({ type:'mrUp', value:val, turns:skill.mrUpPct.turns });
    spawnFloatingNum(getFighterElId(target), `+${val}魔抗`, 'passive-num', 400, 0);
    logParts.push(`<span class="log-passive">魔抗+${skill.mrUpPct.pct}%(+${val}) ${skill.mrUpPct.turns}回合</span>`);
    recalcStats();
    renderStatusIcons(target);
  }
  // SelfAtkUpPct (e.g. cyber turtle 增益)
  if (skill.selfAtkUpPct) {
    const atkGain = Math.round(caster.baseAtk * skill.selfAtkUpPct.pct / 100);
    caster.buffs.push({ type:'atkUp', value:atkGain, turns:skill.selfAtkUpPct.turns });
    recalcStats();
    spawnFloatingNum(getFighterElId(caster), `+${atkGain}攻`, 'passive-num', 300, 0);
    logParts.push(`<span class="log-passive">攻击+${atkGain}(${skill.selfAtkUpPct.pct}%) ${skill.selfAtkUpPct.turns}回合</span>`);
    renderStatusIcons(caster);
  }
  addLog(`${caster.emoji}${caster.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：${logParts.join(' ')}`);
  await sleep(1000);
}

async function doShield(caster, target, skill) {
  if (!target) target = caster;
  if (target._undeadLockTurns > 0) { await sleep(500); return; } // locked, no shield
  // Calculate shield amount: fixed + % of caster's maxHP + ATK scaling
  let amount = skill.shield || 0;
  if (skill.shieldFlat) amount += skill.shieldFlat;
  if (skill.shieldHpPct) amount += Math.round(caster.maxHp * skill.shieldHpPct / 100);
  if (skill.shieldAtkScale) amount += Math.round(caster.atk * skill.shieldAtkScale);
  amount = Math.round(amount * getShieldMult()); // 铁壁之日: ×2
  target.shield += amount;
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `+${amount}`, 'shield-num', 0, 0);
  // Heal HP% if specified
  let healStr = '';
  if (skill.healHpPct && caster.alive) {
    const heal = Math.round(caster.maxHp * skill.healHpPct / 100);
    const actual = applyHeal(caster, heal);
    if (actual > 0) {
      const fElId = getFighterElId(caster);
      spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 200, 0);
      updateHpBar(caster, fElId);
      healStr = ` <span class="log-heal">+${actual}HP</span>`;
    }
  }
  updateHpBar(target, tElId);
  addLog(`${caster.emoji}${caster.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-shield">+${amount}护盾</span>${healStr}`);
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
    spawnFloatingNum(tElId, `+${s}`, 'shield-num', 100, 0);
    updateHpBar(target, tElId);
  }
  // ShieldOnHit
  if (target.passive && target.passive.type === 'shieldOnHit' && !target.passiveUsedThisTurn) {
    target.shield += target.passive.amount;
    target.passiveUsedThisTurn = true;
    spawnFloatingNum(tElId, `+${target.passive.amount}`, 'passive-num', 150, 0);
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
    spawnFloatingNum(getFighterElId(attacker), `+${gained}`, 'bubble-num', 200, 0);
    updateHpBar(attacker, getFighterElId(attacker));
  }
  // Crystallize stacking (crystal turtle passive)
  if (attacker.passive && attacker.passive.type === 'crystalResonance' && target.alive) {
    target._crystallize = (target._crystallize || 0) + 1;
    const maxStacks = attacker.passive.crystallizeMax || 4;
    const tElCryst = getFighterElId(target);
    if (target._crystallize >= maxStacks) {
      // Detonate!
      target._crystallize = 0;
      const detonateDmg = Math.round(target.maxHp * attacker.passive.crystallizeHpPct / 100);
      const effMr = calcEffDef(attacker, target, 'magic');
      const finalDmg = Math.max(1, Math.round(detonateDmg * calcDmgMult(effMr)));
      applyRawDmg(attacker, target, finalDmg, false, true, 'magic');
      spawnFloatingNum(tElCryst, `-${finalDmg}💎`, 'crit-magic', 350, -15, {atkSide:attacker.side, amount:finalDmg});
      updateHpBar(target, tElCryst);
      // Apply MR shred
      const mrDownExist = target.buffs.find(b => b.type === 'mrDown');
      if (mrDownExist) { mrDownExist.value = Math.max(mrDownExist.value, attacker.passive.crystallizeMrDown); mrDownExist.turns = Math.max(mrDownExist.turns, attacker.passive.crystallizeMrTurns); }
      else target.buffs.push({type:'mrDown', value:attacker.passive.crystallizeMrDown, turns:attacker.passive.crystallizeMrTurns});
      spawnFloatingNum(tElCryst, '<img src="assets/passive/crystal-resonance-icon.png" style="width:16px;height:16px;vertical-align:middle">引爆!', 'crit-label', 400, -30);
      recalcStats();
      addLog(`${target.emoji}${target.name} 结晶引爆！<span class="log-magic">${finalDmg}魔法伤害</span> + ⬇️魔抗`);
    } else {
      spawnFloatingNum(tElCryst, `<img src="assets/passive/crystal-resonance-icon.png" style="width:12px;height:12px;vertical-align:middle">${target._crystallize}/${maxStacks}`, 'passive-num', 300, 10);
    }
    renderStatusIcons(target);
  }
  // Trap
  const trapB = target.buffs.find(b => b.type === 'trap');
  if (trapB && attacker.alive) {
    const tDmg = Math.max(1, Math.round(trapB.value * calcDmgMult(attacker.def)));
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
    const reflectPct = target.passive.reflectBase + target.passive.reflectPerDef * target.def + (target.passive.reflectPerMr || 0) * (target.mr || target.def);
    const reflectDmg = Math.round(dmg * reflectPct / 100);
    if (reflectDmg > 0) {
      applyRawDmg(null, attacker, reflectDmg);
      spawnFloatingNum(getFighterElId(attacker), `-${reflectDmg}`, 'counter-dmg', 250, 0);
      updateHpBar(attacker, getFighterElId(attacker));
      if (attacker.hp <= 0) attacker.alive = false;
    }
  }
  // Buff-based reflect (e.g. hidingReflect skill)
  const reflectBuff = target.buffs ? target.buffs.find(b => b.type === 'reflect') : null;
  if (reflectBuff && attacker && attacker.alive && dmg > 0) {
    const reflDmg = Math.round(dmg * reflectBuff.value / 100);
    if (reflDmg > 0) {
      applyRawDmg(null, attacker, reflDmg);
      spawnFloatingNum(getFighterElId(attacker), `-${reflDmg}`, 'counter-dmg', 300, 0);
      updateHpBar(attacker, getFighterElId(attacker));
      if (attacker.hp <= 0) attacker.alive = false;
    }
  }
  // Dodge counter (e.g. starWarp) — handled in dodge check above, not here
  // Lava shield counter
  if (target._lavaShieldTurns > 0 && target._lavaShieldCounter > 0 && attacker.alive) {
    const cDmg = Math.round(target.atk * target._lavaShieldCounter);
    attacker.hp = Math.max(0, attacker.hp - cDmg);
    spawnFloatingNum(getFighterElId(attacker), `-${cDmg}<img src="assets/battle/lava-shield-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'counter-dmg', 300, 0);
    updateHpBar(attacker, getFighterElId(attacker));
    if (attacker.hp <= 0) attacker.alive = false;
  }
  // Lightning shock stacks
  if (attacker.passive && attacker.passive.type === 'lightningStorm' && target.alive) {
    target._shockStacks = (target._shockStacks || 0) + 1;
    spawnFloatingNum(tElId, `<img src="assets/passive/lightning-storm-icon.png" style="width:14px;height:14px;vertical-align:middle">${target._shockStacks}/${attacker.passive.stackMax}`, 'passive-num', 350, 10);
    renderStatusIcons(target);
    if (target._shockStacks >= attacker.passive.stackMax) {
      const sDmg = Math.round(attacker.atk * attacker.passive.shockScale);
      applyRawDmg(attacker, target, sDmg, false, false, 'true');
      target._shockStacks = 0;
      spawnFloatingNum(tElId, `<img src="assets/passive/lightning-storm-icon.png" style="width:14px;height:14px;vertical-align:middle">${sDmg}`, 'pierce-dmg', 300, 0);
    }
  }
  // Lifesteal (equipment/passive-based + buff-based)
  let totalLifestealPct = attacker._lifestealPct || 0;
  const lifestealBuff = attacker.buffs ? attacker.buffs.find(b => b.type === 'lifesteal') : null;
  if (lifestealBuff) totalLifestealPct += lifestealBuff.value;
  if (totalLifestealPct > 0 && attacker.alive && dmg > 0) {
    const healAmt = Math.round(dmg * totalLifestealPct / 100);
    const actual = applyHeal(attacker, healAmt);
    if (actual > 0) {
      spawnFloatingNum(getFighterElId(attacker), `+${actual}吸血`, 'heal-num', 300, 0);
      updateHpBar(attacker, getFighterElId(attacker));
    }
  }
  // AuraAwaken: energy store — target stores received damage as energy
  if (target.passive && target.passive.type === 'auraAwaken' && target.passive.energyStore && target.alive) {
    target._storedEnergy = (target._storedEnergy || 0) + dmg;
    spawnFloatingNum(tElId, `+${dmg}<img src="assets/passive/lightning-storm-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'passive-num', 350, 10);
    updateHpBar(target, tElId); // refresh energy bar
  }
  // AuraAwaken: lifesteal — attacker heals from damage dealt
  if (attacker._auraLifesteal > 0 && attacker.alive && dmg > 0) {
    const auraHeal = Math.round(dmg * attacker._auraLifesteal);
    const before = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + auraHeal);
    const actual = Math.round(attacker.hp - before);
    if (actual > 0) {
      spawnFloatingNum(getFighterElId(attacker), `+${actual}偷取`, 'heal-num', 350, 0);
      updateHpBar(attacker, getFighterElId(attacker));
    }
  }
  // AuraAwaken: reflect — target reflects damage back to attacker
  if (target._auraReflect > 0 && target.alive && attacker.alive && dmg > 0) {
    const reflDmg = Math.round(dmg * target._auraReflect);
    if (reflDmg > 0) {
      attacker.hp = Math.max(0, attacker.hp - reflDmg);
      spawnFloatingNum(getFighterElId(attacker), `-${reflDmg}反伤`, 'counter-dmg', 400, 0);
      updateHpBar(attacker, getFighterElId(attacker));
      if (attacker.hp <= 0) attacker.alive = false;
    }
  }
  // Equipment: burn on hit
  if (attacker._equipBurn && target.alive && !((target.passive && target.passive.burnImmune) || target._burnImmune)) {
    const burnVal = Math.round(attacker.atk * 0.4);
    const existing = target.buffs.find(b => b.type === 'phoenixBurnDot');
    if (existing) { existing.turns = Math.max(existing.turns, 4); }
    else target.buffs.push({ type:'phoenixBurnDot', value:burnVal, hpPct:8, turns:4, sourceSide:attacker.side, sourceIdx:allFighters.indexOf(attacker), dmgType:'magic' });
  }
  // Equipment: stun chance
  if (attacker._equipStun && target.alive && Math.random() < attacker._equipStun / 100) {
    if (!target.buffs.find(b => b.type === 'stun')) {
      target.buffs.push({ type:'stun', turns:1 });
      spawnFloatingNum(tElId, '❄️眩晕!', 'debuff-label', 400, -10);
    }
  }
  // Equipment: multi-hit chance
  if (attacker._equipMultiHit && target.alive && Math.random() < attacker._equipMultiHit / 100) {
    const extraDmg = Math.round(attacker.atk * 0.5);
    const eDef = calcEffDef(attacker, target);
    const finalDmg = Math.max(1, Math.round(extraDmg * calcDmgMult(eDef)));
    applyRawDmg(attacker, target, finalDmg, false, false, 'physical');
    spawnFloatingNum(tElId, `-${finalDmg}🐙`, 'direct-dmg', 200, 0, {atkSide:attacker.side, amount:finalDmg});
    updateHpBar(target, tElId);
  }
  // Equipment: reflect
  if (target._equipReflect && target.alive && attacker.alive && dmg > 0) {
    const reflDmg = Math.round(dmg * target._equipReflect / 100);
    if (reflDmg > 0) {
      attacker.hp = Math.max(0, attacker.hp - reflDmg);
      spawnFloatingNum(getFighterElId(attacker), `-${reflDmg}🌵`, 'counter-dmg', 300, 0);
      updateHpBar(attacker, getFighterElId(attacker));
      if (attacker.hp <= 0) attacker.alive = false;
    }
  }
  // Battle rule: 烈焰之日 — all hits apply burn
  if (typeof _battleRule !== 'undefined' && _battleRule && _battleRule.id === 'fire' && target.alive && attacker) {
    if (!((target.passive && target.passive.burnImmune) || target._burnImmune)) {
      const burnVal = Math.round(attacker.atk * 0.4);
      const existing = target.buffs.find(b => b.type === 'phoenixBurnDot');
      if (existing) { existing.turns = Math.max(existing.turns, 4); }
      else target.buffs.push({ type:'phoenixBurnDot', value:burnVal, hpPct:8, turns:4, sourceSide:attacker.side, sourceIdx:allFighters.indexOf(attacker), dmgType:'magic' });
    }
  }
}

// ── GAMBLER MULTI-HIT (shared helper) ─────────────────────
async function tryGamblerMultiHit(attacker, target, tElId) {
  if (!target.alive || !attacker.alive || !attacker.passive || attacker.passive.type !== 'gamblerMultiHit') return;
  let multiChance = attacker.passive.chance + (attacker._multiBonus || 0);
  while (target.alive && attacker.alive && Math.random() * 100 < multiChance) {
    const extraDmg = Math.round(attacker.atk * attacker.passive.dmgScale);
    const eDef = calcEffDef(attacker, target);
    const eFinal = Math.max(1, Math.round(extraDmg * calcDmgMult(eDef)));
    const {isCrit, critMult} = calcCrit(attacker);
    const critFinal = Math.max(1, Math.round(eFinal * critMult));
    applyRawDmg(attacker, target, critFinal, false, false, 'physical');
    if (!tElId) tElId = getFighterElId(target);
    const hitIcon = '<img src="assets/battle/gambler-hit-icon.png" style="width:16px;height:16px;vertical-align:middle">';
    const critIcon = isCrit ? '<img src="assets/stats/crit-icon.png" style="width:14px;height:14px;vertical-align:middle">' : '';
    spawnFloatingNum(tElId, `${hitIcon}${critIcon}-${critFinal}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, (_origMathRandom()-0.5)*30);
    updateHpBar(target, tElId);

    // All on-hit effects
    await triggerOnHitEffects(attacker, target, critFinal);

    const tEl = document.getElementById(tElId);
    if (tEl) { tEl.classList.add('hit-shake'); await sleep(400); tEl.classList.remove('hit-shake'); }
    else await sleep(400);
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
    if (!target.alive) continue;
    const scale = skill.minScale + Math.random() * (skill.maxScale - skill.minScale);
    const baseDmg = Math.round(attacker.atk * scale);
    const eDef = calcEffDef(attacker, target);
    const dmg = Math.max(1, Math.round(baseDmg * calcDmgMult(eDef)));
    applyRawDmg(attacker, target, dmg);
    totalDmg += dmg;
    spawnFloatingNum(tElId, `-${dmg}`, 'direct-dmg', 0, (i % 3) * 20);
    await triggerOnHitEffects(attacker, target, dmg);
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(700);
    if (tEl) tEl.classList.remove('hit-shake');
    await sleep(200);
    await tryGamblerMultiHit(attacker, target, tElId);
  }
  addLog(`${attacker.emoji}${attacker.name} <b>卡牌射击</b> → ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}物理</span>`);
}

// ── FLOATING NUMBERS — persistent 2.5s ────────────────────
// opts: { atkSide:'left'|'right', amount:number } — optional
// Track active floating numbers per element to auto-stack
const _floatStacks = {};
function spawnFloatingNum(elId, text, cls, delayMs, yOffset, opts) {
  // Auto-stack: add offset based on how many floats are active on this element
  if (!_floatStacks[elId]) _floatStacks[elId] = 0;
  const autoOffset = _floatStacks[elId] * 22;
  _floatStacks[elId]++;
  setTimeout(() => { if (_floatStacks[elId] > 0) _floatStacks[elId]--; }, (delayMs || 0) + 800);

  setTimeout(() => {
    const parent = document.getElementById(elId);
    if (!parent) return;
    const num = document.createElement('div');
    num.className = 'floating-num ' + cls;
    if (typeof text === 'string' && text.includes('<')) num.innerHTML = text;
    else num.textContent = text;

    // Size scales with damage amount (14-32px, crit +20%)
    let amount = opts && opts.amount || 0;
    // Auto-extract amount from text if not provided (e.g. "-42" → 42)
    if (!amount && typeof text === 'string') { const m = text.match(/\d+/); if (m) amount = parseInt(m[0]); }
    {
      let sz = amount < 20 ? 24 : amount < 60 ? 24 + (amount-20)/40*5 : amount < 150 ? 29 + (amount-60)/90*7 : 36;
      sz = Math.min(40, sz);
      const isCrit = cls.startsWith('crit');
      if (isCrit) sz = Math.min(46, sz * 1.2);
      num.style.fontSize = sz + 'px';
    }

    parent.appendChild(num);

    // Determine animation type
    const isDmg = (cls.includes('dmg') || cls.includes('pierce') || cls.includes('crit-magic') || cls.includes('crit-true')) && cls !== 'shield-dmg';
    // Use original random for visual offsets (don't consume seeded RNG)
    const _vr = _origMathRandom;
    const ox = (_vr() - 0.5) * 8;
    const y0 = -(15 + (yOffset || 0) + autoOffset);

    if (isDmg) {
      // ── DAMAGE: jump away from attacker ──
      let dir = 1;
      if (opts && opts.atkSide) {
        dir = opts.atkSide === 'left' ? 1 : -1;
      } else if (typeof currentActingFighter !== 'undefined' && currentActingFighter) {
        dir = currentActingFighter.side === 'left' ? 1 : -1;
      } else {
        try { const r = parent.getBoundingClientRect(); dir = r.left > window.innerWidth / 2 ? 1 : -1; } catch(e) {}
      }
      const jumpX = dir * (15 + _vr() * 10);
      const jumpY = -(12 + _vr() * 8); // upward
      const gravity = 150;
      const totalDur = 1400;
      const start = performance.now();

      // Base size from amount for impact pop
      const popSize = amount < 20 ? 1.6 : amount < 60 ? 1.8 : amount < 150 ? 2.2 : 2.5;

      function tickDmg(now) {
        const elapsed = now - start;
        if (elapsed >= totalDur) { num.remove(); return; }
        const t = elapsed / 1000;

        // Impact pop: big → shrink to 0.5 → hold at 0.5
        let scale;
        if (elapsed < 60) scale = (elapsed / 60) * popSize;           // 0 → big
        else if (elapsed < 180) scale = popSize - (popSize - 0.7) * ((elapsed - 60) / 120);  // big → 0.7
        else scale = 0.7;

        // Parabolic arc
        const x = ox + jumpX * t * 2;
        const y = y0 + jumpY * t * 2 + 0.5 * gravity * t * t;

        // Fade in second half
        const opacity = elapsed < 600 ? 1 : 1 - (elapsed - 600) / (totalDur - 600);

        num.style.transform = `translate(calc(-50% + ${x}px), ${y}px) scale(${scale})`;
        num.style.opacity = String(Math.max(0, opacity));
        requestAnimationFrame(tickDmg);
      }
      requestAnimationFrame(tickDmg);
    } else {
      // ── HEAL/SHIELD/STATUS: float up gently, fade ──
      const totalDur = 1500;
      const start = performance.now();

      function tickHeal(now) {
        const elapsed = now - start;
        if (elapsed >= totalDur) { num.remove(); return; }

        let scale, opacity, y;
        if (elapsed < 100) {
          scale = (elapsed / 100) * 1.2;
          y = y0;
          opacity = Math.min(1, elapsed / 50);
        } else if (elapsed < 350) {
          scale = 1.2 - 0.2 * ((elapsed - 100) / 250);
          y = y0;
          opacity = 1;
        } else {
          const p = (elapsed - 350) / (totalDur - 350);
          const ease = p * (2 - p);
          scale = 1.0;
          y = y0 - 30 * ease;
          opacity = elapsed > 1000 ? 1 - (elapsed - 1000) / (totalDur - 1000) : 1;
        }

        num.style.transform = `translate(calc(-50% + ${ox}px), ${y}px) scale(${scale})`;
        num.style.opacity = String(Math.max(0, opacity));
        requestAnimationFrame(tickHeal);
      }
      requestAnimationFrame(tickHeal);
    }
    // SFX based on type
    const sfxMap = {
      'direct-dmg': sfxHit, 'magic-dmg': sfxHit, 'true-dmg': sfxPierce,
      'crit-dmg': sfxCrit, 'crit-magic': sfxCrit, 'crit-true': sfxCrit, 'crit-pierce': sfxCrit, 'crit-label': sfxCrit,
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
  const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  const allies  = (f.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
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
  // Star turtle AI: only use meteor when energy is full
  if (f.passive && f.passive.type === 'starEnergy') {
    const meteorS = ready.find(s => s.type === 'starMeteor');
    if (meteorS) {
      const maxE = Math.round(f.maxHp * f.passive.maxChargePct / 100);
      if ((f._starEnergy || 0) < maxE) {
        const other = ready.filter(s => s.type !== 'starMeteor');
        if (other.length) skill = other.sort((a,b) => (b.cd||0) - (a.cd||0))[0];
      } else {
        skill = meteorS;
      }
    }
  }
  // Fortune turtle AI: dice×3 → allIn R4 → dice → alternate
  if (!skill) skill = ready[0];
  if (f.passive && f.passive.type === 'fortuneGold') {
    const allInSkill = ready.find(s => s.type === 'fortuneAllIn');
    const diceSkill = ready.find(s => s.type === 'fortuneDice');
    const atkSkill = ready.filter(s => s.type === 'physical')[0];
    if (allInSkill) {
      if (turnNum <= 3) { skill = diceSkill || atkSkill || ready[0]; }
      else if (turnNum === 4) { skill = allInSkill; }
      else { skill = diceSkill || atkSkill || ready[0]; }
    } else {
      if (!f._fortunePostAllIn) f._fortunePostAllIn = 0;
      f._fortunePostAllIn++;
      if (f._fortunePostAllIn === 1) { skill = diceSkill || atkSkill || ready[0]; }
      else { skill = (f._fortunePostAllIn % 2 === 0) ? (atkSkill || diceSkill || ready[0]) : (diceSkill || atkSkill || ready[0]); }
    }
  }

  // Bubble turtle AI: only use bubbleBurst when bubbleStore > 0
  if (skill && skill.type === 'bubbleBurst' && (f.bubbleStore || 0) <= 0) {
    const other = ready.filter(s => s.type !== 'bubbleBurst');
    if (other.length) skill = other[0];
  }
  // Fortune turtle AI: skip fortuneBuyEquip when coins < 20
  if (skill && skill.type === 'fortuneBuyEquip' && (f._goldCoins||0) < 20) {
    const other = ready.filter(s => s.type !== 'fortuneBuyEquip');
    if (other.length) skill = other[0];
  }
  // Star turtle AI: only use starShieldBreak when enemies have shields
  if (skill && skill.type === 'starShieldBreak') {
    const hasShield = enemies.some(e => e.shield > 0 || e.bubbleShieldVal > 0);
    if (!hasShield) {
      const other = ready.filter(s => s.type !== 'starShieldBreak');
      if (other.length) skill = other[0];
    }
  }

  let target;
  if (skill.type==='heal' || skill.type==='bambooHeal' || skill.type==='bubbleHeal' || skill.type==='crystalResHeal') target = allies.sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0];
  else if (skill.selfCast || skill.type==='shield' || skill.type==='hidingDefend' || skill.type==='hidingCommand' || skill.type==='ghostPhase' || skill.type==='diamondFortify' || skill.type==='diceFate' || skill.type==='chestOpen' || skill.type==='chestCount' || skill.type==='iceShield' || skill.type==='headlessRegen' || skill.type==='stoneTaunt' || skill.type==='ghostShadow' || skill.type==='starWarp' || skill.type==='hidingReflect' || skill.type==='starShield' || skill.type==='shellEnergyShield' || skill.type==='lightningShield') target = f; // self-cast
  else if (skill.type==='angelBless' || skill.type==='bubbleShield' || skill.type==='ninjaTrap' || skill.type==='bubbleBind' || skill.type==='phoenixPurify' || skill.type==='rainbowGuard') {
    // Ally-target skills: pick weakest ally (bubbleBind targets enemy but is listed in isAlly wrongly — fix here)
    if (skill.type==='bubbleBind') target = enemies.sort((a,b)=>a.hp-b.hp)[0]; // bubbleBind marks enemy
    else if (skill.type==='phoenixPurify') {
      // Prefer ally with most debuffs
      const debuffTypes = ['atkDown','defDown','mrDown','healReduce','poison','bleed','burn','cursed','chilled','spdDown'];
      target = allies.sort((a,b) => b.buffs.filter(bb=>debuffTypes.includes(bb.type)).length - a.buffs.filter(bb=>debuffTypes.includes(bb.type)).length)[0];
      if (!target.buffs.some(b=>debuffTypes.includes(b.type))) target = allies.sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0]; // no debuffs, heal lowest
    }
    else target = allies.sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0];
  }
  else if (skill.aoe || skill.aoeAlly) { target = f; /* AOE skills don't need specific target */ }
  else {
    // Smart targeting: front row priority, prefer low HP, avoid undead lock
    // Taunt: if any enemy has taunt, forced to target them
    const taunters = enemies.filter(e => e.buffs.some(b => b.type === 'taunt'));
    if (taunters.length > 0 && !skill.ignoreRow && !skill.aoe) {
      target = taunters[0];
    } else {
      // Filter to front row if any alive front row exists
      let filteredEnemies = enemies;
      // Stealth: filter out stealthed enemies for single-target
      const nonStealth = filteredEnemies.filter(e => !e.buffs.some(b => b.type === 'stealth'));
      if (nonStealth.length > 0) filteredEnemies = nonStealth;
      let targetPool;
      if (skill.ignoreRow) {
        // ignoreRow skills can target anyone; prefer back row if knockToFront
        if (skill.knockToFront) {
          const backEnemies = filteredEnemies.filter(e => e._position === 'back');
          targetPool = backEnemies.length > 0 ? backEnemies : filteredEnemies;
        } else {
          targetPool = filteredEnemies;
        }
      } else {
        const frontEnemies = filteredEnemies.filter(e => e._position === 'front');
        targetPool = frontEnemies.length > 0 ? frontEnemies : filteredEnemies;
      }
      if (targetPool.length === 1) {
        target = targetPool[0];
      } else if (targetPool.length > 1) {
        const sorted = targetPool.slice().sort((a,b) => (a.hp/a.maxHp) - (b.hp/b.maxHp));
        const lowest = sorted[0];
        const lowestRatio = lowest.hp / lowest.maxHp;
        // Undead lock: avoid locked target
        if (lowest._undeadLockTurns > 0) {
          const nonLocked = sorted.find(e => !e._undeadLockTurns);
          target = nonLocked || lowest;
        }
        // HP < 20%: 90% chance to focus
        else if (lowestRatio < 0.2 && Math.random() < 0.9) { target = lowest; }
        // General: 70% chance to target lowest HP, 30% random
        else if (Math.random() < 0.7) { target = lowest; }
        else { target = targetPool[Math.floor(Math.random() * targetPool.length)]; }
      } else {
        target = enemies[0]; // fallback
      }
    }
  }

  executeAction({ attackerId:allFighters.indexOf(f), skillIdx:f.skills.indexOf(skill), targetId:allFighters.indexOf(target) });
}

// ── DEATH & WIN ───────────────────────────────────────────

function checkDeaths(attacker) {
  allFighters.forEach(f => {
    if (f.hp <= 0 && !f._deathProcessed) {
      // Phoenix rebirth: revive once
      if (f.passive && f.passive.type === 'phoenixRebirth' && !f._rebirthUsed) {
        f._rebirthUsed = true;
        const revivePct = f._phoenixEnhancedRebirth ? 100 : f.passive.revivePct;
        f.hp = Math.round(f.maxHp * revivePct / 100);
        // Enhanced rebirth: +20% ATK
        if (f._phoenixEnhancedRebirth) {
          const atkBoost = Math.round(f.baseAtk * 0.2);
          f.baseAtk += atkBoost; f.atk += atkBoost;
          spawnFloatingNum(getFighterElId(f), `+${atkBoost}ATK`, 'passive-num', 400, 0);
        }
        f.alive = true;
        f._deathProcessed = false;
        const elId = getFighterElId(f);
        const card = document.getElementById(elId);
        if (card) { card._pendingDead = false; card.classList.remove('dead','death-anim'); }
        spawnFloatingNum(elId, '涅槃重生!', 'crit-label', 0, -25);
        spawnFloatingNum(elId, `+${f.hp}HP`, 'heal-num', 200, 0);
        updateHpBar(f, elId);
        addLog(`${f.emoji}${f.name} <span class="log-passive">涅槃重生！以${f.passive.revivePct}%HP复活！</span>`);
        // Apply burn + healReduce to all enemies on rebirth
        const rebirthEnemies = allFighters.filter(e => e.alive && e.side !== f.side);
        for (const e of rebirthEnemies) {
          applySkillDebuffs({ burn: true }, e, f);
          const existing = e.buffs.find(b => b.type === 'healReduce');
          if (existing) { existing.turns = 3; }
          else { e.buffs.push({ type: 'healReduce', value: 50, turns: 3 }); }
          const eElId = getFighterElId(e);
          spawnFloatingNum(eElId, '🔥灼烧+☠️削减', 'debuff-label', 300, -10);
          renderStatusIcons(e);
        }
        addLog(`${f.emoji}${f.name} 涅槃之火灼烧全体敌人！`);
        try { sfxRebirth(); } catch(e) {}
        return; // skip death processing
      }

      // Angel passive skill revive (圣光)
      if (f._angelRevive && !f._angelReviveUsed) {
        f._angelReviveUsed = true;
        f.hp = Math.round(f.maxHp * 0.25);
        f.alive = true;
        f._deathProcessed = false;
        const elId = getFighterElId(f);
        const card = document.getElementById(elId);
        if (card) { card._pendingDead = false; card.classList.remove('dead','death-anim'); }
        spawnFloatingNum(elId, '😇圣光重生!', 'crit-label', 0, -25);
        updateHpBar(f, elId);
        addLog(`${f.emoji}${f.name} <span class="log-passive">😇圣光之力！以25%HP重生！</span>`);
        try { sfxRebirth(); } catch(e) {}
        return;
      }

      // Chest phoenix equip: mark for pending revive (animated in executeAction)
      if (hasChestEquip(f, 'phoenix') && !f._chestReviveUsed) {
        f._chestReviveUsed = true;
        f._pendingChestRevive = true;
        f.alive = true; // keep alive so checkBattleEnd doesn't trigger
        f.hp = 1;
        return;
      }

      // Equipment: 复活海螺 — revive with 20% HP once
      if (f._equipRevive) {
        f._equipRevive = false;
        f.hp = Math.round(f.maxHp * 0.2);
        f.alive = true;
        f._deathProcessed = false;
        const elId = getFighterElId(f);
        const card = document.getElementById(elId);
        if (card) { card._pendingDead = false; card.classList.remove('dead','death-anim'); }
        spawnFloatingNum(elId, '🐌复活!', 'crit-label', 0, -25);
        updateHpBar(f, elId);
        addLog(`${f.emoji}${f.name} <span class="log-passive">🐌复活海螺！以20%HP复活！</span>`);
        return;
      }

      // Battle rule: 亡灵之日 — revive with 15% HP once
      if (f._ruleRevive) {
        f._ruleRevive = false;
        f.hp = Math.round(f.maxHp * 0.15);
        f.alive = true;
        f._deathProcessed = false;
        const elId = getFighterElId(f);
        const card = document.getElementById(elId);
        if (card) { card._pendingDead = false; card.classList.remove('dead','death-anim'); }
        spawnFloatingNum(elId, '<img src="assets/passive/undead-rage-icon.png" style="width:16px;height:16px;vertical-align:middle">亡灵复活!', 'crit-label', 0, -25);
        updateHpBar(f, elId);
        addLog(`${f.emoji}${f.name} <span class="log-passive"><img src="assets/passive/undead-rage-icon.png" style="width:16px;height:16px;vertical-align:middle">亡灵之日！以15%HP复活！</span>`);
        return;
      }

      // CyberDrone: transform drones into mech
      if (f.passive && f.passive.type === 'cyberDrone' && f._drones && f._drones.length > 0 && !f._isMech) {
        // Mark for pending mech transform (handled async in executeAction after checkDeaths)
        f._pendingMech = f._drones.length;
        f._drones = [];
        f._isMech = true;
        f.alive = true; // keep alive so checkBattleEnd doesn't trigger
        f.hp = 1; // temporary 1HP to stay alive
        return; // skip normal death
      }

      f.alive = false; f.hp = 0; f._deathProcessed = true;
      const elId = getFighterElId(f);
      const deadEl = document.getElementById(elId);
      if (deadEl) {
        deadEl.classList.add('death-anim');
        deadEl._pendingDead = true;
        deadEl.addEventListener('animationend', () => {
          if (deadEl._pendingDead) deadEl.classList.add('dead');
        }, { once:true });
      }
      // Screen flash
      const flash = document.createElement('div');
      flash.className = 'death-screen-flash';
      document.body.appendChild(flash);
      flash.addEventListener('animationend', () => flash.remove(), { once:true });
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
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">死亡爆炸！</span>对 ${attacker.emoji}${attacker.name} 造成 <span class="log-direct">${dmg}物理</span>`);
        if (attacker.hp <= 0) { attacker.alive = false; }
      }

      // Passive: deathHook / pirateBarrage deathHook — deal % maxHP as PIERCE damage to killer
      const hookPct = (f.passive && f.passive.type === 'deathHook') ? f.passive.pct
                    : (f.passive && f.passive.type === 'pirateBarrage') ? f.passive.deathHookPct : 0;
      if (hookPct > 0 && attacker && attacker.alive) {
        const dmg = Math.round(f.maxHp * hookPct / 100);
        attacker.hp = Math.max(0, attacker.hp - dmg);
        const aElId = getFighterElId(attacker);
        spawnFloatingNum(aElId, `-${dmg}`, 'pierce-dmg', 200, 0);
        updateHpBar(attacker, aElId);
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">钩锁！</span>对 ${attacker.emoji}${attacker.name} 造成 <span class="log-pierce">${dmg}真实伤害</span>`);
        if (attacker.hp <= 0) { attacker.alive = false; }
      }

      // Passive: ghostCurse — curse all enemies on death with pierce DoT
      if (f.passive && f.passive.type === 'ghostCurse') {
        const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
        for (const e of enemies) {
          const dotDmg = Math.round(e.maxHp * f.passive.hpPct / 100);
          e.buffs.push({ type:'dot', value:dotDmg, turns:f.passive.turns, sourceSide: f.side });
          const eElId = getFighterElId(e);
          spawnFloatingNum(eElId, `<img src="assets/status/curse-debuff-icon.png" style="width:16px;height:16px;vertical-align:middle">诅咒!`, 'crit-label', 0, -20);
          renderStatusIcons(e);
        }
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">怨灵诅咒！全体敌人每回合受10%最大HP持续伤害 ${f.passive.turns}回合</span>`);
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

      // Passive: hunterKill — any allied hunter steals stats when enemy dies
      const hunters = allFighters.filter(h => h.alive && h.side !== f.side && h.passive && h.passive.type === 'hunterKill');
      for (const hunter of hunters) {
        const sAtk = Math.round(f.baseAtk * hunter.passive.stealPct / 100);
        const sDef = Math.round(f.baseDef * hunter.passive.stealPct / 100);
        const sMr  = Math.round((f.baseMr || f.baseDef) * hunter.passive.stealPct / 100);
        const sHp  = Math.round(f.maxHp   * hunter.passive.stealPct / 100);
        hunter.baseAtk += sAtk; hunter.baseDef += sDef; hunter.baseMr = (hunter.baseMr || hunter.baseDef) + sMr; hunter.maxHp += sHp; hunter.hp += sHp;
        hunter._hunterKills = (hunter._hunterKills || 0) + 1;
        hunter._hunterStolenAtk = (hunter._hunterStolenAtk || 0) + sAtk;
        hunter._hunterStolenDef = (hunter._hunterStolenDef || 0) + sDef;
        hunter._hunterStolenMr = (hunter._hunterStolenMr || 0) + sMr;
        hunter._hunterStolenHp = (hunter._hunterStolenHp || 0) + sHp;
        if (hunter.passive.lifesteal) hunter._lifestealPct = (hunter._lifestealPct || 0) + hunter.passive.lifesteal;
        const hElId = getFighterElId(hunter);
        spawnFloatingNum(hElId, `+${sAtk}攻+${sDef}甲+${sMr}抗+${sHp}HP`, 'passive-num', 300, 0);
        updateHpBar(hunter, hElId);
        recalcStats();
        updateFighterStats(hunter, hElId);
        addLog(`${hunter.emoji}${hunter.name} 被动：<span class="log-passive">🏹猎杀吸收 攻+${sAtk} 甲+${sDef} 抗+${sMr} HP+${sHp}</span>`);
      }

      // Fortune gold: all alive fortune turtles gain 8 coins on any death
      allFighters.forEach(fg => {
        if (fg.alive && fg.passive && fg.passive.type === 'fortuneGold') {
          fg._goldCoins += 9;
          const fgElId = getFighterElId(fg);
          spawnFloatingNum(fgElId, `+9<img src="assets/battle/gold-coin-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'passive-num', 500, 0);
          renderStatusIcons(fg);
          addLog(`${fg.emoji}${fg.name} 被动：<span class="log-passive">阵亡金币+9（共${fg._goldCoins}）</span>`);
        }
      });
    }
  });
  // Owner death → summon death
  allFighters.forEach(f => {
    if (!f.alive && f._summon && f._summon.alive) {
      processSummonDeath(f._summon, attacker, '主人阵亡，随从一同倒下！');
    }
  });
  // Check summon deaths from damage (summons are not in allFighters)
  allFighters.forEach(f => {
    if (f._summon && f._summon.alive && f._summon.hp <= 0) {
      processSummonDeath(f._summon, attacker);
    }
  });
}

function processSummonDeath(summon, attacker, extraMsg) {
  summon.alive = false;
  summon.hp = 0;
  const sElId = getFighterElId(summon);
  const sCard = document.getElementById(sElId);
  if (sCard) { sCard._pendingDead = true; sCard.classList.add('death-anim'); sCard.addEventListener('animationend', () => { if (sCard._pendingDead) sCard.classList.add('dead'); }, { once:true }); }
  updateSummonHpBar(summon);
  addLog(`${summon.emoji}${summon.name}(随从) ${extraMsg || '被击败！'}`,'death');

  // Trigger summon's death passives
  if (summon.passive) {
    // Death explode
    if (summon.passive.type === 'deathExplode' && attacker && attacker.alive) {
      const dmg = Math.round(summon.maxHp * summon.passive.pct / 100);
      attacker.hp = Math.max(0, attacker.hp - dmg);
      const aElId = getFighterElId(attacker);
      spawnFloatingNum(aElId, `-${dmg}`, 'death-explode', 200, 0);
      updateHpBar(attacker, aElId);
      addLog(`${summon.emoji}${summon.name}(随从) 被动：<span class="log-passive">死亡爆炸！${dmg}伤害</span>`);
      if (attacker.hp <= 0) attacker.alive = false;
    }
    // Death hook / pirate
    const hookPct = (summon.passive.type === 'deathHook') ? summon.passive.pct
                  : (summon.passive.type === 'pirateBarrage') ? summon.passive.deathHookPct : 0;
    if (hookPct > 0 && attacker && attacker.alive) {
      const dmg = Math.round(summon.maxHp * hookPct / 100);
      attacker.hp = Math.max(0, attacker.hp - dmg);
      const aElId = getFighterElId(attacker);
      spawnFloatingNum(aElId, `-${dmg}`, 'pierce-dmg', 200, 0);
      updateHpBar(attacker, aElId);
      addLog(`${summon.emoji}${summon.name}(随从) 被动：<span class="log-passive">钩锁！${dmg}真实伤害</span>`);
      if (attacker.hp <= 0) attacker.alive = false;
    }
    // Ghost curse
    if (summon.passive.type === 'ghostCurse') {
      const enemies = (summon.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      for (const e of enemies) {
        const dotDmg = Math.round(e.maxHp * summon.passive.hpPct / 100);
        e.buffs.push({ type:'dot', value:dotDmg, turns:summon.passive.turns, sourceSide: summon.side });
        const eElId = getFighterElId(e);
        spawnFloatingNum(eElId, `<img src="assets/status/curse-debuff-icon.png" style="width:16px;height:16px;vertical-align:middle">诅咒!`, 'crit-label', 0, -20);
        renderStatusIcons(e);
      }
      addLog(`${summon.emoji}${summon.name}(随从) 被动：<span class="log-passive">怨灵诅咒！</span>`);
    }
  }

  // Fortune gold on summon death
  allFighters.forEach(fg => {
    if (fg.alive && fg.passive && fg.passive.type === 'fortuneGold') {
      fg._goldCoins += 9;
      const fgElId = getFighterElId(fg);
      spawnFloatingNum(fgElId, `+9<img src="assets/battle/gold-coin-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'passive-num', 500, 0);
      renderStatusIcons(fg);
    }
  });
  // Hunter stat steal on summon death
  const hunters = allFighters.filter(h => h.alive && h.side !== summon.side && h.passive && h.passive.type === 'hunterKill');
  for (const hunter of hunters) {
    const sAtk = Math.round(summon.baseAtk * hunter.passive.stealPct / 100);
    const sDef = Math.round(summon.baseDef * hunter.passive.stealPct / 100);
    const sMr  = Math.round((summon.baseMr || summon.baseDef) * hunter.passive.stealPct / 100);
    const sHp  = Math.round(summon.maxHp * hunter.passive.stealPct / 100);
    hunter.baseAtk += sAtk; hunter.baseDef += sDef; hunter.baseMr = (hunter.baseMr || hunter.baseDef) + sMr; hunter.maxHp += sHp; hunter.hp += sHp;
    hunter._hunterKills = (hunter._hunterKills || 0) + 1;
    hunter._hunterStolenAtk = (hunter._hunterStolenAtk || 0) + sAtk;
    hunter._hunterStolenDef = (hunter._hunterStolenDef || 0) + sDef;
    hunter._hunterStolenMr = (hunter._hunterStolenMr || 0) + sMr;
    hunter._hunterStolenHp = (hunter._hunterStolenHp || 0) + sHp;
    const hElId = getFighterElId(hunter);
    spawnFloatingNum(hElId, `+${sAtk}攻+${sDef}甲`, 'passive-num', 300, 0);
    recalcStats(); updateFighterStats(hunter, hElId);
  }
}

function checkBattleEnd() {
  // Both sides check battle end identically (seeded random ensures same state)
  // Don't end battle if a mech transform is pending
  if (allFighters.some(f => f._pendingMech)) return false;
  const lA = leftTeam.some(f=>f.alive), rA = rightTeam.some(f=>f.alive);
  if (!lA || !rA) {
    battleOver = true;
    unseedBattleRng();
    const _ap = document.getElementById('actionPanel'); if (_ap) _ap.classList.remove('show');
    // Host: notify guest of battle end
    if (gameMode === 'pvp-online' && onlineSide === 'left') {
      sendOnline({ type:'battle-end', leftWon: lA });
    }
    setTimeout(() => showResult(lA), 1200);
    return true;
  }
  return false;
}

// ── LAVA RAGE TRANSFORM ──────────────────────────────────
async function processLavaTransform() {
  for (const f of allFighters) {
    if (!f.alive || !f.passive || f.passive.type !== 'lavaRage') continue;
    // Check rage full → transform
    if (!f._lavaTransformed && !f._lavaSpent && f._lavaRage >= f.passive.rageMax) {
      f._lavaTransformed = true;
      f._lavaTransformTurns = f.passive.transformDuration;
      f._lavaRage = 0;
      const p = f.passive;
      const preAtk = f.atk;
      // Store small form skills
      f._lavaSmallSkills = f.skills;
      // Apply stat boosts
      const hpGain = Math.round(preAtk * p.transformHpScale);
      const atkGain = Math.round(preAtk * p.transformAtkScale);
      const defGain = Math.round(preAtk * p.transformDefScale);
      const mrGain = Math.round(preAtk * p.transformMrScale);
      f._lavaHpGain = hpGain; f._lavaAtkGain = atkGain; f._lavaDefGain = defGain; f._lavaMrGain = mrGain;
      const oldMax = f.maxHp;
      f.maxHp += hpGain;
      f.hp = Math.round(f.hp * f.maxHp / oldMax);
      f.baseAtk += atkGain;
      f.baseDef += defGain;
      f.baseMr = (f.baseMr || f.baseDef) + mrGain;
      recalcStats();
      // Switch to volcano skills
      const pet = ALL_PETS.find(p => p.id === f.id);
      if (pet && pet.volcanoSkills) f.skills = pet.volcanoSkills.map(s => ({...s, cdLeft:0}));
      f.name = '火山龟';
      f._lavaSmallImg = f.img;
      f._lavaSmallSprite = f.sprite;
      f.img = 'assets/passive/volcano-form-icon.png';
      f.emoji = '<img src="assets/battle/lava-shield-icon.png" style="width:16px;height:16px;vertical-align:middle">🐢';
      f.sprite = null;
      const elId = getFighterElId(f);
      // Visual
      spawnFloatingNum(elId, '<img src="assets/battle/lava-shield-icon.png" style="width:16px;height:16px;vertical-align:middle">变身！', 'crit-label', 0, -30);
      spawnFloatingNum(elId, `+${hpGain}HP +${atkGain}攻 +${defGain}甲 +${mrGain}抗`, 'passive-num', 200, 0);
      // Screen flash
      try {
        const flash = document.createElement('div');
        flash.className = 'mech-transform-flash';
        flash.style.background = 'rgba(255,100,0,.35)';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 500);
      } catch(e) {}
      updateHpBar(f, elId);
      renderFighterCard(f, elId);
      renderStatusIcons(f);
      addLog(`${f.emoji}${f.name} <span class="log-passive"><img src="assets/battle/lava-shield-icon.png" style="width:16px;height:16px;vertical-align:middle">怒气爆发！变身为火山龟！+${hpGain}HP +${atkGain}攻 +${defGain}甲 +${mrGain}抗</span>`);
      await sleep(800);
      // Transform AOE: 120% post-transform ATK magic damage + burn to all enemies
      const aoeDmg = Math.round(f.atk * p.transformAoeDmgScale);
      const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
      for (const e of enemies) {
        const effMr = calcEffDef(f, e, 'magic');
        const dmg = Math.max(1, Math.round(aoeDmg * calcDmgMult(effMr)));
        applyRawDmg(f, e, dmg, false, false, 'magic');
        const eElId = getFighterElId(e);
        spawnFloatingNum(eElId, `-${dmg}<img src="assets/battle/lava-shield-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'magic-dmg', 0, 0, {atkSide:f.side, amount:dmg});
        updateHpBar(e, eElId);
        if (!(e.passive && e.passive.burnImmune)) {
          applySkillDebuffs({burn:true}, e, f);
          // Heal 8% lost HP per burn applied
          const lostHp = f.maxHp - f.hp;
          const burnHeal = Math.round(lostHp * 0.08);
          const actual = applyHeal(f, burnHeal);
          if (actual > 0) {
            spawnFloatingNum(getFighterElId(f), `+${actual}`, 'heal-num', 200, 0);
            updateHpBar(f, getFighterElId(f));
          }
        }
      }
      addLog(`${f.emoji}${f.name} 变身冲击波：全体敌方 <span class="log-magic">${aoeDmg}魔法伤害</span> + <span style="color:#ff6600">灼烧</span> + 回复`);
      await sleep(600);
      checkDeaths(f);
      if (checkBattleEnd()) return;
    }
  }
}

// Lava transform countdown (called in beginTurn per-turn passives)
function processLavaCountdown(f) {
  if (!f.passive || f.passive.type !== 'lavaRage' || !f._lavaTransformed) return;
  f._lavaTransformTurns--;
  if (f._lavaTransformTurns <= 0) {
    // Revert to small form — can rage again
    f._lavaTransformed = false;
    f._lavaSpent = false;
    f._lavaRage = 0;
    // Revert stats
    const oldMax = f.maxHp;
    f.maxHp -= f._lavaHpGain;
    f.hp = Math.max(1, Math.round(f.hp * f.maxHp / oldMax));
    f.baseAtk -= f._lavaAtkGain;
    f.baseDef -= f._lavaDefGain;
    f.baseMr = (f.baseMr || f.baseDef) - f._lavaMrGain;
    recalcStats();
    // Restore small skills
    if (f._lavaSmallSkills) f.skills = f._lavaSmallSkills;
    f.name = '熔岩龟';
    f.img = f._lavaSmallImg || '../../assets/pets/熔岩龟.png';
    f.emoji = '<img src="assets/battle/lava-shield-icon.png" style="width:16px;height:16px;vertical-align:middle">🐢';
    const pet = ALL_PETS.find(p => p.id === f.id);
    if (pet && pet.sprite) f.sprite = pet.sprite;
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, '变身结束', 'debuff-label', 0, -20);
    updateHpBar(f, elId);
    renderFighterCard(f, elId);
    renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} 火山形态结束，恢复小形态`);
  }
}

// ── HUNTER KILL PASSIVE ───────────────────────────────────
async function processHunterKill() {
  for (const f of allFighters) {
    if (!f.alive || !f.passive || f.passive.type !== 'hunterKill') continue;
    // Check ALL alive enemies (including summons and mechs)
    const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
    for (const e of enemies) {
      if (e.hp / e.maxHp < f.passive.hpThresh / 100 && !e._undeadLockTurns) {
        // Execute with animation!
        const eElId = getFighterElId(e);
        const fElAnim = getFighterElId(f);

        // Phase 1: big hunter icon overlay on target
        try {
          const targetEl = document.getElementById(eElId);
          const rect = targetEl ? targetEl.getBoundingClientRect() : {left:100,top:100,width:100,height:50};
          const icon = document.createElement('img');
          icon.src = 'assets/passive/hunter-kill-icon.png';
          icon.style.cssText = `position:fixed;width:120px;height:120px;z-index:9999;pointer-events:none;left:${rect.left+rect.width/2-60}px;top:${rect.top+rect.height/2-60}px;opacity:0.9;transition:opacity 0.3s,transform 0.3s;transform:scale(0.3)`;
          document.body.appendChild(icon);
          requestAnimationFrame(() => { icon.style.transform = 'scale(1)'; icon.style.opacity = '1'; });
          setTimeout(() => { icon.style.opacity = '0'; icon.style.transform = 'scale(1.5)'; }, 600);
          setTimeout(() => icon.remove(), 1000);
        } catch(err) {}
        await sleep(700);

        // Phase 2: arrow particles fly from hunter to target
        try {
          const fromEl = document.getElementById(fElAnim);
          const toEl = document.getElementById(eElId);
          if (fromEl && toEl) {
            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();
            for (let i = 0; i < 5; i++) {
              const arrow = document.createElement('div');
              arrow.className = 'mech-drone-particle';
              arrow.style.background = '#ff6b6b';
              arrow.style.boxShadow = '0 0 6px #ff0000';
              arrow.style.left = (fromRect.left + fromRect.width/2) + 'px';
              arrow.style.top = (fromRect.top + fromRect.height/2 + (i-2)*8) + 'px';
              document.body.appendChild(arrow);
              requestAnimationFrame(() => {
                arrow.style.transition = `all ${0.3 + i*0.05}s ease-in`;
                arrow.style.left = (toRect.left + toRect.width/2 - 6) + 'px';
                arrow.style.top = (toRect.top + toRect.height/2 - 6) + 'px';
                arrow.style.opacity = '0';
              });
              setTimeout(() => arrow.remove(), 1000);
            }
          }
        } catch(err) {}
        await sleep(500);

        // Phase 3: red flash + kill
        try {
          const flash = document.createElement('div');
          flash.className = 'mech-transform-flash';
          flash.style.background = 'rgba(255,50,50,.3)';
          document.body.appendChild(flash);
          setTimeout(() => flash.remove(), 400);
        } catch(err) {}

        spawnFloatingNum(eElId, '<img src="assets/passive/hunter-kill-icon.png" style="width:24px;height:24px;vertical-align:middle">猎杀!', 'crit-label', 0, -20);
        const execDmg = e.hp + e.shield;
        applyRawDmg(f, e, execDmg, false, false, 'true');
        // Keep alive temporarily for on-hit effects (bubble bind shield, etc.)
        e.alive = true;
        spawnFloatingNum(eElId, `-99999`, 'true-dmg', 100, 0, { atkSide: f.side, amount: execDmg });
        await triggerOnHitEffects(f, e, execDmg);
        e.hp = 0; e.alive = false;
        updateHpBar(e, eElId);
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">🏹猎杀！</span>${e.emoji}${e.name} 被斩杀！`,'death');
        await sleep(500);
        // Process death (handles revives: phoenix, angel, 亡灵之日, etc.)
        checkDeaths(f);
        if (checkBattleEnd()) return;
      }
    }
  }
}

// ── FORTUNE GOLD PASSIVE (per batch end) ──────────────────
async function processFortuneGold() {
  for (const f of allFighters) {
    if (!f.alive || !f.passive || f.passive.type !== 'fortuneGold') continue;
    const roll = 3 + Math.floor(Math.random() * 6); // 3~8
    f._goldCoins += roll;
    const fElId = getFighterElId(f);
    spawnFloatingNum(fElId, `+${roll}<img src="assets/battle/gold-coin-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'passive-num', 0, 0);
    renderStatusIcons(f);
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
    applyRawDmg(f, target, shockDmg, true, false, 'true');
    const eElId = getFighterElId(target);
    spawnFloatingNum(eElId, `<img src="assets/passive/lightning-storm-icon.png" style="width:14px;height:14px;vertical-align:middle">${shockDmg}`, 'pierce-dmg', 0, 0);
    updateHpBar(target, eElId);
    addLog(`${f.emoji}${f.name} 被动：<span class="log-pierce"><img src="assets/passive/lightning-storm-icon.png" style="width:14px;height:14px;vertical-align:middle">电击${target.emoji}${target.name} ${shockDmg}真实</span>`);
    // Trigger on-hit effects (shock stack, trap, reflect, etc.)
    await triggerOnHitEffects(f, target, shockDmg);
    checkDeaths(f);
    if (checkBattleEnd()) return;
    await sleep(600);
  }
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
// ── HEAL REDUCE HELPER ────────────────────────────────────
function applyHeal(target, amount) {
  if (target._undeadLockTurns > 0) return 0; // locked at 1HP, no healing
  const healRedBuff = target.buffs ? target.buffs.find(b => b.type === 'healReduce') : null;
  if (healRedBuff) amount = Math.round(amount * (1 - healRedBuff.value / 100));
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  return Math.round(target.hp - before);
}

// ── CHEST TURTLE EQUIPMENT SYSTEM ──────────────────────────
function checkChestEquipDraw(f) {
  if (!f.passive || f.passive.type !== 'chestTreasure') return;
  const thresholds = f.passive.thresholds;
  const pools = f.passive.pools;
  while (f._chestTier < thresholds.length && f._chestTreasure >= thresholds[f._chestTier]) {
    const poolIdx = f._chestTier < 2 ? 0 : f._chestTier < 4 ? 1 : 2;
    const pool = pools[poolIdx];
    const owned = f._chestEquips.map(e => e.id);
    const available = pool.filter(e => !owned.includes(e.id));
    if (!available.length) { f._chestTier++; continue; }
    const drawn = available[Math.floor(Math.random() * available.length)];
    f._chestEquips.push({...drawn});
    f._chestTier++;
    // Apply immediate stat effects
    applyChestEquip(f, drawn);
    // Visual feedback
    const elId = getFighterElId(f);
    const iconH = drawn.icon.endsWith && drawn.icon.endsWith('.png') ? `<img src="assets/${drawn.icon}" style="width:16px;height:16px;vertical-align:middle">` : drawn.icon;
    spawnFloatingNum(elId, `${iconH}${drawn.name}!`, 'crit-label', 0, -30);
    addLog(`${f.emoji}${f.name} 开启宝箱！获得 <span class="log-passive">${iconH}${drawn.name}</span>：${drawn.desc}`);
    renderStatusIcons(f);
    updateFighterStats(f, elId);
    updateHpBar(f, elId);
  }
}

function applyChestEquip(f, equip) {
  if (equip.stat === 'atk') { f.baseAtk += Math.round(f.baseAtk * equip.pct / 100); }
  if (equip.stat === 'defMr') { f.baseDef += Math.round(f.baseDef * equip.pct / 100); f.baseMr = (f.baseMr||f.baseDef) + Math.round((f.baseMr||f.baseDef) * equip.pct / 100); if (equip.bonusHp) { f.maxHp += equip.bonusHp; f.hp += equip.bonusHp; } }
  if (equip.stat === 'crit') { f.crit += equip.pct / 100; }
  if (equip.stat === 'lifesteal') { f._lifestealPct = (f._lifestealPct || 0) + equip.pct; }
  if (equip.stat === 'crown') { f.baseAtk += Math.round(f.baseAtk * 40 / 100); f.crit += 0.4; f._extraCritDmgPerm = (f._extraCritDmgPerm || 0) + 0.25; f._lifestealPct = (f._lifestealPct || 0) + 15; }
  // 贪婪 passive: +4% ATK +7% maxHP per equip
  if (f._chestGreed) {
    const atkBonus = Math.round(f.baseAtk * 0.04);
    const hpBonus = Math.round(f.maxHp * 0.07);
    f.baseAtk += atkBonus;
    f.maxHp += hpBonus; f.hp += hpBonus;
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `贪婪+${atkBonus}攻+${hpBonus}HP`, 'passive-num', 400, 0);
    updateHpBar(f, elId);
  }
  recalcStats();
}

function hasChestEquip(f, equipId) {
  return f._chestEquips && f._chestEquips.some(e => e.id === equipId);
}

// Helper: apply raw damage to target (through shields), track stats
// Returns { hpLoss, shieldAbs, bubbleAbs }
function applyRawDmg(source, target, amount, isPierce, _skipLink, dmgType) {
  // physImmune: block all physical damage (ghost phantom state)
  if (dmgType === 'physical' && target.buffs && target.buffs.some(b => b.type === 'physImmune')) {
    spawnFloatingNum(getFighterElId(target), '免疫!', 'dodge-num', 0, 0);
    return { hpLoss:0, shieldAbs:0, bubbleAbs:0 };
  }
  // dmgReduce buff: percentage damage reduction
  const dmgReduceBuff = target.buffs ? target.buffs.find(b => b.type === 'dmgReduce') : null;
  if (dmgReduceBuff && amount > 0) {
    amount = Math.round(amount * (1 - dmgReduceBuff.value / 100));
  }
  // Ink mark amplification: all damage to marked target is increased
  if (target._inkStacks > 0 && amount > 0) {
    amount = Math.round(amount * (1 + target._inkStacks * 0.05));
  }
  // Battle rule: 深海之日 — magic damage -20%
  if (dmgType === 'magic' && amount > 0) amount = Math.round(amount * getMagicDmgMult());
  // Equipment: flat damage reduction
  if (target._equipFlatReduce && amount > 0 && dmgType !== 'true') {
    amount = Math.max(1, amount - target._equipFlatReduce);
  }
  // Star equip: convert all damage to true
  if (source && hasChestEquip(source, 'star') && dmgType && dmgType !== 'true') dmgType = 'true';
  // Crystal resonance: extra magic damage reduction
  if (target.passive && target.passive.type === 'crystalResonance' && dmgType === 'magic') {
    amount = Math.round(amount * (1 - target.passive.magicAbsorb / 100));
  }
  // Undead lock: still takes damage normally but HP cannot go below 1 (won't die)
  if (target._undeadLockTurns > 0) {
    let rem2 = amount, shieldAbs2 = 0, bubbleAbs2 = 0;
    if (target.shield > 0) { shieldAbs2 = Math.min(target.shield, rem2); target.shield -= shieldAbs2; rem2 -= shieldAbs2; }
    const hpBefore = target.hp;
    target.hp = Math.max(1, target.hp - rem2); // can't go below 1
    const hpLoss2 = Math.round(hpBefore - target.hp);
    // Show "无法死亡" floating text when HP would have dropped to 0
    if (hpBefore - rem2 <= 0) {
      const tElId = getFighterElId(target);
      spawnFloatingNum(tElId, '<img src="assets/passive/undead-rage-icon.png" style="width:16px;height:16px;vertical-align:middle">无法死亡', 'crit-label', 0, -25);
    }
    if (source && source._dmgDealt !== undefined) { source._dmgDealt += amount; }
    if (target._dmgTaken !== undefined) { target._dmgTaken += amount; }
    updateDmgStats();
    return { hpLoss: hpLoss2, shieldAbs: shieldAbs2, bubbleAbs: bubbleAbs2 };
  }
  let rem = amount, bubbleAbs = 0, shieldAbs = 0;
  if (target.bubbleShieldVal > 0) { bubbleAbs = Math.min(target.bubbleShieldVal, rem); target.bubbleShieldVal -= bubbleAbs; rem -= bubbleAbs; }
  if (target.shield > 0 && rem > 0) { shieldAbs = Math.min(target.shield, rem); target.shield -= shieldAbs; rem -= shieldAbs; }
  target.hp = Math.max(0, target.hp - rem);
  // Undead passive: first death triggers lock — HP stays at 1 but still takes damage visually
  if (target.hp <= 0 && target.passive && target.passive.type === 'undeadRage' && !target._undeadLockUsed) {
    target._undeadLockUsed = true;
    target._undeadLockTurns = 2;
    target.hp = 1;
    target.alive = true;
    const elId = getFighterElId(target);
    spawnFloatingNum(elId, '<img src="assets/passive/undead-rage-icon.png" style="width:16px;height:16px;vertical-align:middle">亡灵之力!', 'crit-label', 0, -30);
    addLog(`${target.emoji}${target.name} <span class="log-passive"><img src="assets/passive/undead-rage-icon.png" style="width:16px;height:16px;vertical-align:middle">亡灵之力！锁血1HP 2回合！</span>`);
    renderStatusIcons(target);
  } else {
    if (target.hp <= 0) target.alive = false;
  }
  // Hunter mark execution: if target alive and HP below mark threshold, instant kill
  if (target.alive && target.hp > 0 && target.buffs) {
    const mark = target.buffs.find(b => b.type === 'hunterMark');
    if (mark && (target.hp / target.maxHp * 100) <= mark.value) {
      target.hp = 0;
      target.alive = false;
      const tElId = getFighterElId(target);
      spawnFloatingNum(tElId, `🎯斩杀!`, 'crit-label', 0, -25);
      addLog(`${target.emoji}${target.name} <span class="log-passive">🎯猎杀印记触发！HP<${mark.value}% 被斩杀！</span>`);
    }
  }
  // Real-time tracking by damage type
  if (source && source._dmgDealt !== undefined) {
    source._dmgDealt += amount;
    if (dmgType === 'magic') source._magicDmgDealt = (source._magicDmgDealt||0) + amount;
    else if (dmgType === 'true' || isPierce) source._trueDmgDealt = (source._trueDmgDealt||0) + amount;
    else source._physDmgDealt = (source._physDmgDealt||0) + amount;
  }
  if (target._dmgTaken !== undefined) {
    target._dmgTaken += amount;
    if (dmgType === 'magic') target._magicDmgTaken = (target._magicDmgTaken||0) + amount;
    else if (dmgType === 'true' || isPierce) target._trueDmgTaken = (target._trueDmgTaken||0) + amount;
    else target._physDmgTaken = (target._physDmgTaken||0) + amount;
  }
  // Chest turtle: accumulate treasure value from damage dealt
  if (source && source.passive && source.passive.type === 'chestTreasure' && amount > 0) {
    source._chestTreasure = (source._chestTreasure || 0) + amount;
    checkChestEquipDraw(source);
  }
  // Lava turtle: accumulate rage from damage dealt
  if (source && source.passive && source.passive.type === 'lavaRage' && !source._lavaSpent && !source._lavaTransformed && amount > 0) {
    source._lavaRage = Math.min(source.passive.rageMax, (source._lavaRage || 0) + Math.round(amount * source.passive.rageDmgPct / 100));
    renderStatusIcons(source);
    updateHpBar(source, getFighterElId(source)); // refresh rage bar
  }
  // Lava turtle: accumulate rage from damage taken
  if (target && target.passive && target.passive.type === 'lavaRage' && !target._lavaSpent && !target._lavaTransformed && amount > 0) {
    target._lavaRage = Math.min(target.passive.rageMax, (target._lavaRage || 0) + Math.round(amount * target.passive.rageTakenPct / 100));
    renderStatusIcons(target);
    updateHpBar(target, getFighterElId(target)); // refresh rage bar
  }
  updateDmgStats();
  // Ink link transfer: damage dealt to linked target transfers X% as pierce to partner
  if (!_skipLink && target._inkLink && target._inkLink.partner && target._inkLink.partner.alive && amount > 0) {
    const transferAmt = Math.round(amount * target._inkLink.transferPct / 100);
    if (transferAmt > 0) {
      const partner = target._inkLink.partner;
      applyRawDmg(source, partner, transferAmt, true, true); // _skipLink=true to prevent infinite loop
      const pElId = getFighterElId(partner);
      spawnFloatingNum(pElId, `-${transferAmt}🔗`, 'pierce-dmg', 0, 0);
      updateHpBar(partner, pElId);
    }
  }
  return { hpLoss: rem, shieldAbs, bubbleAbs };
}
function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2000);
}

// ── INIT (moved to main.js to ensure correct load order) ──

