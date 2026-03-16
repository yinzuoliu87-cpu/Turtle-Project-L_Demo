// =====================================================
// LEADERBOARD — Supabase + Local Fallback
// =====================================================
//
// Supabase Setup:
// 1. Create a free project at https://supabase.com
// 2. Run this SQL in the SQL Editor:
//
//   CREATE TABLE turtle_jump_scores (
//     id         BIGSERIAL PRIMARY KEY,
//     player     TEXT NOT NULL DEFAULT '匿名龟',
//     score      INTEGER NOT NULL,
//     survive_s  INTEGER DEFAULT 0,
//     best_combo INTEGER DEFAULT 0,
//     week       TEXT NOT NULL DEFAULT to_char(now(), 'IYYY-IW'),
//     created_at TIMESTAMPTZ DEFAULT now()
//   );
//
//   CREATE INDEX idx_scores_week_score ON turtle_jump_scores(week, score DESC);
//
//   -- Row Level Security: anyone can read, anyone can insert
//   ALTER TABLE turtle_jump_scores ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "read_all"  ON turtle_jump_scores FOR SELECT USING (true);
//   CREATE POLICY "insert_all" ON turtle_jump_scores FOR INSERT WITH CHECK (true);
//
// 3. Replace SUPABASE_URL and SUPABASE_ANON_KEY below with your project values.
// =====================================================

const SUPABASE_URL  = '';  // e.g. 'https://xxxxx.supabase.co'
const SUPABASE_ANON_KEY = '';  // e.g. 'eyJhbGc...'

// Current ISO week string (e.g. "2026-11")
function currentWeek() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d - jan1) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return d.getFullYear() + '-' + String(week).padStart(2, '0');
}

// Player name (prompt once, persist)
function getPlayerName() {
  let name = localStorage.getItem('turtlePlayerName');
  if (!name) {
    name = prompt('输入你的排行榜昵称（2-12字）:', '') || '匿名龟';
    name = name.trim().slice(0, 12) || '匿名龟';
    localStorage.setItem('turtlePlayerName', name);
  }
  return name;
}

// =====================================================
// LOCAL LEADERBOARD (fallback when Supabase not configured)
// =====================================================
let leaderboard = JSON.parse(localStorage.getItem('turtleJumpLB') || '[]');
if (leaderboard.length === 0) {
  leaderboard = [
    { name: 'LionMaster 🦁', score: 3280 },
    { name: 'DragonSeer 🐉', score: 2750 },
    { name: 'EagleEye 🦅', score: 2140 },
    { name: 'PandaPredict 🐼', score: 1620 },
    { name: 'CryptoWolf 🐺', score: 980 }
  ];
}

function renderLB() {
  const el = document.getElementById('lbRows');
  el.innerHTML = leaderboard.slice(0, 6).map((e, i) => {
    const rc = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : '';
    const playerName = getPlayerName();
    const isMe = e.name === playerName || e.name.startsWith('你');
    return `<div class="lb-row"><div class="lb-rank ${rc}">${i+1}</div><div class="lb-name ${isMe?'me':''}">${e.name}</div><div class="lb-sc">${e.score.toLocaleString()}</div></div>`;
  }).join('');
}
renderLB();

// =====================================================
// SUPABASE API (lightweight, no SDK needed)
// =====================================================
const supabaseEnabled = SUPABASE_URL && SUPABASE_ANON_KEY;

async function supabaseFetch(path, options = {}) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'Prefer': options.method === 'POST' ? 'return=minimal' : '',
      ...options.headers
    }
  });
  if (!res.ok) throw new Error('Supabase error: ' + res.status);
  if (options.method === 'POST') return null;
  return res.json();
}

// Fetch this week's top scores
async function fetchWeeklyLeaderboard() {
  if (!supabaseEnabled) return;
  try {
    const week = currentWeek();
    const data = await supabaseFetch(
      `turtle_jump_scores?week=eq.${week}&order=score.desc&limit=10`
    );
    if (data && data.length > 0) {
      leaderboard = data.map(r => ({ name: r.player, score: r.score }));
      localStorage.setItem('turtleJumpLB', JSON.stringify(leaderboard));
      renderLB();
    }
  } catch (e) {
    console.warn('排行榜加载失败，使用本地数据', e);
  }
}

// Submit a score
async function submitScore(score) {
  const playerName = getPlayerName();

  // Always update local
  leaderboard.push({ name: playerName, score });
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, 10);
  localStorage.setItem('turtleJumpLB', JSON.stringify(leaderboard));
  renderLB();

  // Submit to Supabase
  if (!supabaseEnabled) return;
  try {
    await supabaseFetch('turtle_jump_scores', {
      method: 'POST',
      body: JSON.stringify({
        player: playerName,
        score: score,
        survive_s: Math.floor(typeof surviveSeconds !== 'undefined' ? surviveSeconds : 0),
        best_combo: typeof bestCombo !== 'undefined' ? bestCombo : 0,
        week: currentWeek()
      })
    });
    // Refresh leaderboard after submit
    fetchWeeklyLeaderboard();
  } catch (e) {
    console.warn('分数提交失败', e);
  }
}

// Load leaderboard on page load
fetchWeeklyLeaderboard();
