// Shared crit helper — returns { isCrit, critMult }
function calcCrit(f) {
  let effectiveCrit = f.crit || 0.25;
  if (f.passive && f.passive.type === 'lowHpCrit' && f.hp / f.maxHp < 0.3) effectiveCrit += f.passive.pct / 100;
  let overflowDmg = 0;
  if (effectiveCrit > 1.0) { overflowDmg = (effectiveCrit - 1.0) * (f.passive && f.passive.overflowMult || 1.5); effectiveCrit = 1.0; }
  const isCrit = Math.random() < effectiveCrit;
  const critMult = isCrit ? (1.5 + (f._extraCritDmgPerm || 0) + (f._extraCritDmg || 0) + overflowDmg) : 1;
  return { isCrit, critMult };
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
      const eDef = calcEffDef(caster, e);
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
    spawnFloatingNum(fElId, `+ATK+暴击+爆伤+转真实`, 'passive-num', 200, 0);
    recalcStats();
    renderStatusIcons(caster);
    updateFighterStats(caster, fElId);
    addLog(`${caster.emoji}${caster.name} <b>抽牌</b>：🃏强化牌！<span class="log-passive">+15%ATK +25%暴击 +15%爆伤 20%伤害转真实 3回合</span>`);
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
    const {isCrit, critMult} = calcCrit(attacker);
    const eDef = calcEffDef(attacker, target);
    const defRed = eDef / (eDef + DEF_CONSTANT);
    const normalDmg = Math.max(1, Math.round(normalPer * critMult * (1 - defRed)));
    const total = normalDmg + piercePer;
    applyRawDmg(attacker, target, total);
    totalDmg += total;
    spawnFloatingNum(tElId, `-${total}🃏`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, (i % 4) * 28);
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(500);
    tEl.classList.remove('hit-shake');
    await sleep(100);
    // Multi-hit passive (boosted to 60% for this skill)
    await tryGamblerMultiHit(attacker, target, tElId);
  }
  addLog(`→ ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}伤害</span>（每段含${piercePer}真实）`);

  // Remove temporary multi-hit bonus after this skill
  attacker._multiBonus = Math.max(0, (attacker._multiBonus || 0) - skill.multiBonus);
  await sleep(200);
}

// ── TWO-HEAD SKILLS (dual form) ───────────────────────────

// Magic wave: 4 hits alternating normal/pierce
async function doTwoHeadMagicWave(attacker, target, skill) {
  const tElId = getFighterElId(target);
  let totalDmg = 0;
  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) break;
    const {isCrit, critMult} = calcCrit(attacker);
    const baseDmg = Math.round(attacker.atk * skill.atkScale);
    const isPierceHit = (i % 2 === 1); // odd index = pierce
    let dmg;
    if (isPierceHit) {
      dmg = Math.round(baseDmg * critMult); // pierce: no DEF reduction
      applyRawDmg(attacker, target, dmg, true);
      spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-pierce' : 'pierce-dmg', 0, (i%4)*18);
    } else {
      const eDef = calcEffDef(attacker, target);
      const defRed = eDef / (eDef + DEF_CONSTANT);
      dmg = Math.max(1, Math.round(baseDmg * critMult * (1 - defRed)));
      applyRawDmg(attacker, target, dmg);
      spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, (i%4)*18);
    }
    totalDmg += dmg;
    await triggerOnHitEffects(attacker, target, dmg);
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(600);
    tEl.classList.remove('hit-shake');
    await sleep(100);
  }
  addLog(`${attacker.emoji}${attacker.name} <b>魔法波</b> 4段交替 → ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}混合伤害</span>`);
}

// Form switch
async function doTwoHeadSwitch(caster, target, skill) {
  const fElId = getFighterElId(caster);
  const p = caster.passive;

  if (skill.switchTo === 'melee') {
    // Remote → Melee
    const hpGain = Math.round(caster.atk * p.hpScale);
    const defGain = Math.round(caster.atk * p.defScale);
    const atkLoss = Math.round(caster.atk * p.atkLossScale);
    const shieldGain = Math.round(caster.atk * p.shieldScale);
    // Store for reverting
    caster._formHpGain = hpGain;
    caster._formDefGain = defGain;
    caster._formAtkLoss = atkLoss;
    // Scale HP proportionally
    const oldMax = caster.maxHp;
    caster.maxHp += hpGain;
    caster.hp = Math.round(caster.hp * caster.maxHp / oldMax);
    caster.baseDef += defGain;
    caster.baseAtk -= atkLoss;
    caster.shield += shieldGain;
    recalcStats();
    // Switch skills
    caster._rangedSkills = caster.skills;
    const pet = ALL_PETS.find(p => p.id === caster.id);
    caster.skills = (pet && pet.meleeSkills) ? pet.meleeSkills.map(s => ({...s, cdLeft:0})) : caster.skills;
    caster._twoHeadForm = 'melee';
    caster.name = '双头龟(近战)';
    updateHpBar(caster, fElId);
    renderFighterCard(caster, fElId);
    spawnFloatingNum(fElId, '切换近战!', 'crit-label', 0, -20);
    spawnFloatingNum(fElId, `+${hpGain}HP +${defGain}防 -${atkLoss}攻 +${shieldGain}🛡`, 'passive-num', 200, 0);
    addLog(`${caster.emoji}${caster.name} <span class="log-passive">切换近战形态！+${hpGain}HP +${defGain}防 -${atkLoss}攻 +${shieldGain}护盾</span>`);
  } else {
    // Melee → Remote: revert stats + attack + def reduction
    if (caster._formHpGain) {
      const oldMax = caster.maxHp;
      caster.maxHp -= caster._formHpGain;
      caster.hp = Math.min(caster.maxHp, Math.round(caster.hp * caster.maxHp / oldMax));
      caster.baseDef -= caster._formDefGain;
      caster.baseAtk += caster._formAtkLoss;
      caster._formHpGain = 0; caster._formDefGain = 0; caster._formAtkLoss = 0;
    }
    recalcStats();
    // Switch skills back
    if (caster._rangedSkills) {
      caster.skills = caster._rangedSkills;
      // Reset CDs on ranged skills
      caster.skills.forEach(s => { if (s.type === 'twoHeadSwitch') s.cdLeft = skill.cd; });
    }
    caster._twoHeadForm = 'ranged';
    caster.name = '双头龟(远程)';
    updateHpBar(caster, fElId);
    renderFighterCard(caster, fElId);
    spawnFloatingNum(fElId, '切换远程!', 'crit-label', 0, -20);
    addLog(`${caster.emoji}${caster.name} <span class="log-passive">切换远程形态！属性还原</span>`);
    // Attack on switch: 1.4×ATK + def reduction
    if (skill.atkScale && target && target.alive) {
      const baseDmg = Math.round(caster.atk * skill.atkScale);
      const eDef = calcEffDef(caster, target);
      const defRed = eDef / (eDef + DEF_CONSTANT);
      const dmg = Math.max(1, Math.round(baseDmg * (1 - defRed)));
      applyRawDmg(caster, target, dmg);
      const tElId = getFighterElId(target);
      spawnFloatingNum(tElId, `-${dmg}`, 'direct-dmg', 0, 0);
      await triggerOnHitEffects(caster, target, dmg);
      updateHpBar(target, tElId);
      addLog(`→ ${target.emoji}${target.name}：<span class="log-direct">${dmg}物理伤害</span>`);
      // Def reduction
      if (skill.defReductionScale) {
        const defRedVal = Math.round(caster.atk * skill.defReductionScale);
        const existing = target.buffs.find(b => b.type === 'defDown');
        if (existing) { existing.value = Math.max(existing.value, defRedVal); existing.turns = Math.max(existing.turns, skill.defReductionTurns); }
        else target.buffs.push({ type:'defDown', value:defRedVal, turns:skill.defReductionTurns });
        spawnFloatingNum(tElId, `-${defRedVal}防`, 'debuff-label', 200, 0);
        renderStatusIcons(target);
        recalcStats();
        addLog(`→ 减少 ${target.emoji}${target.name} {D:${defRedVal}}防御 ${skill.defReductionTurns}回合`);
      }
      await sleep(700);
    }
  }
  await sleep(500);
}

// Absorb: damage + heal lost HP
async function doTwoHeadAbsorb(attacker, target, skill) {
  const {isCrit, critMult} = calcCrit(attacker);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const eDef = calcEffDef(attacker, target);
  const defRed = eDef / (eDef + DEF_CONSTANT);
  const dmg = Math.max(1, Math.round(baseDmg * critMult * (1 - defRed)));
  applyRawDmg(attacker, target, dmg);
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0);
  await triggerOnHitEffects(attacker, target, dmg);
  const tEl = document.getElementById(tElId);
  tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(700);
  tEl.classList.remove('hit-shake');
  // Heal lost HP
  if (attacker.alive && skill.healLostPct) {
    const lostHp = attacker.maxHp - attacker.hp;
    const heal = Math.round(lostHp * skill.healLostPct / 100);
    const before = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
    const actual = Math.round(attacker.hp - before);
    if (actual > 0) {
      spawnFloatingNum(getFighterElId(attacker), `+${actual}`, 'heal-num', 200, 0);
      updateHpBar(attacker, getFighterElId(attacker));
    }
    addLog(`${attacker.emoji}${attacker.name} <b>吸收</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span>，<span class="log-heal">回复${actual}HP</span>`);
  }
  await sleep(200);
}

