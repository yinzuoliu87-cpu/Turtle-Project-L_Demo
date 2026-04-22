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

      // Stack order: true on top, magic below (larger yOffset = higher on screen)
      const magicCls = isCrit ? 'crit-magic' : 'magic-dmg';
      const trueCls = isCrit ? 'crit-true' : 'true-dmg';
      spawnFloatingNum(eElId, `-${magicDmg}`, magicCls, 0, 0, { atkSide: attacker.side, amount: magicDmg });
      if (trueDmg > 0) spawnFloatingNum(eElId, `-${trueDmg}`, trueCls, 0, 22, { atkSide: attacker.side, amount: trueDmg });

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
