// ══════════════════════════════════════════════════════════
// engine.js — Shared state, globals & utility functions
// All other engine files depend on this being loaded first.
// ══════════════════════════════════════════════════════════

// ── SEEDED RANDOM (for online sync) ──────────────────────
const _origMathRandom = Math.random;
let _rngSeed = 0;
function seedBattleRng(seed) {
  _rngSeed = seed | 0;
  Math.random = function() {
    _rngSeed = (_rngSeed * 1664525 + 1013904223) | 0;
    return (_rngSeed >>> 0) / 4294967296;
  };
}
function unseedBattleRng() { Math.random = _origMathRandom; }

// ── SHARED BATTLE STATE ──────────────────────────────────
let _comboCdLeft = {}; // { comboIdx: turnsLeft }
let _equipPickPending = false;
let _equipPickCallback = null;

let activeSide = 'left';      // whose turn it is
let actedThisSide = new Set(); // fighter indices that already acted this side
let _bossActionsThisRound = 0; // boss actions counter per round
let isFirstRound = true;
let sidesActedThisRound = 0;  // 0, 1, or 2
let _processingEndOfRound = false; // prevent re-entry during summon actions

let _turnTimerId = null;
let _turnTimerInterval = null;

let pendingSkillIdx = null;
let currentActingFighter = null; // the turtle currently acting (set by showActionPanel)

let _actionQueue = [];
let _isGuestReplay = false; // Guest replay mode

// ── FLOATING NUMBER STACKING ─────────────────────────────
const _floatStacks = {};

// ── EQUIPMENT SYSTEM (装备之日) ──────────────────────────
const EQUIP_POOL = [
  // Stat boost (8)
  { id:'e_blade', name:'海藻短刃', icon:'equip/dungeon-blade.png', desc:'攻击力 +15%', apply(f) { f.baseAtk = Math.round(f.baseAtk * 1.15); f.atk = f.baseAtk; } },
  { id:'e_armor', name:'珊瑚护甲', icon:'equip/dungeon-armor.png', desc:'护甲 +20%', apply(f) { f.baseDef = Math.round(f.baseDef * 1.2); f.def = f.baseDef; } },
  { id:'e_shell', name:'深海贝壳', icon:'equip/dungeon-shell.png', desc:'魔抗 +20%', apply(f) { f.baseMr = Math.round((f.baseMr||f.baseDef) * 1.2); f.mr = f.baseMr; } },
  { id:'e_pearl', name:'生命珍珠', icon:'equip/dungeon-pearl.png', desc:'最大生命值 +60', apply(f) { f.maxHp += 60; f.hp += 60; } },
  { id:'e_tooth', name:'锋利鲨齿', icon:'equip/dungeon-tooth.png', desc:'暴击率 +20%', apply(f) { f.crit += 0.2; } },
  { id:'e_hammer', name:'重击锤', icon:'equip/dungeon-hammer.png', desc:'暴击伤害 +25%', apply(f) { f._extraCritDmgPerm = (f._extraCritDmgPerm||0) + 0.25; } },
  { id:'e_spike', name:'穿甲珊瑚刺', icon:'equip/dungeon-spike.png', desc:'护甲穿透 +6', apply(f) { f.armorPen += 6; } },
  { id:'e_crystal', name:'灵能水晶', icon:'equip/dungeon-crystal.png', desc:'魔法穿透 +6', apply(f) { f.magicPen = (f.magicPen||0) + 6; } },
  // Special effect (10)
  { id:'e_star', name:'吸血海星', icon:'equip/dungeon-starfish.png', desc:'生命偷取 +12%', apply(f) { f._lifestealPct = (f._lifestealPct||0) + 12; } },
  { id:'e_urchin', name:'荆棘海胆', icon:'equip/dungeon-urchin.png', desc:'受伤反弹 10%', apply(f) { f._equipReflect = (f._equipReflect||0) + 10; } },
  { id:'e_fire', name:'灼热火珊瑚', icon:'equip/dungeon-fire-coral.png', desc:'攻击附带灼烧4回合', apply(f) { f._equipBurn = true; } },
  { id:'e_jelly', name:'冰封水母', icon:'equip/dungeon-jelly.png', desc:'攻击15%概率眩晕1回合', apply(f) { f._equipStun = 15; } },
  { id:'e_anemone', name:'治愈海葵', icon:'equip/dungeon-anemone.png', desc:'每回合回复5%最大HP', apply(f) { f._equipHot = 5; } },
  { id:'e_ghost', name:'幽灵墨鱼', icon:'equip/dungeon-ghost.png', desc:'闪避率 +15%', apply(f) { f.buffs.push({type:'dodge',value:15,turns:999}); } },
  { id:'e_puffer', name:'愤怒河豚', icon:'equip/dungeon-puffer.png', desc:'HP低于30%时攻击力翻倍', apply(f) { f._equipRage = true; } },
  { id:'e_tshell', name:'坚韧龟壳', icon:'equip/dungeon-tshell.png', desc:'每段受伤固定减免5点', apply(f) { f._equipFlatReduce = (f._equipFlatReduce||0) + 5; } },
  { id:'e_octo', name:'连击章鱼爪', icon:'equip/dungeon-octo.png', desc:'20%概率追加50%攻击力打击', apply(f) { f._equipMultiHit = 20; } },
  { id:'e_conch', name:'复活海螺', icon:'equip/dungeon-conch.png', desc:'首次死亡以20%HP复活', apply(f) { f._equipRevive = true; } },
];

