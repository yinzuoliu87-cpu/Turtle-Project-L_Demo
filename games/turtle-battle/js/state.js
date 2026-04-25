// ══════════════════════════════════════════════════════════
// state.js — State sync, death processing, battle end,
//            lava/hunter/fortune/lightning/chest passives
// Depends on: engine.js (globals), combat.js
// ══════════════════════════════════════════════════════════

// Build lightweight state snapshot for online sync
function buildStateSync() {
  return {
    turnNum,
    activeSide,
    fighters: allFighters.map(f => ({
      hp: f.hp, maxHp: f.maxHp, shield: f.shield,
      atk: f.atk, def: f.def, mr: f.mr, baseAtk: f.baseAtk, baseDef: f.baseDef, baseMr: f.baseMr,
      alive: f.alive, crit: f.crit, armorPen: f.armorPen, armorPenPct: f.armorPenPct, magicPen: f.magicPen || 0, magicPenPct: f.magicPenPct || 0,
      _deathProcessed: f._deathProcessed, _isMech: f._isMech,
      _position: f._position, // front/back row
      _inkStacks: f._inkStacks, _shockStacks: f._shockStacks,
      _starEnergy: f._starEnergy, _goldCoins: f._goldCoins,
      _storedEnergy: f._storedEnergy || 0, // shell energy
      _lavaRage: f._lavaRage || 0, _lavaTransformed: f._lavaTransformed || false,
      _lavaTransformTurns: f._lavaTransformTurns || 0, _lavaSpent: f._lavaSpent || false,
      _chestTreasure: f._chestTreasure || 0, _chestTier: f._chestTier || 0,
      _goldLightning: f._goldLightning || 0,
      _crystallize: f._crystallize || 0, _collideStacks: f._collideStacks || 0,
      _undeadLockTurns: f._undeadLockTurns || 0, _undeadLockUsed: f._undeadLockUsed || false,
      _stoneDefGained: f._stoneDefGained || 0,
      _bambooGainedHp: f._bambooGainedHp || 0,
      _dmgDealt: f._dmgDealt, _dmgTaken: f._dmgTaken,
      _physDmgDealt: f._physDmgDealt, _magicDmgDealt: f._magicDmgDealt, _trueDmgDealt: f._trueDmgDealt,
      _physDmgTaken: f._physDmgTaken, _magicDmgTaken: f._magicDmgTaken, _trueDmgTaken: f._trueDmgTaken,
      _bambooCharged: f._bambooCharged, _bambooCounter: f._bambooCounter,
      _hunterKills: f._hunterKills, _hunterStolenAtk: f._hunterStolenAtk || 0,
      _hunterStolenDef: f._hunterStolenDef || 0, _hunterStolenHp: f._hunterStolenHp || 0,
      _lifestealPct: f._lifestealPct || 0,
      _drones: f._drones ? f._drones.length : 0,
      _isPirateShip: f._isPirateShip || false,
      _phantomStrike: f._phantomStrike || null,
      bubbleStore: f.bubbleStore, bubbleShieldVal: f.bubbleShieldVal, bubbleShieldTurns: f.bubbleShieldTurns,
      name: f.name, emoji: f.emoji,
      buffs: f.buffs.map(b => ({...b})),
      skills: f.skills.map(s => ({ cdLeft: s.cdLeft })),
    })),
  };
}

// Apply state sync from host (guest side)
function applyStateSync(state) {
  turnNum = state.turnNum;
  activeSide = state.activeSide;
  state.fighters.forEach((sf, i) => {
    if (!allFighters[i]) return;
    const f = allFighters[i];
    f.hp = sf.hp; f.maxHp = sf.maxHp; f.shield = sf.shield;
    f.atk = sf.atk; f.def = sf.def; f.mr = sf.mr; f.baseAtk = sf.baseAtk; f.baseDef = sf.baseDef; f.baseMr = sf.baseMr;
    f.alive = sf.alive; f.crit = sf.crit;
    f.armorPen = sf.armorPen; f.armorPenPct = sf.armorPenPct; f.magicPen = sf.magicPen || 0; f.magicPenPct = sf.magicPenPct || 0;
    f._deathProcessed = sf._deathProcessed; f._isMech = sf._isMech;
    f._position = sf._position || f._position;
    f._inkStacks = sf._inkStacks; f._shockStacks = sf._shockStacks;
    f._starEnergy = sf._starEnergy; f._goldCoins = sf._goldCoins;
    f._storedEnergy = sf._storedEnergy || 0;
    f._lavaRage = sf._lavaRage || 0; f._lavaTransformed = sf._lavaTransformed || false;
    f._lavaTransformTurns = sf._lavaTransformTurns || 0; f._lavaSpent = sf._lavaSpent || false;
    f._chestTreasure = sf._chestTreasure || 0; f._chestTier = sf._chestTier || 0;
    f._goldLightning = sf._goldLightning || 0;
    f._crystallize = sf._crystallize || 0; f._collideStacks = sf._collideStacks || 0;
    f._undeadLockTurns = sf._undeadLockTurns || 0; f._undeadLockUsed = sf._undeadLockUsed || false;
    f._stoneDefGained = sf._stoneDefGained || 0;
    f._bambooGainedHp = sf._bambooGainedHp || 0;
    f._dmgDealt = sf._dmgDealt; f._dmgTaken = sf._dmgTaken;
    f._physDmgDealt = sf._physDmgDealt; f._magicDmgDealt = sf._magicDmgDealt; f._trueDmgDealt = sf._trueDmgDealt;
    f._physDmgTaken = sf._physDmgTaken; f._magicDmgTaken = sf._magicDmgTaken; f._trueDmgTaken = sf._trueDmgTaken;
    f._bambooCharged = sf._bambooCharged; f._bambooCounter = sf._bambooCounter;
    f._hunterKills = sf._hunterKills; f._hunterStolenAtk = sf._hunterStolenAtk || 0;
    f._hunterStolenDef = sf._hunterStolenDef || 0; f._hunterStolenHp = sf._hunterStolenHp || 0;
    f._lifestealPct = sf._lifestealPct || 0;
    f._isPirateShip = sf._isPirateShip || false;
    f._phantomStrike = sf._phantomStrike || null;
    f.bubbleStore = sf.bubbleStore; f.bubbleShieldVal = sf.bubbleShieldVal; f.bubbleShieldTurns = sf.bubbleShieldTurns;
    if (sf.name) f.name = sf.name;
    if (sf.emoji) f.emoji = sf.emoji;
    f.buffs = sf.buffs;
    sf.skills.forEach((ss, si) => { if (f.skills[si]) f.skills[si].cdLeft = ss.cdLeft; });
    // Re-render
    const elId = getFighterElId(f);
    updateHpBar(f, elId);
    updateFighterStats(f, elId);
    renderStatusIcons(f);
    const card = document.getElementById(elId);
    if (card) card.classList.toggle('dead', !f.alive);
    // Summon sync
    if (f._summon) updateSummonHpBar(f._summon);
  });
  updateDmgStats();
}

