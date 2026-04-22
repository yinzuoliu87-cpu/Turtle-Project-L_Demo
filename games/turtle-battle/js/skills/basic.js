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
  const battleField = document.getElementById('battleScene');
  const primaryTarget = targets[0];
  const tEl = document.getElementById(getFighterElId(primaryTarget));
  const dir = attacker.side === 'left' ? 1 : -1;

  // NOTE: sprites are ~196px wide packed into ~200px column gaps — there's
  // literally no room to "dash forward" without overlapping the enemy. We
  // skip the dash and rely on the wave + camera zoom to sell the impact.

  // Camera zoom centered between caster and target (mid-battle focus)
  const scale = parseFloat(getComputedStyle(fEl).getPropertyValue('--base-scale')) || 1;
  if (battleField && fEl && tEl) {
    const bRect = battleField.getBoundingClientRect();
    const fRect = fEl.getBoundingClientRect();
    const tRect = tEl.getBoundingClientRect();
    const midX = (fRect.left + fRect.width / 2 + tRect.left + tRect.width / 2) / 2;
    const midY = fRect.top + fRect.height / 2;
    const ox = (midX - bRect.left) / bRect.width * 100;
    const oy = (midY - bRect.top) / bRect.height * 100;
    battleField.style.transformOrigin = `${ox}% ${oy}%`;
    battleField.style.transition = 'transform 350ms ease-out';
    battleField.style.transform = 'scale(1.1)';
  }

  // ── Windup: caster pulses briefly to show "charging" ──
  fEl.classList.add('chi-charging');
  await sleep(550);
  fEl.classList.remove('chi-charging');

  // ── Fire chi wave with 2 trailing copies for motion streak ──
  const WAVE_DURATION_MS = 900;
  const TRAIL_COUNT = 2; // 1 lead + 2 trails = total 3 waves
  const TRAIL_DELAY_MS = 70;
  const waveHost = battleField || document.body;
  const waves = [];
  for (let i = 0; i <= TRAIL_COUNT; i++) {
    const w = document.createElement('div');
    w.className = 'chi-wave' + (i === 1 ? ' chi-wave-trail' : i === 2 ? ' chi-wave-trail-far' : '');
    waves.push(w);
    if (waveHost) waveHost.appendChild(w);
  }

  let waveContactDelay = 550;
  if (battleField) {
    const fRect = fEl.getBoundingClientRect();
    const bRect = battleField.getBoundingClientRect();
    const startX = fRect.left - bRect.left + fRect.width / 2 + (dir * fRect.width * 0.4);
    const startY = fRect.top - bRect.top + fRect.height / 2;
    const tRect = tEl.getBoundingClientRect();
    const tNearEdge = tRect.left - bRect.left + (dir === 1 ? 0 : tRect.width);
    const tFarEdge = tRect.left - bRect.left + (dir === 1 ? tRect.width : 0);
    const contactDist = Math.abs(tNearEdge - startX);
    const travelDist = Math.abs(tFarEdge - startX) + 40;
    waveContactDelay = Math.max(300, Math.round(WAVE_DURATION_MS * contactDist / travelDist));

    waves.forEach((w, i) => {
      w.style.left = startX + 'px';
      w.style.top = startY + 'px';
      w.style.height = '130px';
      if (dir === -1) w.style.transform = 'translate(-50%, -50%) scaleX(-1)';
      // Stagger each trail's start so it "follows" the leader
      setTimeout(() => {
        const base = (dir === -1) ? 'translate(-50%, -50%) scaleX(-1)' : 'translate(-50%, -50%)';
        w.style.transition = `transform ${WAVE_DURATION_MS}ms cubic-bezier(.3,.55,.5,1), opacity 250ms ease-out ${WAVE_DURATION_MS - 200}ms`;
        w.style.transform = `${base} translateX(${dir * travelDist}px)`;
        w.style.opacity = '0';
      }, i * TRAIL_DELAY_MS);
    });
  }

  // ── Wait for wave to visually touch target ──
  await sleep(waveContactDelay);

  // ── Impact: camera shake + launch target ──
  if (battleField) {
    battleField.style.setProperty('--cam-scale', '1.1');
    battleField.classList.remove('battle-scene-shake');
    void battleField.offsetWidth; // reflow to restart animation
    battleField.classList.add('battle-scene-shake');
    setTimeout(() => battleField.classList.remove('battle-scene-shake'), 240);
  }
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
    // Flash target on each hit
    if (tElNode) {
      tElNode.classList.remove('chi-hit-flash');
      void tElNode.offsetWidth;
      tElNode.classList.add('chi-hit-flash');
      setTimeout(() => tElNode.classList.remove('chi-hit-flash'), 140);
    }
    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', i * 40, i * 18, { atkSide: attacker.side, amount: dmg });
    updateHpBar(primaryTarget, tElId);
    await triggerOnHitEffects(attacker, primaryTarget, dmg);
    await sleep(260);
  }

  // ── Enemy lands + brief recovery ──
  if (tElNode) tElNode.classList.remove('chi-launched');
  await sleep(320);

  // ── Camera zooms back out ──
  if (battleField) battleField.style.transform = 'scale(1)';
  await sleep(320);

  // Cleanup
  if (battleField) {
    battleField.style.transition = '';
    battleField.style.transform = '';
    battleField.style.transformOrigin = '';
  }
  setTimeout(() => { waves.forEach(w => { try { w.remove(); } catch(e) {} }); }, 600);
  await sleep(120);
}

// ── ICE TURTLE SKILLS ─────────────────────────────────────