// ── UTILITY FUNCTIONS (used across all files) ────────────

function addLog(html, cls='') {
  const log = document.getElementById('battleLog');
  const e = document.createElement('div');
  e.className = 'log-entry ' + cls;
  e.innerHTML = html;
  log.appendChild(e);
  log.scrollTop = log.scrollHeight;
}

function getFighterElId(f) {
  if (f._summonElId) return f._summonElId;
  if (f.side === 'left') return 'leftFighter' + leftTeam.indexOf(f);
  return 'rightFighter' + rightTeam.indexOf(f);
}

function getAliveEnemiesWithSummons(side) {
  const team = side === 'left' ? rightTeam : leftTeam;
  const targets = team.filter(e => e.alive);
  // Add enemy summons
  team.forEach(e => {
    if (e._summon && e._summon.alive) targets.push(e._summon);
  });
  return targets;
}

// Shield multiplier for battle rules (铁壁之日 = x2)
function getShieldMult() {
  return (typeof _battleRule !== 'undefined' && _battleRule && _battleRule.id === 'shield') ? 2 : 1;
}
// Magic damage multiplier for battle rules (深海之日 = x0.8)
function getMagicDmgMult() {
  return (typeof _battleRule !== 'undefined' && _battleRule && _battleRule.id === 'ocean') ? 0.8 : 1;
}

