# CodeVideoCanvas 前端 UI 设计交接文档（Pencil Agent 执行稿）

> 创建：2026-07-23 · 更新：2026-07-23 · 状态：approved（执行基线）
> 目标文件：`docs/designs/canvas.pen`（Pencil 设计稿，schema v2.14）
> 执行者：Pencil 内置 Agent（通过 batch_design 等 MCP 工具绘制）
> 配套输入：`docs/specs/2026-07-23-prd-code-video-canvas.md`（PRD）、`docs/designs/2026-07-23-platform-architecture-design.md`（架构）

---

## 1. 任务概述

在 `canvas.pen` 内完成 **CodeVideoCanvas** 全套前端 UI 设计稿，包含三部分：

1. **Design System 规范区**（Zone A）：色彩、字体、间距、圆角、阴影、图标规范，全部以 `.pen` 变量定义（含 light / dark 双主题）。
2. **组件库**（Zone B）：约 30 个组件，全部做成 `reusable: true` 的可复用组件。
3. **六个页面设计稿**（Zone C）：1440×900 桌面屏幕，浅色主题呈现。

### 1.1 产品一句话理解

把一段文字稿，通过"语义分镜 → 节点式画布 → 逐镜代码视频 → 音画合成 → 一键导出"，变成一支高完成度短视频的**本地优先 AIGC 视频创作引擎**。画布上每个分镜是一个可独立生成、独立渲染、独立修改的节点。

### 1.2 Demo 功能边界（设计必须覆盖 / 不得越界）

- **覆盖**：剧本导入、语义分镜、分镜描述（AI）、分镜节点渲染、定向重渲、画布编辑、本地存储、StepFun Key 设置、合成导出、字幕、配音、配乐、转场。
- **禁止出现**：登录/注册/账号体系、云端同步、多人协作、计费、头像/个人中心、服务器部署相关 UI（PRD 明确非目标）。

### 1.3 设计语言

**苹果风格（Apple HIG Inspired）**：浅色优先、大量留白、连续圆角、克制的色彩、毛玻璃侧栏、系统化语义色。参照 macOS / iOS 原生应用的质感，不做炫技渐变和重阴影。

---

## 2. 执行环境规则（batch_design 操作纪律）

执行 Agent 必须遵守以下操作顺序与纪律：

1. **第一步永远是 `SetVariables`**：把第 4 章全部变量一次性写入（含 dark 主题），后续所有节点只通过 `$变量名` 引用颜色/字体/间距/圆角，**禁止**在组件和页面里散落硬编码色值（色板展示区除外）。
2. **先组件、后页面**：Zone B 组件全部建完并拿到返回的组件 ID 后，Zone C 页面一律用 `{type:"ref", ref:<组件ID>}` 实例化，通过 `descendants` 覆盖文本/状态，禁止在页面里复制粘贴组件结构。
3. **每个 batch_design 只做一件事**：一个组件 / 一个页面区块 / 一次变量写入。组件创建与组件实例化不得混在同一个 batch（实例化需要上一步返回的 ID）。
4. **占位工作流**：每个根级 frame 创建时带 `placeholder: true`，该 frame 内容全部完成后立即 `Update(<id>, {placeholder:false})`，不要拖到全部结束。
5. **找空位**：根级 frame 放置前调用 `FindEmptySpace`（按第 3 章的空间规划，用上一个 frame 的 ID 作 `nodeId` 锚点串联），禁止随机坐标、禁止根级重叠。
6. **每个节点必须有 `name`**（人类可读中文/英文命名），禁止设置 `id`（由系统生成）。
7. **文本规则**：text 节点必须设 `fill`（否则不可见）；需要换行的长文本必须 `textGrowth:"fixed-width"` + `width:"fill_container"`（父级有 layout 时）；按钮/标签短文本用默认 `auto`，不设宽高。
8. **布局规则**：优先 flex 布局 + `fit_content` / `fill_container`；禁止百分比宽高；只有 frame 能设 `layout`/`padding`；`layout:"none"` 仅用于画布节点区、时间线这类绝对定位场景。
9. **图标**：统一 `{type:"icon", library:"lucide"}`，尺寸 16 或 20，`fill` 继承文字色或阶段色。**禁止用 emoji 充当图标**。
10. **即时验证**：每完成一个 Zone/页面，调用 `get_screenshot` 检查（第 9 章验收清单），发现问题直接 Update 修复，**禁止删除重做**。

---

## 3. 画布空间规划（canvas.pen 布局图）

组件在上、页面在下，从左到右、从上到下生长（符合 Pencil 文档规范）：

```
y=0      ┌─────────────────────────────────────────────────┐
         │ Zone A · 设计规范区                               │
         │  A1 封面 (1440×360)                               │
         │  A2 色彩规范 (含暗色配套 token)                     │
         │  A3 字体与网格规范 (1440×560)                     │
         │  A4 图标白名单 (1440×1100，A3 右侧)                 │
y≈1920   ├─────────────────────────────────────────────────┤
         │ Zone B · 组件库（每个组件独立 reusable frame）      │
         │  B1 基础控件行  B2 反馈行  B3 导航行  B4 业务节点行 │
y≈4743   ├─────────────────────────────────────────────────┤
         │ Zone C · 浅色页面（6 屏横排，每屏 1440×900, clip）  │
         │  S1 → S2 → S3 → S4 → S5 → S6（间距 160）           │
y≈5803   ├─────────────────────────────────────────────────┤
         │ Zone D · 暗色页面（对齐浅色屏正下方）               │
         │  S1 Dark → … → S6 Dark（theme.mode=dark）         │
└─────────────────────────────────────────────────┘
```

