// ── BATTLE POSITION CONFIG ─────────────────────────────────
// Positions defined on the 16:9 BACKGROUND IMAGE coordinate system.
// x = % from left edge of image, y = % from top edge of image.
// Left side positions; right side auto-mirrors (100-x).
// ONE config for ALL screen sizes — JS maps to actual container via cover math.
const BATTLE_POSITIONS = {
  desktop: {
    'front-0': { x: 42, y: 43 },
    'front-1': { x: 41, y: 62 },
    'front-2': { x: 40, y: 81 },
    'back-0':  { x: 31, y: 43 },
    'back-1':  { x: 26, y: 62 },
    'back-2':  { x: 22, y: 81 },
  },
  mobile: {
    'front-0': { x: 46, y: 38 },
    'front-1': { x: 45, y: 59 },
    'front-2': { x: 44, y: 79 },
    'back-0':  { x: 39, y: 38 },
    'back-1':  { x: 37, y: 59 },
    'back-2':  { x: 35, y: 79 },
  },
};

// Map a point on the 16:9 source image to pixel position in a cover-cropped container
function mapCoverPos(imgX, imgY, containerW, containerH) {
  const imgRatio = 16 / 9;
  const cRatio = containerW / containerH;
  let scale, offsetX, offsetY;
  if (cRatio > imgRatio) {
    // Container wider than image → image scaled to fill width, crops top/bottom
    scale = containerW / 1; // normalized
    const visibleH = 1 / cRatio * imgRatio; // fraction of image height visible
    offsetY = (1 - visibleH) / 2; // cropped from top
    offsetX = 0;
    const px = imgX / 100 * containerW;
    const py = (imgY / 100 - offsetY) / visibleH * containerH;
    return { px, py };
  } else {
    // Container taller than image → image scaled to fill height, crops left/right
    const visibleW = cRatio / imgRatio; // fraction of image width visible
    offsetX = (1 - visibleW) / 2; // cropped from left
    offsetY = 0;
    const px = (imgX / 100 - offsetX) / visibleW * containerW;
    const py = imgY / 100 * containerH;
    return { px, py };
  }
}

function renderFighters() {
  renderScene();
}

function renderScene() {
  const scene = document.getElementById('battleScene');
  if (!scene) return;
  // Remove old scene turtles
  scene.querySelectorAll('.scene-turtle').forEach(el => el.remove());
  // Ensure layout is complete before reading dimensions
  if (!scene.offsetWidth || !scene.offsetHeight) {
    requestAnimationFrame(() => renderScene());
    return;
  }

  // Render each fighter as a scene turtle
  const cw = scene.offsetWidth, ch = scene.offsetHeight;
  const renderTurtle = (f, posClass, side, slotKey) => {
    const el = document.createElement('div');
    el.className = 'scene-turtle ' + posClass;
    // Map position from 16:9 image coords to cover-cropped container
    const posSet = window.innerWidth <= 768 ? BATTLE_POSITIONS.mobile : BATTLE_POSITIONS.desktop;
    const pos = posSet[slotKey];
    if (pos && cw && ch) {
      const imgX = side === 'left' ? pos.x : (100 - pos.x);
      const imgY = pos.y;
      const mapped = mapCoverPos(imgX, imgY, cw, ch);
      // Position turtle centered on the mapped point
      const leftPct = mapped.px / cw * 100;
      const bottomPct = (1 - mapped.py / ch) * 100;
      el.style.left = leftPct + '%';
      el.style.bottom = bottomPct + '%';
      el.style.right = 'auto';
      el.style.top = 'auto';
      // Center element on point (offsetWidth = layout width before scale transform)
      requestAnimationFrame(() => {
        el.style.marginLeft = (-el.offsetWidth / 2) + 'px';
      });
    }
    el.id = getFighterElId(f);
    el.dataset.pid = f.petId || f.id || '';
    el.onclick = () => showFighterDetail(f);

    const spriteSize = 80;
    const spriteHTML = buildPetImgHTML(f, spriteSize);
    const isAlly = gameMode === 'pvp-online' ? (f.side === onlineSide) : (f.side === 'left');
    const totalEff = f.hp + f.shield + (f.bubbleShieldVal || 0);
    const barMax = Math.max(f.maxHp, totalEff);
    const hpPct = Math.max(0, f.hp / barMax * 100);
    const shieldPct = f.shield / barMax * 100;
    const bsPct = (f.bubbleShieldVal || 0) / barMax * 100;
    const hpGrad = isAlly
      ? 'linear-gradient(180deg, #3deb9e 38%, #1fb57f 42%)'
      : 'linear-gradient(180deg, #c084fc 38%, #9d5be8 42%)';

    // Tick marks: minor every 50 HP (half height), major every 500 HP
    // (full height). Boss-scale (>1000) doubles both steps to keep density
    // readable: minor 100, major 1000.
    const majorStep = barMax > 1000 ? 1000 : 500;
    const minorStep = barMax > 1000 ? 100 : 50;
    let ticksHtml = '';
    for (let v = minorStep; v < barMax; v += minorStep) {
      const pct = v / barMax * 100;
      if (pct >= 99.5) break;
      const isMajor = v % majorStep === 0;
      ticksHtml += `<div class="st-hp-tick${isMajor ? ' st-hp-tick-major' : ''}" style="left:${pct}%"></div>`;
    }

    // Layout note: .scene-turtle is the stable positioning anchor. Ground-level
    // shadow (.st-shadow) and UI elements (.st-hp-row, .st-buffs, chest pile)
    // stay put across attack/hurt/death animations. The sprite (and only the
    // sprite) is wrapped in .st-body so all knockback/hop/death keyframes
    // animate the body without dragging the shadow or HP bar around.
    el.innerHTML = `
      <div class="st-shadow"></div>
      <div class="st-hp-row" style="display:flex;align-items:center;gap:3px">
        ${f._level ? `<span class="st-level-badge">Lv.${f._level}</span>` : ''}
      <div class="st-hp-wrap">
        <div class="st-hp-bar">
          <div class="st-hp-delay" style="width:${hpPct}%"></div>
          <div class="st-hp-fill" style="width:${hpPct}%;background:${hpGrad}"></div>
          <div class="st-shield-fill" style="width:${shieldPct}%;left:${hpPct}%;${f.shield > 0 ? '' : 'display:none'}"></div>
          <div class="st-bubble-shield" style="width:${bsPct}%;left:${hpPct + shieldPct}%;${f.bubbleShieldVal > 0 ? '' : 'display:none'}"></div>
          <div class="st-hp-ticks">${ticksHtml}</div>
        </div>
        ${f.passive && f.passive.type === 'bubbleStore' ? `<div class="st-bubble-store-bar"><div class="st-bubble-store-fill" style="width:0%"></div></div>` : ''}
        ${f.passive && f.passive.type === 'lavaRage' ? `<div class="st-rage-bar"><div class="st-rage-fill" style="width:0%"></div></div>` : ''}
        ${f.passive && f.passive.type === 'starEnergy' ? `<div class="st-energy-bar"><div class="st-energy-fill" style="width:0%"></div></div>` : ''}
        ${f.passive && f.passive.type === 'auraAwaken' && f.passive.energyStore ? `<div class="st-energy-bar"><div class="st-energy-fill" style="width:0%"></div></div>` : ''}
      </div>
      </div>
      <div class="st-body"><div class="st-sprite">${spriteHTML}</div></div>
      ${f.passive && f.passive.type === 'chestTreasure' ? `<div class="st-chest-pile" data-chest-progress>0/${f.passive.thresholds[0]}</div>` : ''}
      <div class="st-buffs"></div>
    `;

    if (!f.alive) el.classList.add('dead');
    // Boss sizing handled via .is-boss class + CSS --base-scale variable
    // so animations compose scale(var(--base-scale)) without snapping mid-anim.
    if (f._isBoss) el.classList.add('is-boss');
    scene.appendChild(el);
    renderSceneBuffs(f);
  };

  // Assign position based on slot key (fixed 6 positions)
  const assignPos = (team, side) => {
    team.forEach(f => {
      if (f._isPirateShip) return; // rendered separately below
      const slot = f._slotKey || 'front-0';
      renderTurtle(f, `pos-${side}-${slot}`, side, slot);
    });
  };
  assignPos(leftTeam, 'left');
  assignPos(rightTeam, 'right');

  // Pirate ships: render at their assigned slot (set when summoned)
  allFighters.forEach(f => {
    if (!f._isPirateShip || !f.alive) return;
    const slot = f._slotKey || 'back-2';
    renderTurtle(f, `pos-${f.side}-${slot} pirate-ship-turtle`, f.side, slot);
  });

  // Summons
  allFighters.forEach(f => {
    if (f._summon && f._summon.alive) {
      renderSummonMiniCard(f);
    }
  });
}

function renderSceneBuffs(f) {
  const el = document.getElementById(getFighterElId(f));
  if (!el) return;
  const box = el.querySelector('.st-buffs');
  if (!box) return;
  const ic = (src) => `<img src="assets/${src}" style="width:14px;height:14px;vertical-align:middle">`;
  const icons = [];
  for (const b of (f.buffs || [])) {
    if (b.type === 'phoenixBurnDot') icons.push(ic('status/burn-icon.png'));
    else if (b.type === 'dot') icons.push(ic('status/curse-debuff-icon.png'));
    else if (b.type === 'atkUp') icons.push('<span style="color:#06d6a0">⬆</span>');
    else if (b.type === 'atkDown') icons.push('<span style="color:#ff6b6b">⬇</span>');
    else if (b.type === 'defUp') icons.push('<span style="color:#06d6a0">⬆</span>');
    else if (b.type === 'defDown') icons.push('<span style="color:#ff6b6b">⬇</span>');
    else if (b.type === 'mrUp') icons.push('<span style="color:#4dabf7">⬆</span>');
    else if (b.type === 'mrDown') icons.push('<span style="color:#ff6b6b">⬇</span>');
    else if (b.type === 'dodge') icons.push(ic('status/dodge-new-icon.png'));
    else if (b.type === 'stun') icons.push(ic('status/stun-icon.png'));
    else if (b.type === 'healReduce') icons.push(ic('status/heal-reduce-icon.png'));
    else if (b.type === 'hot') icons.push('<span style="color:#06d6a0">+</span>');
    else if (b.type === 'fear') icons.push(ic('status/fear-icon.png'));
    else if (b.type === 'bubbleBind') icons.push(ic('passive/bubble-store-icon.png'));
    else if (b.type === 'trap') icons.push(ic('passive/ninja-instinct-icon.png'));
    else if (b.type === 'diceFateCrit') icons.push(ic('passive/gambler-blood-icon.png'));
    else if (b.type === 'gamblerPierceConvert') icons.push(ic('passive/gambler-blood-icon.png'));
    else if (b.type === 'hidingShield') icons.push(ic('status/shield-icon.png'));
    else if (b.type === 'poison') icons.push(ic('status/poison-icon.png'));
    else if (b.type === 'chilled') icons.push(ic('status/chilled-icon.png'));
    else if (b.type === 'bleed') icons.push(ic('status/bleed-icon.png'));
    else if (b.type === 'taunt') icons.push(ic('status/taunt-icon.png'));
    else if (b.type === 'physImmune') icons.push(ic('status/stealth-icon.png'));
    else if (b.type === 'reflect') icons.push(ic('status/reflect-icon.png'));
    else if (b.type === 'hunterMark') icons.push(ic('passive/hunter-kill-icon.png'));
    else if (b.type === 'wormhole') icons.push(ic('status/wormhole-icon.png'));
    else if (b.type === 'counter' || b.type === 'dodgeCounter') icons.push(ic('status/counter-icon.png'));
    else if (b.type === 'lifesteal') icons.push(ic('stats/lifesteal-icon.png'));
    else if (b.type === 'dmgReduce') icons.push(ic('status/shield-icon.png'));
  }
  // Special state icons (not in buffs array)
  if (f._inkStacks > 0) icons.push(`<span style="color:#b8b8ff" title="墨迹${f._inkStacks}层">${ic('passive/ink-mark-icon.png')}${f._inkStacks}</span>`);
  if (f._shockStacks > 0) icons.push(`<span style="color:#ffd700" title="电击${f._shockStacks}层">${ic('passive/lightning-storm-icon.png')}${f._shockStacks}</span>`);
  if (f._goldLightning > 0) icons.push(`<span style="color:#ffd700" title="金闪电${f._goldLightning}/5">${ic('passive/lightning-storm-icon.png')}${f._goldLightning}</span>`);
  if (f._collideStacks > 0) icons.push(`<span title="碰撞${f._collideStacks}/2">${ic('passive/diamond-structure-icon.png')}${f._collideStacks}</span>`);
  if (f._crystallize > 0) icons.push(`<span title="结晶${f._crystallize}/4">${ic('passive/crystal-resonance-icon.png')}${f._crystallize}</span>`);
  // Equipment icons
  if (f._equips && f._equips.length) {
    for (const eq of f._equips) {
      const eIcon = eq.icon && eq.icon.endsWith('.png') ? `<img src="assets/${eq.icon}" style="width:12px;height:12px" title="${eq.name}">` : (eq.icon||'');
      icons.push(`<span style="background:rgba(255,215,0,.15);border-radius:3px;padding:0 1px" title="${eq.name}">${eIcon}</span>`);
    }
  }
  box.innerHTML = icons.slice(0, 8).map(i => i).join('');
}

// Update HP bar for a scene turtle
function updateSceneHp(f) {
  const el = document.getElementById(getFighterElId(f));
  if (!el) return;

  // Body size scales with maxHp change (0.9 ~ 1.15)
  if (f._initHp && f.maxHp !== f._lastMaxHp) {
    f._lastMaxHp = f.maxHp;
    const ratio = f.maxHp / f._initHp;
    const sizeScale = Math.max(0.9, Math.min(1.15, 0.85 + ratio * 0.15));
    // Use CSS variable so we don't override the scaleX(-1) flip from stylesheet
    el.style.setProperty('--body-scale', sizeScale.toFixed(3));
  }

  const isAlly = gameMode === 'pvp-online' ? (f.side === onlineSide) : (f.side === 'left');
  const totalEff = f.hp + f.shield + (f.bubbleShieldVal || 0);
  const barMax = Math.max(f.maxHp, totalEff);
  const hpPct = Math.max(0, f.hp / barMax * 100);
  const hpGrad = isAlly
    ? 'linear-gradient(180deg, #3deb9e 40%, #089e6b 60%)'
    : 'linear-gradient(180deg, #c084fc 40%, #7c3aed 60%)';

  // ── HP fill ──
  const hpFill = el.querySelector('.st-hp-fill');
  if (hpFill) {
    hpFill.style.width = hpPct + '%';
    hpFill.style.background = hpGrad;
  }

  // ── Delay trail ──
  const hpDelay = el.querySelector('.st-hp-delay');
  if (hpDelay) {
    // First-time init: treat current HP as baseline (no damage animation)
    const isFirstCall = hpDelay._hp === undefined;
    const oldHp = isFirstCall ? f.hp : hpDelay._hp;
    const oldPct = isFirstCall ? hpPct : (hpDelay._pct !== undefined ? hpDelay._pct : hpPct);
    hpDelay._hp = f.hp;

    if (f.hp < oldHp) {
      // Damage: red trail holds, then shrinks
      hpDelay.style.width = oldPct + '%';
      hpDelay.style.background = 'linear-gradient(180deg, #ee5555 40%, #aa2222 60%)';
      hpDelay.style.opacity = '1';
      hpDelay.style.transition = 'none';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        hpDelay.style.transition = 'width 0.5s ease-in-out 0.2s, opacity 0.4s ease-in 0.5s';
        hpDelay.style.width = hpPct + '%';
        hpDelay.style.opacity = '0';
      }));
      // Hit flash
      if (hpFill) {
        hpFill.classList.add('hp-flash');
        setTimeout(() => {
          hpFill.style.transition = 'width .15s ease-out, filter 0.15s ease-out';
          hpFill.classList.remove('hp-flash');
        }, 60);
      }
    } else if (f.hp > oldHp) {
      // Heal: green flash
      hpDelay.style.width = hpPct + '%';
      hpDelay.style.background = 'linear-gradient(180deg, #66ffaa 40%, #06d6a0 60%)';
      hpDelay.style.opacity = '0.7';
      hpDelay.style.transition = 'none';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        hpDelay.style.transition = 'opacity 0.4s ease-out 0.1s';
        hpDelay.style.opacity = '0';
      }));
    }
    hpDelay._pct = hpPct;
  }

  // ── Shield fill ──
  const shieldPct = f.shield / barMax * 100;
  let shieldFill = el.querySelector('.st-shield-fill');
  if (shieldFill) {
    if (f.shield > 0) {
      shieldFill.style.display = '';
      shieldFill.style.left = hpPct + '%';
      shieldFill.style.width = shieldPct + '%';
    } else {
      shieldFill.style.display = 'none';
    }
  }

  // ── Bubble shield fill ──
  const bsPct = (f.bubbleShieldVal || 0) / barMax * 100;
  let bsEl = el.querySelector('.st-bubble-shield');
  if (bsEl) {
    if (f.bubbleShieldVal > 0) {
      bsEl.style.display = '';
      bsEl.style.left = (hpPct + shieldPct) + '%';
      bsEl.style.width = bsPct + '%';
    } else {
      bsEl.style.display = 'none';
    }
  }

  // ── Tick marks (rebuild if barMax changed) ──
  const tickContainer = el.querySelector('.st-hp-ticks');
  if (tickContainer && tickContainer._barMax !== barMax) {
    const majorStep = barMax > 1000 ? 1000 : 500;
    const minorStep = barMax > 1000 ? 100 : 50;
    let ticksHtml = '';
    for (let v = minorStep; v < barMax; v += minorStep) {
      const pct = v / barMax * 100;
      if (pct >= 99.5) break;
      const isMajor = v % majorStep === 0;
      ticksHtml += `<div class="st-hp-tick${isMajor ? ' st-hp-tick-major' : ''}" style="left:${pct}%"></div>`;
    }
    tickContainer.innerHTML = ticksHtml;
    tickContainer._barMax = barMax;
  }

  // ── Bubble store bar ──
  const bBar = el.querySelector('.st-bubble-store-bar');
  if (bBar) {
    if (f.passive && f.passive.type === 'bubbleStore' && f.bubbleStore > 0) {
      bBar.style.display = '';
      const maxStore = f.maxHp * 1.5;  // cap is 150% maxHp
      bBar.querySelector('.st-bubble-store-fill').style.width = Math.min(f.bubbleStore / maxStore * 100, 100) + '%';
    } else {
      bBar.style.display = 'none';
    }
  }

  // ── Rage bar (lava turtle) ──
  const rageBar = el.querySelector('.st-rage-fill');
  if (rageBar && f.passive && f.passive.type === 'lavaRage') {
    const ragePct = f._lavaTransformed ? 100 : Math.min(100, (f._lavaRage || 0) / f.passive.rageMax * 100);
    rageBar.style.width = ragePct + '%';
  }

  // ── Energy bar (star turtle) ──
  const energyBar = el.querySelector('.st-energy-fill');
  if (energyBar && f.passive && f.passive.type === 'starEnergy') {
    const maxE = Math.round(f.maxHp * f.passive.maxChargePct / 100);
    const ePct = Math.min(100, (f._starEnergy || 0) / maxE * 100);
    energyBar.style.width = ePct + '%';
  }

  // ── Aura energy bar (龟壳 stored energy, cap 150% maxHp) ──
  if (f.passive && f.passive.type === 'auraAwaken' && f.passive.energyStore) {
    const allEBars = el.querySelectorAll('.st-energy-fill');
    const auraBar = allEBars[allEBars.length - 1]; // last energy bar is aura's
    if (auraBar) {
      const maxVisual = f.maxHp * 1.5;  // cap is 150% maxHp
      const storePct = Math.min(100, (f._storedEnergy || 0) / maxVisual * 100);
      auraBar.style.width = storePct + '%';
    }
  }

  // ── Death state ──
  // Do NOT toggle 'dead' / remove 'death-anim' here. checkDeaths() manages the
  // death animation lifecycle via state.js (adds death-anim, animationend adds
  // 'dead'). Overriding here stomps on the 1.2s animation mid-play.
  // Initial render & revive paths handle class state explicitly.

  // ── Refresh detail panel if showing this fighter ──
  refreshDetailPanel(f);
}

