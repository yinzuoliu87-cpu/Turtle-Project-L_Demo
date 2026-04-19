/* ═══════════════════════════════════════════════════
   龟龟对战 — audio.js
   Web Audio API synthesis, zero external files
   ═══════════════════════════════════════════════════ */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx;
let masterGain = null;
let soundMuted = localStorage.getItem('battleSoundMuted') === '1';
// Per-channel volumes (0..1). SFX feeds masterGain (Web Audio).
// BGM volume is applied separately to the HTMLAudio element.
let _sfxVolume = parseFloat(localStorage.getItem('battleSfxVolume'));
if (!isFinite(_sfxVolume)) _sfxVolume = 0.5;

function _effectiveSfxGain() { return soundMuted ? 0 : _sfxVolume; }

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new AudioCtx();
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(_effectiveSfxGain(), audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);
    // Decode all preloaded SFX buffers now that AudioContext exists
    _decodeAllSfx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function setSfxVolume(v) {
  _sfxVolume = Math.max(0, Math.min(1, v));
  localStorage.setItem('battleSfxVolume', String(_sfxVolume));
  if (masterGain && audioCtx) {
    try { masterGain.gain.linearRampToValueAtTime(_effectiveSfxGain(), audioCtx.currentTime + 0.05); } catch(e) {}
  }
}

function toggleSound() {
  soundMuted = !soundMuted;
  localStorage.setItem('battleSoundMuted', soundMuted ? '1' : '0');
  const btn = document.getElementById('soundBtn');
  const muteBtn = document.getElementById('soundMuteBtn');
  const icon = soundMuted ? '🔇' : '🔊';
  if (btn) btn.textContent = icon;
  if (muteBtn) muteBtn.textContent = icon;
  // Ensure AudioContext is active (iOS Safari suspends on tab switch/lock)
  if (!soundMuted) ensureAudio();
  if (masterGain && audioCtx) {
    try { masterGain.gain.linearRampToValueAtTime(_effectiveSfxGain(), audioCtx.currentTime + 0.1); } catch(e) {}
  }
}

// Open/close the volume panel. Click outside to dismiss.
function toggleSoundPanel(ev) {
  if (ev) ev.stopPropagation();
  const panel = document.getElementById('soundPanel');
  if (!panel) return;
  const opening = !panel.classList.contains('show');
  panel.classList.toggle('show', opening);
  if (opening) {
    // Sync sliders with current values
    const bs = document.getElementById('bgmVolSlider');
    const ss = document.getElementById('sfxVolSlider');
    const bp = document.getElementById('bgmVolPct');
    const sp = document.getElementById('sfxVolPct');
    const mb = document.getElementById('soundMuteBtn');
    if (bs) bs.value = Math.round(_bgmVolume * 100);
    if (ss) ss.value = Math.round(_sfxVolume * 100);
    if (bp) bp.textContent = Math.round(_bgmVolume * 100) + '%';
    if (sp) sp.textContent = Math.round(_sfxVolume * 100) + '%';
    if (mb) mb.textContent = soundMuted ? '🔇' : '🔊';
    // Auto-dismiss on outside click
    setTimeout(() => {
      const onOutside = (e) => {
        if (!panel.contains(e.target) && e.target.id !== 'soundBtn') {
          panel.classList.remove('show');
          document.removeEventListener('click', onOutside);
        }
      };
      document.addEventListener('click', onOutside);
    }, 0);
  }
}

// ── Helper: oscillator + gain shorthand ──
function _osc(type, freq, dur, vol, freqEnd) {
  const c = ensureAudio(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur * 0.8);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + dur);
}

function _noise(dur, vol) {
  const c = ensureAudio(), t = c.currentTime;
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = ((_origMathRandom ? _origMathRandom() : Math.random()) * 2 - 1) * (1 - i / d.length);
  const n = c.createBufferSource(), g = c.createGain();
  n.buffer = buf;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(g); g.connect(masterGain);
  n.start(t);
}

