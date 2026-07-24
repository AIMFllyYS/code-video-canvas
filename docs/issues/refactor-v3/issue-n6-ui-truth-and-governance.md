# Track N6 UI 真实性与代码治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Canvas、Inspector、设置与导出界面的每个可见字段都可追溯到 `ProjectRunSnapshotV1`、Trigger Realtime、artifact DTO 或明确的本地 optimistic command state，并按 Pencil → Playbook → 页面顺序交付可复用组件及文件治理结果。

**Architecture:** Postgres Snapshot 是持久化业务事实；Trigger Realtime 只覆盖实时呈现，首次加载、刷新、断线与终态必须重新拉 Snapshot 对账。UI 不读取 raw provider delta、Tool 参数、prompt、source、credential 或 hidden reasoning。视觉组件唯一真源是已在 Pencil 编辑器中打开的 `docs/designs/canvas.pen`，且 `.pen` 只经 Pencil MCP 访问。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript strict、Tailwind design tokens、motion/react、Pencil MCP、Vitest、Playwright、`ProjectRunSnapshotV1`、`SafeJsonValue`

---

## 权威、依赖与总边界

**Track ID:** `N6`

**Requirements:** `PROD-CANVAS-004`、`PROD-RUN-001..007`、`PROD-UI-001..007`、
`PROD-NFR-PERF-001..003`、`PROD-NFR-A11Y-001..003`、`SCN-05`、`SCN-06`、
`SCN-08`

**Architecture:** `ARCH-MOD-001..005`、`EXEC-STATE-002..003`、
`CONTRACT-AI-006`、`CONTRACT-RUN-001..003`、`TEST-001`、`TEST-006`、
`SEC-001`

**Depends on:** N5 全部 Task 已在
`docs/specs/2026-07-24-refactor-v3-task-breakdown.md` 勾选完成；N2 已交付
`ProjectRunSnapshotV1`、Snapshot API 与 scoped Realtime token；N3 已交付
`SafeTraceEventV1`；N4/N5 已交付 source、gate、render 与 final media artifact DTO。

**允许修改：**

- `docs/designs/canvas.pen`，但只允许 Pencil MCP；
- `src/components/ui/**` 与对应 `*.demo.tsx`、`*.test.tsx`；
- `src/app/playbook/registry.ts`、`src/app/playbook/registry.test.ts`；
- `src/features/pipeline/client/**`、`src/features/canvas-workspace/inspector/**`；
- `src/app/(app)/canvas/**`、`src/app/(app)/settings/**`；
- 本卡 N6.6 明列的热点文件与其职责拆分目标；
- `scripts/verification/ui-field-sources.ts`、
  `scripts/verification/source-governance.ts`、
  `scripts/verification/n6-browser-evidence.ts`；
- `docs/evidence/refactor-v3/n6/**`；
- 与上述实现一一对应的定向测试。

**禁止修改：**

- Postgres schema/migration、Trigger task DAG、task ID、queue/tag 合同；
- `packages/contracts/**` 的公开字段语义；
- Pi runner、provider、prompt、source normalizer、compiler、HyperFrames、compose 行为；
- 用 shell、Read、Grep、`Get-Content` 或普通文件 API 读取/写入
  `docs/designs/canvas.pen`；
- 在页面里临时复制视觉原语、绕开 Playbook 登记或先做页面再补设计；
- 把 Realtime event 写成业务 terminal 状态，或由客户端猜 attempt/node/stage；
- `dangerouslySetInnerHTML`、raw assistant delta、Tool 参数值、provider 原始错误、
  prompt、source、credential、hidden thinking/reasoning；
- 固定百分比、恒真 checked、无 `href` artifact、可点击但无行为的控件；
- 新增硬编码 hex/rgba、硬编码动效时长/贝塞尔、emoji 或非白名单图标；
- 安装/删除依赖；若现有依赖确实不足，停止当前 Task 并回报。

## 开工硬门：Pencil 编辑器必须已打开 `canvas.pen`

