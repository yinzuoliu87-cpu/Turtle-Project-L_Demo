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
  // Auto-switch BGM when returning to menu/lobby/codex from battle
  if (typeof playBgm === 'function' && (id === 'screenMenu' || id === 'screenLobby' || id === 'screenCodex')) {
    playBgm('menu');
  }
}

// ── MENU ──────────────────────────────────────────────────
function startMode(mode) {
  gameMode = mode;
  resetBattleState();
  if (mode === 'pve') {
    difficulty = 'normal';
    selecting = 'left';
    selectedIds = [];
    showSelectScreen('选择你的队伍（选3只龟）');
  } else if (mode === 'boss') {
    difficulty = 'hard';
    selecting = 'left';
    selectedIds = [];
    showSelectScreen('<img src="assets/equip/equip-crown-icon.png" style="width:24px;height:24px;vertical-align:middle"> Boss挑战 — 选择你的队伍（选3只龟）');
  } else if (mode === 'dungeon') {
    difficulty = 'normal';
    selecting = 'left';
    selectedIds = [];
    dungeonState = { stage: 0, maxStage: 5, teamHp: {}, deadIds: [], rewards: 0, buffs: [], battleIds: [], benchIds: [] };
    // 3v3 only — no bench
    FG_SLOT_KEYS = [...FG_SLOT_KEYS_BASE];
    const benchRow = document.getElementById('fgBenchRow');
    if (benchRow) benchRow.style.display = 'none';
    showSelectScreen('🏰 深海闯关 — 选择3只龟挑战5关');
  } else if (mode === 'pvp-online') {
    showScreen('screenLobby');
    document.getElementById('lobbyStatus').textContent = '';
    document.getElementById('roomCodeDisplay').style.display = 'none';
  }
}

function toggleCustomModes() {
  const panel = document.getElementById('customModesPanel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
}

// ── ONLINE LOBBY (PeerJS) ─────────────────────────────────
function cleanupPeer() {
  if (onlineConn) { try { onlineConn.close(); } catch(e){} onlineConn = null; }
  if (onlinePeer) { try { onlinePeer.destroy(); } catch(e){} onlinePeer = null; }
}

// PeerJS server config
let PEER_CONFIG = { debug: 1, config: { iceServers: [] } };
let _turnReady = false;

// Fetch TURN credentials from metered.ca, with multiple fallbacks
let _turnPromise = (async function loadTurnServers() {
  // Try metered.ca API first
  try {
    const resp = await fetch('https://turtle-battle.metered.live/api/v1/turn/credentials?apiKey=c5ae72e0edb4a6269abe9bfb7257d3ae5917');
    if (resp.ok) {
      const servers = await resp.json();
      if (servers && servers.length > 0) {
        PEER_CONFIG.config.iceServers = servers;
        console.log('TURN servers loaded:', servers.length, servers);
        _turnReady = true;
        return;
      }
    }
  } catch(e) {
    console.warn('Metered TURN API failed:', e.message);
  }
  // Fallback: public STUN + multiple free TURN relays for better connectivity
  console.log('Using fallback STUN/TURN servers');
  PEER_CONFIG.config.iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:relay1.expressturn.com:3478', username: 'efDQE6V5R0GFWWMR7M', credential: 'mIjlSYNm3082pVfl' },
  ];
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
  status.textContent = '正在连接信令服务器… (ICE: ' + PEER_CONFIG.config.iceServers.length + '个)';

  const timeout = setTimeout(() => {
    status.innerHTML = '❌ 连接超时。PeerJS服务器可能不可用。<br><button class="btn btn-sm" onclick="createRoom()" style="margin-top:6px">重试</button>';
  }, 15000);

  onlinePeer.on('open', (id) => {
    clearTimeout(timeout);
    document.getElementById('roomCodeDisplay').style.display = 'flex';
    document.getElementById('roomCodeText').textContent = code;
    status.textContent = '✅ 房间已创建！等待对手加入… (房间号: ' + code + ')';
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
  status.textContent = '正在连接信令服务器… (ICE: ' + PEER_CONFIG.config.iceServers.length + '个)';

  const timeout = setTimeout(() => {
    status.innerHTML = '❌ 连接信令服务器超时。<br><button class="btn btn-sm" onclick="joinRoom()" style="margin-top:6px">重试</button>';
  }, 10000);

  onlinePeer.on('open', (myId) => {
    clearTimeout(timeout);
    console.log('Guest peer open, my ID:', myId);
    status.textContent = '✅ 信令已连接，正在查找房间 ' + code + ' …';
    const conn = onlinePeer.connect('turtle-battle-' + code, { reliable: true, serialization: 'json' });
    onlineConn = conn;
    setupConn(conn);

    const connTimeout = setTimeout(() => {
      const pc = conn.peerConnection;
      const iceState = pc ? pc.iceConnectionState : 'unknown';
      status.textContent = '❌ 连接房间超时（15秒）。ICE状态: ' + iceState + '\n可能原因：房间不存在 / 房主已离开 / NAT穿透失败';
    }, 15000);

    conn.on('open', () => {
      clearTimeout(connTimeout);
      status.textContent = '✅ 已连接！等待房主开始…';
    });
    conn.on('error', (err) => {
      clearTimeout(connTimeout);
      console.error('Connection error:', err);
      status.textContent = '❌ 连接房间失败：' + (err.message || err.type || err);
    });
    // Monitor ICE state for debugging
    const iceCheck = setInterval(() => {
      const pc = conn.peerConnection;
      if (pc) {
        status.textContent = '🔄 正在建立连接… ICE: ' + pc.iceConnectionState;
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          clearInterval(iceCheck);
        } else if (pc.iceConnectionState === 'failed') {
          clearInterval(iceCheck);
          clearTimeout(connTimeout);
          status.textContent = '❌ P2P连接失败（ICE failed）。两台设备网络可能无法直连，需要TURN中继服务器。';
        }
      }
    }, 1000);
  });
  onlinePeer.on('error', (err) => {
    clearTimeout(timeout);
    console.error('PeerJS error:', err);
    if (err.type === 'peer-unavailable') {
      status.textContent = '❌ 房间 ' + code + ' 不存在或已关闭。请确认房主在线且房间号正确。';
    } else if (err.type === 'network') {
      status.textContent = '❌ 网络错误。PeerJS信令服务器可能被防火墙拦截。';
    } else {
      status.textContent = '连接失败：' + err.type + ' (' + (err.message||'') + ')';
    }
  });
}

function copyRoomCode() {
  navigator.clipboard.writeText(onlineRoom).then(() => showToast('已复制房间号'));
}

let _reconnectTimer = null;
function setupConn(conn) {
  conn.on('data', (msg) => handleOnlineMessage(msg));
  conn.on('close', () => {
    onlineConn = null;
    if (!battleOver) showDisconnectOverlay();
  });
  conn.on('error', (err) => {
    console.error('DataConnection error:', err);
    if (!battleOver) showDisconnectOverlay();
  });
  conn.on('iceStateChanged', (state) => {
    console.log('ICE state:', state);
    if (state === 'disconnected') {
      // Brief disconnect — wait 8s for recovery before declaring loss
      if (_reconnectTimer) clearTimeout(_reconnectTimer);
      if (!battleOver) {
        showToast('⚠️ 连接不稳定，等待恢复…');
        _reconnectTimer = setTimeout(() => {
          if (!battleOver) showDisconnectOverlay();
        }, 8000);
      }
    } else if (state === 'connected' || state === 'completed') {
      // Recovered
      if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; showToast('✅ 连接已恢复'); }
    } else if (state === 'failed') {
      if (_reconnectTimer) clearTimeout(_reconnectTimer);
      if (!battleOver) showDisconnectOverlay();
    }
  });
}

// Disconnect overlay — opponent left = auto-win
function showDisconnectOverlay() {
  if (document.getElementById('disconnectOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'disconnectOverlay';
  overlay.className = 'disconnect-overlay';
  if (!battleOver) {
    // Opponent disconnected during battle = you win
    overlay.innerHTML = `
      <div class="disconnect-box">
        <div class="disconnect-icon">🏆</div>
        <div class="disconnect-title">对手已退出</div>
        <div class="disconnect-msg">对手断开连接，你获得胜利！</div>
        <button class="btn btn-primary" onclick="document.getElementById('disconnectOverlay').remove(); battleOver=true; showResult(true)">领取奖励</button>
      </div>`;
  } else {
    overlay.innerHTML = `
      <div class="disconnect-box">
        <div class="disconnect-icon">📡</div>
        <div class="disconnect-title">连接已断开</div>
        <div class="disconnect-msg">对战已结束</div>
        <button class="btn btn-primary" onclick="location.reload()">返回大厅</button>
      </div>`;
  }
  document.body.appendChild(overlay);
  animating = false;
  battleOver = true;
}

function sendOnline(msg) {
  if (onlineConn && onlineConn.open) {
    try { onlineConn.send(msg); }
    catch(e) { console.error('sendOnline error:', e); }
  }
}

// Heartbeat: detect silent disconnects
let _heartbeatInterval = null;
let _lastPong = 0;
function startHeartbeat() {
  _lastPong = Date.now();
  if (_heartbeatInterval) clearInterval(_heartbeatInterval);
  _heartbeatInterval = setInterval(() => {
    if (!onlineConn || !onlineConn.open || battleOver) { clearInterval(_heartbeatInterval); return; }
    sendOnline({ type: 'ping' });
    // If no pong for 15s, show warning
    if (Date.now() - _lastPong > 15000 && !battleOver) {
      showToast('⚠️ 对手无响应…');
    }
    if (Date.now() - _lastPong > 30000 && !battleOver) {
      clearInterval(_heartbeatInterval);
      showDisconnectOverlay();
    }
  }, 5000);
}

function handleOnlineMessage(msg) {
  if (msg.type === 'ping') { sendOnline({ type: 'pong' }); return; }
  if (msg.type === 'pong') { _lastPong = Date.now(); return; }
  switch (msg.type) {
    case 'start':
      selecting = onlineSide;
      selectedIds = [];
      showSelectScreen('你是右方 — 选择队伍');
      break;
    case 'team-ready':
      const opLoadouts = msg.loadouts || {};
      const opLevels = msg.levels || {};
      if (msg.side === 'left')  leftTeam  = msg.team.map(id => createFighter(id,'left', opLoadouts[id]||null, opLevels[id]));
      if (msg.side === 'right') rightTeam = msg.team.map(id => createFighter(id,'right', opLoadouts[id]||null, opLevels[id]));
      // Only host (left) starts battle — it will generate seed and send it
      if (leftTeam.length === 3 && rightTeam.length === 3 && onlineSide === 'left') {
      autoAssignPositions(leftTeam); autoAssignPositions(rightTeam); startBattle();
    }
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
      // Guest executes action for animation + turn flow advancement
      // Sync message follows immediately to correct any random differences (crit etc.)
      if (onlineSide === 'right') executeAction(msg.action);
      break;
    case 'sync':
      // Sync kept as fallback — normally seeded random keeps both in sync
      if (onlineSide === 'right') applyStateSync(msg.state);
      break;
    case 'battle-end':
      // Guest receives battle end from host
      if (onlineSide === 'right') {
        battleOver = true;
        unseedBattleRng();
        document.getElementById('actionPanel').classList.remove('show');
        setTimeout(() => showResult(msg.leftWon), 1200);
      }
      break;
  }
}

// ── SELECT SCREEN ─────────────────────────────────────────
const MODE_GUIDES = {
  pve: {
    icon: '🌿',
    title: '普通对战',
    tips: [
      '请选择3只乌龟组成队伍，对战敌方野生乌龟队伍',
      '前排乌龟优先作为被选择目标，只有过了前排才可以选择后排作为目标',
      '先手方首回合只能行动2只龟以平衡先手优势'
    ]
  },
  boss: {
    icon: '👑',
    title: 'Boss挑战',
    tips: [
      '选择3只龟挑战1只超强Boss',
      'Boss每回合行动3次'
    ]
  },
  dungeon: {
    icon: '🏰',
    title: '深海闯关',
    tips: [
      '选择3只上场龟 + 3只替补龟',
      '5层连续闯关，HP不回满，每层通关可选增益并换龟'
    ]
  },
  'pvp-online': {
    icon: '🌐',
    title: '在线对战',
    tips: [
      '与真人玩家实时对战，每回合限时3分钟'
    ]
  }
};

function showSelectScreen(title) {
  _fgSlots = {};
  selectedIds = [];
  _fgSelectedSlot = null;
  // Always hide bench row — all modes are 3v3 with no bench
  FG_SLOT_KEYS = [...FG_SLOT_KEYS_BASE];
  const benchRow = document.getElementById('fgBenchRow');
  if (benchRow) benchRow.style.display = 'none';
  document.getElementById('selectTitle').innerHTML = title;
  // Render mode guide
  const guide = document.getElementById('modeGuide');
  const info = MODE_GUIDES[gameMode];
  if (guide && info) {
    guide.innerHTML = `<div class="guide-header">${info.icon} ${info.title}</div><ul class="guide-tips">${info.tips.map(t => `<li>${t}</li>`).join('')}</ul>`;
    guide.style.display = '';
  } else if (guide) {
    guide.style.display = 'none';
  }
  renderPetGrid();
  renderFgSlots();
  updateConfirmBtn();
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

  grid.innerHTML = pets.map(p => {
    let passiveHtml = '';
    if (p.passive) {
      const iconRaw = PASSIVE_ICONS[p.passive.type] || '⭐';
      const iconH = iconRaw.endsWith('.png') ? `<img src="assets/${iconRaw}" class="stat-icon">` : iconRaw;
      passiveHtml = `<span class="pet-passive-icon" onclick="event.stopPropagation();showPetPassive(event,'${p.id}')">${iconH}</span>`;
    }
    // Skill loadout button (only for turtles with >3 skills)
    let skillBtnHtml = '';
    if (p.skillPool && p.skillPool.length > 3) {
      skillBtnHtml = `<span class="pet-skill-config-btn" onclick="event.stopPropagation();showSkillPickModal('${p.id}', function(){ renderPetGrid(); renderFgSlots(); })" title="配置技能">🎯</span>`;
    }
    // Show equipped skills preview
    const loadout = getSavedLoadout(p.id) || p.defaultSkills || [0,1,2];
    const pool = p.skillPool || p.skills || [];
    const skillNames = loadout.filter(i => i < pool.length).map(i => pool[i].name).join(' / ');
    const _mob = window.innerWidth <= 768;
    return `<div class="pet-card ${selectedIds.includes(p.id)?'selected':''}"
         style="--rc:${RARITY_COLORS[p.rarity]}" data-id="${p.id}"
         ${_mob ? '' : `draggable="true" ondragstart="fgDragStart(event,'${p.id}')" ondragend="fgDragEnd(event)"`}
         onclick="togglePet(event,'${p.id}')">
      <div class="pet-avatar">${buildPetImgHTML(p, _mob ? (p.sprite ? 80 : 60) : 96)}${passiveHtml}${skillBtnHtml}</div>
      <div class="pet-name">${p.name}</div>
      <div class="pet-rarity" style="color:${RARITY_COLORS[p.rarity]}">${p.rarity}</div>
      <span class="pet-level-badge">Lv.${getPetLevel(p.id)}</span>
      <div class="pet-stats-mini">
        <span><img src="assets/stats/hp-icon.png" class="stat-icon">${Math.round(p.hp * getLevelBonus(p.id))}</span>
        <span><img src="assets/stats/atk-icon.png" class="stat-icon">${Math.round(p.atk * getLevelBonus(p.id))}</span>
        <span><img src="assets/stats/def-icon.png" class="stat-icon">${Math.round(p.def * getLevelBonus(p.id))}</span>
        <span><img src="assets/stats/mr-icon.png" class="stat-icon">${Math.round((p.mr !== undefined ? p.mr : p.def) * getLevelBonus(p.id))}</span>
      </div>
    </div>`;
  }).join('');
}

// Formation slots: 6 slots (3 front + 3 back) + 3 bench for dungeon
let _fgSlots = {};
const FG_SLOT_KEYS_BASE = ['front-0','front-1','front-2','back-0','back-1','back-2'];
const FG_SLOT_KEYS_BENCH = ['bench-0','bench-1','bench-2'];
let FG_SLOT_KEYS = [...FG_SLOT_KEYS_BASE]; // updated when mode changes
let _fgDragId = null; // pet id being dragged

function togglePet(e, id) {
  if (e && e.target && e.target.closest('.pet-passive-icon')) return;
  // If already placed in a slot, remove it
  for (const key of FG_SLOT_KEYS) {
    if (_fgSlots[key] === id) {
      delete _fgSlots[key];
      renderFgSlots();
      renderPetGrid();
      updateConfirmBtn();
      return;
    }
  }
  // Check cap
  const maxPets = 3;
  const placed = FG_SLOT_KEYS.filter(k => _fgSlots[k]).length;
  // If there's an active slot, place into it
  if (_fgActiveSlot && !_fgSlots[_fgActiveSlot]) {
    if (placed >= maxPets) { showToast(`已选${maxPets}只`); _fgActiveSlot = null; renderFgSlots(); return; }
    _fgSlots[_fgActiveSlot] = id;
    _fgActiveSlot = null;
    renderFgSlots();
    renderPetGrid();
    updateConfirmBtn();
    return;
  }
  if (placed >= maxPets) { showToast(`已选${maxPets}只，点击龟或格子可移除`); return; }
  // Place in next empty slot
  for (const key of FG_SLOT_KEYS) {
    if (!_fgSlots[key]) {
      _fgSlots[key] = id;
      renderFgSlots();
      renderPetGrid();
      updateConfirmBtn();
      return;
    }
  }
}

let _fgSelectedSlot = null; // for mobile tap-to-swap
let _fgActiveSlot = null; // click slot first, then click turtle to place
function fgSlotClick(key) {
  const isMobile = window.innerWidth <= 768;
  if (isMobile && _fgSlots[key]) {
    if (_fgSelectedSlot === null) {
      // First tap: select this slot
      _fgSelectedSlot = key;
      renderFgSlots(); // highlight selected
      return;
    } else if (_fgSelectedSlot === key) {
      // Tap same slot: deselect and remove turtle
      _fgSelectedSlot = null;
      delete _fgSlots[key];
      renderFgSlots();
      renderPetGrid();
      updateConfirmBtn();
      return;
    } else {
      // Tap different slot: swap
      const tmp = _fgSlots[_fgSelectedSlot];
      _fgSlots[_fgSelectedSlot] = _fgSlots[key];
      _fgSlots[key] = tmp;
      _fgSelectedSlot = null;
      renderFgSlots();
      renderPetGrid();
      updateConfirmBtn();
      return;
    }
  }
  // Also handle: mobile tap empty slot while one is selected → move
  if (isMobile && _fgSelectedSlot && !_fgSlots[key]) {
    _fgSlots[key] = _fgSlots[_fgSelectedSlot];
    delete _fgSlots[_fgSelectedSlot];
    _fgSelectedSlot = null;
    renderFgSlots();
    renderPetGrid();
    updateConfirmBtn();
    return;
  }
  _fgSelectedSlot = null;
  // Click occupied slot: remove turtle
  if (_fgSlots[key]) {
    _fgActiveSlot = null;
    delete _fgSlots[key];
    renderFgSlots();
    renderPetGrid();
    updateConfirmBtn();
    return;
  }
  // Click empty slot: activate it (next turtle click fills it)
  _fgActiveSlot = (_fgActiveSlot === key) ? null : key;
  renderFgSlots();
}

// ── Drag & Drop ──
function fgDragStart(e, id) {
  _fgDragId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  requestAnimationFrame(() => e.target.closest('.pet-card')?.classList.add('dragging'));
}
function fgDragEnd(e) {
  _fgDragId = null;
  document.querySelectorAll('.pet-card.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.fg-slot.drag-over').forEach(el => el.classList.remove('drag-over'));
}
function fgDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}
function fgDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}
function fgDrop(e, key) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const id = _fgDragId || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
  if (!id) return;
  // Find where the dragged turtle currently is
  const oldKey = FG_SLOT_KEYS.find(k => _fgSlots[k] === id);
  const existing = _fgSlots[key];
  if (existing === id) return; // dropped on same slot, no-op
  // Swap: put existing turtle into the dragged turtle's old slot
  if (existing && oldKey) {
    _fgSlots[oldKey] = existing;
  } else if (oldKey) {
    delete _fgSlots[oldKey];
  }
  // Check cap: if dragging from pet grid (no oldKey) and no existing to replace
  if (!oldKey && !existing) {
    const placed = FG_SLOT_KEYS.filter(k => _fgSlots[k]).length;
    if (placed >= 3) { showToast('已选3只，先移除再放置'); return; }
  }
  _fgSlots[key] = id;
  renderFgSlots();
  renderPetGrid();
  updateConfirmBtn();
}

