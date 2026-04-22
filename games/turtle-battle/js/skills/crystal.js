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
    // Trigger crystallize stacking FIRST so any detonation damage is available
    await triggerOnHitEffects(attacker, target, dmg);
    // Merge pending crystal detonation into the hit's magic float (Ornn-brittle style)
    const boom = target._pendingCrystalBoom || 0;
    target._pendingCrystalBoom = 0;
    const shown = dmg + boom;
    totalDmg += boom;
    spawnFloatingNum(tElId, `-${shown}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0, {atkSide:attacker.side, amount:shown});
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
  const hits = skill.hits || 3;
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
      // Trigger crystallize stacking first (may detonate, stash damage)
      await triggerOnHitEffects(attacker, enemy, magicDmg + trueDmg);
      const boom = enemy._pendingCrystalBoom || 0;
      enemy._pendingCrystalBoom = 0;
      totalAll += boom;
      const shownMagic = magicDmg + boom;
      // Stack order: true on top, magic below (larger yOffset = higher on screen)
      spawnFloatingNum(eElId, `-${shownMagic}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0, {atkSide:attacker.side, amount:shownMagic});
      if (trueDmg > 0) spawnFloatingNum(eElId, `-${trueDmg}`, isCrit ? 'crit-true' : 'true-dmg', 0, 22, {atkSide:attacker.side, amount:trueDmg});
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