N6 的第一项写操作只能发生在 Pencil MCP 中。执行者必须先调用
`get_editor_state(include_schema: true)` 并确认当前活动文档就是
`docs/designs/canvas.pen`。若文件未打开、编辑器未连接、返回的活动文档不一致或 schema
不可用，N6 保持 blocked，禁止修改 `.pen`、Playbook、组件、页面或账本。

通过后只使用 Pencil MCP 的 `get_guidelines`、`get_variables`、`batch_get`、
`batch_design`、`snapshot_layout`、`get_screenshot`、`export_nodes` 等能力。每次
`batch_design` 后必须用 `snapshot_layout` 和 `get_screenshot` 检查真实像素。顺序不可
颠倒：

```text
Pencil reusable symbol
  → Pencil snapshot/screenshot
  → React reusable component
  → Playbook registry + demo
  → application page consumption
```

---

<a id="task-n61"></a>

### Task N6.1: Pencil 真源与有界可复用 viewer

**交付：** 在已打开的 `canvas.pen` 先建立 `JsonTreeViewer`、
`SafeTraceTimeline`、`GateResultsPanel`、`SourcePackageViewer`、`RunControl`、
`PipelineStatusBar`、`InspectorTabs` reusable symbol，再实现对应 React 纯展示组件。

**Files:**

- Modify through Pencil MCP only: `docs/designs/canvas.pen`
- Create: `src/components/ui/json-tree-viewer.tsx`
- Create: `src/components/ui/json-tree-viewer.test.tsx`
- Create: `src/components/ui/safe-trace-timeline.tsx`
- Create: `src/components/ui/safe-trace-timeline.test.tsx`
- Create: `src/components/ui/gate-results-panel.tsx`
- Create: `src/components/ui/gate-results-panel.test.tsx`
- Create: `src/components/ui/source-package-viewer.tsx`
- Create: `src/components/ui/source-package-viewer.test.tsx`
- Create: `src/components/ui/run-control.tsx`
- Create: `src/components/ui/pipeline-status-bar.tsx`
- Create: `src/components/ui/inspector-tabs.tsx`
- Create: `docs/evidence/refactor-v3/n6/pencil-symbol-map.md`

- [ ] 调用 `get_editor_state(include_schema: true)`；记录活动文档、schema 可用性与
  Pencil 连接结果，不记录 `.pen` 原始内容。门禁失败时停止本 Track。
- [ ] 用 Pencil MCP 读取 token、现有组件 inventory 和 S1–S6 上下文；先复用现有
  Button、StatusPill、ArtifactChip、SegmentedControl、Card、Tooltip 和 EmptyState，
  不创建平行原语。
- [ ] 在 Pencil 中创建七个 reusable symbol 及必要 variant：空态、加载、正常、
  warning、failed、disabled、selected、reduced-motion 静态态。使用现有 token 和
  Lucide 白名单图标。
- [ ] 用 Pencil MCP 对七个 symbol 运行 `snapshot_layout`，确保无 overflow、重叠、
  clip 或异常文字换行；再用 `get_screenshot` 检查亮色/暗色和 240|1200 壳内像素。
- [ ] 写 `pencil-symbol-map.md`，逐项登记 Pencil symbol 名、React 文件、Playbook ID、
  应用消费点和截图证据路径。
- [ ] 先写 RED 测试，证明 `JsonTreeViewer` 在 depth 7、node 501、序列化 copy
  65,537 byte 时被界限截断，并证明渲染输出不包含
  `dangerouslySetInnerHTML`：

```ts
export const JSON_VIEWER_LIMITS = {
  maxDepth: 6,
  maxNodes: 500,
  maxCopyBytes: 64 * 1024,
} as const
```

- [ ] 写 RED 测试，证明 `SafeTraceTimeline` 只接受 `SafeTraceEventV1`，且 DOM 不出现
  `message_delta`、`arguments`、`prompt`、`reasoning`、credential 或 provider raw
  error；证明错误、警告、成功均有文本标签而非只靠颜色。
- [ ] 写 RED 测试，证明 `GateResultsPanel` 展示真实 `GateResultV1` 的
  `gate/status/issues/evidenceArtifactId`，无证据 artifact 时不渲染假链接；证明
  `SourcePackageViewer` 只展示版本、fragment、hash 与兼容警告。
