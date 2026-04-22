// Shared crit helper — returns { isCrit, critMult }
function calcCrit(f) {
  let effectiveCrit = f.crit || 0.25;
  if (f.passive && f.passive.type === 'lowHpCrit' && f.hp / f.maxHp < 0.3) effectiveCrit += f.passive.pct / 100;
  let overflowDmg = 0;
  if (effectiveCrit > 1.0) { overflowDmg = (effectiveCrit - 1.0) * (f.passive && f.passive.overflowMult || 1.5); effectiveCrit = 1.0; }
  const isCrit = Math.random() < effectiveCrit;
  const critMult = isCrit ? (1.5 + (f._extraCritDmgPerm || 0) + (f._extraCritDmg || 0) + overflowDmg) : 1;
  return { isCrit, critMult };
}

// 万能牌: 2-hit attack + self permanent shield + heal + random debuff on target.
