async function doBambooLeaf(attacker, target, skill) {
  const tElId = getFighterElId(target);
  let totalDmg = 0;
  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) continue; // keep animating remaining hits
    const {isCrit, critMult} = calcCrit(attacker);
    const baseDmg = Math.round(attacker.atk * skill.atkScale) + Math.round(attacker.maxHp * skill.selfHpPct / 100);
    const eDef = calcEffDef(attacker, target);
        const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(eDef)));
    applyRawDmg(attacker, target, dmg, false, false, 'physical');
    totalDmg += dmg;
    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0);
    await triggerOnHitEffects(attacker, target, dmg);
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(400);
    if (tEl) tEl.classList.remove('hit-shake');
  }
  addLog(`${attacker.emoji}${attacker.name} <b>一叶刃</b> ${skill.hits}段 → ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}伤害</span>`);
}

async function doBambooHeal(caster, skill) {
  const fElId = getFighterElId(caster);
  const allies = (caster.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive && a !== caster);
  if (allies.length > 0) {
    // Heal self 15%
    const healAmt = Math.round(caster.maxHp * skill.healPct / 100);
    const before = caster.hp;
    caster.hp = Math.min(caster.maxHp, caster.hp + healAmt);
    const actual = Math.round(caster.hp - before);
    if (actual > 0) spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 0, 0);

    updateHpBar(caster, fElId);
    // Shield ally 15% of caster's maxHP
    for (const a of allies) {
      const shieldAmt = Math.round(caster.maxHp * skill.shieldPct / 100);
      a.buffs.push({ type:'hidingShield', shieldVal:shieldAmt, healPct:0, turns:skill.shieldTurns + 1 });
      a.shield += shieldAmt;
      const aElId = getFighterElId(a);
      spawnFloatingNum(aElId, `+${shieldAmt}`, 'shield-num', 0, 0);
      updateHpBar(a, aElId);
    }
    addLog(`${caster.emoji}${caster.name} <b>自然恢复</b>：<span class="log-heal">+${actual}HP</span>，队友获得 <span class="log-shield">${Math.round(caster.maxHp * skill.shieldPct / 100)}护盾</span> ${skill.shieldTurns}回合`);
  } else {
    // No ally: heal self 23%
    const healAmt = Math.round(caster.maxHp * skill.soloHealPct / 100);
    const before = caster.hp;
    caster.hp = Math.min(caster.maxHp, caster.hp + healAmt);
    const actual = Math.round(caster.hp - before);
    if (actual > 0) spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 0, 0);

    updateHpBar(caster, fElId);
    addLog(`${caster.emoji}${caster.name} <b>自然恢复</b>（无队友）：<span class="log-heal">+${actual}HP</span>`);
  }
  await sleep(800);
}

function spawnBambooOrb(fromElId, toElId) {
  const fromEl = document.getElementById(fromElId);
  const toEl = document.getElementById(toElId);
  if (!fromEl || !toEl) return;
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();
  const sx = fromRect.left + fromRect.width / 2;
  const sy = fromRect.top + fromRect.height / 2;
  const ex = toRect.left + toRect.width / 2;
  const ey = toRect.top + toRect.height / 2;
  const dist = Math.sqrt((ex-sx)**2 + (ey-sy)**2);
  const arcH = Math.max(60, dist * 0.4);

  const orb = document.createElement('div');
  orb.className = 'leaf-orb';
  document.body.appendChild(orb);

  const duration = 650;
  const start = performance.now();
  let lastTrailAt = 0;
  let prevX = sx, prevY = sy;
  function tick(now) {
    let t = Math.min(1, (now - start) / duration);
    const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const x = sx + (ex - sx) * ease;
    const arc = -4 * arcH * ease * (ease - 1);
    const y = sy + (ey - sy) * ease - arc;
    orb.style.left = x + 'px';
    orb.style.top = y + 'px';
    // Streak trail oriented along the instantaneous velocity
    if (t > 0.05 && t < 0.93 && now - lastTrailAt > 32) {
      const dx = x - prevX, dy = y - prevY;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const p = document.createElement('div');
      p.className = 'leaf-trail';
      p.style.left = x + 'px';
      p.style.top  = y + 'px';
      p.style.setProperty('--angle', angle + 'deg');
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 440);
      lastTrailAt = now;
    }
    prevX = x; prevY = y;
    if (t < 1) requestAnimationFrame(tick);
    else orb.remove();
  }
  requestAnimationFrame(tick);
}