// ── Touch drag for mobile ──
let _touchDragId = null, _touchGhost = null;
let _touchStartX = 0, _touchStartY = 0, _touchMoved = false;
function fgTouchStart(e, id) {
  _touchDragId = id;
  _touchMoved = false;
  const touch = e.touches[0];
  _touchStartX = touch.clientX;
  _touchStartY = touch.clientY;
}
function fgTouchMove(e) {
  if (!_touchDragId) return;
  const touch = e.touches[0];
  const dx = touch.clientX - _touchStartX, dy = touch.clientY - _touchStartY;
  // Only start drag after 10px movement
  if (!_touchMoved && Math.abs(dx) + Math.abs(dy) < 10) return;
  if (!_touchMoved) {
    _touchMoved = true;
    const card = document.querySelector(`.pet-card[data-id="${_touchDragId}"]`);
    if (card) {
      _touchGhost = card.cloneNode(true);
      _touchGhost.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;opacity:.75;width:70px;transform:scale(.85);border-radius:10px;overflow:hidden';
      document.body.appendChild(_touchGhost);
      card.classList.add('dragging');
    }
  }
  e.preventDefault();
  if (_touchGhost) {
    _touchGhost.style.left = (touch.clientX - 35) + 'px';
    _touchGhost.style.top = (touch.clientY - 35) + 'px';
  }
  // Highlight slot under finger
  document.querySelectorAll('.fg-slot.drag-over').forEach(el => el.classList.remove('drag-over'));
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  const slot = el?.closest('.fg-slot');
  if (slot) slot.classList.add('drag-over');
}
function fgTouchEnd(e) {
  if (!_touchDragId) return;
  document.querySelectorAll('.pet-card.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.fg-slot.drag-over').forEach(el => el.classList.remove('drag-over'));
  if (_touchGhost) { _touchGhost.remove(); _touchGhost = null; }
  if (_touchMoved) {
    const touch = e.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const slot = el?.closest('.fg-slot');
    if (slot) {
      const key = slot.id.replace('fgSlot-', '');
      if (FG_SLOT_KEYS.includes(key)) {
        _fgDragId = _touchDragId;
        fgDrop({ preventDefault(){}, currentTarget: slot }, key);
      }
    }
    // Prevent click from firing after drag
    e.preventDefault();
  }
  _touchDragId = null;
  _fgDragId = null;
  _touchMoved = false;
}

