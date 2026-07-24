# issue-03 — Canvas Inspector 数据真实性

> **Frozen Demo v1 issue.** 保留诊断与完成证据；v3 施工只按
> [`refactor-v3/`](./refactor-v3/) 与 v3 Task Breakdown。

| 字段 | 值 |
|---|---|
| 优先级 | P1 |
| Wave | 2（`docs/specs/2026-07-23-harness-task-breakdown.md` Track H） |
| 依赖 | 无（可独立开工）；`score`/`export`/`shot-sfx`/`shot-subtitle`/`shot-qa` 五类节点的展示完整性依赖 issue-01 修复后才有真实数据可显示，但不阻塞本 issue 对 `script-import`/`shot-split`/`shot-script`/`shot-codegen` 四类节点先行修复 |
| 状态 | **已完成**（2026-07-24，代码提交 `fe7c1b2`） |

## 背景

右侧 Inspector 面板（`src/app/(app)/canvas/canvas-inspector.tsx`）展示"节点类型/执行阶段/内容哈希/分镜合同/生成进度"等字段，是用户判断"AI 是否真的在推进"的主要信息来源。经核实，除「节点类型」「执行阶段」「状态徽章」三个字段来自真实的图投影数据外，其余关键字段均为硬编码占位，与 AGENTS.md「UI 字段真实性门禁」直接冲突。

## 根因（逐字段核实，行号为当前代码真实位置）

```217:238:src/app/(app)/canvas/canvas-inspector.tsx
      <SettingsGroup>
        <SettingsRow label="节点类型" value={node.type} />
        <SettingsSeparator />
        <SettingsRow label="执行阶段" value={node.stage ?? '未配置'} />
        <SettingsSeparator />
        <SettingsRow label="内容哈希" value="待生成" />
      </SettingsGroup>
      <div>
        <p className="mb-2 text-[13px] font-semibold text-label-secondary">分镜合同 shot-plan</p>
        <div className="flex flex-wrap gap-2">
          <ArtifactChip icon={FileCode} filename="shot-plan.json" />
          <ArtifactChip icon={FileCode} filename="script-units.json" />
        </div>
      </div>
      <ProgressBar value={progress} label="生成进度" className="w-full" />
      <Button variant="tinted" icon={RefreshCw} onClick={onExecute} disabled={submitting}>
        {node.type === 'shot-codegen' ? '重渲此镜' : '全部渲染'}
      </Button>
      {node.type === 'shot-codegen' && (
        <Button variant="gray">查看代码</Button>
      )}
```

| 字段 | 问题 | 证据 |
|---|---|---|
| 内容哈希 | 字符串字面量 `"待生成"`，永不变化 | 第 222 行；`canvas_nodes.content_hash` 列已存在（`src/lib/db/schema.ts:30`），但 `getCanvasGraph`（`src/features/canvas/queries.ts:38-51`）的 `select` 里没有这一列，`CanvasGraphNode` 接口（`queries.ts:8-17`）也没有声明这个字段——数据从数据库到前端全程缺失，不是"字段有值但没展示"，是"从未被查出来" |
| 分镜合同 chips | 固定文件名，`ArtifactChip` 组件本身不支持 `href`/`onClick`（`src/components/ui/artifact-chip.tsx:4-8` 的 props 只有 `icon`/`filename`/`className`），点击无任何反应 | 第 226-229 行 + 组件定义 |
| 生成进度 | 三态硬编码而非真实读数：`success→100`、`running→62`、其余 `→0` | `canvas-inspector.tsx:82` |
| 「查看代码」按钮 | 无 `onClick` | 第 236 行 |

## 修复方案

### 1. 内容哈希：补通读模型 + 真实展示

`getCanvasGraph`（`queries.ts`）的 `select` 增加 `contentHash: canvasNodes.contentHash`，`CanvasGraphNode` 接口增加 `contentHash: string | null`。Inspector 展示：`node.contentHash ? node.contentHash.slice(0, 12) : '待生成'`（保留"待生成"作为**真实的空态**，而不是恒定假值——区别在于现在它是基于真实字段判断出来的，而不是无论如何都显示这个字符串）。

**需要确认的前置事实**：核实当前是否有任何代码路径真正往 `canvas_nodes.contentHash` 写入过值（初步排查未发现，`status.ts`/`transitionNodeStatus` 类的状态转移函数目前只改 `status`）。如果确认从未写入，本 issue 范围内**只做"读出并诚实展示当前值（多数情况下会是 null）"**，不新增哈希计算/写入逻辑——那是 F5 定向重渲染缓存判断的范围，可能已有独立任务卡覆盖，需要施工前搜索确认，避免本 issue 越界重复实现。

### 2. 分镜合同 chips：接入真实 artifact

