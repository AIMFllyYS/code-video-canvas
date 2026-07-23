# AI 开�?Harness —�?任务拆解�?Goal 模式执行清单

> Created: 2026-07-23
> Updated: 2026-07-23
> Status: approved（配�?[`2026-07-23-ai-development-harness.md`](./2026-07-23-ai-development-harness.md) 使用�?

## 使用说明

- 本文档是 §9（Goal 模式协作协议）的具体落地。每张任务卡对应 Codex 的一�?`/goal` 生命周期�?
- 任务卡按 Track 分组，Track 内按序号严格顺序执行（有前置依赖）；不同 Track 之间若无交叉依赖可并行分配给不同会话�?
- **Track 依赖速览**：F（地基）最先；C/D/R/P 可在 F 完成后并行推进；**Track P 必须�?Track U 开始前完成**（U 的每张卡都要�?�?import Track P 组件"）；A 依赖 C/D�?
- **Track D 不依赖任�?Pi Skills 机制**：D0.1/D0.2 是把 `docs/video-director/` 的方法论移植为本项目原生 TypeScript 代码（Zod schema + prompt 模板），D1.x 只把 Pi 当作裸的 tool-calling 循环引擎使用�?
- 每张卡执行前，先确认「前置任务」已全部通过 Tier A 验收�?
- 每张卡的「Goal 提示词」可直接复制�?Codex 作为 `/goal` �?objective + 附加说明�?
- Track 全部完成后执行一�?Tier B 里程碑验收（见总纲 §8.2），产出报告追加�?`docs/updates/`�?
- 状态列：`☐` 未开�?· `◐` 进行�?· `☑` 完成。执行时请在本文件中就地勾选，保持台账唯一可信�?

---

## Track F �?Foundation（地基验证与骨架补齐�?

**目的**：验证总纲里标记为"未实�?的架构假设，补齐缺失依赖与字段，避免后续 Track 建立在错误假设上�?*必须最先完成，且内部严格顺序执�?*（F0.1 的结论直接决�?F0.2~F0.7 怎么写）�?

### F0.1 �?Spike：Pi Agent + StepFun 自定�?Provider 可行性验�?

- 状态：�?
- 前置任务：无
- 允许改动范围�?
  - 新建 `scripts/spikes/pi-stepfun-probe.ts`（一次性验证脚本，不进生产路径�?
  - `package.json`（新�?`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai` �?devDependency，因为此阶段只是验证，不确定是否采纳�?
- 禁止改动�?
  - `src/features/director/**`、`src/features/ai/**` 的现有文件（本卡只验证，不重构）
- Goal 提示词：
  ```
  目标：编写一个一次性验证脚本，确认 @earendil-works/pi-ai 能否�?StepFun
  （OpenAI 兼容端点，环境变�?STEPFUN_API_KEY / STEPFUN_BASE_URL / STEPFUN_CHAT_MODEL�?
  注册为自定义 Provider，并通过 @earendil-works/pi-agent-core �?
  createAgentSession() 发起一次最简单的单轮对话（如"回复 OK"）拿到响应�?

  前置任务：无

  允许改动范围�?
  - scripts/spikes/pi-stepfun-probe.ts（新建）
  - package.json（仅新增两个 devDependency，不改动已有依赖版本�?

  禁止改动�?
  - src/features/director/**
  - src/features/ai/**

  完成条件�?
  - [ ] 脚本可通过 `pnpm tsx scripts/spikes/pi-stepfun-probe.ts` 独立运行
  - [ ] 脚本运行结果（成功或具体失败原因）以结构化方式打印到 stdout
  - [ ] 若失败，打印完整错误堆栈�?pi-ai Provider 配置的确切写法，供后续判断走哪条退回方�?
  - [ ] 不将 STEPFUN_API_KEY 原始值打印到 stdout 或写入任何文�?
  - [ ] pnpm tsc --noEmit 通过（脚本本身类型正确）

  不在本任务范围内�?
  - 不要修改 features/director �?features/ai 的任何生产代�?
  - 不要决定最终架构方案，只输出验证结�?
  ```
- 验收后动作：根据脚本结论，人工在总纲 §3.2 补记最终结论（是否�?Pi 原生 Provider，或退�?`LlmAdapter` 转发方案），并据此决�?Track D 的具体写法�?

### F0.2 �?`.env` 契约核查与修�?

- 状态：�?
- 前置任务：F0.1（需要知道最终选用哪个 chat 模型名）
- 允许改动范围：`.env.example`、`docs/specs/2026-07-23-ai-development-harness.md`（仅 §7.3 变量清单表格，不改其他章节）
- 禁止改动：`.env`、`.env.local`（这些文件属于用户本地机密配置，Codex 不应写入或提交）
- Goal 提示词：
  ```
  目标：核�?StepFun 可用模型列表与当前代码默认值（stepfun-adapter.ts 中的
  step-2-mini、默�?base URL）是否一致，若不一致，更新 .env.example 为可用的
  真实占位变量名与说明注释（不含真实密钥值），并同步更新总纲文档 §7.3 的变量清单表格�?

  前置任务：F0.1

  允许改动范围�?
  - .env.example
  - docs/specs/2026-07-23-ai-development-harness.md（仅 §7.3 章节内容�?

  禁止改动�?
  - .env
  - .env.local
  - src/features/ai/stepfun-adapter.ts（本卡只核查契约，不改实现；实现修正�?F0.3�?

  完成条件�?
  - [ ] .env.example 中每个变量都有中文注释说明用�?
  - [ ] 变量名与总纲 §7.3 表格完全一�?
  - [ ] 未包含任何真实密钥�?
  - [ ] git diff 仅涉及上述两个文�?

  不在本任务范围内�?
  - 不修�?stepfun-adapter.ts 的默认模型常量（留给 F0.3�?
  ```

### F0.3 �?修正 `stepfun-adapter.ts` 默认模型�?base URL

- 状态：�?
- 前置任务：F0.2
- 允许改动范围：`src/features/ai/stepfun-adapter.ts`、`src/features/ai/stepfun-adapter.test.ts`（新建，若不存在�?
- 禁止改动：`src/features/ai/types.ts`（接口不变，只改实现内的默认值）
- Goal 提示词：
  ```
  目标：将 stepfun-adapter.ts 中的默认模型常量�?base URL 修正�?F0.2 核实过的
  真实可用值，默认值来源优先级为环境变�?STEPFUN_CHAT_MODEL/STEPFUN_BASE_URL�?
  无环境变量时才使用代码内 fallback 常量。补充一个单元测试验证优先级逻辑
  （不需要真实网络调用，mock OpenAI 客户端构造参数即可）�?

  前置任务：F0.2

  允许改动范围�?
  - src/features/ai/stepfun-adapter.ts
  - src/features/ai/stepfun-adapter.test.ts

  禁止改动�?
  - src/features/ai/types.ts
  - src/lib/db/schema.ts

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 新增测试覆盖"环境变量优先于代码默认�?的行为，且测试不发起真实网络请求
  - [ ] createClient �?baseURL 参数来源可追踪到 STEPFUN_BASE_URL
  - [ ] 现有 validateKey/StepfunAdapter 对外接口签名不变（不破坏调用方）

  不在本任务范围内�?
  - 不引�?Pi Agent 相关代码（那�?Track D 的范围）
  ```

### F0.4 �?DB 迁移：`canvas_nodes` 新增状态与哈希字段

- 状态：�?
- 前置任务：无（可�?F0.1~F0.3 并行�?
- 允许改动范围：`src/lib/db/schema.ts`、`src/lib/db/migrations/**`（新迁移文件）、`src/lib/db/schema.test.ts`
- 禁止改动：`canvas_nodes` 表已有字段的类型/约束（只做新增列，不改现有列�?
- Goal 提示词：
  ```
  目标：为 canvas_nodes 表新增四个字段：status（text，枚�?
  idle|pending|running|success|failed|stale，默�?idle）、contentHash
  （text，nullable）、laneKey（text，nullable）、laneRole（text，nullable）�?
  �?drizzle-kit 生成对应迁移文件，并更新 schema.test.ts 覆盖新字段的默认值行为�?

  前置任务：无

  允许改动范围�?
  - src/lib/db/schema.ts
  - src/lib/db/migrations/**（生成的新迁移文件，不要手改已存在的历史迁移文件�?
  - src/lib/db/schema.test.ts

  禁止改动�?
  - projects / canvas_edges / jobs / artifacts / settings 表定�?
  - canvas_nodes 已有字段（id/projectId/type/stage/position/data/createdAt�?

  完成条件�?
  - [ ] pnpm db:generate 产出的迁移文件已提交
  - [ ] pnpm tsc --noEmit 通过
  - [ ] 新增测试：插入一�?canvas_nodes 不传 status，读出应�?'idle'
  - [ ] 新增测试：contentHash/laneKey/laneRole 允许�?null
  - [ ] 未修改任何已有测试的断言（不破坏回归�?

  不在本任务范围内�?
  - 不修�?CanvasNodeType �?taxonomy（那�?F0.5 的范围，避免一次迁移做两件事）
  ```

