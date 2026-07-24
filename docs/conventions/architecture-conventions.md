# CodeVideoCanvas v3 架构规范

> 状态：Active
> 规范来源：
> [Architecture & Execution Spec v3](../specs/2026-07-24-refactor-v3-architecture-spec.md)
> 本文只给出日常编码约定；冲突时以上述 Spec 的稳定规则 ID 为准。

## 1. 简单性原则

v3 的目标是删除重复基础设施，不是堆叠新抽象：

- 一个活动数据库：Postgres；
- 一个异步编排器：Trigger.dev；
- 一个 Agent Runtime：Pi Agent；
- 一个 AI/LLM 模型选择入口：ModelPolicy；
- 一个零 Agent 媒体选择入口：MediaProviderPolicy；
- 一个 readiness 入口：ExecutionPolicy；
- 一个 canonical source：ShotSourcePackageV1；
- 一个终态帧时钟：HyperFrames；
- 一个 UI 初始业务真源：ProjectRunSnapshotV1；
- 一个任务状态账本：v3 Task Breakdown。

引入新组件时必须说明它替换什么或为何属于独立边界。禁止以“未来可能需要”为理由
加入 Redis、CQRS、事件溯源、微服务或第二 runtime。

## 2. 分层与目录

| 层 | 目录 | 允许 | 禁止 |
|---|---|---|---|
| Route/UI entry | `src/app` | 路由、layout、薄 API/server action | SQL、prompt、状态机、FFmpeg |
| Task entry | 根目录 `trigger` | payload、context、service 调用、Result 映射 | 领域逻辑、Drizzle、source parser |
| Application/domain | `src/features/*` | use case、policy、domain service、view-model | SDK 细节横向泄漏 |
| Contract | `packages/contracts` | browser/server-safe DTO、schema、fixture | DB/Node/SDK 副作用 |
| Compiler | `packages/video-compiler` | 纯 source→bundle 编译 | DB、网络、Agent、clock |
| Infrastructure | `src/lib` / `src/server` | port adapter、composition root | 产品规则 |
| Visual primitive | `src/components` | Pencil-derived 纯展示组件 | 业务查询/状态机 |

目标领域：

```text
pipeline
ai
artifacts
canvas
render
media
compose
canvas-workspace
navigation
```

`media` 负责 TTS/ASR/SFX/subtitle、`MediaProviderPolicy`、
`MediaProviderRegistry` 与 provider adapter；`render` 拥有 attempt-scoped
`RenderWorkspace` 基础实现；`compose` 只负责 timeline、mix、concat、
`ComposeWorkspace` facade 与终片验证。迁移完成后不得同时保留 `audio`、`media`、
`compose` 三套重叠领域，也不得在 `compose` 复制第二套本地 workspace 实现。

每个领域优先采用：

```text
types.ts / schemas.ts
ports.ts
actions.ts
queries.ts
services/
components/
__tests__/
```

只在确有多实现时定义 port；只有一个简单调用点时使用普通函数。

## 3. 依赖方向

```text
app / trigger
      ↓
application services
      ↓
domain + versioned contracts
      ↑
infrastructure adapters
```

- route/task 只依赖公开 application service。
- application service 依赖 port，不依赖具体 Drizzle/Trigger/Pi/HyperFrames client。
- infrastructure adapter 可以依赖 domain contract，domain 不反向依赖 adapter。
- 每个 feature/package 通过 `index.ts`、包根导出或明确 application service 暴露公共
  能力；跨域只从该入口 import，禁止 deep import 对方 repository、schema、
  infrastructure 或其他私有文件。
- UI 只消费 CVC DTO；禁止传递 Drizzle row、Trigger run、Pi message 或 provider SDK
  response。
- 正式代码不得 import `src/app/_dev`。

## 4. Trigger 与业务状态

七个 task 是部署/资源边界，不与 Canvas 节点一一对应。运行时 ID 必须使用下面的
`cvc.*` 全名；新增 task/queue 必须 ADR。

```text
cvc.pipeline.run → cvc.project.plan → cvc.shot.generate
cvc.shot.generate → cvc.shot.media
cvc.shot.generate → cvc.shot.render → cvc.shot.qa
cvc.shot.media + cvc.shot.qa → cvc.project.compose
```

