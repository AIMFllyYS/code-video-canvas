# issue-01 处理全过程总结

## 一、任务与背景

**issue-01 — Director 六阶段输入契约补全（ASSEMBLE/FINALIZE）**，P0 级。

核心问题：`runtime-repository.ts` 的 `resolveDirectorInput` 只为 `INGEST/DIRECT/SHOT_SPEC/FABRICATE` 组装了 `directorInput`，而 `ASSEMBLE`（`score`/`shot-sfx`/`shot-subtitle`）与 `FINALIZE`（`export`/`shot-qa`）落到 `return row.data.directorInput`（对这些节点恒为 `undefined`）→ `stage-prompt.ts` 对 `undefined` 调 `.strict().parse()` → **点击这五类节点 100% 必现 `Invalid input: expected object, received undefined` 崩溃**。目标是让六阶段输入契约无 mock 全部跑通。

## 二、规划阶段（UltraPlan 多智能体）

- 先核实分支（`main`）与代码现状，确认 issue 文档引用的行号与真实代码一致。
- 并行启动 3 个只读调研 Agent（简洁性 / 性能 / 最小风险）各自出方案，再做批判性评审与综合。
- 严格遵循 issue 已拍板的 Q1–Q4 决策：Option A 拆 builder + `nodeType` 路由；`score`/`export` 查询在 director 内自写（禁 import render，避免循环依赖）；`export` 缺 `final-mp4` 前置抛可读错误；不做输出归一化、不补前四阶段存量测试。

## 三、实现内容（8 步，按依赖顺序）

1. **`schemas/ingest.ts`**：导出 `shotAllocationSchema` 值 + `ShotAllocation` 类型（零校验规则改动）。
2. **`prompts/assemble.ts`**：拆成 `buildScoreAssemblePrompt`（全片）/`buildShotSfxPrompt`/`buildShotSubtitlePrompt`（单镜），`shotPlan` 改用宽松 `directorShotPlanSchema`。
3. **`prompts/finalize.ts`**：拆成 `buildExportFinalizePrompt`（全片）/`buildShotQaPrompt`（单镜）。
4. **`runtime-repository.ts`（核心）**：`DirectorStageContext`/`StageContextRow` 加 `nodeType` 并透传；`resolveDirectorInput` 新增 `resolveAssembleInput`/`resolveFinalizeInput` 按 `(stage, nodeType)` 显式分支，末尾以防御性 `throw` 取代静默兜底；新增 7 个只读查询方法（`loadAllShotSpecs`/`findNodeIds`/`loadRenderedArtifactKey`/`loadAllRenderedArtifactKeys`/`loadFinalExportArtifact`/`loadShotQaFindings`/`resolveLatestArtifactPath`）。
5. **`stage-prompt.ts`**：`StagePromptContext` 加 `nodeType`，ASSEMBLE/FINALIZE 按 `nodeType` 二次路由，未知类型抛错。
6. **`stage-runner.ts`**：确认无需改动（`nodeType` 经 context 结构化透传）。
7. **测试**：`runtime-repository.test.ts` 新增 6 类真实场景（path→content mock storage）、`stage-prompt.test.ts` 新增路由测试、`prompts.test.ts` 改名并加 3 个新 builder smoke 测试。
8. **文档同步**：harness §3.5.2 表两行 ❌→✅、task-breakdown C1.1/D1.3 状态、known-issues 索引、issue-01 顶部 Status。

## 四、实现过程中发现并处理的关键问题

1. **二进制不可当 JSON 读**：`render-mp4`/`final-mp4` 是二进制 MP4，只能取 `artifacts.path` 字符串，**绝不能 `storage.get()` 读本体**。为此新增 `resolveLatestArtifactPath`（仅查 DB path，不读 storage），测试用“未登记 key 抛错”的 mock 反向验证这一不变量。
2. **`final-mp4` 无 nodeId**：`registerFinalArtifact` 写入时 `nodeId` 为 null，故 `loadFinalExportArtifact` 必须按 `(projectId, kind)` 查而非带 nodeId，否则永远查不到。
3. **`DirectorShot` 是 passthrough（仅 `id` 有类型）**：`shot-subtitle` 若访问 `shot.audioBinding.unitId` 会过不了 tsc，改用**强类型 `shotAllocation.audioUnitId`** 关联 `scriptUnit`，更安全也更可靠。
4. **严格 vs 宽松 schema 陷阱**：ASSEMBLE/FINALIZE 的 `shotPlan` 一律用宽松 `directorShotPlanSchema`，避免某镜缺字段导致 `.parse` 崩。
5. **`loadIngestArtifact` 返回 `scriptUnits: unknown`**：收窄为 `ScriptUnit[]`（内部本就已 parse），否则 subtitle 分支 `.find` 过不了类型检查。
6. **rename 影响面**：`buildAssemblePrompt`/`buildFinalizePrompt` 改名仅影响 2 个文件，已同步。
7. **无循环依赖**：`startup-boundary.test.ts` 通过，证实未引入 director↔render 循环依赖。

## 五、验证结果

- **director 测试 54/54 全绿**（14 个测试文件，含我新增的 runtime-repository 6 类场景 + stage-prompt 路由 + 3 个 builder smoke）。
- **`pnpm tsc --noEmit` 全绿**（0 错误）。
- **`eslint`（我改动文件）干净**。

## 六、发现的“环境级”问题（非 issue-01 本身）

处理过程中发现工作区并非干净的单一分支，而是 **6+ 个 issue 的 WIP 混在同一工作树**里，且有**并行会话在实时提交/暂存**：

