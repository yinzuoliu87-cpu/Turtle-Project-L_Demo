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
async function doBasicChiWave(attacker, target, skill) {
  const fElId = getFighterElId(attacker);
  const fEl = document.getElementById(fElId);
  if (!target || !target.alive) { await sleep(200); return; }

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

  // ── KOF-style cut-in: 500ms fullscreen dark + golden orb ──
  const cutin = document.createElement('div');
  cutin.className = 'chi-cutin';
  document.body.appendChild(cutin);
  await sleep(500);
  cutin.remove();

  // ── Target set: all alive enemies in the picked target's COLUMN ──
  // Wave penetrates both front and back of the chosen column. Target
  // selection at pick-time already enforces front-first per game rules.
  const enemyTeam = attacker.side === 'left' ? rightTeam : leftTeam;
  const targetCol = target._slotKey ? target._slotKey.split('-')[1] : null;
  let columnTargets = targetCol != null
    ? enemyTeam.filter(e => e.alive && e._slotKey && e._slotKey.split('-')[1] === targetCol)
    : [target];
  if (columnTargets.length === 0) columnTargets = [target];

  // ── Caster moves Y to target's row (KOF-style: stand on target's line) ──
  const battleField = document.getElementById('battleScene');
  const tEl = document.getElementById(getFighterElId(target));
  const dir = attacker.side === 'left' ? 1 : -1;
  const scale = parseFloat(getComputedStyle(fEl).getPropertyValue('--base-scale')) || 1;

  // Use .st-body (the actual sprite wrapper) for Y alignment, NOT the outer
  // .scene-turtle — the outer includes a ~19px HP bar above the sprite, so
  // its geometric center is ~9px above the visual turtle center. Aligning on
  // st-body puts the wave exactly through the sprite's middle.
  let casterYShift = 0;
  if (fEl && tEl) {
    const fBody = fEl.querySelector('.st-body') || fEl;
    const tBody = tEl.querySelector('.st-body') || tEl;
    const fRect0 = fBody.getBoundingClientRect();
    const tRect0 = tBody.getBoundingClientRect();
    casterYShift = (tRect0.top + tRect0.height / 2) - (fRect0.top + fRect0.height / 2);
  }
  // Camera zoom anchored on the target's row
  if (battleField && fEl && tEl) {
    const bRect = battleField.getBoundingClientRect();
    const fRect = fEl.getBoundingClientRect();
    const tRect = tEl.getBoundingClientRect();
    const midX = (fRect.left + fRect.width / 2 + tRect.left + tRect.width / 2) / 2;
    const midY = tRect.top + tRect.height / 2;
    const ox = (midX - bRect.left) / bRect.width * 100;
    const oy = (midY - bRect.top) / bRect.height * 100;
    battleField.style.transformOrigin = `${ox}% ${oy}%`;
    battleField.style.transition = 'transform 350ms ease-out';
    battleField.style.transform = 'scale(1.1)';
  }
  // Slide caster vertically to target's row — keep his own X, just change Y.
  // z-index bump so he renders above teammates during skill.
  fEl.style.transition = 'transform 280ms cubic-bezier(.4,.9,.4,1)';
  fEl.style.transform = `translateY(${casterYShift}px) scale(${scale})`;
  fEl.style.zIndex = '50';
  await sleep(300);

  // ── Windup: caster pulses briefly to show "charging" ──
  // chi-charging's keyframe uses its OWN transform on .st-body, which composes
  // inside the scene-turtle's translateY (applied above). No collision.
  fEl.classList.add('chi-charging');
  await sleep(550);
  fEl.classList.remove('chi-charging');

  // ── Fire chi wave ──
  // Single wave element driven by sprite-sheet animation (15 frames × 100ms
  // = 1500ms lifecycle). The sprite's own frames handle spawn/peak/dissipate
  // visuals — no separate DOM trail copies needed.
  const WAVE_DURATION_MS = 1500;
  const waveHost = battleField || document.body;
  const wave = document.createElement('div');
  wave.className = 'chi-wave';
  const waves = [wave]; // kept as array so cleanup loop still works
  if (waveHost) waveHost.appendChild(wave);

  // Per-target hit-trigger delay: each column target launches when the wave
  // passes through 90% of its own width (KOF-style "overshoot then launch").
  // Wave travel endpoint is set to pass the FURTHEST target + 60px buffer.
  const targetHitSchedule = []; // [{target, delay, tNode}]
  let maxTravelDist = 0;
  if (battleField) {
    // Use .st-body for spawn Y too (matches the sprite center, not the
    // HP-bar-inclusive container center).
    const fBody = fEl.querySelector('.st-body') || fEl;
    const fRect = fBody.getBoundingClientRect();
    const bRect = battleField.getBoundingClientRect();
    const startX = fRect.left - bRect.left + fRect.width / 2 + (dir * fRect.width * 0.4);
    // Y offset from .st-body geometric center to the visible "strike zone"
    // on the turtle (roughly chest/upper-shell height — reads best for KOF
    // fireball impact). Empirically tuned: negative = push wave UP.
    const WAVE_Y_CORRECTION = -40;
    const startY = fRect.top - bRect.top + fRect.height / 2 + WAVE_Y_CORRECTION;
    // Trajectory MUST be invariant of which enemies are alive — always travel
    // to the column's back-row slot position (from the fixed layout table),
    // so the wave speed is constant. Look up position from BATTLE_POSITIONS
    // rather than a DOM element, so empty back slots still work.
    let backRowCenterX = null;
    if (targetCol != null && typeof BATTLE_POSITIONS !== 'undefined' && typeof mapCoverPos === 'function') {
      const posSet = window.innerWidth <= 768 ? BATTLE_POSITIONS.mobile : BATTLE_POSITIONS.desktop;
      const enemySide = attacker.side === 'left' ? 'right' : 'left';
      const backPos = posSet[`back-${targetCol}`];
      if (backPos) {
        const imgX = enemySide === 'left' ? backPos.x : (100 - backPos.x);
        const mapped = mapCoverPos(imgX, backPos.y, bRect.width, bRect.height);
        backRowCenterX = mapped.px;
      }
    }
    if (backRowCenterX != null) {
      // Overshoot by half a turtle width so wave visibly exits past back row.
      const halfW = fRect.width / 2;
      const tFar = backRowCenterX + (dir === 1 ? halfW : -halfW);
      maxTravelDist = Math.abs(tFar - startX);
    } else {
      // Fallback (no targetCol / no back slot defined): farthest live in column.
      for (const t of columnTargets) {
        const el = document.getElementById(getFighterElId(t));
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const tFar = r.left - bRect.left + (dir === 1 ? r.width : 0);
        const d = Math.abs(tFar - startX);
        if (d > maxTravelDist) maxTravelDist = d;
      }
    }
    const travelDist = maxTravelDist + 60;

    // Per-target contact delay: trigger when the flame TIP reaches the
    // target's NEAR edge (the side facing the caster) — i.e., first touch.
    // Element is 256×256; flame tip sits ~110px ahead of element center.
    const WAVE_VISUAL_LEAD = 110;
    for (const t of columnTargets) {
      const el = document.getElementById(getFighterElId(t));
      if (!el) continue;
      const r = el.getBoundingClientRect();
      // tNear: target's edge facing the caster (dir=1 → left edge; dir=-1 → right edge)
      const tNear = r.left - bRect.left + (dir === 1 ? 0 : r.width);
      const hitCenterDist = Math.abs(tNear - startX) - WAVE_VISUAL_LEAD;
      const delay = Math.max(80, Math.round(WAVE_DURATION_MS * hitCenterDist / travelDist));
      targetHitSchedule.push({ target: t, delay, tNode: el });
    }
    targetHitSchedule.sort((a, b) => a.delay - b.delay);

    // Position the single wave element and launch its travel.
    wave.style.left = startX + 'px';
    wave.style.top = startY + 'px';
    if (dir === -1) wave.style.transform = 'translate(-50%, -50%) scaleX(-1)';
    requestAnimationFrame(() => {
      const base = (dir === -1) ? 'translate(-50%, -50%) scaleX(-1)' : 'translate(-50%, -50%)';
      wave.style.transition = `transform ${WAVE_DURATION_MS}ms linear`;
      wave.style.transform = `${base} translateX(${dir * travelDist}px)`;
    });
  } else {
    targetHitSchedule.push({ target, delay: 600, tNode: tEl });
  }

  // ── Run hit sequences for each target in parallel with per-target delays ──
  const perHitScale = (skill.atkScale || 1.5) / 3;
  const hits = 3;
  const hitTasks = targetHitSchedule.map(async ({ target: tgt, delay, tNode }) => {
    await sleep(delay);
    if (!tgt.alive) return;
    // Camera shake on FIRST target's hit (to sell the impact once)
    if (battleField && tgt === targetHitSchedule[0].target) {
      battleField.style.setProperty('--cam-scale', '1.1');
      battleField.classList.remove('battle-scene-shake');
      void battleField.offsetWidth;
      battleField.classList.add('battle-scene-shake');
      setTimeout(() => battleField.classList.remove('battle-scene-shake'), 240);
    }
    const tId = getFighterElId(tgt);
    // Set knock direction (wave's travel direction) before launching
    if (tNode) {
      tNode.style.setProperty('--chi-knock-x', (dir * 55) + 'px');
      tNode.classList.add('chi-launched');
    }
    for (let i = 0; i < hits; i++) {
      if (!tgt.alive) break;
      const eDef = calcEffDef(attacker, tgt);
      const { isCrit, critMult } = calcCrit(attacker);
      const dmg = Math.max(1, Math.round(attacker.atk * perHitScale * critMult * calcDmgMult(eDef)));
      applyRawDmg(attacker, tgt, dmg, false, false, 'physical');
      if (tNode) {
        tNode.classList.remove('chi-hit-flash');
        void tNode.offsetWidth;
        tNode.classList.add('chi-hit-flash');
        setTimeout(() => tNode.classList.remove('chi-hit-flash'), 140);
      }
      spawnFloatingNum(tId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', i * 40, i * 18, { atkSide: attacker.side, amount: dmg });
      updateHpBar(tgt, tId);
      await triggerOnHitEffects(attacker, tgt, dmg);
      await sleep(260);
    }
    // 3 hits finished at ~780ms. chi-launched animation is 1700ms (slam +
    // lie + get up + run back). Wait remaining ~920ms for landing sequence
    // to play before removing the class.
    await sleep(920);
    if (tNode) {
      tNode.classList.remove('chi-launched');
      tNode.style.removeProperty('--chi-knock-x');
    }
  });
  await Promise.all(hitTasks);
  await sleep(100);

  // ── Caster slides back to own row + camera zooms out ──
  fEl.style.transition = 'transform 320ms cubic-bezier(.35,.9,.4,1)';
  fEl.style.transform = `translateY(0) scale(${scale})`;
  if (battleField) battleField.style.transform = 'scale(1)';
  await sleep(340);

  // Cleanup
  fEl.style.transition = '';
  fEl.style.transform = '';
  fEl.style.zIndex = '';
  if (battleField) {
    battleField.style.transition = '';
    battleField.style.transform = '';
    battleField.style.transformOrigin = '';
  }
  setTimeout(() => { waves.forEach(w => { try { w.remove(); } catch(e) {} }); }, 600);
  await sleep(120);
}

// ── ICE TURTLE SKILLS ─────────────────────────────────────
