#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   Online Desync Detector — simulates host + guest with same seed
   Runs identical battle on two independent instances, checks for divergence
   Usage: node test-online-sync.js [leftId1 leftId2 rightId1 rightId2]
   ═══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

// Minimal DOM mock
const _noop = () => {};
const _mockEl = {
  classList:{add:_noop,remove:_noop,toggle:_noop,contains:()=>false},
  style:{}, querySelector:()=>_mockEl, querySelectorAll:()=>[],
  appendChild:_noop, insertBefore:_noop, remove:_noop, setAttribute:_noop,
  addEventListener:_noop, removeEventListener:_noop,
  getBoundingClientRect:()=>({left:0,top:0,width:100,height:50}),
  innerHTML:'', textContent:'', id:'mock',
};
global.document = {
  getElementById:()=>_mockEl, querySelector:()=>_mockEl, querySelectorAll:()=>[],
  createElement:()=>({...JSON.parse(JSON.stringify(_mockEl)),classList:{add:_noop,remove:_noop,toggle:_noop,contains:()=>false},style:{},querySelector:()=>_mockEl,appendChild:_noop,remove:_noop,insertBefore:_noop,setAttribute:_noop,addEventListener:_noop,removeEventListener:_noop,getBoundingClientRect:()=>({left:0,top:0,width:100,height:50})}),
  head:{appendChild:_noop}, body:{appendChild:_noop}, addEventListener:_noop,
};
global.window = global;
global.localStorage = { getItem:()=>null, setItem:_noop, removeItem:_noop };
global.navigator = { clipboard:{writeText:()=>Promise.resolve()} };
global.BroadcastChannel = function(){ this.postMessage=_noop; this.onmessage=null; };
global.Peer = function(){ this.on=_noop; this.connect=()=>({on:_noop,send:_noop,open:false}); this.destroy=_noop; };
global.fetch = () => Promise.resolve({ json:()=>Promise.resolve([]) });
global.requestAnimationFrame = ()=>0;
global.performance = { now:()=>Date.now() };
global.AudioContext = global.webkitAudioContext = function(){};
const _realSetTimeout = global.setTimeout;
global.setTimeout = (fn, ms) => { if(typeof fn==='function'){fn();return 0;} return _realSetTimeout(fn,ms); };
global.clearTimeout = (id) => {};
global.clearInterval = (id) => {};
global.setInterval = (fn, ms) => 0;

// Load game code
const files = ['pets.js','engine.js','skills.js','ui.js','main.js'];
let combined = '';
for(const f of files) combined += fs.readFileSync(path.join(__dirname,'js',f),'utf8') + '\n';
const evalCode = combined.replace(/export\s+/g,'').replace(/import\s+.*?from\s+.*?;/g,'');
const vm = require('vm');
vm.runInThisContext(evalCode);

// ── Test framework ──
const SEED = 42424242;

function getStateHash() {
  return allFighters.map(f =>
    `${f.id}:hp${Math.round(f.hp)}/${f.maxHp}:atk${f.atk}:def${f.def}:mr${f.mr}:alive${f.alive?1:0}:crit${Math.round(f.crit*100)}:shield${Math.round(f.shield)}:buffs${f.buffs.length}`
  ).join('|');
}

function getRngSeed() { return _rngSeed; }

// Track every Math.random call
let _randomCallCount = 0;
const _origRandom = Math.random.bind ? Math.random : function(){ return Math.random(); };

