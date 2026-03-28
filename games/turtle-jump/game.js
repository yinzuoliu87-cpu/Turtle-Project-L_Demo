// =====================================================
// 龟龟出海 — Bubble Jump to Freedom
// =====================================================
const canvas = document.getElementById('gc');
const ctx = canvas.getContext('2d', { alpha: false });

// =====================================================
// BACKGROUND LAYER IMAGES
// =====================================================
const bgSurface = new Image(); bgSurface.src = '海面bg.png';
const bgDeep    = new Image(); bgDeep.src    = '海底bg.png';
let bgImagesReady = 0;
[bgSurface, bgDeep].forEach(img => {
  img.onload = () => { bgImagesReady++; };
});

// =====================================================
// CONSTANTS
// =====================================================
const INITIAL_BUBBLES = 50;
const BUBBLE_RADIUS = 40;
const BUBBLE_GAP = 175;
const SEA_SURFACE_Y = INITIAL_BUBBLES * BUBBLE_GAP; // fixed goal height
const GRAVITY = 0.17;
const JUMP_FORCE = 9.8;
const ANGLE_MIN = -1.22;       // ≈ ±70°
const ANGLE_MAX = 1.22;
const ANGLE_SPEED_BASE = 0.028;
const TURTLE_R = 18;
const WALL_MARGIN = 28;

// =====================================================
// STATE
// =====================================================
let W, H;
let gameState = 'start';
let turtle = { x: 0, y: 0, vx: 0, vy: 0 };
let bubbles = [];
let currentBubble = -1;
let progress = 0;
let angle = 0;
let angleDir = 1;
let cameraY = 0;
let frameCount = 0;
let particles = [];
let shakeForce = 0, shakeTimer = 0, shakeX = 0, shakeY = 0;
let isPaused = false;
let bestProgress = parseInt(localStorage.getItem('turtleBestProg') || '0');
let attempts = parseInt(localStorage.getItem('turtleAttempts') || '0');
let gameStartTime = 0;
let landingAnim = 0;
let deathY = 0;
let flyTrail = [];
let lives = 0;         // extra lives remaining
let invincible = 0;    // invincibility frames after revive
let nextBubbleId = 0;  // increments as we spawn bubbles
let bubblesReached = 0; // total bubbles landed on
let toastFlags = {};   // phase announcement flags

// --- NEW MECHANICS STATE ---
let jellies = [];        // {x, worldY, baseX, movePhase, radius}
let currentZones = [];   // {startY, endY, direction: -1 or 1, strength}
let skipToast = { text: '', timer: 0, x: 0, y: 0 }; // skip-bubble bonus display
let lastLandedBubble = -1; // track previous bubble for skip detection
let currentParticles = [];  // current-zone visual particles

// =====================================================
// PETS — synced from main site petState (localStorage)
// =====================================================
// Rarity → lives: C/B/A=10, S=12, SS/SSS=14, TEST=∞
const RARITY_LIVES = { C: 10, B: 10, A: 10, S: 12, SS: 14, SSS: 14 };
// Rarity → turtle color
const RARITY_COLORS = {
  C: '#06d6a0', B: '#4cc9f0', A: '#3a9abf',
  S: '#c77dff', SS: '#ffd93d', SSS: '#ff6b6b'
};
const RARITY_SHELL = {
  C: '#059a74', B: '#2a8ab0', A: '#2a6a90',
  S: '#9060c0', SS: '#c9a020', SSS: '#c04040'
};

function loadPetsFromMainSite() {
  const pets = [];
  try {
    const saved = JSON.parse(localStorage.getItem('petState') || '{}');
    // Full pet definitions matching pet.html (28 pets)
    const ALL_PETS = [
      // C级 (3)
      { id:'basic',     name:'小龟',     emoji:'🐢',     img:'assets/pets/基础小龟.png',  rarity:'C' },
      { id:'stone',     name:'石头龟',   emoji:'🪨🐢',   img:'assets/pets/石头龟.png',   rarity:'C' },
      { id:'bamboo',    name:'竹叶龟',   emoji:'🎋🐢',   img:'assets/pets/竹叶龟.png',   rarity:'C' },
      // B级 (8)
      { id:'angel',     name:'天使龟',   emoji:'😇🐢',   img:'assets/pets/天使龟.png',   rarity:'B' },
      { id:'ice',       name:'寒冰龟',   emoji:'❄️🐢',   img:'assets/pets/寒冰龟.png',   rarity:'B' },
      { id:'ninja',     name:'忍者龟',   emoji:'🥷🐢',   img:'assets/pets/忍者龟.png',   rarity:'B' },
      { id:'two_head',  name:'双头龟',   emoji:'🐢🐢',   img:'assets/pets/双头龟.png',   rarity:'B' },
      { id:'ghost',     name:'幽灵龟',   emoji:'👻🐢',   img:'assets/pets/幽灵龟.png',   rarity:'B' },
      { id:'diamond',   name:'钻石龟',   emoji:'💎🐢',   img:'assets/pets/钻石龟.png',   rarity:'B' },
      { id:'fortune',   name:'财神龟',   emoji:'🧧🐢',   img:'assets/pets/财神龟.png',   rarity:'B' },
      { id:'dice',      name:'骰子龟',   emoji:'🎲🐢',   img:'assets/pets/骰子龟.png',   rarity:'B' },
      // A级 (8)
      { id:'rainbow',   name:'彩虹龟',   emoji:'🌈🐢',   img:'assets/pets/彩虹龟.png',   rarity:'A' },
      { id:'gambler',   name:'赌神龟',   emoji:'🃏🐢',   img:'assets/pets/赌神龟.png',   rarity:'A' },
      { id:'hunter',    name:'猎人龟',   emoji:'🏹🐢',   img:'assets/pets/猎人龟.png',   rarity:'A' },
      { id:'pirate',    name:'海盗龟',   emoji:'🏴‍☠️🐢', img:'assets/pets/海盗龟.png',   rarity:'A' },
      { id:'candy',     name:'糖果龟',   emoji:'🍬🐢',   img:'assets/pets/糖果龟.png',   rarity:'A' },
      { id:'bubble',    name:'泡泡龟',   emoji:'🫧🐢',   img:'assets/pets/气泡龟.png',   rarity:'A' },
      { id:'line',      name:'线条龟',   emoji:'✏️🐢',   img:'assets/pets/线条龟.png',   rarity:'A' },
      { id:'lightning', name:'闪电龟',   emoji:'⚡🐢',   img:'assets/pets/闪电龟.png',   rarity:'A' },
      // S级 (6)
      { id:'phoenix',   name:'凤凰龟',   emoji:'🔥🐢',   img:'assets/pets/凤凰龟.png',   rarity:'S' },
      { id:'lava',      name:'熔岩龟',   emoji:'🌋🐢',   img:'assets/pets/熔岩龟.png',   rarity:'S' },
      { id:'cyber',     name:'赛博龟',   emoji:'🤖🐢',   img:'assets/pets/赛博龟.png',   rarity:'S' },
      { id:'crystal',   name:'水晶龟',   emoji:'🔮🐢',   img:'assets/pets/水晶龟.png',   rarity:'S' },
      { id:'chest',     name:'宝箱龟',   emoji:'📦🐢',   img:'assets/pets/宝箱龟.png',   rarity:'S' },
      { id:'space',     name:'星际龟',   emoji:'🚀🐢',   img:'assets/pets/星际龟.png',   rarity:'S' },
      // SS级 (2)
      { id:'hiding',    name:'缩头乌龟', emoji:'🫣🐢',   img:'assets/pets/缩头乌龟.png',  rarity:'SS' },
      { id:'headless',  name:'无头龟',   emoji:'💀🐢',   img:'assets/pets/无头龟.png',   rarity:'SS' },
      // SSS级 (1)
      { id:'shell',     name:'龟壳',     emoji:'🐚',     img:'assets/pets/龟壳.png',    rarity:'SSS' },
    ];

    // Read owned/equipped state from petState
    const savedPets = (saved.pets || []);
    const ownedMap = {};
    let equippedId = 'basic';
    savedPets.forEach(sp => {
      ownedMap[sp.id] = sp.owned;
      if (sp.equipped) equippedId = sp.id;
    });

    // Build game pet list: all pets (show all, mark owned)
    ALL_PETS.forEach(p => {
      const owned = ownedMap[p.id] !== undefined ? ownedMap[p.id] : (p.id === 'basic');
      const r = p.rarity;
      const livesCount = RARITY_LIVES[r] || 10;
      const desc = livesCount + ' 次机会';
      pets.push({
        id: p.id, name: p.name, emoji: p.emoji,
        img: '../../' + p.img,
        rank: r, lives: livesCount,
        color: RARITY_COLORS[r] || '#06d6a0',
        shellColor: RARITY_SHELL[r] || '#059a74',
        desc: desc,
        equipped: p.id === equippedId
      });
    });

    // If no pets loaded, fallback to default
    if (pets.length === 0) {
      pets.push({ id:'basic', name:'小龟', emoji:'🐢', img:'../../assets/pets/基础小龟.png', rank:'C', lives:10, color:'#06d6a0', shellColor:'#059a74', desc:'10 次机会', equipped:true });
    }
  } catch(e) {
    pets.push({ id:'basic', name:'小龟', emoji:'🐢', img:'../../assets/pets/基础小龟.png', rank:'C', lives:10, color:'#06d6a0', shellColor:'#059a74', desc:'10 次机会', equipped:true });
  }

  // Always add test turtle
  pets.push({ id:'test', name:'测试龟', emoji:'🔧', img:null, rank:'TEST', lives:999, color:'#c77dff', shellColor:'#9060c0', desc:'无限生命', equipped:false });

  return pets;
}

