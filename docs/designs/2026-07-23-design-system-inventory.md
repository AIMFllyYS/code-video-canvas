# CodeVideoCanvas Design System Inventory

> Created: 2026-07-23 · Updated: 2026-07-24 · Status: accepted
> Source of truth: [`canvas.pen`](./canvas.pen) · Spec: [`2026-07-23-ui-design-handoff.md`](./2026-07-23-ui-design-handoff.md)

本文档是设计稿的**体系索引**：画布分区、token、组件、页面布局模式、图标白名单。实现前端主题时以本文 + `.pen` 变量为准。

---

## 1. 画布空间地图

```
y≈0       Zone A · 设计规范
          A1 Cover (1440×360)
          A2 Colors (新分组：品牌/阶段/中性/文字/功能填充/功能表面)
          A3 Type / Grid (1440×560)
          A4 Icons (1440×1100，位于 A3 右侧 x≈1600)

y≈1920    Zone B · 组件库（30 reusable）
          B1 Controls · B2 Feedback · B3 Navigation · B4 Business

y≈4743    Zone C · 浅色页面（横排，间距 160）
          S1 Home → S2 New Project → S3 Canvas → S4 Shot Detail → S5 Export → S6 Settings

y≈5803    Zone D · 暗色页面（对齐 S1–S6 正下方）
          S1 Home Dark → S2 New Project Dark → … → S6 Settings Dark
          根 frame `theme: { mode: "dark" }`，其余结构与浅色屏一致
```

主题轴：`mode: light | dark`。颜色变量均为双主题；数字/字体系列变量无主题轴。

---

## 2. 颜色统一原则

1. **禁止硬编码颜色**。除 A2/A3 色板展示 Chip 外，所有 fill、stroke、effect shadow color 必须引用 `$变量`。
2. **阶段色按流水线语义归类**，不再使用 7 个独立色相的“彩虹板”：
   - 输入 / 媒体：`teal`（`stage-ingest`、`stage-audio`）
   - AI 编排：`purple`（`stage-direct`、`stage-shotspec`）
   - 镜头生成：`accent` 蓝（`stage-shot`）
   - 组装：`warning` 橙（`stage-assemble`）
   - 完成 / 导出：`success` 绿（`stage-finalize`）
3. **暗色背景不再使用纯黑**：`bg` → `#0F0F0F`，`canvas-bg` → `#0A0A0A`，与 `surface`、`fill` 形成明确层级。
4. **阴影统一**：卡片层用 `$shadow-card`，浮层/弹窗/开关/Toast 用 `$shadow-float`。
5. **功能 Token 必须落地**：状态胶囊底用 `*-fill`，彩色背景上文字用 `$text-inverse`，画布网格用 `$canvas-grid`，透明占位用 `$transparent`。

---

## 3. Design Tokens

### 3.1 品牌与语义色

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `accent` | `#007AFF` | `#0A84FF` | 主操作 / 选中 / 链接 |
| `accent-fill` | `#007AFF1A` | `#0A84FF29` | Tinted 按钮 / 选中底 / StatusPill 生成中 |
| `success` | `#34C759` | `#30D158` | 成功 / 已渲染 / Finalize 导出 |
| `warning` | `#FF9500` | `#FF9F0A` | 警告 / QA WARNING / Assemble 组装 |
| `danger` | `#FF3B30` | `#FF453A` | 失败 / 破坏性操作 |
| `purple` | `#AF52DE` | `#BF5AF2` | AI / 风格 / Direct / Shot-Spec |
| `teal` | `#30B0C7` | `#40CBE0` | 媒体 / 输入 / 缓存 / Audio |

> 已删除的通用色：`pink`、`indigo`。这两个色相不再作为通用语义色出现。

### 3.2 流水线阶段色