- Zone A 三个 frame 内部用 flex 分区，不需要精确绝对坐标；A4 放在 A3 右侧。
- Zone C 六屏用 `FindEmptySpace({width:1440, height:900, direction:"right", padding:160, nodeId:<上一屏ID>})` 依次向右排列。
- Zone D 用 `FindEmptySpace(..., direction:"bottom", nodeId:<对应浅色屏ID>)` 对齐在浅色屏下方。
- Zone B 组件之间横向间距 64，分组标题用 note 节点（如 "B1 · 基础控件 / Controls"）。

---

## 4. Design Tokens 全量定义（SetVariables 照抄）

### 4.1 颜色变量（含 dark 主题）

主题轴：`mode: light / dark`。以下每个变量都是 `{type:"color", value:[{value:<浅色>, theme:{mode:"light"}}, {value:<深色>, theme:{mode:"dark"}}]}`。

**品牌与语义色：**

| 变量名 | light | dark | 用途 |
|---|---|---|---|
| `accent` | `#007AFF` | `#0A84FF` | 主操作色（主按钮/选中/渲染中/链接） |
| `accent-fill` | `#007AFF1A` | `#0A84FF29` |  tinted 按钮/选中背景（10% 透明度） |
| `success` | `#34C759` | `#30D158` | 成功 / 已渲染 / 校验通过 |
| `warning` | `#FF9500` | `#FF9F0A` | 警告 / QA WARNING |
| `danger` | `#FF3B30` | `#FF453A` | 失败 / 破坏性操作 / QA BLOCK |
| `purple` | `#AF52DE` | `#BF5AF2` | AI 生成 / 风格相关 |
| `pink` | `#FF2D55` | `#FF375F` | 导出 / 成片 |
| `teal` | `#30B0C7` | `#40CBE0` | 音频 / 缓存命中 |
| `indigo` | `#5856D6` | `#5E5CE6` | 分镜合同 / spec |

**流水线阶段色（节点/进度/标签的统一色语言）：**

| 变量名 | light | dark | 对应阶段 |
|---|---|---|---|
| `stage-ingest` | `#30B0C7` | `#40CBE0` | Ingest 剧本导入/语义分镜 |
| `stage-direct` | `#AF52DE` | `#BF5AF2` | Direct 风格圣经 |
| `stage-shotspec` | `#5856D6` | `#5E5CE6` | Shot-Spec 分镜合同 |
| `stage-shot` | `#007AFF` | `#0A84FF` | Shot 分镜节点（核心） |
| `stage-audio` | `#FF2D55` | `#FF375F` | Audio 配音/字幕 |
| `stage-assemble` | `#FF9500` | `#FF9F0A` | Assemble 配乐/转场/拼接 |
| `stage-finalize` | `#34C759` | `#30D158` | Finalize QA/导出 |

**中性色与语义背景：**

| 变量名 | light | dark | 用途 |
|---|---|---|---|
| `bg` | `#FFFFFF` | `#000000` | 页面主背景 |
| `bg-secondary` | `#F2F2F7` | `#1C1C1E` | 次级背景（侧栏/分组区底色） |
| `surface` | `#FFFFFF` | `#1C1C1E` | 卡片/分组列表表面 |
| `surface-raised` | `#FFFFFF` | `#2C2C2E` | 浮层（Dialog/Toast/下拉） |
| `fill` | `#F2F2F7` | `#2C2C2E` | 控件填充（灰按钮/未选中段） |
| `fill-strong` | `#E5E5EA` | `#3A3A3C` | 按下/强填充 |
| `separator` | `#3C3C432E` | `#5454587A` | 分隔线/描边（含透明度） |
| `label` | `#000000` | `#FFFFFF` | 主文字 |
| `label-secondary` | `#3C3C4399` | `#EBEBF599` | 次级文字 |
| `label-tertiary` | `#3C3C434C` | `#EBEBF54C` | 占位/辅助文字 |
| `canvas-bg` | `#F5F5F7` | `#111111` | 节点画布底色 |
| `scrim` | `#00000066` | `#00000080` | 模态遮罩 |

### 4.2 字体变量（string 类型）

| 变量名 | 值 | 用途 |
|---|---|---|
| `font-sans` | `Inter` | 西文/数字 |
| `font-sc` | `Noto Sans SC` | **一切含中文的文本节点必须用它** |
| `font-mono` | `JetBrains Mono` | 文件名/代码/时间码/JSON 工件 |

### 4.3 字阶（不建变量，作为第 5/6 章引用规格）

| 层级 | 字号 | 字重 | 行高倍数 | 用途 |
|---|---|---|---|---|
| Display | 34 | `bold` | 1.2 | 页面大标题（S1 Hero） |
| Title1 | 28 | `bold` | 1.25 | 页面标题（设置页） |
| Title2 | 22 | `600` | 1.3 | 区块标题/Dialog 标题 |
| Headline | 17 | `600` | 1.3 | 卡片标题/节点标题 |
| Body | 15 | `regular` | 1.4 | 正文/按钮 |
| Subhead | 13 | `regular` | 1.4 | 次级正文/表单 label |
| Caption | 12 | `regular` | 1.35 | 元信息/辅助说明 |
| Micro | 11 | `500` | 1.3 | 徽标/工件名（配 mono） |

### 4.4 数值变量（number 类型）

