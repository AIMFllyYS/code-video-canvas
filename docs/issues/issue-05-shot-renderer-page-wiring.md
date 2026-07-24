# issue-05 — 分镜渲染器页面真实数据打通

| 字段 | 值 |
|---|---|
| 优先级 | P1 |
| Wave | 3（`docs/specs/2026-07-23-harness-task-breakdown.md` Track H） |
| 依赖 | `issue-04-shot-thumbnail-infrastructure`（缩略图轨道需要其产出） |
| 状态 | 已完成（2026-07-24，待提交） |

## 背景

分镜渲染器页面（`/canvas/shot/[id]`，`src/app/(app)/canvas/shot/[id]/shot-detail.tsx`）是用户查看单个分镜渲染结果、触发重渲的主要入口。经核实，"重渲此镜"与"读取已有代码/预览"两条主链路已经真实接入后端，但播放器控件、缩略图轨道、历史产物加载、分镜合同信息存在多处静态占位，且新增的 `Skeleton` 用法已经覆盖了"代码 fetch 中"的等待态（不要重复建议加 loading 骨架）。

## 根因（当前代码真实行号）

```196:218:src/app/(app)/canvas/shot/[id]/shot-detail.tsx
      <div className="flex h-12 items-center gap-3">
        <IconButton icon={SkipBack} aria-label="上一帧" />
        <IconButton icon={Play} aria-label="播放" />
        <IconButton icon={SkipForward} aria-label="下一帧" />
        <span className="text-xs font-mono text-label-secondary">00:03:12 / 00:08:00</span>
        <ProgressBar value={40} className="flex-1" />
        <Volume2 className="h-4 w-4 text-label-tertiary" />
      </div>
      <div className="grid h-18 grid-cols-8 gap-1">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className={
              index === 2
                ? 'rounded-sm border border-accent bg-fill'
                : 'rounded-sm bg-fill'
            }
          />
        ))}
      </div>
```

| 问题 | 位置 | 说明 |
|---|---|---|
| 播放器控件无 `onClick` | 第 197-199 行 | 上一帧/播放/下一帧三个 `IconButton` 全部是死按钮 |
| 时间戳硬编码 | 第 200 行 | `00:03:12 / 00:08:00` 字面量，与真实视频时长无关 |
| 进度条硬编码 | 第 201 行 | `ProgressBar value={40}`，恒定 |
| 8 格缩略图纯占位 | 第 204-215 行 | 无真实帧图，`index === 2` 硬编码高亮某一格 |
| 历史产物不自动加载 | `useShotRuntime`（第 117-152 行） | `outputUrl` 初始为 `undefined`，只有本次会话点击"重渲此镜"成功后才有值；刷新页面或从其他页面进入都看不到历史渲染结果，即使该分镜早已成功渲染过 |
| 「已同步」文案恒定 | 第 238 行 | `<span className="text-[11px] text-success">已同步</span>` 与代码是否真的和最新渲染结果一致无关，永远显示"已同步" |
| 分镜合同字段硬编码 | 第 263-268 行 | 「构图模式」恒为 `center-stack`、「分辨率」恒为 `540×960`，与该分镜真实的 `renderSpec`/`shot-spec` 内容无关 |
| 确定性声明恒定 | 第 274-277 行 | "无 rAF / 无墙钟 · 通过" 不管该分镜是否真的跑过确定性检测都显示"通过" |

## 修复方案

### 1. 历史产物自动加载

`ShotDetailPage`（server component，`page.tsx`）已经能查询 `getLatestArtifact(projectId, id, 'render-mp4')`（若不存在需新增，参照现有 `getLatestArtifact(projectId, id, 'director-fabricate')` 用于 `previewUrl` 的模式），把已有的 `render-mp4` artifact URL 作为 `outputUrl` 初始 prop 传给 `ShotDetail`，`useShotRuntime` 的 `useState<string>()` 改为 `useState<string | undefined>(initialOutputUrl)`。这样刷新页面/首次进入就能看到历史渲染结果，不需要重渲才能看到。

### 2. 播放器控件绑定真实 `<video>` 状态

改用受控 `<video ref>`：播放/暂停按钮调用 `videoRef.current.play()/pause()`；上一帧/下一帧按钮在有 `outputUrl` 时基于 `fps`（需要从 `renderSpec` 传入）做 `currentTime` 步进；进度条与时间戳绑定 `timeupdate` 事件的真实 `currentTime`/`duration`。当只有 `previewUrl`（iframe 预览，非真实视频）时，这些控件应该整体隐藏或禁用（预览态不是视频，没有播放进度的概念）。

### 3. 缩略图轨道消费 issue-04 产出

