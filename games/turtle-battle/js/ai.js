// ══════════════════════════════════════════════════════════
// ai.js — AI action selection
// Depends on: engine.js (globals), combat.js, action.js
// ══════════════════════════════════════════════════════════

function aiAction(f) {
  const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  const allies  = (f.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
  if (!enemies.length) return;
  const ready = f.skills.filter(s => s.cdLeft === 0);

  let skill;
  if (difficulty === 'easy') {
    skill = ready[Math.floor(Math.random()*ready.length)];
  } else {
    // normal & hard share logic with different thresholds
    const hpThresh = difficulty === 'hard' ? 0.35 : 0.4;
    const healS = ready.find(s => s.type==='heal');
    if (healS && allies.some(a => a.hp/a.maxHp < hpThresh)) { skill = healS; }
    else {
      const shieldS = ready.find(s => s.type==='shield');
      if (shieldS && allies.some(a => a.shield < 30)) skill = shieldS;
      else {
        const dmg = ready.filter(s => s.type!=='heal' && s.type!=='shield');
        if (dmg.length) {
          // Prefer higher-CD skills (ults). Most skills have power=0 and use
          // atkScale/pierceScale/etc, so power*hits scoring misses every ult —
          // CD is a reliable proxy: cd:6 is clearly bigger than cd:0.
          const byCd = dmg.slice().sort((a,b) => (b.cd||0) - (a.cd||0));
          const topCd = byCd[0].cd || 0;
          const ultGroup = byCd.filter(s => (s.cd||0) === topCd);
          const pickBest = () => ultGroup[Math.floor(Math.random()*ultGroup.length)];
          const pickRandom = () => dmg[Math.floor(Math.random()*dmg.length)];
          if (difficulty === 'hard') {
            // On hard: if a low-HP enemy can be finished, force ult; else 75% ult
            const lo = enemies.slice().sort((a,b) => a.hp - b.hp)[0];
            const bigHits = ultGroup[0].hits || 1;
            const bigScale = (ultGroup[0].atkScale || ultGroup[0].pierceScale || ultGroup[0].normalScale || 0);
            const est = bigScale * bigHits * f.atk;
            skill = lo && est > 0 && lo.hp < est * 0.6 ? ultGroup[0] : (Math.random() < 0.75 ? pickBest() : pickRandom());
          } else {
            // normal: 65% prefer ult group, 35% random for variety
            skill = Math.random() < 0.65 ? pickBest() : pickRandom();
          }
        } else skill = ready[0];
      }
    }
  }
  // Star turtle AI: only use meteor when energy is full
  if (f.passive && f.passive.type === 'starEnergy') {
    const meteorS = ready.find(s => s.type === 'starMeteor');
    if (meteorS) {
      const maxE = Math.round(f.maxHp * f.passive.maxChargePct / 100);
      if ((f._starEnergy || 0) < maxE) {
        const other = ready.filter(s => s.type !== 'starMeteor');
        if (other.length) skill = other.sort((a,b) => (b.cd||0) - (a.cd||0))[0];
      } else {
        skill = meteorS;
      }
    }
  }
  // Fortune turtle AI: dice×3 → allIn R4 → dice → alternate
  if (!skill) skill = ready[0];
  if (f.passive && f.passive.type === 'fortuneGold') {
    const allInSkill = ready.find(s => s.type === 'fortuneAllIn');
    const diceSkill = ready.find(s => s.type === 'fortuneDice');
    const atkSkill = ready.filter(s => s.type === 'physical')[0];
    if (allInSkill) {
      if (turnNum <= 3) { skill = diceSkill || atkSkill || ready[0]; }
      else if (turnNum === 4) { skill = allInSkill; }
      else { skill = diceSkill || atkSkill || ready[0]; }
    } else {
      if (!f._fortunePostAllIn) f._fortunePostAllIn = 0;
      f._fortunePostAllIn++;
      if (f._fortunePostAllIn === 1) { skill = diceSkill || atkSkill || ready[0]; }
      else { skill = (f._fortunePostAllIn % 2 === 0) ? (atkSkill || diceSkill || ready[0]) : (diceSkill || atkSkill || ready[0]); }
    }
  }

  // Bubble turtle AI: only use bubbleBurst when bubbleStore > 0
  if (skill && skill.type === 'bubbleBurst' && (f.bubbleStore || 0) <= 0) {
    const other = ready.filter(s => s.type !== 'bubbleBurst');
    if (other.length) skill = other[0];
  }
  // Fortune turtle AI: skip fortuneBuyEquip when coins < 20
  if (skill && skill.type === 'fortuneBuyEquip' && (f._goldCoins||0) < 20) {
    const other = ready.filter(s => s.type !== 'fortuneBuyEquip');
    if (other.length) skill = other[0];
  }
  // Star turtle AI: only use starShieldBreak when enemies have shields
  if (skill && skill.type === 'starShieldBreak') {
    const hasShield = enemies.some(e => e.shield > 0 || e.bubbleShieldVal > 0);
    if (!hasShield) {
      const other = ready.filter(s => s.type !== 'starShieldBreak');
      if (other.length) skill = other[0];
    }
  }
  // Hiding turtle AI: skip hidingCommand/hidingBuffSummon when summon dead
  if (skill && (skill.type === 'hidingCommand' || skill.type === 'hidingBuffSummon') && (!f._summon || !f._summon.alive)) {
    const other = ready.filter(s => s.type !== 'hidingCommand' && s.type !== 'hidingBuffSummon');
    if (other.length) skill = other[0];
  }

  let target;
  if (skill.type==='heal' || skill.type==='bambooHeal' || skill.type==='bubbleHeal' || skill.type==='crystalResHeal') target = allies.sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0];
  else if (skill.selfCast || skill.type==='shield' || skill.type==='hidingDefend' || skill.type==='hidingCommand' || skill.type==='ghostPhase' || skill.type==='diamondFortify' || skill.type==='diceFate' || skill.type==='chestOpen' || skill.type==='chestCount' || skill.type==='iceShield' || skill.type==='headlessRegen' || skill.type==='stoneTaunt' || skill.type==='ghostShadow' || skill.type==='starWarp' || skill.type==='hidingReflect' || skill.type==='starShield' || skill.type==='shellEnergyShield' || skill.type==='lightningShield') target = f; // self-cast
  else if (skill.type==='angelBless' || skill.type==='bubbleShield' || skill.type==='ninjaTrap' || skill.type==='bubbleBind' || skill.type==='phoenixPurify' || skill.type==='rainbowGuard') {
    // Ally-target skills: pick weakest ally (bubbleBind targets enemy but is listed in isAlly wrongly — fix here)
    if (skill.type==='bubbleBind') target = enemies.sort((a,b)=>a.hp-b.hp)[0]; // bubbleBind marks enemy
    else if (skill.type==='phoenixPurify') {
      // Prefer ally with most debuffs
      const debuffTypes = ['atkDown','defDown','mrDown','healReduce','poison','bleed','burn','cursed','chilled','spdDown'];
      target = allies.sort((a,b) => b.buffs.filter(bb=>debuffTypes.includes(bb.type)).length - a.buffs.filter(bb=>debuffTypes.includes(bb.type)).length)[0];
      if (!target.buffs.some(b=>debuffTypes.includes(b.type))) target = allies.sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0]; // no debuffs, heal lowest
    }
    else target = allies.sort((a,b)=>(a.hp/a.maxHp)-(b.hp/b.maxHp))[0];
  }
  else if (skill.aoe || skill.aoeAlly) { target = f; /* AOE skills don't need specific target */ }
  else {
    // Smart targeting: front row priority, prefer low HP, avoid undead lock
    // Taunt: if any enemy has taunt, forced to target them
    const taunters = enemies.filter(e => e.buffs.some(b => b.type === 'taunt'));
    if (taunters.length > 0 && !skill.ignoreRow && !skill.aoe) {
      target = taunters[0];
    } else {
      // Filter to front row if any alive front row exists
      let filteredEnemies = enemies;
      let targetPool;
      if (skill.ignoreRow) {
        // ignoreRow skills can target anyone; prefer back row if knockToFront
        if (skill.knockToFront) {
          const backEnemies = filteredEnemies.filter(e => e._position === 'back');
          targetPool = backEnemies.length > 0 ? backEnemies : filteredEnemies;
        } else {
          targetPool = filteredEnemies;
        }
      } else {
        const frontEnemies = filteredEnemies.filter(e => e._position === 'front');
        targetPool = frontEnemies.length > 0 ? frontEnemies : filteredEnemies;
      }
      if (targetPool.length === 1) {
        target = targetPool[0];
      } else if (targetPool.length > 1) {
        const sorted = targetPool.slice().sort((a,b) => (a.hp/a.maxHp) - (b.hp/b.maxHp));
        const lowest = sorted[0];
        const lowestRatio = lowest.hp / lowest.maxHp;
        // Undead lock: avoid locked target
        if (lowest._undeadLockTurns > 0) {
          const nonLocked = sorted.find(e => !e._undeadLockTurns);
          target = nonLocked || lowest;
        }
        // HP < 20%: 90% chance to focus
        else if (lowestRatio < 0.2 && Math.random() < 0.9) { target = lowest; }
        // General: 70% chance to target lowest HP, 30% random
        else if (Math.random() < 0.7) { target = lowest; }
        else { target = targetPool[Math.floor(Math.random() * targetPool.length)]; }
      } else {
        target = enemies[0]; // fallback
      }
    }
  }

  executeAction({ attackerId:allFighters.indexOf(f), skillIdx:f.skills.indexOf(skill), targetId:allFighters.indexOf(target), aoe: !!skill.aoe });
}
