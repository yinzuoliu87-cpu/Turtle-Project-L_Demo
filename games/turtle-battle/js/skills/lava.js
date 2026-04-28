async function doLavaBolt(attacker, target, skill) {
  const {isCrit, critMult} = calcCrit(attacker);
  let baseDmg = Math.round(attacker.atk * skill.atkScale);
  const effDef = calcEffDef(attacker, target, 'magic');
    const mainDmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effDef)));
  const hpBonusDmg = skill.targetHpPct ? Math.round(target.maxHp * skill.targetHpPct / 100 * critMult) : 0;
  const dmg = mainDmg + hpBonusDmg;
  const tElId = getFighterElId(target);
  applyRawDmg(attacker, target, dmg, false, false, 'magic');
  spawnFloatingNum(tElId, `${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0, {atkSide:attacker.side, amount:dmg});
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
    spawnFloatingNum(eElId, `${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0, {atkSide:attacker.side, amount:dmg});
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
  spawnFloatingNum(tElId, `${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0, {atkSide:attacker.side, amount:dmg});
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
