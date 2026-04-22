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
      spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-pierce' : 'pierce-dmg', 0, 0);
    } else {
      const eDef = calcEffDef(attacker, target);
            dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(eDef)));
      applyRawDmg(attacker, target, dmg, false, false, 'magic');
      spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0);
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
  const isAlly = stolen.type === 'heal' || stolen.type === 'shield' || stolen.type === 'bubbleShield' || stolen.type === 'angelBless';
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
