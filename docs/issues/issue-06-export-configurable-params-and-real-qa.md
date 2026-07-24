# issue-06：合成导出：可配置参数 + Final QA 真实检测

| 字段 | 值 |
|---|---|
| 优先级 | P1 |
| Wave | 4（`docs/specs/2026-07-23-harness-task-breakdown.md` Track H） |
| 依赖 | `issue-04-shot-thumbnail-infrastructure`（`features/render/thumbnail.ts` 必须先落地）；建议 `issue-01` 收口后回归验证 FINALIZE 输入契约 |
| 关联决策 | `docs/specs/2026-07-23-ai-development-harness.md` §6.6（导出参数存储位置待办，本 issue 落地后需回填该节）、§3.1 移植映射表第 64 行（`features/render/qa-check.ts`） |
| 状态 | 已完成（2026-07-24）。**施工修正**：`export-settings.ts` 因模块边界实置于 `src/features/canvas/`（非 `render/`），见 §A.2 修正说明 |

## 背景

合成导出页（`src/app/(app)/canvas/export/export-workspace.tsx`）当前有两处"看起来能用、实际是假的"字段，命中 AGENTS.md「UI 字段真实性门禁」：

1. **导出设置**：`ExportSettings` 组件（`export-workspace.tsx:255-287`）里分辨率/帧率/格式三个 `SettingsRow` 全部是硬编码字符串字面量（`"1080×1920 · 竖屏"` / `"30 fps"` / `"MP4 (H.264)"`），`export-service.ts` 的 `exportProject()` 完全没有参数入参（`export-service.ts:30-33`），改了前端文案不会影响任何真实行为。
2. **Final QA 抽帧审查**：`ExportQa` 组件（`export-workspace.tsx:289-326`）对每条分镜渲染 `<ContactSheetThumb key={laneKey} label={laneKey} checked />`（第 302 行），`checked` 是恒为 `true` 的字面量，不读取任何后端字段，也不展示真实缩略图（`ContactSheetThumb` 本身也只是按百分比文案占位，不渲染图片，见 `src/components/ui/contact-sheet-thumb.tsx:21-32`）。

本 issue 分两部分独立可验收，但共享同一施工窗口（Wave 4）。

---

## 部分 A：最小可配置导出参数（分辨率 2~3 档预设）

### A.1 现状调研结论

**FABRICATE 阶段 `renderSpec` 生成位置**（`src/features/director/stage-result.ts:48-66`）：

```48:66:src/features/director/stage-result.ts
  if (context.stage === 'FABRICATE') {
    const input = fabricatePromptInputSchema.parse(context.directorInput)
    const allocation = input.audioAllocation.shots.find(
      (shot) => shot.id === input.shot.id
    )
    if (!allocation) {
      throw new Error(`FABRICATE 缺少分镜 ${input.shot.id} 的音频分配`)
    }
    return {
      content: rawContent,
      renderSpec: renderSpecSchema.parse({
        fps: input.audioAllocation.fps,
        durationInFrames: allocation.durationInFrames,
        width: 1080,
        height: 1920,
        seed: stableSeed(context.projectId, context.nodeId, input.shot.id),
      }),
    }
  }
```

- `width: 1080, height: 1920` 是**字面量常量，硬编码在函数体内**，不是从任何配置/常量文件读取；`fps` 来自 `audioAllocation.fps`（Demo 阶段固定 30，见 `audio-demo.ts`），也不是导出设置。
- `renderSpec` 校验 schema（第 10-18 行）用 `.strict()`，只接受 `fps/durationInFrames/width/height/seed` 五个字段，没有为分辨率预留任何"档位标识"字段。
- `buildFabricatePrompt()`（`prompts/fabricate.ts:16-45`）传给模型的提示词里**完全不提物理像素尺寸**（无 `1080`/`1920`/`px` 字样），说明 shot HTML 的视觉合同是靠 `shot.mustShow`/`styleBible`/构图区域（TitleRegion/HeroRegion/…）等语义约束表达的，不依赖某个具体像素数——这是判断"分辨率只是编码交付参数、不是内容生产参数"的关键证据（见 A.5 架构判断）。

**分辨率从 shot 级传递到渲染/导出流程的路径**：