// Fear (kept for headless turtle which shares this skill)
async function doTwoHeadFear(attacker, target, skill) {
  const {isCrit, critMult} = calcCrit(attacker);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const eDef = calcEffDef(attacker, target);
  const defRed = eDef / (eDef + DEF_CONSTANT);
  const dmg = Math.max(1, Math.round(baseDmg * critMult * (1 - defRed)));
  applyRawDmg(attacker, target, dmg);
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0);
  await triggerOnHitEffects(attacker, target, dmg);
  const tEl = document.getElementById(tElId);
  tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(700);
  tEl.classList.remove('hit-shake');
  if (target.alive) {
    const existing = target.buffs.find(b => b.type === 'fear' && b.sourceId === allFighters.indexOf(attacker));
    if (existing) { existing.turns = skill.fearTurns; }
    else { target.buffs.push({ type:'fear', value:skill.fearReduction, turns:skill.fearTurns, sourceId:allFighters.indexOf(attacker) }); }
    spawnFloatingNum(tElId, '恐惧!', 'debuff-label', 200, 0);
    renderStatusIcons(target);
    addLog(`${attacker.emoji}${attacker.name} <b>恐吓</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span> + <span class="log-debuff">恐惧${skill.fearTurns}回合</span>`);
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
async function doTurtleShieldBash(attacker, target, skill) {
  const tElId = getFighterElId(target);
  const raw = Math.round(attacker.atk * skill.atkScale);

  let effectiveCrit = attacker.crit;
  if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
    effectiveCrit += attacker.passive.pct / 100;
  }
  const isCrit = Math.random() < effectiveCrit;
  const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;

  const effectiveDef = calcEffDef(attacker, target);
  const defReduction = effectiveDef / (effectiveDef + DEF_CONSTANT);
  let dmg = Math.max(1, Math.round(raw * critMult * (1 - defReduction)));

  // Passive: basicTurtle bonus
  if (attacker.passive && attacker.passive.type === 'basicTurtle' && attacker.passive.bonusMap) {
    const bonusPct = attacker.passive.bonusMap[target.rarity] || 0;
    if (bonusPct > 0) dmg = Math.round(dmg * (1 + bonusPct / 100));
  }
  // Passive: frostAura bonus
  if (attacker.passive && attacker.passive.type === 'frostAura' && attacker.passive.bonusTargets && attacker.passive.bonusTargets.includes(target.id)) {
    dmg = Math.round(dmg * (1 + attacker.passive.bonusDmgPct / 100));
  }

  applyRawDmg(attacker, target, dmg, false);


  spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 80, 0);
  updateHpBar(target, tElId);
  await triggerOnHitEffects(attacker, target, dmg);

  const tEl = document.getElementById(tElId);
  if (tEl) { tEl.classList.add('hit-shake'); }
  await sleep(500);
  if (tEl) { tEl.classList.remove('hit-shake'); }

  // Shield from damage
  const shieldGain = Math.round(dmg * skill.shieldFromDmgPct / 100);
  if (shieldGain > 0 && attacker.alive) {
    attacker.shield += shieldGain;
    const aElId = getFighterElId(attacker);
    spawnFloatingNum(aElId, `+${shieldGain}🛡`, 'shield-num', 0, 0);
    updateHpBar(attacker, aElId);
  }

  addLog(`${attacker.emoji}${attacker.name} <b>龟盾</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span>${isCrit?' <span class="log-crit">暴击</span>':''} + <span class="log-shield">+${shieldGain}永久护盾</span>`);
  if (target.alive) applySkillDebuffs(skill, target);
}

async function doBasicBarrage(attacker, skill) {
  const hits = skill.hits;
  const perHit = Math.round(attacker.atk * skill.atkScale / hits);
  let totalDmg = 0;

  const effectiveDef0 = DEF_CONSTANT; // placeholder, recalc per target

  for (let i = 0; i < hits; i++) {
    const enemies = getAliveEnemiesWithSummons(attacker.side);
    if (!enemies.length) break;
    const target = enemies[Math.floor(Math.random() * enemies.length)];
    const tElId = getFighterElId(target);

    let effectiveCrit = attacker.crit;
    if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
      effectiveCrit += attacker.passive.pct / 100;
    }
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;

    const effectiveDef = calcEffDef(attacker, target);
    const defReduction = effectiveDef / (effectiveDef + DEF_CONSTANT);
    let dmg = Math.max(1, Math.round(perHit * critMult * (1 - defReduction)));

    // Passive: basicTurtle bonus
    if (attacker.passive && attacker.passive.type === 'basicTurtle' && attacker.passive.bonusMap) {
      const bonusPct = attacker.passive.bonusMap[target.rarity] || 0;
      if (bonusPct > 0) dmg = Math.round(dmg * (1 + bonusPct / 100));
    }

    applyRawDmg(attacker, target, dmg, false);
    totalDmg += dmg;

    const yOff = (i % 4) * 32;

    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 80, yOff);
    updateHpBar(target, tElId);
    await triggerOnHitEffects(attacker, target, dmg);

    const tEl = document.getElementById(tElId);
    if (tEl) { tEl.classList.add('hit-shake'); }
    await sleep(350);
    if (tEl) { tEl.classList.remove('hit-shake'); }
    await sleep(100);

    checkDeaths(attacker);
    if (battleOver) break;
  }

  addLog(`${attacker.emoji}${attacker.name} <b>打击</b> ${hits}段随机分布：<span class="log-direct">共${totalDmg}伤害</span>`);
}

// ── ICE TURTLE SKILLS ─────────────────────────────────────
async function doIceSpike(attacker, target, skill) {
  const tElId = getFighterElId(target);
  const hits = skill.hits; // 6
  const perHit = attacker.atk * skill.totalScale / hits;
  let totalNormal = 0, totalPierce = 0, totalShieldDmg = 0, totalCrits = 0;

  const effectiveDef = calcEffDef(attacker, target);
  const defReduction = effectiveDef / (effectiveDef + DEF_CONSTANT);

  for (let i = 0; i < hits; i++) {
    if (!target.alive) break;

    // Dodge check
    const dodgeBuff = target.buffs.find(b => b.type === 'dodge');
    if (dodgeBuff && Math.random() < dodgeBuff.value / 100) {
      spawnFloatingNum(tElId, '闪避!', 'dodge-num', 0, (i % 4) * 32);
      await sleep(280);
      continue;
    }

    let effectiveCrit = attacker.crit;
    if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
      effectiveCrit += attacker.passive.pct / 100;
    }
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
    if (isCrit) totalCrits++;

    const isNormal = (i % 2 === 0); // odd hits (1,3,5) = index 0,2,4 = normal; even hits (2,4,6) = index 1,3,5 = pierce
    const raw = Math.round(perHit);
    let dmg;
    const yOff = (i % 4) * 32;

    if (isNormal) {
      dmg = Math.max(1, Math.round(raw * critMult * (1 - defReduction)));
      // Frost bonus vs fire targets
      if (attacker.passive && attacker.passive.type === 'frostAura' && attacker.passive.bonusTargets && attacker.passive.bonusTargets.includes(target.id)) {
        dmg = Math.round(dmg * (1 + attacker.passive.bonusDmgPct / 100));
      }
      applyRawDmg(attacker, target, dmg, false);
      totalNormal += dmg;
  
      spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 80, yOff);
    } else {
      dmg = Math.max(1, Math.round(raw * critMult)); // pierce ignores DEF
      // Frost bonus vs fire targets (pierce portion)
      if (attacker.passive && attacker.passive.type === 'frostAura' && attacker.passive.bonusTargets && attacker.passive.bonusTargets.includes(target.id)) {
        dmg = Math.round(dmg * (1 + attacker.passive.bonusDmgPct / 100));
      }
      applyRawDmg(attacker, target, dmg, true);
      totalPierce += dmg;
  
      spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-pierce' : 'pierce-dmg', 80, yOff);
    }

    await triggerOnHitEffects(attacker, target, dmg);

    // Judgement passive
    if (attacker.passive && attacker.passive.type === 'judgement' && target.alive) {
      const judgeRaw = Math.round(target.hp * attacker.passive.hpPct / 100);
      const judgeReduced = Math.max(1, Math.round(judgeRaw * (1 - defReduction) * critMult));
      applyRawDmg(attacker, target, judgeReduced, false);
      totalNormal += judgeReduced;
      spawnFloatingNum(tElId, `⚖${judgeReduced}`, 'passive-num', 400, yOff);
      updateHpBar(target, tElId);
    }

    const tEl = document.getElementById(tElId);
    if (tEl) { tEl.classList.add('hit-shake'); }
    updateHpBar(target, tElId);
    await sleep(500);
    if (tEl) { tEl.classList.remove('hit-shake'); }
    await sleep(150);
  }

  // Log
  const parts = [];
  if (totalNormal > 0) parts.push(`<span class="log-direct">${totalNormal}物理</span>`);
  if (totalPierce > 0) parts.push(`<span class="log-pierce">${totalPierce}真实</span>`);
  if (totalCrits > 0) parts.push(`<span class="log-crit">${totalCrits}暴击</span>`);
  addLog(`${attacker.emoji}${attacker.name} <b>冰锥</b> 6段 → ${target.emoji}${target.name}：${parts.join(' + ')}`);

  if (target.alive) applySkillDebuffs(skill, target);
}