### F0.5 �?节点类型 taxonomy 重新设计（破坏性变更）

- 状态：�?
- 前置任务：F0.4
- 允许改动范围：`src/features/canvas/types.ts`、`src/features/canvas/schemas.ts`、所有引�?`CanvasNodeType` 的现有文件（先用 grep 全项目定位引用点后逐一更新�?
- 禁止改动：数据库 schema（本卡只�?TS 类型层，不再�?DB；`type` 列本身是自由 text，不需要迁移）
- Goal 提示词：
  ```
  目标：将 CanvasNodeType 从当前的 ingest|direct|shot-spec|shot|assemble|finalize
  （这�?阶段"命名，与"节点类型"概念混淆）替换为两类节点类型的联合类型：
  全局单例类型 script-import|shot-split|score|export�?
  分镜通道类型 shot-script|shot-codegen|shot-sfx|shot-subtitle|shot-qa�?
  全项目搜�?CanvasNodeType 及其字符串字面量的引用点并同步更新�?

  前置任务：F0.4

  允许改动范围�?
  - src/features/canvas/types.ts
  - src/features/canvas/schemas.ts
  - 项目内所有实际引用旧节点类型字符串字面量的文件（先搜索确认范围，改动前列出清单）

  禁止改动�?
  - src/lib/db/schema.ts（type 列类型不变，仍是自由 text�?

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 全项目搜索旧类型字面量（ingest/direct/shot-spec/shot/assemble/finalize 作为
        CanvasNodeType 用途的），确认零残留引�?
  - [ ] schemas.ts 中为每种新节点类型的 data payload 补充最�?Zod schema（可先用
        z.record(z.unknown()) 占位，但必须有类型对应的 schema 键存在）
  - [ ] 变更说明中列出本次改动影响的文件清单

  不在本任务范围内�?
  - 不实�?fan-out 物化逻辑（Track C 的范围）
  - 不修�?features/director/pipeline.ts 的阶段命名（阶段命名�?PipelineStage�?
    与节点类型是两个独立的类型，不要合并�?
  ```

### F0.6 �?引入渲染管线依赖（playwright + ffmpeg-static�?

- 状态：�?
- 前置任务：无（可并行�?
- 允许改动范围：`package.json`、`.gitignore`（若需排除 playwright 浏览器缓存目录）
- 禁止改动：`src/features/render/**`（本卡只装依赖，不写实现，实现是 Track R�?
- Goal 提示词：
  ```
  目标：将 playwright（含自动下载�?Chromium）与 ffmpeg-static 加入生产依赖�?
  执行安装并确�?Chromium 可在当前环境无头启动一次（用一次性验证脚本，跑完即删）�?

  前置任务：无

  允许改动范围�?
  - package.json
  - .gitignore（若 playwright 产生需忽略的本地缓存路径）

  禁止改动�?
  - src/features/render/**

  完成条件�?
  - [ ] pnpm install 成功，两个包出现�?dependencies
  - [ ] 一次性验证：无头 Chromium 能启动并关闭，不留后台进�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 验证脚本执行后已删除，不留在仓库�?

  不在本任务范围内�?
  - 不编写任何截�?编码逻辑（Track R 范围�?
  ```

### F0.7 �?确定性守卫扩展：覆盖检查范围与 CI �?

- 状态：�?
- 前置任务：无（可并行�?
- 允许改动范围：`src/lib/determinism/**`
- 禁止改动：`src/features/render/**`、`src/features/canvas/**`
- Goal 提示词：
  ```
  目标：核查现�?lib/determinism/check.ts 的扫描范围是否覆�?AI 生成�?shot HTML
  字符�?这一输入源（当前测试可能只覆盖静态文件路径场景），若不覆盖，补充一�?
  对字符串内容直接扫描的导出函�?checkSource(html: string): DeterminismViolation[]�?
  �?Track D �?Tool 边界调用�?

  前置任务：无

  允许改动范围�?
  - src/lib/determinism/check.ts
  - src/lib/determinism/check.test.ts
  - src/lib/determinism/index.ts（若存在，补充导出）

  禁止改动�?
  - src/lib/determinism/rules.ts（规则集合本身已定义，不在本卡扩充规则，除非发现
    明显缺口需在完成汇报中提出建议，不擅自新增规则条目�?

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 新增测试：对含有 setTimeout 的字符串调用 checkSource 应返回非空违规列�?
  - [ ] 新增测试：对合规字符串调�?checkSource 应返回空数组
  - [ ] 现有基于文件路径的检查函数行为不变（不破坏既有调用方�?

  不在本任务范围内�?
  - 不在本卡内接�?Track D �?Tool（那�?D1.3 的范围，本卡只准备好被调用的函数�?
  ```

---

## Track C �?Canvas DAG（画布数据模�?+ fan-out 物化 + 布局�?

**前置**：Track F 全部完成（尤�?F0.4/F0.5）�?

### C1.1 �?`fan-out.ts`：分镜通道物化

- 状态：�?
- 前置任务：F0.4, F0.5
- 允许改动范围：`src/features/canvas/fan-out.ts`（新建）、`src/features/canvas/fan-out.test.ts`
- 禁止改动：`src/features/canvas/actions.ts`、`queries.ts`（不要把物化逻辑塞进这两个文件）
- Goal 提示词：
  ```
  目标：实�?fan-out.ts，导出函�?materializeShotLanes(projectId, shotIds: string[])�?
  给定分镜 ID 数组，为每个分镜 ID 批量创建 5 个通道节点（类�?
  shot-script/shot-codegen/shot-sfx/shot-subtitle/shot-qa，laneKey=该分镜ID�?
  laneRole=节点类型），并在通道内部按顺序建立单向边（脚本→代码→音效→字幕→验收）�?
  同时为每个通道的首节点建立"来自语义拆分节点"的边、为每个通道的末节点建立
  "指向配乐节点"的边。全部操作必须在单个事务内完成（要么全部成功要么全部回滚）�?

  前置任务：F0.4, F0.5

  允许改动范围�?
  - src/features/canvas/fan-out.ts
  - src/features/canvas/fan-out.test.ts

  禁止改动�?
  - src/features/canvas/actions.ts
  - src/features/canvas/queries.ts
  - src/lib/db/schema.ts

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：给�?3 �?shotId，断言产出 15 个通道节点 + 正确数量的边
  - [ ] 单测：模拟事务中途失败，断言不留下部分写入的脏数�?
  - [ ] 单测：重复调用同一�?shotId 不产生重复节点（幂等性，�?laneKey+laneRole
        唯一性检查或等价机制�?
  - [ ] 函数不触发任何渲�?AI调用，只做纯数据库写�?

  不在本任务范围内�?
  - 不实现自动布局坐标计算（C1.2 的范围，本卡可用占位坐标 {x:0,y:0}�?
  - 不实现节点状态转移逻辑（C1.3 的范围）
  ```

### C1.2 �?`layout.ts`：自动布局算法