| Token | Light | Dark | 阶段 | 归类色系 |
|---|---|---|---|---|
| `stage-ingest` | `#30B0C7` | `#40CBE0` | Ingest 语义分镜 | 青 / 媒体输入 |
| `stage-direct` | `#AF52DE` | `#BF5AF2` | Direct 风格圣经 | 紫 / AI |
| `stage-shotspec` | `#AF52DE` | `#BF5AF2` | Shot-Spec 分镜合同 | 紫 / AI |
| `stage-shot` | `#007AFF` | `#0A84FF` | Shot 分镜节点 | 蓝 / 主色 |
| `stage-audio` | `#30B0C7` | `#40CBE0` | Audio 配音/字幕 | 青 / 媒体 |
| `stage-assemble` | `#FF9500` | `#FF9F0A` | Assemble 合成 | 橙 / 警告 |
| `stage-finalize` | `#34C759` | `#30D158` | Finalize 导出 | 绿 / 成功 |

### 3.3 中性色与表面

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `bg` | `#FFFFFF` | `#0F0F0F` | 页面主背景 |
| `bg-secondary` | `#F2F2F7` | `#1C1C1E` | 次级背景 / 规范板底 |
| `surface` | `#FFFFFF` | `#1C1C1E` | 卡片表面 / 输入框 |
| `surface-raised` | `#FFFFFF` | `#252525` | Dialog / 浮层 / 选中分段 |
| `fill` | `#F2F2F7` | `#2C2C2E` | 控件填充 / 轨道背景 |
| `fill-strong` | `#E5E5EA` | `#3A3A3C` | 按下 / 强填充 / 侧栏激活项 |
| `separator` | `#3C3C432E` | `#5454587A` | 分隔线 / 描边 |
| `canvas-bg` | `#F5F5F7` | `#0A0A0A` | 节点画布底 |
| `scrim` | `#00000066` | `#00000080` | 模态遮罩 |

### 3.4 文字色

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `label` | `#000000` | `#FFFFFF` | 主文字 / 标题 |
| `label-secondary` | `#3C3C4399` | `#EBEBF599` | 次级文字 / 描述 |
| `label-tertiary` | `#3C3C434C` | `#EBEBF54C` | 占位 / 辅助 / 禁用图标 |
| `text-inverse` | `#FFFFFF` | `#FFFFFF` | 彩色/深色背景上的白字 |

### 3.5 功能填充

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `accent-fill` | `#007AFF1A` | `#0A84FF29` | 主色浅底 |
| `success-fill` | `#34C7591A` | `#30D15829` | StatusPill 已渲染 / 验证成功 |
| `teal-fill` | `#30B0C71A` | `#40CBE029` | StatusPill 已缓存 |
| `danger-fill` | `#FF3B301A` | `#FF453A29` | StatusPill 失败 |
| `warning-fill` | `#FF95001A` | `#FF9F0A29` | QA 警告底 |
| `overlay` | `#00000099` | `#00000099` | 缩略图蒙层 / 时长标签底 |
| `canvas-grid` | `#3C3C4312` | `#EBEBF526` | 画布网格点 |

### 3.6 功能表面 / 效果

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `on-accent` | `#FFFFFF` | `#FFFFFF` | Primary / Destructive 按钮字/图标 |
| `glass` | `#FFFFFFCC` | `#1C1C1ECC` | Toast 毛玻璃底 |
| `glass-sidebar` | `#F2F2F7CC` | `#1C1C1ECC` | Sidebar 毛玻璃底 |
| `tooltip-bg` | `#1C1C1E` | `#2C2C2E` | Tooltip 底 |
| `player-bg` | `#000000` | `#000000` | 播放器黑底 |
| `knob` | `#FFFFFF` | `#FFFFFF` | Toggle 圆钮 |
| `transparent` | `#00000000` | `#00000000` | 透明填充 / 透明描边占位 |
| `shadow-card` | `#00000014` | `#00000066` | 卡片 / 节点 / 设置组阴影 |
| `shadow-float` | `#0000001F` | `#00000080` | 浮层 / Dialog / Toast / Toggle / SegmentedControl 阴影 |