状态所有权：

| 状态 | 所有者 | 用途 |
|---|---|---|
| `task_attempts` checkpoint/terminal | application service + PG transaction | 步骤业务真源 |
| `pipeline_runs.status` | run projector/application service | 持久化聚合 |
| `canvas_nodes.status` | node projection | 可重建产品视图 |
| Trigger status | Trigger | transport/live execution |
| Realtime event | read-only UI bridge | 临时反馈，不提交业务终态 |

所有业务命令使用 receipt。Trigger idempotency key 显式 global；fingerprint 由版本化
canonicalizer、workflow、intent、实体/input hash 和适用的模型路由组成。应用不声称
exactly-once，而以 receipt + global key + attempt fence 达到可重放副作用。

## 5. Pi 与模型边界

仅四类 `AiTaskKind`：

```text
project-plan
shot-spec
fabricate
vision-qa
```

`PiStructuredRunner` 是唯一生产 `Agent` import。每个 invocation：

1. 解析版本化 input；
2. 由 ModelPolicy 解析 provider/model；
3. 创建短生命周期 Agent；
4. 只挂一个 terminal Tool；
5. Tool 参数 schema + semantic validate；
6. 返回 output、resolved model、usage 和 safe trace；
7. 结束 session。

`shot-spec` checkpoint 完成后必须创建新的 fabricate Agent。结构化 repair 不跨
invocation。服务任务不得包装成 Agent Tool 以逃避普通代码契约。

safe trace 只能包含白名单事件和脱敏摘要；不持久化 raw delta、Tool 值、provider
原始错误、prompt、source、credential 或隐藏 reasoning。

TTS/ASR 是 `MediaTaskKind='tts'|'asr'` 的普通服务任务。只有
`MediaProviderPolicy` 选择 provider/model，只有 `MediaProviderRegistry` 构造具体
SpeechProvider adapter；它们不进入 Pi，也不扩充四个 `AiTaskKind`。

## 6. Source、compiler 与 bundle

```ts
interface ShotSourcePackageV1 {
  schemaVersion: 'cvc.shot-source/v1'
  bodyFragment: string
  css: string
  setupJs: string
  timelineJs: string
}
```

Normalizer 的匹配顺序固定为 strict object、完整 JSON、单一 JSON fence、唯一四段
fragment、单一 legacy HTML，否则拒绝。前端预览与服务端复验共享 browser-safe 纯核心，
但只有服务端结果可以提交 artifact。

`timelineJs` 只向 compiler-owned paused GSAP timeline 加 tween。compiler 自行生成
shell、root、CSP、尺寸、fps、duration、seed、asset map 与 HyperFrames 注册。

CVC 输出 `CvcCompositionBundleV1`；跨项目只暴露
`RenderableBundleDescriptorV1`。bundle hash 采用版本化 canonical manifest，file 按
path 排序、asset hash 排序，不受输入枚举顺序影响。

## 7. 门禁与 sandbox

十级门禁：

| Gate | 责任 |
|---:|---|
| G1 | normalization 唯一性 |
| G2 | strict schema/长度 |
| G3 | HTML/CSS/JS syntax |
| G4 | static security |
| G5 | static determinism |
| G6 | compiler shell/timeline/manifest |
| G7 | HyperFrames check |
| G8 | 0/中/末/乱序 seek |
| G9 | 同帧像素 hash 与非空画面 |
| G10 | ffprobe/stream/duration/size/entity hash |

G1–G5 可生成 issue codes 交给新的 fabricate repair invocation；G6–G10 是基础设施
问题，不交给模型猜修。

模型 JS 最终仍会执行，因此必须有 runtime sandbox：独立 browser context/必要时独立
process、断网、受限 CSP、无 Node integration、bundle-root path fence、allowlisted
assets、时间/内存/进程/输出/console 配额与错误脱敏。

## 8. Artifact 与 workspace

ArtifactStore：

- 每次读写都接收 `WorkspaceScope`；
- 业务只传 artifact ID，不传 raw storage key；
- store 生成 key 并验证 workspace/project/run/attempt；
- approved/released version 不可更新或删除；
- 删除仅由带 capability 的 GC service 执行。

RenderWorkspace：

