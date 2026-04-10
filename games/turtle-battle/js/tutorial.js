/* ═══════════════════════════════════════════════════
   Tutorial System — js/tutorial.js
   First-visit guide overlay for new players
   ═══════════════════════════════════════════════════ */

const TutorialSystem = (() => {
  const STORAGE_KEY = 'tutorialComplete';

  const steps = [
    {
      title: '欢迎来到龟龟对战！',
      icon: '⚔️',
      body: '这是一款 <b>3V3 回合制</b> 策略对战游戏。<br>选择3只龟组成队伍，安排前后排站位，利用技能装配和连携技击败对手！'
    },
    {
      title: '选择模式',
      icon: '🎮',
      body:
        '<div class="tut-modes">' +
          '<div class="tut-mode"><span class="tut-mode-icon">🌿</span><b>普通对战</b><br>3v3对战随机敌方龟队。</div>' +
          '<div class="tut-mode"><span class="tut-mode-icon">👑</span><b>Boss挑战</b><br>3v1挑战超强Boss龟。</div>' +
          '<div class="tut-mode"><span class="tut-mode-icon">🏰</span><b>深海闯关</b><br>5层连续闯关，选6只龟（3上场+3替补）。</div>' +
          '<div class="tut-mode"><span class="tut-mode-icon">🌐</span><b>线上对战</b><br>创建或加入房间，和朋友实时对战！</div>' +
        '</div>'
    },
    {
      title: '选龟与站位',
      icon: '🐢',
      body: '• 选择 <b>3只龟</b> 放入阵型格子（前排/后排）<br>' +
        '• 前排龟优先被敌方单体技能选中<br>' +
        '• 后排龟更安全，前排全倒后才会被选中<br>' +
        '• 每只龟可从技能池中装配3个技能（含1个固定基础攻击）<br>' +
        '• 点击被动图标查看被动技能详情'
    },
    {
      title: '战斗流程',
      icon: '✨',
      body: '每回合：<br><br>' +
        '① <b>选择出战龟</b> — 决定哪只龟行动<br>' +
        '② <b>选择技能</b> — 点击技能卡释放<br>' +
        '③ <b>选择目标</b> — 点击场上发光的龟选目标<br><br>' +
        '先手方首回合只出2只龟，之后每回合双方各出3只。<br>' +
        '特定龟组合可释放 <b>🤝连携技</b>（消耗2个行动，威力更强）！'
    }
  ];

  let currentStep = 0;
  let overlay = null;

  function shouldShow() {
    return !localStorage.getItem(STORAGE_KEY);
  }

  function init() {
    if (!shouldShow()) return;
    overlay = document.getElementById('tutorialOverlay');
    if (!overlay) return;
    overlay.style.display = ''; // clear inline display:none from previous complete()
    showStep(0);
    overlay.classList.add('tut-visible');
  }

  function showStep(idx) {
    currentStep = idx;
    const step = steps[idx];
    const card = overlay.querySelector('.tut-card');
    const body = overlay.querySelector('.tut-body');
    const title = overlay.querySelector('.tut-title');
    const icon = overlay.querySelector('.tut-icon');
    const counter = overlay.querySelector('.tut-counter');
    const prevBtn = overlay.querySelector('.tut-prev');
    const nextBtn = overlay.querySelector('.tut-next');

    // Animate card
    card.classList.remove('tut-card-enter');
    void card.offsetWidth; // reflow
    card.classList.add('tut-card-enter');

    icon.textContent = step.icon;
    title.textContent = step.title;
    body.innerHTML = step.body;
    counter.textContent = (idx + 1) + ' / ' + steps.length;

    prevBtn.style.display = idx === 0 ? 'none' : '';
    nextBtn.textContent = idx === steps.length - 1 ? '开始游戏！' : '下一步 →';

    // Update dots
    overlay.querySelectorAll('.tut-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === idx);
    });
  }

  function next() {
    if (currentStep < steps.length - 1) {
      showStep(currentStep + 1);
    } else {
      complete();
    }
  }

  function prev() {
    if (currentStep > 0) {
      showStep(currentStep - 1);
    }
  }

  function complete() {
    localStorage.setItem(STORAGE_KEY, 'true');
    overlay.classList.remove('tut-visible');
    overlay.classList.add('tut-hiding');
    setTimeout(() => {
      overlay.classList.remove('tut-hiding');
      overlay.style.display = 'none';
    }, 300);
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
  }

  return { init, next, prev, complete, reset };
})();

// Auto-init on DOM ready
document.addEventListener('DOMContentLoaded', () => TutorialSystem.init());
