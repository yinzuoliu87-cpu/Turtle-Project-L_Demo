// ══════════════════════════════════════════════════════════
// stats_tracker.js — bus.on('damage:dealt') stat aggregator
// ══════════════════════════════════════════════════════════
// Subscribes to damage:dealt events and updates each fighter's per-type
// damage counters. Replaces inline tracking that used to live in 3 places
// inside applyRawDmg (main path, undead-lock path, hunter execute path).
//
// IMPORTANT: doDamage in combat.js intentionally calls applyRawDmg with
// source=null (so applyRawDmg's tracking is skipped) and tracks stats
// itself with mainPart/truePart split. This subscriber handles the
// "applyRawDmg called directly" case (skills calling applyRawDmg without
// going through doDamage). doDamage's manual tracking is preserved.

(function registerStatsTracker() {
  if (typeof bus === 'undefined') return;

  bus.on('damage:dealt', ({ source, target, amount, type, isPierce }) => {
    // Source-side tracking: skip when source is null (doDamage path)
    if (source && source._dmgDealt !== undefined) {
      source._dmgDealt += amount;
      if (type === 'magic') source._magicDmgDealt = (source._magicDmgDealt || 0) + amount;
      else if (type === 'true' || isPierce) source._trueDmgDealt = (source._trueDmgDealt || 0) + amount;
      else source._physDmgDealt = (source._physDmgDealt || 0) + amount;
    }
    // Target-side tracking: always track (target is never null in damage events)
    if (target && target._dmgTaken !== undefined) {
      target._dmgTaken += amount;
      if (type === 'magic') target._magicDmgTaken = (target._magicDmgTaken || 0) + amount;
      else if (type === 'true' || isPierce) target._trueDmgTaken = (target._trueDmgTaken || 0) + amount;
      else target._physDmgTaken = (target._physDmgTaken || 0) + amount;
    }
    // Refresh the dmg stats UI panel
    if (typeof updateDmgStats === 'function') updateDmgStats();
  });
})();
