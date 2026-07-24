# issue-01 — Director 六阶段输入契约补全（ASSEMBLE/FINALIZE）

> **Frozen Demo v1 issue.** 保留诊断与完成证据；v3 施工只按
> [`refactor-v3/`](./refactor-v3/) 与 v3 Task Breakdown。

> Created: 2026-07-24
> Status: ✅ 已完成（2026-07-24）——`resolveDirectorInput` 已补全 `score`/`shot-sfx`/`shot-subtitle`/`export`/`shot-qa` 五种节点分支，`stage-prompt.ts` 按 `nodeType` 二次路由；六阶段输入契约无 mock 全部可跑通（决策记录见 §3）
> Priority: P0（见 `docs/specs/2026-07-23-harness-task-breakdown.md` Track H 索引）
> 关联：`docs/specs/2026-07-23-ai-development-harness.md` §3.5.1、§3.5.2
> 范围外延后项（本 issue 不做）：ASSEMBLE/FINALIZE 输出结构化归一、DIRECT/SHOT_SPEC/FABRICATE 存量测试补齐，见 [GitHub Issue #7](https://github.com/AIMFllyYS/code-video-canvas/issues/7)

## 0. 问题陈述

`src/features/director/runtime-repository.ts` 的 `resolveDirectorInput` 只为 `INGEST/DIRECT/SHOT_SPEC/FABRICATE` 四个 stage 显式组装了 `directorInput`：

```186:237:src/features/director/runtime-repository.ts
  private async resolveDirectorInput(
    row: {
      projectTitle: string
      projectScript: string
      nodeProjectId: string
      nodeStage: string | null
      status: string
      data: Record<string, unknown>
      nodeType: string | null
      laneKey: string | null
    },
    stage: PipelineStage
  ): Promise<unknown> {
    if (stage === 'INGEST') {
      return row.data.directorInput ?? { rawScript: row.projectScript }
    }
    if (stage === 'DIRECT') {
      ...
    }
    if (stage === 'SHOT_SPEC') {
      ...
    }
    if (stage === 'FABRICATE') {
      ...
    }
    return row.data.directorInput
  }
```

`ASSEMBLE`（节点类型 `score`/`shot-sfx`/`shot-subtitle`）与 `FINALIZE`（节点类型 `export`/`shot-qa`）落到最后一行的兜底分支，而 `row.data.directorInput` 对这些节点从未被写入（只有 `script-import` 节点在项目创建时写入过一次，见 `actions.ts:29-32`）。

**复现路径已在代码中确认为真实可达，不是假设**：用户在画布上点击 `score`/`export`/`shot-sfx`/`shot-subtitle`/`shot-qa` 任一节点时，`canvas-action-api.ts` 会直接把该节点的 `stage` 发给 `/api/director/stage`：

```1:39:src/app/(app)/canvas/canvas-action-api.ts
const DIRECTOR_STAGES = new Set([
  'INGEST', 'DIRECT', 'SHOT_SPEC', 'FABRICATE', 'ASSEMBLE', 'FINALIZE',
])

export async function triggerNodeAction(...) {
  const render = node.type === 'shot-codegen'
  if (!render && (!node.stage || !DIRECTOR_STAGES.has(node.stage))) {
    throw new Error('当前节点没有可执行阶段')
  }
  const response = await fetcher(
    render ? '/api/render' : '/api/director/stage',
    ...
  )
```

`enqueueDirectorStage → runStage → loadStageContext → resolveDirectorInput` 返回 `undefined`，随后 `stage-prompt.ts` 对 `undefined` 调用 `assemblePromptInputSchema.parse` / `finalizePromptInputSchema.parse`，两者都是 `.strict()` 的 `z.object(...)`，对 `undefined` 输入会抛出 `Invalid input: expected object, received undefined`，节点被 `stage-runner.ts` 的 catch 分支置为 `failed`。**这不是边界情况，是这两类节点在当前代码状态下 100% 必现的崩溃。**

---

## 1. 调研发现

### 发现 1：`resolveDirectorInput` 目前已实现的四个分支遵循同一套「查上游 artifact → 用私有方法读取 → 拼装成类型化对象」模式

```239:297:src/features/director/runtime-repository.ts
  private async loadIngestArtifact(projectId: string): Promise<{
    scriptUnits: unknown
    audioManifest: AudioManifest
    audioAllocation: AudioAllocation
  }> {
    const nodeId = this.findNodeId(projectId, 'script-import')
    const raw = await this.loadArtifactJson(projectId, nodeId, 'director-ingest')
    ...
  }

  private async loadDirectArtifact(
    projectId: string
  ): Promise<{ masterPlan: string; styleBible: string }> {
    const nodeId = this.findNodeId(projectId, 'shot-split')
    const raw = await this.loadArtifactJson(projectId, nodeId, 'director-direct')
    return directArtifactSchema.parse(raw)
  }

  private async loadShotSpecArtifact(projectId: string, laneKey: string): Promise<DirectorShotPlan> {
    const nodeId = this.findNodeId(projectId, 'shot-script', laneKey)
    const raw = await this.loadArtifactJson(projectId, nodeId, 'director-shot-spec')
    return directorShotPlanSchema.parse(raw)
  }

  private findNodeId(projectId: string, type: string, laneKey?: string): string { ... }

  private async loadArtifactJson(projectId: string, nodeId: string, kind: string): Promise<unknown> {
    const artifact = this.db
      .select({ path: artifacts.path })
      .from(artifacts)
      .where(and(eq(artifacts.projectId, projectId), eq(artifacts.nodeId, nodeId), eq(artifacts.kind, kind)))
      .orderBy(desc(artifacts.createdAt), desc(artifacts.id))
      .get()
    if (!artifact) throw new Error(`找不到 ${kind} 产物：${nodeId}`)
    const buffer = await this.storage.get(artifact.path)
    ...
  }
```

模式总结：`findNodeId(projectId, type[, laneKey])` 定位画布节点 → `loadArtifactJson(projectId, nodeId, kind)` 按 `(projectId, nodeId, kind)` 取 `artifacts` 表最新一条记录 → `storage.get(path)` 读文件 → `JSON.parse` → 对应 Zod schema `.parse()` 收窄类型。**ASSEMBLE/FINALIZE 的实现必须复用这四步模式，不应另起炉灶。**

唯一的例外是找不到 `findNodeId` 的复数版本（找同一 `type` 的全部节点，而不是按 `laneKey` 精确定位一个）——这是本次需要新增的能力，因为 `score`/`export` 全局节点需要汇总*全部*分镜通道的产物，而不是定位单个分镜。

### 发现 2：`score`/`export` 是项目创建事务里的全局单例节点，不是 fan-out 产物；`shot-sfx`/`shot-subtitle`/`shot-qa` 是 fan-out 物化的分镜通道节点，`laneKey` = shotId（跨 5 个通道节点共享同一个值），`laneRole` = 节点类型本身

`actions.ts` 在项目创建事务里一次性插入 4 个全局节点：

```8:34:src/features/canvas/actions.ts
const GLOBAL_NODE_DEFINITIONS = [
  { type: 'script-import', stage: 'INGEST' },
  { type: 'shot-split', stage: 'DIRECT' },
  { type: 'score', stage: 'ASSEMBLE' },
  { type: 'export', stage: 'FINALIZE' },
] as const

export function createProject(input: unknown): Project {
  ...
  const nodes = GLOBAL_NODE_DEFINITIONS.map((definition, index) => ({
    id: randomUUID(),
    projectId: project.id,
    ...definition,
    position: { x: index * 260, y: 80 },
    data:
      definition.type === 'script-import'
        ? { directorInput: { rawScript: script } }
        : {},
  }))
  ...
}
```

即：`score`/`export` 全项目**只有一个**，`data` 初始为 `{}`（没有 `directorInput`）。`fan-out.ts` 只是去*查找*已存在的 `score`/`shot-split` 作为锚点，不会创建它们：

```89:98:src/features/canvas/fan-out.ts
function requireSingleAnchor(
  nodes: Array<{ id: string; type: string }>,
  type: AnchorType
): string {
  const matches = nodes.filter((node) => node.type === type)
  if (matches.length !== 1) {
    throw new Error(`项目必须且只能包含一个 ${type} 节点，当前数量：${matches.length}`)
  }
  return matches[0]!.id
}
```

而分镜通道节点（`shot-script`/`shot-codegen`/`shot-sfx`/`shot-subtitle`/`shot-qa`）由 `insertLaneNodes` 按分镜批量创建，`laneKey` 列存的是 `shot.shotId`（同一分镜的 5 个通道节点共享同一个 `laneKey`），`laneRole` 列存节点类型本身，二者组合才能唯一定位一个通道节点：

```27:33:src/features/canvas/fan-out.ts
const LANE_STAGES: Record<ShotLaneNodeType, string> = {
  'shot-script': 'SHOT_SPEC',
  'shot-codegen': 'FABRICATE',
  'shot-sfx': 'ASSEMBLE',
  'shot-subtitle': 'ASSEMBLE',
  'shot-qa': 'FINALIZE',
}
```

```119:143:src/features/canvas/fan-out.ts
function insertLaneNodes(tx: Transaction, projectId: string, shot: ShotLaneSeed): void {
  tx.insert(canvasNodes)
    .values(
      LANE_ROLES.map((role) => ({
        id: stableId('node', projectId, shot.shotId, role),
        projectId,
        type: role,
        stage: LANE_STAGES[role],
        position: { x: 0, y: 0 },
        laneKey: shot.shotId,
        laneRole: role,
        ...
      }))
    )
    .run()
}
```

**结论**：`resolveDirectorInput` 现有的 `FABRICATE` 分支已经用 `findNodeId(projectId, 'shot-script', row.laneKey)` 这套组合键定位单个通道节点（`runtime-repository.ts:225`），ASSEMBLE/FINALIZE 的通道节点分支（`shot-sfx`/`shot-subtitle`/`shot-qa`）应沿用同一套 `(type, laneKey)` 定位方式；而 `score`/`export` 分支要用 `findNodeId(projectId, 'score'|'export')`（不带 `laneKey`，因为全局唯一）。

### 发现 3（核心架构冲突）：`ASSEMBLE`/`FINALIZE` 两个 stage 各自只有**一个** prompt builder + 一个输入 schema，但各自对应**两类结构完全不同的节点**——这是补全 `resolveDirectorInput` 之前必须先拍板的前置问题，不是简单地"多写两个 if 分支"就能完事

`prompts/assemble.ts` 全文：

```1:34:src/features/director/prompts/assemble.ts
import { z } from 'zod'
import { audioAllocationSchema } from '../schemas/ingest'
import { shotPlanSchema } from '../schemas/shot-plan'

export const assemblePromptInputSchema = z
  .object({
    shotPlan: shotPlanSchema,
    audioAllocation: audioAllocationSchema,
    renderedArtifactKeys: z.array(z.string().min(1)).min(1),
  })
  .strict()

export type AssemblePromptInput = z.infer<typeof assemblePromptInputSchema>

export function buildAssemblePrompt(input: AssemblePromptInput): string {
  const parsed = assemblePromptInputSchema.parse(input)
  return `你正在执行 CodeVideoCanvas 的 ASSEMBLE 阶段。

只编排已验证的镜头产物，不重新逐帧渲染镜头：
1. 按 shot plan 顺序拼接 rendered artifact。
2. 音频、字幕与镜头边界必须以 audio allocation 为唯一时间依据。
3. 默认使用硬切；只有合同明确要求时使用转场或 J/L cut。
4. 生成草稿成片与可追踪的合成清单；任一缺失产物必须结构化失败。
...`
}
```

`prompts/finalize.ts` 全文：

```1:34:src/features/director/prompts/finalize.ts
import { z } from 'zod'
import { shotPlanSchema } from '../schemas/shot-plan'

export const finalizePromptInputSchema = z
  .object({
    shotPlan: shotPlanSchema,
    draftArtifactKey: z.string().min(1),
    qaFindings: z.array(z.string().min(1)),
  })
  .strict()

export type FinalizePromptInput = z.infer<typeof finalizePromptInputSchema>

export function buildFinalizePrompt(input: FinalizePromptInput): string {
  const parsed = finalizePromptInputSchema.parse(input)
  return `你正在执行 CodeVideoCanvas 的 FINALIZE 阶段。

最终门禁：
- 检查真实 Main 成片，不以单镜预览替代。
- 核对音画同步、字幕、镜头边界、均匀抽帧、区块入口/出口与稳定尾帧。
...`
}
```

两个 schema 的字段形状（`shotPlan` + 面向"全片"的聚合字段 `renderedArtifactKeys`/`draftArtifactKey`/`qaFindings`）**只吻合 `score` 和 `export` 这两个全局单例节点**："按 shot plan 顺序拼接全部 rendered artifact""检查真实 Main 成片"——这些描述都是全片视角，不是单镜视角。

但 `fan-out.ts` 把 `shot-sfx`/`shot-subtitle` 也标记为 `ASSEMBLE` stage、把 `shot-qa` 标记为 `FINALIZE` stage（发现 2）。`shot-sfx`/`shot-subtitle`/`shot-qa` 是**分镜通道节点**，语义上要做的事是"给*这一个*分镜配音效/字幕/验收"，需要的输入是**单镜的** shot spec + 单镜的渲染产物，而不是全片 `shotPlan`/`renderedArtifactKeys`/`draftArtifactKey`。

而 `stage-prompt.ts` 的路由目前是纯按 `stage` 一对一分发到唯一的 builder：

```27:56:src/features/director/stage-prompt.ts
export function buildStagePrompt(stage: PipelineStage, context: StagePromptContext): string {
  switch (stage) {
    ...
    case 'ASSEMBLE':
      return buildAssemblePrompt(assemblePromptInputSchema.parse(context.directorInput))
    case 'FINALIZE':
      return buildFinalizePrompt(finalizePromptInputSchema.parse(context.directorInput))
  }
}
```

`StagePromptContext` 里也没有携带 `nodeType`：

```21:25:src/features/director/stage-prompt.ts
export interface StagePromptContext {
  projectTitle: string
  projectScript: string
  directorInput: unknown
}
```

**结论**：即使把 `resolveDirectorInput` 的 ASSEMBLE/FINALIZE 分支写出来，如果 `shot-sfx`/`shot-subtitle`/`shot-qa` 三种通道节点仍然被塞进同一个 `assemblePromptInputSchema`/`finalizePromptInputSchema`，要么字段对不上（`shotPlan`/`renderedArtifactKeys` 语义要求全片却只有单镜数据）而在 `stage-prompt.ts` 里 `.parse()` 失败，要么被迫伪造/复用不合适的数据把 schema 硬凑过去。**这个 stage↔nodeType 的 1:1 假设被打破，是这两个 stage 无法用"照抄前四个 stage 的模式"解决的根本原因**，必须先在本 issue 里拍板解决方案，才能继续设计 `resolveDirectorInput` 的具体分支。（详见 §2 决策点 A、B）

### 发现 4：`assemble.ts`/`finalize.ts` 的 `shotPlan` 字段类型用的是**严格** `shotPlanSchema`（`schemas/shot-plan.ts`），但运行时实际写入/读取分镜合同全程走的是**宽松** `directorShotPlanSchema`（`schemas/director-shot-plan.ts`），二者不是同一个类型，直接复用会在聚合阶段炸掉

`schemas/shot-plan.ts` 的 `shotSchema`/`shotPlanSchema` 是**十几个字段全部 `.strict()` 必填**的完整 video-director 分镜合同（`purpose`/`visualGain`/`composition`/`hero`/`motion`/`keyframes`/`sfxCues`/`mustShow`/`mustAvoid`…）：

```139:174:src/features/director/schemas/shot-plan.ts
export const shotSchema = z
  .object({
    id: shotIdSchema,
    blockId: z.string().regex(/^B\d{2,3}$/),
    sourceUnitIds: z.array(unitIdSchema).min(1)...,
    audioBinding: audioBindingSchema,
    purpose: purposeSchema,
    visualGain: visualGainSchema,
    composition: compositionSchema,
    hero: heroSchema,
    onScreenText: uniqueTextListSchema.min(1),
    motion: motionSchema,
    keyframes: keyframesSchema,
    capabilities: uniqueTextListSchema,
    assetRefs: uniqueTextListSchema,
    sfxCues: z.array(sfxCueSchema),
    mustShow: uniqueTextListSchema,
    mustAvoid: uniqueTextListSchema,
    handoff: handoffSchema.optional(),
  })
  .strict()

export const shotPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: nonEmptyText,
    shots: z.array(shotSchema).min(1),
  })
  .strict()
```

而 `schemas/director-shot-plan.ts` 明确写了注释说明它是**运行时刻意放宽**的版本，只保证 `id` 字段：

```1:22:src/features/director/schemas/director-shot-plan.ts
/**
 * 运行时 SHOT_SPEC / FABRICATE 使用的 shot plan 合同。
 *
 * 与 `shotPlanSchema`（严格校验）不同，本 schema 只校验最小必需字段，
 * 允许 LLM 按自然语言提示输出更丰富的字段；FABRICATE 会把完整 shot 对象
 * 作为上下文传给 HTML 生成器。
 */
export const directorShotSchema = z
  .object({ id: z.string().regex(/^S\d{3}$/) })
  .passthrough()

export const directorShotPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().optional(),
    shots: z.array(directorShotSchema).min(1),
  })
  .passthrough()
```

实测运行时写入路径印证了这一点——`SHOT_SPEC` 阶段落盘前只用宽松 schema 校验：

```73:76:src/features/director/stage-result.ts
  if (context.stage === 'SHOT_SPEC') {
    const parsed = directorShotPlanSchema.parse(parseJsonObject(rawContent))
    return { content: JSON.stringify(parsed) }
  }
```

`FABRICATE` 阶段消费单个分镜时用的也是宽松的 `directorShotSchema`，不是严格的 `shotSchema`：

```1:11:src/features/director/prompts/fabricate.ts
import { directorShotSchema } from '../schemas/director-shot-plan'

export const fabricatePromptInputSchema = z
  .object({
    shot: directorShotSchema,
    audioAllocation: audioAllocationSchema,
    styleBible: z.string().min(1),
  })
  .strict()
```

**结论**：`schemas/shot-plan.ts` 的严格 schema 在当前运行时链路里从未被真正用来校验落盘数据，它更像是移植自 video-director 语料的"设计态契约"（`枚举 compositionModeSchema` 仍在 `shot-spec.ts` 提示词文案里被引用）。如果 `resolveDirectorInput` 的 ASSEMBLE 分支直接把从各个 `shot-script` 节点聚合出来的宽松 `DirectorShot[]` 塞进要求严格 `shotPlanSchema` 的 `assemblePromptInputSchema.shotPlan`，只要有任何一镜缺失 `purpose`/`hero`/`keyframes` 等必填子字段（模型完全可能遗漏，因为落盘时只按宽松 schema 校验过），`stage-prompt.ts` 里的 `.parse()` 就会抛错——**这是比"字段没组装"更隐蔽的下一个坑**，必须在本次修复里一并解决（方案见 §2 决策点 B）。

### 发现 5：`features/render` 已经有一套完全独立、已跑通、纯确定性（非 LLM）的"汇总分镜渲染状态 + 拼接导出"实现，其查询逻辑正是 ASSEMBLE(score)/FINALIZE(export) 需要的"全部通道渲染完成状态"

`RenderRepository.getExportPlan()` 已经实现了"查所有 `shot-codegen` 节点 + 它们最新的 `render-mp4` artifact + 未完成清单"：

```91:148:src/features/render/repository.ts
  getExportPlan(projectId: string): RenderExportPlan {
    ...
    const nodes = this.db
      .select({ id: canvasNodes.id, type: canvasNodes.type, status: canvasNodes.status, laneKey: canvasNodes.laneKey })
      .from(canvasNodes)
      .where(and(eq(canvasNodes.projectId, projectId), isNotNull(canvasNodes.laneKey)))
      .all()
    const renderArtifacts = this.db
      .select({ nodeId: artifacts.nodeId, path: artifacts.path })
      .from(artifacts)
      .where(and(eq(artifacts.projectId, projectId), eq(artifacts.kind, 'render-mp4')))
      .orderBy(desc(artifacts.createdAt), desc(artifacts.id))
      .all()
    ...
    const shots = nodes
      .filter((node): node is typeof node & { laneKey: string } => node.type === 'shot-codegen' && node.laneKey !== null)
      .flatMap((node) => {
        const outputKey = latestByNode.get(node.id)
        if (!outputKey) { incomplete.add(node.id); return [] }
        return [{ nodeId: node.id, laneKey: node.laneKey, outputKey }]
      })
      .sort((left, right) => left.laneKey.localeCompare(right.laneKey))
    return { incompleteNodeIds: [...incomplete].sort(), shots, musicKey: this.latestMusicKey(projectId) }
  }

  registerFinalArtifact(input: FinalArtifactInput): string {
    ...
    this.db.insert(artifacts).values({ id, projectId: input.projectId, kind: 'final-mp4', path: input.outputKey, contentHash: input.contentHash }).run()
    ...
  }
```

`export-service.ts` 的 `exportProject()` 用这个 plan 做真正的 ffmpeg 拼接并写出 `kind: 'final-mp4'` 产物；`getExportReadiness()` 是画布 UI 查询"能不能导出"的只读接口。**这意味着 `score`(ASSEMBLE)/`export`(FINALIZE) 两个 Director LLM 节点要做的事，跟 `features/render` 已经用纯 TypeScript 确定性代码做完的事，在数据来源上高度重叠**：

- `score` 的 ASSEMBLE 需要"全部通道渲染产物"→ 就是 `getExportPlan().shots`（按 `laneKey` 排好序的 `render-mp4` 路径列表）+ `incompleteNodeIds`（判断能不能开始配乐编排）。
- `export` 的 FINALIZE 需要"已合成的草稿成片指针"→ 大概率就是 `RenderRepository.registerFinalArtifact` 写入的 `kind: 'final-mp4'` 产物（`exportProject()` 跑完之后才存在）。

**这引出一个需要拍板的架构问题（决策点 C，见 §2）**：Director 的 `score`/`export` LLM 节点和 `features/render` 的确定性导出管线之间，现在完全没有编排关系（没有代码在 `exportProject()` 跑完之后触发 `enqueueDirectorStage(..., 'FINALIZE')`，反之亦然）。补 `resolveDirectorInput` 时必须先确定这两条链路的先后关系，否则会出现"`export` 节点的 FINALIZE 阶段查不到任何 `final-mp4` 产物"的新失败模式（只是把"输入类型报错"换成了"输入内容找不到"，本质问题没解决）。

### 发现 6：`prepareStageResult`（模型输出归一化）目前也只覆盖 `INGEST/FABRICATE/DIRECT/SHOT_SPEC`，`ASSEMBLE/FINALIZE` 落到"原样返回文本"分支——这是与本 issue 强相关但概念上独立的下一个缺口

```1:79:src/features/director/stage-result.ts
export function prepareStageResult(context: DirectorStageContext, rawContent: string): PreparedStageResult {
  if (context.stage === 'INGEST') { ... }
  if (context.stage === 'FABRICATE') { ... }
  if (context.stage === 'DIRECT') { ... }
  if (context.stage === 'SHOT_SPEC') { ... }
  return { content: rawContent }
}
```

也就是说，即使本 issue 把 `resolveDirectorInput` 的 ASSEMBLE/FINALIZE 输入补齐、`buildStagePrompt` 不再报错，模型跑完之后的回复也只是原样存成一份 `.txt` 产物（`stage-runner.ts` 的 `outputArtifact()` 对非 SHOT_SPEC/FABRICATE 一律用 `validation: 'non-empty'` + `.txt` 扩展名），不会被解析成任何结构化字段（比如 `export` 的"通过/阻塞结论"、"需要重做的 shot IDs"目前完全没有归一化落点）。

**已拍板（见 §3 决策记录 Q4）：本 issue 不做输出归一化**。`prepareStageResult` 的 ASSEMBLE/FINALIZE 分支保持现状（原样存文本），本 issue 的边界严格限定为"输入契约补全"。该缺口已登记为独立的 GitHub Issue（延后处理），见 §3 决策记录 Q4 的链接。

### 发现 7：`runtime-repository.test.ts` 现有测试模式

```1:149:src/features/director/runtime-repository.test.ts
```

测试用真实的内存态 SQLite（`createDb(path.join(directory, 'test.db'))`，不是 mock DB）+ mock `StorageAdapter`（`vi.fn()` 桩）。当前只覆盖：

1. `loadStageContext` 对 `INGEST` 单节点场景（`directorInput` 已在 `data` 里预置，走的是 INGEST 分支的 `?? ` 兜底，不涉及跨节点查询）+ 阶段不匹配/状态不对的拒绝路径。
2. `assertEnqueueable` 的归属/阶段/状态校验。
3. `registerArtifactPointer` 的路径安全校验 + `recordStageError` 的结构化写入。
4. `recordStageOutput` 的 `renderSpec` 透传。

**没有任何测试覆盖 `DIRECT`/`SHOT_SPEC`/`FABRICATE` 三个已实现分支的跨节点聚合逻辑**（`loadIngestArtifact`/`loadDirectArtifact`/`loadShotSpecArtifact`），这是既有测试的覆盖缺口，不是本 issue 引入的。**已拍板（见 §3 决策记录 Q4）：本 issue 不顺带补齐**，登记为独立的 GitHub Issue（延后处理，与「输出归一化补全」合并登记在同一个 Issue 里）。

### 发现 8：`shotAllocationSchema`（`audioAllocation.shots[]` 的元素类型）目前没有导出对应的 TS 类型

```150:177:src/features/director/schemas/ingest.ts
export const audioAllocationSchema = z.object({ ...  shots: z.array(shotAllocationSchema).min(1), ... }).strict()
...
export type AudioAllocation = z.infer<typeof audioAllocationSchema>
```

只导出了 `AudioAllocation`（整体），没有导出 `ShotAllocation`（单条 `shots[i]`）。本次给 `shot-sfx`/`shot-subtitle`/`shot-qa` 三个分镜通道节点组装"该分镜的时长/起止帧"时会需要这个类型，建议顺手补一个 `export type ShotAllocation = z.infer<typeof shotAllocationSchema>`（`shotAllocationSchema` 目前是模块内私有 const，需要一并导出或至少导出类型）。

---

## 2. 设计方案

### 2.1 决策点 A：`resolveDirectorInput` 必须按 `(stage, nodeType)` 二元组分支，不能只按 `stage`

**推荐**：给 `resolveDirectorInput` 增加 `row.nodeType` 判断（该字段已经在 `loadStageContext` 的查询里被 select 出来，只是没被使用——见 `runtime-repository.ts:96`）。ASSEMBLE 内部按 `nodeType === 'score' | 'shot-sfx' | 'shot-subtitle'` 三分支；FINALIZE 内部按 `nodeType === 'export' | 'shot-qa'` 两分支。

### 2.2 决策点 B：`assemble.ts`/`finalize.ts` 的单一 prompt builder 不够用，需要拆成"节点角色感知"的多个 builder + schema

给出两个选项，**推荐 Option A**：

**Option A（推荐）**：`assemble.ts`/`finalize.ts` 两个文件不变（沿用 D0.2 任务卡"六阶段各一个文件"的既有约定，见 `docs/specs/2026-07-23-harness-task-breakdown.md:579`），但每个文件导出**按节点角色区分的多个** builder + schema：

- `prompts/assemble.ts` 导出：`scoreAssemblePromptInputSchema`/`buildScoreAssemblePrompt`（原 `assemblePromptInputSchema`/`buildAssemblePrompt` 改名收窄语义）+ 新增 `shotSfxPromptInputSchema`/`buildShotSfxPrompt` + `shotSubtitlePromptInputSchema`/`buildShotSubtitlePrompt`。
- `prompts/finalize.ts` 导出：`exportFinalizePromptInputSchema`/`buildExportFinalizePrompt`（原样改名）+ 新增 `shotQaPromptInputSchema`/`buildShotQaPrompt`。
- `stage-prompt.ts` 的 `StagePromptContext` 增加 `nodeType: string | null` 字段（`buildStagePrompt` 调用方 `stage-runner.ts` 已经能拿到 `context` 里的节点信息，只需要透传），`ASSEMBLE`/`FINALIZE` 分支内部再按 `nodeType` 二次分发到对应 builder。

理由：
1. 与已经确认的架构现实一致——ASSEMBLE/FINALIZE 各自对应两种输入形状完全不同的节点，伪装成同一个 schema 只会把复杂度压到 `resolveDirectorInput` 里做不安全的字段拼凑。
2. 不新增文件数量，符合既有"一 stage 一文件"的项目约定。
3. 复用 `stage-prompt.ts` 现有的"按 schema `.parse()` 收窄类型"防线，保持"类型化归一"这条 AGENTS.md 强调的红线（§3.5.1）。

**Option B（不推荐）**：保留单一 schema，`resolveDirectorInput` 想办法把 `shot-sfx`/`shot-subtitle`/`shot-qa` 的单镜数据"升格"成全片形状（比如塞进只含一个元素的 `shotPlan.shots`、`renderedArtifactKeys` 只放这一镜的产物）。
缺点：prompt 文案本身是"按 shot plan 顺序拼接全部 rendered artifact""检查真实 Main 成片"这种全片视角措辞，套在单镜场景语义完全不对，模型会被误导；且 `qaFindings`/`draftArtifactKey` 单数语义无法表达"这是第几镜的验收"。

**已拍板：采用 Option A**（见 §3 决策记录 Q1）。后续章节按 Option A 给出具体设计。

### 2.3 决策点 C：Director 的 `score`/`export` LLM 节点与 `features/render` 确定性导出管线的先后关系

**推荐**：把 Director 的 `score`(ASSEMBLE)/`export`(FINALIZE) 节点定位为"**只读编排评述层**"，跑在 `features/render` 的确定性产物**之后**，职责是让 LLM 生成人类可读的合成清单/QA 报告文本，而不是自己产出二进制媒体（LLM 本来也做不到）：

- `score` 的 ASSEMBLE 输入里的 `renderedArtifactKeys` = `features/render` 已经渲染完成的各分镜 `render-mp4` 路径（只读引用，不重新渲染，与 prompt 文案"不重新逐帧渲染镜头"完全一致）。
- `export` 的 FINALIZE 输入里的 `draftArtifactKey` = `features/render` 的 `exportProject()` 已经写入的 `kind: 'final-mp4'` 产物路径（只读引用，QA 的是已经拼好的成片，不是自己去拼）。

**已拍板（见 §3 决策记录 Q3）**：`score`/`export` 两个 Director 节点在"上游产物不存在"时**必须**明确失败并提示"请先完成分镜渲染/先完成合成导出"，不允许静默用空数据跑模型、也不允许放任其跑到一半才崩溃。`export` 节点的 `assertEnqueueable`/`loadStageContext` 层面需要新增专门的前置校验（区别于通用 `Error`，给出用户可读的具体提示），而不是等到 `resolveDirectorInput` 内部才抛通用错误。UI 层面的按钮置灰引导不在本 issue 范围，只保证后端行为正确、报错清晰（复用现有 `loadArtifactJson` 风格：`找不到 xxx 产物：yyy`）。

**关于代码复用方式的重要子决策**：`getExportPlan()`（`render/repository.ts`）已经实现了"查全部 `shot-codegen` 渲染完成状态"，看起来可以直接复用，但 `features/render/queue-handler.ts` 已经反向依赖了 `features/director`（`import { fabricateShot } from '@/features/director/fabricate'`）。**如果 `DirectorRuntimeRepository` 再反过来 import `features/render/repository.ts`，会形成 `director ↔ render` 的循环模块依赖**，这在 ESM/Turbopack 下是脆弱的（即使暂时能跑，也会在后续任一侧改动时出现难以定位的初始化顺序问题）。

**已拍板（见 §3 决策记录 Q2）：不复用 `RenderRepository`，在 `DirectorRuntimeRepository` 内新写一个结构更简单的只读查询**（只需要"按 `kind='render-mp4'`/`kind='final-mp4'` 查 `artifacts` 表"，不需要 `getExportPlan()` 的完整增量计算逻辑），接受少量逻辑重复以换取模块边界干净，避免 `director ↔ render` 循环依赖。

### 2.4 具体 `directorInput` 结构设计（基于决策 A/B/C 的推荐方案）

#### ASSEMBLE · `score`（全局单例）

```ts
// prompts/assemble.ts
export interface ScoreAssemblePromptInput {
  /** director-direct 产物的风格圣经，用于配乐基调/情绪选型对齐画面风格 */
  styleBible: string
  /** 全部分镜的 canonical shot spec（宽松 passthrough，与 FABRICATE 消费的类型一致） */
  shotPlan: DirectorShotPlan
  /** 全局音频时间轴权威源：每镜起止帧、fps、总帧数 */
  audioAllocation: AudioAllocation
  /** 按 laneKey（shotId）升序排列的各分镜 render-mp4 storageKey；全部分镜渲染完成才可执行 */
  renderedArtifactKeys: string[]
}
```

为什么是这些字段：
- `styleBible` 而非 `masterPlan`——配乐选型关心的是情绪/色彩/世界观基调，`masterPlan` 是叙事结构，跟本阶段任务（音乐选型+合成清单）关联度低，且现有 prompt 文案完全没提叙事结构。
- `shotPlan` 用宽松 `DirectorShotPlan` 而不是严格 `ShotPlan`（呼应发现 4），避免因为某一镜缺失强类型必填字段导致整个 ASSEMBLE 崩溃；模型本身只需要用得到的字段（比如 `sfxCues`/`audioBinding`），不需要整份严格校验。
- `renderedArtifactKeys` 就是 `render-mp4`（发现 5/决策 C），不是 `director-fabricate`（HTML 源码，还没经过逐帧渲染）——prompt 原文"已验证的镜头产物，不重新逐帧渲染镜头"的措辞已经排除了 HTML。

#### ASSEMBLE · `shot-sfx`（分镜通道，逐镜执行）

```ts
// prompts/assemble.ts（新增）
export interface ShotSfxPromptInput {
  /** 该分镜的 canonical shot spec，重点用到 sfxCues/mustShow/mustAvoid */
  shot: DirectorShot
  /** audioAllocation.shots 中匹配该 shotId 的条目：起止帧/时长，音效落点必须对齐这个时间轴 */
  shotAllocation: ShotAllocation
  /** 该分镜的 render-mp4（若尚未渲染完成则回退到 director-fabricate HTML，用于至少能看到画面节奏） */
  renderedArtifactKey: string
  /** 风格圣经，音效音色/密度对齐整体调性 */
  styleBible: string
}
```

#### ASSEMBLE · `shot-subtitle`（分镜通道，逐镜执行）

```ts
// prompts/assemble.ts（新增）
export interface ShotSubtitlePromptInput {
  /** 该分镜的 canonical shot spec，重点用到 onScreenText/audioBinding */
  shot: DirectorShot
  /** 该分镜绑定的原始文稿 unit（字幕文本必须可追溯到原文，不能让模型杜撰） */
  scriptUnit: ScriptUnit
  /** 起止帧/时长，字幕时间轴必须对齐 */
  shotAllocation: ShotAllocation
}
```

`scriptUnit` 定位方式：`shot.audioBinding.unitId` 关联到 `loadIngestArtifact().scriptUnits` 里对应的条目——因此 `shot-subtitle` 分支仍然需要调用一次 `loadIngestArtifact`。

#### FINALIZE · `export`（全局单例）

```ts
// prompts/finalize.ts
export interface ExportFinalizePromptInput {
  /** 全部分镜的 canonical shot spec（宽松），QA 时核对镜头边界/mustShow 是否兑现 */
  shotPlan: DirectorShotPlan
  /** features/render 的 exportProject() 已写入的 kind:'final-mp4' 产物路径 */
  draftArtifactKey: string
  /** 汇总全部 shot-qa 通道节点已产出的验收文本（缺失的通道跳过，不阻塞） */
  qaFindings: string[]
}
```

#### FINALIZE · `shot-qa`（分镜通道，逐镜执行）

```ts
// prompts/finalize.ts（新增）
export interface ShotQaPromptInput {
  shot: DirectorShot
  /** 该分镜的 render-mp4，用于验收画面/时长是否达标 */
  renderedArtifactKey: string
  shotAllocation: ShotAllocation
}
```

### 2.5 `runtime-repository.ts` 新增私有方法（命名遵循既有 `loadXxxArtifact` 风格）

| 方法名 | 作用 | 复用/新增 |
|---|---|---|
| `loadAllShotSpecs(projectId)` → `DirectorShot[]`（按 laneKey 升序） | 遍历全部 `shot-script` 节点，逐个读取 `director-shot-spec`，取出各自 `shots.find(s => s.id === laneKey)`，拼成全片分镜数组 | 新增，内部复用 `loadArtifactJson` |
| `findNodeIds(projectId, type)` → `{ id: string; laneKey: string }[]` | `findNodeId` 的复数版本，按 `type` 找出全部匹配节点（不带 `laneKey` 过滤） | 新增 |
| `loadRenderedArtifactKey(projectId, laneKey)` → `string` | 按 `laneKey` 定位 `shot-codegen` 节点，查其最新 `kind:'render-mp4'` artifact 路径；找不到则抛错 | 新增，结构类比 `render/repository.ts` 的 `requireFabricateArtifact`，但查的 `kind` 不同 |
| `loadAllRenderedArtifactKeys(projectId)` → `{ laneKey: string; storageKey: string }[]`（按 laneKey 升序，任一分镜缺失即抛错） | `score` 节点用；不复用 `RenderRepository.getExportPlan()`（决策点 C，避免循环依赖），自行按 `kind:'render-mp4'` 查询 | 新增 |
| `loadFinalExportArtifact(projectId)` → `string` | 查项目最新 `kind:'final-mp4'` artifact 路径；找不到则抛错（提示"请先完成合成导出"） | 新增 |
| `loadShotQaFindings(projectId)` → `string[]` | 遍历全部 `shot-qa` 节点，读取其 `director-finalize` 产物**文本**内容（非 JSON），跳过尚未产出的节点（不抛错，因为 QA findings 是佐证性输入，不是硬前置条件） | 新增，需要一个纯文本读取变体（见下） |
| `loadArtifactText(projectId, nodeId, kind)` → `string` | `loadArtifactJson` 的纯文本变体（ASSEMBLE/FINALIZE 产物落盘时是 `.txt` 原始文本，不是 JSON，见 `stage-runner.ts` 的 `outputArtifact()`） | 新增，与 `loadArtifactJson` 共享"查 artifacts 表最新记录 + storage.get"逻辑，可以内部共用一个私有的 `loadArtifactRaw` 再分叉 `JSON.parse`/直接返回字符串 |

不需要新增 artifact **kind** 常量：ASSEMBLE/FINALIZE 复用已存在的 `render-mp4`、`final-mp4`、`director-ingest`、`director-shot-spec`、`director-finalize` 这些 kind 字符串；只是新增了"按 `type` 批量查节点"和"按 `kind` 查 render/final 产物"这两类查询方法，不需要新的 DB 列或新的 kind 枚举值。

### 2.6 是否需要新增 Zod schema 文件

**结论：不需要新建 schema 文件**，理由：

1. 所有涉及的领域类型（`DirectorShotPlan`/`DirectorShot`、`AudioAllocation`、`ScriptUnit`）都已经存在于 `schemas/director-shot-plan.ts`/`schemas/ingest.ts`，本次只是新增消费点，不新增校验规则。
2. 新增的 `directorInput` 输入 schema（`ScoreAssemblePromptInput` 等）按 Option A 的设计，属于各自 prompt builder 文件自己的输入契约，应该像现有四个 stage 一样**内联在 `prompts/assemble.ts`/`prompts/finalize.ts` 里**（这是既有约定：`shot-spec.ts`/`fabricate.ts`/`direct.ts` 都是"builder + 它自己的输入 schema 同文件"），不需要独立 `schemas/assemble.ts`/`schemas/finalize.ts`。
3. 唯一建议的小改动：`schemas/ingest.ts` 补一个 `export type ShotAllocation = z.infer<typeof shotAllocationSchema>`（发现 8），因为 `shot-sfx`/`shot-subtitle`/`shot-qa` 三个新 interface 都需要引用"单条分镜的音频分配"这个类型，目前没有导出。

### 2.7 测试计划

在 `runtime-repository.test.ts` 现有模式（真实内存 SQLite + mock `StorageAdapter`）基础上新增：

**必须覆盖（本 issue 范围内）**：
1. `score` 节点：搭建 1 个 `shot-split`（含 `director-direct` 产物）+ 2 个分镜（各自 `shot-script` 含 `director-shot-spec`、`shot-codegen` 含 `render-mp4`）夹具，断言 `resolveDirectorInput` 对 `score`/ASSEMBLE 返回的 `shotPlan`/`renderedArtifactKeys`（按 laneKey 排序）/`audioAllocation`/`styleBible` 字段正确。
2. `score` 节点：其中一个分镜缺失 `render-mp4` 产物时，`resolveDirectorInput` 必须抛出清晰错误（而不是返回不完整数组）。
3. `shot-sfx`/`shot-subtitle` 节点：单个分镜场景下返回的 `shot`/`shotAllocation`/`renderedArtifactKey` 字段正确；`shot-subtitle` 额外断言 `scriptUnit` 按 `audioBinding.unitId` 正确关联。
4. `export` 节点：`final-mp4` 产物存在时返回 `draftArtifactKey` 正确；不存在时抛出"请先完成合成导出"类错误。
5. `export` 节点：`qaFindings` 在部分/全部 `shot-qa` 节点尚未产出时不抛错，只汇总已存在的条目。
6. `shot-qa` 节点：单个分镜场景下返回 `shot`/`renderedArtifactKey`/`shotAllocation` 正确。
7. `stage-prompt.test.ts`（若不存在需新建，或扩展现有 `prompts.test.ts`）：验证 `buildStagePrompt` 对 `ASSEMBLE`/`FINALIZE` 能按 `nodeType` 正确路由到对应 builder，且非法/未知 `nodeType` 有明确报错。

**建议顺带覆盖（存量缺口，见发现 7，需用户确认是否纳入本卡）**：
8. `DIRECT`/`SHOT_SPEC`/`FABRICATE` 三个已实现但目前完全没有测试的跨节点聚合分支。

### 2.8 允许改动范围 / 禁止改动 / 完成条件（可直接转成任务卡）

**目标**：补全 `resolveDirectorInput` 对 `ASSEMBLE`（`score`/`shot-sfx`/`shot-subtitle`）与 `FINALIZE`（`export`/`shot-qa`）五种节点类型的输入组装，消除这两个 stage 100% 必现的 `Invalid input: expected object, received undefined` 崩溃，使六阶段在没有 mock 的情况下全部可真实跑通。

**前置任务**：无（`INGEST/DIRECT/SHOT_SPEC/FABRICATE` 的输入组装已在 `fix/director-input`(`0a24e07`) 完成）。

**允许改动范围**：
- `src/features/director/runtime-repository.ts`（新增私有方法 + `resolveDirectorInput` 的 ASSEMBLE/FINALIZE 分支）
- `src/features/director/runtime-repository.test.ts`
- `src/features/director/prompts/assemble.ts`（拆分为 `score`/`shot-sfx`/`shot-subtitle` 三个 builder+schema）
- `src/features/director/prompts/finalize.ts`（拆分为 `export`/`shot-qa` 两个 builder+schema）
- `src/features/director/prompts/prompts.test.ts`
- `src/features/director/stage-prompt.ts`（`StagePromptContext` 增加 `nodeType`；ASSEMBLE/FINALIZE 分支按 nodeType 二次路由）
- `src/features/director/stage-prompt.test.ts`（若不存在则新建）
- `src/features/director/stage-runner.ts`（仅限：把 `context` 里的 `nodeType` 透传给 `buildStagePrompt`，不改其它编排逻辑）
- `src/features/director/schemas/ingest.ts`（仅限：补充导出 `ShotAllocation` 类型，不改任何校验规则）
- `docs/specs/2026-07-23-ai-development-harness.md`（仅限 §3.5.2 表格：把 ASSEMBLE/FINALIZE 两行状态从"❌ 缺口"更新为"✅ 已实现"，并按本 issue 最终方案修正字段描述）
- `docs/specs/2026-07-23-harness-task-breakdown.md`（仅限第 325/706 行附近的状态批注）

**禁止改动**：
- `src/features/director/stage-result.ts`（模型输出归一化属于独立缺口，见发现 6，不在本卡范围）
- `src/features/render/**`（只读引用其产物 `kind`，不改其实现；尤其不得让 `runtime-repository.ts` import `render/repository.ts`，避免循环依赖，见决策点 C）
- `src/features/canvas/fan-out.ts`、`src/features/canvas/actions.ts`（节点拓扑/`laneKey` 语义不变）
- `src/lib/db/schema.ts`（不新增列，不新增 artifact kind 枚举约束）
- `src/features/director/schemas/shot-plan.ts`（严格 schema 保留原状，本卡不消费它，是否废弃/合并留待另行讨论）

**完成条件**：
1. `pnpm tsc --noEmit` 退出 0。
2. `pnpm lint` 退出 0。
3. `resolveDirectorInput` 对 `score`/`shot-sfx`/`shot-subtitle`/`export`/`shot-qa` 五种节点类型均有显式分支，且没有任何 stage/nodeType 组合再落到 `return row.data.directorInput` 兜底（可通过 code review 或加一条"未知 nodeType 抛错"的防御性分支来机器化校验，防止未来再有遗漏静默通过）。
4. §2.7 列出的"必须覆盖"7 类测试全部通过。
5. 手动/集成验证：一个真实跑完 `INGEST→DIRECT→SHOT_SPEC→FABRICATE`（沿用现有 e2e 走查，见 `docs/updates/2026-07-24-u1.8-demo-e2e-walkthrough.md`）的项目，其 `score`/`shot-sfx`/`shot-subtitle`/`shot-qa` 节点点击后不再抛出 `Invalid input` 类错误（`export` 节点如果 `features/render` 导出尚未跑过，允许合理失败但报错信息必须是"请先完成合成导出"这类可读提示，不能是 schema 校验的原始堆栈）。
6. `docs/specs/2026-07-23-ai-development-harness.md` §3.5.2 表格与代码状态同步更新。

---

## 3. 决策记录（2026-07-24 已与负责人确认，实施时按此执行）

- **Q1（对应决策点 A/B）**：采用 **Option A**——拆分 `assemble.ts`/`finalize.ts` 为按节点角色区分的多个 builder+schema，并给 `stage-prompt.ts` 增加 `nodeType` 路由。理由：把"整部片子专用"和"单个镜头专用"两种资料包分开准备，虽然多花一点功夫，但更清晰、AI 不会看错内容。
- **Q2（对应决策点 C）**：`score`/`export` 的渲染完成状态查询，**在 `DirectorRuntimeRepository` 内重复实现一份简化查询**，不复用 `RenderRepository`。理由：代码稍微重复一点，但换来两个模块互不牵连、以后各自改动都更安全，避免 `director ↔ render` 循环依赖。
- **Q3（对应决策点 C）**：`export` 节点的 FINALIZE **必须**等 `features/render` 的 `exportProject()` 先跑完（`final-mp4` 已存在）才允许执行；`assertEnqueueable`/`loadStageContext` 层面新增专门的前置校验，给出"请先完成合成导出"这类可读提示，不能让它跑到一半才因为找不到东西而崩溃。
- **Q4（对应发现 6 + 发现 7）**：`prepareStageResult` 的 ASSEMBLE/FINALIZE 输出结构化归一化、以及 `DIRECT`/`SHOT_SPEC`/`FABRICATE` 的存量测试缺口，**本 issue 均不做**，聚焦"先把报错修好、六阶段能跑通"这一个目标，避免战线拉长。两项已合并登记为 [GitHub Issue #7](https://github.com/AIMFllyYS/code-video-canvas/issues/7)。
