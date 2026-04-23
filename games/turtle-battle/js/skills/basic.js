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

// Physics-driven juggle keyframes. Each hit applies an upward + backward
// impulse; gravity accelerates the body continuously between impulses so
// rise decelerates and fall accelerates smoothly — true parabolic motion.
// Sampled at 60fps, handed to WAAPI with linear easing so the browser
// only interpolates between adjacent samples (never introduces its own
// velocity curves that would clash with the physics).
function buildJuggleKeyframes(knockX, isMobile) {
  const totalMs = isMobile ? 1850 : 2000;
  const g = isMobile ? 900 : 1500;            // px/s² — tuned by feel
  const hits = isMobile
    ? [{ t: 0, vy: -180, vx: knockX * 1.7 }, { t: 220, vy: -220, vx: knockX * 1.4 }, { t: 440, vy: -250, vx: knockX * 0.9 }]
    : [{ t: 0, vy: -260, vx: knockX * 1.6 }, { t: 220, vy: -310, vx: knockX * 1.3 }, { t: 440, vy: -360, vx: knockX * 0.9 }];
  const rotImpulses = [-45, 70, -95];
  const liePoseMs = isMobile ? 520 : 560;
  const recoverMs = isMobile ? 300 : 330;
  const slamRot = -82;
  const steps = 64;
  const dt = totalMs / steps / 1000;

  const s = { x: 0, y: 0, rot: 0, vx: 0, vy: 0, vrot: 0 };
  let hitIdx = 0;
  let slamT = null;
  let slamPose = null;
  let recoverT = null;

  const kf = [];
  for (let i = 0; i <= steps; i++) {
    const tMs = (i / steps) * totalMs;
    while (hitIdx < hits.length && tMs >= hits[hitIdx].t) {
      s.vy = hits[hitIdx].vy;
      s.vx = hits[hitIdx].vx;
      s.vrot = rotImpulses[hitIdx];
      hitIdx++;
    }
    if (slamT == null) {
      // Ballistic
      s.vy += g * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vrot * dt;
      // Ground check (but only after all hits have fired)
      if (s.y >= 0 && hitIdx === hits.length && tMs > 500) {
        s.y = 0;
        s.rot = slamRot;
        s.vx = s.vy = s.vrot = 0;
        slamT = tMs;
        slamPose = { x: s.x, y: 0, rot: slamRot };
      }
    } else if (recoverT == null) {
      // Lie still
      if (tMs >= slamT + liePoseMs) recoverT = tMs;
    } else {
      // Tween back to origin
      const p = Math.min(1, (tMs - recoverT) / recoverMs);
      const e = p < .5 ? 2*p*p : 1 - Math.pow(-2*p + 2, 2)/2; // ease-in-out
      s.x = slamPose.x * (1 - e);
      s.y = slamPose.y * (1 - e);
      s.rot = slamPose.rot * (1 - e);
    }
    kf.push({
      transform: `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) rotate(${s.rot.toFixed(1)}deg)`,
      offset: i / steps
    });
  }
  return { kf, totalMs };
}

