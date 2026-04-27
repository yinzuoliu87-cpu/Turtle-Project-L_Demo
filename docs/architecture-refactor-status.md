# 架构重构进度（2026-04-27 起）

## 目标
按"上线优先"原则把 turtle-battle 的代码组织从单文件巨型脚本逐步演进到
可测试、可解耦、可复用的结构。每个阶段独立提交、独立可回滚。

V3.1 锚点：`origin/v3.1` 分支保留改动前的版本。

---

## 已完成阶段

### Phase 1.1 — ENV 配置收口（commit `a0a9a8c`）
**目标**：消除 50+ 处对 `window.innerWidth`/`document.getElementById('battleScene')`
的散落引用。

**做了**：
- 新增 [`js/env.js`](../games/turtle-battle/js/env.js)
- `ENV.isMobile` / `ENV.battleField` / `ENV.baseScale` / `ENV.sceneZoom`
- 影响 6 个文件，34 处替换（19 处 isMobile + 15 处 battleField）

**收益**：
- 屏幕宽度/缩放/场景元素只此一份，未来调整 breakpoint 改一处
- 给 BattleCamera (Phase 5) 提供 foundation

### Phase 1.2 — pets.js 拆为命名常量（commit `749d1d5`）
**目标**：让"改一只龟"的 git diff 不要污染整个 800 行文件。

**做了**：
- `ALL_PETS = [{...28只}]` → 28 个 `const PET_<id> = {...};` + 数组聚合
- 数据完全等价（`deepEqual` + 浏览器冒烟双验证）

**收益**：
- 平衡调整时 git blame 干净
- 为将来切 ES module + 每只龟一份 JSON 铺路

### Phase 2A — Buff 操作 API（commit `8e873fc`）
**目标**：把"`f.buffs.push(...) + recalcStats()`"这种隐式约定变成显式 API。

**做了**：
- [`fighter.js`](../games/turtle-battle/js/fighter.js) 新增 `addBuff` / `addBuffs` /
  `removeBuffsWhere` / `clearBuffsByType`
- 4 处迁移示范（angelBless / diceFate / diamondFortify / 赌神偷取）

**收益**：
- 新代码路径自动触发 stats 重算，不会忘
- 为 Phase 2B 提供 hook 点

### Phase 2B — Stats Dirty Flag（commit `0459a7d`）
**目标**：`addBuff` 类调用从全队全量重算降为单只重算。

**做了**：
- 拆 `recalcStats()` → `_recalcOneFighter` + `_recalcDirtyFighters`
- 旧 `recalcStats()` 保留 legacy 语义（force 全员 dirty）
- helper 路径只标记并重算受影响的龟
- hp-scaling 龟（undeadRage / gamblerBlood）始终重算

**实测收益**：5 次 `addBuff` 从 30 次重算降到 5 次（**6× 速度**）。

### Phase 4 — 技能 dispatch 注册表（commit `3f5a226`）
**目标**：消除 action.js 1000+ 行 if/else 长链，新加龟不再改 action.js。

