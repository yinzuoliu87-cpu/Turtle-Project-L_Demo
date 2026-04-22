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
// KOF-inspired sequence:
//  1. Self buff (crit/critDmg/lifesteal/armorPen for 1 turn)
//  2. Dash forward ~0.4s toward target row while camera slightly zooms
//  3. Wind-up pause ~0.3s
//  4. Fire a slow horizontal chi wave that reaches the target
//  5. Target launches into air for 3-hit combo
//  6. Target lands, brief recovery pause
//  7. Caster dashes back, camera zooms out
async function doBasicChiWave(attacker, skill) {
  const fElId = getFighterElId(attacker);
  const fEl = document.getElementById(fElId);

  // ── Self buffs (1 turn) ──
  const armorPenDelta = Math.round(attacker.atk * (skill.armorPenGain || 0.1));
  attacker.crit += (skill.critGain || 25) / 100;
  attacker._extraCritDmgPerm = (attacker._extraCritDmgPerm || 0) + (skill.critDmgGain || 20) / 100;
  attacker._lifestealPct = (attacker._lifestealPct || 0) + (skill.lifestealGain || 10) / 100;
  attacker.armorPen += armorPenDelta;
  attacker.buffs.push({ type: 'chiWaveActive', turns: 2, revert: {
    crit: (skill.critGain || 25) / 100,
    critDmg: (skill.critDmgGain || 20) / 100,
    lifesteal: (skill.lifestealGain || 10) / 100,
    armorPen: armorPenDelta,
  }});
  recalcStats();
  renderStatusIcons(attacker);
  updateFighterStats(attacker, fElId);

  spawnFloatingNum(fElId, `+${skill.critGain}%暴 +${skill.critDmgGain}%爆`, 'passive-num', 0, 0);
  spawnFloatingNum(fElId, `+${skill.lifestealGain}%吸血 +${armorPenDelta}穿甲`, 'passive-num', 200, 16);
  addLog(`${attacker.emoji}${attacker.name} <b>龟派气波</b>：<span class="log-passive">+${skill.critGain}%暴击 +${skill.critDmgGain}%爆伤 +${skill.lifestealGain}%吸血 +${armorPenDelta}穿甲</span>`);

  // ── Target selection (same col; front-row protects back) ──
  const casterCol = attacker._slotKey ? attacker._slotKey.split('-')[1] : null;
  const enemyTeam = attacker.side === 'left' ? rightTeam : leftTeam;
  let colCandidates = casterCol != null
    ? enemyTeam.filter(e => e.alive && e._slotKey && e._slotKey.split('-')[1] === casterCol)
    : [];
  // Protect-back rule: if any front-row enemy in this col is alive, only hit front.
  const frontInCol = colCandidates.find(e => e._slotKey.startsWith('front'));
  let targets = frontInCol ? [frontInCol] : colCandidates;
  // Fallback: same-col empty → nearest alive enemy (still respects front-first)
  if (targets.length === 0) {
    const liveFront = enemyTeam.filter(e => e.alive && e._slotKey && e._slotKey.startsWith('front'));
    const liveAny = enemyTeam.filter(e => e.alive);
    targets = liveFront.length > 0 ? [liveFront[0]] : (liveAny.length > 0 ? [liveAny[0]] : []);
  }
  if (targets.length === 0) { await sleep(300); return; }

  // ── Camera zoom (slight) + dash forward ──
  const battleField = document.querySelector('.battle-field') || document.querySelector('.battle-main-row') || null;
  const primaryTarget = targets[0];
  const tEl = document.getElementById(getFighterElId(primaryTarget));
  const dir = attacker.side === 'left' ? 1 : -1;

  // Compute dash offset: land ~90px on caster's side of target
  let dashPx = 0;
  if (fEl && tEl) {
    const fRect = fEl.getBoundingClientRect();
    const tRect = tEl.getBoundingClientRect();
    const casterCX = fRect.left + fRect.width / 2;
    const targetCX = tRect.left + tRect.width / 2;
    dashPx = (targetCX - casterCX) - (dir * 90);
  }

  // Camera zoom in on the battle field, centered near the caster
  if (battleField && fEl) {
    const bRect = battleField.getBoundingClientRect();
    const fRect = fEl.getBoundingClientRect();
    const ox = ((fRect.left + fRect.width / 2) - bRect.left) / bRect.width * 100;
    const oy = ((fRect.top + fRect.height / 2) - bRect.top) / bRect.height * 100;
    battleField.style.transformOrigin = `${ox}% ${oy}%`;
    battleField.style.transition = 'transform 400ms ease-out';
    battleField.style.transform = 'scale(1.08)';
  }

  // Scene-turtle dashes via transform override. Preserve base-scale.
  const scale = parseFloat(getComputedStyle(fEl).getPropertyValue('--base-scale')) || 1;
  fEl.style.transition = 'transform 400ms cubic-bezier(.35,.9,.35,1)';
  fEl.style.transform = `translateX(${dashPx}px) scale(${scale})`;
  await sleep(420);

  // ── Wind-up pause (~0.3s) ──
  fEl.classList.add('chi-charging');
  await sleep(300);
  fEl.classList.remove('chi-charging');

  // ── Fire the chi wave ──
  const wave = document.createElement('div');
  wave.className = 'chi-wave';
  const waveHost = battleField || document.body;
  waveHost.appendChild(wave);

  if (battleField) {
    const fRect = fEl.getBoundingClientRect();
    const bRect = battleField.getBoundingClientRect();
    const startX = fRect.left - bRect.left + fRect.width / 2 + (dir * fRect.width * 0.4);
    const startY = fRect.top - bRect.top + fRect.height / 2;
    wave.style.left = startX + 'px';
    wave.style.top = startY + 'px';
    wave.style.height = '130px';
    if (dir === -1) wave.style.transform = 'translate(-50%, -50%) scaleX(-1)';
    const tRect = tEl.getBoundingClientRect();
    const tEdge = tRect.left - bRect.left + (dir === 1 ? tRect.width : 0);
    const travelDist = Math.abs(tEdge - startX) + 40;
    requestAnimationFrame(() => {
      const base = (dir === -1) ? 'translate(-50%, -50%) scaleX(-1)' : 'translate(-50%, -50%)';
      wave.style.transition = 'transform 550ms cubic-bezier(.25,.55,.4,1), opacity 250ms ease-out 420ms';
      wave.style.transform = `${base} translateX(${dir * travelDist}px)`;
      wave.style.opacity = '0';
    });
  }

  // ── Wave arrival + 3-hit airborne combo ──
  await sleep(300); // wave travel time before impact
  const tElId = getFighterElId(primaryTarget);
  const tElNode = document.getElementById(tElId);
  if (tElNode) tElNode.classList.add('chi-launched');

  const perHitScale = (skill.atkScale || 1.5) / 3;
  const hits = 3;
  for (let i = 0; i < hits; i++) {
    if (!primaryTarget.alive) break;
    const eDef = calcEffDef(attacker, primaryTarget);
    const { isCrit, critMult } = calcCrit(attacker);
    const dmg = Math.max(1, Math.round(attacker.atk * perHitScale * critMult * calcDmgMult(eDef)));
    applyRawDmg(attacker, primaryTarget, dmg, false, false, 'physical');
    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', i * 40, i * 18, { atkSide: attacker.side, amount: dmg });
    updateHpBar(primaryTarget, tElId);
    await triggerOnHitEffects(attacker, primaryTarget, dmg);
    await sleep(240);
  }

  // ── Enemy lands + brief recovery ──
  if (tElNode) tElNode.classList.remove('chi-launched');
  await sleep(350);

  // ── Caster dashes back, camera zooms out ──
  fEl.style.transform = `translateX(0) scale(${scale})`;
  if (battleField) battleField.style.transform = 'scale(1)';
  await sleep(420);

  // Cleanup
  fEl.style.transition = '';
  fEl.style.transform = '';
  if (battleField) {
    battleField.style.transition = '';
    battleField.style.transform = '';
    battleField.style.transformOrigin = '';
  }
  setTimeout(() => { try { wave.remove(); } catch(e) {} }, 600);
  await sleep(120);
}

// ── ICE TURTLE SKILLS ─────────────────────────────────────
