function renderFighters() {
  leftTeam.forEach((f,i)  => renderFighterCard(f,'leftFighter'+i));
  rightTeam.forEach((f,i) => renderFighterCard(f,'rightFighter'+i));
  // Render summon mini-cards
  allFighters.forEach(f => {
    if (f._summon) renderSummonMiniCard(f);
  });
}

function renderFighterCard(f, elId) {
  const card = document.getElementById(elId);
  if (!card) return;
  const avatarEl = card.querySelector('.fighter-emoji');
  if (f.img) {
    avatarEl.innerHTML = buildPetImgHTML(f, 72);
  } else {
    avatarEl.textContent = f.emoji;
  }
  card.querySelector('.fighter-name').textContent = f.name;
  card.querySelector('.fighter-name').style.color = RARITY_COLORS[f.rarity];
  updateFighterStats(f, elId);
  updateHpBar(f, elId);
  card.classList.toggle('dead', !f.alive);
  renderStatusIcons(f);
}

function renderSummonMiniCard(owner) {
  const summon = owner._summon;
  if (!summon) return;
  const ownerElId = getFighterElId(owner);
  const ownerCard = document.getElementById(ownerElId);
  if (!ownerCard) return;

  // Create a unique ID for the summon card
  const summonElId = 'summon_' + ownerElId;
  summon._summonElId = summonElId;

  // Remove existing summon card if any
  const existing = document.getElementById(summonElId);
  if (existing) existing.remove();

  const mini = document.createElement('div');
  mini.id = summonElId;
  mini.className = 'summon-mini' + (summon.alive ? '' : ' dead');
  const avatarHTML = summon.img
    ? `<img src="${summon.img}" class="summon-avatar" alt="${summon.name}">`
    : `<span class="summon-emoji">${summon.emoji}</span>`;
  mini.innerHTML = `
    <div class="summon-header">
      ${avatarHTML}
      <span class="summon-name" style="color:${RARITY_COLORS[summon.rarity]}">${summon.name}</span>
      <span class="summon-tag">随从</span>
    </div>
    <div class="summon-hp-bar">
      <div class="summon-hp-fill"></div>
      <div class="summon-shield-fill"></div>
    </div>
    <div class="summon-hp-text"></div>
  `;
  ownerCard.appendChild(mini);
  updateSummonHpBar(summon);
}

function updateSummonHpBar(summon) {
  if (!summon || !summon._summonElId) return;
  const card = document.getElementById(summon._summonElId);
  if (!card) return;
  const fill = card.querySelector('.summon-hp-fill');
  const shieldFill = card.querySelector('.summon-shield-fill');
  const text = card.querySelector('.summon-hp-text');
  if (!fill) return;

  const totalEff = summon.hp + summon.shield;
  const barMax = Math.max(summon.maxHp, totalEff);
  const hpPct = summon.hp / barMax * 100;
  fill.style.width = hpPct + '%';
  fill.style.background = (summon.hp/summon.maxHp) > 0.5 ? '#06d6a0' : (summon.hp/summon.maxHp) > 0.25 ? '#ffd93d' : '#ff6b6b';

  if (shieldFill) {
    const sPct = summon.shield / barMax * 100;
    shieldFill.style.left = hpPct + '%';
    shieldFill.style.width = sPct + '%';
  }

  let hpStr = `HP ${Math.ceil(summon.hp)}/${summon.maxHp}`;
  if (summon.shield > 0) hpStr += ` 🛡${Math.ceil(summon.shield)}`;
  if (text) text.textContent = hpStr;

  card.classList.toggle('dead', !summon.alive);
}