| 变量名 | 值 | | 变量名 | 值 |
|---|---|---|---|---|
| `space-1` | 4 | | `radius-sm` | 6 |
| `space-2` | 8 | | `radius-md` | 10 |
| `space-3` | 12 | | `radius-lg` | 14 |
| `space-4` | 16 | | `radius-xl` | 20 |
| `space-5` | 20 | | `radius-pill` | 999 |
| `space-6` | 24 | | | |
| `space-8` | 32 | | | |
| `space-10` | 40 | | | |

### 4.5 阴影与效果（直接写在节点 effect 上，不建变量）

- `卡片阴影`：`{type:"shadow", offset:{x:0,y:1}, blur:3, color:"#00000014"}`（参考 `$shadow-card`）
- `浮层阴影`（Dialog/Toast/选中段）：`{type:"shadow", offset:{x:0,y:8}, blur:24, color:"#0000001F"}`（参考 `$shadow-float`）
- `毛玻璃`（侧栏/Toast 背景）：填充用 `$glass` / `$glass-sidebar` + `effect:{type:"background_blur", radius:20}`。

---

## 5. Zone A · 设计规范区（3 个展示 frame）

### A1 封面（1440×360，`fill:"$bg"`，垂直居中）
- 主标题「CodeVideoCanvas」Display 34 bold `$label`；副标题「基于自然语言的代码视频创作工作流程 · 节点平台」Headline 17 `$label-secondary`。
- 下方一行 7 个阶段色小圆点（12×12，依次为 7 个 `stage-*` 色），右侧标注「Design System v1.0 · 2026-07」Caption `$label-tertiary`。

### A2 色彩规范（1440×760，`fill:"$bg-secondary"`，padding 40，垂直 gap 24）
分四组横排色卡（每张色卡 = 64×40 圆角色块 + 变量名 Micro mono + 用途 Caption）：
1. **品牌与语义**：accent / accent-fill / success / warning / danger / purple / pink / teal / indigo
2. **阶段色 ×7**：stage-ingest … stage-finalize（下方标注阶段中英文名）
3. **中性色**：bg / bg-secondary / surface / surface-raised / fill / fill-strong / separator
4. **文字色**：label / label-secondary / label-tertiary（色块做成"Aa"字样示意）

### A3 字体与网格规范（1440×560，`fill:"$bg"`，padding 40）
- 左半：字阶表——Display/Title1/Title2/Headline/Body/Subhead/Caption/Micro 各一行真实字号示例（中文用「语义分镜」字样，`$font-sc`；西文用「Remotion」，`$font-sans`）。
- 右半：圆角阶（6/10/14/20/pill 五个圆角方块）、间距阶（4→40 八个递增色条）、阴影两档、图标规范（lucide 16/20 示例各 4 个：`play` `settings` `plus` `film`）。

---

## 6. Zone B · 组件库（30 个 reusable 组件）

> 通用规则：所有组件 `reusable: true`；文本一律 `$font-sc`（纯西文/数字/文件名可用 `$font-sans` / `$font-mono`）；颜色一律 `$变量`。状态变体通过实例 `descendants` 覆盖呈现，并在组件旁用实例展示全部状态。

### B1 基础控件

**① Button/Primary** — 水平 layout，padding [8,16]，radius `$radius-sm`，fill `$accent`，gap 6，alignItems center。
- 子：可选 icon 16（fill `$on-accent`）+ Label（Body 15 `600`，fill `$on-accent`，auto）。
- 尺寸变体：md 高 36（上）/ sm 高 28（padding [4,12]，Subhead 13）。

**② Button/Tinted** — 同 ① 结构；fill `$accent-fill`，Label fill `$accent`，icon fill `$accent`。

**③ Button/Gray（次级）** — 同 ① 结构；fill `$fill`，Label fill `$label`。

**④ Button/Destructive** — 同 ① 结构；fill `$danger`，Label `$on-accent`。

**⑤ IconButton** — 28×28，radius `$radius-sm`，fill `$fill`（或透明变体），居中 icon 16 fill `$label-secondary`。变体：danger 版 icon fill `$danger`。

**⑥ SegmentedControl（苹果分段 Tab）** — 水平 layout，padding 2，radius `$radius-md`，fill `$fill`，gap 2。
- 段（Segment）：padding [4,14]，radius `$radius-sm`，Subhead 13。选中段：fill `$surface-raised` + 浮层阴影小号 + `600` `$label`；未选中：透明 + `$label-secondary`。
- 组件示例三段：「分镜 / 音频 / 导出」，首段选中。

**⑦ TextField** — 垂直 layout gap 6。Label（Subhead 13 `$label-secondary`）+ 输入框（高 36，padding [8,12]，radius `$radius-md`，fill `$surface`，stroke `$separator` strokeWidth 1；内含 placeholder 文本 Body 15 `$label-tertiary`）。变体：聚焦态 stroke `$accent` strokeWidth 1.5；错误态 stroke `$danger` + 下方 Caption `$danger` 提示。

**⑧ TextArea** — 同 ⑦，输入区高 120，placeholder 用 `textGrowth:"fixed-width"` + `width:"fill_container"`，textAlignVertical top。

**⑨ SearchField** — 高 28，padding [4,10]，radius `$radius-md`，fill `$fill`，水平 gap 6 alignItems center：lucide `search` 14 `$label-tertiary` + 占位 Subhead 13 `$label-tertiary`。

**⑩ Toggle** — 44×26，radius `$radius-pill`。开：fill `$success`，白色圆钮 22×22 靠右（浮层小阴影）；关：fill `$fill-strong`，圆钮靠左。

