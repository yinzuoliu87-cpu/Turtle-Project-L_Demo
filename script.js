// ── GUIDE MODAL (5-card carousel) ──
var guideCards = [
  { emoji: '🐢', title: '欢迎来到龟投！', desc: '这是一个集预测投票、宠物养成、小游戏于一体的趣味平台。跟着指引快速上手吧！' },
  { emoji: '🎯', title: '预测投票', desc: '在热门事件中押注龟币，猜对即可赢取奖励。连胜还能解锁珍稀披风！' },
  { emoji: '🥚', title: '收集宠物', desc: '花费龟币开蛋，收集 28 种不同龟种。从 C 级到 SSS 级，每只都有独特能力加成！' },
  { emoji: '⚔️', title: '龟势 PK', desc: '在开战广场发起对决，和其他玩家正面交锋。选择阵营、押注龟币、赢取荣耀！' },
  { emoji: '💰', title: '收集龟币', desc: '每日登录领奖励、投票赚收益、小游戏拿高分……龟币越多，玩法越丰富！' }
];
var guideIdx = 0;

function renderGuide() {
  var dots = document.getElementById('guideDots');
  var emoji = document.getElementById('guideEmoji');
  var title = document.getElementById('guideTitle');
  var desc = document.getElementById('guideDesc');
  var btn = document.getElementById('guideNextBtn');
  if (!dots) return;
  var card = guideCards[guideIdx];
  dots.innerHTML = guideCards.map(function(_, i) {
    return '<span class="guide-dot' + (i === guideIdx ? ' active' : '') + '"></span>';
  }).join('');
  emoji.textContent = card.emoji;
  title.textContent = card.title;
  desc.textContent = card.desc;
  btn.textContent = guideIdx === guideCards.length - 1 ? '开始探索' : '下一步';
}

function openGuideModal() {
  guideIdx = 0;
  renderGuide();
  var el = document.getElementById('guideOverlay');
  if (el) el.classList.add('show');
}

function closeGuideModal() {
  var el = document.getElementById('guideOverlay');
  if (el) el.classList.remove('show');
}

function nextGuide() {
  if (guideIdx < guideCards.length - 1) {
    guideIdx++;
    renderGuide();
  } else {
    closeGuideModal();
  }
}

// Auto-show for first visit
(function(){
  if (!localStorage.getItem('guideShown')) {
    setTimeout(function(){
      openGuideModal();
      localStorage.setItem('guideShown', 'true');
    }, 800);
  }
})();

// ── THEME TOGGLE ──
function toggleTheme(){
  const html=document.documentElement;
  const isDark=html.getAttribute('data-theme')==='dark';
  html.setAttribute('data-theme',isDark?'light':'dark');
  localStorage.setItem('theme',isDark?'light':'dark');
}
// restore saved theme
(function(){
  const saved=localStorage.getItem('theme');
  if(saved==='dark') document.documentElement.setAttribute('data-theme','dark');
})();