### 3.7 字体 / 字阶 / 间距 / 圆角

| Token | 值 |
|---|---|
| `font-sans` | Inter |
| `font-sc` | Noto Sans SC（含中文文本必须用） |
| `font-mono` | JetBrains Mono |

字阶：Display 34 / Title1 28 / Title2 22 / Headline 17 / Body 15 / Subhead 13 / Caption 12 / Micro 11。

间距：`space-1`…`space-10` → 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40。

圆角：`radius-sm` 6 · `md` 10 · `lg` 14 · `xl` 20 · `pill` 999。

---

## 4. 组件体系（Zone B · 30 reusable）

### B1 基础控件

| 组件 ID（稿内 name） | 场景 |
|---|---|
| Button/Primary | 主 CTA |
| Button/Tinted | 次主操作（重渲等） |
| Button/Gray | 取消 / 次级 |
| Button/Destructive | 删除等破坏性 |
| IconButton | 工具栏纯图标 |
| SegmentedControl | 分段 Tab（分镜/音频/导出；主题浅色/深色/跟随） |
| TextField / TextArea | 表单 |
| SearchField | 项目搜索 |
| Toggle | 开关 |
| ProgressBar | 渲染/导出进度 |
| StatusPill | 待生成 / 生成中 / 已渲染 / 已缓存 / 失败 |
| Tooltip | 悬停提示 |

### B2 反馈

| 组件 | 场景 |
|---|---|
| Toast | info / success / warning / error |
| Dialog | 模态确认与表单（新建项目） |
| EmptyState | 空列表引导 |

### B3 导航壳

| 组件 | 场景 |
|---|---|
| NavItem | 常驻侧栏导航项 |
| Sidebar | S1–S6 共同应用壳第一列（240px） |
| TopBar | 页面顶栏操作区 |
| ProjectCard | S1 项目网格 |
| ArtifactChip | 工件文件名芯片 |

### B4 业务节点

| 组件 | 场景 |
|---|---|
| Node/StageNode | Ingest / Direct / Shot-Spec |
| Node/ShotNode | 分镜节点（预览+状态） |
| Node/AudioNode | 配音/字幕 |
| Node/ExportNode | Finalize 导出 |
| QueueStatusBar | 底部队列 |
| TimelineTrack | 合成时间线 |
| ContactSheetThumb | QA 抽帧联系表 |
| SettingsRow / SettingsGroup | 设置页行组 |

连线 Edge 不建 reusable，画布层用 `path` 绘制。

---

## 5. 页面布局模式（Zone C / D）

| 屏 | 路由意向 | 布局骨架 | 关键组件 |
|---|---|---|---|
| S1 Home | `/` | Sidebar(240) \| Hero → 新建卡 → ProjectCard 网格 → 最近渲染 | Sidebar, ProjectCard, SearchField, Button/Primary |
| S2 New Project | Dialog on S1 | 含 Sidebar 的 S1 背景 + Scrim + Dialog(560) 表单 | Sidebar, Dialog, TextField, TextArea, Button |
| S3 Canvas | `(canvas)/` | Sidebar(240) \| Center(TopBar+DAG+Queue) \| Inspector(320) | Sidebar, Nodes, QueueStatusBar, ProgressBar |
| S4 Shot Detail | 单镜审查 | Sidebar(240) \| TopBar → 播放器 + Code(380) + 合同(320) | Sidebar, IconButton, StatusPill, SettingsGroup |
| S5 Export | 合成导出 | Sidebar(240) \| TopBar → 480×200 预览 → Timeline×4 → 导出面板 + QA | Sidebar, TimelineTrack, SettingsGroup, ContactSheetThumb |
| S6 Settings | `settings/` | Sidebar(240) \| 居中 720 列 SettingsGroup×4 | Sidebar, SettingsGroup, Toggle, SegmentedControl |

Zone D 与 Zone C 一一对应；根节点强制 `theme.mode = dark`，文案与结构相同。S6 Dark 主题分段选中「深色」。

