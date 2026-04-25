// ══════════════════════════════════════════════════════════
// action.js — Player action selection, executeAction, combos,
//             equipment pick, skill targeting
// Depends on: engine.js (globals), combat.js, turn.js, state.js
// ══════════════════════════════════════════════════════════

// ── COMBO SKILLS ─────────────────────────────────────────
// Combo skills temporarily disabled — return [] so AI / UI / auto-triggers
// all treat them as unavailable. Re-enable by removing this early return.
const _COMBO_SKILLS_DISABLED = true;

function getAvailableCombos(side) {
  if (_COMBO_SKILLS_DISABLED) return [];
  if (typeof COMBO_SKILLS === 'undefined') return [];
  const team = side === 'left' ? leftTeam : rightTeam;
  const aliveIds = team.filter(f => f.alive).map(f => f.id);
  return COMBO_SKILLS.filter((c, i) => c.ids.every(id => aliveIds.includes(id) && getPetLevel(id) >= 9) && !(_comboCdLeft[i] > 0));
}

async function executeCombo(combo, side) {
  const team = side === 'left' ? leftTeam : rightTeam;
  const enemies = side === 'left' ? rightTeam : leftTeam;
  const fighters = combo.ids.map(id => team.find(f => f.id === id && f.alive));
  if (fighters.some(f => !f)) return;

  // Mark both fighters as acted
  fighters.forEach(f => actedThisSide.add(allFighters.indexOf(f)));

  // Set combo CD
  const comboIdx = COMBO_SKILLS.indexOf(combo);
  if (comboIdx >= 0 && combo.cd) _comboCdLeft[comboIdx] = combo.cd;

  // Announce
  showSkillAnnounce(fighters[0], { name: combo.name });
  addLog(`<b style="color:#ffd93d">🤝 连携技！${fighters.map(f=>f.name).join(' + ')} → ${combo.name}！</b>`);
  await sleep(800);

  // Use higher ATK of the two
  const atkVal = Math.max(fighters[0].atk, fighters[1].atk);

  if (combo.aoeAlly && combo.shieldDefScale) {
    // Shield combo (stone+diamond)
    const defVal = Math.max(fighters[0].def, fighters[1].def);
    const shieldVal = Math.round(defVal * combo.shieldDefScale);
    for (const ally of team.filter(a => a.alive)) {
      ally.shield += shieldVal;
      spawnFloatingNum(getFighterElId(ally), `+${shieldVal}`, 'shield-label', 0, 0);
      updateHpBar(ally, getFighterElId(ally));
    }
    addLog(`${combo.icon} ${combo.name}：全队获得 ${shieldVal} 护盾`);
  } else if (combo.stealHpPct) {
    // Steal HP combo (candy+bubble)
    const aliveEnemies = enemies.filter(e => e.alive);
    for (const e of aliveEnemies) {
      const steal = Math.round(e.maxHp * combo.stealHpPct / 100);
      e.hp = Math.max(1, e.hp - steal);
      updateHpBar(e, getFighterElId(e));
      spawnFloatingNum(getFighterElId(e), `-${steal}`, 'direct-dmg', 0, 0);
      // Credit damage to all combo participants equally, mark target taken (true type)
      if (e._dmgTaken !== undefined) {
        e._dmgTaken += steal;
        e._trueDmgTaken = (e._trueDmgTaken || 0) + steal;
      }
      const credit = Math.round(steal / fighters.length);
      fighters.forEach(f => {
        if (f._dmgDealt !== undefined) {
          f._dmgDealt += credit;
          f._trueDmgDealt = (f._trueDmgDealt || 0) + credit;
        }
      });
    }
    const totalSteal = Math.round(aliveEnemies.reduce((s,e) => s + e.maxHp * combo.stealHpPct / 100, 0));
    fighters.forEach(f => { f.hp = Math.min(f.maxHp, f.hp + Math.round(totalSteal / 2)); updateHpBar(f, getFighterElId(f)); });
    addLog(`${combo.icon} ${combo.name}：偷取全体敌人HP！`);
  } else {
    // Damage combo
    const totalDmg = Math.round(atkVal * combo.atkScale);
    const targets = combo.aoe ? enemies.filter(e => e.alive) : [enemies.filter(e => e.alive).sort((a,b) => a.hp - b.hp)[0]];
    for (const t of targets) {
      if (!t || !t.alive) continue;
      const dmgType = combo.dmgType || 'magic';
      const finalDmg = applyRawDmg(fighters[0], t, totalDmg + (combo.hpPct ? Math.round(t.hp * combo.hpPct / 100) : 0), dmgType);
      spawnFloatingNum(getFighterElId(t), `-${finalDmg}`, dmgType === 'true' ? 'true-dmg' : dmgType === 'magic' ? 'magic-dmg' : 'direct-dmg', 0, 0, {atkSide:side, amount:finalDmg});
      if (combo.burn) t.buffs.push({ type:'phoenixBurnDot', turns:combo.burnTurns||3, atkScale:0.4, hpPct:0.08, source:fighters[0] });
      if (combo.stun) { t.buffs.push({ type:'stun', turns:1 }); t._stunUsed = false; }
      if (combo.mrDown) t.buffs.push({ type:'mrDown', value:combo.mrDown.pct, turns:combo.mrDown.turns });
      if (combo.shieldBreak) t.shield = 0;
      if (combo.dot) t.buffs.push({ type:'dot', dmg:combo.dot.dmg, turns:combo.dot.turns });
      updateHpBar(t, getFighterElId(t));
      checkDeaths();
    }
    addLog(`${combo.icon} ${combo.name}：造成 ${totalDmg} ${combo.dmgType === 'true' ? '真实' : '魔法'}伤害！`);
  }

  await sleep(600);
  if (checkBattleEnd()) return;
}

// ── EQUIPMENT PICK FUNCTIONS ─────────────────────────────
function triggerEquipPick() {
  if (_equipPickPending) return;
  _equipPickPending = true;
  // Pause battle, show equip pick UI
  const pool = EQUIP_POOL.sort(() => _origMathRandom() - 0.5).slice(0, 3);
  const overlay = document.createElement('div');
  overlay.id = 'equipPickOverlay';
  overlay.className = 'equip-pick-overlay';
  overlay.innerHTML = `
    <div class="equip-pick-box">
      <h3 style="color:#ffd93d;margin-bottom:12px">🎁 选择一件装备</h3>
      <div class="equip-pick-items">${pool.map((e, i) => `
        <div class="equip-pick-item" onclick="pickEquipItem(${i})">
          <div style="font-size:32px">${e.icon.endsWith('.png') ? `<img src="assets/${e.icon}" style="width:32px;height:32px">` : e.icon}</div>
          <div style="font-weight:700;font-size:14px">${e.name}</div>
          <div style="font-size:11px;color:var(--fg2)">${e.desc}</div>
        </div>
      `).join('')}</div>
      <div class="equip-pick-targets" id="equipPickTargets" style="display:none">
        <p style="color:var(--fg2);font-size:12px;margin-bottom:8px">装给谁？</p>
        <div id="equipTargetBtns"></div>
      </div>
    </div>
  `;
  overlay._pool = pool;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 50);
}

function pickEquipItem(idx) {
  const overlay = document.getElementById('equipPickOverlay');
  if (!overlay) return;
  overlay._selectedIdx = idx;
  // Highlight selected
  overlay.querySelectorAll('.equip-pick-item').forEach((el, i) => {
    el.classList.toggle('selected', i === idx);
  });
  // Show target selection
  const allies = leftTeam.filter(f => f.alive && (!f._equips || f._equips.length < 2));
  const targetsEl = document.getElementById('equipTargetBtns');
  targetsEl.innerHTML = allies.map(f => {
    const equipCount = f._equips ? f._equips.length : 0;
    return `<button class="btn btn-target" onclick="applyEquipToFighter(${allFighters.indexOf(f)})" style="margin:4px">
      ${f.emoji} ${f.name} (${equipCount}/2)
    </button>`;
  }).join('');
  document.getElementById('equipPickTargets').style.display = 'block';
}

function applyEquipToFighter(fIdx) {
  const overlay = document.getElementById('equipPickOverlay');
  if (!overlay) return;
  const equip = overlay._pool[overlay._selectedIdx];
  const f = allFighters[fIdx];
  if (!f || !equip) return;
  // Apply
  if (!f._equips) f._equips = [];
  f._equips.push(equip);
  equip.apply(f);
  recalcStats();
  updateFighterStats(f, getFighterElId(f));
  updateHpBar(f, getFighterElId(f));
  renderStatusIcons(f);
  const _eqIcon = equip.icon.endsWith('.png') ? `<img src="assets/${equip.icon}" style="width:14px;height:14px;vertical-align:middle">` : equip.icon;
  addLog(`${f.emoji}${f.name} 装备了 <span style="color:#ffd93d">${_eqIcon} ${equip.name}</span>：${equip.desc}`);
  spawnFloatingNum(getFighterElId(f), `${_eqIcon}${equip.name}`, 'crit-label', 0, -20);
  // Close overlay
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 300);
  _equipPickPending = false;
}

// ── SKILL PICKING & TARGET SELECTION ─────────────────────
function pickSkill(idx) {
  if (animating || battleOver) return; // prevent double-click
  try { sfxClick(); } catch(e) {}
  const f = currentActingFighter;
  if (!f) return;
  const skill = f.skills[idx];
  pendingSkillIdx = idx;
  const isAlly = skill.type === 'heal' || skill.type === 'shield' || skill.type === 'bubbleShield' || skill.type === 'angelBless' || skill.type === 'bubbleHeal' || skill.type === 'crystalResHeal' || skill.type === 'phoenixPurify' || skill.isAlly;

  // Self-cast: no target selection
  if (skill.selfCast || skill.type === 'fortuneDice' || skill.type === 'phoenixShield' || skill.type === 'gamblerDraw' || skill.type === 'hidingDefend' || skill.type === 'hidingCommand' || skill.type === 'cyberDeploy' || skill.type === 'cyberBuff' || skill.type === 'ghostPhase' || skill.type === 'diamondFortify' || skill.type === 'diceFate' || skill.type === 'chestOpen' || skill.type === 'chestCount' || skill.type === 'bambooHeal' || skill.type === 'iceShield' || skill.type === 'volcanoArmor' || skill.type === 'crystalBarrier' || skill.type === 'shellCopy' || (skill.type === 'twoHeadSwitch' && skill.switchTo === 'melee')) {
    executePlayerAction(f, skill, f);
    return;
  }
  // AOE / auto-target: no target selection needed
  // MechAttack: auto-target lowest HP enemy
  if (skill.type === 'mechAttack') {
    const enemies = (f.side==='left'?rightTeam:leftTeam).filter(e => e.alive);
    const target = enemies.sort((a,b) => a.hp - b.hp)[0];
    if (target) executePlayerAction(f, skill, target);
    return;
  }
  if (skill.aoe || skill.aoeAlly || skill.type === 'hunterBarrage' || skill.type === 'ninjaBomb' || skill.type === 'lightningBuff' || skill.type === 'lightningBarrage' || skill.type === 'iceFrost' || skill.type === 'basicBarrage' || skill.type === 'starMeteor' || skill.type === 'diceAllIn') {
    executePlayerAction(f, skill, null);
    return;
  }

  // bubbleBind targets enemies
  const targetsFromSide = (isAlly ? (f.side==='left'?leftTeam:rightTeam) : (f.side==='left'?rightTeam:leftTeam));
  let targets = targetsFromSide.filter(a => a.alive);
  // Taunt: if any enemy has taunt, forced to target them (single-target enemy skills only)
  if (!isAlly && !skill.ignoreRow) {
    const taunters = targets.filter(t => t.buffs.some(b => b.type === 'taunt'));
    if (taunters.length > 0) { targets = taunters; }
    else {
      // Front row priority
      const frontTargets = targets.filter(t => t._position === 'front');
      if (frontTargets.length > 0) targets = frontTargets;
    }
  }
  if (targets.length === 1) executePlayerAction(f, skill, targets[0]);
  else showTargetSelect(targets, f, skill);
}

