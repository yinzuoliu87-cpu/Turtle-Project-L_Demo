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
  const totalMs = isMobile ? 1200 : 1100;
  const g = isMobile ? 900 : 1500;
  const liftVy = isMobile ? -380 : -460;     // strong "高高撞飞"
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

// 冲击: ninja DASHES through the target's column from origin to past
// back-row's position, fling enemies in the path high (single hit each),
// then return after they land. Damage values match the original skill
// (1.2× ATK on target, 0.8× ATK on behind).
async function doNinjaImpact(attacker, target, skill) {
  const fElId = getFighterElId(attacker);
  const fEl = document.getElementById(fElId);
  if (!fEl || !target || !target.alive) { await sleep(200); return; }

  const tElId = getFighterElId(target);
  const tEl = document.getElementById(tElId);
  const battleField = document.getElementById('battleScene');
  const isMobile = window.innerWidth <= 768;
  const dir = attacker.side === 'left' ? 1 : -1;

  // Targets: main + behind (same column, back row)
  const behind = (typeof fighterBehind === 'function') ? fighterBehind(target) : null;
  const mainScale = skill.atkScale || 1.2;
  const behindScale = skill.behindScale || 0.8;

  // Pre-calc damage for both so logs/spawns line up with juggle hits
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

  // ── Compute ninja dash path (X delta to past back-row) ──
  let dashX = 0;
  let mainHitX = 0, behindHitX = 0;
  if (battleField && fEl && tEl) {
    const bRect = battleField.getBoundingClientRect();
    const zoom = battleField.offsetWidth ? bRect.width / battleField.offsetWidth : 1;
    const fRect = fEl.getBoundingClientRect();
    const tRect = tEl.getBoundingClientRect();
    const fCx = ((fRect.left + fRect.width / 2) - bRect.left) / zoom;
    const tCx = ((tRect.left + tRect.width / 2) - bRect.left) / zoom;
    mainHitX = tCx - fCx;
    if (behind) {
      const bEl = document.getElementById(getFighterElId(behind));
      if (bEl) {
        const bRect2 = bEl.getBoundingClientRect();
        const bCx = ((bRect2.left + bRect2.width / 2) - bRect.left) / zoom;
        behindHitX = bCx - fCx;
      }
    }
    // Stop ~50px past the further enemy
    const farX = behind ? behindHitX : mainHitX;
    dashX = farX + dir * 50;
  } else {
    dashX = dir * 280;
    mainHitX = dir * 200;
    behindHitX = dir * 240;
  }

  // ── Build dash motion (dash → hold → return) ──
  const fBody = fEl.querySelector('.st-body') || fEl;
  const dashMs = 280;          // dash forward time
  const holdMs = 900;          // wait for enemies to land
  const returnMs = 320;        // dash back
  const totalDashMs = dashMs + holdMs + returnMs;
  fEl.style.zIndex = '60';
  fEl.classList.add('ninja-dashing');
  const dashAnim = fBody.animate([
    { transform: `translateX(0)`,            offset: 0,                                    easing: 'cubic-bezier(.2,.7,.4,1)' },
    { transform: `translateX(${dashX}px)`,   offset: dashMs / totalDashMs,                 easing: 'linear' },
    { transform: `translateX(${dashX}px)`,   offset: (dashMs + holdMs) / totalDashMs,      easing: 'cubic-bezier(.4,0,.6,1)' },
    { transform: `translateX(0)`,            offset: 1                                                                          },
  ], { duration: totalDashMs, fill: 'forwards' });

  // ── Schedule per-enemy hits as ninja passes their X ──
  const hitTask = async (enemy, dmg, isCrit, hitX) => {
    if (!enemy || !enemy.alive) return;
    const passFraction = Math.abs(hitX) / Math.abs(dashX);  // 0..1 within dash phase
    const triggerMs = Math.max(40, Math.round(dashMs * passFraction));
    await sleep(triggerMs);
    if (!enemy.alive) return;
    const eElId = getFighterElId(enemy);
    const eNode = document.getElementById(eElId);

    // Apply damage + single floating number
    applyRawDmg(attacker, enemy, dmg, false, false, 'physical');
    spawnFloatingNum(eElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, { atkSide: attacker.side, amount: dmg });
    updateHpBar(enemy, eElId);
    await triggerOnHitEffects(attacker, enemy, dmg);

    // Fling enemy high (single-impulse juggle)
    const tBody = eNode ? eNode.querySelector('.st-body') : null;
    if (tBody) {
      const knockX = (isMobile ? 18 : 32) * dir;
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

  // Camera shake at impact moment
  if (battleField) {
    battleField.style.setProperty('--cam-scale', '1');
    battleField.classList.remove('battle-scene-shake');
    void battleField.offsetWidth;
    battleField.classList.add('battle-scene-shake');
    setTimeout(() => battleField.classList.remove('battle-scene-shake'), 240);
  }

  const behindNote = behind ? ` + ${behind.emoji}${behind.name} <span class="log-direct">${behindDmg}物理</span>` : '';
  addLog(`${attacker.emoji}${attacker.name} <b>冲击</b> → ${target.emoji}${target.name}：<span class="log-direct">${mainDmg}物理</span>${behindNote}`);

  // Wait for the rest of the dash (hold + return)
  await sleep(totalDashMs - dashMs);

  fEl.classList.remove('ninja-dashing');
  fEl.style.zIndex = '';
  // Animation cleanup — fill:forwards held translateX(0) so no residual transform
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
