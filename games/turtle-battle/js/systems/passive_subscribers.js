// ══════════════════════════════════════════════════════════
// passive_subscribers.js — Bus subscribers for passive effects
// ══════════════════════════════════════════════════════════
// Replaces inline passive logic that used to live inside applyRawDmg.
// Each passive that "reacts to a damage event" (e.g. chest treasure
// accumulator, lava rage gauge) lives here as a `bus.on('damage:dealt', ...)`
// subscriber.
//
// This file is loaded after bus.js but before any combat code that fires
// events, so subscribers are registered by the time the first damage
// event emits.
//
// Adding a new passive here:
//   bus.on('damage:dealt', ({ source, target, amount, type, isPierce }) => {
//     if (source?.passive?.type !== 'myPassive') return;
//     // ... do stuff
//   });

(function registerPassiveSubscribers() {
  if (typeof bus === 'undefined') {
    if (typeof console !== 'undefined') console.error('[passive_subscribers] bus not loaded');
    return;
  }

  // ── 宝箱龟: chestTreasure ─────────────────────────────────
  // Source accumulates damage-dealt amount; threshold pulls trigger an equip draw.
  bus.on('damage:dealt', ({ source, amount }) => {
    if (!source || !source.passive || source.passive.type !== 'chestTreasure') return;
    if (!(amount > 0)) return;
    source._chestTreasure = (source._chestTreasure || 0) + amount;
    if (typeof checkChestEquipDraw === 'function') checkChestEquipDraw(source);
    // Live-update the left-side pile indicator on every damage tick (not only at draws).
    if (typeof getFighterElId !== 'function') return;
    const pile = document.querySelector(`#${getFighterElId(source)} [data-chest-progress]`);
    if (!pile) return;
    const tier = source._chestTier || 0;
    const ths = source.passive.thresholds;
    const lvMult = 1 + ((source._level || 1) - 1) * 0.03;
    const next = (ths && tier < ths.length) ? Math.round(ths[tier] * lvMult) : null;
    pile.textContent = next ? `${source._chestTreasure}/${next}` : `${source._chestTreasure}(满)`;
  });

  // ── 熔岩龟: lavaRage (caster path — accumulate from damage dealt) ─────
  bus.on('damage:dealt', ({ source, amount }) => {
    if (!source || !source.passive || source.passive.type !== 'lavaRage') return;
    if (source._lavaSpent || source._lavaTransformed) return;
    if (!(amount > 0)) return;
    const gain = Math.round(amount * source.passive.rageDmgPct / 100);
    source._lavaRage = Math.min(source.passive.rageMax, (source._lavaRage || 0) + gain);
    if (typeof renderStatusIcons === 'function') renderStatusIcons(source);
    if (typeof updateHpBar === 'function' && typeof getFighterElId === 'function') {
      updateHpBar(source, getFighterElId(source)); // refresh rage bar
    }
  });

  // ── 熔岩龟: lavaRage (target path — accumulate from damage taken) ──────
  bus.on('damage:dealt', ({ target, amount }) => {
    if (!target || !target.passive || target.passive.type !== 'lavaRage') return;
    if (target._lavaSpent || target._lavaTransformed) return;
    if (!(amount > 0)) return;
    const gain = Math.round(amount * target.passive.rageTakenPct / 100);
    target._lavaRage = Math.min(target.passive.rageMax, (target._lavaRage || 0) + gain);
    if (typeof renderStatusIcons === 'function') renderStatusIcons(target);
    if (typeof updateHpBar === 'function' && typeof getFighterElId === 'function') {
      updateHpBar(target, getFighterElId(target));
    }
  });
})();
