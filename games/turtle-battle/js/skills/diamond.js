async function doDiamondFortify(caster, skill) {
  const fElId = getFighterElId(caster);
  // Shield: 15% maxHP
  const shieldAmt = Math.round(caster.maxHp * skill.shieldHpPct / 100);
  caster.shield += shieldAmt;
  spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 0, 0);

  // Def + MR buff: 20%ATK each (diamondStructure passive will amplify in recalcStats)
  const defGain = Math.round(caster.atk * skill.defUpAtkPct / 100);
  const mrGain = Math.round(caster.atk * (skill.mrUpAtkPct || 0) / 100);
  caster.buffs.push({ type:'defUp', value:defGain, turns:skill.defUpTurns + 1 });
  if (mrGain > 0) caster.buffs.push({ type:'mrUp', value:mrGain, turns:skill.defUpTurns + 1 });
  recalcStats();
  spawnFloatingNum(fElId, `+${defGain}甲+${mrGain}抗`, 'passive-num', 200, 0);
  updateHpBar(caster, fElId);
  renderStatusIcons(caster);
  updateFighterStats(caster, fElId);
  addLog(`${caster.emoji}${caster.name} <b>坚不可摧</b>：<span class="log-shield">+${shieldAmt}护盾</span> <span class="log-passive">+${defGain}护甲 +${mrGain}魔抗 ${skill.defUpTurns}回合</span>`);
  await sleep(800);
}

async function doDiamondCollide(attacker, target, skill) {
  const tElId = getFighterElId(target);
  const {isCrit, critMult} = calcCrit(attacker);
  const baseDmg = Math.round(attacker.atk * skill.atkScale) + Math.round(attacker.def * skill.defScale) + Math.round((attacker.mr || attacker.def) * (skill.mrScale || 0)) + Math.round(attacker.maxHp * skill.selfHpPct / 100);
  const eDef = calcEffDef(attacker, target);
    const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(eDef)));
  applyRawDmg(attacker, target, dmg, false, false, 'physical');
  spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0);
  await triggerOnHitEffects(attacker, target, dmg);
  const tEl = document.getElementById(tElId);
  if (tEl) tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  // Track collision count for stun
  const tIdx = allFighters.indexOf(target);
  if (!attacker._diamondCollideCount) attacker._diamondCollideCount = {};
  attacker._diamondCollideCount[tIdx] = (attacker._diamondCollideCount[tIdx] || 0) + 1;
  if (attacker._diamondCollideCount[tIdx] >= skill.stunAfter && target.alive) {
    attacker._diamondCollideCount[tIdx] = 0;
    target._collideStacks = 0;
    target.buffs.push({ type:'stun', value:1, turns:2 });
    target._stunUsed = false;
    spawnFloatingNum(tElId, '💫眩晕!', 'crit-label', 0, -20);
    renderStatusIcons(target);
    addLog(`${target.emoji}${target.name} 被撞晕了！<span class="log-debuff">眩晕1回合</span>`);
  } else {
    target._collideStacks = attacker._diamondCollideCount[tIdx];
    renderStatusIcons(target);
    renderStatusIcons(target);
  }
  await sleep(700);
  if (tEl) tEl.classList.remove('hit-shake');
  addLog(`${attacker.emoji}${attacker.name} <b>碰撞</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span>`);
}

// ── DICE TURTLE (骰子龟) ────────────────────────────────
