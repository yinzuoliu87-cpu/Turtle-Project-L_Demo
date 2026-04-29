async function doNinjaShuriken(attacker, target, skill) {
  // 1.5×ATK damage. On crit: split into true + physical with truePct based on level.
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
    // Crit: total raw damage = baseDmg × critMult. truePct = 40% + 2% per level
    // (lv1=42%, lv5=50%, lv10=60%). True portion bypasses DEF; physical portion
    // goes through DEF normally.
    const critTotalRaw = Math.round(baseDmg * critMult);
    const lv = attacker._level || 1;
    const truePct = Math.min(100, 40 + 2 * lv);
    const trueRaw = Math.round(critTotalRaw * truePct / 100);
    const physRaw = critTotalRaw - trueRaw;

    // True portion: pierce, dmgType 'true', no DEF.
    if (trueRaw > 0) {
      applyRawDmg(attacker, target, trueRaw, true, false, 'true');
      spawnFloatingNum(tElId, `${trueRaw}`, 'true-dmg', 100, 0, {atkSide: attacker.side, amount: trueRaw});
    }
    // Physical portion: goes through DEF (and crit-flagged for floating color)
    const effectiveDef = calcEffDef(attacker, target);
    const physDmg = physRaw > 0 ? Math.max(1, Math.round(physRaw * calcDmgMult(effectiveDef))) : 0;
    if (physDmg > 0) {
      applyRawDmg(attacker, target, physDmg, false, false, 'physical');
      // Offset Y so true and physical floats don't overlap
      spawnFloatingNum(tElId, `${physDmg}`, 'crit-dmg', 100, 24, {atkSide: attacker.side, amount: physDmg});
    }
    addLog(`${attacker.emoji}${attacker.name} <b>飞镖</b> → ${target.emoji}${target.name}：<span class="log-crit">暴击!</span> <span class="log-pierce">${trueRaw}真实</span> + <span class="log-direct">${physDmg}物理</span>`);
    await triggerOnHitEffects(attacker, target, trueRaw + physDmg);
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
function buildNinjaKnockupJuggle(knockX, isMobile, opts) {
  // opts.noRotation = true: skip body rotation entirely (target has knockupAnim
  // sprite; rotating the body would tilt the sprite). With opts.knockupAnim
  // provided, also skip the lie/recover physics and produce simple ascent →
  // descent → run-back keyframes that sync with knockup F1/F2 + runAnim.
  const noRot = opts && opts.noRotation;
  if (noRot && opts && opts.knockupAnim) {
    const k = opts.knockupAnim;
    const airMs    = (k.airborneMs || 300) + (k.descentMs || 300);
    const lyingMs  = k.lyingMs   || 0;
    const runBackMs = k.runBackMs || 400;
    const totalMs  = airMs + lyingMs + runBackMs;
    const peakY    = isMobile ? -54 : -82;
    const slamX    = knockX * 1.4;
    // Bake parabolic arc into 8 sample points across airMs (relying on cubic-
    // bezier easing alone gave inconsistent feel — easing interpretation per
    // browser is finicky and lying phase shifted the proportions). Linear
    // interpolation between many samples = guaranteed visible parabolic gravity.
    // y(t) = peakY * (1 - (2t-1)^2)  parabola: y=0 at t=0/1, y=peakY at t=0.5
    // x(t) = slamX * t                linear horizontal during airtime
    const kf = [];
    const airSteps = 8;
    for (let i = 0; i <= airSteps; i++) {
      const t = i / airSteps;
      const x = slamX * t;
      const y = peakY * (1 - Math.pow(2*t - 1, 2));
      const off = (t * airMs) / totalMs;
      kf.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`, offset: +off.toFixed(4) });
    }
    // Lying phase: hold at slam X with y=0
    if (lyingMs > 0) {
      kf.push({ transform: `translate(${slamX.toFixed(1)}px, 0px)`, offset: +((airMs + lyingMs)/totalMs).toFixed(4) });
    }
    // Run back to home
    kf.push({ transform: 'translate(0px, 0px)', offset: 1 });
    return { kf, totalMs };
  }
  const totalMs = isMobile ? 1900 : 1800;     // long enough for flight + lie + recover
  const g = isMobile ? 800 : 1300;
  const liftVy = isMobile ? -520 : -640;
  const liftVx = knockX;
  const slamRot = noRot ? 0 : -82;
  const liePoseMs = isMobile ? 320 : 280;
  const recoverMs = isMobile ? 240 : 220;
  const steps = 56;
  const dt = totalMs / steps / 1000;
  const s = { x:0, y:0, rot:0, vx: liftVx, vy: liftVy, vrot: noRot ? 0 : -100 };
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

  // ── Phase 0: RUN to target's row Y (run.png 4 frames looping while body
  // translates linearly, so it reads as actually running not teleporting) ──
  let rowHopAnim = null;
  const RUN_MS = 400;
  if (Math.abs(casterYShift) > 4) {
    if (typeof playFighterSpriteOnce === 'function') {
      playFighterSpriteOnce(attacker, 'assets/pets/animations/ninja/run.png', 4, 64, 64, RUN_MS, true);
    }
    rowHopAnim = fBody.animate([
      { transform: `translate(0, 0)` },
      { transform: `translate(0, ${lyShift}px)`, offset: 1 },
    ], { duration: RUN_MS, easing: 'linear', fill: 'forwards' });
    await sleep(RUN_MS);
  }

  // ── Start the 18-frame dash sprite (1800ms total). Plays continuously
  // through windup → flight → planting → recovery. ──
  let stopDash = null;
  if (typeof playFighterSpriteOnce === 'function') {
    stopDash = playFighterSpriteOnce(attacker, 'assets/pets/animations/ninja/dash.png', 18, 64, 64, 1800);
  }

  // ── Body movement: ONE WAAPI animation drives the entire dash (1800ms).
  // Previously we used a separate flightAnim + JS-sleep teleport, which drifts
  // a few ms relative to the CSS sprite frame timing → visible flash at the
  // F14→F15 boundary (sprite snaps to recovery while body is still at dest, or
  // body teleports while sprite is still F14). One WAAPI on the same browser
  // clock keeps body and sprite frames frame-synced. ──
  // Keyframes (offsets relative to 1800ms total):
  //   0           F1   start at row (0, lyShift)            windup
  //   300/1800    F4   stay at row (0, lyShift)             windup end → flight start
  //   800/1800    F8   reach dest (dashX, lyShift)          flight (eased segment)
  //   1400/1800   F14  stay at dest (dashX, lyShift)        planting
  //   +0.001      F15  snap to home (0, 0)                  teleport
  //   1           F18  stay at home (0, 0)                  recovery
  const DASH_MS = 1800;
  const dashAnim = fBody.animate([
    { transform: `translate(0px, ${lyShift}px)`,         offset: 0 },
    { transform: `translate(0px, ${lyShift}px)`,         offset: 300/DASH_MS,  easing: 'cubic-bezier(.2,.8,.4,1)' },
    { transform: `translate(${ldashX}px, ${lyShift}px)`, offset: 800/DASH_MS },
    { transform: `translate(${ldashX}px, ${lyShift}px)`, offset: 1400/DASH_MS },
    { transform: 'translate(0px, 0px)',                  offset: 1400/DASH_MS + 0.001 },
    { transform: 'translate(0px, 0px)',                  offset: 1 }
  ], { duration: DASH_MS, easing: 'linear', fill: 'forwards' });

  // ── Phase 1: F1-3 windup at target row (300ms) ──
  await sleep(300);

  // ── Phase 2: F4-8 flight (500ms) — dash trail VFX, hits land mid-flight ──
  let trail = null;
  if (fBody) {
    trail = document.createElement('div');
    trail.className = 'ninja-dash-trail' + (dir === -1 ? ' flip-x' : '');
    trail.style.left = '50%';
    trail.style.top  = '50%';
    fBody.appendChild(trail);
  }

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
    // Knockup juggle on target. If target has a knockupAnim sprite, suppress
    // body rotation (sprite F2 already draws the lying pose) and play the
    // sprite overlay alongside the body translate.
    const tBody = eNode ? eNode.querySelector('.st-body') : null;
    if (tBody) {
      const ePet = (typeof ALL_PETS !== 'undefined') ? ALL_PETS.find(p => p.id === enemy.id) : null;
      const hasKnockupAnim = !!(ePet && ePet.knockupAnim);
      const knockX = (isMobile ? 30 : 56) * dir;
      const built = buildNinjaKnockupJuggle(knockX, isMobile, { noRotation: hasKnockupAnim, knockupAnim: hasKnockupAnim ? ePet.knockupAnim : null });
      const j = tBody.animate(built.kf, { duration: built.totalMs, easing: 'linear', fill: 'forwards' });
      eNode.classList.add('basic-chiwave-launched');
      let stopKnockupSprite = null;
      if (hasKnockupAnim && typeof playKnockupAnimation === 'function') {
        stopKnockupSprite = playKnockupAnimation(enemy);
      }
      j.finished
        .then(() => { tBody.style.transform = ''; eNode.classList.remove('basic-chiwave-launched'); if (stopKnockupSprite) stopKnockupSprite(); })
        .catch(() => { eNode.classList.remove('basic-chiwave-launched'); if (stopKnockupSprite) stopKnockupSprite(); });
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

  // ── Phase 3-5: planting (500ms) + still (100ms) + teleport-home + recovery
  // (400ms) — body teleport at 1400ms is already encoded in dashAnim keyframes,
  // so we just wait out the remaining time. ──
  await sleep(1000);

  // Cancel WAAPI fills so subsequent skills can set transform freely.
  if (rowHopAnim) { try { rowHopAnim.cancel(); } catch(e) {} }
  try { dashAnim.cancel(); } catch(e) {}
  fBody.style.transform = '';

  // Explicitly stop the dash overlay — collapses the 30ms cleanup grace
  // window so F18 doesn't linger after duration ends.
  if (stopDash) stopDash();
  fEl.style.zIndex = '';

  const behindNote = behind ? ` + ${behind.emoji}${behind.name} <span class="log-direct">${behindDmg}物理</span>` : '';
  addLog(`${attacker.emoji}${attacker.name} <b>冲击</b> → ${target.emoji}${target.name}：<span class="log-direct">${mainDmg}物理</span>${behindNote}`);
}

// 背刺 — 18-frame backstab.png drives timing. Phases (1-indexed, 100ms/frame):
//   F1-3   (0-300ms)     蓄力     caster stays at home, sprite plays
//   F4     (300-400ms)   闪现至背后    body teleports to behind target
//   F5-14  (400-1400ms)  3 段背刺   3 hits land at F6/F9/F12 (500/800/1100ms)
//   F15    (1400-1500ms) 闪现回家    body teleports back home
//   F16-18 (1500-1800ms) 收招      recovery at home
async function doNinjaBackstab(attacker, target, skill) {
  const fElId = getFighterElId(attacker);
  const fEl = document.getElementById(fElId);
  if (!fEl || !target || !target.alive) { await sleep(200); return; }

  const tElId = getFighterElId(target);
  const tEl = document.getElementById(tElId);
  const battleField = ENV.battleField;
  const dir = attacker.side === 'left' ? 1 : -1;
  const baseScale = ENV.baseScale;
  const fBody = fEl.querySelector('.st-body') || fEl;

  // ── Compute teleport offset to "behind" target (further along attack dir) ──
  let casterYShift = 0, behindXShift = 0;
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
    behindXShift = (tCx - fCx) + dir * 50;  // 50px past target along dir
  } else {
    behindXShift = dir * 260;
  }
  const lyShift = casterYShift / baseScale;
  const lxShift = behindXShift / baseScale;

  fEl.style.zIndex = '60';

  // ── Start the 18-frame backstab sprite (1800ms). Single overlay covers
  // windup → teleport → 3 stabs → teleport-home → recovery. ──
  let stopBackstab = null;
  if (typeof playFighterSpriteOnce === 'function') {
    stopBackstab = playFighterSpriteOnce(attacker, 'assets/pets/animations/ninja/backstab.png', 18, 64, 64, 1800);
  }

  // ── Body teleport: ONE WAAPI animation drives all body movement.
  // Inline `style.transform = translate(...)` doesn't work here because
  // any prior fill:'forwards' WAAPI animation on this .st-body (e.g. from
  // a previous knockup juggle or attack hop) leaves a composite layer
  // effect that overrides inline styles. WAAPI .animate() with fill:
  // 'forwards' overrides the prior fill via composition. We .cancel() at
  // the end to release the layer. ──
  // Keyframe stops (1800ms total):
  //   0%        F1   home (0,0)
  //   16.6%     F4   home → snap to behind (next stop is +0.001 later)
  //   77.7%     F14  still at behind
  //   77.8%     F15  snap back home
  //   100%      F18  home
  const TOTAL_MS = 1800;
  const teleportAnim = fBody.animate([
    { transform: 'translate(0px, 0px)',                                     offset: 0 },
    { transform: 'translate(0px, 0px)',                                     offset: 300 / TOTAL_MS },
    { transform: `translate(${lxShift}px, ${lyShift}px)`,                   offset: 300 / TOTAL_MS + 0.001 },
    { transform: `translate(${lxShift}px, ${lyShift}px)`,                   offset: 1400 / TOTAL_MS },
    { transform: 'translate(0px, 0px)',                                     offset: 1400 / TOTAL_MS + 0.001 },
    { transform: 'translate(0px, 0px)',                                     offset: 1 },
  ], { duration: TOTAL_MS, easing: 'linear', fill: 'forwards' });

  // ── Phase 1: F1-3 windup at home (300ms) ──
  await sleep(300);

  // ── Phase 2: F4 teleport snap (handled by keyframe; nothing to do here) ──

  // ── Phase 3: F5-14, stab hits land at 500/800/1100ms (relative to start)
  // From here we are at +300ms; schedule 3 hits at +200/+500/+800ms locally. ──
  const hitOffsets = [200, 500, 800];  // 500ms, 800ms, 1100ms global
  const hits = [];
  for (let i = 0; i < (skill.hits || 3); i++) {
    const { isCrit, critMult } = calcCrit(attacker);
    const eff = calcEffDef(attacker, target);
    const dmg = Math.max(1, Math.round(attacker.atk * (skill.atkScale || 0.5) * critMult * calcDmgMult(eff)));
    hits.push({ isCrit, dmg });
  }
  let totalDmg = 0;
  const hitTask = async (i) => {
    await sleep(hitOffsets[i]);
    if (!target.alive) return;
    const h = hits[i];
    applyRawDmg(attacker, target, h.dmg, false, false, 'physical');
    spawnFloatingNum(tElId, `${h.dmg}`, h.isCrit ? 'crit-dmg' : 'direct-dmg', (i - 1) * 18, 0, { atkSide: attacker.side, amount: h.dmg });
    updateHpBar(target, tElId);
    totalDmg += h.dmg;
    await triggerOnHitEffects(attacker, target, h.dmg);
    if (tEl) {
      tEl.classList.remove('chi-hit-flash');
      void tEl.offsetWidth;
      tEl.classList.add('chi-hit-flash');
      setTimeout(() => { if (tEl) tEl.classList.remove('chi-hit-flash'); }, 140);
    }
  };
  for (let i = 0; i < hits.length; i++) hitTask(i);

  // Wait Phase 3 + Phase 4 (snap home at 1400ms) + Phase 5 recovery (300ms) ──
  await sleep(1500);  // 300ms windup already passed; total 1800ms = 300+1500

  // Cancel the WAAPI fill so subsequent skills can set transform freely
  try { teleportAnim.cancel(); } catch(e) {}
  fBody.style.transform = '';

  if (stopBackstab) stopBackstab();
  fEl.style.zIndex = '';

  addLog(`${attacker.emoji}${attacker.name} <b>背刺</b> → ${target.emoji}${target.name}：<span class="log-direct">3段共${totalDmg}物理</span>`);
}

// 炸弹 — 12-frame bomb.png (64×64 each, 100ms/frame, 1200ms total)
//   F1-4   (0-400ms)     bomb flies from attacker → enemy team center
//   F5-8   (400-800ms)   bomb landed, fuse — held at center, no damage yet
//   F9-12  (800-1200ms)  explosion + mushroom cloud, damage fires at F9 start
// Per user spec: damage + armor break + camera shake fire on F9 (800ms).
const _ninjaBombKF = {};
async function doNinjaBomb(attacker, skill) {
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const battleField = ENV.battleField;

  // ── Geometry: attacker center + enemy team center ──
  const fEl = document.getElementById(getFighterElId(attacker));
  let aCx = 0, aCy = 0, cCx = 0, cCy = 0;
  if (battleField && fEl) {
    const bRect = battleField.getBoundingClientRect();
    const zoom = battleField.offsetWidth ? bRect.width / battleField.offsetWidth : 1;
    const aR = (fEl.querySelector('.st-body') || fEl).getBoundingClientRect();
    aCx = ((aR.left + aR.width/2) - bRect.left) / zoom;
    aCy = ((aR.top  + aR.height/2) - bRect.top)  / zoom;
    let n = 0;
    for (const e of enemies) {
      const eEl = document.getElementById(getFighterElId(e));
      if (!eEl) continue;
      const eR = (eEl.querySelector('.st-body') || eEl).getBoundingClientRect();
      cCx += ((eR.left + eR.width/2) - bRect.left) / zoom;
      cCy += ((eR.top  + eR.height/2) - bRect.top)  / zoom;
      n++;
    }
    if (n > 0) { cCx /= n; cCy /= n; }
  }

  // ── Bomb sprite: 12 frames, scaled up to 160×160 so the mushroom cloud is visible. ──
  const FRAMES = 12;
  const FRAME_W = 64, FRAME_H = 64;
  const BOMB_SIZE = 160;            // displayed size — F9-12 explosion looks big
  const TOTAL_MS = 1200;
  const FLY_MS    = 400;            // F1-4: bomb travel
  const DETONATE_MS = 800;          // F9 starts at 800ms — damage triggers here
  const sc = BOMB_SIZE / FRAME_H;
  const fw = Math.round(FRAME_W * sc);
  const tw = Math.round(FRAME_W * FRAMES * sc);
  const lastFw = (FRAMES - 1) * fw;
  const kfName = '_ninjaBombKF_v' + lastFw;
  if (!_ninjaBombKF[kfName]) {
    const st = document.createElement('style');
    st.textContent = `@keyframes ${kfName}{from{background-position:0 0}to{background-position:-${lastFw}px 0}}`;
    document.head.appendChild(st);
    _ninjaBombKF[kfName] = true;
  }

  let wrap = null;
  if (battleField) {
    wrap = document.createElement('div');
    wrap.style.cssText = `position:absolute;left:${aCx}px;top:${aCy}px;width:0;height:0;pointer-events:none;z-index:50`;
    const sprite = document.createElement('div');
    sprite.style.cssText = `position:absolute;left:50%;top:50%;width:${BOMB_SIZE}px;height:${BOMB_SIZE}px;transform:translate(-50%,-50%);background-image:url('assets/pets/animations/ninja/bomb.png');background-size:${tw}px ${BOMB_SIZE}px;background-repeat:no-repeat;animation:${kfName} ${TOTAL_MS/1000}s steps(${FRAMES}, jump-none) 1 forwards;image-rendering:pixelated`;
    wrap.appendChild(sprite);
    battleField.appendChild(wrap);
    // Trajectory: parabolic throw + 2 bounces, all within FLY_MS=400ms.
    // Phase A throw arc (50% of FLY): attacker → center, peak in middle.
    // Phase B bounce 1 (25% of FLY): smaller arc at center, peakY ~30%.
    // Phase C bounce 2 (20% of FLY): tinier arc, peakY ~12%.
    // Phase D settle (5% of FLY): hold at center.
    // After FLY: bomb stays at center for fuse F5-8 + explosion F9-12.
    // Within each arc we use y(t) = peak * (1 - (2t-1)²) sampled at 4 sub-
    // points so linear interpolation between keyframes traces a smooth parabola.
    const dx = cCx - aCx, dy = cCy - aCy;
    const ARC_PEAK_Y  = -160;   // throw apex (negative = up)
    const BOUNCE1_Y   =  -55;
    const BOUNCE2_Y   =  -22;
    const flyFrac = FLY_MS / TOTAL_MS;
    const kf = [];
    const parabola = (peak, t) => peak * (1 - Math.pow(2 * t - 1, 2));
    // Phase A: throw 0 → 0.5 of FLY (5 samples, 4 segments)
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const x = dx * t;
      const y = parabola(ARC_PEAK_Y, t);
      kf.push({ transform: `translate(${x.toFixed(1)}px, ${(dy + y).toFixed(1)}px)`, offset: +(t * 0.5 * flyFrac).toFixed(4) });
    }
    // Phase B: bounce 1 from 0.5 → 0.75 of FLY (3 samples, 2 segments)
    // Skip i=0 (matches phase A end at offset 0.5 * flyFrac)
    for (let i = 1; i <= 2; i++) {
      const t = i / 2;
      const y = parabola(BOUNCE1_Y, t);
      kf.push({ transform: `translate(${dx.toFixed(1)}px, ${(dy + y).toFixed(1)}px)`, offset: +((0.5 + t * 0.25) * flyFrac).toFixed(4) });
    }
    // Phase C: bounce 2 from 0.75 → 0.95 of FLY
    for (let i = 1; i <= 2; i++) {
      const t = i / 2;
      const y = parabola(BOUNCE2_Y, t);
      kf.push({ transform: `translate(${dx.toFixed(1)}px, ${(dy + y).toFixed(1)}px)`, offset: +((0.75 + t * 0.20) * flyFrac).toFixed(4) });
    }
    // Phase D + hold for fuse + explosion
    kf.push({ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`, offset: +flyFrac.toFixed(4) });
    kf.push({ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`, offset: 1 });
    wrap.animate(kf, { duration: TOTAL_MS, easing: 'linear', fill: 'forwards' });
  }

  // ── Wait until F9 (800ms) — bomb travels F1-4 then sits on ground F5-8 ──
  await sleep(DETONATE_MS);

  // Camera shake on detonation (F9)
  if (battleField) {
    battleField.classList.remove('battle-scene-shake');
    void battleField.offsetWidth;
    battleField.classList.add('battle-scene-shake');
    setTimeout(() => battleField.classList.remove('battle-scene-shake'), 300);
  }

  // Apply damage + armor break to all enemies in parallel (visually simultaneous)
  for (const e of enemies) {
    const {isCrit, critMult} = calcCrit(attacker);
    const effectiveDef = calcEffDef(attacker, e);
    const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effectiveDef)));
    applyRawDmg(attacker, e, dmg, false, false, 'physical');
    const eId = getFighterElId(e);
    spawnFloatingNum(eId, `${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0);
    updateHpBar(e, eId);
    triggerOnHitEffects(attacker, e, dmg);

    // Armor break (defDown by %)
    if (skill.armorBreak) {
      const ab = skill.armorBreak;
      const existing = e.buffs.find(b => b.type === 'defDown');
      if (existing) { existing.value = Math.max(existing.value, ab.pct); existing.turns = Math.max(existing.turns, ab.turns); }
      else e.buffs.push({ type:'defDown', value:ab.pct, turns:ab.turns });
      spawnFloatingNum(eId, `破甲${ab.pct}%`, 'debuff-label', 200, 0);
      renderStatusIcons(e);
    }

    // Hit flash
    const eNode = document.getElementById(eId);
    if (eNode) {
      eNode.classList.remove('chi-hit-flash');
      void eNode.offsetWidth;
      eNode.classList.add('chi-hit-flash');
      setTimeout(() => { if (eNode) eNode.classList.remove('chi-hit-flash'); }, 140);
    }
  }
  recalcStats();
  addLog(`${attacker.emoji}${attacker.name} <b>炸弹</b> → 全体敌方：<span class="log-direct">${baseDmg}伤害</span> + <span class="log-debuff">破甲${skill.armorBreak.pct}% ${skill.armorBreak.turns}回合</span>`);

  // Wait for mushroom cloud to finish (F9-12 = 400ms after detonation)
  await sleep(TOTAL_MS - DETONATE_MS);
  if (wrap && wrap.parentNode) wrap.remove();
}

// ── HUNTER SKILLS ─────────────────────────────────────────