async function runBattle(leftIds, rightIds, label) {
  // Reset state
  gameMode = 'pve';
  animating = false;
  _actionQueue = [];
  onlineSide = null;
  _processingEndOfRound = false;
  battleOver = false;
  turnNum = 1;

  leftTeam = leftIds.map(id => createFighter(id, 'left'));
  rightTeam = rightIds.map(id => createFighter(id, 'right'));
  allFighters = [...leftTeam, ...rightTeam];

  // Apply seed
  seedBattleRng(SEED);
  _randomCallCount = 0;

  // Wrap Math.random to count calls
  const seededFn = Math.random;
  Math.random = function() {
    _randomCallCount++;
    return seededFn();
  };

  // Apply one-time passives
  for(const f of allFighters) {
    if(f.passive && f.passive.type === 'ninjaInstinct') {
      f.crit += f.passive.critBonus/100;
      f._extraCritDmgPerm = (f.passive.critDmgBonus||0)/100;
      f.armorPen += f.passive.armorPen||0;
    }
    if(f.passive && f.passive.type === 'undeadRage') {
      f._lifestealPct = f.passive.lifestealBase;
    }
    if(f.passive && f.passive.type === 'frostAura') {
      const enemies = (f.side==='left'?rightTeam:leftTeam).filter(e=>e.alive);
      for(const e of enemies) e.buffs.push({type:'atkDown',value:f.passive.atkDownPct,turns:f.passive.atkDownTurns});
      recalcStats();
    }
  }

  const snapshots = [];

  // Simulate turns
  for(let turn = 1; turn <= 15 && !battleOver; turn++) {
    turnNum = turn;

    // beginTurn: reduce CDs
    allFighters.forEach(f => {
      f.skills.forEach(s => { if(s.cdLeft > 0) s.cdLeft--; });
    });

    // Per-turn passives (same as beginTurn in engine.js)
    for(const f of allFighters) {
      if(!f.alive || !f.passive || f._isSummon) continue;
      f.passiveUsedThisTurn = false;

      if(f.passive.type === 'stoneWall') {
        if(!f._stoneDefGained) f._stoneDefGained = 0;
        if(f._stoneDefGained < f.passive.maxDef) {
          const gain = Math.min(f.passive.defGain, f.passive.maxDef - f._stoneDefGained);
          f.baseDef += gain; f._stoneDefGained += gain;
        }
      }
      if(f.passive.type === 'bambooCharge') {
        f._bambooFired = false;
        if(!f._bambooCharged) {
          f._bambooCounter = (f._bambooCounter||0) + 1;
          if(f._bambooCounter >= 2) { f._bambooCharged = true; f._bambooCounter = 0; }
        }
      }
      if(f.passive.type === 'cyberDrone' && !f._isMech) {
        if(!f._drones) f._drones = [];
        if(f._drones.length < f.passive.maxDrones) f._drones.push({age:0});
        const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
        for(let di=0; di<f._drones.length; di++) {
          const alive = enemies.filter(e=>e.alive);
          if(!alive.length) break;
          const t = alive[Math.floor(Math.random()*alive.length)];
          const dmg = Math.round(f.atk * f.passive.droneScale);
          const ed = Math.max(0, t.def-(f.armorPen||0));
          const dr = ed/(ed+DEF_CONSTANT);
          const fd = Math.max(1, Math.round(dmg*(1-dr)));
          applyRawDmg(f, t, fd);
        }
      }
      if(f.passive.type === 'rainbowPrism') {
        const allies = (f.side==='left'?leftTeam:rightTeam).filter(a=>a.alive);
        const maxRoll = (turn<=1) ? 2 : 3;
        const roll = Math.floor(Math.random() * maxRoll);
        f._prismColor = roll;
        if(roll===0) { for(const a of allies) { const g=Math.round(a.baseAtk*f.passive.atkPct/100); a.buffs.push({type:'atkUp',value:g,turns:2}); } }
        else if(roll===1) { for(const a of allies) { const dg=Math.round(a.baseDef*f.passive.defPct/100); const mg=Math.round((a.baseMr||a.baseDef)*f.passive.defPct/100); a.buffs.push({type:'defUp',value:dg,turns:2}); a.buffs.push({type:'mrUp',value:mg,turns:2}); } }
        else { for(const a of allies) { const h=Math.round(a.maxHp*f.passive.healPct/100); a.hp=Math.min(a.maxHp,a.hp+h); } }
        recalcStats();
      }
      if(f.passive.type === 'lightningStorm') {
        const enemies = allFighters.filter(e=>e.alive && e.side!==f.side);
        if(enemies.length) {
          const t = enemies[Math.floor(Math.random()*enemies.length)];
          const sDmg = Math.round(f.atk * f.passive.shockScale);
          applyRawDmg(f, t, sDmg, true);
        }
      }
      if(f.passive.type === 'candySteal' && turn === f.passive.stealTurn) {
        const enemies = (f.side==='left'?rightTeam:leftTeam).filter(e=>e.alive);
        if(enemies.length) {
          const target = enemies[Math.floor(Math.random()*enemies.length)];
          const stealAmt = Math.round(target.maxHp * f.passive.stealPct / 100);
          target.maxHp -= stealAmt; target.hp = Math.min(target.hp, target.maxHp);
          if(target.hp<=0) target.hp = 1;
          f.maxHp += stealAmt; f.hp += stealAmt;
        }
      }
    }

    // Process buffs
    for(const f of allFighters) {
      if(!f.alive) continue;
      f.buffs.filter(b=>b.type==='dot').forEach(d => {
        applyRawDmg(null, f, d.value, false, true, 'true');
        if(f.hp<=0) { f.alive=false; f._deathProcessed=true; }
      });
      f.buffs.filter(b=>b.type==='phoenixBurnDot').forEach(pb => {
        const rawBurn = pb.value + Math.round(f.maxHp * pb.hpPct / 100);
        const mrRed = (f.mr||f.def)/((f.mr||f.def)+DEF_CONSTANT);
        const burnDmg = Math.max(1, Math.round(rawBurn*(1-mrRed)));
        const src = (pb.sourceIdx!==undefined) ? allFighters[pb.sourceIdx] : null;
        applyRawDmg(src, f, burnDmg, false, true);
        if(f.hp<=0) { f.alive=false; f._deathProcessed=true; }
      });
      f.buffs.filter(b=>b.type==='hot').forEach(h => { f.hp=Math.min(f.maxHp, f.hp+h.value); });
      // BubbleStore
      if(f.passive && f.passive.type==='bubbleStore' && f.bubbleStore>0) {
        const healAmt = Math.round(f.bubbleStore*(f.passive.healPct||7)/100);
        f.bubbleStore -= healAmt;
        f.hp = Math.min(f.maxHp, f.hp+healAmt);
        if(f.passive.dmgPct) {
          const dmgAmt = Math.round(f.bubbleStore*f.passive.dmgPct/100);
          f.bubbleStore -= dmgAmt;
          if(dmgAmt>0) {
            const enemies = allFighters.filter(e=>e.alive&&e.side!==f.side);
            if(enemies.length) {
              const t = enemies[Math.floor(Math.random()*enemies.length)];
              const effMr = calcEffMr(f,t);
              const mrRed = effMr/(effMr+DEF_CONSTANT);
              const finalDmg = Math.max(1, Math.round(dmgAmt*(1-mrRed)));
              applyRawDmg(f, t, finalDmg, false, false, 'magic');
            }
          }
        }
        if(f.bubbleStore<1) f.bubbleStore=0;
      }
      if(f._inkLink && f._inkLink.turns>0) { f._inkLink.turns--; if(f._inkLink.turns<=0) f._inkLink=null; }
      f.buffs.forEach(b=>b.turns--);
      f.buffs = f.buffs.filter(b=>b.turns>0);
    }
    recalcStats();

    if(!leftTeam.some(f=>f.alive) || !rightTeam.some(f=>f.alive)) break;

    // Actions
    const lAlive = leftTeam.filter(f=>f.alive);
    const rAlive = rightTeam.filter(f=>f.alive);
    const leftActions = (turn===1) ? (lAlive[0]?[lAlive[0]]:[]) : [...lAlive];
    const order = [...leftActions, ...rAlive];

    for(const f of order) {
      if(!f.alive || battleOver) continue;
      const enemies = allFighters.filter(e=>e.alive && e.side!==f.side);
      if(!enemies.length) { battleOver=true; break; }

      const ready = f.skills.filter(s=>s.cdLeft===0);
      if(!ready.length) continue;

      // AI pick
      let skill = ready.sort((a,b)=>(b.cd||0)-(a.cd||0))[0];
      if(skill.cd>0 && Math.random()>0.8) skill = ready[Math.floor(Math.random()*ready.length)];
      if(skill.cd>0) skill.cdLeft = skill.cd;

      const target = enemies.sort((a,b)=>a.hp-b.hp)[0];

      // Simple damage
      const hits = skill.hits||1;
      for(let h=0; h<hits; h++) {
        if(!target.alive) break;
        let bp = skill.power||0;
        if(skill.atkScale) bp += Math.round(f.atk * skill.atkScale);
        if(skill.defScale) bp += Math.round(f.def * skill.defScale);
        if(skill.mrScale) bp += Math.round((f.mr||f.def) * skill.mrScale);
        if(skill.hpPct) bp += Math.round(target.maxHp * skill.hpPct / 100);
        const ed = Math.max(0, target.def - (f.armorPen||0));
        const dr = ed/(ed+DEF_CONSTANT);
        const {isCrit, critMult} = calcCrit(f);
        const dmg = Math.max(1, Math.round(bp * critMult * (1-dr)));
        applyRawDmg(f, target, dmg);
      }

      // Check deaths
      allFighters.forEach(ff => {
        if(ff.hp<=0 && !ff._deathProcessed) { ff.alive=false; ff._deathProcessed=true; }
      });
      if(!leftTeam.some(ff=>ff.alive) || !rightTeam.some(ff=>ff.alive)) { battleOver=true; break; }
    }

    snapshots.push({
      turn,
      seed: _rngSeed,
      randomCalls: _randomCallCount,
      hash: getStateHash()
    });
  }

  unseedBattleRng();
  Math.random = _origRandom;
  return snapshots;
}

