# issue-11 — 工作流一键启动与 DAG 自动推进（advancePipeline + autopilot）

| 字段 | 值 |
|---|---|
| 优先级 | **P1**（核心体验缺口：用户必须逐节点手动点击 19 次才能跑完一个 3 分镜项目；DAG 边是无人消费的死数据） |
| Wave | 6（建议 issue-09 先落地——本 issue 的链式执行会放大 split-brain 流式问题的暴露面） |
| 依赖 | 软依赖 issue-09（非阻塞：文件零重叠，可并行开发，但联调验收建议在 issue-09 合并后进行） |
| 关联证据 | 顶栏"全部渲染"按钮 `disabled` 死按钮；Inspector 按钮文案"全部渲染"实际只执行单节点 |
| 状态 | **实现完成，待本 Goal 末端真实 API/浏览器统一验收**（2026-07-24） |

## 现状核查

### 1. DAG 边写入了但零消费（死数据）

[`src/features/canvas/fan-out.ts`](../../src/features/canvas/fan-out.ts) L156-L179 `insertLaneEdges` 写入完整依赖边：

```
shot-split → shot-script → shot-codegen → shot-sfx → shot-subtitle → shot-qa → score
```

外加 `createProject` 事务写入的全局链 `script-import → shot-split`、`score → export`。但全仓库**没有任何代码读取 `canvas_edges` 用于执行编排**——唯一消费方是画布渲染画线（`getCanvasGraph` → React Flow）。

### 2. 执行触发完全靠手点，且一次只能一个节点

- [`canvas-action-api.ts`](../../src/app/(app)/canvas/canvas-action-api.ts) `triggerNodeAction()`：`shot-codegen` → POST `/api/render`；其余 → POST `/api/director/stage`。每次一个节点。
- [`stage-runner.ts`](../../src/features/director/stage-runner.ts) 成功路径（L120-L131）与 [`render/queue-handler.ts`](../../src/features/render/queue-handler.ts) 成功路径（L59-L60）都只 `transitionNodeStatus(nodeId, 'success')` 后结束，**没有任何检查出边、自动 enqueue 下游的逻辑**。
- 队列 `InProcessQueue` 只有并发消费能力，无 DAG 感知。

### 3. 两处 UI 真实性违规

- [`canvas-view.tsx`](../../src/app/(app)/canvas/canvas-view.tsx) L93：顶栏 `<Button ... disabled>全部渲染</Button>` —— 永久禁用的死按钮，看起来像功能入口；
- [`canvas-inspector.tsx`](../../src/app/(app)/canvas/canvas-inspector.tsx) L256-L258：按钮文案 `'全部渲染'`（非 shot-codegen 节点时），实际行为是"执行当前选中节点的阶段"——文案与行为不符，正是用户误以为"工作流会整体推进"的来源之一。

### 4. 前端刷新机制可以直接复用

[`canvas-view.tsx`](../../src/app/(app)/canvas/canvas-view.tsx) L70-L74：存在 pending/running 节点时每 1.5s `router.refresh()`。自动推进落地后无需改轮询——新入队的下游节点自然带 pending 状态进入下一轮刷新。

## 方案设计

### A. 后端：`advancePipeline(projectId, completedNodeId)` 链式推进

新建 `src/features/director/advance.ts`（或 `features/canvas/advance.ts`，以不引入 `director ↔ render` 循环依赖为准绳；`render/queue-handler.ts` 已 import `features/director/fabricate`，故放 `director` 域安全）：

```typescript
/** 节点成功后调用：检查其出边下游，凡「自身 idle 且全部上游 success」者自动入队。 */
export function advancePipeline(projectId: string, completedNodeId: string): void
```

规则（全部由服务端可信数据判定，不信任客户端）：

1. 仅当项目 autopilot 开启时生效（见 B）；
2. 查 `canvas_edges` 出边 → 候选下游节点；
3. 对每个候选：`status === 'idle'` 且其**全部**入边上游 `status === 'success'` 才入队（多入度节点如 `score` 天然等到所有 shot-qa 完成）；
4. 入队分流与 `triggerNodeAction` 同构：`shot-codegen` → `enqueueRenderShot`，其余有 stage 的节点 → `enqueueDirectorStage`；无 stage 的节点跳过；
5. 单节点入队失败不阻断其余下游（逐个 try/catch，错误落 `recordStageError` 同款结构）；
6. **幂等**：assertEnqueueable/assertRenderEnqueueable 已拒绝非 idle/failed/stale 状态，天然防重复入队。

挂接点（两处，均在状态翻成 success 之后同步调用）：

- `director/stage-runner.ts` 成功路径 `transitionNodeStatus(nodeId, 'success')` 之后；
- `render/queue-handler.ts` 成功路径 `transitionNodeStatus(payload.nodeId, 'success')` 之后。

以依赖注入方式传入（沿用两文件现有的 dependencies 模式），单测可 mock。

