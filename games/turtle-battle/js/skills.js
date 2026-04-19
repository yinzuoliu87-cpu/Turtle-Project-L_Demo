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
    spawnFloatingNum(fElId, `<img src="assets/battle/card-draw-icon.png" style="width:16px;height:16px;vertical-align:middle">回复牌`, 'passive-num', 0, -20);
    if (actual > 0) spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 200, 0);
    spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 400, 0);
    updateHpBar(caster, fElId);
    addLog(`${caster.emoji}${caster.name} <b>抽牌</b>：<img src="assets/battle/card-draw-icon.png" style="width:16px;height:16px;vertical-align:middle">回复牌！<span class="log-heal">+${actual}HP</span> <span class="log-shield">+${shieldAmt}护盾</span>`);
  } else if (roll === 1) {
    // 2: Bomb card — 0.9ATK to all enemies, triggers multi-hit
    spawnFloatingNum(fElId, `<img src="assets/battle/card-draw-icon.png" style="width:16px;height:16px;vertical-align:middle">炸弹牌`, 'crit-label', 0, -20);
    const enemies = (caster.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
    const baseDmg = Math.round(caster.atk * 0.9);
    for (const e of enemies) {
      const eDef = calcEffDef(caster, e);
            const dmg = Math.max(1, Math.round(baseDmg * calcDmgMult(eDef)));
      applyRawDmg(caster, e, dmg, false, false, 'physical');
      const eId = getFighterElId(e);
      spawnFloatingNum(eId, `-${dmg}`, 'direct-dmg', 0, 0);
      updateHpBar(e, eId);
      await triggerOnHitEffects(caster, e, dmg);
      await tryGamblerMultiHit(caster, e, eId);
    }
    addLog(`${caster.emoji}${caster.name} <b>抽牌</b>：<img src="assets/battle/card-draw-icon.png" style="width:16px;height:16px;vertical-align:middle">炸弹牌！对全体敌方 <span class="log-direct">${baseDmg}伤害</span>`);
  } else {
    // 3: Self buff — +15%ATK, +25%crit, +15%critDmg, 20% dmg→pierce, 3 turns
    const atkGain = Math.round(caster.baseAtk * 0.15);
    caster.buffs.push({ type:'atkUp', value:atkGain, turns:3 });
    caster.crit += 0.25;
    caster._extraCritDmgPerm = (caster._extraCritDmgPerm || 0) + 0.15;
    caster.buffs.push({ type:'gamblerPierceConvert', value:20, turns:3 });
    spawnFloatingNum(fElId, `<img src="assets/battle/card-draw-icon.png" style="width:16px;height:16px;vertical-align:middle">强化牌`, 'crit-label', 0, -20);
    spawnFloatingNum(fElId, `+ATK+暴击+爆伤+转真实`, 'passive-num', 200, 0);
    recalcStats();
    renderStatusIcons(caster);
    updateFighterStats(caster, fElId);
    addLog(`${caster.emoji}${caster.name} <b>抽牌</b>：<img src="assets/battle/card-draw-icon.png" style="width:16px;height:16px;vertical-align:middle">强化牌！<span class="log-passive">+15%ATK +25%暴击 +15%爆伤 20%伤害转真实 3回合</span>`);
  }
  await sleep(1000);
}

async function doGamblerBet(attacker, target, skill) {
  // Must have >40% HP
  if (attacker.hp / attacker.maxHp <= 0.4) {
    addLog(`${attacker.emoji}${attacker.name} <b>赌注</b>：HP不足40%，无法使用！`);
    await sleep(1000);
    return;
  }
  // Cost 40% HP directly (not through shield)
  const hpCost = Math.round(attacker.hp * skill.hpCostPct / 100);
  attacker.hp -= hpCost;
  const fElId = getFighterElId(attacker);
  spawnFloatingNum(fElId, `-${hpCost}HP`, 'direct-dmg', 0, 0);
  updateHpBar(attacker, fElId);
  addLog(`${attacker.emoji}${attacker.name} <b>赌注！</b>消耗 <span class="log-direct">${hpCost}HP</span>！`);
  await sleep(500);

  // Temporarily boost multi-hit chance by 20% (only for this skill)
  attacker._multiBonus = (attacker._multiBonus || 0) + skill.multiBonus;

  // 6 hits — consumed HP split equally as physical damage per hit
  const tElId = getFighterElId(target);
  const dmgPer = Math.round(hpCost / skill.hits);
  let totalDmg = 0;

  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) continue; // keep animating remaining hits
    const {isCrit, critMult} = calcCrit(attacker);
    const eDef = calcEffDef(attacker, target);
        const dmg = Math.max(1, Math.round(dmgPer * critMult * calcDmgMult(eDef)));
    applyRawDmg(attacker, target, dmg, false, false, 'physical');
    totalDmg += dmg;
    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, (i % 4) * 28, { atkSide: attacker.side, amount: dmg });
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await triggerOnHitEffects(attacker, target, dmg);
    await sleep(500);
    tEl.classList.remove('hit-shake');
    await sleep(100);
    // Multi-hit passive (boosted to 60% for this skill)
    await tryGamblerMultiHit(attacker, target, tElId);
  }
  addLog(`→ ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}物理伤害</span>（消耗${hpCost}HP÷${skill.hits}段）`);

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
    if (!target.alive) continue; // keep animating remaining hits
    const {isCrit, critMult} = calcCrit(attacker);
    const baseDmg = Math.round(attacker.atk * skill.atkScale);
    const isPierceHit = (i % 2 === 1); // odd index = pierce
    let dmg;
    if (isPierceHit) {
      dmg = Math.round(baseDmg * critMult); // pierce: no DEF reduction
      applyRawDmg(attacker, target, dmg, true, false, 'true');
      spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-pierce' : 'pierce-dmg', 0, (i%4)*18);
    } else {
      const eDef = calcEffDef(attacker, target);
            dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(eDef)));
      applyRawDmg(attacker, target, dmg, false, false, 'magic');
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
    if (pet && pet.meleeSkills) {
      // Use paired melee skills matching equipped ranged skill indices
      const equippedIdxs = caster._equippedIdxs || pet.defaultSkills || [0,1,2];
      const pairedMelee = equippedIdxs
        .filter(i => i < pet.meleeSkills.length && !pet.meleeSkills[i].passiveSkill)
        .map(i => ({...pet.meleeSkills[i], cdLeft: pet.meleeSkills[i].type === 'twoHeadSwitch' ? skill.cd : 0}));
      caster.skills = pairedMelee.length ? pairedMelee : pet.meleeSkills.map(s => ({...s, cdLeft: 0}));
    }
    caster._twoHeadForm = 'melee';
    caster.name = '双头龟(近战)';
    updateHpBar(caster, fElId);
    renderFighterCard(caster, fElId);
    spawnFloatingNum(fElId, '切换近战!', 'crit-label', 0, -20);
    spawnFloatingNum(fElId, `+${hpGain}HP +${defGain}防 -${atkLoss}攻 +${shieldGain}`, 'passive-num', 200, 0);
    addLog(`${caster.emoji}${caster.name} <span class="log-passive">切换近战形态！+${hpGain}HP +${defGain}防 -${atkLoss}攻 +${shieldGain}护盾</span>`);
    // Switch attack: deal damage to lowest HP enemy on melee switch
    if (skill.switchAtkScale) {
      const enemies = getAliveEnemiesWithSummons(caster.side);
      const switchTarget = enemies.length ? enemies.sort((a,b) => a.hp - b.hp)[0] : null;
      if (switchTarget) {
        await sleep(300);
        const switchDmg = Math.round(caster.atk * skill.switchAtkScale);
        const eDef = calcEffDef(caster, switchTarget);
                const dmg = Math.max(1, Math.round(switchDmg * calcDmgMult(eDef)));
        applyRawDmg(caster, switchTarget, dmg, false, false, 'physical');
        const tElId = getFighterElId(switchTarget);
        spawnFloatingNum(tElId, `-${dmg}`, 'direct-dmg', 0, 0, { atkSide: caster.side, amount: dmg });
        await triggerOnHitEffects(caster, switchTarget, dmg);
        updateHpBar(switchTarget, tElId);
        addLog(`→ ${switchTarget.emoji}${switchTarget.name}：<span class="log-direct">${dmg}物理伤害</span>`);
      }
    }
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
            const dmg = Math.max(1, Math.round(baseDmg * calcDmgMult(eDef)));
      applyRawDmg(caster, target, dmg, false, false, 'physical');
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
// Two-head hammer: 140%ATK physical + 50% damage as permanent shield
async function doTwoHeadHammer(attacker, target, skill) {
  const {isCrit, critMult} = calcCrit(attacker);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const eDef = calcEffDef(attacker, target);
    const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(eDef)));
  applyRawDmg(attacker, target, dmg, false, false, 'physical');
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, { atkSide: attacker.side, amount: dmg });
  await triggerOnHitEffects(attacker, target, dmg);
  const tEl = document.getElementById(tElId);
  if (tEl) tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(500);
  if (tEl) tEl.classList.remove('hit-shake');
  // Shield from damage
  if (skill.shieldFromDmgPct && attacker.alive) {
    const shieldAmt = Math.round(dmg * skill.shieldFromDmgPct / 100);
    attacker.shield += shieldAmt;
    const fElId = getFighterElId(attacker);
    spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 200, 0);
    updateHpBar(attacker, fElId);
  }
  addLog(`${attacker.emoji}${attacker.name} <b>锤击</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span>`);
}