**做了**：
- 新增 [`js/skills/registry.js`](../games/turtle-battle/js/skills/registry.js)
- `SKILL_HANDLERS` 表 74 项映射，`dispatchSkill()` 按 `targetMode` 派发
- 5 种 targetMode：`single` / `no-target` / `aoe-enemies` / `aoe-allies` / `shield-flex`
- 字符串 fn 名 + window[] 查找，与 skills/*.js 加载顺序解耦
- `action.js executeAction` 顶部加 dispatchSkill 早返回

**收益**：
- 覆盖 133 个 if/else 分支中的 56%（74 项）
- 添加新龟 = 在 `registry.js` 加 1 行 + 在 `skills/<turtle>.js` 加 doX 函数
- 21 项 registry 单元测试 + 与现有 4 套测试合计 **86 项断言全过**

### Phase 5 — BattleCamera（commit `aa499d7`）
**目标**：消除 zoom + shake 互相覆盖 transform 的 bug 类。

**做了**：
- 新增 [`js/camera.js`](../games/turtle-battle/js/camera.js)
- API：`zoomTo` / `zoomReset` / `zoomPulse` / `shake` / `reset`
- 自动同步 `--cam-scale` CSS var（这就是烈焰之日 bug 的根因）
- 迁移示范：`doBasicSlam`

**收益**：
- 新 VFX 不会再写 `el.style.setProperty('--cam-scale', ...) + classList.add('battle-scene-shake')` 这种 5 行胶水
- 14 项单元测试覆盖 zoom + shake 互动

---

## 待做阶段

### Phase 1.3 — 战斗常量集中（小，半天）
`SUDDEN_DEATH_TIME / BURN_INTERVAL / DEF_CONSTANT / SHIELD_MULT` 等数值
散在 turn.js / combat.js / state.js。集中到 `js/constants.js`。

### Phase 3 — 事件总线（大，1 周）★最大架构收益
`applyRawDmg` 一个函数干 5 件事（扣血/统计/被动/UI/log）。引入 `bus.emit('damage:dealt', ...)`，
view 层订阅，逻辑层只 emit。详见 [前面规划](#)。

### Phase 4 续（中，1-2 天）
✅ Phase 4 主体已完成（74 项注册，覆盖 56% 分支）。
剩余 59 个 inline 复杂分支可以渐进迁移：
- 把内联逻辑抽成 `doX` 函数 → 加注册条目
- 或扩展 `targetMode` 支持更复杂的目标解析（如 `random-low-hp` / `target-and-row` 等）

### Phase 6 — VFX 流水线（中，1-2 周）
统一抽象 `fireProjectile({from, to, sprite, durationMs, onArrive})`。
现在飞镖/箭矢/能量弹各自写一遍 spawn-fly-impact 模板。

### Phase 7 — Sim / View 完全分离（大，2-3 周）
所有逻辑代码不依赖 DOM。`sim/` 路径不 import `getFighterElId` / `spawnFloatingNum`。
`sim-node.js` 直接 import sim/，跟主代码完全一致（不再漂移）。

---

## 验证脚本（全部存在 `c:/tmp/`）

每个 phase 都附了对应测试，重构前后比对：

| 测试 | 用途 |
|------|------|
| `c:/tmp/smoke_test.mjs` | 浏览器加载冒烟，验证 `ALL_PETS=28` / 无 JS 错误 |
| `c:/tmp/skill_e2e.mjs` | 实际触发 4 个迁移技能, 断言 buff/stats 变化 |
| `c:/tmp/dirty_perf.mjs` | 验证 dirty flag 真的省了 work（recompute 计数） |
| `c:/tmp/camera_test.mjs` | BattleCamera zoom/shake/reset/origin 状态验证 |
| `c:/tmp/registry_test.mjs` | Skill registry dispatch + targetMode 解析验证 |
| `c:/tmp/pets_verify.js` | 数据等价性深度对比（重构前/后 ALL_PETS） |

跑法（在 repo 根目录）：
```bash
cp /c/tmp/<test>.mjs ./_test.mjs && node _test.mjs && rm _test.mjs
```

---

## 安全准则（每个 phase 必须）

1. **零行为变化**：legacy 调用点不动，新 API 共存
2. **三层验证**：
   - 数据等价性（如 deepEqual）
   - 浏览器加载冒烟（无 JS 错误，关键全局变量正确）
   - 功能 E2E（实际触发若干技能，断言效果）
3. **小步提交**：每个 phase 独立 commit，可单独 revert
4. **legacy 永远 fallback**：Phase 2B 的 `recalcStats()` 仍能被旧代码调用

---

## 当前还在用旧 API 的位置（迁移 backlog）

| 模式 | 数量 | 优先级 |
|------|------|------|
| `f.buffs.push(...)` 直推（91 处中已迁 4） | ~87 | 中（每处省 5×单只重算） |
| 手动 `--cam-scale + classList.add('battle-scene-shake')` | ~6 处 | 高（直接 bug 风险） |
| 手动 `el.style.transform = 'scale(...)'` 操作 battleField | ~10 处 | 高（同上） |
| `document.getElementById(getFighterElId(f))` 散落（不属于 ENV.battleField） | ~50 处 | 低（语义不同，留待 Phase 7） |
