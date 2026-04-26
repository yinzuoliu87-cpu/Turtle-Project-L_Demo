async function doNinjaShuriken(attacker, target, skill) {
  // 1.5×ATK damage, if crits → entire damage becomes pierce (ignores DEF)
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const isCrit = Math.random() < attacker.crit;
  const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
  const tElId = getFighterElId(target);

  if (isCrit) {
    const pierceDmg = Math.round(baseDmg * critMult);
    applyRawDmg(attacker, target, pierceDmg, false, false, 'physical');
    spawnFloatingNum(tElId, `-${pierceDmg}`, 'crit-pierce', 100, 0);
    addLog(`${attacker.emoji}${attacker.name} <b>飞镖</b> → ${target.emoji}${target.name}：<span class="log-crit">暴击!</span> <span class="log-pierce">${pierceDmg}真实</span>`);
    await triggerOnHitEffects(attacker, target, pierceDmg);
  } else {
    const effectiveDef = calcEffDef(attacker, target);
        const dmg = Math.max(1, Math.round(baseDmg * calcDmgMult(effectiveDef)));
    applyRawDmg(attacker, target, dmg, false, false, 'physical');
    spawnFloatingNum(tElId, `-${dmg}`, 'direct-dmg', 100, 0);
    addLog(`${attacker.emoji}${attacker.name} <b>飞镖</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span>`);
    await triggerOnHitEffects(attacker, target, dmg);
  }

  const tEl = document.getElementById(tElId);
  tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(450);
  tEl.classList.remove('hit-shake');
  // Trap triggers when the buffed ally is attacked, not here
  await sleep(80);
}

// ─────────────────────────────────────────────────────────
// Single-impulse knockup juggle for ninja's 冲击.
// One strong vertical knockup, ballistic flight, ground slam, brief lie,
// recover. Total ~1100ms. Returns { kf, totalMs } for tBody.animate().
function buildNinjaKnockupJuggle(knockX, isMobile) {
  const totalMs = isMobile ? 1500 : 1400;     // longer flight time
  const g = isMobile ? 800 : 1300;            // lighter gravity → hangs higher/longer
  const liftVy = isMobile ? -520 : -640;     // ~40% taller knockup
  const liftVx = knockX;
  const slamRot = -82;
  const liePoseMs = isMobile ? 320 : 280;
  const recoverMs = isMobile ? 240 : 220;
  const steps = 48;
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
  return { kf, totalMs };
}