**⑪ ProgressBar** — 垂直 gap 6：上行 Label（Subhead 13）+ 百分比（Subhead 13 `$label-secondary`，两端 space_between）；下行轨道（高 4，radius 2，fill `$fill`，宽 fill_container）内嵌进度条（同高，radius 2，fill `$accent`，宽按示例 60% 用固定像素）。

**⑫ StatusPill ×5 态** — 高 22，padding [2,10]，radius `$radius-pill`，水平 gap 6 alignItems center：6×6 圆点 + Micro 11 `500`。
| 状态 | 圆点/文字色 | 背景 |
|---|---|---|
| 待生成 | `$label-tertiary` | `$fill` |
| 生成中 | `$accent` | `$accent-fill` |
| 已渲染 | `$success` | `$success-fill` |
| 已缓存 | `$teal` | `$teal-fill` |
| 失败 | `$danger` | `$danger-fill` |

**⑬ Tooltip** — padding [4,8]，radius `$radius-sm`，fill `$tooltip-bg`，Caption 12 `$on-accent`。

### B2 反馈组件

**⑭ Toast ×4 态（通知栏）** — 宽 360，padding 12，radius `$radius-lg`，毛玻璃（fill `$glass` + background_blur 20）+ 浮层阴影，水平 gap 10 alignItems start。
- icon 20（info=`info` `$accent` / success=`circle-check` `$success` / warning=`triangle-alert` `$warning` / error=`circle-x` `$danger`）。
- 中列垂直 gap 2：Title（Subhead 13 `600` `$label`）+ Body（Caption 12 `$label-secondary`，fixed-width fill_container）。
- 右侧：关闭 IconButton（`x`，透明变体）或操作链接（Subhead 13 `$accent`）。
- 四态示例文案：info「AI 正在生成分镜描述」/ success「分镜 03 渲染完成」/ warning「镜头 02 存在 QA 警告」/ error「StepFun Key 校验失败，请检查」。

**⑮ Dialog（模态框）** — 宽 480，radius `$radius-xl`，fill `$surface-raised` + 浮层阴影，垂直 padding 24 gap 16。
- 标题 Title2 22 `600`；说明 Body 15 `$label-secondary`（fixed-width）；内容区（本组件留一个垂直 content slot frame）；底部按钮行（justifyContent end，gap 8：Button/Gray「取消」+ Button/Primary）。
- 展示时放在一块 1440×900 的 scrim 演示帧内（scrim fill `$scrim`，Dialog 居中）。

**⑯ EmptyState** — 垂直 alignItems center gap 12，padding 40：lucide 图标 48 `$label-tertiary` + 标题 Headline 17 `$label-secondary` + 说明 Subhead 13 `$label-tertiary`（fixed-width 居中）+ 可选 Button/Tinted。

### B3 导航组件

**⑰ NavItem** — 高 32，padding [6,10]，radius `$radius-sm`，水平 gap 8 alignItems center，宽 fill_container。
- icon 16 + Label Subhead 13。默认：icon/文字 `$label-secondary`。选中：fill `$fill-strong`，icon `$accent`，文字 `$label` `600`。

**⑱ Sidebar** — 宽 240，高 fill_container，毛玻璃（`$glass-sidebar` + background_blur 20），右侧 1px `$separator` 边，垂直 padding 16 gap 4。**最新 `canvas.pen` 中 S1–S6（含 S2 背景与暗色镜像）均复用同一个 Sidebar symbol；它是常驻应用壳，不是画布页私有组件。**
- 顶部：产品标识行（lucide `clapperboard` 20 `$accent` + 「CodeVideoCanvas」Headline 17）。
- 中部：SearchField + 导航组（小标题 Caption `$label-tertiary` padding [4,10]，如「项目」）+ NavItem×5（工作台/项目列表/画布编辑器/分镜渲染器/合成与导出）。
- 底部：分隔线 + NavItem（设置 `settings`）+ 本地状态行（Caption `$label-tertiary`：「本地模式 · 数据不出本机」+ `$success` 圆点 6×6）。

**⑲ TopBar** — 高 56，宽 fill_container，fill `$surface`，底部 1px `$separator`，水平 padding 16 alignItems center justifyContent space_between。
- 左：页面标题 Headline 17 `600` + 可选副信息 Caption `$label-tertiary`。
- 右：操作区（IconButton / Button 组合，gap 8）。

**⑳ ProjectCard** — 宽 300，radius `$radius-lg`，fill `$surface`，卡片阴影，垂直。
- 缩略区：高 168（16:9），fill `$fill`，居中 lucide `film` 32 `$label-tertiary`；左上叠 StatusPill。
- 信息区 padding 12 垂直 gap 4：标题 Subhead 13 `600`；元行 Caption `$label-tertiary`（「6 个分镜 · 01:24 · 2 小时前」mono 时间）。

**㉑ ArtifactChip（工件芯片）** — 高 26，padding [4,8]，radius `$radius-sm`，fill `$fill`，水平 gap 6 alignItems center：lucide `file-code` 12 `$label-secondary` + 文件名 Micro 11 `$font-mono` `$label`（如 `shot-plan.json`）。

### B4 业务组件（核心）

**㉒ Node/StageNode（上游阶段节点）** — 宽 200，radius `$radius-md`，fill `$surface`，stroke 阶段色 strokeWidth 1.5，卡片阴影，垂直 padding 12 gap 8。`layoutPosition` 由画布绝对定位。
- 头行（水平 gap 8 alignItems center）：lucide 阶段图标 16（阶段色）+ 阶段名 Subhead 13 `600` + 右侧状态圆点 8×8。
- 工件区（垂直 gap 4）：ArtifactChip ×2。
- 端口：左/右各一个 8×8 圆形（fill `$surface`，stroke 阶段色 1.5），绝对定位在节点左右边中点（节点 frame `layout:"none"` 内部绝对放置，或端口做在节点外由画布层管理——执行时任选其一，全文保持一致）。
- 三实例阶段图标/名称：Ingest `file-input`「Ingest 语义分镜」/ Direct `palette`「Direct 风格圣经」/ Shot-Spec `file-check`「Shot-Spec 分镜合同」。