function spawnLeafBurst(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const burst = document.createElement('div');
  burst.className = 'leaf-burst';
  burst.style.left = '50%';
  burst.style.top = '50%';
  el.appendChild(burst);
  setTimeout(() => burst.remove(), 320);
}

async function doBambooChargeAttack(attacker, target) {
  const p = attacker.passive;
  const fElId = getFighterElId(attacker);
  const tElId = getFighterElId(target);

  // ── 蓄力停顿 ──
  spawnFloatingNum(fElId, '<img src="assets/passive/bamboo-charge-icon.png" style="width:16px;height:16px;vertical-align:middle">蓄力...', 'passive-num', 0, -20);
  try { sfxBambooCharge(); } catch(e) {}
  await sleep(1000);

  // ── 打出强化普攻（魔法伤害，受魔抗减免） ──
  const rawDmg = Math.round(attacker.atk * p.atkPct / 100) + Math.round(attacker.maxHp * p.selfHpPct / 100);
  const effMr = calcEffDef(attacker, target, 'magic');
    const {isCrit, critMult} = calcCrit(attacker);
  const magicDmg = Math.max(1, Math.round(rawDmg * critMult * calcDmgMult(effMr)));
  applyRawDmg(attacker, target, magicDmg, false, false, 'magic');
  try { sfxBambooHit(); } catch(e) {}
  spawnLeafBurst(tElId);
  spawnFloatingNum(tElId, '<img src="assets/passive/bamboo-charge-icon.png" style="width:16px;height:16px;vertical-align:middle">充能!', 'crit-label', 0, -20);
  spawnFloatingNum(tElId, `-${magicDmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0, {atkSide: attacker.side, amount: magicDmg});
  const tEl = document.getElementById(tElId);
  if (tEl) tEl.classList.add('hit-shake');
  await triggerOnHitEffects(attacker, target, magicDmg);
  updateHpBar(target, tElId);
  // ── 打中同时绿球飞出 ──
  spawnBambooOrb(tElId, fElId);
  await sleep(300);
  if (tEl) tEl.classList.remove('hit-shake');
  // 等绿球到达（飞行650ms，已等300ms）
  await sleep(350);

  // ── 绿球到达：立刻回血+血条变化 ──
  // healAmt (heal portion) is subject to healReduce; hpGain (max HP boost) is NOT
  const rawHealAmt = Math.round(attacker.maxHp * p.healSelfHpPct / 100);
  const healRed = (attacker.buffs.find(b => b.type === 'healReduce') || {}).value || 0;
  const healAmt = Math.round(rawHealAmt * (1 - healRed / 100));
  const hpGain = Math.round(attacker.atk * p.hpGainAtkPct / 100);
  const before = attacker.hp;
  attacker.maxHp += hpGain;
  attacker._bambooGainedHp = (attacker._bambooGainedHp || 0) + hpGain;
  attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmt + hpGain);
  const actualHeal = Math.round(attacker.hp - before);
  spawnFloatingNum(fElId, `+${actualHeal}`, 'heal-num', 0, 0);
  spawnFloatingNum(fElId, `+${hpGain}最大HP`, 'passive-num', 0, 20);
  updateHpBar(attacker, fElId);

  // Mark as fired so icon stops glowing
  attacker._bambooFired = true;
  renderStatusIcons(attacker);

  addLog(`${attacker.emoji}${attacker.name} <b>竹编充能</b> → ${target.emoji}${target.name}：<span class="log-magic">${magicDmg}魔法</span>${isCrit?' <span class="log-crit">暴击</span>':''} <span class="log-heal">+${actualHeal}HP</span> <span class="log-passive">永久+${hpGain}最大HP</span>`);
  checkDeaths(attacker);
  await sleep(400);
}

// ── DIAMOND TURTLE (钻石龟) ──────────────────────────────