async function doIceFrost(attacker, skill) {
  const enemies = getAliveEnemiesWithSummons(attacker.side);
  const dmgBase = Math.round(attacker.atk * skill.atkScale);
  let totalDmg = 0;

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    let dmg = dmgBase;
    // Frost bonus vs fire targets
    if (attacker.passive && attacker.passive.type === 'frostAura' && attacker.passive.bonusTargets && attacker.passive.bonusTargets.includes(enemy.id)) {
      dmg = Math.round(dmg * (1 + attacker.passive.bonusDmgPct / 100));
    }
    // Crit check
    let effectiveCrit = attacker.crit;
    if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
      effectiveCrit += attacker.passive.pct / 100;
    }
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
    dmg = Math.max(1, Math.round(dmg * critMult));

    applyRawDmg(attacker, enemy, dmg, true);
    totalDmg += dmg;
    const eElId = getFighterElId(enemy);

    spawnFloatingNum(eElId, `-${dmg}`, isCrit ? 'crit-true' : 'true-dmg', 80, 0, {atkSide: attacker.side, amount: dmg});
    updateHpBar(enemy, eElId);
    await triggerOnHitEffects(attacker, enemy, dmg);

    const eEl = document.getElementById(eElId);
    if (eEl) { eEl.classList.add('hit-shake'); }
    await sleep(400);
    if (eEl) { eEl.classList.remove('hit-shake'); }
  }

  addLog(`${attacker.emoji}${attacker.name} <b>冰霜</b> 全体：<span class="log-pierce">${totalDmg}真实伤害</span>`);
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

  const effectiveDef = calcEffDef(attacker, target);
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
  parts.push(`<span class="log-direct">魔法${Math.round(attacker.atk * skill.normalScale)}</span>`);
  parts.push(`<span class="log-pierce">真实${Math.round(attacker.atk * skill.pierceScale)}</span>`);
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
  const roll = 3 + Math.floor(Math.random() * 6); // 3~8
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

  const perCoinDelay = Math.max(200, Math.round(600 / Math.sqrt(coins))); // 1币600ms, 4币300ms, 16币150ms
  for (let i = 0; i < coins; i++) {
    if (!target.alive) break;
    const effectiveDef = calcEffDef(attacker, target, 'true');
    const defRed = effectiveDef / (effectiveDef + DEF_CONSTANT);
    const normalDmg = Math.max(1, Math.round(normalPer * (1 - defRed)));
    const totalHit = normalDmg + piercePer;
    applyRawDmg(attacker, target, totalHit);
    totalPierce += piercePer;
    totalNormal += normalDmg;
    const yOff = (i % 4) * 28;
    spawnFloatingNum(tElId, `-${totalHit}🪙`, 'true-dmg', 0, yOff, {atkSide: attacker.side, amount: totalHit});
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(perCoinDelay);
    if (tEl) tEl.classList.remove('hit-shake');
  }
  updateHpBar(target, tElId);
  addLog(`→ ${target.emoji}${target.name}：<span class="log-direct">${totalNormal}物理</span> + <span class="log-pierce">${totalPierce}真实</span>（${coins}枚金币）`);
  await sleep(600);
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
    const {isCrit, critMult} = calcCrit(attacker);
    // Main target: normal damage through DEF
    const effectiveDef = calcEffDef(attacker, mainTarget, 'magic');
    const defRed = effectiveDef / (effectiveDef + DEF_CONSTANT);
    const dmg = Math.max(1, Math.round(perHit * critMult * (1 - defRed)));
    applyRawDmg(attacker, mainTarget, dmg);
    totalMain += dmg;
    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0);
    await triggerOnHitEffects(attacker, mainTarget, dmg);
    // Splash to secondary
    if (secondaryTarget && secondaryTarget.alive) {
      const splashDmg = Math.max(1, Math.round(dmg * skill.splashPct / 100));
      applyRawDmg(attacker, secondaryTarget, splashDmg);
      totalSplash += splashDmg;
      const sElId = getFighterElId(secondaryTarget);
      spawnFloatingNum(sElId, `-${splashDmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 200, 0);
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
    const {isCrit, critMult} = calcCrit(attacker);
    // Normal damage through DEF
    const effectiveDef = calcEffDef(attacker, target, 'magic');
    const defRed = effectiveDef / (effectiveDef + DEF_CONSTANT);
    const dmg = Math.max(1, Math.round(perHitDmg * critMult * (1 - defRed)));
    applyRawDmg(attacker, target, dmg);
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, (i % 5) * 24);
    await triggerOnHitEffects(attacker, target, dmg);
    updateHpBar(target, tElId);
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    await sleep(100);
    tEl.classList.remove('hit-shake');
  }
  addLog(`${attacker.emoji}${attacker.name} <b>雷暴</b> ${skill.hits}次随机闪电，每次 <span class="log-direct">${perHitDmg}伤害</span>`);
}

// ── STAR TURTLE SKILLS ────────────────────────────────────

// Helper: add star energy
function addStarEnergy(f, dmg) {
  if (!f.passive || f.passive.type !== 'starEnergy') return;
  const maxE = Math.round(f.maxHp * f.passive.maxChargePct / 100);
  const gain = Math.round(dmg * f.passive.chargeRate / 100);
  f._starEnergy = Math.min(maxE, (f._starEnergy || 0) + gain);
}

// Helper: check and consume star energy burst
function checkStarBurst(f, target) {
  if (!f.passive || f.passive.type !== 'starEnergy') return 0;
  const maxE = Math.round(f.maxHp * f.passive.maxChargePct / 100);
  if (f._starEnergy < maxE) return 0;
  // Full energy! Burst all as pierce damage
  const burstDmg = Math.round(f._starEnergy);
  f._starEnergy = 0;
  // Check wormhole bonus on target
  const wh = target.buffs ? target.buffs.find(b => b.type === 'wormhole') : null;
  const finalBurst = wh ? Math.round(burstDmg * (1 + wh.pierceBonusPct / 100)) : burstDmg;
  applyRawDmg(f, target, finalBurst, true);
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `⭐${finalBurst}`, 'pierce-dmg', 200, -20);
  addLog(`${f.emoji}${f.name} <span class="log-passive">⭐星能爆发！</span>${target.emoji}${target.name} ${finalBurst} <span class="log-pierce">真实伤害</span>`);
  try { sfxExplosion(); } catch(e) {}
  return finalBurst;
}

// Star Beam: 3 hits, 40%ATK + 5% target current HP each
async function doStarBeam(attacker, target, skill) {
  const tElId = getFighterElId(target);
  let totalDmg = 0;

  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) break;
    const {isCrit, critMult} = calcCrit(attacker);
    const baseDmg = Math.round(attacker.atk * skill.atkScale) + Math.round(target.hp * skill.currentHpPct / 100);
    const eDef = calcEffDef(attacker, target, 'magic');
    const defRed = eDef / (eDef + DEF_CONSTANT);

    // Check wormhole normal bonus
    const wh = target.buffs.find(b => b.type === 'wormhole' && b.sourceId === allFighters.indexOf(attacker));
    let dmg = Math.max(1, Math.round(baseDmg * critMult * (1 - defRed)));
    if (wh) dmg = Math.round(dmg * (1 + wh.normalBonusPct / 100));

    applyRawDmg(attacker, target, dmg);
    totalDmg += dmg;
    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, (i % 3) * 28);
    await triggerOnHitEffects(attacker, target, dmg);

    // Accumulate star energy
    addStarEnergy(attacker, dmg);

    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(700);
    if (tEl) tEl.classList.remove('hit-shake');
    await sleep(200);
  }

  addLog(`${attacker.emoji}${attacker.name} <b>星光射线</b> → ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}魔法伤害</span>`);

  // Check star burst after all hits
  if (target.alive) checkStarBurst(attacker, target);
  renderStatusIcons(attacker);
}

// Wormhole: mark target for pierce/normal bonus
async function doStarWormhole(attacker, target, skill) {
  const tElId = getFighterElId(target);
  // Remove existing wormhole from this attacker
  target.buffs = target.buffs.filter(b => !(b.type === 'wormhole' && b.sourceId === allFighters.indexOf(attacker)));
  target.buffs.push({
    type: 'wormhole',
    pierceBonusPct: skill.pierceBonusPct,
    normalBonusPct: skill.normalBonusPct,
    turns: skill.duration,
    sourceId: allFighters.indexOf(attacker)
  });
  spawnFloatingNum(tElId, '🌀虫洞', 'debuff-label', 0, 0);
  renderStatusIcons(target);
  addLog(`${attacker.emoji}${attacker.name} <b>虫洞</b> → ${target.emoji}${target.name}：<span class="log-debuff">真实+${skill.pierceBonusPct}% 魔伤+${skill.normalBonusPct}% ${skill.duration}回合</span>`);
  await sleep(800);
}

// Meteor: AOE 60%ATK + 50% star energy as pierce
async function doStarMeteor(attacker, skill) {
  const enemies = allFighters.filter(e => e.alive && e.side !== attacker.side);
  if (!enemies.length) return;

  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  // Read 50% star energy as pierce (don't consume)
  const readPct = skill.energyReadPct || skill.energyConsumePct || 50;
  const piercePerTarget = Math.round((attacker._starEnergy || 0) * readPct / 100);

  for (const e of enemies) {
    if (!e.alive) continue;
    const {isCrit, critMult} = calcCrit(attacker);
    const eDef = calcEffDef(attacker, e, 'magic');
    const defRed = eDef / (eDef + DEF_CONSTANT);
    const normalDmg = Math.max(1, Math.round(baseDmg * critMult * (1 - defRed)));
    const pierceFinal = Math.round(piercePerTarget * critMult);
    const totalDmg = normalDmg + pierceFinal;
    applyRawDmg(attacker, e, totalDmg);
    const eId = getFighterElId(e);
    if (normalDmg > 0) spawnFloatingNum(eId, `-${normalDmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0);
    if (pierceFinal > 0) spawnFloatingNum(eId, `-${pierceFinal}`, isCrit ? 'crit-pierce' : 'pierce-dmg', 150, 0);
    updateHpBar(e, eId);
    await triggerOnHitEffects(attacker, e, totalDmg);

    // Accumulate star energy from normal dmg
    addStarEnergy(attacker, normalDmg);

    // Apply def down
    if (skill.defDown) {
      const existing = e.buffs.find(b => b.type === 'defDown');
      if (existing) { existing.value = Math.max(existing.value, skill.defDown.pct); existing.turns = Math.max(existing.turns, skill.defDown.turns); }
      else e.buffs.push({ type: 'defDown', value: skill.defDown.pct, turns: skill.defDown.turns });
      renderStatusIcons(e);
    }
  }
  recalcStats();
  renderStatusIcons(attacker);
  addLog(`${attacker.emoji}${attacker.name} <b>流星暴击</b> → 全体敌方：<span class="log-direct">${baseDmg}魔法</span>${piercePerTarget > 0 ? ` + <span class="log-pierce">${piercePerTarget}真实(每人)</span>` : ''} + 防御-${skill.defDown.pct}%`);
  await sleep(800);
}

