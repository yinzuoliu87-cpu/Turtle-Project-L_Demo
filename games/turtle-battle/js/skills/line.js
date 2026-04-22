function addInkStack(target, count, attacker) {
  // Check if attacker has ink cap override from passive skill
  const max = (attacker && attacker._inkCapOverride) ? attacker._inkCapOverride : 5;
  const before = target._inkStacks || 0;
  target._inkStacks = Math.min(max, before + count);
  const gained = target._inkStacks - before;
  if (gained > 0) {
    const tElId = getFighterElId(target);
    renderStatusIcons(target);
    // Ink link: sync stacks to partner
    if (target._inkLink && target._inkLink.partner && target._inkLink.partner.alive) {
      const partner = target._inkLink.partner;
      const pBefore = partner._inkStacks || 0;
      partner._inkStacks = Math.min(max, pBefore + gained);
      const pGained = partner._inkStacks - pBefore;
      if (pGained > 0) {
        const pElId = getFighterElId(partner);
        renderStatusIcons(partner);
        renderStatusIcons(partner);
      }
    }
  }
  renderStatusIcons(target);
}

async function doLineSketch(attacker, target, skill) {
  const tElId = getFighterElId(target);
  let totalDmg = 0;

  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) continue; // keep animating remaining hits
    const {isCrit, critMult} = calcCrit(attacker);
    const baseDmg = Math.round(attacker.atk * skill.atkScale);
    const eDef = calcEffDef(attacker, target);
        let dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(eDef)));
    // Ink amplification now handled in applyRawDmg

    applyRawDmg(attacker, target, dmg, false, false, 'physical');
    totalDmg += dmg;
    addInkStack(target, 1, attacker);

    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0);
    await triggerOnHitEffects(attacker, target, dmg);

    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(400);
    if (tEl) tEl.classList.remove('hit-shake');
  }

  addLog(`${attacker.emoji}${attacker.name} <b>素描</b> → ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}物理伤害</span>（墨迹${target._inkStacks}层）`);
}

async function doLineLink(attacker, target, skill) {
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  // Hit primary target
  const {isCrit: isCrit1, critMult: critMult1} = calcCrit(attacker);
  const tElId = getFighterElId(target);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const eDef1 = calcEffDef(attacker, target);
  let dmg1 = Math.max(1, Math.round(baseDmg * critMult1 * calcDmgMult(eDef1)));

  applyRawDmg(attacker, target, dmg1, false, false, 'physical');
  addInkStack(target, 1);
  spawnFloatingNum(tElId, `-${dmg1}`, isCrit1 ? 'crit-dmg' : 'direct-dmg', 0, 0);
  await triggerOnHitEffects(attacker, target, dmg1);
  updateHpBar(target, tElId);

  // Find second target (different alive enemy)
  const second = enemies.find(e => e.alive && e !== target);
  let dmg2 = 0;
  if (second) {
    const {isCrit: isCrit2, critMult: critMult2} = calcCrit(attacker);
    const sElId = getFighterElId(second);
    const eDef2 = calcEffDef(attacker, second);
    dmg2 = Math.max(1, Math.round(baseDmg * critMult2 * calcDmgMult(eDef2)));

    applyRawDmg(attacker, second, dmg2, false, false, 'physical');
    addInkStack(second, 1);
    spawnFloatingNum(sElId, `-${dmg2}`, isCrit2 ? 'crit-dmg' : 'direct-dmg', 0, 0);
    await triggerOnHitEffects(attacker, second, dmg2);
    updateHpBar(second, sElId);

    // Establish ink link between the two
    target._inkLink = { partner: second, turns: skill.duration, transferPct: skill.transferPct };
    second._inkLink = { partner: target, turns: skill.duration, transferPct: skill.transferPct };
    spawnFloatingNum(tElId, '🔗连笔', 'crit-label', 0, -20);
    spawnFloatingNum(sElId, '🔗连笔', 'crit-label', 0, -20);
    renderStatusIcons(target);
    renderStatusIcons(second);

    addLog(`${attacker.emoji}${attacker.name} <b>连笔</b>：连接${target.emoji}${target.name}与${second.emoji}${second.name} ${skill.duration}回合（伤害传递${skill.transferPct}%真实）`);
  } else {
    addLog(`${attacker.emoji}${attacker.name} <b>连笔</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg1}物理伤害</span>+墨迹（无第二目标，无法建立连接）`);
  }
  await sleep(800);
}

async function doLineFinish(attacker, target, skill) {
  const tElId = getFighterElId(target);
  const stacks = target._inkStacks || 0;
  const {isCrit, critMult} = calcCrit(attacker);

  // Base normal damage
  const baseNormal = Math.round(attacker.atk * skill.baseScale);
  const eDef = calcEffDef(attacker, target);
    // Ink amplification now handled in applyRawDmg
  let normalDmg = Math.max(1, Math.round(baseNormal * critMult * calcDmgMult(eDef)));

  // Pierce damage per stack (ignores DEF)
  const pierceDmg = Math.round(attacker.atk * skill.perStackScale * stacks * critMult);

  applyRawDmg(attacker, target, normalDmg, false, false, 'physical');
  if (pierceDmg > 0) applyRawDmg(attacker, target, pierceDmg, false, false, 'true');
  const totalDmg = normalDmg + pierceDmg;

  // Floating numbers: canonical stack — physical (red) bottom, pierce (white) top
  if (stacks > 0) spawnFloatingNum(tElId, `墨迹×${stacks}引爆!`, 'crit-label', 0, -20);
  spawnFloatingNum(tElId, `-${normalDmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, {atkSide: attacker.side, amount: normalDmg});
  if (pierceDmg > 0) spawnFloatingNum(tElId, `-${pierceDmg}`, isCrit ? 'crit-pierce' : 'pierce-dmg', 0, 22, {atkSide: attacker.side, amount: pierceDmg});
  await triggerOnHitEffects(attacker, target, totalDmg);

  const tEl = document.getElementById(tElId);
  if (tEl) tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);

  // Clear ink stacks
  target._inkStacks = 0;
  renderStatusIcons(target);
  // If linked partner, also clear partner's stacks? No — only clear targeted stacks.

  addLog(`${attacker.emoji}${attacker.name} <b>画龙点睛</b> → ${target.emoji}${target.name}：<span class="log-direct">${normalDmg}物理</span> + <span class="log-pierce">${pierceDmg}真实</span>（${stacks}层墨迹引爆）`);
  await sleep(800);
}

// ── GHOST TURTLE (幽灵龟) ────────────────────────────────