- `RenderJob.frames: FrameSpec`（`src/features/render/types.ts:1-15`）携带 `{fps, durationInFrames, width, height}`，是**每个 shot 节点自己的**渲染规格。
- `RenderRepository.loadRenderContext()`（`src/features/render/repository.ts:51-70`）从 `canvas_nodes.data.renderSpec` 读出并校验（`repository.ts:10-18` 的本地 `renderSpecSchema`，字段与 `stage-result.ts` 里那份重复定义，未共享类型——这是一个附带发现的小技术债，本 issue 不处理，仅记录），交给 `HyperframesRenderer.render()`（`renderer.ts:78-83`）用作 Playwright viewport 尺寸（`captureSequence(..., { width, height })`）。
- `RenderExportPlan`（`repository.ts:28-32`）——也就是 `exportProject()`/`getExportReadiness()` 读到的导出计划——**完全不携带分辨率信息**，只有 `{ incompleteNodeIds, shots: {nodeId, laneKey, outputKey}[], musicKey }`。合并阶段（`export-service.ts`）今天对分辨率毫无感知，纯粹按 `outputKey` 拿已经渲染好的 mp4 直接流拷贝拼接。

**`projects` 表 / 迁移现状**（`src/lib/db/schema.ts:7-13`）：

```7:13:src/lib/db/schema.ts
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  script: text('script').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now),
})
```

- 无 `exportSettings` 列。现有两份迁移：`migrations/0000_gray_captain_cross.sql`（初始建表）、`migrations/0001_friendly_calypso.sql`（给 `canvas_nodes` 追加 `status/content_hash/lane_key/lane_role` 四个可空列）。迁移由 `pnpm db:generate`（drizzle-kit，对比 `schema.ts` 改动自动生成 SQL + `meta/*.json` snapshot）产出，`createDb()`（`src/lib/db/migrate.ts:13-20`）在每次进程启动时对本地 SQLite 文件跑 `migrate()`，`pnpm db:migrate`（`scripts/setup/db-migrate.ts`）是等价的一次性 CLI 入口。**新增 `exportSettings` 列完全遵循已有模式**：仿照 `canvas_nodes` 的可空列追加方式，新增一个可空的 `text('export_settings', { mode: 'json' })` 列，不需要手写 SQL——正常跑 `pnpm db:generate` 让 drizzle-kit 生成第三份迁移即可，禁止手改 `meta/*.json` snapshot。

**JSON 列写法参考**：`canvas_nodes.data` 已经是 `text('data', { mode: 'json' }).$type<Record<string, unknown>>()` 模式（`schema.ts:24`），`exportSettings` 可以照抄这个写法，只是设为可空（不给 `.notNull().default(...)`），应用层在读到 `null` 时回退到硬编码默认值——这样默认值语义清晰（"从未设置过"清楚地是 `null`，不会和"用户主动选择了默认档位"混淆），也不需要迁移时对存量项目回填。

### A.2 `exportSettings` 结构设计

新增 `src/features/canvas/export-settings.ts`（新文件）：

> **施工修正（2026-07-24）**：原计划置于 `src/features/render/export-settings.ts`，但经依赖核实此路径会引入被禁止的循环依赖——`render→director`、`render→canvas`、`director→canvas` 均为既有合法方向，且 memory「director与render模块依赖边界」硬约束 `director` 不得 `import` `features/render`。若本模块放 `render`：`stage-result.ts`（director）引用它 → `director→render`（违规 + 与 `render→director` 成环）；`canvas/schemas.ts` 引用它 → `canvas→render`（与 `render→canvas` 成环）。故改置于 `features/canvas`（`render`/`director` 共依赖的最底层叶子，且 `canvas` 不 import 二者），三方共享同一事实源且零新增循环。`exportSettingsSchema` 亦定义于此，经 `canvas/schemas.ts` 与 `canvas/index.ts` re-export；`schema.ts` 用 `import type` 引用 `ExportSettings` 避免 `lib/db↔canvas` 环。

```typescript
export const EXPORT_RESOLUTION_PRESETS = {
  '1080x1920': { width: 1080, height: 1920, label: '1080×1920 · 竖屏高清' },
  '720x1280': { width: 720, height: 1280, label: '720×1280 · 竖屏标清' },
  '540x960': { width: 540, height: 960, label: '540×960 · 竖屏流畅' },
} as const

export type ResolutionPreset = keyof typeof EXPORT_RESOLUTION_PRESETS

export interface ExportSettings {
  resolutionPreset: ResolutionPreset
}

/** 与 stage-result.ts 里 FABRICATE 母版画幅一致，不可通过导出设置改变。 */
export const MASTER_RESOLUTION_PRESET: ResolutionPreset = '1080x1920'

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  resolutionPreset: MASTER_RESOLUTION_PRESET,
}
```

