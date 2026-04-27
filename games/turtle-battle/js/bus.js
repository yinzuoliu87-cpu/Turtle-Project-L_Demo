// ══════════════════════════════════════════════════════════
// bus.js — Tiny event emitter for cross-module decoupling
// ══════════════════════════════════════════════════════════
// Event protocol (additive — emitters fire, no consumers required):
//
//   damage:dealt   { source, target, amount, type, isPierce, hpLoss, shieldAbs }
//   fighter:died   { fighter, killer }
//   fighter:revived { fighter }
//   buff:applied   { fighter, buff }              (future)
//   buff:removed   { fighter, buff }              (future)
//   skill:cast     { caster, skill, targetIds }   (future)
//   turn:start     { side, turnNum }              (future)
//   turn:end       { side }                       (future)
//
// Subscribers can:
//   bus.on('damage:dealt', handler)
//   bus.off('damage:dealt', handler)
//   bus.once('fighter:died', handler)
//   bus.clear()  // remove all listeners (test reset)
//
// emit() is fire-and-forget — handlers run synchronously in registration
// order. Errors in one handler do NOT stop others.

const bus = {
  _listeners: Object.create(null),

  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
    return () => this.off(event, handler);
  },

  off(event, handler) {
    const list = this._listeners[event];
    if (!list) return;
    const i = list.indexOf(handler);
    if (i >= 0) list.splice(i, 1);
  },

  once(event, handler) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      handler(data);
    };
    return this.on(event, wrapper);
  },

  emit(event, data) {
    const list = this._listeners[event];
    if (!list || !list.length) return;
    // Snapshot list so handlers that off()/on() during emit don't blow up.
    const snapshot = list.slice();
    for (const h of snapshot) {
      try { h(data); }
      catch (err) {
        if (typeof console !== 'undefined') console.error(`[bus] handler error on '${event}':`, err);
      }
    }
  },

  /** Remove ALL listeners. Used by test setup; do not call in game code. */
  clear() {
    this._listeners = Object.create(null);
  },

  /** Debug: count of registered listeners across all events. */
  _count() {
    let n = 0;
    for (const k in this._listeners) n += this._listeners[k].length;
    return n;
  },
};
