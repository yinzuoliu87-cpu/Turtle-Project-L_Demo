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
      spawnFloatingNum(eElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, {atkSide:attacker.side, amount:dmg});
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