const PASSIVE_ICONS = {
  turnScaleAtk:'⚔️', turnScaleHp:'💗', bonusDmgAbove60:'🎯',
  lowHpCrit:'💢', deathExplode:'💥', deathHook:'🪝', shieldOnHit:'🛡',
  healOnKill:'💚', counterAttack:'⚡', bubbleStore:'🫧', stoneWall:'🪨', hunterKill:'🏹', ninjaInstinct:'🥷', phoenixRebirth:'🔥', lightningStorm:'⚡', fortuneGold:'🪙', twoHeadVitality:'🐢', gamblerMultiHit:'🃏', summonAlly:'🫣', cyberDrone:'🛸', judgement:'⚖️', frostAura:'❄️', basicTurtle:'🐢', auraAwaken:'🐚', starEnergy:'⭐', inkMark:'✏️', rainbowPrism:'🌈', ghostCurse:'👻', bambooCharge:'🎋', diamondStructure:'💎', gamblerBlood:'🎲', pirateBarrage:'🏴‍☠️', mechBody:'🤖', candySteal:'🍬'
};

function updateFighterStats(f, elId) {
  if (f._isSummon) return;
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
  const passiveIcon = f.passive ? `<span class="passive-icon" onclick="showPassivePopup(event,${fIdx})">${PASSIVE_ICONS[f.passive.type]||'⭐'}</span>` : '';
  // Preserve detail expand state
  const wasExpanded = document.getElementById('statsDetail'+fIdx)?.style.display === 'flex';

  const ic = (name) => `<img src="assets/${name}" class="stat-icon">`;
  const briefStats =
    `<span class="${sc(f.atk, f._initAtk)}">${ic('atk-icon.png')}攻击力${f.atk}</span>` +
    `<span class="${sc(f.def, f._initDef)}">${ic('def-icon.png')}护甲${f.def}(物伤-${defPct}%)</span>` +
    `<span class="${sc(f.mr||0, f._initMr||0)}">🔮魔抗${f.mr||f.def}(魔伤-${mrPct}%)</span>` +
    passiveIcon +
    `<span class="stats-toggle" onclick="toggleFighterStats(event,${fIdx})">${wasExpanded?'▴':'▾'}</span>`;

  const detailStats =
    `<div class="stats-detail" id="statsDetail${fIdx}" style="display:${wasExpanded?'flex':'none'}">` +
    `<span class="${sc(critPct, Math.round(f._initCrit*100))}">${ic('crit-icon.png')}暴击 ${critPct}%</span>` +
    `<span class="${critDmg > 150 ? 'stat-up' : ''}">${ic('crit-dmg-icon.png')}爆伤 ${critDmg}%${overflowCrit > 0 ? ' (溢出+'+Math.round(overflowCrit*100)+'%)' : ''}</span>` +
    `<span class="${sc(f.armorPen, f._initArmorPen)}">${ic('armor-pen-icon.png')}护甲穿透 ${f.armorPen}</span>` +
    `<span class="${sc(f.magicPen||0, f._initMagicPen||0)}">🔮魔抗穿透 ${f.magicPen||0}</span>` +
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
    return '<img src="' + pet.img + '" alt="' + pet.name + '" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;">';
  }
  return '<span style="font-size:' + Math.round(size * 0.75) + 'px;line-height:1;">' + pet.emoji + '</span>';
}