function refreshDetailPanel(f) {
  const panel = document.getElementById('fighterDetailPanel');
  if (!panel || !panel.classList.contains('show') || panel._currentFighter !== f) return;
  // Update HP section
  const isAlly = gameMode === 'pvp-online' ? (f.side === onlineSide) : (f.side === 'left');
  const sc = (cur, init) => cur > init ? 'fdp-up' : cur < init ? 'fdp-down' : '';
  const ic = (name) => `<img src="assets/stats/${name}" class="stat-icon">`;
  const hpPct = Math.max(0, f.hp / f.maxHp * 100);
  const hpColor = isAlly ? 'linear-gradient(180deg,#3deb9e 40%,#089e6b 60%)' : 'linear-gradient(180deg,#c084fc 40%,#7c3aed 60%)';
  const shieldPct = f.shield > 0 ? Math.min(100 - hpPct, f.shield / f.maxHp * 100) : 0;

  // HP line text
  const hpLine = panel.querySelector('.fdp-hp-line');
  if (hpLine) hpLine.innerHTML = `${ic('hp-icon.png')}<span class="${sc(f.maxHp, f._initHp)}">HP ${Math.ceil(f.hp)}/${f.maxHp}</span>${f.shield>0?` <span class="shield-val">${ic('shield-icon.png')}${Math.ceil(f.shield)}</span>`:''}`;

  // HP bar fill
  const hpFill = panel.querySelector('.fdp-hp-fill');
  if (hpFill) { hpFill.style.width = hpPct + '%'; hpFill.style.background = hpColor; }

  // HP bar delay
  const bar = panel.querySelector('.fdp-hp-bar');
  if (bar) {
    let delay = bar.querySelector('.fdp-hp-delay');
    if (!delay) {
      delay = document.createElement('div');
      delay.className = 'fdp-hp-delay';
      bar.insertBefore(delay, bar.firstChild);
      delay._hp = f.hp; delay._pct = hpPct;
    }
    const oldHp = delay._hp !== undefined ? delay._hp : f.hp;
    const oldPct = delay._pct || hpPct;
    delay._hp = f.hp;
    if (f.hp < oldHp) {
      delay.style.width = oldPct + '%';
      delay.style.background = 'linear-gradient(180deg,#ee5555 40%,#aa2222 60%)';
      delay.style.opacity = '1'; delay.style.transition = 'none';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        delay.style.transition = 'width 0.5s ease-in-out 0.2s, opacity 0.4s ease-in 0.5s';
        delay.style.width = hpPct + '%'; delay.style.opacity = '0';
      }));
    } else if (f.hp > oldHp) {
      delay.style.width = hpPct + '%';
      delay.style.background = 'linear-gradient(180deg,#66ffaa 40%,#06d6a0 60%)';
      delay.style.opacity = '0.7'; delay.style.transition = 'none';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        delay.style.transition = 'opacity 0.4s ease-out 0.1s';
        delay.style.opacity = '0';
      }));
    }
    delay._pct = hpPct;
  }

  // Shield fill in panel bar
  let sFill = bar ? bar.querySelector('.fdp-shield-fill') : null;
  if (f.shield > 0) {
    if (!sFill && bar) { sFill = document.createElement('div'); sFill.className = 'fdp-shield-fill'; bar.appendChild(sFill); }
    if (sFill) { sFill.style.width = shieldPct + '%'; sFill.style.left = hpPct + '%'; sFill.style.display = ''; }
  } else if (sFill) { sFill.style.display = 'none'; }

  // Stats colors
  const stats = panel.querySelectorAll('.fdp-stat');
  const defPct = Math.round(f.def / (f.def + DEF_CONSTANT) * 100);
  const mrPct = Math.round((f.mr||f.def) / ((f.mr||f.def) + DEF_CONSTANT) * 100);
  const critPct = Math.min(100, Math.round((f.crit||0) * 100));
  const overflowCrit2 = Math.max(0, (f.crit||0) - 1.0);
  const overflowMult2 = (f.passive && f.passive.overflowMult) || 1.5;
  const critDmgPct = Math.round((1.5 + (f._extraCritDmg||0) + (f._extraCritDmgPerm||0) + overflowCrit2 * overflowMult2) * 100);
  const vals = [
    { cur: f.atk, init: f._initAtk, text: `${ic('atk-icon.png')}攻击 ${f.atk}` },
    { cur: f._lifestealPct||0, init: f._initLifesteal||0, text: `${ic('lifesteal-icon.png')}吸血 ${f._lifestealPct||0}%` },
    { cur: f.def, init: f._initDef, text: `${ic('def-icon.png')}护甲 ${f.def} <span class="fdp-sub">(减免${defPct}%)</span>` },
    { cur: f.mr, init: f._initMr, text: `${ic('mr-icon.png')}魔抗 ${f.mr||f.def} <span class="fdp-sub">(减免${mrPct}%)</span>` },
    { cur: f.crit, init: f._initCrit, text: `${ic('crit-icon.png')}暴击 ${critPct}%` },
    { cur: critDmgPct, init: 150, text: `${ic('crit-dmg-icon.png')}爆伤 ${critDmgPct}%` },
    { cur: f.armorPen, init: f._initArmorPen, text: `${ic('armor-pen-icon.png')}穿甲 ${f.armorPen||0}` },
    { cur: f.magicPen, init: f._initMagicPen, text: `${ic('magic-pen-icon.png')}魔穿 ${f.magicPen||0}` },
  ];
  vals.forEach((v, i) => {
    if (stats[i]) { stats[i].className = 'fdp-stat ' + sc(v.cur, v.init); stats[i].innerHTML = v.text; }
  });
}