- 状态：�?
- 前置任务：C1.1
- 允许改动范围：`src/features/canvas/layout.ts`（新建）、`layout.test.ts`、`package.json`（新�?dagre 或等价轻量布局库依赖）
- 禁止改动：`fan-out.ts`（布局是独立后处理步骤，不要合并进物化事务�?
- Goal 提示词：
  ```
  目标：实�?layout.ts，导出函�?computeLayout(nodes, edges): Map<nodeId, {x,y}>�?
  用轻量自动布局库（�?dagre）为 C1.1 产出的拓扑计算坐标：全局单例节点在最外层
  横向主干上，每个分镜通道在主干下方纵向排列成一条独立的横向轨道（同一通道 5 �?
  节点从左到右），不同分镜通道之间纵向间隔固定�?

  前置任务：C1.1

  允许改动范围�?
  - src/features/canvas/layout.ts
  - src/features/canvas/layout.test.ts
  - package.json（新增一个布局库依赖，选型需在完成汇报中说明理由�?

  禁止改动�?
  - src/features/canvas/fan-out.ts

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测�?0 个分镜通道输入，函数在合理时间内返回（记录实际执行耗时在测试输出中�?
        不设定硬性阈值但需人工过一遍数值是否可接受�?
  - [ ] 单测：任意两个节点坐标不完全重合（无重叠退化情况）
  - [ ] 返回的坐标可直接赋值给 canvas_nodes.position 而不需要额外转�?

  不在本任务范围内�?
  - 不实�?React Flow 组件层的视口裁剪（C1.5 的范围）
  ```

### C1.3 �?`status.ts`：节点状态机与内容哈希比�?

- 状态：�?
- 前置任务：F0.4
- 允许改动范围：`src/features/canvas/status.ts`（新建）、`status.test.ts`
- 禁止改动：`fan-out.ts`、`layout.ts`
- Goal 提示词：
  ```
  目标：实�?status.ts�?1) computeContentHash(input: unknown): string，对任意
  可序列化输入做稳定哈希（需保证同输入同哈希、跨进程重复调用结果一致）�?
  (2) transitionNodeStatus(nodeId, next status): 校验状态转移合法�?
  （idle→pending→running→success|failed，success/failed→stale 需在上游内容变化时
  触发，禁止非法跳转如 idle→success）并落库�?3) isStale(nodeId): 比对节点当前
  contentHash 与其依赖的上游节点最新产出哈希，判断是否需要重新触发�?

  前置任务：F0.4

  允许改动范围�?
  - src/features/canvas/status.ts
  - src/features/canvas/status.test.ts

  禁止改动�?
  - src/features/canvas/fan-out.ts
  - src/features/canvas/layout.ts
  - src/lib/db/schema.ts

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：非法状态跳转（�?idle 直接�?success）抛出明确错误，不静默失�?
  - [ ] 单测：相同输入对象两次调�?computeContentHash 结果相等
  - [ ] 单测：isStale 在上游哈希变化后返回 true，未变化返回 false
  - [ ] 状态转移写入是原子操作（读-判断-写在同一数据库事务或等价保证内）

  不在本任务范围内�?
  - 不触发任何实际渲�?AI 调用，只管状态与哈希的记录与判断
  ```

### C1.4 �?React Flow 画布组件骨架 + 分镜通道分组折叠

- 状态：�?
- 前置任务：C1.1, C1.2, C1.3
- 允许改动范围：`src/app/canvas/**`、`src/components/ui/**`（若需新增纯展示原语，需先确�?`/playbook` 无同类组件）
- 禁止改动：`src/features/canvas/**`（本卡只消费已完成的 features 层函数，不新增业务逻辑�?
- Goal 提示词：
  ```
  目标：在 canvas 路由下实�?React Flow 画布视图，渲�?features/canvas 已提供的
  节点/边数据；�?laneKey 对分镜通道分组，提供折�?展开交互；节点按 §设计系统
  清单 �?stage-* 配色与节点类型对应展示状态徽章（依据 C1.3 �?status 字段）�?

  前置任务：C1.1, C1.2, C1.3

  允许改动范围�?
  - src/app/canvas/**
  - src/components/ui/**（仅新增缺失的纯展示原语，且必须登记 playbook�?

  禁止改动�?
  - src/features/canvas/**（发现缺口只能在完成汇报中提出，不能自行加逻辑�?

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 页面文件不超�?200 行（超出拆分�?features 或本地子组件�?
  - [ ] 新增纯展示组件已�?src/app/playbook/registry.ts 登记并配 *.demo.tsx
  - [ ] 手动验证�?0 个分镜通道的模拟数据下页面可交互折叠，不崩溃（记录截图�?
        描述验证过程于完成汇报）

  不在本任务范围内�?
  - 不实现节点拖拽后写回坐标持久化（若设计稿未明确要求，先跳过，记录待确认项�?
  ```

### C1.5 �?画布性能优化：视口裁剪与大规模节点压�?

- 状态：�?
- 前置任务：C1.4
- 允许改动范围：`src/app/canvas/**`（仅性能相关配置与代码，不改交互逻辑�?
- 禁止改动：无特别限制之外的其�?Track 文件
- Goal 提示词：
  ```
  目标：为 C1.4 的画布视图开�?React Flow 的视口裁剪相关能力，编写一个压测脚�?
  或测试用例，生成 250+ 模拟节点，验证画布仍可交互（不卡死）�?

  前置任务：C1.4

  允许改动范围�?
  - src/app/canvas/**

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 压测�?50 个模拟节点场景下记录关键交互（平�?缩放）的主观流畅度描�?
        （若有自动化性能测量工具可用则记录具体数值，否则记录人工验证过程�?
  - [ ] 未回�?C1.4 已实现的折叠/展开交互

  不在本任务范围内�?
  - 不引入虚拟滚动之外的架构级重写（如切换渲染引擎）
  ```

---

## Track D �?Director（video-director 方法论原生移�?+ Pi tool-calling 编排�?

**前置**：Track F 全部完成，F0.1 �?Spike 结论已确定采用哪条路径。以下任务卡�?Pi 原生 Provider 可行"路径编写；若 F0.1 结论为退回方案，D1.2 �?Goal 提示词需相应替换�?改�?LlmAdapter 转发"版本（人工在启动该卡前调整措辞，架构原则不变）�?*�?Track 不使�?Pi �?Skills/Extensions 加载机制**——`docs/video-director/` 只作为编�?D0.1/D0.2 时对照阅读的参考语料，不在任何运行时代码路径中被读取或挂载�?

### D0.1 �?`schemas/`：移�?video-director 输出契约为原�?Zod schema

- 状态：�?
- 前置任务：无（可�?Track F 并行�?
- 允许改动范围：`src/features/director/schemas/**`（新建目录及文件�?
- 禁止改动：`docs/video-director/**`（只读参照，不修改）
- Goal 提示词：
  ```
  目标：对�?docs/video-director/schemas/shot-plan.schema.json �?INGEST 阶段
  相关 schema（script-units/audio-manifest/audio-allocation），逐字段手写对�?
  的原�?Zod schema：schemas/shot-plan.ts、schemas/ingest.ts。这�?移植"不是
  "引用"——产出的 Zod schema 是本项目独立维护的源码，之后与原 JSON Schema 解�?
  独立演进，不依赖运行时读�?docs/video-director/ 下的任何文件�?

  前置任务：无

  允许改动范围�?
  - src/features/director/schemas/shot-plan.ts
  - src/features/director/schemas/ingest.ts
  - src/features/director/schemas/*.test.ts

  禁止改动�?
  - docs/video-director/**（只读参照）

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] shot-plan.ts 的字段集合与 shot-plan.schema.json �?$defs.shot 逐一对应�?
        完成汇报中列出字段映射表，标注任何有意省略或调整的字段及理由
  - [ ] 单测：用一份符合原 JSON Schema 的示例数据（可从 docs/video-director/
        �?productions/ 或测试夹具中取样）验�?Zod schema 能正确解�?
  - [ ] 单测：故意缺失必填字段的数据应被 Zod schema 拒绝，错误信息可定位�?
        具体字段
  - [ ] 运行时代码（非测试）中不出现任何读取 docs/video-director/ 路径的文�?
        IO 调用

  不在本任务范围内�?
  - 不实�?prompt 模板（D0.2 的范围）
  - 不实�?Tool 或会话编排（D1.x 的范围）
  ```

### D0.2 �?`prompts/`：移�?video-director 方法论为原生 prompt 模板

