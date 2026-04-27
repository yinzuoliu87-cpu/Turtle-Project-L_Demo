async function doDiceAttack(attacker, target, skill) {
  const tElId = getFighterElId(target);
  // Total damage = 100%ATK + 100*critRate
  const totalBase = Math.round(attacker.atk * skill.atkScale) + Math.round(attacker.crit * skill.critBonusMult);
  const perHit = Math.round(totalBase / skill.hits);
  let totalDmg = 0, totalCrits = 0;
  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) continue; // keep animating remaining hits
    const eDef = calcEffDef(attacker, target);
        let effectiveCrit = attacker.crit;
    let overflowCritDmg = 0;
    if (effectiveCrit > 1.0) { overflowCritDmg = (effectiveCrit - 1.0) * (attacker.passive?.overflowMult || 1.5); effectiveCrit = 1.0; }
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmgPerm || 0) + overflowCritDmg) : 1;
    if (isCrit) totalCrits++;
    const dmg = Math.max(1, Math.round(perHit * critMult * calcDmgMult(eDef)));
    applyRawDmg(attacker, target, dmg, false, false, 'physical');
    totalDmg += dmg;

    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0);
    await triggerOnHitEffects(attacker, target, dmg);
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(400);
    if (tEl) tEl.classList.remove('hit-shake');
  }
  addLog(`${attacker.emoji}${attacker.name} <b>骰子攻击</b> ${skill.hits}段 → ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}伤害</span>${totalCrits > 0 ? ' <span class="log-crit">'+totalCrits+'暴击</span>' : ''}`);
}

async function doDiceAllIn(attacker, skill) {
  const fElId = getFighterElId(attacker);
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  const baseRaw = Math.round(attacker.atk * skill.atkScale);
  const dmgType = skill.dmgType || 'physical';
  let totalDmg = 0, totalCrits = 0;
  spawnFloatingNum(fElId, '<img src="assets/passive/gambler-blood-icon.png" style="width:16px;height:16px;vertical-align:middle">孤注一掷!', 'crit-label', 0, -20);
  for (const e of enemies) {
    if (!e.alive) continue;
    const {isCrit, critMult} = calcCrit(attacker);
    if (isCrit) totalCrits++;
    const effDef = calcEffDef(attacker, e, dmgType);

    const dmg = Math.max(1, Math.round(baseRaw * critMult * calcDmgMult(effDef)));
    applyRawDmg(attacker, e, dmg, false, false, dmgType);
    totalDmg += dmg;
    const eElId = getFighterElId(e);
    const cls = dmgType === 'magic' ? (isCrit ? 'crit-magic' : 'magic-dmg') : dmgType === 'true' ? (isCrit ? 'crit-true' : 'true-dmg') : (isCrit ? 'crit-dmg' : 'direct-dmg');
    spawnFloatingNum(eElId, `-${dmg}`, cls, 0, 0, { atkSide: attacker.side, amount: dmg });
    updateHpBar(e, eElId);
    await triggerOnHitEffects(attacker, e, dmg);
    await sleep(300);
  }
  // Lifesteal
  if (skill.lifestealPct && attacker.alive && totalDmg > 0) {
    const heal = Math.round(totalDmg * skill.lifestealPct / 100);
    const before = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
    const actual = Math.round(attacker.hp - before);
    if (actual > 0) {
      spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 200, 0);
      updateHpBar(attacker, fElId);
    }
  }
  const dmgLabel = dmgType === 'magic' ? '魔法' : dmgType === 'true' ? '真实' : '物理';
  const dmgClass = dmgType === 'magic' ? 'log-magic' : dmgType === 'true' ? 'log-pierce' : 'log-direct';
  addLog(`${attacker.emoji}${attacker.name} <b>孤注一掷</b>：全体敌方 <span class="${dmgClass}">${totalDmg}${dmgLabel}</span>${totalCrits > 0 ? ' <span class="log-crit">'+totalCrits+'暴击</span>' : ''} + ${skill.lifestealPct||10}%吸血`);
  await sleep(500);
}

// 稳定骰子 → 闪现攻击: roll 1d6, flash to N random enemies, 0.5 ATK physical per hit.
async function doDiceFlashStrike(caster, skill) {
  const fElId = getFighterElId(caster);
  const roll = 1 + Math.floor(Math.random() * 6);
  spawnFloatingNum(fElId, `🎲${roll}点!`, 'crit-label', 0, -20);
  await sleep(500);
  const perHitScale = skill.perHitScale || 1.0;
  const falloff = (skill.falloffPct || 0) / 100;
  let totalDmg = 0;
  for (let i = 0; i < roll; i++) {
    const enemies = (caster.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
    if (!enemies.length) break;
    const target = enemies[Math.floor(Math.random() * enemies.length)];
    const tElId = getFighterElId(target);
    const eDef = calcEffDef(caster, target);
    const isCrit = Math.random() < caster.crit;
    const critMult = isCrit ? (1.5 + (caster._extraCritDmg || 0) + (caster._extraCritDmgPerm || 0)) : 1;
    // Falloff: each subsequent hit -5% (additive). Floor at 0 so we never go negative.
    const hitScale = Math.max(0, perHitScale - falloff * i);
    const dmg = Math.max(1, Math.round(caster.atk * hitScale * critMult * calcDmgMult(eDef)));
    applyRawDmg(caster, target, dmg, false, false, 'physical');
    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, {atkSide: caster.side, amount: dmg});
    updateHpBar(target, tElId);
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    await triggerOnHitEffects(caster, target, dmg);
    await sleep(280);
    if (tEl) tEl.classList.remove('hit-shake');
    totalDmg += dmg;
  }
  addLog(`${caster.emoji}${caster.name} <b>${skill.name}</b>：🎲${roll}点 × <span class="log-direct">${Math.round(perHitScale * 100)}%ATK</span>${falloff>0?` (每段-${Math.round(falloff*100)}%)`:''} = ${roll}段共 <span class="log-direct">${totalDmg}物理</span>`);
  await sleep(400);
}

async function doDiceFate(caster, skill) {
  const fElId = getFighterElId(caster);
  const critGain = skill.minCrit + Math.floor(Math.random() * (skill.maxCrit - skill.minCrit + 1));
  caster.buffs.push({ type:'diceFateCrit', value:critGain, turns:skill.duration + 1 });
  recalcStats();
  spawnFloatingNum(fElId, `<img src="assets/passive/gambler-blood-icon.png" style="width:16px;height:16px;vertical-align:middle">+${critGain}%暴击!`, 'crit-label', 0, -20);
  renderStatusIcons(caster);
  updateFighterStats(caster, fElId);
  addLog(`${caster.emoji}${caster.name} <b>命运骰子</b>：<span class="log-passive">+${critGain}%暴击率 ${skill.duration}回合</span>${caster.crit > 1 ? ' (溢出' + Math.round((caster.crit-1)*100) + '%→' + Math.round((caster.crit-1)*150) + '%爆伤)' : ''}`);
  await sleep(800);
}

// ── CHEST TURTLE (宝箱龟) ───────────────────────────────
// ── CHEST TURTLE (宝箱龟) NEW SKILLS ──────────────────────