`ArtifactChip` 组件增加可选的 `href`/`onClick` prop（保持向后兼容，其余调用点不受影响）。Inspector 侧改为：按当前节点的 `laneKey`/`type` 查询真实存在的 artifact（如 `director-shot-spec`、`director-ingest`），存在则渲染带下载/预览链接（`GET /api/artifacts/[id]?projectId=...`）的 chip；不存在则不渲染该 chip 或渲染禁用态说明（不能保留"看起来可点"的外观）。

需要新增一个受控的"该节点关联 artifact 列表"查询（如 `features/canvas/queries.ts` 新增 `getNodeArtifacts(projectId, nodeId): { id: string; kind: string; filename: string }[]`，内部查 `artifacts` 表按 `projectId + nodeId` 过滤），不得让页面直接查 `artifacts` 表或拼路径。

### 3. 生成进度：改为真实派生或移除假百分比

**推荐方案**：不再展示"看起来精确"的百分比数字。`running` 状态下这是一个异步 LLM/渲染调用，后端目前没有任何真实的"完成度百分比"数据源（Director 六阶段是黑盒调用，没有流式进度回调）。按 AGENTS.md 门禁，应改为：
- `idle`/`pending`：进度条 0% 或不展示进度条，只展示状态徽章。
- `running`：展示不定进度的视觉反馈（如已有的 `Skeleton` 或一个"进行中"的不确定态动效），不展示虚假的固定百分比。
- `success`：100%。
- `failed`：展示错误信息（已有 `Toast`），进度条可保持 0 或移除。

具体是否保留 `ProgressBar` 组件本身（改造成"不定进度"模式）还是替换成别的视觉元素，留给施工者结合 `/playbook` 已登记组件判断，但**不允许保留 `running→62%` 这个恒定假值**。

### 4. 「查看代码」按钮：接入真实跳转

仅 `shot-codegen` 节点显示。点击跳转到该节点对应的分镜详情页（`/canvas/shot/[id]?projectId=...`，`id` 就是当前 `node.id`），复用 Next.js `useRouter().push()` 或 `<Link>`（现有 `canvas-view.tsx` 已有类似跳转逻辑可参考）。

## 允许改动范围 / 禁止改动 / 完成条件

**目标**：Inspector 面板展示的每个字段（内容哈希、分镜合同 chips、生成进度、查看代码入口）都能在代码里追溯到真实数据源，无残留硬编码占位值。

**前置任务**：无（`score`/`export`/`shot-sfx`/`shot-subtitle`/`shot-qa` 五类节点在 issue-01 修复前仍会展示"从未成功过"的真实状态，这是诚实的，不是本 issue 的缺陷）。

**允许改动范围**：
- `src/features/canvas/queries.ts`（新增 `contentHash` select、`getNodeArtifacts` 查询）及对应测试
- `src/app/(app)/canvas/canvas-inspector.tsx`
- `src/components/ui/artifact-chip.tsx`（新增可选 `href`/`onClick`，保持向后兼容）+ `artifact-chip.demo.tsx`（若因新增 prop 需要更新示例）

**禁止改动**：
- `src/features/navigation/collapsible-panel.tsx`（折叠/抽屉动效壳层不属于本 issue 范围）
- `src/features/canvas/fan-out.ts`、`status.ts`（不在本 issue 内新增内容哈希计算/写入逻辑，若发现确实缺失应另立 issue）
- `src/features/director/**`（不改 Director 输入契约，那是 issue-01 的范围）

**完成条件**：
- [x] 内容哈希字段来自 `canvas_nodes.contentHash` 真实值，无写死字符串
- [x] 分镜合同 chips 只在真实 artifact 存在时渲染为可点击/可下载状态，否则不渲染或显式禁用
- [x] 生成进度不再有恒定假百分比（`running→62%` 已消除）
- [x] 「查看代码」按钮点击后正确跳转到对应分镜详情页
- [x] `pnpm lint && pnpm tsc --noEmit && pnpm build` 通过；新增查询有测试覆盖

## 完成证据（2026-07-24）

- 提交 `fe7c1b2`：`queries.ts` 新增 `contentHash` select 与 `getNodeArtifacts(projectId, nodeId)`；`canvas-inspector.tsx` 四处占位全部替换为真实数据；`artifact-chip.tsx` 新增 `href`。
- `getNodeArtifacts` 排除内部 `pi-session` 会话指针，按最新优先排序；chip 的 `href` 指向真实的 `/api/artifacts/[id]?projectId=...` 下载路由。
- 生成进度：`success` 展示真实 100%，`running` 展示不定进度 spinner，其余状态不再渲染假百分比。
- `pnpm lint`、`pnpm tsc --noEmit`、`pnpm test`（60 files / 208 tests）、`pnpm build` 均在合入后的干净 `main` 上验证通过。