async function doTwoHeadAbsorb(attacker, target, skill) {
  const {isCrit, critMult} = calcCrit(attacker);
  const baseDmg = Math.round(attacker.atk * skill.atkScale) + Math.round(target.maxHp * (skill.hpPct || 0) / 100);
  const eDef = calcEffDef(attacker, target);
    const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(eDef)));
  applyRawDmg(attacker, target, dmg, false, false, 'physical');
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, { atkSide: attacker.side, amount: dmg });
  await triggerOnHitEffects(attacker, target, dmg);
  const tEl = document.getElementById(tElId);
  if (tEl) tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(700);
  if (tEl) tEl.classList.remove('hit-shake');
  // Heal: 40%ATK + 18% lost HP
  if (attacker.alive) {
    const atkHeal = Math.round(attacker.atk * (skill.healAtkPct || 0) / 100);
    const lostHp = attacker.maxHp - attacker.hp;
    const lostHeal = Math.round(lostHp * (skill.healLostPct || 0) / 100);
    const totalHeal = atkHeal + lostHeal;
    const actual = applyHeal(attacker, totalHeal);
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
    const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(eDef)));
  applyRawDmg(attacker, target, dmg, false, false, 'physical');
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
  const ALLY_TYPES = new Set(['heal','shield','bubbleShield','ninjaTrap','angelBless']);

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
  let raw = Math.round(attacker.atk * skill.atkScale);
  // Add target lost HP% bonus
  if (skill.lostHpPct) raw += Math.round((target.maxHp - target.hp) * skill.lostHpPct / 100);

  let effectiveCrit = attacker.crit;
  if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
    effectiveCrit += attacker.passive.pct / 100;
  }
  const isCrit = Math.random() < effectiveCrit;
  const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;

  const effectiveDef = calcEffDef(attacker, target);
    let dmg = Math.max(1, Math.round(raw * critMult * calcDmgMult(effectiveDef)));

  // Passive: basicTurtle bonus
  if (attacker.passive && attacker.passive.type === 'basicTurtle' && attacker.passive.bonusMap) {
    const bonusPct = attacker.passive.bonusMap[target.rarity] || 0;
    if (bonusPct > 0) dmg = Math.round(dmg * (1 + bonusPct / 100));
  }
  // Passive: frostAura bonus
  if (attacker.passive && attacker.passive.type === 'frostAura' && attacker.passive.bonusTargets && attacker.passive.bonusTargets.includes(target.id)) {
    dmg = Math.round(dmg * (1 + attacker.passive.bonusDmgPct / 100));
  }

  applyRawDmg(attacker, target, dmg, false, false, 'physical');


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
    spawnFloatingNum(aElId, `+${shieldGain}`, 'shield-num', 0, 0);
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
        let dmg = Math.max(1, Math.round(perHit * critMult * calcDmgMult(effectiveDef)));

    // Passive: basicTurtle bonus
    if (attacker.passive && attacker.passive.type === 'basicTurtle' && attacker.passive.bonusMap) {
      const bonusPct = attacker.passive.bonusMap[target.rarity] || 0;
      if (bonusPct > 0) dmg = Math.round(dmg * (1 + bonusPct / 100));
    }

    applyRawDmg(attacker, target, dmg, false, false, 'physical', false, true);
    totalDmg += dmg;

    const yOff = (i % 4) * 32;

    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 80, yOff);
    updateHpBar(target, tElId);
    await triggerOnHitEffects(attacker, target, dmg);
    triggerThunderShell(attacker);

    const tEl = document.getElementById(tElId);
    if (tEl) { tEl.classList.add('hit-shake'); }
    await sleep(350);
    if (tEl) { tEl.classList.remove('hit-shake'); }
    await sleep(100);

    // No in-loop checkDeaths — pending-death targets stay in pool (alive=true)
    // so later random hits can still land on them. Deaths resolve after action.
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
  
  for (let i = 0; i < hits; i++) {
    if (!target.alive) continue; // keep animating remaining hits

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

    const isPhysical = (i % 2 === 0); // index 0,2,4 = physical; index 1,3,5 = magic
    const raw = Math.round(perHit);
    let dmg;
    const yOff = (i % 4) * 32;

    if (isPhysical) {
      dmg = Math.max(1, Math.round(raw * critMult * calcDmgMult(effectiveDef)));
      if (attacker.passive && attacker.passive.type === 'frostAura' && attacker.passive.bonusTargets && attacker.passive.bonusTargets.includes(target.id)) {
        dmg = Math.round(dmg * (1 + attacker.passive.bonusDmgPct / 100));
      }
      applyRawDmg(attacker, target, dmg, false, false, 'physical');
      totalNormal += dmg;
      spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, yOff, {atkSide: attacker.side, amount: dmg});
    } else {
      const effMr = calcEffDef(attacker, target, 'magic');
            dmg = Math.max(1, Math.round(raw * critMult * calcDmgMult(effMr)));
      if (attacker.passive && attacker.passive.type === 'frostAura' && attacker.passive.bonusTargets && attacker.passive.bonusTargets.includes(target.id)) {
        dmg = Math.round(dmg * (1 + attacker.passive.bonusDmgPct / 100));
      }
      applyRawDmg(attacker, target, dmg, false, false, 'magic');
      totalPierce += dmg;
      spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, yOff, {atkSide: attacker.side, amount: dmg});
    }

    await triggerOnHitEffects(attacker, target, dmg);

    // Judgement passive — magic damage reduced by MR
    if (attacker.passive && attacker.passive.type === 'judgement' && target.alive) {
      const judgeRaw = Math.round(target.hp * attacker.passive.hpPct / 100);
      const jMr = calcEffDef(attacker, target, 'magic');
            const judgeReduced = Math.max(1, Math.round(judgeRaw * calcDmgMult(jMr) * critMult));
      applyRawDmg(attacker, target, judgeReduced, false, false, 'magic');
      totalNormal += judgeReduced;
      spawnFloatingNum(tElId, `-${judgeReduced}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, yOff - 20, {atkSide: attacker.side, amount: judgeReduced});
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
  const hits = skill.hits || 10;
  const perHit = Math.round(attacker.atk * skill.atkScale);
  let totalDmg = 0;

  // Apply mrDown FIRST before damage
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    if (skill.mrDown) {
      const eElId = getFighterElId(enemy);
      const existing = enemy.buffs.find(b => b.type === 'mrDown');
      if (existing) { existing.value = Math.max(existing.value, skill.mrDown.pct); existing.turns = Math.max(existing.turns, skill.mrDown.turns); }
      else enemy.buffs.push({ type:'mrDown', value:skill.mrDown.pct, turns:skill.mrDown.turns });
      spawnFloatingNum(eElId, `⬇️魔抗-${skill.mrDown.pct}%`, 'debuff-label', 0, -10);
      renderStatusIcons(enemy);
    }
  }
  recalcStats();
  await sleep(500);

  // Then deal damage simultaneously to all enemies, one tick at a time
  for (let h = 0; h < hits; h++) {
    if (battleOver) break;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      let dmg = perHit;
      if (attacker.passive && attacker.passive.type === 'frostAura' && attacker.passive.bonusTargets && attacker.passive.bonusTargets.includes(enemy.id)) {
        dmg = Math.round(dmg * (1 + attacker.passive.bonusDmgPct / 100));
      }
      const {isCrit, critMult} = calcCrit(attacker);
      const effMr = calcEffDef(attacker, enemy, 'magic');
            dmg = Math.max(1, Math.round(dmg * critMult * calcDmgMult(effMr)));
      applyRawDmg(attacker, enemy, dmg, false, false, 'magic');
      totalDmg += dmg;
      const eElId = getFighterElId(enemy);
      spawnFloatingNum(eElId, `-${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, (h % 3) * 28, {atkSide: attacker.side, amount: dmg});
      await triggerOnHitEffects(attacker, enemy, dmg);
      const eEl = document.getElementById(eElId);
      if (eEl) eEl.classList.add('hit-shake');
      updateHpBar(enemy, eElId);
    }
    await sleep(350);
    for (const enemy of enemies) {
      const eEl = document.getElementById(getFighterElId(enemy));
      if (eEl) eEl.classList.remove('hit-shake');
    }
  }
  addLog(`${attacker.emoji}${attacker.name} <b>冰霜</b> ⬇️魔抗-${skill.mrDown.pct}% + 全体${hits}段：<span class="log-magic">${totalDmg}魔法伤害</span>`);
}