- [ ] 运行 RED：

```powershell
pnpm test -- src/components/ui/json-tree-viewer.test.tsx src/components/ui/safe-trace-timeline.test.tsx src/components/ui/gate-results-panel.test.tsx src/components/ui/source-package-viewer.test.tsx
```

  预期因组件或界限行为尚未实现而失败；记录失败测试名。
- [ ] 实现纯展示组件。JSON 值只通过 React text node 输出；copy 在 UTF-8 byte
  计数后拒绝超限并显示明确原因；截断必须显式显示“深度/节点/复制上限”，不能静默
  丢字段。
- [ ] 所有交互使用键盘可达语义；动效只用 `motion/react` 与 `src/lib/motion`
  token，并尊重 reduced motion。组件不得 fetch、订阅 Realtime 或自行推导业务状态。
- [ ] 运行 GREEN 与静态门禁：

```powershell
pnpm test -- src/components/ui/json-tree-viewer.test.tsx src/components/ui/safe-trace-timeline.test.tsx src/components/ui/gate-results-panel.test.tsx src/components/ui/source-package-viewer.test.tsx
pnpm typecheck
rg -n "dangerouslySetInnerHTML|message_delta|raw.*reasoning|hidden.*thinking" src/components/ui
git diff --check
```

  前两条退出 0；`rg` 不得命中 N6 新组件的禁止实现。
- [ ] 精确 stage 并本地 commit：

```powershell
git add -- docs/designs/canvas.pen docs/evidence/refactor-v3/n6/pencil-symbol-map.md src/components/ui/json-tree-viewer.tsx src/components/ui/json-tree-viewer.test.tsx src/components/ui/safe-trace-timeline.tsx src/components/ui/safe-trace-timeline.test.tsx src/components/ui/gate-results-panel.tsx src/components/ui/gate-results-panel.test.tsx src/components/ui/source-package-viewer.tsx src/components/ui/source-package-viewer.test.tsx src/components/ui/run-control.tsx src/components/ui/pipeline-status-bar.tsx src/components/ui/inspector-tabs.tsx
git diff --cached --check
git commit -m "feat(ui): add bounded run evidence viewers" -m "Task: N6.1" -m "Spec: CONTRACT-AI-006 CONTRACT-RUN-001..003"
```

**退出门：** Pencil 七个 symbol 有真实 layout/screenshot 证据；React viewer
depth=6、node=500、copy=64 KiB 的边界测试通过；禁止信息未进入 DOM。

---

<a id="task-n62"></a>

### Task N6.2: Playbook 登记与真实 demo

**Files:**

- Create: `src/components/ui/json-tree-viewer.demo.tsx`
- Create: `src/components/ui/safe-trace-timeline.demo.tsx`
- Create: `src/components/ui/gate-results-panel.demo.tsx`
- Create: `src/components/ui/source-package-viewer.demo.tsx`
- Create: `src/components/ui/run-control.demo.tsx`
- Create: `src/components/ui/pipeline-status-bar.demo.tsx`
- Create: `src/components/ui/inspector-tabs.demo.tsx`
- Modify: `src/app/playbook/registry.ts`
- Modify: `src/app/playbook/registry.test.ts`

- [ ] 先写 RED registry 测试：七个 Playbook ID 必须唯一、具备 Pencil symbol 引用、
  demo module、category 与状态矩阵；缺一项即失败。
- [ ] demo 只使用脱敏 fixture，覆盖空态、loading、running、failed、cancelled、
  succeeded、Reconnect、artifact 无证据与 JSON 超限；不得调用真实 API 或使用固定
  假百分比。
- [ ] 运行 RED：

```powershell
pnpm test -- src/app/playbook/registry.test.ts
```

  预期七个登记缺失而失败。
- [ ] 登记七个组件并实现 demo；保持 `/playbook` 在应用路由组之外，不挂 AppShell。
- [ ] 运行 GREEN：

```powershell
pnpm test -- src/app/playbook/registry.test.ts
pnpm typecheck
pnpm lint
```