function renderFgSlots() {
  const isMobile = window.innerWidth <= 768;
  const isDungeon = gameMode === 'dungeon';
  // Labels stay as-is: 前排/后排/替补 (bench row only visible in dungeon)
  const labels = document.querySelectorAll('.fg-label');
  if (labels.length >= 2) {
    labels[0].textContent = '前排';
    labels[1].textContent = '后排';
  }
  for (const key of FG_SLOT_KEYS) {
    const slot = document.getElementById('fgSlot-' + key);
    if (!slot) continue;
    const petId = _fgSlots[key];
    // Highlight: mobile swap selection or active slot for placement
    slot.classList.toggle('fg-selected', _fgSelectedSlot === key);
    slot.classList.toggle('fg-active', _fgActiveSlot === key);
    if (petId) {
      const p = ALL_PETS.find(x => x.id === petId);
      slot.innerHTML = `<div class="fg-turtle">${buildPetAvatarHTML(p, 40)}<span class="fg-name" style="color:${RARITY_COLORS[p.rarity]}">${p.name}</span></div>`;
      slot.classList.add('filled');
      if (!isMobile) {
        slot.draggable = true;
        slot.ondragstart = (e) => { _fgDragId = petId; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', petId); };
        slot.ondragend = fgDragEnd;
      } else {
        slot.draggable = false;
      }
    } else {
      slot.innerHTML = '<span class="fg-empty">空</span>';
      slot.classList.remove('filled');
      slot.draggable = false;
      slot.ondragstart = null;
      slot.ondragend = null;
    }
  }
  selectedIds = FG_SLOT_KEYS.map(k => _fgSlots[k]).filter(Boolean);
}

function updateConfirmBtn() {
  const placed = FG_SLOT_KEYS.filter(k => _fgSlots[k]).length;
  document.getElementById('btnConfirmTeam').disabled = placed !== 3;
}

// ── SKILL PICK MODAL ──────────────────────────────────────
function showSkillPickChain(petIds, idx, callback) {
  if (idx >= petIds.length) { callback(); return; }
  showSkillPickModal(petIds[idx], () => showSkillPickChain(petIds, idx + 1, callback));
}

function showSkillPickModal(petId, onDone) {
  const pet = ALL_PETS.find(p => p.id === petId);
  if (!pet || !pet.skillPool) { onDone(); return; }
  const pool = pet.skillPool;
  const saved = getSavedLoadout(petId) || pet.defaultSkills || [0,1,2];
  let selected = [...saved];
  if (!selected.includes(0)) selected = [0, ...selected.slice(0, 2)]; // skill 0 always included

  let overlay = document.getElementById('skillPickOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'skillPickOverlay';
    overlay.className = 'skill-pick-overlay';
    document.body.appendChild(overlay);
  }

  function render() {
    const fakeFighter = { atk:pet.atk, def:pet.def, mr:pet.mr||pet.def, maxHp:pet.hp, hp:pet.hp, crit:pet.crit||0.25, buffs:[], passive:pet.passive, _goldCoins:0, _drones:null, _bambooGainedHp:0, _hunterKills:0, _hunterStolenAtk:0, _hunterStolenDef:0, _hunterStolenHp:0, _lifestealPct:0, _stoneDefGained:0 };
    const uniqueCount = pool.length;
    const hasMelee = pet.meleeSkills && pet.meleeSkills.length > 0;
    const hasVolcano = pet.volcanoSkills && pet.volcanoSkills.length > 0;
    const renderCard = (s, i) => {
      const isSel = selected.includes(i);
      const brief = renderSkillTemplate(s.brief || '', fakeFighter, s);
      const cdText = s.cd ? `CD${s.cd}` : '';
      const isPassive = s.passiveSkill ? '<span class="spc-passive-tag">被动</span>' : '';
      // Paired melee skill for two_head
      let pairedHtml = '';
      if (hasMelee && i < pet.meleeSkills.length && !s._isCommon) {
        const ms = pet.meleeSkills[i];
        const mBrief = renderSkillTemplate(ms.brief || '', fakeFighter, ms);
        pairedHtml = `<div class="spc-paired"><span class="spc-paired-label">近战：</span><b>${ms.name}</b> — ${mBrief}</div>`;
      }
      // Paired volcano skill for lava turtle
      if (hasVolcano && i < pet.volcanoSkills.length && !s.passiveSkill) {
        const vs = pet.volcanoSkills[i];
        if (vs && !vs.passiveSkill) {
          const vBrief = renderSkillTemplate(vs.brief || '', fakeFighter, vs);
          pairedHtml += `<div class="spc-paired"><span class="spc-paired-label" style="color:#ff6600">火山：</span><b>${vs.name}</b> — ${vBrief}</div>`;
        }
      }
      const isFixed = i === 0;
      const unlockedIdxs = getAvailableSkillIndices(petId);
      const isLevelLocked = !unlockedIdxs.includes(i);
      const lockLabel = isLevelLocked ? (i === 3 ? '<span class="spc-lock-tag">Lv.4 解锁</span>' : '<span class="spc-lock-tag">Lv.7 解锁</span>') : '';
      const isConflicted = !isSel && s.conflictsWith !== undefined && selected.includes(s.conflictsWith);
      const conflictLabel = isConflicted ? `<span style="color:#ff6b6b;font-size:10px">（与「${pool[s.conflictsWith].name}」互斥）</span>` : '';
      return `<div class="skill-pick-card ${isSel ? 'selected' : ''} ${isFixed ? 'spc-fixed' : ''} ${isLevelLocked ? 'spc-locked' : ''} ${!isSel && !isFixed && !isLevelLocked && selected.length >= 3 ? 'locked' : ''}" onclick="${isLevelLocked ? '' : `window._skillPickToggle(${i})`}">
        <div class="spc-header"><b>${s.name}</b> ${isFixed ? '<span class="spc-fixed-tag">基础</span>' : ''} ${isPassive} ${lockLabel} ${cdText ? `<span class="spc-cd">${cdText}</span>` : ''}${hasMelee && !s._isCommon ? ' <span class="spc-paired-label">远程</span>' : ''}</div>
        <div class="spc-brief">${brief}</div>
        ${conflictLabel}
        ${pairedHtml}
        ${isSel ? '<div class="spc-check">✓</div>' : ''}
      </div>`;
    };
    overlay.innerHTML = `
      <div class="skill-pick-box">
        <div class="skill-pick-title">${buildPetImgHTML(pet, 32)} ${pet.name} — 技能装配 <span class="skill-pick-count">(${selected.length}/3)</span></div>
        <div style="font-size:11px;color:var(--fg2);margin-bottom:8px">基础攻击技能固定，从剩余技能中选择2个</div>
        <div class="skill-pick-grid">${pool.map((s, i) => renderCard(s, i)).join('')}</div>
        <div class="skill-pick-actions">
          <button class="btn btn-secondary skill-pick-back" onclick="window._skillPickBack()">← 关闭</button>
          <button class="btn btn-primary skill-pick-confirm" ${selected.length === 3 ? '' : 'disabled'} onclick="window._skillPickConfirm()">确认装配</button>
        </div>
      </div>
    `;
    overlay.style.display = 'flex';
  }

  window._skillPickToggle = (i) => {
    if (i === 0) return; // Skill 0 is basic attack, always equipped
    if (selected.includes(i)) {
      selected = selected.filter(x => x !== i);
    } else if (selected.length < 3) {
      // Check skill conflicts (e.g. 双头龟 融合 vs 切换近战)
      const skill = pool[i];
      if (skill.conflictsWith !== undefined && selected.includes(skill.conflictsWith)) {
        // Remove the conflicting skill first
        selected = selected.filter(x => x !== skill.conflictsWith);
      }
      selected.push(i);
    }
    render();
  };

  window._skillPickConfirm = () => {
    if (selected.length !== 3) return;
    saveLoadout(petId, selected.sort((a,b) => a-b));
    overlay.style.display = 'none';
    onDone();
  };

  window._skillPickBack = () => {
    overlay.style.display = 'none';
  };

  render();
}

function showPetPassive(e, petId) {
  e.stopPropagation();
  const p = ALL_PETS.find(x => x.id === petId);
  if (!p || !p.passive) return;
  // Use the same battle popup system
  const iconRaw = PASSIVE_ICONS[p.passive.type] || '⭐';
  const iconHtml = iconRaw.endsWith('.png') ? `<img src="assets/${iconRaw}" class="passive-popup-icon">` : iconRaw;
  const passiveName = p.passive.name || '被动';
  const descText = p.passive.brief || p.passive.desc || '';
  const fakeFighter = { atk:p.atk, def:p.def, mr:p.mr||p.def, maxHp:p.hp, hp:p.hp, crit:p.crit||0.25, buffs:[], _goldCoins:0, _drones:null, _bambooGainedHp:0, _hunterKills:0, _hunterStolenAtk:0, _hunterStolenDef:0, _hunterStolenHp:0, _lifestealPct:0, _stoneDefGained:0, passive:p.passive };
  const rendered = renderSkillTemplate(descText, fakeFighter, p.passive);
  // Use a dedicated select-screen popup to avoid conflicts
  let popup = document.getElementById('selectPassivePopup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'selectPassivePopup';
    popup.className = 'passive-popup';
    document.body.appendChild(popup);
  }
  popup.innerHTML = `<div class="passive-popup-title">${iconHtml} ${p.name} — ${passiveName}</div><div class="passive-popup-desc">${rendered}</div>`;
  if (window.innerWidth <= 768) {
    popup.style.cssText = 'display:block;position:fixed;z-index:9999;left:0;right:0;bottom:0;top:auto;transform:none;max-height:70vh;overflow-y:auto;border-radius:16px 16px 0 0;animation:none;width:100%';
  } else {
    popup.style.cssText = 'display:block;position:fixed;z-index:9999;left:50%;top:40%;transform:translate(-50%,-50%);animation:none';
  }
  // Click outside to close
  setTimeout(() => {
    const close = (ev) => { if (!popup.contains(ev.target)) { popup.style.display = 'none'; document.removeEventListener('click', close, true); } };
    document.addEventListener('click', close, true);
  }, 200);
}

function _buildTeamFromSlots(side, loadoutMap) {
  return FG_SLOT_KEYS.filter(k => _fgSlots[k]).map(k => {
    const petId = _fgSlots[k];
    const idxs = (loadoutMap && loadoutMap[petId]) || getSavedLoadout(petId) || null;
    const f = createFighter(petId, side, idxs);
    f._position = k.startsWith('front') ? 'front' : 'back';
    f._slotKey = k; // e.g. 'front-0', 'back-2'
    return f;
  });
}

function _createAiFighter(petId, side, levelOverride) {
  const idxs = aiPickSkills(petId);
  return createFighter(petId, side, idxs, levelOverride);
}

function _avgLevel(team) {
  if (!team || !team.length) return 1;
  const sum = team.reduce((s, f) => s + (f._level || 1), 0);
  return Math.max(1, Math.min(10, Math.round(sum / team.length)));
}

function confirmTeam() {
  const requiredCount = 3;
  if (selectedIds.length !== requiredCount) return;
  if (gameMode === 'dungeon') {
    // 3v3 dungeon — no bench, all 3 pets go into battle formation
    const battleIds = ['front-0','front-1','front-2','back-0','back-1','back-2'].map(k => _fgSlots[k]).filter(Boolean);
    dungeonState.stage = 1;
    dungeonState.teamIds = [...selectedIds];
    dungeonState.battleIds = battleIds;
    dungeonState.benchIds = [];
    dungeonState.teamHp = {};
    dungeonState.deadIds = [];
    dungeonState.rewards = 0;
    dungeonState.buffs = [];
    dungeonState.carryState = {};
    // Save initial positions from selection grid
    dungeonState.positions = {};
    for (const key of FG_SLOT_KEYS_BASE) {
      const id = _fgSlots[key];
      if (id && battleIds.includes(id)) {
        dungeonState.positions[id] = {
          position: key.startsWith('front') ? 'front' : 'back',
          slotKey: key
        };
      }
    }
    dungeonStartStage();
    return;
  }
  if (gameMode === 'pve') {
    // Skill loadout now configured in pet grid (宠物中心), use saved loadouts directly
    leftTeam = _buildTeamFromSlots('left');
    const pool = ALL_PETS.filter(p => !selectedIds.includes(p.id));
    const shuffled = pool.sort(() => Math.random() - 0.5);
    const avgLv = _avgLevel(leftTeam);
    rightTeam = [_createAiFighter(shuffled[0].id,'right',avgLv), _createAiFighter(shuffled[1].id,'right',avgLv), _createAiFighter(shuffled[2].id,'right',avgLv)];
    autoAssignPositions(rightTeam);
    startBattle();
  } else if (gameMode === 'boss') {
    leftTeam = _buildTeamFromSlots('left');
    const bossPool = ALL_PETS.filter(p => !selectedIds.includes(p.id));
    const bossPet = bossPool[Math.floor(Math.random() * bossPool.length)];
    const boss = _createAiFighter(bossPet.id, 'right', 10);
    boss.maxHp = Math.round(boss.maxHp * 3.5); boss.hp = boss.maxHp;
    boss.baseAtk = Math.round(boss.baseAtk * 1.2); boss.atk = boss.baseAtk;
    boss.baseDef = Math.round(boss.baseDef * 1.4); boss.def = boss.baseDef;
    boss.baseMr = Math.round((boss.baseMr || boss.baseDef) * 1.4); boss.mr = boss.baseMr;
    boss._initHp = boss.maxHp; boss._initAtk = boss.baseAtk; boss._initDef = boss.baseDef; boss._initMr = boss.baseMr;
    boss._isBoss = true;
    boss.name = 'BOSS ' + boss.name;
    rightTeam = [boss];
    boss._position = 'front';
    boss._slotKey = 'front-1';
    startBattle();
  } else if (gameMode === 'pvp-online') {
    const side = onlineSide, team = selectedIds.slice();
    const loadouts = {};
    const levels = {};
    team.forEach(id => { const s = getSavedLoadout(id); if (s) loadouts[id] = s; levels[id] = getPetLevel(id); });
    if (side === 'left')  leftTeam  = _buildTeamFromSlots('left');
    if (side === 'right') rightTeam = _buildTeamFromSlots('right');
    sendOnline({ type:'team-ready', side, team, loadouts, levels });
    showToast('等待对手选择…');
    // Only host starts battle (generates seed); guest waits for battle-seed message
    if (leftTeam.length === 3 && rightTeam.length === 3 && onlineSide === 'left') {
      autoAssignPositions(leftTeam); autoAssignPositions(rightTeam); startBattle();
    }
  }
}

function autoAssignPositions(team) {
  // Boss: always front-1 (center)
  if (team.length === 1 && team[0]._isBoss) {
    team[0]._position = 'front';
    team[0]._slotKey = 'front-1';
    return;
  }
  // Sort by HP descending: A(highest), B, C(lowest)
  // 缩头乌龟 with 强化喊龟: will lose 50% HP at battle start, sort by effective HP
  const effectiveHp = (f) => {
    if (f._passiveSkills && f._passiveSkills.some(p => p.type === 'hidingEnhancedSummon')) {
      return Math.round(f.maxHp * 0.5);
    }
    return f.maxHp;
  };
  const sorted = [...team].sort((a, b) => effectiveHp(b) - effectiveHp(a));
  // Two formations:
  // 1) A front-center, B back-left, C back-right (1 front + 2 back)
  // 2) A front-left, B front-right, C back-center (2 front + 1 back)
  // Pick randomly
  if (Math.random() < 0.5) {
    // Formation 1: tank front, others back
    sorted[0]._position = 'front'; sorted[0]._slotKey = 'front-1';
    sorted[1]._position = 'back';  sorted[1]._slotKey = 'back-0';
    sorted[2]._position = 'back';  sorted[2]._slotKey = 'back-2';
  } else {
    // Formation 2: two front, one back
    sorted[0]._position = 'front'; sorted[0]._slotKey = 'front-0';
    sorted[1]._position = 'front'; sorted[1]._slotKey = 'front-2';
    sorted[2]._position = 'back';  sorted[2]._slotKey = 'back-1';
  }
}

function goBackFromSelect() {
  showScreen('screenMenu');
  // menu BGM already playing, don't restart
}

function confirmSurrender() {
  if (battleOver) return;
  if (!confirm('确定认输？')) return;
  battleOver = true;
  closeFighterDetail();
  clearTurnTimer();
  const playerSide = (gameMode === 'pvp-online') ? onlineSide : 'left';
  const leftWon = playerSide !== 'left';
  addLog(`${playerSide === 'left' ? '我方' : '敌方'}认输！`);
  showResult(leftWon);
}


let _battleSeed = 0;
let _battleRule = null;

// ── BATTLE RULES ─────────────────────────────────────────
const BATTLE_RULES = [
  { id:'fire', icon:'🔥', name:'烈焰之日', desc:'所有伤害附带灼烧（4回合）',
    apply(fighters) { /* handled in triggerOnHitEffects via _battleRule check */ } },
  { id:'thunder', icon:'⚡', name:'雷暴之日', desc:'全体暴击率 +20%',
    apply(fighters) { fighters.forEach(f => { f.crit += 0.2; }); } },
  { id:'shield', icon:'🛡️', name:'铁壁之日', desc:'所有护盾效果 +30%',
    apply(fighters) { /* handled in doShield/applyRawDmg via _battleRule check */ } },
  { id:'rage', icon:'⚔️', name:'狂暴之日', desc:'全体攻击力 +40%，护甲 -20%',
    apply(fighters) { fighters.forEach(f => { f.baseAtk = Math.round(f.baseAtk * 1.4); f.atk = f.baseAtk; f.baseDef = Math.round(f.baseDef * 0.8); f.def = f.baseDef; }); } },
  { id:'equip', icon:'🎁', name:'装备之日', desc:'每3回合双方各选1件装备',
    apply(fighters) { /* handled in beginTurn via _battleRule check */ } },
  { id:'normal', icon:'🎲', name:'正常对局', desc:'无额外规则',
    apply(fighters) { } },
];

function rollBattleRule() {
  const idx = Math.floor(Math.random() * BATTLE_RULES.length);
  return BATTLE_RULES[idx];
}

function showRuleBanner(rule, callback) {
  const banner = document.createElement('div');
  banner.className = 'rule-banner';
  banner.innerHTML = `
    <div class="rule-banner-icon">${rule.icon}</div>
    <div class="rule-banner-name">${rule.name}</div>
    <div class="rule-banner-desc">${rule.desc}</div>
  `;
  document.body.appendChild(banner);
  setTimeout(() => {
    banner.classList.add('rule-banner-show');
    setTimeout(() => {
      banner.classList.remove('rule-banner-show');
      setTimeout(() => { banner.remove(); if (callback) callback(); }, 400);
    }, 2000);
  }, 100);
}

function startBattle(seed) {
  allFighters = [...leftTeam, ...rightTeam];
  battleOver = false; turnNum = 1;
  resetTurnState();
  // Seeded random for online sync
  if (gameMode === 'pvp-online') {
    if (!seed) {
      // Host generates seed and sends it
      seed = (Date.now() ^ (Math.random() * 0x7FFFFFFF)) | 0;
      sendOnline({ type:'battle-seed', seed });
    }
    _battleSeed = seed;
    seedBattleRng(seed);
    startHeartbeat();
  }
  showScreen('screenBattle');
  // Set battle background based on mode
  let bgFile = 'assets/bg/bg-cave-alt.png';
  if (gameMode === 'boss') bgFile = 'assets/bg/bg-cave.png';
  else if (gameMode === 'pvp-online') bgFile = 'assets/bg/bg-shipwreck.png';
  else if (gameMode === 'dungeon') bgFile = dungeonState.stage >= 5 ? 'assets/bg/bg-cave.png' : 'assets/bg/bg-cave-alt.png';
  const battleScene = document.getElementById('battleScene');
  if (battleScene) battleScene.style.backgroundImage = 'url(' + bgFile + ')';
  document.getElementById('screenBattle').style.backgroundImage = 'none';
  // Spawn underwater bubble particles inside scene
  let bubbleContainer = battleScene ? battleScene.querySelector('.battle-bubbles') : null;
  if (battleScene && !bubbleContainer) {
    bubbleContainer = document.createElement('div');
    bubbleContainer.className = 'battle-bubbles';
    battleScene.appendChild(bubbleContainer);
  }
  bubbleContainer.innerHTML = '';
  for (let i = 0; i < 12; i++) {
    const b = document.createElement('div');
    b.className = 'bubble-particle';
    const size = 4 + _origMathRandom() * 10;
    b.style.width = size + 'px';
    b.style.height = size + 'px';
    b.style.left = (_origMathRandom() * 100) + '%';
    b.style.animationDuration = (6 + _origMathRandom() * 8) + 's';
    b.style.animationDelay = (_origMathRandom() * 10) + 's';
    bubbleContainer.appendChild(b);
  }
  // Set team labels
  const ll = document.getElementById('teamLabelLeft');
  const lr = document.getElementById('teamLabelRight');
  if (gameMode === 'pve') { ll.textContent = '我方'; lr.textContent = '野生'; }
  else if (gameMode === 'boss') { ll.textContent = '我方'; lr.innerHTML = '<img src="assets/equip/equip-crown-icon.png" style="width:20px;height:20px;vertical-align:middle"> BOSS'; }
  else if (gameMode === 'dungeon') { ll.textContent = '我方'; lr.textContent = dungeonState.stage >= 5 ? '👑 BOSS' : '第' + dungeonState.stage + '关'; }
  else { ll.textContent = onlineSide==='left'?'我方':'对手'; lr.textContent = onlineSide==='right'?'我方':'对手'; }
  // Boss mode: hide second enemy card
  const rf1 = document.getElementById('rightFighter1');
  if (rf1) rf1.style.display = (gameMode === 'boss') ? 'none' : '';
  document.getElementById('battleLog').innerHTML = '';
  try { sfxBattleStart(); } catch(e) {}
  const isBossStage = gameMode === 'boss' || (gameMode === 'dungeon' && dungeonState.stage >= 5);
  playBgm(isBossStage ? 'boss' : 'battle');
  // Apply passive skills (equipped but not actively used)
  allFighters.forEach(f => { if (typeof applyPassiveSkills === 'function') applyPassiveSkills(f); });
  // Lava enhanced rage: start with full rage
  allFighters.forEach(f => {
    if (f._lavaStartFull && f.passive && f.passive.type === 'lavaRage') {
      f._lavaRage = f.passive.rageMax;
    }
  });
  // Apply one-time passives (like ninjaInstinct)
  allFighters.forEach(f => {
    if (f.passive && f.passive.type === 'ninjaInstinct') {
      f.crit += f.passive.critBonus / 100;
      f._extraCritDmgPerm = (f.passive.critDmgBonus || 0) / 100;
      f.armorPen += f.passive.armorPen || 0;
    }
    if (f.passive && f.passive.type === 'undeadRage') {
      f._lifestealPct = (f._lifestealPct || 0) + (f.passive.lifestealBase || 15);
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
        e.buffs.push({ type:'chilled', turns:f.passive.atkDownTurns || 6 });
      }
      recalcStats();
      addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">❄️冰寒！敌方全体冰寒（ATK-20%）${f.passive.atkDownTurns||6}回合</span>`);
    }
    // Ghost enhanced curse on spawn (passive skill)
    if (f._ghostCurseOnSpawn) {
      const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
      const curseDmgPct = f.passive ? f.passive.hpPct : 9;
      for (const e of enemies) {
        e.buffs.push({ type:'dot', value: Math.round(e.maxHp * curseDmgPct / 100 * (f._ghostCurseDmgMult||1)), turns:3 });
      }
      addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">👻强化怨灵！开场诅咒全体敌人3回合！</span>`);
    }
    // (Pirate barrage moved to after renderFighters for visual effect)
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
          baseAtk:Math.round(pick.atk * m), baseDef:Math.round(pick.def * m), baseMr:Math.round((pick.mr||pick.def) * m), baseSpd:Math.round(pick.spd * m),
          atk:Math.round(pick.atk * m), def:Math.round(pick.def * m), mr:Math.round((pick.mr||pick.def) * m), spd:Math.round(pick.spd * m),
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
          _level: f._level || 1, // follow owner's level
          _owner: f,             // reference to owner
          skills: (pick.skillPool || pick.skills || []).filter(s => !s.passiveSkill).slice(0, 3).map(s => ({ ...s, cdLeft:0 })),
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
        // Summon one-time entry passives
        if (summon.passive && summon.passive.type === 'frostAura') {
          const enemies = (summon.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
          for (const e of enemies) {
            e.buffs.push({ type:'atkDown', value:summon.passive.atkDownPct, turns:summon.passive.atkDownTurns });
          }
          recalcStats();
          addLog(`${summon.emoji}${summon.name}(随从) 被动：<span class="log-passive">❄️冰寒！敌方全体ATK-${summon.passive.atkDownPct}% ${summon.passive.atkDownTurns}回合</span>`);
        }
        // Two-head dual: init form state + meleeSkills
        if (summon.passive && summon.passive.type === 'twoHeadDual') {
          summon._twoHeadForm = 'ranged';
          const petDef = ALL_PETS.find(p => p.id === summon.id);
          if (petDef && petDef.meleeSkills) {
            summon._rangedSkills = summon.skills.map(s => ({...s}));
            summon._meleeSkills = petDef.meleeSkills.map(s => ({...s, cdLeft:0}));
          }
        }
      }
    }
  });
  // Snapshot initial stats (BEFORE one-time passives, for UI color comparison)
  // Passives like ninjaInstinct that boost stats should show as green
  // Snapshot was already set in createFighter with raw values
  // Roll and apply battle rule (not in dungeon mode)
  if (gameMode === 'dungeon') {
    _battleRule = { id:'normal', icon:'🎲', name:'正常对局', desc:'无额外规则', apply(){} };
  } else {
    _battleRule = rollBattleRule();
  }
  if (_battleRule.apply) _battleRule.apply(allFighters);
  recalcStats();

  renderFighters();
  // Re-render after layout settles (flex:1 might not have final size yet)
  setTimeout(() => renderFighters(), 100);
  updateDmgStats();

  // Show rule banner animation then log
  showRuleBanner(_battleRule, () => {
    addLog(`<span style="color:#ffd93d;font-weight:700">${_battleRule.icon} ${_battleRule.name}：${_battleRule.desc}</span>`, 'round-sep');
  });

  // Pirate barrage: opening bombardment (after render so player sees it)
  const pirates = allFighters.filter(f => f.alive && f.passive && f.passive.type === 'pirateBarrage' && f.passive.bombardPct > 0);
  if (pirates.length) {
    setTimeout(async () => {
      for (const f of pirates) {
        const fElId = getFighterElId(f);
        // Show passive trigger on pirate
        spawnFloatingNum(fElId, '<img src="assets/passive/pirate-plunder-icon.png" style="width:24px;height:24px;vertical-align:middle">掠夺！', 'debuff-label', 0, -10);
        await sleep(1000);
        const enemies = (f.side === 'left' ? rightTeam : leftTeam).filter(e => e.alive);
        if (!enemies.length) continue;
        const target = enemies[Math.floor(Math.random() * enemies.length)];
        const dmg = Math.round(f.maxHp * f.passive.bombardPct / 100);
        applyRawDmg(f, target, dmg, true, false, 'true');
        const tElId = getFighterElId(target);
        const tEl = document.getElementById(tElId);
        if (tEl) tEl.classList.add('hit-shake');
        spawnFloatingNum(tElId, `-${dmg}`, 'true-dmg', 0, 0, { atkSide: f.side, amount: dmg });
        updateHpBar(target, tElId);
        await triggerOnHitEffects(f, target, dmg);
        addLog(`${f.emoji}${f.name} 被动「掠夺」：<span class="log-passive">🏴‍☠️开局轰击${target.emoji}${target.name}！${dmg}真实伤害</span>`);
        await sleep(800);
        if (tEl) tEl.classList.remove('hit-shake');
      }
      setTimeout(() => beginTurn(), 1500);
    }, 4000);
  } else {
    beginTurn();
  }
}



