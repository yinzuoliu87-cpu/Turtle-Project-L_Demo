async function doHidingDefend(caster, skill) {
  const shieldAmt = Math.round(caster.maxHp * skill.shieldHpPct / 100);
  caster.shield += shieldAmt;
  // Track shield for expiry heal
  caster.buffs.push({ type:'hidingShield', turns:skill.shieldDuration, shieldVal:shieldAmt, healPct:skill.shieldHealPct });
  const elId = getFighterElId(caster);
  spawnFloatingNum(elId, `+${shieldAmt}`, 'shield-num', 0, 0);
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
  addLog(`${owner.emoji}${owner.name} <b>指挥</b>：命令 ${summon.emoji}${summon.name} 额外出击！`);
  await sleep(400);
  await summonAutoAction(summon, owner);
}

// Summon AI: smart skill selection with own CD tracking
async function summonAutoAction(summon, owner) {
  if (!summon || !summon.alive) return;
  const ready = summon.skills.filter(s => s.cdLeft === 0);
  if (!ready.length) {
    addLog(`${summon.emoji}${summon.name}(随从) 没有可用技能！`);
    await sleep(500);
    return;
  }

  const enemies = (summon.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  const allies = (summon.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
  if (owner && owner.alive && !allies.includes(owner)) allies.push(owner);
  if (!enemies.length) return;

  // Smart AI: categorize skills
  const SELF_TYPES = new Set(['phoenixShield','fortuneDice','lightningBuff','hidingDefend','hidingCommand',
    'cyberDeploy','cyberBuff','ghostPhase','diamondFortify','diceFate','chestCount','bambooHeal',
    'iceShield','volcanoArmor','crystalBarrier']);
  const ALLY_TYPES = new Set(['heal','shield','bubbleShield','angelBless']);

  const healS = ready.find(s => s.type === 'heal' || s.type === 'bambooHeal');
  const shieldS = ready.find(s => s.type === 'shield' || s.type === 'bubbleShield' || s.type === 'iceShield');
  const dmgS = ready.filter(s => !SELF_TYPES.has(s.type) && !ALLY_TYPES.has(s.type) && s.type !== 'hidingCommand');
  const selfS = ready.filter(s => SELF_TYPES.has(s.type));

  let skill;
  // Heal if low HP
  if (healS && (summon.hp / summon.maxHp < 0.35 || (owner && owner.alive && owner.hp / owner.maxHp < 0.35))) {
    skill = healS;
  }
  // Shield if ally needs it
  else if (shieldS && allies.some(a => a.shield < 20 && a.hp / a.maxHp < 0.6)) {
    skill = shieldS;
  }
  // Self buffs 30% chance
  else if (selfS.length && Math.random() < 0.3) {
    skill = selfS[Math.floor(Math.random() * selfS.length)];
  }
  // Damage: prioritize big moves
  else if (dmgS.length) {
    dmgS.sort((a, b) => (b.cd || 0) - (a.cd || 0));
    skill = (dmgS[0].cd > 0 && Math.random() < 0.8) ? dmgS[0] : dmgS[Math.floor(Math.random() * dmgS.length)];
  }
  else { skill = ready[0]; }
  if (!skill) return;

  // Skip hidingCommand to prevent recursion
  if (skill.type === 'hidingCommand') {
    const others = ready.filter(s => s.type !== 'hidingCommand');
    skill = others.length ? others[0] : null;
    if (!skill) return;
  }

  if (skill.cd > 0) skill.cdLeft = skill.cd;

  // Target selection
  let target;
  if (SELF_TYPES.has(skill.type) || skill.selfCast) {
    target = summon;
  } else if (ALLY_TYPES.has(skill.type)) {
    target = allies.sort((a,b) => (a.hp/a.maxHp) - (b.hp/b.maxHp))[0];
  } else {
    // Smart target: front row priority (same as main AI), then lowest HP
    let pool = enemies;
    if (!skill.ignoreRow) {
      const front = enemies.filter(e => e._position === 'front');
      if (front.length > 0) pool = front;
    }
    // Taunt check
    const taunters = pool.filter(e => e.buffs.some(b => b.type === 'taunt'));
    if (taunters.length > 0) { target = taunters[0]; }
    else {
      const sorted = pool.slice().sort((a,b) => (a.hp/a.maxHp) - (b.hp/b.maxHp));
      const lowest = sorted[0];
      if (lowest._undeadLockTurns > 0) { target = sorted.find(e => !e._undeadLockTurns) || lowest; }
      else if (lowest.hp / lowest.maxHp < 0.2 && Math.random() < 0.9) target = lowest;
      else if (Math.random() < 0.7) target = lowest;
      else target = pool[Math.floor(Math.random() * pool.length)];
    }
  }

  // Execute via real engine action
  const action = {
    attackerId: allFighters.indexOf(summon),
    skillIdx: summon.skills.indexOf(skill),
    targetId: allFighters.indexOf(target),
    aoe: !!skill.aoe
  };

  addLog(`${summon.emoji}${summon.name}(随从) 使用 <b>${skill.name}</b>！`);
  const sElId = getFighterElId(summon);
  const sCard = document.getElementById(sElId);
  if (sCard) sCard.classList.add('attack-anim');

  try {
    // Prevent executeAction from triggering next turn via onActionComplete/nextAction
    const savedNextAction = typeof nextAction !== 'undefined' ? nextAction : null;
    const savedOnActionComplete = typeof onActionComplete !== 'undefined' ? onActionComplete : null;
    if (typeof nextAction !== 'undefined') nextAction = () => {};
    if (typeof onActionComplete !== 'undefined') onActionComplete = () => {};
    await executeAction(action);
    if (savedNextAction) nextAction = savedNextAction;
    if (savedOnActionComplete) onActionComplete = savedOnActionComplete;
  } catch(e) {
    // Fallback: use old method
    await summonUseRandomSkill(summon, owner);
  }

  if (sCard) sCard.classList.remove('attack-anim');
  checkDeaths(summon);
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

  const isAlly = skill.type === 'heal' || skill.type === 'shield' || skill.type === 'bubbleShield' || skill.type === 'angelBless';
  const isAoe = skill.aoe || skill.aoeAlly || skill.type === 'hunterBarrage' || skill.type === 'ninjaBomb' || skill.type === 'lightningBarrage' || skill.type === 'iceFrost';
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
  } else if (skill.type === 'turtleShieldBash') {
    const eTarget = enemies.length ? enemies.sort((a,b) => a.hp - b.hp)[0] : null;
    if (eTarget) await doTurtleShieldBash(summon, eTarget, skill);
  } else if (skill.type === 'basicBarrage') {
    await doBasicBarrage(summon, skill);
  } else if (skill.type === 'iceSpike') {
    const eTarget = enemies.length ? enemies.sort((a,b) => a.hp - b.hp)[0] : null;
    if (eTarget) await doIceSpike(summon, eTarget, skill);
  } else if (skill.type === 'iceFrost') {
    await doIceFrost(summon, skill);
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

// ── BASIC TURTLE SKILLS ───────────────────────────────────