**㉓ Node/ShotNode（分镜节点·产品灵魂）** — 宽 240，radius `$radius-md`，fill `$surface`，stroke `$stage-shot` 1.5，卡片阴影，垂直。左右端口同 ㉒。
- 预览区：宽 fill_container，高 128（≈16:9），fill `$fill`，四角 radius [10,10,0,0]；中央 lucide `play` 24 `$label-tertiary`；左上叠 StatusPill；右下时长标签（fill `$overlay`，Caption 12 mono `$text-inverse`，padding [2,6]，radius 4，如「00:08」）。
- 信息区 padding 12 垂直 gap 6：标题行（Subhead 13 `600`「开场：一个问题」+ 右侧 lucide `ellipsis` 16 `$label-tertiary`）；元行（Caption `$label-tertiary`「HTML+GSAP · 配方 G12」mono 部分 `$font-mono`）；操作行（水平 gap 8）：Button/Tinted sm「重渲此镜」+ Caption `$label-tertiary`「已缓存」。

**㉔ Node/AudioNode** — 宽 200，radius `$radius-md`，fill `$surface`，stroke `$stage-audio` 1.5，padding 12 垂直 gap 8。
- 头行：lucide `audio-lines` 16 `$stage-audio` + 「Audio 配音/字幕」Subhead 13 `600` + 状态点。
- 波形区：高 32，水平 gap 2 alignItems end：12 根宽 3 圆角竖条（fill `$stage-audio`，高度 6–28 交错，写死一组美观数值）。

**㉕ Node/ExportNode** — 宽 200，radius `$radius-md`，fill `$surface`，stroke `$stage-finalize` 1.5，padding 12 垂直 gap 8。
- 头行：lucide `download` 16 `$stage-finalize` + 「Finalize 导出」Subhead 13 `600`。
- 内容行：lucide `video` 16 `$label-secondary` + 「成片 · MP4 1080p」Subhead 13 + 右侧 StatusPill sm（已渲染）。

**㉖ Edge（连线规范，不建组件，画布层直接画）** — `{type:"path"}` 贝塞尔曲线，stroke `$separator`（或上游节点阶段色 40% 透明度），strokeWidth 1.5，无 fill；箭头终点用 6×6 小三角或圆点。从源节点右端口到目标节点左端口。

**㉗ QueueStatusBar（底部队列栏）** — 高 36，宽 fill_container，fill `$surface`，顶部 1px `$separator`，水平 padding 16 alignItems center justifyContent space_between。
- 左：lucide `loader-circle` 14 `$accent` + Caption 12 `$label-secondary`「渲染队列 · 2/8 节点完成」+ 迷你 ProgressBar（宽 120，仅轨道条）。
- 右：Caption `$label-tertiary`「本地渲染 · 命中缓存 5 次」。

**㉘ TimelineTrack（时间线轨道）** — 高 48，宽 fill_container，水平。
- 轨道头（宽 72，Caption 12 `$label-secondary` + icon 14，垂直居中）。
- 轨道区（fill_container，fill `$fill`，radius `$radius-sm`，`layout:"none"` 内部绝对放置 clip）：clip = 圆角 4 色块（分镜轨 `$stage-shot`、字幕轨 `$stage-direct`、配音轨 `$stage-audio`、BGM 轨 `$stage-assemble`），clip 内 Caption 11 使用 `$text-inverse`。

**㉙ ContactSheetThumb（QA 抽帧联系表卡）** — 宽 160，垂直 gap 6。
- 帧区水平 gap 2：三个 52×30 小帧（fill `$fill`，radius 3，分别标注 25%/60%/95% Micro 9-11 `$label-tertiary`）。
- 底行：Caption 12 `$label`「镜头 02」+ 右侧 lucide `circle-check` 14 `$success`（或 `triangle-alert` `$warning`）。

**㉚ SettingsRow + SettingsGroup** — Group：宽 fill_container，radius `$radius-md`，fill `$surface`，卡片阴影，垂直（行间 1px `$separator` 分隔线，左右留 16 缩进）。
- Row：高 44，padding [0,16]，水平 alignItems center justifyContent space_between：左 Label Body 15 `$label`；右控件区（TextField/Toggle/SegmentedControl/StatusPill/Caption `$label-tertiary` + `chevron-right` 16）。

---

## 7. Zone C · 六个页面（1440×900，clip:true，浅色）

> 2026-07-24 以最新 `canvas.pen` 实例树复核：每屏根 frame 为
> `width:1440, height:900, fill:"$bg", layout:"horizontal", clip:true`，
> 第一列固定为 Sidebar ref（240），第二列为页面主区（1200）；S3 的主区再拆
> Center(880)+Inspector(320)。S2 在含 Sidebar 的 S1 背景上叠加 scrim/Dialog。
> 文本版若与 `.pen` 冲突，以 `.pen` 为准。所有组件用 ref 实例化 +
> descendants 覆盖，文案必须取自第 8 章文案库。