- 状态：�?
- 前置任务：D0.1
- 允许改动范围：`src/features/director/prompts/**`（新建目录及文件�?
- 禁止改动：`docs/video-director/**`
- Goal 提示词：
  ```
  目标：对�?docs/video-director/SKILL.md �?正向视觉法则"�?0 条）�?构图模式"
  �?1 �?enum）、DIRECT 阶段�?master-plan/style-bible 产出要求、SHOT-SPEC
  阶段�?shot-plan 撰写要求，为 PRD 六阶段口径（INGEST/DIRECT/SHOT-SPEC/
  FABRICATE/ASSEMBLE/FINALIZE）各写一�?TS 提示词模板文件，导出类型化的模板
  函数（如 buildDirectPrompt(input: {...}): string），插槽参数使用 D0.1 产出
  �?Zod schema 推导类型。模板内容是方法论文本的移植与改写，不是逐字复制
  SKILL.md 原文�?

  前置任务：D0.1

  允许改动范围�?
  - src/features/director/prompts/ingest.ts
  - src/features/director/prompts/direct.ts
  - src/features/director/prompts/shot-spec.ts
  - src/features/director/prompts/fabricate.ts
  - src/features/director/prompts/*.test.ts

  禁止改动�?
  - docs/video-director/**

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 每个模板函数的插槽参数类型来�?D0.1 �?Zod schema 推导（z.infer），
        不是手写的重复类型定�?
  - [ ] 单测：给定固定插槽参数，模板函数产出的字符串包含关键约束语句（如
        FABRICATE 模板必须包含确定性红线的明确指令文本�?
  - [ ] 完成汇报中列�?10 条正向视觉法�?分别被移植进了哪个模板文件的哪个
        位置，确认无遗漏

  不在本任务范围内�?
  - 不实�?Tool 或会话编排（D1.x 的范围）
  ```

### D1.1 �?`pi-session.ts`：Agent 会话工厂（裸 tool-calling 引擎，不�?Skill�?

- 状态：�?
- 前置任务：F0.1（含结论�?
- 允许改动范围：`src/features/director/pi-session.ts`（新建）、`pi-session.test.ts`
- 禁止改动：`src/features/director/pipeline.ts`（本卡先不改现有阶段元数据文件）
- Goal 提示词：
  ```
  目标：实�?pi-session.ts，导�?createDirectorSession(stage: PipelineStage):
  Promise<AgentSession>，内部创�?Pi AgentSession，配�?StepFun Provider
  （若 F0.1 验证通过则用 pi-ai 原生 Provider；否则回退为包装现�?StepfunAdapter
  的自定义 Provider 适配层）。本函数只借用 Pi 的会话生命周期与 tool-calling
  循环机制，不传入任何 --skill/skills/extensions 相关配置，不挂载
  docs/video-director/ 或任何外部技能包；该阶段所需的领域知识完全来�?D0.2
  产出的原�?prompt 模板�?D1.2 即将注册的自定义 Tool�?

  前置任务：F0.1

  允许改动范围�?
  - src/features/director/pi-session.ts
  - src/features/director/pi-session.test.ts

  禁止改动�?
  - src/features/director/pipeline.ts
  - docs/video-director/**（只读参照，本卡不涉及此目录任何文件的读写）

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：mock Pi SDK，验�?createAgentSession 调用参数中不包含任何
        skills/extensions 字段，且系统提示词来�?D0.2 �?prompt 模板函数
        （不发起真实网络请求�?
  - [ ] 函数对每�?stage 返回类型一致的 AgentSession 封装，不泄漏 Pi 内部类型
        �?features/director 外部（对外只暴露必要的最小接口）
  - [ ] 代码或测试中不出现任何对 docs/video-director/ 路径的文�?IO 调用

  不在本任务范围内�?
  - 不实现具体的自定�?Tool（D1.2 的范围）
  - 不实现阶段编排流程（D1.3 的范围）
  ```

### D1.2 �?`tools/`：阶段自定义 Tool �?

- 状态：�?
- 前置任务：D0.1, D1.1, F0.7
- 允许改动范围：`src/features/director/tools/**`（新建目录及文件�?
- 禁止改动：`pi-session.ts`（Tool 定义与会话工厂分离）
- Goal 提示词：
  ```
  目标：在 tools/ 下为每个阶段边界实现一个自定义 Pi Tool�?
  validate-shot-plan.ts（用 D0.1 产出的原�?Zod schema 校验模型输出，不依赖
  运行时读取任�?JSON Schema 文件）、check-determinism.ts（调�?F0.7 �?
  checkSource，对 FABRICATE 阶段产出�?HTML 强制扫描，违规则 Tool 返回失败
  结果而不是抛异常，让 Agent 收到结构化失败反馈）、write-artifact.ts（校�?
  通过后落 StorageAdapter + 更新 artifacts 表）。每个文件只做一件事�?

  前置任务：D0.1, D1.1, F0.7

  允许改动范围�?
  - src/features/director/tools/**

  禁止改动�?
  - src/features/director/pi-session.ts
  - src/lib/determinism/**（只调用不修改）

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 每个 Tool 有对应单测，覆盖"校验通过"�?校验失败"两条路径
  - [ ] validate-shot-plan.ts 内部导入 D0.1 �?schemas/shot-plan.ts，不重复
        定义校验逻辑
  - [ ] check-determinism.ts 的失败路径不抛出未捕获异常，而是返回结构化错�?
        �?Agent 感知并重�?
  - [ ] write-artifact.ts 写入前必须已通过前置校验，代码路径上体现这个先后顺序

  不在本任务范围内�?
  - 不实�?stage-runner.ts 的整体编排（D1.3 的范围）
  ```

### D1.3 �?`stage-runner.ts`：单阶段运行编排

- 状态：�?
- 前置任务：D0.1, D0.2, D1.1, D1.2
- 允许改动范围：`src/features/director/stage-runner.ts`（新建）、测试文�?
- 禁止改动：`src/lib/queue/**`（本卡只消费队列接口，不改队列实现）
- Goal 提示词：
  ```
  目标：实�?stage-runner.ts，导�?runStage(projectId, nodeId, stage): 
  Promise<void>：将节点状态置�?running（复�?C1.3 �?transitionNodeStatus）→
  创建 Pi 会话（D1.1）→ 挂载对应 Tool（D1.2）→ 运行会话直到产出 �?
  成功则落 artifact + 置状�?success，失败则记录 error + 置状�?failed�?
  本函数是 features/director 内唯一允许跨模块编排（canvas 状�?+ AI 会话 +
  存储）的文件�?

  前置任务：D1.1, D1.2

  允许改动范围�?
  - src/features/director/stage-runner.ts
  - src/features/director/stage-runner.test.ts

  禁止改动�?
  - src/lib/queue/in-process-queue.ts
  - src/features/canvas/status.ts（只调用其导出函数，不修改实现）

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：mock 会话成功场景，断言最终节点状态为 success �?artifact 已写�?
  - [ ] 单测：mock 会话失败场景（如 Tool 返回校验失败），断言节点状态为 failed
        且错误信息被记录，不残留 running 状�?
  - [ ] 函数本身不直接操作数据库连接细节，通过已有 features 函数间接操作

  不在本任务范围内�?
  - 不实现队�?handler 注册（D1.4 的范围）
  ```

### D1.4 �?队列接入：`director` 作业处理器注�?

- 状态：�?
- 前置任务：D1.3
- 允许改动范围：`src/features/director/queue-handler.ts`（新建）、`src/server/**`（若需要启动时注册的入口文件）
- 禁止改动：`src/lib/queue/in-process-queue.ts` 的核心实现（只调�?`register()` 方法�?
- Goal 提示词：
  ```
  目标：实�?queue-handler.ts，注�?kind='director-stage' 的作业处理器�?
  InProcessQueue，处理器内部调用 stage-runner.ts �?runStage。在应用启动路径
  （src/server/ 下合适位置）接入注册与队列启动逻辑�?

  前置任务：D1.3

  允许改动范围�?
  - src/features/director/queue-handler.ts
  - src/server/**（仅新增启动时注册代码，不改动其�?server-only 工具�?

  禁止改动�?
  - src/lib/queue/in-process-queue.ts

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 单测：enqueue 一�?director-stage 作业后（mock stage-runner），处理器被
        正确调用且参数传递正�?
  - [ ] 应用启动时队列被启动且处理器已注册（可通过一次集成性测试或手动验证描述�?

  不在本任务范围内�?
  - 不实�?API 路由触发入口（D1.5 的范围）
  ```

### D1.5 �?API 路由：`api/director/stage`