依赖 `issue-04` 落地的 `captureThumbnails()`，页面进入且已有 `renderSpec` 时，按 8 个等距 fraction（`0, 1/7, 2/7, ..., 1`）请求缩略图（可以是新增一个轻量 API route，如 `GET /api/render/thumbnails?projectId=...&nodeId=...`，内部调用 `captureThumbnails`），渲染真实 `<img>`；生成前展示 `Skeleton` 占位（复用已有模式），不展示纯色块。

### 4. 代码同步状态改为真实判断

「已同步」应该基于"当前展示的 `sourceCode` 是否对应最新一次成功渲染"来判断（比如比较 `director-fabricate` artifact 的时间戳/hash 与最近一次 `render-mp4` 是否为同一批次，或更简单地：只要 `codeLoading` 为 `false` 且没有 fetch 错误就算"已同步"，渲染中/渲染失败时显示"渲染中"/"待同步"等诚实状态）。具体判断逻辑由施工者结合已有数据设计，但不允许保留恒定的"已同步"。

### 5. 分镜合同字段改为真实数据

「构图模式」「分辨率」应该来自该分镜真实的 `renderSpec`（`canvas_nodes.data.renderSpec` 的 `width`/`height`）与 `director-shot-spec` 产物里的 `composition.mode` 字段（若尚未渲染/尚无 shot spec，显式展示"待生成"而不是编造一个具体值）。「确定性声明」应该反映该分镜最近一次渲染是否真的通过了 `assertDeterministic()`（`renderer.ts` 已有此调用，需要把结果或时间戳持久化到节点 `data` 供页面读取；若尚无此类持久化，最简方案是：只有存在成功的 `render-mp4` 产物时才展示"通过"，否则展示"未验证"）。

### 6. 独立"生成代码"入口

当前只能通过"重渲此镜"间接触发 FABRICATE（内部经 `fabricateShot`）。建议在 `ShotCode` 组件里，当 `sourceCode === '分镜代码尚未生成'` 时提供一个独立的"生成分镜代码"按钮，调用 `POST /api/director/stage {stage: 'FABRICATE'}`（复用画布 Inspector 已有的 `triggerNodeAction` 逻辑或抽出共享函数），而不必强制走"重渲此镜"（后者语义上是"已有代码，重新渲染"，与"还没有代码，先生成"是两个不同的用户意图）。

## 允许改动范围 / 禁止改动 / 完成条件

**目标**：分镜渲染器页面的播放器控件、缩略图轨道、历史产物加载、分镜合同信息全部接入真实数据，消除恒定占位值。

**前置任务**：`issue-04`（缩略图基础设施）完成后才能实现第 3 点；其余各点可先行推进。

**允许改动范围**：
- `src/app/(app)/canvas/shot/[id]/**`（`shot-detail.tsx`、`shot-panels.tsx`、`shot-api.ts`、`page.tsx`）
- `src/app/api/render/thumbnails/**`（新增，若采用 API route 方案）
- `src/features/artifacts/**`（若需要新增 `getLatestArtifact` 支持的 kind 或新查询方法）

**禁止改动**：
- `src/features/render/thumbnail.ts`（issue-04 交付物，本 issue 只消费，不改实现）
- `src/features/director/**`（不改 Director 六阶段逻辑，只新增一个前端可触发的独立 FABRICATE 入口，复用现有 API）

**完成条件**：
- [x] 刷新页面/首次进入即可看到该分镜的历史渲染结果（若存在）
- [x] 播放器上一帧/播放/下一帧/进度条/时间戳全部绑定真实 `<video>` 状态；预览态（无真实视频）时相关控件隐藏或禁用
- [x] 8 格缩略图为真实帧图，加载中展示 `Skeleton`
- [x] 「已同步」文案反映真实同步状态
- [x] 分镜合同的构图模式/分辨率来自真实数据，未生成时显式展示"待生成"
- [x] 独立"生成分镜代码"入口可用，不强制依赖"重渲此镜"
- [~] `pnpm lint && pnpm tsc --noEmit && pnpm build` 通过 —— `pnpm lint` ✅ 全绿、`pnpm build` ✅ 通过（含新增 `/api/render/thumbnails` 与 `/canvas/shot/[id]`，`next build` 不类检 `*.test.ts`）、issue-05 自身文件 `tsc --noEmit` 干净、新增 8 个 shot-api 单测通过；仅**全树 `tsc --noEmit`** 当前被工作区中未提交的 issue-06 WIP（`src/features/render/export-service.test.ts` 缺 `targetResolution/resolutionPreset/shotQa` 字段的 3 处类型错误）阻塞，该文件不在 issue-05 允许改动范围内，按并行施工守则不越界修复
