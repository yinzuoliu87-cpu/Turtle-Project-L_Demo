// ══════════════════════════════════════════════════════════
// combat.js — Core damage, heal, shield, on-hit effects
// Depends on: engine.js (globals, spawnFloatingNum, etc.)
// ══════════════════════════════════════════════════════════

/* ── Shared VFX helper: spawn a lightning-strike sprite on a fighter. ──
   Used by the 闪电龟 passive, its 8-stack detonate, and 财神龟 thunder
   equipment's 5-stack detonate. Sprite auto-removes after its animation. */
function spawnLightningStrike(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  const bolt = document.createElement('div');
  bolt.className = 'common-lightning-strike';
  el.appendChild(bolt);
  setTimeout(() => bolt.remove(), 600);
}

/* ── Equipment: 雷鸣贝壳 — counts skill hits, triggers AoE on every 3rd ── */
function triggerThunderShell(attacker) {
  if (!attacker || !attacker._equipThunderShell || !attacker.alive) return;
  attacker._thunderShellStacks = (attacker._thunderShellStacks || 0) + 1;
  if (attacker._thunderShellStacks < 3) return;
  attacker._thunderShellStacks = 0;
  const dmg = Math.max(1, Math.round(attacker.atk * 0.8));
  const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  for (const e of enemies) {
    const reducedDmg = Math.max(1, Math.round(dmg * calcDmgMult(calcEffDef(attacker, e, 'magic'))));
    applyRawDmg(attacker, e, reducedDmg, false, false, 'magic', false, true);
    const eElId = getFighterElId(e);
    spawnFloatingNum(eElId, `-${reducedDmg}⚡`, 'magic-dmg', 0, 0, { atkSide: attacker.side, amount: reducedDmg });
    updateHpBar(e, eElId);
  }
  addLog(`${attacker.emoji}${attacker.name} <b>雷鸣贝壳</b>：全体敌人 <span class="log-magic">${dmg}魔法伤害</span>`);
}