function updateHpBar(f, elId) {
  // Summon: use dedicated mini-card HP bar
  if (f._isSummon) { updateSummonHpBar(f); return; }
  const card = document.getElementById(elId);
  // Scale bar to fit HP + all shields
  const totalEff = f.hp + f.shield + (f.bubbleShieldVal || 0);
  const barMax = Math.max(f.maxHp, totalEff); // expand bar if shields overflow
  const hpPct = Math.max(0, f.hp / barMax * 100);
  const fill = card.querySelector('.hp-fill');
  fill.style.width = hpPct + '%';
  fill.style.background = (f.hp/f.maxHp) > 0.5 ? '#06d6a0' : (f.hp/f.maxHp) > 0.25 ? '#ffd93d' : '#ff6b6b';

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
  const tickStep = 25;
  for (let v = tickStep; v < barMax; v += tickStep) {
    const pct = v / barMax * 100;
    if (pct >= 99.5) break;
    const isMajor = v % 100 === 0;
    ticksHtml += `<div class="hp-tick${isMajor ? ' hp-tick-major' : ''}" style="left:${pct}%"></div>`;
  }
  tickContainer.innerHTML = ticksHtml;

  // HP + Shield text (two lines)
  const maxHpClass = f.maxHp > f._initHp ? 'stat-up' : '';
  let hpLine = `<div class="hp-line"><img src="assets/hp-icon.png" class="stat-icon"> ${Math.ceil(f.hp)}/<span class="${maxHpClass}">${f.maxHp}</span></div>`;
  const shieldParts = [];
  if (f.shield > 0) shieldParts.push(`<span class="shield-val">🛡${Math.ceil(f.shield)}</span>`);
  if (f.bubbleShieldVal > 0) shieldParts.push(`<span class="bubble-val">🫧${Math.ceil(f.bubbleShieldVal)} <small>${f.bubbleShieldTurns}回合</small></span>`);
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
  const elId = getFighterElId(f);
  const card = document.getElementById(elId);
  if (!card) return;
  const box = card.querySelector('.status-icons');
  if (!box) return;
  // Only debuff icons — passive is now shown in stats row
  box.innerHTML = f.buffs.map(b => {
    if (b.type === 'dot')     return `<span class="status-dot" title="持续伤害${b.value}/回合 剩${b.turns}回合">🔥${b.turns}</span>`;
    if (b.type === 'phoenixBurnDot') return `<span class="status-dot" title="灼烧(${b.value}+${b.hpPct}%HP)/回合 剩${b.turns}回合">🔥${b.turns}</span>`;
    if (b.type === 'atkDown') return `<span class="status-atkdown" title="攻击-${b.value}% 剩${b.turns}回合">⬇攻${b.turns}</span>`;
    if (b.type === 'defDown') return `<span class="status-defdown" title="防御-${b.value}% 剩${b.turns}回合">⬇防${b.turns}</span>`;
    if (b.type === 'hot')     return `<span class="status-hot" title="回复${b.value}/回合 剩${b.turns}回合">💚${b.turns}</span>`;
    if (b.type === 'defUp')   return `<span class="status-defup" title="防御+${b.value} 剩${b.turns}回合">⬆防${b.turns}</span>`;
    if (b.type === 'atkUp')   return `<span class="status-defup" title="攻击+${b.value} 剩${b.turns}回合">⬆攻${b.turns}</span>`;
    if (b.type === 'bubbleBind') return `<span class="status-bubble" title="被束缚：攻击者获得${b.value}%伤害护盾 剩${b.turns}回合">🫧${b.turns}</span>`;
    if (b.type === 'dodge') return `<span class="status-dodge" title="闪避${b.value}% 剩${b.turns}回合">💨${b.turns}</span>`;
    if (b.type === 'fear')  return `<span class="status-atkdown" title="恐惧：对双头龟伤害-${b.value}% 剩${b.turns}回合">😱${b.turns}</span>`;
    if (b.type === 'wormhole') return `<span style="color:#ffa500;background:rgba(255,165,0,.15);padding:1px 5px;border-radius:6px" title="虫洞标记：穿透+${b.pierceBonusPct}% 普伤+${b.normalBonusPct}% 剩${b.turns}回合">🌀${b.turns}</span>`;
    if (b.type === 'gamblerPierceConvert') return `<span class="status-defup" title="${b.value}%伤害转穿透 剩${b.turns}回合">🗡${b.turns}</span>`;
    if (b.type === 'hidingShield') return `<span class="status-defup" title="缩头护盾 剩${b.turns}回合，到期回复剩余盾${b.healPct}%HP">🛡${b.turns}</span>`;
    if (b.type === 'stun') return `<span style="color:#ff0;background:rgba(255,255,0,.2);padding:1px 5px;border-radius:6px" title="眩晕${b.turns}回合">💫${b.turns}</span>`;
    if (b.type === 'diceFateCrit') return `<span style="color:#ff6b6b;background:rgba(255,107,107,.15);padding:1px 5px;border-radius:6px" title="命运骰子+${b.value}%暴击 剩${b.turns}回合">🎲+${b.value}%</span>`;
    return '';
  }).join('');
  // Star energy indicator
  if (f._starEnergy > 0) {
    const maxE = f.passive && f.passive.type === 'starEnergy' ? Math.round(f.maxHp * f.passive.maxChargePct / 100) : 100;
    const full = f._starEnergy >= maxE;
    box.innerHTML += `<span style="color:${full?'#ffd700':'#ffa500'};background:rgba(255,215,0,.15);padding:1px 5px;border-radius:6px" title="星能${Math.round(f._starEnergy)}/${maxE}${full?' 满能！下次攻击爆发！':''}">⭐${Math.round(f._starEnergy)}${full?'💥':''}</span>`;
  }
  // Drone count indicator
  if (f._drones && f._drones.length > 0) {
    const oldest = Math.max(...f._drones.map(d => d.age));
    box.innerHTML += `<span class="status-defup" title="浮游炮${f._drones.length}个，最老${oldest}回合" style="color:#4cc9f0;background:rgba(76,201,240,.15)">🛸${f._drones.length}</span>`;
  }
  // Gold coins indicator
  if (f._goldCoins > 0) {
    box.innerHTML += `<span class="status-defup" title="金币${f._goldCoins}" style="color:#ffd93d;background:rgba(255,217,61,.15)">🪙${f._goldCoins}</span>`;
  }
  // Shock stacks indicator
  if (f._shockStacks > 0) {
    box.innerHTML += `<span class="status-dot" title="电击层${f._shockStacks}/8" style="color:#ffd700;background:rgba(255,215,0,.15)">⚡${f._shockStacks}</span>`;
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
    box.innerHTML += `<span class="bamboo-charge-ready" title="竹编充能：本回合技能后追加强化攻击">🎋充能</span>`;
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
  // Build variable context
  const vars = {
    ATK: f.atk, DEF: f.def, MR: f.mr || f.def, HP: f.maxHp, hits: s.hits || 1,
    power: s.power || 0, pierce: s.pierce || 0, cd: s.cd || 0,
    atkScale: s.atkScale || 0, defScale: s.defScale || 0, dmgScale: s.dmgScale || 0,
    hpPct: s.hpPct || 0, arrowScale: s.arrowScale || 0,
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
    hunterKills: f._hunterKills || 0,
    hunterStolenAtk: f._hunterStolenAtk || 0,
    hunterStolenDef: f._hunterStolenDef || 0,
    hunterStolenHp: f._hunterStolenHp || 0,
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
  result = result.replace(/普通伤害/g, '<span class="val-normal">普通伤害</span>');
  result = result.replace(/穿透伤害/g, '<span class="val-pierce">穿透伤害</span>');
  result = result.replace(/(?<!\">)穿透(?!伤害|<)/g, '<span class="val-pierce">穿透</span>');
  result = result.replace(/(?<!\">)普通(?!伤害|<)/g, '<span class="val-normal">普通</span>');
  result = result.replace(/防御力加成/g, '<span class="val-def">防御力加成</span>');
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
    .replace(/普通伤害/g, '<span class="val-normal">普通伤害</span>')
    .replace(/穿透伤害/g, '<span class="val-pierce">穿透伤害</span>')
    .replace(/(?<!"val-[^"]*">)穿透(?!伤害|<)/g, '<span class="val-pierce">穿透</span>')
    .replace(/(?<!"val-[^"]*">)普通(?!伤害|<)/g, '<span class="val-normal">普通</span>');
}
function buildSkillBrief(f, s) {
  if (s.brief) return renderSkillTemplate(s.brief, f, s);
  return colorDmgKeywords(autoGenerateBrief(f, s));
}
function buildSkillDetailDesc(f, s) {
  if (s.detail) return renderSkillTemplate(s.detail, f, s).replace(/\n/g, '<br>');
  return colorDmgKeywords(autoGenerateDetail(f, s));
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
  if (dmg > 0) parts.push(`${s.hits>1?s.hits+'段共':''}${N(dmg)}普通伤害`);
  if (s.hpPct) parts.push(`+${s.hpPct}%目标HP`);
  if (s.pierce > 0) parts.push(`${P((s.pierce*(s.hits||1))+'穿透')}`);
  // Heal/shield
  if (s.heal > 0) parts.push(`回复${H(s.heal+'HP')}`);
  if (s.shield > 0) parts.push(`${S('+'+s.shield+'护盾')}`);
  if (s.shieldFlat || s.shieldHpPct) { let a = (s.shieldFlat||0); if(s.shieldHpPct) a+=Math.round(f.maxHp*s.shieldHpPct/100); parts.push(`${S('+'+a+'护盾')}`); }
  // Debuffs
  if (s.atkDown) parts.push(`攻击-${s.atkDown.pct}%`);
  if (s.defDown) parts.push(`防御-${s.defDown.pct}%`);
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
  if (dmgParts.length) lines.push(`造成 ${dmgParts.join(' + ')} 普通伤害${s.hits>1?'，'+s.hits+'段':''}`);
  if (s.pierce > 0) lines.push(`额外 ${P(s.pierce+' 穿透')}伤害（无视防御）`);
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
    const hpPct = Math.round(f.hp / f.maxHp * 100);
    const color = RARITY_COLORS[f.rarity] || '#fff';
    return `<button class="picker-btn" onclick="selectTurtleToAct(${fIdx})" style="border-color:${color}">
      <span class="picker-emoji">${f.emoji}</span>
      <span class="picker-name" style="color:${color}">${f.name}</span>
      <span class="picker-hp">HP ${hpPct}%${f.shield > 0 ? ' 🛡' + Math.ceil(f.shield) : ''}</span>
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
  document.querySelectorAll('.fighter-card').forEach(c => c.classList.remove('active-turn'));
  const activeEl = document.getElementById(getFighterElId(f));
  if (activeEl) activeEl.classList.add('active-turn');

  // Mech auto-attack: not player controlled
  if (f._isMech) {
    panel.classList.remove('show');
    setTimeout(() => aiAction(f), 800);
    return;
  }

  const isPlayer =
    (gameMode === 'pve' && f.side === 'left') ||
    (gameMode === 'pvp-online' && f.side === onlineSide);

  if (isPlayer) {
    renderActionButtons(f);
    panel.classList.add('show');
  } else if (gameMode === 'pve') {
    panel.classList.remove('show');
    setTimeout(() => aiAction(f), 1200);
  } else {
    panel.classList.remove('show');
    addLog('等待对手操作…','sys');
  }
}

function renderActionButtons(f) {
  const box = document.getElementById('actionButtons');
  box.innerHTML = f.skills.map((s,i) => {
    const ready = s.cdLeft === 0;
    const iconMap = {physical:'⚔️',magic:'✨',heal:'💚',shield:'🛡',bubbleShield:'🫧',bubbleBind:'🫧',hidingDefend:'🛡',hidingCommand:'🫣'};
    const icon = iconMap[s.type] || '⚔️';
    const hitsLabel = s.hits > 1 ? ` ×${s.hits}` : '';

    const brief = buildSkillBrief(f, s);
    const detail = buildSkillDetailDesc(f, s);
    const cdStr = !ready ? ` <span class="cd-tag">CD${s.cdLeft}</span>` : '';
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
  document.getElementById('targetSelect').style.display = 'none';
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
    physical:'⚔️ 物理', magic:'✨ 魔法', heal:'💚 治疗', shield:'🛡 护盾',
    bubbleShield:'🫧 泡泡盾', bubbleBind:'🫧 泡泡束缚',
    hunterShot:'🏹 猎人射击', hunterBarrage:'🏹 箭雨', hunterStealth:'🏹 隐蔽',
    ninjaShuriken:'🥷 飞镖', ninjaTrap:'🥷 陷阱', ninjaBomb:'🥷 炸弹',
    phoenixBurn:'🔥 灼烧', phoenixShield:'🔥 熔岩盾', phoenixScald:'🔥 烫伤',
    lightningStrike:'⚡ 闪电打击', lightningBuff:'⚡ 增幅', lightningBarrage:'⚡ 雷暴',
    fortuneDice:'🪙 骰子', fortuneAllIn:'🪙 梭哈',
    hidingDefend:'🛡 缩头防御', hidingCommand:'🫣 指挥',
    angelBless:'😇 祝福', angelEquality:'⚖️ 平等',
    iceSpike:'❄️ 冰锥', iceFrost:'❄️ 冰霜',
    turtleShieldBash:'🛡 龟盾', basicBarrage:'🐢 打击',
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
  if (s.pierce > 0) lines.push(`<b>穿透</b> ${P(s.pierce)} `);

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
  if (s.atkDown) lines.push(`<b>⬇攻击</b> <span class="detail-debuff">-${s.atkDown.pct}%</span> ${s.atkDown.turns}回合`);
  if (s.defDown) lines.push(`<b>⬇防御</b> <span class="detail-debuff">-${s.defDown.pct}%</span> ${s.defDown.turns}回合`);
  if (s.armorBreak) lines.push(`<b>🔨破甲</b> <span class="detail-debuff">-${s.armorBreak.pct}%</span> ${s.armorBreak.turns}回合`);
  if (s.shieldBreak) lines.push(`<b>💥破盾</b> <span class="detail-debuff">${s.shieldBreak}%</span>`);

  // ── Buffs ──
  if (s.hot)      lines.push(`<b>💚持续回复</b> ${H(s.hot.hpPerTurn+'/回合')} ${s.hot.turns}回合`);
  if (s.defUp)    lines.push(`<b>⬆防御</b> ${B('+'+s.defUp.val)} ${s.defUp.turns}回合`);
  if (s.defUpPct) { const v = f?Math.round(f.baseDef*s.defUpPct.pct/100):'?'; lines.push(`<b>⬆防御</b> +${s.defUpPct.pct}% = ${B('+'+v)} ${s.defUpPct.turns}回合`); }
  if (s.selfDefUpPct) { const v = f?Math.round(f.baseDef*s.selfDefUpPct.pct/100):'?'; lines.push(`<b>⬆自身防御</b> +${s.selfDefUpPct.pct}% = ${B('+'+v)} ${s.selfDefUpPct.turns}回合`); }
  if (s.atkUpPct) { const v = f?Math.round(f.baseAtk*s.atkUpPct/100):'?'; lines.push(`<b>⬆攻击</b> +${s.atkUpPct}% = ${B('+'+v)} 全体 ${s.atkUpTurns}回合`); }

  // ── Random ──
  if (s.random) lines.push(`<b>🎲随机</b> 伤害×0.5~1.5倍率`);

  // ── Special mechanics ──
  // Bubble
  if (s.type === 'bubbleShield') {
    const v = f?Math.round(atk*s.atkScale):'?'; const bv = f?Math.round(atk*s.burstScale):'?';
    lines.push(`<b>🫧泡泡盾</b> ${s.atkScale}×ATK = ${S(v)} ${s.duration}回合`);
    lines.push(`<b>💥破碎</b> 到期→敌全体 ${N(bv)}`);
  }
  if (s.type === 'bubbleBind') {
    lines.push(`<b>🫧束缚</b> ${s.duration}回合`);
    lines.push(`<b>效果</b> 攻击→获得伤害×${s.bindPct}% ${S('永久护盾')}`);
  }
  if (s.type === 'hunterShot') {
    lines.push(`<b>猎人本能</b> HP<${s.execThresh}%→${B('+'+s.execCrit+'%暴击')} ${B('+'+s.execCritDmg+'%爆伤')}`);
  }
  if (s.type === 'hunterBarrage') {
    const v = f?Math.round(atk*s.arrowScale):'?';
    lines.push(`<b>分布</b> ${s.hits}根→随机敌方`);
    lines.push(`<b>每根</b> ${s.arrowScale}×ATK = ${P(v+'穿透')}`);
  }
  if (s.type === 'hunterStealth') {
    const dv = f?Math.round(atk*s.dmgScale):'?'; const sv = f?Math.round(atk*s.shieldScale):'?';
    lines.push(`<b>伤害</b> ${s.dmgScale}×ATK = ${N(dv)}`);
    lines.push(`<b>💨闪避</b> ${B('+'+s.dodgePct+'%')} ${s.dodgeTurns}回合`);
    lines.push(`<b>🛡护盾</b> ${s.shieldScale}×ATK = ${S(sv)}`);
  }
  if (s.type === 'ninjaShuriken') {
    const v = f?Math.round(atk*s.atkScale):'?';
    lines.push(`<b>🥷暴击转穿</b> 暴击→全部${P(v+'穿透')}（无视防御）`);
  }
  if (s.type === 'ninjaTrap') {
    const v = f?Math.round(atk*s.trapScale):'?';
    lines.push(`<b>🪤夹子</b> 隐形→被攻击触发 ${N(v+'伤害')}`);
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
    lines.push(`<b>🎲</b> 1~6金币 + ${H(v+'HP')}`);
  }
  if (s.type === 'fortuneAllIn') {
    const pp = f?Math.round(atk*s.perCoinAtkPierce):'?'; const np = f?Math.round(atk*s.perCoinAtkNormal):'?';
    lines.push(`<b>🪙梭哈</b> 每币 ${N(np+'普')}+${P(pp+'穿')}`);
    lines.push(`<b>⚠</b> 一场限一次`);
  }
  if (s.type === 'hidingDefend') {
    const v = f?Math.round(maxHp*s.shieldHpPct/100):'?';
    lines.push(`<b>🛡护盾</b> ${S(v)} ${s.shieldDuration}回合`);
    lines.push(`<b>💚到期</b> 剩余盾×${s.shieldHealPct}%→HP`);
  }
  if (s.type === 'hidingCommand') {
    lines.push(`<b>🫣指挥</b> 命令随从立即释放一个随机可用技能`);
    lines.push(`<b>⚠注意</b> 随从阵亡则无效`);
  }

  // Basic turtle
  if (s.selfAtkUpPct) lines.push(`<b>⬆自身攻击</b> <span class="log-passive">+${s.selfAtkUpPct.pct}%</span> ${s.selfAtkUpPct.turns}回合`);
  if (s.type === 'turtleShieldBash') {
    lines.push(`<b>⚔️伤害</b> ${s.atkScale}×ATK 普通伤害`);
    lines.push(`<b>🛡护盾</b> 获得造成伤害${s.shieldFromDmgPct}%的永久护盾`);
  }
  if (s.type === 'basicBarrage') {
    lines.push(`<b>🐢分布</b> ${s.hits}段随机命中敌方，共${s.atkScale}×ATK`);
  }

  // Ice turtle
  if (s.type === 'iceSpike') {
    lines.push(`<b>❄️交替</b> 6段普通/穿透交替，共${s.totalScale}×ATK`);
    lines.push(`<b>奇数段</b> 普通伤害（受防御减免）`);
    lines.push(`<b>偶数段</b> <span class="detail-pierce">穿透伤害（无视防御）</span>`);
  }
  if (s.type === 'iceFrost') {
    lines.push(`<b>❄️范围</b> 🎯 全体敌方`);
    lines.push(`<b>💜穿透</b> <span class="detail-pierce">${s.atkScale}×ATK穿透伤害（无视防御）</span>`);
  }
  if (s.shieldAtkScale) {
    lines.push(`<b>🛡护盾</b> ${s.shieldAtkScale}×ATK`);
  }

  // Angel turtle
  if (s.type === 'angelBless') {
    lines.push(`<b>🛡护盾</b> ${s.shieldScale}×ATK 持续${s.shieldTurns}回合`);
    lines.push(`<b>⬆防御</b> +${s.defBoostScale}×ATK ${s.defBoostTurns}回合`);
  }
  if (s.type === 'angelEquality') {
    lines.push(`<b>⚔️第一段</b> ${s.normalScale}×ATK 普通伤害`);
    lines.push(`<b>💜第二段</b> <span class="detail-pierce">${s.pierceScale}×ATK 穿透伤害</span>`);
    lines.push(`<b>⚖️克制</b> 对S/SS级目标：<span class="log-crit">必定暴击</span> + 回复总伤${s.healPctOfDmg}%HP`);
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

  function dealtRow(f, max) {
    const total = f._dmgDealt || 0;
    const normal = f._normalDmgDealt || 0;
    const pierce = f._pierceDmgDealt || 0;
    const normalPct = total > 0 ? normal / max * 100 : 0;
    const piercePct = total > 0 ? pierce / max * 100 : 0;
    const side = f.side === 'left' ? 'ds-left' : 'ds-right';
    const dead = f.alive ? '' : 'ds-dead';
    return `<div class="ds-row ${side} ${dead}">
      <div class="ds-top"><div class="ds-name">${f.emoji}${f.name}</div><div class="ds-val"><span class="ds-normal">${normal}</span>+<span class="ds-pierce">${pierce}</span></div></div>
      <div class="ds-bar-wrap">
        <div class="ds-bar ds-bar-normal" style="width:${normalPct}%"></div>
        <div class="ds-bar ds-bar-pierce" style="width:${piercePct}%;left:${normalPct}%"></div>
      </div>
    </div>`;
  }

  function takenRow(f, max) {
    const val = f._dmgTaken || 0;
    const pct = val / max * 100;
    const side = f.side === 'left' ? 'ds-left' : 'ds-right';
    const dead = f.alive ? '' : 'ds-dead';
    return `<div class="ds-row ${side} ${dead}">
      <div class="ds-top"><div class="ds-name">${f.emoji}${f.name}</div><div class="ds-val">${val}</div></div>
      <div class="ds-bar-wrap"><div class="ds-bar ds-bar-taken" style="width:${pct}%"></div></div>
    </div>`;
  }

  body.innerHTML =
    `<div class="ds-section-title">⚔造成 <span class="ds-legend"><span class="ds-normal">普</span>+<span class="ds-pierce">穿</span></span></div>` +
    byDealt.map(f => dealtRow(f, maxDealt)).join('') +
    `<div class="ds-section-title ds-section-gap">🛡承受</div>` +
    byTaken.map(f => takenRow(f, maxTaken)).join('');
}

function toggleDmgStats() {
  const body = document.getElementById('dmgStatsBody');
  const toggle = document.querySelector('.dmg-toggle');
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
  const icon = PASSIVE_ICONS[f.passive.type] || '⭐';
  // Render passive desc — use descMelee if in melee form
  const descText = (f._twoHeadForm === 'melee' && f.passive.descMelee) ? f.passive.descMelee : f.passive.desc;
  const descRendered = renderSkillTemplate(descText, f, f.passive);
  popup.innerHTML = `<div class="passive-popup-title">${icon} ${f.name} — 被动</div><div class="passive-popup-desc">${descRendered}</div>`;
  popup.style.display = 'block';
  // Position near click
  const x = Math.min(e.clientX, window.innerWidth - 290);
  const y = Math.min(e.clientY + 10, window.innerHeight - 120);
  popup.style.left = x + 'px';
  popup.style.top = y + 'px';
  // Close on next click anywhere
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