// Fighter detail panel (click turtle to show)
function showFighterDetail(f) {
  const panel = document.getElementById('fighterDetailPanel');
  if (!panel) return;
  // If clicking same turtle, toggle off
  if (panel.classList.contains('show') && panel._currentFighter === f) {
    closeFighterDetail(); return;
  }
  panel._currentFighter = f;

  document.getElementById('fdpName').innerHTML = petIcon(f, 24) + ' ' + f.name;
  document.getElementById('fdpName').style.color = RARITY_COLORS[f.rarity];

  const ic = (name) => `<img src="assets/stats/${name}" class="stat-icon">`;
  const sc = (cur, init) => cur > init ? 'fdp-up' : cur < init ? 'fdp-down' : '';
  const defPct = Math.round(f.def / (f.def + DEF_CONSTANT) * 100);
  const mrPct = Math.round((f.mr||f.def) / ((f.mr||f.def) + DEF_CONSTANT) * 100);
  const critPct = Math.min(100, Math.round((f.crit||0) * 100));
  const overflowCrit = Math.max(0, (f.crit||0) - 1.0);
  const overflowMult = (f.passive && f.passive.overflowMult) || 1.5;
  const critDmgPct = Math.round((1.5 + (f._extraCritDmg||0) + (f._extraCritDmgPerm||0) + overflowCrit * overflowMult) * 100);
  const isAlly = gameMode === 'pvp-online' ? (f.side === onlineSide) : (f.side === 'left');
  const hpPct = Math.max(0, f.hp / f.maxHp * 100);
  const hpColor = isAlly ? 'linear-gradient(180deg,#3deb9e 40%,#089e6b 60%)' : 'linear-gradient(180deg,#c084fc 40%,#7c3aed 60%)';
  const shieldPct = f.shield > 0 ? Math.min(100 - hpPct, f.shield / f.maxHp * 100) : 0;

  let html = `<div class="fdp-hp-section">
    <div class="fdp-hp-line">${ic('hp-icon.png')}<span class="${sc(f.maxHp, f._initHp)}">HP ${Math.ceil(f.hp)}/${f.maxHp}</span>${f.shield>0?` <span class="shield-val">${ic('shield-icon.png')}${Math.ceil(f.shield)}</span>`:''}</div>
    <div class="fdp-hp-bar">
      <div class="fdp-hp-fill" style="width:${hpPct}%;background:${hpColor}"></div>
      ${f.shield > 0 ? `<div class="fdp-shield-fill" style="width:${shieldPct}%;left:${hpPct}%"></div>` : ''}
    </div>
  </div>
  <div class="fdp-stats">
    <div class="fdp-stat ${sc(f.atk, f._initAtk)}">${ic('atk-icon.png')}攻击 ${f.atk}</div>
    <div class="fdp-stat ${sc(f._lifestealPct||0, f._initLifesteal||0)}">${ic('lifesteal-icon.png')}吸血 ${f._lifestealPct||0}%</div>
    <div class="fdp-stat ${sc(f.def, f._initDef)}">${ic('def-icon.png')}护甲 ${f.def} <span class="fdp-sub">(减免${defPct}%)</span></div>
    <div class="fdp-stat ${sc(f.mr, f._initMr)}">${ic('mr-icon.png')}魔抗 ${f.mr||f.def} <span class="fdp-sub">(减免${mrPct}%)</span></div>
    <div class="fdp-stat ${sc(f.crit, f._initCrit)}">${ic('crit-icon.png')}暴击 ${critPct}%</div>
    <div class="fdp-stat ${sc(critDmgPct, 150)}">${ic('crit-dmg-icon.png')}爆伤 ${critDmgPct}%</div>
    <div class="fdp-stat ${sc(f.armorPen, f._initArmorPen)}">${ic('armor-pen-icon.png')}穿甲 ${f.armorPen||0}</div>
    <div class="fdp-stat ${sc(f.magicPen, f._initMagicPen)}">${ic('magic-pen-icon.png')}魔穿 ${f.magicPen||0}</div>
  </div>`;

  // ── Buffs / Status (right after stats) ──
  if (f.buffs && f.buffs.length) {
    html += '<div class="fdp-section-label">状态</div><div class="fdp-buffs">';
    const tag = (color, text) => `<span class="fdp-buff-tag" style="border-color:${color};color:${color}">${text}</span>`;
    f.buffs.forEach(b => {
      if (b.type === 'phoenixBurnDot') html += tag('#ff6600', `<img src="assets/status/burn-icon.png" style="width:14px;height:14px;vertical-align:middle">灼烧 ${b.turns}回合`);
      else if (b.type === 'dot') html += tag('#9b59b6', `<img src="assets/status/curse-debuff-icon.png" style="width:14px;height:14px;vertical-align:middle">诅咒 ${b.turns}回合`);
      else if (b.type === 'atkUp') html += tag('#06d6a0', `⬆攻+${b.value} ${b.turns}回合`);
      else if (b.type === 'atkDown') html += tag('#ff6b6b', `⬇攻-${b.value}% ${b.turns}回合`);
      else if (b.type === 'defUp') html += tag('#06d6a0', `⬆护+${b.value} ${b.turns}回合`);
      else if (b.type === 'defDown') html += tag('#ff6b6b', `⬇护-${b.value}% ${b.turns}回合`);
      else if (b.type === 'mrUp') html += tag('#4dabf7', `⬆魔抗+${b.value} ${b.turns}回合`);
      else if (b.type === 'mrDown') html += tag('#ff6b6b', `⬇魔抗-${b.value}% ${b.turns}回合`);
      else if (b.type === 'dodge') html += tag('#aaa', `<img src="assets/status/dodge-new-icon.png" style="width:14px;height:14px;vertical-align:middle">闪避${b.value}% ${b.turns}回合`);
      else if (b.type === 'stun') html += tag('#ffee00', `<img src="assets/status/stun-icon.png" style="width:14px;height:14px;vertical-align:middle">眩晕`);
      else if (b.type === 'healReduce') html += tag('#6b8e23', `<img src="assets/status/heal-reduce-icon.png" style="width:14px;height:14px;vertical-align:middle">治疗削减 ${b.value}%`);
      else if (b.type === 'hot') html += tag('#06d6a0', `持续回复 ${b.hpPerTurn}/回 ${b.turns}回合`);
      else if (b.type === 'fear') html += tag('#9b59b6', `<img src="assets/status/fear-icon.png" style="width:14px;height:14px;vertical-align:middle">恐惧 ${b.turns}回合`);
      else if (b.type === 'bubbleBind') html += tag('#4cc9f0', `<img src="assets/passive/bubble-store-icon.png" style="width:14px;height:14px;vertical-align:middle">泡泡束缚 ${b.turns}回合`);
      else if (b.type === 'trap') html += tag('#ff9f43', `<img src="assets/passive/ninja-instinct-icon.png" style="width:14px;height:14px;vertical-align:middle">陷阱`);
      else if (b.type === 'diceFateCrit') html += tag('#ff4757', `<img src="assets/passive/gambler-blood-icon.png" style="width:14px;height:14px;vertical-align:middle">暴击+${b.value}% ${b.turns}回合`);
      else if (b.type === 'gamblerPierceConvert') html += tag('#ffd93d', `<img src="assets/passive/gambler-blood-icon.png" style="width:14px;height:14px;vertical-align:middle">穿透转换 ${b.turns}回合`);
      else if (b.type === 'hidingShield') html += tag('#fff', `<img src="assets/status/shield-icon.png" style="width:14px;height:14px;vertical-align:middle">缩头护盾 ${b.turns}回合`);
      else if (b.type === 'poison') html += tag('#6b8e23', `<img src="assets/status/poison-icon.png" style="width:14px;height:14px;vertical-align:middle">中毒 ${b.value}/回 ${b.turns}回合`);
      else if (b.type === 'chilled') html += tag('#87ceeb', `<img src="assets/status/chilled-icon.png" style="width:14px;height:14px;vertical-align:middle">冰寒 ATK-20% ${b.turns}回合`);
      else if (b.type === 'bleed') html += tag('#cc3333', `<img src="assets/status/bleed-icon.png" style="width:14px;height:14px;vertical-align:middle">流血 ${b.value}/回 ${b.turns}回合`);
    });
    // Non-buff state tags
    if (f._inkStacks > 0) html += tag('#222', `<img src="assets/passive/ink-mark-icon.png" style="width:14px;height:14px;vertical-align:middle">墨迹 ${f._inkStacks}层 (受伤+${f._inkStacks * 5}%)`);
    if (f._shockStacks > 0) html += tag('#ffd700', `<img src="assets/passive/lightning-storm-icon.png" style="width:14px;height:14px;vertical-align:middle">电击 ${f._shockStacks}层`);
    if (f._goldLightning > 0) html += tag('#ffd700', `⚡金闪电 ${f._goldLightning}/5`);
    html += '</div>';
  } else {
    // No buffs but might have special states
    const specials = [];
    if (f._inkStacks > 0) specials.push(`<span class="fdp-buff-tag" style="border-color:#b8b8ff;color:#b8b8ff;background:rgba(100,100,200,.2)"><img src="assets/passive/ink-mark-icon.png" style="width:14px;height:14px;vertical-align:middle">墨迹 ${f._inkStacks}层</span>`);
    if (f._shockStacks > 0) specials.push(`<span class="fdp-buff-tag" style="border-color:#ffd700;color:#ffd700">⚡电击 ${f._shockStacks}层</span>`);
    if (f._goldLightning > 0) specials.push(`<span class="fdp-buff-tag" style="border-color:#ffd700;color:#ffd700">⚡金闪电 ${f._goldLightning}/5</span>`);
    if (specials.length) html += '<div class="fdp-section-label">状态</div><div class="fdp-buffs">' + specials.join('') + '</div>';
  }

  // ── Passive ──
  if (f.passive) {
    const iconRaw = PASSIVE_ICONS[f.passive.type] || '⭐';
    const iconH = iconRaw.endsWith('.png') ? `<img src="assets/${iconRaw}" style="width:16px;height:16px;vertical-align:middle">` : iconRaw;
    const passiveName = f.passive.name || '被动';

    html += `<div class="fdp-passive">`;
    html += `<div class="fdp-passive-title">${iconH} ${passiveName}</div>`;

    if (f.passive.type === 'chestTreasure') {
      // Chest turtle: dynamic treasure progress + equipment pools
      const treasure = f._chestTreasure || 0;
      const tier = f._chestTier || 0;
      const th = f.passive.thresholds;
      const nextThresh = tier < th.length ? th[tier] : null;
      const poolNames = ['基础池','基础池','进阶池','进阶池','传说池'];
      let briefLines = `造成伤害充能财宝进度，达到阈值获得装备。<br>当前：<span class="val-atk">${treasure}</span>`;
      if (nextThresh) briefLines += ` / ${nextThresh}（下一件：${poolNames[tier]}装备）`;
      else briefLines += '（已满）';

      const owned = (f._chestEquips || []).map(e => e.id);
      const renderPool = (label, pool) => {
        let h = `<div style="margin-top:6px"><b>${label}</b></div>`;
        for (const eq of pool) {
          const isOwned = owned.includes(eq.id);
          const eIcon = eq.icon && eq.icon.endsWith('.png') ? `<img src="assets/${eq.icon}" style="width:14px;height:14px;vertical-align:middle;${isOwned?'':'opacity:.5'}">` : (eq.icon||'');
          h += `<div style="color:${isOwned?'#c77dff':'var(--fg2)'};font-size:11px">${eIcon} ${eq.name}：${eq.desc}</div>`;
        }
        return h;
      };
      const pools = f.passive.pools;
      const thDisplay = th.map((v, i) => i < tier ? `<span class="val-atk">${v}</span>` : `${v}`).join(' / ');
      let detailHtml = `造成伤害充能财宝进度，根据进度 ${thDisplay} 获得装备。<br>当前：<span class="val-atk">${treasure}</span>`;
      if (nextThresh) detailHtml += ` / ${nextThresh}（下一件：${poolNames[tier]}装备）`;
      else detailHtml += '（已满）';
      detailHtml += renderPool('基础池（第1-2件）：', pools[0]);
      detailHtml += renderPool('进阶池（第3-4件）：', pools[1]);
      detailHtml += renderPool('传说池（第5件）：', pools[2]);

      html += `<div class="fdp-passive-brief">${briefLines}</div>`;
      html += `<div class="fdp-passive-detail" style="display:none">${detailHtml}</div>`;
      html += `<span class="fdp-passive-toggle" onclick="fdpTogglePassive(this)">详细 ▾</span>`;
    } else {
      let descText = f.passive.desc;
      if (f._twoHeadForm === 'melee' && f.passive.descMelee) descText = f.passive.descMelee;
      if (f._lavaTransformed && f.passive.descVolcano) descText = f.passive.descVolcano;
      const descRendered = renderSkillTemplate(descText, f, f.passive).replace(/\n/g, '<br>');
      const briefText = f.passive.brief ? renderSkillTemplate(f.passive.brief, f, f.passive).replace(/\n/g, '<br>') : null;

      if (briefText) {
        html += `<div class="fdp-passive-brief">${briefText}</div>`;
        html += `<div class="fdp-passive-detail" style="display:none">${descRendered}</div>`;
        html += `<span class="fdp-passive-toggle" onclick="fdpTogglePassive(this)">详细 ▾</span>`;
      } else {
        html += `<div class="fdp-passive-brief">${descRendered}</div>`;
      }
    }
    // Dynamic passive state
    const st = [];
    if (f.passive.type === 'fortuneGold') st.push(`🪙 金币：<span class="val-atk">${f._goldCoins||0}</span>`);
    if (f.passive.type === 'starEnergy') { const maxE = Math.round(f.maxHp * f.passive.maxChargePct / 100); st.push(`⭐ 星能：<span class="val-atk">${f._starEnergy||0}</span> / ${maxE}`); }
    if (f.passive.type === 'bubbleStore') st.push(`🫧 泡泡储存：<span class="val-atk">${Math.round(f.bubbleStore||0)}</span>`);
    if (f.passive.type === 'chestTreasure') st.push(`📦 财宝值：<span class="val-atk">${f._chestTreasure||0}</span>`);
    if (f.passive.type === 'cyberDrone') st.push(`<img src="assets/passive/cyber-drone-icon.png" style="width:14px;height:14px;vertical-align:middle"> 浮游炮：<span class="val-atk">${f._drones ? f._drones.length : 0}</span> / ${f.passive.maxDrones}`);
    if (f.passive.type === 'lavaRage') st.push(`🌋 怒气：<span class="val-atk">${f._lavaRage||0}</span> / ${f.passive.rageMax}${f._lavaTransformed ? ' (已变身)' : ''}`);
    if (f.passive.type === 'stoneWall') { const cap = Math.round((f._initDef || f.baseDef) * (f.passive.maxDefInitPct || 50) / 100); st.push(`🪨 护甲已叠加：<span class="val-atk">+${f._stoneDefGained||0}</span> / +${cap}`); }
    if (f.passive.type === 'bambooCharge') st.push(`🎋 已增加HP：<span class="val-atk">+${f._bambooGainedHp||0}</span>`);
    if (f.passive.type === 'hunterKill') st.push(`🎯 击杀数：<span class="val-atk">${f._hunterKills||0}</span>　窃取攻+${f._hunterStolenAtk||0} 防+${f._hunterStolenDef||0} 抗+${f._hunterStolenMr||0} 血+${f._hunterStolenHp||0}`);
    if (f.passive.type === 'inkMark') st.push(`<img src="assets/passive/ink-mark-icon.png" style="width:14px;height:14px;vertical-align:middle"> 墨迹层数：<span class="val-atk">${f._inkStacks||0}</span> / ${f.passive.maxStacks}`);
    if (f.passive.type === 'lightningStorm') st.push(`⚡ 全局电击层：<span class="val-atk">${f._shockStacks||0}</span> / ${f.passive.stackMax}`);
    if (f.passive.type === 'gamblerBlood') { const oc = Math.max(0, (f.crit||0) - 1.0); st.push(`<img src="assets/passive/gambler-blood-icon.png" style="width:14px;height:14px;vertical-align:middle"> 暴击溢出：<span class="val-atk">${oc > 0 ? Math.round(oc*100)+'%→+'+Math.round(oc*f.passive.overflowMult*100)+'%爆伤' : '无'}</span>`); }
    if (f.passive.type === 'crystalResonance') st.push(`💎 结晶层数：<span class="val-atk">${f._crystallizeStacks||0}</span> / ${f.passive.crystallizeMax}`);
    if (f.passive.type === 'undeadRage') st.push(`💀 攻击加成：<span class="val-atk">+${Math.round(Math.min(f.passive.atkMaxBonus, (1 - f.hp/f.maxHp) * 100 * f.passive.atkPerLostPct))}%</span>　吸血：<span class="val-atk">${f.passive.lifestealBase}%</span>`);
    if (st.length) html += `<div class="fdp-passive-state">${st.join('<br>')}</div>`;

    html += `</div>`;
  }

  // ── Passive Skills (equipped passives) ──
  if (f._passiveSkills && f._passiveSkills.length) {
    html += `<div class="fdp-section-label">装备被动</div><div class="fdp-skills">`;
    f._passiveSkills.forEach(s => {
      const brief = s.brief ? renderSkillTemplate(s.brief, f, s).replace(/\n/g,'<br>') : '';
      html += `<div class="fdp-skill fdp-skill-passive">
        <div class="fdp-skill-header">${s.name} <span class="spc-passive-tag">被动</span></div>
        <div class="fdp-skill-brief">${brief}</div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Active Skills ──
  if (f.skills && f.skills.length) {
    html += `<div class="fdp-section-label">技能</div><div class="fdp-skills">`;
    f.skills.forEach(s => {
      const brief = buildSkillBrief(f, s);
      const detail = buildSkillDetailDesc(f, s);
      const cdText = s.cd ? `<span class="fdp-cd">CD${s.cd}${s.cdLeft > 0 ? ' (剩'+s.cdLeft+')' : ''}</span>` : '';
      html += `<div class="fdp-skill">
        <div class="fdp-skill-header">${s.name}${cdText}</div>
        <div class="fdp-skill-brief">${brief}</div>
        <div class="fdp-skill-detail" style="display:none">${detail}</div>
        ${detail !== brief ? `<span class="fdp-passive-toggle" onclick="fdpTogglePassive(this)">详细 ▾</span>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  // ── Equipment ──
  if (f._equips && f._equips.length) {
    html += `<div class="fdp-equips"><b>装备：</b>${f._equips.map(e => (e.icon.endsWith && e.icon.endsWith('.png') ? `<img src="assets/${e.icon}" style="width:14px;height:14px;vertical-align:middle">` : e.icon) + e.name).join('、')}</div>`;
  }

  document.getElementById('fdpBody').innerHTML = html;

  if (window.innerWidth <= 768) {
    // Mobile: bottom sheet, CSS handles positioning
    panel.style.position = '';
    panel.style.top = '';
    panel.style.left = '';
    panel.style.right = '';
    panel.style.bottom = '';
  } else {
    // Desktop: position near the turtle element
    const turtleEl = document.getElementById(getFighterElId(f));
    const scene = document.getElementById('battleScene');
    if (turtleEl && scene) {
      const tRect = turtleEl.getBoundingClientRect();
      const sRect = scene.getBoundingClientRect();
      const isLeft = f.side === 'left';
      panel.style.position = 'absolute';
      panel.style.bottom = 'auto';
      panel.style.left = 'auto';
      panel.style.right = 'auto';
      let topPx = tRect.top - sRect.top;
      const maxTop = sRect.height - 200;
      topPx = Math.max(0, Math.min(topPx, maxTop));
      panel.style.top = topPx + 'px';
      if (isLeft) {
        const leftPx = tRect.right - sRect.left + 6;
        panel.style.left = Math.min(leftPx, sRect.width - 290) + 'px';
      } else {
        const rightPx = sRect.right - tRect.left + 6;
        panel.style.right = Math.min(rightPx, sRect.width - 290) + 'px';
      }
    }
  }

  panel.style.display = 'block';
  panel.classList.add('show');

  // Click outside to close (300ms delay to avoid current touch triggering close)
  setTimeout(() => {
    const closeOnClick = (e) => {
      if (!panel.contains(e.target) && !e.target.closest('.scene-turtle')) {
        closeFighterDetail();
        document.removeEventListener('click', closeOnClick, true);
      }
    };
    document.addEventListener('click', closeOnClick, true);
    panel._closeListener = closeOnClick;
  }, 300);

  // Desktop: re-clamp after render
  if (window.innerWidth > 768) {
    const scene = document.getElementById('battleScene');
    if (scene) {
      const sRect2 = scene.getBoundingClientRect();
      const panelH = panel.offsetHeight;
      const curTop = parseFloat(panel.style.top) || 0;
      const maxTop2 = sRect2.height - panelH - 4;
      if (curTop > maxTop2) panel.style.top = Math.max(0, maxTop2) + 'px';
    }
  }
}

function closeFighterDetail() {
  const panel = document.getElementById('fighterDetailPanel');
  if (!panel) return;
  panel.classList.remove('show'); panel.style.display = 'none'; panel._currentFighter = null;
  if (panel._closeListener) { document.removeEventListener('click', panel._closeListener, true); panel._closeListener = null; }
}

function fdpTogglePassive(el) {
  const parent = el.parentElement;
  const brief = parent.querySelector('.fdp-passive-brief') || parent.querySelector('.fdp-skill-brief');
  const detail = parent.querySelector('.fdp-passive-detail') || parent.querySelector('.fdp-skill-detail');
  if (!brief || !detail) return;
  const showing = detail.style.display !== 'none';
  brief.style.display = showing ? '' : 'none';
  detail.style.display = showing ? 'none' : '';
  el.textContent = showing ? '详细 ▾' : '简略 ▴';
}

// ── SKILL ANNOUNCE BANNER ──
function showSkillAnnounce(f, skill) {
  if (!f || !skill) return;
  let banner = document.getElementById('skillAnnounceBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'skillAnnounceBanner';
    banner.className = 'skill-announce';
    const scene = document.getElementById('battleScene');
    if (scene) scene.appendChild(banner);
    else document.body.appendChild(banner);
  }
  const color = RARITY_COLORS[f.rarity] || '#fff';
  banner.innerHTML = `${petIcon(f, 28)}<span class="sa-name" style="color:${color}">${f.name}</span><span class="sa-arrow">▸</span><span class="sa-skill">${skill.name}</span>`;
  banner.style.display = 'flex';
  banner.style.animation = 'none';
  requestAnimationFrame(() => { banner.style.animation = 'skillAnnounce .6s ease forwards'; });
  setTimeout(() => { banner.style.display = 'none'; }, 1200);
}

// Update scene turtle sprite + name on transform
function renderFighterCard(f, elId) {
  // Update scene turtle sprite + name on transform
  const el = document.getElementById(elId || getFighterElId(f));
  if (!el) return;
  const spriteSize = 80;
  const spriteEl = el.querySelector('.st-sprite');
  if (spriteEl) spriteEl.innerHTML = buildPetImgHTML(f, spriteSize);
  const nameEl = el.querySelector('.st-name');
  if (nameEl) { nameEl.textContent = f.name; nameEl.style.color = RARITY_COLORS[f.rarity] || '#fff'; }
  // Update data-pid for CSS flip rules
  el.dataset.pid = f.id || '';
}


function renderSummonMiniCard(owner) {
  const summon = owner._summon;
  if (!summon) return;
  const ownerElId = getFighterElId(owner);
  const ownerEl = document.getElementById(ownerElId);
  if (!ownerEl) return;
  const scene = document.getElementById('battleScene');
  if (!scene) return;

  const summonElId = 'summon_' + ownerElId;
  summon._summonElId = summonElId;

  // Remove existing
  const existing = document.getElementById(summonElId);
  if (existing) existing.remove();

  // Create summon as a scene turtle positioned behind the owner
  const mini = document.createElement('div');
  mini.id = summonElId;
  mini.className = 'scene-turtle scene-summon' + (summon.alive ? '' : ' dead');
  mini.dataset.pid = summon.id || '';
  mini.onclick = () => showFighterDetail(summon);

  const spriteSize = window.innerWidth <= 768 ? 36 : 44;
  const spriteHTML = buildPetImgHTML(summon, spriteSize);
  const hpPct = Math.max(0, summon.hp / summon.maxHp * 100);
  const isAlly = gameMode === 'pvp-online' ? (owner.side === onlineSide) : (owner.side === 'left');
  const hpGrad = isAlly
    ? 'linear-gradient(180deg, #3deb9e 40%, #089e6b 60%)'
    : 'linear-gradient(180deg, #c084fc 40%, #7c3aed 60%)';

  mini.innerHTML = `
    <div class="st-name" style="color:${RARITY_COLORS[summon.rarity]};font-size:8px">${summon.name}<span class="summon-tag" style="margin-left:3px">随从</span></div>
    <div class="st-hp-row" style="display:flex;align-items:center;gap:2px;justify-content:center">
      ${summon._level ? `<span class="st-level-badge" style="font-size:8px;padding:0 2px">Lv.${summon._level}</span>` : ''}
    <div class="st-hp-wrap" style="width:60px">
      <div class="st-hp-bar" style="height:5px">
        <div class="st-hp-delay" style="width:${hpPct}%"></div>
        <div class="st-hp-fill" style="width:${hpPct}%;background:${hpGrad}"></div>
      </div>
    </div>
    </div>
    <div class="st-sprite">${spriteHTML}</div>
    <div class="st-buffs"></div>
  `;

  // Position behind owner: offset slightly back and down
  const ownerStyle = window.getComputedStyle(ownerEl);
  const isLeft = owner.side === 'left';
  if (isLeft) {
    const ownerLeft = parseFloat(ownerStyle.left) || 0;
    const ownerBottom = parseFloat(ownerStyle.bottom) || 0;
    mini.style.position = 'absolute';
    mini.style.left = (ownerLeft - 60) + 'px';
    mini.style.bottom = (ownerBottom - 20) + 'px';
  } else {
    const ownerRight = parseFloat(ownerStyle.right) || 0;
    const ownerBottom = parseFloat(ownerStyle.bottom) || 0;
    mini.style.position = 'absolute';
    mini.style.right = (ownerRight - 60) + 'px';
    mini.style.bottom = (ownerBottom - 20) + 'px';
  }
  // Flip sprite same as owner side
  if (isLeft) mini.querySelector('.st-sprite').style.transform = 'scaleX(-1)';

  scene.appendChild(mini);
  summon._summonElId = summonElId;
}

function updateSummonHpBar(summon) {
  if (!summon || !summon._summonElId) return;
  const el = document.getElementById(summon._summonElId);
  if (!el) return;

  const totalEff = summon.hp + (summon.shield || 0);
  const barMax = Math.max(summon.maxHp, totalEff);
  const hpPct = Math.max(0, summon.hp / barMax * 100);
  const shieldPct = (summon.shield || 0) / barMax * 100;
  const hpFill = el.querySelector('.st-hp-fill');
  if (hpFill) hpFill.style.width = hpPct + '%';
  // Shield bar
  let shieldFill = el.querySelector('.st-shield-fill');
  if (!shieldFill && summon.shield > 0) {
    shieldFill = document.createElement('div');
    shieldFill.className = 'st-shield-fill';
    const bar = el.querySelector('.st-hp-bar');
    if (bar) bar.appendChild(shieldFill);
  }
  if (shieldFill) {
    shieldFill.style.width = shieldPct + '%';
    shieldFill.style.left = hpPct + '%';
    shieldFill.style.display = summon.shield > 0 ? '' : 'none';
  }

  // Delay trail
  const hpDelay = el.querySelector('.st-hp-delay');
  if (hpDelay) {
    const oldHp = hpDelay._hp !== undefined ? hpDelay._hp : summon.hp;
    const oldPct = hpDelay._pct || hpPct;
    hpDelay._hp = summon.hp;
    if (summon.hp < oldHp) {
      hpDelay.style.width = oldPct + '%'; hpDelay.style.background = 'rgba(255,60,60,.6)';
      hpDelay.style.opacity = '1'; hpDelay.style.transition = 'none';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        hpDelay.style.transition = 'width 0.5s ease-in-out 0.2s, opacity 0.4s ease-in 0.5s';
        hpDelay.style.width = hpPct + '%'; hpDelay.style.opacity = '0';
      }));
    } else { hpDelay.style.width = hpPct + '%'; }
    hpDelay._pct = hpPct;
  }

  el.classList.toggle('dead', !summon.alive);
}

function updateSummonStats(summon) {
  if (!summon || !summon._summonElId) return;
  const card = document.getElementById(summon._summonElId);
  if (!card) return;
  const box = card.querySelector('.summon-stats');
  if (!box) return;
  const ic = (name) => `<img src="assets/stats/${name}" class="stat-icon">`;
  const sc = (cur, init) => cur > init ? 'stat-up' : cur < init ? 'stat-down' : '';
  box.innerHTML =
    `<span class="${sc(summon.atk, summon.baseAtk)}">${ic('atk-icon.png')}${summon.atk}</span>` +
    `<span class="${sc(summon.def, summon.baseDef)}">${ic('def-icon.png')}${summon.def}</span>` +
    `<span class="${sc(summon.mr||0, summon.baseMr||0)}">${ic('mr-icon.png')}${summon.mr||summon.def}</span>`;
}

function renderSummonStatusIcons(summon) {
  if (!summon || !summon._summonElId) return;
  const card = document.getElementById(summon._summonElId);
  if (!card) return;
  const box = card.querySelector('.summon-status-icons');
  if (!box) return;
  box.innerHTML = '';
  if (!summon.alive) return;

  // Reuse same buff rendering as main fighters
  const buffHTML = (summon.buffs || []).map(b => {
    if (b.type === 'dot')     return `<span class="status-dot" title="诅咒${b.value}/回合 剩${b.turns}回合"><img src="assets/status/curse-debuff-icon.png" style="width:12px;height:12px;vertical-align:middle">${b.turns}</span>`;
    if (b.type === 'phoenixBurnDot') return `<span class="status-dot" title="灼烧 剩${b.turns}回合"><img src="assets/status/burn-icon.png" style="width:12px;height:12px;vertical-align:middle">${b.turns}</span>`;
    if (b.type === 'atkDown') return `<span class="status-atkdown">⬇攻力${b.turns}</span>`;
    if (b.type === 'defDown') return `<span class="status-defdown">⬇护${b.turns}</span>`;
    if (b.type === 'mrDown')  return `<span class="status-defdown">⬇抗${b.turns}</span>`;
    if (b.type === 'hot')     return `<span class="status-hot">💚${b.turns}</span>`;
    if (b.type === 'defUp')   return `<span class="status-defup">⬆护${b.turns}</span>`;
    if (b.type === 'atkUp')   return `<span class="status-defup">⬆攻力${b.turns}</span>`;
    if (b.type === 'bubbleBind') return `<span class="status-bubble"><img src="assets/passive/bubble-store-icon.png" style="width:12px;height:12px;vertical-align:middle">${b.turns}</span>`;
    if (b.type === 'dodge')   return `<span class="status-dodge"><img src="assets/status/dodge-icon.png" style="width:12px;height:12px;vertical-align:middle">${b.turns}</span>`;
    if (b.type === 'fear')    return `<span class="status-atkdown"><img src="assets/status/fear-icon.png" style="width:14px;height:14px;vertical-align:middle">${b.turns}</span>`;
    if (b.type === 'wormhole') return `<span style="color:#ffa500"><img src="assets/status/wormhole-icon.png" style="width:14px;height:14px;vertical-align:middle">${b.turns}</span>`;
    if (b.type === 'gamblerPierceConvert') return `<span class="status-defup">🗡${b.turns}</span>`;
    if (b.type === 'hidingShield') return `<span class="status-defup"><img src="assets/status/shield-icon.png" style="width:12px;height:12px;vertical-align:middle">${b.turns}</span>`;
    if (b.type === 'stun')    return `<span style="color:#ff0">💫</span>`;
    if (b.type === 'diceFateCrit') return `<span style="color:#ff6b6b"><img src="assets/passive/gambler-blood-icon.png" style="width:14px;height:14px;vertical-align:middle">+${b.value}%</span>`;
    if (b.type === 'healReduce') return `<span style="color:#6b8e23">☠️${b.turns}</span>`;
    if (b.type === 'armorPenBuff') return `<span class="status-defup">🗡穿${b.turns}</span>`;
    return '';
  }).filter(s => s).join('');
  box.innerHTML = buffHTML;

  // Ink stacks
  if (summon._inkStacks > 0) {
    box.innerHTML += `<span style="color:#1a1a2e;background:rgba(100,100,100,.2);padding:0 3px;border-radius:4px"><img src="assets/passive/ink-mark-icon.png" style="width:12px;height:12px;vertical-align:middle">${summon._inkStacks}</span>`;
  }
  // Ink link
  if (summon._inkLink && summon._inkLink.partner && summon._inkLink.partner.alive && summon._inkLink.turns > 0) {
    box.innerHTML += `<span style="color:#6c5ce7">🔗${summon._inkLink.turns}</span>`;
  }
  // Shock stacks (lightning turtle stackMax 8)
  if (summon._shockStacks > 0) {
    box.innerHTML += `<span style="color:#ffd700">⚡${summon._shockStacks}/8</span>`;
  }
  // Gold lightning (chest 雷刃 stackMax 5) — separate pill, same icon
  if (summon._goldLightning > 0) {
    box.innerHTML += `<span style="color:#ffea7a">⚡${summon._goldLightning}/5</span>`;
  }
  // Crystallize stacks
  if (summon._crystallize > 0) {
    box.innerHTML += `<span style="color:#c77dff">🔮${summon._crystallize}/4</span>`;
  }
  // Star energy
  if (summon._starEnergy > 0) {
    box.innerHTML += `<span style="color:#ffa500"><img src="assets/passive/star-energy-bar-icon.png" style="width:12px;height:12px;vertical-align:middle">${Math.round(summon._starEnergy)}</span>`;
  }
  // Gold coins
  if (summon._goldCoins > 0) {
    box.innerHTML += `<span style="color:#ffd93d"><img src="assets/battle/gold-coin-icon.png" style="width:12px;height:12px;vertical-align:middle">${summon._goldCoins}</span>`;
  }
  // Drone count
  if (summon._drones && summon._drones.length > 0) {
    box.innerHTML += `<span style="color:#4cc9f0"><img src="assets/passive/cyber-drone-icon.png" style="width:12px;height:12px;vertical-align:middle">${summon._drones.length}</span>`;
  }
  // Bamboo charge
  if (summon._bambooCharged && !summon._bambooFired) {
    box.innerHTML += `<span class="bamboo-charge-ready"><img src="assets/passive/bamboo-charge-icon.png" style="width:12px;height:12px;vertical-align:middle"></span>`;
  }
  // Lava rage
  if (summon._lavaRage > 0 && !summon._lavaTransformed) {
    box.innerHTML += `<span style="color:#ff6600"><img src="assets/passive/lava-heart-icon.png" style="width:12px;height:12px;vertical-align:middle">${summon._lavaRage}</span>`;
  }
}

const PASSIVE_ICONS = {
  turnScaleAtk:'⚔️', turnScaleHp:'💗', bonusDmgAbove60:'🎯',
  lowHpCrit:'💢', deathExplode:'💥', deathHook:'🪝', shieldOnHit:'status/shield-icon.png',
  healOnKill:'💚', counterAttack:'⚡', lavaRage:'passive/lava-heart-icon.png', undeadRage:'passive/undead-rage-icon.png', crystalResonance:'passive/crystal-resonance-icon.png', bubbleStore:'passive/bubble-store-icon.png', stoneWall:'passive/stone-wall-icon.png', hunterKill:'passive/hunter-kill-icon.png', ninjaInstinct:'passive/ninja-instinct-icon.png', phoenixRebirth:'passive/phoenix-rebirth-icon.png', lightningStorm:'passive/lightning-storm-icon.png', fortuneGold:'passive/fortune-gold-icon.png', twoHeadVitality:'passive/two-head-icon.png', twoHeadDual:'passive/two-head-icon.png', gamblerMultiHit:'passive/gambler-multi-icon.png', summonAlly:'passive/summon-ally-icon.png', cyberDrone:'passive/cyber-drone-icon.png', judgement:'passive/judgement-icon.png', frostAura:'passive/frost-aura-icon.png', basicTurtle:'passive/unyielding-icon.png', auraAwaken:'passive/aura-awaken-icon.png', starEnergy:'passive/star-energy-icon.png', inkMark:'passive/ink-mark-icon.png', rainbowPrism:'passive/rainbow-prism-icon.png', ghostCurse:'passive/ghost-curse-icon.png', bambooCharge:'passive/bamboo-charge-icon.png', diamondStructure:'passive/diamond-structure-icon.png', gamblerBlood:'passive/gambler-blood-icon.png', pirateBarrage:'passive/pirate-plunder-icon.png', mechBody:'passive/mech-form-icon.png', candySteal:'passive/candy-steal-icon.png', chestTreasure:'passive/chest-treasure-icon.png'
};

function updateFighterStats(f, elId) {
  if (f._isSummon) { updateSummonStats(f); return; }
  const card = document.getElementById(elId);
  if (!card) return;
  const statsEl = card.querySelector('.fighter-stats');
  if (!statsEl) return;
  const fIdx = allFighters.indexOf(f);
  const sc = (cur, init) => cur > init ? 'stat-up' : cur < init ? 'stat-down' : '';
  const defPct = Math.round(f.def / (f.def + DEF_CONSTANT) * 100);
  const mrPct = Math.round((f.mr||f.def) / ((f.mr||f.def) + DEF_CONSTANT) * 100);
  const rawCrit = (f.crit || 0);
  const overflowCrit = Math.max(0, rawCrit - 1.0);
  const overflowMult = (f.passive && f.passive.overflowMult) || 1.5;
  const critPct = Math.min(100, Math.round(rawCrit * 100));
  const critDmg = Math.round((1.5 + (f._extraCritDmgPerm || 0) + overflowCrit * overflowMult) * 100);
  const lifesteal = f._lifestealPct || 0;
  const dodge = f.buffs ? f.buffs.find(b => b.type === 'dodge') : null;
  const dodgePct = dodge ? dodge.value : 0;
  const _pi = PASSIVE_ICONS[f.passive?.type] || '⭐';
  const _piHtml = _pi.endsWith('.png') ? `<img src="assets/${_pi}" class="stat-icon">` : _pi;
  const passiveIcon = f.passive ? `<span class="passive-icon" onclick="showPassivePopup(event,${fIdx})">${_piHtml}</span>` : '';
  // Preserve detail expand state
  const wasExpanded = document.getElementById('statsDetail'+fIdx)?.style.display === 'flex';

  const ic = (name) => `<img src="assets/stats/${name}" class="stat-icon">`;
  const briefStats =
    `<span class="${sc(f.atk, f._initAtk)}">${ic('atk-icon.png')}攻击力${f.atk}</span>` +
    `<span class="${sc(f.def, f._initDef)}">${ic('def-icon.png')}护甲${f.def}(物伤-${defPct}%)</span>` +
    `<span class="${sc(f.mr||0, f._initMr||0)}">${ic('mr-icon.png')}魔抗${f.mr||f.def}(魔伤-${mrPct}%)</span>` +
    passiveIcon +
    `<span class="stats-toggle" onclick="toggleFighterStats(event,${fIdx})">${wasExpanded?'▴':'▾'}</span>`;

  const detailStats =
    `<div class="stats-detail" id="statsDetail${fIdx}" style="display:${wasExpanded?'flex':'none'}">` +
    `<span class="${sc(critPct, Math.round(f._initCrit*100))}">${ic('crit-icon.png')}暴击 ${critPct}%</span>` +
    `<span class="${critDmg > 150 ? 'stat-up' : ''}">${ic('crit-dmg-icon.png')}爆伤 ${critDmg}%${overflowCrit > 0 ? ' (溢出+'+Math.round(overflowCrit*100)+'%)' : ''}</span>` +
    `<span class="${sc(f.armorPen, f._initArmorPen)}">${ic('armor-pen-icon.png')}护甲穿透 ${f.armorPen}</span>` +
    `<span class="${sc(f.magicPen||0, f._initMagicPen||0)}">${ic('magic-pen-icon.png')}魔法穿透 ${f.magicPen||0}</span>` +
    `<span class="${sc(lifesteal, f._initLifesteal)}">${ic('lifesteal-icon.png')}吸血 ${lifesteal}%</span>` +
    `<span class="${dodgePct > 0 ? 'stat-up' : ''}">${ic('dodge-icon.png')}闪避 ${dodgePct}%</span>` +
    `</div>`;

  statsEl.innerHTML = `<div class="stats-brief">${briefStats}</div>${detailStats}`;
}

function toggleFighterStats(e, fIdx) {
  e.stopPropagation();
  const el = document.getElementById('statsDetail' + fIdx);
  if (!el) return;
  const showing = el.style.display !== 'none';
  el.style.display = showing ? 'none' : 'flex';
  // Update toggle icon
  const toggle = el.parentElement.querySelector('.stats-toggle');
  if (toggle) toggle.textContent = showing ? '▾' : '▴';
}

// Sprite / static image helper — matches pet center (petImgHTML) approach
// Avatar helper: use headshot image if available
function buildPetAvatarHTML(pet, size) {
  return `<img src="assets/avatars/${pet.id}.png" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:50%" onerror="this.style.display='none'">`;
}

// Uses background-position animation for sprite sheets
var _spriteKF = {};
function buildPetImgHTML(pet, size) {
  if (pet.sprite && pet.img) {
    var s = pet.sprite, sc = size / s.frameH;
    var fw = Math.round(s.frameW * sc);          // single frame display width
    var tw = Math.round(s.frameW * s.frames * sc); // total sheet width
    var kfName = 'sprKF_' + pet.id + '_' + size;
    if (!_spriteKF[kfName]) {
      var st = document.createElement('style');
      st.textContent = '@keyframes ' + kfName + '{from{background-position:0 0}to{background-position:-' + tw + 'px 0}}';
      document.head.appendChild(st);
      _spriteKF[kfName] = true;
    }
    return '<div class="sprite-wrap" style="width:' + fw + 'px;height:' + size + 'px;">'
      + '<div class="sprite-inner" style="width:' + fw + 'px;height:' + size + 'px;'
      + 'background-image:url(\'' + pet.img + '\');background-size:' + tw + 'px ' + size + 'px;'
      + 'animation:' + kfName + ' ' + (s.duration / 1000) + 's steps(' + s.frames + ') infinite;"></div></div>';
  }
  if (pet.img) {
    return '<img src="' + pet.img + '" alt="' + pet.name + '" loading="lazy" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;">';
  }
  return '<span style="font-size:' + Math.round(size * 0.75) + 'px;line-height:1;">' + pet.emoji + '</span>';
}

// Small inline turtle icon (for text contexts: logs, panels, pickers)
function petIcon(f, size) {
  size = size || 20;
  return buildPetImgHTML(f, size);
}

// Play attack animation for a fighter (hop forward → play sprite if available → hop back)
// Works for ALL turtles: those with attackAnim get sprite overlay, others just hop.
const _attackAnimKF = {};
const _attackImgPreload = {};
function playAttackAnimation(f) {
  const pet = (typeof ALL_PETS !== 'undefined') ? ALL_PETS.find(p => p.id === f.id) : null;
  const anim = pet && pet.attackAnim;
  const elId = getFighterElId(f);
  const card = document.getElementById(elId);
  if (!card) return;
  // Always do the hop animation — swap CSS lunge for hop
  card.classList.remove('attack-anim');
  card.classList.add('attack-hop');
  const hopDuration = 1200;
  const spriteDelay = 240;
  // Schedule class cleanup
  setTimeout(() => card.classList.remove('attack-hop'), hopDuration + 50);
  // If no attackAnim config, just hop (idle sprite plays the whole time)
  if (!anim) return;
  // Preload attack image once
  if (!_attackImgPreload[anim.src]) {
    const preImg = new Image();
    preImg.src = anim.src;
    _attackImgPreload[anim.src] = preImg;
  }
  const spriteEl = card.querySelector('.st-sprite');
  if (!spriteEl) {
    setTimeout(() => card.classList.remove('attack-hop'), hopDuration + 50);
    return;
  }
  const size = 80;
  const sc = size / anim.frameH;
  const fw = Math.round(anim.frameW * sc);
  const tw = Math.round(anim.frameW * anim.frames * sc);
  const kfName = 'atkKF_' + f.id;
  if (!_attackAnimKF[kfName]) {
    const st = document.createElement('style');
    st.textContent = '@keyframes ' + kfName + '{from{background-position:0 0}to{background-position:-' + tw + 'px 0}}';
    document.head.appendChild(st);
    _attackAnimKF[kfName] = true;
  }
  // Build attack sprite overlay OUTSIDE idle (so we can toggle visibility without rebuilding DOM)
  let overlay = spriteEl.querySelector('.attack-sprite-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'attack-sprite-overlay';
    overlay.style.cssText = 'position:absolute;left:50%;top:0;transform:translateX(-50%);width:' + fw + 'px;height:' + size + 'px;opacity:0;pointer-events:none;transition:opacity .1s linear';
    overlay.innerHTML = '<div class="sprite-inner" style="width:100%;height:100%;background-image:url(\'' + anim.src + '\');background-size:' + tw + 'px ' + size + 'px;background-repeat:no-repeat"></div>';
    spriteEl.style.position = 'relative';
    spriteEl.appendChild(overlay);
  }
  const overlayInner = overlay.querySelector('.sprite-inner');
  const idleWrap = spriteEl.querySelector('.sprite-wrap');
  // Phase 1: fade in attack overlay at start of hold (fade out idle)
  setTimeout(() => {
    if (idleWrap) { idleWrap.style.transition = 'opacity .1s linear'; idleWrap.style.opacity = '0'; }
    overlay.style.opacity = '1';
    // Restart attack animation from frame 0
    overlayInner.style.animation = 'none';
    void overlayInner.offsetWidth;
    overlayInner.style.animation = kfName + ' ' + (anim.duration / 1000) + 's steps(' + anim.frames + ') 1 forwards';
  }, spriteDelay);
  // Phase 2: fade back to idle right when attack animation finishes (not after hop-back)
  // This way idle plays during hop-back, no last-frame freeze
  const fadeBackAt = spriteDelay + anim.duration - 50;  // start fade 50ms before anim ends for smoother overlap
  setTimeout(() => {
    overlay.style.opacity = '0';
    if (idleWrap) idleWrap.style.opacity = '';
  }, fadeBackAt);
  // Hop class cleanup is scheduled at the top of the function
}

// Play death animation for a fighter (overlay sprite if available, CSS hop-back+fade always)
const _deathAnimKF = {};
function playDeathAnimation(f) {
  const pet = (typeof ALL_PETS !== 'undefined') ? ALL_PETS.find(p => p.id === f.id) : null;
  const anim = pet && pet.deathAnim;
  const card = document.getElementById(getFighterElId(f));
  if (!card) return;
  // If no deathAnim config, just let CSS death-anim class handle it (hop back + fade)
  if (!anim) return;
  const spriteEl = card.querySelector('.st-sprite');
  if (!spriteEl) return;
  if (!_attackImgPreload[anim.src]) {
    const preImg = new Image(); preImg.src = anim.src;
    _attackImgPreload[anim.src] = preImg;
  }
  const size = 80;
  const sc = size / anim.frameH;
  const fw = Math.round(anim.frameW * sc);
  const tw = Math.round(anim.frameW * anim.frames * sc);
  const kfName = 'deathKF_' + f.id;
  if (!_deathAnimKF[kfName]) {
    const st = document.createElement('style');
    st.textContent = '@keyframes ' + kfName + '{from{background-position:0 0}to{background-position:-' + tw + 'px 0}}';
    document.head.appendChild(st);
    _deathAnimKF[kfName] = true;
  }
  let overlay = spriteEl.querySelector('.death-sprite-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'death-sprite-overlay';
    overlay.style.cssText = 'position:absolute;left:50%;top:0;transform:translateX(-50%);width:' + fw + 'px;height:' + size + 'px;opacity:0;pointer-events:none';
    overlay.innerHTML = '<div class="sprite-inner" style="width:100%;height:100%;background-image:url(\'' + anim.src + '\');background-size:' + tw + 'px ' + size + 'px;background-repeat:no-repeat"></div>';
    spriteEl.style.position = 'relative';
    spriteEl.appendChild(overlay);
  }
  const overlayInner = overlay.querySelector('.sprite-inner');
  const idleWrap = spriteEl.querySelector('.sprite-wrap');
  if (idleWrap) { idleWrap.style.transition = 'opacity .1s linear'; idleWrap.style.opacity = '0'; }
  overlay.style.opacity = '1';
  overlayInner.style.animation = 'none';
  void overlayInner.offsetWidth;
  overlayInner.style.animation = kfName + ' ' + (anim.duration / 1000) + 's steps(' + anim.frames + ') 1 forwards';
  // Death anim stays on last frame (no restore) — fighter stays dead
}

// Play hurt animation for a fighter (simple overlay, no hop)
// Every hit restarts from frame 0 (ensures visual feedback per hit)
const _hurtAnimKF = {};
function playHurtAnimation(f) {
  const pet = (typeof ALL_PETS !== 'undefined') ? ALL_PETS.find(p => p.id === f.id) : null;
  const anim = pet && pet.hurtAnim;
  if (!anim) return;
  const card = document.getElementById(getFighterElId(f));
  if (!card) return;
  const spriteEl = card.querySelector('.st-sprite');
  if (!spriteEl) return;
  // Preload
  if (!_attackImgPreload[anim.src]) {
    const preImg = new Image(); preImg.src = anim.src;
    _attackImgPreload[anim.src] = preImg;
  }
  const size = 80;
  const sc = size / anim.frameH;
  const fw = Math.round(anim.frameW * sc);
  const tw = Math.round(anim.frameW * anim.frames * sc);
  const kfName = 'hurtKF_' + f.id;
  if (!_hurtAnimKF[kfName]) {
    const st = document.createElement('style');
    st.textContent = '@keyframes ' + kfName + '{from{background-position:0 0}to{background-position:-' + tw + 'px 0}}';
    document.head.appendChild(st);
    _hurtAnimKF[kfName] = true;
  }
  // Build hurt overlay (reuse pattern from attack)
  let overlay = spriteEl.querySelector('.hurt-sprite-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'hurt-sprite-overlay';
    overlay.style.cssText = 'position:absolute;left:50%;top:0;transform:translateX(-50%);width:' + fw + 'px;height:' + size + 'px;opacity:0;pointer-events:none;transition:opacity .08s linear';
    overlay.innerHTML = '<div class="sprite-inner" style="width:100%;height:100%;background-image:url(\'' + anim.src + '\');background-size:' + tw + 'px ' + size + 'px;background-repeat:no-repeat"></div>';
    spriteEl.style.position = 'relative';
    spriteEl.appendChild(overlay);
  }
  const overlayInner = overlay.querySelector('.sprite-inner');
  const idleWrap = spriteEl.querySelector('.sprite-wrap');
  // Cancel any pending restore from previous hurt
  if (f._hurtRestoreTimer) { clearTimeout(f._hurtRestoreTimer); f._hurtRestoreTimer = null; }
  // Fade in hurt, fade out idle (always restart fresh on each hit)
  if (idleWrap) { idleWrap.style.transition = 'opacity .08s linear'; idleWrap.style.opacity = '0'; }
  overlay.style.opacity = '1';
  overlayInner.style.animation = 'none';
  void overlayInner.offsetWidth;
  overlayInner.style.animation = kfName + ' ' + (anim.duration / 1000) + 's steps(' + anim.frames + ') 1 forwards';
  // Fade back to idle slightly before anim ends
  f._hurtRestoreTimer = setTimeout(() => {
    overlay.style.opacity = '0';
    if (idleWrap) idleWrap.style.opacity = '';
    f._hurtRestoreTimer = null;
  }, anim.duration - 50);
}

function updateHpBar(f, elId) {
  // Summon: use dedicated mini-card HP bar
  if (f._isSummon) { updateSummonHpBar(f); return; }
  // Scene-based: update floating HP bar
  updateSceneHp(f);
  renderSceneBuffs(f);
  const card = document.getElementById(elId);
  if (!card || !card.querySelector('.hp-fill')) return; // scene-based, no card
  // Scale bar to fit HP + all shields
  const totalEff = f.hp + f.shield + (f.bubbleShieldVal || 0);
  const barMax = Math.max(f.maxHp, totalEff); // expand bar if shields overflow
  const hpPct = Math.max(0, f.hp / barMax * 100);
  const fill = card.querySelector('.hp-fill');

  // Delay bar: shows trailing effect on ACTUAL HP loss / heal only
  let delayBar = card.querySelector('.hp-delay');
  if (!delayBar) {
    delayBar = document.createElement('div');
    delayBar.className = 'hp-delay';
    card.querySelector('.hp-bar').insertBefore(delayBar, fill);
    delayBar._pct = hpPct;
    delayBar._hp = f.hp;
  }
  const oldPct = delayBar._pct || hpPct;
  const oldHp = delayBar._hp !== undefined ? delayBar._hp : f.hp;
  const hpActuallyDropped = f.hp < oldHp;
  const hpActuallyGained = f.hp > oldHp;
  delayBar._hp = f.hp;
  if (hpActuallyDropped) {
    // HP dropped — delay bar holds briefly then smoothly shrinks
    delayBar.style.width = oldPct + '%';
    delayBar.style.background = 'linear-gradient(180deg, #ee5555 40%, #aa2222 60%)';
    delayBar.style.opacity = '1';
    delayBar.style.transition = 'none';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      delayBar.style.transition = 'width 0.5s ease-in-out 0.2s, opacity 0.4s ease-in 0.5s';
      delayBar.style.width = hpPct + '%';
      delayBar.style.opacity = '0';
    }));
  } else if (hpActuallyGained) {
    // HP gained — brief green flash
    delayBar.style.width = hpPct + '%';
    delayBar.style.background = 'linear-gradient(180deg, #66ffaa 40%, #06d6a0 60%)';
    delayBar.style.opacity = '0.7';
    delayBar.style.transition = 'none';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      delayBar.style.transition = 'opacity 0.4s ease-out 0.1s';
      delayBar.style.opacity = '0';
    }));
  }
  delayBar._pct = hpPct;

  fill.style.width = hpPct + '%';
  // Two-tone with slight blend: ally=green, enemy=purple
  const isAlly = gameMode === 'pvp-online' ? (f.side === onlineSide) : (f.side === 'left');
  if (isAlly) {
    fill.style.background = 'linear-gradient(180deg, #3deb9e 40%, #089e6b 60%)';
  } else {
    fill.style.background = 'linear-gradient(180deg, #c084fc 40%, #7c3aed 60%)';
  }
  // Hit flash: briefly brighten on actual HP damage
  if (hpActuallyDropped) {
    fill.classList.add('hp-flash');
    setTimeout(() => {
      fill.style.transition = 'width .15s ease-out, filter 0.15s ease-out';
      fill.classList.remove('hp-flash');
    }, 60);
  }

  // Shield = white bar after HP
  const shieldPct = f.shield / barMax * 100;
  let shieldEl = card.querySelector('.shield-fill');
  if (!shieldEl) {
    shieldEl = document.createElement('div');
    shieldEl.className = 'shield-fill';
    card.querySelector('.hp-bar').appendChild(shieldEl);
  }
  if (f.shield > 0) {
    shieldEl.style.display = 'block';
    shieldEl.style.left = hpPct + '%';
    shieldEl.style.width = shieldPct + '%';
  } else {
    shieldEl.style.display = 'none';
  }

  // Bubble shield = cyan bar (separate from normal shield)
  const bsPct = (f.bubbleShieldVal || 0) / barMax * 100;
  let bsEl = card.querySelector('.bubble-shield-fill');
  if (!bsEl) {
    bsEl = document.createElement('div');
    bsEl.className = 'bubble-shield-fill';
    card.querySelector('.hp-bar').appendChild(bsEl);
  }
  if (f.bubbleShieldVal > 0) {
    bsEl.style.display = 'block';
    bsEl.style.left = (hpPct + shieldPct) + '%';
    bsEl.style.width = bsPct + '%';
  } else {
    bsEl.style.display = 'none';
  }

  // HP bar tick marks (LOL style: every 100 = major, every 25 = minor)
  let tickContainer = card.querySelector('.hp-ticks');
  if (!tickContainer) {
    tickContainer = document.createElement('div');
    tickContainer.className = 'hp-ticks';
    card.querySelector('.hp-bar').appendChild(tickContainer);
  }
  let ticksHtml = '';
  const tickStep = 20;
  for (let v = tickStep; v < barMax; v += tickStep) {
    const pct = v / barMax * 100;
    if (pct >= 99.5) break;
    const isMajor = v % 100 === 0;
    ticksHtml += `<div class="hp-tick${isMajor ? ' hp-tick-major' : ''}" style="left:${pct}%"></div>`;
  }
  tickContainer.innerHTML = ticksHtml;

  // HP + Shield text (two lines)
  const maxHpClass = f.maxHp > f._initHp ? 'stat-up' : '';
  let hpLine = `<div class="hp-line"><img src="assets/stats/hp-icon.png" class="stat-icon"> ${Math.ceil(f.hp)}/<span class="${maxHpClass}">${f.maxHp}</span></div>`;
  const shieldParts = [];
  if (f.shield > 0) shieldParts.push(`<span class="shield-val"><img src="assets/status/shield-icon.png" style="width:14px;height:14px;vertical-align:middle">${Math.ceil(f.shield)}</span>`);
  if (f.bubbleShieldVal > 0) shieldParts.push(`<span class="bubble-val"><img src="assets/passive/bubble-store-icon.png" style="width:14px;height:14px;vertical-align:middle">${Math.ceil(f.bubbleShieldVal)} <small>${f.bubbleShieldTurns}回合</small></span>`);
  const shieldLine = shieldParts.length ? `<div class="shield-line">${shieldParts.join(' ')}</div>` : '';
  card.querySelector('.hp-text').innerHTML = hpLine + shieldLine;

  // Bubble store bar (only for fighters with bubbleStore passive)
  let bBar = card.querySelector('.bubble-store-bar');
  if (f.passive && f.passive.type === 'bubbleStore') {
    if (!bBar) {
      bBar = document.createElement('div');
      bBar.className = 'bubble-store-bar';
      bBar.innerHTML = '<div class="bubble-store-fill"></div>';
      card.querySelector('.hp-bar').parentNode.insertBefore(bBar, card.querySelector('.hp-text'));
    }
    const maxStore = f.maxHp * 0.5; // visual cap
    const storePct = Math.min(f.bubbleStore / maxStore * 100, 100);
    bBar.querySelector('.bubble-store-fill').style.width = storePct + '%';
    bBar.setAttribute('title', `泡泡储存: ${Math.round(f.bubbleStore)} (每回合回复${f.passive.healPct}%)`);
    // Label
    let label = bBar.querySelector('.bubble-store-label');
    if (!label) { label = document.createElement('span'); label.className = 'bubble-store-label'; bBar.appendChild(label); }
    label.textContent = `🫧 ${Math.round(f.bubbleStore)}`;
    bBar.style.display = f.bubbleStore > 0 ? '' : 'none';
  } else if (bBar) {
    bBar.style.display = 'none';
  }

  // Energy store bar (only for fighters with auraAwaken + energyStore passive)
  let eBar = card.querySelector('.energy-store-bar');
  if (f.passive && f.passive.type === 'auraAwaken' && f.passive.energyStore) {
    if (!eBar) {
      eBar = document.createElement('div');
      eBar.className = 'energy-store-bar';
      eBar.innerHTML = '<div class="energy-store-fill"></div>';
      card.querySelector('.hp-bar').parentNode.insertBefore(eBar, card.querySelector('.hp-text'));
    }
    const maxVisual = f.maxHp * 2; // visual cap for bar width
    const storePct = Math.min((f._storedEnergy || 0) / maxVisual * 100, 100);
    eBar.querySelector('.energy-store-fill').style.width = storePct + '%';
    eBar.setAttribute('title', `储能: ${Math.round(f._storedEnergy || 0)} (每${f.passive.energyReleaseTurn}回合释放波击)`);
    let label = eBar.querySelector('.energy-store-label');
    if (!label) { label = document.createElement('span'); label.className = 'energy-store-label'; eBar.appendChild(label); }
    label.textContent = `⚡ ${Math.round(f._storedEnergy || 0)}`;
    eBar.style.display = (f._storedEnergy || 0) > 0 ? '' : 'none';
  } else if (eBar) {
    eBar.style.display = 'none';
  }
}

