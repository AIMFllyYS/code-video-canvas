# AI 开发 Harness —— 任务拆解与 Goal 模式执行清单

> Created: 2026-07-23
> Updated: 2026-07-23
> Status: approved（配套 [`2026-07-23-ai-development-harness.md`](./2026-07-23-ai-development-harness.md) 使用）

## 使用说明

**核心机制（务必先读，纠正上一版本的粒度误解）**：Codex 的 `/goal` 是**一次长时间自主运行的会话**，对应**一个 Track**（或人工分割出的一段 Track），不是对应单张任务卡。Codex 拿到 Goal 的 objective 后，自己在会话内部按顺序处理该 Track 下列出的**Task**（即下文每张卡片），自己判断每个 Task 是否完成、逐一勾选状态，全部 Task 完成、objective 达成后才调用 `update_goal(complete)`。详见总纲 §9。

- 本文档是总纲 §9 的具体落地。**每个 Track 对应一次 Goal**；Track 内逐张列出的是**Task 规格**（不是独立的 `/goal` 调用），供 Codex 在该 Goal 会话内部依次执行参照。
- 每个 Track 标题下方给出该 Track 的**Goal 启动提示词**（复制给 Codex 作为 `/goal` 的 objective），随后是该 Track 内按序执行的 Task 列表。
- Task 之间按序号严格顺序执行（有前置依赖）；不同 Track 之间若无交叉依赖，可对每个 Track 分别启动独立的 Goal 会话并行推进。
- **Track 依赖速览**：F（地基）最先；C/D/R/P 可在 F 完成后并行推进；**Track P 必须在 Track U 开始前完成**（U 的每张卡都要求"只 import Track P 组件"）；A 依赖 C/D。
- **Track D 不依赖任何 Pi Skills 机制**：D0.1/D0.2 是把 `docs/video-director/` 的方法论移植为本项目原生 TypeScript 代码（Zod schema + prompt 模板），D1.x 只把 Pi 当作裸的 tool-calling 循环引擎使用。
- 每个 Task 执行前，先确认「前置任务」已全部完成。
- 每个 Track 的全部 Task 完成后，在该 Goal 会话内执行一次 Tier B 里程碑验收（见总纲 §8.2），通过后才调用 `update_goal(complete)`，验收报告追加至 `docs/updates/`。
- 状态列：`☐` 未开始 · `◐` 进行中 · `☑` 完成。执行时请在本文件中就地勾选，保持台账唯一可信。
- 若某 Track 的 Task 数量多、预计单次会话跨度过长，允许人工把该 Track 拆成多个 Goal 顺序启动（如 Track U 拆成"Goal 1：U1.1~U1.4"、"Goal 2：U1.5~U1.8"），拆分方式在该 Track 的 Goal 启动提示词处注明。

---

## Track F — Foundation（地基验证与骨架补齐）

**目的**：验证总纲里标记为"未实测"的架构假设，补齐缺失依赖与字段，避免后续 Track 建立在错误假设上。**必须最先完成，且内部严格顺序执行**（F0.1 的结论直接决定 F0.2~F0.7 怎么写）。

**Goal 启动提示词**（复制给 Codex 作为 `/goal` objective；含开工前自查步骤，适用于不确定本 Track 实际进度的情况）：
```
Goal：完成 Track F（Foundation）的全部 Task（F0.1~F0.7），依据
docs/specs/2026-07-23-harness-task-breakdown.md 的 Track F 章节逐一执行。

第 0 步 — 开工前自查（必须先做，不要假设从零开始）：
- 检查 git status / git log 是否已有与 F0.1~F0.7 相关的未提交或已提交改动
  （如 scripts/spikes/、package.json 的 pi-agent-core/pi-ai/playwright/
  ffmpeg-static 依赖、.env.example、src/lib/db/schema.ts、
  src/features/canvas/types.ts、src/lib/determinism/check.ts 等）
- 对每个 Task（F0.1~F0.7），核对其「完成条件」是否已经满足（读代码，不要只
  看文件是否存在）；本文档中的 ☐/☑ 状态列可能与实际代码进度不一致，以实际
  代码状态为准，若发现文档状态滞后，先修正状态列再继续
- 自查完成后，先向用户简要汇报"实际已完成到哪个 Task、从哪个 Task 继续"，
  再开始正式执行（除非该 Goal 会话被明确要求全自动无需汇报）

执行要求：
- 严格按 F0.1→F0.7 顺序执行（F0.1 的结论决定后续任务卡怎么写，不可跳过或
  并行提前做 F0.2 之后的任务）；已确认完成的 Task 跳过，不重复执行
- 每个 Task 完成后在本文档中把状态由 ☐ 改为 ☑
- 每个 Task 的允许改动范围/禁止改动/完成条件以文档中对应 Task 规格为准
- 全部 Task 完成后运行 pnpm lint && pnpm tsc --noEmit，确认无误后再判定
  本 Goal 完成

完成条件（达成后才可 update_goal(complete)）：
- [ ] F0.1~F0.7 状态已全部为 ☑（且与实际代码状态一致）
- [ ] pnpm lint / pnpm tsc --noEmit 通过
- [ ] F0.1 的验证结论已记录（供 Track D 后续 Goal 参照）
```

### F0.1 — Spike：Pi Agent + StepFun 自定义 Provider 可行性验证

- 状态：☑
- 前置任务：无
- 允许改动范围：
  - 新建 `scripts/spikes/pi-stepfun-probe.ts`（一次性验证脚本，不进生产路径）
  - `package.json`（新增 `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai` 为 devDependency，因为此阶段只是验证，不确定是否采纳）
- 禁止改动：
  - `src/features/director/**`、`src/features/ai/**` 的现有文件（本卡只验证，不重构）
- Task 规格：
  ```
  目标：编写一个一次性验证脚本，确认 @earendil-works/pi-ai 能否将 StepFun
  （OpenAI 兼容端点，环境变量 STEPFUN_API_KEY / STEPFUN_BASE_URL / STEPFUN_CHAT_MODEL）
  注册为自定义 Provider，并通过 @earendil-works/pi-agent-core 的 `Agent`
  发起一次最简单的单轮对话（如"回复 OK"）拿到响应；同时核实
  `JsonlSessionRepo` 的导出与持久会话 API，供 D1.1 组合为项目原生会话工厂。

  前置任务：无

  允许改动范围：
  - scripts/spikes/pi-stepfun-probe.ts（新建）
  - package.json（仅新增两个 devDependency，不改动已有依赖版本）

  禁止改动：
  - src/features/director/**
  - src/features/ai/**

  完成条件：
  - [ ] 脚本可通过 `pnpm tsx scripts/spikes/pi-stepfun-probe.ts` 独立运行
  - [ ] 脚本运行结果（成功或具体失败原因）以结构化方式打印到 stdout
  - [ ] 若失败，打印完整错误堆栈与 pi-ai Provider 配置的确切写法，供后续判断走哪条退回方案
  - [ ] 不将 STEPFUN_API_KEY 原始值打印到 stdout 或写入任何文件
  - [ ] pnpm tsc --noEmit 通过（脚本本身类型正确）

  不在本任务范围内：
  - 不要修改 features/director 或 features/ai 的任何生产代码
  - 不要决定最终架构方案，只输出验证结论
  ```
- 验收后动作：根据脚本结论，人工在总纲 §3.2 补记最终结论（是否走 Pi 原生 Provider，或退回 `LlmAdapter` 转发方案），并据此决定 Track D 的具体写法。

### F0.2 — `.env` 契约核查与修正

- 状态：☑
- 前置任务：F0.1（需要知道最终选用哪个 chat 模型名）
- 允许改动范围：`.env.example`、`docs/specs/2026-07-23-ai-development-harness.md`（仅 §7.3 变量清单表格，不改其他章节）
- 禁止改动：`.env`、`.env.local`（这些文件属于用户本地机密配置，Codex 不应写入或提交）
- Task 规格：
  ```
  目标：核实 StepFun 可用模型列表与当前代码默认值（stepfun-adapter.ts 中的
  step-2-mini、默认 base URL）是否一致，若不一致，更新 .env.example 为可用的
  真实占位变量名与说明注释（不含真实密钥值），并同步更新总纲文档 §7.3 的变量清单表格。

  前置任务：F0.1

  允许改动范围：
  - .env.example
  - docs/specs/2026-07-23-ai-development-harness.md（仅 §7.3 章节内容）

  禁止改动：
  - .env
  - .env.local
  - src/features/ai/stepfun-adapter.ts（本卡只核查契约，不改实现；实现修正是 F0.3）

  完成条件：
  - [ ] .env.example 中每个变量都有中文注释说明用途
  - [ ] 变量名与总纲 §7.3 表格完全一致
  - [ ] 未包含任何真实密钥值
  - [ ] git diff 仅涉及上述两个文件

  不在本任务范围内：
  - 不修改 stepfun-adapter.ts 的默认模型常量（留给 F0.3）
  ```

### F0.3 — 修正 `stepfun-adapter.ts` 默认模型与 base URL

- 状态：☑
- 前置任务：F0.2
- 允许改动范围：`src/features/ai/stepfun-adapter.ts`、`src/features/ai/stepfun-adapter.test.ts`（新建，若不存在）
- 禁止改动：`src/features/ai/types.ts`（接口不变，只改实现内的默认值）
- Task 规格：
  ```
  目标：将 stepfun-adapter.ts 中的默认模型常量与 base URL 修正为 F0.2 核实过的
  真实可用值，默认值来源优先级为环境变量 STEPFUN_CHAT_MODEL/STEPFUN_BASE_URL，
  无环境变量时才使用代码内 fallback 常量。补充一个单元测试验证优先级逻辑
  （不需要真实网络调用，mock OpenAI 客户端构造参数即可）。

  前置任务：F0.2

  允许改动范围：
  - src/features/ai/stepfun-adapter.ts
  - src/features/ai/stepfun-adapter.test.ts

  禁止改动：
  - src/features/ai/types.ts
  - src/lib/db/schema.ts

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 新增测试覆盖"环境变量优先于代码默认值"的行为，且测试不发起真实网络请求
  - [ ] createClient 的 baseURL 参数来源可追踪到 STEPFUN_BASE_URL
  - [ ] 现有 validateKey/StepfunAdapter 对外接口签名不变（不破坏调用方）

  不在本任务范围内：
  - 不引入 Pi Agent 相关代码（那是 Track D 的范围）
  ```

### F0.4 — DB 迁移：`canvas_nodes` 新增状态与哈希字段

- 状态：☑
- 前置任务：无（可与 F0.1~F0.3 并行）
- 允许改动范围：`src/lib/db/schema.ts`、`src/lib/db/migrations/**`（新迁移文件）、`src/lib/db/schema.test.ts`
- 禁止改动：`canvas_nodes` 表已有字段的类型/约束（只做新增列，不改现有列）
- Task 规格：
  ```
  目标：为 canvas_nodes 表新增四个字段：status（text，枚举
  idle|pending|running|success|failed|stale，默认 idle）、contentHash
  （text，nullable）、laneKey（text，nullable）、laneRole（text，nullable）。
  用 drizzle-kit 生成对应迁移文件，并更新 schema.test.ts 覆盖新字段的默认值行为。

  前置任务：无

  允许改动范围：
  - src/lib/db/schema.ts
  - src/lib/db/migrations/**（生成的新迁移文件，不要手改已存在的历史迁移文件）
  - src/lib/db/schema.test.ts

  禁止改动：
  - projects / canvas_edges / jobs / artifacts / settings 表定义
  - canvas_nodes 已有字段（id/projectId/type/stage/position/data/createdAt）

  完成条件：
  - [ ] pnpm db:generate 产出的迁移文件已提交
  - [ ] pnpm tsc --noEmit 通过
  - [ ] 新增测试：插入一行 canvas_nodes 不传 status，读出应为 'idle'
  - [ ] 新增测试：contentHash/laneKey/laneRole 允许为 null
  - [ ] 未修改任何已有测试的断言（不破坏回归）

  不在本任务范围内：
  - 不修改 CanvasNodeType 的 taxonomy（那是 F0.5 的范围，避免一次迁移做两件事）
  ```

### F0.5 — 节点类型 taxonomy 重新设计（破坏性变更）