- [ ] 用真实浏览器打开 `/playbook/ui`，逐项验证亮/暗、键盘、窄屏与 reduced motion；
  截图写入 `docs/evidence/refactor-v3/n6/playbook/`。
- [ ] 精确 stage 并本地 commit：

```powershell
git add -- src/app/playbook/registry.ts src/app/playbook/registry.test.ts src/components/ui/json-tree-viewer.demo.tsx src/components/ui/safe-trace-timeline.demo.tsx src/components/ui/gate-results-panel.demo.tsx src/components/ui/source-package-viewer.demo.tsx src/components/ui/run-control.demo.tsx src/components/ui/pipeline-status-bar.demo.tsx src/components/ui/inspector-tabs.demo.tsx docs/evidence/refactor-v3/n6/playbook
git diff --cached --check
git commit -m "docs(playbook): register run evidence components" -m "Task: N6.2" -m "Spec: PROD-UI-005 TEST-006"
```

**退出门：** 七个 Pencil symbol、Playbook ID 与 React 文件一一对应；真实浏览器证据
证明 demo 可见且可键盘操作。

---

<a id="task-n63"></a>

### Task N6.3: Snapshot + Realtime RunControl 与 PipelineStatusBar

**Files:**

- Create: `src/features/pipeline/client/project-run-controller.tsx`
- Create: `src/features/pipeline/client/project-run-reducer.ts`
- Create: `src/features/pipeline/client/project-run-reducer.test.ts`
- Create: `src/features/pipeline/client/use-project-run-realtime.ts`
- Create: `src/features/pipeline/client/use-project-run-realtime.test.ts`
- Modify: `src/app/(app)/canvas/canvas-loader.tsx`
- Modify: `src/app/(app)/canvas/canvas-view.tsx`
- Modify: `src/app/(app)/canvas/canvas-action-api.ts`
- Modify: `src/app/(app)/canvas/canvas-action-api.test.ts`
- Create: `docs/evidence/refactor-v3/n6/run-field-sources.md`

- [ ] 先建立 field-source matrix，至少覆盖 run ID、业务状态、Realtime 连接状态、
  node/shot 状态、readiness、失败摘要、开始/结束时间、artifact 链接、start/cancel/
  retry disabled reason。每行来源只能是 Snapshot、Realtime、artifact DTO 或 local
  optimistic command state。
- [ ] 写 RED reducer 测试：初始只信 Snapshot；Realtime 只更新 live presentation；
  旧序列/out-of-order event 被忽略；断线、终态与刷新触发 Snapshot revalidation；
  Realtime 不可把 failed/cancelled/succeeded 业务事实改成 running。
- [ ] 写 RED API/UI 测试：start/cancel/retry 使用服务端返回的 run/attempt/command
  receipt，不猜 ID；请求接受后 2 秒内显示真实 triggering/queued 状态；不伪造连续
  百分比。
- [ ] 运行 RED：

```powershell
pnpm test -- src/features/pipeline/client/project-run-reducer.test.ts src/features/pipeline/client/use-project-run-realtime.test.ts "src/app/(app)/canvas/canvas-action-api.test.ts"
```

- [ ] 实现 `project-run-controller`：Server Component 取得首个
  `ProjectRunSnapshotV1`；Client hook 只使用 scoped token 订阅所属 workspace/project
  的 Trigger run/typed stream；断线、终态和 reconnect 后调用 Snapshot endpoint。
- [ ] `RunControl` 和 `PipelineStatusBar` 只接收 view model。业务状态与连接状态分栏
  展示；blocked/ready 只消费 `snapshot.readiness`，客户端不得复制 ExecutionPolicy。
- [ ] 空 project、无 run、无 token、已取消、部分 Shot 失败与 Snapshot 请求失败均有
  明确空态/错误态；乐观状态只持续到 command response 或下一次 Snapshot。
- [ ] 运行 GREEN：

```powershell
pnpm test -- src/features/pipeline/client/project-run-reducer.test.ts src/features/pipeline/client/use-project-run-realtime.test.ts "src/app/(app)/canvas/canvas-action-api.test.ts"
pnpm typecheck
pnpm lint
```

- [ ] 精确 stage 并本地 commit：