// Get all alive enemies including summons (for AOE)

function renderStatusIcons(f) {
  if (f._isSummon) { renderSummonStatusIcons(f); return; }
  // Scene-based: update buff icons
  renderSceneBuffs(f);
  const elId = getFighterElId(f);
  const card = document.getElementById(elId);
  if (!card) return;
  // Toggle burn overlay (CSS ::before on .st-body) based on phoenixBurnDot presence
  const isBurning = f.alive && f.buffs && f.buffs.some(b => b.type === 'phoenixBurnDot');
  card.classList.toggle('burning', isBurning);
  const box = card.querySelector('.status-icons');
  if (!box) return;
  // Only debuff icons — passive is now shown in stats row
  box.innerHTML = f.buffs.map(b => {
    if (b.type === 'dot')     return `<span class="status-dot" title="诅咒${b.value}/回合 剩${b.turns}回合"><img src="assets/status/curse-debuff-icon.png" style="width:14px;height:14px;vertical-align:middle">${b.turns}</span>`;
    if (b.type === 'phoenixBurnDot') return `<span class="status-dot" title="灼烧(${b.value}+${b.hpPct}%HP)/回合 剩${b.turns}回合"><img src="assets/status/burn-icon.png" style="width:14px;height:14px;vertical-align:middle">${b.turns}</span>`;
    if (b.type === 'atkDown') return `<span class="status-atkdown" title="攻击力-${b.value}% 剩${b.turns}回合">⬇攻力${b.turns}</span>`;
    if (b.type === 'defDown') return `<span class="status-defdown" title="护甲-${b.value}% 剩${b.turns}回合">⬇护${b.turns}</span>`;
    if (b.type === 'hot')     return `<span class="status-hot" title="回复${b.value}/回合 剩${b.turns}回合">💚${b.turns}</span>`;
    if (b.type === 'defUp')   return `<span class="status-defup" title="护甲+${b.value} 剩${b.turns}回合">⬆护${b.turns}</span>`;
    if (b.type === 'atkUp')   return `<span class="status-defup" title="攻击力+${b.value} 剩${b.turns}回合">⬆攻力${b.turns}</span>`;
    if (b.type === 'bubbleBind') return `<span class="status-bubble" title="束缚：每受一段伤害 护甲/魔抗各 -${b.perHitLoss || 1} 剩${b.turns}回合"><img src="assets/passive/bubble-store-icon.png" style="width:14px;height:14px;vertical-align:middle">${b.turns}</span>`;
    if (b.type === 'dodge') return `<span class="status-dodge" title="闪避${b.value}% 剩${b.turns}回合"><img src="assets/status/dodge-new-icon.png" style="width:14px;height:14px;vertical-align:middle">${b.turns}</span>`;
    if (b.type === 'fear')  return `<span class="status-atkdown" title="恐惧：对双头龟伤害-${b.value}% 剩${b.turns}回合"><img src="assets/status/fear-icon.png" style="width:14px;height:14px;vertical-align:middle">${b.turns}</span>`;
    if (b.type === 'wormhole') return `<span style="color:#ffa500;background:rgba(255,165,0,.15);padding:1px 5px;border-radius:6px" title="虫洞标记：真实+${b.pierceBonusPct}% 魔伤+${b.normalBonusPct}% 剩${b.turns}回合"><img src="assets/status/wormhole-icon.png" style="width:14px;height:14px;vertical-align:middle">${b.turns}</span>`;
    if (b.type === 'gamblerPierceConvert') return `<span class="status-defup" title="${b.value}%伤害转真实 剩${b.turns}回合">🗡${b.turns}</span>`;
    if (b.type === 'hidingShield') return `<span class="status-defup" title="缩头护盾 剩${b.turns}回合，到期回复剩余盾${b.healPct}%HP"><img src="assets/status/shield-icon.png" style="width:14px;height:14px;vertical-align:middle">${b.turns}</span>`;
    if (b.type === 'stun') return `<span style="color:#ff0;background:rgba(255,255,0,.2);padding:1px 5px;border-radius:6px" title="眩晕：跳过下次行动"><img src="assets/status/stun-icon.png" style="width:14px;height:14px;vertical-align:middle">眩晕</span>`;
    if (b.type === 'diceFateCrit') return `<span style="color:#ff6b6b;background:rgba(255,107,107,.15);padding:1px 5px;border-radius:6px" title="命运骰子+${b.value}%暴击 剩${b.turns}回合"><img src="assets/passive/gambler-blood-icon.png" style="width:14px;height:14px;vertical-align:middle">+${b.value}%</span>`;
    if (b.type === 'healReduce') return `<span style="color:#6b8e23;background:rgba(107,142,35,.15);padding:1px 5px;border-radius:6px" title="治疗削减-${b.value}% 剩${b.turns}回合"><img src="assets/status/heal-reduce-icon.png" style="width:14px;height:14px;vertical-align:middle">-${b.value}%治疗${b.turns}</span>`;
    if (b.type === 'taunt') return `<span style="color:#ff4444;background:rgba(255,68,68,.15);padding:1px 5px;border-radius:6px" title="嘲讽 剩${b.turns}回合"><img src="assets/status/taunt-icon.png" style="width:14px;height:14px;vertical-align:middle">嘲讽${b.turns}</span>`;
    if (b.type === 'redirectAll') return `<span style="color:#ff4444;background:rgba(255,68,68,.2);padding:1px 5px;border-radius:6px" title="嘲讽：敌方单体攻击转移到我方 剩${b.turns}回合"><img src="assets/status/taunt-icon.png" style="width:14px;height:14px;vertical-align:middle">🛡${b.turns}</span>`;
    if (b.type === 'chiWaveActive') return `<span style="color:#78c8ff;background:rgba(88,166,255,.18);padding:1px 5px;border-radius:6px" title="龟派气波蓄力：+暴击/爆伤/吸血/穿甲 剩${b.turns}回合">💥${b.turns}</span>`;
    if (b.type === 'reflect') return `<span style="color:#ff8c00;background:rgba(255,140,0,.15);padding:1px 5px;border-radius:6px" title="反弹${b.value}% 剩${b.turns}回合"><img src="assets/status/reflect-icon.png" style="width:14px;height:14px;vertical-align:middle">反弹${b.turns}</span>`;
    if (b.type === 'dmgReduce') return `<span style="color:#4dabf7;background:rgba(77,171,247,.15);padding:1px 5px;border-radius:6px" title="受伤-${b.value}% 剩${b.turns}回合"><img src="assets/status/shield-icon.png" style="width:14px;height:14px;vertical-align:middle">-${b.value}%${b.turns}</span>`;
    if (b.type === 'dodgeCounter') return `<span style="color:#ffa500;background:rgba(255,165,0,.15);padding:1px 5px;border-radius:6px" title="闪避反击${b.value}伤害 剩${b.turns}回合"><img src="assets/status/counter-icon.png" style="width:14px;height:14px;vertical-align:middle">反击${b.turns}</span>`;
    if (b.type === 'lifesteal') return `<span style="color:#e74c3c;background:rgba(231,76,60,.15);padding:1px 5px;border-radius:6px" title="吸血+${b.value}% 剩${b.turns}回合"><img src="assets/stats/lifesteal-icon.png" style="width:14px;height:14px;vertical-align:middle">+${b.value}%${b.turns}</span>`;
    if (b.type === 'spdDown') return ''; // no speed stat, spdDown is cosmetic only
    if (b.type === 'mrDown') return `<span class="status-defdown" title="魔抗-${b.value}% 剩${b.turns}回合">⬇魔抗${b.turns}</span>`;
    if (b.type === 'mrUp') return `<span class="status-defup" title="魔抗+${b.value} 剩${b.turns}回合">⬆魔抗${b.turns}</span>`;
    if (b.type === 'poison') return `<span style="color:#6b8e23;background:rgba(107,142,35,.15);padding:1px 5px;border-radius:6px" title="中毒${b.value}/回合 剩${b.turns}回合"><img src="assets/status/poison-icon.png" style="width:14px;height:14px;vertical-align:middle">中毒${b.turns}</span>`;
    if (b.type === 'bleed') return `<span style="color:#cc3333;background:rgba(204,51,51,.15);padding:1px 5px;border-radius:6px" title="流血${b.value}/回合 剩${b.turns}回合"><img src="assets/status/bleed-icon.png" style="width:14px;height:14px;vertical-align:middle">流血${b.turns}</span>`;
    if (b.type === 'counter') return `<span style="color:#ffa500;background:rgba(255,165,0,.15);padding:1px 5px;border-radius:6px" title="反击${b.value}伤害 剩${b.turns}回合"><img src="assets/status/counter-icon.png" style="width:14px;height:14px;vertical-align:middle">${b.turns}</span>`;
    if (b.type === 'physImmune') return `<span style="color:#9b59b6;background:rgba(155,89,182,.15);padding:1px 5px;border-radius:6px" title="虚化：免疫物理伤害 剩${b.turns}回合"><img src="assets/status/stealth-icon.png" style="width:14px;height:14px;vertical-align:middle">虚化${b.turns}</span>`;
    if (b.type === 'hunterMark') return `<span style="color:#ff4444;background:rgba(255,68,68,.2);padding:1px 5px;border-radius:6px" title="猎杀印记：HP<${b.value}%时被斩杀 剩${b.turns}回合"><img src="assets/passive/hunter-kill-icon.png" style="width:14px;height:14px;vertical-align:middle">印记${b.turns}</span>`;
    return '';
  }).join('');
  // Star energy indicator
  if (f._starEnergy > 0) {
    const maxE = f.passive && f.passive.type === 'starEnergy' ? Math.round(f.maxHp * f.passive.maxChargePct / 100) : 100;
    const full = f._starEnergy >= maxE;
    box.innerHTML += `<span style="color:${full?'#ffd700':'#ffa500'};background:rgba(255,215,0,.15);padding:1px 5px;border-radius:6px" title="星能${Math.round(f._starEnergy)}/${maxE}${full?' 满能！下次攻击爆发！':''}"><img src="assets/passive/star-energy-bar-icon.png" style="width:14px;height:14px;vertical-align:middle">${Math.round(f._starEnergy)}${full?'💥':''}</span>`;
  }
  // Drone count indicator
  if (f._drones && f._drones.length > 0) {
    const oldest = Math.max(...f._drones.map(d => d.age));
    box.innerHTML += `<span class="status-defup" title="浮游炮${f._drones.length}个，最老${oldest}回合" style="color:#4cc9f0;background:rgba(76,201,240,.15)"><img src="assets/passive/cyber-drone-icon.png" style="width:14px;height:14px;vertical-align:middle">${f._drones.length}</span>`;
  }
  // Rainbow prism color indicator (show all active colors, up to 2 if enhanced)
  if (f._prismColor !== undefined && f.passive && f.passive.type === 'rainbowPrism') {
    const pLabels = ['🔴','🔵','🟢','🟠','🟡','🩵','🟣'];
    const pNames = ['红光','蓝光','绿光','橙光','黄光','青光','紫光'];
    const pColors = ['#ff6b6b','#4dabf7','#06d6a0','#ff8c00','#ffd93d','#4cc9f0','#9b59b6'];
    const colors = (f._prismColors && f._prismColors.length) ? f._prismColors : [f._prismColor];
    for (const c of colors) {
      box.innerHTML += `<span style="color:${pColors[c]};background:${pColors[c]}22;padding:1px 5px;border-radius:6px;font-weight:700;margin-right:2px" title="棱镜：${pNames[c]}">${pLabels[c]}${pNames[c]}</span>`;
    }
  }
  // Gold coins indicator
  if (f._goldCoins > 0) {
    box.innerHTML += `<span class="status-defup" title="金币${f._goldCoins}" style="color:#ffd93d;background:rgba(255,217,61,.15)"><img src="assets/battle/gold-coin-icon.png" style="width:14px;height:14px;vertical-align:middle">${f._goldCoins}</span>`;
  }
  // Shell energy wave countdown (auraAwaken with energyStore)
  if (f.passive && f.passive.type === 'auraAwaken' && f.passive.energyStore && f.passive.energyReleaseTurn && typeof turnNum !== 'undefined') {
    const period = f.passive.energyReleaseTurn;
    const turnsUntil = (period - (turnNum % period)) % period || period;
    const stored = Math.round(f._storedEnergy || 0);
    box.innerHTML += `<span style="color:#e17055;background:rgba(225,112,85,.18);padding:1px 5px;border-radius:6px;font-weight:700" title="储能: ${stored} · ${turnsUntil}回合后释放冲击波">⚡${turnsUntil}回合</span>`;
  }
  // Shock stacks indicator (lightning turtle's own passive — stackMax 8)
  if (f._shockStacks > 0) {
    box.innerHTML += `<span class="status-dot" title="电击层 ${f._shockStacks}/8（闪电龟）" style="color:#ffd700;background:rgba(255,215,0,.15);padding:1px 5px;border-radius:6px">⚡${f._shockStacks}/8</span>`;
  }
  // Lava shield indicator
  if (f._lavaShieldTurns > 0) {
    box.innerHTML += `<span class="status-dot" title="熔岩盾 剩${f._lavaShieldTurns}回合 被攻击每段反击">🌋${f._lavaShieldTurns}</span>`;
  }
  // Ink stacks indicator (on target being marked)
  if (f._inkStacks > 0) {
    box.innerHTML += `<span style="color:#1a1a2e;background:rgba(100,100,100,.2);padding:1px 5px;border-radius:6px" title="墨迹${f._inkStacks}层 受到伤害+${f._inkStacks*5}%">🖊️${f._inkStacks}</span>`;
  }
  // Ink link indicator
  if (f._inkLink && f._inkLink.partner && f._inkLink.partner.alive && f._inkLink.turns > 0) {
    box.innerHTML += `<span style="color:#6c5ce7;background:rgba(108,92,231,.15);padding:1px 5px;border-radius:6px" title="连笔链接${f._inkLink.partner.name} 剩${f._inkLink.turns}回合 受伤${f._inkLink.transferPct}%传递">🔗${f._inkLink.turns}</span>`;
  }
  // Bamboo charge indicator with glow animation (hide after fired)
  if (f._bambooCharged && !f._bambooFired) {
    box.innerHTML += `<span class="bamboo-charge-ready" title="竹编充能：本回合技能后追加强化攻击"><img src="assets/passive/bamboo-charge-icon.png" class="stat-icon">充能</span>`;
  }
  // Crystallize stacks indicator
  if (f._crystallize > 0) {
    box.innerHTML += `<span style="color:#c77dff;background:rgba(199,125,255,.15);padding:1px 5px;border-radius:6px" title="结晶${f._crystallize}/4，满4层引爆"><img src="assets/passive/crystal-resonance-icon.png" style="width:14px;height:14px;vertical-align:middle">${f._crystallize}</span>`;
  }
  // Diamond collide stacks indicator
  if (f._collideStacks > 0) {
    box.innerHTML += `<span style="color:#b8d4e3;background:rgba(184,212,227,.15);padding:1px 5px;border-radius:6px" title="碰撞${f._collideStacks}/2，满2次眩晕"><img src="assets/passive/diamond-structure-icon.png" style="width:14px;height:14px;vertical-align:middle">${f._collideStacks}</span>`;
  }
  // Rainbow prism color indicator
  if (f._prismColor !== undefined && f.passive && f.passive.type === 'rainbowPrism') {
    const prismLabels = ['🔴红光','🔵蓝光','🟢绿光'];
    const prismColors = ['#ff6b6b','#4dabf7','#06d6a0'];
    const prismTips = ['攻击力+15%，光束额外真实伤害','护甲+15%魔抗+15%，光束获得护盾','回复7%HP，光束回复生命'];
    const c = f._prismColor;
    box.innerHTML += `<span style="color:${prismColors[c]};background:${prismColors[c]}22;padding:1px 5px;border-radius:6px;font-weight:700" title="${prismTips[c]}">${prismLabels[c]}</span>`;
  }
  // Undead lock indicator
  if (f._undeadLockTurns > 0) {
    box.innerHTML += `<span style="color:#9b59b6;background:rgba(155,89,182,.2);padding:1px 5px;border-radius:6px;font-weight:700" title="亡灵之力：锁血1HP ${f._undeadLockTurns}回合"><img src="assets/passive/undead-rage-icon.png" style="width:14px;height:14px;vertical-align:middle">锁血${f._undeadLockTurns}</span>`;
  }
  // Lava rage indicator
  if (f.passive && f.passive.type === 'lavaRage') {
    if (f._lavaTransformed) {
      box.innerHTML += `<span style="color:#ff6600;background:rgba(255,102,0,.2);padding:1px 5px;border-radius:6px;font-weight:700" title="火山形态 剩余${f._lavaTransformTurns}回合"><img src="assets/passive/volcano-form-icon.png" style="width:14px;height:14px;vertical-align:middle">火山${f._lavaTransformTurns}</span>`;
    } else if (!f._lavaSpent) {
      const rage = f._lavaRage || 0;
      box.innerHTML += `<span style="color:#ff6600;background:rgba(255,102,0,.15);padding:1px 5px;border-radius:6px" title="怒气${rage}/100"><img src="assets/passive/lava-heart-icon.png" style="width:14px;height:14px;vertical-align:middle">${rage}/100</span>`;
    }
  }
  // Chest treasure progress + equipped items
  if (f.passive && f.passive.type === 'chestTreasure') {
    const treasure = f._chestTreasure || 0;
    const tier = f._chestTier || 0;
    const thresholds = f.passive.thresholds;
    const lvMult = 1 + ((f._level || 1) - 1) * 0.03;
    const nextThresh = tier < thresholds.length ? Math.round(thresholds[tier] * lvMult) : null;
    const progressText = nextThresh ? `${treasure}/${nextThresh}` : `${treasure}(满)`;
    box.innerHTML += `<span style="color:#ffd93d;background:rgba(255,217,61,.15);padding:1px 5px;border-radius:6px" title="财宝值${treasure}，已装备${tier}件">💰${progressText}</span>`;
    // Also update the dedicated left-side pile indicator
    const pile = el.querySelector('[data-chest-progress]');
    if (pile) pile.textContent = progressText;
    if (f._chestEquips && f._chestEquips.length > 0) {
      const equipIcons = f._chestEquips.map(e => {
        const ih = e.icon.endsWith && e.icon.endsWith('.png') ? `<img src="assets/${e.icon}" style="width:14px;height:14px;vertical-align:middle">` : e.icon;
        return `<span title="${e.name}：${e.desc.replace(/<[^>]+>/g,'')}">${ih}</span>`;
      }).join('');
      box.innerHTML += `<span style="padding:1px 3px">${equipIcons}</span>`;
    }
  }
  // Gold lightning stacks (chest 雷刃 equip — stackMax 5). Shown as a separate pill
  // even though it uses the same ⚡ icon as 闪电龟's _shockStacks; the two systems
  // accumulate independently and players need to read each count separately.
  if (f._goldLightning > 0) {
    box.innerHTML += `<span style="color:#ffea7a;background:rgba(255,234,122,.18);padding:1px 5px;border-radius:6px" title="金闪电 ${f._goldLightning}/5（宝箱龟雷刃）">⚡${f._goldLightning}/5</span>`;
  }
  // Also refresh stats row to show debuff color changes
  updateFighterStats(f, elId);
}



