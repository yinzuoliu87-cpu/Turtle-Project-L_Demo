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

// Online (PeerJS)
let onlineRoom = null;
let onlineSide = null;
let onlinePeer = null;   // Peer instance
let onlineConn = null;   // DataConnection to the other player

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
    difficulty = 'normal';
    selecting = 'left';
    selectedIds = [];
    showSelectScreen('选择你的队伍（选2只龟）');
  } else if (mode === 'pvp-online') {
    showScreen('screenLobby');
    document.getElementById('lobbyStatus').textContent = '';
    document.getElementById('roomCodeDisplay').style.display = 'none';
  }
}

// ── ONLINE LOBBY (PeerJS) ─────────────────────────────────
function cleanupPeer() {
  if (onlineConn) { try { onlineConn.close(); } catch(e){} onlineConn = null; }
  if (onlinePeer) { try { onlinePeer.destroy(); } catch(e){} onlinePeer = null; }
}

// PeerJS server config
let PEER_CONFIG = { debug: 1, config: { iceServers: [] } };
let _turnReady = false;

// Fetch TURN credentials from metered.ca (API Key, safe for frontend)
let _turnPromise = (async function loadTurnServers() {
  try {
    const resp = await fetch('https://turtle-battle.metered.live/api/v1/turn/credentials?apiKey=c5ae72e0edb4a6269abe9bfb7257d3ae5917');
    const servers = await resp.json();
    PEER_CONFIG.config.iceServers = servers;
    console.log('TURN servers loaded:', servers.length, servers);
  } catch(e) {
    console.warn('Failed to load TURN servers, using fallback:', e);
    PEER_CONFIG.config.iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    ];
  }
  _turnReady = true;
})();

async function createRoom() {
  if (!_turnReady) {
    document.getElementById('lobbyStatus').textContent = '正在加载TURN服务器…';
    await _turnPromise;
  }
  cleanupPeer();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  onlineRoom = code;
  onlineSide = 'left';
  const peerId = 'turtle-battle-' + code;
  const status = document.getElementById('lobbyStatus');
  status.textContent = '正在连接PeerJS服务器…';

  onlinePeer = new Peer(peerId, PEER_CONFIG);

  const timeout = setTimeout(() => {
    status.textContent = '连接超时，PeerJS服务器可能不可用。请重试。';
  }, 10000);

  onlinePeer.on('open', (id) => {
    clearTimeout(timeout);
    document.getElementById('roomCodeDisplay').style.display = 'flex';
    document.getElementById('roomCodeText').textContent = code;
    status.textContent = '房间已创建！等待对手加入… (房间号: ' + code + ')';
  });
  onlinePeer.on('connection', (conn) => {
    onlineConn = conn;
    setupConn(conn);
    conn.on('open', () => {
      status.textContent = '对手已加入！';
      setTimeout(() => {
        sendOnline({ type:'start' });
        selecting = onlineSide;
        selectedIds = [];
        showSelectScreen('你是左方 — 选择队伍');
      }, 500);
    });
  });
  onlinePeer.on('error', (err) => {
    clearTimeout(timeout);
    console.error('PeerJS error:', err);
    if (err.type === 'unavailable-id') {
      status.textContent = '房间号冲突，请重新创建';
    } else {
      status.textContent = '连接失败：' + err.type + ' (' + (err.message||'') + ')';
    }
  });
}

async function joinRoom() {
  if (!_turnReady) {
    document.getElementById('lobbyStatus').textContent = '正在加载TURN服务器…';
    await _turnPromise;
  }
  cleanupPeer();
  const code = document.getElementById('joinRoomInput').value.trim();
  if (code.length !== 6) { showToast('请输入6位房间号'); return; }
  onlineRoom = code;
  onlineSide = 'right';
  const status = document.getElementById('lobbyStatus');
  status.textContent = '正在连接PeerJS服务器…';

  onlinePeer = new Peer(null, PEER_CONFIG);

  const timeout = setTimeout(() => {
    status.textContent = '连接PeerJS服务器超时，请检查网络后重试';
  }, 10000);

  onlinePeer.on('open', (myId) => {
    clearTimeout(timeout);
    console.log('Guest peer open, my ID:', myId);
    status.textContent = '正在连接房间 ' + code + ' …';
    const conn = onlinePeer.connect('turtle-battle-' + code, { reliable: true, serialization: 'json' });
    onlineConn = conn;
    setupConn(conn);

    const connTimeout = setTimeout(() => {
      // Check if peer was found but WebRTC failed
      console.log('Connection state:', conn.open, conn.peerConnection?.connectionState);
      status.textContent = '连接超时。可能原因：1)房间不存在 2)双方网络NAT穿透失败。请确认房间号正确且房主在线。';
    }, 12000);

    conn.on('open', () => {
      clearTimeout(connTimeout);
      status.textContent = '已连接！等待房主开始…';
    });
    conn.on('error', (err) => {
      clearTimeout(connTimeout);
      console.error('Connection error:', err);
      status.textContent = '连接房间失败：' + (err.message || err.type || err);
    });
  });
  onlinePeer.on('error', (err) => {
    clearTimeout(timeout);
    console.error('PeerJS error:', err);
    if (err.type === 'peer-unavailable') {
      status.textContent = '房间 ' + code + ' 不存在或已关闭';
    } else if (err.type === 'network') {
      status.textContent = '网络错误，PeerJS服务器可能被防火墙拦截';
    } else {
      status.textContent = '连接失败：' + err.type + ' (' + (err.message||'') + ')';
    }
  });
}