// ── ANGEL TURTLE SKILLS ───────────────────────────────────
async function doAngelBless(caster, target, skill) {
  const shieldAmt = Math.round(caster.atk * skill.shieldScale);
  const defGain = Math.round(caster.atk * skill.defBoostScale);
  target.shield += shieldAmt;
  target.buffs.push({ type:'defUp', value:defGain, turns:skill.defBoostTurns });
  target.buffs.push({ type:'mrUp', value:defGain, turns:skill.defBoostTurns });
  recalcStats();
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `+${shieldAmt}`, 'shield-num', 0, 0);
  spawnFloatingNum(tElId, `+${defGain}护甲&魔抗`, 'passive-num', 300, 0);
  updateHpBar(target, tElId);
  updateFighterStats(target, tElId);
  renderStatusIcons(target);

  addLog(`${caster.emoji}${caster.name} <b>祝福</b> → ${target.emoji}${target.name}：<span class="log-shield">+${shieldAmt}护盾</span>(${skill.shieldTurns}回合) + <span class="log-passive">护甲&魔抗+${defGain}</span>(${skill.defBoostTurns}回合)`);
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
  
  // ── Hit 1: normal damage ──
  const normalRaw = Math.round(attacker.atk * skill.normalScale);
  let normalDmg = Math.max(1, Math.round(normalRaw * critMult * calcDmgMult(effectiveDef)));
  // Passive bonusDmgAbove60
  if (attacker.passive && attacker.passive.type === 'bonusDmgAbove60' && target.hp / target.maxHp > 0.6) {
    normalDmg = Math.round(normalDmg * (1 + attacker.passive.pct / 100));
  }
  applyRawDmg(attacker, target, normalDmg, false, false, 'physical');
  totalDmgDealt += normalDmg;


  spawnFloatingNum(tElId, `-${normalDmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 80, 0);
  updateHpBar(target, tElId);
  await triggerOnHitEffects(attacker, target, normalDmg);

  // Judgement passive on hit 1 — magic damage
  if (attacker.passive && attacker.passive.type === 'judgement' && target.alive) {
    const judgeRaw = Math.round(target.hp * attacker.passive.hpPct / 100);
    const jMr = calcEffDef(attacker, target, 'magic');
        const judgeReduced = Math.max(1, Math.round(judgeRaw * calcDmgMult(jMr) * critMult));
    applyRawDmg(attacker, target, judgeReduced, false, false, 'magic');
    totalDmgDealt += judgeReduced;
    skill._judgeTotal += judgeReduced;
    spawnFloatingNum(tElId, `-${judgeReduced}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, -20, {atkSide: attacker.side, amount: judgeReduced});
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
    applyRawDmg(attacker, target, pierceDmg, true, false, 'true');
    totalDmgDealt += pierceDmg;


    spawnFloatingNum(tElId, `-${pierceDmg}`, 'pierce-dmg', 80, 24);
    updateHpBar(target, tElId);
    await triggerOnHitEffects(attacker, target, pierceDmg);

    // Judgement passive on hit 2 — magic damage
    if (attacker.passive && attacker.passive.type === 'judgement' && target.alive) {
      const judgeRaw = Math.round(target.hp * attacker.passive.hpPct / 100);
      const jMr2 = calcEffDef(attacker, target, 'magic');
            const judgeReduced = Math.max(1, Math.round(judgeRaw * calcDmgMult(jMr2) * critMult));
      applyRawDmg(attacker, target, judgeReduced, false, false, 'magic');
      totalDmgDealt += judgeReduced;
      skill._judgeTotal += judgeReduced;
      spawnFloatingNum(tElId, `-${judgeReduced}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 4, {atkSide: attacker.side, amount: judgeReduced});
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

  // Anti-high-rarity heal (lifesteal-like, silent)
  if (isHighRarity && attacker.alive) {
    const healAmt = Math.round(totalDmgDealt * skill.healPctOfDmg / 100);
    const before = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmt);
    const actual = Math.round(attacker.hp - before);
    if (actual > 0) {
      const aElId = getFighterElId(attacker);
      spawnFloatingNum(aElId, `+${actual}`, 'passive-num', 0, 0);
      updateHpBar(attacker, aElId);
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
  spawnFloatingNum(fElId, `<img src="assets/passive/gambler-blood-icon.png" style="width:16px;height:16px;vertical-align:middle">${roll} +${roll}<img src="assets/battle/gold-coin-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'passive-num', 0, 0);
  renderStatusIcons(caster);
  // Heal 10% max HP + 15% lost HP
  let healAmt = Math.round(caster.maxHp * skill.healPct / 100);
  if (skill.healLostPct) healAmt += Math.round((caster.maxHp - caster.hp) * skill.healLostPct / 100);
  const actual = applyHeal(caster, healAmt);
  if (actual > 0) spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 300, 0);
  // Post-allIn bonus shield
  const allInUsed = caster.skills.some(s => s.type === 'fortuneAllIn' && s.cdLeft > 0);
  let shieldStr = '';
  if (allInUsed && skill.postAllInShieldPct) {
    const shieldAmt = Math.round(caster.maxHp * skill.postAllInShieldPct / 100);
    caster.shield += shieldAmt;
    spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 400, 0);
    shieldStr = ` <span class="log-shield">+${shieldAmt}护盾</span>`;
  }
  updateHpBar(caster, fElId);
  addLog(`${caster.emoji}${caster.name} <b>骰子</b>：<img src="assets/passive/gambler-blood-icon.png" style="width:16px;height:16px;vertical-align:middle">${roll}！<span class="log-passive">+${roll}金币（共${caster._goldCoins}）</span> <span class="log-heal">+${actual}HP</span>${shieldStr}`);
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
    if (!target.alive) continue; // keep animating remaining hits
    // Physical portion (reduced by armor)
    const effectiveDef = calcEffDef(attacker, target, 'physical');
        const normalDmg = Math.max(1, Math.round(normalPer * calcDmgMult(effectiveDef)));
    applyRawDmg(attacker, target, normalDmg, false, false, 'physical');
    // True portion (ignores defense)
    applyRawDmg(attacker, target, piercePer, false, false, 'true');
    const totalHit = normalDmg + piercePer;
    totalPierce += piercePer;
    totalNormal += normalDmg;
    const yOff = (i % 4) * 28;
    // True on top, physical below (rule: white→red top→bottom)
    spawnFloatingNum(tElId, `-${piercePer}`, 'true-dmg', 0, yOff, {atkSide: attacker.side, amount: piercePer});
    spawnFloatingNum(tElId, `-${normalDmg}`, 'direct-dmg', 0, yOff + 20, {atkSide: attacker.side, amount: normalDmg});
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
        const dmg = Math.max(1, Math.round(perHit * critMult * calcDmgMult(effectiveDef)));
    applyRawDmg(attacker, mainTarget, dmg, false, false, 'magic');
    totalMain += dmg;
    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0);
    await triggerOnHitEffects(attacker, mainTarget, dmg);
    // Splash to secondary
    if (secondaryTarget && secondaryTarget.alive) {
      const splashDmg = Math.max(1, Math.round(dmg * skill.splashPct / 100));
      applyRawDmg(attacker, secondaryTarget, splashDmg, false, false, 'magic');
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
        const dmg = Math.max(1, Math.round(perHitDmg * critMult * calcDmgMult(effectiveDef)));
    applyRawDmg(attacker, target, dmg, false, false, 'magic', false, true);
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, (i % 5) * 24);
    await triggerOnHitEffects(attacker, target, dmg);
    triggerThunderShell(attacker);
    updateHpBar(target, tElId);
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    await sleep(280);
    tEl.classList.remove('hit-shake');
    await sleep(70);
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
  renderStatusIcons(f);
  // Update energy bar visual
  updateHpBar(f, getFighterElId(f));
}

// Helper: passive star fire — after each skill, deal 40% stored energy as true damage to target
async function fireStarPassive(f, target) {
  if (!f.passive || f.passive.type !== 'starEnergy' || !target || !target.alive) return;
  const energy = f._starEnergy || 0;
  if (energy <= 0) return;
  const firePct = f.passive.passiveFirePct || 40;
  const fireDmg = Math.round(energy * firePct / 100);
  if (fireDmg <= 0) return;
  applyRawDmg(f, target, fireDmg, false, false, 'true');
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `-${fireDmg}<img src="assets/passive/star-energy-bar-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'true-dmg', 200, 0, {atkSide:f.side, amount:fireDmg});
  updateHpBar(target, tElId);
  // Passive true damage also charges star energy
  addStarEnergy(f, fireDmg);
}

// Helper: star meteor full energy burst — consume all energy, deal burstPct% as true AOE
async function starMeteorBurst(f) {
  if (!f.passive || f.passive.type !== 'starEnergy') return;
  const maxE = Math.round(f.maxHp * f.passive.maxChargePct / 100);
  if ((f._starEnergy || 0) < maxE) return;
  const burstPct = f.passive.burstPct || 80;
  const burstDmg = Math.round(f._starEnergy * burstPct / 100);
  f._starEnergy = 0;
  updateHpBar(f, getFighterElId(f)); // update energy bar to 0
  const enemies = getAliveEnemiesWithSummons(f.side);
  for (const e of enemies) {
    if (!e.alive) continue;
    const wh = e.buffs ? e.buffs.find(b => b.type === 'wormhole') : null;
    const finalDmg = wh ? Math.round(burstDmg * (1 + wh.pierceBonusPct / 100)) : burstDmg;
    applyRawDmg(f, e, finalDmg, false, false, 'true');
    const eElId = getFighterElId(e);
    spawnFloatingNum(eElId, `-${finalDmg}<img src="assets/passive/star-energy-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'crit-true', 300, 0, {atkSide:f.side, amount:finalDmg});
    updateHpBar(e, eElId);
  }
  renderStatusIcons(f);
  addLog(`${f.emoji}${f.name} <span class="log-passive"><img src="assets/passive/star-energy-icon.png" style="width:16px;height:16px;vertical-align:middle">星能爆发！</span>全体敌方 <span class="log-pierce">${burstDmg}真实伤害</span>`);
  try { sfxExplosion(); } catch(e) {}
  await sleep(500);
}

// Star Beam: 3 hits, 40%ATK + 5% target current HP each
async function doStarBeam(attacker, target, skill) {
  const tElId = getFighterElId(target);
  let totalDmg = 0;

  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) continue; // keep animating remaining hits
    const {isCrit, critMult} = calcCrit(attacker);
    const baseDmg = Math.round(attacker.atk * skill.atkScale) + Math.round(target.hp * skill.currentHpPct / 100);
    const eDef = calcEffDef(attacker, target, 'magic');
    
    // Check wormhole normal bonus
    const wh = target.buffs.find(b => b.type === 'wormhole' && b.sourceId === allFighters.indexOf(attacker));
    let dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(eDef)));
    if (wh) dmg = Math.round(dmg * (1 + wh.normalBonusPct / 100));

    applyRawDmg(attacker, target, dmg, false, false, 'magic');
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

  addLog(`${attacker.emoji}${attacker.name} <b>星光射线</b> → ${target.emoji}${target.name}：<span class="log-magic">${totalDmg}魔法伤害</span>`);

  // Passive: fire 40% star energy as true damage after skill
  if (target.alive) await fireStarPassive(attacker, target);
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
  // Permanent magic pen gain
  if (skill.magicPenAtkPct) {
    const penGain = Math.round(attacker.atk * skill.magicPenAtkPct / 100);
    attacker.magicPen = (attacker.magicPen || 0) + penGain;
    const fElId = getFighterElId(attacker);
    spawnFloatingNum(fElId, `+${penGain}魔法穿透`, 'passive-num', 200, 0);
    updateFighterStats(attacker, fElId);
  }
  addLog(`${attacker.emoji}${attacker.name} <b>虫洞</b> → ${target.emoji}${target.name}：<span class="log-debuff">真实+${skill.pierceBonusPct}% ${skill.duration}回合</span>` + (skill.magicPenAtkPct ? ` + <span class="log-passive">+${Math.round(attacker.atk * skill.magicPenAtkPct / 100)}魔法穿透</span>` : ''));
  // Passive: fire 40% star energy after skill
  if (target.alive) await fireStarPassive(attacker, target);
  await sleep(800);
}

// Meteor: AOE 60%ATK + 50% star energy as pierce
async function doStarMeteor(attacker, skill) {
  const enemies = allFighters.filter(e => e.alive && e.side !== attacker.side);
  if (!enemies.length) return;

  const baseDmg = Math.round(attacker.atk * skill.atkScale);

  for (const e of enemies) {
    if (!e.alive) continue;
    const {isCrit, critMult} = calcCrit(attacker);
    const eDef = calcEffDef(attacker, e, 'magic');
        const normalDmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(eDef)));
    applyRawDmg(attacker, e, normalDmg, false, false, 'magic');
    const eId = getFighterElId(e);
    spawnFloatingNum(eId, `-${normalDmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0, {atkSide:attacker.side, amount:normalDmg});
    updateHpBar(e, eId);
    await triggerOnHitEffects(attacker, e, normalDmg);
    addStarEnergy(attacker, normalDmg);

    // Apply MR down
    if (skill.mrDown) {
      const existing = e.buffs.find(b => b.type === 'mrDown');
      if (existing) { existing.value = Math.max(existing.value, skill.mrDown.pct); existing.turns = Math.max(existing.turns, skill.mrDown.turns); }
      else e.buffs.push({ type: 'mrDown', value: skill.mrDown.pct, turns: skill.mrDown.turns });
      renderStatusIcons(e);
    }
  }

  // Full energy burst: consume all, deal 100% as true AOE
  await starMeteorBurst(attacker);

  // Passive fire on first alive enemy
  const firstAlive = enemies.find(e => e.alive);
  if (firstAlive) await fireStarPassive(attacker, firstAlive);

  recalcStats();
  renderStatusIcons(attacker);
  addLog(`${attacker.emoji}${attacker.name} <b>流星暴击</b> → 全体敌方：<span class="log-magic">${baseDmg}魔法伤害</span> + ⬇️魔抗`);
  await sleep(600);
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
  spawnFloatingNum(elId, `+<img src="assets/passive/cyber-drone-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'passive-num', 0, 0);
  renderStatusIcons(caster);
  addLog(`${caster.emoji}${caster.name} 部署浮游炮！（${caster._drones.length}/${caster.passive.maxDrones}）`);
  await sleep(800);
}

