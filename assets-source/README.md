# 资源源文件目录

此目录存放可编辑的资源源文件（Aseprite项目、PixelLab导出的中间帧、JSON元数据等），**不直接用于游戏运行**。

## 目录结构

```
assets-source/
├── pets/                      # 动作分帧（PixelLab/Aseprite 产出）
│   └── <龟英文id>/
│       ├── attack/
│       │   ├── frame_0.png ~ frame_N.png   # 动画单帧
│       │   ├── attack_sheet.png             # 合并的 sprite sheet
│       │   ├── attack.json                  # Aseprite 元数据
│       │   └── attack.aseprite              # (可选) 手工编辑后的Aseprite项目
│       ├── idle/
│       ├── hurt/
│       └── death/
├── characters/                # v1 角色完整 sheet 源文件
│   ├── basic_v1.aseprite
│   ├── stone_v1.aseprite
│   ├── bamboo_v1.aseprite
│   └── ...（每只龟一个 <id>_v1.aseprite，部分附 .json）
├── vfx/                       # 技能/被动特效源文件
│   ├── basic/                 # 小龟专属（龟派气波、过肩摔、打击）
│   │   ├── chi-wave.aseprite
│   │   ├── chi-bolt.aseprite
│   │   └── slam-impact.aseprite
│   ├── bamboo/                # 竹叶龟专属
│   │   ├── leaf-orb.aseprite
│   │   └── leaf-burst.aseprite
│   └── common/                # 跨龟通用特效（火焰DoT、冰冻等）
│       └── burn-loop.aseprite
└── sfx/                       # 音效源文件（wav 等）
```

- **`pets/`** 按动作切帧（attack/idle/hurt/death），将来做逐动作动画时用
- **`characters/`** 存放 v1 整体角色 sheet（每帧一个姿势的旧版龟设计稿，导出的 PNG 在 `assets/pets/<中文名>v1.png`）
- **`vfx/<分类>/`** 技能/被动特效源文件：
  - `basic/` 小龟专属 · `bamboo/` 竹叶龟专属 · `common/` 跨龟通用
  - 新龟加特效时新建 `vfx/<龟id>/` 目录（如 `vfx/phoenix/`、`vfx/dice/`）
  - 导出的 PNG + JSON 在 `games/turtle-battle/assets/vfx/<name>.png/json`
- **`sfx/`** 存放原始音频素材（导出的在 `games/turtle-battle/assets/sfx/`）

**规则**：源文件 (`.aseprite`) 只留在 `assets-source/`，游戏只消费 `.png` + `.json`。bamboo目录里同时存 `.png` 是因为用户习惯在 source 里做更新后同步，其他分类可选。

## 工作流

**生成新动画**：
1. 用 PixelLab 生成 sprite sheet + 单帧
2. 下载保存到 `assets-source/pets/<id>/<action>/`
3. 把 sprite sheet 拷贝到 `games/turtle-battle/assets/pets/animations/<id>/<action>.png`

**后续微调**：
1. 打开 Aseprite → Import Sprite Sheet
2. 选 `assets-source/pets/<id>/<action>/attack_sheet.png` + `attack.json`
3. 调整后导出新的 sprite sheet
4. 覆盖 `games/turtle-battle/assets/pets/animations/<id>/<action>.png`
5. 保存 `.aseprite` 项目文件到源文件目录

## 命名规范

- 龟目录：英文id（`basic`, `stone`, `bamboo`, `angel`, `ice`...）
- 动作目录：英文小写（`idle`, `attack`, `cast`, `hurt`, `death`）
- 单帧文件：`frame_0.png`, `frame_1.png`...（从0开始）
- Sprite sheet：`<action>_sheet.png` 或直接 `<action>.png`
- 角色sheet（`characters/`）：`<id>_v<版本>.aseprite`（如 `basic_v1.aseprite`）
- 特效（`vfx/<技能来源>/`）：导出文件名直接对应游戏端引用名（`leaf-orb.aseprite` ↔ `leaf-orb.png`）

## 尺寸标准

| 内容 | 尺寸 |
|------|------|
| 单帧 | 120×120 (PixelLab 默认) |
| Sprite sheet | 帧数 × 120 宽 × 120 高 |
| Idle | 4帧, 480×120, 1500ms循环 |
| Attack/Cast | 6-8帧, 720-960×120, 600-800ms播放 |
| Hurt | 3-4帧, 360-480×120, 300-400ms播放 |
| Death | 5-6帧, 600-720×120, 700-900ms播放 |

## 当前进度

- [x] basic (小龟) — attack 已完成
- [ ] basic — idle / hurt / death
- [ ] ice (寒冰龟) — 全套
- [ ] 其他26只

## 游戏端路径

代码引用的生产文件在：`games/turtle-battle/assets/pets/animations/<id>/<action>.png`

pets.js 中配置示例：
```js
{ id:'basic', ...,
  img:'assets/pets/animations/basic/idle.png',
  sprite:{frames:8,frameW:64,frameH:64,duration:800},
  attackAnim:{src:'assets/pets/animations/basic/attack.png', frames:8, frameW:120, frameH:120, duration:800}
}
```

## .gitignore 注意

`assets-source/` 目录会被git追踪，源文件可共享。如果体积过大后续可考虑 Git LFS。