// Preload pet images into Image objects for canvas rendering
const petImages = {};
function preloadPetImages() {
  PETS.forEach(p => {
    if (!p.img) return;
    const img = new Image();
    img.src = p.img;
    petImages[p.id] = img;
  });
}

const PETS = loadPetsFromMainSite();
preloadPetImages();
let activePet = PETS.find(p => p.equipped) || PETS[0];

// =====================================================
// RESIZE
// =====================================================
function resize() {
  const wrap = canvas.parentElement;
  W = canvas.width = wrap.clientWidth;
  H = canvas.height = wrap.clientHeight;
}
window.addEventListener('resize', resize);
resize();

// =====================================================
// COORDINATE HELPERS  (worldY 0=floor, up=positive)
// =====================================================
function w2sy(wy) { return (H - 70) - (wy - cameraY); }
function w2sx(wx) { return wx; }

// =====================================================
// LEVEL GENERATION
// =====================================================
// Create a single bubble at given worldY based on current progress phase
function makeBubble(worldY, id) {
  const pct = worldY / SEA_SURFACE_Y * 100;
  let x, moving = false, moveSpd = 0, moveRange = 0, hasRock = false;
  let radius = BUBBLE_RADIUS;
  let hasPlank = false;       // 90%+: planks seal bottom + half of each side
  let plankGapSide = 0;       // 0=left open, 1=right open (which half is passable)

  // Breathing rhythm: detect breather zones
  const isBreather = (pct >= 30 && pct < 38) || (pct >= 55 && pct < 62);

  if (pct <= 5) {
    x = W / 2;
  } else if (pct <= 20) {
    // Easy ramp (expanded from 25 for breathing rhythm)
    x = W * 0.18 + Math.random() * W * 0.64;
    if (pct > 10) { moving = true; moveSpd = 0.3 + (pct - 10) / 15 * 0.5; moveRange = W * 0.08; }
  } else if (pct <= 30) {
    // Moderate challenge — moving bubbles
    x = W * 0.25 + Math.random() * W * 0.5;
    moving = true;
    moveSpd = 0.4 + (pct - 20) / 10 * 0.8;
    moveRange = W * 0.1 + (pct - 20) / 10 * W * 0.06;
  } else if (pct <= 38) {
    // BREATHER — wider bubbles, slower, no rocks
    x = W * 0.2 + Math.random() * W * 0.6;
    moving = true;
    moveSpd = 0.3 + Math.random() * 0.3;
    moveRange = W * 0.06;
    radius = BUBBLE_RADIUS * 1.15;
  } else if (pct <= 55) {
    // Harder — rocks, currents, cracking bubbles
    x = W * 0.25 + Math.random() * W * 0.5;
    moving = true;
    moveSpd = 0.8 + (pct - 38) / 17 * 1.0;
    moveRange = W * 0.12 + Math.random() * W * 0.06;
    hasRock = false;
  } else if (pct <= 62) {
    // BREATHER again — wider, calmer
    x = W * 0.2 + Math.random() * W * 0.6;
    moving = true;
    moveSpd = 0.35 + Math.random() * 0.3;
    moveRange = W * 0.06;
    radius = BUBBLE_RADIUS * 1.15;
  } else if (pct <= 80) {
    // Intense — everything combined
    x = W * 0.22 + Math.random() * W * 0.56;
    moving = true;
    moveSpd = 1.0 + (pct - 62) / 18 * 0.8;
    moveRange = W * 0.12 + Math.random() * W * 0.08;
    hasRock = false;
  } else if (pct <= 85) {
    // Sinking + all obstacles
    x = W * 0.22 + Math.random() * W * 0.56;
    moving = true;
    moveSpd = 1.2 + Math.random() * 0.6;
    moveRange = W * 0.12;
    hasRock = false;
  } else {
    // 85%+: small bubbles with plank barriers
    radius = BUBBLE_RADIUS * 0.5;
    x = W * 0.25 + Math.random() * W * 0.5;
    moving = true;
    moveSpd = 1.4 + Math.random() * 0.8;
    moveRange = W * 0.1;
    hasPlank = Math.random() < 0.6;
    plankGapSide = Math.random() < 0.5 ? 0 : 1;
  }

  // Cracking bubbles: 20-60% zone, ~30% chance, NOT in breather zones
  const cracking = !isBreather && pct >= 20 && pct <= 60 && Math.random() < 0.3;

  return {
    id: id, baseX: x, x: x,
    worldY: worldY,
    radius: radius,
    moving, moveSpd, moveRange,
    movePhase: Math.random() * Math.PI * 2,
    hasRock, hasPlank, plankGapSide,
    reached: false, popAnim: 0,
    cracking: cracking,
    crackTimer: 0,        // countdown frames (7s = 420 frames at 60fps)
    crackStarted: false   // has the crack timer started?
  };
}

function generateBubbles() {
  bubbles = [];
  nextBubbleId = 0;
  for (let i = 0; i < INITIAL_BUBBLES - 1; i++) {
    const worldY = (i + 1) * BUBBLE_GAP;
    bubbles.push(makeBubble(worldY, nextBubbleId++));
  }

  // Generate jellyfish between bubbles in 30-80% zone
  jellies = [];
  for (let i = 1; i < bubbles.length; i++) {
    const midY = (bubbles[i - 1].worldY + bubbles[i].worldY) / 2;
    const pct = midY / SEA_SURFACE_Y * 100;
    if (pct >= 30 && pct <= 80 && Math.random() < 0.35) {
      jellies.push({
        x: W * 0.15 + Math.random() * W * 0.7,
        worldY: midY + (Math.random() - 0.5) * BUBBLE_GAP * 0.3,
        baseX: 0, // set below
        movePhase: Math.random() * Math.PI * 2,
        radius: 16 + Math.random() * 8,
        bobPhase: Math.random() * Math.PI * 2
      });
      jellies[jellies.length - 1].baseX = jellies[jellies.length - 1].x;
    }
  }

  // Generate current zones in 40-75% zone
  currentZones = [];
  const zoneStart = SEA_SURFACE_Y * 0.4;
  const zoneEnd = SEA_SURFACE_Y * 0.75;
  let cy = zoneStart;
  let dir = 1;
  while (cy < zoneEnd) {
    const height = BUBBLE_GAP * (1.5 + Math.random() * 2);
    currentZones.push({
      startY: cy,
      endY: Math.min(cy + height, zoneEnd),
      direction: dir,
      strength: 0.3 + Math.random() * 0.5
    });
    cy += height + BUBBLE_GAP * 0.5;
    dir *= -1;
  }
}

// =====================================================
// HELPERS
// =====================================================
function calcProgress() {
  return Math.max(0, Math.min(100, turtle.y / SEA_SURFACE_Y * 100));
}

function getAngleSpeed() {
  const t = progress / 100;
  return ANGLE_SPEED_BASE * (1 + t * 0.6);
}

function triggerShake(force, frames) { shakeForce = force; shakeTimer = frames; }

function spawnParticles(sx, sy, count, hue) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 1 + Math.random() * 2.5;
    particles.push({
      x: sx, y: sy,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 1,
      life: 1, decay: 0.015 + Math.random() * 0.02,
      r: 3 + Math.random() * 5,
      hue: hue || (180 + Math.random() * 40)
    });
  }
}