- 状态：☑
- 前置任务：F0.4
- 允许改动范围：`src/features/canvas/types.ts`、`src/features/canvas/schemas.ts`、所有引用 `CanvasNodeType` 的现有文件（先用 grep 全项目定位引用点后逐一更新）
- 禁止改动：数据库 schema（本卡只改 TS 类型层，不再动 DB；`type` 列本身是自由 text，不需要迁移）
- Task 规格：
  ```
  目标：将 CanvasNodeType 从当前的 ingest|direct|shot-spec|shot|assemble|finalize
  （这是"阶段"命名，与"节点类型"概念混淆）替换为两类节点类型的联合类型：
  全局单例类型 script-import|shot-split|score|export，
  分镜通道类型 shot-script|shot-codegen|shot-sfx|shot-subtitle|shot-qa。
  全项目搜索 CanvasNodeType 及其字符串字面量的引用点并同步更新。

  前置任务：F0.4

  允许改动范围：
  - src/features/canvas/types.ts
  - src/features/canvas/schemas.ts
  - 项目内所有实际引用旧节点类型字符串字面量的文件（先搜索确认范围，改动前列出清单）

  禁止改动：
  - src/lib/db/schema.ts（type 列类型不变，仍是自由 text）

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 全项目搜索旧类型字面量（ingest/direct/shot-spec/shot/assemble/finalize 作为
        CanvasNodeType 用途的），确认零残留引用
  - [ ] schemas.ts 中为每种新节点类型的 data payload 补充最小 Zod schema（可先用
        z.record(z.unknown()) 占位，但必须有类型对应的 schema 键存在）
  - [ ] 变更说明中列出本次改动影响的文件清单

  不在本任务范围内：
  - 不实现 fan-out 物化逻辑（Track C 的范围）
  - 不修改 features/director/pipeline.ts 的阶段命名（阶段命名是 PipelineStage，
    与节点类型是两个独立的类型，不要合并）
  ```

### F0.6 — 引入渲染管线依赖（playwright + ffmpeg-static）

- 状态：☑
- 前置任务：无（可并行）
- 允许改动范围：`package.json`、`.gitignore`（若需排除 playwright 浏览器缓存目录）
- 禁止改动：`src/features/render/**`（本卡只装依赖，不写实现，实现是 Track R）
- Task 规格：
  ```
  目标：将 playwright（含自动下载的 Chromium）与 ffmpeg-static 加入生产依赖，
  执行安装并确认 Chromium 可在当前环境无头启动一次（用一次性验证脚本，跑完即删）。

  前置任务：无

  允许改动范围：
  - package.json
  - .gitignore（若 playwright 产生需忽略的本地缓存路径）

  禁止改动：
  - src/features/render/**

  完成条件：
  - [ ] pnpm install 成功，两个包出现在 dependencies
  - [ ] 一次性验证：无头 Chromium 能启动并关闭，不留后台进程
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 验证脚本执行后已删除，不留在仓库中

  不在本任务范围内：
  - 不编写任何截图/编码逻辑（Track R 范围）
  ```

### F0.7 — 确定性守卫扩展：覆盖检查范围与 CI 化

- 状态：☑
- 前置任务：无（可并行）
- 允许改动范围：`src/lib/determinism/**`
- 禁止改动：`src/features/render/**`、`src/features/canvas/**`
- Task 规格：
  ```
  目标：核查现有 lib/determinism/check.ts 的扫描范围是否覆盖"AI 生成的 shot HTML
  字符串"这一输入源（当前测试可能只覆盖静态文件路径场景），若不覆盖，补充一个
  对字符串内容直接扫描的导出函数 checkSource(html: string): DeterminismViolation[]，
  供 Track D 的 Tool 边界调用。

  前置任务：无

  允许改动范围：
  - src/lib/determinism/check.ts
  - src/lib/determinism/check.test.ts
  - src/lib/determinism/index.ts（若存在，补充导出）

  禁止改动：
  - src/lib/determinism/rules.ts（规则集合本身已定义，不在本卡扩充规则，除非发现
    明显缺口需在完成汇报中提出建议，不擅自新增规则条目）

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 新增测试：对含有 setTimeout 的字符串调用 checkSource 应返回非空违规列表
  - [ ] 新增测试：对合规字符串调用 checkSource 应返回空数组
  - [ ] 现有基于文件路径的检查函数行为不变（不破坏既有调用方）

  不在本任务范围内：
  - 不在本卡内接入 Track D 的 Tool（那是 D1.3 的范围，本卡只准备好被调用的函数）
  ```

---

## Track C — Canvas DAG（画布数据模型 + fan-out 物化 + 布局）

**前置**：Track F 全部完成（尤其 F0.4/F0.5）。

**Goal 启动提示词**：
```
Goal：完成 Track C（Canvas DAG）的全部 Task（C1.1~C1.5），依据
docs/specs/2026-07-23-harness-task-breakdown.md 的 Track C 章节逐一执行。
前置条件：Track F 已全部完成（尤其 F0.4/F0.5，节点字段与类型 taxonomy 已定稿）。

执行要求：
- 按 C1.1→C1.5 顺序执行（C1.4/C1.5 依赖 C1.1~C1.3 的产出）
- 每个 Task 完成后在本文档中把状态由 ☐ 改为 ☑
- 全部 Task 完成后运行 pnpm lint && pnpm tsc --noEmit && pnpm build

完成条件（达成后才可 update_goal(complete)）：
- [ ] C1.1~C1.5 状态已全部为 ☑
- [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
- [ ] 50 个模拟分镜通道下画布可交互不卡死（C1.5 的压测结论已记录）
```

### C1.1 — `fan-out.ts`：分镜通道物化

- 状态：✅（2026-07-24 更新：`INGEST/DIRECT/SHOT_SPEC/FABRICATE` 四个 stage 的 `directorInput` 组装在 `fix/director-input`（`0a24e07`）修复；`ASSEMBLE`（`score`/`shot-sfx`/`shot-subtitle`）与 `FINALIZE`（`export`/`shot-qa`）已在 issue-01 补全，`resolveDirectorInput` 按 `(stage, nodeType)` 显式分支、不再隐式回退到 `row.data.directorInput`，见 `docs/issues/issue-01-director-stage-input-contract-completion.md`）
- 前置任务：F0.4, F0.5
- 允许改动范围：`src/features/canvas/fan-out.ts`（新建）、`src/features/canvas/fan-out.test.ts`
- 禁止改动：`src/features/canvas/actions.ts`、`queries.ts`（不要把物化逻辑塞进这两个文件）
- Task 规格：
  ```
  目标：实现 fan-out.ts，导出函数 materializeShotLanes(projectId, shotIds: string[])，
  给定分镜 ID 数组，为每个分镜 ID 批量创建 5 个通道节点（类型
  shot-script/shot-codegen/shot-sfx/shot-subtitle/shot-qa，laneKey=该分镜ID，
  laneRole=节点类型），并在通道内部按顺序建立单向边（脚本→代码→音效→字幕→验收），
  同时为每个通道的首节点建立"来自语义拆分节点"的边、为每个通道的末节点建立
  "指向配乐节点"的边。全部操作必须在单个事务内完成（要么全部成功要么全部回滚）。

  前置任务：F0.4, F0.5

  允许改动范围：
  - src/features/canvas/fan-out.ts
  - src/features/canvas/fan-out.test.ts

  禁止改动：
  - src/features/canvas/actions.ts
  - src/features/canvas/queries.ts
  - src/lib/db/schema.ts

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：给定 3 个 shotId，断言产出 15 个通道节点 + 正确数量的边
  - [ ] 单测：模拟事务中途失败，断言不留下部分写入的脏数据
  - [ ] 单测：重复调用同一批 shotId 不产生重复节点（幂等性，用 laneKey+laneRole
        唯一性检查或等价机制）
  - [ ] 函数不触发任何渲染/AI调用，只做纯数据库写入

  不在本任务范围内：
  - 不实现自动布局坐标计算（C1.2 的范围，本卡可用占位坐标 {x:0,y:0}）
  - 不实现节点状态转移逻辑（C1.3 的范围）
  ```

### C1.2 — `layout.ts`：自动布局算法

- 状态：☑
- 前置任务：C1.1
- 允许改动范围：`src/features/canvas/layout.ts`（新建）、`layout.test.ts`、`package.json`（新增 dagre 或等价轻量布局库依赖）
- 禁止改动：`fan-out.ts`（布局是独立后处理步骤，不要合并进物化事务）
- Task 规格：
  ```
  目标：实现 layout.ts，导出函数 computeLayout(nodes, edges): Map<nodeId, {x,y}>，
  用轻量自动布局库（如 dagre）为 C1.1 产出的拓扑计算坐标：全局单例节点在最外层
  横向主干上，每个分镜通道在主干下方纵向排列成一条独立的横向轨道（同一通道 5 个
  节点从左到右），不同分镜通道之间纵向间隔固定。

  前置任务：C1.1

  允许改动范围：
  - src/features/canvas/layout.ts
  - src/features/canvas/layout.test.ts
  - package.json（新增一个布局库依赖，选型需在完成汇报中说明理由）

  禁止改动：
  - src/features/canvas/fan-out.ts

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：50 个分镜通道输入，函数在合理时间内返回（记录实际执行耗时在测试输出中，
        不设定硬性阈值但需人工过一遍数值是否可接受）
  - [ ] 单测：任意两个节点坐标不完全重合（无重叠退化情况）
  - [ ] 返回的坐标可直接赋值给 canvas_nodes.position 而不需要额外转换

  不在本任务范围内：
  - 不实现 React Flow 组件层的视口裁剪（C1.5 的范围）
  ```

### C1.3 — `status.ts`：节点状态机与内容哈希比对

- 状态：☑
- 前置任务：F0.4
- 允许改动范围：`src/features/canvas/status.ts`（新建）、`status.test.ts`
- 禁止改动：`fan-out.ts`、`layout.ts`
- Task 规格：
  ```
  目标：实现 status.ts：(1) computeContentHash(input: unknown): string，对任意
  可序列化输入做稳定哈希（需保证同输入同哈希、跨进程重复调用结果一致）；
  (2) transitionNodeStatus(nodeId, next status): 校验状态转移合法性
  （idle→pending→running→success|failed，success/failed→stale 需在上游内容变化时
  触发，禁止非法跳转如 idle→success）并落库；(3) isStale(nodeId): 比对节点当前
  contentHash 与其依赖的上游节点最新产出哈希，判断是否需要重新触发。

  前置任务：F0.4

  允许改动范围：
  - src/features/canvas/status.ts
  - src/features/canvas/status.test.ts

  禁止改动：
  - src/features/canvas/fan-out.ts
  - src/features/canvas/layout.ts
  - src/lib/db/schema.ts

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：非法状态跳转（如 idle 直接到 success）抛出明确错误，不静默失败
  - [ ] 单测：相同输入对象两次调用 computeContentHash 结果相等
  - [ ] 单测：isStale 在上游哈希变化后返回 true，未变化返回 false
  - [ ] 状态转移写入是原子操作（读-判断-写在同一数据库事务或等价保证内）

  不在本任务范围内：
  - 不触发任何实际渲染/AI 调用，只管状态与哈希的记录与判断
  ```

### C1.4 — React Flow 画布组件骨架 + 分镜通道分组折叠

- 状态：☑
- 前置任务：C1.1, C1.2, C1.3
- 允许改动范围：`src/app/canvas/**`、`src/features/canvas/queries.ts`、
  `src/features/canvas/queries.test.ts`、`src/features/canvas/index.ts`、
  `src/components/ui/**`（若需新增纯展示原语，需先确认 `/playbook` 无同类组件）
- 禁止改动：`src/features/canvas/fan-out.ts`、`layout.ts`、`status.ts`
- Task 规格：
  ```
  目标：在 canvas 路由下实现 React Flow 画布视图，渲染 features/canvas 已提供的
  节点/边数据；按 laneKey 对分镜通道分组，提供折叠/展开交互；节点按 §设计系统
  清单 的 stage-* 配色与节点类型对应展示状态徽章（依据 C1.3 的 status 字段）。
  现有 queries.ts 仅能读取项目，需在本卡补充 getCanvasGraph(projectId) 只读投影，
  由 Server Component 调用；page.tsx 不得直接访问数据库。

  前置任务：C1.1, C1.2, C1.3

  允许改动范围：
  - src/app/canvas/**
  - src/features/canvas/queries.ts
  - src/features/canvas/queries.test.ts
  - src/features/canvas/index.ts（只补充受控 re-export）
  - src/components/ui/**（仅新增缺失的纯展示原语，且必须登记 playbook）

  禁止改动：
  - src/features/canvas/fan-out.ts
  - src/features/canvas/layout.ts
  - src/features/canvas/status.ts

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 页面文件不超过 200 行（超出拆分到 features 或本地子组件）
  - [ ] 单测：getCanvasGraph 仅返回指定项目的节点/边，不泄漏其他项目数据
  - [ ] 新增纯展示组件已在 src/app/playbook/registry.ts 登记并配 *.demo.tsx
  - [ ] 手动验证：50 个分镜通道的模拟数据下页面可交互折叠，不崩溃（记录截图或
        描述验证过程于完成汇报）

  不在本任务范围内：
  - 不实现节点拖拽后写回坐标持久化（若设计稿未明确要求，先跳过，记录待确认项）
  ```