// ── LEADERBOARD TABS ──
function switchLbTab(el, tab){
  el.closest('.lb-tabs').querySelectorAll('.lb-tab').forEach(t=>t.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('lb-global').style.display = tab==='global'?'block':'none';
  document.getElementById('lb-friends').style.display = tab==='friends'?'block':'none';
}

// ── LEFT SIDEBAR COLLAPSE ──
function toggleLeftSec(panelId, chevId) {
  const panel = document.getElementById(panelId);
  const chev  = document.getElementById(chevId);
  const open  = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : 'block';
  if (chev) chev.style.transform = open ? '' : 'rotate(90deg)';
}

// ── TAB SWITCHING ──
const ALL_PAGES = ['all','wc','hot','tech','ai','ent','forum'];

function switchTab(el, tab) {
  document.querySelectorAll('.nt').forEach(x => x.classList.remove('on'));
  el.classList.add('on');
  ALL_PAGES.forEach(p => {
    const pg = document.getElementById('page-' + p);
    if (pg) pg.style.display = 'none';
  });
  const target = document.getElementById('page-' + tab);
  if (target) {
    target.style.display = 'block';
    target.querySelectorAll('.vb-fill,.hbar-bg-fill,.mb-fill,.pp-fill,.vm-fill-r,.vm-fill-b,.fp-bar-fill').forEach(b => {
      const w = b.style.width;
      b.style.transition = 'none'; b.style.width = '0';
      requestAnimationFrame(() => { b.style.transition = 'width .8s cubic-bezier(.4,0,.2,1)'; b.style.width = w; });
    });
  }
  window.scrollTo({ top: 52, behavior: 'smooth' });
}

// time dropdown
function toggleTimeDD() {
  const menu = document.getElementById('timeDDMenu');
  menu.classList.toggle('open');
}
function pickTime(el, label) {
  document.querySelectorAll('.time-dd-item').forEach(x => x.classList.remove('on'));
  el.classList.add('on');
  const btn = document.getElementById('timeDDBtn');
  btn.textContent = (label === '全部时间' ? '🗓 ' : '') + label + ' ▾';
  btn.classList.toggle('active', label !== '全部时间');
  document.getElementById('timeDDMenu').classList.remove('open');
  toast('🗓', '已筛选：' + label);
}
// avatar dropdown
function toggleAvaMenu() {
  const menu = document.getElementById('avaMenu');
  menu.classList.toggle('open');
}

// close dropdowns on outside click
document.addEventListener('click', e => {
  const dd = document.getElementById('timeDD');
  if (dd && !dd.contains(e.target)) document.getElementById('timeDDMenu').classList.remove('open');
  const avaDD = document.getElementById('avaDD');
  if (avaDD && !avaDD.contains(e.target)) document.getElementById('avaMenu').classList.remove('open');
});

// init: show page-all on load
window.addEventListener('DOMContentLoaded', () => {
  ALL_PAGES.forEach(p => {
    const pg = document.getElementById('page-' + p);
    if (pg && p !== 'all') pg.style.display = 'none';
  });
  const allPage = document.getElementById('page-all');
  if (allPage) allPage.style.display = 'block';
});

// section time tabs
function secTime(el){
  const siblings=el.closest('.sec-head').querySelectorAll('.sec-time');
  siblings.forEach(x=>x.classList.remove('active'));
  el.classList.add('active');
}

// vote tracking (v3.3: qualified streaks require bet >= 100)
function recordVoteResult(betAmount) {
  betAmount = betAmount || 100; // default for heroVote/miniVote
  // total votes count
  let total = parseInt(localStorage.getItem('turtleTotalVotes') || '0');
  total++;
  localStorage.setItem('turtleTotalVotes', total.toString());

  // simulate win (70% chance)
  const won = Math.random() < 0.7;
  // simulate upset (event win rate < 25%)
  const isUpset = Math.random() < 0.25;

  // vote streak (qualified: bet >= 100 and won)
  if (betAmount >= 100) {
    let voteStreak = parseInt(localStorage.getItem('turtleVoteStreak') || '0');
    if (won) {
      voteStreak++;
      localStorage.setItem('turtleVoteStreak', voteStreak.toString());
      if (voteStreak >= 5) toast('🔥','投票连胜 ' + voteStreak + ' 局！');
    } else {
      localStorage.setItem('turtleVoteStreak', '0');
    }

    // upset streak (bet >= 100, event < 25% win rate, and won)
    let upsetStreak = parseInt(localStorage.getItem('turtleUpsetStreak') || '0');
    if (isUpset && won) {
      upsetStreak++;
      localStorage.setItem('turtleUpsetStreak', upsetStreak.toString());
      if (upsetStreak >= 4) toast('💥','爆冷连胜 ' + upsetStreak + ' 次！');
    } else if (!won) {
      localStorage.setItem('turtleUpsetStreak', '0');
    }
  }

  // backward compat: also write old key
  localStorage.setItem('turtleWinStreak', localStorage.getItem('turtleVoteStreak') || '0');
}

// hero vote
function heroVote(e,dir,pct){e.stopPropagation();toast('🗳️','投票成功！当前 '+pct+'% 支持');recordVoteResult();}

// mini vote
function miniVote(e,id,dir,pct){e.stopPropagation();toast('🗳️','投票成功！'+pct+'% 支持');recordVoteResult();}

// like
function toggleLike(el){
  const isLiked=el.classList.toggle('liked');
  const n=parseInt(el.textContent.replace(/\D/g,''))||0;
  el.innerHTML='<span class="pa-ico">'+(isLiked?'❤️':'🤍')+'</span> '+(isLiked?n+1:n-1);
}

// modal
let mChoice=null,mAmt=100;
function openModal(q){
  document.getElementById('mq').textContent=q;
  document.getElementById('ovl').style.display='grid';
  mChoice=null;mAmt=100;
  document.getElementById('cy').className='m-ch';
  document.getElementById('cn').className='m-ch';
  document.querySelectorAll('.m-ab').forEach(a=>a.classList.remove('on'));
  document.querySelectorAll('.m-ab')[1].classList.add('on');
  document.getElementById('mcta').textContent='🪙 确认押注 100 龟币';
}
function closeModal(){document.getElementById('ovl').style.display='none';}
function selC(c){mChoice=c;document.getElementById('cy').className='m-ch'+(c==='y'?' cy':'');document.getElementById('cn').className='m-ch'+(c==='n'?' cn':'');}
function selA(el,amt){mAmt=amt;document.querySelectorAll('.m-ab').forEach(x=>x.classList.remove('on'));el.classList.add('on');document.getElementById('mcta').textContent='🪙 确认押注 '+amt+' 龟币';}
function confirmVote(){if(!mChoice){toast('⚠️','请先选择你的判断');return;}closeModal();toast('🎉','押注成功！'+mAmt+' 🪙 已押「'+(mChoice==='y'?'是':'否')+'」');recordVoteResult(mAmt);}

// submit post
function submitPost(){
  const txt=document.getElementById('compose-txt').value.trim();
  if(!txt){toast('⚠️','请输入内容再发布');return;}
  const now=new Date();
  const postHTML=`<div class="post" style="border:2px solid rgba(6,214,160,.2);">
    <div class="post-body">
      <div class="post-header">
        <div class="post-ava" style="background:rgba(6,214,160,.2)">🦊</div>
        <div class="post-meta">
          <div class="post-name">你 <span class="post-badge badge-pred">🐢 龟投用户</span></div>
          <div class="post-sub">刚刚 · 🔥 5连胜 · 2,480 🪙</div>
        </div>
        <div class="post-more">···</div>
      </div>
      <div class="post-text">${txt.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/#(\S+)/g,'<span class="ht">#$1</span>').replace(/@(\S+)/g,'<span class="mention">@$1</span>')}</div>
      <div class="post-actions">
        <div class="pa" onclick="toggleLike(this)"><span class="pa-ico">🤍</span> 0</div>
        <div class="pa"><span class="pa-ico">💬</span> 0</div>
        <div class="pa"><span class="pa-ico">🔁</span> 0</div>
        <div class="pa pa-share"><span class="pa-ico">↗️</span></div>
      </div>
    </div>
    <div class="post-comments">
      <div class="add-comment">
        <div class="add-cmt-ava">🦊</div>
        <input class="add-cmt-input" placeholder="发表评论…" onkeydown="if(event.key==='Enter'){toast('💬','评论发布成功！');this.value='';}" />
      </div>
    </div>
  </div>`;
  const area=document.getElementById('dynamic-post-area');
  area.insertAdjacentHTML('beforebegin',postHTML);
  document.getElementById('compose-txt').value='';
  toast('🐢','发布成功！帖子已出现在论坛 ✨');
}

// toast
let tt;
function toast(ico,msg){
  const el=document.getElementById('tst');
  document.getElementById('tico').textContent=ico;
  document.getElementById('tmsg').textContent=msg;
  el.classList.add('show');
  clearTimeout(tt);tt=setTimeout(()=>el.classList.remove('show'),2600);
}

// animate bars
setTimeout(()=>{
  document.querySelectorAll('.vb-fill,.hbar-bg-fill,.mb-fill,.pp-fill').forEach(b=>{
    const w=b.style.width;b.style.width='0';
    setTimeout(()=>{b.style.transition='width .85s cubic-bezier(.4,0,.2,1)';b.style.width=w;},80);
  });
},250);

// live counters
setInterval(()=>{
  const ids=['hv','v-wc1','v-wc2','v-musk','v-stock','v-gpt','v-apple','v-tesla','v-claude','v-agi','v-marry','v-jay','v-avengers','v-all-musk','v-all-claude','v-all-marry','v-all-stock','v-all-apple','v-all-jay','v-all-gpt','v-all-agi'];
  ids.forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    const n=parseInt(el.textContent.replace(/,/g,''));
    if(n)el.textContent=(n+Math.floor(Math.random()*3)+1).toLocaleString('zh');
  });
},3500);

