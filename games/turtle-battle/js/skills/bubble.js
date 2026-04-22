async function doBubbleShield(caster, target, skill) {
  const amount = Math.round(caster.atk * skill.atkScale);
  target.bubbleShieldVal = amount;
  target.bubbleShieldTurns = skill.duration;
  target.bubbleShieldOwner = caster;
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, `+${amount}<img src="assets/passive/bubble-store-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'bubble-num', 0, 0);
  updateHpBar(target, tElId);
  renderStatusIcons(target);
  addLog(`${caster.emoji}${caster.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-passive">泡泡盾+${amount}（${skill.duration}回合）</span>`);
  await sleep(1000);
}

// Bubble bind: target loses DEF/MR per hit received while bound (lv1-5: 1, lv6-10: 2).
async function doBubbleBind(caster, target, skill) {
  const lv = caster._level || 1;
  const perHitLoss = lv >= 6 ? 2 : 1;
  target.buffs = target.buffs.filter(b => b.type !== 'bubbleBind');
  target.buffs.push({ type:'bubbleBind', perHitLoss, turns: skill.duration });
  const tElId = getFighterElId(target);
  spawnFloatingNum(tElId, '<img src="assets/passive/bubble-store-icon.png" style="width:14px;height:14px;vertical-align:middle">束缚', 'bubble-num', 0, 0);
  renderStatusIcons(target);
  addLog(`${caster.emoji}${caster.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-passive">束缚${skill.duration}回合（每受一段伤害 护甲/魔抗各 -${perHitLoss}）</span>`);
  await sleep(1000);
}


// ── SHELL TURTLE SKILLS (龟壳) ──────────────────────────
