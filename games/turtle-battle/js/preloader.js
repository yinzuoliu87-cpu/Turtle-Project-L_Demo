// preloader.js — preload critical images at startup so screens don't show
// blank/loading sprites. Shows a progress bar; fades out when done.
//
// What's preloaded:
//   - 28 头像 (assets/avatars/<id>.png) used in panels, picker, stats
//   - Each pet's idle sprite (pet.img) + per-anim sprites (attackAnim,
//     hurtAnim, deathAnim, knockupAnim, runAnim) defined in pets.js
//   - 5 战斗背景 (assets/bg/*.png)
//
// Heavy non-critical assets (passive icons, equip images, vfx atlases) are
// NOT preloaded — they fade in when first used. Adding them here would make
// the initial load too long; better lazy.
//
// Errors are swallowed (image fails → still resolve) so a single missing
// asset doesn't permanently block the load screen.

(function () {
  const BG_FILES = [
    'assets/bg/bg-cave.png',
    'assets/bg/bg-cave-alt.png',
    'assets/bg/bg-ruins.png',
    'assets/bg/bg-shipwreck.png',
    'assets/bg/bg-underwater.png',
  ];

  function collectUrls() {
    const urls = new Set();
    if (typeof ALL_PETS !== 'undefined') {
      for (const p of ALL_PETS) {
        urls.add('assets/avatars/' + p.id + '.png');
        if (p.img) urls.add(p.img);
        for (const f of ['attackAnim', 'hurtAnim', 'deathAnim', 'knockupAnim', 'runAnim']) {
          if (p[f] && p[f].src) urls.add(p[f].src);
        }
      }
    }
    BG_FILES.forEach(u => urls.add(u));
    return [...urls];
  }

  function preload() {
    const overlay = document.getElementById('loadingOverlay');
    const bar = document.getElementById('loadingBar');
    const pct = document.getElementById('loadingPct');
    const urls = collectUrls();
    if (!urls.length) {
      if (overlay) overlay.remove();
      return;
    }

    let loaded = 0;
    const total = urls.length;
    const update = () => {
      const p = Math.round(loaded / total * 100);
      if (bar) bar.style.width = p + '%';
      if (pct) pct.textContent = loaded + ' / ' + total;
    };
    update();

    Promise.all(urls.map(url => new Promise(resolve => {
      const img = new Image();
      const done = () => {
        loaded++;
        update();
        resolve();
      };
      img.onload = done;
      img.onerror = done;  // don't block on failed loads
      img.src = url;
    }))).then(() => warmGpuTextures(urls)).then(() => {
      if (!overlay) return;
      overlay.style.transition = 'opacity .35s ease-out';
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 400);
    });
  }

  // GPU texture pre-warm: Image() loads + decodes the image but does NOT
  // upload to GPU. The first time a bg-image is rendered in DOM, the browser
  // uploads its texture — that upload takes a frame, during which the element
  // paints empty (visible flash). To avoid mid-game flashes, we render every
  // sprite once during the loading screen so all textures are GPU-resident
  // before combat starts. Uses opacity:0.001 (NOT visibility:hidden) — the
  // latter skips paint, which would defeat the warming.
  function warmGpuTextures(urls) {
    const warmer = document.createElement('div');
    warmer.id = 'gpuTextureWarmer';
    // Positioned inside loading overlay's z-index range so user can't see
    // (loading overlay is z:99999, warmer at 99998 is covered).
    warmer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99998;opacity:0.001';
    for (const url of urls) {
      const div = document.createElement('div');
      div.style.cssText = "display:inline-block;width:8px;height:8px;background-image:url('" + url + "');background-size:8px 8px;image-rendering:pixelated";
      warmer.appendChild(div);
    }
    document.body.appendChild(warmer);
    void warmer.offsetWidth;
    // Wait 2 animation frames to ensure paint + texture upload complete.
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Keep warmer in DOM (off-screen-equivalent via opacity 0.001) so
          // GPU doesn't evict our textures. Cost is minimal (one fixed div).
          resolve();
        });
      });
    });
  }

  // Wait until ALL_PETS is defined (defer scripts run in order, so it should
  // be available by the time DOMContentLoaded fires).
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', preload);
  } else {
    preload();
  }
})();
