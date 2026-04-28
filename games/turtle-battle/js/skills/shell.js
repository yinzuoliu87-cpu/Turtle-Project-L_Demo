async function doShellStrike(attacker, target, skill) {
  const tElId = getFighterElId(target);
  const hits = skill.hits; // 6
  const perHit = attacker.atk * skill.totalScale / hits;
  let totalNormal = 0, totalPierce = 0, totalShieldDmg = 0, totalCrits = 0;
  let totalDmgDealt = 0;

  const effectiveDef = calcEffDef(attacker, target);
  
  for (let i = 0; i < hits; i++) {
    if (!target.alive) continue; // keep animating remaining hits

    // Dodge check
    const dodgeBuff = target.buffs.find(b => b.type === 'dodge');
    if (dodgeBuff && Math.random() < dodgeBuff.value / 100) {
      spawnFloatingNum(tElId, '闪避!', 'dodge-num', 0, 0);
      await sleep(280);
      continue;
    }

    let effectiveCrit = attacker.crit;
    if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
      effectiveCrit += attacker.passive.pct / 100;
    }
    const isCrit = Math.random() < effectiveCrit;
    const critMult = isCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
    if (isCrit) totalCrits++;

    const isNormal = (i % 2 === 0); // index 0,2,4 = normal; 1,3,5 = pierce
    // Adjacency check once per hit: if no adjacent targets, main damage gets
    // a 1.5× compensation multiplier instead of fizzling the splash.
    const splashTargets = (skill.splashAdjacent > 0) ? adjacentFighters(target) : [];
    const isolatedBonus = (skill.splashAdjacent > 0 && splashTargets.length === 0) ? 1.5 : 1;
    const raw = Math.round(perHit * isolatedBonus);
    let dmg;
    const yOff = 0;

    if (isNormal) {
      dmg = Math.max(1, Math.round(raw * critMult * calcDmgMult(effectiveDef)));
      const { shieldAbs } = applyRawDmg(attacker, target, dmg, false, false, 'physical');
      totalNormal += dmg;
      totalShieldDmg += shieldAbs;

      spawnFloatingNum(tElId, `${dmg}`, isCrit ? 'crit-dmg' : 'direct-dmg', 80, yOff);
    } else {
      dmg = Math.max(1, Math.round(raw * critMult)); // pierce ignores DEF
      const { shieldAbs } = applyRawDmg(attacker, target, dmg, true, false, 'true');
      totalPierce += dmg;
      totalShieldDmg += shieldAbs;

      spawnFloatingNum(tElId, `${dmg}`, isCrit ? 'crit-pierce' : 'pierce-dmg', 80, yOff, {atkSide: attacker.side, amount: dmg});
    }
    totalDmgDealt += dmg;

    // Per-hit splash to adjacent enemies (up/down = same row col±1, front/back = other row same col).
    // Splash damage follows the main hit's type (isNormal→physical, else→true) and rolls its own crit.
    if (dmg > 0 && splashTargets.length > 0) {
      const basePerSplash = Math.round(perHit * skill.splashAdjacent / 100);
      if (basePerSplash > 0) {
        for (const e of splashTargets) {
          // Independent crit roll for each splash target
          let sEffCrit = attacker.crit;
          if (attacker.passive && attacker.passive.type === 'lowHpCrit' && attacker.hp / attacker.maxHp < 0.3) {
            sEffCrit += attacker.passive.pct / 100;
          }
          const sIsCrit = Math.random() < sEffCrit;
          const sCritMult = sIsCrit ? (1.5 + (attacker._extraCritDmg || 0) + (attacker._extraCritDmgPerm || 0)) : 1;
          let splashDmg;
          if (isNormal) {
            const sDef = calcEffDef(attacker, e);
            splashDmg = Math.max(1, Math.round(basePerSplash * sCritMult * calcDmgMult(sDef)));
            applyRawDmg(attacker, e, splashDmg, false, false, 'physical');
          } else {
            splashDmg = Math.max(1, Math.round(basePerSplash * sCritMult));
            applyRawDmg(attacker, e, splashDmg, true, false, 'true');
          }
          const eElId = getFighterElId(e);
          const cls = isNormal
            ? (sIsCrit ? 'crit-dmg' : 'direct-dmg')
            : (sIsCrit ? 'crit-pierce' : 'pierce-dmg');
          spawnFloatingNum(eElId, `${splashDmg}`, cls, 0, yOff, {atkSide: attacker.side, amount: splashDmg});
          updateHpBar(e, eElId);
          await triggerOnHitEffects(attacker, e, splashDmg);
        }
      }
    }

    await triggerOnHitEffects(attacker, target, dmg);

    const tEl = document.getElementById(tElId);
    if (tEl) { tEl.classList.add('hit-shake'); }
    updateHpBar(target, tElId);
    await sleep(500);
    if (tEl) { tEl.classList.remove('hit-shake'); }
    await sleep(150);
  }

  // Log
  const parts = [];
  if (totalNormal > 0) parts.push(`<span class="log-direct">${totalNormal}物理</span>`);
  if (totalPierce > 0) parts.push(`<span class="log-pierce">${totalPierce}真实</span>`);
  if (totalCrits > 0) parts.push(`<span class="log-crit">${totalCrits}暴击</span>`);
  const splashNote = skill.splashAdjacent > 0 ? ` (每段对相邻敌人溅射${skill.splashAdjacent}%)` : '';
  addLog(`${attacker.emoji}${attacker.name} <b>${skill.name}</b> 6段 → ${target.emoji}${target.name}：${parts.join(' + ')}${splashNote}`);
}

