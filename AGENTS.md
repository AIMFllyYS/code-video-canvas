# AGENTS.md — CodeVideoCanvas v3

本文件是 AI 编码代理的运行入口。注意中文与 UTF-8；禁止引入 U+FFFD。仓库存在
Git 时，每完成一个 Task 或文档阶段都要本地 Conventional Commit；未经用户明确授权
不得 push、创建 PR 或改写远端。

## 1. 当前状态

CodeVideoCanvas 正从 Demo v1 迁移到 v3。当前代码仍可能包含 SQLite、进程内队列、
stream-bus、自建 `__CVC_RENDER__` 与大 Director session；它们是待迁移现状，不是
目标架构。

v3 已锁定：

- Next.js 全栈应用；
- Postgres（本地 Docker）是唯一活动结构化数据源；
- Trigger.dev 是唯一异步编排器；
- **Pi Agent 是 CVC 唯一 Agent Runtime**；
- 禁止引入 OpenAI Agents SDK 主链路或 fallback；
- `ShotSourcePackageV1 → video-compiler → CvcCompositionBundleV1 →
  RenderableBundleDescriptorV1 → HyperFrames` 是标准渲染链；
- ArtifactStore 管远端/持久产物，RenderWorkspace 管 attempt-scoped 本地临时文件；
- UI 只消费项目 DTO，不直接消费 Trigger/Pi/Drizzle SDK 类型；
- PurpleInk 只对齐 DTO/Port/Compiler/Render 合同，不自动复制其 DB、认证、Agent、
  Trigger 项目或 UI。

实施必须按 N0–N7 逐 Track 进行；不能因为目标已确定，就提前在错误 Track 修改代码。

## 2. 开工读取顺序

任何实现工作前完整读取：

1. 本文件；
2. [Product Spec v3](./docs/specs/2026-07-24-refactor-v3-product-spec.md)；
3. [Architecture & Execution Spec v3](./docs/specs/2026-07-24-refactor-v3-architecture-spec.md)；
4. [Codex Goal Harness v3.1](./docs/specs/2026-07-24-refactor-v3-codex-harness.md)；
5. [v3.1 Task Breakdown](./docs/specs/2026-07-24-refactor-v3-task-breakdown.md) 中当前 Track；
6. `docs/issues/refactor-v3/issue-n*.md` 中对应实施计划；
7. 当前 Task 指向的设计源、合同与测试。

一次 Codex Goal = 完整完成 N0–N7。Track 是该 Goal 内部按顺序推进的阶段与退出门，
不是八个独立 Goal；Task 是 Track 内的最小施工单元。Goal 从 Task Breakdown 中首个
未完成 Task 恢复，每个 Track 收口后重新读取当前权威、核验真实基线并自动进入下一
Track，直到 N7 完成前不得因“工作量大”提前结束 Goal。Task Breakdown 是唯一状态
账本；Issue 只定义详细施工步骤。旧 2026-07-23 PRD/Harness/Task Breakdown、
`docs/designs/tasks.md` 和旧 known-issues 只保留历史证据，不指导 v3 新施工。

若这些活动文档冲突，停止相关实现并报告 `DOC-CONFLICT`；不得按日期或个人偏好猜测。

## 3. 施工模型

- 先确认当前 Track 为 `ready`，依赖 Track 已 `done`。
- 严格遵守 Task 的 Create/Modify/Delete/禁止范围。
- 先写失败测试或失败守卫，再写最小实现，再重构。
- Task 完成做 focused gate；Track 收口做完整 Tier B；N7 做 Tier C。
- 真实付费模型调用按 Harness 预算集中执行，不在每个 Task 重复烧调用。
- fixture、录制 transcript、真实模型调用必须分别标注；fixture FABRICATE 不能宣称
  真实 AI E2E。
- 每个 Task 独立 RED→GREEN→验证→本地 commit；每个 Track 独立完成 Tier B、账本
  对账和 closeout，但 Track closeout 不等于 Goal complete。
- 范围不足时先改 Spec/Task，不顺手扩写架构。
- 保留用户已有修改；共享权威文档、schema/migrations、package/lock、`canvas.pen`
  必须串行修改。
- 新建 contract、service、hook 或组件前先搜索并复用现有公开能力；遵循 DRY/YAGNI，
  禁止为同一职责新增平行 wrapper、第二套状态模型或“以后可能需要”的抽象。