// ── RESULT ────────────────────────────────────────────────
function showResult(leftWon) {
  duckBgm(0.3);  // lower volume instead of stopping
  // Dungeon mode: route to dungeon handler
  if (gameMode === 'dungeon') {
    if (leftWon) dungeonOnStageClear();
    else dungeonOnStageFail();
    return;
  }
  let isWin;
  if (gameMode==='pve' || gameMode==='boss') isWin = leftWon;
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
    sub.textContent = `历经 ${turnNum} 回合`;
    // Daily first win bonus
    const today = new Date().toDateString();
    const dailyKey = gameMode === 'boss' ? 'dailyBossWin' : 'dailyPveWin';
    const lastWin = localStorage.getItem(dailyKey);
    const isFirstWin = lastWin !== today;
    let coins = 10 + turnNum;
    let rewardLines = [];
    if (isFirstWin) {
      coins += 50;
      localStorage.setItem(dailyKey, today);
      rewardLines.push(`<div class="reward-line">🪙 +50 龟币 <span style="color:#ffd93d">（每日首胜）</span></div>`);
    }
    if (gameMode === 'pvp-online') {
      coins = 100; // winner takes all (50 entry × 2)
      rewardLines = [`<div class="reward-line">🪙 +100 龟币 <span style="color:#ffd93d">（赢家通吃）</span></div>`];
    } else {
      rewardLines.push(`<div class="reward-line">🪙 +${10 + turnNum} 龟币</div>`);
    }
    rewards.innerHTML = rewardLines.join('');
    addCoins(coins); saveRecord(true);
    try { sfxVictory(); } catch(e) {}
  } else {
    icon.textContent = '💔';
    title.textContent = '失败…';
    sub.textContent = `坚持了 ${turnNum} 回合`;
    if (gameMode === 'pvp-online') {
      rewards.innerHTML = `<div class="reward-line">🪙 -50 龟币 <span style="color:#ff6b6b">（门票费）</span></div>`;
      addCoins(-50);
    } else {
      rewards.innerHTML = `<div class="reward-line">🪙 +5 龟币</div>`;
      addCoins(5);
    }
    try { sfxDefeat(); } catch(e) {}
    saveRecord(false);
  }
  showScreen('screenResult');
}