```powershell
git add -- src/features/pipeline/client ':(literal)src/app/(app)/canvas/canvas-loader.tsx' ':(literal)src/app/(app)/canvas/canvas-view.tsx' ':(literal)src/app/(app)/canvas/canvas-action-api.ts' ':(literal)src/app/(app)/canvas/canvas-action-api.test.ts' docs/evidence/refactor-v3/n6/run-field-sources.md
git diff --cached --check
git commit -m "feat(canvas): reconcile run snapshot with realtime" -m "Task: N6.3" -m "Spec: PROD-RUN-001..007 CONTRACT-RUN-001..003 EXEC-STATE-003"
```

**退出门：** 首载、刷新、断线、重连和终态均回到 Postgres Snapshot 对账；Realtime
从不成为 terminal 业务真源；所有 run 字段有来源矩阵。

---

<a id="task-n64"></a>

### Task N6.4: Inspector 数据、源码、门禁、执行四页签

**Files:**

- Create: `src/features/canvas-workspace/inspector/inspector-panel.tsx`
- Create: `src/features/canvas-workspace/inspector/inspector-view-model.ts`
- Create: `src/features/canvas-workspace/inspector/inspector-view-model.test.ts`
- Create: `src/features/canvas-workspace/inspector/data-tab.tsx`
- Create: `src/features/canvas-workspace/inspector/source-tab.tsx`
- Create: `src/features/canvas-workspace/inspector/gates-tab.tsx`
- Create: `src/features/canvas-workspace/inspector/execution-tab.tsx`
- Modify: `src/app/(app)/canvas/canvas-inspector.tsx`
- Modify: `src/app/(app)/canvas/canvas-view.tsx`

- [ ] 写 RED view-model 测试，固定四个 tab ID：`data`、`source`、`gates`、
  `execution`。节点类型缺少某类 artifact 时显示可解释空态，不用静态 demo 值补齐。
- [ ] RED 覆盖：
  - 数据：版本化 DTO 的 tree/table/raw 视图；
  - 源码：原始输入引用、规范化 fragments、hash、compatibility warnings；
  - 门禁：G1–G10 的真实状态、issue path/hint、证据 artifact 下载 URL；
  - 执行：SafeTrace、Trigger live status、attempt、retry、usage/cost summary。
- [ ] RED 证明执行页签无法接收 raw delta、Tool argument values、prompt、source 或 provider
  raw error；源码只出现在 source artifact DTO，不从 trace 拼接。
- [ ] 运行 RED：

```powershell
pnpm test -- src/features/canvas-workspace/inspector/inspector-view-model.test.ts
```

- [ ] 实现四页签和键盘 roving/tab 语义；窄屏保持可操作，状态带文本标签；artifact
  下载仅使用 artifact ID 对应的服务端 URL。
- [ ] 将旧 `canvas-inspector.tsx` 收口为页面 adapter，禁止在该文件重复 viewer、status、
  source 或 gate 视觉原语。
- [ ] 运行 GREEN：

```powershell
pnpm test -- src/features/canvas-workspace/inspector/inspector-view-model.test.ts
pnpm typecheck
pnpm lint
```

- [ ] 精确 stage 并本地 commit：

```powershell
git add -- src/features/canvas-workspace/inspector ':(literal)src/app/(app)/canvas/canvas-inspector.tsx' ':(literal)src/app/(app)/canvas/canvas-view.tsx'
git diff --cached --check
git commit -m "feat(canvas): add four-view evidence inspector" -m "Task: N6.4" -m "Spec: PROD-CANVAS-004 PROD-UI-006 CONTRACT-AI-006 TEST-006"
```

**退出门：** 四页签均来自真实 DTO；空数据明确显示空态；隐藏 reasoning/raw trace 无
UI 通道。

---

<a id="task-n65"></a>

### Task N6.5: 剧本导入与语义拆分 JSON 可视化

**Files:**

- Create: `src/features/canvas-workspace/inspector/script-node-view-model.ts`
- Create: `src/features/canvas-workspace/inspector/script-node-view-model.test.ts`
- Modify: `src/features/canvas-workspace/inspector/data-tab.tsx`
- Modify: `src/features/canvas-workspace/inspector/source-tab.tsx`
- Modify: `src/app/(app)/canvas/flow-elements.tsx`
- Modify: `src/app/(app)/canvas/flow-elements.test.ts`