// ═══════════════════════════════════════════════════
// ── SFX file player (Web Audio API buffer — low latency) ──
const _sfxBuffers = {};
const _sfxRawData = {};
function _loadSfx(name, src) {
  // Fetch raw ArrayBuffer immediately; decode when AudioContext is ready
  fetch(src)
    .then(r => r.arrayBuffer())
    .then(buf => {
      _sfxRawData[name] = buf;
      // If AudioContext already exists, decode immediately
      if (audioCtx) _decodeSfx(name);
    })
    .catch(() => {});
}
function _decodeSfx(name) {
  if (_sfxBuffers[name] || !_sfxRawData[name] || !audioCtx) return;
  const raw = _sfxRawData[name];
  delete _sfxRawData[name];
  audioCtx.decodeAudioData(raw)
    .then(decoded => { _sfxBuffers[name] = decoded; })
    .catch(() => {});
}
function _decodeAllSfx() {
  Object.keys(_sfxRawData).forEach(name => _decodeSfx(name));
}
function _playSfx(name, volume) {
  if (soundMuted) return;
  const buf = _sfxBuffers[name];
  if (!buf) return;
  const c = ensureAudio();
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = buf;
  g.gain.setValueAtTime(volume || 0.4, c.currentTime);
  src.connect(g);
  g.connect(masterGain);
  src.start(c.currentTime);
}

// Preload SFX files
_loadSfx('hit-physical', 'assets/sfx/hit-physical.wav');
_loadSfx('hit-crit', 'assets/sfx/hit-crit.wav');
_loadSfx('shield-gain', 'assets/sfx/shield-gain.wav');
_loadSfx('shield-break', 'assets/sfx/shield-break.wav');
_loadSfx('heal', 'assets/sfx/heal.wav');
_loadSfx('defeat', 'assets/sfx/defeat.wav');
_loadSfx('rebirth', 'assets/sfx/rebirth.wav');

// Anti-spam: prevent same sound playing too close together
const _sfxLastPlay = {};
function _playSfxThrottled(name, volume, cooldownMs) {
  const now = Date.now();
  if (_sfxLastPlay[name] && now - _sfxLastPlay[name] < (cooldownMs || 150)) return;
  _sfxLastPlay[name] = now;
  _playSfx(name, volume);
}

// BATTLE SFX
// ═══════════════════════════════════════════════════

// ── Hit: physical attack ──
function sfxHit() {
  _playSfxThrottled('hit-physical', 0.35, 50);
}

// ── Crit: heavier hit ──
function sfxCrit() {
  _playSfxThrottled('hit-crit', 0.5, 50);
}

// ── Pierce (true damage): same as physical hit ──
function sfxPierce() {
  _playSfxThrottled('hit-physical', 0.35, 50);
}

// ── Fire: same as physical hit ──

// ── Shield gain ──
function sfxShield() {
  _playSfxThrottled('shield-gain', 0.35, 100);
}

// ── Shield break ──
function sfxShieldBreak() {
  _playSfxThrottled('shield-break', 0.4, 100);
}

// ── Heal: soft chime ──
function sfxHeal() {
  _playSfxThrottled('heal', 0.35, 100);
}

// ── Death: low crunch ──
function sfxDeath() {
  _osc('sawtooth', 340, 0.35, 0.15, 60);
  _noise(0.15, 0.12);
}

// ── Rebirth: revival ──
function sfxRebirth() {
  _playSfx('rebirth', 0.4);
}

// ── Buff: warm tone ──
function sfxBuff() {
  _osc('sine', 392, 0.15, 0.08, 523);
  _osc('sine', 523, 0.12, 0.06, 659);
}

// ── Debuff: descending ──
function sfxDebuff() {
  _osc('sawtooth', 400, 0.15, 0.08, 200);
}

// ── Dodge: whoosh ──
function sfxDodge() {
  _noise(0.1, 0.08);
  _osc('sine', 800, 0.08, 0.05, 400);
}

// ── Fire/Burn: crackle ──
function sfxFire() {
  _playSfxThrottled('hit-physical', 0.35, 50);
}

// ── Lightning: same as physical hit ──
function sfxLightning() {
  _playSfxThrottled('hit-physical', 0.35, 50);
}