- 状态：�?
- 前置任务：D1.4
- 允许改动范围：`src/app/api/director/stage/route.ts`（新建）
- 禁止改动：`src/features/director/**`（路由层只调用，不新增业务逻辑�?
- Goal 提示词：
  ```
  目标：实�?POST /api/director/stage 路由，接�?{ projectId, nodeId, stage }�?
  Zod 校验请求体，调用 features/canvas/queries 确认节点存在后，enqueue 一�?
  director-stage 作业（D1.4 已注册），返�?{ jobId }�?

  前置任务：D1.4

  允许改动范围�?
  - src/app/api/director/stage/route.ts

  禁止改动�?
  - src/features/director/**
  - src/features/canvas/**

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 请求体校验失败返�?400 + 明确错误信息，不抛未捕获异常
  - [ ] 节点不存在返�?404
  - [ ] 成功路径返回 200 + jobId
  - [ ] 路由文件本身不超�?50 行（超出说明塞了业务逻辑，应下沉 features�?

  不在本任务范围内�?
  - 不实现前端调用该路由�?UI（Track U 的范围）
  ```

---

## Track R �?Render（渲染管线）

**前置**：F0.6, F0.7�?

### R1.1 �?`frame-capture.ts`：单帧截�?

- 状态：�?
- 前置任务：F0.6, F0.7
- 允许改动范围：`src/features/render/frame-capture.ts`（新建）、测试文件、`fixtures/`（测试用最�?shot HTML 样例�?
- 禁止改动：`renderer.ts`（顶层编排留�?R1.5�?
- Goal 提示词：
  ```
  目标：实�?frame-capture.ts，导�?captureFrame(htmlPath, frame, fps):
  Promise<Buffer>：用 Playwright 打开�?HTML，在 page 上执行对�?GSAP 时间轴的
  seek(frame/fps)，通过 CDP 截图返回 PNG buffer�?

  前置任务：F0.6, F0.7

  允许改动范围�?
  - src/features/render/frame-capture.ts
  - src/features/render/frame-capture.test.ts
  - src/features/render/__fixtures__/**（新建最小确定�?shot HTML 样例，用于测试）

  禁止改动�?
  - src/features/render/renderer.ts

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：对固定 fixture 的同一 frame 连续截图两次，PNG 内容哈希一�?
        （确定性验证）
  - [ ] 单测：frame=0 �?frame=N（N 足够大）截图哈希不同（确实随帧变化）
  - [ ] 截图函数使用后正确关�?Playwright browser/page，不残留进程
  - [ ] lib/determinism 的规则扫描对 fixture HTML 本身应为零违规（用它验证
        F0.7 产出�?checkSource 函数�?

  不在本任务范围内�?
  - 不实现多帧循环批量截图（R1.2 的范围）
  - 不实�?ffmpeg 编码（R1.3 的范围）
  ```

### R1.2 �?帧序列生成与内容哈希缓存

- 状态：�?
- 前置任务：R1.1
- 允许改动范围：`src/features/render/cache.ts`（新建）、`frame-sequence.ts`（新建）、测试文�?
- 禁止改动：`frame-capture.ts`
- Goal 提示词：
  ```
  目标：实�?cache.ts（导�?lookupCache(hash)/writeCache(hash, result) 基于
  artifacts 表按 contentHash 查找/写入已渲染产物）�?frame-sequence.ts（导�?
  captureSequence(htmlPath, totalFrames, fps): 循环调用 captureFrame 产出�?
  Buffer 数组，支持有界并发）�?

  前置任务：R1.1

  允许改动范围�?
  - src/features/render/cache.ts
  - src/features/render/frame-sequence.ts
  - 对应测试文件

  禁止改动�?
  - src/features/render/frame-capture.ts

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：相�?contentHash 第二次查找命中缓存，不重新截图（mock 验证
        captureFrame 未被调用�?
  - [ ] 单测：captureSequence 并发数受限（不超过配置的上限，验证方式可用计数器
        mock�?
  - [ ] 单测：中途某一帧截图失败时，整体操作失败并给出是第几帧失败的明确信�?

  不在本任务范围内�?
  - 不实�?ffmpeg 编码（R1.3 的范围）
  ```

### R1.3 �?`encode.ts`：ffmpeg 编码

- 状态：�?
- 前置任务：R1.2
- 允许改动范围：`src/features/render/encode.ts`（新建）、测试文�?
- 禁止改动：`frame-sequence.ts`、`cache.ts`
- Goal 提示词：
  ```
  目标：实�?encode.ts，导�?encodeToMp4(frames: Buffer[], fps, outputPath):
  Promise<string>：调�?ffmpeg-static 二进制，将帧序列编码为确定性参数的 mp4
  （固�?CRF/预设，不使用任何随机化编码参数），写�?outputPath 并返回该路径�?

  前置任务：R1.2

  允许改动范围�?
  - src/features/render/encode.ts
  - src/features/render/encode.test.ts

  禁止改动�?
  - src/features/render/frame-sequence.ts
  - src/features/render/cache.ts

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：给定固定帧序列，两次独立编码产出的 mp4 文件哈希一致（确定性验证，
        �?ffmpeg 元数据时间戳导致哈希不稳定，需在编码参数中显式抑制时间戳写入）
  - [ ] 编码失败（如 ffmpeg 进程非零退出）时函数抛出包�?stderr 内容的明确错�?
  - [ ] 输出文件写入前先写临时文件再原子重命名，避免半写状态被误读

  不在本任务范围内�?
  - 不实现顶�?renderer.ts 编排（R1.5 的范围）
  - 不实现终局合并导出（R1.4 的范围）
  ```

### R1.4 �?`concat.ts`：终局合并导出

- 状态：�?
- 前置任务：R1.3
- 允许改动范围：`src/features/render/concat.ts`（新建）、测试文�?
- 禁止改动：`encode.ts`（复用而非重写编码逻辑�?
- Goal 提示词：
  ```
  目标：实�?concat.ts，导�?concatExport(mp4Paths: string[], musicPath, 
  outputPath): Promise<string>：用 ffmpeg �?concat 模式按序拼接已渲染的分镜
  mp4，叠加全局配乐轨，不重新逐帧渲染任何分镜内容（只做流拷贝级拼�?+ 音频
  混流）�?

  前置任务：R1.3

  允许改动范围�?
  - src/features/render/concat.ts
  - src/features/render/concat.test.ts

  禁止改动�?
  - src/features/render/encode.ts

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 单测：给�?3 个固定测�?mp4 fixture，拼接结果的总时长约等于三者时长之�?
        （允许合理误差范围，需在测试中说明误差容忍逻辑�?
  - [ ] 单测：拼接函数不重新调用任何逐帧截图/单镜编码相关函数（mock 验证零调用）
  - [ ] 拼接失败时给出明确的失败分镜索引或阶段信�?

  不在本任务范围内�?
  - 不实现转场特效的编排逻辑（若 PRD F13 需要转场，作为 Track A 音频/合成
    Track 的后续任务处理，本卡只做基础拼接�?
  ```

### R1.5 �?`renderer.ts`：顶层编�?+ 队列接入

- 状态：�?
- 前置任务：R1.2, R1.3
- 允许改动范围：`src/features/render/renderer.ts`（替换现�?throw NotImplemented 实现）、`queue-handler.ts`（新建）
- 禁止改动：`frame-sequence.ts`、`encode.ts`、`cache.ts`（本卡只编排，不重写底层�?
- Goal 提示词：
  ```
  目标：将 renderer.ts �?HyperframesRenderer.render() �?throw NotImplemented
  改为真实编排：查缓存（cache.ts）→ 未命中则截帧序列（frame-sequence.ts）→
  编码（encode.ts）→ �?artifact + 更新节点状态（复用 features/canvas/status.ts）�?
  同时新建 queue-handler.ts 注册 kind='render-shot' 处理器�?

  前置任务：R1.2, R1.3

  允许改动范围�?
  - src/features/render/renderer.ts
  - src/features/render/queue-handler.ts
  - src/features/render/renderer.test.ts

  禁止改动�?
  - src/features/render/frame-sequence.ts
  - src/features/render/encode.ts
  - src/features/render/cache.ts

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 单测：缓存命中路径不触发截帧（mock 验证�?
  - [ ] 单测：缓存未命中路径按序调用截帧→编码→写入，任一环节失败整体失败�?
        正确回退节点状态为 failed
  - [ ] Renderer 接口签名保持不变（render(job): Promise<RenderResult>），不破�?
        既有调用方类型契�?

  不在本任务范围内�?
  - 不实现触发渲染的 API 路由（R1.6 的范围）
  ```

### R1.6 �?API 路由：`api/render` �?`api/render/export`