三档全部保持 **9:16** 竖屏比例（与 `stage-result.ts` 硬编码的母版画幅同比例），理由见 A.5。`stage-result.ts` 里的 `width: 1080, height: 1920` 字面量应改为引用 `EXPORT_RESOLUTION_PRESETS[MASTER_RESOLUTION_PRESET]`，消除魔法数字（这是本 issue 顺带的清理项，不改变行为）。

字幕烧录（`ExportSettings` 里另一个 `<Toggle checked readOnly />`，`export-workspace.tsx:272-274`）同样是恒 `true` 的假开关，是否一并纳入 `ExportSettings.subtitleBurnIn: boolean` 由施工者决定；如果暂不实现真实烧录逻辑，必须按 AGENTS.md 门禁把它显式降级为禁用态说明文案，不能继续保留"看起来能点"的 `Toggle`。**本 issue 的 Tier A 完成条件只覆盖分辨率**，字幕烧录降级处理作为完成条件的必做项但不要求实现真实烧录。

### A.3 设置写入路径

现有 `POST /api/projects`（`src/app/api/projects/route.ts:10-25`）只做创建，不适合承载后续设置更新（创建时不可能知道分辨率偏好，且语义上"改设置"和"建项目"是两个动作）。新增：

- `PATCH /api/projects/[id]`（新文件 `src/app/api/projects/[id]/route.ts`），复用 `src/app/api/artifacts/[id]/route.ts:5-8` 的 `{ params: Promise<{ id: string }> }` 动态路由写法。请求体 `{ exportSettings: { resolutionPreset: string } }`，用 zod 校验 `resolutionPreset` 必须属于 `EXPORT_RESOLUTION_PRESETS` 键集合，非法值直接 400，不写库。
- 领域函数放 `src/features/canvas/actions.ts`（与 `createProject` 同文件），新增 `updateExportSettings(projectId, input)`；读取放 `src/features/canvas/queries.ts`，新增 `getExportSettings(projectId): ExportSettings`（缺省/`null` 时返回 `DEFAULT_EXPORT_SETTINGS`），两者都要经 `src/features/canvas/schemas.ts` 新增的 `exportSettingsSchema` 校验，再从 `src/features/canvas/index.ts` barrel 导出，遵循现有模块结构。

### A.4 `export-service.ts` 消费路径 + `concat.ts` 接入

- `RenderRepository`（或新的轻量读取，视 A.3 归属决定）在 `getExportPlan()`（`repository.ts:91-148`）里追加读取项目 `exportSettings`，解析成 `{ width, height }` 目标分辨率，放进 `RenderExportPlan` 新增字段 `targetResolution: { width: number; height: number }`。
- `exportProject()`（`export-service.ts:30-71`）拿到 `plan.targetResolution` 后传给 `concat()` 调用（第 55-59 行），新增第四个参数。

**`concat.ts` 现状**（`concat.ts:63-101` `buildArgs()`）：视频轨固定 `-c:v copy`（无损流拷贝，不重编码），只有"是否有配乐"两条分支。这意味着**当前实现物理上不可能做任意分辨率交付**——`-c:v copy` 要求所有输入 mp4 编码参数（含分辨率）完全一致才能直接拼接，插入 `-vf scale=...` 之类的视频滤镜和 `-c:v copy` 是互斥的（ffmpeg 会报错或忽略滤镜）。

方案：`buildArgs()` 增加第四参数 `targetResolution?: { width: number; height: number }`，按"目标分辨率是否等于母版分辨率"分两条路径：

