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
    // Initial snapshot (never modified, for UI color comparison)
    _initHp:hp, _initAtk:atk, _initDef:def, _initCrit: b.crit || 0.08, _initArmorPen:0, _initLifesteal:0,
    crit: b.crit || 0.08,
    armorPen: 0,
    armorPenPct: 0,  // 百分比穿甲：无视目标X%防御
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
    _drones: [],
    _twoHeadForm: 'ranged',  // 双头龟形态
    _formHpGain: 0, _formDefGain: 0, _formAtkLoss: 0, // 形态切换记录
    _rangedSkills: null,     // 保存远程技能组
    _isMech: false,
    _starEnergy: 0,          // 星际龟星能
    _deathProcessed: false,
    _dmgDealt: 0,            // 伤害统计：总造成
    _dmgTaken: 0,            // 伤害统计：总承受
    _pierceDmgDealt: 0,      // 穿透伤害造成
    _normalDmgDealt: 0,      // 普通伤害造成
    _summon: null,            // 缩头乌龟随从
    _summonElId: null,        // 随从卡片DOM id
    _storedEnergy: 0,         // 龟壳储能值
    _auraAwakened: false,     // 龟壳气场觉醒标记
    _auraLifesteal: 0,        // 龟壳觉醒生命偷取
    _auraReflect: 0,          // 龟壳觉醒反伤
    _bambooCharged: false,    // 竹叶龟竹编充能状态
    _diamondCollideCount: {},  // 钻石龟碰撞计数 {fighterIdx: count}
    _inkStacks: 0,            // 线条龟墨迹层数(被标记方)
    _inkLink: null,           // 线条龟连笔链接 {partner:fighterRef, turns:N, transferPct:30}
    skills: b.skills.map(s => ({ ...s, cdLeft:0 })),
  };
}

