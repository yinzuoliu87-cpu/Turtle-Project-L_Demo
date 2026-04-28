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
      spawnFloatingNum(eElId, `${dmg}`, cls, 0, 0, { atkSide: attacker.side, amount: dmg });
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
