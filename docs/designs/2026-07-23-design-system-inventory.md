# CodeVideoCanvas Design System Inventory

> Created: 2026-07-23 · Updated: 2026-07-23 · Status: accepted
> Source of truth: [`canvas.pen`](./canvas.pen) · Spec: [`2026-07-23-ui-design-handoff.md`](./2026-07-23-ui-design-handoff.md)

本文档是设计稿的**体系索引**：画布分区、token、组件、页面布局模式、图标白名单。实现前端主题时以本文 + `.pen` 变量为准。

---

## 1. 画布空间地图

```
y≈0       Zone A · 设计规范
          A1 Cover (1440×360)
          A2 Colors (含暗色配套色卡)
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

## 2. Design Tokens

### 2.1 品牌与语义色

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `accent` | `#007AFF` | `#0A84FF` | 主操作 / 选中 / 链接 |
| `accent-fill` | `#007AFF1A` | `#0A84FF29` | Tinted 按钮 / 选中底 |
| `success` | `#34C759` | `#30D158` | 成功 / 已渲染 |
| `warning` | `#FF9500` | `#FF9F0A` | 警告 / QA WARNING |
| `danger` | `#FF3B30` | `#FF453A` | 失败 / 破坏性 |
| `purple` | `#AF52DE` | `#BF5AF2` | AI / 风格 |
| `pink` | `#FF2D55` | `#FF375F` | 导出 |
| `teal` | `#30B0C7` | `#40CBE0` | 音频 / 缓存 |
| `indigo` | `#5856D6` | `#5E5CE6` | 分镜合同 |

### 2.2 流水线阶段色

| Token | Light | Dark | 阶段 |
|---|---|---|---|
| `stage-ingest` | `#30B0C7` | `#40CBE0` | Ingest 语义分镜 |
| `stage-direct` | `#AF52DE` | `#BF5AF2` | Direct 风格圣经 |
| `stage-shotspec` | `#5856D6` | `#5E5CE6` | Shot-Spec 分镜合同 |
| `stage-shot` | `#007AFF` | `#0A84FF` | Shot 分镜节点 |
| `stage-audio` | `#FF2D55` | `#FF375F` | Audio 配音/字幕 |
| `stage-assemble` | `#FF9500` | `#FF9F0A` | Assemble 合成 |
| `stage-finalize` | `#34C759` | `#30D158` | Finalize 导出 |

### 2.3 中性色与表面

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `bg` | `#FFFFFF` | `#000000` | 页面主背景 |
| `bg-secondary` | `#F2F2F7` | `#1C1C1E` | 次级背景 |
| `surface` | `#FFFFFF` | `#1C1C1E` | 卡片表面 |
| `surface-raised` | `#FFFFFF` | `#2C2C2E` | Dialog / 浮层 |
| `fill` | `#F2F2F7` | `#2C2C2E` | 控件填充 |
| `fill-strong` | `#E5E5EA` | `#3A3A3C` | 按下 / 强填充 |
| `separator` | `#3C3C432E` | `#5454587A` | 分隔线 |
| `label` | `#000000` | `#FFFFFF` | 主文字 |
| `label-secondary` | `#3C3C4399` | `#EBEBF599` | 次级文字 |
| `label-tertiary` | `#3C3C434C` | `#EBEBF54C` | 占位 / 辅助 |
| `canvas-bg` | `#F5F5F7` | `#111111` | 节点画布底 |
| `scrim` | `#00000066` | `#00000080` | 模态遮罩 |

### 2.4 暗色配套变量（暗色可切换硬依赖）

| Token | Light | Dark | 用途 |
|---|---|---|---|
| `on-accent` | `#FFFFFF` | `#FFFFFF` | Primary/Destructive 按钮字/图标 |
| `glass` | `#FFFFFFCC` | `#1C1C1ECC` | Toast 毛玻璃 |
| `glass-sidebar` | `#F2F2F7CC` | `#1C1C1ECC` | Sidebar 毛玻璃 |
| `tooltip-bg` | `#1C1C1E` | `#2C2C2E` | Tooltip 底 |
| `success-fill` | `#34C7591A` | `#30D15829` | StatusPill 已渲染底 |
| `teal-fill` | `#30B0C71A` | `#40CBE029` | StatusPill 已缓存底 |
| `danger-fill` | `#FF3B301A` | `#FF453A29` | StatusPill 失败底 |
| `warning-fill` | `#FF95001A` | `#FF9F0A29` | QA 警告底 |
| `player-bg` | `#000000` | `#000000` | 播放器黑底 |
| `knob` | `#FFFFFF` | `#FFFFFF` | Toggle 圆钮 |
| `shadow-card` | `#00000014` | `#00000066` | 卡片阴影色（文档参考；effect 若不可绑 `$` 则暗色屏手调） |
| `shadow-float` | `#0000001F` | `#00000080` | 浮层阴影色 |

