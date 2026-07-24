# issue-09 — AI 流式输出全链路修复：进程内单例 split-brain + SSE 判定缺陷 + 回放兜底

| 字段 | 值 |
|---|---|
| 优先级 | **P0**（用户可见核心功能失效：所有 Director 节点的"AI 流式输出"面板在多数场景下永久卡在"正在连接 AI 流… 0 字"） |
| Wave | 5（第二轮系统性审查，2026-07-24） |
| 依赖 | 无，可立即开工 |
| 关联证据 | 用户实测截图：`shot-split`（DIRECT）与 `shot-script`（SHOT_SPEC）节点已 success（生成进度 100%、产物 chips 正常），流式面板仍显示"正在连接 AI 流… · 0 字"；同项目 `shot-codegen`（FABRICATE）节点却能一次性显示 11164 字全文 |
| 状态 | 待施工 |

## 症状

1. 节点执行**过程中**打开 Inspector，流式面板显示"正在连接 AI 流…"，字符数恒为 0，直到执行结束都收不到任何 delta。
2. 节点执行**完成后**（success/failed），重新选中该节点，面板仍然永久显示"正在连接 AI 流… · 0 字"，**永远不会**切换到回放内容。
3. 同一项目中个别节点（截图中的 shot-codegen）却能显示完整的最终文本——表现出"按节点类型好坏不一"的假象。

## 根因（三个缺陷叠加，缺一不可复现全部症状）

### 根因 1（核心）：模块级内存单例在 Next.js 下 split-brain

[`src/lib/stream/stream-bus.ts`](../../src/lib/stream/stream-bus.ts) L166：

```typescript
export const streamBus = new StreamBus()
```

这是**裸模块作用域单例**，全仓库 `src/` 目录 0 处 `globalThis` 锚定（已 grep 核实）。同样模式的还有：

- [`src/lib/queue/index.ts`](../../src/lib/queue/index.ts) L5：`export const queue = new InProcessQueue()`
- [`src/lib/queue/init.ts`](../../src/lib/queue/init.ts) L4-L5：`let initialized = false` 模块级标志
- [`src/lib/db/client.ts`](../../src/lib/db/client.ts) L5：`let cached: Db | undefined`

在 Next.js（Turbopack dev 按路由入口编译 + HMR 重新求值模块）下，`/api/director/stage`（enqueue 并在其模块图内经队列执行 `stage-runner` → `pi-session` → `streamBus.publish()`）与 `/api/director/stream/[nodeId]`（SSE 路由内 `streamBus.subscribe()`）**可以各持一个互不相通的 StreamBus 实例**。这是 Prisma/数据库连接在 Next.js 中必须用 `globalThis` 缓存的同一类经典问题。

后果：发布端的 `delta`/`markDone`/`markError` 永远到不了订阅端 → 执行中面板 0 字（症状 1）。

> 为什么节点状态推进、产物 chips 一切正常？因为它们走 SQLite（文件级共享，跨模块图无感知）。**唯独纯内存的 streamBus 断裂**——这正是"其他都好、只有流式坏"的指纹特征。
>
> 队列的 split-brain 目前未直接引爆，是因为 `/api/director/stage` 路由自己调用了 `initQueue()`（[`src/app/api/director/stage/route.ts`](../../src/app/api/director/stage/route.ts) L19），enqueue 与 handler 恰好落在同一实例里。但这属于"侥幸正确"：instrumentation.ts 启动的队列实例与各 API 路由的队列实例可能不是同一个，`docs` 声称的"共用根 instrumentation.ts 启动的单例队列"实际不成立，必须一并修复。

### 根因 2：SSE 订阅动作本身会制造"永久滞留"的空 entry

[`src/lib/stream/stream-bus.ts`](../../src/lib/stream/stream-bus.ts)：

- `subscribe()`（L114-L128）第一行调用 `this.ensure(key)`——**订阅这个只读动作会在订阅端实例中创建一个 `{ text: '', done: false }` 的空 entry**；
- `maybeCleanup()`（L153-L162）只清理 `done === true` 的 entry。

在 split-brain 前提下，这个空 entry 永远等不到（发生在另一实例上的）`markDone`，于是**永久滞留**在订阅端实例的 Map 里。

### 根因 3：useLive 判定被滞留 entry 骗过，回放路径永远走不到

[`src/app/api/director/stream/[nodeId]/route.ts`](../../src/app/api/director/stream/%5BnodeId%5D/route.ts) L41-L42：

```typescript
const useLive =
  streamBus.has(key) || context.status === 'running' || context.status === 'pending'
```

节点已 success 后前端重连（[`use-stage-stream.ts`](../../src/lib/hooks/use-stage-stream.ts) 的 connKey 含 status，状态变化会重建 EventSource）：

- 因根因 2 的滞留 entry，`streamBus.has(key) === true` → 仍走 live 分支；
- live 分支下发的 snapshot 是滞留 entry 的内容：`{ text: '', done: false }`；
- 前端收到后 `streaming = true`、`charCount = 0` → 渲染"正在连接 AI 流…"，且因 `done:false` 连接不关闭，**永久卡死**（症状 2）。

而"个别节点能显示全文"（症状 3）的真实解释：那次连接时订阅端实例恰好没有该 key 的滞留 entry（执行期间没打开过 Inspector / 进程重启过），`has(key) === false` 且节点已终态 → 走 L105-L116 的回放路径，读 `director-stream-log` 产物一次性展示。**分界不在 nodeType，在于订阅端实例是否被污染过。**

