// ─────────────────────────────────────────────────────────
// 2-hit cyber juggle — physics-driven knockup-and-back tailored for
// 能量大炮's two beam segments. Adapted from buildJuggleKeyframes (3-hit
// chi-wave version). Returns { kf, totalMs, segMs[] } so callers can
// time their damage/float spawns to each in-air hit moment.
function buildCyberBeamJuggle(knockX, isMobile, opts) {
  // opts.noRotation + opts.knockupAnim: simple ascent → descent → run-back
  // (no lie/rot) so body keyframes sync with knockup sprite + runAnim chain.
  const noRot = opts && opts.noRotation;
  if (noRot && opts && opts.knockupAnim) {
    const k = opts.knockupAnim;
    const airMs    = (k.airborneMs || 300) + (k.descentMs || 300);
    const lyingMs  = k.lyingMs   || 0;
    const runBackMs = k.runBackMs || 400;
    const totalMs  = airMs + lyingMs + runBackMs;
    const peakY    = isMobile ? -58 : -84;
    const slamX    = knockX * 1.3;
    const peakOff  = (airMs/2)/totalMs;
    const landOff  = airMs/totalMs;
    const lieEndOff= (airMs + lyingMs)/totalMs;
    return {
      kf: [
        { transform: 'translate(0px, 0px)',                              offset: 0,         easing: 'cubic-bezier(0, .55, .45, 1)' },
        { transform: `translate(${(slamX/2).toFixed(1)}px, ${peakY}px)`, offset: peakOff,   easing: 'cubic-bezier(.55, 0, 1, .45)' },
        { transform: `translate(${slamX.toFixed(1)}px, 0px)`,            offset: landOff,   easing: 'linear' },
        { transform: `translate(${slamX.toFixed(1)}px, 0px)`,            offset: lieEndOff, easing: 'linear' },
        { transform: 'translate(0px, 0px)',                              offset: 1 }
      ],
      totalMs,
      segHits: [0, Math.round(airMs * 0.4)]
    };
  }
  const totalMs = isMobile ? 1700 : 1600;
  const g = isMobile ? 900 : 1500;
  // 2 launch impulses spaced ~280ms apart
  const hits = isMobile
    ? [{ t: 0, vy: -200, vx: knockX * 1.5 }, { t: 280, vy: -250, vx: knockX * 1.0 }]
    : [{ t: 0, vy: -280, vx: knockX * 1.5 }, { t: 280, vy: -340, vx: knockX * 1.0 }];
  const rotImpulses = noRot ? [0, 0] : [-50, 90];
  const liePoseMs = isMobile ? 480 : 500;
  const recoverMs = isMobile ? 280 : 300;
  const slamRot = noRot ? 0 : -82;
  const steps = 56;
  const dt = totalMs / steps / 1000;
  const s = { x:0, y:0, rot:0, vx:0, vy:0, vrot:0 };
  let hitIdx = 0, slamT = null, slamPose = null, recoverT = null;
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
      s.vy += g * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vrot * dt;
      if (s.y >= 0 && hitIdx === hits.length && tMs > 380) {
        s.y = 0; s.rot = slamRot; s.vx = s.vy = s.vrot = 0;
        slamT = tMs; slamPose = { x: s.x, y: 0, rot: slamRot };
      }
    } else if (recoverT == null) {
      if (tMs >= slamT + liePoseMs) recoverT = tMs;
    } else {
      const p = Math.min(1, (tMs - recoverT) / recoverMs);
      const e = p < .5 ? 2*p*p : 1 - Math.pow(-2*p + 2, 2)/2;
      s.x = slamPose.x * (1 - e);
      s.y = slamPose.y * (1 - e);
      s.rot = slamPose.rot * (1 - e);
    }
    kf.push({
      transform: `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) rotate(${s.rot.toFixed(1)}deg)`,
      offset: i / steps
    });
  }
  return { kf, totalMs, segHits: hits.map(h => h.t) };
}

