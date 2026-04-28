function addStarEnergy(f, dmg) {
  if (!f.passive || f.passive.type !== 'starEnergy') return;
  const maxE = Math.round(f.maxHp * f.passive.maxChargePct / 100);
  const gain = Math.round(dmg * f.passive.chargeRate / 100);
  f._starEnergy = Math.min(maxE, (f._starEnergy || 0) + gain);
  renderStatusIcons(f);
  // Update energy bar visual
  updateHpBar(f, getFighterElId(f));
}

// Helper: passive star fire — after each skill, deal 40% stored energy as true damage to target
async function fireStarPassive(f, target) {
  if (!f.passive || f.passive.type !== 'starEnergy' || !target || !target.alive) return;
  const energy = f._starEnergy || 0;
  if (energy <= 0) return;
  const firePct = f.passive.passiveFirePct || 40;
  const fireDmg = Math.round(energy * firePct / 100);
  if (fireDmg <= 0) return;
  applyRawDmg(f, target, fireDmg, false, false, 'true');
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `${fireDmg}<img src="assets/passive/star-energy-bar-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'true-dmg', 200, 0, {atkSide:f.side, amount:fireDmg});
  updateHpBar(target, tElId);
  // Passive true damage also charges star energy
  addStarEnergy(f, fireDmg);
}

// Helper: star meteor full energy burst — consume all energy, deal burstPct% as true AOE
async function starMeteorBurst(f) {
  if (!f.passive || f.passive.type !== 'starEnergy') return;
  const maxE = Math.round(f.maxHp * f.passive.maxChargePct / 100);
  if ((f._starEnergy || 0) < maxE) return;
  const burstPct = f.passive.burstPct || 80;
  const burstDmg = Math.round(f._starEnergy * burstPct / 100);
  f._starEnergy = 0;
  updateHpBar(f, getFighterElId(f)); // update energy bar to 0
  const enemies = getAliveEnemiesWithSummons(f.side);
  for (const e of enemies) {
    if (!e.alive) continue;
    const wh = e.buffs ? e.buffs.find(b => b.type === 'wormhole') : null;
    const finalDmg = wh ? Math.round(burstDmg * (1 + wh.pierceBonusPct / 100)) : burstDmg;
    applyRawDmg(f, e, finalDmg, false, false, 'true');
    const eElId = getFighterElId(e);
    spawnFloatingNum(eElId, `${finalDmg}<img src="assets/passive/star-energy-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'crit-true', 300, 0, {atkSide:f.side, amount:finalDmg});
    updateHpBar(e, eElId);
  }
  renderStatusIcons(f);
  addLog(`${f.emoji}${f.name} <span class="log-passive"><img src="assets/passive/star-energy-icon.png" style="width:16px;height:16px;vertical-align:middle">星能爆发！</span>全体敌方 <span class="log-pierce">${burstDmg}真实伤害</span>`);
  try { sfxExplosion(); } catch(e) {}
  await sleep(500);
}