### S1 工作台首页（路由 `/`）
```
整体: Sidebar(240, 选中「工作台」) | Main(1200)
Hero区(高179, 垂直 gap16, alignItems center):
  Title Display34 「把一段稿子，变成一支专业视频」
  Sub  Body15 $label-secondary 「语义分镜 · 节点画布 · 逐镜代码视频 · 本机一键导出」(fixed-width, 居中)
  Button/Primary md [plus 16]「新建项目」
新建项目大卡区(高96, 水平 padding80；卡片填满该区):
  radius $radius-lg, stroke $separator dash感→用实线, fill $surface
  居中: lucide [circle-plus] 28 $accent + 「粘贴一段文字稿，开始创作」Headline17 $label-secondary
     + Caption12 $label-tertiary「支持导入 .txt / .md，可选上传配音作为时间地基」
项目区(padding [32,80], 垂直 gap16):
  行标题: 「我的项目」Title2 22 + 右侧 SearchField 实例(宽 220)
  网格行(水平 gap24): ProjectCard ×3
    卡1: 标题「RAG 十分钟入门」StatusPill已渲染 meta「6 个分镜 · 01:24 · 2 小时前」
    卡2: 标题「为什么选择本地优先」StatusPill生成中 meta「8 个分镜 · 02:10 · 昨天」
    卡3: 标题「GSAP 时间轴详解」StatusPill待生成 meta「5 个分镜 · 01:05 · 3 天前」
最近渲染区(padding [0,80], 垂直 gap12):
  「最近渲染」Subhead13 600 $label-secondary
  水平 gap16 ×4: 缩略卡(宽200 高112 fill $fill radius $radius-sm, 内 lucide film 20 $label-tertiary)
    下方 Caption12「分镜 03 · 开场」$label-secondary + Caption12 mono「00:08」$label-tertiary
```

### S2 新建项目（Dialog 演示帧，基于 S1 变暗）
```
Scrim 全屏 fill $scrim
Dialog(居中, 宽 560):
  标题 Title2「新建项目」
  说明 Body15 $label-secondary「粘贴你的文字稿，AI 将按语义自动拆分为分镜节点。」
  TextField 实例: label「项目名称」placeholder「例如：RAG 十分钟入门」
  TextArea 实例(高 180): label「文字稿」placeholder 见文案库 §8.4
  配音行(水平 space_between alignItems center):
    左: lucide [audio-lines] 16 $stage-audio + Subhead13 $label「配音（可选）」
      + Caption12 $label-tertiary「作为全片时间地基」
    右: Button/Gray sm [upload 14]「上传音频」
  预估行: Caption12 $label-tertiary [timer 12]「预计 6–8 个分镜 · 首轮渲染约 3–5 分钟」
  按钮行: Button/Gray「取消」 + Button/Primary [sparkles 16]「生成分镜」
```

### S3 画布编辑器（路由 `(canvas)/`，核心页）
```
整体: 水平三栏 → Sidebar(240) | 中央区 | Inspector(320)
Sidebar 实例: 导航选中「画布编辑器」; 项目小节列出 3 项目(NavItem sm 变体或文本行)
中央区(垂直):
  TopBar 实例: 左「RAG 十分钟入门」Headline17 + Caption $label-tertiary「8 节点 · 已自动保存」
               右 Button/Gray sm [play 14]「全部渲染」+ Button/Primary sm [download 14]「导出 MP4」
  画布区(fill_container × fill_container, fill $canvas-bg, layout:"none" 绝对定位):
    网格底纹: 用 `$canvas-grid` 圆点阵（4×4 一组示意即可, 2×2 圆点, 间距 24, 仅铺左上区域示意）
    节点坐标(相对画布区左上角):
      Ingest  (40, 60)    Direct  (300, 60)   ShotSpec (560, 60)
      Shot01  (80, 300)   Shot02  (360, 300)  Shot03   (640, 300)
      Audio   (220, 540)  Assemble(480, 540)  Finalize (740, 540)
    连线 Edge ×8: Ingest→Direct→ShotSpec; ShotSpec→Shot01/02/03; Shot01/02/03→Audio; Audio→Assemble→Finalize
    节点状态: Ingest/Direct/ShotSpec=已渲染; Shot01=已渲染 StatusPill已渲染;
      Shot02=生成中(选中态: stroke $accent 2 + 外圈 $accent-fill 发光框 4px 扩散);
      Shot03=失败 StatusPill失败; Audio=待生成; Assemble=待生成; Finalize=待生成
    Shot02 标题「核心概念」; Shot01「开场：一个问题」; Shot03「流程图解」
Inspector(320, 右边界 1px $separator, fill $surface, 垂直 padding 16 gap 16):
  「分镜 02」Headline17 + StatusPill生成中
  预览帧(宽 fill_container 高 160 fill $fill radius $radius-sm, 中央 play 24)
  参数组(垂直 gap 10):
    行×4(水平 space_between): Caption $label-secondary 键名 + Subhead13 值(mono 用 $font-mono)
      时长 00:08 / 分辨率 1920×1080 / 动画配方 G12-kinetic / 内容哈希 a3f9c2
  「分镜合同 shot-plan」Subhead13 600 + ArtifactChip×2(shot-plan.json / script-units.json)
  ProgressBar 实例: label「生成进度」62%
  Button/Tinted [refresh-cw 14]「重渲此镜」 + Button/Gray「查看代码」(宽均 fill_container, 垂直 gap 8)
QueueStatusBar 实例(贴底部)
```

