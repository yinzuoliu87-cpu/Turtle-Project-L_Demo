async function doHunterShot(attacker, target, skill) {
  // If target < execThresh% HP: +execCrit% crit, +execCritDmg% crit damage
  const isExec = target.hp / target.maxHp < skill.execThresh / 100;
  const savedCrit = attacker.crit;
  if (isExec) {
    attacker.crit += skill.execCrit / 100;
    addLog(`${attacker.emoji}${attacker.name} 猎人本能！目标生命值低，<span class="log-crit">暴击率+${skill.execCrit}% 暴击伤害+${skill.execCritDmg}%</span>`);
  }
  // Temporarily boost crit damage multiplier
  attacker._extraCritDmg = isExec ? skill.execCritDmg / 100 : 0;
  await doDamage(attacker, target, skill);
  attacker.crit = savedCrit;
  attacker._extraCritDmg = 0;
}

async function doHunterBarrage(attacker, skill) {
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  if (!enemies.length) return;
  const baseArrow = Math.round(attacker.atk * skill.arrowScale);
  let totalDmg = 0, totalCrits = 0;

  for (let i = 0; i < skill.hits; i++) {
    const alive = enemies.filter(e => e.alive);
    if (!alive.length) break;
    const target = alive[Math.floor(Math.random() * alive.length)];
    // Crit per arrow
    let effectiveCrit = attacker.crit;
    if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) effectiveCrit += attacker.passive.pct / 100;
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmgPerm || 0)) : 1;
    if (isCrit) totalCrits++;
    const arrowDmg = Math.max(1, Math.round(baseArrow * critMult));
    applyRawDmg(attacker, target, arrowDmg, true, false, 'true');
    totalDmg += arrowDmg;
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, `-${arrowDmg}`, isCrit ? 'crit-true' : 'true-dmg', 0, 0, {atkSide: attacker.side, amount: arrowDmg});
    await triggerOnHitEffects(attacker, target, arrowDmg);
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(280);
    if (tEl) tEl.classList.remove('hit-shake');
  }
  addLog(`${attacker.emoji}${attacker.name} <b>${skill.name}</b> ${skill.hits}根箭：<span class="log-pierce">${totalDmg}真实</span>${totalCrits > 0 ? ' <span class="log-crit">'+totalCrits+'暴击</span>' : ''}`);
}

async function doHunterStealth(attacker, target, skill) {
  // 1) Deal damage
  const dmgSkill = { ...skill, power: 0, atkScale: skill.dmgScale, hits: 1, type: 'physical' };
  await doDamage(attacker, target, dmgSkill);

  // 2) Gain dodge buff
  const existing = attacker.buffs.find(b => b.type === 'dodge');
  if (existing) { existing.turns = Math.max(existing.turns, skill.dodgeTurns); }
  else attacker.buffs.push({ type: 'dodge', value: skill.dodgePct, turns: skill.dodgeTurns });

  // 3) Gain shield
  const shieldAmt = Math.round(attacker.atk * skill.shieldScale);
  attacker.shield += shieldAmt;

  const fElId = getFighterElId(attacker);
  spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 200, 0);
  spawnFloatingNum(fElId, `闪避${skill.dodgePct}%`, 'passive-num', 400, -15);
  updateHpBar(attacker, fElId);
  renderStatusIcons(attacker);
  addLog(`${attacker.emoji}${attacker.name} 进入隐蔽：<span class="log-passive">闪避${skill.dodgePct}% ${skill.dodgeTurns}回合</span> + <span class="log-shield">护盾+${shieldAmt}</span>`);
}