// ── CRYSTAL TURTLE SKILLS ─────────────────────────────────
async function doCrystalSpike(attacker, target, skill) {
  const hits = skill.hits || 2;
  const tElId = getFighterElId(target);
  let totalDmg = 0;
  for (let i = 0; i < hits; i++) {
    if (!target.alive) continue; // keep animating remaining hits
    const {isCrit, critMult} = calcCrit(attacker);
    let baseDmg = Math.round(attacker.atk * skill.atkScale);
    if (skill.targetHpPct) baseDmg += Math.round(target.maxHp * skill.targetHpPct / 100);
    const effDef = calcEffDef(attacker, target, 'magic');
        const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effDef)));
    applyRawDmg(attacker, target, dmg, false, false, 'magic');
    totalDmg += dmg;
    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, (i%3)*28, {atkSide:attacker.side, amount:dmg});
    await triggerOnHitEffects(attacker, target, dmg);
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(400);
    if (tEl) tEl.classList.remove('hit-shake');
  }
  addLog(`${attacker.emoji}${attacker.name} <b>水晶刺</b> ${hits}段 → ${target.emoji}${target.name}：<span class="log-magic">${totalDmg}魔法伤害</span>`);
}

async function doCrystalBarrier(caster, skill) {
  const fElId = getFighterElId(caster);
  // Self shield
  const shieldAmt = Math.round(caster.atk * skill.shieldAtkScale);
  caster.shield += shieldAmt;
  spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 0, 0);

  // Team DEF/MR buff
  if (skill.defMrUpPct) {
    const allies = (caster.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
    for (const ally of allies) {
      const defGain = Math.round(ally.baseDef * skill.defMrUpPct / 100);
      const mrGain = Math.round((ally.baseMr || ally.baseDef) * skill.defMrUpPct / 100);
      ally.buffs.push({type:'defUp', value:defGain, turns:skill.defMrUpTurns});
      ally.buffs.push({type:'mrUp', value:mrGain, turns:skill.defMrUpTurns});
      const aElId = getFighterElId(ally);
      spawnFloatingNum(aElId, `+${defGain}甲+${mrGain}抗`, 'passive-num', 200, 0);
      renderStatusIcons(ally);
      updateFighterStats(ally, aElId);
    }
  }
  recalcStats();
  updateHpBar(caster, fElId);
  renderStatusIcons(caster);
  updateFighterStats(caster, fElId);
  addLog(`${caster.emoji}${caster.name} <b>水晶壁垒</b>：<span class="log-shield">+${shieldAmt}护盾</span> + 全体护甲/魔抗+${skill.defMrUpPct}%`);
  await sleep(800);
}

async function doCrystalBurst(attacker, skill) {
  const enemies = getAliveEnemiesWithSummons(attacker.side);
  if (!enemies.length) return;
  const hits = skill.hits || 5;
  let totalAll = 0;
  for (let i = 0; i < hits; i++) {
    if (battleOver) break;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const {isCrit, critMult} = calcCrit(attacker);
      const magicBase = Math.round(attacker.atk * skill.atkScale);
      const effMr = calcEffDef(attacker, enemy, 'magic');
            const magicDmg = Math.max(1, Math.round(magicBase * critMult * calcDmgMult(effMr)));
      const trueDmg = Math.round(attacker.atk * (skill.pierceScale || 0) * critMult);
      const eElId = getFighterElId(enemy);
      applyRawDmg(attacker, enemy, magicDmg, false, false, 'magic');
      if (trueDmg > 0) applyRawDmg(attacker, enemy, trueDmg, false, false, 'true');
      totalAll += magicDmg + trueDmg;
      spawnFloatingNum(eElId, `-${magicDmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, (i%3)*28+20, {atkSide:attacker.side, amount:magicDmg});
      if (trueDmg > 0) spawnFloatingNum(eElId, `-${trueDmg}`, isCrit ? 'crit-true' : 'true-dmg', 0, (i%3)*28, {atkSide:attacker.side, amount:trueDmg});
      await triggerOnHitEffects(attacker, enemy, magicDmg + trueDmg);
      updateHpBar(enemy, eElId);
      const eEl = document.getElementById(eElId);
      if (eEl) eEl.classList.add('hit-shake');
    }
    await sleep(400);
    for (const enemy of enemies) {
      const eEl = document.getElementById(getFighterElId(enemy));
      if (eEl) eEl.classList.remove('hit-shake');
    }
  }
  addLog(`${attacker.emoji}${attacker.name} <b>碎晶爆破</b> ${hits}段全体：<span class="log-magic">${totalAll}伤害</span>`);
}

// ── SOUL REAP (无头龟) ────────────────────────────────────
async function doSoulReap(attacker, skill) {
  const enemies = getAliveEnemiesWithSummons(attacker.side);
  if (!enemies.length) return;
  const lostHp = attacker.maxHp - attacker.hp;
  const baseDmg = Math.round(attacker.atk * skill.atkScale) + Math.round(lostHp * skill.lostHpPct / 100);
  let totalDmg = 0;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const {isCrit, critMult} = calcCrit(attacker);
    const effDef = calcEffDef(attacker, enemy, 'physical');
        const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effDef)));
    applyRawDmg(attacker, enemy, dmg, false, false, 'physical');
    totalDmg += dmg;
    const eElId = getFighterElId(enemy);
    spawnFloatingNum(eElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, {atkSide:attacker.side, amount:dmg});
    await triggerOnHitEffects(attacker, enemy, dmg);
    const eEl = document.getElementById(eElId);
    if (eEl) eEl.classList.add('hit-shake');
    updateHpBar(enemy, eElId);
  }
  await sleep(500);
  for (const enemy of enemies) {
    const eEl = document.getElementById(getFighterElId(enemy));
    if (eEl) eEl.classList.remove('hit-shake');
  }
  // Lifesteal
  if (skill.lifestealPct && attacker.alive && totalDmg > 0) {
    const heal = Math.round(totalDmg * skill.lifestealPct / 100);
    const actual = applyHeal(attacker, heal);
    if (actual > 0) {
      spawnFloatingNum(getFighterElId(attacker), `+${actual}`, 'passive-num', 200, 0);
      updateHpBar(attacker, getFighterElId(attacker));
    }
  }
  addLog(`${attacker.emoji}${attacker.name} <b>灵魂收割</b> 全体：<span class="log-direct">${totalDmg}物理伤害</span>（已损HP加成${Math.round(lostHp*skill.lostHpPct/100)}）`);
}

// ── CANDY BARRAGE ─────────────────────────────────────────
async function doCandyBarrage(attacker, skill) {
  const fElId = getFighterElId(attacker);
  // Apply armor pen buff first
  if (skill.armorPenAtkPct) {
    // Remove old candy pen buff if exists
    if (attacker._candyPenGain) attacker.armorPen -= attacker._candyPenGain;
    const penGain = Math.round(attacker.atk * skill.armorPenAtkPct / 100);
    attacker._candyPenGain = penGain;
    attacker._candyPenTurns = skill.armorPenTurns;
    attacker.armorPen += penGain;
    spawnFloatingNum(fElId, `+${penGain}穿甲`, 'passive-num', 0, 0);
    updateFighterStats(attacker, fElId);
    addLog(`${attacker.emoji}${attacker.name} 护甲穿透 +${penGain}，持续${skill.armorPenTurns}回合`);
    await sleep(400);
  }
  // AOE 4 hits
  const enemies = getAliveEnemiesWithSummons(attacker.side);
  if (!enemies.length) return;
  const hits = skill.hits || 4;
  let totalAll = 0;
  for (let i = 0; i < hits; i++) {
    if (battleOver) break;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const {isCrit, critMult} = calcCrit(attacker);
      let baseDmg = Math.round(attacker.atk * skill.atkScale);
      if (skill.hpPct) baseDmg += Math.round(enemy.maxHp * skill.hpPct / 100);
      const effDef = calcEffDef(attacker, enemy, 'physical');
            const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effDef)));
      applyRawDmg(attacker, enemy, dmg, false, false, 'physical');
      totalAll += dmg;
      const eElId = getFighterElId(enemy);
      spawnFloatingNum(eElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, (i%3)*28, {atkSide:attacker.side, amount:dmg});
      await triggerOnHitEffects(attacker, enemy, dmg);
      updateHpBar(enemy, eElId);
      const eEl = document.getElementById(eElId);
      if (eEl) eEl.classList.add('hit-shake');
    }
    await sleep(400);
    for (const enemy of enemies) {
      const eEl = document.getElementById(getFighterElId(enemy));
      if (eEl) eEl.classList.remove('hit-shake');
    }
  }
  addLog(`${attacker.emoji}${attacker.name} <b>糖衣炮弹</b> ${hits}段全体：<span class="log-direct">${totalAll}物理伤害</span>`);
}

// ── LAVA TURTLE SKILLS (small form) ───────────────────────
async function doLavaBolt(attacker, target, skill) {
  const {isCrit, critMult} = calcCrit(attacker);
  let baseDmg = Math.round(attacker.atk * skill.atkScale);
  const effDef = calcEffDef(attacker, target, 'magic');
    const mainDmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effDef)));
  const hpBonusDmg = skill.targetHpPct ? Math.round(target.maxHp * skill.targetHpPct / 100 * critMult) : 0;
  const dmg = mainDmg + hpBonusDmg;
  const tElId = getFighterElId(target);
  applyRawDmg(attacker, target, dmg, false, false, 'magic');
  spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0, {atkSide:attacker.side, amount:dmg});
  await triggerOnHitEffects(attacker, target, dmg);
  const tEl = document.getElementById(tElId);
  if (tEl) tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(500);
  if (tEl) tEl.classList.remove('hit-shake');
  if (target.alive) applySkillDebuffs(skill, target, attacker);
  addLog(`${attacker.emoji}${attacker.name} <b>熔岩弹</b> → ${target.emoji}${target.name}：<span class="log-magic">${dmg}魔法伤害</span>`);
}

async function doLavaQuake(attacker, skill) {
  const enemies = getAliveEnemiesWithSummons(attacker.side);
  let totalDmg = 0;
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    const {isCrit, critMult} = calcCrit(attacker);
    const baseDmg = Math.round(attacker.atk * skill.atkScale);
    const effDef = calcEffDef(attacker, enemy, 'magic');
        const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effDef)));
    applyRawDmg(attacker, enemy, dmg, false, false, 'magic');
    totalDmg += dmg;
    const eElId = getFighterElId(enemy);
    spawnFloatingNum(eElId, `-${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0, {atkSide:attacker.side, amount:dmg});
    updateHpBar(enemy, eElId);
    if (skill.mrDown && enemy.alive) {
      const existing = enemy.buffs.find(b => b.type === 'mrDown');
      if (existing) { existing.value = Math.max(existing.value, skill.mrDown.pct); existing.turns = Math.max(existing.turns, skill.mrDown.turns); }
      else enemy.buffs.push({type:'mrDown', value:skill.mrDown.pct, turns:skill.mrDown.turns});
      spawnFloatingNum(eElId, `⬇️魔抗`, 'debuff-label', 200, -10);
      renderStatusIcons(enemy);
    }
  }
  recalcStats();
  addLog(`${attacker.emoji}${attacker.name} <b>地裂</b> 全体：<span class="log-magic">${totalDmg}魔法伤害</span> + ⬇️魔抗`);
  await sleep(600);
}

async function doLavaSurge(attacker, target, skill) {
  const {isCrit, critMult} = calcCrit(attacker);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const effDef = calcEffDef(attacker, target, 'magic');
    const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effDef)));
  const tElId = getFighterElId(target);
  applyRawDmg(attacker, target, dmg, false, false, 'magic');
  spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0, {atkSide:attacker.side, amount:dmg});
  await triggerOnHitEffects(attacker, target, dmg);
  updateHpBar(target, tElId);
  // Shield
  const shieldAmt = Math.round(attacker.atk * skill.shieldAtkPct / 100);
  attacker.shield += shieldAmt;
  const fElId = getFighterElId(attacker);
  spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 200, 0);
  updateHpBar(attacker, fElId);
  addLog(`${attacker.emoji}${attacker.name} <b>岩浆涌动</b> → ${target.emoji}${target.name}：<span class="log-magic">${dmg}魔法</span> + <span class="log-shield">${shieldAmt}护盾</span>`);
  await sleep(600);
}