// ══════════════════════════════════════════════════════════
// SKILL DESCRIPTION TEMPLATE ENGINE
// ══════════════════════════════════════════════════════════
//
// Template syntax:
//   {N:expr}  → compute expr, red (normal dmg)
//   {P:expr}  → purple (pierce)
//   {S:expr}  → white (shield)
//   {H:expr}  → green (heal)
//   {B:expr}  → teal (buff)
//   {expr}    → compute expr, no color
//   {ATK} {DEF} {HP} {hits} etc → raw value
//   Expressions: 1.4*ATK, 0.5*ATK+2*DEF, HP*0.2, ATK*0.15*hits
//   Conditionals not needed — just don't include optional lines
//
const _colorMap = { N:'val-normal', P:'val-pierce', S:'val-shield', H:'val-heal', B:'val-buff', D:'val-def', M:'val-magic', T:'val-true' };

function renderSkillTemplate(template, f, s) {
  if (!template) return '';
  // Dynamic placeholders — resolve here so every caller (fighter panel, skill
  // picker, codex, etc.) shows the rendered brief/detail instead of the literal
  // '_chestSmashBrief_' / '_chestSmashDetail_' placeholder.
  if (template === '_chestSmashBrief_') return buildChestSmashBrief(f, s);
  if (template === '_chestSmashDetail_') return buildChestSmashDetail(f, s);
  // Build variable context
  const vars = {
    ATK: f.atk, DEF: f.def, MR: f.mr || f.def, HP: f.maxHp, hits: s.hits || 1,
    power: s.power || 0, pierce: s.pierce || 0, cd: s.cd || 0,
    atkScale: s.atkScale || 0, defScale: s.defScale || 0, dmgScale: s.dmgScale || 0,
    hpPct: s.hpPct || 0, mrScale: s.mrScale || 0, arrowScale: s.arrowScale || 0,
    shieldScale: s.shieldScale || 0, trapScale: s.trapScale || 0,
    burstScale: s.burstScale || 0, counterScale: s.counterScale || 0,
    shieldHpPct: s.shieldHpPct || 0, shieldDuration: s.shieldDuration || 0,
    shieldHealPct: s.shieldHealPct || 0, shieldBreak: s.shieldBreak || 0,
    burnAtkScale: s.burnAtkScale || 0, burnHpPct: s.burnHpPct || 0, burnTurns: s.burnTurns || 0,
    execThresh: s.execThresh || 0, execCrit: s.execCrit || 0, execCritDmg: s.execCritDmg || 0,
    fearTurns: s.fearTurns || 0, fearReduction: s.fearReduction || 0,
    splashPct: s.splashPct || 0, duration: s.duration || 0,
    atkUpPct: s.atkUpPct || 0, atkUpTurns: s.atkUpTurns || 0,
    bindPct: s.bindPct || 0, dodgePct: s.dodgePct || 0, dodgeTurns: s.dodgeTurns || 0,
    minScale: s.minScale || 0, maxScale: s.maxScale || 0,
    healPct: s.healPct || 0, heal: s.heal || 0, shield: s.shield || 0,
    perCoinPierce: s.perCoinAtkPierce || 0, perCoinNormal: s.perCoinAtkNormal || 0,
    goldCoins: f._goldCoins || 0,
    droneCount: f._drones ? f._drones.length : (f.passive && f.passive.droneCount) || 0,
    mechHp: (f._drones ? f._drones.length : (f.passive && f.passive.droneCount) || 0) * (f.passive && f.passive.mechHpPer || 30),
    mechAtk: (f._drones ? f._drones.length : (f.passive && f.passive.droneCount) || 0) * (f.passive && f.passive.mechAtkPer || 5),
    crit: f.crit || 0.25,
    bambooGainedHp: f._bambooGainedHp || 0,
    stoneDefGained: f._stoneDefGained || 0,
    lavaTransformTurns: f._lavaTransformTurns || 0,
    hunterKills: f._hunterKills || 0,
    hunterStolenAtk: f._hunterStolenAtk || 0,
    hunterStolenDef: f._hunterStolenDef || 0,
    hunterStolenHp: f._hunterStolenHp || 0,
    hunterStolenMr: f._hunterStolenMr || 0,
    lifesteal: f._lifestealPct || 0,
    armorBreakPct: s.armorBreak ? s.armorBreak.pct : 0, armorBreakTurns: s.armorBreak ? s.armorBreak.turns : 0,
    atkDownPct: s.atkDown ? s.atkDown.pct : 0, atkDownTurns: s.atkDown ? s.atkDown.turns : 0,
    defDownPct: s.defDown ? s.defDown.pct : 0, defDownTurns: s.defDown ? s.defDown.turns : 0,
    defUpVal: s.defUp ? s.defUp.val : 0, defUpTurns: s.defUp ? s.defUp.turns : 0,
    defUpPctVal: s.defUpPct ? s.defUpPct.pct : 0, defUpPctTurns: s.defUpPct ? s.defUpPct.turns : 0,
    selfDefUpPct: s.selfDefUpPct ? s.selfDefUpPct.pct : 0, selfDefUpTurns: s.selfDefUpPct ? s.selfDefUpPct.turns : 0,
    hotPerTurn: s.hot ? s.hot.hpPerTurn : 0, hotTurns: s.hot ? s.hot.turns : 0,
    shieldFlat: s.shieldFlat || 0, shieldHpPctVal: s.shieldHpPct || 0,
    totalScale: s.totalScale || 0, shieldTurns: s.shieldTurns || 0,
    defBoostTurns: s.defBoostTurns || 0, stunAfter: s.stunAfter || 0,
    transferPct: s.transferPct || 0,
    stackMax: s.stackMax || (f.passive && f.passive.stackMax) || 0,
    maxStacks: s.maxStacks || (f.passive && f.passive.maxStacks) || 0,
    pctPerStack: s.pctPerStack || (f.passive && f.passive.pctPerStack) || 0,
    atkPct: s.atkPct || (f.passive && f.passive.atkPct) || 0,
    defPct: s.defPct || (f.passive && f.passive.defPct) || 0,
    defBuffAmp: s.defBuffAmp || (f.passive && f.passive.defBuffAmp) || 0,
  };

  let result = template.replace(/\{([NPHSBDMT]):([^}]+)\}|\{([^}]+)\}/g, (match, color, expr, plainExpr) => {
    const e = expr || plainExpr;
    const val = evalSkillExpr(e, vars);
    if (color && _colorMap[color]) {
      return `<span class="${_colorMap[color]}">${val}</span>`;
    }
    return val;
  });
  // Auto-color damage type keywords
  result = result.replace(/物理伤害/g, '<span class="val-normal">物理伤害</span>');
  result = result.replace(/魔法伤害/g, '<span class="val-magic">魔法伤害</span>');
  result = result.replace(/真实伤害/g, '<span class="val-true">真实伤害</span>');
  result = result.replace(/(?<!\">)真实(?!伤害|<)/g, '<span class="val-true">真实</span>');
  result = result.replace(/(?<!\">)物理(?!伤害|<)/g, '<span class="val-normal">物理</span>');
  result = result.replace(/(?<!\">)魔法(?!伤害|<)/g, '<span class="val-magic">魔法</span>');
  result = result.replace(/防御力加成/g, '<span class="val-def">防御力加成</span>');
  // Auto-color stat keywords
  result = result.replace(/(?<!\">)攻击力(?!<)/g, '<span class="val-normal">攻击力</span>');
  result = result.replace(/(?<!\">)护甲(?!<)/g, '<span class="val-def">护甲</span>');
  result = result.replace(/(?<!\">)魔抗(?!<)/g, '<span class="val-magic">魔抗</span>');
  result = result.replace(/(?<!\">)最大生命值(?!<)/g, '<span class="val-heal">最大生命值</span>');
  result = result.replace(/(?<!\">)最大HP(?!<)/g, '<span class="val-heal">最大HP</span>');
  // Status effect keywords
  result = result.replace(/(?<!\">)治疗削减(?!<)/g, '<span class="val-heal-reduce">治疗削减</span>');
  result = result.replace(/(?<!\">)灼烧(?!<)/g, '<span class="val-burn">灼烧</span>');
  result = result.replace(/(?<!\">)生命偷取(?!<)/g, '<span class="val-lifesteal">生命偷取</span>');
  result = result.replace(/(?<!\">)吸血(?!<)/g, '<span class="val-lifesteal">吸血</span>');
  result = result.replace(/(?<!\">)眩晕(?!<)/g, '<span class="val-stun">眩晕</span>');
  result = result.replace(/(?<!\">)诅咒(?!<)/g, '<span class="val-dot">诅咒</span>');
  result = result.replace(/(?<!\">)护盾(?!<)/g, '<span class="val-shield">护盾</span>');
  result = result.replace(/(?<!\">)中毒(?!<)/g, '<span class="val-dot">中毒</span>');
  result = result.replace(/(?<!\">)流血(?!<)/g, '<span style="color:#cc3333;font-weight:700">流血</span>');
  result = result.replace(/(?<!\">)冰寒(?!<)/g, '<span style="color:#87ceeb;font-weight:700">冰寒</span>');
  result = result.replace(/(?<!\">)反伤(?!<)/g, '<span class="val-reflect">反伤</span>');
  result = result.replace(/(?<!\">)暴击率(?!<)/g, '<span class="val-crit">暴击率</span>');
  result = result.replace(/(?<!\">)暴击伤害(?!<)/g, '<span class="val-crit-dmg">暴击伤害</span>');
  // Extra/bonus damage — only color "额外伤害" as a whole, not standalone "额外"
  result = result.replace(/(?<!\">)额外伤害(?!<)/g, '<span class="val-extra">额外伤害</span>');
  return result;
}

function evalSkillExpr(expr, vars) {
  // Simple safe expression evaluator
  // Supports: numbers, +, -, *, /, (), variable names
  try {
    // Replace variable names with values
    let safe = expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, name => {
      if (vars.hasOwnProperty(name)) return vars[name];
      return name;
    });
    // Only allow safe chars: digits, operators, parens, dots, spaces
    if (/^[\d\s+\-*/().~]+$/.test(safe)) {
      const result = Function('"use strict"; return (' + safe + ')')();
      return typeof result === 'number' ? Math.round(result) : result;
    }
    // If expression contains non-safe chars, return as-is (it's descriptive text)
    return safe;
  } catch(e) {
    return expr;
  }
}

// Shortcut: render brief or detail, with auto-generation fallback
function colorDmgKeywords(text) {
  return text
    .replace(/物理伤害/g, '<span class="val-normal">物理伤害</span>')
    .replace(/魔法伤害/g, '<span class="val-magic">魔法伤害</span>')
    .replace(/真实伤害/g, '<span class="val-true">真实伤害</span>')
    .replace(/(?<!"val-[^"]*">)真实(?!伤害|<)/g, '<span class="val-true">真实</span>')
    .replace(/(?<!"val-[^"]*">)物理(?!伤害|<)/g, '<span class="val-normal">物理</span>')
    .replace(/(?<!"val-[^"]*">)魔法(?!伤害|<)/g, '<span class="val-magic">魔法</span>')
    .replace(/(?<!"val-[^"]*">)额外伤害(?!<)/g, '<span class="val-extra">额外伤害</span>')
    .replace(/(?<!"val-[^"]*">)暴击率(?!<)/g, '<span class="val-crit">暴击率</span>')
    .replace(/(?<!"val-[^"]*">)暴击伤害(?!<)/g, '<span class="val-crit-dmg">暴击伤害</span>')
    .replace(/(?<!"val-[^"]*">)灼烧(?!<)/g, '<span class="val-burn">灼烧</span>')
    .replace(/(?<!"val-[^"]*">)治疗削减(?!<)/g, '<span class="val-heal-reduce">治疗削减</span>')
    .replace(/(?<!"val-[^"]*">)吸血(?!<)/g, '<span class="val-lifesteal">吸血</span>')
    .replace(/(?<!"val-[^"]*">)眩晕(?!<)/g, '<span class="val-stun">眩晕</span>')
    .replace(/(?<!"val-[^"]*">)诅咒(?!<)/g, '<span class="val-dot">诅咒</span>')
    .replace(/(?<!"val-[^"]*">)护盾(?!<)/g, '<span class="val-shield">护盾</span>')
    .replace(/(?<!"val-[^"]*">)反伤(?!<)/g, '<span class="val-reflect">反伤</span>');
}
// Extracted helper — used by both renderSkillTemplate (for '_chestSmashBrief_'
// placeholder substitution everywhere) and buildSkillBrief directly.
function buildChestSmashBrief(f, s) {
  let total = Math.round(f.atk * s.atkScale);
  if (hasChestEquip(f, 'rock')) total += f.def + (f.mr || f.def);
  const dmgType = hasChestEquip(f, 'star') ? '真实伤害' : '物理伤害';
  const hits = s.hits || 3;
  return `宝箱龟砸击敌方${hits}段，共（<span class="val-normal">${total}</span>）${dmgType}`;
}

function buildSkillBrief(f, s) {
  let result;
  if (s.brief === '_chestSmashBrief_') {
    result = buildChestSmashBrief(f, s);
  } else {
    result = s.brief ? renderSkillTemplate(s.brief, f, s) : colorDmgKeywords(autoGenerateBrief(f, s));
  }
  result += getChestEquipBonusText(f, s);
  return result;
}
function buildSkillDetailDesc(f, s) {
  let result;
  if (s.detail === '_chestSmashDetail_') {
    result = buildChestSmashDetail(f, s);
  } else {
    result = s.detail ? renderSkillTemplate(s.detail, f, s).replace(/\n/g, '<br>') : colorDmgKeywords(autoGenerateDetail(f, s));
  }
  result += getChestEquipBonusText(f, s);
  return result;
}
function buildChestSmashDetail(f, s) {
  const hits = s.hits || 3;
  const totalBase = Math.round(f.atk * s.atkScale);
  let totalAll = totalBase;
  let lines = `宝箱龟对单体砸击${hits}段。\n总基础伤害：（${Math.round(s.atkScale*100)}%×<span class="val-normal">攻击力</span>(${f.atk}) = <span class="val-normal">${totalBase}</span>）`;
  if (hasChestEquip(f, 'rock')) {
    const defDmg = f.def;
    const mrDmg = f.mr || f.def;
    lines += `+（100%×<span class="val-def">护甲</span>(${f.def}) = <span class="val-def">${defDmg}</span>）+（100%×<span class="val-magic">魔抗</span>(${f.mr||f.def}) = <span class="val-magic">${mrDmg}</span>）`;
    totalAll += defDmg + mrDmg;
  }
  const dmgType = hasChestEquip(f, 'star') ? '真实伤害' : '物理伤害';
  lines += ` ${dmgType}。`;
  const perHit = Math.round(totalAll / hits);
  lines += `\n每段 <span class="val-normal">${perHit}</span>，共 <span class="val-normal">${totalAll}</span> ${dmgType}。`;
  return lines.replace(/\n/g, '<br>');
}
function getChestEquipBonusText(f, s) {
  if (!f._chestEquips || !f._chestEquips.length) return '';
  const lines = [];
  if (s.type === 'chestSmash') {
    if (hasChestEquip(f, 'chain')) lines.push('🔗锁链：对次要目标造成25%连锁伤害');
    if (hasChestEquip(f, 'rock')) lines.push('🪨神奇石头：伤害额外加成100%护甲+100%魔抗');
  }
  if (s.type === 'chestSmash' || s.type === 'chestStorm') {
    if (hasChestEquip(f, 'fire')) lines.push('🔥火石：命中目标施加灼烧');
    if (hasChestEquip(f, 'poison')) lines.push('☠️毒箭：命中目标施加治疗削减3回合');
    if (hasChestEquip(f, 'thunder')) lines.push('⚡闪电龟的雷刃：命中叠金闪电层，满5层引爆100%ATK真实伤害');
    if (hasChestEquip(f, 'star')) lines.push('🌟星辉：所有伤害转为真实伤害');
  }
  if (!lines.length) return '';
  return '<br>' + lines.map(l => `<span style="color:#c77dff;font-size:11px">▸ ${l}</span>`).join('<br>');
}

// Auto-generate brief from skill data fields
function autoGenerateBrief(f, s) {
  const N = v => `<span class="val-normal">${v}</span>`;
  const P = v => `<span class="val-pierce">${v}</span>`;
  const S = v => `<span class="val-shield">${v}</span>`;
  const H = v => `<span class="val-heal">${v}</span>`;
  const B = v => `<span class="val-buff">${v}</span>`;
  const parts = [];
  // Damage
  let dmg = 0;
  if (s.power > 0) dmg += s.power * (s.hits||1);
  if (s.atkScale) dmg += Math.round(f.atk * s.atkScale);
  if (s.defScale) dmg += Math.round(f.def * s.defScale);
  if (dmg > 0) {
    const dmgLabel = s.dmgType==='magic' ? '魔法伤害' : s.dmgType==='true' ? '真实伤害' : '物理伤害';
    parts.push(`${s.hits>1?s.hits+'段共':''}${N(dmg)}${dmgLabel}`);
  }
  if (s.hpPct) parts.push(`+${s.hpPct}%目标HP`);
  if (s.pierce > 0) parts.push(`${P((s.pierce*(s.hits||1))+'真实')}`);
  // Heal/shield
  if (s.heal > 0) parts.push(`回复${H(s.heal+'HP')}`);
  if (s.shield > 0) parts.push(`${S('+'+s.shield+'护盾')}`);
  if (s.shieldFlat || s.shieldHpPct) { let a = (s.shieldFlat||0); if(s.shieldHpPct) a+=Math.round(f.maxHp*s.shieldHpPct/100); parts.push(`${S('+'+a+'护盾')}`); }
  // Debuffs
  if (s.atkDown) parts.push(`攻击-${s.atkDown.pct}%`);
  if (s.defDown) parts.push(`护甲-${s.defDown.pct}%`);
  if (s.dot) parts.push(`灼烧${s.dot.turns}回合`);
  if (s.hot) parts.push(`回复${H(s.hot.hpPerTurn+'/回合')}×${s.hot.turns}`);
  if (s.aoe) parts.push('全体');
  if (s.random) parts.push('随机倍率');
  return parts.join('，') || s.desc || '';
}

function autoGenerateDetail(f, s) {
  const N = v => `<span class="val-normal">${v}</span>`;
  const P = v => `<span class="val-pierce">${v}</span>`;
  const S = v => `<span class="val-shield">${v}</span>`;
  const H = v => `<span class="val-heal">${v}</span>`;
  const B = v => `<span class="val-buff">${v}</span>`;
  const lines = [];
  // Damage formula
  const dmgParts = [];
  if (s.atkScale) { const v=Math.round(f.atk*s.atkScale); dmgParts.push(`${s.atkScale}×(攻击力=${f.atk}) = ${N(v)}`); }
  if (s.defScale) { const v=Math.round(f.def*s.defScale); dmgParts.push(`${s.defScale}×(防御=${f.def}) = ${N(v)}`); }
  if (s.power > 0) dmgParts.push(N(s.power));
  if (s.hpPct) dmgParts.push(`${s.hpPct}%目标最大HP`);
  if (dmgParts.length) {
    const dmgLabel = s.dmgType==='magic' ? '魔法伤害' : s.dmgType==='true' ? '真实伤害' : '物理伤害';
    lines.push(`造成 ${dmgParts.join(' + ')} ${dmgLabel}${s.hits>1?'，'+s.hits+'段':''}`);
  }
  if (s.pierce > 0) lines.push(`额外 ${P(s.pierce+' 真实')}伤害（无视护甲和魔抗）`);
  if (s.heal > 0) lines.push(`回复 ${H(s.heal+' HP')}`);
  if (s.shield > 0) lines.push(`获得 ${S(s.shield+' 护盾')}`);
  if (s.shieldFlat||s.shieldHpPct) { let a=(s.shieldFlat||0); if(s.shieldHpPct) a+=Math.round(f.maxHp*s.shieldHpPct/100); lines.push(`护盾 ${S('+'+a)}`); }
  if (s.atkDown) lines.push(`攻击 -${s.atkDown.pct}% ${s.atkDown.turns}回合`);
  if (s.defDown) lines.push(`防御 -${s.defDown.pct}% ${s.defDown.turns}回合`);
  if (s.dot) lines.push(`灼烧 ${N(s.dot.dmg+'/回合')} ${s.dot.turns}回合`);
  if (s.hot) lines.push(`持续回复 ${H(s.hot.hpPerTurn+'/回合')} ${s.hot.turns}回合`);
  if (s.defUp) lines.push(`防御 ${B('+'+s.defUp.val)} ${s.defUp.turns}回合`);
  if (s.defUpPct) { const v=Math.round(f.baseDef*s.defUpPct.pct/100); lines.push(`防御 +${s.defUpPct.pct}% = ${B('+'+v)} ${s.defUpPct.turns}回合`); }
  if (s.random) lines.push(`伤害随机×0.5~1.5倍率`);
  if (s.aoe) lines.push(`🎯 全体敌方`);
  if (s.aoeAlly) lines.push(`🎯 全体友方`);
  if (s.cd > 0 && s.cd < 100) lines.push(`冷却 ${s.cd} 回合`);
  return lines.join('<br>') || s.desc || '';
}

// (Old hardcoded buildSkillBrief removed — now uses template engine above)
// Legacy computeSkillInfoText kept only as stub
function computeSkillInfoText(f, s) { return buildSkillBrief(f, s); }

function showTurtlePicker(canAct) {
  const panel = document.getElementById('actionPanel');
  if (panel) panel.classList.remove('show');
  const picker = document.getElementById('turtlePicker');
  if (!picker) return;
  const box = document.getElementById('pickerButtons');
  box.innerHTML = canAct.map(f => {
    const fIdx = allFighters.indexOf(f);
    const color = RARITY_COLORS[f.rarity] || '#fff';
    return `<button class="picker-btn" onclick="selectTurtleToAct(${fIdx})" style="border-color:${color}">
      <span class="picker-emoji">${petIcon(f, 28)}</span>
      <span class="picker-name" style="color:${color}">${f.name}</span>
    </button>`;
  }).join('');
  picker.style.display = 'block';
}

function showActionPanel(f) {
  currentActingFighter = f; // track who's acting for pickSkill
  const picker = document.getElementById('turtlePicker');
  if (picker) picker.style.display = 'none';
  const panel = document.getElementById('actionPanel');
  document.getElementById('actingName').textContent = f.name;
  document.getElementById('actingName').style.color = RARITY_COLORS[f.rarity];
  document.querySelectorAll('.fighter-card,.scene-turtle').forEach(c => c.classList.remove('active-turn'));
  const activeEl = document.getElementById(getFighterElId(f));
  if (activeEl) activeEl.classList.add('active-turn');

  // Show back button if multiple turtles could act
  const backBtn = document.getElementById('btnBackPicker');
  if (backBtn) {
    const sideTeam = activeSide === 'left' ? leftTeam : rightTeam;
    const aliveCount = sideTeam.filter(t => t.alive).length;
    backBtn.style.display = aliveCount > 1 ? '' : 'none';
  }

  // Mech auto-attack: not player controlled
  if (f._isMech) {
    panel.classList.remove('show');
    setTimeout(() => aiAction(f), 1200);
    return;
  }

  const isPlayer =
    ((gameMode === 'pve' || gameMode === 'boss' || gameMode === 'dungeon' || gameMode === 'test') && f.side === 'left') ||
    (gameMode === 'pvp-online' && f.side === onlineSide);

  const battle = document.getElementById('screenBattle');
  if (isPlayer) {
    renderActionButtons(f);
    panel.classList.add('show');
    if (battle) battle.classList.add('action-visible');
  } else if (gameMode === 'pve' || gameMode === 'boss') {
    panel.classList.remove('show');
    if (battle) battle.classList.remove('action-visible');
    setTimeout(() => aiAction(f), 1200);
  } else {
    panel.classList.remove('show');
    if (battle) battle.classList.remove('action-visible');
    addLog('等待对手操作…','sys');
  }
}

function renderActionButtons(f) {
  const box = document.getElementById('actionButtons');
  const isMobile = window.innerWidth <= 768;

  box.innerHTML = f.skills.map((s,i) => {
    let ready = s.cdLeft === 0;
    if (s.type === 'hidingCommand' && (!f._summon || !f._summon.alive)) ready = false;
    if (s.type === 'hidingBuffSummon' && (!f._summon || !f._summon.alive)) ready = false;
    if (s.type === 'gamblerBet' && f.hp / f.maxHp <= 0.4) ready = false;
    if (s.type === 'fortuneAllIn' && (f._goldCoins || 0) <= 0) ready = false;
    if (s.type === 'fortuneBuyEquip' && (f._goldCoins || 0) < (s.coinCost || 20)) ready = false;
    if (s.type === 'bubbleBurst' && (f.bubbleStore || 0) <= 0) ready = false;
    if (s.type === 'starShieldBreak') { const enemies = allFighters.filter(e=>e.alive&&e.side!==f.side); if (!enemies.some(e=>e.shield>0||e.bubbleShieldVal>0)) ready = false; }
    const shieldImg = '<img src="assets/status/shield-icon.png" style="width:16px;height:16px;vertical-align:middle">';
    const iconMap = {physical:'⚔️',magic:'✨',heal:'💚',shield:shieldImg,bubbleShield:'<img src="assets/passive/bubble-store-icon.png" style="width:16px;height:16px;vertical-align:middle">',bubbleBind:'<img src="assets/passive/bubble-store-icon.png" style="width:16px;height:16px;vertical-align:middle">',hidingDefend:shieldImg,hidingCommand:'🫣'};
    const icon = iconMap[s.type] || '⚔️';
    const hitsLabel = s.hits > 1 ? ` ×${s.hits}` : '';
    let reasonStr = '';
    if (!ready) {
      if (s.cdLeft > 0) reasonStr = `CD${s.cdLeft}`;
      else if ((s.type === 'hidingCommand' || s.type === 'hidingBuffSummon') && (!f._summon || !f._summon.alive)) reasonStr = '随从已阵亡';
      else if (s.type === 'fortuneAllIn') reasonStr = '无金币';
      else if (s.type === 'fortuneBuyEquip') reasonStr = '金币不足';
      else if (s.type === 'bubbleBurst') reasonStr = '无泡沫';
      else if (s.type === 'starShieldBreak') reasonStr = '无敌方护盾';
      else if (s.type === 'gamblerBet') reasonStr = 'HP过低';
      else reasonStr = '不可用';
    }
    const cdStr = reasonStr ? ` <span class="cd-tag">${reasonStr}</span>` : '';

    if (isMobile) {
      const brief = buildSkillBrief(f, s);
      const detail = buildSkillDetailDesc(f, s);
      const cdLine = s.cd > 0 && s.cd < 100 ? `<span class="skill-cd-info">CD${s.cd}</span>` : '';
      return `<div class="skill-btn-wrap" id="skillWrap${i}">
        <div class="skill-card-mobile ${ready?'':'disabled'}" ${ready?`onclick="pickSkill(${i})"`:''}>
          <div class="skill-mobile-header">${icon} <b>${s.name}</b>${hitsLabel}${cdStr} ${cdLine}</div>
          <div class="skill-mobile-brief">${brief}</div>
          <div class="skill-mobile-full" id="skillMobileDetail${i}" style="display:none">${detail}</div>
          ${detail !== brief ? `<span class="fdp-passive-toggle" onclick="event.stopPropagation();toggleMobileSkillBriefDetail(${i})">详细 ▾</span>` : ''}
        </div>
      </div>`;
    }

    // Desktop: full card
    const brief = buildSkillBrief(f, s);
    const detail = buildSkillDetailDesc(f, s);
    const cdLine = s.cd > 0 && s.cd < 100 ? `<span class="skill-cd-info">冷却 ${s.cd}回合</span>` : '';
    return `<div class="skill-btn-wrap" id="skillWrap${i}">
      <div class="skill-card ${ready?'':'disabled'}">
        <div class="skill-main" ${ready?`onclick="pickSkill(${i})"`:''}>
          <div class="skill-header">${icon} ${s.name}${hitsLabel}${cdStr}</div>
          <div class="skill-body-brief" id="skillBrief${i}">${brief}${cdLine?'<br>'+cdLine:''}</div>
          <div class="skill-body-detail" id="skillDetail${i}" style="display:none">${detail}</div>
        </div>
        <div class="skill-toggle">
          <span class="skill-toggle-btn" id="skillToggle${i}" onclick="toggleSkillDetail(event,${i})">详细 ▾</span>
        </div>
      </div>
    </div>`;
  }).join('');

  // Combo skill buttons (temporarily disabled — see action.js _COMBO_SKILLS_DISABLED)
  if (typeof COMBO_SKILLS !== 'undefined' && typeof _COMBO_SKILLS_DISABLED !== 'undefined' && !_COMBO_SKILLS_DISABLED) {
    const team = f.side === 'left' ? leftTeam : rightTeam;
    const aliveIds = team.filter(t => t.alive).map(t => t.id);
    COMBO_SKILLS.forEach((c, ci) => {
      if (!c.ids.includes(f.id)) return;
      if (!c.ids.every(id => aliveIds.includes(id))) return;
      const partner = team.find(t => t.id === c.ids.find(id => id !== f.id) && t.alive);
      if (!partner) return;
      const partnerActed = actedThisSide.has(allFighters.indexOf(partner));
      const onCd = _comboCdLeft[ci] > 0;
      const canUse = !partnerActed && !onCd;
      box.innerHTML += `<div class="skill-btn-wrap">
        <div class="skill-card combo-card ${canUse ? '' : 'disabled'}" ${canUse ? `onclick="useCombo(${ci})"` : ''}>
          <div class="skill-header" style="color:#ffd93d">🤝 ${c.name}${onCd ? ` <span class="cd-tag">CD${_comboCdLeft[ci]}</span>` : ''}${partnerActed ? ' <span class="cd-tag">搭档已行动</span>' : ''}</div>
          <div class="skill-body-brief">${c.icon} ${f.name} + ${partner.name}：${c.desc}</div>
        </div>
      </div>`;
    });
  }

  document.getElementById('targetSelect').style.display = 'none';
}

function toggleBattleLog() {
  const wrapper = document.getElementById('battleLogWrapper');
  if (!wrapper) return;
  if (window.innerWidth <= 768) {
    const showing = wrapper.classList.toggle('mobile-show');
    // Add close button if not exists
    if (showing && !wrapper.querySelector('.mobile-overlay-close')) {
      const btn = document.createElement('button');
      btn.className = 'btn mobile-overlay-close';
      btn.textContent = '✕ 关闭';
      btn.onclick = () => { wrapper.classList.remove('mobile-show'); };
      wrapper.insertBefore(btn, wrapper.firstChild);
    }
  } else {
    wrapper.classList.toggle('log-open');
  }
}

function toggleDmgStats() {
  const panel = document.getElementById('dmgStatsPanel');
  if (!panel) return;
  if (window.innerWidth <= 768) {
    const showing = panel.classList.toggle('mobile-show');
    panel.style.display = showing ? 'block' : 'none';
  } else {
    // Desktop: floating panel in scene
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }
}

function toggleMobileSkillDetail(e, idx) {
  e.stopPropagation();
  const el = document.getElementById('skillMobileDetail' + idx);
  if (!el) return;
  const wasOpen = el.style.display !== 'none';
  document.querySelectorAll('.skill-mobile-detail').forEach(d => d.style.display = 'none');
  if (!wasOpen) el.style.display = 'block';
}
function toggleMobileSkillBriefDetail(idx) {
  const full = document.getElementById('skillMobileDetail' + idx);
  if (!full) return;
  const card = full.parentElement;
  if (!card) return;
  const brief = card.querySelector('.skill-mobile-brief');
  const toggle = card.querySelector('.fdp-passive-toggle');
  if (!brief || !toggle) return;
  const showing = full.style.display !== 'none';
  brief.style.display = showing ? '' : 'none';
  full.style.display = showing ? 'none' : '';
  toggle.textContent = showing ? '详细 ▾' : '简略 ▴';
}

function buildSkillDetail(s, f) {
  const lines = [];
  const N = v => `<span class="val-normal">${v}</span>`;
  const P = v => `<span class="val-pierce">${v}</span>`;
  const S = v => `<span class="val-shield">${v}</span>`;
  const H = v => `<span class="val-heal">${v}</span>`;
  const B = v => `<span class="val-buff">${v}</span>`;
  const atk = f ? f.atk : '?';
  const def = f ? f.def : '?';
  const maxHp = f ? f.maxHp : '?';

  // ── Type label ──
  const typeMap = {
    physical:'⚔️ 物理', magic:'✨ 魔法', heal:'💚 治疗', shield:'<img src="assets/status/shield-icon.png" style="width:14px;height:14px;vertical-align:middle"> 护盾',
    bubbleShield:'<img src=\"assets/passive/bubble-store-icon.png\" style=\"width:14px;height:14px;vertical-align:middle\"> 泡泡盾', bubbleBind:'<img src=\"assets/passive/bubble-store-icon.png\" style=\"width:14px;height:14px;vertical-align:middle\"> 泡泡束缚',
    hunterShot:'🏹 猎人射击', hunterBarrage:'🏹 箭雨', hunterStealth:'🏹 隐蔽',
    ninjaShuriken:'🥷 飞镖', ninjaImpact:'🥷 冲击', ninjaBomb:'🥷 炸弹',
    phoenixBurn:'🔥 灼烧', phoenixShield:'🔥 熔岩盾', phoenixScald:'🔥 烫伤',
    lightningStrike:'⚡ 闪电打击', lightningBuff:'⚡ 增幅', lightningBarrage:'⚡ 雷暴',
    fortuneDice:'<img src="assets/battle/gold-coin-icon.png" style="width:14px;height:14px;vertical-align:middle"> 骰子', fortuneAllIn:'<img src="assets/battle/gold-coin-icon.png" style="width:14px;height:14px;vertical-align:middle"> 梭哈',
    hidingDefend:'<img src="assets/status/shield-icon.png" style="width:14px;height:14px;vertical-align:middle"> 缩头防御', hidingCommand:'🫣 指挥',
    angelBless:'😇 祝福', angelEquality:'⚖️ 平等',
    iceSpike:'❄️ 冰锥', iceFrost:'❄️ 冰霜',
    turtleShieldBash:'<img src="assets/status/shield-icon.png" style="width:14px;height:14px;vertical-align:middle"> 龟盾', basicBarrage:'🐢 打击',
  };
  lines.push(`<b>类型</b> ${typeMap[s.type] || s.type}`);

  // ── Damage formula with computed values ──
  const dmgParts = [];
  let totalComputed = 0;
  if (s.power > 0)  { dmgParts.push(`${s.power}`); totalComputed += s.power * (s.hits||1); }
  if (s.atkScale)   { const v = f?Math.round(atk*s.atkScale):'?'; dmgParts.push(`${s.atkScale}×ATK = ${N(v)}`); totalComputed += (f?v:0); }
  if (s.defScale)   { const v = f?Math.round(def*s.defScale):'?'; dmgParts.push(`${s.defScale}×DEF = ${N(v)}`); totalComputed += (f?v:0); }
  if (s.dmgScale)   { const v = f?Math.round(atk*s.dmgScale):'?'; dmgParts.push(`${s.dmgScale}×ATK = ${N(v)}`); totalComputed += (f?v:0); }
  if (s.hpPct)      dmgParts.push(`${s.hpPct}%目标HP`);
  if (s.arrowScale) { const v = f?Math.round(atk*s.arrowScale):'?'; dmgParts.push(`${s.arrowScale}×ATK = ${P(v+'/段')}`); }
  if (s.minScale && s.maxScale) { const lo = f?Math.round(atk*s.minScale):'?', hi = f?Math.round(atk*s.maxScale):'?'; dmgParts.push(`${N(lo+'~'+hi)}/段`); }
  if (dmgParts.length) {
    const hitsStr = s.hits > 1 ? `，${s.hits}段` : '';
    lines.push(`<b>伤害</b> ${dmgParts.join(' + ')}${hitsStr}`);
  }
  if (s.pierce > 0) lines.push(`<b>真实</b> ${P(s.pierce)} `);

  // ── Target / Range ──
  if (s.aoe)     lines.push(`<b>范围</b> 🎯 全体敌方`);
  if (s.aoeAlly) lines.push(`<b>范围</b> 🎯 全体友方`);

  // ── Cooldown ──
  if (s.cd > 0 && s.cd < 100) lines.push(`<b>冷却</b> ${s.cd}回合`);
  if (s.oneTimeUse) lines.push(`<b>⚠限制</b> <span class="detail-debuff">一场限一次</span>`);

  // ── Heal / Shield (with computed values) ──
  if (s.heal > 0)    lines.push(`<b>回复</b> ${H(s.heal+'HP')}`);
  if (s.healPct)     { const v = f?Math.round(maxHp*s.healPct/100):'?'; lines.push(`<b>回复</b> ${s.healPct}%HP = ${H(v)}`); }
  if (s.shield > 0)  lines.push(`<b>护盾</b> ${S('+'+s.shield)}`);
  if (s.shieldFlat || s.shieldHpPct) {
    let amt = s.shieldFlat || 0;
    const parts = [];
    if (s.shieldFlat) parts.push(`${s.shieldFlat}`);
    if (s.shieldHpPct) { const v = f?Math.round(maxHp*s.shieldHpPct/100):'?'; parts.push(`${s.shieldHpPct}%HP=${v}`); amt += (f?v:0); }
    lines.push(`<b>护盾</b> ${parts.join('+')} = ${S(amt)}`);
  }
  if (s.shieldScale) { const v = f?Math.round(atk*s.shieldScale):'?'; lines.push(`<b>护盾</b> ${s.shieldScale}×ATK = ${S(v)}`); }
  if (s.shieldHpPct && s.type==='hidingDefend') { const v = f?Math.round(maxHp*s.shieldHpPct/100):'?'; lines.push(`<b>护盾</b> ${s.shieldHpPct}%HP = ${S(v)} ${s.shieldDuration}回合`); }

  // ── Debuffs ──
  if (s.dot)     lines.push(`<b>🔥持续伤害</b> ${N(s.dot.dmg+'/回合')} ${s.dot.turns}回合`);
  if (s.atkDown) lines.push(`<b>⬇攻击力</b> <span class="detail-debuff">-${s.atkDown.pct}%</span> ${s.atkDown.turns}回合`);
  if (s.defDown) lines.push(`<b>⬇护甲</b> <span class="detail-debuff">-${s.defDown.pct}%</span> ${s.defDown.turns}回合`);
  if (s.armorBreak) lines.push(`<b>🔨破甲</b> <span class="detail-debuff">-${s.armorBreak.pct}%</span> ${s.armorBreak.turns}回合`);
  if (s.shieldBreak) lines.push(`<b>💥破盾</b> <span class="detail-debuff">${s.shieldBreak}%</span>`);

  // ── Buffs ──
  if (s.hot)      lines.push(`<b>💚持续回复</b> ${H(s.hot.hpPerTurn+'/回合')} ${s.hot.turns}回合`);
  if (s.defUp)    lines.push(`<b>⬆护甲</b> ${B('+'+s.defUp.val)} ${s.defUp.turns}回合`);
  if (s.defUpPct) { const v = f?Math.round(f.baseDef*s.defUpPct.pct/100):'?'; lines.push(`<b>⬆护甲</b> +${s.defUpPct.pct}% = ${B('+'+v)} ${s.defUpPct.turns}回合`); }
  if (s.selfDefUpPct) { const v = f?Math.round(f.baseDef*s.selfDefUpPct.pct/100):'?'; lines.push(`<b>⬆自身防御</b> +${s.selfDefUpPct.pct}% = ${B('+'+v)} ${s.selfDefUpPct.turns}回合`); }
  if (s.atkUpPct) { const v = f?Math.round(f.baseAtk*s.atkUpPct/100):'?'; lines.push(`<b>⬆攻击力</b> +${s.atkUpPct}% = ${B('+'+v)} 全体 ${s.atkUpTurns}回合`); }

  // ── Random ──
  if (s.random) lines.push(`<b><img src="assets/passive/gambler-blood-icon.png" style="width:14px;height:14px;vertical-align:middle">随机</b> 伤害×0.5~1.5倍率`);

  // ── Special mechanics ──
  // Bubble
  if (s.type === 'bubbleShield') {
    const v = f?Math.round(atk*s.atkScale):'?'; const bv = f?Math.round(atk*s.burstScale):'?';
    lines.push(`<b>🫧泡泡盾</b> ${s.atkScale}×ATK = ${S(v)} ${s.duration}回合`);
    lines.push(`<b>💥破碎</b> 到期→敌全体 ${N(bv)}`);
  }
  if (s.type === 'bubbleBind') {
    lines.push(`<b>🫧束缚</b> ${s.duration}回合`);
    lines.push(`<b>效果</b> 每受一段伤害 <span class="val-debuff">护甲/魔抗各-1 或 -2</span>（按等级）`);
  }
  if (s.type === 'hunterShot') {
    lines.push(`<b>猎人本能</b> HP<${s.execThresh}%→${B('+'+s.execCrit+'%暴击')} ${B('+'+s.execCritDmg+'%爆伤')}`);
  }
  if (s.type === 'hunterBarrage') {
    const v = f?Math.round(atk*s.arrowScale):'?';
    lines.push(`<b>分布</b> ${s.hits}根→随机敌方`);
    lines.push(`<b>每根</b> ${s.arrowScale}×ATK = ${P(v+'真实')}`);
  }
  if (s.type === 'hunterStealth') {
    const dv = f?Math.round(atk*s.dmgScale):'?'; const sv = f?Math.round(atk*s.shieldScale):'?';
    lines.push(`<b>伤害</b> ${s.dmgScale}×ATK = ${N(dv)}`);
    lines.push(`<b>💨闪避</b> ${B('+'+s.dodgePct+'%')} ${s.dodgeTurns}回合`);
    lines.push(`<b><img src="assets/status/shield-icon.png" style="width:14px;height:14px;vertical-align:middle">护盾</b> ${s.shieldScale}×ATK = ${S(sv)}`);
  }
  if (s.type === 'ninjaShuriken') {
    const v = f?Math.round(atk*s.atkScale):'?';
    lines.push(`<b>🥷暴击转真实</b> 暴击→全部${P(v+'真实')}（无视护甲和魔抗）`);
  }
  if (s.type === 'ninjaImpact') {
    const v1 = f?Math.round(atk*(s.atkScale||1.2)):'?';
    const v2 = f?Math.round(atk*(s.behindScale||0.8)):'?';
    lines.push(`<b>💥冲击</b> 主目标 ${N(v1+'物理')} + 身后 ${N(v2+'物理')}（如有）`);
  }
  if (s.type === 'ninjaBomb') {
    lines.push(`<b>🔨破甲</b> <span class="detail-debuff">${s.armorBreak.pct}%防御削减</span> ${s.armorBreak.turns}回合`);
  }
  // Phoenix
  if (s.type === 'phoenixBurn') {
    const bv = f?Math.round(atk*s.burnAtkScale):'?';
    lines.push(`<b>🔥灼烧</b> ${s.burnTurns}回合，每回合 ${N(bv)} + ${s.burnHpPct}%目标HP`);
    lines.push(`<b>不叠加</b> 只刷新时间`);
  }
  if (s.type === 'phoenixShield') {
    const sv = f?Math.round(atk*s.shieldScale):'?'; const cv = f?Math.round(atk*s.counterScale):'?';
    lines.push(`<b>🌋熔岩盾</b> ${S(sv+'护盾')} ${s.duration}回合`);
    lines.push(`<b>🔥反击</b> 每段 ${N(cv)}`);
  }
  if (s.type === 'phoenixScald') {
    lines.push(`<b>💥破盾</b> 先破坏${s.shieldBreak}%护盾`);
  }
  if (s.type === 'lightningStrike') {
    lines.push(`<b>⚡溅射</b> ${s.splashPct}%→次目标`);
    lines.push(`<b>⚡电击</b> 每段叠层`);
  }
  if (s.type === 'lightningBuff') {
    const v = f?Math.round(f.baseAtk*s.atkUpPct/100):'?';
    lines.push(`<b>⬆全体</b> ATK +${s.atkUpPct}% = ${B('+'+v)} ${s.atkUpTurns}回合`);
  }
  if (s.type === 'lightningBarrage') {
    const v = f?Math.round(atk*s.arrowScale):'?';
    lines.push(`<b>⚡分布</b> ${s.hits}次→每次 ${N(v)}`);
    lines.push(`<b>⚡电击</b> 每次叠层`);
  }
  if (s.type === 'fortuneDice') {
    const v = f?Math.round(maxHp*s.healPct/100):'?';
    lines.push(`<b><img src="assets/passive/gambler-blood-icon.png" style="width:14px;height:14px;vertical-align:middle"></b> 1~6金币 + ${H(v+'HP')}`);
  }
  if (s.type === 'fortuneAllIn') {
    const pp = f?Math.round(atk*s.perCoinAtkPierce):'?'; const np = f?Math.round(atk*s.perCoinAtkNormal):'?';
    lines.push(`<b><img src="assets/battle/gold-coin-icon.png" style="width:14px;height:14px;vertical-align:middle">梭哈</b> 每币 ${N(np+'普')}+${P(pp+'穿')}`);
    lines.push(`<b>⚠</b> 一场限一次`);
  }
  if (s.type === 'hidingDefend') {
    const v = f?Math.round(maxHp*s.shieldHpPct/100):'?';
    lines.push(`<b><img src="assets/status/shield-icon.png" style="width:14px;height:14px;vertical-align:middle">护盾</b> ${S(v)} ${s.shieldDuration}回合`);
    lines.push(`<b>💚到期</b> 剩余盾×${s.shieldHealPct}%→HP`);
  }
  if (s.type === 'hidingCommand') {
    lines.push(`<b>🫣指挥</b> 命令随从立即释放一个随机可用技能`);
    lines.push(`<b>⚠注意</b> 随从阵亡则无效`);
  }

  // Basic turtle
  if (s.selfAtkUpPct) lines.push(`<b>⬆自身攻击</b> <span class="log-passive">+${s.selfAtkUpPct.pct}%</span> ${s.selfAtkUpPct.turns}回合`);
  if (s.type === 'turtleShieldBash') {
    lines.push(`<b>⚔️伤害</b> ${s.atkScale}×ATK 物理伤害`);
    lines.push(`<b><img src="assets/status/shield-icon.png" style="width:14px;height:14px;vertical-align:middle">护盾</b> 获得造成伤害${s.shieldFromDmgPct}%的永久护盾`);
  }
  if (s.type === 'basicBarrage') {
    lines.push(`<b>🐢分布</b> ${s.hits}段随机命中敌方，共${s.atkScale}×ATK`);
  }

  // Ice turtle
  if (s.type === 'iceSpike') {
    lines.push(`<b>❄️交替</b> 6段物理/真实交替，共${s.totalScale}×ATK`);
    lines.push(`<b>奇数段</b> 物理伤害（受护甲减免）`);
    lines.push(`<b>偶数段</b> <span class="detail-pierce">真实伤害（无视护甲和魔抗）</span>`);
  }
  if (s.type === 'iceFrost') {
    lines.push(`<b>❄️范围</b> 🎯 全体敌方`);
    lines.push(`<b>💜真实</b> <span class="detail-pierce">${s.atkScale}×ATK真实伤害（无视护甲和魔抗）</span>`);
  }
  if (s.shieldAtkScale) {
    lines.push(`<b><img src="assets/status/shield-icon.png" style="width:14px;height:14px;vertical-align:middle">护盾</b> ${s.shieldAtkScale}×ATK`);
  }

  // Angel turtle
  if (s.type === 'angelBless') {
    lines.push(`<b><img src="assets/status/shield-icon.png" style="width:14px;height:14px;vertical-align:middle">护盾</b> ${s.shieldScale}×ATK 持续${s.shieldTurns}回合`);
    lines.push(`<b>⬆护甲</b> +${s.defBoostScale}×ATK ${s.defBoostTurns}回合`);
  }
  if (s.type === 'angelEquality') {
    lines.push(`<b>🔵第一段</b> ${s.normalScale}×ATK 魔法伤害`);
    lines.push(`<b>⚪第二段</b> <span class="detail-pierce">${s.pierceScale}×ATK 真实伤害</span>`);
    lines.push(`<b>⚖️克制</b> 对A级及以上目标：<span class="log-crit">必定暴击</span> + 回复总伤${s.healPctOfDmg}%HP`);
  }

  return lines.map(l => `<div class="detail-line">${l}</div>`).join('');
}

function toggleSkillDetail(e, idx) {
  e.stopPropagation();
  const brief = document.getElementById('skillBrief' + idx);
  const detail = document.getElementById('skillDetail' + idx);
  const toggle = document.getElementById('skillToggle' + idx);
  if (!brief || !detail || !toggle) return;
  const showing = detail.style.display !== 'none';
  if (showing) {
    // Back to brief
    brief.style.display = '';
    detail.style.display = 'none';
    toggle.textContent = '详细 ▾';
  } else {
    // Expand to detail
    brief.style.display = 'none';
    detail.style.display = 'block';
    toggle.textContent = '简略 ▴';
  }
}


// ── DAMAGE STATS PANEL ────────────────────────────────────
function updateDmgStats() {
  const body = document.getElementById('dmgStatsBody');
  if (!body || !allFighters.length || body.classList.contains('ds-hidden')) return;

  const byDealt = [...allFighters].sort((a,b) => b._dmgDealt - a._dmgDealt);
  const byTaken = [...allFighters].sort((a,b) => b._dmgTaken - a._dmgTaken);
  const maxDealt = Math.max(1, ...byDealt.map(f => f._dmgDealt));
  const maxTaken = Math.max(1, ...byTaken.map(f => f._dmgTaken));

  function dmgRow(f, max, isDealt) {
    const total = isDealt ? (f._dmgDealt||0) : (f._dmgTaken||0);
    const phys = isDealt ? (f._physDmgDealt||0) : (f._physDmgTaken||0);
    const magic = isDealt ? (f._magicDmgDealt||0) : (f._magicDmgTaken||0);
    const trueDmg = isDealt ? (f._trueDmgDealt||0) : (f._trueDmgTaken||0);
    const physPct = total > 0 ? phys / max * 100 : 0;
    const magicPct = total > 0 ? magic / max * 100 : 0;
    const truePct = total > 0 ? trueDmg / max * 100 : 0;
    const side = f.side === 'left' ? 'ds-left' : 'ds-right';
    const dead = f.alive ? '' : 'ds-dead';
    return `<div class="ds-row ${side} ${dead}">
      <div class="ds-top"><div class="ds-name">${petIcon(f,16)}${f.name}</div><div class="ds-val">${total}</div></div>
      <div class="ds-bar-wrap">
        <div class="ds-bar ds-bar-normal" style="width:${physPct}%"></div>
        <div class="ds-bar ds-bar-magic" style="width:${magicPct}%;left:${physPct}%"></div>
        <div class="ds-bar ds-bar-true" style="width:${truePct}%;left:${physPct+magicPct}%"></div>
      </div>
    </div>`;
  }

  const playerSide = (gameMode === 'pvp-online') ? onlineSide : 'left';
  const enemySide = playerSide === 'left' ? 'right' : 'left';
  const allyDealt = byDealt.filter(f => f.side === playerSide);
  const enemyDealt = byDealt.filter(f => f.side === enemySide);
  const allyTaken = byTaken.filter(f => f.side === playerSide);
  const enemyTaken = byTaken.filter(f => f.side === enemySide);
  const maxAllyDealt = Math.max(1, ...allyDealt.map(f => f._dmgDealt));
  const maxEnemyDealt = Math.max(1, ...enemyDealt.map(f => f._dmgDealt));
  const maxAllyTaken = Math.max(1, ...allyTaken.map(f => f._dmgTaken));
  const maxEnemyTaken = Math.max(1, ...enemyTaken.map(f => f._dmgTaken));

  const tab = _dmgStatsTab || 'dealt';
  let content = '';
  if (tab === 'dealt') {
    content = `<div class="ds-columns">
      <div class="ds-col"><div class="ds-col-label">我方</div>${allyDealt.map(f => dmgRow(f, maxAllyDealt, true)).join('')}</div>
      <div class="ds-col"><div class="ds-col-label">敌方</div>${enemyDealt.map(f => dmgRow(f, maxEnemyDealt, true)).join('')}</div>
    </div>`;
  } else {
    content = `<div class="ds-columns">
      <div class="ds-col"><div class="ds-col-label">我方</div>${allyTaken.map(f => dmgRow(f, maxAllyTaken, false)).join('')}</div>
      <div class="ds-col"><div class="ds-col-label">敌方</div>${enemyTaken.map(f => dmgRow(f, maxEnemyTaken, false)).join('')}</div>
    </div>`;
  }

  body.innerHTML =
    `<div class="ds-tabs">
      <button class="ds-tab${tab==='dealt'?' active':''}" onclick="switchDmgTab('dealt')">⚔ 造成伤害</button>
      <button class="ds-tab${tab==='taken'?' active':''}" onclick="switchDmgTab('taken')">🛡 承受伤害</button>
    </div>` + content;
}

let _dmgStatsTab = 'dealt';
function switchDmgTab(tab) {
  _dmgStatsTab = tab;
  updateDmgStats();
}

function _toggleDmgStatsDesktop() {
  const body = document.getElementById('dmgStatsBody');
  const toggle = document.querySelector('.dmg-toggle');
  if (!body || !toggle) return;
  const hidden = body.classList.toggle('ds-hidden');
  toggle.textContent = hidden ? '▶' : '▼';
  if (!hidden) updateDmgStats();
}

// ── PASSIVE POPUP ─────────────────────────────────────────
function showPassivePopup(e, fIdx) {
  e.stopPropagation();
  const f = allFighters[fIdx];
  if (!f || !f.passive) return;
  const popup = document.getElementById('passivePopup');
  const iconRaw = PASSIVE_ICONS[f.passive.type] || '⭐';
  const iconHtml = iconRaw.endsWith('.png') ? `<img src="assets/${iconRaw}" class="passive-popup-icon">` : iconRaw;
  // Render passive desc — use descMelee if in melee form
  let descText = f.passive.desc;
  if (f._twoHeadForm === 'melee' && f.passive.descMelee) descText = f.passive.descMelee;
  if (f._lavaTransformed && f.passive.descVolcano) descText = f.passive.descVolcano;
  const descRendered = renderSkillTemplate(descText, f, f.passive);
  // Brief/detail support for passives
  let briefText = f.passive.brief ? renderSkillTemplate(f.passive.brief, f, f.passive) : null;
  const passiveName = f.passive.name || '被动';
  // Chest turtle dynamic passive display
  if (f.passive.type === 'chestTreasure') {
    const treasure = f._chestTreasure || 0;
    const tier = f._chestTier || 0;
    const th = f.passive.thresholds;
    const nextThresh = tier < th.length ? th[tier] : null;
    const poolNames = ['基础池','基础池','进阶池','进阶池','传说池'];
    let briefLines = `宝箱龟将造成伤害的100%充能为财宝进度，根据进度获得基础，进阶和传说装备。\n当前：<span class="val-atk">${treasure}</span>`;
    if (nextThresh) briefLines += ` / ${nextThresh}（下一件：${poolNames[tier]}装备）`;
    else briefLines += '（已满）';
    briefText = briefLines;
    // Detail: show all equipment pools with owned highlighted
    const owned = (f._chestEquips || []).map(e => e.id);
    const renderPool = (label, pool) => {
      const ownedInPool = pool.filter(eq => owned.includes(eq.id));
      const unownedInPool = pool.filter(eq => !owned.includes(eq.id));
      let html = `<br><b>${label}</b>`;
      for (const eq of ownedInPool) {
        const eIcon = eq.icon.endsWith && eq.icon.endsWith('.png') ? `<img src="assets/${eq.icon}" style="width:14px;height:14px;vertical-align:middle">` : eq.icon;
        html += `<br><span style="color:#c77dff">${eIcon} ${eq.name}：${eq.desc}</span>`;
      }
      for (const eq of unownedInPool) {
        const eIcon = eq.icon.endsWith && eq.icon.endsWith('.png') ? `<img src="assets/${eq.icon}" style="width:14px;height:14px;vertical-align:middle;opacity:.5">` : eq.icon;
        html += `<br><span style="color:var(--fg2)">${eIcon} ${eq.name}：${eq.desc}</span>`;
      }
      return html;
    };
    const pools = f.passive.pools;
    const thDisplay = th.map((v, i) => i < tier ? `<span class="val-atk">${v}</span>` : `${v}`).join('/');
    let detailHtml = `宝箱龟将造成伤害的100%充能为财宝进度，根据进度 ${thDisplay} 随机获得基础，进阶和传说装备。`;
    detailHtml += `<br>当前：<span class="val-atk">${treasure}</span>`;
    if (nextThresh) detailHtml += ` / ${nextThresh}（下一件：${poolNames[tier]}装备）`;
    else detailHtml += '（已满）';
    detailHtml += `<br>` + renderPool(`基础池（第1-2件）：`, pools[0]);
    detailHtml += `<br>` + renderPool(`进阶池（第3-4件）：`, pools[1]);
    detailHtml += `<br>` + renderPool(`传说池（第5件）：`, pools[2]);
    popup.innerHTML = `<div class="passive-popup-title">${iconHtml} ${f.name} — ${passiveName}</div>
      <div class="passive-popup-brief" id="passiveBrief">${briefText}</div>
      <div class="passive-popup-detail" id="passiveDetail" style="display:none">${detailHtml}</div>
      <span class="passive-detail-toggle" onclick="togglePassiveDetail(event)">详细 ▾</span>`;
  } else if (briefText) {
    popup.innerHTML = `<div class="passive-popup-title">${iconHtml} ${f.name} — ${passiveName}</div>
      <div class="passive-popup-brief" id="passiveBrief">${briefText}</div>
      <div class="passive-popup-detail" id="passiveDetail" style="display:none">${descRendered}</div>
      <span class="passive-detail-toggle" onclick="togglePassiveDetail(event)">详细 ▾</span>`;
  } else {
    popup.innerHTML = `<div class="passive-popup-title">${iconHtml} ${f.name} — ${passiveName}</div><div class="passive-popup-desc">${descRendered}</div>`;
  }
  popup.style.display = 'block';
  if (window.innerWidth <= 768) {
    // Mobile: center on screen (CSS handles via !important)
    popup.style.left = '';
    popup.style.top = '';
  } else {
    // Desktop: position near click
    const x = Math.min(e.clientX, window.innerWidth - 290);
    const y = Math.min(e.clientY + 10, window.innerHeight - 120);
    popup.style.left = x + 'px';
    popup.style.top = y + 'px';
  }
  // Close on next click anywhere
  setTimeout(() => document.addEventListener('click', closePassivePopup, { once: true }), 10);
}
function togglePassiveDetail(e) {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  const brief = document.getElementById('passiveBrief');
  const detail = document.getElementById('passiveDetail');
  const toggle = document.querySelector('.passive-detail-toggle');
  if (!brief || !detail || !toggle) return;
  const showing = detail.style.display !== 'none';
  brief.style.display = showing ? 'block' : 'none';
  detail.style.display = showing ? 'none' : 'block';
  toggle.textContent = showing ? '详细 ▾' : '简略 ▴';
  // Re-register close listener so it doesn't fire from this click
  setTimeout(() => document.addEventListener('click', closePassivePopup, { once: true }), 10);
}
function closePassivePopup() {
  document.getElementById('passivePopup').style.display = 'none';
}

// ── HELP PANEL ────────────────────────────────────────────
function toggleHelp() {
  const el = document.getElementById('helpPanel');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}


