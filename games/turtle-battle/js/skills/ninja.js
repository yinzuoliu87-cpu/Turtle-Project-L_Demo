async function doNinjaShuriken(attacker, target, skill) {
  // 1.5×ATK damage, if crits → entire damage becomes pierce (ignores DEF)
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const isCrit = Math.random() < attacker.crit;
  const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
  const tElId = getFighterElId(target);

  if (isCrit) {
    const pierceDmg = Math.round(baseDmg * critMult);
    applyRawDmg(attacker, target, pierceDmg, false, false, 'physical');
    spawnFloatingNum(tElId, `-${pierceDmg}`, 'crit-pierce', 100, 0);
    addLog(`${attacker.emoji}${attacker.name} <b>飞镖</b> → ${target.emoji}${target.name}：<span class="log-crit">暴击!</span> <span class="log-pierce">${pierceDmg}真实</span>`);
    await triggerOnHitEffects(attacker, target, pierceDmg);
  } else {
    const effectiveDef = calcEffDef(attacker, target);
        const dmg = Math.max(1, Math.round(baseDmg * calcDmgMult(effectiveDef)));
    applyRawDmg(attacker, target, dmg, false, false, 'physical');
    spawnFloatingNum(tElId, `-${dmg}`, 'direct-dmg', 100, 0);
    addLog(`${attacker.emoji}${attacker.name} <b>飞镖</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span>`);
    await triggerOnHitEffects(attacker, target, dmg);
  }

  const tEl = document.getElementById(tElId);
  tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(450);
  tEl.classList.remove('hit-shake');
  // Trap triggers when the buffed ally is attacked, not here
  await sleep(80);
}

// 冲击: physical hit to target + physical hit to the unit directly behind (same column, back row)
async function doNinjaImpact(attacker, target, skill) {
  const tElId = getFighterElId(target);
  // Main hit
  const mainScale = skill.atkScale || 1.2;
  const mainDef = calcEffDef(attacker, target);
  const isCrit1 = Math.random() < attacker.crit;
  const critMult1 = isCrit1 ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
  const mainDmg = Math.max(1, Math.round(attacker.atk * mainScale * critMult1 * calcDmgMult(mainDef)));
  applyRawDmg(attacker, target, mainDmg, false, false, 'physical');
  spawnFloatingNum(tElId, `-${mainDmg}`, isCrit1 ? 'crit-dmg' : 'direct-dmg', 0, 0, {atkSide: attacker.side, amount: mainDmg});
  updateHpBar(target, tElId);
  await triggerOnHitEffects(attacker, target, mainDmg);
  // Behind hit
  const behind = (typeof fighterBehind === 'function') ? fighterBehind(target) : null;
  let behindDmg = 0;
  if (behind && behind.alive) {
    const behindScale = skill.behindScale || 0.8;
    const bDef = calcEffDef(attacker, behind);
    const isCrit2 = Math.random() < attacker.crit;
    const critMult2 = isCrit2 ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
    behindDmg = Math.max(1, Math.round(attacker.atk * behindScale * critMult2 * calcDmgMult(bDef)));
    applyRawDmg(attacker, behind, behindDmg, false, false, 'physical');
    const bElId = getFighterElId(behind);
    spawnFloatingNum(bElId, `-${behindDmg}`, isCrit2 ? 'crit-dmg' : 'direct-dmg', 200, 0, {atkSide: attacker.side, amount: behindDmg});
    updateHpBar(behind, bElId);
    await triggerOnHitEffects(attacker, behind, behindDmg);
  }
  const behindNote = behind ? ` + ${behind.emoji}${behind.name} <span class="log-direct">${behindDmg}物理</span>` : '';
  addLog(`${attacker.emoji}${attacker.name} <b>冲击</b> → ${target.emoji}${target.name}：<span class="log-direct">${mainDmg}物理</span>${behindNote}`);
  const tEl = document.getElementById(tElId);
  if (tEl) tEl.classList.add('hit-shake');
  await sleep(500);
  if (tEl) tEl.classList.remove('hit-shake');
  await sleep(150);
}

async function doNinjaBomb(attacker, skill) {
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);

  for (const e of enemies) {
    const {isCrit, critMult} = calcCrit(attacker);
    const effectiveDef = calcEffDef(attacker, e);
        const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effectiveDef)));
    applyRawDmg(attacker, e, dmg, false, false, 'physical');
    const eId = getFighterElId(e);
    spawnFloatingNum(eId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0);
    updateHpBar(e, eId);
    await triggerOnHitEffects(attacker, e, dmg);

    // Apply armor break (defDown by %)
    if (skill.armorBreak) {
      const ab = skill.armorBreak;
      const existing = e.buffs.find(b => b.type === 'defDown');
      if (existing) { existing.value = Math.max(existing.value, ab.pct); existing.turns = Math.max(existing.turns, ab.turns); }
      else e.buffs.push({ type:'defDown', value:ab.pct, turns:ab.turns });
      spawnFloatingNum(eId, `破甲${ab.pct}%`, 'debuff-label', 200, 0);
      renderStatusIcons(e);
    }
  }
  recalcStats();
  addLog(`${attacker.emoji}${attacker.name} <b>炸弹</b> → 全体敌方：<span class="log-direct">${baseDmg}伤害</span> + <span class="log-debuff">破甲${skill.armorBreak.pct}% ${skill.armorBreak.turns}回合</span>`);
  await sleep(1000);
}

// ── HUNTER SKILLS ─────────────────────────────────────────