- [ ] 写 RED 测试：`script-import` 展示原始稿件 artifact 的 schema/version/hash 与有界
  JSON；`shot-split` 展示 `scriptUnits`、稳定 Shot ID、ShotSpec/plan 引用和 fan-out
  关系；不存在字段时显示缺失原因。
- [ ] RED 证明所有 JSON 均经过 `SafeJsonValue` 收窄和 N6.1 viewer 的
  depth=6/node=500/copy=64 KiB 限制；不得把 `JSON.stringify` 大块塞进 `<pre>`。
- [ ] 运行 RED：

```powershell
pnpm test -- src/features/canvas-workspace/inspector/script-node-view-model.test.ts "src/app/(app)/canvas/flow-elements.test.ts"
```

- [ ] 实现 node-specific adapter；它只能从 Snapshot/node/artifact DTO 取值，不读取
  server-only repository、不按 `CanvasNodeType` 猜 Director stage、不生成固定
  scriptUnits。
- [ ] 在 Canvas 节点摘要中只显示真实短摘要和数量，完整结构进入 Inspector 数据页签；
  无数据时使用 EmptyState。
- [ ] 运行 GREEN：

```powershell
pnpm test -- src/features/canvas-workspace/inspector/script-node-view-model.test.ts "src/app/(app)/canvas/flow-elements.test.ts"
pnpm typecheck
pnpm lint
```

- [ ] 精确 stage 并本地 commit：

```powershell
git add -- src/features/canvas-workspace/inspector/script-node-view-model.ts src/features/canvas-workspace/inspector/script-node-view-model.test.ts src/features/canvas-workspace/inspector/data-tab.tsx src/features/canvas-workspace/inspector/source-tab.tsx ':(literal)src/app/(app)/canvas/flow-elements.tsx' ':(literal)src/app/(app)/canvas/flow-elements.test.ts'
git diff --cached --check
git commit -m "feat(canvas): visualize script artifacts as bounded json" -m "Task: N6.5" -m "Spec: PROD-PLAN-001..005 PROD-UI-001 CONTRACT-RUN-002"
```

**退出门：** 导入与拆分结构可检查、可复制且有界；所有值可追溯到 artifact/Snapshot，
无客户端阶段猜测。

---

<a id="task-n66"></a>

### Task N6.6: 九个热点文件拆分与自动治理

本 Task 只做职责拆分、公开入口收口和等价测试，不改变模型、执行、渲染或合成语义。
若前序 Track 已删除某个旧文件，则在治理报告中记录替代文件与 source scan，不重建旧
路径。

**热点与拆分目标：**

| 旧热点 | N6 目标 |
|---|---|
| `src/features/director/runtime-repository.ts` | 已由 N1–N3 删除，或拆到 `src/features/pipeline/repository/{run,attempt,snapshot}-repository.ts`，公开入口仅 `src/features/pipeline/index.ts` |
| `src/app/(app)/canvas/shot/[id]/shot-detail.tsx` | 拆为同目录 `shot-header.tsx`、`shot-source-panel.tsx`、`shot-preview-panel.tsx`、`shot-evidence-panel.tsx` |
| `src/app/(app)/settings/model-service-settings.tsx` | 拆为同目录 `model-policy-form.tsx`、`media-provider-policy-form.tsx`、`provider-credential-form.tsx`、`provider-status-panel.tsx`；LLM 与 TTS/ASR 都只编辑服务端 policy DTO |
| `src/features/render/repository.ts` | 拆为 `render-attempt-repository.ts`、`render-artifact-repository.ts`，由 `src/features/render/index.ts` 公开 |
| `src/app/(app)/canvas/export/export-workspace.tsx` | 拆为同目录 `export-run-summary.tsx`、`export-media-evidence.tsx`、`export-controls.tsx` |
| `src/features/render/vision-qa.ts` | 拆为 `vision-qa-service.ts` 与 `vision-qa-normalizer.ts` |
| `src/features/director/advance.ts` | 已由 N2–N3 删除，或拆为 `advance-policy.ts` 与 `advance-service.ts` |
| `src/features/director/stage-runner.ts` | N2–N3 后必须删除；不得把旧六阶段 runner 留作第二 runtime |
| `src/app/(app)/canvas/canvas-inspector.tsx` | 收口为 adapter；UI 进入 `src/features/canvas-workspace/inspector/**` |