// ── Coin: bling ──
function sfxCoin() {
  _osc('sine', 1047, 0.08, 0.1, 1568);
  _osc('sine', 1319, 0.06, 0.06, 1760);
}

// ── Explosion: boom ──
function sfxExplosion() {
  _noise(0.25, 0.18);
  _osc('sawtooth', 120, 0.3, 0.12, 30);
  _osc('square', 60, 0.2, 0.08, 20);
}

// ── Counter/Reflect: no sound for now ──
function sfxCounter() {
}

// ── Trap trigger: snap ──
function sfxTrap() {
  _noise(0.04, 0.15);
  _osc('square', 800, 0.04, 0.12, 200);
  _osc('triangle', 200, 0.06, 0.08, 100);
}

// ── Battle start: fanfare ──
function sfxBattleStart() {
  const c = ensureAudio(), t = c.currentTime;
  [392, 494, 587, 784].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t + i * 0.1);
    g.gain.setValueAtTime(0.12, t + i * 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.25);
    o.connect(g); g.connect(masterGain);
    o.start(t + i * 0.1); o.stop(t + i * 0.1 + 0.25);
  });
}

// ── Victory: triumphant ──
function sfxVictory() {
  const c = ensureAudio(), t = c.currentTime;
  [523, 659, 784, 1047, 1319].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t + i * 0.12);
    g.gain.setValueAtTime(0.1, t + i * 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.3);
    o.connect(g); g.connect(masterGain);
    o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.3);
  });
}

// ── Defeat ──
function sfxDefeat() {
  _playSfx('defeat', 0.45);
}

// ── Select/Click: soft pop ──
function sfxClick() {
  _osc('sine', 600, 0.05, 0.06, 900);
}

// ── Turn start: tick ──
function sfxTurnStart() {
  _osc('triangle', 523, 0.06, 0.06, 784);
}