// ── Run test ──
async function main() {
  const args = process.argv.slice(2);

  // Test combos
  const combos = [
    [['bamboo','rainbow'], ['lightning','ninja']],
    [['bamboo','stone'], ['phoenix','lava']],
    [['gambler','hunter'], ['angel','ice']],
    [['line','bubble'], ['ghost','diamond']],
    [['candy','pirate'], ['dice','fortune']],
    [['two_head','bamboo'], ['cyber','crystal']],
  ];

  let totalTests = 0, totalPass = 0;

  for(const [leftIds, rightIds] of combos) {
    console.log(`\n════ Testing ${leftIds.join('+')} vs ${rightIds.join('+')} ════`);

    // Run twice with same seed
    const run1 = await runBattle(leftIds, rightIds, 'RUN1');
    const run2 = await runBattle(leftIds, rightIds, 'RUN2');

    const maxTurns = Math.min(run1.length, run2.length);
    let desyncTurn = -1;

    for(let i=0; i<maxTurns; i++) {
      totalTests++;
      const s1 = run1[i], s2 = run2[i];
      if(s1.seed !== s2.seed || s1.hash !== s2.hash) {
        desyncTurn = s1.turn;
        console.log(`  ❌ DESYNC at turn ${s1.turn}!`);
        console.log(`    Seed: ${s1.seed} vs ${s2.seed} (diff: ${s1.seed !== s2.seed})`);
        console.log(`    Random calls: ${s1.randomCalls} vs ${s2.randomCalls}`);
        if(s1.hash !== s2.hash) {
          const parts1 = s1.hash.split('|');
          const parts2 = s2.hash.split('|');
          for(let j=0; j<parts1.length; j++) {
            if(parts1[j] !== parts2[j]) {
              console.log(`    Fighter ${j}: ${parts1[j]} vs ${parts2[j]}`);
            }
          }
        }
        break;
      } else {
        totalPass++;
      }
    }
    if(desyncTurn === -1) {
      console.log(`  ✅ SYNC OK (${maxTurns} turns, final seed: ${run1[maxTurns-1].seed})`);
    }
  }

  console.log(`\n══ Results: ${totalPass}/${totalTests} turns synced ══`);
  if(totalPass === totalTests) console.log('🎉 All tests passed!');
  else console.log('⚠️  Desync detected!');
}

main().catch(e => console.error('Test error:', e));
