# CodeVideoCanvas 重构蓝图 v3 · 第四册：PurpleInk 对齐与迁移边界

> 状态：Accepted
> 审计日期：2026-07-24
> 仓库：`scottcwy/PurpleInk`（私有）
> 固定快照：`penguin@68f09e7543872091e25578770f2c7fb60edfe6d8`、
> `firenze@7accc18391411716fc9b0fd63aca4c45c9725f0f`
> 访问说明：GitHub connected app 当前无私库权限；本次使用已认证 `gh api` 只读取证

---

## 1. 对齐目标

未来合并不是让两个项目现在就拥有相同目录、相同 SDK 或相同产品域，而是提前统一
最昂贵、最难迁移的边界：

1. Postgres 租户/版本/幂等约定；
2. Agent 输入输出端口；
3. artifact fingerprint、attempt 与 provenance；
4. compiler/bundle/render task/receipt；
5. HyperFrames 质量门；
6. Next.js 生产边界和 UI 数据真实性。

Agent Runtime 是明确例外：

- CodeVideoCanvas：Pi Agent；
- PurpleInk：保留其自身实现选择；
- 双方业务代码都只依赖 `StructuredModelPort`。

---

## 2. 两分支真实状态

| 维度 | `penguin` | `firenze` |
|---|---|---|
| 定位 | Next 前端 + 独立 server/capture/render 原型 | SaaS 控制面、PG 合同、compiler/runner |
| 包结构 | 根应用 + `server/`，两个 lockfile | npm workspace，五个内部 package |
| 数据库 | 无 Drizzle/Postgres；job 使用内存 Map | postgres-js + Drizzle + migration |
| Trigger.dev | 未实现 | 架构文档提出，源码未安装/接入 |
| Agent | 自定义 StepFun 调用 | Agents SDK 主要在文档；实际 runner 使用 HTTP `direct()` seam |
| HyperFrames | 直接生成/运行项目的原型 | Plan → deterministic compiler → bundle → quality gate |
| 登录 | 无 | 登录/注册页面仍显示服务未连接 |
| 生产性 | 原型证据 | 合同较成熟，部署与 worker 仍有缺口 |

因此旧结论“penguin 只是 landing、firenze 已实现 Trigger+Agents SDK”均不准确。

---

## 3. Firenze 值得复用的合同

### 3.1 Agent 隔离

其 runner 把模型调用压缩为：

```text
direct(skillInput) → plan
```

随后由应用执行 schema、provenance、compiler 和 quality gate。这证明共享价值在稳定
I/O seam，而不是具体 SDK。CVC 用 Pi 实现同类 port 即可。

### 3.2 Fingerprint 与 attempt fencing

可复用原则：

- 输入先 canonicalize 再 SHA-256；
- 同 idempotency key 不同 fingerprint 必须拒绝；
- retry 只能针对可重试终态；
- attempt 单调递增；
- 旧 attempt 不得提交新 artifact；
- artifact key 含 workspace/job/attempt/content hash；
- pinned compiler/schema/workflow 版本进入 receipt。

### 3.3 版本化与不可变

采用：

```text
version
schema_version
payload jsonb
content_hash
status
approved/released_at
unique(workspace_id, aggregate_id, version)
```

只把 approved/released 版本设为不可变；draft 允许受 revision 保护地编辑。

### 3.4 HyperFrames 质量序列

复用验收顺序，而不是直接复制脚本实现：

```text
lint/check
→ inspect/snapshot
→ render
→ ffprobe 尺寸/时长/流
→ signalstats/非空帧
→ 实体 SHA-256
```

CVC 必须通过自己的 ArtifactStore/RenderWorkspace 运行，不照搬直接 fs 和整文件
`readFile` 模式。

---

## 4. 明确不能直接复用的部分

### 4.1 Agent Runtime

Firenze 的 Agents SDK 尚未成为真实主链路，且用户已确认 CVC 保留 Pi。禁止：

- 在 CVC 增加 `@openai/agents`；
- 同时维护 Pi/Agents SDK session；
- 让 shared DTO 引用任一 SDK 类型；
- 为“未来可能合并”提前写双 runtime。

### 4.2 Compiler 输入

Firenze：

```text
schema-constrained Plan → template compiler
```

CVC：

```text
AI-generated fragments → normalizer/security gates → source compiler
```

二者不能共用同一个 compile input。可共享的是：

- bundle manifest 语义；
- file/hash/provenance；
- render task/receipt；
- HyperFrames 质量门。

### 4.3 完整 SaaS schema

CVC 本轮只需要 workspace、project、canvas、run、attempt、artifact、receipt、settings、
ai invocation。PurpleInk 的 Product/Release/Evidence/Capture/Approval/R2/Auth 全图
不进入本轮。

### 4.4 包管理器与 Node 版本

Firenze 使用 npm/Node 24，CVC 使用 pnpm/Node 22。两者不是运行时业务合同，不应在
本轮制造额外迁移。真正合并仓库时再通过独立 ADR 决定。