### C1.5 — 画布性能优化：视口裁剪与大规模节点压测

- 状态：☑
- 前置任务：C1.4
- 允许改动范围：`src/app/canvas/**`（仅性能相关配置与代码，不改交互逻辑）
- 禁止改动：无特别限制之外的其他 Track 文件
- Task 规格：
  ```
  目标：为 C1.4 的画布视图开启 React Flow 的视口裁剪相关能力，编写一个压测脚本
  或测试用例，生成 250+ 模拟节点，验证画布仍可交互（不卡死）。

  前置任务：C1.4

  允许改动范围：
  - src/app/canvas/**

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 压测：250 个模拟节点场景下记录关键交互（平移/缩放）的主观流畅度描述
        （若有自动化性能测量工具可用则记录具体数值，否则记录人工验证过程）
  - [ ] 未回归 C1.4 已实现的折叠/展开交互

  不在本任务范围内：
  - 不引入虚拟滚动之外的架构级重写（如切换渲染引擎）
  ```

---

## Track D — Director（video-director 方法论原生移植 + Pi tool-calling 编排）

**前置**：Track F 全部完成，F0.1 的 Spike 结论已确定采用哪条路径。以下任务卡按"Pi 原生 Provider 可行"路径编写；若 F0.1 结论为退回方案，D1.2 的 Task 规格需相应替换为"改造 LlmAdapter 转发"版本（人工在启动该 Goal 前调整措辞，架构原则不变）。**本 Track 不使用 Pi 的 Skills/Extensions 加载机制**——`docs/video-director/` 只作为编写 D0.1/D0.2 时对照阅读的参考语料，不在任何运行时代码路径中被读取或挂载。

**Goal 启动提示词**：
```
Goal：完成 Track D（Director）的全部 Task（D0.1~D1.5），依据
docs/specs/2026-07-23-harness-task-breakdown.md 的 Track D 章节逐一执行。
前置条件：Track F 已全部完成，F0.1 的 Spike 结论已确定（Pi 原生 Provider 是否
可行）。本 Track 严禁使用 Pi 的 Skills/Extensions 加载机制，
docs/video-director/ 只读参照，不在运行时代码路径中读取或挂载。

执行要求：
- 按 D0.1→D0.2→D1.1→D1.2→D1.3→D1.4→D1.5 顺序执行
- 若 F0.1 结论为退回方案，D1.1/D1.2 的具体实现改为包装现有 StepfunAdapter，
  但仍不引入 Skill 挂载机制，架构原则不变
- 每个 Task 完成后在本文档中把状态由 ☐ 改为 ☑
- 全部 Task 完成后运行 pnpm lint && pnpm tsc --noEmit

完成条件（达成后才可 update_goal(complete)）：
- [ ] D0.1~D1.5 状态已全部为 ☑
- [ ] pnpm lint / pnpm tsc --noEmit 通过
- [ ] 完成汇报中确认零处运行时代码读取 docs/video-director/ 路径
```

### D0.1 — `schemas/`：移植 video-director 输出契约为原生 Zod schema

- 状态：☑
- 前置任务：无（可与 Track F 并行）
- 允许改动范围：`src/features/director/schemas/**`（新建目录及文件）
- 禁止改动：`docs/video-director/**`（只读参照，不修改）
- Task 规格：
  ```
  目标：对照 docs/video-director/schemas/shot-plan.schema.json 及 INGEST 阶段
  相关 schema（script-units/audio-manifest/audio-allocation），逐字段手写对应
  的原生 Zod schema：schemas/shot-plan.ts、schemas/ingest.ts。这是"移植"不是
  "引用"——产出的 Zod schema 是本项目独立维护的源码，之后与原 JSON Schema 解耦
  独立演进，不依赖运行时读取 docs/video-director/ 下的任何文件。

  前置任务：无

  允许改动范围：
  - src/features/director/schemas/shot-plan.ts
  - src/features/director/schemas/ingest.ts
  - src/features/director/schemas/*.test.ts

  禁止改动：
  - docs/video-director/**（只读参照）

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] shot-plan.ts 的字段集合与 shot-plan.schema.json 的 $defs.shot 逐一对应，
        完成汇报中列出字段映射表，标注任何有意省略或调整的字段及理由
  - [ ] 单测：用一份符合原 JSON Schema 的示例数据（可从 docs/video-director/
        的 productions/ 或测试夹具中取样）验证 Zod schema 能正确解析
  - [ ] 单测：故意缺失必填字段的数据应被 Zod schema 拒绝，错误信息可定位到
        具体字段
  - [ ] 运行时代码（非测试）中不出现任何读取 docs/video-director/ 路径的文件
        IO 调用

  不在本任务范围内：
  - 不实现 prompt 模板（D0.2 的范围）
  - 不实现 Tool 或会话编排（D1.x 的范围）
  ```

### D0.2 — `prompts/`：移植 video-director 方法论为原生 prompt 模板

- 状态：☑
- 前置任务：D0.1
- 允许改动范围：`src/features/director/prompts/**`（新建目录及文件）
- 禁止改动：`docs/video-director/**`
- Task 规格：
  ```
  目标：对照 docs/video-director/SKILL.md 的"正向视觉法则"（10 条）、"构图模式"
  （11 种 enum）、DIRECT 阶段的 master-plan/style-bible 产出要求、SHOT-SPEC
  阶段的 shot-plan 撰写要求，为 PRD 六阶段口径（INGEST/DIRECT/SHOT-SPEC/
  FABRICATE/ASSEMBLE/FINALIZE）各写一个 TS 提示词模板文件，导出类型化的模板
  函数（如 buildDirectPrompt(input: {...}): string），插槽参数使用 D0.1 产出
  的 Zod schema 推导类型。模板内容是方法论文本的移植与改写，不是逐字复制
  SKILL.md 原文。

  前置任务：D0.1

  允许改动范围：
  - src/features/director/prompts/ingest.ts
  - src/features/director/prompts/direct.ts
  - src/features/director/prompts/shot-spec.ts
  - src/features/director/prompts/fabricate.ts
  - src/features/director/prompts/assemble.ts
  - src/features/director/prompts/finalize.ts
  - src/features/director/prompts/*.test.ts

  禁止改动：
  - docs/video-director/**

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 每个模板函数的插槽参数类型来自 D0.1 的 Zod schema 推导（z.infer），
        不是手写的重复类型定义
  - [ ] 单测：给定固定插槽参数，模板函数产出的字符串包含关键约束语句（如
        FABRICATE 模板必须包含确定性红线的明确指令文本）
  - [ ] 完成汇报中列出"10 条正向视觉法则"分别被移植进了哪个模板文件的哪个
        位置，确认无遗漏

  不在本任务范围内：
  - 不实现 Tool 或会话编排（D1.x 的范围）
  ```

### D1.1 — `pi-session.ts`：Director 会话工厂（`Agent + JsonlSessionRepo`，不挂 Skill）

- 状态：☑
- 前置任务：F0.1（含结论）
- 允许改动范围：`src/features/director/pi-session.ts`、`session-store.ts`（均新建）及对应测试
- 禁止改动：`src/features/director/pipeline.ts`（本卡先不改现有阶段元数据文件）
- Task 规格：
  ```
  目标：实现 pi-session.ts，导出 createDirectorSession(input: {
  projectId: string; nodeId: string; stage: PipelineStage; resumeSessionKey?: string
  }):
  Promise<DirectorSession>。内部用 `pi-agent-core` 的 `Agent` 运行 tool-calling
  循环，并通过 session-store.ts 的 DirectorSessionStore 用 `JsonlSessionRepo`
  持久化会话树；使用 F0.1 已验证的 `pi-ai` 原生 StepFun Provider。
  `DirectorSession` 是本项目定义的最小接口，不向 features/director 外部泄漏 Pi
  内部类型。本函数不依赖 `pi-coding-agent`，不加载任何 Skill/Extension，不挂载
  docs/video-director/ 或任何外部技能包；该阶段所需的领域知识完全来自 D0.2
  产出的原生 prompt 模板与 D1.2 即将注册的自定义 Tool。
  `DirectorSession.run({ prompt, tools })` 的 tools 使用项目自有 `DirectorTool`
  契约，并在 pi-session.ts 内部适配为 Pi AgentTool；不得让 D1.3 或其他领域代码
  直接操作 Agent.state.tools。

  前置任务：F0.1

  允许改动范围：
  - src/features/director/pi-session.ts
  - src/features/director/pi-session.test.ts
  - src/features/director/session-store.ts
  - src/features/director/session-store.test.ts

  禁止改动：
  - src/features/director/pipeline.ts
  - docs/video-director/**（只读参照，本卡不涉及此目录任何文件的读写）

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：mock Pi SDK，验证 `Agent` 初始状态只包含项目原生 prompt/Tool，
        未调用 `pi-coding-agent`，未加载任何 Skill/Extension（不发起真实网络请求）
  - [ ] 单测：`JsonlSessionRepo` 根路径来自 `StorageAdapter.localPath('pi-sessions')`，
        返回给调用方的是相对 storageKey，不是裸绝对路径
  - [ ] 单测：`message_end` 按顺序只持久化一次；用 resumeSessionKey 恢复时，
        `Session.buildContext()` 的消息被注入新 Agent
  - [ ] 函数对每个 stage 返回类型一致的 DirectorSession 封装；对外只暴露
        id/storageKey/run/close，不泄漏 Pi 内部类型
  - [ ] 单测：run() 可接收项目自有 DirectorTool，适配后挂入 Agent，但
        DirectorSession/DirectorTool 的公开类型签名中不出现 Pi SDK 类型
  - [ ] 代码或测试中不出现任何对 docs/video-director/ 路径的文件 IO 调用

  不在本任务范围内：
  - 不实现具体的自定义 Tool（D1.2 的范围）
  - 不实现阶段编排流程（D1.3 的范围）
  ```

### D1.2 — `tools/`：阶段自定义 Tool 集

- 状态：☑
- 前置任务：D0.1, D1.1, F0.7
- 允许改动范围：`src/features/director/tools/**`（新建目录及文件）
- 禁止改动：`pi-session.ts`（Tool 定义与会话工厂分离）
- Task 规格：
  ```
  目标：在 tools/ 下实现两个只读诊断 Pi Tool 与一个可信写入应用服务：
  validate-shot-plan.ts（用 D0.1 产出的原生 Zod schema 校验模型输出，不依赖
  运行时读取任何 JSON Schema 文件）、check-determinism.ts（调用 F0.7 的
  checkSource，对 FABRICATE 阶段产出的 HTML 强制扫描，违规则 Tool 返回失败
  结果而不是抛异常，让 Agent 收到结构化失败反馈）、write-artifact.ts（不暴露
  给 Agent，只由可信 stage runner 传入项目/节点/路径；复验同一内容后落
  StorageAdapter + 更新 artifacts 表）。每个文件只做一件事。

  前置任务：D0.1, D1.1, F0.7

  允许改动范围：
  - src/features/director/tools/**

  禁止改动：
  - src/features/director/pi-session.ts
  - src/lib/determinism/**（只调用不修改）

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 两个诊断 Tool 与写入服务均有单测，覆盖"校验通过"与"校验失败"两条路径
  - [ ] validate-shot-plan.ts 内部导入 D0.1 的 schemas/shot-plan.ts，不重复
        定义校验逻辑
  - [ ] check-determinism.ts 的失败路径不抛出未捕获异常，而是返回结构化错误
        供 Agent 感知并重试
  - [ ] write-artifact.ts 写入前必须已通过前置校验，代码路径上体现这个先后顺序
  - [ ] write-artifact.ts 不导出 DirectorTool，projectId/nodeId/key 只能由
        stage runner 的可信执行上下文传入，禁止模型决定业务归属或写入路径

  不在本任务范围内：
  - 不实现 stage-runner.ts 的整体编排（D1.3 的范围）
  ```

