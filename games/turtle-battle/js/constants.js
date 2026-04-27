// ══════════════════════════════════════════════════════════
// constants.js — Cross-file numeric / configuration constants
// ══════════════════════════════════════════════════════════
// Loaded after env.js / camera.js, before everything else.
//
// Only constants that are SHARED across multiple files belong here.
// File-local timings (e.g. each skill's per-stage sleep durations) stay
// inline near their use site — readability beats centralization there.
//
// pets.js still owns RARITY_MULT / DEF_CONSTANT / RARITY_COLORS since they
// are tightly coupled to the stat formulas in calcEffDef / calcDmgMult.

// ── ATTACK ANIMATION TIMING ───────────────────────────────
// Synchronizes ui.playAttackAnimation() with action.executeAction.
// The default attack-hop arc is 1200ms total:
//   0–240ms:    forward hop (caster moves toward target)
//   240–1040ms: attackAnim sprite plays (~800ms typical)
//   1040–1200ms: hop back to home slot
// executeAction syncs damage to roughly mid-sprite (240 + 160 = 400ms).
const ATTACK_HOP_TOTAL_MS    = 1200;
const ATTACK_HOP_FORWARD_MS  = 240;
const ATTACK_DAMAGE_SYNC_MS  = 400;

// ── BATTLE RULE MULTIPLIERS ───────────────────────────────
// Used by getShieldMult / getMagicDmgMult (engine.js).
// Adjusting balance = change here only.
const RULE_MULT_SHIELD_BUFF  = 1.3;  // 铁壁之日: 护盾值放大
const RULE_MULT_MAGIC_DEBUFF = 0.8;  // 深海之日: 魔法伤害削减