// ── FLOATING NUMBERS — persistent 2.5s ────────────────────
// opts: { atkSide:'left'|'right', amount:number } — optional
// Track active floating numbers per element to auto-stack
function spawnFloatingNum(elId, text, cls, delayMs, yOffset, opts) {
  // Auto-stack: small offset for non-damage floats to avoid overlap
  if (!_floatStacks[elId]) _floatStacks[elId] = 0;
  const autoOffset = _floatStacks[elId] * 16;
  _floatStacks[elId]++;
  setTimeout(() => { if (_floatStacks[elId] > 0) _floatStacks[elId]--; }, (delayMs || 0) + 600);

  // SFX fires slightly before visual — sound leads impact
  const _sfxMap = {
    'direct-dmg': sfxHit, 'magic-dmg': sfxHit,
    'true-dmg': sfxPierce, 'pierce-dmg': sfxPierce,
    'crit-dmg': sfxCrit, 'crit-magic': sfxCrit, 'crit-true': sfxCrit, 'crit-pierce': sfxCrit,
    'shield-dmg': sfxShieldBreak,
    'dodge-num': sfxDodge,
  };
  const _sfxFn = _sfxMap[cls];
  if (_sfxFn) setTimeout(() => { try { _sfxFn(); } catch(e) {} }, Math.max(0, (delayMs || 0) - 30));

  setTimeout(() => {
    const parent = document.getElementById(elId);
    if (!parent) return;
    const num = document.createElement('div');
    num.className = 'floating-num ' + cls;
    if (typeof text === 'string' && text.includes('<')) num.innerHTML = text;
    else num.textContent = text;

    // Size scales with damage amount (14-32px, crit +20%)
    let amount = opts && opts.amount || 0;
    // Auto-extract amount from text if not provided (e.g. "-42" -> 42)
    if (!amount && typeof text === 'string') { const m = text.match(/\d+/); if (m) amount = parseInt(m[0]); }
    {
      let sz = amount < 20 ? 24 : amount < 60 ? 24 + (amount-20)/40*5 : amount < 150 ? 29 + (amount-60)/90*7 : 36;
      sz = Math.min(40, sz);
      const isCrit = cls.startsWith('crit');
      if (isCrit) sz = Math.min(46, sz * 1.2);
      num.style.fontSize = sz + 'px';
    }

    parent.appendChild(num);

    // Determine animation type
    const isDmg = (cls.includes('dmg') || cls.includes('pierce') || cls.includes('crit-magic') || cls.includes('crit-true')) && cls !== 'shield-dmg';
    // Use original random for visual offsets (don't consume seeded RNG)
    const _vr = _origMathRandom;
    const ox = (_vr() - 0.5) * 8;

    if (isDmg) {
      // Damage numbers always start from center, small random y spread only
      const y0 = -((_vr() - 0.5) * 10);
      // ── DAMAGE: pop from center, jump away from attacker ──
      let dir = 1;
      if (opts && opts.atkSide) {
        dir = opts.atkSide === 'left' ? 1 : -1;
      } else if (typeof currentActingFighter !== 'undefined' && currentActingFighter) {
        dir = currentActingFighter.side === 'left' ? 1 : -1;
      } else {
        try { const r = parent.getBoundingClientRect(); dir = r.left > window.innerWidth / 2 ? 1 : -1; } catch(e) {}
      }
      const jumpX = dir * (12 + _vr() * 14);
      const jumpY = -(10 + _vr() * 8);
      const gravity = 200;
      const totalDur = 800;
      const start = performance.now();

      const popSize = amount < 20 ? 1.6 : amount < 60 ? 1.8 : amount < 150 ? 2.2 : 2.5;

      function tickDmg(now) {
        const elapsed = now - start;
        if (elapsed >= totalDur) { num.remove(); return; }
        const t = elapsed / 1000;

        // Impact pop: big -> shrink -> hold
        let scale;
        if (elapsed < 50) scale = (elapsed / 50) * popSize;
        else if (elapsed < 150) scale = popSize - (popSize - 0.7) * ((elapsed - 50) / 100);
        else scale = 0.7;

        // Parabolic arc
        const x = ox + jumpX * t * 2;
        const y = y0 + jumpY * t * 2 + 0.5 * gravity * t * t;

        // Fade out faster
        const opacity = elapsed < 350 ? 1 : 1 - (elapsed - 350) / (totalDur - 350);

        num.style.transform = `translate(calc(-50% + ${x}px), ${y}px) scale(${scale})`;
        num.style.opacity = String(Math.max(0, opacity));
        requestAnimationFrame(tickDmg);
      }
      requestAnimationFrame(tickDmg);
    } else {
      // ── HEAL/SHIELD/STATUS: float up gently, fade ──
      const y0 = -(15 + (yOffset || 0) + autoOffset);
      const totalDur = 1500;
      const start = performance.now();

      function tickHeal(now) {
        const elapsed = now - start;
        if (elapsed >= totalDur) { num.remove(); return; }

        let scale, opacity, y;
        if (elapsed < 100) {
          scale = (elapsed / 100) * 1.2;
          y = y0;
          opacity = Math.min(1, elapsed / 50);
        } else if (elapsed < 350) {
          scale = 1.2 - 0.2 * ((elapsed - 100) / 250);
          y = y0;
          opacity = 1;
        } else {
          const p = (elapsed - 350) / (totalDur - 350);
          const ease = p * (2 - p);
          scale = 1.0;
          y = y0 - 30 * ease;
          opacity = elapsed > 1000 ? 1 - (elapsed - 1000) / (totalDur - 1000) : 1;
        }

        num.style.transform = `translate(calc(-50% + ${ox}px), ${y}px) scale(${scale})`;
        num.style.opacity = String(Math.max(0, opacity));
        requestAnimationFrame(tickHeal);
      }
      requestAnimationFrame(tickHeal);
    }
  }, delayMs);
}