### 4.5 超大文件

Firenze 存在千行 schema/service；CVC 不复制这种组织。只迁移约束和算法，每个聚合
拥有独立 schema/repository/service 文件。

---

## 5. Postgres 对齐口径

共同约定：

- `snake_case` SQL；
- UUID；
- `timestamptz`；
- `jsonb` 保存版本化 payload/metadata；
- workspace 业务表 `(workspace_id,id)` 复合主键；
- 复合外键包含 workspace；
- revision/expected revision；
- command receipt 记录 fingerprint/result；
- attempt fencing；
- approved/released version 不可变；
- 实体 `content_hash`；
- tracked SQL migration。

CVC 的差异：

- 本轮只有一个自动创建的 local workspace；
- 不创建 user/membership/auth 表；
- 不接 R2；
- 不复制 PurpleInk migration journal；CVC 自己从 `0000` 生成并验证。

---

## 6. Agent Port 对齐

共享合同建议：

```ts
export interface StructuredModelPort {
  run<TInput, TOutput>(
    request: StructuredModelRequest<TInput>,
    contract: StructuredModelContract<TInput, TOutput>
  ): Promise<StructuredModelResult<TOutput>>
}
```

Port 只包含：

- task kind；
- versioned input；
- validated output；
- provider/model identity；
- usage；
- safe trace；
- abort signal；
- input/output fingerprint。

不得包含：

- Pi `AgentMessage`；
- Agents SDK `RunResult`；
- provider-specific response；
- session/handoff object；
- raw chain-of-thought。

---

## 7. Bundle/Render 对齐

建议共享的跨项目 DTO：

```text
CompositionBundleV1
RenderTaskV1
RenderReceiptV1
MediaProbeV1
ArtifactProvenanceV1
ContractIssueV1
```

其中 `CompositionBundleV1` 必须至少表达：

- schema/compiler/workflow version；
- entry file；
- file list 与 hash；
- width/height/fps/duration；
- asset/source/bundle hash；
- composition ID；
- created attempt；
- required HyperFrames version。

共享 DTO 稳定前，先分别在两个项目实现同名本地合同；不要过早建立跨仓 package 和
发布流程。

---

## 8. 分阶段迁移策略

### 阶段 A：CVC 内部边界稳定

- 完成 N0–N4；
- 证明 Pi → source → compiler → HF；
- 固定 contract fixtures。

### 阶段 B：跨项目合同对照

- 用相同 bundle fixture 在两项目运行 probe/render；
- 对比 manifest、receipt、quality report；
- 不要求像素内容相同，只要求合同语义相同。

### 阶段 C：提取 shared contracts

前提：

- 两边至少各有一个 production-like E2E；
- DTO 在两个独立 release 中未发生破坏性变化；
- 没有 SDK 类型泄露。

满足后才将 DTO 提取为共享 package。

### 阶段 D：决定仓库级合并

另行决策：

- 主仓/子包归属；
- npm 或 pnpm；
- Auth/Workspace 归属；
- R2/ArtifactStore；
- Render Worker 部署；
- Agent Runtime 是否仍允许双实现。

---

## 9. 对齐检查表

- [ ] CVC 没有 `@openai/agents`
- [ ] shared contracts 没有 Pi/Agents SDK 类型
- [ ] 两项目都使用 versioned input/output
- [ ] fingerprint 算法有 canonical fixture
- [ ] receipt 对同 key 不同 fingerprint 拒绝
- [ ] attempt fencing 有过期提交测试
- [ ] approved/released artifact 不可变
- [ ] bundle manifest 包含全部版本与 hash
- [ ] renderer 只消费 bundle，不消费 Agent session
- [ ] HyperFrames 质量序列可重放
- [ ] CVC runtime 无 SQLite
- [ ] Trigger task 不进入 domain contracts
- [ ] UI 不消费 provider-specific trace
- [ ] 包管理器差异被明确保留
- [ ] 未复制 PurpleInk 完整 SaaS schema

此表是跨项目设计评审清单，不是 CVC Task 状态账本。

---

## 10. 已知外部风险

1. PurpleInk 两分支继续快速变化，任何实施前必须重新固定 SHA；
2. Firenze migration journal 与 SQL 文件可能漂移，不能复制；
3. Trigger/Agent/Auth 的实际生产部署仍未在 PurpleInk 落地；
4. Render worker 镜像、字体、Chrome、FFmpeg 尚未共同锁定；
5. 私库 connected app 权限未恢复前，自动化审计只能依赖本机 `gh`；
6. 两项目的 compiler 输入哲学不同，不能用“统一”掩盖差异。

---

## 11. 最终裁定

CodeVideoCanvas 与 PurpleInk 的正确合并路线是：

> **先统一可验证合同，再统一 package；先证明两个实现，再决定一个仓库。**

保留 Pi Agent 不会破坏这条路线；把 SDK 类型泄露到业务域才会。
