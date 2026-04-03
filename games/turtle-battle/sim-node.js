#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   龟龟对战 — Node.js 全引擎平衡模拟器
   用法: node sim-node.js [模拟次数] [--matrix]
   例: node sim-node.js 30 --matrix
   ═══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

// ── DOM/Browser Mock Layer ─────────────────────────────────
const _noop = () => {};
const _mockEl = {
  classList: { add:_noop, remove:_noop, toggle:_noop, contains:()=>false },
  style: {}, querySelector: () => _mockEl, querySelectorAll: () => [],
  appendChild:_noop, insertBefore:_noop, remove:_noop, setAttribute:_noop,
  addEventListener:_noop, removeEventListener:_noop,
  getBoundingClientRect:()=>({left:0,top:0,width:100,height:50,right:100,bottom:50}),
  innerHTML:'', textContent:'', id:'mock',
};
global.document = {
  getElementById: () => _mockEl,
  querySelector: () => _mockEl,
  querySelectorAll: () => [],
  createElement: () => ({...JSON.parse(JSON.stringify(_mockEl)),
    classList:{add:_noop,remove:_noop,toggle:_noop,contains:()=>false},
    style:{}, querySelector:()=>_mockEl, appendChild:_noop, remove:_noop,
    insertBefore:_noop, setAttribute:_noop,
    addEventListener:_noop, removeEventListener:_noop,
    getBoundingClientRect:()=>({left:0,top:0,width:100,height:50,right:100,bottom:50})}),
  head: { appendChild:_noop },
  body: { appendChild:_noop },
  addEventListener: _noop,
};
global.window = global;
global.localStorage = { getItem:()=>null, setItem:_noop, removeItem:_noop };
global.navigator = { clipboard: { writeText: () => Promise.resolve() } };
global.BroadcastChannel = function(){ this.postMessage=_noop; this.onmessage=null; };
global.Peer = function(){ this.on=_noop; this.connect=()=>({on:_noop,send:_noop,open:false}); this.destroy=_noop; };
global.fetch = () => Promise.resolve({ json: () => Promise.resolve([]) });
global.requestAnimationFrame = (fn) => { return 0; }; // don't execute — visual only
global.performance = { now: () => Date.now() };
global.AudioContext = global.webkitAudioContext = function(){};
const _realSetTimeout = global.setTimeout;
const _realClearTimeout = global.clearTimeout;
// Override setTimeout to be instant for game sleep() calls, but keep real one for internals
global.setTimeout = (fn, ms) => {
  if (typeof fn === 'function') { fn(); return 0; }
  return _realSetTimeout(fn, ms);
};
global.clearTimeout = (id) => { if (id) _realClearTimeout(id); };

// Mock all SFX
['sfxHit','sfxCrit','sfxPierce','sfxShield','sfxShieldBreak','sfxHeal','sfxDeath',
 'sfxRebirth','sfxBuff','sfxDebuff','sfxDodge','sfxFire','sfxLightning','sfxCoin',
 'sfxExplosion','sfxCounter','sfxTrap','sfxBattleStart','sfxVictory','sfxDefeat',
 'sfxClick','sfxTurnStart','sfxBambooCharge','sfxBambooHit','toggleSound','ensureAudio'
].forEach(name => { global[name] = _noop; });

// ── Load Real Engine Code ──────────────────────────────────
const dir = path.join(__dirname, 'js');
const files = ['pets.js', 'engine.js', 'skills.js', 'ui.js', 'main.js'];
const combined = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

// Replace const/let with var for global scope in vm
const evalCode = combined
  .replace(/^const /gm, 'var ')
  .replace(/^let /gm, 'var ');

const vm = require('vm');
vm.runInThisContext(evalCode);

// Override sleep to be instant
global.sleep = () => Promise.resolve();

// Override UI functions that might cause issues
global.showScreen = _noop;
global.showToast = _noop;
global.renderFighters = _noop;
global.renderFighterCard = _noop;
global.renderSummonMiniCard = _noop;
global.updateSummonHpBar = _noop;
global.updateFighterStats = _noop;
global.updateHpBar = _noop;
global.renderStatusIcons = _noop;
global.renderSideIndicator = _noop;
global.spawnFloatingNum = _noop;
global.updateDmgStats = _noop;
global.showPassivePopup = _noop;
global.toggleHelp = _noop;
global.toggleDmgStats = _noop;

