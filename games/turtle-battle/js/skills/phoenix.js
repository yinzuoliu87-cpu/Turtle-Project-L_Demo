async function doPhoenixBurn(attacker, target, skill) {
  // Deal 1×ATK normal damage
  const {isCrit, critMult} = calcCrit(attacker);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const effectiveDef = calcEffDef(attacker, target, 'magic');
    const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effectiveDef)));
  const tElId = getFighterElId(target);
  applyRawDmg(attacker, target, dmg, false, false, 'magic');
  spawnFloatingNum(tElId, `${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0);
  await triggerOnHitEffects(attacker, target, dmg);
  const tEl = document.getElementById(tElId);
  tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(450);
  tEl.classList.remove('hit-shake');

  // Apply unified burn DoT — 0.4*ATK + 8%maxHP magic, 4 turns, no stack (refresh)
  if (target.alive && !(target.passive && target.passive.burnImmune)) {
    const burnVal = Math.round(attacker.atk * 0.4);
    const burnHp = 8;
    const burnTurns = 4;
    const srcIdx = allFighters.indexOf(attacker);
    const existing = target.buffs.find(b => b.type === 'phoenixBurnDot');
    if (existing) {
      existing.turns = burnTurns;
      existing.value = Math.max(existing.value, burnVal);
      existing.sourceIdx = srcIdx;
      spawnFloatingNum(tElId, `🔥刷新${burnTurns}回合`, 'debuff-label', 200, 0);
      addLog(`${attacker.emoji}${attacker.name} <b>灼烧</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span> + <span class="log-dot">灼烧刷新至${burnTurns}回合</span>`);
    } else {
      target.buffs.push({ type:'phoenixBurnDot', value:burnVal, hpPct:burnHp, turns:burnTurns, sourceSide:attacker.side, sourceIdx:srcIdx, dmgType:'magic' });
      spawnFloatingNum(tElId, `🔥灼烧${burnTurns}回合`, 'debuff-label', 200, 0);
      addLog(`${attacker.emoji}${attacker.name} <b>灼烧</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span> + <span class="log-dot">灼烧${burnTurns}回合</span>`);
    }
    renderStatusIcons(target);
  }
  await sleep(80);
}

async function doPhoenixShield(caster, skill) {
  const amount = Math.round(caster.atk * skill.shieldScale);
  caster._lavaShieldVal = amount;
  caster._lavaShieldTurns = skill.duration;
  caster._lavaShieldCounter = skill.counterScale;
  // Also add as normal shield for visual
  caster.shield += amount;
  const fElId = getFighterElId(caster);
  spawnFloatingNum(fElId, `+${amount}<img src="assets/battle/lava-shield-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'passive-num', 0, 0);
  updateHpBar(caster, fElId);
  renderStatusIcons(caster);
  addLog(`${caster.emoji}${caster.name} <b>熔岩盾</b>：+${amount}护盾 ${skill.duration}回合，被攻击每段反击${Math.round(skill.counterScale*100)}%ATK`);
  await sleep(1000);
}

async function doPhoenixScald(attacker, target, skill) {
  const tElId = getFighterElId(target);

  // Break 50% of target's shields first
  if (skill.shieldBreak && (target.shield > 0 || target.bubbleShieldVal > 0)) {
    const breakPct = skill.shieldBreak / 100;
    if (target.bubbleShieldVal > 0) {
      const broken = Math.round(target.bubbleShieldVal * breakPct);
      target.bubbleShieldVal -= broken;
      spawnFloatingNum(tElId, `${broken}<img src="assets/passive/bubble-store-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'shield-dmg', 0, -15);
    }
    if (target.shield > 0) {
      const broken = Math.round(target.shield * breakPct);
      target.shield -= broken;
      spawnFloatingNum(tElId, `${broken}`, 'shield-dmg', 100, -15);
    }
    addLog(`${attacker.emoji}${attacker.name} 烫伤破盾！<span class="log-debuff">破坏${skill.shieldBreak}%护盾</span>`);
    updateHpBar(target, tElId);
    await sleep(300);
  }

  // Deal 0.7×ATK normal damage
  const {isCrit, critMult} = calcCrit(attacker);
  const baseDmg = Math.round(attacker.atk * skill.atkScale);
  const effectiveDef = calcEffDef(attacker, target, 'magic');
    const dmg = Math.max(1, Math.round(baseDmg * critMult * calcDmgMult(effectiveDef)));
  applyRawDmg(attacker, target, dmg, false, false, 'magic');
  spawnFloatingNum(tElId, `${dmg}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, 0);
  await triggerOnHitEffects(attacker, target, dmg);
  const tEl = document.getElementById(tElId);
  tEl.classList.add('hit-shake');
  updateHpBar(target, tElId);
  await sleep(450);
  tEl.classList.remove('hit-shake');

  // Apply debuffs
  if (target.alive) {
    applySkillDebuffs(skill, target, attacker);
    // Heal reduce
    if (skill.healReduce) {
      const existing = target.buffs.find(b => b.type === 'healReduce');
      if (existing) { existing.turns = 4; } else target.buffs.push({ type:'healReduce', value:50, turns:4 });
      spawnFloatingNum(tElId, '☠️治疗削减', 'debuff-label', 400, -10);
      renderStatusIcons(target);
    }
  }
  addLog(`${attacker.emoji}${attacker.name} <b>烫伤</b> → ${target.emoji}${target.name}：<span class="log-direct">${dmg}伤害</span> + 攻击力/护甲/魔抗-15% + 灼烧 + 治疗削减`);
  await sleep(80);
}

// ── NINJA SKILLS ──────────────────────────────────────────
