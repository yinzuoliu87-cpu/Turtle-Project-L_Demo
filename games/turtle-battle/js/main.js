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
    showSelectScreen('选择你的队伍（选3只龟）');
  } else if (mode === 'boss') {
    difficulty = 'hard';
    selecting = 'left';
    selectedIds = [];
    showSelectScreen('<img src="assets/equip-crown-icon.png" style="width:24px;height:24px;vertical-align:middle"> Boss挑战 — 选择你的队伍（选3只龟）');
  } else if (mode === 'dungeon') {
    difficulty = 'normal';
    selecting = 'left';
    selectedIds = [];
    dungeonState = { stage: 0, maxStage: 5, teamHp: {}, deadIds: [], rewards: 0, buffs: [], battleIds: [], benchIds: [] };
    showSelectScreen('🏰 深海闯关 — 选择6只龟（3上场 + 3替补）');
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
      if (msg.side === 'left')  leftTeam  = msg.team.map(id => createFighter(id,'left', opLoadouts[id]||null));
      if (msg.side === 'right') rightTeam = msg.team.map(id => createFighter(id,'right', opLoadouts[id]||null));
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
      '选择3只龟组成队伍，对战随机AI敌方',
      '前排龟优先承受单体攻击，后排更安全',
      '先手方首回合只能行动2只龟',
      '合理搭配物理/魔法/辅助龟'
    ]
  },
  boss: {
    icon: '👑',
    title: 'Boss挑战',
    tips: [
      '3只龟挑战1只超强Boss',
      'Boss拥有 ×3.5 HP、×1.2 攻击、×1.4 护甲/魔抗',
      'Boss每回合行动3次',
      '建议带治疗/护盾龟'
    ]
  },
  dungeon: {
    icon: '🏰',
    title: '深海闯关',
    tips: [
      '选择6只龟：3只上场 + 3只替补',
      '5层连续3v3闯关，HP不会回满',
      '每层通关后可选增益奖励，并可用替补换下阵亡龟',
      '最终Boss在第5层等待'
    ]
  },
  'pvp-online': {
    icon: '🌐',
    title: '在线对战',
    tips: [
      '与真人玩家实时对战',
      '双方各选3只龟，前后排自行安排',
      '每回合限时3分钟'
    ]
  }
};

function showSelectScreen(title) {
  _fgSlots = {};
  selectedIds = [];
  _fgSelectedSlot = null;
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
    const _mob = window.innerWidth <= 768;
    return `<div class="pet-card ${selectedIds.includes(p.id)?'selected':''}"
         style="--rc:${RARITY_COLORS[p.rarity]}" data-id="${p.id}"
         ${_mob ? '' : `draggable="true" ondragstart="fgDragStart(event,'${p.id}')" ondragend="fgDragEnd(event)"`}
         onclick="togglePet(event,'${p.id}')">
      <div class="pet-avatar">${buildPetImgHTML(p, _mob ? (p.sprite ? 80 : 60) : 96)}${passiveHtml}</div>
      <div class="pet-name">${p.name}</div>
      <div class="pet-rarity" style="color:${RARITY_COLORS[p.rarity]}">${p.rarity}</div>
      <div class="pet-stats-mini">
        <span><img src="assets/hp-icon.png" class="stat-icon">${p.hp}</span>
        <span><img src="assets/atk-icon.png" class="stat-icon">${p.atk}</span>
        <span><img src="assets/def-icon.png" class="stat-icon">${p.def}</span>
        <span><img src="assets/mr-icon.png" class="stat-icon">${p.mr !== undefined ? p.mr : p.def}</span>
      </div>
    </div>`;
  }).join('');
}