// ── Sim Battle Function ────────────────────────────────────
async function simBattle(leftIds, rightIds, maxTurns = 40) {
  resetBattleState();
  gameMode = 'pve';
  animating = false;
  _actionQueue = [];
  onlineSide = null;
  leftTeam = leftIds.map(id => createFighter(id, 'left'));
  rightTeam = rightIds.map(id => createFighter(id, 'right'));
  allFighters = [...leftTeam, ...rightTeam];
  battleOver = false;
  turnNum = 1;

  // Apply one-time passives
  allFighters.forEach(f => {
    if (!f.passive) return;
    if (f.passive.type === 'ninjaInstinct') {
      f.crit += f.passive.critBonus / 100;
      f._extraCritDmgPerm = (f.passive.critDmgBonus || 0) / 100;
      f.armorPen += f.passive.armorPen || 0;
    }
    if (f.passive.type === 'twoHeadVitality') {
      f.shield += Math.round(f.maxHp * f.passive.shieldPct / 100);
      f._twoHeadHalfTriggered = false;
    }
    if (f.passive.type === 'frostAura') {
      const enemies = (f.side === 'left' ? rightTeam : leftTeam);
      for (const e of enemies) e.buffs.push({ type:'atkDown', value:f.passive.atkDownPct, turns:f.passive.atkDownTurns });
      recalcStats();
    }
    if (f.passive.type === 'pirateBarrage') {
      const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      if (enemies.length) {
        const t = enemies[Math.floor(Math.random() * enemies.length)];
        const dmg = Math.round(f.maxHp * f.passive.bombardPct / 100);
        applyRawDmg(f, t, dmg, true);
      }
    }
  });

  // Run turns
  for (let turn = 0; turn < maxTurns && !battleOver; turn++) {
    // CD tick
    allFighters.forEach(f => f.skills.forEach(s => { if (s.cdLeft > 0) s.cdLeft--; }));

    // Per-turn passives
    for (const f of allFighters) {
      if (!f.alive || !f.passive) continue;
      f.passiveUsedThisTurn = false;
      const p = f.passive;
      if (p.type === 'turnScaleAtk') { f.baseAtk += Math.round(f.baseAtk * p.pct / 100); }
      if (p.type === 'turnScaleHp') { const g = Math.round(f.maxHp * p.pct / 100); f.maxHp += g; f.hp += g; }
      if (p.type === 'stoneWall') {
        if (!f._stoneDefGained) f._stoneDefGained = 0;
        if (f._stoneDefGained < p.maxDef) {
          const g = Math.min(p.defGain, p.maxDef - f._stoneDefGained);
          f.baseDef += g; f._stoneDefGained += g;
        }
      }
      if (p.type === 'bambooCharge') {
        f._bambooFired = false;
        if (!f._bambooCharged) {
          f._bambooCounter = (f._bambooCounter || 0) + 1;
          if (f._bambooCounter >= 2) { f._bambooCharged = true; f._bambooCounter = 0; }
        }
      }
      if (p.type === 'rainbowPrism') {
        const allies = (f.side === 'left' ? leftTeam : rightTeam).filter(a => a.alive);
        const roll = Math.floor(Math.random() * 3);
        if (roll === 0) { for (const a of allies) { a.buffs.push({ type:'atkUp', value:Math.round(a.baseAtk * p.atkPct / 100), turns:2 }); } }
        else if (roll === 1) { for (const a of allies) { a.buffs.push({ type:'defUp', value:Math.round(a.baseDef * p.defPct / 100), turns:2 }); } }
        else { for (const a of allies) { a.hp = Math.min(a.maxHp, a.hp + Math.round(a.maxHp * p.healPct / 100)); } }
        recalcStats();
      }
      if (p.type === 'lightningStorm') {
        const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
        if (enemies.length) {
          const t = enemies[Math.floor(Math.random() * enemies.length)];
          const sDmg = Math.round(f.atk * p.shockScale);
          applyRawDmg(f, t, sDmg, true);
        }
      }
      if (p.type === 'candySteal' && turnNum === p.stealTurn) {
        const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
        if (enemies.length) {
          const t = enemies[Math.floor(Math.random() * enemies.length)];
          const stealAmt = Math.round(t.maxHp * p.stealPct / 100);
          t.maxHp -= stealAmt; t.hp = Math.min(t.hp, t.maxHp); if (t.hp <= 0) t.hp = 1;
          f.maxHp += stealAmt; f.hp += stealAmt;
        }
      }
      if (p.type === 'gamblerBlood') {
        const lostPct = Math.max(0, 1 - f.hp / f.maxHp);
        const threshold = p.maxCritAtLoss / 100;
        const maxGain = p.maxCritGain / 100;
        f.crit = (f._initCrit || 0.25) + Math.min(maxGain, lostPct / threshold * maxGain);
      }
      if (p.type === 'cyberDrone' && !f._isMech) {
        if (!f._drones) f._drones = [];
        if (f._drones.length < p.maxDrones) f._drones.push({ age: 0 });
        const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
        for (let di = 0; di < f._drones.length; di++) {
          const alive = enemies.filter(e => e.alive);
          if (!alive.length) break;
          const t = alive[Math.floor(Math.random() * alive.length)];
          const dmg = Math.round(f.atk * p.droneScale);
          const ed = Math.max(0, t.def - (f.armorPen || 0));
          const dr = ed / (ed + DEF_CONSTANT);
          const fd = Math.max(1, Math.round(dmg * (1 - dr)));
          applyRawDmg(f, t, fd);
        }
      }
    }

    // Process buffs
    for (const f of allFighters) {
      if (!f.alive) continue;
      f.buffs.filter(b => b.type === 'dot').forEach(d => {
        f.hp = Math.max(0, f.hp - d.value);
        if (f.hp <= 0) { f.alive = false; f._deathProcessed = true; }
      });
      f.buffs.filter(b => b.type === 'phoenixBurnDot').forEach(pb => {
        const rawBurn = pb.value + Math.round(f.maxHp * pb.hpPct / 100);
        const mrRed = (f.mr||f.def) / ((f.mr||f.def) + DEF_CONSTANT);
        const burnDmg = Math.max(1, Math.round(rawBurn * (1 - mrRed)));
        applyRawDmg(null, f, burnDmg, false, true);
        if (f.hp <= 0) { f.alive = false; f._deathProcessed = true; }
      });
      f.buffs.filter(b => b.type === 'hot').forEach(h => { f.hp = Math.min(f.maxHp, f.hp + h.value); });
      // Ink link tick-down
      if (f._inkLink && f._inkLink.turns > 0) {
        f._inkLink.turns--;
        if (f._inkLink.turns <= 0) f._inkLink = null;
      }
      f.buffs.forEach(b => b.turns--);
      f.buffs = f.buffs.filter(b => b.turns > 0);
    }
    recalcStats();

    if (!leftTeam.some(f => f.alive) || !rightTeam.some(f => f.alive)) break;

    // Build action order: R1 left×1→right all, R2+ left all→right all
    const lAlive = leftTeam.filter(f => f.alive);
    const rAlive = rightTeam.filter(f => f.alive);
    const leftActions = (turnNum === 1) ? (lAlive[0] ? [lAlive[0]] : []) : [...lAlive];
    const order = [...leftActions, ...rAlive];

    for (const f of order) {
      if (!f || !f.alive || battleOver) continue;
      // Skip stunned fighters
      if (f.buffs.some(b => b.type === 'stun')) continue;
      const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
      const allies = allFighters.filter(a => a.alive && a.side === f.side);
      if (!enemies.length) { battleOver = true; break; }

      // AI pick skill
      const ready = f.skills.filter(s => s.cdLeft === 0);
      if (!ready.length) continue;

      const SELF_TYPES = ['fortuneDice','phoenixShield','gamblerDraw','hidingDefend','hidingCommand',
        'cyberDeploy','cyberBuff','ghostPhase','diamondFortify','diceFate','chestOpen','bambooHeal',
        'lightningBuff','iceShield'];
      const ALLY_TYPES = ['heal','shield','bubbleShield','ninjaTrap','angelBless'];
      const AOE_TYPES = ['hunterBarrage','ninjaBomb','lightningBarrage','iceFrost','basicBarrage',
        'starMeteor','diceAllIn','pirateCannonBarrage'];

      const healS = ready.find(s => s.type === 'heal' || s.type === 'bambooHeal');
      const shieldS = ready.find(s => s.type === 'shield' || s.type === 'bubbleShield');
      const dmgS = ready.filter(s => !SELF_TYPES.includes(s.type) && !ALLY_TYPES.includes(s.type) && !s.switchTo);
      const selfS = ready.filter(s => SELF_TYPES.includes(s.type));
      let skill;
      if (healS && allies.some(a => a.hp / a.maxHp < 0.35)) skill = healS;
      else if (shieldS && allies.some(a => a.shield < 20)) skill = shieldS;
      else if (selfS.length && Math.random() < 0.3) skill = selfS[Math.floor(Math.random() * selfS.length)];
      else skill = dmgS.length ? dmgS[Math.floor(Math.random() * dmgS.length)] : ready[0];
      if (!skill) continue;

      // Fortune AI: use fortuneAllIn if can kill or enough coins
      const allInS = ready.find(s => s.type === 'fortuneAllIn');
      if (allInS && f._goldCoins > 0) {
        const perCoinDmg = Math.round(f.atk * 0.4);
        const totalAllIn = perCoinDmg * f._goldCoins;
        const weakest = enemies.sort((a,b) => (a.hp+a.shield) - (b.hp+b.shield))[0];
        const canKill = weakest && totalAllIn >= (weakest.hp + weakest.shield) * 0.7;
        if (canKill || f._goldCoins >= 18) {
          skill = allInS;
        } else if (skill === allInS) {
          const other = ready.filter(s => s.type !== 'fortuneAllIn');
          skill = other.length ? other[Math.floor(Math.random() * other.length)] : ready[0];
        }
      }

      if (skill.cd > 0) skill.cdLeft = skill.cd;

      // Target selection
      let target;
      if (SELF_TYPES.includes(skill.type) || skill.selfCast) {
        target = f;
      } else if (ALLY_TYPES.includes(skill.type)) {
        target = allies.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
      } else {
        target = enemies.sort((a, b) => a.hp - b.hp)[0];
      }

      // Execute via real engine
      try {
        animating = false;
        _actionQueue = [];
        const action = {
          attackerId: allFighters.indexOf(f),
          skillIdx: f.skills.indexOf(skill),
          targetId: allFighters.indexOf(target),
          aoe: !!skill.aoe
        };
        // Temporarily override nextAction to prevent recursion
        const savedNextAction = global.nextAction;
        const savedOnActionComplete = global.onActionComplete;
        global.nextAction = _noop;
        global.onActionComplete = _noop;
        await executeAction(action);
        global.nextAction = savedNextAction;
        global.onActionComplete = savedOnActionComplete;
      } catch (e) {
        if (!e._simLogged) { console.error('Sim executeAction error:', f.name, skill.name, e.message); e._simLogged = true; }
        // Fallback
        const hits = skill.hits || 1;
        for (let h = 0; h < hits; h++) {
          if (!target.alive) break;
          let bp = skill.power || 0;
          if (skill.atkScale) bp += Math.round(f.atk * skill.atkScale);
          if (skill.defScale) bp += Math.round(f.def * skill.defScale);
          if (skill.hpPct) bp += Math.round(target.maxHp * skill.hpPct / 100);
          const ed = Math.max(0, target.def - (f.armorPen || 0));
          const dr = ed / (ed + DEF_CONSTANT);
          const dmg = Math.max(1, Math.round(bp * (1 - dr)));
          applyRawDmg(f, target, dmg);
        }
      }

      // Bamboo charge follow-up
      if (f.alive && f.passive && f.passive.type === 'bambooCharge' && f._bambooCharged && !f._bambooFired) {
        const bEnemies = allFighters.filter(e => e.alive && e.side !== f.side);
        if (bEnemies.length) {
          const bTarget = (target && target.alive && target.side !== f.side) ? target : bEnemies.sort((a,b) => a.hp - b.hp)[0];
          const bp = f.passive;
          const rawDmg = Math.round(f.atk * bp.atkPct / 100) + Math.round(f.maxHp * bp.selfHpPct / 100);
          const effMr = calcEffDef(f, bTarget, 'magic');
          const mrRed = effMr / (effMr + DEF_CONSTANT);
          const magicDmg = Math.max(1, Math.round(rawDmg * (1 - mrRed)));
          applyRawDmg(f, bTarget, magicDmg);
          const healAmt = Math.round(f.maxHp * bp.healSelfHpPct / 100);
          f.hp = Math.min(f.maxHp, f.hp + healAmt);
          const hpGain = Math.round(f.atk * bp.hpGainAtkPct / 100);
          f.maxHp += hpGain; f.hp += hpGain;
          f._bambooFired = true;
          f._bambooCharged = false; // consume charge
        }
      }

      // Check deaths
      allFighters.forEach(ff => {
        if (ff.hp <= 0 && !ff._deathProcessed) {
          if (ff.passive && ff.passive.type === 'phoenixRebirth' && !ff._rebirthUsed) {
            ff._rebirthUsed = true;
            ff.hp = Math.round(ff.maxHp * ff.passive.revivePct / 100);
            ff.alive = true; return;
          }
          if (ff.passive && ff.passive.type === 'cyberDrone' && ff._drones && ff._drones.length > 0 && !ff._isMech) {
            const dc = ff._drones.length; ff._drones = []; ff._isMech = true;
            ff.hp = ff.passive.mechHpPer * dc; ff.maxHp = ff.hp;
            ff.baseAtk = ff.passive.mechAtkPer * dc; ff.atk = ff.baseAtk;
            ff.baseDef = 0; ff.def = 0; ff.baseMr = 0; ff.mr = 0; ff.alive = true; ff.buffs = [];
            ff.passive = { type:'mechBody', droneCount:dc };
            ff.skills = [{ name: '机甲攻击', type: 'mechAttack', hits: 1, power: 0, pierce: 0, cd: 0, cdLeft: 0, atkScale: 1.5 }];
            return;
          }
          // Ghost curse: apply DoT to all enemies on death
          if (ff.passive && ff.passive.type === 'ghostCurse') {
            const cursedEnemies = allFighters.filter(e => e.alive && e.side !== ff.side);
            for (const ce of cursedEnemies) {
              const dotDmg = Math.round(ce.maxHp * ff.passive.hpPct / 100);
              ce.buffs.push({ type:'dot', value:dotDmg, turns:ff.passive.turns });
            }
          }
          ff.alive = false; ff._deathProcessed = true;
        }
      });

      if (!leftTeam.some(ff => ff.alive) || !rightTeam.some(ff => ff.alive)) { battleOver = true; break; }
    }
    turnNum++;
  }

  return {
    winner: leftTeam.some(f => f.alive) ? 'left' : rightTeam.some(f => f.alive) ? 'right' : 'draw',
    turns: turnNum,
    left: leftTeam.map(f => ({ id: f.id, name: f.name, dd: f._dmgDealt || 0, dt: f._dmgTaken || 0, alive: f.alive })),
    right: rightTeam.map(f => ({ id: f.id, name: f.name, dd: f._dmgDealt || 0, dt: f._dmgTaken || 0, alive: f.alive })),
  };
}

