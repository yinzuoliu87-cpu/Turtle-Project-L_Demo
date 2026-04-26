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

  const isMobile = window.innerWidth <= 768;
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

  const battleField = document.getElementById('battleScene');
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

  // ── 3) Caster slides Y to target's row (use .st-body geometry, not outer) ──
  let casterYShift = 0;
  if (fEl && tEl) {
    const fBody = fEl.querySelector('.st-body') || fEl;
    const tBody = tEl.querySelector('.st-body') || tEl;
    const fRect0 = fBody.getBoundingClientRect();
    const tRect0 = tBody.getBoundingClientRect();
    casterYShift = (tRect0.top + tRect0.height / 2) - (fRect0.top + fRect0.height / 2);
  }
  fEl.style.transition = 'transform 280ms cubic-bezier(.4,.9,.4,1)';
  fEl.style.transform = `translateY(${casterYShift}px) scale(${scale})`;
  fEl.style.zIndex = '50';
  await sleep(300);

  // ── 4) Windup beat (reuse chi-wave's charging pose — blue glow fits cyber) ──
  fEl.classList.add('basic-chiwave-charging');
  await sleep(550);
  fEl.classList.remove('basic-chiwave-charging');

  // ── 5) Fire beam: stretch sprite from caster center to scene edge ──
  let beamLifeMs = 420;
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
    beam.style.top = (fCy - (isMobile ? 28 : 40)) + 'px';
    if (dir === 1) {
      beam.style.left = fCx + 'px';
    } else {
      beam.style.left = (fCx - beamLen) + 'px';
      beam.classList.add('flip-x');
    }
    battleField.appendChild(beam);
    setTimeout(() => beam.remove(), beamLifeMs + 40);
  }

  // ── 6) Per-target hit schedule based on distance from caster ──
  const fRectStart = fEl ? fEl.getBoundingClientRect() : null;
  const sortedEnemies = rowEnemies.slice().sort((a, b) => {
    const ea = document.getElementById(getFighterElId(a));
    const eb = document.getElementById(getFighterElId(b));
    if (!ea || !eb || !fRectStart) return 0;
    return Math.abs(ea.getBoundingClientRect().left - fRectStart.left)
         - Math.abs(eb.getBoundingClientRect().left - fRectStart.left);
  });

  // Beam visual takes ~beamLifeMs to reach far edge. Each enemy lights up as
  // beam passes. Spread hits across 60% of beam life for a "sweep" feel.
  const totalSweep = Math.round(beamLifeMs * 0.65);
  const baseDelay = 80;
  const perEnemyOffset = sortedEnemies.length > 1
    ? Math.round((totalSweep - baseDelay) / Math.max(1, sortedEnemies.length - 1))
    : 0;

  const hitTasks = sortedEnemies.map((enemy, idx) => (async () => {
    const startDelay = baseDelay + idx * perEnemyOffset;
    await sleep(startDelay);
    if (!enemy.alive) return { enemy, physTotal: 0, trueTotal: 0 };
    const eElId = getFighterElId(enemy);
    const eNode = document.getElementById(eElId);

    // Camera shake on first hit only
    if (idx === 0 && battleField) {
      battleField.classList.remove('battle-scene-shake');
      void battleField.offsetWidth;
      battleField.classList.add('battle-scene-shake');
      setTimeout(() => battleField.classList.remove('battle-scene-shake'), 240);
    }

    // Juggle animation on target — reuse chi-wave's physics keyframes
    const tBody = eNode ? eNode.querySelector('.st-body') : null;
    let juggleAnim = null;
    if (tBody && typeof buildJuggleKeyframes === 'function') {
      const knockX = isMobile ? dir * 24 : dir * 44;
      const { kf, totalMs } = buildJuggleKeyframes(knockX, isMobile);
      juggleAnim = tBody.animate(kf, { duration: totalMs, easing: 'linear', fill: 'forwards' });
      eNode.classList.add('basic-chiwave-launched');
    }

    let physTotal = 0, trueTotal = 0;
    // 2 physical
    for (let h = 0; h < physHits; h++) {
      if (!enemy.alive) break;
      const { isCrit, critMult } = calcCrit(attacker);
      const eDef = calcEffDef(attacker, enemy);
      const physBase = Math.round(attacker.atk * physScale);
      const physDmg = Math.max(1, Math.round(physBase * critMult * calcDmgMult(eDef)));
      applyRawDmg(attacker, enemy, physDmg, false, false, 'physical');
      if (eNode) {
        eNode.classList.remove('chi-hit-flash');
        void eNode.offsetWidth;
        eNode.classList.add('chi-hit-flash');
        setTimeout(() => eNode.classList.remove('chi-hit-flash'), 140);
      }
      spawnFloatingNum(eElId, `-${physDmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', h * 60, 0, { atkSide: attacker.side, amount: physDmg });
      physTotal += physDmg;
      await triggerOnHitEffects(attacker, enemy, physDmg);
      if (h < physHits - 1) await sleep(140);
    }
    // 2 true (only if drones)
    if (trueDmgPerSeg > 0) {
      for (let h = 0; h < trueHits; h++) {
        if (!enemy.alive) break;
        applyRawDmg(attacker, enemy, trueDmgPerSeg, false, false, 'true');
        spawnFloatingNum(eElId, `-${trueDmgPerSeg}`, 'true-dmg', 160 + h * 60, 22, { atkSide: attacker.side, amount: trueDmgPerSeg });
        trueTotal += trueDmgPerSeg;
        if (h < trueHits - 1) await sleep(110);
      }
    }
    updateHpBar(enemy, eElId);

    // Fire-and-forget juggle cleanup
    if (juggleAnim) {
      juggleAnim.finished
        .then(() => {
          if (tBody) tBody.style.transform = '';
          if (eNode) eNode.classList.remove('basic-chiwave-launched');
        })
        .catch(() => { if (eNode) eNode.classList.remove('basic-chiwave-launched'); });
    }
    return { enemy, physTotal, trueTotal };
  })());

  const results = await Promise.all(hitTasks);
  const logBits = results.map(r => `${r.enemy.emoji}${r.enemy.name}(${r.physTotal}物+${r.trueTotal}真)`);
  const rowLabel = tIdx != null
    ? (['上', '中', '下'][parseInt(tIdx)] || '中') + '横排'
    : '目标横排';
  addLog(`${attacker.emoji}${attacker.name} <b>能量大炮</b> → ${rowLabel}（${droneCount}炮台）：${logBits.join('、')}`);

  // ── 7) Restore caster Y + camera zoom ──
  fEl.style.transition = 'transform 320ms cubic-bezier(.35,.9,.4,1)';
  fEl.style.transform = `translateY(0) scale(${scale})`;
  if (battleField) battleField.style.transform = 'scale(1)';
  await sleep(340);
  fEl.style.transition = '';
  fEl.style.transform = '';
  fEl.style.zIndex = '';
  if (battleField) {
    battleField.style.transition = '';
    battleField.style.transform = '';
    battleField.style.transformOrigin = '';
  }
}

async function doCyberDeploy(caster, _skill) {
  if (!caster.passive || caster.passive.type !== 'cyberDrone') { await sleep(500); return; }
  if (caster._drones.length >= caster.passive.maxDrones) {
    addLog(`${caster.emoji}${caster.name} 浮游炮已满（${caster.passive.maxDrones}个）！`);
    await sleep(500);
    return;
  }
  caster._drones.push({ age: 0 });
  const elId = getFighterElId(caster);
  spawnFloatingNum(elId, `+<img src="assets/passive/cyber-drone-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'passive-num', 0, 0);
  renderStatusIcons(caster);
  addLog(`${caster.emoji}${caster.name} 部署浮游炮！（${caster._drones.length}/${caster.passive.maxDrones}）`);
  await sleep(800);
}

// ── CRYSTAL TURTLE SKILLS ─────────────────────────────────