// ── VOLCANO TURTLE SKILLS (large form) ───────────────────
async function doVolcanoSmash(attacker, target, skill) {
  const {isCrit, critMult} = calcCrit(attacker);
  let baseDmg = Math.round(attacker.atk * skill.atkScale);
  if (skill.selfHpPct) baseDmg += Math.round(attacker.maxHp * skill.selfHpPct / 100);
  const effDef = calcEffDef(attacker, target, 'physical');
    const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effDef)));
  const tElId = getFighterElId(target);
  applyRawDmg(attacker, target, dmg, false, false, 'physical');
  spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, {atkSide:attacker.side, amount:dmg});
  await triggerOnHitEffects(attacker, target, dmg);
  const tEl = document.getElementById(tElId);
  if (tEl) tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  // Lifesteal
  if (skill.lifestealPct && attacker.alive) {
    const heal = Math.round(dmg * skill.lifestealPct / 100);
    const actual = applyHeal(attacker, heal);
    if (actual > 0) {
      spawnFloatingNum(getFighterElId(attacker), `+${actual}`, 'passive-num', 200, 0);
      updateHpBar(attacker, getFighterElId(attacker));
    }
  }
  await sleep(500);
  if (tEl) tEl.classList.remove('hit-shake');
  addLog(`${attacker.emoji}${attacker.name} <b>烈焰重击</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span>`);
}

async function doVolcanoArmor(caster, skill) {
  const fElId = getFighterElId(caster);
  const shieldAmt = Math.round(caster.atk * skill.shieldAtkScale);
  caster.shield += shieldAmt;
  spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 0, 0);

  if (skill.defMrUpPct) {
    const defGain = Math.round(caster.baseDef * skill.defMrUpPct / 100);
    const mrGain = Math.round((caster.baseMr || caster.baseDef) * skill.defMrUpPct / 100);
    caster.buffs.push({type:'defUp', value:defGain, turns:skill.defMrUpTurns});
    caster.buffs.push({type:'mrUp', value:mrGain, turns:skill.defMrUpTurns});
    spawnFloatingNum(fElId, `+${defGain}甲+${mrGain}抗`, 'passive-num', 200, 0);
  }
  // Heal lost HP
  if (skill.healLostPct && caster.alive) {
    const lostHp = caster.maxHp - caster.hp;
    const heal = Math.round(lostHp * skill.healLostPct / 100);
    const actual = applyHeal(caster, heal);
    if (actual > 0) spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 300, 0);
  }
  recalcStats();
  updateHpBar(caster, fElId);
  renderStatusIcons(caster);
  updateFighterStats(caster, fElId);
  addLog(`${caster.emoji}${caster.name} <b>熔岩铠甲</b>：<span class="log-shield">+${shieldAmt}护盾</span> + 护甲/魔抗提升`);
  await sleep(800);
}