// ── Bamboo charge: life drain / absorb feel ──
function sfxBambooCharge() {
  const c = ensureAudio(), t = c.currentTime;
  // Deep drone: low frequency descending hum (life being drained)
  const o1 = c.createOscillator(), g1 = c.createGain();
  o1.type = 'sine';
  o1.frequency.setValueAtTime(220, t);
  o1.frequency.exponentialRampToValueAtTime(80, t + 0.5);
  g1.gain.setValueAtTime(0.12, t);
  g1.gain.linearRampToValueAtTime(0.15, t + 0.2);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  o1.connect(g1); g1.connect(masterGain);
  o1.start(t); o1.stop(t + 0.6);
  // Eerie overtone: slight dissonance for "dark" feel
  const o2 = c.createOscillator(), g2 = c.createGain();
  o2.type = 'triangle';
  o2.frequency.setValueAtTime(330, t);
  o2.frequency.exponentialRampToValueAtTime(110, t + 0.45);
  g2.gain.setValueAtTime(0.06, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  o2.connect(g2); g2.connect(masterGain);
  o2.start(t); o2.stop(t + 0.5);
  // Suction whoosh: filtered noise pulling inward
  const buf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = ((_origMathRandom ? _origMathRandom() : Math.random()) * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const n = c.createBufferSource(), gn = c.createGain(), flt = c.createBiquadFilter();
  n.buffer = buf;
  flt.type = 'lowpass';
  flt.frequency.setValueAtTime(1200, t);
  flt.frequency.exponentialRampToValueAtTime(150, t + 0.45); // descending = pulling in
  flt.Q.value = 3;
  gn.gain.setValueAtTime(0.08, t);
  gn.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  n.connect(flt); flt.connect(gn); gn.connect(masterGain);
  n.start(t);
}
function sfxBambooHit() {
  const c = ensureAudio(), t = c.currentTime;
  // Life steal impact: short low thud + ascending "absorb" tone
  // Thud (impact)
  const o1 = c.createOscillator(), g1 = c.createGain();
  o1.type = 'sine';
  o1.frequency.setValueAtTime(100, t);
  o1.frequency.exponentialRampToValueAtTime(60, t + 0.15);
  g1.gain.setValueAtTime(0.15, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o1.connect(g1); g1.connect(masterGain);
  o1.start(t); o1.stop(t + 0.2);
  // Absorb: ascending tone (life flowing back)
  const o2 = c.createOscillator(), g2 = c.createGain();
  o2.type = 'sine';
  o2.frequency.setValueAtTime(150, t + 0.05);
  o2.frequency.exponentialRampToValueAtTime(400, t + 0.35);
  g2.gain.setValueAtTime(0, t);
  g2.gain.linearRampToValueAtTime(0.1, t + 0.1);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  o2.connect(g2); g2.connect(masterGain);
  o2.start(t + 0.05); o2.stop(t + 0.4);
  // Soft thud
  _osc('triangle', 220, 0.15, 0.08, 110);
}

// ── BGM SYSTEM ──────────────────────────────────────────
let _currentBgm = null;
let _bgmVolume = parseFloat(localStorage.getItem('battleBgmVolume'));
if (!isFinite(_bgmVolume)) _bgmVolume = 0.25;

const BGM_TRACKS = {
  menu: 'assets/bgm-menu.mp3',
  battle: 'assets/bgm-battle.mp3',
  boss: 'assets/bgm-boss.mp3'
};

// Preload BGM tracks
const _bgmCache = {};
Object.entries(BGM_TRACKS).forEach(([k, src]) => {
  const a = new Audio(); a.preload = 'auto'; a.src = src; _bgmCache[k] = a;
});

let _currentBgmTrack = null; // track name for resuming after unmute

function _fadeBgm(audio, from, to, durMs, onDone) {
  if (!audio) { if (onDone) onDone(); return; }
  const start = performance.now();
  const tick = () => {
    const elapsed = performance.now() - start;
    const t = Math.min(1, elapsed / durMs);
    audio.volume = from + (to - from) * t;
    if (t < 1) requestAnimationFrame(tick);
    else if (onDone) onDone();
  };
  requestAnimationFrame(tick);
}

function playBgm(track, fadeMs) {
  // Skip if already playing the same track (avoid restart)
  if (_currentBgmTrack === track && _currentBgm && !_currentBgm.paused) return;
  _currentBgmTrack = track;
  const src = BGM_TRACKS[track];
  if (!src) return;
  const oldBgm = _currentBgm;
  const newBgm = _bgmCache[track] || new Audio(src);
  newBgm.loop = true;
  newBgm.currentTime = 0;
  newBgm.volume = 0;
  _currentBgm = newBgm;
  if (!soundMuted) newBgm.play().catch(() => {});
  _fadeBgm(newBgm, 0, _bgmVolume, fadeMs || 500);
  if (oldBgm && oldBgm !== newBgm) {
    _fadeBgm(oldBgm, oldBgm.volume, 0, fadeMs || 500, () => {
      oldBgm.pause();
      oldBgm.currentTime = 0;
    });
  }
}

function stopBgm(fadeMs) {
  if (_currentBgm) {
    const bgm = _currentBgm;
    _currentBgm = null;
    _currentBgmTrack = null;
    _fadeBgm(bgm, bgm.volume, 0, fadeMs || 500, () => {
      bgm.pause();
      bgm.currentTime = 0;
    });
  }
}

function duckBgm(volPct, fadeMs) {
  // Lower BGM volume (for result screen) without stopping
  if (_currentBgm && !soundMuted) {
    _fadeBgm(_currentBgm, _currentBgm.volume, _bgmVolume * volPct, fadeMs || 400);
  }
}

function setBgmVolume(vol) {
  _bgmVolume = Math.max(0, Math.min(1, vol));
  localStorage.setItem('battleBgmVolume', String(_bgmVolume));
  if (_currentBgm && !soundMuted) _currentBgm.volume = _bgmVolume;
}

// Mute/unmute BGM with sound toggle
const _origToggleSound = toggleSound;
toggleSound = function() {
  _origToggleSound();
  if (soundMuted) {
    if (_currentBgm) _currentBgm.pause();
  } else {
    // Unmuted: if BGM was set but not playing, start it
    if (_currentBgm) {
      _currentBgm.play().catch(() => {});
    } else if (_currentBgmTrack) {
      playBgm(_currentBgmTrack);
    }
  }
};
