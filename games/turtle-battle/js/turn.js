// ══════════════════════════════════════════════════════════
// turn.js — Turn system, buff processing, stat recalc
// Depends on: engine.js (globals), combat.js, state.js
// ══════════════════════════════════════════════════════════

// ── TURN SYSTEM ───────────────────────────────────────────
async function beginTurn() {
  document.getElementById('turnBanner').textContent = `第 ${turnNum} 回合`;
  // Show big mid-screen "第 N 回合" banner BEFORE any per-turn passives fire,
  // so players see the turn announcement before damage/buffs start landing.
  if (typeof showTurnStartBanner === 'function') {
    await showTurnStartBanner(`第 ${turnNum} 回合`, `Round ${turnNum}`, 1100);
  }
  addLog(`── 第 ${turnNum} 回合 ──`, 'round-sep');
  try { sfxTurnStart && sfxTurnStart(); } catch(e) {}
  // Debug: verify seed sync at turn boundaries (can remove in production)
  if (gameMode === 'pvp-online') console.log(`[${onlineSide.toUpperCase()}] T${turnNum} seed=${_rngSeed}`);
  // Reduce cooldowns
  allFighters.forEach(f => {
    f.skills.forEach(s => { if (s.cdLeft > 0) s.cdLeft--; });
    // Also tick summon CDs
    if (f._summon && f._summon.alive) {
      f._summon.skills.forEach(s => { if (s.cdLeft > 0) s.cdLeft--; });
    }
  });
  // Pirate ship: auto-fire cannon each turn (before passive loop, since ship has no passive)
  for (const f of allFighters) {
    if (!f._isPirateShip || !f.alive) continue;
    const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
    if (enemies.length) {
      const target = enemies[Math.floor(Math.random() * enemies.length)];
      const dmg = Math.round(f.atk * (f._shipFireScale || 0.2));
      const eDef = target.def - (f.armorPen || 0);
      const finalDmg = Math.max(1, Math.round(dmg * calcDmgMult(eDef)));
      applyRawDmg(f, target, finalDmg, false, false, 'physical');
      const tElId = getFighterElId(target);
      spawnFloatingNum(tElId, `-${finalDmg}`, 'direct-dmg', 0, 0, {atkSide:f.side, amount:finalDmg});
      updateHpBar(target, tElId);
      addLog(`海盗船 开炮 → ${target.emoji}${target.name}：<span class="log-direct">${finalDmg}物理</span>`);
      await triggerOnHitEffects(f, target, finalDmg);
      checkDeaths(f);
      if (checkBattleEnd()) return;
    }
  }
  // Passive: per-turn scaling
  for (const f of allFighters) {
    if (!f.alive || !f.passive) continue;
    if (f._isSummon) continue; // summon passives handled in dedicated loop below
    f.passiveUsedThisTurn = false; // reset once-per-turn passives
    if (f.passive.type === 'turnScaleAtk') {
      const gain = Math.round(f.baseAtk * f.passive.pct / 100);
      f.baseAtk += gain;
      recalcStats();
      const elId = getFighterElId(f);
      updateFighterStats(f, elId);
      spawnFloatingNum(elId, `+${gain}攻`, 'passive-num', 0, 0);
      addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">攻击+${gain}</span>`);
    }
    if (f.passive.type === 'turnScaleHp') {
      const gain = Math.round(f.maxHp * f.passive.pct / 100);
      f.maxHp += gain;
      f.hp += gain;
      const elId = getFighterElId(f);
      updateHpBar(f, elId);
      updateFighterStats(f, elId);
      addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">最大HP+${gain}</span>`);
      spawnFloatingNum(elId, `+${gain}HP`, 'passive-num', 0, 0);
    }
    if (f.passive.type === 'stoneWall') {
      // Permanent def gain: reach cap (50% initial DEF) in capTurns (6) turns
      if (!f._stoneDefGained) f._stoneDefGained = 0;
      if (!f._stoneDefFraction) f._stoneDefFraction = 0;
      const maxCap = Math.round((f._initDef || f.baseDef) * (f.passive.maxDefInitPct || 50) / 100);
      if (f._stoneDefGained < maxCap) {
        f._stoneDefFraction += maxCap / (f.passive.capTurns || 6);
        const target = Math.min(maxCap, Math.round(f._stoneDefFraction));
        const gain = target - f._stoneDefGained;
        if (gain > 0) {
          f.baseDef += gain;
          f._stoneDefGained += gain;
          recalcStats();
          const elId = getFighterElId(f);
          updateFighterStats(f, elId);
          spawnFloatingNum(elId, `+${gain}护甲`, 'passive-num', 0, 0);
          addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">护甲+${gain}(已+${f._stoneDefGained}/${maxCap})</span>`);
        }
      }
    }
    // cyberDrone moved to processCyberDrones(side) — fires at side-end
    // (same beat as DoT/HOT/lightning) for a unified "我方行动结束后才出手" feel.
    // (Pirate ship cannon moved to before passive loop)
    // Passive: auraAwaken — awaken at turn N with full stat boost
    if (f.passive.type === 'auraAwaken' && !f._auraAwakened && turnNum >= f.passive.awakenTurn) {
      f._auraAwakened = true;
      const elId = getFighterElId(f);
      // ATK boost
      const atkGain = Math.round(f.baseAtk * f.passive.atkPct / 100);
      f.baseAtk += atkGain;
      // DEF boost
      const defGain = Math.round(f.baseDef * f.passive.defPct / 100);
      f.baseDef += defGain;
      // MaxHP boost (scale current HP proportionally)
      const hpGain = Math.round(f.maxHp * f.passive.hpPct / 100);
      const oldMax = f.maxHp;
      f.maxHp += hpGain;
      f.hp = Math.round(f.hp * f.maxHp / oldMax);
      // Lifesteal
      f._auraLifesteal = f.passive.lifestealPct / 100;
      // Reflect
      f._auraReflect = f.passive.reflectPct / 100;
      // Percentage armor penetration
      f.armorPenPct += f.passive.armorPenPct / 100;
      // Visual + log
      spawnFloatingNum(elId, '<img src="assets/passive/aura-awaken-icon.png" style="width:16px;height:16px;vertical-align:middle">气场觉醒!', 'crit-label', 0, -20);
      recalcStats();
      spawnFloatingNum(elId, `+${atkGain}攻 +${defGain}护甲 +${hpGain}HP`, 'passive-num', 0, 10);
      updateHpBar(f, elId);
      updateFighterStats(f, elId);
      addLog(`${f.emoji}${f.name} <span class="log-passive"><img src="assets/passive/aura-awaken-icon.png" style="width:16px;height:16px;vertical-align:middle">气场觉醒！ATK+${atkGain} DEF+${defGain} HP+${hpGain} 生命偷取${f.passive.lifestealPct}% 反伤${f.passive.reflectPct}% ${f.passive.armorPenPct}%穿甲</span>`);
    }
    // Passive: bambooCharge — charge every other turn, only consume on actual skill use
    if (f.passive.type === 'bambooCharge') {
      f._bambooFired = false;
      if (!f._bambooCharged) {
        // Not charged yet — accumulate
        f._bambooCounter = (f._bambooCounter || 0) + 1;
        if (f._bambooCounter >= 2) {
          f._bambooCharged = true;
          f._bambooCounter = 0;
          spawnFloatingNum(getFighterElId(f), '<img src="assets/passive/bamboo-charge-icon.png" style="width:16px;height:16px;vertical-align:middle">充能!', 'passive-num', 0, 0);
          addLog(`${f.emoji}${f.name} 被动：<span class="log-passive"><img src="assets/passive/bamboo-charge-icon.png" style="width:16px;height:16px;vertical-align:middle">竹编充能！本回合技能后追加强化攻击</span>`);
        }
      }
      // If still charged from last turn (didn't fire — stunned etc), keep it
    }
    // Undead lock countdown
    if (f._undeadLockTurns > 0) {
      f._undeadLockTurns--;
      if (f._undeadLockTurns <= 0) {
        f.hp = 1;
        const elId = getFighterElId(f);
        spawnFloatingNum(elId, '锁血结束', 'debuff-label', 0, -20);
        renderStatusIcons(f);
        addLog(`${f.emoji}${f.name} 亡灵之力消散，恢复正常`);
      }
    }
    // Candy pen countdown
    if (f._candyPenTurns > 0) {
      f._candyPenTurns--;
      if (f._candyPenTurns <= 0 && f._candyPenGain) {
        f.armorPen -= f._candyPenGain;
        f._candyPenGain = 0;
        updateFighterStats(f, getFighterElId(f));
      }
    }
    // Lava turtle: transform countdown + check rage
    processLavaCountdown(f);
    // Chest turtle: rum HoT (8% maxHP per turn)
    if (f.passive && f.passive.type === 'chestTreasure' && hasChestEquip(f, 'rum')) {
      const heal = Math.round(f.maxHp * 0.08);
      const before = f.hp;
      f.hp = Math.min(f.maxHp, f.hp + heal);
      const actual = Math.round(f.hp - before);
      if (actual > 0) {
        const elId = getFighterElId(f);
        spawnFloatingNum(elId, `+${actual}🍺`, 'heal-num', 0, 0);
        updateHpBar(f, elId);
      }
    }
    // Passive: candySteal — D&D Life Drain: deal stealAmt damage + reduce maxHp
    // by stealAmt; caster gains the same amt in both hp and maxHp (symmetric).
    if (f.passive.type === 'candySteal' && turnNum === f.passive.stealTurn) {
      const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      if (enemies.length) {
        const target = enemies[Math.floor(Math.random() * enemies.length)];
        const stealAmt = Math.round(target.maxHp * f.passive.stealPct / 100);
        // Target: actual HP damage + maxHp reduction (both by stealAmt)
        target.maxHp -= stealAmt;
        target.hp = Math.max(1, target.hp - stealAmt); // can't kill
        target.hp = Math.min(target.hp, target.maxHp); // keep hp within new cap
        const tElId = getFighterElId(target);
        // Single floating number on the target only — true-damage style with candy icon.
        // HP bar + maxHp scale visually convey the dual loss; no extra clutter on caster.
        spawnFloatingNum(tElId, `-${stealAmt}🍬`, 'true-dmg', 0, 0, { atkSide: f.side, amount: stealAmt });
        updateHpBar(target, tElId);
        updateFighterStats(target, tElId);
        // Caster: gains stealAmt in both (symmetric transfer) — no floating numbers on caster.
        f.maxHp += stealAmt;
        f.hp += stealAmt;
        const fElId = getFighterElId(f);
        updateHpBar(f, fElId);
        updateFighterStats(f, fElId);
        // Count as damage dealt/taken
        if (f._dmgDealt !== undefined) f._dmgDealt += stealAmt;
        if (target._dmgTaken !== undefined) target._dmgTaken += stealAmt;
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">🍬甜蜜掠夺！${target.emoji}${target.name} 损失 ${stealAmt}HP 和 ${stealAmt}最大生命值</span>`);
        await sleep(800);
      }
    }
    // Passive: pirateShip — summon pirate ship at turn 3
    // Crystal immortal: turn 10 bonus
    if (f._crystalImmortal && !f._crystalImmortalTriggered && turnNum >= 10) {
      f._crystalImmortalTriggered = true;
      const hpGain = 5000;
      const atkGain = 400;
      f.maxHp += hpGain;
      f.hp += hpGain;
      f._initHp = f.maxHp;
      f.baseAtk += atkGain;
      f.atk += atkGain;
      f._initAtk = f.baseAtk;
      recalcStats();
      const elId = getFighterElId(f);
      spawnFloatingNum(elId, `不朽!`, 'crit-label', 0, -25);
      spawnFloatingNum(elId, `+${hpGain}HP +${atkGain}ATK`, 'passive-num', 200, 0);
      updateHpBar(f, elId);
      updateFighterStats(f, elId);
      addLog(`${f.emoji}${f.name} <span class="log-passive">🔮不朽价值觉醒！+${hpGain}最大HP +${atkGain}攻击力！</span>`);
      try { sfxRebirth(); } catch(e) {}
      await sleep(1000);
    }
    // Gambler fate wheel: draw a suit each turn for permanent stat gain
    if (f._fateWheel && f.alive) {
      const suit = Math.floor(Math.random() * 4); // 0=spade, 1=heart, 2=diamond, 3=club
      const elId = getFighterElId(f);
      const suits = ['♠','♥','♦','♣'];
      if (suit === 0) {
        f.baseAtk += 5; f.maxHp += 30; f.hp += 30; f._initHp = f.maxHp;
        spawnFloatingNum(elId, `${suits[0]}+5攻+30HP`, 'passive-num', 0, 0);
        addLog(`${f.emoji}${f.name} 命运之轮：<span class="log-passive">${suits[0]}黑桃 攻击+5 HP+30</span>`);
      } else if (suit === 1) {
        f.baseDef += 2; f.baseMr += 2;
        spawnFloatingNum(elId, `${suits[1]}+2甲+2魔抗`, 'passive-num', 0, 0);
        addLog(`${f.emoji}${f.name} 命运之轮：<span class="log-passive">${suits[1]}红心 护甲+2 魔抗+2</span>`);
      } else if (suit === 2) {
        f.crit += 0.08; f.armorPen += 2;
        spawnFloatingNum(elId, `${suits[2]}+8%暴击+2穿甲`, 'passive-num', 0, 0);
        addLog(`${f.emoji}${f.name} 命运之轮：<span class="log-passive">${suits[2]}方块 暴击+8% 穿甲+2</span>`);
      } else {
        f._lifestealPct = (f._lifestealPct||0) + 4;
        spawnFloatingNum(elId, `${suits[3]}+4%吸血`, 'passive-num', 0, 0);
        addLog(`${f.emoji}${f.name} 命运之轮：<span class="log-passive">${suits[3]}梅花 吸血+4%</span>`);
      }
      recalcStats();
      updateFighterStats(f, elId);
      updateHpBar(f, elId);
      await sleep(400);
    }
    if (f._pirateShipEnabled && !f._pirateShipSummoned && turnNum === 3) {
      f._pirateShipSummoned = true;
      const team = f.side === 'left' ? leftTeam : rightTeam;
      // Find first empty slot: F1 → F2 → F3 → B1 → B2 → B3
      const usedSlots = team.filter(t => t.alive).map(t => t._slotKey);
      const slotOrder = ['front-0','front-1','front-2','back-0','back-1','back-2'];
      const shipSlotKey = slotOrder.find(s => !usedSlots.includes(s)) || 'back-2';
      const shipPos = shipSlotKey.startsWith('front') ? 'front' : 'back';
      // Create ship as a fighter-like entity
      const shipHp = Math.round(f.maxHp * 1.5);
      const shipAtk = f.atk;
      const ship = {
        id:'pirateShip_'+f.id, name:'海盗船', emoji:'🚢', rarity:f.rarity, side:f.side,
        img:'assets/battle/pirate-ship.png', sprite:null,
        _equippedIdxs:[0], maxHp:shipHp, hp:shipHp, shield:0,
        baseAtk:shipAtk, baseDef:0, baseMr:0, atk:shipAtk, def:0, mr:0,
        _initHp:shipHp, _initAtk:shipAtk, _initDef:0, _initMr:0, _initCrit:0,
        crit:0, armorPen:0, armorPenPct:0, magicPen:0, magicPenPct:0,
        passive:null, passiveUsedThisTurn:false,
        _position:shipPos, alive:true, buffs:[], bubbleStore:0,
        bubbleShieldVal:0, bubbleShieldTurns:0, bubbleShieldOwner:null,
        _shockStacks:0, _goldCoins:0, _drones:[], _twoHeadForm:'ranged',
        _formHpGain:0, _formDefGain:0, _formAtkLoss:0, _rangedSkills:null,
        _isMech:false, _starEnergy:0, _deathProcessed:false,
        _dmgDealt:0, _dmgTaken:0, _physDmgDealt:0, _magicDmgDealt:0, _trueDmgDealt:0,
        _physDmgTaken:0, _magicDmgTaken:0, _trueDmgTaken:0,
        _summon:null, _summonElId:null, _storedEnergy:0, _auraAwakened:false,
        _auraLifesteal:0, _auraReflect:0, _bambooCharged:false, _bambooCounter:0,
        _bambooGainedHp:0, _hunterKills:0, _hunterStolenAtk:0, _hunterStolenDef:0,
        _hunterStolenHp:0, _diamondCollideCount:{}, _inkStacks:0, _inkLink:null,
        _undeadLockTurns:0, _undeadLockUsed:false, _lavaRage:0, _lavaTransformed:false,
        _lavaTransformTurns:0, _lavaSpent:false, _lavaSmallSkills:null,
        _chestTreasure:0, _chestEquips:[], _chestTier:0, _goldLightning:0,
        _crystallize:0, _collideStacks:0,
        _isPirateShip:true, _shipOwner:f, _shipFireScale:0.2,
        _slotKey: shipSlotKey,
        skills:[{ name:'开炮', type:'physical', hits:1, power:0, pierce:0, cd:0, atkScale:0.2 }],
        _passiveSkills:[]
      };
      team.push(ship);
      allFighters.push(ship);
      f._pirateShip = ship;
      const elId = getFighterElId(f);
      spawnFloatingNum(elId, `海盗船登场!`, 'crit-label', 0, -25);
      addLog(`${f.emoji}${f.name} 的海盗船在${shipPos === 'front' ? '前排' : '后排'}登场！HP${shipHp} ATK${shipAtk}`);
      renderScene();
      await sleep(800);
    }
    // Passive: rainbowPrism — random team buff each turn
    if (f.passive.type === 'rainbowPrism') {
      const allies = (f.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
      const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      const enhanced = f._enhancedPrism;
      // Colors: 0=red, 1=blue, 2=green, 3=orange, 4=yellow, 5=cyan, 6=purple
      const picks = [];
      if (enhanced) {
        // Enhanced: pick 1 from red/blue/green + 1 from orange/yellow/cyan/purple
        const basePool = turnNum <= 1 ? [0, 1] : [0, 1, 2]; // skip green first turn
        picks.push(basePool[Math.floor(Math.random() * basePool.length)]);
        const extraPool = [3, 4, 5, 6];
        picks.push(extraPool[Math.floor(Math.random() * extraPool.length)]);
      } else {
        // Normal: pick 1 from red/blue/green
        const pool = turnNum <= 1 ? [0, 1] : [0, 1, 2];
        picks.push(pool[Math.floor(Math.random() * pool.length)]);
      }
      f._prismColor = picks[0]; // primary color for skill 1 bonus
      f._prismColors = picks.slice(); // all colors picked this turn (for UI)

      function applyPrismColor(color) {
        if (color === 0) {
          for (const a of allies) { const g = Math.round(a.baseAtk * f.passive.atkPct / 100); a.buffs.push({type:'atkUp',value:g,turns:2}); spawnFloatingNum(getFighterElId(a), `+${g}攻🔴`, 'passive-num', 0, 0); }
          addLog(`${f.emoji}${f.name} 🔴红光：全体攻击+${f.passive.atkPct}%`);
        } else if (color === 1) {
          for (const a of allies) { const dg = Math.round(a.baseDef * f.passive.defPct / 100); const mg = Math.round((a.baseMr||a.baseDef) * f.passive.defPct / 100); a.buffs.push({type:'defUp',value:dg,turns:2}); a.buffs.push({type:'mrUp',value:mg,turns:2}); spawnFloatingNum(getFighterElId(a), `+${dg}甲+${mg}抗🔵`, 'passive-num', 0, 0); }
          addLog(`${f.emoji}${f.name} 🔵蓝光：全体护甲/魔抗+${f.passive.defPct}%`);
        } else if (color === 2) {
          for (const a of allies) { const h = Math.round(a.maxHp * f.passive.healPct / 100); const b = a.hp; a.hp = Math.min(a.maxHp, a.hp + h); const ac = Math.round(a.hp - b); if (ac > 0) spawnFloatingNum(getFighterElId(a), `+${ac}🟢`, 'heal-num', 0, 0); updateHpBar(a, getFighterElId(a)); }
          addLog(`${f.emoji}${f.name} 🟢绿光：全体回复${f.passive.healPct}%HP`);
        } else if (color === 3) {
          // Orange: 10% lifesteal for all allies 1 turn
          for (const a of allies) { a.buffs.push({type:'lifesteal',value:10,turns:2}); spawnFloatingNum(getFighterElId(a), `+10%吸血🟠`, 'passive-num', 0, 0); }
          addLog(`${f.emoji}${f.name} 🟠橙光：全体友方获得10%吸血1回合`);
        } else if (color === 4) {
          // Yellow: burn random enemy
          if (enemies.length) { const t = enemies[Math.floor(Math.random()*enemies.length)]; applySkillDebuffs({burn:true}, t, f); spawnFloatingNum(getFighterElId(t), `<img src="assets/status/burn-icon.png" style="width:14px;height:14px;vertical-align:middle">灼烧`, 'debuff-num', 0, 0); renderStatusIcons(t); addLog(`${f.emoji}${f.name} 🟡黄光：${t.emoji}${t.name}被灼烧`); }
        } else if (color === 5) {
          // Cyan: chill random enemy 1 turn
          if (enemies.length) { const t = enemies[Math.floor(Math.random()*enemies.length)]; t.buffs.push({type:'chilled',value:1,turns:2}); spawnFloatingNum(getFighterElId(t), `<img src="assets/status/chilled-icon.png" style="width:14px;height:14px;vertical-align:middle">冰寒`, 'debuff-num', 0, 0); renderStatusIcons(t); addLog(`${f.emoji}${f.name} 🩵青光：${t.emoji}${t.name}被冰寒`); }
        } else if (color === 6) {
          // Purple: curse random enemy 3 turns
          if (enemies.length) { const t = enemies[Math.floor(Math.random()*enemies.length)]; const dotDmg = Math.round(t.maxHp * 0.09); t.buffs.push({type:'dot',value:dotDmg,turns:3,sourceSide:f.side}); spawnFloatingNum(getFighterElId(t), `<img src="assets/status/curse-debuff-icon.png" style="width:14px;height:14px;vertical-align:middle">诅咒`, 'debuff-num', 0, 0); renderStatusIcons(t); addLog(`${f.emoji}${f.name} 🟣紫光：${t.emoji}${t.name}被诅咒3回合`); }
        }
      }
      for (const c of picks) applyPrismColor(c);
      recalcStats();
      for (const a of allies) updateFighterStats(a, getFighterElId(a));
      renderStatusIcons(f);
      await sleep(500);
    }
  }
  // Summon per-turn passives (same logic as above, for summons)
  for (const f of allFighters) {
    if (!f._summon || !f._summon.alive || !f._summon.passive) continue;
    const s = f._summon;
    s.passiveUsedThisTurn = false;
    const p = s.passive;
    const sElId = s._summonElId || getFighterElId(s);
    if (p.type === 'turnScaleAtk') {
      const gain = Math.round(s.baseAtk * p.pct / 100);
      s.baseAtk += gain; s.atk = s.baseAtk;
      spawnFloatingNum(sElId, `+${gain}攻`, 'passive-num', 0, 0);
      addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">攻击+${gain}</span>`);
    }
    if (p.type === 'turnScaleHp') {
      const gain = Math.round(s.maxHp * p.pct / 100);
      s.maxHp += gain; s.hp += gain;
      spawnFloatingNum(sElId, `+${gain}HP`, 'passive-num', 0, 0);
      updateSummonHpBar(s);
      addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">最大HP+${gain}</span>`);
    }
    if (p.type === 'stoneWall') {
      if (!s._stoneDefGained) s._stoneDefGained = 0;
      if (!s._stoneDefFraction) s._stoneDefFraction = 0;
      const maxCap = Math.round((s._initDef || s.baseDef) * (p.maxDefInitPct || 50) / 100);
      if (s._stoneDefGained < maxCap) {
        s._stoneDefFraction += maxCap / (p.capTurns || 6);
        const target = Math.min(maxCap, Math.round(s._stoneDefFraction));
        const gain = target - s._stoneDefGained;
        if (gain > 0) {
          s.baseDef += gain; s.def = s.baseDef; s._stoneDefGained += gain;
          spawnFloatingNum(sElId, `+${gain}护甲`, 'passive-num', 0, 0);
          addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">护甲+${gain}(已+${s._stoneDefGained}/${maxCap})</span>`);
        }
      }
    }
    // lightningStorm now fires in processLightningStorm(side) at side-end
    // (called from processSideEnd), not here — so both turtle and summon
    // owners take a single unified code path and fire after the acting
    // side's actions conclude, matching the DoT/HOT beat.
    // Bamboo charge
    if (p.type === 'bambooCharge') {
      s._bambooFired = false;
      if (!s._bambooCharged) {
        s._bambooCounter = (s._bambooCounter || 0) + 1;
        if (s._bambooCounter >= 2) {
          s._bambooCharged = true; s._bambooCounter = 0;
          spawnFloatingNum(sElId, '<img src="assets/passive/bamboo-charge-icon.png" style="width:16px;height:16px;vertical-align:middle">充能!', 'passive-num', 0, 0);
          addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive"><img src="assets/passive/bamboo-charge-icon.png" style="width:16px;height:16px;vertical-align:middle">竹编充能！</span>`);
        }
      }
    }
    // Candy steal (summon variant — D&D Life Drain style, same as main passive)
    if (p.type === 'candySteal' && turnNum === p.stealTurn) {
      const enemies = (s.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      if (enemies.length) {
        const target = enemies[Math.floor(Math.random() * enemies.length)];
        const stealAmt = Math.round(target.maxHp * p.stealPct / 100);
        target.maxHp -= stealAmt;
        target.hp = Math.max(1, target.hp - stealAmt);
        target.hp = Math.min(target.hp, target.maxHp);
        const tElId = getFighterElId(target);
        spawnFloatingNum(tElId, `-${stealAmt}🍬`, 'true-dmg', 0, 0, { atkSide: s.side, amount: stealAmt });
        updateHpBar(target, tElId);
        s.maxHp += stealAmt; s.hp += stealAmt;
        updateSummonHpBar(s);
        const owner = s._owner;
        if (owner && owner._dmgDealt !== undefined) owner._dmgDealt += stealAmt;
        if (target._dmgTaken !== undefined) target._dmgTaken += stealAmt;
        addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">🍬甜蜜掠夺！${target.emoji}${target.name} 损失 ${stealAmt}HP 和 ${stealAmt}最大生命值</span>`);
      }
    }
    // Candy pen countdown
    if (s._candyPenTurns > 0) {
      s._candyPenTurns--;
      if (s._candyPenTurns <= 0 && s._candyPenGain) { s.armorPen -= s._candyPenGain; s._candyPenGain = 0; }
    }
    // Rainbow prism
    if (p.type === 'rainbowPrism') {
      const allies = (s.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
      // Include owner
      const owner = s._owner;
      if (owner && owner.alive && !allies.includes(owner)) allies.push(owner);
      const maxRoll = (turnNum <= 1) ? 2 : 3;
      const roll = Math.floor(Math.random() * maxRoll);
      s._prismColor = roll;
      if (roll === 0) {
        for (const a of allies) { const gain = Math.round(a.baseAtk * p.atkPct / 100); a.buffs.push({ type:'atkUp', value:gain, turns:2 }); }
        addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">🔴红光！友方攻击+${p.atkPct}%</span>`);
      } else if (roll === 1) {
        for (const a of allies) { const dg = Math.round(a.baseDef * p.defPct / 100); const mg = Math.round((a.baseMr||a.baseDef) * p.defPct / 100); a.buffs.push({ type:'defUp', value:dg, turns:2 }); a.buffs.push({ type:'mrUp', value:mg, turns:2 }); }
        addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">🔵蓝光！友方护甲/魔抗+${p.defPct}%</span>`);
      } else {
        for (const a of allies) { const heal = Math.round(a.maxHp * p.healPct / 100); a.hp = Math.min(a.maxHp, a.hp + heal); updateHpBar(a, getFighterElId(a)); }
        addLog(`${s.emoji}${s.name}(随从) 被动：<span class="log-passive">🟢绿光！友方回复${p.healPct}%HP</span>`);
      }
      recalcStats();
    }
  }
  // (turn-start log + sfx already fired at top of beginTurn before passives)
  // DoTs and HOTs no longer tick here — they resolve at end of each side's
  // turn (see processSideEnd in finishSide) KOF98OL-style so the cause-effect
  // beat is clean. Round-end bookkeeping (lava shield / bubble shield / ink
  // link tick-downs, buff turns--, critUp removal, phantomStrike trigger)
  // happens in processRoundEndBuffs, also called from finishSide.
  recalcStats();
  // Equipment rule: trigger equip pick for player every 3 turns
  // Also apply equipment passive effects (HOT, rage, flat reduce)
  for (const f of allFighters) {
    if (!f.alive) continue;
    if (f._equipHot) {
      const heal = Math.round(f.maxHp * f._equipHot / 100);
      const actual = applyHeal(f, heal);
      if (actual > 0) { spawnFloatingNum(getFighterElId(f), `+${actual}💚`, 'heal-num', 0, 0); updateHpBar(f, getFighterElId(f)); }
    }
    if (f._equipRage && f.hp / f.maxHp < 0.3 && !f._equipRageActive) {
      f._equipRageActive = true;
      f.baseAtk = Math.round(f.baseAtk * 2); f.atk = f.baseAtk;
      spawnFloatingNum(getFighterElId(f), '🐡暴怒!', 'crit-label', 0, -20);
      recalcStats(); updateFighterStats(f, getFighterElId(f));
    }
  }


  // Tick down combo CDs
  for (const k in _comboCdLeft) { if (_comboCdLeft[k] > 0) _comboCdLeft[k]--; }

  // Equipment day: pick equip every 3 turns
  if (typeof _battleRule !== 'undefined' && _battleRule && _battleRule.id === 'equip' && turnNum > 1 && turnNum % 3 === 1) {
    triggerEquipPick();
  }

  // Start new round: left acts first
  activeSide = 'left';
  actedThisSide = new Set(); _bossActionsThisRound = 0;
  sidesActedThisRound = 0;
  nextSideAction();
}

// ── BUFF PROCESSING ──────────────────────────────────────
//
// Timing model (KOF98OL-style side-end ticking):
//   - At end of a side's turn: DoTs on OPPOSING side tick (debuffs our side
//     applied now resolve on them) + HOTs on OWN side tick (buffs our side
//     applied now resolve on our allies). Each DoT/HOT fires once per round.
//   - At end of full round (both sides done): round-end bookkeeping runs
//     (lava shield / bubble shield / ink link tick-downs, buff turns--,
//     critUp removal, phantomStrike trigger). Called from finishSide.
//
// Focused, single-side tick keeps floating damage numbers from overlapping
// and gives the player a clean cause-effect beat after their actions.

// Per-fighter DoT tick: dot / phoenixBurnDot / poison / bleed / chill+burn combo.
// Called from processSideEnd for each target on the OPPOSING team.
async function tickDotsOn(f) {
  if (!f.alive) return;
  const elId = getFighterElId(f);
  // dot (generic)
  const dots = f.buffs.filter(b => b.type === 'dot');
  for (const d of dots) {
    f.hp = Math.max(0, f.hp - d.value);
    spawnFloatingNum(elId, `-${d.value}`, 'dot-dmg', 0, 0, {atkSide: d.sourceSide, amount: d.value});
    updateHpBar(f, elId);
    addLog(`${f.emoji}${f.name} 受到 <span class="log-dot">${d.value}持续伤害</span>（剩余${d.turns-1}回合）`);
    if (f.hp <= 0) { f.alive = false; break; }
  }
  if (!f.alive) { checkDeaths(null); return; }
  // Phoenix burn DoT (magic, reduced by MR, pierces shield)
  const pBurns = f.buffs.filter(b => b.type === 'phoenixBurnDot');
  for (const pb of pBurns) {
    const rawBurn = pb.value + Math.round(f.maxHp * pb.hpPct / 100);
    const burnDmg = Math.max(1, Math.round(rawBurn * calcDmgMult(f.mr)));
    const burnSource = (pb.sourceIdx !== undefined && pb.sourceIdx >= 0) ? allFighters[pb.sourceIdx] : null;
    const { hpLoss, shieldAbs } = applyRawDmg(burnSource, f, burnDmg, false, true, 'magic');
    if (shieldAbs > 0) spawnFloatingNum(elId, `-${shieldAbs}`, 'shield-dmg', 0, 0, {atkSide: pb.sourceSide, amount: shieldAbs});
    if (hpLoss > 0) spawnFloatingNum(elId, `-${hpLoss}`, 'magic-dmg', 50, 0, {atkSide: pb.sourceSide, amount: hpLoss});
    updateHpBar(f, elId);
    addLog(`${f.emoji}${f.name} 受到 <span class="log-dot">${burnDmg}灼烧</span>${shieldAbs>0?' (护盾吸收'+shieldAbs+')':''}（剩余${pb.turns-1}回合）`);
    if (f.hp <= 0) break;
  }
  if (!f.alive) { checkDeaths(null); return; }
  // Poison DoT
  const poisons = f.buffs.filter(b => b.type === 'poison');
  for (const p of poisons) {
    const poisonRaw = p.value || 10;
    const poisonDmg = Math.max(1, Math.round(poisonRaw * calcDmgMult(f.mr)));
    f.hp = Math.max(0, f.hp - poisonDmg);
    spawnFloatingNum(elId, `-${poisonDmg}`, 'magic-dmg', 0, 14, {atkSide: p.sourceSide, amount: poisonDmg});
    updateHpBar(f, elId);
    addLog(`${f.emoji}${f.name} 受到 <span style="color:#6b8e23">${poisonDmg}中毒伤害</span>（剩余${p.turns-1}回合）`);
    if (f.hp <= 0) break;
  }
  if (!f.alive) { checkDeaths(null); return; }
  // Bleed DoT (physical, reduced by DEF)
  const bleeds = f.buffs.filter(b => b.type === 'bleed');
  for (const bl of bleeds) {
    const bleedRaw = bl.value || 10;
    const bleedDmg = Math.max(1, Math.round(bleedRaw * calcDmgMult(f.def)));
    f.hp = Math.max(0, f.hp - bleedDmg);
    spawnFloatingNum(elId, `-${bleedDmg}`, 'direct-dmg', 0, 14, {atkSide: bl.sourceSide, amount: bleedDmg});
    updateHpBar(f, elId);
    addLog(`${f.emoji}${f.name} 受到 <span style="color:#cc3333">${bleedDmg}流血伤害</span>（剩余${bl.turns-1}回合）`);
    if (f.hp <= 0) break;
  }
  if (!f.alive) { checkDeaths(null); return; }
  // Ice-Fire combo detonation (consumes both)
  const hasChill = f.buffs.some(b => b.type === 'chilled');
  const hasBurn = f.buffs.some(b => b.type === 'phoenixBurnDot');
  if (hasChill && hasBurn) {
    f.buffs = f.buffs.filter(b => b.type !== 'chilled' && b.type !== 'phoenixBurnDot');
    const comboDmg = Math.round(f.maxHp * 0.3);
    const finalDmg = Math.max(1, Math.round(comboDmg * calcDmgMult(f.mr)));
    f.hp = Math.max(0, f.hp - finalDmg);
    spawnFloatingNum(elId, `-${finalDmg}❄️🔥`, 'magic-dmg', 0, 0);
    updateHpBar(f, elId);
    addLog(`${f.emoji}${f.name} <span style="color:#4dabf7">❄️🔥冰火联动！</span>消耗冰寒+灼烧，造成 ${finalDmg} 魔法伤害`);
    if (f.hp <= 0) f.alive = false;
    if (!f.alive) checkDeaths(null);
  }
}

// Per-side cyberDrone processing: spawn new drone(s) then fire all drones
// at random enemies. Runs inside processSideEnd so the player sees the strike
// as the conclusion of their turn, not at the opening of the next one.
async function processCyberDrones(side) {
  for (const f of allFighters) {
    if (!f.alive || !f.passive || f.passive.type !== 'cyberDrone') continue;
    if (f._isMech) continue;
    if (side && f.side !== side) continue;
    if (!f._drones) f._drones = [];
    const elId = getFighterElId(f);
    // Spawn new drone(s) first
    const spawnCount = f.passive.dronesPerTurn || 1;
    let spawned = 0;
    for (let di = 0; di < spawnCount && f._drones.length < f.passive.maxDrones; di++) {
      f._drones.push({ age: 0 });
      spawned++;
    }
    if (spawned > 0) {
      spawnFloatingNum(elId, `+${spawned}<img src="assets/passive/cyber-drone-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'passive-num', 0, 0);
      addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">生成${spawned}个浮游炮（${f._drones.length}/${f.passive.maxDrones}）</span>`);
    }
    renderStatusIcons(f);
    // Drones fire from turn 2 onwards (turn 1 = spawn only)
    if (turnNum <= 1) { await sleep(200); continue; }
    const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
    if (!enemies.length) continue;
    const droneCount = f._drones.length;
    const perDroneDelay = 400;
    let totalDroneDmg = 0;
    for (let di = 0; di < droneCount; di++) {
      const alive = enemies.filter(e => e.alive);
      if (!alive.length) break;
      const target = alive[Math.floor(Math.random() * alive.length)];
      const dmg = Math.round(f.atk * f.passive.droneScale);
      const eDef = target.def - (f.armorPen || 0);
      const finalDmg = Math.max(1, Math.round(dmg * calcDmgMult(eDef)));
      applyRawDmg(f, target, finalDmg, false, false, 'physical');
      totalDroneDmg += finalDmg;
      const tElId = getFighterElId(target);
      spawnFloatingNum(tElId, `-${finalDmg}`, 'direct-dmg', 0, (di % 3) * 14, {atkSide:f.side, amount:finalDmg});
      const tEl = document.getElementById(tElId);
      if (tEl) tEl.classList.add('hit-shake');
      updateHpBar(target, tElId);
      await triggerOnHitEffects(f, target, finalDmg);
      checkDeaths(f);
      if (checkBattleEnd()) { await sleep(600); return; }
      await sleep(perDroneDelay);
      if (tEl) tEl.classList.remove('hit-shake');
    }
    if (droneCount > 0) {
      addLog(`${f.emoji}${f.name} ${droneCount}个浮游炮打击！共 <span class="log-direct">${totalDroneDmg}物理</span>`);
    }
  }
}

// Per-fighter HOT/regeneration tick: hot buff + bubbleStore passive.
// Called from processSideEnd for each member on the OWN (ending) team.
async function tickHotsOn(f) {
  if (!f.alive) return;
  const elId = getFighterElId(f);
  // HOT (stackable — each ticks independently)
  const hots = f.buffs.filter(b => b.type === 'hot');
  for (const h of hots) {
    const actual = applyHeal(f, h.value);
    if (actual > 0) {
      spawnFloatingNum(elId, `+${actual}`, 'heal-num', 0, 0);
      updateHpBar(f, elId);
      addLog(`${f.emoji}${f.name} <span class="log-heal">持续回复${actual}HP</span>（剩余${h.turns-1}回合）`);
    }
  }
  // BubbleStore passive: heal from store + damage random enemy
  if (f.passive && f.passive.type === 'bubbleStore' && f.bubbleStore > 0) {
    const healAmt = Math.round(f.bubbleStore * (f.passive.healPct || 25) / 100);
    const actual = applyHeal(f, healAmt);
    f.bubbleStore -= healAmt;
    if (actual > 0) {
      spawnFloatingNum(elId, `+${actual}<img src="assets/passive/bubble-store-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'bubble-num', 100, 0);
      updateHpBar(f, elId);
    }
    if (f.passive.dmgPct) {
      const dmgAmt = Math.round(f.bubbleStore * f.passive.dmgPct / 100);
      f.bubbleStore -= dmgAmt;
      if (dmgAmt > 0) {
        const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
        if (enemies.length) {
          const target = enemies[Math.floor(Math.random() * enemies.length)];
          const effMr = calcEffDef(f, target, 'magic');
          const finalDmg = Math.max(1, Math.round(dmgAmt * calcDmgMult(effMr)));
          applyRawDmg(f, target, finalDmg, false, false, 'magic');
          const tElId = getFighterElId(target);
          spawnFloatingNum(tElId, `-${finalDmg}<img src="assets/passive/bubble-store-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'magic-dmg', 100, 0, { atkSide: f.side, amount: finalDmg });
          updateHpBar(target, tElId);
        }
      }
    }
    if (f.bubbleStore < 1) f.bubbleStore = 0;
    updateHpBar(f, elId);
    addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">泡泡回复${actual}HP` + (f.passive.dmgPct ? ` + 泡泡伤害` : '') + `</span>（剩余储存${Math.round(f.bubbleStore)}）`);
  }
}

// Called from finishSide after a side completes all its actions.
// Ticks DoTs on the OPPOSING team and HOTs on the OWN team so every buff
// resolves once per round, with a clear cause-effect beat before the other
// side starts acting.
async function processSideEnd(endedSide) {
  const ownTeam = endedSide === 'left' ? leftTeam : rightTeam;
  const oppTeam = endedSide === 'left' ? rightTeam : leftTeam;
  const dotCandidates = oppTeam.filter(f => f.alive && f.buffs.some(b => b.type === 'dot' || b.type === 'phoenixBurnDot' || b.type === 'poison' || b.type === 'bleed' || (b.type === 'chilled' && f.buffs.some(b2 => b2.type === 'phoenixBurnDot'))));
  const hotCandidates = ownTeam.filter(f => f.alive && (f.buffs.some(b => b.type === 'hot') || (f.passive && f.passive.type === 'bubbleStore' && f.bubbleStore > 0)));
  const lightningOwners = ownTeam.filter(f => f.alive && f.passive && f.passive.type === 'lightningStorm');
  const droneOwners = ownTeam.filter(f => f.alive && f.passive && f.passive.type === 'cyberDrone' && !f._isMech);
  if (dotCandidates.length === 0 && hotCandidates.length === 0 && lightningOwners.length === 0 && droneOwners.length === 0) return;
  // Pause 1.5s between the last action and the first side-end effect so the
  // cause-effect beat ("我打完 → 敌方受烧/挨电/被炮轰") reads cleanly.
  await sleep(1500);
  for (const f of dotCandidates) {
    await tickDotsOn(f);
    if (checkBattleEnd()) return;
  }
  for (const f of hotCandidates) {
    await tickHotsOn(f);
  }
  // Lightning storm: our side's 闪电龟 zaps a random enemy at end of our turn
  if (lightningOwners.length > 0) {
    await processLightningStorm(endedSide);
    if (checkBattleEnd()) return;
  }
  // Cyber drones: our side's 赛博龟 spawns + fires drones at end of our turn
  if (droneOwners.length > 0) {
    await processCyberDrones(endedSide);
    if (checkBattleEnd()) return;
  }
  await sleep(600);
}

// Legacy round-end bookkeeping: lava shield / bubble shield / ink link
// tick-downs, buff turns--, critUp removal, phantomStrike trigger.
// Called from finishSide when both sides have ended their turn.
async function processRoundEndBuffs() {
  let hadTick = false;
  for (const f of allFighters) {
    if (!f.alive) continue;
    const elId = getFighterElId(f);
    // Lava shield tick down
    if (f._lavaShieldTurns > 0) {
      f._lavaShieldTurns--;
      if (f._lavaShieldTurns <= 0) {
        f._lavaShieldVal = 0;
        f._lavaShieldCounter = 0;
        addLog(`${f.emoji}${f.name} 的熔岩盾消散了`);
      }
    }
    // BubbleShield tick down
    if (f.bubbleShieldTurns > 0) {
      f.bubbleShieldTurns--;
      if (f.bubbleShieldTurns <= 0 && f.bubbleShieldVal > 0) {
        // Natural expiry — bubble pops, deal AOE damage to enemies
        const owner = f.bubbleShieldOwner;
        if (owner && owner.alive) {
          const burstDmg = Math.round(owner.atk * 0.8);
          const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
          for (const e of enemies) {
            e.hp = Math.max(0, e.hp - burstDmg);
            const eId = getFighterElId(e);
            spawnFloatingNum(eId, `-${burstDmg}`, 'bubble-burst', 0, 0);
            updateHpBar(e, eId);
            try { sfxExplosion(); } catch(e2) {}
            if (e.hp <= 0) e.alive = false;
          }
          addLog(`${f.emoji}${f.name} 的泡泡盾自然破碎！<span class="log-passive">对敌方全体造成${burstDmg}伤害</span>`);
          hadTick = true;
        }
        f.bubbleShieldVal = 0;
        f.bubbleShieldOwner = null;
      }
    }
    // HidingShield expiry: heal 20% of remaining shield before removing
    const hidingShields = f.buffs.filter(b => b.type === 'hidingShield' && b.turns <= 1);
    for (const hs of hidingShields) {
      const remaining = Math.min(f.shield, hs.shieldVal);
      if (remaining > 0) {
        const heal = Math.round(remaining * hs.healPct / 100);
        const before = f.hp;
        f.hp = Math.min(f.maxHp, f.hp + heal);
        f.shield = Math.max(0, f.shield - remaining); // remove expired shield
        const actual = Math.round(f.hp - before);
        if (actual > 0) {
          spawnFloatingNum(elId, `+${actual}`, 'heal-num', 0, 0);
          addLog(`${f.emoji}${f.name} 缩头护盾到期：<span class="log-heal">剩余盾${remaining}→回复${actual}HP</span>`);
          hadTick = true;
        }
        updateHpBar(f, elId);
      } else {
        addLog(`${f.emoji}${f.name} 缩头护盾到期（护盾已被消耗）`);
      }
    }
    // Ink link tick-down
    if (f._inkLink && f._inkLink.turns > 0) {
      f._inkLink.turns--;
      if (f._inkLink.turns <= 0) {
        f._inkLink = null;
        addLog(`${f.emoji}${f.name} 的连笔链接消散了`);
      }
    }
    // Tick down all buffs, remove expired
    const hadPhysImmune = f.buffs.some(b => b.type === 'physImmune');
    const hadCritUp = f.buffs.find(b => b.type === 'critUp' && b.turns === 1); // about to expire
    f.buffs.forEach(b => b.turns--);
    f.buffs = f.buffs.filter(b => b.turns > 0);
    // CritUp expired: remove the crit bonus
    if (hadCritUp && !f.buffs.some(b => b.type === 'critUp')) {
      f.crit = Math.max(0, (f.crit || 0) - hadCritUp.value / 100);
    }
    // Ghost phantom: physImmune expired → trigger stored strike
    if (hadPhysImmune && !f.buffs.some(b => b.type === 'physImmune') && f._phantomStrike && f.alive) {
      const ps = f._phantomStrike;
      f._phantomStrike = null;
      const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      if (enemies.length) {
        const target = enemies.sort((a,b) => a.hp - b.hp)[0]; // auto-target lowest HP
        for (let h = 0; h < ps.hits; h++) {
          const dmg = Math.round(f.atk * ps.atkScale);
          applyRawDmg(f, target, dmg, false, false, 'true');
          spawnFloatingNum(getFighterElId(target), `-${dmg}`, 'direct-dmg', h * 80, 0, {atkSide:f.side, amount:dmg});
        }
        updateHpBar(target, getFighterElId(target));
        const totalDmg = Math.round(f.atk * ps.atkScale * ps.hits);
        addLog(`${f.emoji}${f.name} 虚化结束 → 幽冥突袭 ${target.emoji}${target.name}：${totalDmg} 真实伤害`);
        await triggerOnHitEffects(f, target, totalDmg);
        hadTick = true;
      }
    }
    renderStatusIcons(f);
  }
  if (hadTick) await sleep(800);
}

function recalcStats() {
  allFighters.forEach(f => {
    // Reset to base
    f.atk = f.baseAtk;
    f.def = f.baseDef;
    f.mr  = f.baseMr || f.baseDef;
    // Diamond structure: amplify armor/mr buffs for all allies
    const team = f.side === 'left' ? leftTeam : rightTeam;
    const diamond = team.find(t => t.alive && t.passive && t.passive.type === 'diamondStructure');
    let defAmp = 1;
    if (diamond) {
      const isSelf = f === diamond;
      const ampPct = (isSelf && diamond._diamondEnhanced) ? 100 : (diamond.passive.defBuffAmp || 50);
      defAmp = 1 + ampPct / 100;
    }
    // Chilled: ATK -20%
    if (f.buffs.some(b => b.type === 'chilled')) {
      f.atk = Math.round(f.atk * 0.8);
    }
    // Apply debuffs & buffs
    for (const b of f.buffs) {
      if (b.type === 'atkDown') f.atk = Math.round(f.atk * (1 - b.value / 100));
      if (b.type === 'defDown') f.def = Math.round(f.def * (1 - b.value / 100));
      if (b.type === 'mrDown')  f.mr  = Math.round(f.mr  * (1 - b.value / 100));
      if (b.type === 'defUp')   f.def += Math.round(b.value * defAmp);
      if (b.type === 'mrUp')    f.mr  += Math.round(b.value * defAmp);
      if (b.type === 'atkUp')   f.atk += b.value;
      // Dice fate crit buff (managed separately by gamblerBlood recalc below)
      if (b.type === 'diceFateCrit') f.crit = (f.crit || 0) + b.value / 100;
    }
    // UndeadRage: ATK scales with lost HP
    if (f.passive && f.passive.type === 'undeadRage' && f.maxHp > 0) {
      const lostPct = Math.max(0, 1 - f.hp / f.maxHp) * 100;
      const atkBonus = Math.min(f.passive.atkMaxBonus, lostPct * f.passive.atkPerLostPct);
      f.atk += Math.round(f.baseAtk * atkBonus / 100);
    }
    // GamblerBlood: dynamic crit based on lost HP
    if (f.passive && f.passive.type === 'gamblerBlood') {
      const lostPct = Math.max(0, 1 - f.hp / f.maxHp);
      const threshold = f.passive.maxCritAtLoss / 100;
      const maxGain = f.passive.maxCritGain / 100;
      const extraCrit = Math.min(maxGain, lostPct / threshold * maxGain);
      f.crit = (f._initCrit || 0.25) + extraCrit;
      // Re-apply diceFateCrit buff on top
      for (const b of f.buffs) {
        if (b.type === 'diceFateCrit') f.crit += b.value / 100;
      }
    }
  });
  // Auto-refresh UI for all fighters after stat recalc
  if (typeof updateFighterStats === 'function') {
    allFighters.forEach(f => {
      if (f.alive) updateFighterStats(f, getFighterElId(f));
    });
  }
}

function nextAction() {
  // Redirects to new turn system
  onActionComplete();
}

// ── TURN TIMER (40s countdown, auto-pick on timeout) ──────
function startTurnTimer(seconds, canAct) {
  clearTurnTimer();
  // Show timer UI
  let timerEl = document.getElementById('turnTimer');
  if (!timerEl) {
    timerEl = document.createElement('span');
    timerEl.id = 'turnTimer';
    timerEl.className = 'turn-timer';
    const banner = document.getElementById('turnBanner');
    if (banner) banner.appendChild(timerEl);
    else document.body.appendChild(timerEl);
  }
  let remaining = seconds;
  const fmtTime = (s) => s >= 60 ? Math.floor(s/60) + ':' + String(s%60).padStart(2,'0') : s + 's';
  timerEl.textContent = fmtTime(remaining);
  timerEl.style.display = 'inline-block';
  timerEl.classList.remove('timer-urgent');
  _turnTimerInterval = setInterval(() => {
    remaining--;
    timerEl.textContent = fmtTime(remaining);
    if (remaining <= 10) timerEl.classList.add('timer-urgent');
    if (remaining <= 0) {
      clearTurnTimer();
      autoPickAction(canAct);
    }
  }, 1000);
}
function clearTurnTimer() {
  if (_turnTimerInterval) { clearInterval(_turnTimerInterval); _turnTimerInterval = null; }
  const el = document.getElementById('turnTimer');
  if (el) el.style.display = 'none';
}
function autoPickAction(canAct) {
  // Auto-select: pick first alive fighter, use first available skill on lowest HP enemy
  const f = canAct && canAct.find(ff => ff.alive);
  if (!f || battleOver) return;
  actedThisSide.add(allFighters.indexOf(f));
  addLog(`<span style="color:#ffd93d">⏰ ${f.name} 超时！自动出招</span>`);
  aiAction(f);
}

function resetTurnState() {
  activeSide = 'left';
  actedThisSide = new Set(); _bossActionsThisRound = 0;
  isFirstRound = true;
  sidesActedThisRound = 0;
}

async function nextSideAction() {
  if (battleOver) return;
  // Safety: check if battle should end (catches edge cases like DOT kills)
  if (checkBattleEnd()) return;

  // Get alive fighters for active side that haven't acted yet
  const sideTeam = activeSide === 'left' ? leftTeam : rightTeam;
  // Boss mode: boss can act twice per round, use counter instead of Set
  const isBossSide = (gameMode === 'boss' || (gameMode === 'dungeon' && dungeonState && dungeonState.stage >= 5)) && activeSide === 'right';
  let canAct;
  if (isBossSide) {
    if (!_bossActionsThisRound) _bossActionsThisRound = 0;
    canAct = (_bossActionsThisRound < 2) ? sideTeam.filter(f => f.alive) : [];
  } else {
    canAct = sideTeam.filter(f => f.alive && !actedThisSide.has(allFighters.indexOf(f)));
  }

  // First round: left only sends 1
  const totalAlive = sideTeam.filter(f => f.alive).length;
  const maxActions = (isFirstRound && activeSide === 'left') ? Math.min(2, totalAlive) : (isBossSide ? 2 : totalAlive);
  const alreadyActed = isBossSide ? _bossActionsThisRound : (totalAlive - canAct.length);

  if (canAct.length === 0 || alreadyActed >= maxActions) {
    // This side is done, switch to other side or end round
    await finishSide();
    return;
  }

  renderSideIndicator();

  // Determine if player or AI controls this side
  const isPlayer =
    (gameMode === 'pve' && activeSide === 'left') ||
    (gameMode === 'boss' && activeSide === 'left') ||
    (gameMode === 'dungeon' && activeSide === 'left') ||
    (gameMode === 'pvp-online' && activeSide === onlineSide);

  // Skip pirate ships — they fire passively, not as regular actions
  canAct.filter(f => f._isPirateShip).forEach(f => actedThisSide.add(allFighters.indexOf(f)));
  canAct = canAct.filter(f => !f._isPirateShip);

  // Check for stunned fighters — auto-skip them (only once per stun)
  const stunned = canAct.filter(f => f.buffs.some(b => b.type === 'stun') && !f._stunUsed);
  if (stunned.length > 0) {
    for (const sf of stunned) {
      actedThisSide.add(allFighters.indexOf(sf));
      sf._stunUsed = true; // mark consumed, won't double-skip
      // Remove stun buff immediately after consuming
      sf.buffs = sf.buffs.filter(b => b.type !== 'stun');
      renderStatusIcons(sf);
      const sfElId = getFighterElId(sf);
      spawnFloatingNum(sfElId, '💫眩晕跳过', 'debuff-label', 0, 0);
      addLog(`${sf.emoji}${sf.name} 眩晕中，跳过行动！`);
    }
    await sleep(600);
    nextSideAction();
    return;
  }

  if (isPlayer) {
    // Player picks which turtle to use
    if (canAct.length === 1) {
      // Only one choice, auto-select
      actedThisSide.add(allFighters.indexOf(canAct[0]));
      showActionPanel(canAct[0]);
    } else {
      // Show turtle picker
      showTurtlePicker(canAct);
    }
    // Start 3-minute turn timer (auto-pick if timeout)
    startTurnTimer(180, canAct);
  } else if (gameMode === 'pvp-online') {
    // Online PVP: wait for opponent's action via network — hide UI, do nothing
    const panel = document.getElementById('actionPanel');
    if (panel) panel.classList.remove('show');
    const picker = document.getElementById('turtlePicker');
    if (picker) picker.style.display = 'none';
    // Action will come from handleOnlineMessage → executeAction
  } else {
    // PVE AI picks a turtle and acts
    const panel = document.getElementById('actionPanel');
    if (panel) panel.classList.remove('show');
    const picker = document.getElementById('turtlePicker');
    if (picker) picker.style.display = 'none';
    const f = canAct[Math.floor(Math.random() * canAct.length)];
    // Safety watchdog: if AI hangs for 8s, force next action
    const watchdog = setTimeout(() => {
      if (!battleOver && animating) { console.warn('AI watchdog triggered'); animating = false; onActionComplete(); }
    }, 8000);
    setTimeout(() => {
      clearTimeout(watchdog);
      actedThisSide.add(allFighters.indexOf(f));
      try { aiAction(f); } catch(e) { console.error('aiAction error:', e); animating = false; onActionComplete(); }
    }, 1200);
  }
}

async function finishSide() {
  if (battleOver) return;
  // KOF98OL-style side-end DoT/HOT tick: debuffs we put on them resolve now
  // (targeting opposing team), and buffs we put on ourselves tick now (own
  // team). Single, focused tick pass per side — no overlapping floats.
  await processSideEnd(activeSide);
  if (checkBattleEnd()) return;

  sidesActedThisRound++;
  if (sidesActedThisRound >= 2) {
    // Prevent re-entry (summon executeAction could trigger finishSide again)
    if (_processingEndOfRound) return;
    _processingEndOfRound = true;
    // Both sides acted → end of round (guest processes identically via seeded random)
    // Round-end bookkeeping: lava/bubble/hiding shield, ink link, buff turns--,
    // critUp removal, phantomStrike trigger.
    await processRoundEndBuffs();
    if (checkBattleEnd()) { _processingEndOfRound = false; return; }
    {
      // Summon auto-action at end of turn (once per summon)
      for (const f of allFighters) {
        if (battleOver) break;
        if (!f.alive || !f.passive || f.passive.type !== 'summonAlly') continue;
        if (f._summon && f._summon.alive) {
          addLog(`${f._summon.emoji}${f._summon.name}(随从) 回合末自动出招！`);
          await sleep(400);
          await summonAutoAction(f._summon, f);
          if (checkBattleEnd()) { _processingEndOfRound = false; return; }
        }
      }
      await processFortuneGold();
      if (battleOver) { _processingEndOfRound = false; return; }
      // processLightningStorm now fires per-side-end in processSideEnd — no round-end call.
      if (typeof processEnergyWave === 'function') { await processEnergyWave(); if (battleOver) { _processingEndOfRound = false; return; } }
    }
    _processingEndOfRound = false;
    isFirstRound = false;
    turnNum++;
    sidesActedThisRound = 0;
    beginTurn();
    return;
  }

  // Switch to other side
  activeSide = activeSide === 'left' ? 'right' : 'left';
  actedThisSide = new Set(); _bossActionsThisRound = 0;
  await sleep(300);
  nextSideAction();
}

// Called after a fighter finishes their action (from executeAction)
function onActionComplete() {
  if (battleOver || _processingEndOfRound) return;
  nextSideAction();
}

// Mark fighter as acted and show action panel
function selectTurtleToAct(fIdx) {
  const f = allFighters[fIdx];
  if (!f || !f.alive) return;
  actedThisSide.add(fIdx);
  const picker = document.getElementById('turtlePicker');
  if (picker) picker.style.display = 'none';
  showActionPanel(f);
}

function backToPicker() {
  // Un-mark current fighter as acted, go back to turtle picker (no timer reset)
  if (currentActingFighter) {
    const fIdx = allFighters.indexOf(currentActingFighter);
    actedThisSide.delete(fIdx);
    const el = document.getElementById(getFighterElId(currentActingFighter));
    if (el) el.classList.remove('active-turn');
  }
  const panel = document.getElementById('actionPanel');
  if (panel) panel.classList.remove('show');
  clearTargetHighlights();
  document.getElementById('targetSelect').style.display = 'none';
  // Show picker directly without resetting timer
  const sideTeam = activeSide === 'left' ? leftTeam : rightTeam;
  const canAct = sideTeam.filter(f => f.alive && !actedThisSide.has(allFighters.indexOf(f)));
  if (canAct.length > 1) showTurtlePicker(canAct);
  else if (canAct.length === 1) { actedThisSide.add(allFighters.indexOf(canAct[0])); showActionPanel(canAct[0]); }
}

function renderSideIndicator() {
  const el = document.getElementById('sideIndicator');
  if (!el) return;
  if (gameMode === 'pvp-online') {
    const isMyTurn = activeSide === onlineSide;
    el.innerHTML = `<span class="side-ind ${isMyTurn?'side-ind-left':'side-ind-right'}">${isMyTurn?'⚔️ 你的回合':'⏳ 等待对手操作…'}</span>`;
  } else {
    const isLeft = activeSide === 'left';
    el.innerHTML = `<span class="side-ind ${isLeft?'side-ind-left':'side-ind-right'}">${isLeft?'◀ 我方行动':'敌方行动 ▶'}</span>`;
  }
}