- 状态：�?
- 前置任务：R1.5, R1.4
- 允许改动范围：`src/app/api/render/route.ts`（新建）、`src/app/api/render/export/route.ts`（新建）
- 禁止改动：`src/features/render/**`
- Goal 提示词：
  ```
  目标：实现两个路由：POST /api/render（接�?{ projectId, nodeId }，enqueue
  render-shot 作业，返�?jobId）与 POST /api/render/export（接�?{ projectId }�?
  校验该项目全部分镜通道节点状态均�?success 后，调用 concat.ts 产出终片�?
  若有未完成节点则返回 409 + 列出未完成的节点 ID）�?

  前置任务：R1.5, R1.4

  允许改动范围�?
  - src/app/api/render/route.ts
  - src/app/api/render/export/route.ts

  禁止改动�?
  - src/features/render/**
  - src/features/canvas/**

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] /api/render 请求体校验失败返�?400，节点不存在返回 404
  - [ ] /api/render/export 在存在未完成通道节点时返�?409 + 节点 ID 列表，不
        静默跳过未完成分�?
  - [ ] 两个路由文件均不超过 50 �?

  不在本任务范围内�?
  - 不实现调用这些路由的前端 UI（Track U 的范围）
  ```

---

## Track A �?Audio（字�?配音/音效/配乐，P1 优先级，Demo 阶段占位�?

**前置**：Track C（通道节点已建）、Track D（阶段编排已通）�?*Demo 阶段仅要求节点存�?+ UI 可见 + 内部逻辑占位（明确抛�?待实�?或返回固�?mock），真实生成能力延后�?P1**，与总纲 §4.1 决策一致�?

### A1.1 �?`features/audio/` 骨架与占位实�?

- 状态：�?
- 前置任务：Track C 完成
- 允许改动范围：`src/features/audio/subtitle.ts`、`voiceover.ts`、`sfx.ts`、`score.ts`（均新建，替换现有仅�?index.ts/types.ts 的空骨架�?
- Goal 提示词：
  ```
  目标：为字幕/配音/音效/配乐四个子域各建一个文件，导出与其角色对应的函�?
  签名（如 generateSubtitle(shotId): Promise<SubtitleResult>），Demo 阶段函数�?
  返回明确标注"占位实现，P1 补齐"的固�?mock 结果，不抛异常（保证画布节点
  可以走完"success"状态，不会因为占位而卡�?failed）�?

  前置任务：Track C 完成

  允许改动范围�?
  - src/features/audio/subtitle.ts
  - src/features/audio/voiceover.ts
  - src/features/audio/sfx.ts
  - src/features/audio/score.ts

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 每个函数都有对应最小单测，验证返回值符合预期的 mock 结构
  - [ ] 每个函数体内有清晰注释标�?P1 实现"及对�?PRD 功能编号（F10/F11/F14�?
  - [ ] 函数签名设计为未来替换为真实实现时不需要改调用方代码（即接口定稿，
        实现留白�?

  不在本任务范围内�?
  - 不接入真�?StepFun TTS/ASR 调用（P1 任务，不在本�?Demo Track 范围�?
  ```

---

## Track P �?Pencil 组件港口（`docs/designs/canvas.pen` �?真实前端组件，SSOT 强制�?

**目的**：把 `docs/designs/canvas.pen` 中标�?`reusable:true` �?30 个组件，通过 **Pencil MCP 工具**（`mcp_pencil_batch_get`/`mcp_pencil_get_variables`/`mcp_pencil_get_screenshot`/`mcp_pencil_export_html` 等）逐一读取真实结构与样式，一比一移植�?`src/components/ui/*.tsx` �?`src/components/icons/*.tsx`，并登记�?`/playbook`�?*这是总纲 §5.6 的强制约束的具体执行**：Track U 的任何页面任务卡都只允许 `import` 这里产出的组件，不允许重新实现�?*必须排在 Track U 之前完成�?*

**执行铁律（每张任务卡都适用�?*�?
1. 严禁凭记忆或凭空实现——每个组件必须先�?`mcp_pencil_batch_get` 读取该组件在 `canvas.pen` 中的真实节点结构（fill/padding/gap/cornerRadius/stroke/effect 等），必要时�?`mcp_pencil_get_screenshot` 核对视觉�?
2. 颜色/圆角/间距/阴影必须映射�?`mcp_pencil_get_variables` 读出�?Design Token（对�?Tailwind CSS 变量�?`tailwind.config` 扩展），不允许硬编码 hex/px 数值�?
3. 每个组件完成后必须在 `src/app/playbook/registry.ts` 登记 + �?`*.demo.tsx`，且在完成条件中截图/描述验证�?`/playbook` 页面能正确渲染该组件�?
4. 图标统一�?`lucide-react`（P0.1 先装好），命名遵循设计系统清�?§6.3 的新命名表（�?`circle-plus` 不是 `plus-circle`），禁止 emoji�?

### P0.1 �?依赖补全：`lucide-react` + 自动布局�?

- 状态：�?
- 前置任务：无
- 允许改动范围：`package.json`
- Goal 提示词：
  ```
  目标：安�?lucide-react（全部图标的唯一来源）与 @dagrejs/dagre（画布自�?
  布局，供后续 C1.2 使用），确认安装后可从两个包分别成功 import 一个符�?
  （如 lucide-react �?CirclePlus，@dagrejs/dagre �?graphlib）�?

  前置任务：无

  允许改动范围�?
  - package.json

  完成条件�?
  - [ ] pnpm install 成功，两个包出现�?dependencies
  - [ ] pnpm lint / pnpm tsc --noEmit 通过
  - [ ] 一次性验证两个包可被 import（验证代码可以是临时文件，验证后删除，或
        直接在后�?P1.x/C1.2 任务卡中一并验证，本卡只需确保安装成功�?

  不在本任务范围内�?
  - 不实现任何组件或布局逻辑
  ```

### P1.1 �?B1 基础控件港口�?3 个组件）

- 状态：�?
- 前置任务：P0.1
- 允许改动范围：`src/components/ui/**`（新建）、`src/app/playbook/registry.ts`
- Goal 提示词：
  ```
  目标：用 Pencil MCP 读取 canvas.pen 中以�?13 �?reusable 组件的真实结构：
  Button/Primary、Button/Tinted、Button/Gray、Button/Destructive、IconButton�?
  SegmentedControl、TextField、TextArea、SearchField、Toggle、ProgressBar�?
  StatusPill、Tooltip。逐一移植�?src/components/ui/ 下的 React 组件（如
  button.tsx 内以 variant prop 覆盖四种 Button 样式，而不是四个独立文件—�?
  �?canvas.pen 内四个变体是同一组件家族的事实保持一致），颜�?圆角/间距取自
  mcp_pencil_get_variables 读出�?Token，全部登记进 playbook�?

  前置任务：P0.1

  允许改动范围�?
  - src/components/ui/**
  - src/app/playbook/registry.ts

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 13 个组件（Button 四变体算 1 个组件家�?4 变体）逐一可在 /playbook
        页面查看，且样式�?canvas.pen 截图核对一致（�?mcp_pencil_get_screenshot
        对照，完成汇报中说明核对过程�?
  - [ ] 每个组件均已�?registry.ts 登记 + �?*.demo.tsx
  - [ ] 未出现硬编码颜色 hex 值（可用简�?grep 自查后在完成汇报中说明结果）

  不在本任务范围内�?
  - 不实�?B2/B3/B4 组件（P1.2/P1.3/P1.4 的范围）
  ```

### P1.2 �?B2 反馈组件港口（Toast / Dialog / EmptyState�?

- 状态：�?
- 前置任务：P0.1
- 允许改动范围：`src/components/ui/**`（新建）、`src/app/playbook/registry.ts`
- Goal 提示词：
  ```
  目标：用 Pencil MCP 读取并移�?Toast、Dialog、EmptyState 三个组件，登记进
  playbook。Dialog 需支持作为受控组件（open/onClose props），Toast 需考虑
  后续被全局挂载调用的方式（导出一个简单的 toast() 函数�?context，具体设�?
  以最小可用为原则，不过度工程化）�?

  前置任务：P0.1

  允许改动范围�?
  - src/components/ui/**
  - src/app/playbook/registry.ts

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 三个组件均可�?/playbook 查看且样式核对一�?
  - [ ] 均已登记 registry.ts + �?demo
  - [ ] Dialog �?demo 能演示打开/关闭交互（因�?playbook 是活文档，demo 需
        可交互而不是静态截图）

  不在本任务范围内�?
  - 不实�?B1/B3/B4 组件
  ```

