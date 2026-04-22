async function doFortuneDice(caster, skill) {
  const roll = 3 + Math.floor(Math.random() * 6); // 3~8
  caster._goldCoins += roll;
  const fElId = getFighterElId(caster);
  spawnFloatingNum(fElId, `<img src="assets/passive/gambler-blood-icon.png" style="width:16px;height:16px;vertical-align:middle">${roll} +${roll}<img src="assets/battle/gold-coin-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'passive-num', 0, 0);
  renderStatusIcons(caster);
  // Heal 10% max HP + 15% lost HP
  let healAmt = Math.round(caster.maxHp * skill.healPct / 100);
  if (skill.healLostPct) healAmt += Math.round((caster.maxHp - caster.hp) * skill.healLostPct / 100);
  const actual = applyHeal(caster, healAmt);
  if (actual > 0) spawnFloatingNum(fElId, `+${actual}`, 'heal-num', 300, 0);
  // Post-allIn bonus shield
  const allInUsed = caster.skills.some(s => s.type === 'fortuneAllIn' && s.cdLeft > 0);
  let shieldStr = '';
  if (allInUsed && skill.postAllInShieldPct) {
    const shieldAmt = Math.round(caster.maxHp * skill.postAllInShieldPct / 100);
    caster.shield += shieldAmt;
    spawnFloatingNum(fElId, `+${shieldAmt}`, 'shield-num', 400, 0);
    shieldStr = ` <span class="log-shield">+${shieldAmt}护盾</span>`;
  }
  updateHpBar(caster, fElId);
  addLog(`${caster.emoji}${caster.name} <b>骰子</b>：<img src="assets/passive/gambler-blood-icon.png" style="width:16px;height:16px;vertical-align:middle">${roll}！<span class="log-passive">+${roll}金币（共${caster._goldCoins}）</span> <span class="log-heal">+${actual}HP</span>${shieldStr}`);
  await sleep(1000);
}

async function doFortuneAllIn(attacker, target, skill) {
  const coins = attacker._goldCoins;
  if (coins <= 0) {
    addLog(`${attacker.emoji}${attacker.name} <b>梭哈</b>：没有金币！`);
    await sleep(700);
    return;
  }
  attacker._goldCoins = 0;
  const piercePer = Math.round(attacker.atk * skill.perCoinAtkPierce);
  const normalPer = Math.round(attacker.atk * skill.perCoinAtkNormal);
  const tElId = getFighterElId(target);
  let totalPierce = 0, totalNormal = 0;

  addLog(`${attacker.emoji}${attacker.name} <b>梭哈！</b> ${coins}枚金币全部投出！`);

  const perCoinDelay = Math.max(200, Math.round(600 / Math.sqrt(coins))); // 1币600ms, 4币300ms, 16币150ms
  for (let i = 0; i < coins; i++) {
    if (!target.alive) continue; // keep animating remaining hits
    // Physical portion (reduced by armor)
    const effectiveDef = calcEffDef(attacker, target, 'physical');
        const normalDmg = Math.max(1, Math.round(normalPer * calcDmgMult(effectiveDef)));
    applyRawDmg(attacker, target, normalDmg, false, false, 'physical');
    // True portion (ignores defense)
    applyRawDmg(attacker, target, piercePer, false, false, 'true');
    const totalHit = normalDmg + piercePer;
    totalPierce += piercePer;
    totalNormal += normalDmg;
    const yOff = 0;
    // Canonical stack: TRUE (white) on top — larger yOffset pushes higher on screen.
    spawnFloatingNum(tElId, `-${normalDmg}`, 'direct-dmg', 0, yOff, {atkSide: attacker.side, amount: normalDmg});
    spawnFloatingNum(tElId, `-${piercePer}`, 'true-dmg', 0, yOff + 22, {atkSide: attacker.side, amount: piercePer});
    const tEl = document.getElementById(tElId);
    if (tEl) tEl.classList.add('hit-shake');
    updateHpBar(target, tElId);
    await sleep(perCoinDelay);
    if (tEl) tEl.classList.remove('hit-shake');
  }
  updateHpBar(target, tElId);
  addLog(`→ ${target.emoji}${target.name}：<span class="log-direct">${totalNormal}物理</span> + <span class="log-pierce">${totalPierce}真实</span>（${coins}枚金币）`);
  await sleep(600);
}

// ── LIGHTNING SKILLS ───────────────────────────────────────
