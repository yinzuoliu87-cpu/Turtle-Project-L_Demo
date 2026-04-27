// Spawn a hunter arrow projectile flying from attacker → target.
// Returns { arrival: Promise } that resolves at the moment the arrow visually
// reaches the target (i.e. when damage should land). Caller is responsible
// for applying damage + spawning floating numbers at that moment.
function spawnHunterArrow(attacker, target, flightMs = 240) {
  const battleField = document.getElementById('battleScene');
  const aEl = document.getElementById(getFighterElId(attacker));
  const tEl = document.getElementById(getFighterElId(target));
  const damageAt = Math.round(flightMs * 0.85);
  if (!battleField || !aEl || !tEl) {
    return { arrival: sleep(damageAt) };
  }
  const aBody = aEl.querySelector('.st-body') || aEl;
  const tBody = tEl.querySelector('.st-body') || tEl;
  const bRect = battleField.getBoundingClientRect();
  const aRect = aBody.getBoundingClientRect();
  const tRect = tBody.getBoundingClientRect();
  const zoom = battleField.offsetWidth ? bRect.width / battleField.offsetWidth : 1;
  const aCx = ((aRect.left + aRect.width / 2) - bRect.left) / zoom;
  const aCy = ((aRect.top  + aRect.height / 2) - bRect.top)  / zoom;
  const tCx = ((tRect.left + tRect.width / 2) - bRect.left) / zoom;
  const tCy = ((tRect.top  + tRect.height / 2) - bRect.top)  / zoom;
  const dx = tCx - aCx, dy = tCy - aCy;
  const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  const arrow = document.createElement('div');
  arrow.className = 'hunter-arrow';
  arrow.style.left = aCx + 'px';
  arrow.style.top  = aCy + 'px';
  arrow.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg)`;
  battleField.appendChild(arrow);
  requestAnimationFrame(() => {
    arrow.style.transition = `transform ${flightMs}ms linear`;
    arrow.style.transform  = `translate(-50%,-50%) translate(${dx}px, ${dy}px) rotate(${angleDeg}deg)`;
  });
  setTimeout(() => arrow.remove(), flightMs + 80);
  return { arrival: sleep(damageAt) };
}

async function doHunterShot(attacker, target, skill) {
  // If target < execThresh% HP: +execCrit% crit, +execCritDmg% crit damage
  const isExec = target.hp / target.maxHp < skill.execThresh / 100;
  const savedCrit = attacker.crit;
  if (isExec) {
    attacker.crit += skill.execCrit / 100;
    addLog(`${attacker.emoji}${attacker.name} 猎人本能！目标生命值低，<span class="log-crit">暴击率+${skill.execCrit}% 暴击伤害+${skill.execCritDmg}%</span>`);
  }
  attacker._extraCritDmg = isExec ? skill.execCritDmg / 100 : 0;

  // Wait for the default attack-hop forward apex, then fire 3 arrows in sequence.
  await sleep(240);
  const hits = skill.hits || 3;
  const perHit = Math.round(attacker.atk * skill.atkScale);
  let totalDmg = 0, totalCrits = 0;
  for (let i = 0; i < hits; i++) {
    if (!target.alive) break;
    const tElId = getFighterElId(target);
    const { arrival } = spawnHunterArrow(attacker, target, 240);
    await arrival;
    if (!target.alive) break;
    let effectiveCrit = attacker.crit;
    if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) effectiveCrit += attacker.passive.pct / 100;
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
    const eDef = calcEffDef(attacker, target);
    const dmg = Math.max(1, Math.round(perHit * critMult * calcDmgMult(eDef)));
    applyRawDmg(attacker, target, dmg, false, false, 'physical');
    totalDmg += dmg;
    if (isCrit) totalCrits++;
    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, {atkSide: attacker.side, amount: dmg});
    updateHpBar(target, tElId);
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    await triggerOnHitEffects(attacker, target, dmg);
    await sleep(140);
    if (tEl) tEl.classList.remove('hit-shake');
  }
  addLog(`${attacker.emoji}${attacker.name} <b>${skill.name}</b> ${hits}箭 → ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}物理</span>${totalCrits>0?` <span class="log-crit">${totalCrits}暴击</span>`:''}`);

  attacker.crit = savedCrit;
  attacker._extraCritDmg = 0;
}

async function doHunterBarrage(attacker, skill) {
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  if (!enemies.length) return;
  const baseArrow = Math.round(attacker.atk * skill.arrowScale);
  let totalDmg = 0, totalCrits = 0;

  // Wait for forward apex, then rapid-fire 10 arrows at random targets.
  await sleep(220);
  for (let i = 0; i < skill.hits; i++) {
    const alive = enemies.filter(e => e.alive);
    if (!alive.length) break;
    const target = alive[Math.floor(Math.random() * alive.length)];
    const { arrival } = spawnHunterArrow(attacker, target, 220);
    await arrival;
    if (!target.alive) { await sleep(80); continue; }
    let effectiveCrit = attacker.crit;
    if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) effectiveCrit += attacker.passive.pct / 100;
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmgPerm || 0)) : 1;
    if (isCrit) totalCrits++;
    const arrowDmg = Math.max(1, Math.round(baseArrow * critMult));
    applyRawDmg(attacker, target, arrowDmg, true, false, 'true');
    totalDmg += arrowDmg;
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, `-${arrowDmg}`, isCrit ? 'crit-true' : 'true-dmg', 0, 0, {atkSide: attacker.side, amount: arrowDmg});
    await triggerOnHitEffects(attacker, target, arrowDmg);
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(120);
    if (tEl) tEl.classList.remove('hit-shake');
  }
  addLog(`${attacker.emoji}${attacker.name} <b>${skill.name}</b> ${skill.hits}根箭：<span class="log-pierce">${totalDmg}真实</span>${totalCrits > 0 ? ' <span class="log-crit">'+totalCrits+'暴击</span>' : ''}`);
}

async function doHunterStealth(attacker, target, skill) {
  // 1) Deal damage
  const dmgSkill = { ...skill, power: 0, atkScale: skill.dmgScale, hits: 1, type: 'physical' };
  await doDamage(attacker, target, dmgSkill);

  // 2) Gain dodge buff
  const existing = attacker.buffs.find(b => b.type === 'dodge');
  if (existing) { existing.turns = Math.max(existing.turns, skill.dodgeTurns); }
  else attacker.buffs.push({ type: 'dodge', value: skill.dodgePct, turns: skill.dodgeTurns });

  // 3) Gain shield
  const shieldAmt = Math.round(attacker.atk * skill.shieldScale);
  attacker.shield += shieldAmt;

  const fElId = getFighterElId(attacker);
  spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 200, 0);
  spawnFloatingNum(fElId, `闪避${skill.dodgePct}%`, 'passive-num', 400, -15);
  updateHpBar(attacker, fElId);
  renderStatusIcons(attacker);
  addLog(`${attacker.emoji}${attacker.name} 进入隐蔽：<span class="log-passive">闪避${skill.dodgePct}% ${skill.dodgeTurns}回合</span> + <span class="log-shield">护盾+${shieldAmt}</span>`);
}

