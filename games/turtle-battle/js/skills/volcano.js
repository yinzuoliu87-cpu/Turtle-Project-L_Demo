async function doVolcanoSmash(attacker, target, skill) {
  const {isCrit, critMult} = calcCrit(attacker);
  let baseDmg = Math.round(attacker.atk * skill.atkScale);
  if (skill.selfHpPct) baseDmg += Math.round(attacker.maxHp * skill.selfHpPct / 100);
  const effDef = calcEffDef(attacker, target, 'physical');
    const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effDef)));
  const tElId = getFighterElId(target);
  applyRawDmg(attacker, target, dmg, false, false, 'physical');
  spawnFloatingNum(tElId, `${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, {atkSide:attacker.side, amount:dmg});
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
      // Stack order: true on top, magic below
      spawnFloatingNum(eElId, `${magicDmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0, {atkSide:attacker.side, amount:magicDmg});
      if (trueDmg > 0) spawnFloatingNum(eElId, `${trueDmg}`, isCrit ? 'crit-true' : 'true-dmg', 0, 22, {atkSide:attacker.side, amount:trueDmg});
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