// ── CYBER SKILLS ──────────────────────────────────────────
async function doCyberDeploy(caster, _skill) {
  if (!caster.passive || caster.passive.type !== 'cyberDrone') { await sleep(500); return; }
  if (caster._drones.length >= caster.passive.maxDrones) {
    addLog(`${caster.emoji}${caster.name} 浮游炮已满（${caster.passive.maxDrones}个）！`);
    await sleep(500);
    return;
  }
  caster._drones.push({ age: 0 });
  const elId = getFighterElId(caster);
  spawnFloatingNum(elId, `+🛸`, 'passive-num', 0, 0);
  renderStatusIcons(caster);
  addLog(`${caster.emoji}${caster.name} 部署浮游炮！（${caster._drones.length}/${caster.passive.maxDrones}）`);
  await sleep(800);
}

// ── PHOENIX SKILLS ────────────────────────────────────────
async function doPhoenixBurn(attacker, target, skill) {
  // Deal 1×ATK normal damage
  const {isCrit, critMult} = calcCrit(attacker);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const effectiveDef = calcEffDef(attacker, target, 'magic');
  const defRed = effectiveDef / (effectiveDef + DEF_CONSTANT);
  const dmg = Math.max(1, Math.round(baseDmg * critMult * (1 - defRed)));
  const tElId = getFighterElId(target);
  applyRawDmg(attacker, target, dmg);
  spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0);
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
  const {isCrit, critMult} = calcCrit(attacker);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const effectiveDef = calcEffDef(attacker, target, 'magic');
  const defRed = effectiveDef / (effectiveDef + DEF_CONSTANT);
  const dmg = Math.max(1, Math.round(baseDmg * critMult * (1 - defRed)));
  applyRawDmg(attacker, target, dmg);
  spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0);
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
    spawnFloatingNum(tElId, `-${pierceDmg}`, 'crit-pierce', 100, 0);
    addLog(`${attacker.emoji}${attacker.name} <b>飞镖</b> → ${target.emoji}${target.name}：<span class="log-crit">暴击!</span> <span class="log-pierce">${pierceDmg}真实</span>`);
    await triggerOnHitEffects(attacker, target, pierceDmg);
  } else {
    const effectiveDef = calcEffDef(attacker, target);
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
    const {isCrit, critMult} = calcCrit(attacker);
    const effectiveDef = calcEffDef(attacker, e);
    const defRed = effectiveDef / (effectiveDef + DEF_CONSTANT);
    const dmg = Math.max(1, Math.round(baseDmg * critMult * (1 - defRed)));
    applyRawDmg(attacker, e, dmg);
    const eId = getFighterElId(e);
    spawnFloatingNum(eId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0);
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
  const baseArrow = Math.round(attacker.atk * skill.arrowScale);
  let totalDmg = 0, totalCrits = 0;

  for (let i = 0; i < skill.hits; i++) {
    const alive = enemies.filter(e => e.alive);
    if (!alive.length) break;
    const target = alive[Math.floor(Math.random() * alive.length)];
    // Crit per arrow
    let effectiveCrit = attacker.crit;
    if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) effectiveCrit += attacker.passive.pct / 100;
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmgPerm || 0)) : 1;
    if (isCrit) totalCrits++;
    const arrowDmg = Math.max(1, Math.round(baseArrow * critMult));
    applyRawDmg(attacker, target, arrowDmg, true);
    totalDmg += arrowDmg;
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, `-${arrowDmg}`, isCrit ? 'crit-true' : 'true-dmg', 0, (i % 4) * 30, {atkSide: attacker.side, amount: arrowDmg});
    await triggerOnHitEffects(attacker, target, arrowDmg);
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(280);
    if (tEl) tEl.classList.remove('hit-shake');
  }
  addLog(`${attacker.emoji}${attacker.name} <b>${skill.name}</b> ${skill.hits}根箭：<span class="log-pierce">${totalDmg}真实</span>${totalCrits > 0 ? ' <span class="log-crit">'+totalCrits+'暴击</span>' : ''}`);
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


// ── SHELL TURTLE SKILLS (龟壳) ──────────────────────────
async function doShellStrike(attacker, target, skill) {
  const tElId = getFighterElId(target);
  const hits = skill.hits; // 6
  const perHit = attacker.atk * skill.totalScale / hits;
  let totalNormal = 0, totalPierce = 0, totalShieldDmg = 0, totalCrits = 0;
  let totalDmgDealt = 0;

  const effectiveDef = calcEffDef(attacker, target);
  const defReduction = effectiveDef / (effectiveDef + DEF_CONSTANT);

  for (let i = 0; i < hits; i++) {
    if (!target.alive) break;

    // Dodge check
    const dodgeBuff = target.buffs.find(b => b.type === 'dodge');
    if (dodgeBuff && Math.random() < dodgeBuff.value / 100) {
      spawnFloatingNum(tElId, '闪避!', 'dodge-num', 0, (i % 4) * 32);
      await sleep(280);
      continue;
    }

    let effectiveCrit = attacker.crit;
    if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
      effectiveCrit += attacker.passive.pct / 100;
    }
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
    if (isCrit) totalCrits++;

    const isNormal = (i % 2 === 0); // index 0,2,4 = normal; 1,3,5 = pierce
    const raw = Math.round(perHit);
    let dmg;
    const yOff = (i % 4) * 32;

    if (isNormal) {
      dmg = Math.max(1, Math.round(raw * critMult * (1 - defReduction)));
      const { shieldAbs } = applyRawDmg(attacker, target, dmg, false);
      totalNormal += dmg;
      totalShieldDmg += shieldAbs;
  
      spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 80, yOff);
    } else {
      dmg = Math.max(1, Math.round(raw * critMult)); // pierce ignores DEF
      const { shieldAbs } = applyRawDmg(attacker, target, dmg, true);
      totalPierce += dmg;
      totalShieldDmg += shieldAbs;
  
      spawnFloatingNum(tElId, `-${dmg}`, 'pierce-dmg', 80, yOff);
    }
    totalDmgDealt += dmg;

    // Per-hit splash to other enemies
    if (dmg > 0 && skill.splashPct > 0) {
      const splashDmg = Math.round(dmg * skill.splashPct / 100);
      if (splashDmg > 0) {
        const others = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive && e !== target);
        for (const e of others) {
          applyRawDmg(attacker, e, splashDmg, false);
          const eElId = getFighterElId(e);
          spawnFloatingNum(eElId, `-${splashDmg}溅射`, 'direct-dmg', 0, yOff);
          updateHpBar(e, eElId);
          await triggerOnHitEffects(attacker, e, splashDmg);
        }
      }
    }

    await triggerOnHitEffects(attacker, target, dmg);

    const tEl = document.getElementById(tElId);
    if (tEl) { tEl.classList.add('hit-shake'); }
    updateHpBar(target, tElId);
    await sleep(500);
    if (tEl) { tEl.classList.remove('hit-shake'); }
    await sleep(150);
  }

  // Log
  const parts = [];
  if (totalNormal > 0) parts.push(`<span class="log-direct">${totalNormal}物理</span>`);
  if (totalPierce > 0) parts.push(`<span class="log-pierce">${totalPierce}真实</span>`);
  if (totalCrits > 0) parts.push(`<span class="log-crit">${totalCrits}暴击</span>`);
  const splashNote = skill.splashPct > 0 ? ` (每段溅射${skill.splashPct}%)` : '';
  addLog(`${attacker.emoji}${attacker.name} <b>${skill.name}</b> 6段 → ${target.emoji}${target.name}：${parts.join(' + ')}${splashNote}`);
}