1. **一度出现的 render 构建阻断**：`render/repository.ts` 引用了尚不存在的 `./thumbnail` 模块（issue-04 半成品）→ 全局 `tsc` 失败。我严守 issue-01 的“禁止改动 render/**”边界未去碰它，先向你如实汇报；后来该阻断被并行会话提交的 issue-04 缩略图基建（`48cd5c5`）自动解决。
2. **`StorageAdapter` 接口被 issue-08 扩展**（`tempDir`/`readLocalFile`/`removeTempDir`，你手动给我的测试 mock 补了 stub）——这是 issue-08 的涟漪泄漏进 issue-01 的测试文件。
3. **共享文件交叉编辑**：`known-issues.md`、`harness-task-breakdown.md` 等被多个 issue 同时改。
4. **两个 director 测试文件（`session-store.test.ts`、`tools/write-artifact.test.ts`）纯属 issue-08**（只加了 storage stub），并非我的改动。

## 七、提交处理（精准隔离）

- 暂存时发现并行 issue-03 会话把它们的文件塞进了**共享 index**，且 index 正被并行改动 → 直接 `git commit` 会误带。
- 改用 `git commit --pathspec-from-file`（`--only` 语义），**只按我列出的 14 条路径提交工作区内容，忽略其它已暂存文件**，规避并发竞态。
- 按你“不拆分、正常提交”的指示：把混入测试的 issue-08 storage stub、`known-issues.md` 里的 issue-02/07/08 行状态一并提交；只排除**纯 issue-08 文件**。
- 结果：**Commit `11435c5` — `fix(director): complete ASSEMBLE/FINALIZE directorInput contract`，正好 14 个文件**（10 director 源/测试 + 4 docs），`git show --stat` 已核实无多余文件。未 push。

## 八、当前状态与遗留

| 项 | 状态 |
|---|---|
| issue-01 | ✅ 已提交 `11435c5`，实现 + 测试 + 文档齐全 |
| 工作区 `tsc` | ✅ 全绿（render 阻断已被 `48cd5c5` 解决） |
| 并行 issue | 02/03/04/07 均已由其它会话提交（`c50637e`/`fe7c1b2`/`48cd5c5`/`29bba21`） |
| 遗留未提交 | issue-08 WIP（`storage/*`、`export-service*`、两个 director 测试 stub）+ 自动生成的 `.qoder` wiki 变更——按你要求原样保留 |

**一个诚实的历史整洁性提示**：由于 issue-08 的 `StorageAdapter` 扩展仍未提交，单独 checkout 到 `11435c5` 跑 `tsc` 会因测试里的 storage stub 引用未提交接口成员而报一个 test-only 错误——这正是“不拆分”的预期结果；**实时工作区已一致且全绿**，待 issue-08 的 `src/lib/storage/types.ts` 提交后历史即自洽。

> 注：你刚在 `known-issues.md`/`harness-task-breakdown.md` 里把 issue-07/08 标为已完成——这些改动在工作区、未被我触碰，会随后续 issue-08 提交一起进入历史。

需要我接着收尾 issue-08（提交其 `StorageAdapter` 边界改动，让历史完全自洽）吗？

# issue-02 处理总结

## 一、任务范围
深度分析并解决 `docs/issues/issue-02-stepfun-key-validation-strategy.md`（P0，Track H Wave 1），在 `main` 分支进行。核心问题：设置页「保存有效 Key」的成功路径从未被验证通过——提交一个**确认有效**的 StepFun Key 仍被判为"校验失败"。

## 二、根因确认
`validateKey()`（`src/features/ai/stepfun-adapter.ts`）用 OpenAI SDK 的 `models.list()` 探测 Key。StepFun 的 OpenAI 兼容端点对部分有效 Key 的该接口返回失败（端点未实现/权限不含查模型列表），导致**即使 Key 完全可用于 `chat.completions`**，校验也会先失败；且原实现 `catch { return false }` 吞掉了错误，毫无排查线索。

## 三、完成的改动（commit `c50637e`）

**1. 核心修复 — `src/features/ai/stepfun-adapter.ts`**
- 把探测从 `models.list()` 改为与 `StepfunAdapter.chat()` **完全一致**的最小 `chat.completions.create()`：`model` 沿用 `STEPFUN_CHAT_MODEL ?? 'step-3.5-flash'`、`messages:[{role:'user',content:'ping'}]`、`max_tokens:1`（把校验 token 成本降到最低）。
- 超时/重试用 **per-request 第二参** `{ timeout: 15_000, maxRetries: 0 }`，**不动共享 `createClient()`**，对生产 `chat()` 零回归。
- `catch` 保留**不泄露 Key** 的服务端 `console.error`：用 `error instanceof OpenAI.APIError` 类型收窄取 `status`（严格模式无 `any`），返回类型仍为 `boolean`，`settings/route.ts` 契约不变。

**2. 测试 — `src/features/ai/stepfun-adapter.test.ts`**
- 新增 `describe('validateKey')` 4 个用例：成功→true、失败→false 且日志不含 Key、默认 model 探测参数正确、尊重 `STEPFUN_CHAT_MODEL`。
- 为支持 `instanceof OpenAI.APIError`，给 mock 补了静态 `APIError` 类。**共 9 tests 全绿**。

**3. 文档 — `issue-02-*.md`**：状态→已完成，勾选全部 4 项完成条件。

## 四、验证结果
- `pnpm test`：9/9 通过；`pnpm lint`：退出 0。
- **真实 Key 全链路**（`pnpm dev` + POST `/api/settings`）：有效 Key→`200 {ok:true,valid:true}`；无效 Key→`422 {ok:false,valid:false}`；响应体不含 Key。HMR 已加载新代码，证明修复生效（修复前有效 Key 会得到 422）。

## 五、规划阶段做法
按 UltraPlan 多智能体流程，并行派 3 个视角（简洁性/健壮性/最小改动）研究并各出方案，再交叉评审综合。关键取舍：**否决**了健壮性方案里"给共享 `createClient()` 加全局 timeout"（会改 `chat()` 行为、超范围、有回归风险），改为仅作用于校验请求的 per-request 选项。

## 六、处理过程中发现的问题

1. **测试 mock 会让 `instanceof OpenAI.APIError` 抛错**：测试全局 mock 了 `openai`，`MockOpenAI` 没有静态 `APIError` → `error instanceof undefined` 会在 catch 里再抛异常。提前发现并给 mock 补了 `APIError`，否则失败用例会 reject 而非返回 false。

2. **真实网络校验无法进单元测试**：测试文件全局 mock `openai`，同文件发不了真请求；且 vitest 默认不加载 `.env`，而 `vitest.config.ts` 不在允许改动范围。故完成条件 #1/#2/#3 改用**运行期手动验证**覆盖，不提交会引入 CI 网络抖动的网络测试。

3. **工作树被并行工作严重污染**：`pnpm tsc --noEmit` 报出 6 个错误，全部在 `director/prompts/*`、`stage-prompt.ts` —— 是**未提交的 issue-01 在途改动**（builder 重命名，消费方未更新），与 issue-02 无关。我的两个 scope 文件零错误，且严格遵守 issue 边界**未触碰** director 文件。

4. **多智能体并发 + index 已被大量暂存**：提交时工作树同时在途 issue-01/03/04/06/08，且一大批（含 `known-issues.md`）已被暂存进 index。直接 `git commit` 会裹进混合大提交。

## 七、提交策略（应对并发污染）
- 用 **pathspec 提交** `git commit -- <三个文件>`，只记录这三个文件的工作树内容，不触碰其余任何暂存/未暂存改动；提交前逐一核对三份 diff 均为纯 issue-02。
- **刻意排除 `docs/issues/known-issues.md`**：它已被暂存且混入了 issue-01/07/08 的状态更新，属别的 issue 的改动，不应算进 issue-02。因此 issue-02 在总索引表的状态行未随本提交落地（如需可单独补一个 `docs` 提交）。
- 提交后其他会话在我之上叠加了 `48cd5c5 feat(render)`（issue-04）、`11435c5 fix(director)`（issue-01）；已确认我的 `c50637e` 完整保留在历史中、内容未受影响。
- 未 push（遵循未授权不推远程约定）。

## 八、当前状态
issue-02 代码与文档已提交（`c50637e`，3 files，+86/−9）。唯一遗留：`known-issues.md` 总索引表中 issue-02 的"已完成"状态行仍在未提交的混合文件里——是否单独补提，等你决定。

# issue-03（Canvas Inspector 数据真实性）处理总结

## 1. 问题背景

`docs/issues/issue-03-canvas-inspector-data-truthfulness.md` 指出右侧 Inspector 面板（`src/app/(app)/canvas/canvas-inspector.tsx`）有四处硬编码占位，违反 AGENTS.md「UI 字段真实性门禁」：

| 字段 | 原问题 |
|---|---|
| 内容哈希 | 字面量 `"待生成"`，永不变化 |
| 分镜合同 chips | 固定文件名 `shot-plan.json`/`script-units.json`，`ArtifactChip` 不支持 `href`/`onClick`，点击无反应 |
| 生成进度 | 三态硬编码：`success→100`、`running→62`、其余`→0` |
| 「查看代码」按钮 | 无 `onClick` |

## 2. Plan 阶段做的深度调研

在制定计划前，逐条核实了当前真实代码（而非只信 issue 文档的行号）：

- 确认 `canvas_nodes.content_hash` 列存在（`schema.ts`），但**全仓库搜索确认从未被任何生产代码写入过**（只有 `status.test.ts` 为测试直接插库）——所以按 issue 要求，只做"诚实读出真实值（多数会是 null）"，不新增写入逻辑。
- 确认 `artifacts` 表按 `projectId + nodeId + kind` 天然对应"某个 Director 节点自己产出的那份产物"（`stage-runner.ts` 的 `outputArtifact()`）。issue 文档给出的 `getNodeArtifacts(projectId, nodeId)` 签名也明确只按 `projectId+nodeId` 过滤——据此排除了一个我一开始考虑过的更复杂方案（按 `laneKey` 跨节点关联查询 shot-plan+script-units 的"合同"语义），避免引入未被文档要求的隐式猜测逻辑。
- 排查了一个 Glob 工具的误报：`Glob` 一度返回 `src/app/canvas/**`（旧的无路由组路径）下 20 个文件，但用 `Get-ChildItem`/`git ls-files` 直接核实磁盘和 git 索引后确认这些文件根本不存在——是工具缓存问题，不是真实冲突，避免了误判修复范围。
- 核实了项目现有测试惯例（全仓库无任何 `*.test.tsx`），据此决定不给 `canvas-inspector.tsx` 补组件测试，保持与现有约定一致。

计划经用户确认后进入 Agent 模式实施。

## 3. 具体实施内容（6 个文件）

1. **`src/features/canvas/queries.ts`**：
   - `CanvasGraphNode` 接口新增 `contentHash: string | null` 和 `artifacts: CanvasNodeArtifact[]`。
   - `getCanvasGraph` 的 `select` 增加 `contentHash` 列，并为每个节点附加真实 `artifacts`。
   - 新增导出 `getNodeArtifacts(projectId, nodeId)`：按 `projectId+nodeId` 查 `artifacts` 表，排除内部 `pi-session` 会话指针，按最新优先排序，`filename` 取 `path` 的真实 basename。

2. **`src/features/canvas/queries.test.ts`**：新增测试覆盖 `getNodeArtifacts`（跨节点/跨项目隔离、排除 `pi-session`、排序正确）与 `getCanvasGraph` 新字段（`contentHash` 未写入为 `null`/写入后为真值，`artifacts` 正确分组）。

3. **`src/components/ui/artifact-chip.tsx`**：新增可选 `href`，有值渲染为 `<a target="_blank">`，无值保持原 `<div>`，向后兼容。（按计划只加 `href`，不加 `onClick`，因为本 issue 内所有交互都是"打开真实产物 URL"，避免加一个当时无人调用的空 prop。）

4. **`src/components/ui/artifact-chip.demo.tsx`**：补充 `href` 用法示例。

5. **`src/app/(app)/canvas/canvas-inspector.tsx`**：四处全部改为真实数据——
   - 内容哈希：`node.contentHash?.slice(0,12) ?? '待生成'`；
   - 关联产物（原"分镜合同 shot-plan"改名为更准确的"关联产物"）：遍历真实 `node.artifacts`，渲染可下载 `ArtifactChip`（`href` 指向已有的 `/api/artifacts/[id]` 路由），空时显式展示"暂无产物"；用一张 `kind→友好文件名` 的展示层映射表避免直接暴露含 64 位哈希的真实存储 key；
   - 生成进度：去掉恒定 `62%`，`success`→真实 100%，`running`→不定态 spinner（复用已有的 `LoaderCircle animate-spin` 视觉语言），其余状态不再渲染假进度条；
   - 查看代码：包 `next/link`，跳转真实的 `/canvas/shot/[id]?projectId=...`。

6. **`src/app/(app)/canvas/canvas-action-api.test.ts`**：因 `CanvasGraphNode` 新增了两个必填字段，这个文件里构造测试节点的 helper 需要同步补上 `contentHash: null, artifacts: []`——属于类型改动的机械连带修复，不是范围外功能。

## 4. 施工过程中发现的问题

**最主要的发现：这个工作目录当时正被另一个并行会话/进程实时编辑，而且是共享工作区（不是 git worktree 隔离），不是我预期的"干净仓库"。** 具体证据链：

- 我在验证阶段跑 `pnpm tsc --noEmit` 时，同一条命令连续几次给出**不一致**的报错列表（第一次几十条错误涉及 `thumbnail.ts`/`flow-elements.test.ts`/`canvas-action-api.test.ts` 等；清缓存后重跑又只剩 1-2 条 `StorageAdapter` 相关错误；再等一会儿又变成 0 条），且这些文件我自己完全没碰过。
- 用 `git stash` 把我自己的 issue-03 改动隔离出去后单独跑 `tsc`，确认基线里那些噪声错误与我的改动无关，属于别人未完工的 WIP（`director/prompts`、`stepfun-adapter`、`storage/types`、`render/export-service`、`thumbnail.ts` 等，对应 issue-01/02/04/08）。
- `git stash pop` 恢复我的改动后，发现索引里出现了我从没 `add` 过的文件被标记为"已暂存"（`canvas-view.tsx`、`flow-elements.tsx`、`flow-elements.test.ts`）——这只能是另一个进程在几秒内自己执行了 `git add`。
- 之后确实在 `git log` 里看到了新提交 `29bba21 fix(canvas): add truthful lane status summaries` 和 `c3e6164 docs(harness): close issue-07`，证实另一个会话正在同时完成 issue-07 并已提交。

**这个发现直接影响了我最后"只提交 issue-03 代码"这一步的处理方式**：不能用普通的 `git add -A && git commit`（会把别人暂存区里未完工的东西一起打包提交），改用 `git commit -F <msg文件> -- <6个具体文件路径>`，让 git 只提交这 6 个指定路径，完全不触碰索引里其它路径的暂存/未暂存状态——事后用 `git show --stat` 和 `git status` 核实过，确认没有误伤别人的并行工作。

其余较小的发现/决策：
- `canvas_nodes.contentHash` 列存在但从未被写入——这是文档已知且明确排除在本 issue 范围外的问题（属于 F5 定向重渲染缓存判断的范围）。
- artifact 真实存储 key 含 64 位 SHA-256（如 `director/proj/node/shot-spec-<64位hash>.json`），直接展示会撑爆 chip 布局，因此在展示层（不是数据层）加了 `kind→友好文件名` 映射，真实下载链接仍指向真实产物，不算编造数据。
- PowerShell 不支持 bash 的 heredoc（`<<'EOF'`）语法，第一次提交命令失败，改用写临时文件 + `git commit -F` 解决，提交后已删除临时文件。

## 5. 验证结果

- `pnpm lint` — 通过
- `pnpm tsc --noEmit` — 通过（排除并行 WIP 噪声后，我改动本身产生的唯一连带问题 `canvas-action-api.test.ts` 已修复）
- `pnpm test` — 60 个测试文件、208 个测试全部通过
- `pnpm build` — 构建成功

## 6. 明确排除的范围（对齐 issue 禁止改动清单）

- 未在 `fan-out.ts`/`status.ts` 新增内容哈希计算/写入逻辑
- 未改 `src/features/director/**`
- 未改 `collapsible-panel.tsx` 折叠/抽屉动效壳层
- 未引入跨节点/跨 laneKey 的产物关联猜测查询
- 未更新 `docs/issues/known-issues.md` 的状态表（当时该文件正被并行会话修改中，为避免冲突未动，你可以之后手动把 issue-03 那一行状态改为已完成）

## 7. 最终交付

已提交到 `main` 分支，commit `fe7c1b2`：`fix(canvas): show real inspector data instead of placeholders (issue-03)`，仅含上述 6 个文件、262 insertions / 27 deletions。

# issue-04 处理总结

## 背景与目标

issue-04 要求新增 `src/features/render/thumbnail.ts` 作为分镜静态帧缩略图的共享基础设施，服务于两个消费方（issue-05 分镜渲染器页面的 8 格缩略图轨道、issue-06 导出页 Final QA 的三点复查），本身不做任何 UI 接线。

## 处理过程

1. **先做了现状调研**，没有直接照抄 issue 文档里的伪代码。用 context-gatherer 子代理 + 直接读文件相结合的方式，通读了：
   - `frame-capture.ts`（CDP 截帧 session）
   - `renderer.ts`（完整渲染主链路，重点看它的 cache 命中短路逻辑、renderHash 派生方式、失败补偿模式）
   - `frame-sequence.ts`（多帧批量截取的 worker-pool 模式，作为"单 session 多帧串行"的参照）
   - `repository.ts`（现有 Drizzle 查询/校验模式）
   - `artifacts/service.ts`、`storage/*`、既有测试文件（mock 注入风格 vs 真实 Playwright 集成测试风格）

2. **发现并纠正了 issue 文档里的一处设计问题**：文档原始设计里 `RenderRepository` 要多出一个 `loadCompletedThumbnailContext` 方法用到 `thumbnailOutputPath` 这个 key 构造函数，而这个函数按文档描述应该定义在 `thumbnail.ts` 里——这样会导致 `repository.ts` → `thumbnail.ts` → `repository.ts` 的循环依赖（`thumbnail.ts` 需要 `RenderRepository` 作为默认依赖注入实现，`repository.ts` 又需要 `thumbnail.ts` 的 key 构造函数）。处理方式：把 `FRAME_THUMBNAIL_KIND`、`thumbnailOutputPath()`、以及所有 Thumbnail 相关类型都下沉到 `types.ts`（这是本来就被两边共同依赖的中立模块），`thumbnail.ts` 和 `repository.ts` 都从 `types.ts` 单向导入，彻底避免了循环引用。

3. **实现了核心模块**：
   - `fractionToFrame(fraction, durationInFrames)`：`[0,1]` 百分比转帧号，边界处理保证 0%→首帧、100%→末帧
   - `thumbnailSourceKey(html, frames)`：sha256 缓存键，镜像 `renderer.ts` 的 `renderHash` 语义，HTML 或帧规格任一变化都会产生不同 key
   - `captureThumbnails()`：先查缓存（`findThumbnail` + `storage.exists()` 双重确认，处理"数据库有记录但文件被删"的情况）→ 对未命中的帧去重、排序 → 只开一次 `FrameCaptureSession`、按帧号升序串行截取 → 每帧独立写盘 + 登记 artifact，登记失败立即删除已写 PNG（补偿语义与 `renderer.ts` 一致）→ session 用 `finally` 保证必然关闭
   - `RenderRepository` 新增三个方法，复用了已有的 `getRenderNode`/`parseRenderSpec`/`requireFabricateArtifact` 私有helper，没有重复造轮子
   - `artifacts/service.ts` 补了一行 `frame-thumbnail → image/png` 映射

4. **测试**：写了 13 个 mock 依赖注入单测（覆盖缓存命中/未命中、单 session 批量截取顺序、去重、失败补偿、缓存文件丢失后重新截图等边界）+ 3 个真实 Playwright 集成测试（用真实 SQLite + `LocalFsStorage` + 现有 HTML fixture，断言真实 PNG 字节和跨调用缓存复用）。

5. **验证**：`pnpm lint`、`pnpm tsc --noEmit`（确认新增文件本身零错误）、`pnpm build`、`pnpm test`（208/208 通过，含新增 16 个测试）全部跑通。中途遇到一次 `startup-boundary.test.ts` 超时，单独重跑和全量重跑都通过，判断为环境瞬时抖动而非真实回归。

6. **提交时的隔离处理**：工作区里当时并行存在其他 Agent/会话对 issue-01/02/03/08 的大量未提交改动（`stepfun-adapter.ts`、`runtime-repository.ts`、`export-service.ts`、`canvas-inspector.tsx` 等三十多个文件）。commit 前逐个 `git diff` 核对了我改动的 7 个文件（`thumbnail.ts` 及两个测试文件、`repository.ts`、`types.ts`、`index.ts`、`artifacts/service.ts`），确认每处 diff 都是我自己写的内容,没有被其他并行工作污染，再用精确文件列表 `git add` + commit，没有触碰任何其他 issue 的改动。最终提交 `48cd5c5`。

## 交付范围核对

严格按 issue-04 的"允许改动范围"执行，没有越界：
- ✅ 新增 `thumbnail.ts` + 测试
- ✅ `repository.ts` 只加了三个新方法，没改现有渲染/导出查询逻辑
- ✅ `artifacts/service.ts` 只加了一行映射
- ❌ 没有碰 `render-shot` 状态机、全帧 sequence、ffmpeg 参数
- ❌ 没有在 `renderer.ts` 主链路里插入自动预生成逻辑
- ❌ 没有做 issue-05/06 的任何 UI/API 接线

## 遗留问题 / 后续需要注意的点

1. **circular import 风险点已解决但值得记录**：如果后续有人给 `thumbnail.ts` 或 `repository.ts` 加新的共享类型/常量，要留意别把它们放回各自模块导致重新出现循环依赖，`types.ts` 是目前设计上的中立层。

2. **工作区里存在大量未提交的并行改动**（issue-01/02/03/08 相关），这些改动本身没有验证过是否完整、是否通过测试——我没有去跑它们的测试或做评审，因为不在本次任务范围内。特别是 `src/lib/storage/types.ts` 给 `StorageAdapter` 新增了 `tempDir`/`readLocalFile`/`removeTempDir` 三个方法，这导致目前 `pnpm tsc --noEmit` 在多个未提交的测试文件（`renderer.test.ts`、`cache.test.ts`、`export-service.test.ts`、`runtime-repository.test.ts` 等）里报类型错误——这些错误不是我引入的,但如果这些文件在其他会话里还没修完就被提交,会导致 `pnpm tsc --noEmit` 不过,不符合 Definition of Done 第 2 条。建议下一步谁去收尾 issue-08 时,顺带把这批测试 mock 补全 `tempDir`/`readLocalFile`/`removeTempDir` 三个方法。

3. **issue-05/issue-06 现在可以开工了**，因为它们依赖的基础设施（issue-04）已经落地并测试通过。issue-06 还需要注意与 issue-08 都会改 `export-service.ts`，按 known-issues.md 里的建议，issue-08 应该先合并。

4. 我没有主动去检查或修复 issue-01/02/03/08 的完成度，如果需要确认整体 Wave 2 的完成情况，需要另外提出。

# issue-07 完整处理复盘

issue-07 已完成根因修复、测试、文档闭环和真实浏览器验收。实现没有新增 API、数据库字段、网络请求或依赖，而是直接从画布已有的 `CanvasView.nodes` 派生真实通道摘要。

对应提交：

- `29bba21 fix(canvas): add truthful lane status summaries`
- `c3e6164 docs(harness): close issue-07`

两个提交都已位于 `main` 历史中。当前仓库 `main`、`origin/main` 均已推进到 `4d3b0e6`，issue-07 提交仍是其祖先提交；当前工作区干净。

## 一、问题根因

原有画布已经拥有每条分镜通道的真实节点数据，包括：

- `laneKey`
- 节点类型
- 节点运行状态
- `shot-script.data.sourceUnit.text`

但左上角通道面板只派生了 `laneKey[]`，没有把这些真实数据转换成用户可读的摘要。

这导致：

- 用户只能看到通道名称，看不到五个子节点的运行状态。
- 通道节点折叠后，用户缺乏判断当前执行进度的信息。
- 如果直接在 UI 中补固定状态文案，会违反项目的“UI 字段真实性门禁”。
- 数据库返回顺序不保证与“脚本→代码→音效→字幕→验收”的视觉顺序一致。
- 不完整通道如果自动补齐五个状态，会给用户制造不存在的数据。

因此采用了纯派生视图模型：直接使用页面已经拿到的 `nodes`，集中完成过滤、排序、状态映射和脚本文本提取。

## 二、完成的代码改动

### 1. 建立通道摘要视图模型

在 [flow-elements.tsx](</D:/projects/Dev-Tools/CodeVideoCanvas/src/app/(app)/canvas/flow-elements.tsx:47>) 中增加：

- `LaneSummaryNode`
- `LaneSummary`
- `buildLaneSummaries(nodes)`
- `getNodeStatusPresentation(...)`
- `getLaneNodeLabel(...)`
- `LaneSummaryDetails`

`buildLaneSummaries()` 现在负责：

- 忽略没有 `laneKey` 的全局节点。
- 只聚合五类分镜节点：
  - `shot-script`
  - `shot-codegen`
  - `shot-sfx`
  - `shot-subtitle`
  - `shot-qa`
- 通道按 `laneKey` 稳定排序。
- 通道内部固定按以下角色排序：
  - 脚本
  - 代码
  - 音效
  - 字幕
  - 验收
- 原样保留节点真实状态，不根据角色或位置猜测状态。
- 通过实际节点数量计算 `isComplete`。
- 不完整通道只保留实际存在的节点，不补造缺失节点。

### 2. 统一状态展示映射

React Flow 节点和通道摘要现在共用同一套状态展示定义：

| 真实状态 | StatusPill 类型 | 中文文案 |
|---|---|---|
| `idle` | `pending` | 空闲 |
| `pending` | `pending` | 待执行 |
| `running` | `generating` | 执行中 |
| `success` | `rendered` | 已完成 |
| `failed` | `failed` | 失败 |
| `stale` | `cached` | 需更新 |

通道摘要使用明确的“角色 + 状态”文案，例如：

- `脚本 · 已完成`
- `代码 · 执行中`
- `音效 · 空闲`
- `字幕 · 空闲`
- `验收 · 空闲`

状态不再只依靠颜色或徽章位置传达，满足可访问性和真实性要求。

### 3. 提取真实脚本文本摘要

脚本摘要来自真实字段：

```text
shot-script.data.sourceUnit.text
```

处理规则：

- 字段必须确实为字符串。
- 折叠连续空白。
- 去除首尾空白。
- 按 Unicode 字符截取前 48 个字符。
- 字段缺失、类型错误或内容为空时，不展示占位摘要。
- 不使用“暂无内容”等可能让用户误认为来源真实的伪数据。

### 4. 渲染展开态通道摘要

在 [canvas-view.tsx](</D:/projects/Dev-Tools/CodeVideoCanvas/src/app/(app)/canvas/canvas-view.tsx:41>) 中：

- 原来的 `laneKeys: string[]` 改为：

```ts
useMemo(() => buildLaneSummaries(nodes), [nodes])
```

- `LanePanel` 改为直接接收 `LaneSummary[]`。
- 通道数量直接来自摘要数组。
- 展开态显示：
  - 真实脚本文本摘要
  - 实际存在节点的状态徽章
  - 不完整数据提示
- 折叠态隐藏摘要。
- 画布原有的折叠行为保持不变：
  - 折叠后仅保留 `shot-script` 代表节点。
  - 展开后恢复通道全部节点。
- 点击折叠/展开只更新客户端本地 React state。
- 没有增加 `fetch`、`router.refresh()` 或服务调用。

### 5. 显式处理不完整通道

当某条通道没有完整五节点时，会额外显示：

```text
数据不完整 n/5
```

例如只有脚本和代码节点时：

```text
数据不完整 2/5
```

同时只显示这两个真实节点的状态，不会给音效、字幕、验收生成虚假状态。

### 6. 修正 disclosure 可访问性

折叠按钮从不准确的 `aria-pressed` 改为：

```tsx
aria-expanded={!collapsed}
```

键盘可通过 Enter 操作，展开和折叠状态与 ARIA 值保持一致。

### 7. 动效和布局

摘要进入/离场使用项目已有：

- `motion/react`
- `AnimatePresence`
- `fadeInUp`
- 全局 `prefers-reduced-motion` 配置

没有：

- 新增硬编码动画时长
- 新增贝塞尔参数
- 编写 CSS animation
- 把 UI motion 引入视频 shot 渲染链路

面板仍保持现有 `w-56`，状态徽章使用 `flex-wrap`，没有引入新的视觉原语或硬编码颜色。

## 三、测试实施

新增 [flow-elements.test.ts](</D:/projects/Dev-Tools/CodeVideoCanvas/src/app/(app)/canvas/flow-elements.test.ts:7>)，共 5 个测试。

覆盖内容包括：

1. 混合全局节点、多通道节点和乱序输入。
2. 只聚合带 `laneKey` 的五类分镜节点。
3. 通道按 `laneKey` 排序。
4. 节点固定按五角色顺序输出。
5. 保留六种真实节点状态。
6. 中文和 Unicode 文本按字符截取，不按 UTF-16 code unit 错误截断。
7. 脚本文本空白折叠。
8. 字段缺失或类型错误时不生成摘要。
9. 不完整通道不补造节点状态。
10. 完整通道不显示“数据不完整”。
11. 状态徽章包含明确的角色与中文状态。
12. 不完整数量使用实际节点数。

测试严格按 TDD 执行：

- 第一轮 RED：`buildLaneSummaries` 尚不存在，3 个测试失败。
- 第二轮 RED：摘要数据模型完成，但 `LaneSummaryDetails` 尚不存在，2 个渲染测试失败。
- 完成实现后：新增 5 个测试全部通过。

## 四、文档闭环

已更新：

- [issue-07-canvas-lane-panel-summary.md](</D:/projects/Dev-Tools/CodeVideoCanvas/docs/issues/issue-07-canvas-lane-panel-summary.md:1>)
  - 状态改为已完成
  - 完成条件全部勾选
  - 记录测试和浏览器验收证据

- [known-issues.md](</D:/projects/Dev-Tools/CodeVideoCanvas/docs/issues/known-issues.md:60>)
  - issue-07 索引状态改为已完成
  - 增加 2026-07-24 完成记录

- [2026-07-23-harness-task-breakdown.md](</D:/projects/Dev-Tools/CodeVideoCanvas/docs/specs/2026-07-23-harness-task-breakdown.md:1706>)
  - Track H 中 issue-07 标记为已完成
  - 关联代码提交 `29bba21`

## 五、自动化验证结果

issue-07 独立提交快照验证结果：

- 新增测试：`5/5` 通过
- 当时全量测试：`58 files / 168 tests` 通过
- `pnpm lint`：通过
- `pnpm tsc --noEmit`：通过
- `pnpm build`：通过
- UTF-8/U+FFFD 扫描：未发现 `�`
- `git diff --cached --check`：通过

后续其他 issue 合入后的最新主分支验证曾达到：

- `60 files / 208 tests` 全部通过
- lint 通过
- TypeScript 通过
- Next.js 生产构建通过

## 六、真实浏览器验收

由于内置应用浏览器当时没有可用实例，改用 Playwright CLI 对干净生产构建进行 Chromium 验收。

使用的真实项目中，`S001` 通道拥有五个真实节点，状态为：

```text
idle, failed, idle, idle, idle
```

页面实际显示：

- `脚本 · 空闲`
- `代码 · 失败`
- `音效 · 空闲`
- `字幕 · 空闲`
- `验收 · 空闲`

验收结果：

- 初始展开态可见真实脚本文本。
- 五个状态徽章与页面节点投影一致。
- 鼠标点击折叠后：
  - 摘要消失
  - 四个子节点隐藏
  - 只保留脚本代表节点
  - 显示原有“已折叠 · 5 节点”
- 键盘 Enter 可以重新展开。
- 折叠和展开前后请求数保持不变，没有产生额外网络请求。
- 900×700 窄窗口下没有面板溢出。
- `prefers-reduced-motion` 模拟生效。
- 长文本通过截断和换行保持面板稳定。

浏览器控制台唯一异常是已有的 `/favicon.ico` 404，与 issue-07 无关。

## 七、实施过程中发现的问题

### 1. 工作区存在大量并行修改

实施期间 AI、Director、Inspector、Storage、Repo Wiki 等其他任务同时在工作区施工。

风险包括：

- 误把其他任务修改提交到 issue-07。
- 公共文档存在其他任务尚未提交的编辑。
- `HEAD` 在验证期间被其他提交继续推进。

处理方式：

- 所有暂存都使用精确文件路径。
- 对共享文档只暂存 issue-07 对应 hunk。
- 每次提交前检查 `git diff --cached --name-only`。
- 没有撤销、覆盖或重新格式化其他任务的改动。
- issue-07 代码与文档拆成两个责任边界明确的提交。

### 2. 最初的全量测试基线存在范围外失败

计划制定时，全量测试是 `166/167` 通过，唯一失败为：

```text
buildAssemblePrompt is not a function
```

这是当时未提交的 Director 修改引起的范围外问题，并非 issue-07 导致。

处理原则：

- 没有修改 Director 文件。
- 没有为了让 issue-07 变绿而越界修复。
- 先验证 issue-07 定向测试和独立提交快照。
- 后续 Director 修复完成后，全量测试恢复通过。

### 3. 已有开发服务器不能作为可靠验收证据

端口 3000 上已有的开发服务器出现 HMR 状态异常，只渲染应用壳，不能证明 issue-07 页面行为正确。

因此没有把这个结果当作验收通过，而是：

- 使用干净代码快照构建 production。
- 在独立端口启动生产服务。
- 复用真实本地数据。
- 使用 Chromium 重新完成交互和网络请求验收。

### 4. Windows 临时 worktree 清理异常

独立验证使用了临时 worktree。`git worktree remove` 在 Windows 上完成了 Git 元数据清理，但残留了验证目录。

处理时：

- 先核对目录的绝对路径。
- 确认目标是独立 issue-07 临时目录。
- 仅删除该精确目录。
- 最终确认临时目录不存在。
- `git worktree list` 只剩主仓库。

### 5. issue-07 名称与实际展示状态容易产生歧义

任务名是“折叠面板信息摘要”，但产品要求是：

- 通道面板本身常驻。
- 摘要在通道展开时展示。
- 折叠后摘要隐藏，只保留通道代表节点和折叠计数。

实现严格遵循计划中对“展开态”的定义，没有在折叠态继续塞入五个状态徽章。

## 八、明确未修改的范围

本次没有处理：

- “全部渲染”死按钮
- `fan-out.ts`
- `layout.ts`
- `status.ts`
- Director 输入组装
- Render 或 Storage
- 数据库 schema
- API route
- 网络请求
- Pencil 设计源
- 新依赖
- 节点物化规则

issue-07 的核心边界始终是：把页面已经拥有的真实节点数据，正确、稳定、可访问地展示给用户。

## 最终结论

issue-07 已从“只有通道名称、缺少真实状态”修复为：

- 每条通道展示五角色真实状态。
- 展示真实脚本文本摘要。
- 状态顺序稳定，不依赖数据库返回顺序。
- 不完整数据明确报警且不伪造状态。
- 折叠/展开不产生网络请求。
- 鼠标、键盘、窄窗口和 reduced-motion 均完成验收。
- 代码、测试、文档分别提交并进入 `main`。
- 未混入或破坏同期其他任务修改。

# issue-08 处理总结

## 一、任务目标

将 `src/features/render/export-service.ts` 中直接使用的裸 `node:fs/promises` 调用，收口进 `StorageAdapter` 抽象，消除违反 AGENTS.md「二进制产物走 StorageAdapter，业务代码不散落裸 fs」边界的历史技术债；同时保证 `exportProject()` 外部行为与产物字节完全不变。

## 二、规划阶段（UltraPlan 多智能体工作流）

1. **3 个并行规划子智能体**从三种视角出发（简洁可维护 / 性能可扩展 / 最小改动低风险）各自产出完整方案。
2. **关键决策锁定**：
   - **D1** 临时目录落位 `os.tmpdir()`（零行为漂移，不污染 `.data/artifacts`）——否决了「放 storage root」方案。
   - **D2** 三个新方法设为**必填**（忠实 issue 契约）——否决了「optional 以规避测试改动」。
   - **D3** 移除 `ExportDependencies.tempRoot` 死字段（唯一消费者是测试）。
   - **D4** 不新建共享 mock 工厂（6 处构造异构、跨域，就地补桩更小更稳）。
   - **D5** `readLocalFile` 流式化/大文件内存优化明确划出范围。

## 三、实施内容（最终 commit `19fe79b`，10 文件 +123/−16）

**源码（3）**
- `types.ts`：`StorageAdapter` 新增 `tempDir` / `readLocalFile` / `removeTempDir`。
- `local-fs.ts`：`LocalFsStorage` 实现三方法（`mkdtemp(os.tmpdir())` / `readFile` / `rm recursive+force`）。
- `export-service.ts`：删除 `node:fs/promises`、`os` 导入与死的 `tempRoot`，改走适配器；其余逻辑（incomplete 短路、排序、sha256、outputKey 格式、finally 清理）逐行保持。

**测试（6）**
- `local-fs.test.ts`：4 个新单测（唯一性 / 绝对路径读回 / 递归删除 / 异常路径清理不抛）。
- `export-service.test.ts`：commit 用例注入**功能性** mock + 新增「concat 抛错仍清理」用例。
- `renderer / cache / write-artifact / session-store` 四处 mock 接口一致性补桩。

**文档（1）**：issue-08 状态与 4 项完成条件更新为已完成。

## 四、发现的问题（本次处理最有价值的部分）

1. **「3 处 mock」实为「7 处」**：初稿三份计划都只发现 3 处 `StorageAdapter` 对象字面量 mock。规划期全仓核实增补到 **6 处**（补上 director 域的 `write-artifact` / `runtime-repository` / `session-store`）；实施期 `tsc` 又暴露出**第 7 处**——`runtime-repository.test.ts` 里另有一个 `createStorageFromMap()`，因**早期 grep 结果被截断（capped at 10 matches）**而漏掉。
   - 教训：接口新增**必填**方法会击穿所有对象字面量 mock；`tsconfig include: **/*.ts` 使 `tsc --noEmit` 会检查全部 `.test.ts`。**必须以 `tsc` 为权威兜底，不能只信 grep。**

2. **功能性 mock 陷阱**：`export-service.test.ts` 的 commit 用例里 storage 是全 mock，若 `tempDir`/`readLocalFile` 只给裸 `vi.fn()`，运行期会因 `path.join(undefined,...)` / `createHash.update(undefined)` 崩溃——这两个方法必须注入真实 fs 实现，其余 5 处未被调用只需类型桩。

3. **构建锁误报**：`pnpm build` 首次报「Another next build process is already running」，排查进程后确认是**并发/残留锁**（无 Next 进程、无持久锁文件），重跑即成功——非代码问题。

4. **提交耦合**：`known-issues.md` 与 `runtime-repository.test.ts` 已被 issue-07 的 `29bba21` 先行卷入提交，故本次 commit 只含剩余 10 个 issue-08 文件，未做拆分。

## 五、验收结果

`pnpm tsc --noEmit` ✅ · `pnpm test`（60 文件 / 208 用例）✅ · `pnpm lint` ✅ · `pnpm build` ✅ · `export-service.ts` 全文零 `node:fs/promises` ✅。

未 push（未获授权），本地 `main` 领先 `origin/main` 7 个 commit。

---

需要我继续**推送到远端**，或接着处理 Wave 2 里仍待施工的 **issue-03 / issue-04** 吗？