function rematch() {
  // Don't switch to menu BGM — startBattle will set battle BGM directly
  if (gameMode==='pvp-online') { playBgm('menu'); showScreen('screenLobby'); }
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

// ── CODEX (图鉴) ─────────────────────────────────────────

function showCodex() {
  renderCodexList();
  showScreen('screenCodex');
}

// ════════ BUG REPORT ════════
function showBugReport() {
  const panel = document.getElementById('bugReportPanel');
  if (!panel) return;
  panel.classList.add('show');
  const ta = document.getElementById('bugReportText');
  if (ta) { ta.value = ''; ta.focus(); }
  const res = document.getElementById('bugReportResult');
  if (res) { res.style.display = 'none'; res.textContent = ''; }
}
function hideBugReport() {
  const panel = document.getElementById('bugReportPanel');
  if (panel) panel.classList.remove('show');
}
function submitBugReport() {
  const ta = document.getElementById('bugReportText');
  const userText = (ta && ta.value.trim()) || '(未填写描述)';
  // Collect context
  const ctx = [];
  ctx.push('## Bug 反馈');
  ctx.push('');
  ctx.push('### 描述');
  ctx.push(userText);
  ctx.push('');
  ctx.push('### 上下文');
  ctx.push(`- 模式: ${typeof gameMode !== 'undefined' ? gameMode : 'none'}`);
  ctx.push(`- 难度: ${typeof difficulty !== 'undefined' ? difficulty : 'N/A'}`);
  if (typeof turnNum !== 'undefined') ctx.push(`- 回合: ${turnNum}`);
  if (typeof dungeonState !== 'undefined' && dungeonState && dungeonState.stage) ctx.push(`- 闯关进度: 第${dungeonState.stage}/${dungeonState.maxStage}关`);
  // Teams
  if (typeof leftTeam !== 'undefined' && leftTeam && leftTeam.length) {
    ctx.push('');
    ctx.push('### 我方');
    for (const f of leftTeam) {
      const eq = (f._equips && f._equips.length) ? ` 装备[${f._equips.map(e=>e.name).join(',')}]` : '';
      ctx.push(`- ${f.name} Lv.${f._level||1} (${f._position||'?'}) HP${f.hp}/${f.maxHp} 盾${f.shield} ATK${f.atk} DEF${f.def} MR${f.mr}${f.alive?'':' [已阵亡]'}${eq}`);
      if (f.skills) ctx.push(`  技能: ${f.skills.map(s=>`${s.name}${s.cdLeft>0?`(CD${s.cdLeft})`:''}`).join(' / ')}`);
      if (f.buffs && f.buffs.length) ctx.push(`  buffs: ${f.buffs.map(b=>`${b.type}(${b.value||''}/${b.turns})`).join(', ')}`);
    }
  }
  if (typeof rightTeam !== 'undefined' && rightTeam && rightTeam.length) {
    ctx.push('');
    ctx.push('### 敌方');
    for (const f of rightTeam) {
      ctx.push(`- ${f.name} Lv.${f._level||1} (${f._position||'?'}) HP${f.hp}/${f.maxHp} 盾${f.shield} ATK${f.atk} DEF${f.def} MR${f.mr}${f.alive?'':' [已阵亡]'}`);
    }
  }
  // Last 20 log entries
  const log = document.getElementById('battleLog');
  if (log && log.children.length > 0) {
    const entries = Array.from(log.children).slice(-20).map(e => e.textContent.trim()).filter(Boolean);
    if (entries.length) {
      ctx.push('');
      ctx.push('### 最近日志 (最后20条)');
      entries.forEach(e => ctx.push(`- ${e}`));
    }
  }
  // Browser info
  ctx.push('');
  ctx.push('### 环境');
  ctx.push(`- UA: ${navigator.userAgent}`);
  ctx.push(`- 分辨率: ${window.innerWidth}x${window.innerHeight}`);
  ctx.push(`- 时间: ${new Date().toISOString()}`);

  const report = ctx.join('\n');
  // Save to localStorage (list)
  try {
    const history = JSON.parse(localStorage.getItem('bugReports') || '[]');
    history.push({ ts: Date.now(), text: userText, report });
    // Keep last 30
    if (history.length > 30) history.shift();
    localStorage.setItem('bugReports', JSON.stringify(history));
  } catch(e) {}
  // Copy to clipboard
  const showOK = () => {
    const res = document.getElementById('bugReportResult');
    if (res) { res.textContent = '✅ 已复制到剪贴板！粘贴到对话给我即可'; res.style.display = 'block'; }
    setTimeout(hideBugReport, 2000);
  };
  const showFail = (text) => {
    const res = document.getElementById('bugReportResult');
    if (res) { res.textContent = '❌ 复制失败，请手动复制下方内容：'; res.style.display = 'block'; res.style.color = '#ff6b6b'; }
    if (ta) ta.value = text;
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(report).then(showOK).catch(() => showFail(report));
  } else {
    showFail(report);
  }
}

// ════════ DEBUG PANEL FUNCTIONS ════════
function showDebugPanel() {
  const panel = document.getElementById('debugPanel');
  if (!panel) return;
  panel.classList.add('show');
  debugRefreshInfo();
}
function hideDebugPanel() {
  const panel = document.getElementById('debugPanel');
  if (panel) panel.classList.remove('show');
}
function debugRefreshInfo() {
  const el = document.getElementById('debugInfo');
  if (!el) return;
  let coins = 0;
  try { coins = JSON.parse(localStorage.getItem('petState')||'{}').coins || 0; } catch(e) {}
  const levels = ALL_PETS.map(p => `${p.name}:${getPetLevel(p.id)}`).join(' ');
  const mode = typeof gameMode !== 'undefined' ? gameMode : 'none';
  const inBattle = typeof leftTeam !== 'undefined' && leftTeam && leftTeam.length > 0;
  el.textContent = `龟币: ${coins}\n当前模式: ${mode}\n战斗中: ${inBattle ? '是' : '否'}\n等级: ${levels}`;
}

function debugSetAllLevels(lv) {
  if (lv == null) {
    const input = prompt('把所有龟改到什么等级？(1-10)', '10');
    if (input === null) return;
    lv = Math.max(1, Math.min(10, parseInt(input) || 1));
  }
  for (const p of ALL_PETS) setPetLevel(p.id, lv);
  renderCodexList();
  const currentId = window._codexCurrentPet;
  if (currentId) showCodexDetail(currentId);
  debugRefreshInfo();
  showToast(`全体28只龟已设为 Lv.${lv}`);
}

function debugAddCoins(amount) {
  addCoins(amount);
  debugRefreshInfo();
  showToast(`+${amount} 龟币`);
}

function debugResetProgress() {
  if (!confirm('清空所有等级和龟币？')) return;
  for (const p of ALL_PETS) setPetLevel(p.id, 1);
  try {
    const ps = JSON.parse(localStorage.getItem('petState')||'{}');
    ps.coins = 0;
    localStorage.setItem('petState', JSON.stringify(ps));
  } catch(e) {}
  loadCoins();
  renderCodexList();
  debugRefreshInfo();
  showToast('进度已清空');
}

function debugQuickBattle(mode, diff) {
  hideDebugPanel();
  difficulty = diff || 'normal';
  startMode(mode);
}

function debugJumpToDungeonBoss() {
  hideDebugPanel();
  // Start dungeon and immediately jump to stage 5
  const selected = ALL_PETS.slice(0, 3).map(p => p.id);
  selectedIds = [...selected];
  _fgSlots = { 'front-0': selected[0], 'front-1': selected[1], 'front-2': selected[2] };
  gameMode = 'dungeon';
  dungeonState = {
    stage: 5, maxStage: 5, teamHp: {}, deadIds: [], rewards: 0, buffs: [],
    battleIds: [...selected], benchIds: [],
    teamIds: [...selected], carryState: {}, positions: {}
  };
  for (const [key, id] of Object.entries(_fgSlots)) {
    if (!id) continue;
    dungeonState.positions[id] = { position: key.startsWith('front') ? 'front' : 'back', slotKey: key };
  }
  dungeonStartStage();
}

function debugFullHealAll() {
  if (typeof allFighters === 'undefined' || !allFighters) { showToast('不在战斗中'); return; }
  for (const f of allFighters) {
    if (f.alive) { f.hp = f.maxHp; updateHpBar(f, getFighterElId(f)); }
  }
  showToast('全体满血');
}

function debugKillAllEnemies() {
  if (typeof rightTeam === 'undefined' || !rightTeam) { showToast('不在战斗中'); return; }
  for (const f of rightTeam) {
    if (f.alive) { f.hp = 1; applyRawDmg(null, f, 99999, false, false, 'true'); }
  }
  showToast('敌方残血');
  hideDebugPanel();
}

function debugKillAllAllies() {
  if (typeof leftTeam === 'undefined' || !leftTeam) { showToast('不在战斗中'); return; }
  for (const f of leftTeam) {
    if (f.alive) { f.hp = 1; applyRawDmg(null, f, 99999, false, false, 'true'); }
  }
  showToast('己方残血');
  hideDebugPanel();
}

function debugResetCds() {
  if (typeof allFighters === 'undefined' || !allFighters) { showToast('不在战斗中'); return; }
  for (const f of allFighters) {
    if (f.skills) for (const s of f.skills) s.cdLeft = 0;
  }
  if (typeof renderActionButtons === 'function' && typeof currentActingFighter !== 'undefined' && currentActingFighter) {
    renderActionButtons(currentActingFighter);
  }
  showToast('所有CD重置');
}

function debugExportLog() {
  const log = document.getElementById('battleLog');
  if (!log) { showToast('没有战斗日志'); return; }
  const text = Array.from(log.children).map(e => e.textContent).join('\n');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('战斗日志已复制到剪贴板')).catch(() => showToast('复制失败'));
  } else {
    // Fallback: show in prompt
    prompt('战斗日志（手动复制）:', text);
  }
}