// ── CLI Runner ──────────────────────────────────────────────
const MATRIX_EXCLUDE = ['space','hiding','fortune','line','two_head']; // 模拟不准的龟排除矩阵

async function runMatrix(N) {
  const ids = ALL_PETS.map(p => p.id).filter(id => !MATRIX_EXCLUDE.includes(id));
  const st = {};
  ids.forEach(id => { st[id] = { w: 0, g: 0, dd: 0, dt: 0 }; });
  const total = ids.length * (ids.length - 1) / 2;
  let done = 0;

  process.stdout.write(`全矩阵模拟 ${ids.length}龟 × ${N}局/对 = ${total}对...\n`);

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      let aw = 0;
      for (let k = 0; k < N; k++) {
        const r = await simBattle([ids[i], ids[i]], [ids[j], ids[j]]);
        if (r.winner === 'left') aw++;
        st[ids[i]].dd += r.left[0].dd + r.left[1].dd;
        st[ids[i]].dt += r.left[0].dt + r.left[1].dt;
        st[ids[j]].dd += r.right[0].dd + r.right[1].dd;
        st[ids[j]].dt += r.right[0].dt + r.right[1].dt;
      }
      st[ids[i]].w += aw; st[ids[i]].g += N;
      st[ids[j]].w += (N - aw); st[ids[j]].g += N;
      done++;
      if (done % 20 === 0) process.stdout.write(`  ${done}/${total} (${Math.round(done / total * 100)}%)\r`);
    }
  }

  const sorted = Object.entries(st).map(([id, s]) => {
    const p = ALL_PETS.find(x => x.id === id);
    return {
      name: p.name, emoji: p.emoji, rarity: p.rarity,
      wr: Math.round(s.w / s.g * 100), w: s.w, g: s.g,
      ad: Math.round(s.dd / s.g), at: Math.round(s.dt / s.g)
    };
  }).sort((a, b) => b.wr - a.wr);

  console.log('\n');
  console.log(' #  龟名         稀有  胜率   胜/总      造成均伤  承受均伤');
  console.log('─── ──────────── ──── ────── ────────── ──────── ────────');
  sorted.forEach((s, i) => {
    const rank = String(i + 1).padStart(2);
    const name = (s.emoji + s.name).padEnd(12);
    const rar = s.rarity.padEnd(4);
    const wr = (s.wr + '%').padStart(4);
    const wg = (s.w + '/' + s.g).padStart(9);
    const ad = String(s.ad).padStart(8);
    const at = String(s.at).padStart(8);
    console.log(`${rank}. ${name} ${rar} ${wr}   ${wg}   ${ad}  ${at}`);
  });
}

