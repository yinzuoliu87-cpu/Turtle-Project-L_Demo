// Automated battle test using Playwright
// Usage: node tests/test-battle.mjs
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../');

// Simple static file server
const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, decodeURIComponent(req.url === '/' ? '/index.html' : req.url));
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
    '.md': 'text/plain',
  };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

const PORT = 8765;
server.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));

const errors = [];
const warnings = [];
const logs = [];

async function runBattle() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Collect console messages
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') errors.push(text);
    else if (msg.type() === 'warning') warnings.push(text);
    // Track battle log entries
    if (text.includes('被动') || text.includes('伤害') || text.includes('回合')) logs.push(text);
  });
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));

  console.log('\n🐢 Loading game...');
  await page.goto(`http://localhost:${PORT}/games/turtle-battle/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Click PVE mode
  console.log('🎮 Selecting PVE mode...');
  await page.evaluate(() => {
    if (typeof startMode === 'function') startMode('pve');
  });
  await page.waitForTimeout(500);

  // Auto-select 3 turtles: directly populate formation slots
  console.log('🐢 Selecting turtles...');
  const petCount = await page.evaluate(() => {
    const pets = document.querySelectorAll('.pet-card');
    const ids = Array.from(pets).map(p => p.dataset.id).filter(Boolean);
    // Directly set formation slots
    if (typeof _fgSlots !== 'undefined') {
      _fgSlots['front-0'] = ids[0];
      _fgSlots['front-1'] = ids[1];
      _fgSlots['back-0'] = ids[2];
    }
    if (typeof renderFgSlots === 'function') renderFgSlots();
    if (typeof renderPetGrid === 'function') renderPetGrid();
    if (typeof updateConfirmBtn === 'function') updateConfirmBtn();
    return ids.length;
  });
  console.log(`  Found ${petCount} turtles, selected 3`);
  await page.waitForTimeout(500);

  // Click confirm button (keep pve mode for proper startBattle flow)
  console.log('⚔️ Starting battle...');
  await page.evaluate(() => {
    const btn = document.getElementById('btnConfirmTeam');
    if (btn && !btn.disabled) btn.click();
  });
  // Wait for battle to actually start
  await page.waitForTimeout(2000);
  // Patch the game to make BOTH sides AI-controlled
  await page.evaluate(() => {
    // Override the player/AI check: wrap nextSideAction to force AI for left side too
    const _origNSA = nextSideAction;
    nextSideAction = async function() {
      // Get canAct fighters for current side
      const sideTeam = activeSide === 'left' ? leftTeam : rightTeam;
      const canAct = sideTeam.filter(f => f.alive && !actedThisSide.has(allFighters.indexOf(f)));
      // Skip pirate ships
      const realCanAct = canAct.filter(f => !f._isPirateShip);
      if (realCanAct.length > 0 && !battleOver && !animating) {
        // Force AI action for the first available fighter
        const f = realCanAct[0];
        actedThisSide.add(allFighters.indexOf(f));
        aiAction(f);
        return;
      }
      // Fallback to original
      return _origNSA.call(this);
    };
    // Kick off the first action since we're stuck waiting for player
    if (!battleOver && !animating) nextSideAction();
  });

  // Wait for battle to finish (check for result screen)
  console.log('⏳ Waiting for battle to finish (max 90s)...');
  let battleDone = false;
  for (let i = 0; i < 180; i++) {
    await page.waitForTimeout(500);
    battleDone = await page.evaluate(() => {
      if (typeof battleOver !== 'undefined' && battleOver) return true;
      // Also check if one side is fully dead (battleOver might be delayed)
      if (typeof leftTeam !== 'undefined' && typeof rightTeam !== 'undefined') {
        const lA = leftTeam.some(f => f.alive), rA = rightTeam.some(f => f.alive);
        if (!lA || !rA) return true;
      }
      return false;
    });
    if (battleDone) break;
    if (i % 20 === 0 && i > 0) console.log(`  ... ${i/2}s elapsed, battle ongoing`);
  }

  if (battleDone) {
    console.log('✅ Battle finished!');
  } else {
    console.log('⚠️ Battle did not finish in 120s (might be stuck)');
    errors.push('TIMEOUT: Battle did not finish in 120s');
  }

  // Get battle stats
  const stats = await page.evaluate(() => {
    const result = {};
    if (typeof turnNum !== 'undefined') result.turns = turnNum;
    if (typeof leftTeam !== 'undefined') result.leftAlive = leftTeam.filter(f => f.alive).length;
    if (typeof rightTeam !== 'undefined') result.rightAlive = rightTeam.filter(f => f.alive).length;
    if (typeof allFighters !== 'undefined') {
      result.fighters = allFighters.map(f => ({
        name: f.name, side: f.side, alive: f.alive,
        hp: f.hp, maxHp: f.maxHp, dmgDealt: f._dmgDealt, dmgTaken: f._dmgTaken
      }));
    }
    return result;
  });

  console.log(`\n📊 Battle Stats:`);
  console.log(`  Turns: ${stats.turns}`);
  console.log(`  Left alive: ${stats.leftAlive}, Right alive: ${stats.rightAlive}`);
  if (stats.fighters) {
    for (const f of stats.fighters) {
      console.log(`  ${f.side === 'left' ? '🟢' : '🔴'} ${f.name}: ${f.alive ? '✓' : '✗'} HP ${f.hp}/${f.maxHp} DMG ${f.dmgDealt||0}dealt ${f.dmgTaken||0}taken`);
    }
  }

  // Run more battles with different turtles
  for (let battle = 2; battle <= 10; battle++) {
    console.log(`\n--- Battle ${battle} ---`);
    try {
      // Go back to menu
      await page.evaluate(() => {
        if (typeof showScreen === 'function') showScreen('screenMenu');
      });
      await page.waitForTimeout(800);

      // Start PVE and pick turtles
      await page.evaluate((b) => {
        startMode('pve');
        setTimeout(() => {
          const pets = document.querySelectorAll('.pet-card');
          const ids = Array.from(pets).map(p => p.dataset.id).filter(Boolean);
          const offset = b * 3;
          _fgSlots = {};
          _fgSlots['front-0'] = ids[offset % ids.length];
          _fgSlots['front-1'] = ids[(offset+1) % ids.length];
          _fgSlots['back-0'] = ids[(offset+2) % ids.length];
          renderFgSlots(); renderPetGrid(); updateConfirmBtn();
          setTimeout(() => {
            document.getElementById('btnConfirmTeam')?.click();
          }, 300);
        }, 500);
      }, battle);

      await page.waitForTimeout(2500);

      // Patch AI override again
      await page.evaluate(() => {
        const _origNSA2 = nextSideAction;
        nextSideAction = async function() {
          const sideTeam = activeSide === 'left' ? leftTeam : rightTeam;
          const canAct = sideTeam.filter(f => f.alive && !f._isPirateShip && !actedThisSide.has(allFighters.indexOf(f)));
          if (canAct.length > 0 && !battleOver && !animating) {
            actedThisSide.add(allFighters.indexOf(canAct[0]));
            aiAction(canAct[0]);
            return;
          }
          return _origNSA2.call(this);
        };
        if (!battleOver && !animating) nextSideAction();
      });

      // Wait for battle
      let done = false;
      for (let i = 0; i < 180; i++) {
        await page.waitForTimeout(500);
        done = await page.evaluate(() => {
          if (typeof battleOver !== 'undefined' && battleOver) return true;
          if (typeof leftTeam !== 'undefined' && typeof rightTeam !== 'undefined') {
            const lA = leftTeam.some(f => f.alive), rA = rightTeam.some(f => f.alive);
            if (!lA || !rA) return true;
          }
          return false;
        });
        if (done) break;
      }
      console.log(done ? `  Battle ${battle} finished!` : `  Battle ${battle} TIMEOUT`);
      if (!done) errors.push(`Battle ${battle} TIMEOUT`);

      const s2 = await page.evaluate(() => ({
        turns: turnNum,
        fighters: allFighters.map(f => ({ name:f.name, side:f.side, alive:f.alive, hp:f.hp, maxHp:f.maxHp }))
      }));
      if (s2.fighters) for (const f of s2.fighters) console.log(`  ${f.side==='left'?'🟢':'🔴'} ${f.name}: ${f.alive?'✓':'✗'} HP ${f.hp}/${f.maxHp}`);
    } catch(e) {
      console.log(`  Battle ${battle} error: ${e.message}`);
      errors.push(`Battle ${battle}: ${e.message}`);
    }
  }

  await browser.close();
  server.close();

  // Report
  console.log('\n' + '='.repeat(60));
  console.log(`🐛 ERRORS: ${errors.length}`);
  errors.forEach(e => console.log(`  ❌ ${e}`));
  console.log(`⚠️ WARNINGS: ${warnings.length}`);
  if (warnings.length > 10) console.log(`  (showing first 10)`);
  warnings.slice(0, 10).forEach(w => console.log(`  ⚠️ ${w}`));
  console.log('='.repeat(60));

  process.exit(errors.length > 0 ? 1 : 0);
}

runBattle().catch(e => { console.error('Fatal:', e); server.close(); process.exit(1); });
