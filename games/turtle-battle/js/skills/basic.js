async function doTurtleShieldBash(attacker, target, skill) {
  const tElId = getFighterElId(target);
  let raw = Math.round(attacker.atk * skill.atkScale);
  // Add target lost HP% bonus
  if (skill.lostHpPct) raw += Math.round((target.maxHp - target.hp) * skill.lostHpPct / 100);

  let effectiveCrit = attacker.crit;
  if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
    effectiveCrit += attacker.passive.pct / 100;
  }
  const isCrit = Math.random() < effectiveCrit;
  const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;

  const effectiveDef = calcEffDef(attacker, target);
    let dmg = Math.max(1, Math.round(raw * critMult * calcDmgMult(effectiveDef)));

  // Passive: basicTurtle bonus
  if (attacker.passive && attacker.passive.type === 'basicTurtle' && attacker.passive.bonusMap) {
    const bonusPct = attacker.passive.bonusMap[target.rarity] || 0;
    if (bonusPct > 0) dmg = Math.round(dmg * (1 + bonusPct / 100));
  }
  // Passive: frostAura bonus
  if (attacker.passive && attacker.passive.type === 'frostAura' && attacker.passive.bonusTargets && attacker.passive.bonusTargets.includes(target.id)) {
    dmg = Math.round(dmg * (1 + attacker.passive.bonusDmgPct / 100));
  }

  applyRawDmg(attacker, target, dmg, false, false, 'physical');


  spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 80, 0);
  updateHpBar(target, tElId);
  await triggerOnHitEffects(attacker, target, dmg);

  const tEl = document.getElementById(tElId);
  if (tEl) { tEl.classList.add('hit-shake'); }
  await sleep(500);
  if (tEl) { tEl.classList.remove('hit-shake'); }

  // Shield from damage
  const shieldGain = Math.round(dmg * skill.shieldFromDmgPct / 100);
  if (shieldGain > 0 && attacker.alive) {
    attacker.shield += shieldGain;
    const aElId = getFighterElId(attacker);
    spawnFloatingNum(aElId, `+${shieldGain}`, 'shield-num', 0, 0);
    updateHpBar(attacker, aElId);
  }

  addLog(`${attacker.emoji}${attacker.name} <b>龟盾</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span>${isCrit?' <span class="log-crit">暴击</span>':''} + <span class="log-shield">+${shieldGain}永久护盾</span>`);
  if (target.alive) applySkillDebuffs(skill, target);
}

async function doBasicBarrage(attacker, skill) {
  const hits = skill.hits;
  const perHit = Math.round(attacker.atk * skill.atkScale / hits);
  let totalDmg = 0;

  const effectiveDef0 = DEF_CONSTANT; // placeholder, recalc per target

  for (let i = 0; i < hits; i++) {
    const enemies = getAliveEnemiesWithSummons(attacker.side);
    if (!enemies.length) break;
    const target = enemies[Math.floor(Math.random() * enemies.length)];
    const tElId = getFighterElId(target);

    let effectiveCrit = attacker.crit;
    if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
      effectiveCrit += attacker.passive.pct / 100;
    }
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;

    const effectiveDef = calcEffDef(attacker, target);
        let dmg = Math.max(1, Math.round(perHit * critMult * calcDmgMult(effectiveDef)));

    // Passive: basicTurtle bonus
    if (attacker.passive && attacker.passive.type === 'basicTurtle' && attacker.passive.bonusMap) {
      const bonusPct = attacker.passive.bonusMap[target.rarity] || 0;
      if (bonusPct > 0) dmg = Math.round(dmg * (1 + bonusPct / 100));
    }

    applyRawDmg(attacker, target, dmg, false, false, 'physical', false, true);
    totalDmg += dmg;

    const yOff = 0;

    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 80, yOff);
    updateHpBar(target, tElId);
    await triggerOnHitEffects(attacker, target, dmg);

    const tEl = document.getElementById(tElId);
    if (tEl) { tEl.classList.add('hit-shake'); }
    await sleep(350);
    if (tEl) { tEl.classList.remove('hit-shake'); }
    await sleep(100);

    // No in-loop checkDeaths — pending-death targets stay in pool (alive=true)
    // so later random hits can still land on them. Deaths resolve after action.
    if (battleOver) break;
  }

  addLog(`${attacker.emoji}${attacker.name} <b>打击</b> ${hits}段随机分布：<span class="log-direct">共${totalDmg}伤害</span>`);
}

