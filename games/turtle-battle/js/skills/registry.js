// ══════════════════════════════════════════════════════════
// registry.js — Skill type → handler dispatch table
// ══════════════════════════════════════════════════════════
// Replaces the 130-branch if/else chain in action.js executeAction.
// Add new skills here instead of editing action.js.
//
// Each entry:
//   fn:         string name of the handler (resolved at call-time via window[])
//   targetMode: how to resolve targets from `action.targetId`
//     'single'      — fn(caster, target, skill)         (target = allFighters[action.targetId])
//     'no-target'   — fn(caster, skill)                  (self-cast / aoe handled inside fn)
//     'aoe-enemies' — fn called for each alive enemy
//     'aoe-allies'  — fn called for each alive ally (caster's team)
//     'shield-flex' — special: aoeAlly flag picks aoe-allies vs single (only `shield`/`commonTeamShield`)
//
// Lazy lookup (`window[h.fn]`) decouples this file from skills/*.js load order.

const SKILL_HANDLERS = {
  // ── Common ──
  heal:               { fn: 'doHeal', targetMode: 'single' },
  shield:             { fn: 'doShield', targetMode: 'shield-flex' },
  bubbleShield:       { fn: 'doBubbleShield', targetMode: 'single' },
  bubbleBind:         { fn: 'doBubbleBind', targetMode: 'single' },
  // ── Hunter ──
  hunterShot:         { fn: 'doHunterShot', targetMode: 'single' },
  hunterBarrage:      { fn: 'doHunterBarrage', targetMode: 'no-target' },
  hunterStealth:      { fn: 'doHunterStealth', targetMode: 'single' },
  // ── Gambler ──
  gamblerCards:       { fn: 'doGamblerCards', targetMode: 'single' },
  gamblerDraw:        { fn: 'doGamblerDraw', targetMode: 'single' },
  gamblerBet:         { fn: 'doGamblerBet', targetMode: 'single' },
  // ── Hiding ──
  hidingDefend:       { fn: 'doHidingDefend', targetMode: 'no-target' },
  hidingCommand:      { fn: 'doHidingCommand', targetMode: 'no-target' },
  // ── Basic ──
  turtleShieldBash:   { fn: 'doTurtleShieldBash', targetMode: 'single' },
  basicBarrage:       { fn: 'doBasicBarrage', targetMode: 'no-target' },
  // ── Ice ──
  iceSpike:           { fn: 'doIceSpike', targetMode: 'single' },
  iceFrost:           { fn: 'doIceFrost', targetMode: 'no-target' },
  // ── Angel ──
  angelBless:         { fn: 'doAngelBless', targetMode: 'single' },
  angelEquality:      { fn: 'doAngelEquality', targetMode: 'single' },
  // ── Two-head ──
  twoHeadMagicWave:   { fn: 'doTwoHeadMagicWave', targetMode: 'single' },
  twoHeadSwitch:      { fn: 'doTwoHeadSwitch', targetMode: 'single' },
  twoHeadHammer:      { fn: 'doTwoHeadHammer', targetMode: 'single' },
  twoHeadAbsorb:      { fn: 'doTwoHeadAbsorb', targetMode: 'single' },
  twoHeadFear:        { fn: 'doTwoHeadFear', targetMode: 'single' },
  twoHeadSteal:       { fn: 'doTwoHeadSteal', targetMode: 'single' },
  // ── Fortune / Lightning ──
  fortuneDice:        { fn: 'doFortuneDice', targetMode: 'no-target' },
  fortuneAllIn:       { fn: 'doFortuneAllIn', targetMode: 'single' },
  lightningStrike:    { fn: 'doLightningStrike', targetMode: 'single' },
  lightningBuff:      { fn: 'doLightningBuff', targetMode: 'no-target' },
  lightningBarrage:   { fn: 'doLightningBarrage', targetMode: 'no-target' },
  // ── Star ──
  starBeam:           { fn: 'doStarBeam', targetMode: 'single' },
  starWormhole:       { fn: 'doStarWormhole', targetMode: 'single' },
  starMeteor:         { fn: 'doStarMeteor', targetMode: 'no-target' },
  // ── Ghost ──
  ghostTouch:         { fn: 'doGhostTouch', targetMode: 'single' },
  ghostPhase:         { fn: 'doGhostPhase', targetMode: 'no-target' },
  ghostStorm:         { fn: 'doGhostStorm', targetMode: 'single' },
  // ── Line ──
  lineSketch:         { fn: 'doLineSketch', targetMode: 'single' },
  lineLink:           { fn: 'doLineLink', targetMode: 'single' },
  lineFinish:         { fn: 'doLineFinish', targetMode: 'single' },
  // ── Cyber ──
  cyberDeploy:        { fn: 'doCyberDeploy', targetMode: 'no-target' },
  // ── Crystal ──
  crystalSpike:       { fn: 'doCrystalSpike', targetMode: 'single' },
  crystalBarrier:     { fn: 'doCrystalBarrier', targetMode: 'no-target' },
  crystalBurst:       { fn: 'doCrystalBurst', targetMode: 'no-target' },
  // ── Headless ──
  soulReap:           { fn: 'doSoulReap', targetMode: 'no-target' },
  // ── Candy ──
  candyBarrage:       { fn: 'doCandyBarrage', targetMode: 'no-target' },
  // ── Lava / Volcano ──
  lavaBolt:           { fn: 'doLavaBolt', targetMode: 'single' },
  lavaQuake:          { fn: 'doLavaQuake', targetMode: 'no-target' },
  lavaSurge:          { fn: 'doLavaSurge', targetMode: 'single' },
  volcanoSmash:       { fn: 'doVolcanoSmash', targetMode: 'single' },
  volcanoArmor:       { fn: 'doVolcanoArmor', targetMode: 'no-target' },
  volcanoErupt:       { fn: 'doVolcanoErupt', targetMode: 'no-target' },
  // ── Chest ──
  chestSmash:         { fn: 'doChestSmash', targetMode: 'single' },
  chestCount:         { fn: 'doChestCount', targetMode: 'no-target' },
  chestStorm:         { fn: 'doChestStorm', targetMode: 'no-target' },
  chestOpen:          { fn: 'doChestOpen', targetMode: 'no-target' },
  // ── Pirate / Rainbow ──
  pirateCannonBarrage:{ fn: 'doPirateCannonBarrage', targetMode: 'no-target' },
  rainbowStorm:       { fn: 'doRainbowStorm', targetMode: 'no-target' },
  // ── Phoenix ──
  phoenixBurn:        { fn: 'doPhoenixBurn', targetMode: 'single' },
  phoenixShield:      { fn: 'doPhoenixShield', targetMode: 'no-target' },
  phoenixScald:       { fn: 'doPhoenixScald', targetMode: 'single' },
  // ── Ninja ──
  ninjaShuriken:      { fn: 'doNinjaShuriken', targetMode: 'single' },
  ninjaImpact:        { fn: 'doNinjaImpact', targetMode: 'single' },
  ninjaBomb:          { fn: 'doNinjaBomb', targetMode: 'no-target' },
  // ── Ice extras ──
  iceShield:          { fn: 'doIceShield', targetMode: 'no-target' },
  // ── Bamboo ──
  bambooLeaf:         { fn: 'doBambooLeaf', targetMode: 'single' },
  bambooHeal:         { fn: 'doBambooHeal', targetMode: 'no-target' },
  // ── Diamond ──
  diamondFortify:     { fn: 'doDiamondFortify', targetMode: 'no-target' },
  diamondCollide:     { fn: 'doDiamondCollide', targetMode: 'single' },
  // ── Dice ──
  diceAttack:         { fn: 'doDiceAttack', targetMode: 'single' },
  diceAllIn:          { fn: 'doDiceAllIn', targetMode: 'no-target' },
  diceFate:           { fn: 'doDiceFate', targetMode: 'no-target' },
  diceFlashStrike:    { fn: 'doDiceFlashStrike', targetMode: 'no-target' },
  // ── Shell ──
  shellStrike:        { fn: 'doShellStrike', targetMode: 'single' },
  shellCopy:          { fn: 'doShellCopy', targetMode: 'no-target' },
  // ── Basic ──
  basicSlam:          { fn: 'doBasicSlam', targetMode: 'single' },
};

