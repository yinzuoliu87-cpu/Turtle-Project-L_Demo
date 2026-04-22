async function doGhostTouch(attacker, target, skill) {
  const tElId = getFighterElId(target);
  const {isCrit, critMult} = calcCrit(attacker);
  // Normal damage portion
  const normalBase = Math.round(attacker.atk * skill.normalScale);
  const eDef = calcEffDef(attacker, target);
    let normalDmg = Math.max(1, Math.round(normalBase * critMult * calcDmgMult(eDef)));
  // Ink amplification
  if (target._inkStacks > 0) normalDmg = Math.round(normalDmg * (1 + target._inkStacks * 0.05));
  // Pierce damage portion (ignores DEF)
  const pierceDmg = Math.round(attacker.atk * skill.pierceScale * critMult);
  const totalDmg = normalDmg + pierceDmg;

  applyRawDmg(attacker, target, totalDmg, false, false, 'true');
  // Canonical stack: pierce (white) above physical (red). yOffset=+22 pushes
  // pierce higher on screen per the "true > magic > physical" rule.
  if (normalDmg > 0) spawnFloatingNum(tElId, `-${normalDmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, {atkSide: attacker.side, amount: normalDmg});
  if (pierceDmg > 0) spawnFloatingNum(tElId, `-${pierceDmg}`, isCrit ? 'crit-pierce' : 'pierce-dmg', 100, 22, {atkSide: attacker.side, amount: pierceDmg});
  await triggerOnHitEffects(attacker, target, totalDmg);

  const tEl = document.getElementById(tElId);
  if (tEl) tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(700);
  if (tEl) tEl.classList.remove('hit-shake');

  addLog(`${attacker.emoji}${attacker.name} <b>幽魂触碰</b> → ${target.emoji}${target.name}：<span class="log-direct">${normalDmg}物理</span> + <span class="log-pierce">${pierceDmg}真实</span>`);
}

async function doGhostPhase(caster, skill) {
  const fElId = getFighterElId(caster);
  // Shield
  const shieldAmt = Math.round(caster.atk * skill.shieldScale);
  caster.shield += shieldAmt;
  spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 0, 0);

  // Dodge buff
  caster.buffs.push({ type:'dodge', value:skill.dodgePct, turns:skill.dodgeTurns + 1 }); // +1 because processBuffs ticks at start
  spawnFloatingNum(fElId, `👻虚化！闪避${skill.dodgePct}%`, 'passive-num', 200, 0);
  updateHpBar(caster, fElId);
  renderStatusIcons(caster);
  addLog(`${caster.emoji}${caster.name} <b>虚化</b>：<span class="log-shield">+${shieldAmt}护盾</span> + <span class="log-passive">${skill.dodgePct}%闪避 ${skill.dodgeTurns}回合</span>`);
  await sleep(800);
}

async function doGhostStorm(attacker, target, skill) {
  const tElId = getFighterElId(target);
  let totalPierce = 0;

  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) continue; // keep animating remaining hits
    const {isCrit, critMult} = calcCrit(attacker);
    const pierceDmg = Math.round(attacker.atk * skill.pierceScale * critMult);
    // Ink amplification
    const finalDmg = target._inkStacks > 0 ? Math.round(pierceDmg * (1 + target._inkStacks * 0.05)) : pierceDmg;

    applyRawDmg(attacker, target, finalDmg, true, false, 'true');
    totalPierce += finalDmg;
    spawnFloatingNum(tElId, `-${finalDmg}`, isCrit ? 'crit-true' : 'true-dmg', 0, 0);
    await triggerOnHitEffects(attacker, target, finalDmg);

    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(400);
    if (tEl) tEl.classList.remove('hit-shake');
  }

  // Apply curse: 10% target maxHP per turn
  if (target.alive) {
    const dotDmg = Math.round(target.maxHp * 0.09);
    target.buffs.push({ type:'dot', value:dotDmg, turns:skill.dotTurns, sourceSide: attacker.side, floatCls:'true-dmg' });
    spawnFloatingNum(tElId, '<img src="assets/status/curse-debuff-icon.png" style="width:16px;height:16px;vertical-align:middle">诅咒', 'debuff-label', 200, -10);
    renderStatusIcons(target);
  }

  addLog(`${attacker.emoji}${attacker.name} <b>灵魂风暴</b> ${skill.hits}段 → ${target.emoji}${target.name}：<span class="log-pierce">${totalPierce}真实</span> + 诅咒${skill.dotTurns}回合`);
}

// ── ICE SHIELD (寒冰龟) ─────────────────────────────────