function renderCodexList() {
  const list = document.getElementById('codexList');
  if (!list) return;
  const groups = { C:[], B:[], A:[], S:[], SS:[], SSS:[] };
  ALL_PETS.forEach(p => { if (groups[p.rarity]) groups[p.rarity].push(p); });

  let html = '';
  for (const [rarity, pets] of Object.entries(groups)) {
    if (pets.length === 0) continue;
    html += `<div class="codex-rarity-label" style="color:${RARITY_COLORS[rarity]}">${rarity}级</div>`;
    for (const p of pets) {
      html += `<div class="codex-item" data-id="${p.id}" onclick="showCodexDetail('${p.id}')">
        <div class="codex-item-img">${buildPetImgHTML(p, 36)}</div>
        <div class="codex-item-name" style="color:${RARITY_COLORS[p.rarity]}">${p.name}</div>
      </div>`;
    }
  }
  list.innerHTML = html;
}

function showCodexDetail(petId) {
  const p = ALL_PETS.find(x => x.id === petId);
  if (!p) return;
  window._codexCurrentPet = petId;
  const detail = document.getElementById('codexDetail');
  if (!detail) return;

  // Highlight active item in sidebar
  document.querySelectorAll('.codex-item').forEach(el => el.classList.toggle('active', el.dataset.id === petId));

  const pool = p.skillPool || p.skills || [];
  const defaults = p.defaultSkills || [0,1,2];
  const fakeFighter = { atk:p.atk, def:p.def, mr:p.mr||p.def, maxHp:p.hp, hp:p.hp, crit:p.crit||0.25, buffs:[], passive:p.passive, _goldCoins:0, _drones:null, _bambooGainedHp:0, _hunterKills:0, _hunterStolenAtk:0, _hunterStolenDef:0, _hunterStolenHp:0, _lifestealPct:0, _stoneDefGained:0 };

  // Stats (with level bonus)
  const _lb = getLevelBonus(p.id);
  const statsHtml = `
    <div class="codex-stats">
      <span><img src="assets/stats/hp-icon.png" class="stat-icon">${Math.round(p.hp * _lb)}</span>
      <span><img src="assets/stats/atk-icon.png" class="stat-icon">${Math.round(p.atk * _lb)}</span>
      <span><img src="assets/stats/def-icon.png" class="stat-icon">${Math.round(p.def * _lb)}</span>
      <span><img src="assets/stats/mr-icon.png" class="stat-icon">${Math.round((p.mr !== undefined ? p.mr : p.def) * _lb)}</span>
      <span><img src="assets/stats/crit-icon.png" class="stat-icon">${Math.round((p.crit||0.25)*100)}%</span>
    </div>`;

  // Passive
  let passiveHtml = '';
  if (p.passive) {
    const iconRaw = PASSIVE_ICONS[p.passive.type] || '⭐';
    const iconH = iconRaw.endsWith('.png') ? `<img src="assets/${iconRaw}" style="width:20px;height:20px;vertical-align:middle">` : iconRaw;
    const brief = renderSkillTemplate ? renderSkillTemplate(p.passive.brief || '', fakeFighter, p.passive) : (p.passive.brief || '');
    passiveHtml = `<div class="codex-passive">
      <div class="codex-passive-title">${iconH} ${p.passive.name || '被动'}</div>
      <div class="codex-passive-desc">${brief}</div>
    </div>`;
  }

  // Skills
  let skillsHtml = '<div class="codex-skills">';
  pool.forEach((s, i) => {
    const isDefault = defaults.includes(i);
    const isPassive = s.passiveSkill;
    const unlocked = getAvailableSkillIndices(p.id);
    const isSkillLocked = !unlocked.includes(i);
    const lockReq = i === 3 ? 'Lv.4' : i === 4 ? 'Lv.7' : '';
    const brief = renderSkillTemplate ? renderSkillTemplate(s.brief || '', fakeFighter, s) : (s.brief || '');
    const cdText = s.cd ? `CD${s.cd}` : '';
    skillsHtml += `<div class="codex-skill ${isDefault ? 'default' : ''} ${isSkillLocked ? 'skill-locked' : ''}">
      <div class="codex-skill-header">
        <span class="codex-skill-name">${isDefault ? '★ ' : ''}${s.name}</span>
        ${isPassive ? '<span class="codex-skill-tag passive">被动</span>' : ''}
        ${isSkillLocked ? `<span class="codex-skill-tag locked">${lockReq}解锁</span>` : ''}
        ${cdText ? `<span class="codex-skill-tag cd">${cdText}</span>` : ''}
      </div>
      <div class="codex-skill-brief">${brief}</div>
    </div>`;
  });
  skillsHtml += '</div>';

  detail.innerHTML = `
    <div class="codex-detail-inner">
      <div class="codex-detail-header">
        <div class="codex-detail-img">${buildPetImgHTML(p, 96)}</div>
        <div class="codex-detail-info">
          <h2 style="color:${RARITY_COLORS[p.rarity]};margin:0">${p.emoji} ${p.name}</h2>
          <div class="codex-rarity-badge" style="background:${RARITY_COLORS[p.rarity]}">${p.rarity}级</div>
          <span class="codex-level-badge">Lv.${getPetLevel(p.id)}</span>
          ${statsHtml}
        </div>
      </div>
      <div class="codex-level-control">
        <label>等级：</label>
        <input type="number" min="1" max="10" value="${getPetLevel(p.id)}" id="codexLevelInput" style="width:50px;text-align:center">
        <button class="btn btn-sm" onclick="const v=parseInt(document.getElementById('codexLevelInput').value);if(v>=1&&v<=10){setPetLevel('${p.id}',v);showCodexDetail('${p.id}');renderPetGrid&&renderPetGrid();}">确认</button>
        <span style="font-size:11px;color:var(--fg2);margin-left:6px">每级+5%属性 | Lv.4解锁技能4 | Lv.7解锁技能5</span>
      </div>
      ${passiveHtml}
      <div style="display:flex;align-items:center;justify-content:space-between;margin:12px 0 6px">
        <h3 style="margin:0;color:var(--fg)">技能池</h3>
        ${pool.length > 3 ? `<button class="btn btn-sm" onclick="showSkillPickModal('${p.id}', function(){ showCodexDetail('${p.id}'); })">🎯 配置技能</button>` : ''}
      </div>
      ${skillsHtml}
    </div>`;
}

// ── DUNGEON MODE ─────────────────────────────────────────
let dungeonState = { stage:0, maxStage:5, teamIds:[], teamHp:{}, deadIds:[], rewards:0, buffs:[] };
let _dungeonChoicePicked = null;

// Stage config: enemies and multipliers
const DUNGEON_STAGES = [
  { enemies:3, hpMult:0.85, atkMult:0.85, defMult:0.85, label:'第1关' },
  { enemies:3, hpMult:1.0, atkMult:1.0, defMult:1.0, label:'第2关' },
  { enemies:3, hpMult:1.1, atkMult:1.1, defMult:1.1, label:'第3关' },
  { enemies:3, hpMult:1.2, atkMult:1.2, defMult:1.2, label:'第4关' },
  { enemies:1, hpMult:3.0, atkMult:1.25, defMult:1.4, boss:true, label:'第5关 · Boss' },
];

function dungeonStartStage() {
  const ds = dungeonState;
  const stageIdx = ds.stage - 1;
  const cfg = DUNGEON_STAGES[stageIdx];

  // Revive dead turtles at 70% HP (reset all self-accumulated state)
  const wasDead = new Set(ds.deadIds);
  ds.deadIds = [];

  // Create player team: all battleIds participate (revived if needed)
  const aliveBattle = ds.battleIds.slice();
  if (aliveBattle.length === 0) { dungeonOnStageFail(); return; }
  leftTeam = aliveBattle.map(id => {
    const f = createFighter(id, 'left', getSavedLoadout(id));
    const revived = wasDead.has(id);
    // Restore HP: revived → 70% max, else from last stage
    if (revived) {
      f.hp = Math.round(f.maxHp * 0.7);
    } else if (ds.teamHp[id] !== undefined) {
      f.hp = Math.min(f.maxHp, ds.teamHp[id]);
    }
    // Apply dungeon buffs (from reward choices) — everyone including revived
    for (const buff of ds.buffs) {
      if (buff.type === 'atk') { f.baseAtk += buff.value; f.atk = f.baseAtk; }
      if (buff.type === 'def') { f.baseDef += buff.value; f.def = f.baseDef; }
      if (buff.type === 'crit') { f.crit += buff.value / 100; }
      if (buff.type === 'lifesteal') { f._lifestealPct = (f._lifestealPct || 0) + buff.value; }
    }
    // Restore carried-over special state (skip for revived — they reset)
    if (!revived && ds.carryState && ds.carryState[id]) {
      const cs = ds.carryState[id];
      f._chestTreasure = cs._chestTreasure;
      f._chestEquips = cs._chestEquips ? [...cs._chestEquips] : [];
      f._chestTier = cs._chestTier;
      f._equips = cs._equips ? [...cs._equips] : [];
      f.bubbleStore = cs.bubbleStore;
      f._storedEnergy = cs._storedEnergy;
      f._starEnergy = cs._starEnergy;
      if (cs._drones > 0) { f._drones = []; for (let d = 0; d < cs._drones; d++) f._drones.push({age:0}); }
      f._goldCoins = cs._goldCoins;
      f._stoneDefGained = cs._stoneDefGained;
      if (cs._stoneDefGained > 0) { f.baseDef += cs._stoneDefGained; f.def = f.baseDef; }
      f._hunterKills = cs._hunterKills;
      f._hunterStolenAtk = cs._hunterStolenAtk;
      f._hunterStolenDef = cs._hunterStolenDef;
      f._hunterStolenHp = cs._hunterStolenHp;
      if (cs._hunterStolenAtk) { f.baseAtk += cs._hunterStolenAtk; f.atk = f.baseAtk; }
      if (cs._hunterStolenDef) { f.baseDef += cs._hunterStolenDef; f.def = f.baseDef; }
      if (cs._hunterStolenHp) { f.maxHp += cs._hunterStolenHp; f.hp += cs._hunterStolenHp; }
      f._lifestealPct = cs._lifestealPct;
      f._bambooGainedHp = cs._bambooGainedHp;
      if (cs._bambooGainedHp > 0) { f.maxHp += cs._bambooGainedHp; f.hp = Math.min(f.maxHp, f.hp + cs._bambooGainedHp); }
      // Re-apply chest equips
      for (const eq of f._chestEquips) {
        if (typeof applyChestEquip === 'function') applyChestEquip(f, eq);
      }
      // Re-apply dungeon equipment
      for (const eq of f._equips) {
        if (eq && typeof eq.apply === 'function') eq.apply(f);
      }
    } else if (revived) {
      // Revived turtle: naked (no equips, no treasure, no coins, no accumulated stats)
      f._equips = []; f._chestEquips = []; f._chestTreasure = 0; f._chestTier = 0;
      f._goldCoins = 0; f._stoneDefGained = 0; f._bambooGainedHp = 0;
      f._hunterKills = 0; f._hunterStolenAtk = 0; f._hunterStolenDef = 0; f._hunterStolenHp = 0;
      f._storedEnergy = 0; f._starEnergy = 0; f.bubbleStore = 0;
      const fElId = getFighterElId(f);
      // Visual cue logged in dungeonStartStage after render
    }
    // Restore position if saved
    if (ds.positions && ds.positions[id]) {
      f._position = ds.positions[id].position;
      f._slotKey = ds.positions[id].slotKey;
    }
    return f;
  });

  // Create enemies
  const pool = ALL_PETS.filter(p => !ds.teamIds.includes(p.id));
  const shuffled = pool.sort(() => _origMathRandom() - 0.5);
  rightTeam = [];
  const dungeonAvgLv = cfg.boss ? 10 : _avgLevel(leftTeam);
  for (let i = 0; i < cfg.enemies && i < shuffled.length; i++) {
    const e = _createAiFighter(shuffled[i].id, 'right', dungeonAvgLv);
    e.maxHp = Math.round(e.maxHp * cfg.hpMult); e.hp = e.maxHp;
    e.baseAtk = Math.round(e.baseAtk * cfg.atkMult); e.atk = e.baseAtk;
    e.baseDef = Math.round(e.baseDef * cfg.defMult); e.def = e.baseDef;
    e.baseMr = Math.round((e.baseMr || e.baseDef) * cfg.defMult); e.mr = e.baseMr;
    e._initHp = e.maxHp; e._initAtk = e.baseAtk; e._initDef = e.baseDef; e._initMr = e.baseMr;
    if (cfg.boss) { e._isBoss = true; e.name = 'BOSS ' + e.name; }
    rightTeam.push(e);
  }

  // leftTeam positions already set from ds.positions (line 1549-1553), don't override
  autoAssignPositions(rightTeam);
  gameMode = 'dungeon';
  startBattle();
  // Force refresh HP bars after render (dungeon carries over HP)
  requestAnimationFrame(() => {
    for (const f of leftTeam) {
      updateHpBar(f, getFighterElId(f));
    }
  });
}

