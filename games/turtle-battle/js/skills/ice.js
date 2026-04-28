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
      spawnFloatingNum(tElId, '闪避!', 'dodge-num', 0, 0);
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
    const yOff = 0;

    if (isPhysical) {
      dmg = Math.max(1, Math.round(raw * critMult * calcDmgMult(effectiveDef)));
      if (attacker.passive && attacker.passive.type === 'frostAura' && attacker.passive.bonusTargets && attacker.passive.bonusTargets.includes(target.id)) {
        dmg = Math.round(dmg * (1 + attacker.passive.bonusDmgPct / 100));
      }
      applyRawDmg(attacker, target, dmg, false, false, 'physical');
      totalNormal += dmg;
      spawnFloatingNum(tElId, `${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, yOff, {atkSide: attacker.side, amount: dmg});
    } else {
      const effMr = calcEffDef(attacker, target, 'magic');
            dmg = Math.max(1, Math.round(raw * critMult * calcDmgMult(effMr)));
      if (attacker.passive && attacker.passive.type === 'frostAura' && attacker.passive.bonusTargets && attacker.passive.bonusTargets.includes(target.id)) {
        dmg = Math.round(dmg * (1 + attacker.passive.bonusDmgPct / 100));
      }
      applyRawDmg(attacker, target, dmg, false, false, 'magic');
      totalPierce += dmg;
      spawnFloatingNum(tElId, `${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, yOff, {atkSide: attacker.side, amount: dmg});
    }

    await triggerOnHitEffects(attacker, target, dmg);

    // Judgement passive — magic damage reduced by MR
    if (attacker.passive && attacker.passive.type === 'judgement' && target.alive) {
      const judgeRaw = Math.round(target.hp * attacker.passive.hpPct / 100);
      const jMr = calcEffDef(attacker, target, 'magic');
            const judgeReduced = Math.max(1, Math.round(judgeRaw * calcDmgMult(jMr) * critMult));
      applyRawDmg(attacker, target, judgeReduced, false, false, 'magic');
      totalNormal += judgeReduced;
      // Canonical stack: judgement magic sits ABOVE the main physical hit (rule: blue > red).
      spawnFloatingNum(tElId, `${judgeReduced}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, yOff + 22, {atkSide: attacker.side, amount: judgeReduced});
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
      spawnFloatingNum(eElId, `${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, (h % 3) * 28, {atkSide: attacker.side, amount: dmg});
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