## 4. 目标目录与依赖方向

```text
packages/
  contracts/              browser/server-safe versioned contracts
  video-compiler/         pure source → CVC bundle compiler
trigger/                  seven Trigger task shells + config
src/
  app/                    route/page/layout/API thin entries
  features/
    pipeline/             commands, readiness, attempts, snapshots
    ai/                   four Pi-backed AI tasks + ModelPolicy
    artifacts/            normalizer, gates, lineage, store services
    canvas/               DAG/domain model and graph actions
    render/               provider, workspace, media probe
    media/                TTS/ASR/SFX/subtitle
    compose/              timeline, mix, concat, verify
    canvas-workspace/     product UI/view-models
    navigation/           persistent app shell
  components/             Pencil-derived visual primitives
  lib/                    infrastructure adapters only
  server/                 server-only composition root/helpers
```

依赖方向：

```text
src/app + trigger → application services → domain/contracts → ports
                                              ↑
                              infrastructure adapters
```

- `src/app` 与根目录 `trigger` 不放 SQL、prompt、source parser、FFmpeg 参数或业务状态机。
- 每个 feature/package 只通过 `index.ts`、包根导出或明确 application service 暴露
  公共能力；跨域禁止 deep import 对方 repository、schema、infrastructure 或私有文件。
- Drizzle 只存在于数据适配层；Trigger SDK 只存在于 task/dispatcher/realtime adapter。
- Pi `Agent` 只允许在 `pi-structured-runner.ts` 的生产实现导入。
- compiler 不 import DB、Trigger、Pi、ArtifactStore、clock 或 UI。
- renderer 不反向 import `ai` 或 `pipeline` 实现。
- 正式代码禁止引用 `src/app/_dev/`。

## 5. Trigger.dev 边界

活动 task ID 只允许：

```text
cvc.pipeline.run
cvc.project.plan
cvc.shot.generate
cvc.shot.media
cvc.shot.render
cvc.shot.qa
cvc.project.compose
```

执行依赖是：

```text
cvc.pipeline.run → cvc.project.plan → cvc.shot.generate
cvc.shot.generate → cvc.shot.media
cvc.shot.generate → cvc.shot.render → cvc.shot.qa
cvc.shot.media + cvc.shot.qa → cvc.project.compose
```

- `cvc.shot.generate` 内的 `shot-spec` 与 `fabricate` 是两个独立短生命周期 Pi
  invocation/session；spec checkpoint 先提交，再新建 fabricate Agent。
- task 薄壳只 parse payload、创建 context、调用 service、检查 Result、映射 output。
- 初始 queue 仅 `ai=2`、`render=1`、`media=2`、`compose=1`；增加 queue/task 必须 ADR。
- CVC key 显式使用
  `idempotencyKeys.create(key, { scope: 'global' })`，禁止依赖 SDK 默认 scope。
- receipt 同 key/同 fingerprint 返回原结果；同 key/不同 fingerprint 返回 409。
- receipt 与 `pipeline_runs(triggering)` 同事务创建；dispatch 崩溃由相同请求或
  reconciler 复用 global key 恢复。
- Trigger status 只用于 transport/live view，不是业务 terminal 真源。

## 6. 状态与数据所有权

- Postgres 业务表使用 `snake_case`、UUID、`timestamptz`、版本化 `jsonb`。
- workspace 业务表使用 `(workspace_id,id)` 复合主键；跨 workspace FK 包含
  `workspace_id`。
- `task_attempts` checkpoint/terminal 是步骤级真源。
- `pipeline_runs.status` 是持久化聚合状态。
- `canvas_nodes.status` 是可重建 UI 投影，只与 attempt/artifact commit 同事务更新。
- Realtime 不能直接写业务终态。
- `ExecutionPolicy` 是 readiness 唯一入口；`blocked/ready` 不作为第二套执行状态写库。
- approved/released artifact 不可更新或删除；实体 `content_hash` 必须是实际字节
  SHA-256。
- credential 只存加密 ciphertext；master key 仅从 server-only secret/env 取得，
  不得明文 fallback。
- 不新建“包罗万象”的 `run_events` JSON 表。

迁移旧 SQLite 时必须用 SQLite Online Backup API 生成活动 WAL 一致性快照，再执行
`PRAGMA quick_check`、计数与 SHA-256。禁止用普通 `Copy-Item app.db` 冒充备份。