**Files:**

- Modify/move only the nine rows above and their existing tests
- Create: `scripts/verification/source-governance.ts`
- Create: `scripts/verification/source-governance.test.ts`
- Create: `docs/evidence/refactor-v3/n6/source-governance-report.md`
- Create: `docs/evidence/refactor-v3/n6/task-n6.6-files.txt`（逐行精确文件路径，禁目录/glob）

- [ ] 记录九个文件的 N6 基线：存在性、行数、最大函数、职责、import/export 和前序替代
  commit。先证明测试覆盖，再移动逻辑。
- [ ] 写 RED governance 测试，执行以下硬门：
  - `page.tsx` ≤300 行，目标 ≤200；
  - 业务组件/服务 ≤350 行，目标 ≤250；
  - repository/schema ≤400 行；
  - 单函数 ≤50 行；
  - `index.ts` 只导出公开 API；
  - 禁止 app/feature 跨域 deep import；
  - 九个热点不存在，或已降到对应硬上限并只有一个主职责。
- [ ] 运行 RED：

```powershell
pnpm test -- scripts/verification/source-governance.test.ts
```

  预期报告九个热点或边界违规。
- [ ] 按表逐个拆分；每拆一个先运行其原测试，再运行 typecheck。移动时保留命名导出，
  不创建兼容 barrel 中的业务逻辑，不顺手改变状态机或 DTO。
- [ ] 删除已无引用的旧文件前，用 `Resolve-Path` 确认目标位于仓库内，并以本 Task 表格
  为删除授权；不删除用户未提交的重叠修改。
- [ ] 运行 GREEN：

```powershell
pnpm test -- scripts/verification/source-governance.test.ts
pnpm typecheck
pnpm lint
pnpm exec tsx scripts/verification/source-governance.ts
```

- [ ] 将真实路径、行数、例外数（必须为 0）和 deep-import 结果写入
  `source-governance-report.md`。
- [ ] 精确 stage 并本地 commit：

```powershell
$taskFiles = Get-Content -LiteralPath 'docs/evidence/refactor-v3/n6/task-n6.6-files.txt' -Encoding utf8
if (-not $taskFiles -or ($taskFiles | Where-Object { [string]::IsNullOrWhiteSpace($_) -or $_ -match '[*?]' -or $_ -match '(^|/)\.\.(/|$)' })) { throw 'N6.6 file manifest must contain exact repository-relative file paths only' }
foreach ($taskFile in $taskFiles) { git add -- ":(literal)$taskFile" }
git add -- docs/evidence/refactor-v3/n6/task-n6.6-files.txt
git diff --cached --name-only
git diff --cached --check
git commit -m "refactor(governance): split ui and service hotspots" -m "Task: N6.6" -m "Spec: ARCH-MOD-001..005 A29"
```

**退出门：** 九个热点逐项有“已删除/已拆分”证据；硬上限、函数长度与跨域 import
门禁退出 0；行为测试不回退。

---

<a id="task-n67"></a>

### Task N6.7: 清除假值、死控件与重复视觉原语

**Files:**

- Create: `scripts/verification/ui-field-sources.ts`
- Create: `scripts/verification/ui-field-sources.test.ts`
- Create: `scripts/verification/n6-browser-evidence.ts`
- Create: `docs/evidence/refactor-v3/n6/field-source-matrix.md`
- Create: `docs/evidence/refactor-v3/n6/browser-report.md`
- Create: `docs/evidence/refactor-v3/n6/task-n6.7-files.txt`（逐行精确文件路径，禁目录/glob）
- Modify only as findings require:
  `src/app/(app)/projects/**`、`src/app/(app)/canvas/**`、
  `src/app/(app)/settings/**`、`src/components/ui/**`

