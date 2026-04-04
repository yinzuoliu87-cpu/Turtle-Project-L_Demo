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
      body: '这是一款 <b>2V2 回合制</b> 策略对战游戏。<br>你将选择两只龟组成队伍，利用技能和属性克制击败对手！<br><br>接下来简单了解一下游戏流程吧。'
    },
    {
      title: '选择模式',
      icon: '🎮',
      body:
        '<div class="tut-modes">' +
          '<div class="tut-mode"><span class="tut-mode-icon">🌿</span><b>野生对局</b><br>遭遇随机野生龟队，适合练手和赚金币。</div>' +
          '<div class="tut-mode"><span class="tut-mode-icon">🌐</span><b>线上对战</b><br>创建或加入房间，和朋友实时对战！</div>' +
          '<div class="tut-mode"><span class="tut-mode-icon">👑</span><b>Boss挑战</b><br>2v1 挑战强化 Boss 龟，难度更高，奖励更丰富。</div>' +
        '</div>'
    },
    {
      title: '选择你的龟',
      icon: '🐢',
      body: '每只龟有独特的 <b>属性</b> 和 <b>被动技能</b>：<br><br>' +
        '• 点击龟卡片选入队伍（共选 <b>2只</b>）<br>' +
        '• 查看 <span style="color:var(--red)">攻击力</span>、<span style="color:var(--green)">生命值</span>、<span style="color:var(--yellow)">护甲/魔抗</span> 等属性<br>' +
        '• 点击右上角的 <b>被动图标</b> 可查看被动技能详情<br>' +
        '• 合理搭配阵容是取胜的关键！'
    },
    {
      title: '技能使用',
      icon: '✨',
      body: '战斗中，每回合你需要：<br><br>' +
        '① <b>选择出战龟</b> — 决定哪只龟行动<br>' +
        '② <b>选择技能</b> — 每只龟有多个技能可选<br>' +
        '③ <b>选择目标</b> — 部分技能可指定攻击目标<br><br>' +
        '注意技能的 <span style="color:var(--red)">物理</span> / <span style="color:var(--blue)">魔法</span> 伤害类型，针对敌方弱项进攻！'
    },
    {
      title: '战斗技巧',
      icon: '💡',
      body:
        '<div class="tut-tips">' +
          '<div class="tut-tip"><span style="color:#ff6600">🔥 灼烧</span>：持续魔法伤害，受魔抗减免</div>' +
          '<div class="tut-tip"><span style="color:#fff">🛡️ 护盾</span>：额外生命层，所有伤害先消耗护盾</div>' +
          '<div class="tut-tip"><span style="color:#4dabf7">💧 墨迹</span>：降低敌方属性的减益效果</div>' +
          '<div class="tut-tip"><span style="color:#ff4444">💥 暴击</span>：25% 基础暴击率，造成 1.5 倍伤害</div>' +
        '</div>' +
        '<br>善用属性克制和技能搭配，祝你旗开得胜！'
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
