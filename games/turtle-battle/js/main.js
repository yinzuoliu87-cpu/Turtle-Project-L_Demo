// ── GAME STATE ────────────────────────────────────────────
let gameMode   = null;   // 'pve' | 'pvp-online'
let difficulty = 'normal';
let turnNum    = 1;
let turnQueue  = [];
let currentIdx = 0;
let leftTeam   = [];
let rightTeam  = [];
let allFighters = [];
let selecting   = 'left';
let selectedIds = [];
let battleOver  = false;
let animating   = false;

// Online
let onlineRoom = null;
let onlineSide = null;
let onlinePeer = null;

// ── SCREENS ───────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── MENU ──────────────────────────────────────────────────
function startMode(mode) {
  gameMode = mode;
  resetBattleState();
  if (mode === 'pve') {
    difficulty = 'normal'; // wild encounter — default difficulty
    selecting = 'left';
    selectedIds = [];
    showSelectScreen('选择你的队伍（选2只龟）');
  } else if (mode === 'pvp-online') {
    showScreen('screenLobby');
  }
}

// ── ONLINE LOBBY ──────────────────────────────────────────
function createRoom() {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  onlineRoom = code;
  onlineSide = 'left';
  document.getElementById('roomCodeDisplay').style.display = 'flex';
  document.getElementById('roomCodeText').textContent = code;
  document.getElementById('lobbyStatus').textContent = '等待对手加入…';
  setupOnlineChannel(code);
  sendOnline({ type:'create', room:code });
}

function joinRoom() {
  const code = document.getElementById('joinRoomInput').value.trim();
  if (code.length !== 6) { showToast('请输入6位房间号'); return; }
  onlineRoom = code;
  onlineSide = 'right';
  setupOnlineChannel(code);
  sendOnline({ type:'join', room:code });
  document.getElementById('lobbyStatus').textContent = '正在加入房间…';
}

function copyRoomCode() {
  navigator.clipboard.writeText(onlineRoom).then(() => showToast('已复制房间号'));
}

function setupOnlineChannel(code) {
  onlinePeer = new BroadcastChannel('turtle-battle-' + code);
  onlinePeer.onmessage = e => handleOnlineMessage(e.data);
}
function sendOnline(msg) { if (onlinePeer) onlinePeer.postMessage(msg); }

function handleOnlineMessage(msg) {
  switch (msg.type) {
    case 'join':
      document.getElementById('lobbyStatus').textContent = '对手已加入！';
      setTimeout(() => {
        selecting = onlineSide;
        selectedIds = [];
        showSelectScreen(onlineSide === 'left' ? '你是左方 — 选择队伍' : '你是右方 — 选择队伍');
      }, 500);
      if (onlineSide === 'left') sendOnline({ type:'start' });
      break;
    case 'start':
      selecting = onlineSide;
      selectedIds = [];
      showSelectScreen(onlineSide === 'left' ? '你是左方 — 选择队伍' : '你是右方 — 选择队伍');
      break;
    case 'team-ready':
      if (msg.side === 'left')  leftTeam  = msg.team.map(id => createFighter(id,'left'));
      if (msg.side === 'right') rightTeam = msg.team.map(id => createFighter(id,'right'));
      if (leftTeam.length === 2 && rightTeam.length === 2) startBattle();
      break;
    case 'action':
      executeAction(msg.action);
      break;
  }
}

// ── SELECT SCREEN ─────────────────────────────────────────
function showSelectScreen(title) {
  document.getElementById('selectTitle').textContent = title;
  renderPetGrid();
  updateSlots();
  document.getElementById('btnConfirmTeam').disabled = true;
  showScreen('screenSelect');
}

function renderPetGrid() {
  const grid = document.getElementById('petGrid');
  let owned = null;
  try {
    const ps = JSON.parse(localStorage.getItem('petState'));
    if (ps && ps.pets) owned = ps.pets.filter(p => p.owned).map(p => p.id);
  } catch(e) {}
  const pets = owned ? ALL_PETS.filter(p => owned.includes(p.id)) : ALL_PETS;

  grid.innerHTML = pets.map(p => `
    <div class="pet-card ${selectedIds.includes(p.id)?'selected':''}"
         style="--rc:${RARITY_COLORS[p.rarity]}" data-id="${p.id}"
         onclick="togglePet('${p.id}')">
      <div class="pet-avatar">${buildPetImgHTML(p, 56)}</div>
      <div class="pet-name">${p.name}</div>
      <div class="pet-rarity" style="color:${RARITY_COLORS[p.rarity]}">${p.rarity}</div>
      <div class="pet-stats-mini">
        <span>HP${p.hp}</span><span>ATK${p.atk}</span><span>DEF${p.def}</span>
      </div>
    </div>`).join('');
}