### P1.3 �?B3 导航组件港口（NavItem / TopBar / Sidebar�?

- 状态：�?
- 前置任务：P0.1
- 允许改动范围：`src/components/ui/**`（新建）、`src/app/playbook/registry.ts`
- Goal 提示词：
  ```
  目标：用 Pencil MCP 读取并移�?NavItem、TopBar、Sidebar 三个组件。Sidebar
  的毛玻璃效果（glass-sidebar + background_blur）需�?Tailwind �?
  backdrop-blur 等价实现并核对视觉效果，�?240、高 fill_container、右�?
  1px 分隔线等尺寸约束需精确对应�?

  前置任务：P0.1

  允许改动范围�?
  - src/components/ui/**
  - src/app/playbook/registry.ts

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 三个组件均可�?/playbook 查看且样式核对一致（含毛玻璃效果的视觉核对）
  - [ ] 均已登记 registry.ts + �?demo
  - [ ] Sidebar 组件设计为可接收 children（NavItem 列表）而不是硬编码具体
        导航项，�?Track U 的页面按需组装

  不在本任务范围内�?
  - 不实�?B1/B2/B4 组件
  - 不实现页面级的实际导航逻辑（Track U 的范围）
  ```

### P1.4 �?B4 业务/节点组件港口�?1 个组件，产品灵魂�?

- 状态：�?
- 前置任务：P0.1, F0.5（节点类�?taxonomy 已定稿，命名需与组件对齐）
- 允许改动范围：`src/components/ui/**`（新建，节点类组件可单独�?`src/components/ui/node/` 子目录）、`src/app/playbook/registry.ts`
- Goal 提示词：
  ```
  目标：用 Pencil MCP 读取并移�?11 个业务组件：ProjectCard、ArtifactChip�?
  Node/StageNode、Node/ShotNode、Node/AudioNode、Node/ExportNode�?
  QueueStatusBar、TimelineTrack、ContactSheetThumb、SettingsRow�?
  SettingsGroup。四�?Node/* 组件�?stroke 颜色对应阶段�?Token
  �?stage-ingest 等），需在组�?props 中开放阶�?状态作为可配置项（不是
  硬编码某一个阶段的颜色），因为运行时同一节点组件要渲染不同状�?不同分镜�?
  数据�?

  前置任务：P0.1, F0.5

  允许改动范围�?
  - src/components/ui/** （节点类组件可放 src/components/ui/node/ 子目录）
  - src/app/playbook/registry.ts

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 11 个组件均可在 /playbook 查看且样式核对一�?
  - [ ] 均已登记 registry.ts + �?demo，Node/* 组件�?demo 展示至少两种不同
        状态（�?pending �?success）以证明状态可配置而非硬编�?
  - [ ] Node/* 组件�?props 类型�?F0.5 定稿的节点类�?状态枚举对齐（可直�?
        复用该枚举类型，不重复定义）

  不在本任务范围内�?
  - 不实现节点在真实画布（React Flow）中的挂载逻辑（C1.4 的范围，本卡只做
    纯展示组件本体）
  ```

### P1.5 �?图标白名单核�?+ Playbook 完整性收�?

- 状态：�?
- 前置任务：P1.1, P1.2, P1.3, P1.4
- 允许改动范围：`src/components/icons/**`、`src/app/playbook/**`（仅核查/补registry条目，不改已完成组件的实现）
- Goal 提示词：
  ```
  目标：核�?P1.1~P1.4 移植的全部组件内部使用的图标名，逐一对照设计系统清单
  §6.3 �?Lucide 新命名表，修正任何使用旧名（�?plus-circle）的引用为标准名
  （circle-plus）。核�?registry.ts 是否遗漏任何 canvas.pen 中的 30 �?
  reusable 组件，补全缺失条目�?

  前置任务：P1.1, P1.2, P1.3, P1.4

  允许改动范围�?
  - src/components/icons/**
  - src/app/playbook/registry.ts（仅补充遗漏条目，不删除已有条目�?

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 全项目搜索确认零处使用设计系统清�?§6.3"旧名"列的图标�?
  - [ ] /playbook 页面展示的组件数量核对等�?30（或列出任何有意不作为独�?
        playbook 条目的理由，�?Button 四变体算一个条�?variant�?
  - [ ] �?emoji 用作图标的残留引�?

  不在本任务范围内�?
  - 不新增任何组件的业务逻辑变更，只做命名核查与登记表补�?
  ```

---

## Track U �?UI（六页面按设计稿实装�?

**前置**�?*Track P 全部完成**�?0 个组件已港口完成并登�?`/playbook`）、Track C（画布）、Track D（触发阶段的路由）、Track R（触发渲染的路由）均已完成对�?API。UI Track 内部各页面耦合度低，可并行分配给不同会话，但均依赖 [`2026-07-23-ui-design-handoff.md`](../designs/2026-07-23-ui-design-handoff.md) 的逐页规格�?[`2026-07-23-design-system-inventory.md`](../designs/2026-07-23-design-system-inventory.md) �?Token/组件清单�?

**强制约束（每�?U 任务卡都适用�?*：页面只�?`import` Track P 已登记的组件�?*禁止在页面文件或页面私有子组件内重新实现任何视觉原语**（Button/Card/StatusPill/NavItem 等）。若发现某页面需要一�?Track P 尚未覆盖的组件，必须先停下补一�?Track P 任务卡完成移植，再回�?`import` 使用，不允许"页面里先临时糊一�?�?

### U1.1 �?S1 首页 / 项目列表

- 状态：�?
- 前置任务：Track P 全部完成，Track C 完成（`api/projects` 已可用）
- 允许改动范围：`src/app/page.tsx`、`src/app/_components/**`（若需要页面私有子组件；仅允许拼装 Track P 已登记组件，不新增视觉原语）
- Goal 提示词：
  ```
  目标：按 UI 设计交接文档 S1 章节的结构、文案（�?8 节复用库原文，禁止发明新
  文案）实装首页：项目列表 + 新建项目入口。只允许 import Track P 已登记的组件
  （ProjectCard、Button、NavItem、Sidebar 等），不允许重新实现任何视觉原语�?

  前置任务：Track P 全部完成, Track C 完成

  允许改动范围�?
  - src/app/page.tsx
  - src/app/_components/**（页面私有的布局/拼装代码，不得在此重新实�?
    src/components/ui 已有的视觉原语）

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] page.tsx 不超�?200 �?
  - [ ] 页面文案与设计交接文�?§8 复用库逐字一致，无发明文�?
  - [ ] 页面内使用的每个视觉组件均可追溯�?Track P �?import，零重新实现
  - [ ] 若发现缺失组件，先补一�?Track P 任务卡完成移植后再回来使用，不在�?
        卡内临时实现

  不在本任务范围内�?
  - 不实�?S2（新建项目对话框）的具体交互（U1.2 的范围）
  ```

### U1.2 �?S2 新建项目对话框（脚本提交入口�?

- 状态：�?
- 前置任务：U1.1
- 允许改动范围：`src/app/_components/new-project-dialog.tsx`（新建）
- Goal 提示词：
  ```
  目标：按设计交接文档 S2 章节实装新建项目对话框：标题输入 + 脚本文本域，
  提交后调�?features/canvas 的创建项目接口，成功后跳转到画布页并触发
  语义拆分分镜（调�?api/director/stage，stage=INGEST）�?

  前置任务：U1.1

  允许改动范围�?
  - src/app/_components/new-project-dialog.tsx

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 表单校验失败时的错误提示文案取自设计交接文档 §8，不发明新文�?
  - [ ] 提交成功后正确触发路由跳�?+ 阶段触发调用（可 mock 验证调用参数�?
  - [ ] 组件文件不超�?150 �?

  不在本任务范围内�?
  - 不实现画布页本身（Track C1.4 已完成，本卡只做跳转对接�?
  ```

### U1.3 �?S3 画布主视图整�?