### S4 分镜详情（单镜审查页）
```
整体: Sidebar(240, 选中「分镜渲染器」) | Main(1200)
Main: TopBar(56) + 主区
TopBar 实例: 左 [arrow-left 16 IconButton] + 「分镜 02 · 核心概念」Headline17 + StatusPill已渲染
             右 Button/Gray sm「上一镜」+ Button/Gray sm「下一镜」+ Button/Tinted sm [refresh-cw 14]「重渲此镜」
主区(水平, padding 24, gap 24):
  左列(fill_container, 垂直 gap 16):
    预览播放器(宽 fill_container, 高 480, radius $radius-lg, fill #000000, 中央 play 40 白 80%)
    PlayerControls 行(高 48, 水平 gap 12 alignItems center):
      IconButton [skip-back 16] / IconButton [play 18 $accent] / IconButton [skip-forward 16]
      时间码 Caption12 mono $label-secondary「00:03:12 / 00:08:00」
      进度条(fill_container 高4 轨道 $fill, 进度 40% $accent) 音量 icon [volume-2 16 $label-tertiary]
    帧时间线(高 72, 水平 gap 4): 8 个等宽小帧(fill $fill radius 4), 第3帧 stroke $accent 1.5(播放头)
  中栏(宽 380, 垂直 gap 16):
    头行「分镜画布代码」+「已同步」
    代码编辑区(fill_container, `$bg-secondary`, radius `$radius-md`, mono 11)
    底部 Button/Tinted「重渲此镜」
  右栏(宽 320, 垂直 gap 16):
    「分镜合同」Subhead13 600 $label-secondary
    参数组同 S3 Inspector(文案/视觉增幅/构图模式 kinetic-type 等行)
    「字幕」Subhead13 600 $label-secondary + 字幕卡×2(radius $radius-sm fill $fill padding 8:
      Caption12 mono $accent「00:01–00:04」+ Subhead13「为什么大模型会一本正经地胡说八道？」fixed-width)
    「确定性检查」行: lucide [shield-check 14 $success] + Caption12 $label-secondary「无 rAF / 无墙钟 · 通过」
```

### S5 合成导出页
```
整体: Sidebar(240, 选中「合成与导出」) | Main(1200)
TopBar 实例: 左「合成与导出」Headline17; 右 Button/Primary sm [download 14]「导出 MP4」
预览区(高257, 水平居中小预览 480×200 fill #000 radius $radius-lg + 下方「{项目名} · 成片预览」Caption)
时间线区(padding [0,24], 垂直 gap 8):
  标尺行(高 20, Caption11 mono $label-tertiary: 00:00 / 00:20 / 00:40 / 01:00 / 01:20 均布, 下 1px $separator)
  TimelineTrack ×4:
    分镜轨 [film]: 按真实 laneKey 数量与顺序生成 clip（设计示例为 6 个）
    字幕轨 [captions]: 按真实 laneKey 数量生成 clip
    配音轨 [audio-lines]: 1 个通长 clip + 波形纹理(竖条组)
    BGM 轨 [music]: 1 个通长 clip(透明度 60%)
导出与 QA 区(水平 padding 24 gap 24, alignItems start):
  导出面板(宽 320, SettingsGroup 实例):
    Row: 分辨率 → Subhead13 mono「1080×1920 · 竖屏」
    Row: 帧率 →「30 fps」
    Row: 格式 →「MP4 (H.264)」
    Row: 字幕烧录 → Toggle 开
    底部 padding16: Button/Primary 宽 fill_container [download 16]「开始导出」
    ProgressBar 实例: label「导出队列」0%(待开始)
  QA 区(fill_container, 垂直 gap 12):
    「Final QA · 抽帧审查」Subhead13 600 + Caption12 $label-tertiary「25% / 60% / 95% 三态联系表」
    ContactSheetThumb 按真实 laneKey 数量生成（设计示例为 4 个）
    提示行: lucide [triangle-alert 14 $warning] + Caption12 $label-secondary「镜头 03 存在 1 条视觉 WARNING：主视觉偏小」
```

### S6 设置页（路由 `settings/`）
```
整体: Sidebar(240, 选中「设置」) | Main(1200)
内容列(宽 720, 居中, padding [40,0], 垂直 gap 24):
  「设置」Title1 28 bold
  组1标题 Caption $label-tertiary「STEPFUN 模型服务」
  SettingsGroup:
    Row: API Key → 宽 260 TextField(值「sk-••••••••••••3f9c」mono) + Button/Gray sm「校验」+ StatusPill已渲染→descendants 改「已验证」
    Row: 模型 → Subhead13 mono $label-secondary「step-1-8k」+ chevron-right
    Row: 端点 → Caption12 mono $label-tertiary「https://api.stepfun.com/v1」
  组2标题「渲染」
  SettingsGroup:
    Row: 渲染并发数 → Subhead13 mono「4」(本机核数)
    Row: 默认分辨率 →「1080×1920」chevron-right
    Row: 存储位置 → Caption12 mono $label-tertiary「~/CodeVideoCanvas/projects」
    Row: 崩溃续渲 → Toggle 开 + Caption12 $label-tertiary(左 Label 下副标题「作业状态持久化到本地 SQLite」)
  组3标题「外观」
  SettingsGroup:
    Row: 主题 → SegmentedControl 实例(三段「浅色/深色/跟随系统」, 首段选中)
  组4「关于」
  SettingsGroup:
    Row: 版本 → Caption12 mono $label-tertiary「0.1.0 (Demo)」
    Row: 本地模式 → 左 [shield-check 14 $success]「数据不出本机」
  底注 Caption12 $label-tertiary 居中「CodeVideoCanvas · 本地优先的 AIGC 视频创作引擎」
```

---

## 8. 真实 UI 文案库（执行时不得另行编造）