function copyRoomCode() {
  navigator.clipboard.writeText(onlineRoom).then(() => showToast('已复制房间号'));
}

function setupConn(conn) {
  conn.on('data', (msg) => handleOnlineMessage(msg));
  conn.on('close', () => {
    onlineConn = null;
    if (!battleOver) {
      showDisconnectOverlay();
    }
  });
  conn.on('error', (err) => {
    console.error('DataConnection error:', err);
    if (!battleOver) showDisconnectOverlay();
  });
  conn.on('iceStateChanged', (state) => {
    console.log('ICE state:', state);
    if (state === 'disconnected' || state === 'failed') {
      if (!battleOver) showDisconnectOverlay();
    }
  });
}

// Disconnect overlay with retry
function showDisconnectOverlay() {
  if (document.getElementById('disconnectOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'disconnectOverlay';
  overlay.className = 'disconnect-overlay';
  overlay.innerHTML = `
    <div class="disconnect-box">
      <div class="disconnect-icon">📡</div>
      <div class="disconnect-title">连接已断开</div>
      <div class="disconnect-msg">对手可能锁屏或网络中断</div>
      <button class="btn btn-primary" onclick="location.reload()">返回大厅</button>
    </div>`;
  document.body.appendChild(overlay);
  animating = false;
  battleOver = true;
}

function sendOnline(msg) {
  if (onlineConn && onlineConn.open) onlineConn.send(msg);
}

function handleOnlineMessage(msg) {
  switch (msg.type) {
    case 'start':
      selecting = onlineSide;
      selectedIds = [];
      showSelectScreen('你是右方 — 选择队伍');
      break;
    case 'team-ready':
      if (msg.side === 'left')  leftTeam  = msg.team.map(id => createFighter(id,'left'));
      if (msg.side === 'right') rightTeam = msg.team.map(id => createFighter(id,'right'));
      // Only host (left) starts battle — it will generate seed and send it
      if (leftTeam.length === 2 && rightTeam.length === 2 && onlineSide === 'left') startBattle();
      break;
    case 'battle-seed':
      // Guest receives seed from host, now start battle
      startBattle(msg.seed);
      break;
    case 'pick':
      // Host receives guest's action choice → execute it
      if (onlineSide === 'left') executeAction(msg.action);
      break;
    case 'action':
      // Guest receives action from host → execute for animation
      if (onlineSide === 'right') executeAction(msg.action);
      break;
    case 'sync':
      // Guest receives state sync from host → patch state
      if (onlineSide === 'right') applyStateSync(msg.state);
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
        <span><img src="assets/hp-icon.png" class="stat-icon">${p.hp}</span>
        <span><img src="assets/atk-icon.png" class="stat-icon">${p.atk}</span>
        <span><img src="assets/def-icon.png" class="stat-icon">${p.def}</span>
        <span><img src="assets/mr-icon.png" class="stat-icon">${p.mr !== undefined ? p.mr : p.def}</span>
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
    // Only host starts battle (generates seed); guest waits for battle-seed message
    if (leftTeam.length === 2 && rightTeam.length === 2 && onlineSide === 'left') startBattle();
  }
}

function goBackFromSelect() {
  showScreen('screenMenu');
}


let _battleSeed = 0;

function startBattle(seed) {
  allFighters = [...leftTeam, ...rightTeam];
  battleOver = false; turnNum = 1;
  // Seeded random for online sync
  if (gameMode === 'pvp-online') {
    if (!seed) {
      // Host generates seed and sends it
      seed = (Date.now() ^ (Math.random() * 0x7FFFFFFF)) | 0;
      sendOnline({ type:'battle-seed', seed });
    }
    _battleSeed = seed;
    seedBattleRng(seed);
  }
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
    // Pirate barrage: opening bombardment on random enemy
    if (f.passive && f.passive.type === 'pirateBarrage') {
      const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      if (enemies.length) {
        const target = enemies[Math.floor(Math.random() * enemies.length)];
        const dmg = Math.round(f.maxHp * f.passive.bombardPct / 100);
        applyRawDmg(f, target, dmg, true);
        const tElId = getFighterElId(target);
        spawnFloatingNum(tElId, `-${dmg}🏴‍☠️`, 'pierce-dmg', 0, 0);
        updateHpBar(target, tElId);
        addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">🏴‍☠️开局轰击${target.emoji}${target.name}！${dmg}真实伤害</span>`);
      }
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

// ── INIT ──────────────────────────────────────────────────
loadCoins();
updateRecordDisplay();