async function runCustom(l1, l2, r1, r2, N) {
  let lw = 0, rw = 0;
  const ps = {};

  for (let i = 0; i < N; i++) {
    const r = await simBattle([l1, l2], [r1, r2]);
    if (r.winner === 'left') lw++; else if (r.winner === 'right') rw++;
    [...r.left, ...r.right].forEach(f => {
      if (!ps[f.id]) ps[f.id] = { name: f.name, wins: 0, games: 0, dd: 0, dt: 0 };
      ps[f.id].games++; ps[f.id].dd += f.dd; ps[f.id].dt += f.dt;
      if (f.alive) ps[f.id].wins++;
    });
  }

  const ln = [l1, l2].map(id => ALL_PETS.find(p => p.id === id)?.name).join('+');
  const rn = [r1, r2].map(id => ALL_PETS.find(p => p.id === id)?.name).join('+');
  console.log(`\n${ln} vs ${rn} (${N}局)`);
  console.log(`左方胜率: ${Math.round(lw / N * 100)}% (${lw}胜) | 右方胜率: ${Math.round(rw / N * 100)}% (${rw}胜)`);
  console.log('\n龟名        存活率  造成均伤  承受均伤');
  console.log('─────────── ────── ──────── ────────');
  Object.values(ps).sort((a, b) => b.dd / b.games - a.dd / a.games).forEach(s => {
    console.log(`${s.name.padEnd(10)} ${(Math.round(s.wins / s.games * 100) + '%').padStart(5)}  ${String(Math.round(s.dd / s.games)).padStart(8)}  ${String(Math.round(s.dt / s.games)).padStart(8)}`);
  });
}

