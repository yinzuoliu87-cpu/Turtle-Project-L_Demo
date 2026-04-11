/* ═══════════════════════════════════════════════════
   龟龟对战 — audio.js
   Web Audio API synthesis, zero external files
   ═══════════════════════════════════════════════════ */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx;
let masterGain = null;
let soundMuted = localStorage.getItem('battleSoundMuted') === '1';

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new AudioCtx();
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(soundMuted ? 0 : 0.5, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function toggleSound() {
  soundMuted = !soundMuted;
  localStorage.setItem('battleSoundMuted', soundMuted ? '1' : '0');
  const btn = document.getElementById('soundBtn');
  if (btn) btn.textContent = soundMuted ? '🔇' : '🔊';
  if (masterGain) masterGain.gain.linearRampToValueAtTime(soundMuted ? 0 : 0.5, audioCtx.currentTime + 0.1);
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
// ── SFX file player (preloaded) ──
const _sfxFiles = {};
function _loadSfx(name, src) {
  const a = new Audio(src);
  a.preload = 'auto';
  _sfxFiles[name] = a;
}
function _playSfx(name, volume) {
  if (soundMuted) return;
  const a = _sfxFiles[name];
  if (!a) return;
  // Clone for overlapping plays
  const clone = a.cloneNode();
  clone.volume = volume || 0.4;
  clone.play().catch(() => {});
}

// Preload SFX files
_loadSfx('hit-physical', 'assets/sfx/hit-physical.wav');

// BATTLE SFX
// ═══════════════════════════════════════════════════

// ── Hit: physical attack ──
function sfxHit() {
  _playSfx('hit-physical', 0.35);
}

// ── Crit: same hit sound, louder ──
function sfxCrit() {
  _playSfx('hit-physical', 0.5);
}

// ── Pierce (true damage): same hit sound ──
function sfxPierce() {
  _playSfx('hit-physical', 0.4);
}

// ── Shield gain: ascending chime ──
function sfxShield() {
  _osc('sine', 440, 0.15, 0.1, 880);
  _osc('sine', 660, 0.12, 0.06, 1100);
}

// ── Shield break: glass shatter ──
function sfxShieldBreak() {
  _noise(0.15, 0.15);
  _osc('square', 300, 0.08, 0.08, 80);
}

// ── Heal: soft chime ──
function sfxHeal() {
  const c = ensureAudio(), t = c.currentTime;
  [523, 659, 784].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t + i * 0.06);
    g.gain.setValueAtTime(0.08, t + i * 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.15);
    o.connect(g); g.connect(masterGain);
    o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.15);
  });
}

// ── Death: low crunch ──
function sfxDeath() {
  _osc('sawtooth', 340, 0.35, 0.15, 60);
  _noise(0.15, 0.12);
}

// ── Rebirth: phoenix rising ──
function sfxRebirth() {
  const c = ensureAudio(), t = c.currentTime;
  [262, 330, 392, 523, 659].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t + i * 0.08);
    g.gain.setValueAtTime(0.1, t + i * 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
    o.connect(g); g.connect(masterGain);
    o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.2);
  });
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
  _noise(0.12, 0.1);
  _osc('sawtooth', 200, 0.15, 0.06, 100);
}

// ── Lightning: zap ──
function sfxLightning() {
  _noise(0.06, 0.14);
  _osc('square', 1000, 0.04, 0.1, 200);
  _osc('sawtooth', 500, 0.06, 0.08, 100);
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

// ── Defeat: descending ──
function sfxDefeat() {
  const c = ensureAudio(), t = c.currentTime;
  [392, 330, 262, 196].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t + i * 0.15);
    g.gain.setValueAtTime(0.1, t + i * 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.3);
    o.connect(g); g.connect(masterGain);
    o.start(t + i * 0.15); o.stop(t + i * 0.15 + 0.3);
  });
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
  // Nature chime: two harmonics
  [392, 784, 1175].forEach((f, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.07 - i * 0.015, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(masterGain);
    o.start(t); o.stop(t + 0.3);
  });
  // Soft thud
  _osc('triangle', 220, 0.15, 0.08, 110);
}

// ── BGM SYSTEM ──────────────────────────────────────────
let _currentBgm = null;
let _bgmVolume = 0.25;

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

function playBgm(track) {
  stopBgm();
  _currentBgmTrack = track;
  const src = BGM_TRACKS[track];
  if (!src) return;
  if (_bgmCache[track]) {
    _currentBgm = _bgmCache[track];
    _currentBgm.currentTime = 0;
  } else {
    _currentBgm = new Audio(src);
  }
  _currentBgm.loop = true;
  _currentBgm.volume = _bgmVolume;
  if (!soundMuted) _currentBgm.play().catch(() => {});
}

function stopBgm() {
  if (_currentBgm) {
    _currentBgm.pause();
    _currentBgm.currentTime = 0;
    _currentBgm = null;
  }
}

function setBgmVolume(vol) {
  _bgmVolume = vol;
  if (_currentBgm) _currentBgm.volume = vol;
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