async function doShellCopy(caster, _skill) {
  // Blacklist: skills that make no sense when copied
  const COPY_BLACKLIST = ['shellCopy','twoHeadSteal','cyberDeploy','cyberBuff','hidingDefend',
    'hidingCommand','diceFate','fortuneDice','fortuneAllIn','bambooHeal','bambooLeaf','ghostPhase',
    'diamondFortify','iceShield','twoHeadSwitch','mechAttack','chestOpen',
    'gamblerDraw','gamblerBet','chestCount','chestSmash','starWormhole',
    'bubbleBurst', // 需要泡泡值才有伤害
    'shellAbsorb','shellErode','shellFortify', // 龟壳专属机制
    'fortuneBuyEquip','fortuneGainCoins', // 财神龟金币技能
    'ghostPhantom','starShieldBreak', // 依赖特殊状态
    'hidingBuffSummon', // 依赖随从/暴击率
  ];

  const enemies = (caster.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
  if (!enemies.length) { await sleep(500); return; }

  // Gather copyable {enemy, skill} pairs
  const pool = [];
  for (const e of enemies) {
    for (const s of e.skills) {
      if (!COPY_BLACKLIST.includes(s.type)) pool.push({ source: e, skill: s });
    }
  }
  if (!pool.length) {
    addLog(`${caster.emoji}${caster.name} <b>复制</b>：没有可复制的技能！`);
    await sleep(1000);
    return;
  }

  // Pick up to 2 random skills (no duplicate skill type)
  const picked = [];
  const shuffled = pool.sort(() => Math.random() - 0.5);
  for (const p of shuffled) {
    if (picked.length >= 2) break;
    if (!picked.find(x => x.skill.type === p.skill.type)) picked.push(p);
  }

  const COPY_MULT = 0.6;

  for (const { source, skill: origSkill } of picked) {
    if (!caster.alive || battleOver) break;

    const fElId = getFighterElId(caster);
    spawnFloatingNum(fElId, `复制: ${origSkill.name}`, 'crit-label', 0, 0);
    addLog(`${caster.emoji}${caster.name} <b>复制</b>了 ${source.emoji}${source.name} 的 <b>${origSkill.name}</b>！(60%效果)`);
    await sleep(600);

    // Deep copy and apply 60% scaling
    const copied = JSON.parse(JSON.stringify(origSkill));
    if (copied.power) copied.power = Math.round(copied.power * COPY_MULT);
    if (copied.pierce) copied.pierce = Math.round(copied.pierce * COPY_MULT);
    if (copied.atkScale) copied.atkScale *= COPY_MULT;
    if (copied.defScale) copied.defScale *= COPY_MULT;
    if (copied.hpPct) copied.hpPct *= COPY_MULT;
    if (copied.totalScale) copied.totalScale *= COPY_MULT;
    if (copied.pierceScale) copied.pierceScale *= COPY_MULT;
    if (copied.selfHpPct) copied.selfHpPct *= COPY_MULT;
    if (copied.shield) copied.shield = Math.round(copied.shield * COPY_MULT);
    if (copied.shieldFlat) copied.shieldFlat = Math.round(copied.shieldFlat * COPY_MULT);
    if (copied.shieldHpPct) copied.shieldHpPct *= COPY_MULT;
    if (copied.shieldAtkScale) copied.shieldAtkScale *= COPY_MULT;
    if (copied.heal) copied.heal = Math.round(copied.heal * COPY_MULT);
    if (copied.hot) copied.hot.hpPerTurn = Math.round(copied.hot.hpPerTurn * COPY_MULT);
    if (copied.dot) copied.dot.dmg = Math.round(copied.dot.dmg * COPY_MULT);
    if (copied.normalScale) copied.normalScale *= COPY_MULT;
    // Star meteor: no star energy on caster = 0 pierce (correct by design)
    copied.cdLeft = 0;

    // Target selection: auto, no picker
    const ALLY_TYPES = ['heal','shield','bubbleShield','angelBless'];
    const AOE_TYPES_SET = new Set(['hunterBarrage','ninjaBomb','lightningBarrage','iceFrost','basicBarrage','starMeteor','diceAllIn',
      'lavaQuake','volcanoErupt','rainbowStorm','pirateCannonBarrage','chestStorm','crystalBurst','soulReap','candyBarrage']);
    const SELF_TYPES_SET = new Set(['phoenixShield','lightningBuff','gamblerDraw','volcanoArmor','crystalBarrier']);

    let copyTarget;
    const isAlly = ALLY_TYPES.includes(copied.type);
    const isAoe = copied.aoe || copied.aoeAlly || AOE_TYPES_SET.has(copied.type);
    const isSelf = SELF_TYPES_SET.has(copied.type);

    if (isSelf || isAoe) {
      copyTarget = caster;
    } else if (isAlly) {
      const allies = (caster.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
      copyTarget = allies.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
    } else {
      const aliveEnemies = (caster.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      copyTarget = aliveEnemies.sort((a, b) => a.hp - b.hp)[0];
    }
    if (!copyTarget) continue;

    // Temporarily assign copied skill and execute via real engine
    const savedSkills = caster.skills;
    caster.skills = [...savedSkills, copied];
    const copiedIdx = caster.skills.length - 1;

    const atkEl = document.getElementById(getFighterElId(caster));
    atkEl.classList.add('attack-anim');

    // Use executeAction for full routing (lightning triggers, etc.)
    const savedOnAction = window.onActionComplete;
    const savedNext = window.nextAction;
    window.onActionComplete = () => {};
    window.nextAction = () => {};
    animating = false;
    try {
      await executeAction({
        attackerId: allFighters.indexOf(caster),
        skillIdx: copiedIdx,
        targetId: allFighters.indexOf(copyTarget),
        aoe: !!copied.aoe
      });
    } catch(e) {
      console.error('shellCopy exec error:', e);
      // Fallback: simple doDamage
      if (copyTarget && copyTarget.alive) await doDamage(caster, copyTarget, copied);
    }
    window.onActionComplete = savedOnAction;
    window.nextAction = savedNext;

    atkEl.classList.remove('attack-anim');
    caster.skills = savedSkills;

    checkDeaths(caster);
    if (checkBattleEnd()) return;
    await sleep(400);
  }
}

// ── LINE TURTLE (线条龟) ─────────────────────────────────