// ── BATTLE START ──────────────────────────────────────────
function resetBattleState() {
  turnNum=1; currentIdx=0; leftTeam=[]; rightTeam=[];
  allFighters=[]; turnQueue=[]; battleOver=false; animating=false;
  _actionQueue=[];
  resetTurnState();
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
  // Guest: skip logic processing — host will send sync
  const isOnlineGuest = gameMode === 'pvp-online' && onlineSide === 'right';
  if (isOnlineGuest) {
    addLog(`── 第 ${turnNum} 回合 ──`, 'round-sep');
    try { sfxTurnStart(); } catch(e) {}
    activeSide = 'left';
    actedThisSide = new Set();
    sidesActedThisRound = 0;
    nextSideAction();
    return;
  }
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
    // Passive: cyberDrone — generate 1 drone per turn
    if (f.passive && f.passive.type === 'cyberDrone' && !f._isMech) {
      if (!f._drones) f._drones = [];
      if (f._drones.length < f.passive.maxDrones) {
        f._drones.push({ age: 0 });
        const elId = getFighterElId(f);
        spawnFloatingNum(elId, `+🛸`, 'passive-num', 0, 0);
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">生成浮游炮（${f._drones.length}/${f.passive.maxDrones}）</span>`);
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
        const eDef = Math.max(0, target.def - (f.armorPen || 0));
        const defRed = eDef / (eDef + DEF_CONSTANT);
        const finalDmg = Math.max(1, Math.round(dmg * (1 - defRed)));
        applyRawDmg(f, target, finalDmg);
        totalDroneDmg += finalDmg;
        const tElId = getFighterElId(target);
        spawnFloatingNum(tElId, `-${finalDmg}🛸`, 'direct-dmg', 0, (di % 3) * 14);
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
        addLog(`${f.emoji}${f.name} ${droneCount}个浮游炮打击！共 <span class="log-direct">${totalDroneDmg}伤害</span>`);
      }
    }
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
      spawnFloatingNum(elId, '🐚气场觉醒!', 'crit-label', 0, -20);
      spawnFloatingNum(elId, `+${atkGain}攻 +${defGain}防 +${hpGain}HP`, 'passive-num', 0, 10);
      updateHpBar(f, elId);
      addLog(`${f.emoji}${f.name} <span class="log-passive">🐚气场觉醒！ATK+${atkGain} DEF+${defGain} HP+${hpGain} 生命偷取${f.passive.lifestealPct}% 反伤${f.passive.reflectPct}% ${f.passive.armorPenPct}%穿甲</span>`);
    }
    // Passive: bambooCharge — toggle charge every other turn
    if (f.passive.type === 'bambooCharge') {
      f._bambooCharged = !f._bambooCharged;
      f._bambooFired = false;
      if (f._bambooCharged) {
        spawnFloatingNum(getFighterElId(f), '🎋充能!', 'passive-num', 0, 0);
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">🎋竹编充能！本回合技能后追加强化攻击</span>`);
      }
    }
    // Passive: rainbowPrism — random team buff each turn
    if (f.passive.type === 'rainbowPrism') {
      const allies = (f.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
      const roll = Math.floor(Math.random() * 3);
      if (roll === 0) {
        // Red: ATK up
        for (const a of allies) {
          const gain = Math.round(a.baseAtk * f.passive.atkPct / 100);
          a.buffs.push({ type:'atkUp', value:gain, turns:2 });
          spawnFloatingNum(getFighterElId(a), `+${gain}攻🔴`, 'passive-num', 0, 0);
        }
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">🔴红光！全体友方攻击+${f.passive.atkPct}% 1回合</span>`);
      } else if (roll === 1) {
        // Blue: DEF up
        for (const a of allies) {
          const gain = Math.round(a.baseDef * f.passive.defPct / 100);
          a.buffs.push({ type:'defUp', value:gain, turns:2 });
          spawnFloatingNum(getFighterElId(a), `+${gain}防🔵`, 'passive-num', 0, 0);
        }
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">🔵蓝光！全体友方防御+${f.passive.defPct}% 1回合</span>`);
      } else {
        // Green: heal
        for (const a of allies) {
          const heal = Math.round(a.maxHp * f.passive.healPct / 100);
          const before = a.hp;
          a.hp = Math.min(a.maxHp, a.hp + heal);
          const actual = Math.round(a.hp - before);
          if (actual > 0) spawnFloatingNum(getFighterElId(a), `+${actual}🟢`, 'heal-num', 0, 0);
          updateHpBar(a, getFighterElId(a));
        }
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">🟢绿光！全体友方回复${f.passive.healPct}%最大HP</span>`);
      }
      recalcStats();
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
        spawnFloatingNum(sElId, `+${gain}防`, 'passive-num', 0, 0);
        addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">防御+${gain}(已+${s._stoneDefGained}/${p.maxDef})</span>`);
      }
    }
    if (p.type === 'lightningStorm') {
      const enemies = allFighters.filter(e => e.alive && e.side !== s.side);
      if (enemies.length) {
        const t = enemies[Math.floor(Math.random() * enemies.length)];
        const sDmg = Math.round(s.atk * p.shockScale);
        applyRawDmg(s, t, sDmg, true);
        const tElId = getFighterElId(t);
        spawnFloatingNum(tElId, `⚡${sDmg}`, 'pierce-dmg', 0, 0);
        updateHpBar(t, tElId);
        addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">⚡电击${t.emoji}${t.name} ${sDmg}穿透</span>`);
      }
    }
  }
  // Process buffs/debuffs at turn start
  await processBuffs();
  // Recalculate stats after buff changes
  recalcStats();
  addLog(`── 第 ${turnNum} 回合 ──`, 'round-sep');
  try { sfxTurnStart(); } catch(e) {}
  // Host: sync state after turn-start passives/buffs
  if (gameMode === 'pvp-online' && onlineSide === 'left') {
    sendOnline({ type:'sync', state: buildStateSync() });
  }
  // Start new round: left acts first
  activeSide = 'left';
  actedThisSide = new Set();
  sidesActedThisRound = 0;
  nextSideAction();
}

// ── TURN SYSTEM ───────────────────────────────────────────
// Round 1: left×1 → right×all → end
// Round 2+: left×all → right×all → end
// Player chooses which turtle acts each time
let activeSide = 'left';      // whose turn it is
let actedThisSide = new Set(); // fighter indices that already acted this side
let isFirstRound = true;
let sidesActedThisRound = 0;  // 0, 1, or 2

function resetTurnState() {
  activeSide = 'left';
  actedThisSide = new Set();
  isFirstRound = true;
  sidesActedThisRound = 0;
}

