async function doAngelBless(caster, target, skill) {
  const shieldAmt = Math.round(caster.atk * skill.shieldScale);
  const defGain = Math.round(caster.atk * skill.defBoostScale);
  target.shield += shieldAmt;
  target.buffs.push({ type:'defUp', value:defGain, turns:skill.defBoostTurns });
  target.buffs.push({ type:'mrUp', value:defGain, turns:skill.defBoostTurns });
  recalcStats();
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `+${shieldAmt}`, 'shield-num', 0, 0);
  spawnFloatingNum(tElId, `+${defGain}护甲&魔抗`, 'passive-num', 300, 0);
  updateHpBar(target, tElId);
  updateFighterStats(target, tElId);
  renderStatusIcons(target);

  addLog(`${caster.emoji}${caster.name} <b>祝福</b> → ${target.emoji}${target.name}：<span class="log-shield">+${shieldAmt}护盾</span>(${skill.shieldTurns}回合) + <span class="log-passive">护甲&魔抗+${defGain}</span>(${skill.defBoostTurns}回合)`);
  await sleep(1000);
}

async function doAngelEquality(attacker, target, skill) {
  const tElId = getFighterElId(target);
  const isHighRarity = skill.antiHighRarity.includes(target.rarity);
  let totalDmgDealt = 0;

  // Track judgement passive damage for this skill
  skill._judgeTotal = 0;

  // Effective crit
  let effectiveCrit = attacker.crit;
  if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
    effectiveCrit += attacker.passive.pct / 100;
  }
  const forceCrit = isHighRarity && skill.forceCrit;
  const isCrit = forceCrit || Math.random() < effectiveCrit;
  const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;

  const effectiveDef = calcEffDef(attacker, target);
  
  // ── Hit 1: normal damage ──
  const normalRaw = Math.round(attacker.atk * skill.normalScale);
  let normalDmg = Math.max(1, Math.round(normalRaw * critMult * calcDmgMult(effectiveDef)));
  // Passive bonusDmgAbove60
  if (attacker.passive && attacker.passive.type === 'bonusDmgAbove60' && target.hp / target.maxHp > 0.6) {
    normalDmg = Math.round(normalDmg * (1 + attacker.passive.pct / 100));
  }
  applyRawDmg(attacker, target, normalDmg, false, false, 'physical');
  totalDmgDealt += normalDmg;


  spawnFloatingNum(tElId, `-${normalDmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 80, 0);
  updateHpBar(target, tElId);
  await triggerOnHitEffects(attacker, target, normalDmg);

  // Judgement passive on hit 1 — magic damage
  if (attacker.passive && attacker.passive.type === 'judgement' && target.alive) {
    const judgeRaw = Math.round(target.hp * attacker.passive.hpPct / 100);
    const jMr = calcEffDef(attacker, target, 'magic');
        const judgeReduced = Math.max(1, Math.round(judgeRaw * calcDmgMult(jMr) * critMult));
    applyRawDmg(attacker, target, judgeReduced, false, false, 'magic');
    totalDmgDealt += judgeReduced;
    skill._judgeTotal += judgeReduced;
    // Canonical stack: magic (blue) above physical (red) — yOffset=+22
    spawnFloatingNum(tElId, `-${judgeReduced}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 22, {atkSide: attacker.side, amount: judgeReduced});
    updateHpBar(target, tElId);
  }

  const tEl1 = document.getElementById(tElId);
  if (tEl1) { tEl1.classList.add('hit-shake'); }
  await sleep(700);
  if (tEl1) { tEl1.classList.remove('hit-shake'); }
  await sleep(200);

  // ── Hit 2: pierce damage ──
  if (target.alive) {
    const pierceRaw = Math.round(attacker.atk * skill.pierceScale);
    const pierceDmg = Math.max(1, Math.round(pierceRaw * critMult)); // pierce ignores DEF
    applyRawDmg(attacker, target, pierceDmg, true, false, 'true');
    totalDmgDealt += pierceDmg;


    spawnFloatingNum(tElId, `-${pierceDmg}`, isCrit ? 'crit-pierce' : 'pierce-dmg', 80, 24, {atkSide: attacker.side, amount: pierceDmg});
    updateHpBar(target, tElId);
    await triggerOnHitEffects(attacker, target, pierceDmg);

    // Judgement passive on hit 2 — magic damage
    if (attacker.passive && attacker.passive.type === 'judgement' && target.alive) {
      const judgeRaw = Math.round(target.hp * attacker.passive.hpPct / 100);
      const jMr2 = calcEffDef(attacker, target, 'magic');
            const judgeReduced = Math.max(1, Math.round(judgeRaw * calcDmgMult(jMr2) * critMult));
      applyRawDmg(attacker, target, judgeReduced, false, false, 'magic');
      totalDmgDealt += judgeReduced;
      skill._judgeTotal += judgeReduced;
      spawnFloatingNum(tElId, `-${judgeReduced}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 4, {atkSide: attacker.side, amount: judgeReduced});
      updateHpBar(target, tElId);
    }

    const tEl2 = document.getElementById(tElId);
    if (tEl2) { tEl2.classList.add('hit-shake'); }
    await sleep(700);
    if (tEl2) { tEl2.classList.remove('hit-shake'); }
    await sleep(200);
  }

  // Log
  const parts = [];
  parts.push(`<span class="log-direct">魔法${Math.round(attacker.atk * skill.normalScale)}</span>`);
  parts.push(`<span class="log-pierce">真实${Math.round(attacker.atk * skill.pierceScale)}</span>`);
  if (skill._judgeTotal > 0) parts.push(`<span class="log-passive">⚖裁决${skill._judgeTotal}</span>`);
  if (isCrit) parts.push(`<span class="log-crit">暴击</span>`);
  addLog(`${attacker.emoji}${attacker.name} <b>平等</b> → ${target.emoji}${target.name}：${parts.join(' + ')}${isHighRarity ? ' <span class="log-crit">[克制S级以上]</span>' : ''}`);

  // Anti-high-rarity heal (lifesteal-like, silent)
  if (isHighRarity && attacker.alive) {
    const healAmt = Math.round(totalDmgDealt * skill.healPctOfDmg / 100);
    const before = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmt);
    const actual = Math.round(attacker.hp - before);
    if (actual > 0) {
      const aElId = getFighterElId(attacker);
      spawnFloatingNum(aElId, `+${actual}`, 'passive-num', 0, 0);
      updateHpBar(attacker, aElId);
    }
  }

  // Clean up temp tracking
  delete skill._judgeTotal;
}

// ── FORTUNE SKILLS ────────────────────────────────────────