// Star Beam: 3 hits, 40%ATK + 5% target current HP each
async function doStarBeam(attacker, target, skill) {
  const tElId = getFighterElId(target);
  let totalDmg = 0;

  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) continue; // keep animating remaining hits
    const {isCrit, critMult} = calcCrit(attacker);
    const baseDmg = Math.round(attacker.atk * skill.atkScale) + Math.round(target.hp * skill.currentHpPct / 100);
    const eDef = calcEffDef(attacker, target, 'magic');
    
    // Check wormhole normal bonus
    const wh = target.buffs.find(b => b.type === 'wormhole' && b.sourceId === allFighters.indexOf(attacker));
    let dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(eDef)));
    if (wh) dmg = Math.round(dmg * (1 + wh.normalBonusPct / 100));

    applyRawDmg(attacker, target, dmg, false, false, 'magic');
    totalDmg += dmg;
    spawnFloatingNum(tElId, `${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0);
    await triggerOnHitEffects(attacker, target, dmg);

    // Accumulate star energy
    addStarEnergy(attacker, dmg);

    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(700);
    if (tEl) tEl.classList.remove('hit-shake');
    await sleep(200);
  }

  addLog(`${attacker.emoji}${attacker.name} <b>星光射线</b> → ${target.emoji}${target.name}：<span class="log-magic">${totalDmg}魔法伤害</span>`);

  // Passive: fire 40% star energy as true damage after skill
  if (target.alive) await fireStarPassive(attacker, target);
  renderStatusIcons(attacker);
}

// Wormhole: mark target for pierce/normal bonus
async function doStarWormhole(attacker, target, skill) {
  const tElId = getFighterElId(target);
  // Remove existing wormhole from this attacker
  target.buffs = target.buffs.filter(b => !(b.type === 'wormhole' && b.sourceId === allFighters.indexOf(attacker)));
  target.buffs.push({
    type: 'wormhole',
    pierceBonusPct: skill.pierceBonusPct,
    normalBonusPct: skill.normalBonusPct,
    turns: skill.duration,
    sourceId: allFighters.indexOf(attacker)
  });
  spawnFloatingNum(tElId, '🌀虫洞', 'debuff-label', 0, 0);
  renderStatusIcons(target);
  // Permanent magic pen gain
  if (skill.magicPenAtkPct) {
    const penGain = Math.round(attacker.atk * skill.magicPenAtkPct / 100);
    attacker.magicPen = (attacker.magicPen || 0) + penGain;
    const fElId = getFighterElId(attacker);
    spawnFloatingNum(fElId, `+${penGain}魔法穿透`, 'passive-num', 200, 0);
    updateFighterStats(attacker, fElId);
  }
  addLog(`${attacker.emoji}${attacker.name} <b>虫洞</b> → ${target.emoji}${target.name}：<span class="log-debuff">真实+${skill.pierceBonusPct}% ${skill.duration}回合</span>` + (skill.magicPenAtkPct ? ` + <span class="log-passive">+${Math.round(attacker.atk * skill.magicPenAtkPct / 100)}魔法穿透</span>` : ''));
  // Passive: fire 40% star energy after skill
  if (target.alive) await fireStarPassive(attacker, target);
  await sleep(800);
}

// Meteor: AOE 60%ATK + 50% star energy as pierce
async function doStarMeteor(attacker, skill) {
  const enemies = allFighters.filter(e => e.alive && e.side !== attacker.side);
  if (!enemies.length) return;

  const baseDmg = Math.round(attacker.atk * skill.atkScale);

  for (const e of enemies) {
    if (!e.alive) continue;
    const {isCrit, critMult} = calcCrit(attacker);
    const eDef = calcEffDef(attacker, e, 'magic');
        const normalDmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(eDef)));
    applyRawDmg(attacker, e, normalDmg, false, false, 'magic');
    const eId = getFighterElId(e);
    spawnFloatingNum(eId, `${normalDmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0, {atkSide:attacker.side, amount:normalDmg});
    updateHpBar(e, eId);
    await triggerOnHitEffects(attacker, e, normalDmg);
    addStarEnergy(attacker, normalDmg);

    // Apply MR down
    if (skill.mrDown) {
      const existing = e.buffs.find(b => b.type === 'mrDown');
      if (existing) { existing.value = Math.max(existing.value, skill.mrDown.pct); existing.turns = Math.max(existing.turns, skill.mrDown.turns); }
      else e.buffs.push({ type: 'mrDown', value: skill.mrDown.pct, turns: skill.mrDown.turns });
      renderStatusIcons(e);
    }
  }

  // Full energy burst: consume all, deal 100% as true AOE
  await starMeteorBurst(attacker);

  // Passive fire on first alive enemy
  const firstAlive = enemies.find(e => e.alive);
  if (firstAlive) await fireStarPassive(attacker, firstAlive);

  recalcStats();
  renderStatusIcons(attacker);
  addLog(`${attacker.emoji}${attacker.name} <b>流星暴击</b> → 全体敌方：<span class="log-magic">${baseDmg}魔法伤害</span> + ⬇️魔抗`);
  await sleep(600);
}

// ── CYBER SKILLS ──────────────────────────────────────────