async function doVolcanoErupt(attacker, skill) {
  const enemies = getAliveEnemiesWithSummons(attacker.side);
  if (!enemies.length) return;
  const hits = skill.hits || 5;
  let totalAll = 0;
  for (let i = 0; i < hits; i++) {
    if (battleOver) break;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const {isCrit, critMult} = calcCrit(attacker);
      let magicBase = Math.round(attacker.atk * skill.atkScale);
      if (skill.selfHpPct) magicBase += Math.round(attacker.maxHp * skill.selfHpPct / 100);
      const effMr = calcEffDef(attacker, enemy, 'magic');
            const magicDmg = Math.max(1, Math.round(magicBase * critMult * calcDmgMult(effMr)));
      const trueDmg = Math.round(attacker.atk * (skill.pierceScale || 0) * critMult);
      const eElId = getFighterElId(enemy);
      applyRawDmg(attacker, enemy, magicDmg, false, false, 'magic');
      if (trueDmg > 0) applyRawDmg(attacker, enemy, trueDmg, false, false, 'true');
      totalAll += magicDmg + trueDmg;
      spawnFloatingNum(eElId, `-${magicDmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, (i%3)*28+20, {atkSide:attacker.side, amount:magicDmg});
      if (trueDmg > 0) spawnFloatingNum(eElId, `-${trueDmg}`, isCrit ? 'crit-true' : 'true-dmg', 0, (i%3)*28, {atkSide:attacker.side, amount:trueDmg});
      await triggerOnHitEffects(attacker, enemy, magicDmg + trueDmg);
      updateHpBar(enemy, eElId);
      const eEl = document.getElementById(eElId);
      if (eEl) eEl.classList.add('hit-shake');
    }
    await sleep(400);
    for (const enemy of enemies) {
      const eEl = document.getElementById(getFighterElId(enemy));
      if (eEl) eEl.classList.remove('hit-shake');
    }
  }
  // Burn all alive enemies
  for (const enemy of enemies) {
    if (enemy.alive) applySkillDebuffs({burn:true}, enemy, attacker);
  }
  // Heal 15% of total damage
  if (attacker.alive && totalAll > 0) {
    const heal = Math.round(totalAll * 0.15);
    const actual = applyHeal(attacker, heal);
    if (actual > 0) {
      spawnFloatingNum(getFighterElId(attacker), `+${actual}`, 'heal-num', 300, 0);
      updateHpBar(attacker, getFighterElId(attacker));
    }
  }
  addLog(`${attacker.emoji}${attacker.name} <b>火山爆发</b> ${hits}段全体：<span class="log-magic">${totalAll}伤害</span> + 灼烧`);
}

// ── RAINBOW STORM ─────────────────────────────────────────
async function doRainbowStorm(attacker, skill) {
  const enemies = getAliveEnemiesWithSummons(attacker.side);
  if (!enemies.length) return;
  const hits = skill.hits || 4;
  let totalAllDmg = 0;

  for (let i = 0; i < hits; i++) {
    if (battleOver) break;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const {isCrit, critMult} = calcCrit(attacker);
      // Magic damage portion
      let magicBase = Math.round(attacker.atk * skill.atkScale);
      const effMr = calcEffDef(attacker, enemy, 'magic');
            const magicDmg = Math.max(1, Math.round(magicBase * critMult * calcDmgMult(effMr)));
      // True damage portion
      const trueDmg = Math.round(attacker.atk * (skill.pierceScale || 0) * critMult);

      const eElId = getFighterElId(enemy);
      applyRawDmg(attacker, enemy, magicDmg, false, false, 'magic');
      if (trueDmg > 0) applyRawDmg(attacker, enemy, trueDmg, false, false, 'true');
      totalAllDmg += magicDmg + trueDmg;

      // Stagger numbers vertically to avoid overlap
      const magicCls = isCrit ? 'crit-magic' : 'magic-dmg';
      const trueCls = isCrit ? 'crit-true' : 'true-dmg';
      spawnFloatingNum(eElId, `-${magicDmg}`, magicCls, 0, (i % 3) * 28 + 20, { atkSide: attacker.side, amount: magicDmg });
      if (trueDmg > 0) spawnFloatingNum(eElId, `-${trueDmg}`, trueCls, 0, (i % 3) * 28, { atkSide: attacker.side, amount: trueDmg });

      await triggerOnHitEffects(attacker, enemy, magicDmg + trueDmg);
      const eEl = document.getElementById(eElId);
      if (eEl) eEl.classList.add('hit-shake');
      updateHpBar(enemy, eElId);
    }
    await sleep(500);
    for (const enemy of enemies) {
      const eEl = document.getElementById(getFighterElId(enemy));
      if (eEl) eEl.classList.remove('hit-shake');
    }
    await sleep(100);
  }

  // Apply debuffs + burn to all alive enemies
  for (const enemy of enemies) {
    if (enemy.alive) applySkillDebuffs(skill, enemy, attacker);
  }
  addLog(`${attacker.emoji}${attacker.name} <b>全色风暴</b> ${hits}段全体：共 <span class="log-magic">${totalAllDmg}伤害</span>`);
}

// ── PIRATE CANNON BARRAGE ─────────────────────────────────
async function doPirateCannonBarrage(attacker, skill) {
  const enemies = getAliveEnemiesWithSummons(attacker.side);
  if (!enemies.length) return;
  const hits = skill.hits || 10;

  // Phase 1: simultaneous cannon fire on all enemies (visual burst)
  for (const enemy of enemies) {
    const eElId = getFighterElId(enemy);
    const eEl = document.getElementById(eElId);
    if (eEl) eEl.classList.add('hit-shake');
    spawnFloatingNum(eElId, '<img src="assets/passive/pirate-plunder-icon.png" style="width:16px;height:16px;vertical-align:middle">炮击!', 'debuff-label', 0, -10);
  }
  addLog(`${attacker.emoji}${attacker.name} <b>火炮齐射</b> 全体敌方！`);
  await sleep(600);
  for (const enemy of enemies) {
    const eEl = document.getElementById(getFighterElId(enemy));
    if (eEl) eEl.classList.remove('hit-shake');
  }

  // Phase 2: slow tick damage — 10 ticks applied to all enemies
  let totalDmgAll = 0;
  const dmgType = skill.dmgType || 'physical';
  for (let i = 0; i < hits; i++) {
    if (battleOver) break;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      let basePower = skill.power || 0;
      if (skill.atkScale) basePower += Math.round(attacker.atk * skill.atkScale);
      if (skill.hpPct) basePower += Math.round(enemy.maxHp * skill.hpPct / 100);
      const {isCrit, critMult} = calcCrit(attacker);
      const effectiveDef = calcEffDef(attacker, enemy, dmgType);
            const dmg = Math.max(1, Math.round(basePower * critMult * calcDmgMult(effectiveDef)));
      const eElId = getFighterElId(enemy);
      applyRawDmg(attacker, enemy, dmg, false, false, dmgType);
      const cls = isCrit ? 'crit-dmg' : 'direct-dmg';
      spawnFloatingNum(eElId, `-${dmg}`, cls, 0, (i % 3) * 24, { atkSide: attacker.side, amount: dmg });
      updateHpBar(enemy, eElId);
      totalDmgAll += dmg;
    }
    await sleep(300);
  }

  // Apply debuffs
  for (const enemy of enemies) {
    if (enemy.alive) applySkillDebuffs(skill, enemy, attacker);
  }
  addLog(`${attacker.emoji}${attacker.name} <b>火炮齐射</b> 10段轰击：共 <span class="log-direct">${totalDmgAll}物理伤害</span>`);
}

// ── PHOENIX SKILLS ────────────────────────────────────────
async function doPhoenixBurn(attacker, target, skill) {
  // Deal 1×ATK normal damage
  const {isCrit, critMult} = calcCrit(attacker);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const effectiveDef = calcEffDef(attacker, target, 'magic');
    const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effectiveDef)));
  const tElId = getFighterElId(target);
  applyRawDmg(attacker, target, dmg, false, false, 'magic');
  spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0);
  await triggerOnHitEffects(attacker, target, dmg);
  const tEl = document.getElementById(tElId);
  tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(450);
  tEl.classList.remove('hit-shake');

  // Apply unified burn DoT — 0.4*ATK + 8%maxHP magic, 4 turns, no stack (refresh)
  if (target.alive && !(target.passive && target.passive.burnImmune)) {
    const burnVal = Math.round(attacker.atk * 0.4);
    const burnHp = 8;
    const burnTurns = 4;
    const srcIdx = allFighters.indexOf(attacker);
    const existing = target.buffs.find(b => b.type === 'phoenixBurnDot');
    if (existing) {
      existing.turns = burnTurns;
      existing.value = Math.max(existing.value, burnVal);
      existing.sourceIdx = srcIdx;
      spawnFloatingNum(tElId, `🔥刷新${burnTurns}回合`, 'debuff-label', 200, 0);
      addLog(`${attacker.emoji}${attacker.name} <b>灼烧</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span> + <span class="log-dot">灼烧刷新至${burnTurns}回合</span>`);
    } else {
      target.buffs.push({ type:'phoenixBurnDot', value:burnVal, hpPct:burnHp, turns:burnTurns, sourceSide:attacker.side, sourceIdx:srcIdx, dmgType:'magic' });
      spawnFloatingNum(tElId, `🔥灼烧${burnTurns}回合`, 'debuff-label', 200, 0);
      addLog(`${attacker.emoji}${attacker.name} <b>灼烧</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span> + <span class="log-dot">灼烧${burnTurns}回合</span>`);
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
  spawnFloatingNum(fElId, `+${amount}<img src="assets/battle/lava-shield-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'passive-num', 0, 0);
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
      spawnFloatingNum(tElId, `-${broken}<img src="assets/passive/bubble-store-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'shield-dmg', 0, -15);
    }
    if (target.shield > 0) {
      const broken = Math.round(target.shield * breakPct);
      target.shield -= broken;
      spawnFloatingNum(tElId, `-${broken}`, 'shield-dmg', 100, -15);
    }
    addLog(`${attacker.emoji}${attacker.name} 烫伤破盾！<span class="log-debuff">破坏${skill.shieldBreak}%护盾</span>`);
    updateHpBar(target, tElId);
    await sleep(300);
  }

  // Deal 0.7×ATK normal damage
  const {isCrit, critMult} = calcCrit(attacker);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const effectiveDef = calcEffDef(attacker, target, 'magic');
    const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effectiveDef)));
  applyRawDmg(attacker, target, dmg, false, false, 'magic');
  spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0);
  await triggerOnHitEffects(attacker, target, dmg);
  const tEl = document.getElementById(tElId);
  tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(450);
  tEl.classList.remove('hit-shake');

  // Apply debuffs
  if (target.alive) {
    applySkillDebuffs(skill, target, attacker);
    // Heal reduce
    if (skill.healReduce) {
      const existing = target.buffs.find(b => b.type === 'healReduce');
      if (existing) { existing.turns = 4; } else target.buffs.push({ type:'healReduce', value:50, turns:4 });
      spawnFloatingNum(tElId, '☠️治疗削减', 'debuff-label', 400, -10);
      renderStatusIcons(target);
    }
  }
  addLog(`${attacker.emoji}${attacker.name} <b>烫伤</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span> + 攻击力/护甲/魔抗-15% + 灼烧 + 治疗削减`);
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
    applyRawDmg(attacker, target, pierceDmg, false, false, 'physical');
    spawnFloatingNum(tElId, `-${pierceDmg}`, 'crit-pierce', 100, 0);
    addLog(`${attacker.emoji}${attacker.name} <b>飞镖</b> → ${target.emoji}${target.name}：<span class="log-crit">暴击!</span> <span class="log-pierce">${pierceDmg}真实</span>`);
    await triggerOnHitEffects(attacker, target, pierceDmg);
  } else {
    const effectiveDef = calcEffDef(attacker, target);
        const dmg = Math.max(1, Math.round(baseDmg * calcDmgMult(effectiveDef)));
    applyRawDmg(attacker, target, dmg, false, false, 'physical');
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
        const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effectiveDef)));
    applyRawDmg(attacker, e, dmg, false, false, 'physical');
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
    addLog(`${attacker.emoji}${attacker.name} 猎人本能！目标生命值低，<span class="log-crit">暴击率+${skill.execCrit}% 暴击伤害+${skill.execCritDmg}%</span>`);
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
    applyRawDmg(attacker, target, arrowDmg, true, false, 'true');
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
  spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 200, 0);
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
  spawnFloatingNum(tElId, `+${amount}<img src="assets/passive/bubble-store-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'bubble-num', 0, 0);
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
  spawnFloatingNum(tElId, '<img src="assets/passive/bubble-store-icon.png" style="width:14px;height:14px;vertical-align:middle">束缚', 'bubble-num', 0, 0);
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
  
  for (let i = 0; i < hits; i++) {
    if (!target.alive) continue; // keep animating remaining hits

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
      dmg = Math.max(1, Math.round(raw * critMult * calcDmgMult(effectiveDef)));
      const { shieldAbs } = applyRawDmg(attacker, target, dmg, false, false, 'physical');
      totalNormal += dmg;
      totalShieldDmg += shieldAbs;

      spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 80, yOff);
    } else {
      dmg = Math.max(1, Math.round(raw * critMult)); // pierce ignores DEF
      const { shieldAbs } = applyRawDmg(attacker, target, dmg, true, false, 'true');
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
          applyRawDmg(attacker, e, splashDmg, false, false, 'physical');
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
    'hidingCommand','diceFate','fortuneDice','fortuneAllIn','bambooHeal','bambooLeaf','ghostPhase',
    'diamondFortify','iceShield','twoHeadSwitch','mechAttack','chestOpen',
    'gamblerDraw','gamblerBet','chestCount','chestSmash','starWormhole',
    'bubbleBurst', // 需要泡泡值才有伤害
    'shellAbsorb','shellErode','shellFortify', // 龟壳专属机制
    'fortuneBuyEquip','fortuneGainCoins', // 财神龟金币技能
    'ghostPhantom','starShieldBreak', // 依赖特殊状态
    'hidingBuffSummon','diceStableShield', // 依赖随从/暴击率
  ];

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
    const AOE_TYPES_SET = new Set(['hunterBarrage','ninjaBomb','lightningBarrage','iceFrost','basicBarrage','starMeteor','diceAllIn',
      'lavaQuake','volcanoErupt','rainbowStorm','pirateCannonBarrage','chestStorm','crystalBurst','soulReap','candyBarrage']);
    const SELF_TYPES_SET = new Set(['phoenixShield','lightningBuff','gamblerDraw','volcanoArmor','crystalBarrier']);

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
function addInkStack(target, count, attacker) {
  // Check if attacker has ink cap override from passive skill
  const max = (attacker && attacker._inkCapOverride) ? attacker._inkCapOverride : 5;
  const before = target._inkStacks || 0;
  target._inkStacks = Math.min(max, before + count);
  const gained = target._inkStacks - before;
  if (gained > 0) {
    const tElId = getFighterElId(target);
    renderStatusIcons(target);
    // Ink link: sync stacks to partner
    if (target._inkLink && target._inkLink.partner && target._inkLink.partner.alive) {
      const partner = target._inkLink.partner;
      const pBefore = partner._inkStacks || 0;
      partner._inkStacks = Math.min(max, pBefore + gained);
      const pGained = partner._inkStacks - pBefore;
      if (pGained > 0) {
        const pElId = getFighterElId(partner);
        renderStatusIcons(partner);
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
    if (!target.alive) continue; // keep animating remaining hits
    const {isCrit, critMult} = calcCrit(attacker);
    const baseDmg = Math.round(attacker.atk * skill.atkScale);
    const eDef = calcEffDef(attacker, target);
        let dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(eDef)));
    // Ink amplification now handled in applyRawDmg

    applyRawDmg(attacker, target, dmg, false, false, 'physical');
    totalDmg += dmg;
    addInkStack(target, 1, attacker);

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
  let dmg1 = Math.max(1, Math.round(baseDmg * critMult1 * calcDmgMult(eDef1)));

  applyRawDmg(attacker, target, dmg1, false, false, 'physical');
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
    dmg2 = Math.max(1, Math.round(baseDmg * critMult2 * calcDmgMult(eDef2)));

    applyRawDmg(attacker, second, dmg2, false, false, 'physical');
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
    // Ink amplification now handled in applyRawDmg
  let normalDmg = Math.max(1, Math.round(baseNormal * critMult * calcDmgMult(eDef)));

  // Pierce damage per stack (ignores DEF)
  const pierceDmg = Math.round(attacker.atk * skill.perStackScale * stacks * critMult);

  applyRawDmg(attacker, target, normalDmg, false, false, 'physical');
  if (pierceDmg > 0) applyRawDmg(attacker, target, pierceDmg, false, false, 'true');
  const totalDmg = normalDmg + pierceDmg;

  // Floating numbers: physical on bottom, true on top
  if (stacks > 0) spawnFloatingNum(tElId, `墨迹×${stacks}引爆!`, 'crit-label', 0, -20);
  if (pierceDmg > 0) spawnFloatingNum(tElId, `-${pierceDmg}`, isCrit ? 'crit-pierce' : 'pierce-dmg', 0, 0);
  spawnFloatingNum(tElId, `-${normalDmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 22);
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
    let normalDmg = Math.max(1, Math.round(normalBase * critMult * calcDmgMult(eDef)));
  // Ink amplification
  if (target._inkStacks > 0) normalDmg = Math.round(normalDmg * (1 + target._inkStacks * 0.05));
  // Pierce damage portion (ignores DEF)
  const pierceDmg = Math.round(attacker.atk * skill.pierceScale * critMult);
  const totalDmg = normalDmg + pierceDmg;

  applyRawDmg(attacker, target, totalDmg, false, false, 'true');
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
  spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 0, 0);

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
    if (!target.alive) continue; // keep animating remaining hits
    const {isCrit, critMult} = calcCrit(attacker);
    const pierceDmg = Math.round(attacker.atk * skill.pierceScale * critMult);
    // Ink amplification
    const finalDmg = target._inkStacks > 0 ? Math.round(pierceDmg * (1 + target._inkStacks * 0.05)) : pierceDmg;

    applyRawDmg(attacker, target, finalDmg, true, false, 'true');
    totalPierce += finalDmg;
    spawnFloatingNum(tElId, `-${finalDmg}`, isCrit ? 'crit-true' : 'true-dmg', 0, (i % 3) * 28);
    await triggerOnHitEffects(attacker, target, finalDmg);

    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(400);
    if (tEl) tEl.classList.remove('hit-shake');
  }

  // Apply curse: 10% target maxHP per turn
  if (target.alive) {
    const dotDmg = Math.round(target.maxHp * 0.09);
    target.buffs.push({ type:'dot', value:dotDmg, turns:skill.dotTurns, sourceSide: attacker.side });
    spawnFloatingNum(tElId, '<img src="assets/status/curse-debuff-icon.png" style="width:16px;height:16px;vertical-align:middle">诅咒', 'debuff-label', 200, -10);
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
  spawnFloatingNum(fElId, `+${selfShield}`, 'shield-num', 0, 0);

  updateHpBar(caster, fElId);
  // Ally: 80% ATK permanent shield
  const allies = (caster.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive && a !== caster);
  for (const a of allies) {
    const allyShield = Math.round(caster.atk * skill.allyScale);
    a.shield += allyShield;
    const aElId = getFighterElId(a);
    spawnFloatingNum(aElId, `+${allyShield}`, 'shield-num', 0, 0);
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
    if (!target.alive) continue; // keep animating remaining hits
    const {isCrit, critMult} = calcCrit(attacker);
    const baseDmg = Math.round(attacker.atk * skill.atkScale) + Math.round(attacker.maxHp * skill.selfHpPct / 100);
    const eDef = calcEffDef(attacker, target);
        const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(eDef)));
    applyRawDmg(attacker, target, dmg, false, false, 'physical');
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
      spawnFloatingNum(aElId, `+${shieldAmt}`, 'shield-num', 0, 0);
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
    if (t > 0.05 && _origMathRandom() < 0.5) {
      const p = document.createElement('div');
      p.className = 'bamboo-trail';
      p.style.left = (x - 3 + (_origMathRandom()-0.5)*8) + 'px';
      p.style.top = (y - 3 + (_origMathRandom()-0.5)*8) + 'px';
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
  spawnFloatingNum(fElId, '<img src="assets/passive/bamboo-charge-icon.png" style="width:16px;height:16px;vertical-align:middle">蓄力...', 'passive-num', 0, -20);
  try { sfxBambooCharge(); } catch(e) {}
  await sleep(1000);

  // ── 打出强化普攻（魔法伤害，受魔抗减免） ──
  const rawDmg = Math.round(attacker.atk * p.atkPct / 100) + Math.round(attacker.maxHp * p.selfHpPct / 100);
  const effMr = calcEffDef(attacker, target, 'magic');
    const {isCrit, critMult} = calcCrit(attacker);
  const magicDmg = Math.max(1, Math.round(rawDmg * critMult * calcDmgMult(effMr)));
  applyRawDmg(attacker, target, magicDmg, false, false, 'magic');
  try { sfxBambooHit(); } catch(e) {}
  spawnFloatingNum(tElId, '<img src="assets/passive/bamboo-charge-icon.png" style="width:16px;height:16px;vertical-align:middle">充能!', 'crit-label', 0, -20);
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
  // healAmt (heal portion) is subject to healReduce; hpGain (max HP boost) is NOT
  const rawHealAmt = Math.round(attacker.maxHp * p.healSelfHpPct / 100);
  const healRed = (attacker.buffs.find(b => b.type === 'healReduce') || {}).value || 0;
  const healAmt = Math.round(rawHealAmt * (1 - healRed / 100));
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
  spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 0, 0);

  // Def + MR buff: 20%ATK each (diamondStructure passive will amplify in recalcStats)
  const defGain = Math.round(caster.atk * skill.defUpAtkPct / 100);
  const mrGain = Math.round(caster.atk * (skill.mrUpAtkPct || 0) / 100);
  caster.buffs.push({ type:'defUp', value:defGain, turns:skill.defUpTurns + 1 });
  if (mrGain > 0) caster.buffs.push({ type:'mrUp', value:mrGain, turns:skill.defUpTurns + 1 });
  recalcStats();
  spawnFloatingNum(fElId, `+${defGain}甲+${mrGain}抗`, 'passive-num', 200, 0);
  updateHpBar(caster, fElId);
  renderStatusIcons(caster);
  updateFighterStats(caster, fElId);
  addLog(`${caster.emoji}${caster.name} <b>坚不可摧</b>：<span class="log-shield">+${shieldAmt}护盾</span> <span class="log-passive">+${defGain}护甲 +${mrGain}魔抗 ${skill.defUpTurns}回合</span>`);
  await sleep(800);
}

async function doDiamondCollide(attacker, target, skill) {
  const tElId = getFighterElId(target);
  const {isCrit, critMult} = calcCrit(attacker);
  const baseDmg = Math.round(attacker.atk * skill.atkScale) + Math.round(attacker.def * skill.defScale) + Math.round((attacker.mr || attacker.def) * (skill.mrScale || 0)) + Math.round(attacker.maxHp * skill.selfHpPct / 100);
  const eDef = calcEffDef(attacker, target);
    const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(eDef)));
  applyRawDmg(attacker, target, dmg, false, false, 'physical');
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
    target._collideStacks = 0;
    target.buffs.push({ type:'stun', value:1, turns:2 });
    target._stunUsed = false;
    spawnFloatingNum(tElId, '💫眩晕!', 'crit-label', 0, -20);
    renderStatusIcons(target);
    addLog(`${target.emoji}${target.name} 被撞晕了！<span class="log-debuff">眩晕1回合</span>`);
  } else {
    target._collideStacks = attacker._diamondCollideCount[tIdx];
    renderStatusIcons(target);
    renderStatusIcons(target);
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
    if (!target.alive) continue; // keep animating remaining hits
    const eDef = calcEffDef(attacker, target);
        let effectiveCrit = attacker.crit;
    let overflowCritDmg = 0;
    if (effectiveCrit > 1.0) { overflowCritDmg = (effectiveCrit - 1.0) * (attacker.passive?.overflowMult || 1.5); effectiveCrit = 1.0; }
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmgPerm || 0) + overflowCritDmg) : 1;
    if (isCrit) totalCrits++;
    const dmg = Math.max(1, Math.round(perHit * critMult * calcDmgMult(eDef)));
    applyRawDmg(attacker, target, dmg, false, false, 'physical');
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
  const baseRaw = Math.round(attacker.atk * skill.atkScale);
  const dmgType = skill.dmgType || 'physical';
  let totalDmg = 0, totalCrits = 0;
  spawnFloatingNum(fElId, '<img src="assets/passive/gambler-blood-icon.png" style="width:16px;height:16px;vertical-align:middle">孤注一掷!', 'crit-label', 0, -20);
  for (const e of enemies) {
    if (!e.alive) continue;
    const {isCrit, critMult} = calcCrit(attacker);
    if (isCrit) totalCrits++;
    const effDef = calcEffDef(attacker, e, dmgType);

    const dmg = Math.max(1, Math.round(baseRaw * critMult * calcDmgMult(effDef)));
    applyRawDmg(attacker, e, dmg, false, false, dmgType);
    totalDmg += dmg;
    const eElId = getFighterElId(e);
    const cls = dmgType === 'magic' ? (isCrit ? 'crit-magic' : 'magic-dmg') : dmgType === 'true' ? (isCrit ? 'crit-true' : 'true-dmg') : (isCrit ? 'crit-dmg' : 'direct-dmg');
    spawnFloatingNum(eElId, `-${dmg}`, cls, 0, 0, { atkSide: attacker.side, amount: dmg });
    updateHpBar(e, eElId);
    await triggerOnHitEffects(attacker, e, dmg);
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
  const dmgLabel = dmgType === 'magic' ? '魔法' : dmgType === 'true' ? '真实' : '物理';
  const dmgClass = dmgType === 'magic' ? 'log-magic' : dmgType === 'true' ? 'log-pierce' : 'log-direct';
  addLog(`${attacker.emoji}${attacker.name} <b>孤注一掷</b>：全体敌方 <span class="${dmgClass}">${totalDmg}${dmgLabel}</span>${totalCrits > 0 ? ' <span class="log-crit">'+totalCrits+'暴击</span>' : ''} + ${skill.lifestealPct||10}%吸血`);
  await sleep(500);
}

async function doDiceFate(caster, skill) {
  const fElId = getFighterElId(caster);
  const critGain = skill.minCrit + Math.floor(Math.random() * (skill.maxCrit - skill.minCrit + 1));
  caster.buffs.push({ type:'diceFateCrit', value:critGain, turns:skill.duration + 1 });
  recalcStats();
  spawnFloatingNum(fElId, `<img src="assets/passive/gambler-blood-icon.png" style="width:16px;height:16px;vertical-align:middle">+${critGain}%暴击!`, 'crit-label', 0, -20);
  renderStatusIcons(caster);
  updateFighterStats(caster, fElId);
  addLog(`${caster.emoji}${caster.name} <b>命运骰子</b>：<span class="log-passive">+${critGain}%暴击率 ${skill.duration}回合</span>${caster.crit > 1 ? ' (溢出' + Math.round((caster.crit-1)*100) + '%→' + Math.round((caster.crit-1)*150) + '%爆伤)' : ''}`);
  await sleep(800);
}

// ── CHEST TURTLE (宝箱龟) ───────────────────────────────
// ── CHEST TURTLE (宝箱龟) NEW SKILLS ──────────────────────
async function doChestSmash(attacker, target, skill) {
  const tElId = getFighterElId(target);
  const hits = skill.hits || 4;
  const dmgType = hasChestEquip(attacker, 'star') ? 'true' : 'physical';
  let totalBasePower = Math.round(attacker.atk * skill.atkScale);
  if (hasChestEquip(attacker, 'rock')) {
    totalBasePower += attacker.def + (attacker.mr || attacker.def);
  }
  const perHitBase = Math.round(totalBasePower / hits);
  let totalDmg = 0;

  const hasThunder = hasChestEquip(attacker, 'thunder');
  for (let i = 0; i < hits; i++) {
    if (!target.alive) continue; // keep animating remaining hits
    const {isCrit, critMult} = calcCrit(attacker);
    const effDef = calcEffDef(attacker, target, dmgType);

    const dmg = Math.max(1, Math.round(perHitBase * critMult * calcDmgMult(effDef)));
    applyRawDmg(attacker, target, dmg, false, false, dmgType);
    totalDmg += dmg;
    const cls = dmgType === 'true' ? (isCrit ? 'crit-true' : 'true-dmg') : (isCrit ? 'crit-dmg' : 'direct-dmg');
    spawnFloatingNum(tElId, `-${dmg}`, cls, 0, (i % 3) * 28, { atkSide: attacker.side, amount: dmg });
    await triggerOnHitEffects(attacker, target, dmg);
    // Thunder equip: stack per hit
    if (hasThunder && target.alive) {
      target._goldLightning = (target._goldLightning || 0) + 1;
      renderStatusIcons(target);
      if (target._goldLightning >= 8) {
        target._goldLightning = 0;
        const thunderDmg = Math.round(attacker.atk * 1.0);
        applyRawDmg(attacker, target, thunderDmg, false, false, 'true');
        spawnFloatingNum(tElId, `-${thunderDmg}⚡`, 'true-dmg', 150, 0, { atkSide: attacker.side, amount: thunderDmg });
        updateHpBar(target, tElId);
      }
      renderStatusIcons(target);
    }
    // Update treasure display in real-time
    renderStatusIcons(attacker);
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(400);
    if (tEl) tEl.classList.remove('hit-shake');
  }
  // Track hit targets for post-skill effects (fire/poison)
  attacker._chestHitTargets = [target];
  // Chain equip: splash 25% of total damage to secondary target
  if (hasChestEquip(attacker, 'chain')) {
    const enemies = getAliveEnemiesWithSummons(attacker.side).filter(e => e !== target && e.alive);
    if (enemies.length) {
      const secondary = enemies[Math.floor(Math.random() * enemies.length)];
      const chainDmg = Math.max(1, Math.round(totalDmg * 0.25));
      applyRawDmg(attacker, secondary, chainDmg, false, false, dmgType);
      const sElId = getFighterElId(secondary);
      const chainCls = dmgType === 'true' ? 'true-dmg' : 'direct-dmg';
      spawnFloatingNum(sElId, `-${chainDmg}🔗`, chainCls, 100, 0, { atkSide: attacker.side, amount: chainDmg });
      updateHpBar(secondary, sElId);
      await triggerOnHitEffects(attacker, secondary, chainDmg);
      // Chain hit also stacks thunder
      if (hasThunder && secondary.alive) {
        secondary._goldLightning = (secondary._goldLightning || 0) + 1;
        renderStatusIcons(secondary);
        if (secondary._goldLightning >= 8) {
          secondary._goldLightning = 0;
          const thunderDmg = Math.round(attacker.atk * 1.0);
          applyRawDmg(attacker, secondary, thunderDmg, false, false, 'true');
          spawnFloatingNum(sElId, `-${thunderDmg}⚡`, 'true-dmg', 250, 0, { atkSide: attacker.side, amount: thunderDmg });
          updateHpBar(secondary, sElId);
        }
        renderStatusIcons(secondary);
      }
      attacker._chestHitTargets.push(secondary);
      renderStatusIcons(attacker);
      await sleep(300);
    }
  }
  // Post-skill: fire stone burn
  if (hasChestEquip(attacker, 'fire')) {
    for (const t of attacker._chestHitTargets) {
      if (!t.alive) continue;
      applySkillDebuffs({ burn: true }, t, attacker);
    }
  }
  // Post-skill: poison arrow heal reduce
  if (hasChestEquip(attacker, 'poison')) {
    for (const t of attacker._chestHitTargets) {
      if (!t.alive) continue;
      const existing = t.buffs.find(b => b.type === 'healReduce');
      if (existing) { existing.turns = 3; }
      else { t.buffs.push({ type: 'healReduce', value: 50, turns: 3 }); }
      spawnFloatingNum(getFighterElId(t), '☠️治疗削减', 'debuff-label', 400, -10);
      renderStatusIcons(t);
    }
  }
  addLog(`${attacker.emoji}${attacker.name} <b>宝箱砸击</b> ${hits}段 → ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}伤害</span>`);
}

async function doChestCount(caster, skill) {
  const fElId = getFighterElId(caster);
  // Scaling: +12% per 100 treasure
  const treasureBonus = 1 + Math.floor((caster._chestTreasure || 0) / 100) * 0.14;
  // Heal (use healHpPct if available, fallback to healPct for compat)
  const healAmt = Math.round(caster.maxHp * (skill.healHpPct || skill.healPct || 5) / 100 * treasureBonus);
  const before = caster.hp;
  // Check healReduce
  const healRedBuff = caster.buffs.find(b => b.type === 'healReduce');
  const healMult = healRedBuff ? (1 - healRedBuff.value / 100) : 1;
  const finalHeal = Math.round(healAmt * healMult);
  caster.hp = Math.min(caster.maxHp, caster.hp + finalHeal);
  const actual = Math.round(caster.hp - before);
  if (actual > 0) spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 0, 0);

  // Shield
  const shieldAmt = Math.round(caster.atk * skill.shieldAtkScale * treasureBonus);
  caster.shield += shieldAmt;
  spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 200, 0);
  updateHpBar(caster, fElId);
  const bonusPct = Math.round((treasureBonus - 1) * 100);
  addLog(`${caster.emoji}${caster.name} <b>清点财宝</b>：<span class="log-heal">+${actual}HP</span> <span class="log-shield">+${shieldAmt}护盾</span>${bonusPct > 0 ? ` (财宝加成+${bonusPct}%)` : ''}`);
  await sleep(800);
}

async function doChestStorm(attacker, skill) {
  const enemies = getAliveEnemiesWithSummons(attacker.side);
  if (!enemies.length) return;
  const hits = skill.hits || 6;
  const dmgType = hasChestEquip(attacker, 'star') ? 'true' : 'physical';
  const trueType = 'true';
  const hasThunder = hasChestEquip(attacker, 'thunder');
  let totalAll = 0;
  attacker._chestHitTargets = [...enemies.filter(e => e.alive)];

  for (let i = 0; i < hits; i++) {
    if (battleOver) break;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const {isCrit, critMult} = calcCrit(attacker);
      // Physical portion
      const physBase = Math.round(attacker.atk * skill.atkScale);
      const effDef = calcEffDef(attacker, enemy, dmgType);
  
      const physDmg = Math.max(1, Math.round(physBase * critMult * calcDmgMult(effDef)));
      // True portion
      const trueDmg = Math.round(attacker.atk * (skill.pierceScale || 0) * critMult);
      const eElId = getFighterElId(enemy);
      applyRawDmg(attacker, enemy, physDmg, false, false, dmgType);
      if (trueDmg > 0) applyRawDmg(attacker, enemy, trueDmg, false, false, trueType);
      totalAll += physDmg + trueDmg;
      const physCls = dmgType === 'true' ? (isCrit ? 'crit-true' : 'true-dmg') : (isCrit ? 'crit-dmg' : 'direct-dmg');
      spawnFloatingNum(eElId, `-${physDmg}`, physCls, 0, (i % 3) * 28 + 20, { atkSide: attacker.side, amount: physDmg });
      if (trueDmg > 0) spawnFloatingNum(eElId, `-${trueDmg}`, isCrit ? 'crit-true' : 'true-dmg', 0, (i % 3) * 28, { atkSide: attacker.side, amount: trueDmg });
      await triggerOnHitEffects(attacker, enemy, physDmg + trueDmg);
      // Thunder equip: stack per hit
      if (hasThunder && enemy.alive) {
        enemy._goldLightning = (enemy._goldLightning || 0) + 1;
        renderStatusIcons(enemy);
        if (enemy._goldLightning >= 8) {
          enemy._goldLightning = 0;
          const thunderDmg = Math.round(attacker.atk * 1.0);
          applyRawDmg(attacker, enemy, thunderDmg, false, false, 'true');
          spawnFloatingNum(eElId, `-${thunderDmg}⚡`, 'true-dmg', 100, 0, { atkSide: attacker.side, amount: thunderDmg });
          updateHpBar(enemy, eElId);
        }
        renderStatusIcons(enemy);
      }
      updateHpBar(enemy, eElId);
      const eEl = document.getElementById(eElId);
      if (eEl) eEl.classList.add('hit-shake');
    }
    // Update treasure display in real-time
    renderStatusIcons(attacker);
    await sleep(350);
    for (const enemy of enemies) {
      const eEl = document.getElementById(getFighterElId(enemy));
      if (eEl) eEl.classList.remove('hit-shake');
    }
  }
  // Post-skill: fire stone burn
  if (hasChestEquip(attacker, 'fire')) {
    for (const t of enemies) {
      if (t.alive) applySkillDebuffs({ burn: true }, t, attacker);
    }
  }
  // Post-skill: poison arrow
  if (hasChestEquip(attacker, 'poison')) {
    for (const t of enemies) {
      if (!t.alive) continue;
      const existing = t.buffs.find(b => b.type === 'healReduce');
      if (existing) { existing.turns = 3; }
      else { t.buffs.push({ type: 'healReduce', value: 50, turns: 3 }); }
      spawnFloatingNum(getFighterElId(t), '☠️治疗削减', 'debuff-label', 400, -10);
      renderStatusIcons(t);
    }
  }
  addLog(`${attacker.emoji}${attacker.name} <b>财宝风暴</b> ${hits}段全体：共 <span class="log-direct">${totalAll}伤害</span>`);
}

// (Legacy chest open — kept for summon compatibility)
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
  spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 200, 0);
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
      applyRawDmg(f, e, waveDmg, false, false, 'physical');
      const eElId = getFighterElId(e);
      spawnFloatingNum(eElId, `-${waveDmg}⚡`, 'pierce-dmg', 0, 0);
      updateHpBar(e, eElId);
    }
    // Shield for self
    const shieldAmt = Math.round(stored * f.passive.energyShieldScale * f.atk);
    f.shield += shieldAmt;
    const fElId = getFighterElId(f);
    spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 0, 0);
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