// ── DEATH & WIN ───────────────────────────────────────────

// Revive helper: shared by every revive path (phoenix/angel/shell/rule/...)
// Resets death flags, clears death CSS classes & inline styles, shows label,
// spawns HP number, refreshes HP bar & status icons, logs, plays SFX, and
// runs an optional onRevive callback for path-specific bonuses (ATK boost,
// enemy debuffs, etc.). All revive branches in checkDeaths delegate here.
function reviveFighter(f, opts) {
  const hpPct = opts.hpPct != null ? opts.hpPct : 20;
  f.hp = Math.round(f.maxHp * hpPct / 100);
  f.alive = true;
  f._deathProcessed = false;
  f._pendingDeath = false;
  const elId = getFighterElId(f);
  const card = document.getElementById(elId);
  if (card) {
    card._pendingDead = false;
    card.classList.remove('dead','death-anim');
    card.style.opacity = '';
    card.style.filter = '';
  }
  if (opts.label) {
    spawnFloatingNum(elId, opts.label, opts.labelCls || 'crit-label', 0, -25);
  }
  spawnFloatingNum(elId, `+${f.hp}HP`, 'heal-num', 200, 0);
  updateHpBar(f, elId);
  renderStatusIcons(f);
  if (card) {
    // Double-check visual state after one frame (some revive flows race with re-renders)
    requestAnimationFrame(() => {
      const c = document.getElementById(elId);
      if (c) { c.classList.remove('dead','death-anim'); c.style.opacity = ''; }
    });
  }
  if (opts.log) addLog(opts.log);
  if (opts.sfx !== false) { try { sfxRebirth(); } catch(e) {} }
  if (typeof opts.onRevive === 'function') opts.onRevive(f);
}