let toastTimer = null;
function gToast(msg) {
  const el = document.getElementById('gToast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function updateHud() {
  document.getElementById('score').textContent = Math.floor(progress) + '%';
  const elapsed = Math.floor((Date.now() - gameStartTime) / 1000);
  const min = Math.floor(elapsed / 60);
  const sec = elapsed % 60;
  document.getElementById('elapsed').textContent = min > 0 ? min + ':' + (sec < 10 ? '0' : '') + sec : sec + 's';
  const livesHud = document.getElementById('livesHud');
  livesHud.style.display = '';
  document.getElementById('livesVal').textContent = lives >= 999 ? '∞' : lives;
}

function getPhaseLabel() {
  if (progress <= 5)  return '海底';
  if (progress <= 20) return '浅海';
  if (progress <= 30) return '中层';
  if (progress <= 38) return '平静区';
  if (progress <= 55) return '暗流区';
  if (progress <= 62) return '平静区';
  if (progress <= 80) return '深海';
  if (progress <= 90) return '海面';
  return '冲刺';
}

// =====================================================
// SFX (bounce — others in audio.js)
// =====================================================
function sfxBounce() {
  const c = ensureAudio(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(110, t + 0.08);
  g.gain.setValueAtTime(0.1, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + 0.1);
}

// =====================================================
// START / RESTART
// =====================================================
function startGame() {
  document.getElementById('startOverlay').classList.add('hidden');
  document.getElementById('overOverlay').classList.add('hidden');
  ensureAudio();

  generateBubbles();

  turtle.x = W / 2; turtle.y = 0; turtle.vx = 0; turtle.vy = 0;
  currentBubble = -1;
  progress = 0;
  angle = 0; angleDir = 1;
  cameraY = 0;
  frameCount = 0;
  particles = []; flyTrail = [];
  shakeForce = 0; shakeTimer = 0;
  landingAnim = 0;
  isPaused = false;
  deathY = -120;
  lives = activePet.lives;
  invincible = 0;
  toastFlags = {};
  bubblesReached = 0;
  lastLandedBubble = -1;
  skipToast = { text: '', timer: 0, x: 0, y: 0 };
  currentParticles = [];
  gameStartTime = Date.now();

  gameState = 'aiming';
  document.getElementById('hud').style.display = '';
  document.getElementById('pauseBtn').style.display = '';
  document.getElementById('lbPanel').style.display = 'none';
  updateHud();
  bgmStart();
  lastTime = 0;
  requestAnimationFrame(gameLoop);
}

function retryGame() { startGame(); }

function backToSelect() {
  document.getElementById('overOverlay').classList.add('hidden');
  document.getElementById('startOverlay').classList.remove('hidden');
  document.getElementById('lbPanel').style.display = '';
  bgmStop();
}

// =====================================================
// INPUT
// =====================================================
function handleJump() {
  if (gameState !== 'aiming' || isPaused) return;
  ensureAudio();
  sfxJump();
  // Reset crack timer on the bubble we're leaving
  if (currentBubble >= 0 && currentBubble < bubbles.length) {
    const cb = bubbles[currentBubble];
    if (cb.cracking) {
      cb.crackStarted = false;
      cb.crackTimer = 0;
    }
  }
  turtle.vx = Math.sin(angle) * JUMP_FORCE;
  turtle.vy = Math.cos(angle) * JUMP_FORCE;
  flyTrail = [];
  gameState = 'flying';
}

document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); handleJump(); }
  // Debug: press T to toggle auto-advance (jump to next bubble every second)
  if (e.code === 'KeyT') { toggleAutoDebug(); }
});

// =====================================================
// DEBUG AUTO-ADVANCE (press T to toggle)
// =====================================================
let debugAutoInterval = null;
function toggleAutoDebug() {
  if (debugAutoInterval) {
    clearInterval(debugAutoInterval);
    debugAutoInterval = null;
    console.log('[DEBUG] Auto-advance OFF');
    return;
  }
  console.log('[DEBUG] Auto-advance ON — turtle jumps every 1s');
  debugAutoInterval = setInterval(() => {
    if (gameState === 'start') { handleJump(); return; }
    if (gameState !== 'aiming' && gameState !== 'flying') return;
    const nextIdx = currentBubble + 1;
    if (nextIdx < bubbles.length) {
      landOnBubble(nextIdx);
      gameState = 'aiming';
    }
  }, 1000);
}
canvas.addEventListener('click', () => handleJump());
canvas.addEventListener('touchstart', e => {
  if (e.target.closest('.pause-btn,.sound-btn')) return;
  e.preventDefault();
  handleJump();
}, { passive: false });

// =====================================================
// PAUSE
// =====================================================
function togglePause() {
  if (gameState === 'start' || gameState === 'dead' || gameState === 'win') return;
  isPaused = !isPaused;
  document.getElementById('pauseOverlay').classList.toggle('show', isPaused);
  if (isPaused) bgmPause(); else bgmResume();
}

function quitGame() {
  isPaused = false;
  gameState = 'start';
  document.getElementById('pauseOverlay').classList.remove('show');
  document.getElementById('hud').style.display = 'none';
  document.getElementById('pauseBtn').style.display = 'none';
  document.getElementById('startOverlay').classList.remove('hidden');
  document.getElementById('lbPanel').style.display = '';
  bgmStop();
}

// =====================================================
// GAME LOOP
// =====================================================
let lastTime = 0;
const FIXED_DT = 1000 / 60;
let accumulator = 0;

function gameLoop(ts) {
  if (gameState === 'start') return;
  if (!lastTime) lastTime = ts;
  const delta = Math.min(ts - lastTime, 100);
  lastTime = ts;
  if (!isPaused) {
    accumulator += delta;
    while (accumulator >= FIXED_DT) { gameTick(); accumulator -= FIXED_DT; }
  }
  render();
  if (gameState !== 'dead') requestAnimationFrame(gameLoop);
}

