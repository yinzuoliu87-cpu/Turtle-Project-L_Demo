// 评论折叠
function battleToggleCmt(threadId, cntId) {
  document.getElementById(threadId).classList.toggle('open');
}

// 提交评论
function battleSubmitCmt(e, cntId) {
  if (e.key !== 'Enter') return;
  const inp = e.target;
  const txt = inp.value.trim();
  if (!txt) { toast('⚠️', '请输入评论'); return; }
  const el = document.getElementById(cntId);
  if (el) el.textContent = (parseInt(el.textContent) || 0) + 1;
  inp.value = '';
  toast('💬', '评论发布成功！');
}

// 点赞 (battle card footer)
function battleToggleLike(el) {
  const isLiked = el.classList.toggle('liked');
  const n = parseInt(el.textContent.replace(/\D/g, '')) || 0;
  const ico = isLiked ? '❤️' : '🤍';
  el.innerHTML = ico + ' <span>' + (isLiked ? n + 1 : n - 1) + '</span>';
}

// 排序 Tab
function battleSetSort(el) {
  document.querySelectorAll('.bst').forEach(x => x.classList.remove('on'));
  el.classList.add('on');
  toast('📊', '已切换到：' + el.textContent.trim());
}

// 发起对战 Compose
function battleOpenCompose() {
  document.getElementById('battle-compose-full').classList.add('open');
  document.getElementById('bcf-q').focus();
}
function battleCloseCompose() {
  document.getElementById('battle-compose-full').classList.remove('open');
}
function battleSubmit() {
  const q = document.getElementById('bcf-q').value.trim();
  const red = document.getElementById('bcf-red').value.trim();
  const blue = document.getElementById('bcf-blue').value.trim();
  if (!q) { toast('⚠️', '请输入话题主张'); return; }
  if (!red) { toast('⚠️', '请填写正方观点'); return; }
  const cat = document.getElementById('bcf-cat').value;
  const catKey = cat.includes('世界杯') ? 'bcat-wc' : cat.includes('AI') ? 'bcat-ai' : cat.includes('财经') ? 'bcat-finance' : cat.includes('娱乐') ? 'bcat-ent' : cat.includes('科技') ? 'bcat-tech' : 'bcat-hot';
  const id = 'ub-' + Date.now();
  const qe = q.replace(/</g, '&lt;');
  const re = (red || '等待正方补充观点…').replace(/</g, '&lt;');
  const be = (blue || '⚔️ 暂无反方，点击接战成为对手！').replace(/</g, '&lt;');
  const html = `
  <div class="battle-card" id="${id}" style="border-color:rgba(0,214,143,.2)">
    <div class="bc-top">
      <div class="bc-cat ${catKey}">${cat}</div>
      <div class="bc-q">${qe}</div>
      <div class="bc-badge bnew-badge">🆕 新话题</div>
    </div>
    <div class="versus-area">
      <div class="vs-side vs-r" onclick="battleOpenModal('${qe}','正方','反方')">
        <div class="vs-side-header">
          <div class="vs-ava">🦊</div>
          <div class="vs-user-info"><div class="vs-name">你</div><div class="vs-streak">正方发起者</div></div>
          <div class="vs-coins-badge">+0🪙</div>
        </div>
        <div class="vs-argument">${re}</div>
        <div class="vs-bet-row">
          <div class="vs-direction dir-r">🔴 支持正方</div>
          <button class="vs-support-btn sup-r" onclick="event.stopPropagation();battleOpenModal('${qe}','正方','反方')">支持</button>
        </div>
      </div>
      <div class="vs-mid"><div class="vs-label">VS</div></div>
      <div class="vs-side vs-b" onclick="toast('⚔️','接受挑战即加入反方！')">
        <div class="vs-side-header">
          <div class="vs-ava">❓</div>
          <div class="vs-user-info"><div class="vs-name">等待接战…</div><div class="vs-streak">反方空缺</div></div>
        </div>
        <div class="vs-argument">${be}</div>
        <div class="vs-bet-row">
          <div class="vs-direction dir-b">🔵 加入反方</div>
          <button class="vs-support-btn sup-b" onclick="event.stopPropagation();toast('⚔️','接战功能开放中！')">接战</button>
        </div>
      </div>
    </div>
    <div class="vote-meter-wrap">
      <div class="vm-bar"><div class="vm-fill-r" style="width:50%"></div><div class="vm-fill-b" style="width:50%"></div></div>
      <div class="vm-row"><div class="vm-r-pct">🔴 0%</div><div class="vm-meta">0 人参与 · 等待首票</div><div class="vm-b-pct">0% 🔵</div></div>
    </div>
    <div class="bc-foot">
      <div class="bc-foot-btn" onclick="battleToggleCmt('${id}-cmt','${id}-cc')">💬 <span id="${id}-cc">0</span> 评论</div>
      <div class="bc-foot-btn" onclick="battleToggleLike(this)">🤍 <span>0</span></div>
      <div class="bc-time">⏱ 刚刚创建</div>
    </div>
  </div>
  <div class="battle-cmt-thread" id="${id}-cmt">
    <div class="bct-inner">
      <div class="badd-cmt">
        <div class="badd-cmt-ava">🦊</div>
        <input class="badd-cmt-inp" placeholder="发表首条评论…" onkeydown="battleSubmitCmt(event,'${id}-cc')" />
        <button class="badd-cmt-send" onclick="toast('💬','评论发送成功！')">↑</button>
      </div>
    </div>
  </div>`;
  document.getElementById('user-battles').insertAdjacentHTML('afterbegin', html);
  battleCloseCompose();
  document.getElementById('bcf-q').value = '';
  document.getElementById('bcf-red').value = '';
  document.getElementById('bcf-blue').value = '';
  toast('⚔️', '对战话题发布成功！等待其他用户接战 🔥');
  document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 对战弹窗
let bSide = null, bAmt = 100;
function battleOpenModal(title, rlbl, blbl) {
  document.getElementById('bm-title').textContent = title || '押注对战';
  document.getElementById('bm-rlbl').textContent = rlbl || '正方';
  document.getElementById('bm-blbl').textContent = blbl || '反方';
  bSide = null; bAmt = 100;
  document.getElementById('bm-red').className = 'bm-side';
  document.getElementById('bm-blue').className = 'bm-side';
  document.querySelectorAll('.bm-amt').forEach((a, i) => a.classList.toggle('on', i === 1));
  document.getElementById('bm-cta').textContent = '⚔️ 确认押注 100 龟币';
  document.getElementById('battle-ovl').classList.add('show');
}
function battleCloseModal() {
  document.getElementById('battle-ovl').classList.remove('show');
}
function battleSelSide(s) {
  bSide = s;
  document.getElementById('bm-red').className = 'bm-side' + (s === 'red' ? ' red-sel' : '');
  document.getElementById('bm-blue').className = 'bm-side' + (s === 'blue' ? ' blue-sel' : '');
}
function battleSelAmt(el, amt) {
  bAmt = amt;
  document.querySelectorAll('.bm-amt').forEach(x => x.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('bm-cta').textContent = '⚔️ 确认押注 ' + amt + ' 龟币';
}
function battleConfirmBet() {
  if (!bSide) { toast('⚠️', '请先选择立场！'); return; }
  battleCloseModal();
  const side = bSide === 'red' ? document.getElementById('bm-rlbl').textContent : document.getElementById('bm-blbl').textContent;
  toast('🎉', '押注成功！' + bAmt + ' 🪙 押「' + side + '」');
  if (typeof recordVoteResult === 'function') recordVoteResult(bAmt);
}

// 开战广场 Live 计数器
setTimeout(() => {
  document.querySelectorAll('.vm-fill-r,.vm-fill-b,.fp-bar-fill').forEach(b => {
    const w = b.style.width;
    b.style.width = '0';
    setTimeout(() => { b.style.transition = 'width 1s cubic-bezier(.4,0,.2,1)'; b.style.width = w; }, 120);
  });
}, 300);

setInterval(() => {
  const liveB = {'bbc1-votes':24757,'bbc2-votes':11420,'bbc3-votes':3961,'bbc4-votes':18340};
  Object.keys(liveB).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const n = parseInt(el.textContent.replace(/,/g,'')) || 0;
    el.textContent = (n + Math.floor(Math.random() * 3) + 1).toLocaleString('zh');
  });
}, 4000);