function showTargetSelect(targets, srcFighter, skill) {
  // Hide action panel
  const panel = document.getElementById('actionPanel');
  if (panel) panel.classList.remove('show');

  // Determine if targeting allies or enemies
  const isAllyTarget = skill && (skill.isAlly || skill.aoeAlly);
  const targetClass = isAllyTarget ? 'targetable targetable-ally' : 'targetable';

  // Clear old highlights
  document.querySelectorAll('.scene-turtle.targetable,.scene-turtle.targetable-ally').forEach(el => {
    el.classList.remove('targetable', 'targetable-ally');
    el._targetClick = null;
  });

  // Highlight targetable turtles on scene + make clickable
  targets.forEach(t => {
    const el = document.getElementById(getFighterElId(t));
    if (!el) return;
    targetClass.split(' ').forEach(c => el.classList.add(c));
    const fi = allFighters.indexOf(t);
    el._targetClick = () => selectTarget(fi);
    el.onclick = el._targetClick;
  });

  // Show cancel hint
  const hint = document.getElementById('targetHint');
  if (hint) {
    hint.querySelector('.target-hint-text').textContent = isAllyTarget ? '🎯 点击发光的龟选择友方目标' : '🎯 点击发光的龟选择目标';
    hint.style.display = 'flex';
  }

  // Also keep bottom fallback for accessibility
  const box = document.getElementById('targetButtons');
  box.innerHTML = targets.map(t => {
    const hpPct = Math.round(t.hp/t.maxHp*100);
    return `<button class="btn btn-target" onclick="selectTarget(${allFighters.indexOf(t)})">
      ${t.emoji} ${t.name} (HP${hpPct}%)
    </button>`;
  }).join('');
  document.getElementById('targetSelect').style.display = 'flex';
}

async function useCombo(comboIdx) {
  if (animating || battleOver) return;
  const combo = COMBO_SKILLS[comboIdx];
  if (!combo) return;
  const f = currentActingFighter;
  if (!f) return;
  animating = true;
  clearTurnTimer();
  const panel = document.getElementById('actionPanel');
  if (panel) panel.classList.remove('show');
  await executeCombo(combo, f.side);
  animating = false;
  onActionComplete();
}

function selectTarget(fi) {
  if (animating || battleOver) return;
  const f = currentActingFighter;
  if (!f) return;
  const skill = f.skills[pendingSkillIdx];
  clearTargetHighlights();
  executePlayerAction(f, skill, allFighters[fi]);
}
function cancelTarget() {
  clearTargetHighlights();
  document.getElementById('targetSelect').style.display='none';
  pendingSkillIdx=null;
  const panel = document.getElementById('actionPanel');
  if (panel) panel.classList.add('show');
}
function clearTargetHighlights() {
  document.querySelectorAll('.scene-turtle.targetable,.scene-turtle.targetable-ally').forEach(el => {
    el.classList.remove('targetable', 'targetable-ally');
    // Restore normal click handler
    const f = allFighters.find(f => getFighterElId(f) === el.id);
    if (f) el.onclick = () => showFighterDetail(f);
  });
  const hint = document.getElementById('targetHint');
  if (hint) hint.style.display = 'none';
}

function executePlayerAction(f, skill, target) {
  clearTargetHighlights();
  document.getElementById('targetSelect').style.display = 'none';
  // Hide action panel immediately to prevent double-click
  const panel = document.getElementById('actionPanel');
  if (panel) panel.classList.remove('show');
  const battle = document.getElementById('screenBattle');
  if (battle) battle.classList.remove('action-visible');
  const action = { attackerId:allFighters.indexOf(f), skillIdx:f.skills.indexOf(skill), targetId: target ? allFighters.indexOf(target) : -1, aoe:!!skill.aoe };
  if (gameMode === 'pvp-online') {
    if (onlineSide === 'left') {
      // Host: execute locally, then send action + sync to guest
      executeAction(action);
    } else {
      // Guest: send pick to host, do NOT execute locally — wait for host
      sendOnline({ type:'pick', action });
    }
    return;
  }
  executeAction(action);
}