function togglePet(id) {
  const idx = selectedIds.indexOf(id);
  if (idx >= 0) selectedIds.splice(idx,1);
  else { if (selectedIds.length >= 2) return showToast('最多选2只'); selectedIds.push(id); }
  renderPetGrid();
  updateSlots();
  document.getElementById('btnConfirmTeam').disabled = selectedIds.length !== 2;
}

function updateSlots() {
  for (let i = 0; i < 2; i++) {
    const slot = document.getElementById('slot'+i);
    if (selectedIds[i]) {
      const p = ALL_PETS.find(x => x.id === selectedIds[i]);
      slot.innerHTML = `<div class="slot-filled" style="border-color:${RARITY_COLORS[p.rarity]}">
        <div class="slot-avatar">${buildPetImgHTML(p, 40)}</div><span>${p.name}</span></div>`;
    } else {
      slot.innerHTML = `<div class="slot-empty">空位 ${i+1}</div>`;
    }
  }
}

function confirmTeam() {
  if (selectedIds.length !== 2) return;
  if (gameMode === 'pve') {
    leftTeam = selectedIds.map(id => createFighter(id,'left'));
    const pool = ALL_PETS.filter(p => !selectedIds.includes(p.id));
    const shuffled = pool.sort(() => Math.random() - 0.5);
    rightTeam = [createFighter(shuffled[0].id,'right'), createFighter(shuffled[1].id,'right')];
    startBattle();
  } else if (gameMode === 'pvp-online') {
    const side = onlineSide, team = selectedIds.slice();
    if (side === 'left')  leftTeam  = team.map(id => createFighter(id,'left'));
    if (side === 'right') rightTeam = team.map(id => createFighter(id,'right'));
    sendOnline({ type:'team-ready', side, team });
    showToast('等待对手选择…');
    if (leftTeam.length === 2 && rightTeam.length === 2) startBattle();
  }
}

function goBackFromSelect() {
  showScreen('screenMenu');
}


function startBattle() {
  allFighters = [...leftTeam, ...rightTeam];
  battleOver = false; turnNum = 1;
  showScreen('screenBattle');
  // Set team labels
  const ll = document.getElementById('teamLabelLeft');
  const lr = document.getElementById('teamLabelRight');
  if (gameMode === 'pve') { ll.textContent = '我方'; lr.textContent = '野生'; }
  else { ll.textContent = onlineSide==='left'?'我方':'对手'; lr.textContent = onlineSide==='right'?'我方':'对手'; }
  document.getElementById('battleLog').innerHTML = '';
  try { sfxBattleStart(); } catch(e) {}
  // Apply one-time passives (like ninjaInstinct)
  allFighters.forEach(f => {
    if (f.passive && f.passive.type === 'ninjaInstinct') {
      f.crit += f.passive.critBonus / 100;
      f._extraCritDmgPerm = (f.passive.critDmgBonus || 0) / 100;
      f.armorPen += f.passive.armorPen || 0;
    }
    // Two-head vitality: opening shield
    if (f.passive && f.passive.type === 'twoHeadVitality') {
      const shieldAmt = Math.round(f.maxHp * f.passive.shieldPct / 100);
      f.shield += shieldAmt;
      f._twoHeadHalfTriggered = false;
    }
    // Frost aura: debuff all enemies ATK on entry
    if (f.passive && f.passive.type === 'frostAura') {
      const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      for (const e of enemies) {
        e.buffs.push({ type:'atkDown', value:f.passive.atkDownPct, turns:f.passive.atkDownTurns });
      }
      recalcStats();
      addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">❄️冰寒！敌方全体ATK-${f.passive.atkDownPct}% ${f.passive.atkDownTurns}回合</span>`);
    }
    // Summon ally: create a random C/B/A turtle as summon
    if (f.passive && f.passive.type === 'summonAlly') {
      const teamIds = allFighters.map(t => t.id);
      const maxR = f.passive.maxRarity || 'A';
      const validRarities = [];
      if (maxR === 'A') validRarities.push('C','B','A');
      else if (maxR === 'B') validRarities.push('C','B');
      else validRarities.push('C');
      const candidates = ALL_PETS.filter(p => validRarities.includes(p.rarity) && !teamIds.includes(p.id));
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        const m = RARITY_MULT[pick.rarity] || 1;
        const sHp = Math.round(Math.round(pick.hp * m) * f.passive.hpPct / 100);
        const summon = {
          id:pick.id, name:pick.name, emoji:pick.emoji, rarity:pick.rarity, side:f.side,
          img:pick.img, sprite:pick.sprite || null,
          maxHp:sHp, hp:sHp, shield:0,
          baseAtk:Math.round(pick.atk * m), baseDef:Math.round(pick.def * m), baseSpd:Math.round(pick.spd * m),
          atk:Math.round(pick.atk * m), def:Math.round(pick.def * m), spd:Math.round(pick.spd * m),
          crit: pick.crit || 0.08,
          armorPen: 0, armorPenPct: 0,
          passive: pick.passive || null,  // summon passive enabled
          passiveUsedThisTurn: false,
          alive: true,
          buffs: [],
          bubbleStore:0, bubbleShieldVal:0, bubbleShieldTurns:0, bubbleShieldOwner:null,
          _shockStacks:0, _goldCoins:0,
          _dmgDealt:0, _dmgTaken:0, _pierceDmgDealt:0, _normalDmgDealt:0,
          _summon:null, _summonElId:null,
          _isSummon: true,       // mark as summon (not independent fighter)
          _owner: f,             // reference to owner
          skills: pick.skills.map(s => ({ ...s, cdLeft:0 })),
        };
        f._summon = summon;
        // Add summon to allFighters so passives/buffs process correctly
        allFighters.push(summon);
        // Apply one-time passives on summon
        if (summon.passive && summon.passive.type === 'ninjaInstinct') {
          summon.crit += summon.passive.critBonus / 100;
          summon._extraCritDmgPerm = (summon.passive.critDmgBonus || 0) / 100;
          summon.armorPen += summon.passive.armorPen || 0;
        }
        if (summon.passive && summon.passive.type === 'twoHeadVitality') {
          summon.shield += Math.round(summon.maxHp * summon.passive.shieldPct / 100);
          summon._twoHeadHalfTriggered = false;
        }
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">召唤了 ${summon.emoji}${summon.name} 作为随从！(${sHp}HP)</span>`);
      }
    }
  });
  // Snapshot initial stats (BEFORE one-time passives, for UI color comparison)
  // Passives like ninjaInstinct that boost stats should show as green
  // Snapshot was already set in createFighter with raw values
  renderFighters();
  updateDmgStats();
  beginTurn();
}



