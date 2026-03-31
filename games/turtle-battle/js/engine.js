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
    _deathProcessed: false,  // 防止重复处理死亡
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
    skills: b.skills.map(s => ({ ...s, cdLeft:0 })),
  };
}

// ── BATTLE START ──────────────────────────────────────────
function resetBattleState() {
  turnNum=1; currentIdx=0; leftTeam=[]; rightTeam=[];
  allFighters=[]; turnQueue=[]; battleOver=false; animating=false;
  batchPhase=0; batchesThisRound=0;
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
      // Every drone fires every turn at random enemy
      const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
      for (let di = 0; di < f._drones.length; di++) {
        if (!enemies.filter(e => e.alive).length) break;
        const alive = enemies.filter(e => e.alive);
        const target = alive[Math.floor(Math.random() * alive.length)];
        const dmg = Math.round(f.atk * f.passive.droneScale);
        const eDef = Math.max(0, target.def - (f.armorPen || 0));
        const defRed = eDef / (eDef + DEF_CONSTANT);
        const finalDmg = Math.max(1, Math.round(dmg * (1 - defRed)));
        applyRawDmg(f, target, finalDmg);
        const tElId = getFighterElId(target);
        spawnFloatingNum(tElId, `-${finalDmg}🛸`, 'direct-dmg', 0, 0);
        updateHpBar(target, tElId);
        await triggerOnHitEffects(f, target, finalDmg);
        checkDeaths(f);
        if (checkBattleEnd()) return;
        await sleep(300);
      }
      if (f._drones.length > 0) {
        addLog(`${f.emoji}${f.name} ${f._drones.length}个浮游炮分别打击！`);
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
      // End-of-round passives (lightning/fortune/hunter/energy wave)
      await processFortuneGold();
      if (battleOver) return;
      await processLightningStorm();
      if (battleOver) return;
      await processEnergyWave();
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

let pendingSkillIdx = null;

function pickSkill(idx) {
  try { sfxClick(); } catch(e) {}
  const f = turnQueue[currentIdx];
  const skill = f.skills[idx];
  pendingSkillIdx = idx;
  const isAlly = skill.type === 'heal' || skill.type === 'shield' || skill.type === 'bubbleShield' || skill.type === 'ninjaTrap' || skill.type === 'angelBless';

  // Self-cast: no target selection
  if (skill.type === 'fortuneDice' || skill.type === 'phoenixShield' || skill.type === 'gamblerDraw' || skill.type === 'hidingDefend' || skill.type === 'hidingCommand' || skill.type === 'cyberDeploy' || skill.type === 'cyberBuff' || (skill.type === 'twoHeadSwitch' && skill.switchTo === 'melee')) {
    executePlayerAction(f, skill, f);
    return;
  }
  // AOE / auto-target: no target selection needed
  if (skill.aoe || skill.aoeAlly || skill.type === 'hunterBarrage' || skill.type === 'ninjaBomb' || skill.type === 'lightningBuff' || skill.type === 'lightningBarrage' || skill.type === 'iceFrost' || skill.type === 'basicBarrage') {
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
      if (el) el.classList.add('dead');
      addLog(`${ff.emoji}${ff.name} 被击败...浮游炮开始组装！`);
      await sleep(1200);
      // Transform to mech
      ff.hp = ff.passive.mechHpPer * dc;
      ff.maxHp = ff.hp;
      ff.baseAtk = ff.passive.mechAtkPer * dc;
      ff.atk = ff.baseAtk;
      ff.baseDef = 0; ff.def = 0;
      ff.shield = 0; ff.bubbleShieldVal = 0;
      ff.crit = 0.08; ff.armorPen = 0;
      ff.alive = true; ff._deathProcessed = false;
      ff.name = '机甲';
      ff.emoji = '🤖';
      ff.buffs = [];
      ff.passive = null;
      ff.skills = [{ name:'机甲攻击', type:'physical', hits:1, power:0, pierce:0, cd:0, atkScale:1.0,
        brief:'机甲自动攻击随机敌人，造成{N:atkScale*ATK}普通伤害',
        detail:'机甲自动对随机敌方造成 100%×(攻击力={ATK}) = {N:atkScale*ATK} 普通伤害。' }];
      ff._initAtk = 0; ff._initDef = 0; ff._initHp = 0;
      if (el) el.classList.remove('dead');
      renderFighterCard(ff, elId);
      updateHpBar(ff, elId);
      spawnFloatingNum(elId, `机甲启动!`, 'crit-label', 0, -20);
      await sleep(600);
      spawnFloatingNum(elId, `${dc}炮→HP${ff.hp} ATK${ff.atk}`, 'passive-num', 0, 0);
      addLog(`🤖${ff.name} <span class="log-passive">浮游炮×${dc}组装完成！HP${ff.hp} ATK${ff.atk}</span>`);
      try { sfxRebirth(); } catch(e) {}
      await sleep(800);
    }
  }

  if (checkBattleEnd()) { animating=false; return; }

  // Hunter passive: check after every action
  await processHunterKill();
  if (checkBattleEnd()) { animating=false; return; }

  // Summon auto-follow-up: after any owner action, summon auto-attacks (including hidingCommand = 2nd hit)
  if (f.passive && f.passive.type === 'summonAlly' && f._summon && f._summon.alive) {
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
    // atkScale/defScale/hpPct are now per-hit values, no auto-split needed
    if (skill.random) basePower = Math.round(basePower * (0.5 + Math.random() * 1.5));

    // Passive: lowHpCrit — extra crit when HP < 30%
    let effectiveCrit = attacker.crit;
    if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
      effectiveCrit += attacker.passive.pct / 100;
    }
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
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