### D1.3 — `stage-runner.ts`：单阶段运行编排

- 状态：✅（2026-07-24 更新：`runtime-repository.ts` 的 `resolveDirectorInput` 已为全部六个 stage 从上游 artifact 真实组装输入（前四阶段 `0a24e07`；`ASSEMBLE`/`FINALIZE` 见 issue-01），六阶段输入契约表见 [Harness 总纲 §3.5.2](./2026-07-23-ai-development-harness.md#352-六阶段输入契约表2026-07-24-补充回应-track-h-issue-01)；`ASSEMBLE`/`FINALIZE` 按 `nodeType` 二次路由到角色专属 prompt builder，见 `docs/issues/issue-01-director-stage-input-contract-completion.md`）
- 前置任务：D0.1, D0.2, D1.1, D1.2
- 允许改动范围：`src/features/director/stage-runner.ts`、`stage-prompt.ts`、`runtime-repository.ts`（均新建）、对应测试及 `pipeline.ts`（仅移除空接口）
- 禁止改动：`src/lib/queue/**`（本卡只消费队列接口，不改队列实现）
- Task 规格：
  ```
  目标：实现 stage-runner.ts，导出 runStage(projectId, nodeId, stage):
  Promise<void>。通过 runtime-repository.ts 读取并校验项目/节点执行上下文，
  节点阶段输入统一来自 canvas_nodes.data.directorInput；由 stage-prompt.ts 按
  stage 调用 D0.2 的原生类型化 builder（INGEST 可用项目 script 补齐 rawScript）。
  节点必须已经是 pending，runner 复用 C1.3 的 transitionNodeStatus 执行
  pending→running；随后创建 Pi 会话（D1.1）→ 挂载对应 Tool（D1.2）→
  运行会话直到产出 → 产出再次经过 write-artifact 门禁后落盘并置 success。
  失败则由 repository 记录结构化 error 并置 failed，不绕过状态机。
  在第一次模型调用前必须把 DirectorSession.storageKey 作为 kind='pi-session'
  的 artifact 指针登记；失败时保留该指针用于追踪，不删除会话留痕。
  本函数是 features/director 内唯一允许跨模块编排（canvas 状态 + AI 会话 +
  存储）的文件。

  前置任务：D1.1, D1.2

  允许改动范围：
  - src/features/director/stage-runner.ts
  - src/features/director/stage-runner.test.ts
  - src/features/director/stage-prompt.ts
  - src/features/director/stage-prompt.test.ts
  - src/features/director/runtime-repository.ts
  - src/features/director/runtime-repository.test.ts
  - src/features/director/pipeline.ts（仅删除已被 DirectorSession 取代的空 AgentRunner）
  - src/features/director/types.ts（仅把过时的“八阶段”注释纠正为六阶段）
  - src/features/director/index.ts（仅移除 AgentRunner 的过时 re-export）

  禁止改动：
  - src/lib/queue/in-process-queue.ts
  - src/features/canvas/status.ts（只调用其导出函数，不修改实现）

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：mock 会话成功场景，断言最终节点状态为 success 且 artifact 已写入
  - [ ] 单测：mock 会话失败场景（如 Tool 返回校验失败），断言节点状态为 failed
        且错误信息被记录，不残留 running 状态
  - [ ] 单测：成功/失败路径都已登记 pi-session artifact，且只存相对 storageKey
  - [ ] 单测：节点不是 pending、stage 与节点不一致、directorInput 不合法时在
        模型调用前失败；INGEST 可从项目 script 构造输入
  - [ ] 函数本身不直接操作数据库连接细节，通过已有 features 函数间接操作

  不在本任务范围内：
  - 不实现队列 handler 注册（D1.4 的范围）
  ```

### D1.4 — 队列接入：`director` 作业处理器注册

- 状态：☑
- 前置任务：D1.3
- 允许改动范围：`src/features/director/queue-handler.ts`（新建）、对应测试、`src/instrumentation.ts`（新建）
- 禁止改动：`src/lib/queue/in-process-queue.ts` 的核心实现（只调用 `register()` 方法）
- Task 规格：
  ```
  目标：实现 queue-handler.ts，注册 kind='director-stage' 的作业处理器到
  InProcessQueue，处理器内部调用 stage-runner.ts 的 runStage。导出
  enqueueDirectorStage()，先用 C1.3 状态机把节点置 pending，再 enqueue，
  API 路由不得自行拼装队列细节。在 Next.js 根 instrumentation.ts 的 Node
  runtime register() 中幂等接入处理器注册与队列启动。若 enqueue 持久化失败，
  必须补偿推进 pending→running→failed 并记录错误，禁止留下悬挂 pending 节点。
  改状态前必须由 Director repository 校验 project/node 归属、stage 一致且
  当前状态属于 idle|failed|stale，拒绝无效作业伪装成成功入队。

  前置任务：D1.3

  允许改动范围：
  - src/features/director/queue-handler.ts
  - src/features/director/queue-handler.test.ts
  - src/instrumentation.ts

  禁止改动：
  - src/lib/queue/in-process-queue.ts

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 单测：enqueue 一个 director-stage 作业后（mock stage-runner），处理器被
        正确调用且参数传递正确
  - [ ] 单测：enqueueDirectorStage() 先合法推进节点到 pending，再写入队列
  - [ ] 单测：project/node/stage/状态不匹配时，在状态变化和写 job 前拒绝
  - [ ] 单测：enqueue 抛错时节点补偿为 failed 且错误已记录，可从 failed 重试
  - [ ] 应用启动时队列被启动且处理器已注册（可通过一次集成性测试或手动验证描述）

  不在本任务范围内：
  - 不实现 API 路由触发入口（D1.5 的范围）
  ```

### D1.5 — API 路由：`api/director/stage`

- 状态：☑
- 前置任务：D1.4
- 允许改动范围：`src/app/api/director/stage/route.ts`（新建）
- 禁止改动：`src/features/director/**`（路由层只调用，不新增业务逻辑）
- Task 规格：
  ```
  目标：实现 POST /api/director/stage 路由，接收 { projectId, nodeId, stage }，
  Zod 校验请求体，调用 features/canvas/queries 的 getCanvasGraph(projectId)
  确认节点属于该项目后，调用 D1.4 的 enqueueDirectorStage()，返回 { jobId }。

  前置任务：D1.4

  允许改动范围：
  - src/app/api/director/stage/route.ts
  - src/app/api/director/stage/route.test.ts

  禁止改动：
  - src/features/director/**
  - src/features/canvas/**

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 请求体校验失败返回 400 + 明确错误信息，不抛未捕获异常
  - [ ] 节点不存在返回 404
  - [ ] 成功路径返回 200 + jobId
  - [ ] 路由文件本身不超过 50 行（超出说明塞了业务逻辑，应下沉 features）

  不在本任务范围内：
  - 不实现前端调用该路由的 UI（Track U 的范围）
  ```

---

## Track R — Render（渲染管线）

**前置**：F0.6, F0.7。

**Goal 启动提示词**：
```
Goal：完成 Track R（Render）的全部 Task（R1.1~R1.6），依据
docs/specs/2026-07-23-harness-task-breakdown.md 的 Track R 章节逐一执行。
前置条件：F0.6（playwright/ffmpeg-static 已装）、F0.7（确定性守卫 checkSource
已就位）均已完成。

执行要求：
- 按 R1.1→R1.2→R1.3→R1.4→R1.5→R1.6 顺序执行
- 每个 Task 完成后在本文档中把状态由 ☐ 改为 ☑
- 全部 Task 完成后运行 pnpm lint && pnpm tsc --noEmit && pnpm build

完成条件（达成后才可 update_goal(complete)）：
- [ ] R1.1~R1.6 状态已全部为 ☑
- [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
- [ ] 至少一次真实渲染出确定性一致的 mp4（同输入两次渲染哈希一致）的验证记录
```

### R1.1 — `frame-capture.ts`：单帧截图

- 状态：☑
- 前置任务：F0.6, F0.7
- 允许改动范围：`src/features/render/frame-capture.ts`（新建）、测试文件、`fixtures/`（测试用最小 shot HTML 样例）
- 禁止改动：`renderer.ts`（顶层编排留到 R1.5）
- Task 规格：
  ```
  目标：实现 frame-capture.ts，定义唯一 shot runtime 合同
  window.__CVC_RENDER__ = { version: 1, seek(frame, fps) }。导出
  的 shot HTML 必须是可搬运、自包含且位置无关的 StorageAdapter artifact，
  不得依赖工作区相对 node_modules/docs 资源。
  openFrameCapture(htmlPath, viewport?)（页面加载一次、可多次 seek/capture、
  显式 close）与便捷函数 captureFrame(htmlPath, frame, fps): Promise<Buffer>
  （内部打开/关闭 session）。用 Playwright 等待 runtime 就绪，调用 seek 后通过
  CDP 截图返回 PNG；缺少/版本不匹配的 runtime 必须明确失败。

  前置任务：F0.6, F0.7

  允许改动范围：
  - src/features/render/frame-capture.ts
  - src/features/render/frame-capture.test.ts
  - src/features/render/__fixtures__/**（新建最小确定性 shot HTML 样例，用于测试）

  禁止改动：
  - src/features/render/renderer.ts

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：对固定 fixture 的同一 frame 连续截图两次，PNG 内容哈希一致
        （确定性验证）
  - [ ] 单测：frame=0 与 frame=N（N 足够大）截图哈希不同（确实随帧变化）
  - [ ] 截图函数使用后正确关闭 Playwright browser/page，不残留进程
  - [ ] 单测：缺少 `window.__CVC_RENDER__` 或 version 不匹配时明确失败
  - [ ] lib/determinism 的规则扫描对 fixture HTML 本身应为零违规（用它验证
        F0.7 产出的 checkSource 函数）

  不在本任务范围内：
  - 不实现多帧循环批量截图（R1.2 的范围）
  - 不实现 ffmpeg 编码（R1.3 的范围）
  ```

### R1.2 — 帧序列生成与内容哈希缓存

- 状态：☑
- 前置任务：R1.1
- 允许改动范围：`src/features/render/cache.ts`（新建）、`frame-sequence.ts`（新建）、测试文件
- 禁止改动：`frame-capture.ts`
- Task 规格：
  ```
  目标：实现 cache.ts（按 artifacts.contentHash 查找/登记 render-mp4，命中时
  还要用 StorageAdapter.exists 排除陈旧指针）与 frame-sequence.ts。后者导出
  captureSequence(htmlPath, totalFrames, fps, options?)，使用有限数量的
  FrameCaptureSession（每个 page 串行 seek，多个 page 有界并发），把 PNG
  按 frame-%08d.png 写入隔离临时目录，返回 FrameSequence 句柄
  { directory, pattern, totalFrames, cleanup() }，禁止把整段 1080p 帧序列常驻内存。

  前置任务：R1.1

  允许改动范围：
  - src/features/render/cache.ts
  - src/features/render/frame-sequence.ts
  - 对应测试文件

  禁止改动：
  - src/features/render/frame-capture.ts

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：相同 contentHash 命中有效 artifact；文件已丢失时视为 cache miss
  - [ ] 单测：captureSequence 并发数受限（不超过配置的上限，验证方式可用计数器
        mock）
  - [ ] 单测：中途某一帧截图失败时，整体操作失败并给出是第几帧失败的明确信息
  - [ ] 成功/失败都可调用 cleanup 清理精确临时目录，不遗留帧文件

  不在本任务范围内：
  - 不实现 ffmpeg 编码（R1.3 的范围）
  ```

### R1.3 — `encode.ts`：ffmpeg 编码

- 状态：☑
- 前置任务：R1.2
- 允许改动范围：`src/features/render/encode.ts`（新建）、测试文件
- 禁止改动：`frame-sequence.ts`、`cache.ts`
- Task 规格：
  ```
  目标：实现 encode.ts，导出 encodeToMp4(sequence: FrameSequence, fps,
  outputPath): Promise<string>：调用 ffmpeg-static 从磁盘 pattern 流式读取帧，
  以固定 CRF/预设/单线程/bitexact/剥离元数据参数编码 mp4，写入 outputPath
  并返回该路径；不得重新把全部帧读回 Buffer[]。

  前置任务：R1.2

  允许改动范围：
  - src/features/render/encode.ts
  - src/features/render/encode.test.ts

  禁止改动：
  - src/features/render/frame-sequence.ts
  - src/features/render/cache.ts

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：给定固定帧序列，两次独立编码产出的 mp4 文件哈希一致（确定性验证，
        若 ffmpeg 元数据时间戳导致哈希不稳定，需在编码参数中显式抑制时间戳写入）
  - [ ] 编码失败（如 ffmpeg 进程非零退出）时函数抛出包含 stderr 内容的明确错误
  - [ ] 输出文件写入前先写临时文件再原子重命名，避免半写状态被误读

  不在本任务范围内：
  - 不实现顶层 renderer.ts 编排（R1.5 的范围）
  - 不实现终局合并导出（R1.4 的范围）
  ```

### R1.4 — `concat.ts`：终局合并导出

- 状态：☑
- 前置任务：R1.3
- 允许改动范围：`src/features/render/concat.ts`、`repository.ts`、`export-service.ts`（均新建）及对应测试
- 禁止改动：`encode.ts`（复用而非重写编码逻辑）
- Task 规格：
  ```
  目标：实现 concat.ts，导出 concatExport(mp4Paths: string[], musicPath:
  string | null, outputPath): Promise<string>：用 ffmpeg concat demuxer 按序
  流拷贝已渲染分镜视频；有配乐才混入音轨（视频仍 copy），无配乐也可导出。
  同时实现 repository.ts + export-service.ts：按项目画布顺序收集已完成分镜的
  render-mp4 artifact，发现任一分镜通道未 success 则返回结构化 incomplete IDs；
  完整时调用 concat、经 StorageAdapter 提交终片并登记 artifact。路由不查数据库。

  前置任务：R1.3

  允许改动范围：
  - src/features/render/concat.ts
  - src/features/render/concat.test.ts
  - src/features/render/repository.ts
  - src/features/render/repository.test.ts
  - src/features/render/export-service.ts
  - src/features/render/export-service.test.ts

  禁止改动：
  - src/features/render/encode.ts

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：给定 3 个固定测试 mp4 fixture，拼接结果的总时长约等于三者时长之和
        （允许合理误差范围，需在测试中说明误差容忍逻辑）
  - [ ] 单测：拼接函数不重新调用任何逐帧截图/单镜编码相关函数（mock 验证零调用）
  - [ ] 拼接失败时给出明确的失败分镜索引或阶段信息
  - [ ] export service 按 laneKey 稳定排序；未完成节点返回完整 ID 列表且不调用 ffmpeg

  不在本任务范围内：
  - 不实现转场特效的编排逻辑（若 PRD F13 需要转场，作为 Track A 音频/合成
    Track 的后续任务处理，本卡只做基础拼接）
  ```

### R1.5 — `renderer.ts`：顶层编排 + 队列接入

- 状态：☑
- 前置任务：R1.2, R1.3
- 允许改动范围：`src/features/render/renderer.ts`（替换占位）、`queue-handler.ts`（新建）、`repository.ts`、`types.ts`、`index.ts`、`src/instrumentation.ts` 及对应测试
- 禁止改动：`frame-sequence.ts`、`encode.ts`、`cache.ts`（本卡只编排，不重写底层）
- Task 规格：
  ```
  目标：扩展 RenderJob 为可信内部合同
  { projectId,nodeId,shotId,htmlKey,frames,seed? }（Renderer 方法签名仍为
  render(job): Promise<RenderResult>）。renderer.ts 编排：读取 StorageAdapter
  HTML → checkSource 强制扫描 → 计算版本化内容哈希 → 查 cache → 未命中则
  captureSequence → encode 临时 mp4 → StorageAdapter 提交 → cache 登记；
  finally 清理帧序列/临时文件。queue-handler.ts 负责 render-shot 入队前校验、
  pending 状态、处理器加载持久 render context、running→success|failed 与
  enqueue 失败补偿。根 instrumentation.ts 同时注册 Director/Render handler
  后只启动同一个队列。

  前置任务：R1.2, R1.3

  允许改动范围：
  - src/features/render/renderer.ts
  - src/features/render/queue-handler.ts
  - src/features/render/renderer.test.ts
  - src/features/render/queue-handler.test.ts
  - src/features/render/repository.ts（补充 render context 查询）
  - src/features/render/types.ts
  - src/features/render/index.ts
  - src/instrumentation.ts

  禁止改动：
  - src/features/render/frame-sequence.ts
  - src/features/render/encode.ts
  - src/features/render/cache.ts

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 单测：缓存命中路径不触发截帧（mock 验证）
  - [ ] 单测：缓存未命中路径按序调用截帧→编码→写入，任一环节失败整体失败并
        正确回退节点状态为 failed
  - [ ] Renderer 接口签名保持不变（render(job): Promise<RenderResult>），不破坏
        既有调用方类型契约
  - [ ] 确定性守卫在截图前执行；失败时零截图、零编码、零 artifact
  - [ ] 成功/失败均清理临时帧目录；enqueue/handler 状态机不留下 pending/running

  不在本任务范围内：
  - 不实现触发渲染的 API 路由（R1.6 的范围）
  ```

### R1.6 — API 路由：`api/render` 与 `api/render/export`

- 状态：☑
- 前置任务：R1.5, R1.4
- 允许改动范围：`src/app/api/render/route.ts`、`src/app/api/render/export/route.ts` 及对应测试（均新建）
- 禁止改动：`src/features/render/**`
- Task 规格：
  ```
  目标：实现两个路由：POST /api/render（接收 { projectId, nodeId }，enqueue
  render-shot 作业，返回 jobId）与 POST /api/render/export（接收 { projectId }，
  校验该项目全部分镜通道节点状态均为 success 后，调用 concat.ts 产出终片，
  若有未完成节点则返回 409 + 列出未完成的节点 ID）。

  前置任务：R1.5, R1.4

  允许改动范围：
  - src/app/api/render/route.ts
  - src/app/api/render/export/route.ts
  - src/app/api/render/route.test.ts
  - src/app/api/render/export/route.test.ts

  禁止改动：
  - src/features/render/**
  - src/features/canvas/**

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] /api/render 请求体校验失败返回 400，节点不存在返回 404
  - [ ] /api/render/export 调用可信 export service；存在未完成通道节点时返回
        409 + 完整节点 ID 列表，不静默跳过未完成分镜
  - [ ] 两个路由文件均不超过 50 行

  不在本任务范围内：
  - 不实现调用这些路由的前端 UI（Track U 的范围）
  ```

---

## Track A — Audio（字幕/配音/音效/配乐，P1 优先级，Demo 阶段占位）

**前置**：Track C（通道节点已建）、Track D（阶段编排已通）。**Demo 阶段仅要求节点存在 + UI 可见 + 内部逻辑占位（明确抛出"待实现"或返回固定 mock），真实生成能力延后到 P1**，与总纲 §4.1 决策一致。

**Goal 启动提示词**：
```
Goal：完成 Track A（Audio 占位）的 Task A1.1，依据
docs/specs/2026-07-23-harness-task-breakdown.md 的 Track A 章节执行。
前置条件：Track C、Track D 均已完成。

执行要求：
- 本 Track 仅一个 Task，Demo 阶段只做占位实现，不接入真实 StepFun TTS/ASR
- 完成后在本文档中把状态由 ☐ 改为 ☑
- 完成后运行 pnpm lint && pnpm tsc --noEmit

完成条件（达成后才可 update_goal(complete)）：
- [ ] A1.1 状态为 ☑
- [ ] pnpm lint / pnpm tsc --noEmit 通过
- [ ] 四个占位函数均不抛异常，返回结构清晰标注"P1 实现"
```

### A1.1 — `features/audio/` 骨架与占位实现

- 状态：☑
- 前置任务：Track C 完成
- 允许改动范围：`src/features/audio/subtitle.ts`、`voiceover.ts`、`sfx.ts`、`score.ts`（均新建）、`types.ts`、`index.ts` 及对应测试
- Task 规格：
  ```
  目标：为字幕/配音/音效/配乐四个子域各建一个文件，导出与其角色对应的函数
  签名（如 generateSubtitle(shotId): Promise<SubtitleResult>），Demo 阶段函数体
  返回明确标注"占位实现，P1 补齐"的固定 mock 结果，不抛异常（保证画布节点
  可以走完"success"状态，不会因为占位而卡在 failed）。

  前置任务：Track C 完成

  允许改动范围：
  - src/features/audio/subtitle.ts
  - src/features/audio/voiceover.ts
  - src/features/audio/sfx.ts
  - src/features/audio/score.ts
  - src/features/audio/types.ts（定稿公共输入/结果合同）
  - src/features/audio/index.ts（统一公开入口）
  - src/features/audio/*.test.ts

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 每个函数都有对应最小单测，验证返回值符合预期的 mock 结构
  - [ ] 每个函数体内有清晰注释标注"P1 实现"及对应 PRD 功能编号（F10/F11/F12/F14）
  - [ ] 函数签名设计为未来替换为真实实现时不需要改调用方代码（即接口定稿，
        实现留白）

  不在本任务范围内：
  - 不接入真实 StepFun TTS/ASR 调用（P1 任务，不在本次 Demo Track 范围）
  ```

---

## Track P — Pencil 组件港口（`docs/designs/canvas.pen` → 真实前端组件，SSOT 强制）

**目的**：把 `docs/designs/canvas.pen` 中标记 `reusable:true` 的 30 个 symbols，通过 **Pencil MCP 工具**（`mcp_pencil_batch_get`/`mcp_pencil_get_variables`/`mcp_pencil_get_screenshot`/`mcp_pencil_export_html` 等）逐一读取真实结构与样式，一比一移植为 `src/components/ui/*.tsx` 或 `src/components/icons/*.tsx`，并登记进 `/playbook`。四个 Button symbols 由一个带 variant 的组件承载，故登记口径为 27 个 Pencil UI 组件族。**这是总纲 §5.6 的强制约束的具体执行**：Track U 的任何页面任务卡都只允许 `import` 这里产出的组件，不允许重新实现。**必须排在 Track U 之前完成。**

**Goal 启动提示词**：
```
Goal：完成 Track P（Pencil 组件港口）的全部 Task（P0.1~P1.5），依据
docs/specs/2026-07-23-harness-task-breakdown.md 的 Track P 章节逐一执行。

执行要求：
- 按 P0.1→P1.1→P1.2→P1.3→P1.4→P1.5 顺序执行
- 每个组件移植前必须用 Pencil MCP 工具（mcp_pencil_batch_get 等）实际读取
  canvas.pen 中的真实结构，禁止凭记忆/凭空实现
- 每个组件完成后立即登记 src/app/playbook/registry.ts + 配 *.demo.tsx，
  不要攒到最后一次性登记
- 每个 Task 完成后在本文档中把状态由 ☐ 改为 ☑
- 全部 Task 完成后运行 pnpm lint && pnpm tsc --noEmit && pnpm build

完成条件（达成后才可 update_goal(complete)）：
- [ ] P0.1~P1.5 状态已全部为 ☑
- [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
- [ ] /playbook 页面可查看到 27 个 Pencil UI 组件族，并明示其完整覆盖
      canvas.pen 30 个 reusable symbols（四个 Button symbols 合并为一个 variant 族）
      （或在完成汇报中说明任何有意合并/不单列的组件及理由）
```

**执行铁律（每张任务卡都适用）**：
1. 严禁凭记忆或凭空实现——每个组件必须先用 `mcp_pencil_batch_get` 读取该组件在 `canvas.pen` 中的真实节点结构（fill/padding/gap/cornerRadius/stroke/effect 等），必要时用 `mcp_pencil_get_screenshot` 核对视觉。
2. 颜色/圆角/间距/阴影必须映射到 `mcp_pencil_get_variables` 读出的 Design Token（对应 Tailwind CSS 变量或 `tailwind.config` 扩展），不允许硬编码 hex/px 数值。
3. 每个组件完成后必须在 `src/app/playbook/registry.ts` 登记 + 配 `*.demo.tsx`，且在完成条件中截图/描述验证过 `/playbook` 页面能正确渲染该组件。
4. 图标统一用 `lucide-react`（P0.1 先装好），命名遵循设计系统清单 §6.3 的新命名表（如 `circle-plus` 不是 `plus-circle`），禁止 emoji。

### P0.1 — 依赖补全：`lucide-react` + 自动布局库

- 状态：☑
- 前置任务：无
- 允许改动范围：`package.json`
- Task 规格：
  ```
  目标：安装 lucide-react（全部图标的唯一来源）与 @dagrejs/dagre（画布自动
  布局，供后续 C1.2 使用），确认安装后可从两个包分别成功 import 一个符号
  （如 lucide-react 的 CirclePlus，@dagrejs/dagre 的 graphlib）。

  前置任务：无

  允许改动范围：
  - package.json

  完成条件：
  - [ ] pnpm install 成功，两个包出现在 dependencies
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 一次性验证两个包可被 import（验证代码可以是临时文件，验证后删除，或
        直接在后续 P1.x/C1.2 任务卡中一并验证，本卡只需确保安装成功）

  不在本任务范围内：
  - 不实现任何组件或布局逻辑
  ```

### P1.1 — B1 基础控件港口（13 个组件）

- 状态：☑
- 前置任务：P0.1
- 允许改动范围：`src/components/ui/**`（新建/按 Pencil 校正既有实现）、`src/app/playbook/registry.ts`、`src/app/globals.css`（仅补齐 Pencil Token 映射）
- Task 规格：
  ```
  目标：用 Pencil MCP 读取 canvas.pen 中以下 13 个 reusable 组件的真实结构：
  Button/Primary、Button/Tinted、Button/Gray、Button/Destructive、IconButton、
  SegmentedControl、TextField、TextArea、SearchField、Toggle、ProgressBar、
  StatusPill、Tooltip。逐一移植为 src/components/ui/ 下的 React 组件（如
  button.tsx 内以 variant prop 覆盖四种 Button 样式，而不是四个独立文件——
  与 canvas.pen 内四个变体是同一组件家族的事实保持一致），颜色/圆角/间距取自
  mcp_pencil_get_variables 读出的 Token，全部登记进 playbook。

  前置任务：P0.1

  允许改动范围：
  - src/components/ui/**
  - src/app/playbook/registry.ts
  - src/app/globals.css（仅补齐 mcp_pencil_get_variables 已确认的 Token 映射）

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 13 个组件（Button 四变体算 1 个组件家族+4 变体）逐一可在 /playbook
        页面查看，且样式与 canvas.pen 截图核对一致（用 mcp_pencil_get_screenshot
        对照，完成汇报中说明核对过程）
  - [ ] 每个组件均已在 registry.ts 登记 + 配 *.demo.tsx
  - [ ] 未出现硬编码颜色 hex 值（可用简单 grep 自查后在完成汇报中说明结果）

  不在本任务范围内：
  - 不实现 B2/B3/B4 组件（P1.2/P1.3/P1.4 的范围）
  ```

### P1.2 — B2 反馈组件港口（Toast / Dialog / EmptyState）

- 状态：☑
- 前置任务：P0.1
- 允许改动范围：`src/components/ui/**`（新建）、`src/app/playbook/registry.ts`
- Task 规格：
  ```
  目标：用 Pencil MCP 读取并移植 Toast、Dialog、EmptyState 三个组件，登记进
  playbook。Dialog 需支持作为受控组件（open/onClose props），Toast 需考虑
  后续被全局挂载调用的方式（导出一个简单的 toast() 函数或 context，具体设计
  以最小可用为原则，不过度工程化）。

  前置任务：P0.1

  允许改动范围：
  - src/components/ui/**
  - src/app/playbook/registry.ts

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 三个组件均可在 /playbook 查看且样式核对一致
  - [ ] 均已登记 registry.ts + 配 demo
  - [ ] Dialog 的 demo 能演示打开/关闭交互（因为 playbook 是活文档，demo 需
        可交互而不是静态截图）

  不在本任务范围内：
  - 不实现 B1/B3/B4 组件
  ```

### P1.3 — B3 导航组件港口（NavItem / TopBar / Sidebar）

- 状态：☑
- 前置任务：P0.1
- 允许改动范围：`src/components/ui/**`（新建）、`src/app/playbook/registry.ts`
- Task 规格：
  ```
  目标：用 Pencil MCP 读取并移植 NavItem、TopBar、Sidebar 三个组件。Sidebar
  的毛玻璃效果（glass-sidebar + background_blur）需用 Tailwind 的
  backdrop-blur 等价实现并核对视觉效果，宽 240、高 fill_container、右侧
  1px 分隔线等尺寸约束需精确对应。

  前置任务：P0.1

  允许改动范围：
  - src/components/ui/**
  - src/app/playbook/registry.ts

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 三个组件均可在 /playbook 查看且样式核对一致（含毛玻璃效果的视觉核对）
  - [ ] 均已登记 registry.ts + 配 demo
  - [ ] Sidebar 组件设计为可接收 children（NavItem 列表）而不是硬编码具体
        导航项，供 Track U 的页面按需组装

  不在本任务范围内：
  - 不实现 B1/B2/B4 组件
  - 不实现页面级的实际导航逻辑（Track U 的范围）
  ```

### P1.4 — B4 业务/节点组件港口（11 个组件，产品灵魂）

- 状态：☑
- 前置任务：P0.1, F0.5（节点类型 taxonomy 已定稿，命名需与组件对齐）
- 允许改动范围：`src/components/ui/**`（新建/按 Pencil 校正既有实现，节点类组件可单独放 `src/components/ui/node/` 子目录）、`src/app/playbook/registry.ts`、`src/features/canvas/types.ts|index.ts|status.ts`（仅收口客户端安全的 canonical NodeStatus）
- Task 规格：
  ```
  目标：用 Pencil MCP 读取并移植 11 个业务组件：ProjectCard、ArtifactChip、
  Node/StageNode、Node/ShotNode、Node/AudioNode、Node/ExportNode、
  QueueStatusBar、TimelineTrack、ContactSheetThumb、SettingsRow、
  SettingsGroup。四个 Node/* 组件的 stroke 颜色对应阶段色 Token
  （$stage-ingest 等），需在组件 props 中开放阶段/状态作为可配置项（不是
  硬编码某一个阶段的颜色），因为运行时同一节点组件要渲染不同状态/不同分镜的
  数据。

  前置任务：P0.1, F0.5

  允许改动范围：
  - src/components/ui/** （节点类组件可放 src/components/ui/node/ 子目录）
  - src/app/playbook/registry.ts
  - src/features/canvas/types.ts、index.ts、status.ts（仅将 canonical NodeStatus
    收口到客户端安全类型层，禁止 UI 重复定义）

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 11 个组件均可在 /playbook 查看且样式核对一致
  - [ ] 均已登记 registry.ts + 配 demo，Node/* 组件的 demo 展示至少两种不同
        状态（如 pending 与 success）以证明状态可配置而非硬编码
  - [ ] Node/* 组件直接复用 F0.5 定稿的 CanvasNodeType 与 canonical NodeStatus；
        PipelineStage 不得再次冒充节点类型，视觉阶段色由 CanvasNodeType 显式派生

  不在本任务范围内：
  - 不实现节点在真实画布（React Flow）中的挂载逻辑（C1.4 的范围，本卡只做
    纯展示组件本体）
  ```

### P1.5 — 图标白名单核查 + Playbook 完整性收口

- 状态：☑
- 前置任务：P1.1, P1.2, P1.3, P1.4
- 允许改动范围：`src/components/icons/**`、`src/components/ui/**/*.demo.tsx`
  （仅修正 demo 图标引用）、`src/app/playbook/**`、设计系统清单与 UI 交接文档
  （仅同步 Pencil 已证实的图标白名单、标准名及 token）
- Task 规格：
  ```
  目标：核查 P1.1~P1.4 移植的全部组件内部使用的图标名，逐一对照设计系统清单
  §6.3 的 Lucide 新命名表，修正任何使用旧名（如 plus-circle）的引用为标准名
  （circle-plus）。核查 registry.ts 是否遗漏任何 canvas.pen 中的 30 个
  reusable 组件，补全缺失条目。

  前置任务：P1.1, P1.2, P1.3, P1.4

  允许改动范围：
  - src/components/icons/**
  - src/components/ui/**/*.demo.tsx（仅修正图标引用）
  - src/app/playbook/**
  - docs/designs/2026-07-23-design-system-inventory.md 与
    docs/designs/2026-07-23-ui-design-handoff.md（仅同步图标/token 规范）

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 全项目搜索确认零处使用设计系统清单 §6.3"旧名"列的图标名
  - [ ] /playbook 明示数量口径：canvas.pen 的 30 个 reusable symbols 中，
        Button 四变体合并为一个 variant 组件，因此登记 27 个 Pencil UI 组件族；
        非 Pencil 视觉原语不得冒充 Track P 登记项
  - [ ] 无 emoji 用作图标的残留引用

  不在本任务范围内：
  - 不新增任何组件的业务逻辑变更，只做命名核查与登记表补全
  ```

---

## Track U — UI（六页面按设计稿实装）

**前置**：**Track P 全部完成**（30 个 Pencil symbols 已港口为 27 个组件族并登记 `/playbook`）、Track C（画布）、Track D（触发阶段的路由）、Track R（触发渲染的路由）均已完成对应 API。UI Track 内部各页面耦合度低，可并行分配给不同会话，但均依赖 [`2026-07-23-ui-design-handoff.md`](../designs/2026-07-23-ui-design-handoff.md) 的逐页规格与 [`2026-07-23-design-system-inventory.md`](../designs/2026-07-23-design-system-inventory.md) 的 Token/组件清单。

**Goal 启动提示词**（Task 数较多，建议按下述方式拆成两个 Goal 顺序启动）：
```
Goal 1：完成 Track U 的 U1.1~U1.4（首页/新建项目对话框/画布主视图/分镜详情页），
依据 docs/specs/2026-07-23-harness-task-breakdown.md 的 Track U 章节执行。
前置条件：Track P、Track C、Track D、Track R 均已完成对应 API。

执行要求：
- 按 U1.1→U1.2→U1.3→U1.4 顺序执行
- 严格只 import Track P 已登记组件，禁止在页面内重新实现任何视觉原语；若发现
  缺失组件，先停下补一张 Track P 任务卡完成移植再回来使用
- 每个 Task 完成后在本文档中把状态由 ☐ 改为 ☑

完成条件：
- [ ] U1.1~U1.4 状态已全部为 ☑
- [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
```
```
Goal 2：完成 Track U 的 U1.5~U1.8（含 U1.6a 全局主题补充卡；导出页/设置页/
暗色主题/端到端 UI 走查），
前置条件：Goal 1（U1.1~U1.4）已完成。

执行要求：
- 按 U1.5→U1.6→U1.7→U1.8 顺序执行
- U1.8 是本 Track 的 Tier B 里程碑收口，需按 §7 使用开发期种子 Key 做一次
  真实 AI 调用的功能性验证

完成条件（达成后才可 update_goal(complete)）：
- [ ] U1.5~U1.8 状态已全部为 ☑
- [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
- [ ] U1.8 的完整路径走查报告已产出（推送进 docs/updates/ 前先由人工审阅）
```

**强制约束（每张 U 任务卡都适用）**：页面只能 `import` Track P 已登记的组件，**禁止在页面文件或页面私有子组件内重新实现任何视觉原语**（Button/Card/StatusPill/NavItem 等）。若发现某页面需要一个 Track P 尚未覆盖的组件，必须先停下补一张 Track P 任务卡完成移植，再回来 `import` 使用，不允许"页面里先临时糊一个"。

**2026-07-24 最新 Pencil 架构校正**：S1–S6、S2 背景及暗色镜像必须统一
使用 `features/navigation/AppShell` 组合 Track P 已登记的 Sidebar/NavItem；
固定结构为 `Sidebar(240) | Main(1200)`，页面只传激活区与可信
projectId/rendererNodeId。`AppShell` 是业务布局组合，不是新视觉原语。该校正
扩展 U1.1/U1.3/U1.4/U1.5/U1.6/U1.7 的允许范围至
`src/features/navigation/**` 及其测试；禁止任何页面继续保留独立 TopNav。

### U1.1 — S1 首页 / 项目列表

- 状态：☑
- 前置任务：Track P 全部完成，Track C 完成（`api/projects` 已可用）
- 允许改动范围：`src/app/page.tsx`、`src/app/_components/**`（若需要页面私有子组件；仅允许拼装 Track P 已登记组件，不新增视觉原语）
- Task 规格：
  ```
  目标：按 UI 设计交接文档 S1 章节的结构、文案（第 8 节复用库原文，禁止发明新
  文案）实装首页：项目列表 + 新建项目入口。只允许 import Track P 已登记的组件
  （ProjectCard、Button、NavItem、Sidebar 等），不允许重新实现任何视觉原语。

  前置任务：Track P 全部完成, Track C 完成

  允许改动范围：
  - src/app/page.tsx
  - src/app/_components/**（页面私有的布局/拼装代码，不得在此重新实现
    src/components/ui 已有的视觉原语）

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] page.tsx 不超过 200 行
  - [ ] 页面文案与设计交接文档 §8 复用库逐字一致，无发明文案
  - [ ] 页面内使用的每个视觉组件均可追溯到 Track P 的 import，零重新实现
  - [ ] 若发现缺失组件，先补一张 Track P 任务卡完成移植后再回来使用，不在本
        卡内临时实现

  不在本任务范围内：
  - 不实现 S2（新建项目对话框）的具体交互（U1.2 的范围）
  ```

### U1.2 — S2 新建项目对话框（脚本提交入口）

- 状态：☑
- 前置任务：U1.1
- 允许改动范围：`src/app/_components/new-project-dialog.tsx`、`new-project-api.ts`
  与对应测试（新建）、
  `src/app/page.tsx`（仅接入触发器）、`src/app/api/projects/**`、
  `src/features/canvas/actions.ts|actions.test.ts`（补齐原子初始 DAG）
- Task 规格：
  ```
  目标：按设计交接文档 S2 章节实装新建项目对话框：标题输入 + 脚本文本域，
  提交后调用 features/canvas 的创建项目接口，成功后跳转到画布页并触发
  语义拆分分镜（调用 api/director/stage，stage=INGEST）。

  前置任务：U1.1

  允许改动范围：
  - src/app/_components/new-project-dialog.tsx、new-project-api.ts 与对应测试
  - src/app/page.tsx（仅接入对话框触发器）
  - src/app/api/projects/**
  - src/features/canvas/actions.ts、actions.test.ts（项目与初始全局 DAG 原子创建）

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 表单校验失败时的错误提示文案取自设计交接文档 §8，不发明新文案
  - [ ] 提交成功后正确触发路由跳转 + 阶段触发调用（可 mock 验证调用参数）
  - [ ] 创建项目在一个事务内同时建立 script-import→shot-split 与
        score→export 初始全局 DAG；API 返回可信 ingestNodeId，客户端不得猜测
  - [ ] 组件文件不超过 150 行

  不在本任务范围内：
  - 不实现画布页本身（Track C1.4 已完成，本卡只做跳转对接）
  ```

### U1.3 — S3 画布主视图整合

- 状态：☑
- 前置任务：C1.4, C1.5, U1.2
- 允许改动范围：`src/app/canvas/**`（在 C1.4/C1.5 骨架基础上补齐 Sidebar/Inspector 布局）、
  `src/features/canvas/queries.ts|fan-out.ts` 与对应测试（补齐 Inspector 所需 stage 读模型）
- Task 规格：
  ```
  目标：按设计交接文档 S3 章节的 Sidebar(240)|Center|Inspector(320) 三栏布局，
  整合 C1.4 已实现的画布核心视图，补齐侧边栏（项目信息/阶段进度）与检视器
  （选中节点详情面板，含触发渲染/触发阶段按钮，对接 api/render 与
  api/director/stage）。

  前置任务：C1.4, C1.5, U1.2

  允许改动范围：
  - src/app/canvas/**
  - src/features/canvas/queries.ts、fan-out.ts 与对应测试（仅补齐节点 stage）

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 三栏布局尺寸与设计交接文档一致（240/自适应/320）
  - [ ] Inspector 面板的按钮点击能正确调用对应 API 路由（可用集成测试或手动
        验证描述确认）
  - [ ] 分镜通道创建时持久化唯一 stage 映射，Inspector 使用服务端返回的 stage，
        禁止客户端按节点类型猜测
  - [ ] 页面整体文件组织遵循 page.tsx ≤200 行的约束，超出部分拆分子组件

  不在本任务范围内：
  - 不实现 S4 分镜详情页（U1.4 的范围）
  ```

### U1.4 — S4 分镜详情页（预览 + 单独导出）

- 状态：☑
- 前置任务：R1.6, U1.3
- 允许改动范围：`src/app/canvas/shot/[id]/**`、`src/app/api/jobs/[id]/**`、
  `src/app/api/artifacts/[id]/**`、`src/features/artifacts/**`、
  `src/lib/queue/query.ts|index.ts`（补齐真实轮询与安全产物读取边界）
- Task 规格：
  ```
  目标：按设计交接文档 S4 章节实装分镜详情页：展示该分镜的代码生成结果预览
  （HTML iframe 或等价渲染），提供"单独导出"按钮对接 api/render 触发该分镜
  的独立渲染，展示渲染状态与最终 mp4 下载/预览入口。

  前置任务：R1.6, U1.3

  允许改动范围：
  - src/app/canvas/shot/[id]/**（若设计稿路由路径不同，以设计稿为准并说明调整
    理由）
  - src/app/api/jobs/[id]/**、src/app/api/artifacts/[id]/**
  - src/features/artifacts/**、src/lib/queue/query.ts|index.ts

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 预览区域不触发确定性违规（预览渲染路径与正式渲染路径复用同一套确定性
        约束）
  - [ ] 单独导出按钮点击后正确触发单镜渲染并展示状态轮询
  - [ ] 作业查询按 projectId 隔离；产物通过 artifact id 受控读取，页面不接触
        StorageAdapter 裸路径或本机绝对路径
  - [ ] page.tsx ≤200 行

  不在本任务范围内：
  - 不实现全局合并导出页面（U1.5 的范围）
  ```

### U1.5 — S5 导出页（合并导出）

- 状态：☑
- 前置任务：R1.6, U1.3
- 允许改动范围：`src/app/canvas/export/**`、`src/app/api/render/export/**`、
  `src/features/render/export-service.ts` 与对应测试（补齐 readiness 与受控终片 URL）
- Task 规格：
  ```
  目标：按设计交接文档 S5 章节实装导出页：展示全部分镜通道的完成状态汇总，
  全部完成后启用"合并导出"按钮，对接 api/render/export，展示导出进度与终片
  下载/预览入口；若存在未完成分镜，明确列出并禁用导出按钮。

  前置任务：R1.6, U1.3

  允许改动范围：
  - src/app/canvas/export/** 
  - src/app/api/render/export/**
  - src/features/render/export-service.ts 与对应测试

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 未完成分镜场景下导出按钮禁用状态与文案符合设计交接文档
  - [ ] 导出成功后终片可直接预览或下载
  - [ ] API 不向浏览器暴露 outputKey，只返回 artifact-id 受控 URL
  - [ ] page.tsx ≤200 行

  不在本任务范围内：
  - 不实现设置页（U1.6 的范围）
  ```

### U1.6 — S6 设置页（StepFun Key 等）

- 状态：☑
- 前置任务：F0.3
- 允许改动范围：`src/app/settings/**`、`src/app/api/settings/**`
  （修正为先 validate、成功后 save，并补测试）
- Task 规格：
  ```
  目标：按设计交接文档 S6 章节实装设置页：StepFun API Key 输入与保存（对接
  已有 api/settings 与 stepfun-adapter 的 saveApiKey/validateKey），保存前先
  调用 validateKey 校验，失败给出明确错误提示。

  前置任务：F0.3

  允许改动范围：
  - src/app/settings/**
  - src/app/api/settings/**（仅 validate-before-save 合同与测试）

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] Key 输入框不以纯文本明文常驻显示（遵循常见密钥输入 UI 惯例，如
        password 类型 + 显示/隐藏切换）
  - [ ] 校验失败/成功的提示文案取自设计交接文档 §8
  - [ ] 页面不将 Key 值打印到浏览器 console 或写入客户端可见的任何日志
  - [ ] 服务端校验失败时绝不覆盖已有已验证 Key

  不在本任务范围内：
  - 不实现暗色主题切换开关本身的全局状态管理（若设计稿要求全局主题切换，
    单列一张后续任务卡，本卡只做设置页表单本身）
  ```

### U1.6a — 全局主题状态（U1.7 前置补充卡）

- 状态：☑
- 前置任务：U1.6
- 允许改动范围：`src/app/layout.tsx`、`src/app/settings/theme-control.tsx`
  与测试、`src/app/settings/settings-form.tsx`（仅接入）
- Task 规格：
  ```
  目标：补齐 U1.7 明确要求“缺失则先提出补充任务卡”的全局主题机制。三段控件
  使用 light/dark/system 稳定值，写入本机 localStorage；根布局首屏脚本在 React
  hydration 前应用 .dark，system 正确跟随 prefers-color-scheme，避免闪屏。

  完成条件：
  - [x] light/dark/system 解析有单元测试
  - [x] 设置页只复用已登记 SegmentedControl，不实现新视觉原语
  - [x] 不改业务数据或服务端设置表
  ```

### U1.7 — 暗色主题（Zone D 页面镜像）

- 状态：☑
- 前置任务：U1.1~U1.6a 全部完成
- 允许改动范围：全部已实装页面的样式层（Tailwind class / Design Token 引用），不改业务逻辑
- Task 规格：
  ```
  目标：为 U1.1~U1.6 已实装的六个页面补齐暗色主题样式，严格复用设计系统清单中
  的暗色专属 Token（glass/on-accent/*-fill 等），不新增未在 Token 体系中定义
  的颜色值。

  前置任务：U1.1, U1.2, U1.3, U1.4, U1.5, U1.6

  允许改动范围：
  - 以上六个任务已创建的所有页面/组件文件（仅样式相关改动）

  完成条件：
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 全部改动为样式类调整，未修改任何组件的业务逻辑代码
  - [ ] 暗色下的颜色值均可追踪到设计系统清单定义的 Token，无硬编码
  - [ ] 六个页面在暗色模式下与设计交接文档 Zone D 章节逐页核对一致

  不在本任务范围内：
  - 不实现主题切换开关的交互逻辑本身（若尚不存在，需先确认是否已有全局主题
    状态机制，缺失则提出补充任务卡建议，不在本卡内临时新增）
  ```

### U1.8 — 端到端 UI 走查（Tier B 里程碑收口）

- 状态：◐（2026-07-23 e2e 首次发现 directorInput 缺口后，2026-07-24 二次走查确认 INGEST→DIRECT→SHOT_SPEC→FABRICATE→单镜渲染→MP4 全部真实跑通，见 `docs/updates/2026-07-24-u1.8-demo-e2e-walkthrough.md`；但同一次深度审查进一步发现画布 Inspector/分镜通道折叠面板、分镜渲染器页、合成导出页存在系统性"UI 已搭建但未接入真实数据"缺口，且 ASSEMBLE/FINALIZE 的 directorInput 组装仍未覆盖——这些新发现的缺口已按低耦合模块拆分进 `docs/issues/known-issues.md`（Track H），不在本卡范围内直接修复）
- 前置任务：U1.1~U1.7 全部完成
- Task 规格：
  ```
  目标：作为 UI Track 的里程碑收口，Codex 自主走查一次完整用户路径：
  首页→新建项目（提交脚本）→画布（触发语义拆分，观察分镜通道物化）→
  任一分镜详情页（触发单镜渲染，验证产物存在）→导出页（验证未完成时导出
  按钮禁用逻辑）→设置页（验证 Key 保存/校验路径）。使用 §7 的开发期种子
  Key 完成一次真实 AI 调用的功能性验证（不要求视觉效果好，只验证链路不报错、
  产物格式正确）。

  U1.8 前置架构校正：若走查发现 INGEST 成功结果没有物化分镜，或 FABRICATE
  成功结果没有形成 Render 可消费的可信 renderSpec，应先修正阶段结果提交协议，
  并同步总纲、平台架构与 AGENTS.md。校正后的顺序必须是“类型化归一→artifact
  门禁→应用副作用提交→success”；Demo INGEST 禁止让模型猜测音频数据。

  前置任务：U1.1, U1.2, U1.3, U1.4, U1.5, U1.6, U1.7

  完成条件：
  - [ ] 全量 pnpm lint && pnpm tsc --noEmit && pnpm build 三连绿
  - [ ] 上述完整路径每一步均有明确的通过/失败记录，产出一份里程碑报告草稿
        （内容后续由人工追加进 docs/updates/）
  - [ ] 记录本次走查中发现的任何规范缺口或设计稿与实现的偏差，作为遗留问题
        列出，不在本卡内擅自修复超出范围的问题

  不在本任务范围内：
  - 不做视觉效果的主观评价（这部分是人工验收职责，见总纲 §8.3）
  ```

---

## Track H — 系统性前后端打通修复（详见 `docs/issues/`）

**背景**：2026-07-24 深度审查发现，虽然 Track C/D/R/P/U 的 Tier A/Tier B 验收已通过，但画布 Inspector/分镜通道折叠面板、分镜渲染器页、合成导出页存在系统性"前端组件已搭建但未接入真实数据"的缺口，核心根因见 §3.5.2（六阶段输入契约缺口）与 AGENTS.md「UI 字段真实性门禁」——既往验收标准只测"按钮点击是否触发对应 API"，未测"页面展示的每个字段是否真实"。

**与本文档其余 Track 的关系**：Track H 不新建 Task 卡片格式的完整规格（避免本文档进一步膨胀），具体的目标/前置任务/允许改动范围/禁止改动/完成条件维护在 `docs/issues/issue-NN-*.md`，本节只登记索引、优先级与依赖关系，供后续 Codex Goal 会话直接引用对应 issue 文件作为 Task 规格来源。

**总索引**：[`docs/issues/known-issues.md`](../issues/known-issues.md)

| Issue | 优先级 | Wave | 依赖 | 一句话目标 |
|---|---|---|---|---|
| `issue-01-director-stage-input-contract-completion` | P0 | 1 | 无 | ✅ 已完成（2026-07-24，`11435c5`）：补齐 ASSEMBLE/FINALIZE 的 `directorInput` 真实组装，使六阶段无 mock 全部跑通 |
| `issue-02-stepfun-key-validation-strategy` | P0 | 1 | 无 | ✅ 已完成（2026-07-24，`c50637e`）：修复 `validateKey()` 用 `models.list()` 导致有效 Key 也判定失败的问题 |
| `issue-03-canvas-inspector-data-truthfulness` | P1 | 2 | 部分展示依赖 issue-01 | ✅ 已完成（2026-07-24，`fe7c1b2`）：Inspector 的内容哈希/合同 chips/进度/查看代码改为真实数据 |
| `issue-04-shot-thumbnail-infrastructure` | P1 | 2 | 无 | ✅ 已完成（2026-07-24，`48cd5c5`）：新增共享的分镜静态帧缩略图生成能力（`features/render/thumbnail.ts`） |
| `issue-05-shot-renderer-page-wiring` | P1 | 3 | issue-04 | ✅ 已完成（2026-07-24，待提交）：分镜渲染器页面播放器/缩略图/历史产物真实打通（新增 `GET /api/render/thumbnails` + `shot-server-data.ts`） |
| `issue-06-export-configurable-params-and-real-qa` | P1 | 4 | issue-04；建议 issue-01 后回归 | ✅ 已完成（2026-07-24，待提交）：3 档 9:16 分辨率预设可配置（导出时 ffmpeg scale，默认预设零回归）+ Final QA（`jimp` 黑帧/纯色检测写回 `shot-qa` 节点）；`export-settings` 因模块边界置于 `features/canvas` |
| `issue-07-canvas-lane-panel-summary` | P2 | 2 | 无 | ✅ 已完成（2026-07-24，`29bba21`）：分镜通道折叠面板补充子节点真实状态摘要 |
| `issue-08-export-service-storage-adapter-boundary` | P2 | 2 | 无 | ✅ 已完成（2026-07-24，`19fe79b`）：`export-service.ts` 裸 `fs` 改走 `StorageAdapter` |
| `issue-09-stream-singleton-split-brain-and-replay` | P0 | 5 | 无 | ✅ 已完成（2026-07-24）：统一 stream/queue/db 进程内单例并补终态回放 |
| `issue-10-stepfun-config-resolver-and-model-settings` | P0 | 5 | 无 | ✅ 已完成（2026-07-24，`208e6a3`）：StepFun 六项配置统一 resolver + 设置页真实值 |
| `issue-11-one-click-pipeline-auto-advance` | P1 | 6 | 软依赖 issue-09 | ◐ 实现完成（2026-07-24）：服务端 DAG 自动推进 + 项目 autopilot + 一键启停；真实端测待本 Goal 统一执行 |
| `issue-12-tts-asr-vision-model-wiring-gap` | P2 | 7 | issue-10 | ◐ 实现完成（2026-07-24）：真实 TTS 配音 + ASR 词级字幕 + 规则/Vision 双层 QA；真实端测待本 Goal 统一执行 |
| `issue-13-fabricate-gate-feedback-retry` | P2 | 7 | 建议 issue-11 后串行 | ✅ 已完成（2026-07-24）：FABRICATE/SHOT_SPEC 门禁同会话最多 2 轮有界反馈重试 |

推进顺序遵循 Wave 分组（同 Wave 内可并行）：Wave 1（issue-01/02）→ Wave 2（issue-03/04/07/08，可与 Wave 1 尾声并行）→ Wave 3（issue-05）→ Wave 4（issue-06）→ Wave 5（issue-09/10）→ Wave 6（issue-11）→ Wave 7（issue-12/13）。

**Goal 启动提示词模板**（每个 issue 建议独立一次 Goal，不强制合并）：
```
Goal：完成 docs/issues/issue-NN-*.md 描述的修复，严格按该文件的目标/允许改动范围/
禁止改动/完成条件执行。

执行要求：
- 落笔前先重新核实该 issue 引用的文件是否已被后续提交修改（行号/路径可能已偏移）
- 完成后运行 pnpm lint && pnpm tsc --noEmit（涉及 src/ 改动时还需 pnpm build 与相关测试）
- 在 docs/issues/known-issues.md 对应行更新状态

完成条件：
- [ ] issue 文件列出的完成条件全部满足
- [ ] pnpm lint / pnpm tsc --noEmit 通过（如涉及测试变更，pnpm test 通过）
- [ ] known-issues.md 状态已同步
```

---

## 任务卡总览统计

| Track | 任务数 | 说明 |
|---|---|---|
| F（地基） | 7 | 必须最先完成，严格顺序 |
| C（画布） | 5 | 依赖 F0.4/F0.5 |
| D（Director：方法论移植 + Pi 编排） | 7 | D0.1/D0.2 为方法论移植，无外部 Skill 依赖；D1.x 依赖 F0.1 结论 |
| R（渲染） | 6 | 依赖 F0.6/F0.7 |
| P（Pencil 组件港口，SSOT 强制） | 6 | 必须排在 Track U 之前完成 |
| A（音频，Demo 占位） | 1 | P1 真实实现延后 |
| U（UI） | 9 | 依赖 Track P + C/D/R 对应 API；含 U1.6a 主题状态补充卡 |
| H（系统性打通修复，详见 `docs/issues/`） | 13 | U1.8 里程碑收口后两轮审查发现，详细 Task 规格在 `docs/issues/`，不在本文档重复维护 |
| **合计** | **53** | 另有 Tier B 里程碑验收穿插在每个 Track 完成后触发，不单独计入任务数 |

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-07-23 | 初版发布，32 张任务卡覆盖 Foundation/Canvas/Director/Render/Audio/UI 六条 Track |
| 2026-07-23（修订） | **架构纠正**：Track D 新增 D0.1/D0.2（video-director 方法论移植为原生 Zod schema + prompt 模板），D1.1/D1.2 措辞改为"裸 tool-calling 引擎，不挂 Skill"；新增 **Track P — Pencil 组件港口**（6 张任务卡，`canvas.pen` 30 个组件通过 Pencil MCP 一比一移植 + 登记 `/playbook`），并设为 Track U 的强制前置；Track U 全部任务卡改为"只 import Track P 组件，禁止重新实现"；任务卡合计 32→40 |
| 2026-07-23（修订二） | **Goal/Task 粒度纠正**：更正"一张任务卡=一次 Goal"的错误理解为"一个 Track=一次 Goal，Track 内的任务卡是 Codex 在该 Goal 会话内部自主拆解执行的 Task"；每张卡片标签由「Goal 提示词」改为「Task 规格」；为每个 Track 新增独立的「Goal 启动提示词」区块（Track U 因 Task 数较多拆成两个顺序 Goal）；同步更新总纲 §9 |
| 2026-07-23（修订三） | **Pi SDK 口径纠正**：F0.1 实测确认 `createAgentSession()` 只由 `pi-coding-agent` 导出；F0.1/D1.1 改为 `pi-agent-core Agent + JsonlSessionRepo + createDirectorSession()`，继续禁止 Skills/Extensions。 |
| 2026-07-23（修订四） | **DirectorSession 持久化边界**：D1.1 新增 session-store.ts，采用 Agent 事件单写入 + JSONL 恢复注入；D1.3 要求成功/失败路径均登记相对 pi-session storageKey。 |
| 2026-07-23（修订五） | **Canvas 读模型缺口**：C1.4 补充 `queries.ts#getCanvasGraph(projectId)` 与隔离测试，页面经 features 读模型取节点/边，禁止在 `page.tsx` 直接访问数据库。 |
| 2026-07-23（修订六） | **六阶段 prompt 文件漏项**：D0.2 允许范围补齐 `assemble.ts` 与 `finalize.ts`，使文件清单与任务目标中的 INGEST/DIRECT/SHOT-SPEC/FABRICATE/ASSEMBLE/FINALIZE 一致。 |
| 2026-07-23（修订七） | **阶段 Tool 注入缺口**：D1.1 明确 `DirectorSession.run({prompt, tools})` 接受项目自有 `DirectorTool`，由会话适配层转换为 Pi Tool，D1.3 无需越界操作 Agent。 |
| 2026-07-23（修订八） | **Director 执行链重构**：D1.3–D1.5 增加持久 `directorInput`、类型化 prompt 路由、repository 端口与 pending 前置；队列启动改用 Next 根 `instrumentation.ts`，API 只调用领域 enqueue。 |
| 2026-07-23（修订九） | **Agent 写权限收口**：D1.2 的 write-artifact 改为 stage runner 专用应用服务，Pi 仅获得诊断 Tool，消除模型决定归属/路径与重复落盘风险。 |
| 2026-07-23（修订十） | **入队非原子补偿**：D1.4 明确 enqueue 失败必须把已 pending 节点补偿到 failed 并记录错误，避免不可恢复的悬挂状态。 |
| 2026-07-23（修订十一） | **入队前置校验**：D1.4 在改状态前验证 project/node/stage/可入队状态，确保 API 的 jobId 表示领域规则已接受。 |
| 2026-07-23（修订十二） | **Render 链路重构**：R1.1–R1.6 增加显式 shot runtime、复用 capture session、磁盘帧序列、可信 Render repository/export service、统一 instrumentation 与内容寻址提交，消除内存爆炸和 API 无输入来源问题。 |
| 2026-07-24（修订十三） | **U1.8 暴露的阶段提交断点**：补充类型化阶段结果协议；INGEST 成功必须事务性物化分镜通道，FABRICATE renderSpec 必须由可信 allocation 与上下文派生，禁止“模型返回即 success”。 |
| 2026-07-24（修订十四） | **U1.8 暴露的 Windows 编码断点**：`ffmpeg-static` 必须保持 Next server external，避免生产 bundle 将真实二进制路径改写为 `/ROOT` 后导致 `spawn ENOENT`。 |
| 2026-07-24（修订十五） | **U1.8 暴露的哈希语义冲突**：输入派生 renderKey 只负责缓存寻址；`artifacts.contentHash` 与 RenderResult 必须保存最终 MP4 实体 SHA-256。 |
| 2026-07-24（修订十六） | **最新 Pencil 应用壳纠偏**：S1–S6、S2 背景与暗色镜像统一为常驻 Sidebar；补充唯一 `features/navigation/AppShell` 边界，S4 恢复预览/代码/合同三栏，S5 禁止示例常量冒充真实项目投影。 |
| 2026-07-24（修订十七） | **新增 Track H — 系统性前后端打通修复**：U1.8 里程碑收口后的深度审查发现画布 Inspector/分镜通道折叠、分镜渲染器页、合成导出页存在系统性 UI 字段真实性缺口，且 ASSEMBLE/FINALIZE 的 `directorInput` 组装仍未覆盖（对应修正 C1.1/D1.3/U1.8 状态描述为精确表述）；8 个具体修复模块按低耦合原则拆分进 `docs/issues/`（索引见 `known-issues.md`），本文档只登记 Track H 索引不重复维护 Task 卡细节；任务卡合计 40→48。 |