async function doShellCopy(caster, _skill) {
  // Blacklist: skills that make no sense when copied
  const COPY_BLACKLIST = ['shellCopy','twoHeadSteal','cyberDeploy','cyberBuff','hidingDefend',
    'hidingCommand','diceFate','fortuneDice','bambooHeal','bambooLeaf','ghostPhase',
    'diamondFortify','iceShield','twoHeadSwitch','mechAttack','chestOpen'];

  const enemies = (caster.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  if (!enemies.length) { await sleep(500); return; }

  // Gather copyable {enemy, skill} pairs
  const pool = [];
  for (const e of enemies) {
    for (const s of e.skills) {
      if (!COPY_BLACKLIST.includes(s.type)) pool.push({ source: e, skill: s });
    }
  }
  if (!pool.length) {
    addLog(`${caster.emoji}${caster.name} <b>复制</b>：没有可复制的技能！`);
    await sleep(1000);
    return;
  }

  // Pick up to 2 random skills (no duplicate skill type)
  const picked = [];
  const shuffled = pool.sort(() => Math.random() - 0.5);
  for (const p of shuffled) {
    if (picked.length >= 2) break;
    if (!picked.find(x => x.skill.type === p.skill.type)) picked.push(p);
  }

  const COPY_MULT = 0.6;

  for (const { source, skill: origSkill } of picked) {
    if (!caster.alive || battleOver) break;

    const fElId = getFighterElId(caster);
    spawnFloatingNum(fElId, `复制: ${origSkill.name}`, 'crit-label', 0, 0);
    addLog(`${caster.emoji}${caster.name} <b>复制</b>了 ${source.emoji}${source.name} 的 <b>${origSkill.name}</b>！(60%效果)`);
    await sleep(600);

    // Deep copy and apply 60% scaling
    const copied = JSON.parse(JSON.stringify(origSkill));
    if (copied.power) copied.power = Math.round(copied.power * COPY_MULT);
    if (copied.pierce) copied.pierce = Math.round(copied.pierce * COPY_MULT);
    if (copied.atkScale) copied.atkScale *= COPY_MULT;
    if (copied.defScale) copied.defScale *= COPY_MULT;
    if (copied.hpPct) copied.hpPct *= COPY_MULT;
    if (copied.totalScale) copied.totalScale *= COPY_MULT;
    if (copied.pierceScale) copied.pierceScale *= COPY_MULT;
    if (copied.selfHpPct) copied.selfHpPct *= COPY_MULT;
    if (copied.shield) copied.shield = Math.round(copied.shield * COPY_MULT);
    if (copied.shieldFlat) copied.shieldFlat = Math.round(copied.shieldFlat * COPY_MULT);
    if (copied.shieldHpPct) copied.shieldHpPct *= COPY_MULT;
    if (copied.shieldAtkScale) copied.shieldAtkScale *= COPY_MULT;
    if (copied.heal) copied.heal = Math.round(copied.heal * COPY_MULT);
    if (copied.hot) copied.hot.hpPerTurn = Math.round(copied.hot.hpPerTurn * COPY_MULT);
    if (copied.dot) copied.dot.dmg = Math.round(copied.dot.dmg * COPY_MULT);
    if (copied.normalScale) copied.normalScale *= COPY_MULT;
    // Star meteor: no star energy on caster = 0 pierce (correct by design)
    copied.cdLeft = 0;

    // Target selection: auto, no picker
    const ALLY_TYPES = ['heal','shield','bubbleShield','ninjaTrap','angelBless'];
    const AOE_TYPES_SET = new Set(['hunterBarrage','ninjaBomb','lightningBarrage','iceFrost','basicBarrage','starMeteor','diceAllIn']);
    const SELF_TYPES_SET = new Set(['phoenixShield','lightningBuff','gamblerDraw']);

    let copyTarget;
    const isAlly = ALLY_TYPES.includes(copied.type);
    const isAoe = copied.aoe || copied.aoeAlly || AOE_TYPES_SET.has(copied.type);
    const isSelf = SELF_TYPES_SET.has(copied.type);

    if (isSelf || isAoe) {
      copyTarget = caster;
    } else if (isAlly) {
      const allies = (caster.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
      copyTarget = allies.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
    } else {
      const aliveEnemies = (caster.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      copyTarget = aliveEnemies.sort((a, b) => a.hp - b.hp)[0];
    }
    if (!copyTarget) continue;

    // Temporarily assign copied skill and execute via real engine
    const savedSkills = caster.skills;
    caster.skills = [...savedSkills, copied];
    const copiedIdx = caster.skills.length - 1;

    const atkEl = document.getElementById(getFighterElId(caster));
    atkEl.classList.add('attack-anim');

    // Use executeAction for full routing (lightning triggers, etc.)
    const savedOnAction = window.onActionComplete;
    const savedNext = window.nextAction;
    window.onActionComplete = () => {};
    window.nextAction = () => {};
    animating = false;
    try {
      await executeAction({
        attackerId: allFighters.indexOf(caster),
        skillIdx: copiedIdx,
        targetId: allFighters.indexOf(copyTarget),
        aoe: !!copied.aoe
      });
    } catch(e) {
      console.error('shellCopy exec error:', e);
      // Fallback: simple doDamage
      if (copyTarget && copyTarget.alive) await doDamage(caster, copyTarget, copied);
    }
    window.onActionComplete = savedOnAction;
    window.nextAction = savedNext;

    atkEl.classList.remove('attack-anim');
    caster.skills = savedSkills;

    checkDeaths(caster);
    if (checkBattleEnd()) return;
    await sleep(400);
  }
}

// ── LINE TURTLE (线条龟) ─────────────────────────────────
function addInkStack(target, count) {
  const max = 5;
  const before = target._inkStacks || 0;
  target._inkStacks = Math.min(max, before + count);
  const gained = target._inkStacks - before;
  if (gained > 0) {
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, `+${gained}🖊️`, 'passive-num', 300, 0);
    // Ink link: sync stacks to partner
    if (target._inkLink && target._inkLink.partner && target._inkLink.partner.alive) {
      const partner = target._inkLink.partner;
      const pBefore = partner._inkStacks || 0;
      partner._inkStacks = Math.min(max, pBefore + gained);
      const pGained = partner._inkStacks - pBefore;
      if (pGained > 0) {
        const pElId = getFighterElId(partner);
        spawnFloatingNum(pElId, `+${pGained}🖊️🔗`, 'passive-num', 300, 0);
        renderStatusIcons(partner);
      }
    }
  }
  renderStatusIcons(target);
}

async function doLineSketch(attacker, target, skill) {
  const tElId = getFighterElId(target);
  let totalDmg = 0;

  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) break;
    const {isCrit, critMult} = calcCrit(attacker);
    const baseDmg = Math.round(attacker.atk * skill.atkScale);
    const eDef = calcEffDef(attacker, target);
    const defRed = eDef / (eDef + DEF_CONSTANT);
    let dmg = Math.max(1, Math.round(baseDmg * critMult * (1 - defRed)));
    // Ink amplification
    if (target._inkStacks > 0) dmg = Math.round(dmg * (1 + target._inkStacks * 0.05));

    applyRawDmg(attacker, target, dmg);
    totalDmg += dmg;
    addInkStack(target, 1);

    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, (i % 3) * 28);
    await triggerOnHitEffects(attacker, target, dmg);

    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(400);
    if (tEl) tEl.classList.remove('hit-shake');
  }

  addLog(`${attacker.emoji}${attacker.name} <b>素描</b> → ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}物理伤害</span>（墨迹${target._inkStacks}层）`);
}