// ── PET CHAT ──
function togglePetChat(){
  const panel=document.getElementById('petChat');
  panel.classList.toggle('open');
  if(panel.classList.contains('open')){
    setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'nearest'}),100);
  }
}

const petReplies={
  '我今日胜率':['📊 你今日参与了 <strong>4 个话题</strong>，猜对 <strong class="good">3 个</strong>，今日胜率 <span class="good">75%</span>！<br><br>比你本周均值 68% 还要高，状态不错 💪 继续冲 6 连胜！'],
  '推荐押哪个':['🎯 根据当前资金流向，我推荐：<br><br>① <strong>苹果AR眼镜</strong> — YES方向近1h净流入 +580🪙，赔率1.38×相对安全<br>② <strong>周杰伦新专辑</strong> — 79%支持，低风险高确定性<br><br><span class="warn">⚠ A股涨跌话题赔率分散，谨慎押注！</span>'],
  '世界杯分析':['⚽ 世界杯冠军当前数据：<br><br>🇧🇷 巴西 34% | 赔率 3.8×<br>🇫🇷 法国 28% | 赔率 4.5×<br>🇦🇷 阿根廷 22% | 赔率 5.2×<br><br>平台资金流向<strong>巴西</strong>最多，但押法国 CP 值更高。梅西参赛与否会影响赔率，建议<span class="warn">分散押注</span> 🎲'],
  '资金流向':['💰 过去1小时平台资金流向：<br><br>🔴 净流入最多：<strong>世界杯冠军</strong> +12,400🪙<br>🟡 热度上升：<strong>苹果AR眼镜</strong> ↑156%<br>🟢 赔率变化：<strong>A股涨跌</strong> 2.22→2.18×<br><br>建议重点关注苹果AR，流量正在爆发 🚀']
};
const petFallbacks=[
  '🐢 你本周胜率 <span class="good">68%</span>，平台排名第 <strong>12</strong> 位。继续保持这个节奏！',
  '💡 分析你的历史，你在<strong>科技类</strong>话题胜率最高达 <span class="good">78%</span>！建议多关注 AI 和科技板块～',
  '📈 当前最活跃话题是<strong>世界杯冠军</strong>，每小时新增890票。你还没参与，赔率还不错！',
  '🎯 冷门猎手提示：<strong>AGI 2030</strong> 赔率高达 2.44×，猜对赢大！',
  '⚡ 最近5次押注中，你有 <span class="good">4次</span>押对了方向！预测直觉很准，继续加油 🔥'
];
let fbIdx=0;

