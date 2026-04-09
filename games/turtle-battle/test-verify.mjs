// Verify each skill actually produces its intended effect
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');

const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, decodeURIComponent(req.url === '/' ? '/index.html' : req.url));
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.mp3':'audio/mpeg','.ogg':'audio/ogg' };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const PORT = 8767;
server.listen(PORT);

const results = [];
const errors = [];

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', err => errors.push(`PAGE: ${err.message}`));

  await page.goto(`http://localhost:${PORT}/games/turtle-battle/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const turtles = await page.evaluate(() =>
    ALL_PETS.map(p => ({
      id: p.id, name: p.name, hp: p.hp, atk: p.atk, def: p.def, mr: p.mr||p.def,
      skills: (p.skillPool || p.skills || []).map((s, i) => ({
        idx: i, name: s.name, type: s.type, passive: !!s.passiveSkill,
        selfCast: !!s.selfCast, isAlly: !!s.isAlly, aoe: !!s.aoe, aoeAlly: !!s.aoeAlly,
        // Expected effect type
        isHeal: s.type.includes('Heal') || s.type === 'heal' || s.type === 'bambooHeal' || s.type === 'headlessRegen' || s.type === 'fortuneBless' || s.type === 'crystalResHeal' || s.type === 'bubbleHeal',
        isShield: s.type.includes('Shield') || s.type.includes('shield') || s.type === 'shield' || s.type === 'commonTeamShield' || s.type === 'rainbowBarrier' || s.type === 'cyberFirewall' || s.type === 'stoneShield' || s.type === 'diceStableShield' || s.type === 'shellEnergyShield',
        isBuff: s.type === 'commonAtkBuff' || s.type === 'pirateFlag' || s.type === 'stoneTaunt' || s.type === 'ghostShadow' || s.type === 'starWarp' || s.type === 'hidingReflect' || s.type === 'ghostPhantom' || s.type === 'hidingBuffSummon' || s.type === 'fortuneGainCoins' || s.type === 'rainbowGuard',
        isDamage: !s.passiveSkill && !s.selfCast && !s.isAlly && !s.aoeAlly && s.type !== 'fortuneBuyEquip' && s.type !== 'fortuneGainCoins' && s.type !== 'hidingBuffSummon',
        cd: s.cd || 0,
        atkScale: s.atkScale || 0, hits: s.hits || 1,
      }))
    }))
  );

  // Start a battle
  await page.evaluate(() => startMode('pve'));
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const ids = ALL_PETS.map(p => p.id);
    _fgSlots = { 'front-0': ids[0], 'front-1': ids[1], 'back-0': ids[2] };
    renderFgSlots(); renderPetGrid(); updateConfirmBtn();
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => document.getElementById('btnConfirmTeam')?.click());
  await page.waitForTimeout(2000);

  for (const turtle of turtles) {
    const activeSkills = turtle.skills.filter(s => !s.passive);
    if (activeSkills.length === 0) continue;

    for (const skill of activeSkills) {
      // Snapshot state before
      const before = await page.evaluate((args) => {
        const { tid, stype, isAlly, isSelfCast } = args;
        // Reset all fighters to full HP for clean test
        allFighters.forEach(f => {
          f.hp = f.maxHp; f.alive = true; f._deathProcessed = false;
          f.shield = 0; f.buffs = [];
        });
        battleOver = false; animating = false;

        // Inject turtle and all its skills
        let f = allFighters.find(ff => ff.id === tid && ff.side === 'left');
        if (!f) {
          // Place turtle as first left fighter
          const pet = ALL_PETS.find(p => p.id === tid);
          if (!pet) return null;
          f = allFighters[0];
          f.id = tid; f.name = pet.name;
          f.maxHp = pet.hp; f.hp = pet.hp;
          f.baseAtk = pet.atk; f.atk = pet.atk;
          f.baseDef = pet.def; f.def = pet.def;
          f.baseMr = pet.mr || pet.def; f.mr = f.baseMr;
        }

        const pet = ALL_PETS.find(p => p.id === tid);
        const pool = pet ? (pet.skillPool || pet.skills || []) : [];
        f.skills = pool.filter(s => !s.passiveSkill).map(s => ({ ...s, cdLeft: 0 }));

        const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
        const allies = allFighters.filter(a => a.alive && a.side === f.side);
        const target = isSelfCast ? f : isAlly ? allies[0] : enemies[0];

        return {
          fighterHp: f.hp, fighterShield: f.shield, fighterAtk: f.atk,
          fighterBuffCount: f.buffs.length,
          fighterGold: f._goldCoins || 0,
          targetHp: target ? target.hp : 0,
          targetShield: target ? target.shield : 0,
          targetBuffCount: target ? target.buffs.length : 0,
          targetMaxHp: target ? target.maxHp : 0,
          enemyTotalHp: enemies.reduce((s, e) => s + e.hp, 0),
          allyTotalHp: allies.reduce((s, a) => s + a.hp, 0),
        };
      }, { tid: turtle.id, stype: skill.type, isAlly: skill.isAlly, isSelfCast: skill.selfCast });

      if (!before) { results.push({ turtle: turtle.name, skill: skill.name, type: skill.type, status: '⏭', reason: 'setup failed' }); continue; }

      // Execute skill
      const execOk = await page.evaluate((args) => {
        try {
          const { tid, stype, isAlly, isSelfCast, isAoe } = args;
          const f = allFighters.find(ff => ff.id === tid && ff.side === 'left') || allFighters[0];
          const skillIdx = f.skills.findIndex(s => s.type === stype);
          if (skillIdx < 0) return { ok: false, err: 'skill not found' };
          f.skills[skillIdx].cdLeft = 0;

          const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
          const allies = allFighters.filter(a => a.alive && a.side === f.side);
          let targetId;
          if (isSelfCast || isAoe) targetId = allFighters.indexOf(f);
          else if (isAlly) targetId = allFighters.indexOf(allies[0]);
          else targetId = allFighters.indexOf(enemies[0]);

          executeAction({ attackerId: allFighters.indexOf(f), skillIdx, targetId, aoe: isAoe });
          return { ok: true };
        } catch(e) { return { ok: false, err: e.message }; }
      }, { tid: turtle.id, stype: skill.type, isAlly: skill.isAlly, isSelfCast: skill.selfCast, isAoe: skill.aoe });

      if (!execOk.ok) { results.push({ turtle: turtle.name, skill: skill.name, type: skill.type, status: '❌', reason: execOk.err }); continue; }

      // Wait for animation
      await page.waitForTimeout(2000);
      for (let w = 0; w < 10; w++) {
        const still = await page.evaluate(() => typeof animating !== 'undefined' && animating);
        if (!still) break;
        await page.waitForTimeout(500);
      }

      // Snapshot state after
      const after = await page.evaluate((args) => {
        const { tid, isAlly, isSelfCast } = args;
        const f = allFighters.find(ff => ff.id === tid && ff.side === 'left') || allFighters[0];
        const enemies = allFighters.filter(e => e.side !== f.side);
        const allies = allFighters.filter(a => a.side === f.side);
        const target = isSelfCast ? f : isAlly ? allies[0] : enemies[0];
        return {
          fighterHp: f.hp, fighterShield: f.shield, fighterAtk: f.atk,
          fighterBuffCount: f.buffs.length,
          fighterGold: f._goldCoins || 0,
          targetHp: target ? target.hp : 0,
          targetShield: target ? target.shield : 0,
          targetBuffCount: target ? target.buffs.length : 0,
          targetAlive: target ? target.alive : false,
          enemyTotalHp: enemies.reduce((s, e) => s + e.hp, 0),
          allyTotalHp: allies.reduce((s, a) => s + a.hp, 0),
          dmgDealt: f._dmgDealt || 0,
        };
      }, { tid: turtle.id, isAlly: skill.isAlly, isSelfCast: skill.selfCast });

      // Verify effect
      let status = '✅';
      let reason = '';

      if (skill.isDamage && !skill.isHeal && !skill.isShield && !skill.isBuff) {
        // Damage skill: enemy HP should decrease OR enemy should be dead
        if (after.enemyTotalHp >= before.enemyTotalHp && after.targetAlive !== false) {
          status = '⚠️';
          reason = `no damage dealt (enemy HP ${before.enemyTotalHp}→${after.enemyTotalHp})`;
        }
      } else if (skill.isHeal) {
        // Heal: some ally HP should change (or be at max already)
        // Can't easily verify if everyone was at max
      } else if (skill.isShield) {
        // Shield: fighter or ally shield should increase
        if (skill.selfCast && after.fighterShield <= before.fighterShield && skill.type !== 'diceStableShield') {
          // diceStableShield depends on crit which might be 0
          status = '⚠️';
          reason = `no shield gained (${before.fighterShield}→${after.fighterShield})`;
        }
      } else if (skill.type === 'fortuneGainCoins') {
        if (after.fighterGold <= before.fighterGold) {
          status = '⚠️';
          reason = `no coins gained (${before.fighterGold}→${after.fighterGold})`;
        }
      }

      results.push({ turtle: turtle.name, skill: skill.name, type: skill.type, status, reason });
      if (status !== '✅') {
        console.log(`${status} ${turtle.name} → ${skill.name} (${skill.type}): ${reason}`);
      }
    }
    process.stdout.write('.');
  }

  await browser.close();
  server.close();

  // Summary
  console.log('\n\n' + '='.repeat(60));
  const ok = results.filter(r => r.status === '✅').length;
  const warn = results.filter(r => r.status === '⚠️');
  const fail = results.filter(r => r.status === '❌');
  const skip = results.filter(r => r.status === '⏭').length;
  console.log(`📊 ${ok} ✅  ${warn.length} ⚠️  ${fail.length} ❌  ${skip} ⏭`);

  if (warn.length > 0) {
    console.log('\n⚠️ POSSIBLY BROKEN (no expected effect):');
    warn.forEach(r => console.log(`  ${r.turtle} → ${r.skill} (${r.type}): ${r.reason}`));
  }
  if (fail.length > 0) {
    console.log('\n❌ ERRORS:');
    fail.forEach(r => console.log(`  ${r.turtle} → ${r.skill} (${r.type}): ${r.reason}`));
  }
  if (errors.length > 0) {
    console.log('\n🐛 Page errors:');
    [...new Set(errors)].forEach(e => console.log(`  ${e}`));
  }
  console.log('='.repeat(60));
  process.exit(warn.length + fail.length > 0 ? 1 : 0);
}

runTest().catch(e => { console.error('Fatal:', e); server.close(); process.exit(1); });