// ── RESULT ────────────────────────────────────────────────
function showResult(leftWon) {
  let isWin;
  if (gameMode==='pve') isWin = leftWon;
  else if (gameMode==='pvp-online') isWin = (leftWon&&onlineSide==='left')||(!leftWon&&onlineSide==='right');
  else isWin = null;

  const icon = document.getElementById('resultIcon');
  const title = document.getElementById('resultTitle');
  const sub = document.getElementById('resultSub');
  const rewards = document.getElementById('resultRewards');

  if (isWin === null) {
    icon.textContent = leftWon ? '🟢' : '🔴';
    title.textContent = leftWon ? '左方获胜！' : '右方获胜！';
    sub.textContent = `历经 ${turnNum} 回合`;
    rewards.innerHTML = '';
  } else if (isWin) {
    icon.textContent = '🏆';
    title.textContent = '胜利！';
    const coins = 30 + turnNum*2;
    sub.textContent = `历经 ${turnNum} 回合`;
    rewards.innerHTML = `<div class="reward-line">🪙 +${coins} 龟币</div>`;
    addCoins(coins); saveRecord(true);
    try { sfxVictory(); } catch(e) {}
  } else {
    icon.textContent = '💔';
    title.textContent = '失败…';
    sub.textContent = `坚持了 ${turnNum} 回合`;
    rewards.innerHTML = `<div class="reward-line">🪙 +5 龟币</div>`;
    try { sfxDefeat(); } catch(e) {}
    addCoins(5); saveRecord(false);
  }
  showScreen('screenResult');
}

function rematch() {
  if (gameMode==='pvp-online') showScreen('screenLobby');
  else startMode(gameMode);
}

// ── RECORD / COINS ────────────────────────────────────────
function saveRecord(won) {
  const rec = JSON.parse(localStorage.getItem('turtleBattleRecord')||'{"wins":0,"losses":0}');
  if (won) rec.wins++; else rec.losses++;
  localStorage.setItem('turtleBattleRecord', JSON.stringify(rec));
  updateRecordDisplay();
}
function updateRecordDisplay() {
  const rec = JSON.parse(localStorage.getItem('turtleBattleRecord')||'{"wins":0,"losses":0}');
  const total = rec.wins+rec.losses, rate = total ? Math.round(rec.wins/total*100) : 0;
  document.getElementById('recordStats').innerHTML =
    `<span class="rec-w">胜${rec.wins}</span> / <span class="rec-l">负${rec.losses}</span>  胜率${rate}%`;
}
function addCoins(n) {
  try {
    const ps = JSON.parse(localStorage.getItem('petState')||'{}');
    ps.coins = (ps.coins||0)+n;
    localStorage.setItem('petState', JSON.stringify(ps));
    document.getElementById('coinDisplay').textContent = '🪙 ' + ps.coins;
  } catch(e){}
}
function loadCoins() {
  try {
    const ps = JSON.parse(localStorage.getItem('petState')||'{}');
    document.getElementById('coinDisplay').textContent = '🪙 ' + (ps.coins||0);
  } catch(e){}
}