function petQuick(el){
  const q=el.textContent;
  addUserMsg(q);
  el.style.opacity='.4';setTimeout(()=>el.style.opacity='1',2000);
  showTyping(()=>{addBotMsg(petReplies[q]?petReplies[q][0]:petFallbacks[fbIdx++%petFallbacks.length]);});
}
function sendPetMsg(){
  const input=document.getElementById('petInput');
  const txt=input.value.trim();if(!txt)return;
  input.value='';addUserMsg(txt);
  let matched=null;
  for(const k of Object.keys(petReplies)){if(txt.includes(k.replace('我',''))||txt===k){matched=k;break;}}
  showTyping(()=>{addBotMsg(matched?petReplies[matched][0]:petFallbacks[fbIdx++%petFallbacks.length]);});
}
function addUserMsg(txt){
  const msgs=document.getElementById('petMessages');
  msgs.innerHTML+=`<div class="msg user"><div class="msg-ava" style="background:rgba(199,125,255,.15)">🦊</div><div class="msg-bubble">${txt}</div></div>`;
  msgs.scrollTop=msgs.scrollHeight;
}
function addBotMsg(html){
  const msgs=document.getElementById('petMessages');
  const t=msgs.querySelector('.typing-row');if(t)t.remove();
  msgs.innerHTML+=`<div class="msg bot"><div class="msg-ava" style="background:rgba(6,214,160,.1)">🐢</div><div class="msg-bubble">${html}</div></div>`;
  msgs.scrollTop=msgs.scrollHeight;
}
function showTyping(cb){
  const msgs=document.getElementById('petMessages');
  msgs.innerHTML+=`<div class="msg bot typing-row"><div class="msg-ava" style="background:rgba(6,214,160,.1)">🐢</div><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>`;
  msgs.scrollTop=msgs.scrollHeight;
  setTimeout(cb,1200+Math.random()*600);
}

// ══════════════════════════════════════════
// ⚔️  开战广场 专用函数
// ══════════════════════════════════════════