// 冲击: ninja hops to target's row → pauses → FAST dash through column,
// flinging enemies high → holds at far end → TURNS AROUND → runs back to
// origin → turns back to original facing.
async function doNinjaImpact(attacker, target, skill) {
  const fElId = getFighterElId(attacker);
  const fEl = document.getElementById(fElId);
  if (!fEl || !target || !target.alive) { await sleep(200); return; }

  const tElId = getFighterElId(target);
  const tEl = document.getElementById(tElId);
  const battleField = document.getElementById('battleScene');
  const isMobile = window.innerWidth <= 768;
  const dir = attacker.side === 'left' ? 1 : -1;
  const sprite = fEl.querySelector('.st-sprite');
  const baseScale = parseFloat(getComputedStyle(fEl).getPropertyValue('--base-scale')) || 1;
  // The default sprite transform that .pos-left/.pos-right give .st-sprite.
  // We need to override + restore this for the "turn around" effect.
  const defaultSpriteTransform = (attacker.side === 'left')
    ? `scaleX(-1) scale(${baseScale})`   // pos-left: flipped to face right
    : `scale(${baseScale})`;             // pos-right: natural (faces left)
  const flippedSpriteTransform = (attacker.side === 'left')
    ? `scale(${baseScale})`              // facing left (back toward origin)
    : `scaleX(-1) scale(${baseScale})`;  // facing right

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

  // ── Geometry: row Y diff + dash X to past back-row ──
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
    const farX = behind ? behindHitX : mainHitX;
    dashX = farX + dir * 60;
  } else {
    dashX = dir * 280; mainHitX = dir * 200; behindHitX = dir * 240;
  }

  const fBody = fEl.querySelector('.st-body') || fEl;
  fEl.style.zIndex = '60';

  // .scene-turtle has CSS transform: scale(var(--base-scale)). fBody is its
  // child, so any translate(N) applied to fBody is in PRE-parent-scale local
  // units → the visual movement is N × baseScale screen pixels. Divide our
  // screen-pixel deltas by baseScale to get the local-pixel value to use.
  const lyShift = casterYShift / baseScale;
  const ldashX  = dashX / baseScale;

  // ── Phase 1: hop to target row Y (~280ms) ──
  if (Math.abs(casterYShift) > 4) {
    const apexLift = -Math.min(40, 22 + Math.abs(casterYShift) * 0.25) / baseScale;
    const N = 10; const kfHop = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = lyShift * t + apexLift * 4 * t * (1 - t);
      kfHop.push({ transform: `translate(0, ${y}px)`, offset: t });
    }
    fBody.animate(kfHop, { duration: 280, easing: 'linear', fill: 'forwards' });
    await sleep(290);
  }

  // ── Phase 2: pause / windup (200ms) ──
  fBody.animate([
    { transform: `translate(0, ${lyShift}px) scaleY(1)` },
    { transform: `translate(0, ${lyShift + 4 / baseScale}px) scaleY(.9)`, offset: 0.5 },
    { transform: `translate(0, ${lyShift}px) scaleY(1)`, offset: 1 },
  ], { duration: 200, easing: 'ease-out', fill: 'forwards' });
  await sleep(220);

  // ── Phase 3: FAST dash forward (180ms) — spawn dash trail ──
  const dashMs = 180;
  let trail = null;
  if (fBody) {
    trail = document.createElement('div');
    trail.className = 'ninja-dash-trail' + (dir === -1 ? ' flip-x' : '');
    trail.style.left = '50%';
    trail.style.top  = '50%';
    fBody.appendChild(trail);
  }
  fBody.animate([
    { transform: `translate(0, ${lyShift}px)` },
    { transform: `translate(${ldashX}px, ${lyShift}px)`, offset: 1 },
  ], { duration: dashMs, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'forwards' });

  // Per-enemy hits triggered as ninja passes their X
  const hitTask = async (enemy, dmg, isCrit, hitX) => {
    if (!enemy || !enemy.alive) return;
    const passFraction = Math.abs(hitX) / Math.abs(dashX);
    const triggerMs = Math.max(40, Math.round(dashMs * passFraction));
    await sleep(triggerMs);
    if (!enemy.alive) return;
    const eElId = getFighterElId(enemy);
    const eNode = document.getElementById(eElId);
    applyRawDmg(attacker, enemy, dmg, false, false, 'physical');
    spawnFloatingNum(eElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, { atkSide: attacker.side, amount: dmg });
    updateHpBar(enemy, eElId);
    await triggerOnHitEffects(attacker, enemy, dmg);
    const tBody = eNode ? eNode.querySelector('.st-body') : null;
    if (tBody) {
      const knockX = (isMobile ? 30 : 56) * dir;  // ~75% wider knockback
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
  await Promise.all([
    hitTask(target, mainDmg, isCrit1, mainHitX),
    behind && behind.alive ? hitTask(behind, behindDmg, isCrit2, behindHitX) : Promise.resolve(),
  ]);

  // Camera shake right after impacts
  if (battleField) {
    battleField.style.setProperty('--cam-scale', '1');
    battleField.classList.remove('battle-scene-shake');
    void battleField.offsetWidth;
    battleField.classList.add('battle-scene-shake');
    setTimeout(() => battleField.classList.remove('battle-scene-shake'), 240);
  }

  // ── Phase 4: hold at far end (wait for enemies to land) ──
  await sleep(900);  // longer hold so enemies fly higher and farther before landing

  if (trail) { trail.remove(); trail = null; }

  // ── Phase 5: TURN AROUND (flip sprite scaleX to face return direction) ──
  if (sprite) sprite.style.transform = flippedSpriteTransform;
  await sleep(120);

  // ── Phase 6: dash directly back to ORIGIN (combine X-back + Y-back into
  // one straight motion — no extra hop after, per user "不用拐两下") ──
  if (fBody) {
    trail = document.createElement('div');
    trail.className = 'ninja-dash-trail' + (dir === 1 ? ' flip-x' : '');
    trail.style.left = '50%';
    trail.style.top  = '50%';
    fBody.appendChild(trail);
  }
  fBody.animate([
    { transform: `translate(${ldashX}px, ${lyShift}px)` },
    { transform: `translate(0, 0)`,                            offset: 1 },
  ], { duration: 240, easing: 'cubic-bezier(.2,.8,.4,1)', fill: 'forwards' });
  await sleep(260);

  if (trail) trail.remove();

  // ── Phase 7: restore original facing ──
  if (sprite) sprite.style.transform = '';
  fBody.style.transform = '';
  fEl.style.zIndex = '';

  const behindNote = behind ? ` + ${behind.emoji}${behind.name} <span class="log-direct">${behindDmg}物理</span>` : '';
  addLog(`${attacker.emoji}${attacker.name} <b>冲击</b> → ${target.emoji}${target.name}：<span class="log-direct">${mainDmg}物理</span>${behindNote}`);
  await sleep(80);
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
    spawnFloatingNum(eId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0);
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