// =====================================================
// GAME TICK
// =====================================================
function gameTick() {
  frameCount++;

  // Update bubble positions
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    if (b.moving) {
      b.movePhase += b.moveSpd * 0.02;
      b.x = b.baseX + Math.sin(b.movePhase) * b.moveRange;
      b.x = Math.max(b.radius + 10, Math.min(W - b.radius - 10, b.x));
    }
  }


  // Update progress based on turtle height
  progress = calcProgress();
  updateHud();

  // --- AIMING ---
  if (gameState === 'aiming') {
    if (currentBubble >= 0) {
      const b = bubbles[currentBubble];
      turtle.x = b.x;
      turtle.y = b.worldY;
      deathY = b.worldY - BUBBLE_GAP * 1.3;
    } else {
      turtle.x = W / 2;
      turtle.y = 0;
      deathY = -120;
    }
    angle += getAngleSpeed() * angleDir;
    if (angle > ANGLE_MAX) { angle = ANGLE_MAX; angleDir = -1; }
    if (angle < ANGLE_MIN) { angle = ANGLE_MIN; angleDir = 1; }

    // Crack timer countdown on cracking bubbles
    if (currentBubble >= 0) {
      const cb = bubbles[currentBubble];
      if (cb.cracking && cb.crackStarted) {
        cb.crackTimer--;
        if (cb.crackTimer <= 0) {
          // Bubble breaks! Fall to previous bubble
          cb.crackStarted = false; // reset so it can crack again on next landing
          spawnParticles(w2sx(cb.x), w2sy(cb.worldY), 15, 200);
          triggerShake(5, 10);
          gToast('气泡碎了！');
          if (currentBubble > 0) {
            const prev = bubbles[currentBubble - 1];
            currentBubble = currentBubble - 1;
            turtle.x = prev.x; turtle.y = prev.worldY;
            turtle.vx = 0; turtle.vy = 0;
          } else {
            // No previous bubble — game over
            gameOver(); return;
          }
        }
      }
    }
  }

  // --- FLYING ---
  if (gameState === 'flying') {
    turtle.vy -= GRAVITY;
    turtle.x += turtle.vx;
    turtle.y += turtle.vy;

    flyTrail.push({ x: turtle.x, y: turtle.y });
    if (flyTrail.length > 12) flyTrail.shift();

    // Wall bounce (phase 4+)
    if (progress >= 48) {
      if (turtle.x - TURTLE_R < WALL_MARGIN) {
        turtle.x = WALL_MARGIN + TURTLE_R;
        turtle.vx = Math.abs(turtle.vx) * 0.82;
        sfxBounce(); triggerShake(2, 5);
      }
      if (turtle.x + TURTLE_R > W - WALL_MARGIN) {
        turtle.x = W - WALL_MARGIN - TURTLE_R;
        turtle.vx = -Math.abs(turtle.vx) * 0.82;
        sfxBounce(); triggerShake(2, 5);
      }
    } else {
      if (turtle.x < TURTLE_R) { turtle.x = TURTLE_R; turtle.vx = Math.abs(turtle.vx) * 0.5; }
      if (turtle.x > W - TURTLE_R) { turtle.x = W - TURTLE_R; turtle.vx = -Math.abs(turtle.vx) * 0.5; }
    }

    // Jellyfish collision during flight
    for (let j = 0; j < jellies.length; j++) {
      const jf = jellies[j];
      const bob = Math.sin(frameCount * 0.03 + jf.bobPhase) * 12;
      const jfY = jf.worldY + bob;
      const dx = turtle.x - jf.x;
      const dy = turtle.y - jfY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < jf.radius + TURTLE_R * 0.6) {
        // Bounce back to previous bubble (don't lose life)
        sfxBounce(); triggerShake(4, 8);
        spawnParticles(w2sx(turtle.x), w2sy(turtle.y), 8, 290);
        gToast('水母！弹回去了！');
        if (currentBubble >= 0) {
          const b = bubbles[currentBubble];
          turtle.x = b.x; turtle.y = b.worldY;
        } else {
          turtle.x = W / 2; turtle.y = 0;
        }
        turtle.vx = 0; turtle.vy = 0;
        gameState = 'aiming';
        break;
      }
    }
    if (gameState !== 'flying') { /* bounced by jelly, skip rest of flying logic */ }
    else {

    // Current push during flight
    for (let c = 0; c < currentZones.length; c++) {
      const cz = currentZones[c];
      if (turtle.y >= cz.startY && turtle.y <= cz.endY) {
        turtle.vx += cz.direction * cz.strength * 0.08;
      }
    }

    // Rock / bottom-seal / side-wall collision
    for (let i = Math.max(0, currentBubble + 1); i < Math.min(currentBubble + 5, bubbles.length); i++) {
      const b = bubbles[i];

      // Rock barrier
      if (b.hasRock) {
        const rockY = b.worldY - b.radius * 0.7;
        const rockHH = 8;
        const rockHW = b.radius * 1.15;
        if (turtle.vy > 0 &&
            turtle.y + TURTLE_R > rockY - rockHH &&
            turtle.y - TURTLE_R < rockY + rockHH &&
            Math.abs(turtle.x - b.x) < rockHW + TURTLE_R * 0.5) {
          turtle.vy = -Math.abs(turtle.vy) * 0.65;
          turtle.y = rockY - rockHH - TURTLE_R;
          sfxBounce(); triggerShake(3, 6);
          spawnParticles(w2sx(turtle.x), w2sy(turtle.y), 4, 30);
        }
      }

      // Plank barriers attached to bubble (bottom + sides)
      if (b.hasPlank) {
        const r = b.radius;
        const pH = 4; // collision half-thickness

        // Bottom plank: blocks from below
        const botPlankY = b.worldY - r;
        if (turtle.vy > 0 &&
            turtle.y + TURTLE_R > botPlankY - pH &&
            turtle.y - TURTLE_R < botPlankY + pH &&
            Math.abs(turtle.x - b.x) < r + TURTLE_R * 0.3) {
          turtle.vy = -Math.abs(turtle.vy) * 0.6;
          turtle.y = botPlankY - pH - TURTLE_R;
          sfxBounce(); triggerShake(3, 6);
          spawnParticles(w2sx(turtle.x), w2sy(turtle.y), 4, 25);
        }

        // Side planks: cover bottom 30% of bubble (only the lower portion)
        // Only block horizontal entry, not vertical — turtle approaching from above can pass
        const sideTop = b.worldY - r * 0.1;
        const sideBot = b.worldY - r;
        if (turtle.y + TURTLE_R > sideBot && turtle.y - TURTLE_R < sideTop &&
            turtle.y > b.worldY - r * 0.8) { // only when turtle is in lower half
          // Left plank (present when plankGapSide !== 0)
          if (b.plankGapSide !== 0) {
            const lEdge = b.x - r;
            if (turtle.vx > 0 && turtle.x + TURTLE_R > lEdge - pH && turtle.x < lEdge) {
              turtle.x = lEdge - pH - TURTLE_R;
              turtle.vx = -Math.abs(turtle.vx) * 0.65;
              sfxBounce(); triggerShake(2, 4);
            }
          }
          // Right plank (present when plankGapSide !== 1)
          if (b.plankGapSide !== 1) {
            const rEdge = b.x + r;
            if (turtle.vx < 0 && turtle.x - TURTLE_R < rEdge + pH && turtle.x > rEdge) {
              turtle.x = rEdge + pH + TURTLE_R;
              turtle.vx = Math.abs(turtle.vx) * 0.65;
              sfxBounce(); triggerShake(2, 4);
            }
          }
        }
      }
    }

    // Bubble landing check
    for (let i = currentBubble + 1; i < Math.min(currentBubble + 6, bubbles.length); i++) {
      const b = bubbles[i];
      const dx = turtle.x - b.x;
      const dy = turtle.y - b.worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < b.radius + TURTLE_R * 0.4) {
        if (b.hasRock && turtle.vy > 0 && turtle.y < b.worldY - b.radius * 0.3) continue;
        landOnBubble(i);
        return;
      }
    }

    // Win check during flight
    if (turtle.y >= SEA_SURFACE_Y) { gameState = 'win'; gameWin(); return; }

    // Death
    if (turtle.y < deathY) { gameOver(); return; }
    if (currentBubble === -1 && turtle.vy < 0 && turtle.y <= 0) { gameOver(); return; }

    } // end else (not bounced by jelly)
  }

  // Camera
  if (gameState === 'aiming' || gameState === 'flying') {
    const focusY = gameState === 'flying'
      ? Math.max(currentBubble >= 0 ? bubbles[currentBubble].worldY : 0, turtle.y)
      : turtle.y;
    const target = focusY - H * 0.55;
    cameraY += (target - cameraY) * 0.07;
  }

  // Skip toast timer
  if (skipToast.timer > 0) skipToast.timer--;

  // Jellyfish bobbing update
  for (let j = 0; j < jellies.length; j++) {
    const jf = jellies[j];
    jf.x = jf.baseX + Math.sin(frameCount * 0.01 + jf.movePhase) * 20;
  }

  // Current zone particles
  for (let i = currentParticles.length - 1; i >= 0; i--) {
    const cp = currentParticles[i];
    cp.x += cp.vx; cp.life -= 0.02;
    if (cp.life <= 0 || cp.x < -20 || cp.x > W + 20) currentParticles.splice(i, 1);
  }
  // Spawn new current particles
  for (let c = 0; c < currentZones.length; c++) {
    const cz = currentZones[c];
    const czScreenTop = w2sy(cz.endY);
    const czScreenBot = w2sy(cz.startY);
    if (czScreenBot > -50 && czScreenTop < H + 50 && Math.random() < 0.3) {
      currentParticles.push({
        x: cz.direction > 0 ? -5 : W + 5,
        y: czScreenTop + Math.random() * (czScreenBot - czScreenTop),
        vx: cz.direction * (2 + cz.strength * 3),
        life: 1,
        len: 8 + Math.random() * 15
      });
    }
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.04;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Shake
  if (shakeTimer > 0) {
    shakeTimer--;
    shakeX = (Math.random() - 0.5) * shakeForce * 2;
    shakeY = (Math.random() - 0.5) * shakeForce * 2;
  } else { shakeX = 0; shakeY = 0; }

  if (landingAnim > 0) landingAnim--;
  if (invincible > 0) invincible--;
}

// =====================================================
// LAND ON BUBBLE
// =====================================================
function landOnBubble(idx) {
  currentBubble = idx;
  const b = bubbles[idx];
  turtle.x = b.x; turtle.y = b.worldY;
  turtle.vx = 0; turtle.vy = 0;
  b.reached = true;
  b.popAnim = 15;
  bubblesReached++;

  progress = calcProgress();
  sfxLand(); triggerShake(2, 4);
  landingAnim = 15;
  spawnParticles(w2sx(b.x), w2sy(b.worldY), 10, 170);
  updateHud();

  // Skip-bubble bonus detection
  const skipped = idx - lastLandedBubble - 1;
  if (lastLandedBubble >= 0 && skipped >= 1) {
    let skipText, skipHue;
    if (skipped >= 3)      { skipText = '跳级! x3!'; skipHue = 50; }
    else if (skipped >= 2) { skipText = '跳级! x2!'; skipHue = 170; }
    else                   { skipText = '跳级!';      skipHue = 120; }
    skipToast = { text: skipText, timer: 70, x: w2sx(b.x), y: w2sy(b.worldY) - 40 };
    spawnParticles(w2sx(b.x), w2sy(b.worldY), 6, skipHue);
  }
  lastLandedBubble = idx;

  // Start crack timer if bubble is cracking
  if (b.cracking && !b.crackStarted) {
    b.crackStarted = true;
    b.crackTimer = 420; // 7 seconds at 60fps
  }

  // Phase announcements (removed)

  // Win: turtle reached sea surface
  if (turtle.y >= SEA_SURFACE_Y) { gameState = 'win'; gameWin(); return; }

  gameState = 'aiming';
}