function dungeonOnStageClear() {
  const ds = dungeonState;
  // Save state of alive team members
  for (const f of leftTeam) {
    // Mech alive but owner dead → owner counts as dead
    if (f._isMech && !f.alive) {
      // mech died, owner was already dead
    }
    if (f.alive) {
      ds.teamHp[f.id] = f.maxHp;  // full heal alive turtles on stage clear
      // Save special state for carry-over
      if (!ds.carryState) ds.carryState = {};
      ds.carryState[f.id] = {
        _chestTreasure: f._chestTreasure || 0,
        _chestEquips: f._chestEquips ? [...f._chestEquips] : [],
        _chestTier: f._chestTier || 0,
        _equips: f._equips ? [...f._equips] : [],  // dungeon equipment (新增)
        bubbleStore: f.bubbleStore || 0,
        _storedEnergy: f._storedEnergy || 0,
        _starEnergy: f._starEnergy || 0,
        _drones: f._drones ? f._drones.length : 0,
        _goldCoins: f._goldCoins || 0,
        _stoneDefGained: f._stoneDefGained || 0,
        _hunterKills: f._hunterKills || 0,
        _hunterStolenAtk: f._hunterStolenAtk || 0,
        _hunterStolenDef: f._hunterStolenDef || 0,
        _hunterStolenHp: f._hunterStolenHp || 0,
        _lifestealPct: f._lifestealPct || 0,
        _bambooGainedHp: f._bambooGainedHp || 0,
        _inkStacks: 0, // reset per stage
        _lavaRage: 0, // reset per stage
      };
    } else {
      if (!ds.deadIds.includes(f.id)) ds.deadIds.push(f.id);
      // Dead turtles: clear all self-accumulated state, will revive at 70% HP next stage
      if (!ds.carryState) ds.carryState = {};
      delete ds.carryState[f.id];
    }
  }
  // Mech/ship: if owner died but mech/ship survived, owner is still dead
  for (const f of allFighters) {
    if (f._isMech && f.alive) {
      // Find original owner (cyber turtle)
      const ownerId = f.id.replace('_mech','');
      if (!leftTeam.some(t => t.id === ownerId && t.alive)) {
        if (!ds.deadIds.includes(ownerId)) ds.deadIds.push(ownerId);
        delete ds.teamHp[ownerId];
      }
    }
    if (f._isPirateShip && f.alive) {
      const owner = f._shipOwner;
      if (owner && !owner.alive) {
        if (!ds.deadIds.includes(owner.id)) ds.deadIds.push(owner.id);
        delete ds.teamHp[owner.id];
      }
    }
  }
  // Save positions from actual battle state (fighter._slotKey)
  if (!ds.positions) ds.positions = {};
  for (const f of leftTeam) {
    if (f.alive && f._slotKey && !f._isPirateShip && !f._isMech) {
      ds.positions[f.id] = {
        position: f._position || (f._slotKey.startsWith('front') ? 'front' : 'back'),
        slotKey: f._slotKey
      };
    }
  }
  // Stage rewards
  const stageCoins = [10, 20, 40, 70, 120];
  ds.rewards += stageCoins[ds.stage - 1] || 10;

  if (ds.stage >= ds.maxStage) {
    // Boss clear bonus: +100 coins; no-death bonus: +50 coins extra
    ds.rewards += 100;
    if (ds.deadIds.length === 0) ds.rewards += 50;
    dungeonComplete(true);
    return;
  }

  // Show stage clear screen with choices + repositioning
  showDungeonClearScreen();
}

function dungeonOnStageFail() {
  const ds = dungeonState;
  // Save state
  for (const f of leftTeam) {
    if (f.alive) ds.teamHp[f.id] = f.hp;
    else if (!ds.deadIds.includes(f.id)) ds.deadIds.push(f.id);
  }
  // Mech/ship owner death handling (same as stage clear)
  for (const f of allFighters) {
    if (f._isMech && f.alive) {
      const ownerId = f.id.replace('_mech','');
      if (!leftTeam.some(t => t.id === ownerId && t.alive)) {
        if (!ds.deadIds.includes(ownerId)) ds.deadIds.push(ownerId);
      }
    }
    if (f._isPirateShip && f.alive && f._shipOwner && !f._shipOwner.alive) {
      if (!ds.deadIds.includes(f._shipOwner.id)) ds.deadIds.push(f._shipOwner.id);
    }
  }
  dungeonComplete(false);
}

function dungeonComplete(cleared) {
  const ds = dungeonState;
  playBgm('menu');
  const icon = document.getElementById('dungeonResultIcon');
  const title = document.getElementById('dungeonResultTitle');
  const sub = document.getElementById('dungeonResultSub');
  const rewards = document.getElementById('dungeonResultRewards');
  if (cleared) {
    icon.textContent = '🏆';
    title.textContent = '闯关成功！';
    sub.textContent = `通过全部 ${ds.maxStage} 关！`;
    const today = new Date().toDateString();
    const isFirst = localStorage.getItem('dailyDungeonClear') !== today;
    let totalCoins = ds.rewards;
    let lines = [`<div class="reward-line">🪙 +${ds.rewards} 龟币（关卡奖励）</div>`];
    if (isFirst) {
      totalCoins += 50;
      localStorage.setItem('dailyDungeonClear', today);
      lines.push(`<div class="reward-line">🪙 +50 龟币 <span style="color:#ffd93d">（每日首通）</span></div>`);
    }
    rewards.innerHTML = lines.join('');
    addCoins(totalCoins);
    try { sfxVictory(); } catch(e) {}
  } else {
    icon.textContent = '💀';
    title.textContent = '闯关失败…';
    sub.textContent = `止步于第 ${ds.stage} 关`;
    const partialCoins = Math.max(5, Math.round(ds.rewards * 0.5));
    rewards.innerHTML = `<div class="reward-line">🪙 +${partialCoins} 龟币（部分奖励）</div>`;
    addCoins(partialCoins);
    try { sfxDefeat(); } catch(e) {}
  }
  showScreen('screenDungeonResult');
}

function showDungeonClearScreen() {
  const ds = dungeonState;
  // Render progress dots
  const progressEl = document.getElementById('dungeonProgress');
  progressEl.innerHTML = '';
  for (let i = 1; i <= ds.maxStage; i++) {
    const cls = i < ds.stage ? 'cleared' : i === ds.stage ? 'cleared current' : '';
    const boss = i === ds.maxStage ? ' boss' : '';
    progressEl.innerHTML += `<div class="dp-dot ${cls}${boss}">${i === ds.maxStage ? '👑' : i}</div>`;
  }
  // Title
  document.getElementById('dungeonClearTitle').textContent = DUNGEON_STAGES[ds.stage-1].label + ' 通过！';
  // Team status: battle team + bench with swap AND repositioning
  renderDungeonTeamSwap();
  // Generate 3 choices
  _dungeonChoicePicked = null;
  document.getElementById('dungeonNextBtn').disabled = true;
  renderDungeonChoices();
  showScreen('screenDungeonClear');
}

// Save current positions from dungeon clear screen
function dungeonSavePositions() {
  const ds = dungeonState;
  if (!ds.positions) ds.positions = {};
  // Save positions for all alive battle turtles
  for (const id of ds.battleIds) {
    if (ds.deadIds.includes(id)) continue;
    // Find which slot this turtle is in
    for (const key of FG_SLOT_KEYS_BASE) {
      if (_fgSlots[key] === id) {
        ds.positions[id] = {
          position: key.startsWith('front') ? 'front' : 'back',
          slotKey: key
        };
        break;
      }
    }
  }
}

function renderDungeonChoices() {
  const ds = dungeonState;
  const aliveIds = ds.teamIds.filter(id => !ds.deadIds.includes(id));

  const choicePool = [
    { icon:'⚔️', title:'攻击强化', desc:'全队攻击力永久 +6', apply() { ds.buffs.push({type:'atk',value:6}); } },
    { icon:'🛡️', title:'防御强化', desc:'全队护甲永久 +4', apply() { ds.buffs.push({type:'def',value:4}); } },
    { icon:'💥', title:'暴击提升', desc:'全队暴击率永久 +12%', apply() { ds.buffs.push({type:'crit',value:12}); } },
    { icon:'🩸', title:'生命偷取', desc:'全队获得 8% 生命偷取', apply() { ds.buffs.push({type:'lifesteal',value:8}); } },
    { icon:'🎁', title:'获得装备', desc:'从3件装备中选1件装给任意龟', apply() { ds._pendingEquipPick = true; } },
  ];

  // Pick 3 random choices
  const shuffled = choicePool.sort(() => _origMathRandom() - 0.5).slice(0, 3);
  const el = document.getElementById('dungeonChoices');
  el.innerHTML = shuffled.map((c, i) => `
    <div class="dungeon-choice" onclick="pickDungeonChoice(${i})" id="dchoice${i}">
      <div class="dungeon-choice-icon">${c.icon}</div>
      <div class="dungeon-choice-title">${c.title}</div>
      <div class="dungeon-choice-desc">${c.desc}</div>
    </div>
  `).join('');
  // Store choices for later
  el._choices = shuffled;
}

function pickDungeonChoice(idx) {
  _dungeonChoicePicked = idx;
  document.querySelectorAll('.dungeon-choice').forEach((c, i) => {
    c.classList.toggle('selected', i === idx);
  });
  document.getElementById('dungeonNextBtn').disabled = false;
}

function dungeonNextStage() {
  if (_dungeonChoicePicked === null) return;
  const el = document.getElementById('dungeonChoices');
  const choice = el._choices[_dungeonChoicePicked];
  if (choice && choice.apply) choice.apply();
  // If user picked equipment choice, show picker first
  if (dungeonState._pendingEquipPick) {
    dungeonState._pendingEquipPick = false;
    showDungeonEquipPicker();
    return;
  }
  showDungeonTeamStatus();
  dungeonState.stage++;
  setTimeout(() => dungeonStartStage(), 500);
}

function showDungeonEquipPicker() {
  const ds = dungeonState;
  const pool = EQUIP_POOL.slice().sort(() => _origMathRandom() - 0.5).slice(0, 3);
  const overlay = document.createElement('div');
  overlay.id = 'dungeonEquipOverlay';
  overlay.className = 'equip-pick-overlay';
  overlay.innerHTML = `
    <div class="equip-pick-box">
      <h3 style="color:#ffd93d;margin-bottom:12px">🎁 选择一件装备</h3>
      <div class="equip-pick-items">${pool.map((e, i) => `
        <div class="equip-pick-item" onclick="dungeonPickEquipItem(${i})">
          <div style="font-size:32px">${e.icon.endsWith('.png') ? `<img src="assets/${e.icon}" style="width:32px;height:32px">` : e.icon}</div>
          <div style="font-weight:700;font-size:14px">${e.name}</div>
          <div style="font-size:11px;color:var(--fg2)">${e.desc}</div>
        </div>
      `).join('')}</div>
      <div class="equip-pick-targets" id="dungeonEquipTargets" style="display:none">
        <p style="color:var(--fg2);font-size:12px;margin-bottom:8px">装给谁？</p>
        <div id="dungeonEquipTargetBtns"></div>
      </div>
      <div style="margin-top:12px;text-align:right">
        <button class="btn btn-sm" onclick="dungeonSkipEquip()" style="opacity:.7">跳过</button>
      </div>
    </div>
  `;
  overlay._pool = pool;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('show'), 50);
}