### 2.5 字体 / 字阶 / 间距 / 圆角

| Token | 值 |
|---|---|
| `font-sans` | Inter |
| `font-sc` | Noto Sans SC（含中文文本必须用） |
| `font-mono` | JetBrains Mono |

字阶：Display 34 / Title1 28 / Title2 22 / Headline 17 / Body 15 / Subhead 13 / Caption 12 / Micro 11。

间距：`space-1`…`space-10` → 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40。

圆角：`radius-sm` 6 · `md` 10 · `lg` 14 · `xl` 20 · `pill` 999。

---

## 3. 组件体系（Zone B · 30 reusable）

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
| NavItem | 侧栏 / 顶栏导航项 |
| Sidebar | S3 左栏 |
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

## 4. 页面布局模式（Zone C / D）

| 屏 | 路由意向 | 布局骨架 | 关键组件 |
|---|---|---|---|
| S1 Home | `/` | TopNav(64) → Hero → 新建卡 → ProjectCard 网格 → 最近渲染 | ProjectCard, SearchField, Button/Primary |
| S2 New Project | Dialog on S1 | Scrim + Dialog(560) 表单 | Dialog, TextField, TextArea, Button |
| S3 Canvas | `(canvas)/` | Sidebar(240) \| Center(TopBar+DAG+Queue) \| Inspector(320) | Sidebar, Nodes, QueueStatusBar, ProgressBar |
| S4 Shot Detail | 单镜审查 | TopBar → 播放器+控制 \| 右栏合同/字幕 | IconButton, StatusPill, ArtifactChip |
| S5 Export | 合成导出 | TopBar → 预览 → Timeline×4 → 导出面板 + QA | TimelineTrack, SettingsGroup, ContactSheetThumb |
| S6 Settings | `settings/` | TopNav → 居中 720 列 SettingsGroup×4 | SettingsGroup, Toggle, SegmentedControl |

Zone D 与 Zone C 一一对应；根节点强制 `theme.mode = dark`，文案与结构相同。S6 Dark 主题分段选中「深色」。

---

## 5. 图标体系（A4 · Lucide 白名单）

统一：`{ type: "icon", library: "lucide" }`。禁止 emoji。

### 5.1 尺寸规范

| 尺寸 | 用途 |
|---|---|
| 14 | SearchField、Track 头、行内辅图标 |
| 16 | 按钮内图标、NavItem、节点头 |
| 20 | Toast、品牌标、顶栏强调 |
| 24 | 预览区中央 play |
| 48 | EmptyState 大图标 |

### 5.2 白名单（按分组）

**品牌 / 导航**：`clapperboard` · `layout-dashboard` · `folder` · `settings` · `search`

**操作**：`plus` · `circle-plus` · `x` · `refresh-cw` · `download` · `upload` · `sparkles` · `ellipsis` · `chevron-right` · `arrow-left`

**播放**：`play` · `skip-back` · `skip-forward` · `volume-2` · `loader-circle`

**媒体 / 流水线**：`film` · `file` · `file-input` · `file-check` · `file-code` · `video` · `audio-lines` · `music` · `captions` · `palette`

**状态**：`info` · `circle-check` · `triangle-alert` · `circle-x` · `shield-check` · `timer`

### 5.3 命名约定（Pencil Lucide 新命名）

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

## 6. 暗色实现检查清单

1. 所有填充/描边/文字使用 `$变量`，禁止散落 hex（色板展示区除外）。
2. Toast / Sidebar 使用 `$glass` / `$glass-sidebar` + `background_blur`。
3. Primary / Destructive 字色用 `$on-accent`。
4. StatusPill 态底用 `*-fill` token。
5. Zone D 六屏截图对比：对比度、阶段色、选中描边、毛玻璃可读。
6. S6 外观分段在 Dark 屏选中「深色」。

---

## 7. 相关文件

- [`canvas.pen`](./canvas.pen) — 视觉源稿
- [`2026-07-23-ui-design-handoff.md`](./2026-07-23-ui-design-handoff.md) — Pencil 执行/验收规格
- [`2026-07-23-platform-architecture-design.md`](./2026-07-23-platform-architecture-design.md) — 平台架构