async function doLineLink(attacker, target, skill) {
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  // Hit primary target
  const {isCrit: isCrit1, critMult: critMult1} = calcCrit(attacker);
  const tElId = getFighterElId(target);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const eDef1 = calcEffDef(attacker, target);
  const defRed1 = eDef1 / (eDef1 + DEF_CONSTANT);
  let dmg1 = Math.max(1, Math.round(baseDmg * critMult1 * (1 - defRed1)));
  if (target._inkStacks > 0) dmg1 = Math.round(dmg1 * (1 + target._inkStacks * 0.05));

  applyRawDmg(attacker, target, dmg1);
  addInkStack(target, 1);
  spawnFloatingNum(tElId, `-${dmg1}`, isCrit1 ? 'crit-dmg' : 'direct-dmg', 0, 0);
  await triggerOnHitEffects(attacker, target, dmg1);
  updateHpBar(target, tElId);

  // Find second target (different alive enemy)
  const second = enemies.find(e => e.alive && e !== target);
  let dmg2 = 0;
  if (second) {
    const {isCrit: isCrit2, critMult: critMult2} = calcCrit(attacker);
    const sElId = getFighterElId(second);
    const eDef2 = calcEffDef(attacker, second);
    const defRed2 = eDef2 / (eDef2 + DEF_CONSTANT);
    dmg2 = Math.max(1, Math.round(baseDmg * critMult2 * (1 - defRed2)));
    if (second._inkStacks > 0) dmg2 = Math.round(dmg2 * (1 + second._inkStacks * 0.05));

    applyRawDmg(attacker, second, dmg2);
    addInkStack(second, 1);
    spawnFloatingNum(sElId, `-${dmg2}`, isCrit2 ? 'crit-dmg' : 'direct-dmg', 0, 0);
    await triggerOnHitEffects(attacker, second, dmg2);
    updateHpBar(second, sElId);

    // Establish ink link between the two
    target._inkLink = { partner: second, turns: skill.duration, transferPct: skill.transferPct };
    second._inkLink = { partner: target, turns: skill.duration, transferPct: skill.transferPct };
    spawnFloatingNum(tElId, '🔗连笔', 'crit-label', 0, -20);
    spawnFloatingNum(sElId, '🔗连笔', 'crit-label', 0, -20);
    renderStatusIcons(target);
    renderStatusIcons(second);

    addLog(`${attacker.emoji}${attacker.name} <b>连笔</b>：连接${target.emoji}${target.name}与${second.emoji}${second.name} ${skill.duration}回合（伤害传递${skill.transferPct}%真实）`);
  } else {
    addLog(`${attacker.emoji}${attacker.name} <b>连笔</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg1}物理伤害</span>+墨迹（无第二目标，无法建立连接）`);
  }
  await sleep(800);
}

async function doLineFinish(attacker, target, skill) {
  const tElId = getFighterElId(target);
  const stacks = target._inkStacks || 0;
  const {isCrit, critMult} = calcCrit(attacker);

  // Base normal damage
  const baseNormal = Math.round(attacker.atk * skill.baseScale);
  const eDef = calcEffDef(attacker, target);
  const defRed = eDef / (eDef + DEF_CONSTANT);
  // Ink amplification on base hit
  let normalDmg = Math.max(1, Math.round(baseNormal * critMult * (1 - defRed)));
  if (stacks > 0) normalDmg = Math.round(normalDmg * (1 + stacks * 0.05));

  // Pierce damage per stack (ignores DEF)
  const pierceDmg = Math.round(attacker.atk * skill.perStackScale * stacks * critMult);

  const totalDmg = normalDmg + pierceDmg;
  applyRawDmg(attacker, target, totalDmg);

  // Floating numbers
  if (stacks > 0) spawnFloatingNum(tElId, `墨迹×${stacks}引爆!`, 'crit-label', 0, -20);
  spawnFloatingNum(tElId, `-${normalDmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0);
  if (pierceDmg > 0) spawnFloatingNum(tElId, `-${pierceDmg}`, isCrit ? 'crit-pierce' : 'pierce-dmg', 100, 0);
  await triggerOnHitEffects(attacker, target, totalDmg);

  const tEl = document.getElementById(tElId);
  if (tEl) tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);

  // Clear ink stacks
  target._inkStacks = 0;
  renderStatusIcons(target);
  // If linked partner, also clear partner's stacks? No — only clear targeted stacks.

  addLog(`${attacker.emoji}${attacker.name} <b>画龙点睛</b> → ${target.emoji}${target.name}：<span class="log-direct">${normalDmg}物理</span> + <span class="log-pierce">${pierceDmg}真实</span>（${stacks}层墨迹引爆）`);
  await sleep(800);
}

// ── GHOST TURTLE (幽灵龟) ────────────────────────────────
async function doGhostTouch(attacker, target, skill) {
  const tElId = getFighterElId(target);
  const {isCrit, critMult} = calcCrit(attacker);
  // Normal damage portion
  const normalBase = Math.round(attacker.atk * skill.normalScale);
  const eDef = calcEffDef(attacker, target);
  const defRed = eDef / (eDef + DEF_CONSTANT);
  let normalDmg = Math.max(1, Math.round(normalBase * critMult * (1 - defRed)));
  // Ink amplification
  if (target._inkStacks > 0) normalDmg = Math.round(normalDmg * (1 + target._inkStacks * 0.05));
  // Pierce damage portion (ignores DEF)
  const pierceDmg = Math.round(attacker.atk * skill.pierceScale * critMult);
  const totalDmg = normalDmg + pierceDmg;

  applyRawDmg(attacker, target, totalDmg);
  if (normalDmg > 0) spawnFloatingNum(tElId, `-${normalDmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0);
  if (pierceDmg > 0) spawnFloatingNum(tElId, `-${pierceDmg}`, isCrit ? 'crit-pierce' : 'pierce-dmg', 100, 0);
  await triggerOnHitEffects(attacker, target, totalDmg);

  const tEl = document.getElementById(tElId);
  if (tEl) tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(700);
  if (tEl) tEl.classList.remove('hit-shake');

  addLog(`${attacker.emoji}${attacker.name} <b>幽魂触碰</b> → ${target.emoji}${target.name}：<span class="log-direct">${normalDmg}物理</span> + <span class="log-pierce">${pierceDmg}真实</span>`);
}

async function doGhostPhase(caster, skill) {
  const fElId = getFighterElId(caster);
  // Shield
  const shieldAmt = Math.round(caster.atk * skill.shieldScale);
  caster.shield += shieldAmt;
  spawnFloatingNum(fElId, `+${shieldAmt}🛡`, 'shield-num', 0, 0);
  // Dodge buff
  caster.buffs.push({ type:'dodge', value:skill.dodgePct, turns:skill.dodgeTurns + 1 }); // +1 because processBuffs ticks at start
  spawnFloatingNum(fElId, `👻虚化！闪避${skill.dodgePct}%`, 'passive-num', 200, 0);
  updateHpBar(caster, fElId);
  renderStatusIcons(caster);
  addLog(`${caster.emoji}${caster.name} <b>虚化</b>：<span class="log-shield">+${shieldAmt}护盾</span> + <span class="log-passive">${skill.dodgePct}%闪避 ${skill.dodgeTurns}回合</span>`);
  await sleep(800);
}

async function doGhostStorm(attacker, target, skill) {
  const tElId = getFighterElId(target);
  let totalPierce = 0;

  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) break;
    const {isCrit, critMult} = calcCrit(attacker);
    const pierceDmg = Math.round(attacker.atk * skill.pierceScale * critMult);
    // Ink amplification
    const finalDmg = target._inkStacks > 0 ? Math.round(pierceDmg * (1 + target._inkStacks * 0.05)) : pierceDmg;

    applyRawDmg(attacker, target, finalDmg, true);
    totalPierce += finalDmg;
    spawnFloatingNum(tElId, `-${finalDmg}`, isCrit ? 'crit-true' : 'true-dmg', 0, (i % 3) * 28);
    await triggerOnHitEffects(attacker, target, finalDmg);

    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(400);
    if (tEl) tEl.classList.remove('hit-shake');
  }

  // Apply DoT
  if (target.alive) {
    const dotDmg = Math.round(attacker.atk * skill.dotScale);
    target.buffs.push({ type:'dot', value:dotDmg, turns:skill.dotTurns, sourceSide: attacker.side });
    spawnFloatingNum(tElId, '👻诅咒', 'debuff-label', 200, -10);
    renderStatusIcons(target);
  }

  addLog(`${attacker.emoji}${attacker.name} <b>灵魂风暴</b> ${skill.hits}段 → ${target.emoji}${target.name}：<span class="log-pierce">${totalPierce}真实</span> + 诅咒${skill.dotTurns}回合`);
}

// ── ICE SHIELD (寒冰龟) ─────────────────────────────────
async function doIceShield(caster, skill) {
  const fElId = getFighterElId(caster);
  // Self: 140% ATK permanent shield
  const selfShield = Math.round(caster.atk * skill.selfScale);
  caster.shield += selfShield;
  spawnFloatingNum(fElId, `+${selfShield}🛡`, 'shield-num', 0, 0);
  updateHpBar(caster, fElId);
  // Ally: 80% ATK permanent shield
  const allies = (caster.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive && a !== caster);
  for (const a of allies) {
    const allyShield = Math.round(caster.atk * skill.allyScale);
    a.shield += allyShield;
    const aElId = getFighterElId(a);
    spawnFloatingNum(aElId, `+${allyShield}🛡`, 'shield-num', 0, 0);
    updateHpBar(a, aElId);
  }
  addLog(`${caster.emoji}${caster.name} <b>冰盾</b>：自身 <span class="log-shield">+${selfShield}护盾</span>，友方 <span class="log-shield">+${Math.round(caster.atk * skill.allyScale)}护盾</span>`);
  await sleep(800);
}