---

## 6. 图标体系（A4 · Lucide 白名单）

统一：`{ type: "icon", library: "lucide" }`。禁止 emoji。

### 6.1 尺寸规范

| 尺寸 | 用途 |
|---|---|
| 14 | SearchField、Track 头、行内辅图标 |
| 16 | 按钮内图标、NavItem、节点头 |
| 20 | Toast、品牌标、顶栏强调 |
| 24 | 预览区中央 play |
| 48 | EmptyState 大图标 |

### 6.2 白名单（按分组）

**品牌 / 导航**：`clapperboard` · `layout-dashboard` · `folder` · `waypoints` · `settings` · `search`

**操作**：`plus` · `circle-plus` · `x` · `refresh-cw` · `download` · `upload` · `sparkles` · `ellipsis` · `chevron-right` · `arrow-left`

**播放**：`play` · `skip-back` · `skip-forward` · `volume-2` · `loader-circle`

**媒体 / 流水线**：`film` · `file` · `file-input` · `file-check` · `file-code` · `video` · `audio-lines` · `music` · `captions` · `palette`

**状态**：`info` · `circle-check` · `triangle-alert` · `circle-x` · `shield-check` · `timer`

### 6.3 命名约定（Pencil Lucide 新命名）

Pencil 内置 Lucide 使用 v0.400+ 重命名。旧名 → 稿内标准名：

| 旧名（勿用） | 标准名 |
|---|---|
| `plus-circle` | `circle-plus` |
| `more-horizontal` | `ellipsis` |
| `loader-2` | `loader-circle` |
| `file-json` | `file-code` |
| `file-video` | `video` |
| `check-circle-2` | `circle-check` |
| `x-circle` | `circle-x` |
| `alert-triangle` | `triangle-alert` |
| `clock` | `timer` |

代码侧 `lucide-react` 使用与上表「标准名」相同的 export（新包已对齐）。

---

## 7. 暗色实现检查清单

1. 所有填充/描边/文字/阴影使用 `$变量`，禁止散落 hex（色板展示区除外）。
2. Toast / Sidebar 使用 `$glass` / `$glass-sidebar` + `background_blur`。
3. Primary / Destructive 字色用 `$on-accent`。
4. StatusPill 态底用 `*-fill` token。
5. 卡片/节点阴影用 `$shadow-card`，浮层/弹窗用 `$shadow-float`。
6. 画布网格用 `$canvas-grid`，透明占位用 `$transparent`。
7. 彩色背景上的白字用 `$text-inverse`。
8. Zone D 六屏截图对比：对比度、阶段色、选中描边、毛玻璃可读。
9. S6 外观分段在 Dark 屏选中「深色」。

---

## 8. 如何在 `.pen` 里维护这套规范

Pencil 本身支持两种「活规范」机制：

1. **Variables（变量）**：在 `.pen` 文件里定义所有 token，是颜色/字号/间距的单一事实来源。当前已集中管理。
2. **Reusable Components（可复用组件）**：30 个组件即设计系统的原子/分子件，修改一处会同步到所有实例。

但 **文字级设计规范**（如本文的表格、原则、检查清单）不适合放在 `.pen` 里，因为：
- `note` 节点是纯文本，没有层级排版；
- 无法版本控制、无法搜索、无法多端同步；
- 多人协作时难以 diff。

因此推荐：
- **视觉源**：`canvas.pen`（变量 + 组件 + 页面）
- **文字规范**：`docs/designs/2026-07-23-design-system-inventory.md`（本文档）

两者同步节奏：每次调整 `.pen` 变量后，顺手更新本文档对应表格。

---

## 9. 相关文件

- [`canvas.pen`](./canvas.pen) — 视觉源稿
- [`2026-07-23-ui-design-handoff.md`](./2026-07-23-ui-design-handoff.md) — Pencil 执行/验收规格
- [`2026-07-23-platform-architecture-design.md`](./2026-07-23-platform-architecture-design.md) — 平台架构