### 8.1 导航与通用
- 产品名：CodeVideoCanvas
- 导航：工作台 / 项目 / 画布 / 设置
- 按钮：新建项目 / 生成分镜 / 全部渲染 / 重渲此镜 / 导出 MP4 / 开始导出 / 取消 / 保存 / 校验 / 上传音频 / 查看代码 / 上一镜 / 下一镜
- 密钥显示：显示 Key

### 8.2 状态文案
- 节点状态：待生成 / 生成中 / 已渲染 / 已缓存 / 失败
- 队列：渲染队列 · {n}/{total} 节点完成 · 本地渲染 · 命中缓存 {n} 次
- 校验：已验证 / 校验失败 / 未配置

### 8.3 示例数据
- 项目：「RAG 十分钟入门」6 分镜 01:24；「为什么选择本地优先」8 分镜 02:10；「GSAP 时间轴详解」5 分镜 01:05
- 分镜标题：开场：一个问题 / 核心概念 / 流程图解 / 代码示例 / 案例对比 / 总结回顾
- 阶段名：Ingest 语义分镜 / Direct 风格圣经 / Shot-Spec 分镜合同 / Shot 分镜节点 / Audio 配音字幕 / Assemble 合成 / Finalize 导出
- 工件名：script-units.json / master-plan.md / style-bible.md / shot-plan.json / audio-manifest.json / storyboard.json / qa-report.json

### 8.4 稿子 placeholder（TextArea 内）
「你有没有想过，为什么大语言模型总是一本正经地胡说八道？这背后不是它"想骗人"，而是它的训练目标决定的——它只学会了"下一个词最可能是什么"。今天这支视频，我们用十分钟讲清楚 RAG：给模型配一本可以翻阅的参考书……」

### 8.5 Toast 文案
- info：AI 正在生成分镜描述 · 分镜 02 的视觉合同编写中
- success：渲染完成 · 分镜 03 已输出 240 帧（00:08）
- warning：QA 警告 · 镜头 03 主视觉偏小，建议复核
- error：StepFun Key 校验失败 · 请检查 Key 是否正确
- 表单校验：创建失败 · 项目名称不能为空 / 请粘贴文字稿
- 创建接口失败：创建失败 · 请稍后重试
- Director 入队失败：创建失败 · 分镜触发失败，可在画布重试

---

## 9. 构建顺序（8 个 batch 阶段）

| # | 阶段 | 产出 | 验证点 |
|---|---|---|---|
| 1 | SetVariables | 第 4 章全部变量（含 dark） | get_variables 抽查 5 个变量值正确 |
| 2 | Zone A ×3 | 封面/色彩/字体规范 | 截图：色卡色值与变量一致、无塌缩 |
| 3 | B1 基础控件 ×13 | 组件 ①–⑬ | 截图：状态变体齐全、文字可见 |
| 4 | B2+B3 ×8 | 组件 ⑭–㉑ | 截图：Toast 四态、毛玻璃生效 |
| 5 | B4 ×9 | 组件 ㉒–㉚ | 截图：节点端口对齐、阶段色正确 |
| 6 | S1 + S2 | 首页 + 新建 Dialog | 截图对比第 7 章结构树 |
| 7 | S3 画布编辑器 | 核心页 | 截图：DAG 连线通顺、选中态清晰、Inspector 完整 |
| 8 | S4 + S5 + S6 | 详情/导出/设置 | 全量截图 + 第 10 章验收 |

每个阶段完成后用 `get_screenshot` 自检，再进入下一阶段；每屏完成即 `placeholder:false`。

## 10. 验收清单（全部通过才算完成）

- [x] 所有颜色/字体/间距/圆角来自 `$变量`，页面中无散落的硬编码色值（色板展示区除外；Duration 叠层 `#00000099` 为预览遮罩特例）
- [x] Zone B 组件全部 `reusable:true`，Zone C 全部以 ref 实例化
- [x] 六屏 1440×900、`clip:true`、无内容溢出、无塌缩（fit/fill 循环依赖）
- [x] 文本对比度：label 系文字在 bg/surface 上清晰可读；白字仅出现在 accent/danger/深色底上（用 `$on-accent`）
- [x] 阶段色七处一致：色板 / 节点描边 / 节点图标 / StatusPill / 时间线 clip / Inspector
- [x] 所有图标为 lucide、尺寸规范见 A4、无 emoji；命名遵循 Pencil Lucide 新名（见 inventory §5.3）
- [x] 文案与第 8 章一致，无编造文案、无登录/云端/账号类元素
- [x] S3 DAG：8 节点 8 连线，流向 Ingest→…→Finalize 清晰，选中/失败/待生成三态可辨
- [x] dark 主题变量已定义，且 **Zone D 六屏（S1–S6 Dark）均有 light/dark 对照**；根 frame `theme: { mode: "dark" }`
- [x] A4 Icons 图标白名单已建；暗色配套 token（glass / on-accent / *-fill 等）已写入变量与 A2 色板
- [x] 体系索引文档：`docs/designs/2026-07-23-design-system-inventory.md`

## 11. 禁止事项（红线）

1. 禁止登录页、注册、头像、个人中心、云端同步、价格页等 PRD 非目标元素。
2. 禁止苹果色系之外的随意配色（阶段色/语义色必须用第 4 章值）。
3. 禁止 emoji 图标、禁止百分比尺寸、禁止 text 上设 padding。
4. 禁止在页面内复制组件结构而不实例化；禁止给节点硬设 id。
5. 禁止大面积重渐变/重阴影；苹果风格靠留白、细分隔线和小圆角取胜。
6. 发现偏差直接 Update 修复，禁止 Delete 重做整屏。