async function doBasicChiWave(attacker, target, skill) {
  const fElId = getFighterElId(attacker);
  const fEl = document.getElementById(fElId);
  if (!target || !target.alive) { await sleep(200); return; }

  // ── Self buffs (1 turn) ──
  const armorPenDelta = Math.round(attacker.atk * (skill.armorPenGain || 0.1));
  attacker.crit += (skill.critGain || 25) / 100;
  attacker._extraCritDmgPerm = (attacker._extraCritDmgPerm || 0) + (skill.critDmgGain || 20) / 100;
  attacker._lifestealPct = (attacker._lifestealPct || 0) + (skill.lifestealGain || 10);
  attacker.armorPen += armorPenDelta;
  attacker.buffs.push({ type: 'chiWaveActive', turns: 1, revert: {
    crit: (skill.critGain || 25) / 100,
    critDmg: (skill.critDmgGain || 20) / 100,
    lifesteal: (skill.lifestealGain || 10),
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
    battleField.style.transition = 'transform 400ms ease-out';
    battleField.style.transform = 'scale(1.2)';
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
    // battleField may be scaled (camera zoom). getBoundingClientRect is in
    // screen pixels, but wave.style.left/top is in battleField LOCAL coords
    // (pre-transform). Convert screen → local by dividing by zoom.
    const zoom = battleField.offsetWidth ? bRect.width / battleField.offsetWidth : 1;
    const fLeft = (fRect.left - bRect.left) / zoom;
    const fTop  = (fRect.top  - bRect.top)  / zoom;
    const fW = fRect.width / zoom;
    const fH = fRect.height / zoom;
    const startX = fLeft + fW / 2 + (dir * fW * 0.4);
    // Y offset from .st-body geometric center to the visible "strike zone"
    // on the turtle (roughly chest/upper-shell height — reads best for KOF
    // fireball impact). Empirically tuned: negative = push wave UP.
    const WAVE_Y_CORRECTION = -15;
    const startY = fTop + fH / 2 + WAVE_Y_CORRECTION;
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
        // Use unscaled (local) battlefield dimensions so mapped result is local.
        const mapped = mapCoverPos(imgX, backPos.y, battleField.offsetWidth, battleField.offsetHeight);
        backRowCenterX = mapped.px;
      }
    }
    if (backRowCenterX != null) {
      const halfW = fW / 2;
      const tFar = backRowCenterX + (dir === 1 ? halfW : -halfW);
      maxTravelDist = Math.abs(tFar - startX);
    } else {
      for (const t of columnTargets) {
        const el = document.getElementById(getFighterElId(t));
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const rLeft = (r.left - bRect.left) / zoom;
        const rW = r.width / zoom;
        const tFar = rLeft + (dir === 1 ? rW : 0);
        const d = Math.abs(tFar - startX);
        if (d > maxTravelDist) maxTravelDist = d;
      }
    }
    const travelDist = maxTravelDist + 60;

    // Per-target contact delay: trigger when the flame TIP reaches the
    // target's NEAR edge (the side facing the caster) — i.e., first touch.
    // Element is 256×256; flame tip sits ~110px ahead of element center.
    const WAVE_VISUAL_LEAD = 80;
    for (const t of columnTargets) {
      const el = document.getElementById(getFighterElId(t));
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const rLeft = (r.left - bRect.left) / zoom;
      const rW = r.width / zoom;
      // tNear: target's edge facing the caster (dir=1 → left edge; dir=-1 → right edge)
      const tNear = rLeft + (dir === 1 ? 0 : rW);
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
      battleField.style.setProperty('--cam-scale', '1.2');
      battleField.classList.remove('battle-scene-shake');
      void battleField.offsetWidth;
      battleField.classList.add('battle-scene-shake');
      setTimeout(() => battleField.classList.remove('battle-scene-shake'), 240);
    }
    const tId = getFighterElId(tgt);
    // Launch physics-driven juggle on .st-body via WAAPI. CSS .chi-launched
    // class stays (pauses the sprite-sheet while airborne) but no longer
    // drives transforms — JS handles that now.
    const tBody = tNode ? tNode.querySelector('.st-body') : null;
    let juggleAnim = null;
    if (tBody) {
      const isMobile = window.innerWidth <= 768;
      const knockX = isMobile ? dir * 30 : dir * 55;
      const { kf, totalMs } = buildJuggleKeyframes(knockX, isMobile);
      juggleAnim = tBody.animate(kf, { duration: totalMs, easing: 'linear', fill: 'forwards' });
      tNode.classList.add('chi-launched');
    }
    // Hits land at t=0 / 220 / 440ms — matches the physics hit-impulse
    // timings. Each hit re-launches the target upward (aerial juggle).
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
      if (i < hits - 1) await sleep(220);
    }
    // Wait for physics animation to finish (rise → slam → lie → recover).
    if (juggleAnim) {
      try { await juggleAnim.finished; } catch (e) {}
      if (tBody) tBody.style.transform = '';
    } else {
      await sleep(1560);
    }
    if (tNode) tNode.classList.remove('chi-launched');
  });
  // Schedule the camera pull-back to fire ~300ms after the LAST hit lands,
  // in parallel with the still-running juggle/landing animations. Waiting
  // for Promise.all would hold the zoomed-in view for ~2s of lie/get-up,
  // which feels like the camera is stuck.
  const maxHitDelay = targetHitSchedule.length ? Math.max(...targetHitSchedule.map(s => s.delay)) : 0;
  const zoomOutAfter = maxHitDelay + 440 + 300; // last hit at delay+440 (3 hits × 220ms apart)
  setTimeout(() => {
    fEl.style.transition = 'transform 320ms cubic-bezier(.35,.9,.4,1)';
    fEl.style.transform = `translateY(0) scale(${scale})`;
    if (battleField) battleField.style.transform = 'scale(1)';
  }, zoomOutAfter);

  await Promise.all(hitTasks);
  await sleep(100);

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

