async function doCyberDeploy(caster, _skill) {
  if (!caster.passive || caster.passive.type !== 'cyberDrone') { await sleep(500); return; }
  if (caster._drones.length >= caster.passive.maxDrones) {
    addLog(`${caster.emoji}${caster.name} 浮游炮已满（${caster.passive.maxDrones}个）！`);
    await sleep(500);
    return;
  }
  caster._drones.push({ age: 0 });
  const elId = getFighterElId(caster);
  spawnFloatingNum(elId, `+<img src="assets/passive/cyber-drone-icon.png" style="width:16px;height:16px;vertical-align:middle">`, 'passive-num', 0, 0);
  renderStatusIcons(caster);
  addLog(`${caster.emoji}${caster.name} 部署浮游炮！（${caster._drones.length}/${caster.passive.maxDrones}）`);
  await sleep(800);
}

// ── CRYSTAL TURTLE SKILLS ─────────────────────────────────
