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
  const hasChain = hasChestEquip(attacker, 'chain');
  attacker._chestHitTargets = [target];
  for (let i = 0; i < hits; i++) {
    if (!target.alive) continue; // keep animating remaining hits
    const {isCrit, critMult} = calcCrit(attacker);
    const effDef = calcEffDef(attacker, target, dmgType);

    const dmg = Math.max(1, Math.round(perHitBase * critMult * calcDmgMult(effDef)));
    applyRawDmg(attacker, target, dmg, false, false, dmgType);
    totalDmg += dmg;
    const cls = dmgType === 'true' ? (isCrit ? 'crit-true' : 'true-dmg') : (isCrit ? 'crit-dmg' : 'direct-dmg');
    spawnFloatingNum(tElId, `-${dmg}`, cls, 0, 0, { atkSide: attacker.side, amount: dmg });
    await triggerOnHitEffects(attacker, target, dmg);
    // Thunder equip: stack per hit
    if (hasThunder && target.alive) {
      target._goldLightning = (target._goldLightning || 0) + 1;
      renderStatusIcons(target);
      if (target._goldLightning >= 5) {
        target._goldLightning = 0;
        spawnLightningStrike(tElId);
        const thunderDmg = Math.round(attacker.atk * 1.0);
        applyRawDmg(attacker, target, thunderDmg, false, false, 'true');
        spawnFloatingNum(tElId, `-${thunderDmg}⚡`, 'true-dmg', 150, 0, { atkSide: attacker.side, amount: thunderDmg });
        updateHpBar(target, tElId);
      }
      renderStatusIcons(target);
    }
    // Chain equip: per-hit splash 25% of THIS hit to a random other enemy (visible per segment)
    if (hasChain) {
      const others = getAliveEnemiesWithSummons(attacker.side).filter(e => e !== target && e.alive);
      if (others.length) {
        const secondary = others[Math.floor(Math.random() * others.length)];
        const chainDmg = Math.max(1, Math.round(dmg * 0.25));
        applyRawDmg(attacker, secondary, chainDmg, false, false, dmgType);
        const sElId = getFighterElId(secondary);
        const chainCls = dmgType === 'true' ? 'true-dmg' : 'direct-dmg';
        spawnFloatingNum(sElId, `-${chainDmg}🔗`, chainCls, 60, 0, { atkSide: attacker.side, amount: chainDmg });
        updateHpBar(secondary, sElId);
        if (hasThunder && secondary.alive) {
          secondary._goldLightning = (secondary._goldLightning || 0) + 1;
          renderStatusIcons(secondary);
          if (secondary._goldLightning >= 5) {
            secondary._goldLightning = 0;
            spawnLightningStrike(sElId);
            const thunderDmg = Math.round(attacker.atk * 1.0);
            applyRawDmg(attacker, secondary, thunderDmg, false, false, 'true');
            spawnFloatingNum(sElId, `-${thunderDmg}⚡`, 'true-dmg', 200, 0, { atkSide: attacker.side, amount: thunderDmg });
            updateHpBar(secondary, sElId);
          }
        }
        if (!attacker._chestHitTargets.includes(secondary)) attacker._chestHitTargets.push(secondary);
      }
    }
    // Update treasure display in real-time
    renderStatusIcons(attacker);
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(400);
    if (tEl) tEl.classList.remove('hit-shake');
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
      // Stack order: true on top, physical below
      const physCls = dmgType === 'true' ? (isCrit ? 'crit-true' : 'true-dmg') : (isCrit ? 'crit-dmg' : 'direct-dmg');
      spawnFloatingNum(eElId, `-${physDmg}`, physCls, 0, 0, { atkSide: attacker.side, amount: physDmg });
      if (trueDmg > 0) spawnFloatingNum(eElId, `-${trueDmg}`, isCrit ? 'crit-true' : 'true-dmg', 0, 22, { atkSide: attacker.side, amount: trueDmg });
      await triggerOnHitEffects(attacker, enemy, physDmg + trueDmg);
      // Thunder equip: stack per hit
      if (hasThunder && enemy.alive) {
        enemy._goldLightning = (enemy._goldLightning || 0) + 1;
        renderStatusIcons(enemy);
        if (enemy._goldLightning >= 5) {
          enemy._goldLightning = 0;
          spawnLightningStrike(eElId);
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
    // Level-scaled percentages (Lv.1 → 60%/80%, +1%/level).
    const lvl = Math.max(1, f._level || 1);
    const perLv = f.passive.perLevelPct || 0.01;
    const dmgPct = (f.passive.energyDmgPct || 0.60) + (lvl - 1) * perLv;
    const shieldPct = (f.passive.energyShieldPct || 0.80) + (lvl - 1) * perLv;
    // Wave damage to all enemies (physical, no ATK multiplier)
    const waveDmg = Math.max(1, Math.round(stored * dmgPct));
    for (const e of enemies) {
      applyRawDmg(f, e, waveDmg, false, false, 'physical');
      const eElId = getFighterElId(e);
      spawnFloatingNum(eElId, `-${waveDmg}⚡`, 'direct-dmg', 0, 0, { atkSide: f.side, amount: waveDmg });
      updateHpBar(e, eElId);
    }
    // Shield for self
    const shieldAmt = Math.round(stored * shieldPct);
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


