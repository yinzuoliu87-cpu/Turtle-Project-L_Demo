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
    spawnFloatingNum(eElId, `${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, {atkSide:attacker.side, amount:dmg});
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