// Formation slots: 6 slots (3 front + 3 back), place exactly 3 turtles
let _fgSlots = {};
const FG_SLOT_KEYS = ['front-0','front-1','front-2','back-0','back-1','back-2'];
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
  const maxPets = gameMode === 'dungeon' ? 6 : 3;
  const placed = FG_SLOT_KEYS.filter(k => _fgSlots[k]).length;
  if (placed >= maxPets) { showToast(`已选${maxPets}只，点击龟或格子可移除`); return; }
  // Place in next empty front slot first, then back
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
  // Desktop: click to remove
  if (_fgSlots[key]) {
    delete _fgSlots[key];
    renderFgSlots();
    renderPetGrid();
    updateConfirmBtn();
  }
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
  // Update row labels for dungeon mode
  const labels = document.querySelectorAll('.fg-label');
  if (labels.length >= 2) {
    labels[0].textContent = isDungeon ? '上场' : '前排';
    labels[1].textContent = isDungeon ? '替补' : '后排';
  }
  for (const key of FG_SLOT_KEYS) {
    const slot = document.getElementById('fgSlot-' + key);
    if (!slot) continue;
    const petId = _fgSlots[key];
    // Selected highlight for mobile swap
    slot.classList.toggle('fg-selected', _fgSelectedSlot === key);
    if (petId) {
      const p = ALL_PETS.find(x => x.id === petId);
      slot.innerHTML = `<div class="fg-turtle">${buildPetImgHTML(p, 40)}<span class="fg-name" style="color:${RARITY_COLORS[p.rarity]}">${p.name}</span></div>`;
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
  const required = gameMode === 'dungeon' ? 6 : 3;
  document.getElementById('btnConfirmTeam').disabled = placed !== required;
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

  let overlay = document.getElementById('skillPickOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'skillPickOverlay';
    overlay.className = 'skill-pick-overlay';
    document.body.appendChild(overlay);
  }

  function render() {
    const fakeFighter = { atk:pet.atk, def:pet.def, mr:pet.mr||pet.def, maxHp:pet.hp, hp:pet.hp, crit:pet.crit||0.25, buffs:[], passive:pet.passive, _goldCoins:0, _drones:null, _bambooGainedHp:0, _hunterKills:0, _hunterStolenAtk:0, _hunterStolenDef:0, _hunterStolenHp:0, _lifestealPct:0, _stoneDefGained:0 };
    overlay.innerHTML = `
      <div class="skill-pick-box">
        <div class="skill-pick-title">${buildPetImgHTML(pet, 32)} ${pet.name} — 技能装配 <span class="skill-pick-count">(${selected.length}/3)</span></div>
        <div class="skill-pick-grid">
          ${pool.map((s, i) => {
            const isSel = selected.includes(i);
            const brief = renderSkillTemplate(s.brief || '', fakeFighter, s);
            const cdText = s.cd ? `CD${s.cd}` : '';
            return `<div class="skill-pick-card ${isSel ? 'selected' : ''} ${!isSel && selected.length >= 3 ? 'locked' : ''}" onclick="window._skillPickToggle(${i})">
              <div class="spc-header"><b>${s.name}</b> ${cdText ? `<span class="spc-cd">${cdText}</span>` : ''}</div>
              <div class="spc-brief">${brief}</div>
              ${isSel ? '<div class="spc-check">✓</div>' : ''}
            </div>`;
          }).join('')}
        </div>
        <button class="btn btn-primary skill-pick-confirm" ${selected.length === 3 ? '' : 'disabled'} onclick="window._skillPickConfirm()">确认装配</button>
      </div>
    `;
    overlay.style.display = 'flex';
  }

  window._skillPickToggle = (i) => {
    if (selected.includes(i)) {
      selected = selected.filter(x => x !== i);
    } else if (selected.length < 3) {
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
  // Build skills preview
  const battlePet = ALL_PETS ? ALL_PETS.find(x => x.id === p.id) : null;
  let skillsHtml = '';
  if (battlePet) {
    const pool = battlePet.skillPool || battlePet.skills || [];
    if (pool.length) {
      skillsHtml = '<div style="margin-top:10px;border-top:1px solid rgba(255,255,255,.08);padding-top:8px"><div style="font-size:11px;font-weight:700;color:var(--fg2);margin-bottom:4px">技能</div>';
      pool.forEach(s => {
        const cdText = s.cd ? `<span style="font-size:9px;color:var(--fg2);background:rgba(255,255,255,.06);padding:1px 4px;border-radius:3px">CD${s.cd}</span>` : '';
        const briefR = renderSkillTemplate(s.brief || '', fakeFighter, s);
        skillsHtml += `<div style="margin-bottom:4px;font-size:11px"><b>${s.name}</b> ${cdText}<br><span style="color:var(--fg2)">${briefR}</span></div>`;
      });
      skillsHtml += '</div>';
    }
  }
  popup.innerHTML = `<div class="passive-popup-title">${iconHtml} ${p.name} — ${passiveName}</div><div class="passive-popup-desc">${rendered}</div>${skillsHtml}<div style="text-align:center;margin-top:10px;font-size:12px;color:var(--fg2);cursor:pointer;padding:6px" onclick="this.parentElement.style.display='none'">点击关闭</div>`;
  // Mobile: bottom sheet; Desktop: centered
  if (window.innerWidth <= 768) {
    popup.style.cssText = 'display:block;position:fixed;z-index:9999;left:0;right:0;bottom:0;top:auto;transform:none;max-height:70vh;overflow-y:auto;border-radius:16px 16px 0 0;animation:none;width:100%';
  } else {
    popup.style.cssText = 'display:block;position:fixed;z-index:9999;left:50%;top:40%;transform:translate(-50%,-50%);animation:none';
  }
}

function _buildTeamFromSlots(side, loadoutMap) {
  return FG_SLOT_KEYS.filter(k => _fgSlots[k]).map(k => {
    const petId = _fgSlots[k];
    const idxs = (loadoutMap && loadoutMap[petId]) || getSavedLoadout(petId) || null;
    const f = createFighter(petId, side, idxs);
    f._position = k.startsWith('front') ? 'front' : 'back';
    return f;
  });
}

function _createAiFighter(petId, side) {
  const idxs = aiPickSkills(petId);
  return createFighter(petId, side, idxs);
}

function confirmTeam() {
  const requiredCount = gameMode === 'dungeon' ? 6 : 3;
  if (selectedIds.length !== requiredCount) return;
  if (gameMode === 'dungeon') {
    const battleIds = ['front-0','front-1','front-2'].map(k => _fgSlots[k]).filter(Boolean);
    const benchIds = ['back-0','back-1','back-2'].map(k => _fgSlots[k]).filter(Boolean);
    const needsPickDg = selectedIds.filter(id => { const p = ALL_PETS.find(x=>x.id===id); return p && p.skillPool && p.skillPool.length > 3; });
    const doDungeon = () => {
      dungeonState.stage = 1;
      dungeonState.teamIds = [...selectedIds];
      dungeonState.battleIds = battleIds;
      dungeonState.benchIds = benchIds;
      dungeonState.teamHp = {};
      dungeonState.deadIds = [];
      dungeonState.rewards = 0;
      dungeonState.buffs = [];
      dungeonStartStage();
    };
    if (needsPickDg.length > 0) { showSkillPickChain(needsPickDg, 0, doDungeon); return; }
    doDungeon();
    return;
  }
  if (gameMode === 'pve') {
    // Check if any turtle needs skill selection
    const needsPick = selectedIds.filter(id => { const p = ALL_PETS.find(x=>x.id===id); return p && p.skillPool && p.skillPool.length > 3; });
    if (needsPick.length > 0) {
      showSkillPickChain(needsPick, 0, () => {
        leftTeam = _buildTeamFromSlots('left');
        const pool = ALL_PETS.filter(p => !selectedIds.includes(p.id));
        const shuffled = pool.sort(() => Math.random() - 0.5);
        rightTeam = [_createAiFighter(shuffled[0].id,'right'), _createAiFighter(shuffled[1].id,'right'), _createAiFighter(shuffled[2].id,'right')];
        autoAssignPositions(rightTeam);
        startBattle();
      });
      return;
    }
    leftTeam = _buildTeamFromSlots('left');
    const pool = ALL_PETS.filter(p => !selectedIds.includes(p.id));
    const shuffled = pool.sort(() => Math.random() - 0.5);
    rightTeam = [_createAiFighter(shuffled[0].id,'right'), _createAiFighter(shuffled[1].id,'right'), _createAiFighter(shuffled[2].id,'right')];
    autoAssignPositions(rightTeam);
    startBattle();
  } else if (gameMode === 'boss') {
    const needsPick2 = selectedIds.filter(id => { const p = ALL_PETS.find(x=>x.id===id); return p && p.skillPool && p.skillPool.length > 3; });
    const doBoss = () => {
      leftTeam = _buildTeamFromSlots('left');
      const bossPool = ALL_PETS.filter(p => !selectedIds.includes(p.id));
      const bossPet = bossPool[Math.floor(Math.random() * bossPool.length)];
      const boss = _createAiFighter(bossPet.id, 'right');
    // Boss stat multipliers (3v1 balanced)
    boss.maxHp = Math.round(boss.maxHp * 3.5); boss.hp = boss.maxHp;
    boss.baseAtk = Math.round(boss.baseAtk * 1.2); boss.atk = boss.baseAtk;
    boss.baseDef = Math.round(boss.baseDef * 1.4); boss.def = boss.baseDef;
    boss.baseMr = Math.round((boss.baseMr || boss.baseDef) * 1.4); boss.mr = boss.baseMr;
    boss._initHp = boss.maxHp; boss._initAtk = boss.baseAtk; boss._initDef = boss.baseDef; boss._initMr = boss.baseMr;
      boss._isBoss = true;
      boss.name = 'BOSS ' + boss.name;
      rightTeam = [boss];
      boss._position = 'front';
      startBattle();
    };
    if (needsPick2.length > 0) { showSkillPickChain(needsPick2, 0, doBoss); return; }
    doBoss();
  } else if (gameMode === 'pvp-online') {
    const needsPickPvp = selectedIds.filter(id => { const p = ALL_PETS.find(x=>x.id===id); return p && p.skillPool && p.skillPool.length > 3; });
    const doPvp = () => {
      const side = onlineSide, team = selectedIds.slice();
      // Build loadout map to send
      const loadouts = {};
      team.forEach(id => { const s = getSavedLoadout(id); if (s) loadouts[id] = s; });
      if (side === 'left')  leftTeam  = _buildTeamFromSlots('left');
      if (side === 'right') rightTeam = _buildTeamFromSlots('right');
      sendOnline({ type:'team-ready', side, team, loadouts });
      showToast('等待对手选择…');
      // Only host starts battle (generates seed); guest waits for battle-seed message
      if (leftTeam.length === 3 && rightTeam.length === 3 && onlineSide === 'left') {
        autoAssignPositions(leftTeam); autoAssignPositions(rightTeam); startBattle();
      }
    };
    if (needsPickPvp.length > 0) { showSkillPickChain(needsPickPvp, 0, doPvp); return; }
    doPvp();
  }
}

function autoAssignPositions(team) {
  // Sort by DEF descending — highest DEF go front
  const sorted = [...team].sort((a,b) => b.def - a.def);
  sorted.forEach((f, i) => {
    f._position = i < 2 ? 'front' : 'back';
  });
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
  { id:'thunder', icon:'⚡', name:'雷暴之日', desc:'全体暴击率 +30%',
    apply(fighters) { fighters.forEach(f => { f.crit += 0.3; }); } },
  { id:'undead', icon:'💀', name:'亡灵之日', desc:'所有龟首次死亡以15%HP复活',
    apply(fighters) { fighters.forEach(f => { f._ruleRevive = true; }); } },
  { id:'shield', icon:'🛡️', name:'铁壁之日', desc:'所有护盾效果 +100%',
    apply(fighters) { /* handled in doShield/applyRawDmg via _battleRule check */ } },
  { id:'rage', icon:'⚔️', name:'狂暴之日', desc:'全体攻击力 +40%，护甲 -20%',
    apply(fighters) { fighters.forEach(f => { f.baseAtk = Math.round(f.baseAtk * 1.4); f.atk = f.baseAtk; f.baseDef = Math.round(f.baseDef * 0.8); f.def = f.baseDef; }); } },
  { id:'ocean', icon:'💧', name:'深海之日', desc:'全体魔抗 +30%，魔法伤害 -20%',
    apply(fighters) { fighters.forEach(f => { f.baseMr = Math.round((f.baseMr || f.baseDef) * 1.3); f.mr = f.baseMr; }); } },
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
  let bgFile = 'assets/bg-cave-alt.png';
  if (gameMode === 'boss') bgFile = 'assets/bg-cave.png';
  else if (gameMode === 'pvp-online') bgFile = 'assets/bg-shipwreck.png';
  else if (gameMode === 'dungeon') bgFile = dungeonState.stage >= 5 ? 'assets/bg-cave.png' : 'assets/bg-cave-alt.png';
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
  else if (gameMode === 'boss') { ll.textContent = '我方'; lr.innerHTML = '<img src="assets/equip-crown-icon.png" style="width:20px;height:20px;vertical-align:middle"> BOSS'; }
  else if (gameMode === 'dungeon') { ll.textContent = '我方'; lr.textContent = dungeonState.stage >= 5 ? '👑 BOSS' : '第' + dungeonState.stage + '关'; }
  else { ll.textContent = onlineSide==='left'?'我方':'对手'; lr.textContent = onlineSide==='right'?'我方':'对手'; }
  // Boss mode: hide second enemy card
  const rf1 = document.getElementById('rightFighter1');
  if (rf1) rf1.style.display = (gameMode === 'boss') ? 'none' : '';
  document.getElementById('battleLog').innerHTML = '';
  try { sfxBattleStart(); } catch(e) {}
  const isBossStage = gameMode === 'boss' || (gameMode === 'dungeon' && dungeonState.stage >= 5);
  playBgm(isBossStage ? 'boss' : 'battle');
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
        e.buffs.push({ type:'atkDown', value:f.passive.atkDownPct, turns:f.passive.atkDownTurns });
      }
      recalcStats();
      addLog(`${f.emoji}${f.name} 被动：<span class="log-passive">❄️冰寒！敌方全体ATK-${f.passive.atkDownPct}% ${f.passive.atkDownTurns}回合</span>`);
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
  updateDmgStats();

  // Show rule banner animation then log
  showRuleBanner(_battleRule, () => {
    addLog(`<span style="color:#ffd93d;font-weight:700">${_battleRule.icon} ${_battleRule.name}：${_battleRule.desc}</span>`, 'round-sep');
  });

  // Pirate barrage: opening bombardment (after render so player sees it)
  const pirates = allFighters.filter(f => f.alive && f.passive && f.passive.type === 'pirateBarrage');
  if (pirates.length) {
    setTimeout(async () => {
      for (const f of pirates) {
        const fElId = getFighterElId(f);
        // Show passive trigger on pirate
        spawnFloatingNum(fElId, '<img src="assets/pirate-plunder-icon.png" style="width:24px;height:24px;vertical-align:middle">掠夺！', 'debuff-label', 0, -10);
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
  stopBgm();
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
  playBgm('menu');
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

// ── DUNGEON MODE ─────────────────────────────────────────
let dungeonState = { stage:0, maxStage:5, teamIds:[], teamHp:{}, deadIds:[], rewards:0, buffs:[] };
let _dungeonChoicePicked = null;

// Stage config: enemies and multipliers
const DUNGEON_STAGES = [
  { enemies:3, hpMult:1.0, atkMult:1.0, defMult:1.0, label:'第1关' },
  { enemies:3, hpMult:1.15, atkMult:1.1, defMult:1.1, label:'第2关' },
  { enemies:3, hpMult:1.3, atkMult:1.2, defMult:1.2, label:'第3关 · 精英' },
  { enemies:3, hpMult:1.5, atkMult:1.3, defMult:1.3, label:'第4关' },
  { enemies:1, hpMult:3.5, atkMult:1.3, defMult:1.5, boss:true, label:'第5关 · Boss' },
];

function dungeonStartStage() {
  const ds = dungeonState;
  const stageIdx = ds.stage - 1;
  const cfg = DUNGEON_STAGES[stageIdx];

  // Create player team: use battleIds (alive only)
  const aliveBattle = ds.battleIds.filter(id => !ds.deadIds.includes(id));
  if (aliveBattle.length === 0) { dungeonOnStageFail(); return; }
  leftTeam = aliveBattle.map(id => {
    const f = createFighter(id, 'left', getSavedLoadout(id));
    // Restore HP from previous stage
    if (ds.teamHp[id] !== undefined) {
      f.hp = Math.min(f.maxHp, ds.teamHp[id]);
    }
    // Apply dungeon buffs
    for (const buff of ds.buffs) {
      if (buff.type === 'atk') { f.baseAtk += buff.value; f.atk = f.baseAtk; }
      if (buff.type === 'def') { f.baseDef += buff.value; f.def = f.baseDef; }
      if (buff.type === 'crit') { f.crit += buff.value / 100; }
      if (buff.type === 'lifesteal') { f._lifestealPct = (f._lifestealPct || 0) + buff.value; }
    }
    return f;
  });

  // Create enemies
  const pool = ALL_PETS.filter(p => !ds.teamIds.includes(p.id));
  const shuffled = pool.sort(() => _origMathRandom() - 0.5);
  rightTeam = [];
  for (let i = 0; i < cfg.enemies && i < shuffled.length; i++) {
    const e = _createAiFighter(shuffled[i].id, 'right');
    e.maxHp = Math.round(e.maxHp * cfg.hpMult); e.hp = e.maxHp;
    e.baseAtk = Math.round(e.baseAtk * cfg.atkMult); e.atk = e.baseAtk;
    e.baseDef = Math.round(e.baseDef * cfg.defMult); e.def = e.baseDef;
    e.baseMr = Math.round((e.baseMr || e.baseDef) * cfg.defMult); e.mr = e.baseMr;
    e._initHp = e.maxHp; e._initAtk = e.baseAtk; e._initDef = e.baseDef; e._initMr = e.baseMr;
    if (cfg.boss) { e._isBoss = true; e.name = 'BOSS ' + e.name; }
    rightTeam.push(e);
  }

  autoAssignPositions(leftTeam);
  autoAssignPositions(rightTeam);
  gameMode = 'dungeon';
  startBattle();
}

function dungeonOnStageClear() {
  const ds = dungeonState;
  // Save HP of alive team members
  for (const f of leftTeam) {
    if (f.alive) ds.teamHp[f.id] = f.hp;
    else if (!ds.deadIds.includes(f.id)) ds.deadIds.push(f.id);
  }
  // Stage rewards
  const stageCoins = [10, 20, 40, 70, 120];
  ds.rewards += stageCoins[ds.stage - 1] || 10;

  if (ds.stage >= ds.maxStage) {
    // All stages cleared!
    dungeonComplete(true);
    return;
  }

  // Show stage clear screen with choices
  showDungeonClearScreen();
}

function dungeonOnStageFail() {
  const ds = dungeonState;
  // Save state
  for (const f of leftTeam) {
    if (f.alive) ds.teamHp[f.id] = f.hp;
    else if (!ds.deadIds.includes(f.id)) ds.deadIds.push(f.id);
  }
  // Check if any alive turtles remain
  const aliveIds = ds.teamIds.filter(id => !ds.deadIds.includes(id));
  if (aliveIds.length > 0 && leftTeam.some(f => f.alive)) {
    // Still have turtles, lost this battle but can retry? No — stage fail = show result
    dungeonComplete(false);
  } else {
    dungeonComplete(false);
  }
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
  // Team status: battle team + bench with swap
  renderDungeonTeamSwap();
  // Generate 3 choices
  _dungeonChoicePicked = null;
  document.getElementById('dungeonNextBtn').disabled = true;
  renderDungeonChoices();
  showScreen('screenDungeonClear');
}

function renderDungeonChoices() {
  const ds = dungeonState;
  const aliveIds = ds.teamIds.filter(id => !ds.deadIds.includes(id));
  const hasDead = ds.deadIds.length > 0;

  const choicePool = [
    { icon:'💚', title:'生命恢复', desc:'全队回复 40% 最大生命值', apply() { for (const id of aliveIds) { const p = ALL_PETS.find(x=>x.id===id); const max = Math.round(p.hp*(RARITY_MULT[p.rarity]||1)); ds.teamHp[id] = Math.min(max, (ds.teamHp[id]||max) + Math.round(max*0.4)); } } },
    { icon:'⚔️', title:'攻击强化', desc:'全队攻击力永久 +6', apply() { ds.buffs.push({type:'atk',value:6}); } },
    { icon:'🛡️', title:'防御强化', desc:'全队护甲永久 +4', apply() { ds.buffs.push({type:'def',value:4}); } },
    { icon:'💥', title:'暴击提升', desc:'全队暴击率永久 +12%', apply() { ds.buffs.push({type:'crit',value:12}); } },
    { icon:'🩸', title:'生命偷取', desc:'全队获得 8% 生命偷取', apply() { ds.buffs.push({type:'lifesteal',value:8}); } },
    { icon:'💰', title:'龟币宝箱', desc:'立即获得 30 龟币', apply() { ds.rewards += 30; } },
  ];
  if (hasDead) {
    choicePool.push({ icon:'✨', title:'复活队友', desc:'复活一只已阵亡的龟（30%HP）', apply() {
      const revId = ds.deadIds.shift();
      if (revId) { const p = ALL_PETS.find(x=>x.id===revId); const max = Math.round(p.hp*(RARITY_MULT[p.rarity]||1)); ds.teamHp[revId] = Math.round(max*0.3); }
    }});
  }

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
  // Refresh team status display to show effect of choice (e.g. revive)
  showDungeonTeamStatus();
  dungeonState.stage++;
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
    const hpPct = Math.round(hp / maxHp * 100);
    return `<div class="dungeon-turtle-status ${dead ? 'dead' : ''}">
      <div class="dts-emoji">${buildPetImgHTML(p, 36)}</div>
      <div class="dts-name">${p.name}</div>
      <div class="dts-hp ${hpPct < 30 ? 'low' : ''}">${dead ? '💀 阵亡' : 'HP ' + hpPct + '%'}</div>
    </div>`;
  }).join('');
}

function renderDungeonTeamSwap() {
  const ds = dungeonState;
  const statusEl = document.getElementById('dungeonTeamStatus');
  if (!statusEl) return;

  const renderTurtle = (id, label) => {
    const p = ALL_PETS.find(x => x.id === id);
    const dead = ds.deadIds.includes(id);
    const hp = dead ? 0 : (ds.teamHp[id] || p.hp);
    const maxHp = Math.round(p.hp * (RARITY_MULT[p.rarity] || 1));
    const hpPct = Math.round(hp / maxHp * 100);
    return `<div class="dungeon-turtle-status ${dead ? 'dead' : ''}">
      <div class="dts-emoji">${buildPetImgHTML(p, 36)}</div>
      <div class="dts-name">${p.name}</div>
      <div class="dts-hp ${hpPct < 30 ? 'low' : ''}">${dead ? '💀 阵亡' : 'HP ' + hpPct + '%'}</div>
      ${label ? `<div class="dts-label">${label}</div>` : ''}
    </div>`;
  };

  // Check if any battle turtle is dead and bench has alive replacements
  const deadBattle = ds.battleIds.filter(id => ds.deadIds.includes(id));
  const aliveBench = ds.benchIds.filter(id => !ds.deadIds.includes(id));
  const canSwap = deadBattle.length > 0 && aliveBench.length > 0;

  let html = '<div class="dts-section-label">⚔ 上场</div><div class="dts-row">';
  html += ds.battleIds.map(id => renderTurtle(id, '')).join('');
  html += '</div>';
  html += '<div class="dts-section-label">🪑 替补</div><div class="dts-row">';
  html += ds.benchIds.map(id => renderTurtle(id, '')).join('');
  html += '</div>';

  if (canSwap) {
    html += `<div class="dts-swap-area">`;
    html += `<div class="dts-swap-hint">可替换阵亡龟：</div>`;
    for (const deadId of deadBattle) {
      const dp = ALL_PETS.find(x => x.id === deadId);
      for (const benchId of aliveBench) {
        const bp = ALL_PETS.find(x => x.id === benchId);
        html += `<button class="btn btn-sm dts-swap-btn" onclick="dungeonSwap('${deadId}','${benchId}')">
          💀${dp.name} → ${bp.name}
        </button>`;
      }
    }
    html += `</div>`;
  }

  statusEl.innerHTML = html;
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
  showToast(`${ALL_PETS.find(x=>x.id===benchId).name} 替换上场！`);
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