// ──────────────────────────────────────────────────────────
// 过肩摔 — shoulder-throw slam
// Flow:
//  1. Camera zoom in on target row
//  2. Caster dashes X+Y to land adjacent to target (caster-side)
//  3. Grab pause + flash on both
//  4. Target thrown in arc OVER caster's shoulder, landing BEHIND caster
//     with 180° flip (face-down on ground)
//  5. On slam: shockwave + dust + screen shake
//     → main damage on target, splash damage to other enemies
//  6. Target lies slammed briefly, then hops back to original slot
//  7. Caster dashes back + camera zooms out
async function doBasicSlam(attacker, target, skill) {
  const fElId = getFighterElId(attacker);
  const fEl = document.getElementById(fElId);
  if (!fEl || !target || !target.alive) { await sleep(200); return; }

  const tEl = document.getElementById(getFighterElId(target));
  const battleField = document.getElementById('battleScene');
  const dir = attacker.side === 'left' ? 1 : -1;
  const scale = parseFloat(getComputedStyle(fEl).getPropertyValue('--base-scale')) || 1;
  const isMobile = window.innerWidth <= 768;

  // Compute caster's dash destination (adjacent to target) in battleField local coords.
  let casterShiftX = 0, casterShiftY = 0;
  let zoom = 1;
  if (fEl && tEl && battleField) {
    const fBody = fEl.querySelector('.st-body') || fEl;
    const tBody = tEl.querySelector('.st-body') || tEl;
    const fRect = fBody.getBoundingClientRect();
    const tRect = tBody.getBoundingClientRect();
    const bRect = battleField.getBoundingClientRect();
    zoom = battleField.offsetWidth ? bRect.width / battleField.offsetWidth : 1;
    const adjacentGap = isMobile ? 40 : 58;
    casterShiftX = ((tRect.left + tRect.width / 2) - (fRect.left + fRect.width / 2)) / zoom - dir * adjacentGap;
    casterShiftY = ((tRect.top + tRect.height / 2) - (fRect.top + fRect.height / 2)) / zoom;
  }

  // ── Camera zoom ──
  if (battleField && fEl && tEl) {
    const bRect = battleField.getBoundingClientRect();
    const fRect = fEl.getBoundingClientRect();
    const tRect = tEl.getBoundingClientRect();
    const midX = (fRect.left + fRect.width / 2 + tRect.left + tRect.width / 2) / 2;
    const midY = tRect.top + tRect.height / 2;
    const ox = (midX - bRect.left) / bRect.width * 100;
    const oy = (midY - bRect.top) / bRect.height * 100;
    battleField.style.transformOrigin = `${ox}% ${oy}%`;
    battleField.style.transition = 'transform 380ms ease-out';
    battleField.style.transform = 'scale(1.22)';
  }

  // ── Caster dashes to target ──
  fEl.style.transition = 'transform 280ms cubic-bezier(.35,.9,.4,1)';
  fEl.style.transform = `translate(${casterShiftX}px, ${casterShiftY}px) scale(${scale})`;
  fEl.style.zIndex = '50';
  await sleep(310);

  // ── Grab moment: flash on both ──
  if (tEl) {
    tEl.classList.add('chi-hit-flash');
    setTimeout(() => tEl.classList.remove('chi-hit-flash'), 180);
  }
  fEl.classList.add('chi-hit-flash');
  setTimeout(() => fEl.classList.remove('chi-hit-flash'), 180);
  await sleep(120);

  // ── Throw arc: target lands at the midpoint of enemy's F1 and B1 slots ──
  // (front-1 and back-1 — the horizontal middle of the formation, caster-facing).
  let throwDx = 0, throwDy = 0;
  let slamAnchorX_local = 0, slamAnchorY_local = 0;
  if (tEl && battleField && typeof BATTLE_POSITIONS !== 'undefined' && typeof mapCoverPos === 'function') {
    const posSet = isMobile ? BATTLE_POSITIONS.mobile : BATTLE_POSITIONS.desktop;
    const enemySide = attacker.side === 'left' ? 'right' : 'left';
    const f1 = posSet['front-1'], b1 = posSet['back-1'];
    const f1x = enemySide === 'left' ? f1.x : (100 - f1.x);
    const b1x = enemySide === 'left' ? b1.x : (100 - b1.x);
    const anchorImgX = (f1x + b1x) / 2;
    const anchorImgY = (f1.y + b1.y) / 2;
    const mapped = mapCoverPos(anchorImgX, anchorImgY, battleField.offsetWidth, battleField.offsetHeight);
    slamAnchorX_local = mapped.px;
    slamAnchorY_local = mapped.py;

    // CRITICAL: re-measure zoom NOW. The `zoom` variable captured at the top of
    // doBasicSlam was taken before the camera zoom transition started (=1.0);
    // by this point the camera is at scale(1.22). Using the stale zoom would
    // make tCenterX_local come out in screen pixels (22% too large), and the
    // target would be thrown the WRONG DIRECTION (in front of F1 instead of
    // at F1-B1 midpoint).
    const bRect = battleField.getBoundingClientRect();
    const zoomNow = battleField.offsetWidth ? bRect.width / battleField.offsetWidth : 1;
    // Target's current body center in local coords (uses fresh zoom)
    const tBodyEl = tEl.querySelector('.st-body') || tEl;
    const tRect = tBodyEl.getBoundingClientRect();
    const tCenterX_local = ((tRect.left + tRect.width / 2) - bRect.left) / zoomNow;
    const tCenterY_local = ((tRect.top  + tRect.height / 2) - bRect.top)  / zoomNow;
    // .st-body sits inside .scene-turtle (scale 1.375) — a translate value of N
    // becomes N × 1.375 on screen. Divide by that scale so the target visually
    // lands at the same battleField-local coord as the slam anchor.
    const tScale = parseFloat(getComputedStyle(tEl).getPropertyValue('--base-scale')) || 1;
    throwDx = (slamAnchorX_local - tCenterX_local) / tScale;
    throwDy = (slamAnchorY_local - tCenterY_local) / tScale;
  }
  const peakY   = isMobile ? -90 : -115;
  const throwMs = 520;
  const tBody = tEl ? tEl.querySelector('.st-body') : null;
  let throwAnim = null;
  if (tBody) {
    const steps = 30;
    const kf = [];
    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      // Smooth X/Y (ease-in-out)
      const ex = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      // Parabolic airborne Y peaking slightly before midpoint
      const peakP = 0.42;
      const norm = p <= peakP ? (p / peakP) : (1 - (p - peakP) / (1 - peakP));
      const airY = peakY * Math.max(0, norm);
      // Base Y interpolates target's home → slam anchor; airborne arc added.
      const y = (throwDy * ex) + airY;
      const x = throwDx * ex;
      // Rotation: one full 360 over the shoulder.
      const rot = dir * 360 * ex;
      kf.push({
        transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`,
        offset: p
      });
    }
    tEl.classList.add('slam-thrown');
    throwAnim = tBody.animate(kf, { duration: throwMs, easing: 'linear', fill: 'forwards' });
  }

  await sleep(throwMs);

  // ── SLAM IMPACT ──
  if (tEl && battleField) {
    // Fixed slam anchor (center of enemy's 6 slots) — matches throw endpoint.
    const slamX = slamAnchorX_local;
    const slamY = slamAnchorY_local;

    const impact = document.createElement('div');
    impact.className = 'slam-impact';
    impact.style.left = slamX + 'px';
    impact.style.top  = slamY + 'px';
    battleField.appendChild(impact);
    setTimeout(() => impact.remove(), 760);

    battleField.style.setProperty('--cam-scale', '1.22');
    battleField.classList.remove('battle-scene-shake');
    void battleField.offsetWidth;
    battleField.classList.add('battle-scene-shake');
    setTimeout(() => battleField.classList.remove('battle-scene-shake'), 260);
  }

  // Main damage + splash (both at slam instant)
  const mainDmg = Math.round(attacker.atk * (skill.atkScale || 1)) + Math.round(target.maxHp * (skill.targetHpPct || 0) / 100);
  const mainResult = applyRawDmg(attacker, target, mainDmg, false, false, 'physical');
  spawnFloatingNum(getFighterElId(target), `-${mainResult.hpLoss || mainDmg}`, 'direct-dmg', 0, 0,
    { atkSide: attacker.side, amount: mainDmg });
  updateHpBar(target, getFighterElId(target));
  if (tEl) {
    tEl.classList.remove('chi-hit-flash');
    void tEl.offsetWidth;
    tEl.classList.add('chi-hit-flash');
    setTimeout(() => tEl.classList.remove('chi-hit-flash'), 160);
  }
  await triggerOnHitEffects(attacker, target, mainDmg);
  addLog(`${attacker.emoji}${attacker.name} <b>过肩摔</b> → ${target.emoji}${target.name}：${mainDmg} 物理伤害`);

  const enemyTeam = attacker.side === 'left' ? rightTeam : leftTeam;
  const others = enemyTeam.filter(e => e.alive && e !== target);
  for (const o of others) {
    const splashDmg = Math.round(attacker.atk * (skill.splashAtkScale || 0.3))
                    + Math.round(target.maxHp * (skill.splashHpPct || 16) / 100);
    applyRawDmg(attacker, o, splashDmg, false, false, 'physical');
    const oEl = document.getElementById(getFighterElId(o));
    if (oEl) {
      oEl.classList.remove('chi-hit-flash');
      void oEl.offsetWidth;
      oEl.classList.add('chi-hit-flash');
      setTimeout(() => oEl.classList.remove('chi-hit-flash'), 140);
    }
    spawnFloatingNum(getFighterElId(o), `-${splashDmg}`, 'direct-dmg', 0, 0,
      { atkSide: attacker.side, amount: splashDmg });
    updateHpBar(o, getFighterElId(o));
    addLog(`  溅射 ${o.emoji}${o.name} ${splashDmg} 物理`);
  }

  // ── Target lies slammed briefly ──
  await sleep(340);

  // ── Target hops back to original slot, caster dashes back, camera zooms out ──
  if (tBody) {
    const returnKf = [
      { transform: `translate(${throwDx.toFixed(1)}px, ${throwDy.toFixed(1)}px) rotate(${dir * 360}deg)`, offset: 0 },
      { transform: `translate(${(throwDx * 0.45).toFixed(1)}px, ${(throwDy * 0.5 - 26).toFixed(1)}px) rotate(${dir * 360}deg)`, offset: 0.55 },
      { transform: `translate(0px, 0px) rotate(${dir * 360}deg)`, offset: 1 }
    ];
    tBody.animate(returnKf, { duration: 420, easing: 'cubic-bezier(.4,.9,.3,1)', fill: 'forwards' });
    setTimeout(() => {
      if (tBody) tBody.style.transform = '';
      if (tEl) tEl.classList.remove('slam-thrown');
    }, 440);
  }
  fEl.style.transition = 'transform 340ms cubic-bezier(.35,.9,.4,1)';
  fEl.style.transform = `translate(0px, 0px) scale(${scale})`;
  if (battleField) battleField.style.transform = 'scale(1)';
  // Wait only long enough for the caster to reach home visually; don't hold
  // the function for the trailing tail — the next-turn UI should appear
  // the moment visuals are in place, not 80ms after.
  await sleep(340);

  // Cleanup (fires as the function returns; inline styles clear to their
  // CSS defaults with no visible snap because animation end-states match).
  fEl.style.transition = '';
  fEl.style.transform = '';
  fEl.style.zIndex = '';
  if (battleField) {
    battleField.style.transition = '';
    battleField.style.transform = '';
    battleField.style.transformOrigin = '';
  }
}

// ── ICE TURTLE SKILLS ─────────────────────────────────────
