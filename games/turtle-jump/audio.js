// =====================================================
// AUDIO SYSTEM — Web Audio API, zero external files
// =====================================================
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx;
let masterGain = null;
let soundMuted = localStorage.getItem('turtleSoundMuted') === '1';

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new AudioCtx();
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(soundMuted ? 0 : 1, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function toggleSound() {
  soundMuted = !soundMuted;
  localStorage.setItem('turtleSoundMuted', soundMuted ? '1' : '0');
  const btn = document.getElementById('soundBtn');
  if (btn) {
    btn.textContent = soundMuted ? '🔇' : '🔊';
    btn.classList.toggle('muted', soundMuted);
  }
  if (masterGain) {
    masterGain.gain.linearRampToValueAtTime(soundMuted ? 0 : 1, audioCtx.currentTime + 0.1);
  }
}

function sfxJump() {
  const c = ensureAudio(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(320, t);
  o.frequency.exponentialRampToValueAtTime(580, t + 0.08);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + 0.1);
}

function sfxLand() {
  const c = ensureAudio(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.07);
  g.gain.setValueAtTime(0.09, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + 0.09);
}

function sfxNearMiss() {
  const c = ensureAudio(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(880, t);
  o.frequency.exponentialRampToValueAtTime(1320, t + 0.06);
  o.frequency.exponentialRampToValueAtTime(660, t + 0.14);
  g.gain.setValueAtTime(0.1, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + 0.18);
}

function sfxDeath() {
  const c = ensureAudio(), t = c.currentTime;
  // Low crunch
  const o1 = c.createOscillator(), g1 = c.createGain();
  o1.type = 'sawtooth';
  o1.frequency.setValueAtTime(340, t);
  o1.frequency.exponentialRampToValueAtTime(60, t + 0.35);
  g1.gain.setValueAtTime(0.18, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  o1.connect(g1); g1.connect(masterGain);
  o1.start(t); o1.stop(t + 0.4);
  // Noise burst
  const buf = c.createBuffer(1, c.sampleRate * 0.15, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const n = c.createBufferSource(), gn = c.createGain();
  n.buffer = buf;
  gn.gain.setValueAtTime(0.12, t);
  gn.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  n.connect(gn); gn.connect(masterGain);
  n.start(t);
}

// Combo ascending notes: C D E F G A B C5 D5 E5
const COMBO_NOTES = [262, 294, 330, 349, 392, 440, 494, 523, 587, 659];
function sfxCombo(level) {
  const c = ensureAudio(), t = c.currentTime;
  const freq = COMBO_NOTES[Math.min(level - 1, COMBO_NOTES.length - 1)];
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.11, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + 0.15);
}

function sfxPickup() {
  const c = ensureAudio(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(523, t);
  o.frequency.setValueAtTime(659, t + 0.05);
  o.frequency.setValueAtTime(784, t + 0.1);
  g.gain.setValueAtTime(0.1, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + 0.18);
}

function sfxShield() {
  const c = ensureAudio(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(440, t);
  o.frequency.exponentialRampToValueAtTime(880, t + 0.12);
  g.gain.setValueAtTime(0.13, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + 0.2);
}

function sfxCountdown() {
  const c = ensureAudio(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(440, t);
  g.gain.setValueAtTime(0.08, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + 0.2);
}

function sfxGo() {
  const c = ensureAudio(), t = c.currentTime;
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(523, t);
  o.frequency.setValueAtTime(659, t + 0.08);
  o.frequency.setValueAtTime(784, t + 0.16);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g); g.connect(masterGain);
  o.start(t); o.stop(t + 0.3);
}

// =====================================================
// BACKGROUND MUSIC — pre-rendered chiptune buffer loop
// =====================================================
let bgmSource = null;
let bgmGain = null;
let bgmBuffer = null;
const BGM_VOL = 0.13;
const BPM = 130;
const BEAT_S = 60 / BPM;

// Melody phrases (freq per 8th note, 16 notes = 8 beats each)
const MEL_A = [523,659,784,659, 784,880,784,659, 523,659,784,1047, 880,784,659,523];
const MEL_B = [587,784,880,784, 659,784,1047,880, 784,659,523,659, 784,880,1047,0];
const BASS_A = [131,131,165,165, 175,175,196,196, 131,131,165,165, 175,175,131,131];
const BASS_B = [147,147,196,196, 165,165,196,196, 175,175,131,131, 196,196,131,131];
const KICK_P = [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,1,0];
const HAT_P  = [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,1, 0,0,1,0];

// Render a sine/square/triangle wave into buffer at sample offset
function renderTone(data, sr, startSample, freq, dur, vol, type) {
  const len = Math.floor(dur * sr);
  const attack = Math.min(Math.floor(0.005 * sr), len);
  const release = Math.floor(len * 0.35);
  for (let i = 0; i < len; i++) {
    const idx = startSample + i;
    if (idx >= data.length) break;
    const phase = (i / sr) * freq * Math.PI * 2;
    let sample;
    if (type === 'sine') {
      sample = Math.sin(phase);
    } else if (type === 'square') {
      sample = Math.sin(phase) > 0 ? 1 : -1;
      // Soften square wave
      sample *= 0.5;
    } else { // triangle
      const p = ((i / sr * freq) % 1);
      sample = p < 0.5 ? (4 * p - 1) : (3 - 4 * p);
    }
    // Envelope
    let env = vol;
    if (i < attack) env *= i / attack;
    if (i > len - release) env *= (len - i) / release;
    data[idx] += sample * env;
  }
}

// Render kick drum
function renderKick(data, sr, startSample, vol) {
  const len = Math.floor(0.1 * sr);
  for (let i = 0; i < len; i++) {
    const idx = startSample + i;
    if (idx >= data.length) break;
    const t = i / sr;
    const freq = 150 * Math.exp(-t * 30); // pitch drop
    const env = vol * Math.exp(-t * 25);
    data[idx] += Math.sin(2 * Math.PI * freq * t) * env;
  }
}

// Render hi-hat (noise burst)
function renderHat(data, sr, startSample, vol) {
  const len = Math.floor(0.025 * sr);
  for (let i = 0; i < len; i++) {
    const idx = startSample + i;
    if (idx >= data.length) break;
    const env = vol * (1 - i / len);
    // Simple noise, high-pass approximated by difference
    data[idx] += (Math.random() * 2 - 1) * env * 0.5;
  }
}

function buildBgmBuffer() {
  const c = ensureAudio();
  const sr = c.sampleRate;
  const sixteenth = BEAT_S / 4;
  // Total: 2 phrases x 32 sixteenths = 64 sixteenths
  const totalTime = 64 * sixteenth;
  const totalSamples = Math.ceil(totalTime * sr);
  const buf = c.createBuffer(1, totalSamples, sr);
  const data = buf.getChannelData(0);

  const melodies = [MEL_A, MEL_B];
  const basses = [BASS_A, BASS_B];

  for (let phrase = 0; phrase < 2; phrase++) {
    const mel = melodies[phrase];
    const bass = basses[phrase];
    const phraseOffset = phrase * 32; // 32 sixteenths per phrase

    for (let step = 0; step < 32; step++) {
      const sampleStart = Math.floor((phraseOffset + step) * sixteenth * sr);
      const noteIdx = Math.floor(step / 2);

      // Melody (every 8th note = every 2 sixteenths)
      if (step % 2 === 0 && noteIdx < mel.length) {
        const freq = mel[noteIdx];
        if (freq > 0) {
          renderTone(data, sr, sampleStart, freq, BEAT_S * 0.45, 0.08, 'sine');
          // Harmony octave below
          renderTone(data, sr, sampleStart, freq / 2, BEAT_S * 0.4, 0.025, 'triangle');
        }
      }

      // Bass (every 8th)
      if (step % 2 === 0) {
        const bassIdx = Math.floor(step / 2) % bass.length;
        renderTone(data, sr, sampleStart, bass[bassIdx], BEAT_S * 0.4, 0.05, 'square');
      }

      // Arpeggio sparkle (offbeat 16ths)
      if (step % 4 === 1 && noteIdx < mel.length) {
        const freq = mel[noteIdx];
        if (freq > 0) renderTone(data, sr, sampleStart, freq * 2, BEAT_S * 0.3, 0.02, 'square');
      }

      // Drums
      if (KICK_P[step]) renderKick(data, sr, sampleStart, 0.15);
      if (HAT_P[step])  renderHat(data, sr, sampleStart, 0.08);
    }
  }

  // Normalize to prevent clipping
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0.9) {
    const scale = 0.85 / peak;
    for (let i = 0; i < data.length; i++) data[i] *= scale;
  }

  return buf;
}

function bgmStart() {
  const c = ensureAudio();
  if (bgmSource) return;

  if (!bgmBuffer) bgmBuffer = buildBgmBuffer();

  bgmGain = c.createGain();
  bgmGain.gain.setValueAtTime(0, c.currentTime);
  bgmGain.gain.linearRampToValueAtTime(BGM_VOL, c.currentTime + 0.5);
  bgmGain.connect(masterGain);

  bgmSource = c.createBufferSource();
  bgmSource.buffer = bgmBuffer;
  bgmSource.loop = true;
  bgmSource.connect(bgmGain);
  bgmSource.start();
}

function bgmStop() {
  if (!bgmSource) return;
  if (bgmGain) {
    const c = ensureAudio();
    bgmGain.gain.linearRampToValueAtTime(0, c.currentTime + 0.4);
  }
  const src = bgmSource, g = bgmGain;
  bgmSource = null;
  bgmGain = null;
  setTimeout(() => {
    try { src.stop(); } catch(e) {}
    try { g.disconnect(); } catch(e) {}
  }, 500);
}

function bgmPause() {
  if (!bgmGain) return;
  const c = ensureAudio();
  bgmGain.gain.linearRampToValueAtTime(0, c.currentTime + 0.3);
}

function bgmResume() {
  if (!bgmGain) return;
  const c = ensureAudio();
  bgmGain.gain.linearRampToValueAtTime(BGM_VOL, c.currentTime + 0.3);
}

function sfxMilestone() {
  const c = ensureAudio(), t = c.currentTime;
  // Triumphant arpeggio: C5 E5 G5 C6
  const notes = [523, 659, 784, 1047];
  notes.forEach((freq, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t + i * 0.08);
    g.gain.setValueAtTime(0.1, t + i * 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
    o.connect(g); g.connect(masterGain);
    o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.2);
  });
}