async function nextSideAction() {
  if (battleOver) return;

  // Get alive fighters for active side that haven't acted yet
  const sideTeam = activeSide === 'left' ? leftTeam : rightTeam;
  const canAct = sideTeam.filter(f => f.alive && !actedThisSide.has(allFighters.indexOf(f)));

  // First round: left only sends 1
  const totalAlive = sideTeam.filter(f => f.alive).length;
  const maxActions = (isFirstRound && activeSide === 'left') ? 1 : totalAlive;
  const alreadyActed = sideTeam.filter(f => f.alive).length - canAct.length;

  if (canAct.length === 0 || alreadyActed >= maxActions) {
    // This side is done, switch to other side or end round
    await finishSide();
    return;
  }

  renderSideIndicator();

  // Determine if player or AI controls this side
  const isPlayer =
    (gameMode === 'pve' && activeSide === 'left') ||
    (gameMode === 'pvp-online' && activeSide === onlineSide);

  // Check for stunned fighters — auto-skip them
  const stunned = canAct.filter(f => f.buffs.some(b => b.type === 'stun'));
  if (stunned.length > 0) {
    for (const sf of stunned) {
      actedThisSide.add(allFighters.indexOf(sf));
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
    setTimeout(() => {
      actedThisSide.add(allFighters.indexOf(f));
      aiAction(f);
    }, 800);
  }
}

async function finishSide() {
  if (battleOver) return;
  sidesActedThisRound++;
  const isOnlineGuest = gameMode === 'pvp-online' && onlineSide === 'right';

  if (sidesActedThisRound >= 2) {
    // Both sides acted → end of round
    if (!isOnlineGuest) {
      await processFortuneGold();
      if (battleOver) return;
      await processLightningStorm();
      if (battleOver) return;
      if (typeof processEnergyWave === 'function') { await processEnergyWave(); if (battleOver) return; }
    }
    isFirstRound = false;
    turnNum++;
    sidesActedThisRound = 0;
    beginTurn();
    return;
  }

  // Switch to other side
  activeSide = activeSide === 'left' ? 'right' : 'left';
  actedThisSide = new Set();
  await sleep(300);
  nextSideAction();
}

// Called after a fighter finishes their action (from executeAction)
function onActionComplete() {
  if (battleOver) return;
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
    // Phoenix burn DoT (0.3×ATK + 5%maxHP per turn) — blocked by shields
    const pBurns = f.buffs.filter(b => b.type === 'phoenixBurnDot');
    for (const pb of pBurns) {
      const burnDmg = pb.value + Math.round(f.maxHp * pb.hpPct / 100);
      const { hpLoss, shieldAbs } = applyRawDmg(null, f, burnDmg, false, true);
      if (shieldAbs > 0) spawnFloatingNum(elId, `-${shieldAbs}🛡`, 'shield-dmg', 0, 0);
      if (hpLoss > 0) spawnFloatingNum(elId, `-${hpLoss}`, 'dot-dmg', 50, 0);
      updateHpBar(f, elId);
      addLog(`${f.emoji}${f.name} 受到 <span class="log-dot">${burnDmg}灼烧</span>${shieldAbs>0?' (护盾吸收'+shieldAbs+')':''}（剩余${pb.turns-1}回合）`);
      hadTick = true;
      if (f.hp <= 0) break;
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
    // Ink link tick-down
    if (f._inkLink && f._inkLink.turns > 0) {
      f._inkLink.turns--;
      if (f._inkLink.turns <= 0) {
        f._inkLink = null;
        addLog(`${f.emoji}${f.name} 的连笔链接消散了`);
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
      if (b.type === 'defUp') {
        const amp = (f.passive && f.passive.type === 'diamondStructure') ? (1 + f.passive.defBuffAmp / 100) : 1;
        f.def += Math.round(b.value * amp);
      }
      if (b.type === 'atkUp')   f.atk += b.value;
      // Dice fate crit buff
      if (b.type === 'diceFateCrit') f.crit = (f.crit || 0) + b.value / 100;
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
}

function nextAction() {
  // Redirects to new turn system
  onActionComplete();
}

let pendingSkillIdx = null;
let currentActingFighter = null; // the turtle currently acting (set by showActionPanel)

function pickSkill(idx) {
  try { sfxClick(); } catch(e) {}
  const f = currentActingFighter;
  const skill = f.skills[idx];
  pendingSkillIdx = idx;
  const isAlly = skill.type === 'heal' || skill.type === 'shield' || skill.type === 'bubbleShield' || skill.type === 'ninjaTrap' || skill.type === 'angelBless';

  // Self-cast: no target selection
  if (skill.type === 'fortuneDice' || skill.type === 'phoenixShield' || skill.type === 'gamblerDraw' || skill.type === 'hidingDefend' || skill.type === 'hidingCommand' || skill.type === 'cyberDeploy' || skill.type === 'cyberBuff' || skill.type === 'ghostPhase' || skill.type === 'diamondFortify' || skill.type === 'diceFate' || skill.type === 'chestOpen' || skill.type === 'bambooHeal' || skill.type === 'iceShield' || (skill.type === 'twoHeadSwitch' && skill.switchTo === 'melee')) {
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
  const f = currentActingFighter;
  const skill = f.skills[pendingSkillIdx];
  executePlayerAction(f, skill, allFighters[fi]);
}
function cancelTarget() { document.getElementById('targetSelect').style.display='none'; pendingSkillIdx=null; }

function executePlayerAction(f, skill, target) {
  document.getElementById('targetSelect').style.display = 'none';
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

async function executeAction(action) {
  if (battleOver) return;
  // Queue actions that arrive while animating (e.g. online opponent's action)
  if (animating) {
    _actionQueue.push(action);
    return;
  }
  animating = true;
  const f = allFighters[action.attackerId];
  if (!f) { console.error('executeAction: fighter not found', action); animating=false; return; }
  // Track this fighter as acted (needed for online: opponent actions come via network)
  actedThisSide.add(action.attackerId);
  const skill = f.skills[action.skillIdx];
  if (!skill) { console.error('executeAction: skill not found', action, 'fighter:', f.name, 'skills:', f.skills.length); animating=false; onActionComplete(); return; }

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
  } else {
    const target = allFighters[action.targetId];
    await doDamage(f, target, skill);
  }

  atkEl.classList.remove('attack-anim');

  updateDmgStats();

  checkDeaths(f);

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
          const dist = 80 + Math.random() * 60;
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
      ff.baseDef = 0; ff.def = 0;
      ff.shield = 0; ff.bubbleShieldVal = 0;
      ff.crit = 0.25; ff.armorPen = 0;
      ff.alive = true; ff._deathProcessed = false;
      ff.name = '机甲';
      ff.emoji = '🤖';
      ff.img = null;
      ff.buffs = [];
      ff.passive = { type:'mechBody', droneCount:dc, mechHpPer:30, mechAtkPer:5, desc:`由 ${dc} 个浮游炮组装而成，机甲具有：\n生命值 = 30 × ${dc} = {H:${finalHp}}\n攻击力 = 5 × ${dc} = {N:${finalAtk}}\n防御力 = 0，暴击率 = 25%\n每回合自动攻击血量最低的敌人，造成150%×攻击力 = {N:${Math.round(finalAtk*1.5)}} 普通伤害。` };
      ff.skills = [{ name:'机甲攻击', type:'mechAttack', hits:1, power:0, pierce:0, cd:0, cdLeft:0, atkScale:1.5,
        brief:'机甲自动攻击血量最低的敌人，造成{N:1.5*ATK}普通伤害',
        detail:'机甲自动锁定血量最低的敌方目标。\n造成 150%×(攻击力={ATK}) = {N:1.5*ATK} 普通伤害。' }];
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

  // BambooCharge follow-up: extra pierce attack after skill
  if (f.alive && f.passive && f.passive.type === 'bambooCharge' && f._bambooCharged) {
    const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
    if (enemies.length) {
      // Prefer the same target as the skill just used; fallback to lowest HP
      const skillTarget = action.targetId >= 0 ? allFighters[action.targetId] : null;
      const target = (skillTarget && skillTarget.alive && skillTarget.side !== f.side) ? skillTarget : enemies.sort((a,b) => a.hp - b.hp)[0];
      await doBambooChargeAttack(f, target);
      if (checkBattleEnd()) { animating=false; return; }
    }
  }

  // Summon auto-follow-up: after any owner action, summon auto-attacks (including hidingCommand = 2nd hit)
  if (f.passive && f.passive.type === 'summonAlly' && f._summon && f._summon.alive) {
    addLog(`${f._summon.emoji}${f._summon.name}(随从) 跟随出招！`);
    await sleep(400);
    await summonUseRandomSkill(f._summon, f);
    if (checkBattleEnd()) { animating=false; return; }
  }

  animating = false;

  // Host: send action + state sync to guest after execution
  if (gameMode === 'pvp-online' && onlineSide === 'left') {
    sendOnline({ type:'action', action });
    sendOnline({ type:'sync', state: buildStateSync() });
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
      atk: f.atk, def: f.def, baseAtk: f.baseAtk, baseDef: f.baseDef,
      alive: f.alive, crit: f.crit, armorPen: f.armorPen, armorPenPct: f.armorPenPct,
      _deathProcessed: f._deathProcessed, _isMech: f._isMech,
      _inkStacks: f._inkStacks, _shockStacks: f._shockStacks,
      _starEnergy: f._starEnergy, _goldCoins: f._goldCoins,
      _dmgDealt: f._dmgDealt, _dmgTaken: f._dmgTaken,
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
    f.atk = sf.atk; f.def = sf.def; f.baseAtk = sf.baseAtk; f.baseDef = sf.baseDef;
    f.alive = sf.alive; f.crit = sf.crit;
    f.armorPen = sf.armorPen; f.armorPenPct = sf.armorPenPct;
    f._deathProcessed = sf._deathProcessed; f._isMech = sf._isMech;
    f._inkStacks = sf._inkStacks; f._shockStacks = sf._shockStacks;
    f._starEnergy = sf._starEnergy; f._goldCoins = sf._goldCoins;
    f._dmgDealt = sf._dmgDealt; f._dmgTaken = sf._dmgTaken;
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

    // DEF reduction: DEF/(DEF+40), attacker's armorPen/armorPenPct reduces effective DEF
    const effectiveDef = calcEffDef(attacker, target);
    const defReduction = effectiveDef / (effectiveDef + DEF_CONSTANT);

    // Normal damage = basePower (minus pierce portion) × crit, reduced by DEF
    const normalBase = Math.max(0, basePower - (skill.pierce || 0));
    let normalDmg = Math.max(1, Math.round(normalBase * critMult * (1 - defReduction)));
    // Passive: bonusDmgAbove60
    if (attacker.passive && attacker.passive.type === 'bonusDmgAbove60' && target.hp / target.maxHp > 0.6) {
      normalDmg = Math.round(normalDmg * (1 + attacker.passive.pct / 100));
    }
    // Passive: frostAura bonus damage vs specific targets
    if (attacker.passive && attacker.passive.type === 'frostAura' && attacker.passive.bonusTargets && attacker.passive.bonusTargets.includes(target.id)) {
      normalDmg = Math.round(normalDmg * (1 + attacker.passive.bonusDmgPct / 100));
    }
    // Passive: basicTurtle — bonus damage based on target rarity
    if (attacker.passive && attacker.passive.type === 'basicTurtle' && attacker.passive.bonusMap) {
      const bonusPct = attacker.passive.bonusMap[target.rarity] || 0;
      if (bonusPct > 0) normalDmg = Math.round(normalDmg * (1 + bonusPct / 100));
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
    // Diamond structure: flat damage reduction per hit (not pierce)
    if (target.passive && target.passive.type === 'diamondStructure') {
      const flatReduce = Math.round(target.def * target.passive.flatReductionPct / 100);
      normalDmg = Math.max(1, normalDmg - flatReduce);
    }
    let normalPart = normalDmg;
    // Pierce damage: ignores DEF entirely, but hits shield
    let pierceFlat = skill.pierce || 0;
    if (skill.pierceScale) pierceFlat += Math.round(attacker.atk * skill.pierceScale);
    let piercePart = Math.round(pierceFlat * critMult) + convertedPierce;
    // Ink mark amplification: +5% per stack
    if (target._inkStacks > 0) {
      const inkAmp = 1 + target._inkStacks * 0.05;
      normalPart = Math.round(normalPart * inkAmp);
      piercePart = Math.round(piercePart * inkAmp);
    }
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
    spawnFloatingNum(aElId, `+${defGain}防`, 'passive-num', 300, 0);
    renderStatusIcons(attacker);
    addLog(`${attacker.emoji}${attacker.name} 自身 <span class="log-passive">防御+${defGain}(${skill.selfDefUpPct.pct}%)</span> ${skill.selfDefUpPct.turns}回合`);
  }
}

/* Apply debuffs: dot, atkDown, defDown */
function applySkillDebuffs(skill, target, attacker) {
  const debuffs = [];
  if (skill.dot)     debuffs.push({ type:'dot',     value:skill.dot.dmg,     turns:skill.dot.turns });
  if (skill.atkDown) debuffs.push({ type:'atkDown', value:skill.atkDown.pct, turns:skill.atkDown.turns });
  if (skill.defDown) debuffs.push({ type:'defDown', value:skill.defDown.pct, turns:skill.defDown.turns });

  // PhoenixBurn from skill (e.g. rainbow storm)
  if (skill.phoenixBurn && target.alive) {
    const burnVal = (skill.phoenixBurn.atkPct && attacker) ? Math.round(attacker.atk * skill.phoenixBurn.atkPct / 100) : 0;
    target.buffs.push({ type:'phoenixBurnDot', value:burnVal, hpPct:skill.phoenixBurn.hpPct || 5, turns:skill.phoenixBurn.turns });
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, '🔥灼烧', 'debuff-label', 200, -10);
    addLog(`${target.emoji}${target.name} 被施加 <span class="log-debuff">🔥灼烧 ${skill.phoenixBurn.turns}回合</span>`);
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
  // Calculate shield amount: fixed + % of caster's maxHP + ATK scaling
  let amount = skill.shield || 0;
  if (skill.shieldFlat) amount += skill.shieldFlat;
  if (skill.shieldHpPct) amount += Math.round(caster.maxHp * skill.shieldHpPct / 100);
  if (skill.shieldAtkScale) amount += Math.round(caster.atk * skill.shieldAtkScale);
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
    spawnFloatingNum(tElId, `⚡${target._shockStacks}/${attacker.passive.stackMax}`, 'passive-num', 350, 10);
    renderStatusIcons(target);
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
  // AuraAwaken: energy store — target stores received damage as energy
  if (target.passive && target.passive.type === 'auraAwaken' && target.passive.energyStore && target.alive) {
    target._storedEnergy = (target._storedEnergy || 0) + dmg;
    spawnFloatingNum(tElId, `+${dmg}⚡`, 'passive-num', 350, 10);
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
}

// ── GAMBLER MULTI-HIT (shared helper) ─────────────────────
async function tryGamblerMultiHit(attacker, target, tElId) {
  if (!target.alive || !attacker.alive || !attacker.passive || attacker.passive.type !== 'gamblerMultiHit') return;
  let multiChance = attacker.passive.chance + (attacker._multiBonus || 0);
  while (target.alive && attacker.alive && Math.random() * 100 < multiChance) {
    const extraDmg = Math.round(attacker.atk * attacker.passive.dmgScale);
    const eDef = calcEffDef(attacker, target);
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
    const eDef = calcEffDef(attacker, target);
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
  // Fortune turtle AI: use fortuneAllIn if coins can kill or enough coins saved
  if (!skill) skill = ready[0];
  const allInSkill = ready.find(s => s.type === 'fortuneAllIn');
  if (allInSkill && f._goldCoins > 0) {
    const perCoinDmg = Math.round(f.atk * 0.2) + Math.round(f.atk * 0.2);
    const totalAllInDmg = perCoinDmg * f._goldCoins;
    const weakest = enemies.sort((a,b) => (a.hp + a.shield) - (b.hp + b.shield))[0];
    const canKill = weakest && totalAllInDmg >= (weakest.hp + weakest.shield) * 0.7;
    const enoughCoins = f._goldCoins >= 18;
    if (canKill || enoughCoins) {
      skill = allInSkill;
    } else if (skill === allInSkill) {
      const other = ready.filter(s => s.type !== 'fortuneAllIn');
      skill = other.length ? other[Math.floor(Math.random() * other.length)] : ready[0];
    }
  }

  let target;
  if (skill.type==='heal') target = allies.sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0];
  else if (skill.type==='shield' || skill.type==='hidingDefend' || skill.type==='hidingCommand' || skill.type==='ghostPhase' || skill.type==='diamondFortify' || skill.type==='diceFate' || skill.type==='chestOpen' || skill.type==='bambooHeal' || skill.type==='iceShield') target = f; // self-cast
  else if (skill.type==='angelBless') target = allies.sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0]; // bless weakest ally
  else target = enemies.sort((a,b)=>a.hp-b.hp)[0];

  executeAction({ attackerId:allFighters.indexOf(f), skillIdx:f.skills.indexOf(skill), targetId:allFighters.indexOf(target) });
}

// ── DEATH & WIN ───────────────────────────────────────────

function checkDeaths(attacker) {
  allFighters.forEach(f => {
    if (f.hp <= 0 && !f._deathProcessed) {
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
        deadEl.addEventListener('animationend', () => deadEl.classList.add('dead'), { once:true });
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
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">死亡爆炸！</span>对 ${attacker.emoji}${attacker.name} 造成 <span class="log-direct">${dmg}伤害</span>`);
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
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">钩锁！</span>对 ${attacker.emoji}${attacker.name} 造成 <span class="log-pierce">${dmg}穿透伤害</span>`);
        if (attacker.hp <= 0) { attacker.alive = false; }
      }

      // Passive: ghostCurse — curse all enemies on death with pierce DoT
      if (f.passive && f.passive.type === 'ghostCurse') {
        const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
        for (const e of enemies) {
          const dotDmg = Math.round(e.maxHp * f.passive.hpPct / 100);
          e.buffs.push({ type:'dot', value:dotDmg, turns:f.passive.turns });
          const eElId = getFighterElId(e);
          spawnFloatingNum(eElId, `👻诅咒!`, 'crit-label', 0, -20);
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

      // Fortune gold: all alive fortune turtles gain 8 coins on any death
      allFighters.forEach(fg => {
        if (fg.alive && fg.passive && fg.passive.type === 'fortuneGold') {
          fg._goldCoins += 9;
          const fgElId = getFighterElId(fg);
          spawnFloatingNum(fgElId, `+9🪙`, 'passive-num', 500, 0);
          addLog(`${fg.emoji}${fg.name} 被动：<span class="log-passive">阵亡金币+9（共${fg._goldCoins}）</span>`);
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
  // Don't end battle if a mech transform is pending
  if (allFighters.some(f => f._pendingMech)) return false;
  const lA = leftTeam.some(f=>f.alive), rA = rightTeam.some(f=>f.alive);
  if (!lA || !rA) {
    battleOver = true;
    unseedBattleRng(); // restore Math.random
    document.getElementById('actionPanel').classList.remove('show');
    setTimeout(() => showResult(lA), 1200);
    return true;
  }
  return false;
}

// ── HUNTER KILL PASSIVE ───────────────────────────────────
async function processHunterKill() {
  for (const f of allFighters) {
    if (!f.alive || !f.passive || f.passive.type !== 'hunterKill') continue;
    // Check ALL alive enemies (including summons and mechs)
    const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
    for (const e of enemies) {
      if (e.hp / e.maxHp < f.passive.hpThresh / 100) {
        // Execute!
        const eElId = getFighterElId(e);
        spawnFloatingNum(eElId, '猎杀!', 'crit-label', 0, -20);
        spawnFloatingNum(eElId, '-99999', 'pierce-dmg', 100, 0);
        e.hp = 0; e.alive = false; e._deathProcessed = true;
        const deadEl = document.getElementById(eElId);
        if (deadEl) deadEl.classList.add('dead');
        updateHpBar(e, eElId);
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">🏹猎杀！</span>${e.emoji}${e.name} 被强化弩箭击杀！`,'death');

        // Steal 20% stats + 10% lifesteal
        const sAtk = Math.round(e.baseAtk * f.passive.stealPct / 100);
        const sDef = Math.round(e.baseDef * f.passive.stealPct / 100);
        const sHp  = Math.round(e.maxHp   * f.passive.stealPct / 100);
        f.baseAtk += sAtk; f.baseDef += sDef; f.maxHp += sHp; f.hp += sHp;
        // Lifesteal: stacks with each kill
        if (f.passive.lifesteal) {
          f._lifestealPct = (f._lifestealPct || 0) + f.passive.lifesteal;
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
    const roll = 3 + Math.floor(Math.random() * 6); // 3~8
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
function applyRawDmg(source, target, amount, isPierce, _skipLink) {
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

