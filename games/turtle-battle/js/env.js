// ══════════════════════════════════════════════════════════
// env.js — Single source of truth for runtime environment
// ══════════════════════════════════════════════════════════
// Loaded BEFORE other scripts. All consumers should read from ENV
// instead of inlining `window.innerWidth <= 768` / `document.getElementById('battleScene')`.
//
// ENV.isMobile / ENV.baseScale / ENV.battleField / ENV.sceneZoom
//
// Phase 5 (BattleCamera) will consume these via a wrapper class.

const ENV = {
  // Treat anything ≤ 768px wide as mobile (matches CSS media query breakpoint).
  // Recomputed on each access so resize/orientation changes work without reload.
  get isMobile() { return window.innerWidth <= 768; },

  // Battlefield scene-turtle CSS scale, set on .scene-turtle by scene.css:
  //   desktop: 0.9 / mobile: 0.55  (35% smaller than original 1.375 / 0.85)
  // Children of .scene-turtle live in pre-scale local units, so any translate
  // applied at the JS layer must be divided by baseScale to read in screen px.
  get baseScale() { return this.isMobile ? 0.55 : 0.9; },

  // The battle scene container. Cached on first access (the element is created
  // once and persists through screen switches).
  get battleField() {
    if (!this._battleField) this._battleField = document.getElementById('battleScene');
    return this._battleField;
  },

  // Ratio between scene's actual rendered width and its layout width.
  // Used by VFX to convert bounding-rect coordinates back into untransformed
  // local coordinates. Returns 1 when battleField is missing or zero-width.
  get sceneZoom() {
    const b = this.battleField;
    if (!b || !b.offsetWidth) return 1;
    return b.getBoundingClientRect().width / b.offsetWidth;
  },

  // Convenience: returns { rect, zoom } in one call so VFX code doesn't compute
  // getBoundingClientRect twice per spawn.
  fieldRect() {
    const b = this.battleField;
    if (!b) return { rect: null, zoom: 1 };
    const rect = b.getBoundingClientRect();
    const zoom = b.offsetWidth ? rect.width / b.offsetWidth : 1;
    return { rect, zoom };
  },
};
