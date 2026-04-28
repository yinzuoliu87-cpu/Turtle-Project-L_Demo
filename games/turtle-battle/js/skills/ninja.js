async function doNinjaShuriken(attacker, target, skill) {
  // 1.5×ATK damage, if crits → entire damage becomes pierce (ignores DEF)
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const isCrit = Math.random() < attacker.crit;
  const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
  const tElId = getFighterElId(target);

  // Wait for the default attack-hop to reach its forward apex, then fire
  // the shuriken (sprite spins via its own CSS keyframe loop).
  await sleep(260);
  const { arrival } = fireProjectile({
    attacker, target,
    sprite: 'ninja-shuriken',
    durationMs: 280,
    damageAtMs: 240,
  });
  await arrival;

  if (isCrit) {
    const pierceDmg = Math.round(baseDmg * critMult);
    // 描述: 暴击时全部转真实伤害. dmgType 必须传 'true' (之前误传 'physical'
    // 导致 stats 算到 _physDmgDealt, 与飘字/log 的 "真实" 标识不一致).
    applyRawDmg(attacker, target, pierceDmg, true, false, 'true');
    spawnFloatingNum(tElId, `${pierceDmg}`, 'crit-pierce', 100, 0, {atkSide: attacker.side, amount: pierceDmg});
    addLog(`${attacker.emoji}${attacker.name} <b>飞镖</b> → ${target.emoji}${target.name}：<span class="log-crit">暴击!</span> <span class="log-pierce">${pierceDmg}真实</span>`);
    await triggerOnHitEffects(attacker, target, pierceDmg);
  } else {
    const effectiveDef = calcEffDef(attacker, target);
    const dmg = Math.max(1, Math.round(baseDmg * calcDmgMult(effectiveDef)));
    applyRawDmg(attacker, target, dmg, false, false, 'physical');
    spawnFloatingNum(tElId, `${dmg}`, 'direct-dmg', 100, 0, {atkSide: attacker.side, amount: dmg});
    addLog(`${attacker.emoji}${attacker.name} <b>飞镖</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span>`);
    await triggerOnHitEffects(attacker, target, dmg);
  }

  const tEl = document.getElementById(tElId);
  if (tEl) tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(360);
  if (tEl) tEl.classList.remove('hit-shake');
  await sleep(60);
}

// ─────────────────────────────────────────────────────────
// Single-impulse knockup juggle for ninja's 冲击.
// One strong vertical knockup, ballistic flight, ground slam, brief lie,
// recover. Total ~1100ms. Returns { kf, totalMs } for tBody.animate().
function buildNinjaKnockupJuggle(knockX, isMobile) {
  const totalMs = isMobile ? 1900 : 1800;     // long enough for flight + lie + recover
  const g = isMobile ? 800 : 1300;
  const liftVy = isMobile ? -520 : -640;
  const liftVx = knockX;
  const slamRot = -82;
  const liePoseMs = isMobile ? 320 : 280;
  const recoverMs = isMobile ? 240 : 220;
  const steps = 56;
  const dt = totalMs / steps / 1000;
  const s = { x:0, y:0, rot:0, vx: liftVx, vy: liftVy, vrot: -100 };
  let slamT = null, slamPose = null, recoverT = null;
  const kf = [];
  for (let i = 0; i <= steps; i++) {
    const tMs = (i / steps) * totalMs;
    if (slamT == null) {
      s.vy += g * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vrot * dt;
      if (s.y >= 0 && tMs > 200) {
        s.y = 0; s.rot = slamRot; s.vx = s.vy = s.vrot = 0;
        slamT = tMs; slamPose = { x: s.x, rot: slamRot };
      }
    } else if (recoverT == null) {
      if (tMs >= slamT + liePoseMs) recoverT = tMs;
    } else {
      const p = Math.min(1, (tMs - recoverT) / recoverMs);
      const e = p < .5 ? 2*p*p : 1 - Math.pow(-2*p + 2, 2)/2;
      s.x = slamPose.x * (1 - e);
      s.y = 0;
      s.rot = slamPose.rot * (1 - e);
    }
    kf.push({
      transform: `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) rotate(${s.rot.toFixed(1)}deg)`,
      offset: i / steps
    });
  }
  // Safety: force the absolute LAST keyframe to (0,0,0) so the enemy
  // never holds a residual tilt after the juggle's fill:'forwards'
  // (the physics sim sometimes can't quite recover to 0 in budget).
  if (kf.length > 0) kf[kf.length - 1].transform = 'translate(0px, 0px) rotate(0deg)';
  return { kf, totalMs };
}