/**
 * Try to handle the action via the registry.
 * @returns {Promise<boolean>} true if handled (caller should skip the if/else chain).
 */
async function dispatchSkill(caster, action, skill) {
  const h = SKILL_HANDLERS[skill.type];
  if (!h) return false;
  const fn = (typeof window !== 'undefined') ? window[h.fn] : null;
  if (typeof fn !== 'function') return false;

  switch (h.targetMode) {
    case 'single': {
      const target = allFighters[action.targetId];
      await fn(caster, target, skill);
      return true;
    }
    case 'no-target':
      await fn(caster, skill);
      return true;
    case 'aoe-enemies': {
      const team = caster.side === 'left' ? rightTeam : leftTeam;
      for (const e of team) {
        if (!e.alive) continue;
        await fn(caster, e, skill);
        if (typeof battleOver !== 'undefined' && battleOver) break;
      }
      return true;
    }
    case 'aoe-allies': {
      const team = caster.side === 'left' ? leftTeam : rightTeam;
      for (const a of team) {
        if (!a.alive) continue;
        await fn(caster, a, skill);
        if (typeof battleOver !== 'undefined' && battleOver) break;
      }
      return true;
    }
    case 'shield-flex': {
      // Used by `shield` / `commonTeamShield`: skill.aoeAlly flag toggles between
      // single-target and full-team shield application.
      if (skill.aoeAlly) {
        const team = caster.side === 'left' ? leftTeam : rightTeam;
        for (const a of team) if (a.alive) await fn(caster, a, skill);
      } else {
        await fn(caster, allFighters[action.targetId], skill);
      }
      return true;
    }
    default:
      console.error('[registry] unknown targetMode:', h.targetMode, 'for', skill.type);
      return false;
  }
}
