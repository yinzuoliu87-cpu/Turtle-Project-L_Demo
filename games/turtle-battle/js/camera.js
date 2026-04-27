// ══════════════════════════════════════════════════════════
// camera.js — BattleCamera: scene transform (zoom / shake / origin)
// ══════════════════════════════════════════════════════════
// Single owner of the battlefield's CSS transform. Solves a class of bugs
// where multiple skills race to set inline `transform` and CSS keyframes
// (e.g. `.battle-scene-shake`) clobber each other.
//
// Key invariant: whenever zoom is active, --cam-scale is kept in sync so
// the .battle-scene-shake keyframes (which use scale(var(--cam-scale,1.1)))
// don't reset to 1.1 mid-zoom.

const battleCamera = {
  zoomState: 1,
  _shakeTimer: null,
  _resetTimer: null,

  /**
   * Zoom to target scale with optional origin point.
   * @param {number} target - target scale (1.0 = neutral)
   * @param {number} durMs  - tween duration in ms
   * @param {{x:number,y:number}|null} originPct - transform-origin in percent (0-100)
   */
  zoomTo(target, durMs = 240, originPct = null) {
    const el = ENV.battleField;
    if (!el) return;
    if (originPct) el.style.transformOrigin = `${originPct.x}% ${originPct.y}%`;
    el.style.transition = `transform ${durMs}ms ease-out`;
    el.style.transform = `scale(${target})`;
    this.zoomState = target;
    // Keep --cam-scale in sync so a concurrent .battle-scene-shake keyframe
    // multiplies our zoom instead of resetting to its default.
    el.style.setProperty('--cam-scale', target.toString());
  },

  /** Smooth-reset zoom back to 1 (clears origin after tween completes) */
  zoomReset(durMs = 240) {
    const el = ENV.battleField;
    if (!el) return;
    el.style.transition = `transform ${durMs}ms ease-out`;
    el.style.transform = '';  // back to default
    this.zoomState = 1;
    el.style.setProperty('--cam-scale', '1');
    if (this._resetTimer) clearTimeout(this._resetTimer);
    this._resetTimer = setTimeout(() => {
      // Only clear transition/origin if nothing else has taken over
      if (this.zoomState === 1) {
        el.style.transition = '';
        el.style.transformOrigin = '';
      }
      this._resetTimer = null;
    }, durMs + 60);
  },

  /** Zoom in → hold → zoom out (single-call convenience). Returns Promise. */
  async zoomPulse({ scale = 1.2, originPct = null, easeMs = 240, holdMs = 200 } = {}) {
    this.zoomTo(scale, easeMs, originPct);
    await sleep(easeMs + holdMs);
    this.zoomReset(easeMs);
    await sleep(easeMs + 60);
  },

  /**
   * Trigger camera shake. Auto-syncs --cam-scale with current zoom so it
   * doesn't reset mid-shake.
   * @param {number} durMs - shake duration (CSS keyframe is ~220ms; ≥220 recommended)
   */
  shake(durMs = 220) {
    const el = ENV.battleField;
    if (!el) return;
    el.style.setProperty('--cam-scale', this.zoomState.toString());
    el.classList.remove('battle-scene-shake');
    void el.offsetWidth;  // force reflow so re-adding restarts the animation
    el.classList.add('battle-scene-shake');
    if (this._shakeTimer) clearTimeout(this._shakeTimer);
    this._shakeTimer = setTimeout(() => {
      el.classList.remove('battle-scene-shake');
      this._shakeTimer = null;
    }, durMs + 20);
  },

  /** Hard reset: cancel any tween/shake and clear all transform state. */
  reset() {
    const el = ENV.battleField;
    if (this._shakeTimer) { clearTimeout(this._shakeTimer); this._shakeTimer = null; }
    if (this._resetTimer) { clearTimeout(this._resetTimer); this._resetTimer = null; }
    if (el) {
      el.style.transition = '';
      el.style.transform = '';
      el.style.transformOrigin = '';
      el.style.removeProperty('--cam-scale');
      el.classList.remove('battle-scene-shake');
    }
    this.zoomState = 1;
  },
};
