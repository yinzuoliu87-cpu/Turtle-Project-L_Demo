// Targeted skill test: force each turtle to use every skill, catch errors
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
  const mimeTypes = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json','.mp3':'audio/mpeg','.ogg':'audio/ogg','.md':'text/plain' };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const PORT = 8766;
server.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));

const errors = [];
const skillResults = [];

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));

  console.log('🐢 Loading game...');
  await page.goto(`http://localhost:${PORT}/games/turtle-battle/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Get all turtle IDs and their skills
  const turtleData = await page.evaluate(() => {
    return ALL_PETS.map(p => ({
      id: p.id, name: p.name,
      skillCount: (p.skillPool || p.skills || []).length,
      skills: (p.skillPool || p.skills || []).map((s, i) => ({
        idx: i, name: s.name, type: s.type,
        passive: !!s.passiveSkill, selfCast: !!s.selfCast,
        isAlly: !!s.isAlly, aoe: !!s.aoe, aoeAlly: !!s.aoeAlly
      }))
    }));
  });
  console.log(`Found ${turtleData.length} turtles\n`);

  // Test each turtle: put it on left side, force it to use each skill
  for (const turtle of turtleData) {
    const activeSkills = turtle.skills.filter(s => !s.passive);
    if (activeSkills.length === 0) continue;

    console.log(`\n🐢 Testing: ${turtle.name} (${activeSkills.length} active skills)`);

    // Start a battle with this turtle
    await page.evaluate(() => { if (typeof showScreen === 'function') showScreen('screenMenu'); });
    await page.waitForTimeout(300);
    await page.evaluate(() => startMode('pve'));
    await page.waitForTimeout(300);

    // Place this turtle + 2 fillers
    const placed = await page.evaluate((tid) => {
      const ids = ALL_PETS.map(p => p.id);
      const others = ids.filter(id => id !== tid);
      _fgSlots = {};
      _fgSlots['front-0'] = tid;
      _fgSlots['front-1'] = others[0];
      _fgSlots['back-0'] = others[1];
      renderFgSlots(); renderPetGrid(); updateConfirmBtn();
      return true;
    }, turtle.id);
    await page.waitForTimeout(200);

    // Start battle
    await page.evaluate(() => document.getElementById('btnConfirmTeam')?.click());
    await page.waitForTimeout(2000);

    // Inject ALL skills from skillPool into the fighter (override the 3-skill limit)
    await page.evaluate((tid) => {
      const f = allFighters.find(ff => ff.id === tid && ff.side === 'left');
      if (!f) return;
      const pet = ALL_PETS.find(p => p.id === tid);
      if (!pet) return;
      const pool = pet.skillPool || pet.skills || [];
      f.skills = pool.filter(s => !s.passiveSkill).map(s => ({ ...s, cdLeft: 0 }));
    }, turtle.id);

    // Force each active skill
    const errsBefore = errors.length;
    for (const skill of activeSkills) {
      const result = await page.evaluate((args) => {
        try {
          const { turtleId, skillType, isAlly, isSelfCast, isAoe, isAoeAlly } = args;
          const f = allFighters.find(ff => ff.id === turtleId && ff.side === 'left');
          if (!f || !f.alive) return { ok: false, err: 'fighter not found or dead' };
          // Find skill by type in the injected skills array
          const skillIdx = f.skills.findIndex(s => s.type === skillType);
          if (skillIdx < 0) return { ok: false, err: `skill type ${skillType} not found in fighter skills (has ${f.skills.map(s=>s.type).join(',')})` };
          f.skills[skillIdx].cdLeft = 0;

          const enemies = allFighters.filter(e => e.alive && e.side !== f.side);
          const allies = allFighters.filter(a => a.alive && a.side === f.side);
          if (enemies.length === 0) return { ok: false, err: 'no enemies alive' };

          let targetId;
          if (isSelfCast || isAoe || isAoeAlly) {
            targetId = allFighters.indexOf(f);
          } else if (isAlly) {
            targetId = allFighters.indexOf(allies[0]);
          } else {
            targetId = allFighters.indexOf(enemies[0]);
          }

          executeAction({ attackerId: allFighters.indexOf(f), skillIdx, targetId, aoe: isAoe });
          return { ok: true };
        } catch(e) {
          return { ok: false, err: e.message };
        }
      }, { turtleId: turtle.id, skillType: skill.type, isAlly: skill.isAlly, isSelfCast: skill.selfCast, isAoe: skill.aoe, isAoeAlly: skill.aoeAlly });

      // Wait for animation to finish
      await page.waitForTimeout(1500);
      // Wait for animating to clear
      for (let w = 0; w < 20; w++) {
        const still = await page.evaluate(() => typeof animating !== 'undefined' && animating);
        if (!still) break;
        await page.waitForTimeout(500);
      }

      const newErrs = errors.slice(errsBefore);
      const status = result.ok ? (newErrs.length > 0 ? '⚠️' : '✅') : '❌';
      const errMsg = !result.ok ? result.err : (newErrs.length > 0 ? newErrs.join('; ') : '');

      skillResults.push({ turtle: turtle.name, skill: skill.name, type: skill.type, status, err: errMsg });

      if (status !== '✅') {
        console.log(`  ${status} ${skill.name} (${skill.type}): ${errMsg}`);
      } else {
        process.stdout.write(`  ${status}`);
      }
    }
    console.log('');

    // Heal everyone for next test
    await page.evaluate(() => {
      allFighters.forEach(f => { f.hp = f.maxHp; f.alive = true; f._deathProcessed = false; f.shield = 0; f.buffs = []; });
      battleOver = false;
    });
  }

  await browser.close();
  server.close();

  // Summary
  console.log('\n' + '='.repeat(60));
  const failed = skillResults.filter(r => r.status === '❌');
  const warned = skillResults.filter(r => r.status === '⚠️');
  const passed = skillResults.filter(r => r.status === '✅');
  console.log(`📊 Results: ${passed.length} ✅  ${warned.length} ⚠️  ${failed.length} ❌`);

  if (failed.length > 0) {
    console.log('\n❌ FAILED:');
    failed.forEach(r => console.log(`  ${r.turtle} → ${r.skill} (${r.type}): ${r.err}`));
  }
  if (warned.length > 0) {
    console.log('\n⚠️ WARNINGS (JS errors during execution):');
    warned.forEach(r => console.log(`  ${r.turtle} → ${r.skill} (${r.type}): ${r.err}`));
  }

  console.log('\n🐛 Total page errors:', errors.length);
  // Deduplicate errors
  const uniqErrors = [...new Set(errors)];
  uniqErrors.forEach(e => console.log(`  ${e}`));
  console.log('='.repeat(60));

  process.exit(failed.length + warned.length > 0 ? 1 : 0);
}

runTest().catch(e => { console.error('Fatal:', e); server.close(); process.exit(1); });