- 状态：�?
- 前置任务：C1.4, C1.5, U1.2
- 允许改动范围：`src/app/canvas/**`（在 C1.4/C1.5 骨架基础上补�?Sidebar/Inspector 布局�?
- Goal 提示词：
  ```
  目标：按设计交接文档 S3 章节�?Sidebar(240)|Center|Inspector(320) 三栏布局�?
  整合 C1.4 已实现的画布核心视图，补齐侧边栏（项目信�?阶段进度）与检视器
  （选中节点详情面板，含触发渲染/触发阶段按钮，对�?api/render �?
  api/director/stage）�?

  前置任务：C1.4, C1.5, U1.2

  允许改动范围�?
  - src/app/canvas/**

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 三栏布局尺寸与设计交接文档一致（240/自适应/320�?
  - [ ] Inspector 面板的按钮点击能正确调用对应 API 路由（可用集成测试或手动
        验证描述确认�?
  - [ ] 页面整体文件组织遵循 page.tsx �?00 行的约束，超出部分拆分子组件

  不在本任务范围内�?
  - 不实�?S4 分镜详情页（U1.4 的范围）
  ```

### U1.4 �?S4 分镜详情页（预览 + 单独导出�?

- 状态：�?
- 前置任务：R1.6, U1.3
- 允许改动范围：`src/app/canvas/shot/[id]/**`（新建路由，路径需与设计稿路由意图核对，若设计稿另有约定的路径以设计稿为准并在完成汇报中说明）
- Goal 提示词：
  ```
  目标：按设计交接文档 S4 章节实装分镜详情页：展示该分镜的代码生成结果预览
  （HTML iframe 或等价渲染），提�?单独导出"按钮对接 api/render 触发该分�?
  的独立渲染，展示渲染状态与最�?mp4 下载/预览入口�?

  前置任务：R1.6, U1.3

  允许改动范围�?
  - src/app/canvas/shot/[id]/**（若设计稿路由路径不同，以设计稿为准并说明调�?
    理由�?

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 预览区域不触发确定性违规（预览渲染路径与正式渲染路径复用同一套确定�?
        约束�?
  - [ ] 单独导出按钮点击后正确触发单镜渲染并展示状态轮�?
  - [ ] page.tsx �?00 �?

  不在本任务范围内�?
  - 不实现全局合并导出页面（U1.5 的范围）
  ```

### U1.5 �?S5 导出页（合并导出�?

- 状态：�?
- 前置任务：R1.6, U1.3
- 允许改动范围：`src/app/canvas/export/**`（新建，路径以设计稿为准�?
- Goal 提示词：
  ```
  目标：按设计交接文档 S5 章节实装导出页：展示全部分镜通道的完成状态汇总，
  全部完成后启�?合并导出"按钮，对�?api/render/export，展示导出进度与终片
  下载/预览入口；若存在未完成分镜，明确列出并禁用导出按钮�?

  前置任务：R1.6, U1.3

  允许改动范围�?
  - src/app/canvas/export/**

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 未完成分镜场景下导出按钮禁用状态与文案符合设计交接文档
  - [ ] 导出成功后终片可直接预览或下�?
  - [ ] page.tsx �?00 �?

  不在本任务范围内�?
  - 不实现设置页（U1.6 的范围）
  ```

### U1.6 �?S6 设置页（StepFun Key 等）

- 状态：�?
- 前置任务：F0.3
- 允许改动范围：`src/app/settings/**`
- Goal 提示词：
  ```
  目标：按设计交接文档 S6 章节实装设置页：StepFun API Key 输入与保存（对接
  已有 api/settings �?stepfun-adapter �?saveApiKey/validateKey），保存前先
  调用 validateKey 校验，失败给出明确错误提示�?

  前置任务：F0.3

  允许改动范围�?
  - src/app/settings/**

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] Key 输入框不以纯文本明文常驻显示（遵循常见密钥输�?UI 惯例，如
        password 类型 + 显示/隐藏切换�?
  - [ ] 校验失败/成功的提示文案取自设计交接文�?§8
  - [ ] 页面不将 Key 值打印到浏览�?console 或写入客户端可见的任何日�?

  不在本任务范围内�?
  - 不实现暗色主题切换开关本身的全局状态管理（若设计稿要求全局主题切换�?
    单列一张后续任务卡，本卡只做设置页表单本身�?
  ```

### U1.7 �?暗色主题（Zone D 页面镜像�?

- 状态：�?
- 前置任务：U1.1~U1.6 全部完成
- 允许改动范围：全部已实装页面的样式层（Tailwind class / Design Token 引用），不改业务逻辑
- Goal 提示词：
  ```
  目标：为 U1.1~U1.6 已实装的六个页面补齐暗色主题样式，严格复用设计系统清单中
  的暗色专�?Token（glass/on-accent/*-fill 等），不新增未在 Token 体系中定�?
  的颜色值�?

  前置任务：U1.1, U1.2, U1.3, U1.4, U1.5, U1.6

  允许改动范围�?
  - 以上六个任务已创建的所有页�?组件文件（仅样式相关改动�?

  完成条件�?
  - [ ] pnpm lint / pnpm tsc --noEmit / pnpm build 通过
  - [ ] 全部改动为样式类调整，未修改任何组件的业务逻辑代码
  - [ ] 暗色下的颜色值均可追踪到设计系统清单定义�?Token，无硬编�?
  - [ ] 六个页面在暗色模式下与设计交接文�?Zone D 章节逐页核对一�?

  不在本任务范围内�?
  - 不实现主题切换开关的交互逻辑本身（若尚不存在，需先确认是否已有全局主题
    状态机制，缺失则提出补充任务卡建议，不在本卡内临时新增�?
  ```

### U1.8 �?端到�?UI 走查（Tier B 里程碑收口）

- 状态：�?
- 前置任务：U1.1~U1.7 全部完成
- Goal 提示词：
  ```
  目标：作�?UI Track 的里程碑收口，Codex 自主走查一次完整用户路径：
  首页→新建项目（提交脚本）→画布（触发语义拆分，观察分镜通道物化）→
  任一分镜详情页（触发单镜渲染，验证产物存在）→导出页（验证未完成时导�?
  按钮禁用逻辑）→设置页（验证 Key 保存/校验路径）。使�?§7 的开发期种子
  Key 完成一次真�?AI 调用的功能性验证（不要求视觉效果好，只验证链路不报错�?
  产物格式正确）�?

  前置任务：U1.1, U1.2, U1.3, U1.4, U1.5, U1.6, U1.7

  完成条件�?
  - [ ] 全量 pnpm lint && pnpm tsc --noEmit && pnpm build 三连�?
  - [ ] 上述完整路径每一步均有明确的通过/失败记录，产出一份里程碑报告草稿
        （内容后续由人工追加�?docs/updates/�?
  - [ ] 记录本次走查中发现的任何规范缺口或设计稿与实现的偏差，作为遗留问�?
        列出，不在本卡内擅自修复超出范围的问�?

  不在本任务范围内�?
  - 不做视觉效果的主观评价（这部分是人工验收职责，见总纲 §8.3�?
  ```

---

## 任务卡总览统计

| Track | 任务�?| 说明 |
|---|---|---|
| F（地基） | 7 | 必须最先完成，严格顺序 |
| C（画布） | 5 | 依赖 F0.4/F0.5 |
| D（Director：方法论移植 + Pi 编排�?| 7 | D0.1/D0.2 为方法论移植，无外部 Skill 依赖；D1.x 依赖 F0.1 结论 |
| R（渲染） | 6 | 依赖 F0.6/F0.7 |
| P（Pencil 组件港口，SSOT 强制�?| 6 | 必须排在 Track U 之前完成 |
| A（音频，Demo 占位�?| 1 | P1 真实实现延后 |
| U（UI�?| 8 | 依赖 Track P + C/D/R 对应 API |
| **合计** | **40** | 另有 Tier B 里程碑验收穿插在每个 Track 完成后触发，不单独计入任务数 |

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-07-23 | 初版发布�?2 张任务卡覆盖 Foundation/Canvas/Director/Render/Audio/UI 六条 Track |
| 2026-07-23（修订） | **架构纠正**：Track D 新增 D0.1/D0.2（video-director 方法论移植为原生 Zod schema + prompt 模板），D1.1/D1.2 措辞改为"�?tool-calling 引擎，不�?Skill"；新�?**Track P �?Pencil 组件港口**�? 张任务卡，`canvas.pen` 30 个组件通过 Pencil MCP 一比一移植 + 登记 `/playbook`），并设�?Track U 的强制前置；Track U 全部任务卡改�?�?import Track P 组件，禁止重新实�?；任务卡合计 32�?0 |