// ── 龟派气波 (basicChiWave) ────────────────────────────────
// Caster buffs self for 1 turn, then fires a horizontal chi wave that
// launches all same-row enemies into the air for a 3-hit combo.
// Inspired by KOF's Robert: dash → projectile → enemies launch on contact.
async function doBasicChiWave(attacker, skill) {
  const fElId = getFighterElId(attacker);
  const fEl = document.getElementById(fElId);

  // ── Step 1: Self buffs (1 turn) ──
  const armorPenDelta = Math.round(attacker.atk * (skill.armorPenGain || 0.1));
  attacker.crit += (skill.critGain || 25) / 100;
  attacker._extraCritDmgPerm = (attacker._extraCritDmgPerm || 0) + (skill.critDmgGain || 20) / 100;
  attacker._lifestealPct = (attacker._lifestealPct || 0) + (skill.lifestealGain || 10) / 100;
  attacker.armorPen += armorPenDelta;
  // Marker buff — processRoundEndBuffs reverts the deltas when this expires (turns:2 → decays to 1 at this turn end, to 0 at next turn end).
  attacker.buffs.push({ type: 'chiWaveActive', turns: 2, revert: {
    crit: (skill.critGain || 25) / 100,
    critDmg: (skill.critDmgGain || 20) / 100,
    lifesteal: (skill.lifestealGain || 10) / 100,
    armorPen: armorPenDelta,
  }});
  recalcStats();
  renderStatusIcons(attacker);
  updateFighterStats(attacker, fElId);

  spawnFloatingNum(fElId, '🐢💥蓄力!', 'crit-label', 0, -25);
  spawnFloatingNum(fElId, `+${skill.critGain}%暴 +${skill.critDmgGain}%爆`, 'passive-num', 180, 0);
  spawnFloatingNum(fElId, `+${skill.lifestealGain}%吸血 +${armorPenDelta}穿甲`, 'passive-num', 360, 16);
  addLog(`${attacker.emoji}${attacker.name} <b>龟派气波</b>：蓄力 → <span class="log-passive">+${skill.critGain}%暴击 +${skill.critDmgGain}%爆伤 +${skill.lifestealGain}%吸血 +${armorPenDelta}穿甲</span>`);

  if (fEl) fEl.classList.add('chi-charging');
  await sleep(600);
  if (fEl) fEl.classList.remove('chi-charging');

  // ── Step 2: Find row targets (same row as caster) ──
  const isFrontCaster = attacker._slotKey && attacker._slotKey.startsWith('front');
  const targetRow = isFrontCaster ? 'front' : 'back';
  const enemyTeam = attacker.side === 'left' ? rightTeam : leftTeam;
  let targets = enemyTeam.filter(e => e.alive && e._slotKey && e._slotKey.startsWith(targetRow));
  // Fallback: if nobody in same row, hit the other row so the skill isn't wasted
  if (targets.length === 0) {
    const altRow = isFrontCaster ? 'back' : 'front';
    targets = enemyTeam.filter(e => e.alive && e._slotKey && e._slotKey.startsWith(altRow));
  }
  if (targets.length === 0) { await sleep(300); return; }

  // ── Step 3: Spawn chi wave projectile ──
  const battleField = document.querySelector('.battle-field') || document.querySelector('.battle-main-row') || document.body;
  const wave = document.createElement('div');
  wave.className = 'chi-wave';
  battleField.appendChild(wave);

  if (fEl && battleField) {
    const fRect = fEl.getBoundingClientRect();
    const bRect = battleField.getBoundingClientRect();
    // Anchor wave at caster's center y, leading edge at caster's far side
    const dir = attacker.side === 'left' ? 1 : -1;
    const startX = fRect.left - bRect.left + fRect.width / 2 + (dir * fRect.width * 0.4);
    const startY = fRect.top - bRect.top + fRect.height / 2;
    wave.style.left = startX + 'px';
    wave.style.top = startY + 'px';
    wave.style.height = '260px'; // tall vertical slab so it sweeps all 3 column slots
    // Flip gradient for right-side caster
    if (dir === -1) wave.style.transform = 'translate(-50%, -50%) scaleX(-1)';
    // Launch horizontally: translate to beyond targets
    const farTarget = targets.reduce((acc, t) => {
      const el = document.getElementById(getFighterElId(t));
      if (!el) return acc;
      const r = el.getBoundingClientRect();
      const edge = r.left - bRect.left + (dir === 1 ? r.width : 0);
      return (acc === null || (dir === 1 ? edge > acc : edge < acc)) ? edge : acc;
    }, null);
    const travelDist = farTarget !== null ? Math.abs(farTarget - startX) + 80 : 420;
    requestAnimationFrame(() => {
      const base = (dir === -1) ? 'translate(-50%, -50%) scaleX(-1)' : 'translate(-50%, -50%)';
      wave.style.transition = 'transform 700ms cubic-bezier(.2,.6,.4,1), opacity 300ms ease-out 500ms';
      wave.style.transform = `${base} translateX(${dir * travelDist / 1}px)`;
      wave.style.opacity = '0';
    });
  }

  // ── Step 4: Stagger-hit each target as wave sweeps across ──
  const sortedTargets = targets.slice().sort((a, b) => {
    const aEl = document.getElementById(getFighterElId(a));
    const bEl = document.getElementById(getFighterElId(b));
    if (!aEl || !bEl) return 0;
    const aX = aEl.getBoundingClientRect().left;
    const bX = bEl.getBoundingClientRect().left;
    return attacker.side === 'left' ? aX - bX : bX - aX;
  });
  const perHitScale = (skill.atkScale || 1.5) / 3;
  const hits = 3;

  const tasks = sortedTargets.map((target, idx) => (async () => {
    const arrival = 160 + idx * 110; // ms after wave launch
    await sleep(arrival);
    if (!target.alive) return;
    const tElId = getFighterElId(target);
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('chi-launched');

    for (let i = 0; i < hits; i++) {
      if (!target.alive) break;
      const eDef = calcEffDef(attacker, target);
      const { isCrit, critMult } = calcCrit(attacker);
      const dmg = Math.max(1, Math.round(attacker.atk * perHitScale * critMult * calcDmgMult(eDef)));
      applyRawDmg(attacker, target, dmg, false, false, 'physical');
      spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', i * 40, i * 18, { atkSide: attacker.side, amount: dmg });
      updateHpBar(target, tElId);
      await triggerOnHitEffects(attacker, target, dmg);
      await sleep(220);
    }

    if (tEl) {
      tEl.classList.remove('chi-launched');
    }
  })());

  await Promise.all(tasks);

  // Cleanup wave element
  setTimeout(() => { try { wave.remove(); } catch(e) {} }, 900);
  await sleep(200);
}

// ── ICE TURTLE SKILLS ─────────────────────────────────────