// ── BAMBOO TURTLE (竹叶龟) ───────────────────────────────
async function doBambooLeaf(attacker, target, skill) {
  const tElId = getFighterElId(target);
  let totalDmg = 0;
  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) break;
    const {isCrit, critMult} = calcCrit(attacker);
    const baseDmg = Math.round(attacker.atk * skill.atkScale) + Math.round(attacker.maxHp * skill.selfHpPct / 100);
    const eDef = calcEffDef(attacker, target);
    const defRed = eDef / (eDef + DEF_CONSTANT);
    const dmg = Math.max(1, Math.round(baseDmg * critMult * (1 - defRed)));
    applyRawDmg(attacker, target, dmg);
    totalDmg += dmg;
    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, (i % 3) * 28);
    await triggerOnHitEffects(attacker, target, dmg);
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(400);
    if (tEl) tEl.classList.remove('hit-shake');
  }
  addLog(`${attacker.emoji}${attacker.name} <b>一叶刃</b> ${skill.hits}段 → ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}伤害</span>`);
}

async function doBambooHeal(caster, skill) {
  const fElId = getFighterElId(caster);
  const allies = (caster.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive && a !== caster);
  if (allies.length > 0) {
    // Heal self 15%
    const healAmt = Math.round(caster.maxHp * skill.healPct / 100);
    const before = caster.hp;
    caster.hp = Math.min(caster.maxHp, caster.hp + healAmt);
    const actual = Math.round(caster.hp - before);
    if (actual > 0) spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 0, 0);
    updateHpBar(caster, fElId);
    // Shield ally 15% of caster's maxHP
    for (const a of allies) {
      const shieldAmt = Math.round(caster.maxHp * skill.shieldPct / 100);
      a.buffs.push({ type:'hidingShield', shieldVal:shieldAmt, healPct:0, turns:skill.shieldTurns + 1 });
      a.shield += shieldAmt;
      const aElId = getFighterElId(a);
      spawnFloatingNum(aElId, `+${shieldAmt}🛡`, 'shield-num', 0, 0);
      updateHpBar(a, aElId);
    }
    addLog(`${caster.emoji}${caster.name} <b>自然恢复</b>：<span class="log-heal">+${actual}HP</span>，队友获得 <span class="log-shield">${Math.round(caster.maxHp * skill.shieldPct / 100)}护盾</span> ${skill.shieldTurns}回合`);
  } else {
    // No ally: heal self 23%
    const healAmt = Math.round(caster.maxHp * skill.soloHealPct / 100);
    const before = caster.hp;
    caster.hp = Math.min(caster.maxHp, caster.hp + healAmt);
    const actual = Math.round(caster.hp - before);
    if (actual > 0) spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 0, 0);
    updateHpBar(caster, fElId);
    addLog(`${caster.emoji}${caster.name} <b>自然恢复</b>（无队友）：<span class="log-heal">+${actual}HP</span>`);
  }
  await sleep(800);
}

function spawnBambooOrb(fromElId, toElId) {
  const fromEl = document.getElementById(fromElId);
  const toEl = document.getElementById(toElId);
  if (!fromEl || !toEl) return;
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();
  const sx = fromRect.left + fromRect.width / 2;
  const sy = fromRect.top + fromRect.height / 2;
  const ex = toRect.left + toRect.width / 2;
  const ey = toRect.top + toRect.height / 2;
  // Arc height: bigger arc for longer distances
  const dist = Math.sqrt((ex-sx)**2 + (ey-sy)**2);
  const arcH = Math.max(60, dist * 0.4);

  // Burst flash at spawn point
  const flash = document.createElement('div');
  flash.className = 'bamboo-burst';
  flash.style.left = (sx - 25) + 'px';
  flash.style.top = (sy - 25) + 'px';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 400);

  const orb = document.createElement('div');
  orb.className = 'bamboo-orb';
  document.body.appendChild(orb);

  const duration = 650;
  const start = performance.now();
  function tick(now) {
    let t = Math.min(1, (now - start) / duration);
    // Ease: slow start, fast middle, slow end
    const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    // Position along path
    const x = sx + (ex - sx) * ease;
    // Parabolic arc using ease for symmetric curve
    const arc = -4 * arcH * ease * (ease - 1);
    const y = sy + (ey - sy) * ease - arc;
    // Scale: burst at start, grow in middle, shrink at end
    const burstScale = t < 0.08 ? 2.0 - (t / 0.08) * 0.8 : 1;
    const arcScale = 1 + 0.5 * Math.sin(t * Math.PI);
    const scale = t < 0.08 ? burstScale : arcScale;
    orb.style.left = (x - 11) + 'px';
    orb.style.top = (y - 11) + 'px';
    orb.style.transform = `scale(${scale})`;
    orb.style.opacity = t > 0.85 ? (1 - t) / 0.15 : 1;
    // Trail particles every ~40ms
    if (t > 0.05 && Math.random() < 0.5) {
      const p = document.createElement('div');
      p.className = 'bamboo-trail';
      p.style.left = (x - 3 + (Math.random()-0.5)*8) + 'px';
      p.style.top = (y - 3 + (Math.random()-0.5)*8) + 'px';
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 350);
    }
    if (t < 1) requestAnimationFrame(tick);
    else orb.remove();
  }
  requestAnimationFrame(tick);
}