// =====================================================
// GAME OVER
// =====================================================
function gameOver() {
  // Revive if lives remaining
  if (lives > 0) {
    lives--;
    sfxShield(); triggerShake(4, 8);
    spawnParticles(w2sx(turtle.x), w2sy(turtle.y), 12, 0);
    gToast('复活！剩余 ' + (lives >= 999 ? '∞' : lives) + ' 次');
    // Return to current bubble
    if (currentBubble >= 0) {
      const b = bubbles[currentBubble];
      turtle.x = b.x; turtle.y = b.worldY;
      // Restart crack timer if it's a cracking bubble
      if (b.cracking && !b.crackStarted) {
        b.crackStarted = true;
        b.crackTimer = 420;
      }
    } else {
      turtle.x = W / 2; turtle.y = 0;
    }
    turtle.vx = 0; turtle.vy = 0;
    invincible = 90; // 1.5s invincibility
    gameState = 'aiming';
    updateHud();
    return;
  }

  gameState = 'dead';
  sfxDeath(); triggerShake(8, 18); bgmStop();
  spawnParticles(w2sx(turtle.x), w2sy(turtle.y), 20, 0);

  attempts++;
  localStorage.setItem('turtleAttempts', String(attempts));
  recordProgress(progress);

  const isNewBest = progress > bestProgress;
  if (isNewBest) {
    bestProgress = Math.floor(progress);
    localStorage.setItem('turtleBestProg', String(bestProgress));
  }
  submitScore(Math.floor(progress * 100));

  setTimeout(() => {
    const ov = document.getElementById('overOverlay');
    document.getElementById('overTitle').textContent =
      isNewBest && progress > 10 ? '🎉 新纪录！' : '掉下去了！';
    document.getElementById('finalScore').textContent = Math.floor(progress) + '%';
    document.getElementById('finalTime').textContent =
      Math.floor((Date.now() - gameStartTime) / 1000) + 's';

    document.getElementById('bestScoreOver').innerHTML = isNewBest && progress > 10
      ? '<span class="new-record">🎉 新纪录！</span> 最远: <span class="val">' + bestProgress + '%</span>'
      : '最远: <span class="val">' + bestProgress + '%</span>';

    const taunt = document.getElementById('nearMissTaunt');
    if (progress >= 90) taunt.textContent = '都 ' + Math.floor(progress) + '% 了！！就差最后一点！';
    else if (progress >= 70) taunt.textContent = '就差一点就到海面了！再试一次！';
    else if (progress >= 50) taunt.textContent = '已经过半了，你可以的！';
    else taunt.textContent = '';

    document.getElementById('beatPct').innerHTML =
      '你超过了 <b>' + calcBeatPct(progress) + '%</b> 的玩家';
    renderMilestoneBar(progress);
    document.getElementById('overReward').textContent =
      '🪙 +' + Math.floor(progress / 5) + ' 龟币';

    document.getElementById('hud').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';
    document.getElementById('lbPanel').style.display = '';
    ov.classList.remove('hidden');
    renderLB();
  }, 700);
}

// =====================================================
// WIN
// =====================================================
function gameWin() {
  bgmStop(); sfxMilestone();
  bestProgress = 100;
  localStorage.setItem('turtleBestProg', '100');
  attempts++;
  localStorage.setItem('turtleAttempts', String(attempts));
  recordProgress(100);
  submitScore(10000);

  setTimeout(() => {
    const ov = document.getElementById('overOverlay');
    document.getElementById('overTitle').textContent = '🎉 成功出海！！！';
    document.getElementById('finalScore').textContent = '100%';
    document.getElementById('finalTime').textContent =
      Math.floor((Date.now() - gameStartTime) / 1000) + 's';
    document.getElementById('bestScoreOver').innerHTML =
      '<span class="new-record">🏆 通关！</span>';
    document.getElementById('nearMissTaunt').textContent = '🐢 龟龟成功浮出海面！';
    document.getElementById('beatPct').innerHTML = '你超过了 <b>99.9%</b> 的玩家';
    document.getElementById('overReward').textContent = '🪙 +50 龟币';
    renderMilestoneBar(100);
    document.getElementById('hud').style.display = 'none';
    document.getElementById('pauseBtn').style.display = 'none';
    document.getElementById('lbPanel').style.display = '';
    ov.classList.remove('hidden');
    renderLB();
    gameState = 'dead'; // stop game loop
  }, 1200);
}

// =====================================================
// MILESTONE BAR / SCORE HISTORY
// =====================================================
function renderMilestoneBar(pct) {
  const el = document.getElementById('milestoneProgress');
  const p = Math.floor(pct);
  const c = p >= 80 ? 'var(--g)' : p >= 50 ? 'var(--b)' : 'var(--y)';
  el.innerHTML =
    '<div style="background:rgba(255,255,255,.06);border-radius:8px;height:14px;overflow:hidden;position:relative;">' +
    '<div style="background:' + c + ';height:100%;width:' + p + '%;border-radius:8px;transition:width .5s;"></div>' +
    '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-family:Fredoka;font-weight:700;color:var(--ink);">' + p + '%</div></div>';
}

function recordProgress(prog) {
  let h = JSON.parse(localStorage.getItem('turtleProgHist') || '[]');
  h.push(prog);
  if (h.length > 200) h = h.slice(-200);
  localStorage.setItem('turtleProgHist', JSON.stringify(h));
}

function calcBeatPct(prog) {
  const h = JSON.parse(localStorage.getItem('turtleProgHist') || '[]');
  if (h.length < 3) {
    if (prog >= 80) return 99;
    if (prog >= 50) return 90;
    if (prog >= 25) return 70;
    return Math.floor(prog * 2);
  }
  return Math.floor(h.filter(s => prog > s).length / h.length * 100);
}