- 每个 attempt 独立 root；
- 只接受安全相对路径；
- 不允许 `..`、绝对路径、symlink escape；
- 正常、失败、取消都 cleanup；
- 绝对路径不进入 DB、日志或 UI。

业务代码需要文件能力时先扩展 port/adapter，不直接散落 `node:fs/promises`。

## 9. Postgres

- `snake_case`、UUID、`timestamptz`；
- workspace 业务表 `(workspace_id,id)` 复合主键；
- 复合 FK 必须包含 `workspace_id`；
- 状态用 text + named CHECK；
- JSONB 只放版本化 payload/metadata；
- 可更新聚合有 `revision` 并使用 compare-and-swap；
- migration SQL 生成、审阅、提交；启动时不自动 generate/push。

网络/provider 调用不得持有数据库 transaction。start/checkpoint/finish 各自是短 CAS
事务。artifact index 与业务引用同一事务；外部对象写失败/DB 失败有明确补偿。

SQLite 迁移只能从 Online Backup 一致性快照读取；原 DB、WAL、备份和 export manifest
保持只读可恢复。

<a id="ui-design-ssot"></a>

## 10. UI 与设计 SSOT

视觉顺序：

```text
canvas.pen reusable symbol
  → components + demo
  → /playbook registry
  → feature/page composition
```

`.pen` 文件只能通过 Pencil MCP。没有打开目标文件时停止设计 Task。

- 可复用视觉组件实现在 `src/components` 或所属 feature，通过公共导出复用；
  `/playbook` 是唯一登记与真实 demo 路由，不是业务组件实现目录。
- 所有产品页面统一位于 `src/app/(app)` 路由组，由共享 layout 只挂载一次
  `AppShell`/Sidebar；页面通过 `nav-context` 发布可信上下文并只替换内容区。
  `/playbook` 保持在该路由组之外。
- 页面不复制视觉原语、AppShell、Sidebar、TopNav 或动效实现。
- Design Token 管理颜色/阴影/圆角/间距；Lucide 白名单管理图标。当前 Canonical 视觉体系固定为 A → B → C → S；R2/R3 仅是来源档案，正式页面不得直接依赖。
- 当前主题为 Porcelain Light / Obsidian Navy Dark，统一使用 `mode: light | dark` 与 `ds-*` token。Light 与 Dark 独立校准；禁止页面局部硬编码颜色。唯一批准例外是 S6 两个 Save 实例使用主题化 `ds-save-*` 中性色。
- 根 layout 只挂一次 `AppMotionConfig`。应用 UI 动效使用 `motion/react`、
  `src/lib/motion` token 与共享 `collapsible-panel`/variants；页面不得硬编码时长、
  贝塞尔、timer 或建立平行动效原语，并必须遵循 reduced motion。
- 视频 source 禁止使用应用 UI motion。
- 可见字段必须有 DB/API/artifact source；无能力时显示 empty/disabled/explicit
  placeholder。
- Snapshot 是首次加载和断线对账真源；Realtime 只更新 live view。
- Inspector 为数据、源码、门禁、执行四页签。
- JSON viewer 只用 React text node，并限制 depth 6、node 500、copy 64 KiB。

## 11. 文件预算

| 文件类型 | 目标 | 硬上限 |
|---|---:|---:|
| `page.tsx` | 200 | 300 |
| 一般生产文件 | 250 | 350 |
| schema/repository | 按聚合拆分 | 400 |
| 单函数 | 40 | 50 |

一个文件只有一个主要变化原因。新增能力前先搜索并复用现有公开 contract、service、
hook、组件和动效原语，遵循 DRY/YAGNI。超限或职责混杂不是“以后再拆”的常态；对应
Task 必须在同 Track 按 domain/application/infrastructure/UI 职责真实拆分，或给出
Architecture-approved exception。禁止用纯 re-export 壳、搬移大段代码或循环依赖规避
行数门禁。

## 12. 变更规则

- 改 Product 行为：先改 Product Spec，再追溯 Architecture/Task。
- 改长期架构：新增或 supersede ADR，再改 Architecture Spec。
- 改施工方法：改 Harness。
- 改当前状态：只改 Task Breakdown。
- Issue 只能补充证据和步骤，不自行改变规范合同。
- 已完成 Task 不回写改义；新问题建新 Task/issue 并关联 supersedes。