// ─────────────────────────────────────────────────────────
// 能量大炮 cyberBeam — KOF-style choreographed cyber laser sweep.
// Pattern follows 龟派气波 (basic chi-wave): cut-in → camera zoom →
// caster Y-hops to target row → windup pose (beat) → fire beam →
// per-target hits with juggle animation → camera + caster restore.
// ─────────────────────────────────────────────────────────
async function doCyberBeam(attacker, target, skill) {
  const fElId = getFighterElId(attacker);
  const fEl = document.getElementById(fElId);
  if (!fEl || !target || !target.alive) { await sleep(200); return; }

  const isMobile = ENV.isMobile;
  const droneCount = (attacker._drones || []).length;
  const trueScaleTotal = attacker._cyberEnhanced
    ? (skill.droneTrueScaleEnhanced || 0.07)
    : (skill.droneTrueScale || 0.10);
  const trueDmgPerSeg = Math.round(attacker.atk * (trueScaleTotal / 2) * droneCount);
  const physScale = skill.atkScale || 0.5;
  const physHits = skill.hits || 2;
  const trueHits = 2;

  // Targets in target's HORIZONTAL row (same slot index — F+B at same Y)
  const oppTeam = (attacker.side === 'left' ? rightTeam : leftTeam);
  const tIdx = target._slotKey ? target._slotKey.split('-')[1] : null;
  let rowEnemies = tIdx != null
    ? oppTeam.filter(e => e.alive && e._slotKey && e._slotKey.split('-')[1] === tIdx)
    : [target];
  if (!rowEnemies.length) rowEnemies = [target];

  const battleField = ENV.battleField;
  const tEl = document.getElementById(getFighterElId(target));
  const dir = attacker.side === 'left' ? 1 : -1;
  const scale = parseFloat(getComputedStyle(fEl).getPropertyValue('--base-scale')) || 1;

  // ── 1) KOF cut-in: blue/cyan fullscreen flash, 500ms ──
  const cutin = document.createElement('div');
  cutin.className = 'cyber-cutin';
  document.body.appendChild(cutin);
  await sleep(500);
  cutin.remove();

  // ── 2) Camera zoom anchored to the row's mid-point ──
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

  // ── 3) Caster HOPS in an arc to target's row ──
  // Build a smooth parabolic arc with many keyframes (linear interpolation
  // between them follows the formula y(t) = Yshift × t + 4·apex·t·(1-t)).
  // Per-keyframe easing was causing visible kinks at apex — pure linear
  // between dense keyframes reads smoother for a jump.
  let casterYShift = 0;
  if (fEl && tEl) {
    const fBody = fEl.querySelector('.st-body') || fEl;
    const tBody = tEl.querySelector('.st-body') || tEl;
    const fRect0 = fBody.getBoundingClientRect();
    const tRect0 = tBody.getBoundingClientRect();
    casterYShift = (tRect0.top + tRect0.height / 2) - (fRect0.top + fRect0.height / 2);
  }
  fEl.style.zIndex = '50';
  let hopAnim = null;
  const buildArc = (dy, apexLift, dur) => {
    const N = 12;
    const kf = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = dy * t + apexLift * 4 * t * (1 - t);
      kf.push({ transform: `translateY(${y}px) scale(${scale})`, offset: t });
    }
    return fEl.animate(kf, { duration: dur, easing: 'linear', fill: 'forwards' });
  };
  if (Math.abs(casterYShift) > 4) {
    const apexLift = -Math.min(44, 24 + Math.abs(casterYShift) * 0.28);
    hopAnim = buildArc(casterYShift, apexLift, 460);
  } else {
    hopAnim = buildArc(0, -10, 280);
  }
  await sleep(480);

  // ── 4) Windup beat (own cyber-beam-charging class — separate from chi-wave) ──
  fEl.classList.add('cyber-beam-charging');
  await sleep(550);
  fEl.classList.remove('cyber-beam-charging');

  // ── 5) Fire beam: stretch sprite from caster center to scene edge ──
  // Beam life bumped to 720ms (matches CSS). Caster waits for the FULL beam
  // life + tail before hopping back.
  const beamLifeMs = 720;
  if (battleField && fEl) {
    const bRect = battleField.getBoundingClientRect();
    const zoom = battleField.offsetWidth ? bRect.width / battleField.offsetWidth : 1;
    const fBody = fEl.querySelector('.st-body') || fEl;
    const fRect = fBody.getBoundingClientRect();
    const fCx = ((fRect.left + fRect.width / 2) - bRect.left) / zoom;
    const fCy = ((fRect.top  + fRect.height / 2) - bRect.top)  / zoom;
    const sceneW = battleField.offsetWidth;
    const farEdgeX = (dir === 1) ? sceneW : 0;
    const beamLen = Math.max(120, Math.abs(farEdgeX - fCx));
    const beam = document.createElement('div');
    beam.className = 'cyber-beam-sweep';
    beam.style.width = beamLen + 'px';
    beam.style.top = (fCy - (isMobile ? 56 : 80)) + 'px';  // half of new beam height
    if (dir === 1) {
      beam.style.left = fCx + 'px';
    } else {
      beam.style.left = (fCx - beamLen) + 'px';
      beam.classList.add('flip-x');
    }
    battleField.appendChild(beam);
    setTimeout(() => beam.remove(), beamLifeMs + 60);
  }

  // ── 6) Damage all row enemies SIMULTANEOUSLY (this is one beam, not a sweep) ──
  // Wait for beam to peak (frame 3 of 6 ≈ 360ms), then hit everyone at once.
  await sleep(360);

  // Camera shake — IMPORTANT: must set --cam-scale to match the active zoom
  // (1.2) BEFORE adding .battle-scene-shake. Otherwise the shake keyframe's
  // scale(var(--cam-scale,1.1)) overrides our inline transform:scale(1.2),
  // making the scene visibly snap from 1.2 → 1.1 → 1.2 across the shake
  // duration ("rapid zoom" the user reported).
  if (battleField) {
    battleField.style.setProperty('--cam-scale', '1.2');
    battleField.classList.remove('battle-scene-shake');
    void battleField.offsetWidth;
    battleField.classList.add('battle-scene-shake');
    setTimeout(() => battleField.classList.remove('battle-scene-shake'), 260);
  }

  // Per enemy: 2-hit physics juggle (knockup + crash + lie + recover).
  // Damage segments time-aligned with the in-air hits so floats sync
  // with the impulses. 2 segments = 2 distinct knockup impulses.
  const hitTasks = rowEnemies.map(enemy => (async () => {
    if (!enemy.alive) return { enemy, physTotal: 0, trueTotal: 0 };
    const eElId = getFighterElId(enemy);
    const eNode = document.getElementById(eElId);
    const tBody = eNode ? eNode.querySelector('.st-body') : null;
    // Launch 2-hit juggle on this target's body
    let juggleAnim = null;
    let segTimes = [0, 280];
    let stopKnockupSprite = null;
    if (tBody) {
      const knockX = isMobile ? dir * 28 : dir * 50;
      const ePet = (typeof ALL_PETS !== 'undefined') ? ALL_PETS.find(p => p.id === enemy.id) : null;
      const hasKnockupAnim = !!(ePet && ePet.knockupAnim);
      const built = buildCyberBeamJuggle(knockX, isMobile, { noRotation: hasKnockupAnim, knockupAnim: hasKnockupAnim ? ePet.knockupAnim : null });
      juggleAnim = tBody.animate(built.kf, { duration: built.totalMs, easing: 'linear', fill: 'forwards' });
      segTimes = built.segHits;
      eNode.classList.add('basic-chiwave-launched');  // pause sprite-sheet during airtime
      if (hasKnockupAnim && typeof playKnockupAnimation === 'function') {
        stopKnockupSprite = playKnockupAnimation(enemy);
      }
    }

    let physTotal = 0, trueTotal = 0;
    for (let seg = 0; seg < 2; seg++) {
      // NOTE: don't break on !enemy.alive — boss's cyberDrone passive will
      // revive into mech later, and we want both segments' floats to show
      // visually (the 2nd hit is "wasted" damage on a dying boss but the
      // user explicitly asked for 2 number jumps per enemy).
      const { isCrit, critMult } = calcCrit(attacker);
      const physBase = Math.round(attacker.atk * physScale);
      const eDef = calcEffDef(attacker, enemy);
      const physDmg = Math.max(1, Math.round(physBase * critMult * calcDmgMult(eDef)));
      applyRawDmg(attacker, enemy, physDmg, false, false, 'physical');
      spawnFloatingNum(eElId, `${physDmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, { atkSide: attacker.side, amount: physDmg });
      physTotal += physDmg;
      if (trueDmgPerSeg > 0) {
        applyRawDmg(attacker, enemy, trueDmgPerSeg, false, false, 'true');
        spawnFloatingNum(eElId, `${trueDmgPerSeg}`, 'true-dmg', 0, 24, { atkSide: attacker.side, amount: trueDmgPerSeg });
        trueTotal += trueDmgPerSeg;
      }
      if (eNode) {
        eNode.classList.remove('chi-hit-flash');
        void eNode.offsetWidth;
        eNode.classList.add('chi-hit-flash');
        setTimeout(() => { if (eNode) eNode.classList.remove('chi-hit-flash'); }, 140);
      }
      await triggerOnHitEffects(attacker, enemy, physDmg + trueDmgPerSeg);
      updateHpBar(enemy, eElId);
      if (seg < 1) {
        const gap = (segTimes[1] || 280) - (segTimes[0] || 0);
        await sleep(gap);
      }
    }

    // Fire-and-forget juggle cleanup so caller proceeds immediately
    if (juggleAnim) {
      juggleAnim.finished
        .then(() => {
          if (tBody) tBody.style.transform = '';
          if (eNode) eNode.classList.remove('basic-chiwave-launched');
          if (stopKnockupSprite) stopKnockupSprite();
        })
        .catch(() => {
          if (eNode) eNode.classList.remove('basic-chiwave-launched');
          if (stopKnockupSprite) stopKnockupSprite();
        });
    }
    return { enemy, physTotal, trueTotal };
  })());
  const results = await Promise.all(hitTasks);
  const logBits = results.map(r => `${r.enemy.emoji}${r.enemy.name}(${r.physTotal}物+${r.trueTotal}真)`);
  const rowLabel = tIdx != null
    ? (['上', '中', '下'][parseInt(tIdx)] || '中') + '横排'
    : '目标横排';
  addLog(`${attacker.emoji}${attacker.name} <b>能量大炮</b> → ${rowLabel}（${droneCount}炮台）：${logBits.join('、')}`);

  // Wait for beam visual to fully end before letting caster hop back
  // (we already used: 360 + 220 + ~hit gap; topup so hopback starts at beam-end).
  await sleep(Math.max(0, beamLifeMs - 600));

  // ── 7) Caster hops back to original row + camera zoom out ──
  if (hopAnim) { try { hopAnim.cancel(); } catch (e) {} }
  if (Math.abs(casterYShift) > 4) {
    // Hop back: build the SAME arc but with start-Y = casterYShift, end-Y = 0
    const apexLift = -Math.min(44, 24 + Math.abs(casterYShift) * 0.28);
    const N = 12;
    const kf = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // y(t) = startY + (endY - startY) * t + apex * 4t(1-t)
      // Here startY=casterYShift, endY=0 → delta = -casterYShift
      const y = casterYShift - casterYShift * t + apexLift * 4 * t * (1 - t);
      kf.push({ transform: `translateY(${y}px) scale(${scale})`, offset: t });
    }
    fEl.animate(kf, { duration: 460, easing: 'linear', fill: 'forwards' });
  }
  if (battleField) battleField.style.transform = 'scale(1)';
  await sleep(480);
  fEl.style.transition = '';
  fEl.style.transform = '';
  fEl.style.zIndex = '';
  if (battleField) {
    battleField.style.transition = '';
    battleField.style.transform = '';
    battleField.style.transformOrigin = '';
  }
}

async function doCyberDeploy(caster, skill) {
  if (!caster.passive || caster.passive.type !== 'cyberDrone') { await sleep(500); return; }
  const max = caster.passive.maxDrones;
  if (caster._drones.length >= max) {
    addLog(`${caster.emoji}${caster.name} 浮游炮已满（${max}个）！`);
    await sleep(500);
    return;
  }
  // Spawn deployCount drones, clamped to available slots before cap.
  const wanted = (skill && skill.deployCount) || 1;
  const slots = max - caster._drones.length;
  const actual = Math.min(wanted, slots);
  for (let i = 0; i < actual; i++) caster._drones.push({ age: 0 });
  const elId = getFighterElId(caster);
  spawnFloatingNum(elId, `+${actual}×<img src="assets/passive/cyber-drone-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'passive-num', 0, 0);
  renderStatusIcons(caster);
  addLog(`${caster.emoji}${caster.name} 部署 ${actual} 个浮游炮！（${caster._drones.length}/${max}）${actual < wanted ? ' [上限]' : ''}`);
  await sleep(800);
}

// ── CRYSTAL TURTLE SKILLS ─────────────────────────────────