// ── BATTLE START ──────────────────────────────────────────
function resetBattleState() {
  turnNum=1; currentIdx=0; leftTeam=[]; rightTeam=[];
  allFighters=[]; turnQueue=[]; battleOver=false; animating=false;
  _actionQueue=[]; _bossActionsThisRound=0;
  _comboCdLeft = {};
  currentActingFighter = null;
  pendingSkillIdx = null;
  resetTurnState();
  // Clean up DOM state from previous battle
  document.querySelectorAll('.fighter-card,.scene-turtle').forEach(el => {
    el.classList.remove('dead','death-anim','hit-shake','attack-anim','mech-transform-anim');
    el.style.opacity = '';
    el.style.display = '';
  });
  // Remove summon mini cards
  document.querySelectorAll('.summon-mini').forEach(el => el.remove());
  // Remove particles, floating numbers, and overlays
  document.querySelectorAll('.bamboo-orb,.mech-drone-particle,.mech-transform-flash,.death-screen-flash,.floating-num').forEach(el => el.remove());
  const overlay = document.getElementById('disconnectOverlay');
  if (overlay) overlay.remove();
  // Hide panels
  const panel = document.getElementById('actionPanel');
  if (panel) panel.classList.remove('show');
  const picker = document.getElementById('turtlePicker');
  if (picker) picker.style.display = 'none';
  const targetSel = document.getElementById('targetSelect');
  if (targetSel) targetSel.style.display = 'none';
  // Clear stun indicators and side indicator
  const sideInd = document.getElementById('sideIndicator');
  if (sideInd) sideInd.innerHTML = '';
  const turnBanner = document.getElementById('turnBanner');
  if (turnBanner) turnBanner.textContent = '';
  unseedBattleRng();
}

// ── HIT ANIMATION HELPER ──────────────────────────────────
function playHitAnim(elId, dmgType, isCrit) {
  const el = document.getElementById(elId);
  if (!el) return;
  // Remove all hit classes
  el.classList.remove('hit-shake','hit-physical','hit-magic','hit-true','hit-crit');
  void el.offsetWidth; // reflow to restart animation
  if (isCrit) {
    el.classList.add('hit-crit');
    // Screen flash for crits
    const flash = document.createElement('div');
    flash.className = 'screen-flash flash-crit';
    document.body.appendChild(flash);
    flash.addEventListener('animationend', () => flash.remove());
  } else if (dmgType === 'magic') {
    el.classList.add('hit-magic');
  } else if (dmgType === 'true') {
    el.classList.add('hit-true');
  } else {
    el.classList.add('hit-physical');
  }
  // Auto-remove after animation
  setTimeout(() => {
    el.classList.remove('hit-shake','hit-physical','hit-magic','hit-true','hit-crit');
  }, 500);
}

// ── HEAL REDUCE HELPER ────────────────────────────────────
function applyHeal(target, amount) {
  if (target._undeadLockTurns > 0) return 0; // locked at 1HP, no healing
  const healRedBuff = target.buffs ? target.buffs.find(b => b.type === 'healReduce') : null;
  if (healRedBuff) amount = Math.round(amount * (1 - healRedBuff.value / 100));
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  return Math.round(target.hp - before);
}

function sleep(ms) { return new Promise(r=>setTimeout(r,ms)); }
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2000);
}