// =====================================================
// RENDER
// =====================================================
function render() {
  ctx.save();
  ctx.translate(shakeX, shakeY);

  // --- Background with multi-layer parallax ---
  // t: 0=sea floor, 1=sea surface
  const t = Math.min(1, Math.max(0, cameraY / SEA_SURFACE_Y));

  // 3 parallax speeds (far=slow, near=fast)
  const pFar  = cameraY * 0.08;
  const pMid  = cameraY * 0.25;
  const pNear = cameraY * 0.5;

  // ============ DEPTH GRADIENT — vertical gradient across entire screen ============
  // Maps the camera view to a smooth ocean depth gradient:
  //   deep (t≈0): near-black navy  →  mid (t≈0.5): ocean blue  →  surface (t≈1): bright teal/cyan
  // The gradient covers the screen top-to-bottom so the upper part is always lighter (closer to surface).
  {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    // "t" = overall depth, but screen top is shallower than screen bottom
    // tTop/tBot represent the depth at top/bottom of viewport
    const viewSpan = 0.08; // how much depth one screen-height represents
    const tTop = Math.min(1, t + viewSpan);
    const tBot = Math.max(0, t - viewSpan);

    // Color function: depth 0→1 maps dark navy → ocean blue → bright cyan
    function depthColor(d) {
      let r, g, b;
      if (d < 0.15) {       // abyss: near-black
        const s = d / 0.15;
        r = 3 + s * 4;   g = 6 + s * 12;  b = 16 + s * 18;
      } else if (d < 0.35) { // deep ocean: dark blue-green
        const s = (d - 0.15) / 0.2;
        r = 7 + s * 5;   g = 18 + s * 25;  b = 34 + s * 30;
      } else if (d < 0.55) { // mid ocean: rich blue
        const s = (d - 0.35) / 0.2;
        r = 12 + s * 8;  g = 43 + s * 40;  b = 64 + s * 45;
      } else if (d < 0.75) { // upper ocean: teal
        const s = (d - 0.55) / 0.2;
        r = 20 + s * 15; g = 83 + s * 50;  b = 109 + s * 40;
      } else {               // near surface: bright cyan
        const s = (d - 0.75) / 0.25;
        r = 35 + s * 40;  g = 133 + s * 60; b = 149 + s * 55;
      }
      return 'rgb(' + Math.floor(r) + ',' + Math.floor(g) + ',' + Math.floor(b) + ')';
    }

    grad.addColorStop(0, depthColor(tTop));
    grad.addColorStop(0.3, depthColor(t + viewSpan * 0.4));
    grad.addColorStop(0.5, depthColor(t));
    grad.addColorStop(0.7, depthColor(t - viewSpan * 0.4));
    grad.addColorStop(1, depthColor(tBot));

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Store mid-screen color for use by ground fade later
    var _dc = depthColor(t);
    var _m = _dc.match(/\d+/g);
    var bgR = +_m[0], bgG = +_m[1], bgB = +_m[2];
  }

  // ============ CAUSTICS — underwater light ripples ============
  // Visible from 5–85% depth, fades near floor and surface
  if (t > 0.03 && t < 0.85) {
    const causticAlpha = (t < 0.12 ? (t - 0.03) / 0.09 : 1) * (t > 0.7 ? (0.85 - t) / 0.15 : 1) * 0.07;
    ctx.globalAlpha = causticAlpha;
    ctx.strokeStyle = '#7fdbca';
    ctx.lineWidth = 1.5;
    const cTime = frameCount * 0.012;
    const cScroll = pFar * 0.3;
    for (let ci = 0; ci < 5; ci++) {
      ctx.beginPath();
      const baseY = (ci * H * 0.22 + cScroll) % (H + 60) - 30;
      for (let cx = 0; cx <= W; cx += 6) {
        const cy = baseY
          + Math.sin(cx * 0.015 + cTime + ci * 1.7) * 18
          + Math.sin(cx * 0.033 + cTime * 1.4 + ci * 0.9) * 10;
        if (cx === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    for (let ci = 0; ci < 4; ci++) {
      ctx.beginPath();
      const baseY = (ci * H * 0.28 + 80 + cScroll * 0.8) % (H + 60) - 30;
      for (let cx = 0; cx <= W; cx += 6) {
        const cy = baseY
          + Math.sin(cx * 0.02 - cTime * 0.9 + ci * 2.3) * 15
          + Math.cos(cx * 0.04 + cTime * 1.1 + ci * 1.1) * 8;
        if (cx === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // (distant silhouettes removed)

  // ============ BACKGROUND: 海面bg (surface sky) ============
  // Fixed to sea surface position, only visible when turtle is near the top.
  if (t > 0.75 && bgSurface.complete && bgSurface.naturalWidth) {
    const surfAlpha = Math.min(0.85, (t - 0.75) / 0.2);
    ctx.globalAlpha = surfAlpha;
    const iw = bgSurface.naturalWidth;
    const ih = bgSurface.naturalHeight;
    const drawW = W;
    const drawH = Math.ceil(ih * (W / iw));
    // Image bottom edge = sea surface line
    const surfScreenY = w2sy(SEA_SURFACE_Y);
    ctx.drawImage(bgSurface, 0, surfScreenY - drawH, drawW, drawH);
    ctx.globalAlpha = 1;
  }

  // ============ LIGHT RAYS (enhanced — variable width, flicker, depth-aware) ============
  {
    const rayBaseAlpha = 0.012 + t * 0.08;
    for (let i = 0; i < 8; i++) {
      // Per-ray flicker
      const flicker = 0.7 + 0.3 * Math.sin(frameCount * 0.02 + i * 3.7);
      ctx.globalAlpha = rayBaseAlpha * flicker * (i < 6 ? 1 : 0.5);
      ctx.fillStyle = t > 0.6 ? 'rgba(200,235,255,1)' : 'rgba(180,230,240,1)';
      const rx = W * 0.06 + i * W * 0.13 + Math.sin(frameCount * 0.003 + i * 1.1 + pFar * 0.001) * 35;
      const topW = 8 + i % 3 * 4 + Math.sin(frameCount * 0.008 + i) * 3;
      const spread = 30 + t * 30 + Math.sin(frameCount * 0.006 + i * 0.7) * 18 + (i % 2) * 15;
      ctx.beginPath();
      ctx.moveTo(rx - topW, 0); ctx.lineTo(rx + topW, 0);
      ctx.lineTo(rx + spread, H);
      ctx.lineTo(rx - spread, H);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ============ FLOATING MICRO-PARTICLES — dense plankton/dust ============
  {
    const microCount = 25 + Math.floor(t * 15);
    ctx.globalAlpha = 0.15 + t * 0.1;
    for (let i = 0; i < microCount; i++) {
      const seed = i * 97.31;
      const seed2 = i * 53.17;
      // Slow independent drift
      const mx = (seed + Math.sin(frameCount * 0.003 + i * 0.37) * 25 + frameCount * (0.02 + (i % 5) * 0.005)) % W;
      const my = ((seed2 * 1.7 - pMid * 0.15 + Math.cos(frameCount * 0.004 + i * 0.6) * 20) % (H + 40) + H + 40) % (H + 40) - 20;
      const mr = 0.6 + (i % 4) * 0.4;
      const bright = 0.3 + 0.7 * Math.sin(frameCount * 0.015 + i * 1.9);
      ctx.fillStyle = 'rgba(180,230,240,' + (0.2 + bright * 0.3) + ')';
      ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ============ RISING BUBBLES (existing, slightly enhanced) ============
  const bubCount = 10 + Math.floor(t * 10);
  ctx.globalAlpha = 0.06 + t * 0.07;
  ctx.fillStyle = t > 0.6 ? '#8ae0ff' : '#4aa0c0';
  for (let i = 0; i < bubCount; i++) {
    const seed = i * 137.508;
    const bx = (seed + Math.sin(frameCount * 0.008 + i * 0.5) * 15) % W;
    const by = ((seed * 2.3 - pNear * 0.2 - frameCount * (0.2 + i * 0.03)) % (H + 80) + H + 80) % (H + 80) - 40;
    const br = 2 + (i % 5) * 1.5;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    // Specular highlight
    ctx.fillStyle = 'rgba(255,255,255,' + (0.1 + t * 0.06) + ')';
    ctx.beginPath(); ctx.arc(bx - br * 0.3, by - br * 0.3, br * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t > 0.6 ? '#8ae0ff' : '#4aa0c0';
  }
  ctx.globalAlpha = 1;

  // --- Sea surface line ---
  const surfaceSY = w2sy(SEA_SURFACE_Y);
  if (surfaceSY > -50 && surfaceSY < H + 50) {
    // Wavy water surface
    ctx.strokeStyle = 'rgba(76,201,240,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let wx = 0; wx <= W; wx += 4) {
      const wy = surfaceSY + Math.sin(wx * 0.03 + frameCount * 0.04) * 5;
      if (wx === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
    }
    ctx.stroke();
    // Sky above surface
    if (surfaceSY > 0) {
      const skyGrad = ctx.createLinearGradient(0, 0, 0, surfaceSY);
      skyGrad.addColorStop(0, 'rgba(135,206,250,0.4)');
      skyGrad.addColorStop(1, 'rgba(76,201,240,0.1)');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, surfaceSY);
    }
    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 11px Fredoka';
    ctx.textAlign = 'center';
    ctx.fillText('🌊 海面 🌊', W / 2, surfaceSY - 12);
  }

  // (ambient bubbles integrated into near-layer rising bubbles above)

  // ============ VIGNETTE — deep-sea dark corners ============
  // Stronger in deep water, fades as turtle approaches surface
  {
    const vigStrength = Math.max(0, 0.45 - t * 0.4);
    if (vigStrength > 0.01) {
      const cx = W / 2, cy = H / 2;
      const outerR = Math.max(W, H) * 0.75;
      const innerR = Math.min(W, H) * 0.35;
      const vigGrad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(0.6, 'rgba(0,5,15,' + (vigStrength * 0.3).toFixed(3) + ')');
      vigGrad.addColorStop(1, 'rgba(0,5,15,' + vigStrength.toFixed(3) + ')');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // (walls visual removed — bounce logic still active)

  // --- Ground (海底bg) — 60% screen height below ground line ---
  const gndSY = w2sy(0);
  if (gndSY < H + 30) {
    if (bgDeep.complete && bgDeep.naturalWidth) {
      const gndW = W;
      const gndH = H * 0.7; // 70% of screen height, all below ground line
      ctx.drawImage(bgDeep, 0, gndSY, gndW, gndH);
      // Gradient fade at top edge: blend into depth gradient above
      const fadeH = 60;
      const fadeGrad = ctx.createLinearGradient(0, gndSY, 0, gndSY + fadeH);
      fadeGrad.addColorStop(0, 'rgb(' + Math.floor(bgR) + ',' + Math.floor(bgG) + ',' + Math.floor(bgB) + ')');
      fadeGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fadeGrad;
      ctx.fillRect(0, gndSY, W, fadeH);
    } else {
      ctx.fillStyle = '#1a120a';
      ctx.fillRect(0, gndSY, W, H - gndSY + 100);
    }
    if (currentBubble === -1 && gameState === 'aiming') {
      ctx.fillStyle = 'rgba(6,214,160,0.3)';
      ctx.fillRect(W / 2 - 30, gndSY - 4, 60, 4);
    }
  }

  // --- Bubbles ---
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    const sx = w2sx(b.x), sy = w2sy(b.worldY);
    if (sy < -80 || sy > H + 80) continue;

    const isNext = (i === currentBubble + 1);
    const isReached = b.reached;

    // Rock barrier below bubble
    if (b.hasRock) {
      const rsy = w2sy(b.worldY - b.radius * 0.7);
      const rw = b.radius * 1.15;
      ctx.fillStyle = '#5a4a3a';
      ctx.beginPath();
      ctx.moveTo(sx - rw, rsy - 6); ctx.lineTo(sx + rw, rsy - 6);
      ctx.lineTo(sx + rw - 3, rsy + 6); ctx.lineTo(sx - rw + 3, rsy + 6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(80,60,40,0.5)'; ctx.beginPath();
      ctx.moveTo(sx - rw * 0.4, rsy - 3);
      ctx.lineTo(sx - rw * 0.1, rsy + 2);
      ctx.lineTo(sx + rw * 0.2, rsy - 1);
      ctx.stroke();
    }

    // Plank barriers attached to bubble (90%+ phase)
    if (b.hasPlank) {
      const r = b.radius;
      const plankH = 6;  // thickness of plank

      // --- Bottom plank: seals the bottom of the bubble ---
      const botY = w2sy(b.worldY) + r;
      ctx.fillStyle = '#5a4430';
      ctx.fillRect(sx - r, botY - plankH / 2, r * 2, plankH);
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1;
      ctx.strokeRect(sx - r, botY - plankH / 2, r * 2, plankH);
      // Wood grain
      ctx.strokeStyle = 'rgba(90,68,48,0.45)';
      for (let gx = sx - r + 5; gx < sx + r; gx += 8) {
        ctx.beginPath(); ctx.moveTo(gx, botY - 2); ctx.lineTo(gx + 2, botY + 2); ctx.stroke();
      }

      // --- Side planks: cover bottom 30% of bubble, one side has a gap ---
      const sideH = r * 0.9;  // 30% coverage of bubble height
      const sideTopY = w2sy(b.worldY) + r * 0.1;  // starts slightly below center

      // Left side plank (gap if plankGapSide === 0)
      if (b.plankGapSide !== 0) {
        const lx = sx - r - plankH / 2;
        ctx.fillStyle = '#5a4430';
        ctx.fillRect(lx, sideTopY, plankH, sideH);
        ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1;
        ctx.strokeRect(lx, sideTopY, plankH, sideH);
        ctx.strokeStyle = 'rgba(90,68,48,0.45)';
        for (let gy = sideTopY + 4; gy < sideTopY + sideH; gy += 8) {
          ctx.beginPath(); ctx.moveTo(lx + 1, gy); ctx.lineTo(lx + plankH - 1, gy + 2); ctx.stroke();
        }
      }

      // Right side plank (gap if plankGapSide === 1)
      if (b.plankGapSide !== 1) {
        const rx = sx + r - plankH / 2;
        ctx.fillStyle = '#5a4430';
        ctx.fillRect(rx, sideTopY, plankH, sideH);
        ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1;
        ctx.strokeRect(rx, sideTopY, plankH, sideH);
        ctx.strokeStyle = 'rgba(90,68,48,0.45)';
        for (let gy = sideTopY + 4; gy < sideTopY + sideH; gy += 8) {
          ctx.beginPath(); ctx.moveTo(rx + 1, gy); ctx.lineTo(rx + plankH - 1, gy + 2); ctx.stroke();
        }
      }
    }

    // Next-bubble glow
    if (isNext) {
      ctx.globalAlpha = 0.12 + Math.sin(frameCount * 0.08) * 0.08;
      ctx.fillStyle = '#4cc9f0';
      ctx.beginPath(); ctx.arc(sx, sy, b.radius + 10, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Bubble body
    const shimmer = Math.sin(frameCount * 0.04 + i * 0.7) * 0.08;
    ctx.globalAlpha = isReached ? 0.25 : (0.45 + shimmer);

    // Cracking bubble: color shift based on timer
    let bubbleColor;
    if (b.cracking && b.crackStarted) {
      const crackPct = 1 - b.crackTimer / 420;
      const r = Math.floor(180 + crackPct * 75);
      const g = Math.floor(60 - crackPct * 40);
      const bC = Math.floor(60 - crackPct * 40);
      bubbleColor = 'rgba(' + r + ',' + g + ',' + bC + ',0.55)';
    } else if (b.cracking && !b.crackStarted) {
      bubbleColor = 'rgba(180,60,60,0.5)';
    } else {
      bubbleColor = isReached ? 'rgba(6,214,160,0.35)'
        : isNext ? 'rgba(76,201,240,0.6)' : 'rgba(58,154,191,0.45)';
    }
    ctx.fillStyle = bubbleColor;
    ctx.beginPath(); ctx.arc(sx, sy, b.radius, 0, Math.PI * 2); ctx.fill();

    // Highlight
    ctx.globalAlpha = isReached ? 0.1 : 0.3;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(sx - b.radius * 0.3, sy - b.radius * 0.3, b.radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Border
    ctx.strokeStyle = isReached ? 'rgba(6,214,160,0.3)'
      : isNext ? 'rgba(76,201,240,0.8)' : 'rgba(58,154,191,0.35)';
    ctx.lineWidth = isNext ? 2.5 : 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, b.radius, 0, Math.PI * 2); ctx.stroke();


    // Pop animation
    if (b.popAnim > 0) {
      b.popAnim--;
      ctx.globalAlpha = b.popAnim / 15 * 0.4;
      ctx.strokeStyle = '#06d6a0'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, b.radius + (15 - b.popAnim) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Cracking bubble visual: crack lines + timer bar
    if (b.cracking && b.crackStarted) {
      const crackPct = 1 - b.crackTimer / 420;
      // Crack lines (grow as timer progresses)
      ctx.globalAlpha = 0.5 + crackPct * 0.4;
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 1 + crackPct * 1.5;
      const numCracks = Math.floor(2 + crackPct * 5);
      for (let ci = 0; ci < numCracks; ci++) {
        const ca = (ci / numCracks) * Math.PI * 2 + b.movePhase;
        const cLen = b.radius * (0.3 + crackPct * 0.5);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        const mx = sx + Math.cos(ca + 0.3) * cLen * 0.5;
        const my = sy + Math.sin(ca + 0.3) * cLen * 0.5;
        ctx.lineTo(mx, my);
        ctx.lineTo(mx + Math.cos(ca - 0.5) * cLen * 0.4, my + Math.sin(ca - 0.5) * cLen * 0.4);
        ctx.stroke();
      }

      // Timer bar above bubble
      const barW = b.radius * 1.6;
      const barH = 5;
      const barX = sx - barW / 2;
      const barY = sy - b.radius - 14;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(barX, barY, barW, barH);
      const remaining = b.crackTimer / 420;
      const timerColor = remaining > 0.5 ? '#4cc9f0' : remaining > 0.25 ? '#ffd93d' : '#ff6b6b';
      ctx.fillStyle = timerColor;
      ctx.fillRect(barX, barY, barW * remaining, barH);
      ctx.globalAlpha = 1;
    } else if (b.cracking && !b.crackStarted && !isReached) {
      // Hint: small crack icon on unactivated cracking bubbles
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#aaa';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - 3, sy - 2); ctx.lineTo(sx + 1, sy + 4); ctx.lineTo(sx + 4, sy);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // --- Gameplay Jellyfish (obstacles) ---
  for (let j = 0; j < jellies.length; j++) {
    const jf = jellies[j];
    const bob = Math.sin(frameCount * 0.03 + jf.bobPhase) * 12;
    const jfSX = w2sx(jf.x);
    const jfSY = w2sy(jf.worldY + bob);
    if (jfSY < -60 || jfSY > H + 60) continue;

    const pulse = 1 + Math.sin(frameCount * 0.05 + j) * 0.1;
    const r = jf.radius;

    // Bell (pink/purple translucent)
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = j % 2 === 0 ? 'rgba(220,140,255,0.7)' : 'rgba(255,140,180,0.7)';
    ctx.beginPath();
    ctx.ellipse(jfSX, jfSY, r * pulse, r * 0.7 * pulse, 0, Math.PI, 0);
    ctx.fill();

    // Inner glow
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(jfSX, jfSY - r * 0.15, r * 0.4, r * 0.3, 0, Math.PI, 0);
    ctx.fill();

    // Tentacles
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = j % 2 === 0 ? '#c88aff' : '#ff8aaa';
    ctx.lineWidth = 1.5;
    for (let ti = -2; ti <= 2; ti++) {
      ctx.beginPath();
      ctx.moveTo(jfSX + ti * (r * 0.3), jfSY);
      const wave = Math.sin(frameCount * 0.04 + j * 2 + ti) * 6;
      ctx.quadraticCurveTo(
        jfSX + ti * (r * 0.3) + wave,
        jfSY + r * 0.6,
        jfSX + ti * (r * 0.2) + wave * 0.7,
        jfSY + r * 1.1
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // --- Current zone particles (horizontal streaks) ---
  ctx.strokeStyle = '#6ad0f0';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < currentParticles.length; i++) {
    const cp = currentParticles[i];
    ctx.globalAlpha = cp.life * 0.35;
    ctx.beginPath();
    ctx.moveTo(cp.x, cp.y);
    ctx.lineTo(cp.x - cp.vx * cp.len * 0.3, cp.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // --- Flight trail ---
  if (gameState === 'flying' && flyTrail.length > 1) {
    for (let i = 0; i < flyTrail.length; i++) {
      const t = flyTrail[i];
      ctx.globalAlpha = (i / flyTrail.length) * 0.25;
      ctx.fillStyle = activePet.color;
      ctx.beginPath();
      ctx.arc(w2sx(t.x), w2sy(t.y), TURTLE_R * (0.3 + (i / flyTrail.length) * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- Turtle ---
  const tSX = w2sx(turtle.x), tSY = w2sy(turtle.y);
  if (gameState !== 'dead') {
    // Invincibility blink
    if (invincible > 0 && Math.floor(invincible / 4) % 2 === 0) {
      // skip drawing every other 4 frames = blink effect
    } else {
    ctx.save();
    ctx.translate(tSX, tSY);
    let scX = 1, scY = 1;
    if (landingAnim > 0) { const t = landingAnim / 15; scX = 1 + 0.25 * t; scY = 1 - 0.18 * t; }
    let rot = 0;
    if (gameState === 'flying') rot = Math.atan2(turtle.vx, turtle.vy) * 0.4;
    ctx.rotate(rot); ctx.scale(scX, scY);

    const pImg = petImages[activePet.id];
    if (pImg && pImg.complete && pImg.naturalWidth > 0) {
      // Draw pet image centered on turtle position
      const imgSize = TURTLE_R * 2.6;
      ctx.drawImage(pImg, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
    } else {
      // Fallback: colored circle turtle
      ctx.fillStyle = activePet.color;
      ctx.beginPath(); ctx.arc(0, 0, TURTLE_R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = activePet.shellColor || '#059a74';
      ctx.beginPath(); ctx.arc(0, 2, TURTLE_R * 0.68, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-5, -2); ctx.lineTo(0, 6); ctx.lineTo(5, -2); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-6, -7, 4, 0, Math.PI * 2); ctx.arc(6, -7, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(-5, -7, 2, 0, Math.PI * 2); ctx.arc(7, -7, 2, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
    } // end invincibility blink else
  }

  // --- Angle indicator ---
  if (gameState === 'aiming') {
    const len = 65;
    const ex = tSX + Math.sin(angle) * len;
    const ey = tSY - Math.cos(angle) * len;

    // Arc bg
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tSX, tSY, len - 8, -Math.PI / 2 + ANGLE_MIN, -Math.PI / 2 + ANGLE_MAX);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Dashed aim line
    ctx.strokeStyle = 'rgba(255,217,61,0.75)'; ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(tSX, tSY); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead
    const aAng = Math.atan2(ey - tSY, ex - tSX);
    ctx.fillStyle = '#ffd93d';
    ctx.beginPath(); ctx.moveTo(ex, ey);
    ctx.lineTo(ex - Math.cos(aAng - 0.45) * 9, ey - Math.sin(aAng - 0.45) * 9);
    ctx.lineTo(ex - Math.cos(aAng + 0.45) * 9, ey - Math.sin(aAng + 0.45) * 9);
    ctx.closePath(); ctx.fill();

    // Hint for first jumps
    if (currentBubble < 2 && frameCount % 80 < 50) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 12px Fredoka'; ctx.textAlign = 'center';
      ctx.fillText('点击跳跃!', tSX, tSY + TURTLE_R + 28);
    }
  }

  // --- Particles ---
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = 'hsl(' + p.hue + ',75%,65%)';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * Math.max(0, p.life), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // --- Progress bar ---
  if (gameState === 'aiming' || gameState === 'flying') {
    const barW = W * 0.55, barH = 14;
    const barX = (W - barW) / 2, barY = H - 30;

    // Bg
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    drawRoundedRect(barX, barY, barW, barH, barH / 2);
    ctx.fill();

    // Fill
    const fillW = Math.max(barH, barW * (progress / 100));
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, '#06d6a0'); grad.addColorStop(0.5, '#4cc9f0'); grad.addColorStop(1, '#ffd93d');
    ctx.fillStyle = grad;
    drawRoundedRect(barX, barY, fillW, barH, barH / 2);
    ctx.fill();

    // Urgency pulse (graduated from 50%+)
    if (progress >= 50) {
      const urgency = progress >= 90 ? 0.25 : progress >= 80 ? 0.18 : progress >= 70 ? 0.12 : 0.06;
      ctx.globalAlpha = urgency + Math.sin(frameCount * 0.15) * urgency * 0.6;
      ctx.strokeStyle = progress >= 80 ? '#ff6b6b' : '#ffa040'; ctx.lineWidth = 2;
      drawRoundedRect(barX - 1, barY - 1, barW + 2, barH + 2, barH / 2 + 1);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Label
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px Fredoka'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.floor(progress) + '%  出海进度', W / 2, barY + barH / 2);

    // Phase markers
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#fff';
    for (const ph of [5, 25, 50, 80]) {
      ctx.fillRect(barX + barW * (ph / 100) - 0.5, barY + 1, 1, barH - 2);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// Rounded rect helper (no roundRect API dependency)
function drawRoundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// =====================================================
// BEST SCORE ON START
// =====================================================
function showBestOnStart() {
  const el = document.getElementById('bestScoreStart');
  if (bestProgress > 0) {
    el.innerHTML = '最远: <span class="val">' + bestProgress + '%</span> · 尝试 ' + attempts + ' 次';
  } else el.innerHTML = '';
}
showBestOnStart();

// =====================================================
// PET SELECTOR
// =====================================================
function buildSkinBar() {
  const bar = document.getElementById('skinBar');
  bar.innerHTML = PETS.map((p, i) => {
    const rc = p.rank.toLowerCase();
    const imgHtml = p.img
      ? '<img class="skin-img" src="' + p.img + '" alt="' + p.name + '">'
      : '<div class="skin-emoji">' + p.emoji + '</div>';
    return '<div class="skin-slot ' + (p.id === activePet.id ? 'on' : '') +
      '" onclick="selectPet(' + i + ')">' +
      imgHtml +
      '<div class="skin-name">' + p.name + '</div>' +
      '<div class="skin-rank rank-' + rc + '">' + p.rank + '</div></div>';
  }).join('');
  updateSkinInfo();
}

function updateStartIcon() {
  const el = document.getElementById('startIcon');
  if (!el) return;
  if (activePet.img) {
    el.innerHTML = '<img src="' + activePet.img + '" style="width:64px;height:64px;object-fit:contain;">';
  } else {
    el.textContent = activePet.emoji;
  }
}

function updateSkinInfo() {
  const el = document.getElementById('activeSkinInfo');
  const rc = activePet.rank.toLowerCase();
  const iconHtml = activePet.img
    ? '<img src="' + activePet.img + '" style="width:20px;height:20px;object-fit:contain;vertical-align:middle;">'
    : activePet.emoji;
  el.innerHTML = iconHtml + ' ' + activePet.name +
    ' <span class="ability-tag" style="color:var(--' +
    (rc === 'sss' ? 'r' : rc === 'ss' ? 'y' : rc === 's' ? 'p' : rc === 'test' ? 'g' : 'b') +
    ');background:rgba(255,255,255,.06);">' + activePet.desc + '</span>';
}

function selectPet(idx) {
  activePet = PETS[idx];
  buildSkinBar();
  updateStartIcon();
}

buildSkinBar();
updateStartIcon();

// =====================================================
// INITIAL RENDER
// =====================================================
(function() {
  resize();
  ctx.fillStyle = '#06111a';
  ctx.fillRect(0, 0, W, H);
})();