### 佐证：持久化链路本身是好的

[`stage-runner.ts`](../../src/features/director/stage-runner.ts) L121-L128（成功）与 L145-L155（失败）都会调用 `persistStreamLog()`，且成功路径有 `|| result.text` 兜底（发布端与 runner 同图，`getSnapshot` 取得到文本；即使取不到也用最终回复全文）。[`runtime-repository.ts`](../../src/features/director/runtime-repository.ts) L172-L188 落盘 `director-stream/<projectId>/<nodeId>/<slug>.log` 并登记 `director-stream-log` artifact。所以**回放数据一直都在**，只是被根因 2+3 挡住了。

## 修复方案

### A. 全部进程内单例改为 globalThis 锚定（消灭 split-brain）

统一采用 Prisma 模式，示例（stream-bus）：

```typescript
const globalStore = globalThis as unknown as { __cvcStreamBus?: StreamBus }
export const streamBus: StreamBus = (globalStore.__cvcStreamBus ??= new StreamBus())
```

同样处理：

- `src/lib/queue/index.ts` 的 `queue`；
- `src/lib/queue/init.ts` 的 `initialized`/`initializing` 标志（防止不同模块图各自 `start()` 出双消费循环）；
- `src/lib/db/client.ts` 的 `cached`（better-sqlite3 连接在 HMR 下会累积句柄，顺手收口）。

注意保留 `import 'server-only'`，key 名带 `__cvc` 前缀避免碰撞；类型上不使用 `any`（用 `unknown` + 收窄或声明合并）。

### B. SSE 路由判定与订阅语义修正（防御性修复，即使 A 落地后也需要）

1. `useLive` 判定从 `streamBus.has(key)` 改为 `streamBus.isActive(key)`（`isActive` 已存在，L64-L67：有缓冲**且未结束**才算活跃）+ `running`/`pending`。这样已终态节点即使有残留 entry 也不会误入 live 分支。
   - 但要处理竞态：节点状态刚翻成 success、runner 尚未 markDone 的窗口（当前实现顺序是先 persist + markDone 再 transition success，窗口极小；反向顺序不存在）。稳妥做法：live 分支订阅到 snapshot 时若 `text === '' && done === false && 节点已终态`，直接降级走回放。
2. **回放合并兜底**：live 分支收到的 snapshot 文本为空且节点已终态时，读取持久化日志替代空文本下发（服务端合并，前端无感知）。
3. `subscribe()` 不应隐式创建 entry：`StreamBus.subscribe` 改为 key 不存在时只回放空 snapshot、不 `ensure()`（或 `ensure` 出的空 entry 在退订时无条件清理）。目标不变式：**只有 `publish`/`markDone`/`markError` 才能创建 entry**。

### C. 前端 hook 微调（可选强化）

[`use-stage-stream.ts`](../../src/lib/hooks/use-stage-stream.ts)：

- 收到 `snapshot` 且 `done === true` 后主动 `source.close()`（当前依赖服务端 `finish()`，双保险）；
- 保留 connKey 含 status 的派生复位设计（这是刻意为之的正确设计，勿改坏：`pending → running → success` 每次状态跃迁重连一次，服务端 snapshot 续传保证不丢内容）。

## 允许改动范围 / 禁止改动 / 完成条件

**目标**：任意 Director 节点，执行中实时逐 token 显示；执行结束后（含刷新页面、重启 dev server）总能回放出完整流式全文；失败节点显示已流出部分 + 持久化错误。

**允许改动范围**：

- `src/lib/stream/stream-bus.ts`（globalThis 锚定 + subscribe 语义）
- `src/lib/queue/index.ts`、`src/lib/queue/init.ts`（globalThis 锚定）
- `src/lib/db/client.ts`（globalThis 锚定）
- `src/app/api/director/stream/[nodeId]/route.ts`（useLive 判定 + 回放合并兜底）
- `src/lib/hooks/use-stage-stream.ts`（可选强化）
- 对应测试：`stream-bus` 单测（滞留 entry 不再产生、isActive 语义）、SSE 路由测试（终态 + 残留 entry → 走回放）、queue init 幂等测试

**禁止改动**：

- `pi-session.ts` 的 diff 推送逻辑与 `stage-runner.ts` 的 persistStreamLog 时序（它们是正确的，本 issue 不碰；与 issue-11 的 success-hook 改动解耦）
- `StreamingLogCard` 的视觉结构（issue-03 已验收）
- 不引入 Redis/外部依赖——Demo 阶段仍是单进程内存总线，只修正单例语义

**完成条件**：

- [ ] `src/` 内所有进程内可变单例（streamBus/queue/init 标志/db cache）均经 globalThis 锚定，grep 可验证
- [ ] 复现路径验证：dev 模式下节点执行中打开 Inspector → 实时看到字符数增长；执行完成后重选节点/刷新页面 → 面板显示完整全文而非"正在连接"
- [ ] 终态节点 + 订阅端存在残留空 entry 的场景有回归测试（模拟 split-brain 后遗症）
- [ ] `subscribe` 不再隐式创建 entry 的单测
- [ ] `pnpm lint && pnpm tsc --noEmit && pnpm test && pnpm build` 全绿

## 与其他 issue 的并行性

与 issue-10（`features/ai/**` + settings）、issue-11（`features/director/queue-handler.ts` + canvas 页面）、issue-13（`tools/**` + prompts）文件集合零重叠，可四路并行。
