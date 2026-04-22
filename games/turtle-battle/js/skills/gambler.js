async function doGamblerDraw(caster, target, skill) {
  const fElId = getFighterElId(caster);
  const tElId = target ? getFighterElId(target) : null;
  // 2 hits × 0.5 ATK = 1 ATK total physical
  const perHit = Math.round(caster.atk * (skill.atkScale || 0.5));
  if (target && target.alive) {
    for (let i = 0; i < 2; i++) {
      if (!target.alive) break;
      const eDef = calcEffDef(caster, target);
      const isCrit = Math.random() < caster.crit;
      const critMult = isCrit ? (1.5 + (caster._extraCritDmg || 0) + (caster._extraCritDmgPerm || 0)) : 1;
      const dmg = Math.max(1, Math.round(perHit * critMult * calcDmgMult(eDef)));
      applyRawDmg(caster, target, dmg, false, false, 'physical');
      spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', i * 180, 0, {atkSide: caster.side, amount: dmg});
      updateHpBar(target, tElId);
      await triggerOnHitEffects(caster, target, dmg);
      await sleep(220);
    }
  }
  // Self permanent shield
  const shieldAmt = Math.round(caster.atk * (skill.selfShieldAtkPct || 25) / 100);
  caster.shield += shieldAmt;
  spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 200, 0);
  // Self heal
  const healAmt = Math.round(caster.atk * (skill.selfHealAtkPct || 25) / 100);
  const before = caster.hp;
  caster.hp = Math.min(caster.maxHp, caster.hp + healAmt);
  const actualHeal = Math.round(caster.hp - before);
  if (actualHeal > 0) spawnFloatingNum(fElId, `+${actualHeal}`, 'heal-num', 350, 0);
  updateHpBar(caster, fElId);
  // Random debuff on target (1 of 8)
  let debuffLog = '';
  if (target && target.alive) {
    const pool = [
      { type:'atkDown', value:20, turns:3, label:'⬇20%攻击' },
      { type:'defDown', value:20, turns:3, label:'⬇20%护甲' },
      { type:'mrDown',  value:20, turns:3, label:'⬇20%魔抗' },
      { type:'healReduce', value:50, turns:3, label:'⬇50%治疗' },
      { type:'poison', value:Math.round(caster.atk * 0.15), turns:3, sourceSide: caster.side, label:'🟢中毒' },
      { type:'bleed',  value:Math.round(caster.atk * 0.15), turns:3, sourceSide: caster.side, label:'🩸流血' },
      { type:'phoenixBurnDot', value:Math.round(caster.atk * 0.15), hpPct:4, turns:3, sourceSide: caster.side, sourceIdx: allFighters.indexOf(caster), label:'🔥灼烧' },
      { type:'chilled', value:1, turns:2, label:'❄冰寒' },
    ];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const { label, ...buff } = pick;
    target.buffs.push(buff);
    debuffLog = label;
    spawnFloatingNum(tElId, label, 'debuff-label', 500, -14);
    renderStatusIcons(target);
  }
  recalcStats();
  renderStatusIcons(caster);
  updateFighterStats(caster, fElId);
  addLog(`${caster.emoji}${caster.name} <b>万能牌</b> → ${target ? (target.emoji + target.name) : ''}：<span class="log-direct">2段物理</span> <span class="log-shield">+${shieldAmt}护盾</span> <span class="log-heal">+${actualHeal}HP</span>${debuffLog ? ' <span class="log-debuff">' + debuffLog + '</span>' : ''}`);
  await sleep(600);
}

async function doGamblerBet(attacker, target, skill) {
  // Must have >40% HP
  if (attacker.hp / attacker.maxHp <= 0.4) {
    addLog(`${attacker.emoji}${attacker.name} <b>赌注</b>：HP不足40%，无法使用！`);
    await sleep(1000);
    return;
  }
  // Cost 40% HP directly (not through shield)
  const hpCost = Math.round(attacker.hp * skill.hpCostPct / 100);
  attacker.hp -= hpCost;
  const fElId = getFighterElId(attacker);
  spawnFloatingNum(fElId, `-${hpCost}HP`, 'direct-dmg', 0, 0);
  updateHpBar(attacker, fElId);
  addLog(`${attacker.emoji}${attacker.name} <b>赌注！</b>消耗 <span class="log-direct">${hpCost}HP</span>！`);
  await sleep(500);

  // Temporarily boost multi-hit chance by 20% (only for this skill)
  attacker._multiBonus = (attacker._multiBonus || 0) + skill.multiBonus;

  // 6 hits — consumed HP split equally as physical damage per hit
  const tElId = getFighterElId(target);
  const dmgPer = Math.round(hpCost / skill.hits);
  let totalDmg = 0;

  for (let i = 0; i < skill.hits; i++) {
    if (!target.alive) continue; // keep animating remaining hits
    const {isCrit, critMult} = calcCrit(attacker);
    const eDef = calcEffDef(attacker, target);
        const dmg = Math.max(1, Math.round(dmgPer * critMult * calcDmgMult(eDef)));
    applyRawDmg(attacker, target, dmg, false, false, 'physical');
    totalDmg += dmg;
    spawnFloatingNum(tElId, `-${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 0, 0, { atkSide: attacker.side, amount: dmg });
    const tEl = document.getElementById(tElId);
    tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await triggerOnHitEffects(attacker, target, dmg);
    await sleep(500);
    tEl.classList.remove('hit-shake');
    await sleep(100);
    // Multi-hit passive (boosted to 60% for this skill)
    await tryGamblerMultiHit(attacker, target, tElId);
  }
  addLog(`→ ${target.emoji}${target.name}：<span class="log-direct">${totalDmg}物理伤害</span>（消耗${hpCost}HP÷${skill.hits}段）`);

  // Remove temporary multi-hit bonus after this skill
  attacker._multiBonus = Math.max(0, (attacker._multiBonus || 0) - skill.multiBonus);
  await sleep(200);
}

// ── TWO-HEAD SKILLS (dual form) ───────────────────────────

// Magic wave: 4 hits alternating normal/pierce
