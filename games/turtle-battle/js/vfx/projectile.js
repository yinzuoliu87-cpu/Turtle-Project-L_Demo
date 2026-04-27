// ══════════════════════════════════════════════════════════
// vfx/projectile.js — Generic spawn-fly-impact projectile helper
// ══════════════════════════════════════════════════════════
// Replaces the ~30-line spawn-translate-cleanup pattern that was duplicated
// across hunter-arrow / ninja-shuriken / (future: bamboo-orb / fire-bolt / etc.)
//
// Usage:
//   const { arrival } = fireProjectile({
//     attacker, target,
//     sprite: 'hunter-arrow',
//     durationMs: 240,
//     rotateAlongPath: true,   // arrow points toward target
//   });
//   await arrival;             // resolves at 85% of flight (or damageAtMs if given)
//   applyDamage(...);          // caller handles damage + floating numbers
//
// Design notes:
//   - sprite class is responsible for any per-frame loop (e.g. ninja-shuriken
//     spins via its own CSS keyframes). fireProjectile only handles flight.
//   - rotateAlongPath: arrow-style sprites set this; spinning star sprites leave it false.
//   - durationMs / damageAtMs decoupled: caller can sync gameplay (damage) and
//     visuals (flight) independently.

function fireProjectile({
  attacker, target,
  sprite,
  durationMs = 240,
  rotateAlongPath = false,
  damageAtMs = null,
} = {}) {
  const arrivalMs = damageAtMs != null ? damageAtMs : Math.round(durationMs * 0.85);
  const battleField = ENV.battleField;
  const aEl = document.getElementById(getFighterElId(attacker));
  const tEl = document.getElementById(getFighterElId(target));
  if (!battleField || !aEl || !tEl) {
    // Degraded: caller still gets timing promise so damage lands roughly on schedule.
    return { arrival: sleep(arrivalMs), el: null };
  }
  const aBody = aEl.querySelector('.st-body') || aEl;
  const tBody = tEl.querySelector('.st-body') || tEl;
  const bRect = battleField.getBoundingClientRect();
  const aRect = aBody.getBoundingClientRect();
  const tRect = tBody.getBoundingClientRect();
  const zoom = battleField.offsetWidth ? bRect.width / battleField.offsetWidth : 1;
  const aCx = ((aRect.left + aRect.width / 2) - bRect.left) / zoom;
  const aCy = ((aRect.top  + aRect.height / 2) - bRect.top)  / zoom;
  const tCx = ((tRect.left + tRect.width / 2) - bRect.left) / zoom;
  const tCy = ((tRect.top  + tRect.height / 2) - bRect.top)  / zoom;
  const dx = tCx - aCx, dy = tCy - aCy;
  const angleDeg = rotateAlongPath ? Math.atan2(dy, dx) * 180 / Math.PI : 0;

  const el = document.createElement('div');
  el.className = sprite;
  el.style.left = aCx + 'px';
  el.style.top  = aCy + 'px';
  el.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg)`;
  battleField.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transition = `transform ${durationMs}ms linear`;
    el.style.transform  = `translate(-50%,-50%) translate(${dx}px, ${dy}px) rotate(${angleDeg}deg)`;
  });
  setTimeout(() => { try { el.remove(); } catch(e) {} }, durationMs + 80);

  return { arrival: sleep(arrivalMs), el };
}