- [ ] 逐页建立 field-source matrix：Projects、Canvas、四页签 Inspector、Settings、
  Export。每个 visible field 登记 selector、DTO path、source class、空态、loading
  边界与操作 handler。Settings 必须分别覆盖四类 `AiTaskKind` 的有效路由、
  `tts/asr` 的有效 media route、credential 存在/验证状态，且不显示 ciphertext。
- [ ] 写 RED audit，失败条件包括固定百分比、固定时间/分辨率伪装成检测结果、恒真
  `checked`、无 `href` ArtifactChip、无 handler 的可点控件、永久 Skeleton、页面内
  重复 Button/Card/StatusPill/ArtifactChip、客户端猜 ID。
- [ ] 运行 RED：

```powershell
pnpm test -- scripts/verification/ui-field-sources.test.ts
pnpm exec tsx scripts/verification/ui-field-sources.ts
```

- [ ] 对每个 finding 选择真实数据接线、明确 disabled/EmptyState 或去除虚假外观；
  loading 只包裹真实 async window。不得用新的静态值让 audit 变绿。
- [ ] 用 `scripts/verification/n6-browser-evidence.ts` 驱动真实 Next app 与浏览器，覆盖：
  start、cancel、retry、刷新、Realtime 断开/恢复、四页签、artifact 下载、键盘、
  reduced motion、窄屏；记录 selector 与 Snapshot/artifact 响应关联。
- [ ] 运行 Track N6 Gate：

```powershell
pnpm test -- scripts/verification/ui-field-sources.test.ts scripts/verification/source-governance.test.ts
pnpm exec tsx scripts/verification/ui-field-sources.ts
pnpm exec tsx scripts/verification/source-governance.ts
pnpm exec tsx scripts/verification/n6-browser-evidence.ts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
rg -n --fixed-strings ([string][char]0xFFFD) AGENTS.md README.md docs src
git diff --check
```

- [ ] 确认 source scan 无固定假百分比、假 checked、无链接 artifact、死控件、raw
  trace、重复视觉原语；浏览器报告列出所有通过/失败断言，不用截图替代字段来源。
- [ ] 精确 stage 并本地 commit：

```powershell
$taskFiles = Get-Content -LiteralPath 'docs/evidence/refactor-v3/n6/task-n6.7-files.txt' -Encoding utf8
if (-not $taskFiles -or ($taskFiles | Where-Object { [string]::IsNullOrWhiteSpace($_) -or $_ -match '[*?]' -or $_ -match '(^|/)\.\.(/|$)' })) { throw 'N6.7 file manifest must contain exact repository-relative file paths only' }
foreach ($taskFile in $taskFiles) { git add -- ":(literal)$taskFile" }
git add -- docs/evidence/refactor-v3/n6/task-n6.7-files.txt
git diff --cached --name-only
git diff --cached --check
git commit -m "fix(ui): remove fake fields and dead controls" -m "Task: N6.7" -m "Spec: PROD-UI-001..007 SCN-08 A27 A28 A29"
```

**退出门：** field-source matrix 无 unknown；真实浏览器覆盖 Snapshot/Realtime 对账与四
页签；无假值、死控件、重复原语；Tier B、Pencil/Playbook/browser/governance 专项均
退出 0。

---

## Track N6 完成条件

- [ ] N6.1–N6.7 均有本地 Conventional Commit、精确 evidence 与未污染的 staged scope。
- [ ] `canvas.pen` 的七个 reusable symbol、Playbook 登记和页面消费一一对应，且顺序
  证据完整。
- [ ] JSON viewer 严格执行 depth 6、node 500、copy 64 KiB，并只输出 React text node。
- [ ] Inspector 提供数据、源码、门禁、执行四页签；safe trace 不含禁止信息。
- [ ] Snapshot 是持久化事实，Realtime 只做实时呈现；刷新、断线和终态完成对账。
- [ ] 九个热点与页面/服务/函数/import 边界全部通过自动治理。
- [ ] 更新唯一状态账本中 N6 Task 勾选、commit SHA 与 evidence；Issue 只附详细证据，
  不建立第二份状态汇总。