## 7. Pi Agent 与模型调用

唯一模型任务：

```text
project-plan
shot-spec
fabricate
vision-qa
```

- 所有 AI/LLM 模型选择只在 `ModelPolicy.resolve(AiTaskKind, workspaceSettings)`。
- 只有 ProviderRegistry 创建 `pi-ai` provider/model。
- 每个 invocation 只挂一个 terminal Tool；Tool args 经 Zod 与语义校验后才是产物。
- 成功 Tool 返回 `terminate: true`；没有 Tool、多个 terminal Tool、混合 batch 都是
  content failure。
- 模型不得选择 workspace/project/node/artifact path。
- normalize、gate、compile、render、media、compose、verify 是普通服务任务，不进
  Agent loop。
- TTS/ASR 使用独立的 `MediaTaskKind='tts'|'asr'`、`MediaProviderPolicy` 与
  `MediaProviderRegistry`；只有 registry 构造具体 client，服务/task/UI 不选择
  provider/model 或读取 env。
- safe trace 不保存 raw assistant delta、Tool 参数值、provider 原始错误、prompt、
  source、credential 或隐藏 reasoning。
- 不能因普通 OpenAI-compatible client 包名存在，就误判为 OpenAI Agents SDK；
  禁止的是第二 Agent Runtime。

## 8. Source、compiler 与渲染

canonical source：

```ts
interface ShotSourcePackageV1 {
  schemaVersion: 'cvc.shot-source/v1'
  bodyFragment: string
  css: string
  setupJs: string
  timelineJs: string
}
```

- `bodyFragment` 非空；其他字段存在但可空。
- 完整 HTML、JSON fence 和四段代码仅是兼容输入；服务端 normalizer 是提交权威。
- `setupJs` 只做同步确定性初始化。
- `timelineJs` 只向 compiler-owned paused GSAP timeline 添加 tween；禁止第二时钟、
  `__CVC_RENDER__`、play/ticker/timer。
- compiler 拥有 shell、尺寸、fps、duration、seed、依赖和 asset 装配。
- canonical manifest 的 files/asset hashes 排序；枚举顺序不能改变 bundle hash。
- CVC 本地 bundle 叫 `CvcCompositionBundleV1`；跨项目桥只叫
  `RenderableBundleDescriptorV1`。

视频仍是 `f(frame)`。渲染 source 禁：

```text
requestAnimationFrame
GSAP ticker/play
Date.now / performance.now
unseeded Math.random
setTimeout / setInterval
render-time fetch/network
CSS animation/transition
input/hover/scroll dependent state
```

静态门禁不能替代 sandbox。模型 JS 运行在独立 browser context/必要时独立 process，
断网、受限 CSP、无 Node integration，只能访问 bundle root/allowlisted assets，并有
时间、内存、进程、输出和 console 配额。

## 9. Artifact 与文件系统

- ArtifactStore 方法必须接收 `WorkspaceScope` 和 artifact ID；store 自行生成 raw key。
- 业务代码不得接收 raw storage key 或通用 `remove(key)`。
- 删除只暴露给带 capability 的 GC service；未提交上传用 upload token 回收。
- RenderWorkspace 只 materialize 到 attempt root 内的安全相对路径。
- 绝对路径不得持久化、写日志或返回 UI。
- 需要 temp/read/remove 能力先扩展 port/adapter；业务域禁止散落裸
  `node:fs/promises`。
- 二进制写入、实体 hash、attempt fence、DB artifact 引用必须按原子提交协议执行。

## 10. UI、Pencil 与真实性

- `docs/designs/canvas.pen` 是视觉 SSOT；`.pen` 只能通过 Pencil MCP 读取/修改，禁止
  shell Read/Grep。
- 没有打开 `.pen` editor 时，Pencil Task 必须停止，不得伪造设计同步。
- 新视觉组件顺序固定：Pencil reusable symbol → 可复用组件实现与 demo →
  `/playbook` 登记 → 页面通过公共导出复用。`/playbook` 是唯一组件登记/展示路由，
  不是业务实现存放处；其他页面不得从 route 私有文件 deep import。
- `(app)` 共享 layout 只挂载一次 `AppShell`/Sidebar；页面通过 `nav-context` 发布可信
  路由上下文并只组合已登记视觉原语，禁止复制 AppShell、Sidebar、TopNav 或组件实现。