> 特别说明 INGEST 的特殊性：INGEST 成功时才 fan-out 物化分镜通道（事务内建边），`advancePipeline` 在 success 之后调用即可看到新边，无时序问题。

### B. autopilot 开关（项目级持久化）

- `projects.exportSettings` 已证明"projects 表 JSON 列"模式可行（issue-06），但 autopilot 语义独立，建议 `projects` 表新增 `autopilot integer (0/1) DEFAULT 0` 列 + Drizzle 迁移（本 issue 的直接目标，按 AGENTS.md Ask-first 条款视为已授权）；
- 一键启动 API：`POST /api/director/pipeline` `{ projectId }` → 开启 autopilot + 对 `script-import`（INGEST）节点 `enqueueDirectorStage`；若 INGEST 已 success 则从当前"可推进前沿"续跑（对全部满足规则的节点调一次 advance 扫描）；
- 停止：`DELETE /api/director/pipeline`（或同路由 `{ enabled: false }`）→ 关闭 autopilot（已在队列中的作业自然跑完，不强杀）；
- 失败即停：某节点 failed 时其下游因规则 3 不满足而不入队，链路在失败分支自然暂停；用户重试成功后由挂接点继续推进。

### C. 前端接线

- 顶栏死按钮改为真实"一键启动"：调用 `POST /api/director/pipeline`，运行中显示可停止态（依据服务端返回的 autopilot 状态 + 是否存在 pending/running 节点，均为真实数据）；
- Inspector 按钮文案修正：非 shot-codegen 节点从"全部渲染"改为"执行此阶段"（shot-codegen 保持"重渲此镜"）；
- `QueueStatusBar` 已显示 `completed/total` 真实计数，无需改。

## 允许改动范围 / 禁止改动 / 完成条件

**允许改动范围**：

- `src/features/director/advance.ts`（新建）+ 单测
- `src/features/director/stage-runner.ts`（仅成功路径追加 advance 挂接，依赖注入）
- `src/features/render/queue-handler.ts`（仅成功路径追加 advance 挂接）
- `src/lib/db/schema.ts` + 新迁移（`projects.autopilot` 列）
- `src/app/api/director/pipeline/route.ts`（新建）
- `src/app/(app)/canvas/canvas-view.tsx`（顶栏按钮）、`src/app/(app)/canvas/canvas-inspector.tsx`（按钮文案）
- `src/features/canvas/queries.ts`/`actions.ts`（如需暴露 autopilot 读写）

**禁止改动**：

- `canvas_edges` 结构与 fan-out 写边逻辑（边定义是对的，只补消费方）
- `InProcessQueue` 内部（不给队列加 DAG 感知，编排责任在 director 域）
- 不引入"客户端计算下一个节点"的逻辑——推进决策 100% 在服务端
- 失败节点不自动重试（重试策略后置，避免无限循环烧 Key）

**完成条件**：

- [ ] 新建项目 → 填稿 → 点一次"一键启动" → INGEST → fan-out → 各通道 SHOT_SPEC → FABRICATE(render) → ASSEMBLE → FINALIZE 全自动推进（真实模型/浏览器验收安排在本 Goal 末端统一执行）
- [x] 中途某节点 failed：其下游不入队，其他分镜通道继续；重试成功后链路续跑
- [x] autopilot 关闭时行为与现状完全一致（手动单点执行不触发链式推进）
- [x] advance 规则单测：多入度等待 / 幂等防重 / 失败分支停止 / autopilot 开关
- [x] Inspector 按钮文案与真实行为一致；顶栏按钮为真实功能非死按钮
- [x] `pnpm lint && pnpm tsc --noEmit && pnpm test && pnpm build` 全绿

## 施工记录（2026-07-24）

- 新增 `projects.autopilot` 与迁移 `0003_wild_black_tarantula.sql`；默认关闭，不改变手动单节点行为。
- 新增 `features/director/advance.ts`：只读取服务端可信 DAG，要求候选为 `idle` 且全部上游 `success`；`shot-codegen` 与 Director 阶段分别走原有可信 enqueue 服务。
- Director 与 render 成功路径在节点落 `success` 后推进；FABRICATE helper 明确 no-op，避免 HTML 生成完成但 MP4 尚未完成时提前推进。
- `POST/DELETE /api/director/pipeline` 支持开启、续跑和停止；停止不伪装为取消已经入队的任务。
- 顶栏死按钮已替换为真实“一键启动/停止自动推进”，Inspector 单节点动作更名为“执行此阶段”。
- 新增/扩展测试后，全量 `68 files / 299 tests` 通过；`pnpm lint`、`pnpm tsc --noEmit`、`pnpm build` 均退出 0。

## 与其他 issue 的并行性

与 issue-09/10/13 文件集合零重叠（issue-13 碰 `stage-runner.ts` 的 FABRICATE 重试逻辑——若与本 issue 同时施工，二者都会改 `stage-runner.ts`，建议**先合并 issue-11 再做 issue-13**，或协调好各自改动的函数段）。