// ── Mixed Team Mode ────────────────────────────────────────
async function runMixed(partnersPerTurtle, matchesPerPartner) {
  const ids = ALL_PETS.map(p => p.id).filter(id => !MATRIX_EXCLUDE.includes(id));
  const st = {};
  ids.forEach(id => { st[id] = { w: 0, g: 0, dd: 0, dt: 0 }; });

  const totalMatches = ids.length * partnersPerTurtle * matchesPerPartner;
  let done = 0;
  process.stdout.write(`混搭模拟 ${ids.length}龟 × ${partnersPerTurtle}搭档 × ${matchesPerPartner}对手 = ${totalMatches}场...\n`);

  for (const myId of ids) {
    // Pick random partners (excluding self)
    const otherIds = ids.filter(id => id !== myId);
    const partners = otherIds.sort(() => Math.random() - 0.5).slice(0, partnersPerTurtle);

    for (const partnerId of partners) {
      // Pick random enemy teams
      for (let m = 0; m < matchesPerPartner; m++) {
        const enemyPool = ids.filter(id => id !== myId && id !== partnerId);
        const shuffled = enemyPool.sort(() => Math.random() - 0.5);
        const e1 = shuffled[0], e2 = shuffled[1];

        const r = await simBattle([myId, partnerId], [e1, e2]);
        const won = r.winner === 'left';

        // Track stats for all 4 participants
        st[myId].g++; st[partnerId].g++; st[e1].g++; st[e2].g++;
        if (won) { st[myId].w++; st[partnerId].w++; }
        else { st[e1].w++; st[e2].w++; }
        st[myId].dd += r.left[0].dd; st[myId].dt += r.left[0].dt;
        st[partnerId].dd += r.left[1].dd; st[partnerId].dt += r.left[1].dt;
        st[e1].dd += r.right[0].dd; st[e1].dt += r.right[0].dt;
        st[e2].dd += r.right[1].dd; st[e2].dt += r.right[1].dt;

        done++;
        if (done % 50 === 0) process.stdout.write(`  ${done}/${totalMatches} (${Math.round(done / totalMatches * 100)}%)\r`);
      }
    }
  }

  const sorted = Object.entries(st).map(([id, s]) => {
    const p = ALL_PETS.find(x => x.id === id);
    return {
      name: p.name, emoji: p.emoji, rarity: p.rarity,
      wr: s.g > 0 ? Math.round(s.w / s.g * 100) : 0, w: s.w, g: s.g,
      ad: s.g > 0 ? Math.round(s.dd / s.g) : 0, at: s.g > 0 ? Math.round(s.dt / s.g) : 0
    };
  }).sort((a, b) => b.wr - a.wr);

  console.log('\n');
  console.log(' #  龟名         稀有  胜率   胜/总      造成均伤  承受均伤');
  console.log('─── ──────────── ──── ────── ────────── ──────── ────────');
  sorted.forEach((s, i) => {
    const rank = String(i + 1).padStart(2);
    const name = (s.emoji + s.name).padEnd(12);
    const rar = s.rarity.padEnd(4);
    const wr = (s.wr + '%').padStart(4);
    const wg = (s.w + '/' + s.g).padStart(9);
    const ad = String(s.ad).padStart(8);
    const at = String(s.at).padStart(8);
    console.log(`${rank}. ${name} ${rar} ${wr}   ${wg}   ${ad}  ${at}`);
  });
}

// ── Main ────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2);
  const N = parseInt(args.find(a => !a.startsWith('-'))) || 20;

  if (args.includes('--mixed')) {
    await runMixed(10, 5); // 10 partners × 5 matches each
  } else if (args.includes('--matrix')) {
    await runMatrix(Math.min(N, 5));
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log('用法:');
    console.log('  node sim-node.js --matrix [N]     同龟矩阵对战(每对N局)');
    console.log('  node sim-node.js --mixed           混搭阵容模拟(10搭档×5对手)');
    console.log('  node sim-node.js [l1] [l2] [r1] [r2] [N]  自定义2v2');
    console.log('  node sim-node.js --list            列出所有龟ID');
    console.log('\n例: node sim-node.js hunter stone ninja phoenix 50');
  } else if (args.includes('--list')) {
    ALL_PETS.forEach(p => console.log(`${p.id.padEnd(12)} ${p.emoji}${p.name.padEnd(8)} ${p.rarity}`));
  } else if (args.length >= 4 && !args[0].startsWith('-')) {
    await runCustom(args[0], args[1], args[2], args[3], N);
  } else {
    await runMatrix(N);
  }
})();