/* ── DAMAGE — multi-hit with crit, floating numbers, debuff application ── */
async function doDamage(attacker, target, skill) {
  const hits = skill.hits;
  const tElId = getFighterElId(target);
  let totalDirect = 0, totalPierce = 0, totalShieldDmg = 0, totalCrits = 0;

  for (let i = 0; i < hits; i++) {
    if (!target.alive) continue;

    // Dodge check
    const dodgeBuff = target.buffs.find(b => b.type === 'dodge');
    const totalDodge = (dodgeBuff ? dodgeBuff.value : 0) + (target._extraDodge || 0);
    if (totalDodge > 0 && Math.random() < totalDodge / 100) {
      const yOff = i * 28;
      spawnFloatingNum(tElId, '闪避!', 'dodge-num', 0, yOff);
      // Dodge counter (e.g. starWarp): deal damage back on dodge
      const dodgeCounterBuff = target.buffs.find(b => b.type === 'dodgeCounter');
      if (dodgeCounterBuff && attacker.alive) {
        const cDmg = dodgeCounterBuff.value;
        applyRawDmg(target, attacker, cDmg, false, false, dodgeCounterBuff.dmgType || 'magic', true);
        spawnFloatingNum(getFighterElId(attacker), `-${cDmg}`, 'counter-dmg', 100, yOff);
        updateHpBar(attacker, getFighterElId(attacker));
        if (attacker.hp <= 0) attacker.alive = false;
      }
      await sleep(280);
      continue;
    }

    let basePower = skill.power;
    if (skill.atkScale) basePower += Math.round(attacker.atk * skill.atkScale);
    if (skill.defScale) basePower += Math.round(attacker.def * skill.defScale);
    if (skill.mrScale) basePower += Math.round((attacker.mr || attacker.def) * skill.mrScale);
    if (skill.hpPct) basePower += Math.round(target.maxHp * skill.hpPct / 100);
    if (skill.selfHpPct) basePower += Math.round(attacker.maxHp * skill.selfHpPct / 100);
    if (skill.random) basePower = Math.round(basePower * (0.5 + Math.random() * 1.5));

    // Crit calculation
    let effectiveCrit = attacker.crit;
    if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
      effectiveCrit += attacker.passive.pct / 100;
    }
    // GamblerBlood crit overflow → crit damage
    let overflowCritDmg = 0;
    if (effectiveCrit > 1.0) {
      overflowCritDmg = (effectiveCrit - 1.0) * (attacker.passive && attacker.passive.overflowMult || 1.5);
      effectiveCrit = 1.0;
    }
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0) + overflowCritDmg) : 1;
    if (isCrit) totalCrits++;

    // Determine damage type: physical (default), magic, true
    const dmgType = skill.dmgType || 'physical';

    // Defense reduction based on damage type (negative def = damage amplified)
    const effectiveDef = calcEffDef(attacker, target, dmgType);
    const defDmgMult = dmgType === 'true' ? 1 : calcDmgMult(effectiveDef);

    // Main damage = basePower (minus true damage flat) × crit, reduced/amplified by armor/mr
    let trueFlat = skill.trueDmg || skill.pierce || 0;
    if (skill.trueDmgScale || skill.pierceScale) trueFlat += Math.round(attacker.atk * (skill.trueDmgScale || skill.pierceScale));
    const mainBase = Math.max(0, basePower - (skill.trueDmg || skill.pierce || 0));
    let mainDmg = Math.max(1, Math.round(mainBase * critMult * defDmgMult));

    // Passive: bonusDmgAbove60
    if (attacker.passive && attacker.passive.type === 'bonusDmgAbove60' && target.hp / target.maxHp > 0.6) {
      mainDmg = Math.round(mainDmg * (1 + attacker.passive.pct / 100));
    }
    // Passive: frostAura bonus vs specific targets
    if (attacker.passive && attacker.passive.type === 'frostAura' && attacker.passive.bonusTargets && attacker.passive.bonusTargets.includes(target.id)) {
      mainDmg = Math.round(mainDmg * (1 + attacker.passive.bonusDmgPct / 100));
    }
    // Passive skill bonus damage (e.g. ice burn immune skill)
    if (attacker._bonusDmgTargets && attacker._bonusDmgTargets.includes(target.id)) {
      mainDmg = Math.round(mainDmg * (1 + (attacker._bonusDmgPct||0) / 100));
    }
    // Passive: basicTurtle — bonus damage based on target rarity
    if (attacker.passive && attacker.passive.type === 'basicTurtle' && attacker.passive.bonusMap) {
      const bonusPct = attacker.passive.bonusMap[target.rarity] || 0;
      if (bonusPct > 0) mainDmg = Math.round(mainDmg * (1 + bonusPct / 100));
    }
    // Fear: reduces physical/magic damage (not true)
    if (dmgType !== 'true') {
      const fearBuff = attacker.buffs.find(b => b.type === 'fear' && allFighters[b.sourceId] === target);
      if (fearBuff) mainDmg = Math.round(mainDmg * (1 - fearBuff.value / 100));
    }
    // Gambler convert: X% of main damage → true damage
    const pcBuff = attacker.buffs.find(b => b.type === 'gamblerPierceConvert');
    let convertedTrue = 0;
    if (pcBuff) { convertedTrue = Math.round(mainDmg * pcBuff.value / 100); mainDmg -= convertedTrue; }
    // Diamond structure: flat reduction per hit (physical + magic, not true)
    if (dmgType !== 'true' && target.passive && target.passive.type === 'diamondStructure') {
      const defPct = target._diamondEnhanced ? 20 : (target.passive.flatReductionPct || 20);
      const mrPct = target._diamondEnhanced ? 10 : 0;
      const flatReduce = Math.round(target.def * defPct / 100) + Math.round((target.mr||0) * mrPct / 100);
      mainDmg = Math.max(1, mainDmg - flatReduce);
    }
    let mainPart = mainDmg;
    // True damage portion: ignores all defenses, but hits shield
    let truePart = Math.round(trueFlat * critMult) + convertedTrue;
    // Ink mark amplification now handled in applyRawDmg
    const totalHit = mainPart + truePart;

    // Damage absorption
    const { hpLoss, shieldAbs, bubbleAbs } = applyRawDmg(null, target, totalHit, false, false, undefined, false, true);
    // Track by type
    if (dmgType === 'magic') attacker._magicDmgDealt = (attacker._magicDmgDealt||0) + mainPart;
    else if (dmgType === 'true') attacker._trueDmgDealt = (attacker._trueDmgDealt||0) + mainPart;
    else attacker._physDmgDealt = (attacker._physDmgDealt||0) + mainPart;
    if (truePart > 0) attacker._trueDmgDealt = (attacker._trueDmgDealt||0) + truePart;
    attacker._dmgDealt += totalHit;
    updateDmgStats();

    totalDirect += mainPart;
    totalPierce += truePart;
    totalShieldDmg += shieldAbs + bubbleAbs;

    // Floating number classes by damage type
    const mainCls = dmgType === 'magic' ? (isCrit ? 'crit-magic' : 'magic-dmg') : dmgType === 'true' ? (isCrit ? 'crit-true' : 'true-dmg') : (isCrit ? 'crit-dmg' : 'direct-dmg');
    const trueCls = isCrit ? 'crit-true' : 'true-dmg';
    // Floating numbers: stacked vertically. Larger yOffset = higher on screen.
    // Canonical order top→bottom for a single hit:
    //   TRUE (white) > MAGIC > PHYSICAL > shield abs > bubble abs
    // Shields below the actual damage so info hierarchy matches: big hits up top.
    const NUM_GAP = 22;
    let ySlot = 0;
    if (bubbleAbs > 0) { spawnFloatingNum(tElId, `-${bubbleAbs}<img src="assets/passive/bubble-store-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'shield-dmg', 0, ySlot, { atkSide: attacker.side, amount: bubbleAbs }); ySlot += NUM_GAP; }
    if (shieldAbs > 0) { spawnFloatingNum(tElId, `-${shieldAbs}`, 'shield-dmg', 0, ySlot, { atkSide: attacker.side, amount: shieldAbs }); ySlot += NUM_GAP; }
    if (hpLoss > 0 && truePart > 0) {
      const mainHp = Math.min(mainPart, hpLoss);
      const trueHp = hpLoss - mainHp;
      // main first (lower), then true on top
      if (mainHp > 0) { spawnFloatingNum(tElId, `-${mainHp}`, mainCls, 0, ySlot, { atkSide: attacker.side, amount: mainHp }); ySlot += NUM_GAP; }
      if (trueHp > 0) { spawnFloatingNum(tElId, `-${trueHp}`, trueCls, 0, ySlot, { atkSide: attacker.side, amount: trueHp }); }
    } else if (hpLoss > 0) {
      spawnFloatingNum(tElId, `-${hpLoss}`, mainCls, 0, ySlot, { atkSide: attacker.side, amount: hpLoss });
    }
    if (truePart > 0 && shieldAbs >= totalHit) {
      spawnFloatingNum(tElId, `-${truePart}`, trueCls, 0, ySlot, { atkSide: attacker.side, amount: truePart });
    }

    // All on-hit effects (trap, reflect, bubble, lightning, etc.)
    await triggerOnHitEffects(attacker, target, totalHit);

    // Passive: judgement — extra magic damage based on target's current HP
    if (attacker.passive && attacker.passive.type === 'judgement' && target.alive) {
      const judgePct = attacker.passive.hpPct / 100;
      const judgeRaw = Math.round(target.hp * judgePct);
      // Apply as magic damage (reduced by MR)
      const effMr = calcEffDef(attacker, target, 'magic');
      const judgeReduced = Math.max(1, Math.round(judgeRaw * calcDmgMult(effMr) * critMult));
      applyRawDmg(attacker, target, judgeReduced, false, false, 'magic', false, true);
      totalDirect += judgeReduced;
      if (skill._judgeTotal !== undefined) skill._judgeTotal += judgeReduced;
      // Blue number above the main hit
      spawnFloatingNum(tElId, `-${judgeReduced}`, isCrit ? 'crit-magic' : 'magic-dmg', 0, -20, { atkSide: attacker.side, amount: judgeReduced });
      updateHpBar(target, tElId);
      await sleep(200);
    }

    // Hit animation based on damage type
    playHitAnim(tElId, dmgType, isCrit);
    updateHpBar(target, tElId);
    await sleep(500);

    // Equipment: 潮汐涟漪 — splash 30% to one random OTHER alive enemy (single-target only)
    if (attacker._equipSplash && !skill.aoe) {
      const enemies = (attacker.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive && e !== target);
      if (enemies.length) {
        const splashTarget = enemies[Math.floor(Math.random() * enemies.length)];
        const splashAmt = Math.max(1, Math.round(totalHit * attacker._equipSplash / 100));
        applyRawDmg(attacker, splashTarget, splashAmt, false, false, dmgType, false, true);
        const sElId = getFighterElId(splashTarget);
        spawnFloatingNum(sElId, `-${splashAmt}💦`, isCrit ? 'crit-dmg' : 'direct-dmg', 100, 0, { atkSide: attacker.side, amount: splashAmt });
        updateHpBar(splashTarget, sElId);
      }
    }

    // (雷鸣贝壳 thunder hit count handled inside triggerOnHitEffects above)

    // Passive: gamblerMultiHit
    await tryGamblerMultiHit(attacker, target, tElId);
  }

  // Rainbow prism bonus: skill with prismBonus gains extra effect based on current color
  if (skill.prismBonus && attacker._prismColor !== undefined && attacker.alive) {
    const fElId = getFighterElId(attacker);
    if (attacker._prismColor === 0 && target.alive) {
      // Red: bonus 20% damage as true
      const bonus = Math.round(totalDirect * 0.2);
      if (bonus > 0) {
        applyRawDmg(attacker, target, bonus, false, false, 'true');
        spawnFloatingNum(tElId, `-${bonus}🔴`, isCrit ? 'crit-true' : 'true-dmg', 100, 0, { atkSide: attacker.side, amount: bonus });
        updateHpBar(target, tElId);
      }
    } else if (attacker._prismColor === 1) {
      // Blue: gain small shield (20% ATK)
      const shieldAmt = Math.round(attacker.atk * 0.2);
      attacker.shield += shieldAmt;
      spawnFloatingNum(fElId, `+${shieldAmt}🔵`, 'shield-num', 100, 0);
      updateHpBar(attacker, fElId);
    } else if (attacker._prismColor === 2) {
      // Green: heal 5% maxHP
      const heal = Math.round(attacker.maxHp * 0.05);
      const before = attacker.hp;
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      const actual = Math.round(attacker.hp - before);
      if (actual > 0) {
        spawnFloatingNum(fElId, `+${actual}🟢`, 'heal-num', 100, 0);
        updateHpBar(attacker, fElId);
      }
    }
  }

  // Apply debuffs from skill (only if target still alive)
  if (target.alive) {
    applySkillDebuffs(skill, target, attacker);
  }

  // Passive: counterAttack — target may counter
  if (target.alive && target.passive && target.passive.type === 'counterAttack') {
    if (Math.random() < target.passive.pct / 100) {
      const counterDmg = Math.round(target.baseAtk * 0.5);
      attacker.hp = Math.max(0, attacker.hp - counterDmg);
      const aElId = getFighterElId(attacker);
      spawnFloatingNum(aElId, `-${counterDmg}`, 'counter-dmg', 0, 0);
      updateHpBar(attacker, aElId);
      addLog(`${target.emoji}${target.name} <span class="log-passive">反击！</span>对 ${attacker.emoji}${attacker.name} 造成 <span class="log-direct">${counterDmg}物理</span>`);
      if (attacker.hp <= 0) attacker.alive = false;
    }
  }

  // Log
  const h = hits > 1 ? ` ${hits}段` : '';
  const parts = [];
  if (totalShieldDmg > 0) parts.push(`<span class="log-shield-dmg">${totalShieldDmg}护盾</span>`);
  if (totalDirect > 0)    parts.push(`<span class="log-direct">${totalDirect}物理</span>`);
  if (totalPierce > 0)    parts.push(`<span class="log-pierce">${totalPierce}真实</span>`);
  if (totalCrits > 0)     parts.push(`<span class="log-crit">${totalCrits}暴击</span>`);
  addLog(`${attacker.emoji}${attacker.name} <b>${skill.name}</b>${h} → ${target.emoji}${target.name}：${parts.join(' + ')}`);

  // Lifesteal is now handled in triggerOnHitEffects per hit

  // Self buff: selfAtkUpPct
  if (skill.selfAtkUpPct && attacker.alive) {
    const atkGain = Math.round(attacker.baseAtk * skill.selfAtkUpPct.pct / 100);
    attacker.buffs.push({ type:'atkUp', value:atkGain, turns:skill.selfAtkUpPct.turns });
    recalcStats();
    const aElId = getFighterElId(attacker);
    spawnFloatingNum(aElId, `+${atkGain}攻`, 'passive-num', 300, 0);
    renderStatusIcons(attacker);
    addLog(`${attacker.emoji}${attacker.name} 自身 <span class="log-passive">攻击+${atkGain}(${skill.selfAtkUpPct.pct}%)</span> ${skill.selfAtkUpPct.turns}回合`);
  }
  // Self buff: selfDefUpPct (used by 缩头乌龟 attack skill)
  if (skill.selfDefUpPct && attacker.alive) {
    const defGain = Math.round(attacker.baseDef * skill.selfDefUpPct.pct / 100);
    attacker.buffs.push({ type:'defUp', value:defGain, turns:skill.selfDefUpPct.turns });
    recalcStats();
    const aElId = getFighterElId(attacker);
    spawnFloatingNum(aElId, `+${defGain}护甲`, 'passive-num', 300, 0);
    renderStatusIcons(attacker);
    addLog(`${attacker.emoji}${attacker.name} 自身 <span class="log-passive">护甲+${defGain}(${skill.selfDefUpPct.pct}%)</span> ${skill.selfDefUpPct.turns}回合`);
  }
}

/* Apply debuffs: dot, atkDown, defDown */
function applySkillDebuffs(skill, target, attacker) {
  const debuffs = [];
  if (skill.dot)     debuffs.push({ type:'dot',     value:skill.dot.dmg,     turns:skill.dot.turns, sourceSide: attacker ? attacker.side : null });
  if (skill.atkDown) debuffs.push({ type:'atkDown', value:skill.atkDown.pct, turns:skill.atkDown.turns });
  if (skill.defDown) debuffs.push({ type:'defDown', value:skill.defDown.pct, turns:skill.defDown.turns });
  if (skill.mrDown)  debuffs.push({ type:'mrDown',  value:skill.mrDown.pct,  turns:skill.mrDown.turns });

  // Unified burn: 0.4*ATK + 8%maxHP, magic damage, 4 turns, no stack (refresh)
  if (skill.burn && target.alive && attacker && !((target.passive && target.passive.burnImmune) || target._burnImmune)) {
    const burnVal = Math.round(attacker.atk * 0.4);
    const burnHp = 8;
    const existing = target.buffs.find(b => b.type === 'phoenixBurnDot');
    const srcIdx = allFighters.indexOf(attacker);
    if (existing) { existing.turns = 4; existing.value = Math.max(existing.value, burnVal); existing.sourceIdx = srcIdx; }
    else target.buffs.push({ type:'phoenixBurnDot', value:burnVal, hpPct:burnHp, turns:4, sourceSide: attacker.side, sourceIdx:srcIdx, dmgType:'magic' });
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, '🔥灼烧', 'debuff-label', 200, -10);
    addLog(`${target.emoji}${target.name} 被施加 <span class="log-debuff">🔥灼烧4回合（魔法伤害）</span>`);
    renderStatusIcons(target);
  }

  for (const d of debuffs) {
    const finalTurns = d.turns;
    // Don't stack same type, refresh instead
    const existing = target.buffs.find(b => b.type === d.type);
    if (existing) {
      existing.value = Math.max(existing.value, d.value);
      existing.turns = Math.max(existing.turns, finalTurns);
    } else {
      target.buffs.push({ type:d.type, value:d.value, turns:finalTurns });
    }
    // Floating indicator
    const tElId = getFighterElId(target);
    const labels = { dot:'🔥灼烧', atkDown:'⬇️攻击', defDown:'⬇️护甲', mrDown:'⬇️魔抗' };
    spawnFloatingNum(tElId, labels[d.type], 'debuff-label', 200, -10);
    addLog(`${target.emoji}${target.name} 被施加 <span class="log-debuff">${labels[d.type]} ${finalTurns}回合</span>`);
  }
  renderStatusIcons(target);
  recalcStats();
}

async function doHeal(caster, target, skill) {
  const logParts = [];
  // Instant heal
  if (skill.heal > 0) {
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + skill.heal);
    const actual = Math.round(target.hp - before);
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, `+${actual}`, 'heal-num', 0, 0);
    updateHpBar(target, tElId);
    logParts.push(`<span class="log-heal">回复${actual}HP</span>`);
  }
  // HOT (heal over time) — stackable buff
  if (skill.hot) {
    target.buffs.push({ type:'hot', value:skill.hot.hpPerTurn, turns:skill.hot.turns });
    const tElId = getFighterElId(target);
    spawnFloatingNum(tElId, `+HOT`, 'passive-num', 200, 0);
    logParts.push(`<span class="log-heal">持续回复${skill.hot.hpPerTurn}/回合 ${skill.hot.turns}回合</span>`);
    renderStatusIcons(target);
  }
  // DefUp buff (flat)
  if (skill.defUp) {
    const existing = target.buffs.find(b => b.type === 'defUp');
    if (existing) { existing.value += skill.defUp.val; existing.turns = Math.max(existing.turns, skill.defUp.turns); }
    else target.buffs.push({ type:'defUp', value:skill.defUp.val, turns:skill.defUp.turns });
    spawnFloatingNum(getFighterElId(target), `+${skill.defUp.val}护甲`, 'passive-num', 300, 0);
    logParts.push(`<span class="log-passive">护甲+${skill.defUp.val} ${skill.defUp.turns}回合</span>`);
    recalcStats();
    renderStatusIcons(target);
  }
  // DefUp buff (ATK% based — e.g. pirate rum)
  if (skill.defUpAtkPct) {
    const defGain = Math.round(caster.atk * skill.defUpAtkPct.pct / 100);
    target.buffs.push({ type:'defUp', value:defGain, turns:skill.defUpAtkPct.turns });
    spawnFloatingNum(getFighterElId(target), `+${defGain}护甲`, 'passive-num', 300, 0);
    logParts.push(`<span class="log-passive">护甲+${defGain} ${skill.defUpAtkPct.turns}回合</span>`);
    recalcStats();
    updateFighterStats(target, getFighterElId(target));
    renderStatusIcons(target);
  }
  // DefUpPct buff (percentage-based)
  if (skill.defUpPct) {
    const val = Math.round(target.baseDef * skill.defUpPct.pct / 100);
    const existing = target.buffs.find(b => b.type === 'defUp');
    if (existing) { existing.value += val; existing.turns = Math.max(existing.turns, skill.defUpPct.turns); }
    else target.buffs.push({ type:'defUp', value:val, turns:skill.defUpPct.turns });
    spawnFloatingNum(getFighterElId(target), `+${val}护甲(${skill.defUpPct.pct}%)`, 'passive-num', 300, 0);
    logParts.push(`<span class="log-passive">护甲+${skill.defUpPct.pct}%(+${val}) ${skill.defUpPct.turns}回合</span>`);
    recalcStats();
    renderStatusIcons(target);
  }
  // MrUpPct buff (percentage-based)
  if (skill.mrUpPct) {
    const val = Math.round((target.baseMr || target.baseDef) * skill.mrUpPct.pct / 100);
    const existing = target.buffs.find(b => b.type === 'mrUp');
    if (existing) { existing.value += val; existing.turns = Math.max(existing.turns, skill.mrUpPct.turns); }
    else target.buffs.push({ type:'mrUp', value:val, turns:skill.mrUpPct.turns });
    spawnFloatingNum(getFighterElId(target), `+${val}魔抗`, 'passive-num', 400, 0);
    logParts.push(`<span class="log-passive">魔抗+${skill.mrUpPct.pct}%(+${val}) ${skill.mrUpPct.turns}回合</span>`);
    recalcStats();
    renderStatusIcons(target);
  }
  // SelfAtkUpPct (e.g. cyber turtle 增益)
  if (skill.selfAtkUpPct) {
    const atkGain = Math.round(caster.baseAtk * skill.selfAtkUpPct.pct / 100);
    caster.buffs.push({ type:'atkUp', value:atkGain, turns:skill.selfAtkUpPct.turns });
    recalcStats();
    spawnFloatingNum(getFighterElId(caster), `+${atkGain}攻`, 'passive-num', 300, 0);
    logParts.push(`<span class="log-passive">攻击+${atkGain}(${skill.selfAtkUpPct.pct}%) ${skill.selfAtkUpPct.turns}回合</span>`);
    renderStatusIcons(caster);
  }
  addLog(`${caster.emoji}${caster.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：${logParts.join(' ')}`);
  await sleep(1000);
}

async function doShield(caster, target, skill) {
  if (!target) target = caster;
  if (target._undeadLockTurns > 0) { await sleep(500); return; } // locked, no shield
  // Calculate shield amount: fixed + % of caster's maxHP + ATK scaling
  let amount = skill.shield || 0;
  if (skill.shieldFlat) amount += skill.shieldFlat;
  if (skill.shieldHpPct) amount += Math.round(caster.maxHp * skill.shieldHpPct / 100);
  if (skill.shieldAtkScale) amount += Math.round(caster.atk * skill.shieldAtkScale);
  amount = Math.round(amount * getShieldMult()); // 铁壁之日: ×2
  target.shield += amount;
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `+${amount}`, 'shield-num', 0, 0);
  // Heal HP% if specified
  let healStr = '';
  if (skill.healHpPct && caster.alive) {
    const heal = Math.round(caster.maxHp * skill.healHpPct / 100);
    const actual = applyHeal(caster, heal);
    if (actual > 0) {
      const fElId = getFighterElId(caster);
      spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 200, 0);
      updateHpBar(caster, fElId);
      healStr = ` <span class="log-heal">+${actual}HP</span>`;
    }
  }
  updateHpBar(target, tElId);
  addLog(`${caster.emoji}${caster.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-shield">+${amount}护盾</span>${healStr}`);
  await sleep(1000);
}


// ── ON-HIT EFFECTS (shared helper for all damage sources) ──
async function triggerOnHitEffects(attacker, target, dmg) {
  if (!target.alive || !attacker.alive || dmg <= 0) return;
  // Equipment: 雷鸣贝壳 — every 3rd skill hit (any skill, any source) triggers an AoE.
  // Hooked here so all skill paths (doDamage, AoE barrages, crystalBurst, etc.)
  // count uniformly without each handler having to call triggerThunderShell.
  triggerThunderShell(attacker);
  const tElId = getFighterElId(target);
  // TwoHead vitality — shield at 50%
  if (target.passive && target.passive.type === 'twoHeadVitality' && !target._twoHeadHalfTriggered && target.hp / target.maxHp < 0.5) {
    target._twoHeadHalfTriggered = true;
    const s = Math.round(target.maxHp * target.passive.shieldPct / 100);
    target.shield += s;
    spawnFloatingNum(tElId, `+${s}`, 'shield-num', 100, 0);
    updateHpBar(target, tElId);
  }
  // TwoHead Resilience — +1 DEF/MR per hit, cap 20
  if (target._resilienceDefGain !== undefined && target._resilienceDefGain < 20) {
    const gain = 1;
    if (target._resilienceDefGain < 20) { target._resilienceDefGain += gain; target.baseDef += gain; target.def += gain; }
    if (target._resilienceMrGain < 20) { target._resilienceMrGain += gain; target.baseMr += gain; target.mr += gain; }
    if ((target._resilienceDefGain + target._resilienceMrGain) % 5 === 0) {
      spawnFloatingNum(tElId, `+${target._resilienceDefGain}甲/${target._resilienceMrGain}抗`, 'passive-num', 200, 0);
    }
  }
  // ShieldOnHit
  if (target.passive && target.passive.type === 'shieldOnHit' && !target.passiveUsedThisTurn) {
    target.shield += target.passive.amount;
    target.passiveUsedThisTurn = true;
    spawnFloatingNum(tElId, `+${target.passive.amount}`, 'passive-num', 150, 0);
  }
  // BubbleStore (capped at 150% maxHp)
  if (target.passive && target.passive.type === 'bubbleStore') {
    const stored = Math.round(dmg * target.passive.pct / 100);
    const cap = Math.round(target.maxHp * 1.5);
    const before = target.bubbleStore || 0;
    target.bubbleStore = Math.min(cap, before + stored);
    const actual = target.bubbleStore - before;
    if (actual > 0) spawnFloatingNum(tElId, `+${actual}🫧`, 'bubble-num', 200, 0);
  }
  // BubbleBind — each hit reduces target's DEF and MR by perHitLoss, capped
  // at lossCap total per active bubbleBind instance (resets on re-bind).
  const bindBuff = target.buffs.find(b => b.type === 'bubbleBind');
  if (bindBuff && bindBuff.perHitLoss > 0 && target.alive && dmg > 0) {
    const cap = bindBuff.lossCap || 30;
    const used = bindBuff.lossUsed || 0;
    const loss = Math.min(bindBuff.perHitLoss, cap - used);
    if (loss > 0) {
      target.baseDef -= loss;
      target.def -= loss;
      target.baseMr -= loss;
      target.mr -= loss;
      bindBuff.lossUsed = used + loss;
      const tElId = getFighterElId(target);
      spawnFloatingNum(tElId, `-${loss}甲/抗`, 'debuff-num', 150, 14);
      updateFighterStats(target, tElId);
    }
  }
  // Crystallize stacking (crystal turtle passive)
  if (attacker.passive && attacker.passive.type === 'crystalResonance' && target.alive) {
    target._crystallize = (target._crystallize || 0) + 1;
    const maxStacks = attacker.passive.crystallizeMax || 4;
    const tElCryst = getFighterElId(target);
    if (target._crystallize >= maxStacks) {
      // Detonate! (Ornn-brittle style: no separate float or label — caller merges
      // the damage into the triggering hit's magic number, and a CSS burst effect
      // plays on the target for visual feedback.)
      target._crystallize = 0;
      const detonateDmg = Math.round(target.maxHp * attacker.passive.crystallizeHpPct / 100);
      const effMr = calcEffDef(attacker, target, 'magic');
      const finalDmg = Math.max(1, Math.round(detonateDmg * calcDmgMult(effMr)));
      applyRawDmg(attacker, target, finalDmg, false, true, 'magic');
      updateHpBar(target, tElCryst);
      // Apply MR shred
      const mrDownExist = target.buffs.find(b => b.type === 'mrDown');
      if (mrDownExist) { mrDownExist.value = Math.max(mrDownExist.value, attacker.passive.crystallizeMrDown); mrDownExist.turns = Math.max(mrDownExist.turns, attacker.passive.crystallizeMrTurns); }
      else target.buffs.push({type:'mrDown', value:attacker.passive.crystallizeMrDown, turns:attacker.passive.crystallizeMrTurns});
      // Stash dmg so the skill handler can merge into its own magic float
      target._pendingCrystalBoom = (target._pendingCrystalBoom || 0) + finalDmg;
      // Visual: purple burst pulse on the target (CSS class, auto-removes)
      const tEl = document.getElementById(tElCryst);
      if (tEl) {
        tEl.classList.remove('crystal-burst-fx');
        void tEl.offsetWidth;
        tEl.classList.add('crystal-burst-fx');
        setTimeout(() => tEl.classList.remove('crystal-burst-fx'), 600);
      }
      recalcStats();
      addLog(`${target.emoji}${target.name} 结晶引爆！<span class="log-magic">${finalDmg}魔法伤害</span> + ⬇️魔抗`);
    }
    renderStatusIcons(target);
  }
  // Trap
  const trapB = target.buffs.find(b => b.type === 'trap');
  if (trapB && attacker.alive) {
    const tDmg = Math.max(1, Math.round(trapB.value * calcDmgMult(attacker.def)));
    attacker.hp = Math.max(0, attacker.hp - tDmg);
    const aElId = getFighterElId(attacker);
    spawnFloatingNum(aElId, `-${tDmg}`, 'counter-dmg', 0, 0);
    spawnFloatingNum(aElId, '夹子!', 'crit-label', 0, -20);
    updateHpBar(attacker, aElId);
    try { sfxTrap(); } catch(e) {}
    if (attacker.hp <= 0) attacker.alive = false;
    target.buffs = target.buffs.filter(b => b !== trapB);
  }
  // StoneWall reflect
  if (target.passive && target.passive.type === 'stoneWall' && attacker.alive) {
    const reflectPct = target.passive.reflectBase + target.passive.reflectPerDef * target.def + (target.passive.reflectPerMr || 0) * (target.mr || target.def);
    const reflectDmg = Math.round(dmg * reflectPct / 100);
    if (reflectDmg > 0) {
      applyRawDmg(target, attacker, reflectDmg, false, false, undefined, true);
      spawnFloatingNum(getFighterElId(attacker), `-${reflectDmg}`, 'counter-dmg', 250, 0);
      updateHpBar(attacker, getFighterElId(attacker));
      if (attacker.hp <= 0) attacker.alive = false;
    }
  }
  // Buff-based reflect (e.g. hidingReflect skill)
  const reflectBuff = target.buffs ? target.buffs.find(b => b.type === 'reflect') : null;
  if (reflectBuff && attacker && attacker.alive && dmg > 0) {
    const reflDmg = Math.round(dmg * reflectBuff.value / 100);
    if (reflDmg > 0) {
      applyRawDmg(target, attacker, reflDmg, false, false, undefined, true);
      spawnFloatingNum(getFighterElId(attacker), `-${reflDmg}`, 'counter-dmg', 300, 0);
      updateHpBar(attacker, getFighterElId(attacker));
      if (attacker.hp <= 0) attacker.alive = false;
    }
  }
  // Dodge counter (e.g. starWarp) — handled in dodge check above, not here
  // Lava shield counter
  if (target._lavaShieldTurns > 0 && target._lavaShieldCounter > 0 && target.shield > 0 && attacker.alive) {
    const cDmg = Math.round(target.atk * target._lavaShieldCounter);
    applyRawDmg(target, attacker, cDmg, false, false, undefined, true);
    spawnFloatingNum(getFighterElId(attacker), `-${cDmg}`, 'counter-dmg', 300, 0);
    updateHpBar(attacker, getFighterElId(attacker));
    if (attacker.hp <= 0) attacker.alive = false;
  }
  // Counter buff (e.g. lightningShield): reflect damage only while shield > 0
  const counterBuff = target.buffs ? target.buffs.find(b => b.type === 'counter') : null;
  if (counterBuff && target.shield > 0 && attacker && attacker.alive && dmg > 0) {
    applyRawDmg(target, attacker, counterBuff.value, false, false, undefined, true);
    spawnFloatingNum(getFighterElId(attacker), `-${counterBuff.value}`, 'counter-dmg', 350, 0);
    updateHpBar(attacker, getFighterElId(attacker));
    if (attacker.hp <= 0) attacker.alive = false;
  }
  // Lightning shock stacks
  if (attacker.passive && attacker.passive.type === 'lightningStorm' && target.alive) {
    target._shockStacks = (target._shockStacks || 0) + 1;
    renderStatusIcons(target);
    if (target._shockStacks >= attacker.passive.stackMax) {
      spawnLightningStrike(tElId);
      const sDmg = Math.round(attacker.atk * attacker.passive.shockScale);
      applyRawDmg(attacker, target, sDmg, false, false, 'true');
      target._shockStacks = 0;
      spawnFloatingNum(tElId, `<img src="assets/passive/lightning-storm-icon.png" style="width:14px;height:14px;vertical-align:middle">${sDmg}`, 'pierce-dmg', 300, 0);
    }
  }
  // Lifesteal (equipment/passive-based + buff-based)
  let totalLifestealPct = attacker._lifestealPct || 0;
  const lifestealBuff = attacker.buffs ? attacker.buffs.find(b => b.type === 'lifesteal') : null;
  if (lifestealBuff) totalLifestealPct += lifestealBuff.value;
  if (totalLifestealPct > 0 && attacker.alive && dmg > 0) {
    const healAmt = Math.round(dmg * totalLifestealPct / 100);
    const actual = applyHeal(attacker, healAmt);
    if (actual > 0) {
      spawnFloatingNum(getFighterElId(attacker), `+${actual}`, 'passive-num', 300, 0);
      updateHpBar(attacker, getFighterElId(attacker));
    }
  }
  // AuraAwaken: energy store — target stores received damage as energy (capped at 150% maxHp)
  if (target.passive && target.passive.type === 'auraAwaken' && target.passive.energyStore && target.alive) {
    const cap = Math.round(target.maxHp * 1.5);
    target._storedEnergy = Math.min(cap, (target._storedEnergy || 0) + dmg);
    updateHpBar(target, tElId); // refresh energy bar in real-time
  }
  // AuraAwaken: lifesteal — attacker heals from damage dealt
  if (attacker._auraLifesteal > 0 && attacker.alive && dmg > 0) {
    const auraHeal = Math.round(dmg * attacker._auraLifesteal);
    const before = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + auraHeal);
    const actual = Math.round(attacker.hp - before);
    if (actual > 0) {
      spawnFloatingNum(getFighterElId(attacker), `+${actual}`, 'passive-num', 350, 0);
      updateHpBar(attacker, getFighterElId(attacker));
    }
  }
  // AuraAwaken: reflect — target reflects damage back to attacker
  if (target._auraReflect > 0 && target.alive && attacker.alive && dmg > 0) {
    const reflDmg = Math.round(dmg * target._auraReflect);
    if (reflDmg > 0) {
      applyRawDmg(target, attacker, reflDmg, false, false, undefined, true);
      spawnFloatingNum(getFighterElId(attacker), `-${reflDmg}`, 'counter-dmg', 400, 0);
      updateHpBar(attacker, getFighterElId(attacker));
      if (attacker.hp <= 0) attacker.alive = false;
    }
  }
  // Equipment: burn on hit
  if (attacker._equipBurn && target.alive && !((target.passive && target.passive.burnImmune) || target._burnImmune)) {
    const burnVal = Math.round(attacker.atk * 0.4);
    const existing = target.buffs.find(b => b.type === 'phoenixBurnDot');
    if (existing) { existing.turns = Math.max(existing.turns, 4); }
    else target.buffs.push({ type:'phoenixBurnDot', value:burnVal, hpPct:8, turns:4, sourceSide:attacker.side, sourceIdx:allFighters.indexOf(attacker), dmgType:'magic' });
  }
  // Equipment: stun chance
  if (attacker._equipStun && target.alive && Math.random() < attacker._equipStun / 100) {
    if (!target.buffs.find(b => b.type === 'stun')) {
      target.buffs.push({ type:'stun', turns:1 });
      target._stunUsed = false; // fresh stun: must reset so turn.js consumes it
      spawnFloatingNum(tElId, '❄️眩晕!', 'debuff-label', 400, -10);
    }
  }
  // Equipment: multi-hit chance
  if (attacker._equipMultiHit && target.alive && Math.random() < attacker._equipMultiHit / 100) {
    const extraDmg = Math.round(attacker.atk * 0.5);
    const eDef = calcEffDef(attacker, target);
    const finalDmg = Math.max(1, Math.round(extraDmg * calcDmgMult(eDef)));
    applyRawDmg(attacker, target, finalDmg, false, false, 'physical');
    spawnFloatingNum(tElId, `-${finalDmg}🐙`, 'direct-dmg', 200, 0, {atkSide:attacker.side, amount:finalDmg});
    updateHpBar(target, tElId);
  }
  // Equipment: reflect
  if (target._equipReflect && target.alive && attacker.alive && dmg > 0) {
    const reflDmg = Math.round(dmg * target._equipReflect / 100);
    if (reflDmg > 0) {
      applyRawDmg(target, attacker, reflDmg, false, false, undefined, true);
      spawnFloatingNum(getFighterElId(attacker), `-${reflDmg}`, 'counter-dmg', 300, 0);
      updateHpBar(attacker, getFighterElId(attacker));
      if (attacker.hp <= 0) attacker.alive = false;
    }
  }
  // Battle rule: 烈焰之日 — all hits apply burn
  if (typeof _battleRule !== 'undefined' && _battleRule && _battleRule.id === 'fire' && target.alive && attacker) {
    if (!((target.passive && target.passive.burnImmune) || target._burnImmune)) {
      const burnVal = Math.round(attacker.atk * 0.4);
      const existing = target.buffs.find(b => b.type === 'phoenixBurnDot');
      if (existing) { existing.turns = Math.max(existing.turns, 4); }
      else target.buffs.push({ type:'phoenixBurnDot', value:burnVal, hpPct:8, turns:4, sourceSide:attacker.side, sourceIdx:allFighters.indexOf(attacker), dmgType:'magic' });
    }
  }
}

// ── GAMBLER MULTI-HIT (shared helper) ─────────────────────
async function tryGamblerMultiHit(attacker, target, tElId) {
  if (!target.alive || !attacker.alive || !attacker.passive || attacker.passive.type !== 'gamblerMultiHit') return;
  let multiChance = attacker.passive.chance + (attacker._multiBonus || 0);
  while (target.alive && attacker.alive && Math.random() * 100 < multiChance) {
    const extraDmg = Math.round(attacker.atk * attacker.passive.dmgScale);
    const eDef = calcEffDef(attacker, target);
    const eFinal = Math.max(1, Math.round(extraDmg * calcDmgMult(eDef)));
    const {isCrit, critMult} = calcCrit(attacker);
    const critFinal = Math.max(1, Math.round(eFinal * critMult));
    applyRawDmg(attacker, target, critFinal, false, false, 'physical');
    if (!tElId) tElId = getFighterElId(target);
    const hitIcon = '<img src="assets/battle/gambler-hit-icon.png" style="width:16px;height:16px;vertical-align:middle">';
    const critIcon = isCrit ? '<img src="assets/stats/crit-icon.png" style="width:14px;height:14px;vertical-align:middle">' : '';
    spawnFloatingNum(tElId, `${hitIcon}${critIcon}-${critFinal}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, (_origMathRandom()-0.5)*30);
    updateHpBar(target, tElId);

    // All on-hit effects
    await triggerOnHitEffects(attacker, target, critFinal);

    const tEl = document.getElementById(tElId);
    if (tEl) { tEl.classList.add('hit-shake'); await sleep(400); tEl.classList.remove('hit-shake'); }
    else await sleep(400);
    await sleep(100);
    multiChance *= 0.8;
  }
}

// ── GAMBLER SKILLS ────────────────────────────────────────
async function doGamblerCards(attacker, target, skill) {
  // 3 hits, each random 0.3~0.6 ATK
  const tElId = getFighterElId(target);
  let totalDmg = 0;
  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) continue;
    const scale = skill.minScale + Math.random() * (skill.maxScale - skill.minScale);
    const baseDmg = Math.round(attacker.atk * scale);
    const eDef = calcEffDef(attacker, target);
    const dmg = Math.max(1, Math.round(baseDmg * calcDmgMult(eDef)));
    applyRawDmg(attacker, target, dmg);
    totalDmg += dmg;
    spawnFloatingNum(tElId, `-${dmg}`, 'direct-dmg', 0, 0);
    await triggerOnHitEffects(attacker, target, dmg);
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(700);
    if (tEl) tEl.classList.remove('hit-shake');
    await sleep(200);
    await tryGamblerMultiHit(attacker, target, tElId);
  }
  addLog(`${attacker.emoji}${attacker.name} <b>卡牌射击</b> → ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}物理</span>`);
}

// Helper: apply raw damage to target (through shields), track stats
// Returns { hpLoss, shieldAbs, bubbleAbs }
// Apply raw damage to target HP after buffs/shields/armor modifiers.
//
// Death handling:
//   - Default (deferDeath=false): if HP hits 0, immediately set alive=false.
//     Use this for DoT ticks, counters, reflect, self-damage, one-shot skills.
//   - deferDeath=true: flag _pendingDeath but keep alive=true, so the current
//     action can keep landing overkill hits on this target (Monster Sanctuary
//     style). The caller is responsible for running checkDeaths() at the end
//     of the action to finalize alive=false and play the death animation.
//     Use this ONLY inside multi-hit loops (doDamage, AoE barrages).
function applyRawDmg(source, target, amount, isPierce, _skipLink, dmgType, _noHurtAnim, deferDeath, _isInkBonus) {
  // physImmune: block all physical damage (ghost phantom state)
  if (dmgType === 'physical' && target.buffs && target.buffs.some(b => b.type === 'physImmune')) {
    spawnFloatingNum(getFighterElId(target), '免疫!', 'dodge-num', 0, 0);
    return { hpLoss:0, shieldAbs:0, bubbleAbs:0 };
  }
  // dmgReduce buff: percentage damage reduction
  const dmgReduceBuff = target.buffs ? target.buffs.find(b => b.type === 'dmgReduce') : null;
  if (dmgReduceBuff && amount > 0) {
    amount = Math.round(amount * (1 - dmgReduceBuff.value / 100));
  }
  // Ink mark passive: deferred — applied as a SEPARATE damage event after the
  // main hit lands (see end of this function). This way the ink bonus reads
  // as its own floating number (魔法 by default, 真实 if rapid passive),
  // and is properly mitigated by mr if magic.
  // Battle rule: 深海之日 — magic damage -20%
  if (dmgType === 'magic' && amount > 0) amount = Math.round(amount * getMagicDmgMult());
  // Equipment: flat damage reduction
  if (target._equipFlatReduce && amount > 0 && dmgType !== 'true') {
    amount = Math.max(1, amount - target._equipFlatReduce);
  }
  // Star equip: convert all damage to true
  if (source && hasChestEquip(source, 'star') && dmgType && dmgType !== 'true') dmgType = 'true';
  // Crystal resonance: extra magic damage reduction
  if (target.passive && target.passive.type === 'crystalResonance' && dmgType === 'magic') {
    amount = Math.round(amount * (1 - target.passive.magicAbsorb / 100));
  }
  // Undead lock: still takes damage normally but HP cannot go below 1 (won't die)
  if (target._undeadLockTurns > 0) {
    let rem2 = amount, shieldAbs2 = 0, bubbleAbs2 = 0;
    if (target.shield > 0) { shieldAbs2 = Math.min(target.shield, rem2); target.shield -= shieldAbs2; rem2 -= shieldAbs2; }
    const hpBefore = target.hp;
    target.hp = Math.max(1, target.hp - rem2); // can't go below 1
    const hpLoss2 = Math.round(hpBefore - target.hp);
    // Show "无法死亡" floating text when HP would have dropped to 0
    if (hpBefore - rem2 <= 0) {
      const tElId = getFighterElId(target);
      spawnFloatingNum(tElId, '<img src="assets/passive/undead-rage-icon.png" style="width:16px;height:16px;vertical-align:middle">无法死亡', 'crit-label', 0, -25);
    }
    if (source && source._dmgDealt !== undefined) {
      source._dmgDealt += amount;
      if (dmgType === 'magic') source._magicDmgDealt = (source._magicDmgDealt||0) + amount;
      else if (dmgType === 'true' || isPierce) source._trueDmgDealt = (source._trueDmgDealt||0) + amount;
      else source._physDmgDealt = (source._physDmgDealt||0) + amount;
    }
    if (target._dmgTaken !== undefined) {
      target._dmgTaken += amount;
      if (dmgType === 'magic') target._magicDmgTaken = (target._magicDmgTaken||0) + amount;
      else if (dmgType === 'true' || isPierce) target._trueDmgTaken = (target._trueDmgTaken||0) + amount;
      else target._physDmgTaken = (target._physDmgTaken||0) + amount;
    }
    updateDmgStats();
    _applyInkBonus(source, target, amount, _isInkBonus);
    return { hpLoss: hpLoss2, shieldAbs: shieldAbs2, bubbleAbs: bubbleAbs2 };
  }
  let rem = amount, bubbleAbs = 0, shieldAbs = 0;
  if (target.bubbleShieldVal > 0) { bubbleAbs = Math.min(target.bubbleShieldVal, rem); target.bubbleShieldVal -= bubbleAbs; rem -= bubbleAbs; }
  if (target.shield > 0 && rem > 0) { shieldAbs = Math.min(target.shield, rem); target.shield -= shieldAbs; rem -= shieldAbs; }
  target.hp = Math.max(0, target.hp - rem);
  // Undead passive: first death triggers lock — HP stays at 1 but still takes damage visually
  if (target.hp <= 0 && target.passive && target.passive.type === 'undeadRage' && !target._undeadLockUsed) {
    target._undeadLockUsed = true;
    target._undeadLockTurns = 2;
    target.hp = 1;
    target.alive = true;
    const elId = getFighterElId(target);
    spawnFloatingNum(elId, '<img src="assets/passive/undead-rage-icon.png" style="width:16px;height:16px;vertical-align:middle">亡灵之力!', 'crit-label', 0, -30);
    addLog(`${target.emoji}${target.name} <span class="log-passive"><img src="assets/passive/undead-rage-icon.png" style="width:16px;height:16px;vertical-align:middle">亡灵之力！锁血1HP 2回合！</span>`);
    renderStatusIcons(target);
  } else if (target.hp <= 0) {
    if (deferDeath) {
      // Inside a multi-hit loop: keep alive=true so later hits still land
      // (hurt anim, floating numbers). Caller must checkDeaths() after loop.
      target._pendingDeath = true;
    } else {
      // DoT / counter / reflect / one-shot: die immediately.
      target.alive = false;
    }
  }
  // Hunter mark execution: if target alive and HP below mark threshold, instant kill
  if (target.alive && target.hp > 0 && target.buffs) {
    const mark = target.buffs.find(b => b.type === 'hunterMark');
    if (mark && (target.hp / target.maxHp * 100) <= mark.value) {
      const execAmt = target.hp;
      target.hp = 0;
      if (deferDeath) target._pendingDeath = true; else target.alive = false;
      // Credit execute damage to hunter (mark source) and track target taken
      const hunter = typeof allFighters !== 'undefined' && mark.sourceIdx != null ? allFighters[mark.sourceIdx] : null;
      if (hunter && hunter._dmgDealt !== undefined) { hunter._dmgDealt += execAmt; hunter._trueDmgDealt = (hunter._trueDmgDealt||0) + execAmt; }
      if (target._dmgTaken !== undefined) { target._dmgTaken += execAmt; target._trueDmgTaken = (target._trueDmgTaken||0) + execAmt; }
      const tElId = getFighterElId(target);
      spawnFloatingNum(tElId, `🎯斩杀!`, 'crit-label', 0, -25);
      addLog(`${target.emoji}${target.name} <span class="log-passive">🎯猎杀印记触发！HP<${mark.value}% 被斩杀！</span>`);
    }
  }
  // Real-time tracking by damage type
  if (source && source._dmgDealt !== undefined) {
    source._dmgDealt += amount;
    if (dmgType === 'magic') source._magicDmgDealt = (source._magicDmgDealt||0) + amount;
    else if (dmgType === 'true' || isPierce) source._trueDmgDealt = (source._trueDmgDealt||0) + amount;
    else source._physDmgDealt = (source._physDmgDealt||0) + amount;
  }
  if (target._dmgTaken !== undefined) {
    target._dmgTaken += amount;
    if (dmgType === 'magic') target._magicDmgTaken = (target._magicDmgTaken||0) + amount;
    else if (dmgType === 'true' || isPierce) target._trueDmgTaken = (target._trueDmgTaken||0) + amount;
    else target._physDmgTaken = (target._physDmgTaken||0) + amount;
  }
  // Chest turtle: accumulate treasure value from damage dealt
  if (source && source.passive && source.passive.type === 'chestTreasure' && amount > 0) {
    source._chestTreasure = (source._chestTreasure || 0) + amount;
    checkChestEquipDraw(source);
    // Live-update the left-side pile indicator on every damage tick (not only at draws)
    const _pile = document.querySelector(`#${getFighterElId(source)} [data-chest-progress]`);
    if (_pile) {
      const _tier = source._chestTier || 0;
      const _ths = source.passive.thresholds;
      const _lvMult = 1 + ((source._level || 1) - 1) * 0.03;
      const _next = _tier < _ths.length ? Math.round(_ths[_tier] * _lvMult) : null;
      _pile.textContent = _next ? `${source._chestTreasure}/${_next}` : `${source._chestTreasure}(满)`;
    }
  }
  // Lava turtle: accumulate rage from damage dealt
  if (source && source.passive && source.passive.type === 'lavaRage' && !source._lavaSpent && !source._lavaTransformed && amount > 0) {
    source._lavaRage = Math.min(source.passive.rageMax, (source._lavaRage || 0) + Math.round(amount * source.passive.rageDmgPct / 100));
    renderStatusIcons(source);
    updateHpBar(source, getFighterElId(source)); // refresh rage bar
  }
  // Lava turtle: accumulate rage from damage taken
  if (target && target.passive && target.passive.type === 'lavaRage' && !target._lavaSpent && !target._lavaTransformed && amount > 0) {
    target._lavaRage = Math.min(target.passive.rageMax, (target._lavaRage || 0) + Math.round(amount * target.passive.rageTakenPct / 100));
    renderStatusIcons(target);
    updateHpBar(target, getFighterElId(target)); // refresh rage bar
  }
  updateDmgStats();
  // Ink link transfer: damage dealt to linked target transfers X% to partner.
  // Type follows _inkLink.dmgType (set when 连笔 is cast). Magic by default,
  // 真实 if line turtle has 速写/lineRapid passive.
  if (!_skipLink && target._inkLink && target._inkLink.partner && target._inkLink.partner.alive && amount > 0) {
    const transferAmt = Math.round(amount * target._inkLink.transferPct / 100);
    if (transferAmt > 0) {
      const partner = target._inkLink.partner;
      const linkType = target._inkLink.dmgType || 'magic';
      applyRawDmg(source, partner, transferAmt, false, true, linkType); // _skipLink=true to prevent infinite loop
      const pElId = getFighterElId(partner);
      const floatCls = linkType === 'true' ? 'pierce-dmg' : 'magic-dmg';
      spawnFloatingNum(pElId, `-${transferAmt}🔗`, floatCls, 0, 0);
      updateHpBar(partner, pElId);
    }
  }
  // Play hurt animation on actual HP loss from a direct hit (skip DoT/ink-link internal/counter)
  if (!_skipLink && !_noHurtAnim && rem > 0 && typeof playHurtAnimation === 'function') {
    playHurtAnimation(target);
  }
  _applyInkBonus(source, target, amount, _isInkBonus);
  return { hpLoss: rem, shieldAbs, bubbleAbs };
}

// Ink mark bonus: when a marked target takes any damage, deal extra
// magic (or 真实, if rapid passive) damage equal to amount × stacks × 5%.
// Recursion-guarded by _isInkBonus param so the bonus call doesn't loop.
function _applyInkBonus(source, target, originalAmount, _isInkBonus) {
  if (_isInkBonus) return;
  if (!target || !target.alive) return;
  const stacks = target._inkStacks || 0;
  if (stacks <= 0 || originalAmount <= 0) return;
  const bonusType = target._inkRapidActive ? 'true' : 'magic';
  let bonus = Math.round(originalAmount * stacks * 0.05);
  if (bonus <= 0) return;
  // For magic, mitigate by mr; for true, no further reduction.
  if (bonusType === 'magic') {
    const eMr = source ? calcEffDef(source, target, 'magic') : 0;
    bonus = Math.max(1, Math.round(bonus * calcDmgMult(eMr)));
  }
  applyRawDmg(source, target, bonus, false, true, bonusType, true, false, true);
  const tElId = getFighterElId(target);
  const cls = bonusType === 'true' ? 'pierce-dmg' : 'magic-dmg';
  spawnFloatingNum(tElId, `-${bonus}`, cls, 60, 24);
  updateHpBar(target, tElId);
}