function checkDeaths(attacker) {
  allFighters.forEach(f => {
    if (f.hp <= 0 && !f._deathProcessed) {
      // Phoenix rebirth: revive once
      if (f.passive && f.passive.type === 'phoenixRebirth' && !f._rebirthUsed) {
        f._rebirthUsed = true;
        reviveFighter(f, {
          hpPct: f._phoenixEnhancedRebirth ? 100 : f.passive.revivePct,
          label: '涅槃重生!',
          log: `${f.emoji}${f.name} <span class="log-passive">涅槃重生！以${f.passive.revivePct}%HP复活！</span>`,
          onRevive: (ff) => {
            // Enhanced rebirth: +20% ATK
            if (ff._phoenixEnhancedRebirth) {
              const atkBoost = Math.round(ff.baseAtk * 0.2);
              ff.baseAtk += atkBoost; ff.atk += atkBoost;
              spawnFloatingNum(getFighterElId(ff), `+${atkBoost}ATK`, 'passive-num', 400, 0);
            }
            // Burn + healReduce to all enemies
            const rebirthEnemies = allFighters.filter(e => e.alive && e.side !== ff.side);
            for (const e of rebirthEnemies) {
              applySkillDebuffs({ burn: true }, e, ff);
              const existing = e.buffs.find(b => b.type === 'healReduce');
              if (existing) existing.turns = 3;
              else e.buffs.push({ type: 'healReduce', value: 50, turns: 3 });
              spawnFloatingNum(getFighterElId(e), '🔥灼烧+☠️削减', 'debuff-label', 300, -10);
              renderStatusIcons(e);
            }
            addLog(`${ff.emoji}${ff.name} 涅槃之火灼烧全体敌人！`);
          }
        });
        return;
      }

      // Angel passive skill revive (圣光)
      if (f._angelRevive && !f._angelReviveUsed) {
        f._angelReviveUsed = true;
        reviveFighter(f, {
          hpPct: 25, label: '😇圣光重生!',
          log: `${f.emoji}${f.name} <span class="log-passive">😇圣光之力！以25%HP重生！</span>`
        });
        return;
      }

      // Chest phoenix equip: mark for pending revive (animated in executeAction)
      // Not delegating to reviveFighter — the full animation is played later.
      if (hasChestEquip(f, 'phoenix') && !f._chestReviveUsed) {
        f._chestReviveUsed = true;
        f._pendingChestRevive = true;
        f.alive = true;
        f.hp = 1;
        f._pendingDeath = false;
        return;
      }

      // Equipment: 复活海螺 — revive with 20% HP once
      if (f._equipRevive) {
        f._equipRevive = false;
        reviveFighter(f, {
          hpPct: 20, label: '🐌复活!',
          log: `${f.emoji}${f.name} <span class="log-passive">🐌复活海螺！以20%HP复活！</span>`
        });
        return;
      }

      // Battle rule: 亡灵之日 — revive with 15% HP once
      if (f._ruleRevive) {
        f._ruleRevive = false;
        const icon = '<img src="assets/passive/undead-rage-icon.png" style="width:16px;height:16px;vertical-align:middle">';
        reviveFighter(f, {
          hpPct: 15, label: `${icon}亡灵复活!`,
          log: `${f.emoji}${f.name} <span class="log-passive">${icon}亡灵之日！以15%HP复活！</span>`
        });
        return;
      }

      // CyberDrone: transform drones into mech
      if (f.passive && f.passive.type === 'cyberDrone' && f._drones && f._drones.length > 0 && !f._isMech) {
        // Mark for pending mech transform (handled async in executeAction after checkDeaths)
        f._pendingMech = f._drones.length;
        f._drones = [];
        f._isMech = true;
        f.alive = true; // keep alive so checkBattleEnd doesn't trigger
        f.hp = 1; // temporary 1HP to stay alive
        f._pendingDeath = false;
        return; // skip normal death
      }

      f.alive = false; f.hp = 0; f._deathProcessed = true; f._pendingDeath = false;
      const elId = getFighterElId(f);
      const deadEl = document.getElementById(elId);
      if (deadEl) {
        // Strip residual attack/hit classes so their animationend doesn't fire
        // our death-anim listener prematurely (would add 'dead' class instantly)
        deadEl.classList.remove('attack-anim','attack-hop','hit-shake','hit-physical','hit-magic','hit-true','hit-crit');
        // Force reflow so death-anim starts fresh from frame 0
        void deadEl.offsetWidth;
        deadEl.classList.add('death-anim');
        deadEl._pendingDead = true;
        const onDeathEnd = (ev) => {
          // Only respond to our own death animation (other child anims also bubble here)
          if (!ev.animationName || !/^deathHop/.test(ev.animationName)) return;
          deadEl.removeEventListener('animationend', onDeathEnd);
          if (deadEl._pendingDead) deadEl.classList.add('dead');
        };
        deadEl.addEventListener('animationend', onDeathEnd);
      }
      // Play death sprite overlay if config exists (plays concurrently with CSS hop-back)
      if (typeof playDeathAnimation === 'function') playDeathAnimation(f);
      // Screen flash
      const flash = document.createElement('div');
      flash.className = 'death-screen-flash';
      document.body.appendChild(flash);
      flash.addEventListener('animationend', () => flash.remove(), { once:true });
      updateHpBar(f, elId);
      addLog(`${f.emoji}${f.name} 被击败！`,'death');
      try { sfxDeath(); } catch(e) {}

      // Passive: deathExplode — deal % maxHP damage to killer
      if (f.passive && f.passive.type === 'deathExplode' && attacker && attacker.alive) {
        const dmg = Math.round(f.maxHp * f.passive.pct / 100);
        attacker.hp = Math.max(0, attacker.hp - dmg);
        const aElId = getFighterElId(attacker);
        spawnFloatingNum(aElId, `-${dmg}`, 'death-explode', 200, 0);
        updateHpBar(attacker, aElId);
        try { sfxExplosion(); } catch(e) {}
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">死亡爆炸！</span>对 ${attacker.emoji}${attacker.name} 造成 <span class="log-direct">${dmg}物理</span>`);
        if (attacker.hp <= 0) { attacker.alive = false; }
      }

      // Passive: deathHook / pirateBarrage deathHook — deal % maxHP as PIERCE damage to killer
      const hookPct = (f.passive && f.passive.type === 'deathHook') ? f.passive.pct
                    : (f.passive && f.passive.type === 'pirateBarrage') ? f.passive.deathHookPct : 0;
      if (hookPct > 0 && attacker && attacker.alive) {
        const dmg = Math.round(f.maxHp * hookPct / 100);
        applyRawDmg(f, attacker, dmg, true, false, 'true');
        const aElId = getFighterElId(attacker);
        spawnFloatingNum(aElId, `-${dmg}`, 'pierce-dmg', 200, 0);
        updateHpBar(attacker, aElId);
        try { triggerOnHitEffects(f, attacker, dmg); } catch(e) {}
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">钩锁！</span>对 ${attacker.emoji}${attacker.name} 造成 <span class="log-pierce">${dmg}真实伤害</span>`);
        if (attacker.hp <= 0) { attacker.alive = false; }
      }

      // Passive: ghostCurse — curse all enemies on death with pierce DoT
      if (f.passive && f.passive.type === 'ghostCurse') {
        const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
        for (const e of enemies) {
          const dotDmg = Math.round(e.maxHp * f.passive.hpPct / 100);
          // floatCls: 'true-dmg' marks the tick as true (white) — curse bypasses
          // armor mechanically and should read white in the float stack.
          e.buffs.push({ type:'dot', value:dotDmg, turns:f.passive.turns, sourceSide: f.side, floatCls:'true-dmg' });
          const eElId = getFighterElId(e);
          spawnFloatingNum(eElId, `<img src="assets/status/curse-debuff-icon.png" style="width:16px;height:16px;vertical-align:middle">诅咒!`, 'crit-label', 0, -20);
          renderStatusIcons(e);
        }
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">怨灵诅咒！全体敌人每回合受10%最大HP持续伤害 ${f.passive.turns}回合</span>`);
      }

      // Passive: healOnKill — killer heals
      if (attacker && attacker.alive && attacker.passive && attacker.passive.type === 'healOnKill') {
        const heal = Math.round(attacker.maxHp * attacker.passive.pct / 100);
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
        const aElId = getFighterElId(attacker);
        spawnFloatingNum(aElId, `+${heal}`, 'heal-num', 400, 0);
        updateHpBar(attacker, aElId);
        addLog(`${attacker.emoji}${attacker.name} 被动：<span class="log-passive">击杀回血${heal}HP</span>`);
      }

      // Passive: hunterKill — any allied hunter steals stats when enemy dies
      const hunters = allFighters.filter(h => h.alive && h.side !== f.side && h.passive && h.passive.type === 'hunterKill');
      for (const hunter of hunters) {
        const sAtk = Math.round(f.baseAtk * hunter.passive.stealPct / 100);
        const sDef = Math.round(f.baseDef * hunter.passive.stealPct / 100);
        const sMr  = Math.round((f.baseMr || f.baseDef) * hunter.passive.stealPct / 100);
        const sHp  = Math.round(f.maxHp   * hunter.passive.stealPct / 100);
        hunter.baseAtk += sAtk; hunter.baseDef += sDef; hunter.baseMr = (hunter.baseMr || hunter.baseDef) + sMr; hunter.maxHp += sHp; hunter.hp += sHp;
        hunter._hunterKills = (hunter._hunterKills || 0) + 1;
        hunter._hunterStolenAtk = (hunter._hunterStolenAtk || 0) + sAtk;
        hunter._hunterStolenDef = (hunter._hunterStolenDef || 0) + sDef;
        hunter._hunterStolenMr = (hunter._hunterStolenMr || 0) + sMr;
        hunter._hunterStolenHp = (hunter._hunterStolenHp || 0) + sHp;
        if (hunter.passive.lifesteal) hunter._lifestealPct = (hunter._lifestealPct || 0) + hunter.passive.lifesteal;
        // Count stolen HP as damage dealt
        if (hunter._dmgDealt !== undefined) hunter._dmgDealt += sHp;
        const hElId = getFighterElId(hunter);
        spawnFloatingNum(hElId, `+${sAtk}攻+${sDef}甲+${sMr}抗+${sHp}HP`, 'passive-num', 300, 0);
        updateHpBar(hunter, hElId);
        recalcStats();
        updateFighterStats(hunter, hElId);
        addLog(`${hunter.emoji}${hunter.name} 被动：<span class="log-passive">🏹猎杀吸收 攻+${sAtk} 甲+${sDef} 抗+${sMr} HP+${sHp}</span>`);
      }

      // Fortune gold: all alive fortune turtles gain 8 coins on any death
      allFighters.forEach(fg => {
        if (fg.alive && fg.passive && fg.passive.type === 'fortuneGold') {
          fg._goldCoins += 9;
          const fgElId = getFighterElId(fg);
          spawnFloatingNum(fgElId, `+9<img src="assets/battle/gold-coin-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'passive-num', 500, 0);
          renderStatusIcons(fg);
          addLog(`${fg.emoji}${fg.name} 被动：<span class="log-passive">阵亡金币+9（共${fg._goldCoins}）</span>`);
        }
      });
    }
  });
  // Owner death → summon death
  allFighters.forEach(f => {
    if (!f.alive && f._summon && f._summon.alive) {
      processSummonDeath(f._summon, attacker, '主人阵亡，随从一同倒下！');
    }
  });
  // Check summon deaths from damage (summons are not in allFighters)
  allFighters.forEach(f => {
    if (f._summon && f._summon.alive && f._summon.hp <= 0) {
      processSummonDeath(f._summon, attacker);
    }
  });
}

function processSummonDeath(summon, attacker, extraMsg) {
  summon.alive = false;
  summon.hp = 0;
  const sElId = getFighterElId(summon);
  const sCard = document.getElementById(sElId);
  if (sCard) { sCard._pendingDead = true; sCard.classList.add('death-anim'); sCard.addEventListener('animationend', () => { if (sCard._pendingDead) sCard.classList.add('dead'); }, { once:true }); }
  updateSummonHpBar(summon);
  addLog(`${summon.emoji}${summon.name}(随从) ${extraMsg || '被击败！'}`,'death');

  // Trigger summon's death passives
  if (summon.passive) {
    // Death explode
    if (summon.passive.type === 'deathExplode' && attacker && attacker.alive) {
      const dmg = Math.round(summon.maxHp * summon.passive.pct / 100);
      attacker.hp = Math.max(0, attacker.hp - dmg);
      const aElId = getFighterElId(attacker);
      spawnFloatingNum(aElId, `-${dmg}`, 'death-explode', 200, 0);
      updateHpBar(attacker, aElId);
      try { sfxExplosion(); } catch(e) {}
      addLog(`${summon.emoji}${summon.name}(随从) 被动：<span class="log-passive">死亡爆炸！${dmg}伤害</span>`);
      if (attacker.hp <= 0) attacker.alive = false;
    }
    // Death hook / pirate
    const hookPct = (summon.passive.type === 'deathHook') ? summon.passive.pct
                  : (summon.passive.type === 'pirateBarrage') ? summon.passive.deathHookPct : 0;
    if (hookPct > 0 && attacker && attacker.alive) {
      const dmg = Math.round(summon.maxHp * hookPct / 100);
      applyRawDmg(summon, attacker, dmg, true, false, 'true');
      const aElId = getFighterElId(attacker);
      spawnFloatingNum(aElId, `-${dmg}`, 'pierce-dmg', 200, 0);
      updateHpBar(attacker, aElId);
      try { triggerOnHitEffects(summon, attacker, dmg); } catch(e) {}
      addLog(`${summon.emoji}${summon.name}(随从) 被动：<span class="log-passive">钩锁！${dmg}真实伤害</span>`);
      if (attacker.hp <= 0) attacker.alive = false;
    }
    // Ghost curse
    if (summon.passive.type === 'ghostCurse') {
      const enemies = (summon.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      for (const e of enemies) {
        const dotDmg = Math.round(e.maxHp * summon.passive.hpPct / 100);
        e.buffs.push({ type:'dot', value:dotDmg, turns:summon.passive.turns, sourceSide: summon.side, floatCls:'true-dmg' });
        const eElId = getFighterElId(e);
        spawnFloatingNum(eElId, `<img src="assets/status/curse-debuff-icon.png" style="width:16px;height:16px;vertical-align:middle">诅咒!`, 'crit-label', 0, -20);
        renderStatusIcons(e);
      }
      addLog(`${summon.emoji}${summon.name}(随从) 被动：<span class="log-passive">怨灵诅咒！</span>`);
    }
  }

  // Fortune gold on summon death
  allFighters.forEach(fg => {
    if (fg.alive && fg.passive && fg.passive.type === 'fortuneGold') {
      fg._goldCoins += 9;
      const fgElId = getFighterElId(fg);
      spawnFloatingNum(fgElId, `+9<img src="assets/battle/gold-coin-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'passive-num', 500, 0);
      renderStatusIcons(fg);
    }
  });
  // Hunter stat steal on summon death
  const hunters = allFighters.filter(h => h.alive && h.side !== summon.side && h.passive && h.passive.type === 'hunterKill');
  for (const hunter of hunters) {
    const sAtk = Math.round(summon.baseAtk * hunter.passive.stealPct / 100);
    const sDef = Math.round(summon.baseDef * hunter.passive.stealPct / 100);
    const sMr  = Math.round((summon.baseMr || summon.baseDef) * hunter.passive.stealPct / 100);
    const sHp  = Math.round(summon.maxHp * hunter.passive.stealPct / 100);
    hunter.baseAtk += sAtk; hunter.baseDef += sDef; hunter.baseMr = (hunter.baseMr || hunter.baseDef) + sMr; hunter.maxHp += sHp; hunter.hp += sHp;
    hunter._hunterKills = (hunter._hunterKills || 0) + 1;
    hunter._hunterStolenAtk = (hunter._hunterStolenAtk || 0) + sAtk;
    hunter._hunterStolenDef = (hunter._hunterStolenDef || 0) + sDef;
    hunter._hunterStolenMr = (hunter._hunterStolenMr || 0) + sMr;
    hunter._hunterStolenHp = (hunter._hunterStolenHp || 0) + sHp;
    // Count stolen HP as damage dealt
    if (hunter._dmgDealt !== undefined) hunter._dmgDealt += sHp;
    const hElId = getFighterElId(hunter);
    spawnFloatingNum(hElId, `+${sAtk}攻+${sDef}甲`, 'passive-num', 300, 0);
    recalcStats(); updateFighterStats(hunter, hElId);
  }
}

function checkBattleEnd() {
  // Both sides check battle end identically (seeded random ensures same state)
  // Don't end battle if a mech transform is pending
  if (allFighters.some(f => f._pendingMech)) return false;
  const lA = leftTeam.some(f=>f.alive), rA = rightTeam.some(f=>f.alive);
  if (!lA || !rA) {
    battleOver = true;
    unseedBattleRng();
    const _ap = document.getElementById('actionPanel'); if (_ap) _ap.classList.remove('show');
    // Host: notify guest of battle end
    if (gameMode === 'pvp-online' && onlineSide === 'left') {
      sendOnline({ type:'battle-end', leftWon: lA });
    }
    setTimeout(() => showResult(lA), 1200);
    return true;
  }
  return false;
}

// ── LAVA RAGE TRANSFORM ──────────────────────────────────
async function processLavaTransform() {
  for (const f of allFighters) {
    if (!f.alive || !f.passive || f.passive.type !== 'lavaRage') continue;
    // Check rage full → transform
    if (!f._lavaTransformed && !f._lavaSpent && f._lavaRage >= f.passive.rageMax) {
      f._lavaTransformed = true;
      f._lavaTransformTurns = f.passive.transformDuration;
      f._lavaRage = 0;
      const p = f.passive;
      const preAtk = f.atk;
      // Store small form skills
      f._lavaSmallSkills = f.skills;
      // Apply stat boosts
      const hpGain = Math.round(preAtk * p.transformHpScale);
      const atkGain = Math.round(preAtk * p.transformAtkScale);
      const defGain = Math.round(preAtk * p.transformDefScale);
      const mrGain = Math.round(preAtk * p.transformMrScale);
      f._lavaHpGain = hpGain; f._lavaAtkGain = atkGain; f._lavaDefGain = defGain; f._lavaMrGain = mrGain;
      const oldMax = f.maxHp;
      f.maxHp += hpGain;
      f.hp = Math.round(f.hp * f.maxHp / oldMax);
      f.baseAtk += atkGain;
      f.baseDef += defGain;
      f.baseMr = (f.baseMr || f.baseDef) + mrGain;
      recalcStats();
      // Switch to volcano skills — paired 1:1 with small form skills
      const pet = ALL_PETS.find(p => p.id === f.id);
      if (pet && pet.volcanoSkills) {
        const equippedIdxs = f._equippedIdxs || pet.defaultSkills || [0,1,2];
        f.skills = equippedIdxs
          .filter(i => i < pet.volcanoSkills.length && !pet.volcanoSkills[i].passiveSkill)
          .map(i => ({...pet.volcanoSkills[i], cdLeft:0}))
          .slice(0, 3); // max 3 active skills
        // Fallback: if no valid volcano skills, use first 3
        if (f.skills.length === 0) f.skills = pet.volcanoSkills.filter(s => !s.passiveSkill).slice(0,3).map(s => ({...s, cdLeft:0}));
      }
      f.name = '火山龟';
      f._lavaSmallImg = f.img;
      f._lavaSmallSprite = f.sprite;
      f.img = 'assets/passive/volcano-form-icon.png';
      f.emoji = '<img src="assets/battle/lava-shield-icon.png" style="width:16px;height:16px;vertical-align:middle">🐢';
      f.sprite = null;
      const elId = getFighterElId(f);
      // Visual
      spawnFloatingNum(elId, '<img src="assets/battle/lava-shield-icon.png" style="width:16px;height:16px;vertical-align:middle">变身！', 'crit-label', 0, -30);
      spawnFloatingNum(elId, `+${hpGain}HP +${atkGain}攻 +${defGain}甲 +${mrGain}抗`, 'passive-num', 200, 0);
      // Screen flash
      try {
        const flash = document.createElement('div');
        flash.className = 'mech-transform-flash';
        flash.style.background = 'rgba(255,100,0,.35)';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 500);
      } catch(e) {}
      updateHpBar(f, elId);
      renderFighterCard(f, elId);
      renderStatusIcons(f);
      addLog(`${f.emoji}${f.name} <span class="log-passive"><img src="assets/battle/lava-shield-icon.png" style="width:16px;height:16px;vertical-align:middle">怒气爆发！变身为火山龟！+${hpGain}HP +${atkGain}攻 +${defGain}甲 +${mrGain}抗</span>`);
      await sleep(800);
      // Transform AOE: 120% post-transform ATK magic damage + burn to all enemies
      const aoeDmg = Math.round(f.atk * p.transformAoeDmgScale);
      const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
      for (const e of enemies) {
        const effMr = calcEffDef(f, e, 'magic');
        const dmg = Math.max(1, Math.round(aoeDmg * calcDmgMult(effMr)));
        applyRawDmg(f, e, dmg, false, false, 'magic');
        const eElId = getFighterElId(e);
        spawnFloatingNum(eElId, `-${dmg}<img src="assets/battle/lava-shield-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'magic-dmg', 0, 0, {atkSide:f.side, amount:dmg});
        updateHpBar(e, eElId);
        if (!(e.passive && e.passive.burnImmune)) {
          applySkillDebuffs({burn:true}, e, f);
          // Heal 8% lost HP per burn applied
          const lostHp = f.maxHp - f.hp;
          const burnHeal = Math.round(lostHp * 0.08);
          const actual = applyHeal(f, burnHeal);
          if (actual > 0) {
            spawnFloatingNum(getFighterElId(f), `+${actual}`, 'heal-num', 200, 0);
            updateHpBar(f, getFighterElId(f));
          }
        }
      }
      addLog(`${f.emoji}${f.name} 变身冲击波：全体敌方 <span class="log-magic">${aoeDmg}魔法伤害</span> + <span style="color:#ff6600">灼烧</span> + 回复`);
      await sleep(600);
      checkDeaths(f);
      if (checkBattleEnd()) return;
    }
  }
}

// Lava transform countdown (called in beginTurn per-turn passives)
function processLavaCountdown(f) {
  if (!f.passive || f.passive.type !== 'lavaRage' || !f._lavaTransformed) return;
  f._lavaTransformTurns--;
  if (f._lavaTransformTurns <= 0) {
    // Revert to small form — can rage again
    f._lavaTransformed = false;
    f._lavaSpent = false;
    f._lavaRage = 0;
    // Revert stats
    const oldMax = f.maxHp;
    f.maxHp -= f._lavaHpGain;
    f.hp = Math.max(1, Math.round(f.hp * f.maxHp / oldMax));
    f.baseAtk -= f._lavaAtkGain;
    f.baseDef -= f._lavaDefGain;
    f.baseMr = (f.baseMr || f.baseDef) - f._lavaMrGain;
    recalcStats();
    // Restore small skills
    if (f._lavaSmallSkills) f.skills = f._lavaSmallSkills;
    f.name = '熔岩龟';
    f.img = f._lavaSmallImg || '../../assets/pets/熔岩龟.png';
    f.emoji = '<img src="assets/battle/lava-shield-icon.png" style="width:16px;height:16px;vertical-align:middle">🐢';
    const pet = ALL_PETS.find(p => p.id === f.id);
    if (pet && pet.sprite) f.sprite = pet.sprite;
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, '变身结束', 'debuff-label', 0, -20);
    updateHpBar(f, elId);
    renderFighterCard(f, elId);
    renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} 火山形态结束，恢复小形态`);
  }
}

// ── HUNTER KILL PASSIVE ───────────────────────────────────
async function processHunterKill() {
  for (const f of allFighters) {
    if (!f.alive || !f.passive || f.passive.type !== 'hunterKill') continue;
    // Check ALL alive enemies (including summons and mechs)
    const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
    for (const e of enemies) {
      if (e.hp / e.maxHp < f.passive.hpThresh / 100 && !e._undeadLockTurns) {
        // Execute with animation!
        const eElId = getFighterElId(e);
        const fElAnim = getFighterElId(f);

        // Phase 1: big hunter icon overlay on target
        try {
          const targetEl = document.getElementById(eElId);
          const rect = targetEl ? targetEl.getBoundingClientRect() : {left:100,top:100,width:100,height:50};
          const icon = document.createElement('img');
          icon.src = 'assets/passive/hunter-kill-icon.png';
          icon.style.cssText = `position:fixed;width:120px;height:120px;z-index:9999;pointer-events:none;left:${rect.left+rect.width/2-60}px;top:${rect.top+rect.height/2-60}px;opacity:0.9;transition:opacity 0.3s,transform 0.3s;transform:scale(0.3)`;
          document.body.appendChild(icon);
          requestAnimationFrame(() => { icon.style.transform = 'scale(1)'; icon.style.opacity = '1'; });
          setTimeout(() => { icon.style.opacity = '0'; icon.style.transform = 'scale(1.5)'; }, 600);
          setTimeout(() => icon.remove(), 1000);
        } catch(err) {}
        await sleep(700);

        // Phase 2: arrow particles fly from hunter to target
        try {
          const fromEl = document.getElementById(fElAnim);
          const toEl = document.getElementById(eElId);
          if (fromEl && toEl) {
            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();
            for (let i = 0; i < 5; i++) {
              const arrow = document.createElement('div');
              arrow.className = 'mech-drone-particle';
              arrow.style.background = '#ff6b6b';
              arrow.style.boxShadow = '0 0 6px #ff0000';
              arrow.style.left = (fromRect.left + fromRect.width/2) + 'px';
              arrow.style.top = (fromRect.top + fromRect.height/2 + (i-2)*8) + 'px';
              document.body.appendChild(arrow);
              requestAnimationFrame(() => {
                arrow.style.transition = `all ${0.3 + i*0.05}s ease-in`;
                arrow.style.left = (toRect.left + toRect.width/2 - 6) + 'px';
                arrow.style.top = (toRect.top + toRect.height/2 - 6) + 'px';
                arrow.style.opacity = '0';
              });
              setTimeout(() => arrow.remove(), 1000);
            }
          }
        } catch(err) {}
        await sleep(500);

        // Phase 3: red flash + kill
        try {
          const flash = document.createElement('div');
          flash.className = 'mech-transform-flash';
          flash.style.background = 'rgba(255,50,50,.3)';
          document.body.appendChild(flash);
          setTimeout(() => flash.remove(), 400);
        } catch(err) {}

        spawnFloatingNum(eElId, '<img src="assets/passive/hunter-kill-icon.png" style="width:24px;height:24px;vertical-align:middle">猎杀!', 'crit-label', 0, -20);
        const execDmg = e.hp + e.shield;
        applyRawDmg(f, e, execDmg, false, false, 'true');
        // Keep alive temporarily for on-hit effects (bubble bind shield, etc.)
        e.alive = true;
        spawnFloatingNum(eElId, `-99999`, 'true-dmg', 100, 0, { atkSide: f.side, amount: execDmg });
        await triggerOnHitEffects(f, e, execDmg);
        e.hp = 0; e.alive = false;
        updateHpBar(e, eElId);
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">🏹猎杀！</span>${e.emoji}${e.name} 被斩杀！`,'death');
        await sleep(500);
        // Process death (handles revives: phoenix, angel, 亡灵之日, etc.)
        checkDeaths(f);
        if (checkBattleEnd()) return;
      }
    }
  }
}

// ── FORTUNE GOLD PASSIVE (per batch end) ──────────────────
async function processFortuneGold() {
  for (const f of allFighters) {
    if (!f.alive || !f.passive || f.passive.type !== 'fortuneGold') continue;
    const roll = 3 + Math.floor(Math.random() * 6); // 3~8
    f._goldCoins += roll;
    const fElId = getFighterElId(f);
    spawnFloatingNum(fElId, `+${roll}<img src="assets/battle/gold-coin-icon.png" style="width:14px;height:14px;vertical-align:middle">`, 'passive-num', 0, 0);
    renderStatusIcons(f);
    addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">获得${roll}金币（共${f._goldCoins}）</span>`);
    await sleep(300);
  }
}

// ── LIGHTNING STORM PASSIVE (side-end) ────────────────────
// Fires once per round, at the end of the owner's side's turn (right after
// DoT/HOT tick). Covers both full turtles and summons with the lightningStorm
// passive — so one call path is the single source of truth.
async function processLightningStorm(side) {
  for (const f of allFighters) {
    if (!f.alive || !f.passive || f.passive.type !== 'lightningStorm') continue;
    if (side && f.side !== side) continue; // only owners on the ending side
    const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
    if (!enemies.length) continue;
    const target = enemies[Math.floor(Math.random() * enemies.length)];
    const eElId = getFighterElId(target);
    spawnLightningStrike(eElId);
    const shockDmg = Math.round(f.atk * f.passive.shockScale);
    // Pierce damage through applyRawDmg
    applyRawDmg(f, target, shockDmg, true, false, 'true');
    const ownerTag = f._isSummon ? '(随从)' : '';
    spawnFloatingNum(eElId, `<img src="assets/passive/lightning-storm-icon.png" style="width:14px;height:14px;vertical-align:middle">${shockDmg}`, 'pierce-dmg', 0, 0);
    updateHpBar(target, eElId);
    addLog(`${f.emoji}${f.name}${ownerTag} 被动：<span class="log-pierce"><img src="assets/passive/lightning-storm-icon.png" style="width:14px;height:14px;vertical-align:middle">电击${target.emoji}${target.name} ${shockDmg}真实</span>`);
    await triggerOnHitEffects(f, target, shockDmg);
    checkDeaths(f);
    if (checkBattleEnd()) return;
    await sleep(600);
  }
}

// ── CHEST TURTLE EQUIPMENT SYSTEM ──────────────────────────
function checkChestEquipDraw(f) {
  if (!f.passive || f.passive.type !== 'chestTreasure') return;
  const thresholds = f.passive.thresholds;
  const pools = f.passive.pools;
  // Scale thresholds +3% per level so equip pacing doesn't trivialize at high levels.
  const lvMult = 1 + ((f._level || 1) - 1) * 0.03;
  const scaledThresh = (i) => Math.round(thresholds[i] * lvMult);
  // Heal % per tier (base/进阶/传说) so opening a chest also restores the turtle.
  const healPctByPool = [8, 11, 15];
  while (f._chestTier < thresholds.length && f._chestTreasure >= scaledThresh(f._chestTier)) {
    const poolIdx = f._chestTier < 2 ? 0 : f._chestTier < 4 ? 1 : 2;
    const pool = pools[poolIdx];
    const owned = f._chestEquips.map(e => e.id);
    const available = pool.filter(e => !owned.includes(e.id));
    if (!available.length) { f._chestTier++; continue; }
    const drawn = available[Math.floor(Math.random() * available.length)];
    f._chestEquips.push({...drawn});
    f._chestTier++;
    // Apply immediate stat effects
    applyChestEquip(f, drawn);
    const elId = getFighterElId(f);
    // Chest-open heal: scales with tier
    const healPct = healPctByPool[poolIdx];
    const healRaw = Math.round(f.maxHp * healPct / 100);
    const healed = typeof applyHeal === 'function' ? applyHeal(f, healRaw) : (() => {
      const before = f.hp; f.hp = Math.min(f.maxHp, f.hp + healRaw); return Math.round(f.hp - before);
    })();
    if (healed > 0) spawnFloatingNum(elId, `+${healed}`, 'heal-num', 200, 0);
    // Visual feedback
    const iconH = drawn.icon.endsWith && drawn.icon.endsWith('.png') ? `<img src="assets/${drawn.icon}" style="width:16px;height:16px;vertical-align:middle">` : drawn.icon;
    spawnFloatingNum(elId, `${iconH}${drawn.name}!`, 'crit-label', 0, -30);
    addLog(`${f.emoji}${f.name} 开启宝箱！获得 <span class="log-passive">${iconH}${drawn.name}</span>：${drawn.desc}${healed > 0 ? ` <span class="log-heal">(+${healed}HP)</span>` : ''}`);
    renderStatusIcons(f);
    updateFighterStats(f, elId);
    updateHpBar(f, elId);
  }
}

function applyChestEquip(f, equip) {
  if (equip.stat === 'atk') { f.baseAtk += Math.round(f.baseAtk * equip.pct / 100); }
  if (equip.stat === 'defMr') { f.baseDef += Math.round(f.baseDef * equip.pct / 100); f.baseMr = (f.baseMr||f.baseDef) + Math.round((f.baseMr||f.baseDef) * equip.pct / 100); if (equip.bonusHp) { f.maxHp += equip.bonusHp; f.hp += equip.bonusHp; } }
  if (equip.stat === 'crit') { f.crit += equip.pct / 100; }
  if (equip.stat === 'lifesteal') { f._lifestealPct = (f._lifestealPct || 0) + equip.pct; }
  if (equip.stat === 'crown') { f.baseAtk += Math.round(f.baseAtk * 40 / 100); f.crit += 0.4; f._extraCritDmgPerm = (f._extraCritDmgPerm || 0) + 0.25; f._lifestealPct = (f._lifestealPct || 0) + 15; }
  // 贪婪 passive: +4% ATK +7% maxHP per equip
  if (f._chestGreed) {
    const atkBonus = Math.round(f.baseAtk * 0.04);
    const hpBonus = Math.round(f.maxHp * 0.07);
    f.baseAtk += atkBonus;
    f.maxHp += hpBonus; f.hp += hpBonus;
    const elId = getFighterElId(f);
    spawnFloatingNum(elId, `贪婪+${atkBonus}攻+${hpBonus}HP`, 'passive-num', 400, 0);
    updateHpBar(f, elId);
  }
  recalcStats();
}

function hasChestEquip(f, equipId) {
  return f._chestEquips && f._chestEquips.some(e => e.id === equipId);
}