// ── ACTION EXECUTION ──────────────────────────────────────
async function executeAction(action) {
  if (battleOver) return;
  clearTurnTimer(); // player acted, stop countdown
  // Queue actions that arrive while animating (e.g. online opponent's action)
  if (animating) {
    _actionQueue.push(action);
    return;
  }
  animating = true;
  const f = allFighters[action.attackerId];
  if (!f) { console.error('executeAction: fighter not found', action); animating=false; return; }
  // Set currentActingFighter so floating numbers know attack direction (also for online guest)
  currentActingFighter = f;
  // Track this fighter as acted (needed for online: opponent actions come via network)
  actedThisSide.add(action.attackerId);
  if (allFighters[action.attackerId]._isBoss) _bossActionsThisRound++;
  const skill = f.skills[action.skillIdx];
  if (!skill) { console.error('executeAction: skill not found', action, 'fighter:', f.name, 'skills:', f.skills.length); animating=false; onActionComplete(); return; }

  if (skill.cd > 0) skill.cdLeft = skill.cd;

  // Stone taunt redirect: if attacking an enemy single-target, and that enemy's
  // team has a different ally with redirectAll buff active (stone turtle), swap
  // the target to the tank. Ally-target / self-cast / AoE skills bypass.
  if (action.targetId != null && action.targetId >= 0 && !skill.aoe && !skill.aoeAlly && !skill.selfCast && !skill.isAlly) {
    const origT = allFighters[action.targetId];
    if (origT && origT.side !== f.side && origT.alive) {
      const tTeam = origT.side === 'left' ? leftTeam : rightTeam;
      const tank = tTeam.find(t => t.alive && t !== origT && t.buffs && t.buffs.some(b => b.type === 'redirectAll' && b.turns > 0));
      if (tank) {
        action.targetId = allFighters.indexOf(tank);
        spawnFloatingNum(getFighterElId(tank), '🛡嘲讽!', 'crit-label', 0, -30);
        addLog(`${tank.emoji}${tank.name} 嘲讽：将攻击引向自己`);
      }
    }
  }

  // Lava rage: check transform before action
  await processLavaTransform();
  if (battleOver) { animating=false; return; }
  // Re-read skill in case transform changed skill set
  const updatedSkill = f.skills[action.skillIdx];
  if (updatedSkill && updatedSkill.type !== skill.type) {
    // Skill set changed due to transform, use new skill 0 (basic attack)
    action.skillIdx = 0;
  }

  // Skill announce banner
  showSkillAnnounce(f, f.skills[action.skillIdx]);
  await sleep(600);

  const atkEl = document.getElementById(getFighterElId(f));
  const _atkPet = typeof ALL_PETS !== 'undefined' ? ALL_PETS.find(p => p.id === f.id) : null;
  const _hasAttackAnim = !!(_atkPet && _atkPet.attackAnim);
  if (typeof playAttackAnimation === 'function') {
    playAttackAnimation(f);  // handles hop + sprite (if any)
  } else if (atkEl) {
    atkEl.classList.add('attack-anim');  // fallback short lunge
  }
  // Sync damage with attack sprite "strike frame" for turtles with attackAnim
  // Hop: 0-240 forward, 240-1040 sprite plays, 1040-1200 hop back
  // Strike happens around mid-sprite (t ≈ 500ms from start)
  if (_hasAttackAnim) await sleep(400);

  if (action.aoe && skill.type !== 'pirateCannonBarrage' && skill.type !== 'rainbowStorm' && skill.type !== 'chestStorm' && skill.type !== 'lavaQuake' && skill.type !== 'volcanoErupt' && skill.type !== 'candyBarrage' && skill.type !== 'soulReap' && skill.type !== 'crystalBurst' && skill.type !== 'starMeteor' && skill.type !== 'lineInkBomb' && skill.type !== 'candyBomb' && skill.type !== 'fortuneGoldRain' && skill.type !== 'lightningSurge' && skill.type !== 'stoneQuake' && skill.type !== 'volcanoStomp' && skill.type !== 'bambooSpikes' && skill.type !== 'headlessStorm' && skill.type !== 'shellAuraBurst' && skill.type !== 'starShieldBreak') {
    // AOE: hit all alive enemies (including summons)
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) {
      await doDamage(f, enemy, skill);
      if (battleOver) break;
    }
  } else if (skill.type === 'heal') {
    const target = allFighters[action.targetId];
    await doHeal(f, target, skill);
  } else if (skill.type === 'shield') {
    if (skill.aoeAlly) {
      // AOE ally shield
      const allies = (f.side==='left'?leftTeam:rightTeam).filter(a => a.alive);
      for (const ally of allies) await doShield(f, ally, skill);
    } else {
      const target = allFighters[action.targetId];
      await doShield(f, target, skill);
    }
  } else if (skill.type === 'bubbleShield') {
    const target = allFighters[action.targetId];
    await doBubbleShield(f, target, skill);
  } else if (skill.type === 'bubbleBind') {
    const target = allFighters[action.targetId];
    await doBubbleBind(f, target, skill);
  } else if (skill.type === 'hunterShot') {
    const target = allFighters[action.targetId];
    await doHunterShot(f, target, skill);
  } else if (skill.type === 'hunterBarrage') {
    await doHunterBarrage(f, skill);
  } else if (skill.type === 'hunterStealth') {
    const target = allFighters[action.targetId];
    await doHunterStealth(f, target, skill);
  } else if (skill.type === 'gamblerCards') {
    const target = allFighters[action.targetId];
    await doGamblerCards(f, target, skill);
  } else if (skill.type === 'gamblerDraw') {
    const target = allFighters[action.targetId];
    await doGamblerDraw(f, target, skill);
  } else if (skill.type === 'gamblerBet') {
    const target = allFighters[action.targetId];
    await doGamblerBet(f, target, skill);
  } else if (skill.type === 'hidingDefend') {
    await doHidingDefend(f, skill);
  } else if (skill.type === 'hidingCommand') {
    await doHidingCommand(f, skill);
  } else if (skill.type === 'turtleShieldBash') {
    const target = allFighters[action.targetId];
    await doTurtleShieldBash(f, target, skill);
  } else if (skill.type === 'basicBarrage') {
    await doBasicBarrage(f, skill);
  } else if (skill.type === 'iceSpike') {
    const target = allFighters[action.targetId];
    await doIceSpike(f, target, skill);
  } else if (skill.type === 'iceFrost') {
    await doIceFrost(f, skill);
  } else if (skill.type === 'angelBless') {
    const target = allFighters[action.targetId];
    await doAngelBless(f, target, skill);
  } else if (skill.type === 'angelEquality') {
    const target = allFighters[action.targetId];
    await doAngelEquality(f, target, skill);
  } else if (skill.type === 'twoHeadMagicWave') {
    const target = allFighters[action.targetId];
    await doTwoHeadMagicWave(f, target, skill);
  } else if (skill.type === 'twoHeadSwitch') {
    const target = allFighters[action.targetId];
    await doTwoHeadSwitch(f, target, skill);
  } else if (skill.type === 'twoHeadHammer') {
    const target = allFighters[action.targetId];
    await doTwoHeadHammer(f, target, skill);
  } else if (skill.type === 'twoHeadAbsorb') {
    const target = allFighters[action.targetId];
    await doTwoHeadAbsorb(f, target, skill);
  } else if (skill.type === 'twoHeadFear') {
    const target = allFighters[action.targetId];
    await doTwoHeadFear(f, target, skill);
  } else if (skill.type === 'twoHeadSteal') {
    const target = allFighters[action.targetId];
    await doTwoHeadSteal(f, target, skill);
  } else if (skill.type === 'fortuneDice') {
    await doFortuneDice(f, skill);
  } else if (skill.type === 'fortuneAllIn') {
    const target = allFighters[action.targetId];
    await doFortuneAllIn(f, target, skill);
  } else if (skill.type === 'lightningStrike') {
    const target = allFighters[action.targetId];
    await doLightningStrike(f, target, skill);
  } else if (skill.type === 'lightningBuff') {
    await doLightningBuff(f, skill);
  } else if (skill.type === 'lightningBarrage') {
    await doLightningBarrage(f, skill);
  } else if (skill.type === 'starBeam') {
    const target = allFighters[action.targetId];
    await doStarBeam(f, target, skill);
  } else if (skill.type === 'starWormhole') {
    const target = allFighters[action.targetId];
    await doStarWormhole(f, target, skill);
  } else if (skill.type === 'starMeteor') {
    await doStarMeteor(f, skill);
  } else if (skill.type === 'ghostTouch') {
    const target = allFighters[action.targetId];
    await doGhostTouch(f, target, skill);
  } else if (skill.type === 'ghostPhase') {
    await doGhostPhase(f, skill);
  } else if (skill.type === 'ghostStorm') {
    const target = allFighters[action.targetId];
    await doGhostStorm(f, target, skill);
  } else if (skill.type === 'lineSketch') {
    const target = allFighters[action.targetId];
    await doLineSketch(f, target, skill);
  } else if (skill.type === 'lineLink') {
    const target = allFighters[action.targetId];
    await doLineLink(f, target, skill);
  } else if (skill.type === 'lineFinish') {
    const target = allFighters[action.targetId];
    await doLineFinish(f, target, skill);
  } else if (skill.type === 'cyberBuff') {
    // Self ATK buff
    if (skill.selfAtkUpPct) {
      const atkGain = Math.round(f.baseAtk * skill.selfAtkUpPct.pct / 100);
      f.buffs.push({ type:'atkUp', value:atkGain, turns:skill.selfAtkUpPct.turns });
      recalcStats();
      const elId = getFighterElId(f);
      spawnFloatingNum(elId, `+${atkGain}攻`, 'passive-num', 0, 0);
      renderStatusIcons(f);
      updateFighterStats(f, elId);
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-passive">自身攻击+${atkGain}(${skill.selfAtkUpPct.pct}%) ${skill.selfAtkUpPct.turns}回合</span>`);
    }
    await sleep(800);
  } else if (skill.type === 'cyberDeploy') {
    await doCyberDeploy(f, skill);
  } else if (skill.type === 'crystalSpike') {
    const target = allFighters[action.targetId];
    await doCrystalSpike(f, target, skill);
  } else if (skill.type === 'crystalBarrier') {
    await doCrystalBarrier(f, skill);
  } else if (skill.type === 'crystalBurst') {
    await doCrystalBurst(f, skill);
  } else if (skill.type === 'soulReap') {
    await doSoulReap(f, skill);
  } else if (skill.type === 'candyBarrage') {
    await doCandyBarrage(f, skill);
  } else if (skill.type === 'candyBomb') {
    // AOE 3-hit + armor pen
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) {
      for (let h = 0; h < (skill.hits||3); h++) {
        const dmg = Math.round(f.atk * (skill.atkScale||0.35));
        applyRawDmg(f, enemy, dmg, false, false, 'physical');
        spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', h * 60, 0, {atkSide:f.side, amount:dmg});
        if (battleOver) break;
      }
      updateHpBar(enemy, getFighterElId(enemy));
      await triggerOnHitEffects(f, enemy, Math.round(f.atk * (skill.atkScale||0.35) * (skill.hits||3)));
      if (battleOver) break;
    }
    // Temp armor pen
    if (skill.armorPen) { f.armorPen += skill.armorPen; }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：全体${skill.hits||3}段物理伤害`);
    await sleep(400);
  } else if (skill.type === 'iceFreeze') {
    // Single target magic damage + guaranteed stun
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const dmg = Math.round(f.atk * (skill.atkScale||0.6));
      applyRawDmg(f, target, dmg, false, false, 'magic');
      spawnFloatingNum(getFighterElId(target), `-${dmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:dmg});
      updateHpBar(target, getFighterElId(target));
      // Guaranteed stun
      if (target.alive) {
        target.buffs.push({ type:'stun', value:1, turns:1 });
        target._stunUsed = false; // fresh stun: must reset so turn.js consumes it
        spawnFloatingNum(getFighterElId(target), `<img src="assets/status/stun-icon.png" style="width:14px;height:14px;vertical-align:middle">眩晕`, 'debuff-num', 200, 0);
        renderStatusIcons(target);
        addLog(`${target.emoji}${target.name} 被冰封眩晕！`);
      }
      await triggerOnHitEffects(f, target, dmg);
    }
    await sleep(400);
  } else if (skill.type === 'lavaSplash') {
    // Single target damage + burn
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      await doDamage(f, target, skill);
      if (target.alive) {
        applySkillDebuffs({ burn: true }, target, f);
        renderStatusIcons(target);
      }
    }
  } else if (skill.type === 'twoHeadMindBlast') {
    // Magic damage + heal reduce + shield break
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      await doDamage(f, target, skill);
      // Shield break 50%
      if (target.shield > 0) {
        const broken = Math.round(target.shield * (skill.shieldBreakPct||50) / 100);
        target.shield -= broken;
        const tElId = getFighterElId(target);
        spawnFloatingNum(tElId, `-${broken}🛡️`, 'shield-dmg', 0, 0);
        updateHpBar(target, tElId);
        addLog(`${target.emoji}${target.name} 护盾被破坏 ${broken}！`);
      }
      // Heal reduce
      if (target.alive) {
        target.buffs.push({ type:'healReduce', value:skill.healReducePct||50, turns:(skill.healReduceTurns||3) + 1 });
        spawnFloatingNum(getFighterElId(target), '☠️治疗削减', 'debuff-label', 200, -10);
        renderStatusIcons(target);
        addLog(`${target.emoji}${target.name} 治疗效果 -${skill.healReducePct||50}%，${skill.healReduceTurns||3}回合`);
      }
    }
    await sleep(400);
  } else if (skill.type === 'lavaBolt') {
    const target = allFighters[action.targetId];
    await doLavaBolt(f, target, skill);
  } else if (skill.type === 'lavaQuake') {
    await doLavaQuake(f, skill);
  } else if (skill.type === 'lavaSurge') {
    const target = allFighters[action.targetId];
    await doLavaSurge(f, target, skill);
  } else if (skill.type === 'volcanoSmash') {
    const target = allFighters[action.targetId];
    await doVolcanoSmash(f, target, skill);
  } else if (skill.type === 'volcanoArmor') {
    await doVolcanoArmor(f, skill);
  } else if (skill.type === 'volcanoErupt') {
    await doVolcanoErupt(f, skill);
  } else if (skill.type === 'chestSmash') {
    const target = allFighters[action.targetId];
    await doChestSmash(f, target, skill);
  } else if (skill.type === 'chestCount') {
    await doChestCount(f, skill);
  } else if (skill.type === 'chestStorm') {
    await doChestStorm(f, skill);
  } else if (skill.type === 'pirateCannonBarrage') {
    await doPirateCannonBarrage(f, skill);
  } else if (skill.type === 'rainbowStorm') {
    await doRainbowStorm(f, skill);
  } else if (skill.type === 'phoenixBurn') {
    const target = allFighters[action.targetId];
    await doPhoenixBurn(f, target, skill);
  } else if (skill.type === 'phoenixShield') {
    await doPhoenixShield(f, skill);
  } else if (skill.type === 'phoenixScald') {
    const target = allFighters[action.targetId];
    await doPhoenixScald(f, target, skill);
  } else if (skill.type === 'ninjaShuriken') {
    const target = allFighters[action.targetId];
    await doNinjaShuriken(f, target, skill);
  } else if (skill.type === 'ninjaImpact') {
    const target = allFighters[action.targetId];
    await doNinjaImpact(f, target, skill);
  } else if (skill.type === 'ninjaBomb') {
    await doNinjaBomb(f, skill);
  } else if (skill.type === 'iceShield') {
    await doIceShield(f, skill);
  } else if (skill.type === 'bambooLeaf') {
    const target = allFighters[action.targetId];
    await doBambooLeaf(f, target, skill);
  } else if (skill.type === 'bambooHeal') {
    await doBambooHeal(f, skill);
  } else if (skill.type === 'diamondFortify') {
    await doDiamondFortify(f, skill);
  } else if (skill.type === 'diamondCollide') {
    const target = allFighters[action.targetId];
    await doDiamondCollide(f, target, skill);
  } else if (skill.type === 'diceAttack') {
    const target = allFighters[action.targetId];
    await doDiceAttack(f, target, skill);
  } else if (skill.type === 'diceAllIn') {
    await doDiceAllIn(f, skill);
  } else if (skill.type === 'diceFate') {
    await doDiceFate(f, skill);
  } else if (skill.type === 'diceFlashStrike') {
    await doDiceFlashStrike(f, skill);
  } else if (skill.type === 'chestOpen') {
    await doChestOpen(f, skill);
  } else if (skill.type === 'mechAttack') {
    const target = allFighters[action.targetId];
    await doDamage(f, target, skill);
  } else if (skill.type === 'shellStrike') {
    const target = allFighters[action.targetId];
    await doShellStrike(f, target, skill);
  } else if (skill.type === 'shellCopy') {
    await doShellCopy(f, skill);
  } else if (skill.type === 'basicSlam') {
    const target = allFighters[action.targetId];
    await doBasicSlam(f, target, skill);
  } else if (skill.type === 'ninjaBackstab') {
    // 背刺: +穿甲 then 3 hits
    const target = allFighters[action.targetId];
    if (skill.armorPenBuff) {
      f.armorPen += skill.armorPenBuff;
      spawnFloatingNum(getFighterElId(f), `+${skill.armorPenBuff}穿甲`, 'passive-num', 0, -20);
      addLog(`${f.emoji}${f.name} 获得 +${skill.armorPenBuff} 穿甲`);
    }
    await doDamage(f, target, skill);
    // Remove temp armor pen after
    if (skill.armorPenBuff) f.armorPen -= skill.armorPenBuff;

  // ═══════════════════════════════════════════════════
  // NEW SKILL HANDLERS (batch implementation)
  // ═══════════════════════════════════════════════════

  // ── AOE Ally Heals ──
  } else if (skill.type === 'bambooAoeHeal' || skill.type === 'rainbowHeal' || skill.type === 'fortuneBless') {
    const allies = (f.side==='left'?leftTeam:rightTeam).filter(a => a.alive);
    for (const ally of allies) {
      const healAmt = Math.round(f.atk * (skill.healAtkPct||0) / 100) + Math.round(f.maxHp * (skill.healHpPct||0) / 100);
      const actual = applyHeal(ally, healAmt);
      const elId = getFighterElId(ally);
      if (actual > 0) { spawnFloatingNum(elId, `+${actual}`, 'heal-num', 0, 0); updateHpBar(ally, elId); }
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${ally.emoji}${ally.name}：<span class="log-heal">回复${actual}HP</span>`);
    }
    await sleep(800);
  } else if (skill.type === 'bubbleHeal') {
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const healAmt = Math.round(f.atk * (skill.healAtkPct||0) / 100) + Math.round(f.maxHp * (skill.healHpPct||0) / 100);
      const actual = applyHeal(target, healAmt);
      const elId = getFighterElId(target);
      if (actual > 0) { spawnFloatingNum(elId, `+${actual}`, 'heal-num', 0, 0); updateHpBar(target, elId); }
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-heal">回复${actual}HP</span>`);

    }
    await sleep(800);
  } else if (skill.type === 'crystalResHeal') {
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const healAmt = Math.round(f.mr * (skill.healMrScale||0)) + Math.round(f.atk * (skill.healAtkPct||0) / 100);
      const actual = applyHeal(target, healAmt);
      const elId = getFighterElId(target);
      if (actual > 0) { spawnFloatingNum(elId, `+${actual}`, 'heal-num', 0, 0); updateHpBar(target, elId); }
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-heal">回复${actual}HP</span>`);

    }
    await sleep(800);
  } else if (skill.type === 'phoenixPurify') {
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const debuffTypes = ['atkDown','defDown','mrDown','healReduce','poison','bleed','burn','cursed','chilled','spdDown'];
      const removed = target.buffs.filter(b => debuffTypes.includes(b.type));
      target.buffs = target.buffs.filter(b => !debuffTypes.includes(b.type));
      recalcStats();
      const healAmt = Math.round(target.maxHp * 0.10 * removed.length);
      let actual = 0;
      if (healAmt > 0) {
        actual = applyHeal(target, healAmt);
        const elId = getFighterElId(target);
        if (actual > 0) { spawnFloatingNum(elId, `+${actual}`, 'heal-num', 0, 0); updateHpBar(target, elId); }
      }
      const elId = getFighterElId(target);
      if (removed.length > 0) spawnFloatingNum(elId, `净化×${removed.length}`, 'passive-num', 200, 0);
      renderStatusIcons(target); updateFighterStats(target, elId);
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-heal">净化${removed.length}个减益，回复${actual}HP</span>`);

    }
    await sleep(800);
  } else if (skill.type === 'headlessRegen') {
    const lostHp = f.maxHp - f.hp;
    const healAmt = Math.round(lostHp * (skill.healLostPct||25) / 100);
    const actual = applyHeal(f, healAmt);
    const elId = getFighterElId(f);
    if (actual > 0) { spawnFloatingNum(elId, `+${actual}`, 'heal-num', 0, 0); updateHpBar(f, elId); }
    if (skill.lifestealUp) {
      f.buffs.push({ type:'lifesteal', value:skill.lifestealUp.pct, turns:skill.lifestealUp.turns });
      spawnFloatingNum(elId, `+${skill.lifestealUp.pct}%吸血`, 'passive-num', 200, 0);
      renderStatusIcons(f);
    }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-heal">回复${actual}HP</span>${skill.lifestealUp ? ` <span class="log-passive">+${skill.lifestealUp.pct}%吸血 ${skill.lifestealUp.turns}回合</span>` : ''}`);
    await sleep(800);
  } else if (skill.type === 'commonTeamShield') {
    const allies = (f.side==='left'?leftTeam:rightTeam).filter(a => a.alive);
    for (const ally of allies) {
      const amount = Math.round(Math.round(f.atk * (skill.shieldScale||0.5)) * getShieldMult());
      ally.shield += amount;
      const elId = getFighterElId(ally);
      spawnFloatingNum(elId, `+${amount}`, 'shield-num', 0, 0); updateHpBar(ally, elId);
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${ally.emoji}${ally.name}：<span class="log-shield">+${amount}护盾</span>`);
    }
    await sleep(800);
  } else if (skill.type === 'rainbowBarrier') {
    const allies = (f.side==='left'?leftTeam:rightTeam).filter(a => a.alive);
    for (const ally of allies) {
      const amount = Math.round(Math.round(f.atk * (skill.shieldAtkScale||0.8)) * getShieldMult());
      ally.shield += amount;
      const elId = getFighterElId(ally);
      spawnFloatingNum(elId, `+${amount}`, 'shield-num', 0, 0); updateHpBar(ally, elId);
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${ally.emoji}${ally.name}：<span class="log-shield">+${amount}护盾</span>`);
    }
    await sleep(800);
  } else if (skill.type === 'cyberFirewall') {
    const allies = (f.side==='left'?leftTeam:rightTeam).filter(a => a.alive);
    for (const ally of allies) {
      const amount = Math.round(Math.round(f.atk * (skill.shieldAtkScale||0.6)) * getShieldMult());
      ally.shield += amount;
      const elId = getFighterElId(ally);
      spawnFloatingNum(elId, `+${amount}`, 'shield-num', 0, 0); updateHpBar(ally, elId);
      if (skill.dmgReduction) { ally.buffs.push({ type:'dmgReduce', value:skill.dmgReduction.pct, turns:skill.dmgReduction.turns }); spawnFloatingNum(elId, `-${skill.dmgReduction.pct}%受伤`, 'passive-num', 200, 0); }
      renderStatusIcons(ally);
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${ally.emoji}${ally.name}：<span class="log-shield">+${amount}护盾</span> <span class="log-passive">-${skill.dmgReduction?.pct||15}%受伤 ${skill.dmgReduction?.turns||3}回合</span>`);
    }
    await sleep(800);
  } else if (skill.type === 'starShield') {
    const amount = Math.round(Math.round(f._starEnergy * (skill.shieldEnergyPct||80) / 100) * getShieldMult());
    f.shield += amount; const elId = getFighterElId(f);
    spawnFloatingNum(elId, `+${amount}`, 'shield-num', 0, 0); updateHpBar(f, elId);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-shield">星能转化+${amount}护盾</span>`);
    await sleep(800);
  } else if (skill.type === 'starShieldBreak') {
    const enemies = getAliveEnemiesWithSummons(f.side); let totalBroken = 0;
    for (const enemy of enemies) {
      if (enemy.shield > 0) { const broken = Math.round(enemy.shield * (skill.shieldBreakPct||50) / 100); enemy.shield -= broken; totalBroken += broken; const eElId = getFighterElId(enemy); spawnFloatingNum(eElId, `-${broken}`, 'shield-dmg', 0, 0); updateHpBar(enemy, eElId); }
      if (enemy.bubbleShieldVal > 0) { const broken = Math.round(enemy.bubbleShieldVal * (skill.shieldBreakPct||50) / 100); enemy.bubbleShieldVal -= broken; totalBroken += broken; }
    }
    const energyGain = Math.round(f.atk * (skill.energyGainAtkScale||1.0));
    if (f.passive && f.passive.type === 'starEnergy') { const maxE = Math.round(f.maxHp * f.passive.maxChargePct / 100); f._starEnergy = Math.min(maxE, (f._starEnergy||0) + energyGain); }
    const elId = getFighterElId(f); spawnFloatingNum(elId, `+${energyGain}⭐`, 'passive-num', 0, 0); updateHpBar(f, elId); renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：破坏全体护盾${totalBroken}，获取${energyGain}星能`);
    await sleep(800);
  } else if (skill.type === 'shellEnergyShield') {
    const amount = Math.round(Math.round(f._storedEnergy * (skill.energyShieldScale||1.5)) * getShieldMult());
    f.shield += amount; const elId = getFighterElId(f);
    spawnFloatingNum(elId, `+${amount}`, 'shield-num', 0, 0); updateHpBar(f, elId);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-shield">储能转化+${amount}护盾</span>`);
    await sleep(800);
  } else if (skill.type === 'lightningShield') {
    const amount = Math.round(Math.round(f.atk * (skill.shieldScale||0.9)) * getShieldMult());
    f.shield += amount; const elId = getFighterElId(f);
    spawnFloatingNum(elId, `+${amount}`, 'shield-num', 0, 0); updateHpBar(f, elId);
    if (skill.counterScale) { f.buffs.push({ type:'counter', value:Math.round(f.atk * skill.counterScale), turns:3 }); spawnFloatingNum(elId, `反击`, 'passive-num', 200, 0); }
    renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-shield">+${amount}护盾</span> <span class="log-passive">反击${Math.round(f.atk*(skill.counterScale||0.1))}</span>`);
    await sleep(800);
  } else if (skill.type === 'commonAtkBuff') {
    const allies = (f.side==='left'?leftTeam:rightTeam).filter(a => a.alive);
    for (const ally of allies) { const atkGain = Math.round(ally.baseAtk * (skill.atkUpPct||15) / 100); ally.buffs.push({ type:'atkUp', value:atkGain, turns:skill.atkUpTurns||3 }); const elId = getFighterElId(ally); spawnFloatingNum(elId, `+${atkGain}攻`, 'passive-num', 0, 0); renderStatusIcons(ally); updateFighterStats(ally, elId); }
    recalcStats();
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-passive">全体攻击+${skill.atkUpPct||15}% ${skill.atkUpTurns||3}回合</span>`);
    sfxBuff(); await sleep(800);
  } else if (skill.type === 'basicChiWave') {
    const target = allFighters[action.targetId];
    await doBasicChiWave(f, target, skill);
  } else if (skill.type === 'pirateFlag') {
    const pct = typeof skill.atkUpPct === 'object' ? skill.atkUpPct.pct : (skill.atkUpPct||25);
    const turns = typeof skill.atkUpPct === 'object' ? skill.atkUpPct.turns : 3;
    const allies = (f.side==='left'?leftTeam:rightTeam).filter(a => a.alive);
    for (const ally of allies) { const atkGain = Math.round(ally.baseAtk * pct / 100); ally.buffs.push({ type:'atkUp', value:atkGain, turns }); const elId = getFighterElId(ally); spawnFloatingNum(elId, `+${atkGain}攻`, 'passive-num', 0, 0); renderStatusIcons(ally); updateFighterStats(ally, elId); }
    recalcStats();
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-passive">全体攻击+${pct}% ${turns}回合</span>`);
    sfxBuff(); await sleep(800);
  } else if (skill.type === 'stoneTaunt') {
    // Redirect all single-target enemy attacks/debuffs from allies to stone turtle.
    const turns = skill.redirectTurns || 3;
    f.buffs = f.buffs.filter(b => b.type !== 'redirectAll');
    f.buffs.push({ type:'redirectAll', turns });
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `🛡嘲讽!`, 'crit-label', 0, -20);
    spawnFloatingNum(elId, `转移${turns}回合`, 'passive-num', 200, 0);
    renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-passive">嘲讽 ${turns} 回合，敌方对我方的单体伤害与效果全部转移到自身</span>`);
    try { sfxBuff(); } catch(e) {}
    await sleep(800);
  } else if (skill.type === 'ghostPhantom') {
    f.buffs.push({ type:'physImmune', value:1, turns:skill.phantomTurns||2 });
    f._phantomStrike = { turns:skill.phantomTurns||2, hits:skill.hits||2, atkScale:skill.atkScale||0.6 };
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `虚化!`, 'passive-num', 0, 0); spawnFloatingNum(elId, `免疫物理${skill.phantomTurns||2}回合`, 'passive-num', 200, 0);
    renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：进入虚化状态${skill.phantomTurns||2}回合，免疫物理伤害`);
    sfxDodge(); await sleep(800);
  } else if (skill.type === 'ghostShadow') {
    f.buffs.push({ type:'dodge', value:skill.dodgePct||80, turns:skill.dodgeTurns||2 });
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `闪避${skill.dodgePct||80}%`, 'passive-num', 0, 0);
    renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-passive">闪避${skill.dodgePct||80}% ${skill.dodgeTurns||2}回合</span>`);
    sfxDodge(); await sleep(800);
  } else if (skill.type === 'starWarp') {
    f.buffs.push({ type:'dodge', value:skill.dodgePct||60, turns:skill.dodgeTurns||2 });
    if (skill.counterScale) f.buffs.push({ type:'dodgeCounter', value:Math.round(f.atk * skill.counterScale), turns:skill.dodgeTurns||2, dmgType:skill.counterDmgType||'magic' });
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `闪避${skill.dodgePct||60}%`, 'passive-num', 0, 0);
    if (skill.counterScale) spawnFloatingNum(elId, `闪避反击`, 'passive-num', 200, 0);
    renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-passive">闪避${skill.dodgePct||60}% ${skill.dodgeTurns||2}回合</span>${skill.counterScale ? ` <span class="log-passive">闪避时反击${Math.round(f.atk*skill.counterScale)}</span>` : ''}`);
    sfxDodge(); await sleep(800);
  } else if (skill.type === 'hidingReflect') {
    const shieldAmt = Math.round(Math.round(f.maxHp * (skill.shieldHpPct||15) / 100) * getShieldMult());
    f.shield += shieldAmt; f.buffs.push({ type:'reflect', value:skill.reflectPct||40, turns:skill.reflectTurns||3 });
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `+${shieldAmt}`, 'shield-num', 0, 0); spawnFloatingNum(elId, `反弹${skill.reflectPct||40}%`, 'passive-num', 200, 0);
    updateHpBar(f, elId); renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-shield">+${shieldAmt}护盾</span> <span class="log-passive">反弹${skill.reflectPct||40}% ${skill.reflectTurns||3}回合</span>`);
    await sleep(800);
  } else if (skill.type === 'gamblerCheat') {
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      await doDamage(f, target, skill);
      const stealable = target.buffs.filter(b => ['atkUp','defUp','mrUp','critUp','shield','dodge','lifesteal'].includes(b.type));
      if (stealable.length > 0) {
        const stolen = stealable[Math.floor(Math.random() * stealable.length)];
        target.buffs = target.buffs.filter(b => b !== stolen); f.buffs.push({ ...stolen }); recalcStats();
        const tElId = getFighterElId(target); const fElId = getFighterElId(f);
        spawnFloatingNum(tElId, `被偷取`, 'debuff-num', 0, 0); spawnFloatingNum(fElId, `偷取成功`, 'passive-num', 0, 0);
        renderStatusIcons(target); renderStatusIcons(f); updateFighterStats(target, tElId); updateFighterStats(f, fElId);
        addLog(`${f.emoji}${f.name} 偷取了 ${target.emoji}${target.name} 的增益效果！`);
      }
    }
  } else if (skill.type === 'gamblerAllIn') {
    const selfDmg = Math.round(f.hp * (skill.selfDmgPct||30) / 100);
    f.hp -= selfDmg; if (f.hp < 1) f.hp = 1;
    const fElId = getFighterElId(f);
    spawnFloatingNum(fElId, `-${selfDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side==='left'?'right':'left', amount:selfDmg}); updateHpBar(f, fElId);
    addLog(`${f.emoji}${f.name} 消耗 ${selfDmg}HP！`);
    const origCrit = f.crit; if (skill.critBonus) f.crit += skill.critBonus / 100;
    const target = allFighters[action.targetId]; await doDamage(f, target, skill); f.crit = origCrit;
  } else if (skill.type === 'hunterSnipe') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { const origCrit = f.crit; if (skill.execThresh && (target.hp / target.maxHp * 100) <= skill.execThresh) { f.crit = 1.0; } await doDamage(f, target, skill); f.crit = origCrit; }
  } else if (skill.type === 'hunterPoison') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { await doDamage(f, target, skill); if (skill.dot) { target.buffs.push({ type:'poison', value:skill.dot.dmg, turns:skill.dot.turns }); const tElId = getFighterElId(target); spawnFloatingNum(tElId, `中毒`, 'debuff-num', 200, 0); renderStatusIcons(target); addLog(`${target.emoji}${target.name} 中毒 ${skill.dot.turns}回合（每回合${skill.dot.dmg}伤害）`); }
      if (skill.healReduce) { target.buffs.push({ type:'healReduce', value:50, turns:skill.dot?.turns||3 }); addLog(`${target.emoji}${target.name} 治疗效果 -50%`); } }
  } else if (skill.type === 'fortuneGoldRain') {
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) { for (let h = 0; h < (skill.hits||8); h++) { const dmg = Math.round(f.atk * (skill.atkScale||0.12)); applyRawDmg(f, enemy, dmg, false, false, 'magic'); spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', h * 60, 0, {atkSide:f.side, amount:dmg}); if (skill.coinGain) f._goldCoins += skill.coinGain; if (battleOver) break; } updateHpBar(enemy, getFighterElId(enemy)); await triggerOnHitEffects(f, enemy, Math.round(f.atk * (skill.atkScale||0.12) * (skill.hits||8))); if (battleOver) break; }
    if (f._goldCoins > 0) { spawnFloatingNum(getFighterElId(f), `+${(skill.coinGain||2)*(skill.hits||8)}💰`, 'passive-num', 0, -20); }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：对全体敌方${skill.hits||8}段魔法伤害，获得${(skill.coinGain||2)*(skill.hits||8)}金币`); await sleep(400);
  } else if (skill.type === 'crystalDetonate') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { const stacks = target._crystallize || 0; const baseDmg = Math.round(f.atk * (skill.atkScale||0.5)); const stackDmg = Math.round(f.atk * (skill.perStackScale||0.6) * stacks); const totalDmg = baseDmg + stackDmg; applyRawDmg(f, target, totalDmg, false, false, 'magic'); const tElId = getFighterElId(target); spawnFloatingNum(tElId, `-${totalDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:totalDmg}); updateHpBar(target, tElId); if (stacks > 0) spawnFloatingNum(tElId, `引爆${stacks}层`, 'debuff-num', 200, 0); if (skill.consumeStacks) target._crystallize = 0; renderStatusIcons(target); addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：引爆${stacks}层结晶，造成 ${totalDmg} 魔法伤害`); await triggerOnHitEffects(f, target, totalDmg); } await sleep(400);
  } else if (skill.type === 'bubbleBurst') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { const consumed = Math.round(f.bubbleStore * (skill.bubbleConsumePct||60) / 100); f.bubbleStore -= consumed; updateHpBar(f, getFighterElId(f)); applyRawDmg(f, target, consumed, false, false, 'magic'); const tElId = getFighterElId(target); spawnFloatingNum(tElId, `-${consumed}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:consumed}); updateHpBar(target, tElId); addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：消耗${consumed}泡泡值，造成 ${consumed} 魔法伤害`); await triggerOnHitEffects(f, target, consumed); } await sleep(400);
  } else if (skill.type === 'shellAuraBurst') {
    const enemies = getAliveEnemiesWithSummons(f.side); const baseDmg = Math.round(f.atk * (skill.atkScale||0.5)); const energyDmg = Math.round(f._storedEnergy * (skill.energyDmgScale||1.2)); const totalDmg = baseDmg + energyDmg;
    for (const enemy of enemies) { applyRawDmg(f, enemy, totalDmg, false, false, 'physical'); spawnFloatingNum(getFighterElId(enemy), `-${totalDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:totalDmg}); updateHpBar(enemy, getFighterElId(enemy)); await triggerOnHitEffects(f, enemy, totalDmg); if (battleOver) break; }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：消耗${f._storedEnergy}储能，对全体造成 ${totalDmg} 物理伤害`);
    f._storedEnergy = 0; updateHpBar(f, getFighterElId(f)); await sleep(400);
  } else if (skill.type === 'piratePlunder') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { if (skill.shieldBreakPct && target.shield > 0) { const broken = Math.round(target.shield * skill.shieldBreakPct / 100); target.shield -= broken; spawnFloatingNum(getFighterElId(target), `-${broken}`, 'shield-dmg', 0, 0); updateHpBar(target, getFighterElId(target)); addLog(`${f.emoji}${f.name} 破坏 ${target.emoji}${target.name} ${broken}护盾！`); } if (skill.shieldBreakPct && target.bubbleShieldVal > 0) { const broken = Math.round(target.bubbleShieldVal * skill.shieldBreakPct / 100); target.bubbleShieldVal -= broken; } await doDamage(f, target, skill); const defSteal = Math.round(target.baseDef * (skill.stealDefPct||20) / 100); if (defSteal > 0) { target.buffs.push({ type:'defDown', value:defSteal, turns:skill.stealDefTurns||3 }); f.buffs.push({ type:'defUp', value:defSteal, turns:skill.stealDefTurns||3 }); recalcStats(); const tElId = getFighterElId(target); const fElId = getFighterElId(f); spawnFloatingNum(tElId, `-${defSteal}护甲`, 'debuff-num', 200, 0); spawnFloatingNum(fElId, `+${defSteal}护甲`, 'passive-num', 200, 0); renderStatusIcons(target); renderStatusIcons(f); updateFighterStats(target, tElId); updateFighterStats(f, fElId); addLog(`${f.emoji}${f.name} 偷取 ${target.emoji}${target.name} ${defSteal}护甲！`); } }
  } else if (skill.type === 'candyTrap') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { await doDamage(f, target, skill); if (skill.atkDown) { const atkLoss = Math.round(target.baseAtk * skill.atkDown.pct / 100); target.buffs.push({ type:'atkDown', value:atkLoss, turns:skill.atkDown.turns }); spawnFloatingNum(getFighterElId(target), `-${atkLoss}攻`, 'debuff-num', 200, 0); } if (skill.defDown) { const defLoss = Math.round(target.baseDef * skill.defDown.pct / 100); target.buffs.push({ type:'defDown', value:defLoss, turns:skill.defDown.turns }); spawnFloatingNum(getFighterElId(target), `-${defLoss}甲`, 'debuff-num', 300, 0); } recalcStats(); renderStatusIcons(target); updateFighterStats(target, getFighterElId(target)); }
  } else if (skill.type === 'lineInkBomb') {
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) { for (let h = 0; h < (skill.hits||3); h++) { const dmg = Math.round(f.atk * (skill.atkScale||0.3)); applyRawDmg(f, enemy, dmg, false, false, 'physical'); spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', h * 60, 0, {atkSide:f.side, amount:dmg}); if (battleOver) break; } updateHpBar(enemy, getFighterElId(enemy)); if (skill.inkStacks) { enemy._inkStacks = (enemy._inkStacks||0) + skill.inkStacks; const maxInk = (f._passiveSkills && f._passiveSkills.some(p => p.type === 'lineRapid')) ? 7 : 5; enemy._inkStacks = Math.min(enemy._inkStacks, maxInk); renderStatusIcons(enemy); } await triggerOnHitEffects(f, enemy, Math.round(f.atk * (skill.atkScale||0.3) * (skill.hits||3))); if (battleOver) break; }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：对全体${skill.hits||3}段物理伤害，叠加${skill.inkStacks||2}层墨迹`); await sleep(400);
  } else if (skill.type === 'lightningSurge') {
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) { const stacks = enemy._shockStacks || 0; if (stacks > 0) { const dmg = Math.round(f.atk * (skill.shockPerStackScale||0.10) * stacks); applyRawDmg(f, enemy, dmg, false, false, 'true'); spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:dmg}); updateHpBar(enemy, getFighterElId(enemy)); addLog(`${f.emoji}${f.name} 感电 ${enemy.emoji}${enemy.name}：${stacks}层电击 → ${dmg} 真实伤害`); enemy._shockStacks = 0; renderStatusIcons(enemy); await triggerOnHitEffects(f, enemy, dmg); if (battleOver) break; } }
    await sleep(400);
  } else if (skill.type === 'angelSmite') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { const rarityOrder = ['D','C','B','A','S']; const targetRarityIdx = rarityOrder.indexOf(target.rarity); const threshIdx = rarityOrder.indexOf(skill.convertTrueBelow || 'A'); const dmgType = (targetRarityIdx >= 0 && targetRarityIdx <= threshIdx) ? 'true' : (skill.dmgType || 'physical'); const baseDmg = Math.round(f.atk * (skill.atkScale||1.0)); const hpDmg = Math.round(target.maxHp * (skill.hpPct||8) / 100); const totalDmg = baseDmg + hpDmg; applyRawDmg(f, target, totalDmg, false, false, dmgType); spawnFloatingNum(getFighterElId(target), `-${totalDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:totalDmg}); updateHpBar(target, getFighterElId(target)); if (dmgType === 'true') spawnFloatingNum(getFighterElId(target), `神罚`, 'debuff-num', 200, 0); addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：${totalDmg} ${dmgType==='true'?'真实':'物理'}伤害`); await triggerOnHitEffects(f, target, totalDmg); } await sleep(400);
  } else if (skill.type === 'headlessStorm') {
    const origLifesteal = f._lifestealPct || 0; f._lifestealPct = origLifesteal + (skill.tempLifesteal||22);
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) { for (let h = 0; h < (skill.hits||3); h++) { const dmg = Math.round(f.atk * (skill.atkScale||0.5)); applyRawDmg(f, enemy, dmg, false, false, 'physical'); spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', h * 60, 0, {atkSide:f.side, amount:dmg}); if (battleOver) break; } updateHpBar(enemy, getFighterElId(enemy)); await triggerOnHitEffects(f, enemy, Math.round(f.atk * (skill.atkScale||0.5) * (skill.hits||3))); if (battleOver) break; }
    f._lifestealPct = origLifesteal;
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：+${skill.tempLifesteal||22}%吸血，对全体3段共${Math.round(f.atk*(skill.atkScale||0.5)*(skill.hits||3))}物理伤害`); await sleep(400);
  } else if (skill.type === 'headlessSoulStrike') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { const baseDmg = Math.round(f.atk * (skill.atkScale||1.5)); const hpDmg = Math.round(target.hp * (skill.targetCurrentHpPct||25) / 100); const totalDmg = baseDmg + hpDmg; applyRawDmg(f, target, totalDmg, false, false, 'magic'); spawnFloatingNum(getFighterElId(target), `-${totalDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:totalDmg}); updateHpBar(target, getFighterElId(target)); addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：${baseDmg}+${hpDmg}(25%当前HP) = ${totalDmg} 魔法伤害`); await triggerOnHitEffects(f, target, totalDmg); } await sleep(400);
  } else if (skill.type === 'stoneShield') {
    const shieldAmt = Math.round(Math.round(f.maxHp * (skill.shieldHpPct||20) / 100) * getShieldMult());
    f.shield += shieldAmt; const elId = getFighterElId(f);
    spawnFloatingNum(elId, `+${shieldAmt}`, 'shield-num', 0, 0); updateHpBar(f, elId);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：<span class="log-shield">+${shieldAmt}护盾</span>`);
    await sleep(800);
  } else if (skill.type === 'bambooSmack') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { await doDamage(f, target, skill); if (skill.chilled) { target.buffs.push({ type:'chilled', value:1, turns:skill.chilled }); spawnFloatingNum(getFighterElId(target), `❄️冰寒`, 'debuff-num', 200, 0); recalcStats(); renderStatusIcons(target); addLog(`${target.emoji}${target.name} 被冰寒${skill.chilled}回合！`); }
      if (skill.knockToFront && target._position === 'back' && target.alive) { const enemyTeam = target.side === 'left' ? leftTeam : rightTeam; const frontCount = enemyTeam.filter(t => t.alive && t._position === 'front').length; if (frontCount < 3) { target._position = 'front'; const usedSlots = enemyTeam.filter(t => t.alive && t !== target).map(t => t._slotKey); const frontSlots = ['front-0','front-1','front-2']; const emptyFront = frontSlots.find(s => !usedSlots.includes(s)); if (emptyFront) target._slotKey = emptyFront; const tEl = document.getElementById(getFighterElId(target)); if (tEl) { const scene = document.getElementById('battleScene'); const posSet = window.innerWidth <= 768 ? BATTLE_POSITIONS.mobile : BATTLE_POSITIONS.desktop; const newPos = posSet[target._slotKey]; if (scene && newPos) { const cw = scene.offsetWidth, ch = scene.offsetHeight; const side = target.side; const imgX = side === 'left' ? newPos.x : 100 - newPos.x; const mapped = mapCoverPos(imgX, newPos.y, cw, ch); const leftPct = mapped.px / cw * 100; const bottomPct = (1 - mapped.py / ch) * 100; tEl.style.transition = 'left 0.4s ease, bottom 0.4s ease'; tEl.style.left = leftPct + '%'; tEl.style.bottom = bottomPct + '%'; requestAnimationFrame(() => { tEl.style.marginLeft = (-tEl.offsetWidth / 2) + 'px'; }); setTimeout(() => { tEl.style.transition = ''; }, 500); } } spawnFloatingNum(getFighterElId(target), `击至前排!`, 'passive-num', 300, 0); addLog(`${target.emoji}${target.name} 被击至前排！`); } } }
  } else if (skill.type === 'stoneQuake') {
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) { const dmg = Math.round(f.atk * (skill.atkScale||0.4)) + Math.round(f.def * (skill.defScale||0.8)); applyRawDmg(f, enemy, dmg, false, false, 'magic'); spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:dmg}); updateHpBar(enemy, getFighterElId(enemy)); if (skill.stunChance && Math.random() * 100 < skill.stunChance) { enemy.buffs.push({ type:'stun', value:1, turns:1 }); enemy._stunUsed = false; spawnFloatingNum(getFighterElId(enemy), `眩晕`, 'debuff-num', 200, 0); renderStatusIcons(enemy); addLog(`${enemy.emoji}${enemy.name} 被眩晕！`); } await triggerOnHitEffects(f, enemy, dmg); if (battleOver) break; }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：对全体造成魔法伤害`); await sleep(400);
  } else if (skill.type === 'volcanoStomp') {
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) { const dmg = Math.round(f.atk * (skill.atkScale||0.8)); applyRawDmg(f, enemy, dmg, false, false, 'magic'); spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:dmg}); updateHpBar(enemy, getFighterElId(enemy)); if (skill.stunChance && Math.random() * 100 < skill.stunChance) { enemy.buffs.push({ type:'stun', value:1, turns:1 }); enemy._stunUsed = false; spawnFloatingNum(getFighterElId(enemy), `眩晕`, 'debuff-num', 200, 0); renderStatusIcons(enemy); addLog(`${enemy.emoji}${enemy.name} 被眩晕！`); } await triggerOnHitEffects(f, enemy, dmg); if (battleOver) break; }
    if (skill.healLostPct) { const lostHp = f.maxHp - f.hp; const heal = Math.round(lostHp * skill.healLostPct / 100); const actual = applyHeal(f, heal); if (actual > 0) { spawnFloatingNum(getFighterElId(f), `+${actual}`, 'heal-num', 0, 0); updateHpBar(f, getFighterElId(f)); } }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：对全体造成魔法伤害`); await sleep(400);
  } else if (skill.type === 'bambooSpikes') {
    const enemies = getAliveEnemiesWithSummons(f.side);
    for (const enemy of enemies) { for (let h = 0; h < (skill.hits||5); h++) { const dmg = Math.round(f.atk * (skill.atkScale||0.18)) + Math.round(f.maxHp * (skill.selfHpPct||3) / 100); applyRawDmg(f, enemy, dmg, false, false, 'physical'); spawnFloatingNum(getFighterElId(enemy), `-${dmg}`, 'direct-dmg', h * 60, 0, {atkSide:f.side, amount:dmg}); if (battleOver) break; } updateHpBar(enemy, getFighterElId(enemy)); await triggerOnHitEffects(f, enemy, (Math.round(f.atk * (skill.atkScale||0.18)) + Math.round(f.maxHp * (skill.selfHpPct||3) / 100)) * (skill.hits||5)); if (battleOver) break; }
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：对全体${skill.hits||5}段物理伤害`); await sleep(400);
  } else if (skill.type === 'hidingStrike') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { const dmg = Math.round(f.atk * (skill.atkScale||2.2)) + Math.round(f.def * (skill.defScale||0.5)); applyRawDmg(f, target, dmg, false, false, 'physical'); spawnFloatingNum(getFighterElId(target), `-${dmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:dmg}); updateHpBar(target, getFighterElId(target)); addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：${dmg} 物理伤害`); await triggerOnHitEffects(f, target, dmg); } await sleep(400);
  } else if (skill.type === 'diceDeathBet') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { const baseDmg = Math.round(f.atk * (skill.atkScale||0.5)); const lostHp = f.maxHp - f.hp; const lostHpBonus = Math.round(lostHp * (skill.lostHpBonusPct||200) / 100); const totalDmg = baseDmg + lostHpBonus; applyRawDmg(f, target, totalDmg, false, false, 'physical'); spawnFloatingNum(getFighterElId(target), `-${totalDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:totalDmg}); updateHpBar(target, getFighterElId(target)); addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：${totalDmg} 物理伤害（+${lostHpBonus}已损生命加成）`); await triggerOnHitEffects(f, target, totalDmg); } await sleep(400);
  } else if (skill.type === 'diceLuckyCrit') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { const baseDmg = Math.round(f.atk * (skill.atkScale||1.0)); const critRange = skill.randomCritMult || {min:150,max:350}; const critMult = (critRange.min + Math.random() * (critRange.max - critRange.min)) / 100; const totalDmg = Math.round(baseDmg * critMult); applyRawDmg(f, target, totalDmg, false, false, 'physical'); spawnFloatingNum(getFighterElId(target), `-${totalDmg}`, 'crit-dmg', 0, 0, {atkSide:f.side, amount:totalDmg}); updateHpBar(target, getFighterElId(target)); spawnFloatingNum(getFighterElId(target), `暴击×${Math.round(critMult*100)}%`, 'passive-num', 200, 0); addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：暴击×${Math.round(critMult*100)}% = ${totalDmg} 物理伤害`); sfxCrit(); await triggerOnHitEffects(f, target, totalDmg); } await sleep(400);
  } else if (skill.type === 'diamondSmash') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { const dmg = Math.round(f.def * (skill.defScale||1.0)) + Math.round(f.mr * (skill.mrScale||1.0)) + Math.round(f.atk * (skill.atkScale||0.1)); applyRawDmg(f, target, dmg, false, false, 'physical'); spawnFloatingNum(getFighterElId(target), `-${dmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:dmg}); updateHpBar(target, getFighterElId(target)); if (skill.bleedTurns) { target.buffs.push({ type:'bleed', value:skill.bleedValue||12, turns:skill.bleedTurns, sourceSide:f.side }); spawnFloatingNum(getFighterElId(target), `🩸流血`, 'debuff-num', 200, 0); renderStatusIcons(target); addLog(`${target.emoji}${target.name} 流血${skill.bleedTurns}回合！`); } addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：${dmg} 物理伤害`); await triggerOnHitEffects(f, target, dmg); } await sleep(400);
  } else if (skill.type === 'fortuneBuyEquip') {
    if ((f._goldCoins||0) < (skill.coinCost||20)) { addLog(`${f.emoji}${f.name} 金币不足（需要${skill.coinCost||20}枚，当前${f._goldCoins||0}枚）`); spawnFloatingNum(getFighterElId(f), `金币不足!`, 'debuff-num', 0, 0); } else { f._goldCoins -= (skill.coinCost||20); const drawCount = f._fortuneEquipDraws || 0; f._fortuneEquipDraws = drawCount + 1; const chestPet = ALL_PETS.find(p => p.id === 'chest'); if (chestPet && chestPet.passive && chestPet.passive.pools) { const pools = chestPet.passive.pools; const poolIdx = drawCount < 2 ? 0 : drawCount < 4 ? 1 : 2; const pool = pools[Math.min(poolIdx, pools.length-1)]; const owned = (f._fortuneEquips || []).map(e => e.id); const available = pool.filter(e => !owned.includes(e.id)); if (available.length > 0) { const equip = available[Math.floor(Math.random() * available.length)]; if (!f._fortuneEquips) f._fortuneEquips = []; f._fortuneEquips.push(equip); if (typeof applyChestEquip === 'function') applyChestEquip(f, equip); spawnFloatingNum(getFighterElId(f), `${equip.icon ? '' : '📦'}${equip.name}`, 'passive-num', 0, 0); addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：消耗20金币，获得装备「${equip.name}」！`); } else { addLog(`${f.emoji}${f.name} 装备池已空！`); } } }
    renderStatusIcons(f); sfxCoin(); await sleep(800);
  } else if (skill.type === 'fortuneGainCoins') {
    f._goldCoins = (f._goldCoins||0) + (skill.coinGain||9); const elId = getFighterElId(f);
    spawnFloatingNum(elId, `+${skill.coinGain||9}💰`, 'passive-num', 0, 0); renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：获得${skill.coinGain||9}枚金币（共${f._goldCoins}枚）`);
    sfxCoin(); await sleep(600);
  } else if (skill.type === 'rainbowGuard') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { const shieldAmt = Math.round(Math.round(f.atk * (skill.shieldAtkScale||1.0)) * getShieldMult()); target.shield += shieldAmt; const tElId = getFighterElId(target); spawnFloatingNum(tElId, `+${shieldAmt}`, 'shield-num', 0, 0); updateHpBar(target, tElId); if (skill.atkUpPct) { const atkGain = Math.round(target.baseAtk * skill.atkUpPct / 100); target.buffs.push({ type:'atkUp', value:atkGain, turns:skill.atkUpTurns||3 }); spawnFloatingNum(tElId, `+${atkGain}攻`, 'passive-num', 200, 0); recalcStats(); renderStatusIcons(target); updateFighterStats(target, tElId); } addLog(`${f.emoji}${f.name} <b>${skill.name}</b> → ${target.emoji}${target.name}：<span class="log-shield">+${shieldAmt}护盾</span> <span class="log-passive">+${skill.atkUpPct}%攻击 ${skill.atkUpTurns||3}回合</span>`); } await sleep(800);
  } else if (skill.type === 'hunterMark') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { await doDamage(f, target, skill); if (target.alive && skill.markTurns) { target.buffs.push({ type:'hunterMark', value:skill.markExecPct||24, turns:skill.markTurns, sourceIdx:allFighters.indexOf(f) }); spawnFloatingNum(getFighterElId(target), `🎯猎杀印记`, 'debuff-num', 200, 0); renderStatusIcons(target); addLog(`${target.emoji}${target.name} 被标记！HP<${skill.markExecPct||24}%时将被斩杀`); } }
  } else if (skill.type === 'hidingBuffSummon') {
    const summon = f._summon;
    if (summon && summon.alive) { const atkGain = Math.round(summon.baseAtk * 0.10); const defGain = Math.round(summon.baseDef * 0.10); const mrGain = Math.round((summon.baseMr||summon.baseDef) * 0.10); summon.buffs.push({ type:'atkUp', value:atkGain, turns:2 }); summon.buffs.push({ type:'defUp', value:defGain, turns:2 }); summon.buffs.push({ type:'mrUp', value:mrGain, turns:2 }); summon.buffs.push({ type:'lifesteal', value:10, turns:2 }); summon.crit = (summon.crit || 0.25) + 0.20; summon.buffs.push({ type:'critUp', value:20, turns:2 }); recalcStats(); const sElId = getFighterElId(summon) || (summon._summonElId); if (sElId) { spawnFloatingNum(sElId, `强化!`, 'passive-num', 0, 0); renderStatusIcons(summon); } addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：随从获得 +10%攻击/护甲/魔抗 +10%吸血 +20%暴击 2回合`); } else { addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：随从已阵亡，无效`); }
    sfxBuff(); await sleep(800);
  } else if (skill.type === 'shellAbsorb') {
    const target = allFighters[action.targetId];
    if (target && target.alive) {
      const stealAmt = Math.round(target.maxHp * (skill.stealHpPct||10) / 100);
      // D&D Life Drain: target loses BOTH current hp and maxHp by stealAmt (min 1)
      target.maxHp -= stealAmt;
      target.hp = Math.max(1, target.hp - stealAmt);
      target.hp = Math.min(target.hp, target.maxHp);
      const tElId = getFighterElId(target);
      // Single floating number on target only (true-dmg style with shell icon).
      spawnFloatingNum(tElId, `-${stealAmt}🐚`, 'true-dmg', 0, 0, { atkSide: f.side, amount: stealAmt });
      updateHpBar(target, tElId);
      updateFighterStats(target, tElId);
      // Caster gains symmetric amount silently — HP bar growth is feedback enough.
      f.maxHp += stealAmt; f.hp += stealAmt; f._initHp = f.maxHp;
      const fElId = getFighterElId(f);
      updateHpBar(f, fElId);
      updateFighterStats(f, fElId);
      f._dmgDealt += stealAmt;
      f._trueDmgDealt = (f._trueDmgDealt || 0) + stealAmt;
      target._dmgTaken += stealAmt;
      target._trueDmgTaken = (target._trueDmgTaken || 0) + stealAmt;
      addLog(`${f.emoji}${f.name} <b>${skill.name}</b>：${target.emoji}${target.name} 损失 ${stealAmt}HP 和 ${stealAmt}最大生命值`);
    }
    await sleep(800);
  } else if (skill.type === 'shellErode') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { await doDamage(f, target, skill); const mrShred = Math.round(f.atk * (skill.mrShredAtkPct||0.1)); if (mrShred > 0) { target.baseMr = Math.max(0, target.baseMr - mrShred); recalcStats(); spawnFloatingNum(getFighterElId(target), `-${mrShred}魔抗`, 'debuff-num', 200, 0); updateFighterStats(target, getFighterElId(target)); addLog(`${target.emoji}${target.name} 永久魔抗-${mrShred}`); } if (skill.cdReducePerUse && skill.cd > 0) { skill.cd = Math.max(0, skill.cd - skill.cdReducePerUse); } }
  } else if (skill.type === 'shellFortify') {
    const target = allFighters[action.targetId];
    if (target && target.alive) { await doDamage(f, target, skill); const atkGain = Math.round(f.atk * (skill.selfAtkGainPct||0.1)); if (atkGain > 0) { f.baseAtk += atkGain; recalcStats(); spawnFloatingNum(getFighterElId(f), `+${atkGain}攻`, 'passive-num', 200, 0); updateFighterStats(f, getFighterElId(f)); addLog(`${f.emoji}${f.name} 永久攻击+${atkGain}`); } if (skill.cdReducePerUse && skill.cd > 0) { skill.cd = Math.max(0, skill.cd - skill.cdReducePerUse); } }
  } else {
    const target = allFighters[action.targetId];
    await doDamage(f, target, skill);
  }

  if (atkEl) atkEl.classList.remove('attack-anim');
  // Wait for hop-back to finish before yielding turn (only if attackAnim played)
  if (_hasAttackAnim) await sleep(400);

  updateDmgStats();

  checkDeaths(f);

  // Process pending chest phoenix revive (animated)
  for (const ff of allFighters) {
    if (ff._pendingChestRevive) {
      ff._pendingChestRevive = false;
      const elId = getFighterElId(ff); const el = document.getElementById(elId);
      ff.hp = 0; ff.alive = false; if (el) el.classList.add('dead'); updateHpBar(ff, elId);
      addLog(`${ff.emoji}${ff.name} 被击败...凤凰雕像开始发光！`); await sleep(800);
      try { const cardRect = el ? el.getBoundingClientRect() : {left:100,top:100,width:100,height:50}; for (let i = 0; i < 8; i++) { const p = document.createElement('div'); p.className = 'mech-drone-particle'; p.style.background = '#ff9f43'; p.style.boxShadow = '0 0 8px #ff6600'; const angle = (i / 8) * Math.PI * 2; const dist = 60 + _origMathRandom() * 40; p.style.left = (cardRect.left + cardRect.width/2 + Math.cos(angle) * dist) + 'px'; p.style.top = (cardRect.top + cardRect.height/2 + Math.sin(angle) * dist) + 'px'; document.body.appendChild(p); requestAnimationFrame(() => { p.style.transition = `all ${0.4 + i*0.05}s ease-in`; p.style.left = (cardRect.left + cardRect.width/2 - 6) + 'px'; p.style.top = (cardRect.top + cardRect.height/2 - 6) + 'px'; p.style.opacity = '0'; p.style.transform = 'scale(0.3)'; }); setTimeout(() => p.remove(), 1500); } } catch(e) {}
      await sleep(800);
      try { const flash = document.createElement('div'); flash.className = 'mech-transform-flash'; flash.style.background = 'rgba(255,159,67,.4)'; document.body.appendChild(flash); setTimeout(() => flash.remove(), 500); } catch(e) {}
      try { sfxRebirth(); } catch(e) {} await sleep(300);
      const revivePct = (ff._chestEquips.find(e => e.id === 'phoenix') || {}).pct || 25;
      ff.hp = Math.round(ff.maxHp * revivePct / 100); ff.alive = true; ff._deathProcessed = false; ff._pendingDeath = false;
      if (el) { el._pendingDead = false; el.classList.remove('dead','death-anim'); }
      updateHpBar(ff, elId); renderStatusIcons(ff);
      spawnFloatingNum(elId, '🐦凤凰重生!', 'crit-label', 0, -25); spawnFloatingNum(elId, `+${ff.hp}HP`, 'heal-num', 200, 0);
      addLog(`${ff.emoji}${ff.name} <span class="log-passive">🐦凤凰雕像！以${revivePct}%HP重生！</span>`); await sleep(800);
    }
  }

  // Process pending mech transforms (async with dramatic pause)
  for (const ff of allFighters) {
    if (ff._pendingMech) {
      const dc = ff._pendingMech; ff._pendingMech = null;
      const elId = getFighterElId(ff); const el = document.getElementById(elId);
      ff.hp = 0; ff.alive = false; if (el) el.classList.add('dead'); updateHpBar(ff, elId);
      addLog(`${ff.emoji}${ff.name} 被击败...浮游炮开始组装！`);
      try { const cardRect = el ? el.getBoundingClientRect() : {left:100,top:100,width:100,height:50}; for (let di = 0; di < dc; di++) { const particle = document.createElement('div'); particle.className = 'mech-drone-particle'; const angle = (di / dc) * Math.PI * 2; const dist = 80 + _origMathRandom() * 60; particle.style.left = (cardRect.left + cardRect.width/2 + Math.cos(angle) * dist) + 'px'; particle.style.top = (cardRect.top + cardRect.height/2 + Math.sin(angle) * dist) + 'px'; document.body.appendChild(particle); requestAnimationFrame(() => { particle.style.transition = `all ${0.4 + di*0.05}s ease-in`; particle.style.left = (cardRect.left + cardRect.width/2 - 6) + 'px'; particle.style.top = (cardRect.top + cardRect.height/2 - 6) + 'px'; particle.style.opacity = '0'; particle.style.transform = 'scale(0.3)'; }); setTimeout(() => particle.remove(), 1500); } } catch(e) {}
      try { sfxExplosion(); } catch(e) {} await sleep(1000);
      try { const flash = document.createElement('div'); flash.className = 'mech-transform-flash'; document.body.appendChild(flash); setTimeout(() => flash.remove(), 600); } catch(e) {}
      try { sfxRebirth(); } catch(e) {} await sleep(300);
      const finalHp = ff.passive.mechHpPer * dc; const finalAtk = ff.passive.mechAtkPer * dc;
      ff.maxHp = finalHp; ff.hp = 0; ff.baseAtk = 0; ff.atk = 0;
      const mechDef = ff._cyberEnhanced ? dc : 0; ff.baseDef = mechDef; ff.def = mechDef; ff.baseMr = mechDef; ff.mr = mechDef;
      ff.shield = 0; ff.bubbleShieldVal = 0; ff.crit = 0.25; ff.armorPen = 0;
      ff.alive = true; ff._deathProcessed = false; ff.name = '机甲'; ff.emoji = '🤖'; ff.id = 'mech';
      ff.img = 'assets/passive/mech-form-icon.png'; ff.buffs = [];
      ff.passive = { type:'mechBody', droneCount:dc, mechHpPer:30, mechAtkPer:5, desc:`由 ${dc} 个浮游炮组装而成。\n\n· 生命值 = 35 × ${dc} = ${finalHp}\n· 攻击力 = 5 × ${dc} = ${finalAtk}\n· 护甲 = 0\n· 暴击率 = 25%\n\n每回合自动攻击生命值最低的敌人，造成（150%×攻击力 = ${Math.round(finalAtk*1.5)}）物理伤害。` };
      ff.skills = [{ name:'机甲攻击', type:'mechAttack', hits:1, power:0, pierce:0, cd:0, cdLeft:0, atkScale:1.5, brief:'机甲自动攻击生命值最低的敌人，造成{N:1.5*ATK}物理伤害', detail:'机甲自动锁定生命值最低的敌方目标。\n造成 150%×(攻击力={ATK}) = {N:1.5*ATK} 物理伤害。' }];
      ff._initAtk = 0; ff._initDef = 0; ff._initHp = 0;
      if (el) { el.classList.remove('dead'); el.classList.add('mech-transform-anim'); setTimeout(() => el.classList.remove('mech-transform-anim'), 800); }
      renderFighterCard(ff, elId); updateHpBar(ff, elId);
      spawnFloatingNum(elId, `🤖机甲充能中...`, 'crit-label', 0, -25);
      const rampSteps = 20; const rampInterval = 150;
      for (let ri = 1; ri <= rampSteps; ri++) { ff.hp = Math.round(finalHp * ri / rampSteps); ff.baseAtk = Math.round(finalAtk * ri / rampSteps); ff.atk = ff.baseAtk; updateHpBar(ff, elId); updateFighterStats(ff, elId); await sleep(rampInterval); }
      ff.hp = finalHp; ff.maxHp = finalHp; ff.baseAtk = finalAtk; ff.atk = finalAtk;
      updateHpBar(ff, elId); updateFighterStats(ff, elId);
      spawnFloatingNum(elId, `🤖机甲启动!`, 'crit-label', 0, -25); spawnFloatingNum(elId, `${dc}炮→HP${ff.hp} ATK${ff.atk}`, 'passive-num', 0, 0);
      addLog(`🤖${ff.name} <span class="log-passive">浮游炮×${dc}组装完成！HP${ff.hp} ATK${ff.atk}</span>`);
      const mechIdx = allFighters.indexOf(ff); if (actedThisSide.has(mechIdx)) actedThisSide.delete(mechIdx);
      await sleep(400);
    }
  }

  if (checkBattleEnd()) { animating=false; return; }

  // Hunter passive: check after every action
  await processHunterKill();
  if (checkBattleEnd()) { animating=false; return; }

  // Lava rage transform check
  await processLavaTransform();
  if (checkBattleEnd()) { animating=false; return; }

  // BambooCharge follow-up: extra pierce attack after skill
  if (f.alive && f.passive && f.passive.type === 'bambooCharge' && f._bambooCharged && !f._bambooFired) {
    const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
    if (enemies.length) {
      const skillTarget = action.targetId >= 0 ? allFighters[action.targetId] : null;
      const target = (skillTarget && skillTarget.alive && skillTarget.side !== f.side) ? skillTarget : enemies.sort((a,b) => a.hp - b.hp)[0];
      await doBambooChargeAttack(f, target);
      f._bambooCharged = false;
      if (checkBattleEnd()) { animating=false; return; }
    }
  }

  // Final belt-and-suspenders sweep: any follow-up that killed without its own
  // checkDeaths call gets resolved here before yielding the turn.
  checkDeaths(f);
  if (checkBattleEnd()) { animating=false; return; }

  animating = false;

  // Host: send action to guest (guest re-executes with same seeded random)
  if (gameMode === 'pvp-online' && onlineSide === 'left') {
    sendOnline({ type:'action', action });
  }

  // Drain queued actions (online opponent sent action while we were animating)
  if (_actionQueue.length > 0) {
    const next = _actionQueue.shift();
    executeAction(next);
    return;
  }

  onActionComplete();
}