```typescript
function buildArgs(
  listPath: string,
  musicPath: string | null,
  outputPath: string,
  targetResolution: { width: number; height: number } | null
): string[] {
  const needsScale =
    targetResolution !== null &&
    (targetResolution.width !== MASTER_WIDTH || targetResolution.height !== MASTER_HEIGHT)

  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-f', 'concat', '-safe', '0', '-i', listPath]
  if (musicPath) args.push('-stream_loop', '-1', '-i', musicPath)

  args.push('-map', '0:v:0')
  if (musicPath) args.push('-map', '1:a:0')

  if (needsScale) {
    args.push('-vf', `scale=${targetResolution.width}:${targetResolution.height}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20')
  } else {
    args.push('-c:v', 'copy')
  }
  args.push(musicPath ? '-c:a' : '-an', ...(musicPath ? ['aac', '-shortest'] : []))
  args.push('-map_metadata', '-1', '-movflags', '+faststart', '-y', outputPath)
  return args
}
```

（示意代码，实际提交需要保留原函数的参数校验/转义逻辑，`MASTER_WIDTH/MASTER_HEIGHT` 从 `export-settings.ts` 导入。）由于三档预设同比例，`scale` 不需要 `pad`/裁切补偿。**默认预设（1080×1920）继续走原有 `-c:v copy` 快路径，行为与今天完全一致，零回归风险**；只有用户主动选择非母版分辨率时才切换到重编码路径。

### A.5 架构判断：渲染时分档 vs 导出时缩放（已拍板）

**已确认：导出时用 ffmpeg `scale` 滤镜重新缩放，而不是在 FABRICATE/渲染阶段就按分辨率分档。** 理由：

1. **不破坏渲染缓存**：`HyperframesRenderer.render()` 的 `renderKey`（`renderer.ts:122-129`）由 HTML + `frames`（含 width/height）+ seed 派生。如果分辨率下沉到 shot 渲染层，用户每切换一次导出分辨率档位，理论上不需要重渲染的已有分镜也会因为 `frames.width/height` 变化而缓存失效，触发全量 Playwright 重新截帧 + ffmpeg 重编码——这是分钟级的开销，而单纯的最终 concat 阶段 `scale` 只是一次性、只在真正导出时执行的转码，代价小得多且不影响任何已有产物。
2. **内容语义与像素尺寸无关**：A.1 已确认 `buildFabricatePrompt()` 不向模型透露任何物理像素数，shot 的可见性合同由 `mustShow`/`styleBible`/构图区域表达。三档预设同比例（9:16）意味着这只是"同一构图、不同交付清晰度"，属于纯粹的编码/交付关注点，不属于内容生产关注点——不需要，也不应该让 FABRICATE 重新生成或重新渲染。
3. **改动面更小、风险更低**：把分辨率下沉到渲染层需要改 `stage-result.ts`（FABRICATE 输入契约）、`renderSpecSchema`、`RenderJob`/`FrameSpec`、`renderer.ts`、缓存键结构等一整条渲染管线，且需要让每个 `shot-codegen` 节点感知一个"项目级"设置（目前 `directorInput` 组装 —`runtime-repository.ts` 里 FABRICATE 分支——完全没有这个概念，还牵扯到 issue-01 的输入契约缺口）。相比之下，"导出时缩放"只触碰 `concat.ts` + `export-service.ts` + 一个新的项目级设置读取，闭环在 `features/render` + `features/canvas` 内，不侵入 Director 六阶段契约。
4. **代价是失去部分场景下的无损直通**：非默认分辨率会强制重编码（有轻微质量损失、CPU 开销、且 `-c:v copy` 的"E2E 确定性产物哈希可预测"特性对重编码路径不成立——`contentHash` 依然是**真实产物**的 SHA-256，只是同一素材在不同预设下会得到不同哈希，这是预期行为，不违反 AGENTS.md「Render 缓存键与产物哈希分离」红线，因为该红线约束的是"不能拿输入 key 冒充哈希"，不是"哈希必须跨分辨率稳定"）。这个代价可接受，且只在用户主动选择非默认档位时发生。
5. **未来若要支持真正不同宽高比**（如 16:9 横屏），那确实是内容生产层面的决策（构图区域、字号、安全边距都要跟着变），必须回到 FABRICATE/渲染层重新设计——**这明确不在本 issue 范围内**，本 issue 的三档预设必须保持同一比例。

### A.6 Part A — 目标 / 允许改动范围 / 完成条件

**目标**：合成导出页支持在 2~3 档同比例分辨率预设间切换并对导出结果生效，替换掉当前的纯静态展示文本。

**允许改动范围**：
- `src/lib/db/schema.ts`（新增 `exportSettings` 列）+ `pnpm db:generate` 产出的新迁移文件与 `meta/*.json` snapshot（不得手写/手改 snapshot）
- `src/features/canvas/export-settings.ts`（新增；原计划 `render/`，因模块边界实置 `canvas/`，见 §A.2 修正）
- `src/features/director/stage-result.ts`（把 `width: 1080, height: 1920` 字面量替换为引用 `MASTER_RESOLUTION_PRESET`，不改变其他行为）
- `src/features/canvas/schemas.ts` / `actions.ts` / `queries.ts` / `index.ts`（新增 `exportSettingsSchema` / `updateExportSettings` / `getExportSettings` 并导出）
- `src/app/api/projects/[id]/route.ts`（新增 PATCH）
- `src/features/render/repository.ts`（`RenderExportPlan` 新增 `targetResolution`）
- `src/features/render/export-service.ts`（读取并传递 `targetResolution`）
- `src/features/render/concat.ts`（`buildArgs()` 分辨率分支）
- `src/app/(app)/canvas/export/export-workspace.tsx` 与 `export-api.ts`（分辨率改为受控展示/切换，读写真实设置）
- 上述文件对应的新增/更新测试

**禁止改动**：
- `src/features/render/renderer.ts`、`frame-capture.ts`、`frame-sequence.ts`、`encode.ts`（单镜渲染管线不受本 issue 影响）
- FABRICATE 的 `renderSpecSchema` 字段集合（仍是 `fps/durationInFrames/width/height/seed`，不新增"预设标识"字段下沉到 shot 级）
- 任何非 9:16 比例的新增预设（跨比例改造不在本 issue 范围）

**完成条件**：
- [x] `projects` 表迁移已生成并可在全新数据库与既有数据库上无损应用
- [x] `PATCH /api/projects/[id]` 校验非法 `resolutionPreset` 返回 400 且不落库；合法值成功持久化
- [x] `exportProject()` 按项目 `exportSettings` 选择分辨率；默认预设（1080×1920）仍走 `-c:v copy` 无损路径，产出结果与改动前逐字节一致（可用既有测试快照/hash 校验）
- [x] 非默认预设导出产物的实际分辨率经 ffprobe（或等价手段）校验与所选预设一致
- [x] 已渲染的单镜 mp4（`render-mp4` artifact）不因切换导出分辨率而失效或重新入队渲染
- [x] 合成导出页分辨率 `SettingsRow` 改为真实受控组件，展示并可切换当前项目设置
- [x] `pnpm lint && pnpm tsc --noEmit && pnpm build` 通过；新增/改动路径有测试覆盖且 `pnpm test` 通过

---

## 部分 B：Final QA 真实抽帧检测

### B.1 现状调研结论

**`lib/determinism/` 的实现方式**（完整 4 个文件已读）：

- `rules.ts`：`DETERMINISM_RULES` 是一个 `{id, pattern: RegExp, message}[]` 数组，规则全部是禁止 `requestAnimationFrame`/`Date.now`/`Math.random`/`gsap.ticker`/`setTimeout`/`setInterval`/CSS `animation`/`transition` 的正则。
- `check.ts`：`checkSource(source: string)` 把字符串按行切分，逐行对每条规则跑 `pattern.test(text)`，命中即记一条 `{ruleId, message, line, snippet}`，返回值全部是"违规列表"（空数组=通过）。
- `index.ts`：纯粹是 re-export，无额外逻辑。
- **输入类型是 `string`（shot 源码文本），不涉及任何二进制/图像数据**；这是渲染**前**的静态代码守卫（`renderer.ts:64-65` 的 `assertDeterministic()` 在截帧前跑一次），语义是"这段 HTML/JS 有没有写非确定性 API"，和"渲染出来的画面内容是不是黑帧/纯色"是完全不同维度的问题（一个是源码文本扫描，一个是像素内容分析；一个跑在渲染前，一个跑在渲染/截帧后）。

**结论：黑帧/像素方差检测不应该放进 `lib/determinism/`**，应该放进 `features/render/qa-check.ts`（新建）。依据：

1. Harness 总纲 §3.1 移植映射表第 64 行已经明确把"QA 三级闸门（Calibration/Block/Final）"对应到 `features/render/qa-check.ts`（几何/像素规则），这是既定的目标路径，不是本 issue 新造的决定。
2. 已核实 `features/render/` 目录当前 23 个文件中**不存在 `qa-check.ts`**（见文件列表），本 issue 是第一次落地这个文件。
3. `lib/determinism` 的公开契约（`checkSource(source: string): DeterminismViolation[]`）从类型签名上就不适合塞进 Buffer/像素输入；混进去会让这个模块同时承担"代码文本合规"和"渲染内容质检"两种不同生命周期、不同调用点的职责，违反单一职责，且会污染 `renderer.ts` 里那次轻量、同步、跑在渲染前的 `assertDeterministic()` 调用点的性能假设（像素分析要读整张图并做数值运算，远比正则扫文本重）。

**canvas 侧 `shot-qa` 节点现状**：`features/canvas/types.ts:11-17` 已定义 `ShotLaneNodeType` 包含 `'shot-qa'`，且 AGENTS.md 明确其对应 `FINALIZE` stage。但 `runtime-repository.ts` 的 `resolveDirectorInput()`（第 186-237 行）里 `FINALIZE` 没有专属分支，落到最后一行 `return row.data.directorInput`（第 236 行）的通用兜底——即 issue-01 描述的"P0 缺口"在这里成立。**本 issue 设计的黑帧检测刻意不依赖 Director/LLM 六阶段管线**：这是一个确定性、无需模型参与的规则检测，不应该等 issue-01 修好 FINALIZE 的 `directorInput` 组装才能做；`shot-qa` 节点在本 issue 里只是"检测结果的一个可选落点"，不通过 `stage-runner.ts`/Pi Agent 执行。

### B.2 图像处理依赖调研

`package.json` 完整依赖列表已核对（dependencies + devDependencies），**没有 `sharp`、`jimp`、`pngjs` 或任何图像解码库**。现有唯一和图像相关的能力是 `frame-capture.ts` 里 Playwright CDP 的 `Page.captureScreenshot({format: 'png', ...})`（第 73-77 行），只产出 PNG `Buffer`，不解码像素。

**这意味着本 issue 的 B 部分需要新增依赖，触发 AGENTS.md「安装/删除依赖——Ask first」边界。已获得用户明确批准：选用 `jimp`。**

| 方案 | 优点 | 缺点 |
|---|---|---|
| `jimp`（**已批准，采用**） | 纯 JS，无原生二进制，在 Windows 开发机（`user_info` 显示 `win32`）上零编译负担，符合"本地优先"简单性 | 纯 JS 解码/遍历像素更慢（但本场景只处理 3 张缩略图/镜头，量级很小，性能不是瓶颈）；API 需要手写均值/方差 |
| `sharp`（未采用） | 性能好、API 成熟（`sharp(buffer).stats()` 直接给出各通道均值/标准差，几乎不需要手写像素遍历） | 原生二进制（类似本项目已有的 `better-sqlite3`/`ffmpeg-static`），需要 `pnpm-workspace`/`onlyBuiltDependencies` 视情况追加平台预编译支持；跨平台包体积较大 |
| 手写极简 PNG 解码（未采用） | 不新增依赖 | 需要自行处理 PNG chunk 解析、多种 color type/bit depth、scanline 反 filter（Sub/Up/Average/Paeth），即使只覆盖"Chromium CDP 截图固定输出 8-bit 非隔行 RGBA"这一种已知情况，仍是一段有相当出错面的图像格式代码，且后续如果换截图来源（如 issue-04 的 `thumbnail.ts` 用了别的编码路径）容易破 |

**选择理由**：本场景是"每镜头 3 张小缩略图跑均值/方差"，不是视频级批量处理，`jimp` 的性能劣势可忽略；换取的是不引入原生二进制，和项目当前"全部在运行者本机运行"的 Demo 阶段简单性更契合。施工时可直接 `pnpm add jimp`，不需要再次确认。

### B.3 最小规则检测方案

给定一张缩略图 `Buffer`（PNG/JPEG 均可，视 `jimp`/`sharp` 解码能力），检测规则：

```typescript
// features/render/qa-check.ts（新增，示意签名，非最终实现）
export interface ThumbnailQaResult {
  label: string          // 对应 25% / 60% / 95% 或 thumbnail.ts 的时间点标识
  meanLuminance: number  // 0-255
  luminanceStdDev: number
  isBlackFrame: boolean      // meanLuminance < BLACK_FRAME_LUMINANCE_THRESHOLD
  isNearSolidColor: boolean  // luminanceStdDev < SOLID_COLOR_STDDEV_THRESHOLD 且非黑帧
  passed: boolean            // !isBlackFrame && !isNearSolidColor
}

export async function checkThumbnailQa(imageBuffer: Buffer): Promise<ThumbnailQaResult>
```

- **黑帧判定**：解码后按 `luminance = 0.299R + 0.587G + 0.114B` 逐像素计算亮度，取全图均值；均值低于阈值（建议起始值 `8`，0-255 量程，约 3%）判定为黑帧。这是最基础、最不会误报的规则。
- **纯色/疑似无内容判定（对应用户提到的"像素方差检测"）**：计算亮度的标准差，若显著低于阈值（建议起始值 `2`）且不是黑帧（避免和黑帧规则重叠触发两次），判定为"疑似纯色/无实质画面内容"——能抓住"渲染出来是一张纯白/纯灰占位图"这类黑帧检测覆盖不到的失败模式。
- 两个阈值都应作为具名常量导出（如 `BLACK_FRAME_LUMINANCE_THRESHOLD`/`SOLID_COLOR_STDDEV_THRESHOLD`），标注"经验起始值，后续可根据真实误报率调整"，不做成用户可配置项（这是"最小规则"，不是完整 QA 系统）。
- 明确不做的事：不引入任何视觉模型/AI 判分（Harness 文档里 QA 三级闸门提到的"可选视觉模型调用"不在本 issue 范围），不做跨帧一致性/运动检测，不做人脸/构图语义分析。

### B.4 检测结果存储与前端消费

**存储位置**：写入触发该缩略图的 shot 的 `shot-qa` 画布节点 `canvas_nodes.data.qaCheck` 字段，形如：

```typescript
interface ShotQaCheckData {
  passed: boolean
  checkedAt: number
  thumbnailContentHash: string  // 对应触发本次检测的缩略图 artifact contentHash，用于判断是否需要重跑
  results: ThumbnailQaResult[]
}
```

选择"写节点 `data` 字段"而不是"新建 artifact kind"，理由：

- 现有同类精神先例是 `renderSpec`/`directorArtifactId`/`renderError`/`directorError` 都直接落在 `canvas_nodes.data`（见 `runtime-repository.ts:162-184`、`repository.ts:72-89`），都是"小体量、per-node 的结构化业务状态"，`qaCheck` 结果（几个数字 + 布尔值）体量和语义都与它们一致。
- 避免新增 artifact kind 需要连带处理 `artifactContentType()`（`src/features/artifacts/service.ts:63-70`）的 content-type 映射、`/api/artifacts/[id]` 的下载路径、以及一份没有下游消费者的独立存储文件——这里检测结果本身就是给 UI 读的一个小结构体，不是需要独立寻址下载的二进制产物。
- `shot-qa` 节点已经存在（`ShotLaneNodeType` 里的一等成员），把检测结果挂在它身上，天然衔接 issue-01 修好之后 `FINALIZE` stage 对这个节点的进一步处理，不会产生两套并行的"分镜 QA 状态"来源。

**触发时机**（需要在真正施工时结合 issue-04 落地后的 `thumbnail.ts` 真实签名确认，此处是设计意图）：`features/render/qa-check.ts` 暴露一个纯函数 `checkThumbnailQa()`（无副作用、单测友好）+ 一个编排函数（如 `runShotQaCheck(projectId, laneKey, thumbnails)`），在 `thumbnail.ts` 产出新的缩略图 artifact 后紧接着调用，写回 `qaCheck` 字段；如果同一批缩略图的 `contentHash` 没变，跳过重复计算。**本 issue 落地前必须重新读一遍 issue-04 的最终代码**，因为当前 `thumbnail.ts` 尚不存在，本文档对它的签名只是假设（`captureThumbnails()` 产出 25%/60%/95% 三张缩略图 artifact），不能保证字段名/调用约定不变。

**前端消费**：

- `GET /api/render/export` 响应（`src/app/api/render/export/route.ts:9-22`，底层 `getExportReadiness()`）新增字段 `shotQa: Record<string, boolean | null>`（key 是 laneKey，`null` 表示尚未产出缩略图/未检测，不能默认为 `true`），来源是 `RenderRepository.getExportPlan()` 读取每个 shot 节点的 `data.qaCheck?.passed ?? null`。
- `export-workspace.tsx` 的 `ExportQa`（第 289-326 行）把 `<ContactSheetThumb key={laneKey} label={laneKey} checked />` 改为 `checked={readiness?.shotQa[laneKey] ?? undefined}`，`ContactSheetThumb` 在 `checked` 为 `undefined`/`null` 时不应渲染"已通过"的勾选图标（当前组件 `checked = true` 默认值本身也需要改成不给默认值，强制调用方显式传入真实状态，见 `src/components/ui/contact-sheet-thumb.tsx:19`）。
- 缩略图本身的图片展示（`ContactSheetThumb` 目前完全不渲染 `<img>`，只显示百分比文字）属于 issue-04/issue-05 的范围，本 issue 不重复实现，只消费其产出的 `checked` 布尔状态。

### B.5 Part B — 目标 / 允许改动范围 / 完成条件

**目标**：合成导出页 Final QA 区块的"通过"勾选状态来自对真实缩略图内容的规则检测，而非恒真字面量。

**允许改动范围**：
- `src/features/render/qa-check.ts`（新增：`checkThumbnailQa()` 纯函数 + 编排函数 + 阈值常量）
- `src/features/render/repository.ts`（`RenderExportPlan` 新增 `shotQa` 字段及读取逻辑）
- `src/app/api/render/export/route.ts` 及 `export-api.ts`（响应体扩展 `shotQa`）
- `src/app/(app)/canvas/export/export-workspace.tsx`（`ExportQa` 消费真实 `shotQa`）
- `src/components/ui/contact-sheet-thumb.tsx`（`checked` 去掉恒真默认值，改为必传或显式 `undefined` 态）
- 依赖 issue-04 落地的 `features/render/thumbnail.ts` 集成点（具体触发挂载位置以 issue-04 实际代码为准）
- `package.json`（新增已批准的 `jimp` 依赖）
- 上述改动对应的新增/更新测试

**禁止改动**：
- `src/lib/determinism/` 全部文件（黑帧/像素检测不得混入这个模块）
- 不得新增 `jimp` 以外的图像处理依赖（若施工中发现 `jimp` 不满足需求，需回来更新本文档并重新征求批准，不能静默换库）
- 不引入任何视觉模型/AI 判分调用（超出"最小规则检测"范围）
- 不新建独立的 QA 结果 artifact kind（除非施工中发现 B.4 的"写节点 data 字段"方案有具体实现障碍，需回来更新本文档并说明原因）

**完成条件**：
- [x] `checkThumbnailQa()` 对已知黑帧样本（如纯黑 PNG）与正常样本分别返回正确的 `isBlackFrame`/`passed`，有单元测试覆盖阈值边界
- [x] `shot-qa` 节点在缩略图产出后写入真实 `qaCheck` 字段，contentHash 不变时不重复计算
- [x] `GET /api/render/export` 返回的 `shotQa` 对未检测分镜返回 `null` 而非默认 `true`
- [x] 合成导出页每个分镜的 `ContactSheetThumb` 勾选状态来自 `shotQa`，未检测/未通过时不显示勾选图标
- [x] `pnpm lint && pnpm tsc --noEmit && pnpm build` 通过；新增路径有测试覆盖且 `pnpm test` 通过

---

## 施工前必须重新核实的假设

1. `issue-04-shot-thumbnail-infrastructure` 的 `thumbnail.ts` 实际签名、artifact kind 命名、产出的百分比/时间点标识——本文档 B 部分对它的引用全部是基于 Harness 文档 §3.1 第 253 行的描述性假设，不是读到的真实代码。
2. `issue-01` 是否已经收口：如果 FINALIZE 阶段的 `directorInput` 组装在本 issue 施工时仍是空缺状态，不影响 B 部分（本设计刻意不经过 Director 管线），但如果后续想让 `shot-qa` 节点真正跑一次 LLM 复核（Harness 文档提到的"可选视觉模型调用"），会依赖 issue-01。
3. ~~`src/app/canvas/export/export-workspace.tsx`（不带路由组前缀的旧路径）与 `src/app/(app)/canvas/export/export-workspace.tsx` 同时存在~~——**已复核，此判断有误**：`git log --oneline -- <旧路径> <新路径>` 会把 rename 显示为同一提交同时"触碰"两个路径，容易误读成"两份文件并存"；实际用 `Glob` 核对当前工作树，`src/app/canvas/**` 已 0 文件，仅 `src/app/(app)/canvas/export/export-workspace.tsx` 一份真实存在。本 issue 只需改这一份文件，不存在需要清理的重复旧文件。