async function doBambooChargeAttack(attacker, target) {
  const p = attacker.passive;
  const fElId = getFighterElId(attacker);
  const tElId = getFighterElId(target);

  // ── 蓄力停顿 ──
  spawnFloatingNum(fElId, '🎋蓄力...', 'passive-num', 0, -20);
  try { sfxBambooCharge(); } catch(e) {}
  await sleep(1000);

  // ── 打出强化普攻（魔法伤害，受魔抗减免） ──
  const rawDmg = Math.round(attacker.atk * p.atkPct / 100) + Math.round(attacker.maxHp * p.selfHpPct / 100);
  const effMr = calcEffDef(attacker, target, 'magic');
  const mrRed = effMr / (effMr + DEF_CONSTANT);
  const {isCrit, critMult} = calcCrit(attacker);
  const magicDmg = Math.max(1, Math.round(rawDmg * critMult * (1 - mrRed)));
  applyRawDmg(attacker, target, magicDmg);
  try { sfxBambooHit(); } catch(e) {}
  spawnFloatingNum(tElId, '🎋充能!', 'crit-label', 0, -20);
  spawnFloatingNum(tElId, `-${magicDmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0, {atkSide: attacker.side, amount: magicDmg});
  const tEl = document.getElementById(tElId);
  if (tEl) tEl.classList.add('hit-shake');
  await triggerOnHitEffects(attacker, target, magicDmg);
  updateHpBar(target, tElId);
  // ── 打中同时绿球飞出 ──
  spawnBambooOrb(tElId, fElId);
  await sleep(300);
  if (tEl) tEl.classList.remove('hit-shake');
  // 等绿球到达（飞行650ms，已等300ms）
  await sleep(350);

  // ── 绿球到达：立刻回血+血条变化 ──
  const healAmt = Math.round(attacker.maxHp * p.healSelfHpPct / 100);
  const hpGain = Math.round(attacker.atk * p.hpGainAtkPct / 100);
  const before = attacker.hp;
  attacker.maxHp += hpGain;
  attacker._bambooGainedHp = (attacker._bambooGainedHp || 0) + hpGain;
  attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmt + hpGain);
  const actualHeal = Math.round(attacker.hp - before);
  spawnFloatingNum(fElId, `+${actualHeal}`, 'heal-num', 0, 0);
  spawnFloatingNum(fElId, `+${hpGain}最大HP`, 'passive-num', 0, 20);
  updateHpBar(attacker, fElId);

  // Mark as fired so icon stops glowing
  attacker._bambooFired = true;
  renderStatusIcons(attacker);

  addLog(`${attacker.emoji}${attacker.name} <b>竹编充能</b> → ${target.emoji}${target.name}：<span class="log-magic">${magicDmg}魔法</span>${isCrit?' <span class="log-crit">暴击</span>':''} <span class="log-heal">+${actualHeal}HP</span> <span class="log-passive">永久+${hpGain}最大HP</span>`);
  await sleep(400);
}

// ── DIAMOND TURTLE (钻石龟) ──────────────────────────────
async function doDiamondFortify(caster, skill) {
  const fElId = getFighterElId(caster);
  // Shield: 15% maxHP
  const shieldAmt = Math.round(caster.maxHp * skill.shieldHpPct / 100);
  caster.shield += shieldAmt;
  spawnFloatingNum(fElId, `+${shieldAmt}🛡`, 'shield-num', 0, 0);
  // Def buff: 20%ATK (diamondStructure passive will amplify in recalcStats)
  const defGain = Math.round(caster.atk * skill.defUpAtkPct / 100);
  caster.buffs.push({ type:'defUp', value:defGain, turns:skill.defUpTurns + 1 });
  recalcStats();
  spawnFloatingNum(fElId, `+${defGain}防`, 'passive-num', 200, 0);
  updateHpBar(caster, fElId);
  renderStatusIcons(caster);
  updateFighterStats(caster, fElId);
  addLog(`${caster.emoji}${caster.name} <b>坚不可摧</b>：<span class="log-shield">+${shieldAmt}护盾</span> <span class="log-passive">+${defGain}防御 ${skill.defUpTurns}回合</span>`);
  await sleep(800);
}

async function doDiamondCollide(attacker, target, skill) {
  const tElId = getFighterElId(target);
  const {isCrit, critMult} = calcCrit(attacker);
  const baseDmg = Math.round(attacker.atk * skill.atkScale) + Math.round(attacker.def * skill.defScale) + Math.round(attacker.maxHp * skill.selfHpPct / 100);
  const eDef = calcEffDef(attacker, target);
  const defRed = eDef / (eDef + DEF_CONSTANT);
  const dmg = Math.max(1, Math.round(baseDmg * critMult * (1 - defRed)));
  applyRawDmg(attacker, target, dmg);
  spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0);
  await triggerOnHitEffects(attacker, target, dmg);
  const tEl = document.getElementById(tElId);
  if (tEl) tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  // Track collision count for stun
  const tIdx = allFighters.indexOf(target);
  if (!attacker._diamondCollideCount) attacker._diamondCollideCount = {};
  attacker._diamondCollideCount[tIdx] = (attacker._diamondCollideCount[tIdx] || 0) + 1;
  if (attacker._diamondCollideCount[tIdx] >= skill.stunAfter && target.alive) {
    attacker._diamondCollideCount[tIdx] = 0;
    target.buffs.push({ type:'stun', value:1, turns:2 }); // +1 for processBuffs tick
    spawnFloatingNum(tElId, '💫眩晕!', 'crit-label', 0, -20);
    renderStatusIcons(target);
    addLog(`${target.emoji}${target.name} 被撞晕了！<span class="log-debuff">眩晕1回合</span>`);
  }
  await sleep(700);
  if (tEl) tEl.classList.remove('hit-shake');
  addLog(`${attacker.emoji}${attacker.name} <b>碰撞</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span>`);
}

// ── DICE TURTLE (骰子龟) ────────────────────────────────
async function doDiceAttack(attacker, target, skill) {
  const tElId = getFighterElId(target);
  // Total damage = 100%ATK + 100*critRate
  const totalBase = Math.round(attacker.atk * skill.atkScale) + Math.round(attacker.crit * skill.critBonusMult);
  const perHit = Math.round(totalBase / skill.hits);
  let totalDmg = 0, totalCrits = 0;
  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) break;
    const eDef = calcEffDef(attacker, target);
    const defRed = eDef / (eDef + DEF_CONSTANT);
    let effectiveCrit = attacker.crit;
    let overflowCritDmg = 0;
    if (effectiveCrit > 1.0) { overflowCritDmg = (effectiveCrit - 1.0) * (attacker.passive?.overflowMult || 1.5); effectiveCrit = 1.0; }
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmgPerm || 0) + overflowCritDmg) : 1;
    if (isCrit) totalCrits++;
    const dmg = Math.max(1, Math.round(perHit * critMult * (1 - defRed)));
    applyRawDmg(attacker, target, dmg);
    totalDmg += dmg;

    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, (i%3)*18);
    await triggerOnHitEffects(attacker, target, dmg);
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(400);
    if (tEl) tEl.classList.remove('hit-shake');
  }
  addLog(`${attacker.emoji}${attacker.name} <b>骰子攻击</b> ${skill.hits}段 → ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}伤害</span>${totalCrits > 0 ? ' <span class="log-crit">'+totalCrits+'暴击</span>' : ''}`);
}

async function doDiceAllIn(attacker, skill) {
  const fElId = getFighterElId(attacker);
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  const basePierce = Math.round(attacker.atk * skill.atkScale);
  let totalDmg = 0, totalCrits = 0;
  spawnFloatingNum(fElId, '🎲孤注一掷!', 'crit-label', 0, -20);
  for (const e of enemies) {
    if (!e.alive) continue;
    // Crit check per target
    let effectiveCrit = attacker.crit;
    let overflowCritDmg = 0;
    if (effectiveCrit > 1.0) { overflowCritDmg = (effectiveCrit - 1.0) * (attacker.passive?.overflowMult || 1.5); effectiveCrit = 1.0; }
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmgPerm || 0) + overflowCritDmg) : 1;
    if (isCrit) totalCrits++;
    const pierceDmg = Math.max(1, Math.round(basePierce * critMult));
    applyRawDmg(attacker, e, pierceDmg, true);
    totalDmg += pierceDmg;
    const eElId = getFighterElId(e);
    spawnFloatingNum(eElId, `-${pierceDmg}`, isCrit ? 'crit-true' : 'true-dmg', 0, 0);
    updateHpBar(e, eElId);
    await triggerOnHitEffects(attacker, e, pierceDmg);
    await sleep(300);
  }
  // Lifesteal
  if (skill.lifestealPct && attacker.alive && totalDmg > 0) {
    const heal = Math.round(totalDmg * skill.lifestealPct / 100);
    const before = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
    const actual = Math.round(attacker.hp - before);
    if (actual > 0) {
      spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 200, 0);
      updateHpBar(attacker, fElId);
    }
  }
  addLog(`${attacker.emoji}${attacker.name} <b>孤注一掷</b>：全体敌方 <span class="log-pierce">${totalDmg}真实</span>${totalCrits > 0 ? ' <span class="log-crit">'+totalCrits+'暴击</span>' : ''} + 10%吸血`);
  await sleep(500);
}

async function doDiceFate(caster, skill) {
  const fElId = getFighterElId(caster);
  const critGain = skill.minCrit + Math.floor(Math.random() * (skill.maxCrit - skill.minCrit + 1));
  caster.buffs.push({ type:'diceFateCrit', value:critGain, turns:skill.duration + 1 });
  recalcStats();
  spawnFloatingNum(fElId, `🎲+${critGain}%暴击!`, 'crit-label', 0, -20);
  renderStatusIcons(caster);
  updateFighterStats(caster, fElId);
  addLog(`${caster.emoji}${caster.name} <b>命运骰子</b>：<span class="log-passive">+${critGain}%暴击率 ${skill.duration}回合</span>${caster.crit > 1 ? ' (溢出' + Math.round((caster.crit-1)*100) + '%→' + Math.round((caster.crit-1)*150) + '%爆伤)' : ''}`);
  await sleep(800);
}

// ── CHEST TURTLE (宝箱龟) ───────────────────────────────
async function doChestOpen(caster, skill) {
  const fElId = getFighterElId(caster);
  // Heal 25% maxHP
  const healAmt = Math.round(caster.maxHp * skill.healPct / 100);
  const before = caster.hp;
  caster.hp = Math.min(caster.maxHp, caster.hp + healAmt);
  const actual = Math.round(caster.hp - before);
  if (actual > 0) spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 0, 0);
  // Shield 80%ATK
  const shieldAmt = Math.round(caster.atk * skill.shieldAtkScale);
  caster.shield += shieldAmt;
  spawnFloatingNum(fElId, `+${shieldAmt}🛡`, 'shield-num', 200, 0);
  updateHpBar(caster, fElId);
  addLog(`${caster.emoji}${caster.name} <b>开箱惊喜</b>：<span class="log-heal">+${actual}HP</span> <span class="log-shield">+${shieldAmt}护盾</span>`);
  await sleep(800);
}

// ── ENERGY WAVE (龟壳 储能波击) ──────────────────────────
async function processEnergyWave() {
  for (const f of allFighters) {
    if (!f.alive || !f.passive || f.passive.type !== 'auraAwaken' || !f.passive.energyStore) continue;
    if (turnNum < f.passive.energyReleaseTurn || turnNum % f.passive.energyReleaseTurn !== 0) continue;
    if (!f._storedEnergy || f._storedEnergy <= 0) continue;
    const stored = f._storedEnergy;
    const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
    // Wave damage to all enemies
    const waveDmg = Math.round(stored * f.passive.energyDmgScale * f.atk);
    for (const e of enemies) {
      applyRawDmg(f, e, waveDmg, false);
      const eElId = getFighterElId(e);
      spawnFloatingNum(eElId, `-${waveDmg}⚡`, 'pierce-dmg', 0, 0);
      updateHpBar(e, eElId);
    }
    // Shield for self
    const shieldAmt = Math.round(stored * f.passive.energyShieldScale * f.atk);
    f.shield += shieldAmt;
    const fElId = getFighterElId(f);
    spawnFloatingNum(fElId, `+${shieldAmt}🛡`, 'shield-num', 0, 0);
    updateHpBar(f, fElId);
    // Log
    addLog(`${f.emoji}${f.name} <span class="log-passive">⚡储能波击！储存${stored}能量 → 全体${waveDmg}伤害 + ${shieldAmt}护盾</span>`);
    // Clear stored energy
    f._storedEnergy = 0;
    checkDeaths(f);
    if (checkBattleEnd()) return;
    await sleep(800);
  }
}