// 冲击: ninja hops to target's row → pauses → FAST dash through column,
// flinging enemies high → holds at far end → TURNS AROUND → runs back to
// origin → turns back to original facing.
// 冲击 — Step 3: 18-frame dash sprite drives timing. Phases:
//   F1-3   (0-300ms)     蓄力     caster stays at origin, sprite plays
//   F4-8   (300-800ms)   飞行    body translates to dest, dash trail VFX
//   F9-13  (800-1300ms)  站脚    held at destination
//   F14    (1300-1400ms)          last frame at destination
//   teleport home → F15-18 (1400-1800ms) 落地恢复
async function doNinjaImpact(attacker, target, skill) {
  const fElId = getFighterElId(attacker);
  const fEl = document.getElementById(fElId);
  if (!fEl || !target || !target.alive) { await sleep(200); return; }

  const tElId = getFighterElId(target);
  const tEl = document.getElementById(tElId);
  const battleField = ENV.battleField;
  const isMobile = ENV.isMobile;
  const dir = attacker.side === 'left' ? 1 : -1;
  const baseScale = ENV.baseScale;
  const fBody = fEl.querySelector('.st-body') || fEl;

  // ── Pre-compute damage values ──
  const behind = (typeof fighterBehind === 'function') ? fighterBehind(target) : null;
  const mainScale = skill.atkScale || 1.2;
  const behindScale = skill.behindScale || 0.8;
  const isCrit1 = Math.random() < attacker.crit;
  const critMult1 = isCrit1 ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
  const mainDef = calcEffDef(attacker, target);
  const mainDmg = Math.max(1, Math.round(attacker.atk * mainScale * critMult1 * calcDmgMult(mainDef)));
  let isCrit2 = false, critMult2 = 1, behindDmg = 0;
  if (behind && behind.alive) {
    isCrit2 = Math.random() < attacker.crit;
    critMult2 = isCrit2 ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
    const bDef = calcEffDef(attacker, behind);
    behindDmg = Math.max(1, Math.round(attacker.atk * behindScale * critMult2 * calcDmgMult(bDef)));
  }

  // ── Compute geometry: dash X to past target's column back row + Y row shift ──
  let casterYShift = 0, dashX = 0, mainHitX = 0, behindHitX = 0;
  if (battleField && fEl && tEl) {
    const bRect = battleField.getBoundingClientRect();
    const zoom = battleField.offsetWidth ? bRect.width / battleField.offsetWidth : 1;
    const fBodyEl = fEl.querySelector('.st-body') || fEl;
    const tBodyEl = tEl.querySelector('.st-body') || tEl;
    const fRect = fBodyEl.getBoundingClientRect();
    const tRect = tBodyEl.getBoundingClientRect();
    const fCx = ((fRect.left + fRect.width / 2) - bRect.left) / zoom;
    const fCy = ((fRect.top  + fRect.height / 2) - bRect.top)  / zoom;
    const tCx = ((tRect.left + tRect.width / 2) - bRect.left) / zoom;
    const tCy = ((tRect.top  + tRect.height / 2) - bRect.top)  / zoom;
    casterYShift = tCy - fCy;
    mainHitX = tCx - fCx;
    if (behind) {
      const bEl = document.getElementById(getFighterElId(behind));
      if (bEl) {
        const bb = (bEl.querySelector('.st-body') || bEl).getBoundingClientRect();
        behindHitX = ((bb.left + bb.width/2) - bRect.left) / zoom - fCx;
      }
    }
    let backSlotX = null;
    const targetCol = target._slotKey ? target._slotKey.split('-')[1] : null;
    if (targetCol != null && typeof BATTLE_POSITIONS !== 'undefined' && typeof mapCoverPos === 'function') {
      const posSet = isMobile ? BATTLE_POSITIONS.mobile : BATTLE_POSITIONS.desktop;
      const enemySide = attacker.side === 'left' ? 'right' : 'left';
      const backPos = posSet[`back-${targetCol}`];
      if (backPos) {
        const imgX = enemySide === 'left' ? backPos.x : (100 - backPos.x);
        const mapped = mapCoverPos(imgX, backPos.y, battleField.offsetWidth, battleField.offsetHeight);
        backSlotX = mapped.px - fCx;
      }
    }
    const farX = backSlotX != null ? backSlotX : (behind ? behindHitX : mainHitX);
    dashX = farX + dir * 60;
  } else {
    dashX = dir * 280; mainHitX = dir * 200; behindHitX = dir * 240;
  }

  // .scene-turtle has CSS transform: scale(baseScale). fBody is its child →
  // translate(N) on fBody = N × baseScale screen pixels. Divide for local px.
  const lyShift = casterYShift / baseScale;
  const ldashX  = dashX / baseScale;

  fEl.style.zIndex = '60';

  // ── Phase 0: hop to target's row Y (idle sprite continues, parabolic arc) ──
  // Track animations so we can .cancel() them on teleport (WAAPI fill:forwards
  // locks transform via composite — style.transform='' alone won't release it).
  let rowHopAnim = null, flightAnim = null;
  if (Math.abs(casterYShift) > 4) {
    const apexLift = -Math.min(40, 22 + Math.abs(casterYShift) * 0.25) / baseScale;
    const N = 10; const kfHop = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = lyShift * t + apexLift * 4 * t * (1 - t);
      kfHop.push({ transform: `translate(0, ${y}px)`, offset: t });
    }
    rowHopAnim = fBody.animate(kfHop, { duration: 280, easing: 'linear', fill: 'forwards' });
    await sleep(290);
  }

  // ── Brief planted windup pause at target's row before dash sprite kicks in ──
  // (lets player register "ninja arrived, now charging dash")
  await sleep(120);

  // ── Start the 18-frame dash sprite (1800ms total). Plays continuously
  // through windup → flight → planting → recovery as one unbroken animation. ──
  if (typeof playFighterSpriteOnce === 'function') {
    playFighterSpriteOnce(attacker, 'assets/pets/animations/ninja/dash.png', 18, 64, 64, 1800);
  }

  // ── Phase 1: F1-3 windup at target row (300ms) — stay at row Y, no X move ──
  await sleep(300);

  // ── Phase 2: F4-8 flight (500ms) — body flies to dest + dash trail VFX ──
  let trail = null;
  if (fBody) {
    trail = document.createElement('div');
    trail.className = 'ninja-dash-trail' + (dir === -1 ? ' flip-x' : '');
    trail.style.left = '50%';
    trail.style.top  = '50%';
    fBody.appendChild(trail);
  }
  flightAnim = fBody.animate([
    { transform: `translate(0, ${lyShift}px)` },
    { transform: `translate(${ldashX}px, ${lyShift}px)`, offset: 1 },
  ], { duration: 500, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'forwards' });

  // Mid-flight hits (fire-and-forget — each hit fires when ninja passes its X)
  const hitTask = async (enemy, dmg, isCrit, hitX) => {
    if (!enemy || !enemy.alive) return;
    const passFraction = Math.abs(hitX) / Math.abs(dashX);
    const triggerMs = Math.max(40, Math.round(500 * passFraction));
    await sleep(triggerMs);
    if (!enemy.alive) return;
    const eElId = getFighterElId(enemy);
    const eNode = document.getElementById(eElId);
    applyRawDmg(attacker, enemy, dmg, false, false, 'physical');
    spawnFloatingNum(eElId, `${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, { atkSide: attacker.side, amount: dmg });
    updateHpBar(enemy, eElId);
    await triggerOnHitEffects(attacker, enemy, dmg);
    // Knockup juggle on target (Step 5 will swap to knockup.png 2-frame flow)
    const tBody = eNode ? eNode.querySelector('.st-body') : null;
    if (tBody) {
      const knockX = (isMobile ? 30 : 56) * dir;
      const built = buildNinjaKnockupJuggle(knockX, isMobile);
      const j = tBody.animate(built.kf, { duration: built.totalMs, easing: 'linear', fill: 'forwards' });
      eNode.classList.add('basic-chiwave-launched');
      j.finished
        .then(() => { tBody.style.transform = ''; eNode.classList.remove('basic-chiwave-launched'); })
        .catch(() => { eNode.classList.remove('basic-chiwave-launched'); });
    }
    if (eNode) {
      eNode.classList.remove('chi-hit-flash');
      void eNode.offsetWidth;
      eNode.classList.add('chi-hit-flash');
      setTimeout(() => { if (eNode) eNode.classList.remove('chi-hit-flash'); }, 140);
    }
  };
  hitTask(target, mainDmg, isCrit1, mainHitX);
  if (behind && behind.alive) hitTask(behind, behindDmg, isCrit2, behindHitX);
  await sleep(500);  // wait for flight to complete

  if (trail) { trail.remove(); trail = null; }

  // Camera shake on arrival
  if (battleField) {
    battleField.style.setProperty('--cam-scale', '1');
    battleField.classList.remove('battle-scene-shake');
    void battleField.offsetWidth;
    battleField.classList.add('battle-scene-shake');
    setTimeout(() => battleField.classList.remove('battle-scene-shake'), 240);
  }

  // ── Phase 3: F9-13 planting at destination (500ms) ──
  await sleep(500);

  // ── Phase 4: F14 still at destination (100ms) ──
  await sleep(100);

  // ── Phase 5: TELEPORT back home, F15-18 recovery plays at home (400ms) ──
  // Cancel any active WAAPI anims first — fill:'forwards' locks transform via
  // composite layer, plain style.transform='' won't release it.
  if (rowHopAnim) { try { rowHopAnim.cancel(); } catch(e) {} }
  if (flightAnim) { try { flightAnim.cancel(); } catch(e) {} }
  fBody.style.transition = 'none';
  fBody.style.transform = '';
  void fBody.offsetWidth;
  fBody.style.transition = '';
  await sleep(400);

  fEl.style.zIndex = '';

  const behindNote = behind ? ` + ${behind.emoji}${behind.name} <span class="log-direct">${behindDmg}物理</span>` : '';
  addLog(`${attacker.emoji}${attacker.name} <b>冲击</b> → ${target.emoji}${target.name}：<span class="log-direct">${mainDmg}物理</span>${behindNote}`);
}

async function doNinjaBomb(attacker, skill) {
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);

  for (const e of enemies) {
    const {isCrit, critMult} = calcCrit(attacker);
    const effectiveDef = calcEffDef(attacker, e);
        const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effectiveDef)));
    applyRawDmg(attacker, e, dmg, false, false, 'physical');
    const eId = getFighterElId(e);
    spawnFloatingNum(eId, `${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0);
    updateHpBar(e, eId);
    await triggerOnHitEffects(attacker, e, dmg);

    // Apply armor break (defDown by %)
    if (skill.armorBreak) {
      const ab = skill.armorBreak;
      const existing = e.buffs.find(b => b.type === 'defDown');
      if (existing) { existing.value = Math.max(existing.value, ab.pct); existing.turns = Math.max(existing.turns, ab.turns); }
      else e.buffs.push({ type:'defDown', value:ab.pct, turns:ab.turns });
      spawnFloatingNum(eId, `破甲${ab.pct}%`, 'debuff-label', 200, 0);
      renderStatusIcons(e);
    }
  }
  recalcStats();
  addLog(`${attacker.emoji}${attacker.name} <b>炸弹</b> → 全体敌方：<span class="log-direct">${baseDmg}伤害</span> + <span class="log-debuff">破甲${skill.armorBreak.pct}% ${skill.armorBreak.turns}回合</span>`);
  await sleep(1000);
}

// ── HUNTER SKILLS ─────────────────────────────────────────