function dungeonPickEquipItem(idx) {
  const overlay = document.getElementById('dungeonEquipOverlay');
  if (!overlay) return;
  overlay._selectedIdx = idx;
  overlay.querySelectorAll('.equip-pick-item').forEach((el, i) => el.classList.toggle('selected', i === idx));
  const ds = dungeonState;
  const aliveIds = ds.battleIds.filter(id => !ds.deadIds.includes(id));
  const targetsEl = document.getElementById('dungeonEquipTargetBtns');
  const buttons = aliveIds.map(id => {
    const p = ALL_PETS.find(x => x.id === id);
    const existing = (ds.carryState && ds.carryState[id] && ds.carryState[id]._equips) || [];
    return `<button class="btn btn-target" onclick="dungeonApplyEquipTo('${id}')" style="margin:4px" ${existing.length >= 2 ? 'disabled' : ''}>
      ${p.emoji} ${p.name} (${existing.length}/2)
    </button>`;
  }).join('');
  const allMax = aliveIds.every(id => {
    const existing = (ds.carryState && ds.carryState[id] && ds.carryState[id]._equips) || [];
    return existing.length >= 2;
  });
  targetsEl.innerHTML = buttons + (allMax ? '<p style="color:#ff9f43;font-size:11px;margin-top:8px">所有存活龟装备已满，请跳过</p>' : '');
  document.getElementById('dungeonEquipTargets').style.display = 'block';
}

function dungeonSkipEquip() {
  const overlay = document.getElementById('dungeonEquipOverlay');
  if (overlay) {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  }
  const ds = dungeonState;
  showDungeonTeamStatus();
  ds.stage++;
  setTimeout(() => dungeonStartStage(), 500);
}

function dungeonApplyEquipTo(turtleId) {
  const overlay = document.getElementById('dungeonEquipOverlay');
  if (!overlay) return;
  const equip = overlay._pool[overlay._selectedIdx];
  if (!equip) return;
  const ds = dungeonState;
  if (!ds.carryState) ds.carryState = {};
  if (!ds.carryState[turtleId]) ds.carryState[turtleId] = { _equips: [] };
  if (!ds.carryState[turtleId]._equips) ds.carryState[turtleId]._equips = [];
  ds.carryState[turtleId]._equips.push(equip);
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 300);
  // Continue to next stage
  showDungeonTeamStatus();
  ds.stage++;
  setTimeout(() => dungeonStartStage(), 500);
}

function showDungeonTeamStatus() {
  const ds = dungeonState;
  const statusEl = document.getElementById('dungeonTeamStatus');
  if (!statusEl) return;
  statusEl.innerHTML = ds.teamIds.map(id => {
    const p = ALL_PETS.find(x => x.id === id);
    const dead = ds.deadIds.includes(id);
    const hp = dead ? 0 : (ds.teamHp[id] || p.hp);
    const maxHp = Math.round(p.hp * (RARITY_MULT[p.rarity] || 1));
    const hpPct = Math.max(0, Math.min(100, hp / maxHp * 100));
    const barColor = hpPct < 30 ? '#e74c3c' : hpPct < 60 ? '#f39c12' : '#06d6a0';
    const hpBar = dead
      ? '<div class="dts-hp-bar"><div class="dts-hp-fill" style="width:0%"></div></div>'
      : `<div class="dts-hp-bar"><div class="dts-hp-fill" style="width:${hpPct}%;background:${barColor}"></div></div>`;
    return `<div class="dungeon-turtle-status ${dead ? 'dead' : ''}">
      <div class="dts-emoji">${buildPetImgHTML(p, 36)}</div>
      <div class="dts-name">${p.name}</div>
      ${hpBar}
      ${dead ? '<div class="dts-dead-tag">💀 下关以70%复活</div>' : ''}
    </div>`;
  }).join('');
}

function renderDungeonTeamSwap() {
  const ds = dungeonState;
  const statusEl = document.getElementById('dungeonTeamStatus');
  if (!statusEl) return;
  if (!ds.positions) ds.positions = {};

  const aliveBattle = ds.battleIds.filter(id => !ds.deadIds.includes(id));
  const aliveBench = ds.benchIds.filter(id => !ds.deadIds.includes(id));
  const floating = window._dungeonFloatingTurtle;

  const turtleCard = (id, clickAction) => {
    const p = ALL_PETS.find(x => x.id === id);
    const dead = ds.deadIds.includes(id);
    const hp = dead ? 0 : (ds.teamHp[id] || p.hp);
    const maxHp = Math.round(p.hp * (RARITY_MULT[p.rarity] || 1));
    const hpPct = Math.max(0, Math.min(100, hp / maxHp * 100));
    const barColor = hpPct < 30 ? '#e74c3c' : hpPct < 60 ? '#f39c12' : '#06d6a0';
    const isFloating = floating === id;
    return `<div class="dts-pos-slot filled ${dead ? 'dead' : ''} ${isFloating ? 'floating' : ''}" onclick="${clickAction}">
      ${buildPetImgHTML(p, 32)}
      <span class="dts-pos-name">${p.name}</span>
      <div class="dts-pos-hp-bar"><div class="dts-pos-hp-fill" style="width:${hpPct}%;background:${barColor}"></div></div>
      ${dead ? '<span class="dts-pos-hp" style="font-size:9px;color:#ff9">💀</span>' : ''}
    </div>`;
  };

  let html = '';

  // === Position grid ===
  html += '<div class="dts-section-label">⚔ 上场阵型（点击龟拿起，点空位放下）</div>';
  html += '<div class="dts-position-grid">';
  for (const row of ['front', 'back']) {
    html += `<div class="dts-pos-row"><span class="dts-pos-label">${row === 'front' ? '前排' : '后排'}</span>`;
    for (let i = 0; i < 3; i++) {
      const slotId = row + '-' + i;
      const turtleInSlot = aliveBattle.find(id => ds.positions[id] && ds.positions[id].slotKey === slotId);
      if (turtleInSlot) {
        html += turtleCard(turtleInSlot, `dungeonPickUp('${turtleInSlot}')`);
      } else {
        html += `<div class="dts-pos-slot empty" onclick="dungeonPlaceInSlot('${slotId}')">${floating ? '放这里' : '空'}</div>`;
      }
    }
    html += '</div>';
  }
  html += '</div>';

  // === Floating indicator ===
  if (floating) {
    const fp = ALL_PETS.find(x => x.id === floating);
    html += `<div class="dts-floating-hint">🔄 正在移动：${fp?.name || floating}（点击空位放置）</div>`;
  }

  // === Dead turtles (will auto-revive next stage at 70% HP, naked) ===
  const deadBattle = ds.battleIds.filter(id => ds.deadIds.includes(id));
  if (deadBattle.length > 0) {
    html += '<div class="dts-section-label">💀 下关以70%复活（清空装备与累积）</div><div class="dts-row">';
    for (const id of deadBattle) {
      const p = ALL_PETS.find(x => x.id === id);
      html += `<div class="dts-pos-slot dead"><span class="dts-pos-name">${p.name}</span><span class="dts-pos-hp">💀</span></div>`;
    }
    html += '</div>';
  }

  statusEl.innerHTML = html;
}

// Pick up a battle turtle (for repositioning or swapping with bench)
function dungeonPickUp(turtleId) {
  window._dungeonFloatingTurtle = turtleId;
  const ds = dungeonState;
  if (ds.positions) delete ds.positions[turtleId];
  renderDungeonTeamSwap();
}

// Place floating turtle into a slot
function dungeonPlaceInSlot(slotId) {
  const ds = dungeonState;
  if (!ds.positions) ds.positions = {};
  const floatingId = window._dungeonFloatingTurtle;
  if (!floatingId) return;
  const occupied = Object.entries(ds.positions).find(([id, p]) => p.slotKey === slotId);
  if (occupied) { showToast('该位置已有龟'); return; }
  ds.positions[floatingId] = { position: slotId.startsWith('front') ? 'front' : 'back', slotKey: slotId };
  // If floating came from bench, swap into battleIds (replacing a dead battle member)
  if (ds.benchIds.includes(floatingId)) {
    const benchIdx = ds.benchIds.indexOf(floatingId);
    const deadIdx = ds.battleIds.findIndex(id => ds.deadIds.includes(id));
    if (deadIdx >= 0) {
      const deadId = ds.battleIds[deadIdx];
      ds.battleIds[deadIdx] = floatingId;
      ds.benchIds[benchIdx] = deadId;
    } else {
      // No dead battle member — find any battle slot without position (shouldn't usually happen)
      const orphanIdx = ds.battleIds.findIndex(id => !ds.positions[id]);
      if (orphanIdx >= 0) {
        const orphan = ds.battleIds[orphanIdx];
        ds.battleIds[orphanIdx] = floatingId;
        ds.benchIds[benchIdx] = orphan;
      }
    }
    // Full HP for bench turtle entering battle if not tracked
    if (!ds.teamHp[floatingId]) { const bp = ALL_PETS.find(x => x.id === floatingId); ds.teamHp[floatingId] = bp ? bp.hp : 100; }
  }
  window._dungeonFloatingTurtle = null;
  renderDungeonTeamSwap();
}

// Click bench turtle: swap with floating battle turtle, or pick up bench turtle
function dungeonBenchSwap(benchId) {
  const ds = dungeonState;
  const floatingId = window._dungeonFloatingTurtle;
  if (floatingId) {
    // If floating is a bench turtle being put back, swap bench↔bench
    if (ds.benchIds.includes(floatingId)) {
      const idxA = ds.benchIds.indexOf(floatingId);
      const idxB = ds.benchIds.indexOf(benchId);
      [ds.benchIds[idxA], ds.benchIds[idxB]] = [ds.benchIds[idxB], ds.benchIds[idxA]];
      window._dungeonFloatingTurtle = null;
      renderDungeonTeamSwap();
      return;
    }
    // Swap floating (battle) ↔ bench
    const battleIdx = ds.battleIds.indexOf(floatingId);
    const benchIdx = ds.benchIds.indexOf(benchId);
    if (battleIdx >= 0 && benchIdx >= 0) {
      ds.battleIds[battleIdx] = benchId;
      ds.benchIds[benchIdx] = floatingId;
      // Bench turtle takes the floating turtle's former slot
      if (!ds.positions) ds.positions = {};
      const oldPos = ds.positions[floatingId];
      if (oldPos) ds.positions[benchId] = { ...oldPos };
      delete ds.positions[floatingId];
      // Bench turtle gets full HP if not tracked
      if (!ds.teamHp[benchId]) { const bp = ALL_PETS.find(x => x.id === benchId); ds.teamHp[benchId] = bp ? bp.hp : 100; }
    }
    window._dungeonFloatingTurtle = null;
  } else {
    // Pick up bench turtle as floating — can then place in empty slot or swap
    window._dungeonFloatingTurtle = benchId;
  }
  renderDungeonTeamSwap();
}

function dungeonSwap(deadId, benchId) {
  const ds = dungeonState;
  // Swap: benchId replaces deadId in battle team
  const idx = ds.battleIds.indexOf(deadId);
  if (idx === -1) return;
  ds.battleIds[idx] = benchId;
  // Move deadId to bench
  const bIdx = ds.benchIds.indexOf(benchId);
  if (bIdx !== -1) ds.benchIds[bIdx] = deadId;
  // Give new turtle the dead turtle's position (or first empty slot)
  if (!ds.positions) ds.positions = {};
  const deadPos = ds.positions[deadId];
  if (deadPos) {
    ds.positions[benchId] = { ...deadPos };
    delete ds.positions[deadId];
  } else {
    // Find first empty front/back slot
    const usedSlots = Object.values(ds.positions).map(p => p.slotKey);
    const emptySlot = ['front-0','front-1','front-2','back-0','back-1','back-2'].find(s => !usedSlots.includes(s));
    if (emptySlot) ds.positions[benchId] = { position: emptySlot.startsWith('front') ? 'front' : 'back', slotKey: emptySlot };
  }
  // Set HP for new turtle (full HP since fresh from bench)
  const bp = ALL_PETS.find(x => x.id === benchId);
  if (bp && !ds.teamHp[benchId]) ds.teamHp[benchId] = bp.hp;
  showToast(`${bp?.name || benchId} 替换上场！`);
  renderDungeonTeamSwap();
}

// ── INIT ──────────────────────────────────────────────────
loadCoins();
updateRecordDisplay();
// Start menu BGM on first user interaction (browsers block autoplay)
document.addEventListener('click', function _startMenuBgm() {
  playBgm('menu');
  document.removeEventListener('click', _startMenuBgm);
}, { once: true });


