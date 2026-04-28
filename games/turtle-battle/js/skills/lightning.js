async function doLightningStrike(attacker, mainTarget, skill) {
  // 5 hits on main target, each hit splashes 25% to secondary target
  const totalDmg = Math.round(attacker.atk * skill.atkScale);
  const perHit = Math.round(totalDmg / skill.hits);
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  const secondaryTarget = enemies.find(e => e !== mainTarget && e.alive);
  const tElId = getFighterElId(mainTarget);
  let totalMain = 0, totalSplash = 0;

  for (let i = 0; i < skill.hits; i++) {
    if (!mainTarget.alive) break;
    const {isCrit, critMult} = calcCrit(attacker);
    // Main target: normal damage through DEF
    const effectiveDef = calcEffDef(attacker, mainTarget, 'magic');
        const dmg = Math.max(1, Math.round(perHit * critMult * calcDmgMult(effectiveDef)));
    applyRawDmg(attacker, mainTarget, dmg, false, false, 'magic');
    totalMain += dmg;
    spawnFloatingNum(tElId, `${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0);
    await triggerOnHitEffects(attacker, mainTarget, dmg);
    // Splash to secondary
    if (secondaryTarget && secondaryTarget.alive) {
      const splashDmg = Math.max(1, Math.round(dmg * skill.splashPct / 100));
      applyRawDmg(attacker, secondaryTarget, splashDmg, false, false, 'magic');
      totalSplash += splashDmg;
      const sElId = getFighterElId(secondaryTarget);
      spawnFloatingNum(sElId, `${splashDmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 200, 0);
      updateHpBar(secondaryTarget, sElId);
      await triggerOnHitEffects(attacker, secondaryTarget, splashDmg);
    }
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    updateHpBar(mainTarget, tElId);
    await sleep(600);
    tEl.classList.remove('hit-shake');
    await sleep(100);
  }
  let logStr = `${attacker.emoji}${attacker.name} <b>闪电打击</b> → ${mainTarget.emoji}${mainTarget.name}：<span class="log-direct">${totalMain}伤害</span>`;
  if (totalSplash > 0 && secondaryTarget) logStr += ` + ${secondaryTarget.emoji}溅射<span class="log-direct">${totalSplash}</span>`;
  addLog(logStr);
}

async function doLightningBuff(caster, skill) {
  const allies = (caster.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
  for (const ally of allies) {
    const val = Math.round(ally.baseAtk * skill.atkUpPct / 100);
    const existing = ally.buffs.find(b => b.type === 'atkUp');
    if (existing) { existing.value = Math.max(existing.value, val); existing.turns = Math.max(existing.turns, skill.atkUpTurns); }
    else ally.buffs.push({ type: 'atkUp', value: val, turns: skill.atkUpTurns });
    const aElId = getFighterElId(ally);
    spawnFloatingNum(aElId, `+${val}攻`, 'passive-num', 0, 0);
    renderStatusIcons(ally);
  }
  recalcStats();
  addLog(`${caster.emoji}${caster.name} <b>威力增幅</b>：全体友方 <span class="log-passive">攻击+${skill.atkUpPct}% ${skill.atkUpTurns}回合</span>`);
  await sleep(1000);
}

async function doLightningBarrage(attacker, skill) {
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  if (!enemies.length) return;
  const perHitDmg = Math.round(attacker.atk * skill.arrowScale);

  for (let i = 0; i < skill.hits; i++) {
    const alive = enemies.filter(e => e.alive);
    if (!alive.length) break;
    const target = alive[Math.floor(Math.random() * alive.length)];
    const {isCrit, critMult} = calcCrit(attacker);
    // Normal damage through DEF
    const effectiveDef = calcEffDef(attacker, target, 'magic');
        const dmg = Math.max(1, Math.round(perHitDmg * critMult * calcDmgMult(effectiveDef)));
    applyRawDmg(attacker, target, dmg, false, false, 'magic', false, true);
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, `${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0);
    await triggerOnHitEffects(attacker, target, dmg);
    updateHpBar(target, tElId);
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    await sleep(280);
    tEl.classList.remove('hit-shake');
    await sleep(70);
  }
  addLog(`${attacker.emoji}${attacker.name} <b>雷暴</b> ${skill.hits}次随机闪电，每次 <span class="log-direct">${perHitDmg}伤害</span>`);
}

// ── STAR TURTLE SKILLS ────────────────────────────────────

// Helper: add star energy