- 颜色、间距、圆角、阴影用 design token；图标用 Lucide 白名单，禁 emoji。
- 根 layout 只挂载一次 `AppMotionConfig`；应用 UI 动效统一用 `motion/react`、
  `src/lib/motion` token 与既有 `collapsible-panel`/variants，禁止页面硬编码时长、
  贝塞尔、timer 或平行动效原语；必须遵循 reduced motion，且 motion 不进入视频渲染。
- 每个可见字段必须追溯到 Snapshot/artifact/API；禁止固定假百分比、恒真 QA、
  无链接 artifact 或可点但无行为的控件。
- Inspector 固定为数据、源码、门禁、执行四页签。
- JSON viewer 只用 React text node，默认 depth 6、node 500、copy 64 KiB，禁止
  `dangerouslySetInnerHTML`。

## 11. 文件与编码

- `page.tsx` 目标 ≤200 行，硬上限 300。
- 一般生产文件目标 ≤250 行，硬上限 350。
- schema/repository 按聚合拆分，硬上限 400。
- 单函数 ≤50 行；一个文件只有一个主要变化原因。
- 碰到硬上限或职责混杂，必须在当前 Task 按 domain/application/infrastructure/UI
  职责真实拆分并复用公共代码；禁止只套 re-export 壳、转移大段代码或制造循环依赖来
  规避行数门禁。
- TypeScript strict，禁 `any`；使用 `unknown` + 收窄。
- 默认 Server Component；`'use client'` 尽量下沉叶子。
- Next.js 使用 `proxy.ts`，不用 `middleware.ts`；异步 `params/searchParams/cookies/
  headers` 必须 await。
- 不手改 `pnpm-lock.yaml`；依赖由 pnpm 命令产生并锁精确版本。
- 不提交构建物、`.env*`、`.data/`、`.trigger/`、`output/` 或凭据。

## 12. Key 与 secret

用户已授权代理读取 `.env`/`.env.local` 做本地验证，但：

- 只引用变量名，不回显值；
- 不写入源码、测试 fixture、日志、commit 或对话；
- 禁止 `NEXT_PUBLIC_*` key；
- 客户端不得解析 provider credential；
- 设置 API 必须先验证，再保存；失败不能覆盖已有 secret。

## 13. 验证与完成

Task 使用 Issue 卡中的 focused 命令。Track 收口至少运行：

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

并按 Track 执行 PG、Trigger、Pi、compiler/HyperFrames、compose、browser 或 E2E 专项
门禁。用户可见视频结论必须有真实像素、HyperFrames check/snapshot、ffprobe/decode
和实体 hash；架构测试不能替代最终视觉/媒体证据。

完成前：

1. 检查 staged scope；
2. 扫描 U+FFFD、secret、禁止依赖和越界 import；
3. 将 Task 状态与证据写回唯一 Task Breakdown；
4. 按 Issue 的 commit boundary 本地 commit；
5. Track 退出门通过后重新核验权威文档、实际 branch/SHA/worktree 与下一 Track
   readiness，在同一 Goal 内继续；只有 N7 Tier C 与总验收全部通过才能结束 Goal。

## 14. Git 与破坏性操作

- 分支：`main`、`dev`、`feature/*|fix/*|chore/*`。
- Commit：`type(scope): description`，正文包含 Task ID。
- 不使用 `git reset --hard`、`git checkout --` 覆盖用户改动或 force push。
- 删除旧 runtime 前先证明替代路径通过 Track Gate、引用为 0，并按 Task 精确清单删除。
- 数据迁移前创建、校验并保留可恢复备份。
- 未经明确授权不 push、不创建 PR。

## 15. 当前关键入口

- [Master Index](./docs/plans/2026-07-24-refactor-blueprint-00-master-index.md)
- [Product Spec](./docs/specs/2026-07-24-refactor-v3-product-spec.md)
- [Architecture Spec](./docs/specs/2026-07-24-refactor-v3-architecture-spec.md)
- [Codex Harness](./docs/specs/2026-07-24-refactor-v3-codex-harness.md)
- [Task Breakdown](./docs/specs/2026-07-24-refactor-v3-task-breakdown.md)
- [Architecture Conventions](./docs/conventions/architecture-conventions.md)
- [Design System](./docs/designs/2026-07-23-design-system-inventory.md)
- `docs/issues/refactor-v3/issue-n*.md`
