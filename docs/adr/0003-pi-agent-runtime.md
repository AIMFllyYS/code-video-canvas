# ADR-0003：Pi Agent 作为 CodeVideoCanvas 唯一 Agent Runtime

- 状态：Accepted
- 日期：2026-07-24
- Supersedes：蓝图 v2 中的 OpenAI Agents SDK 迁移设想

## Context

当前项目已真实使用 Pi Agent + pi-ai 接入 StepFun/Gemini，但应用封装只返回 assistant
文本，导致 Tool 参数产物丢失。旧 v2 因 PurpleInk 架构文档而建议迁移 OpenAI Agents
SDK；实勘发现 PurpleInk 并没有可直接复用的 Agents SDK 主链路，且迁移会引入第二套
runtime/session/trace 类型，不能消除应用层 schema 与语义门禁。

## Decision

1. CVC 保留 Pi Agent；
2. 不安装 `@openai/agents`；
3. 只有 `PiStructuredRunner` 可以 import Pi `Agent`；
4. 业务只依赖 `AiTaskRuntime`/`StructuredModelPort`；
5. 只允许四类模型任务；
6. 每项任务使用单一 terminal submit Tool；
7. Tool 验证参数是权威产物，文本不是；
8. 每个模型 invocation 使用独立短生命周期会话；`shot-spec` checkpoint 后必须
   新建 fabricate Agent，二者不共享 messages/Tool/repair 历史；
9. 内容修复最多两轮，且只在当前 invocation 内；
10. JSONL 仅作可选诊断 artifact，不是业务/恢复真源；
11. safe trace 不包含 raw assistant delta、Tool 参数值、provider 原始错误、prompt、
    source、credential 或隐藏 reasoning。

## Consequences

正面：

- 保留已经验证的多 Provider 能力；
- 修复真正的应用集成缺陷；
- 与 PurpleInk 通过稳定端口对齐；
- 模型替换不影响业务域。

代价：

- 结构化输出仍需应用 Zod/语义验证；
- StepFun/Gemini Tool 可靠性必须各自 Spike；
- 需要重构当前 `pi-session.ts`；
- Pi 版本升级必须独立验证。

## Rejected alternatives

- 迁移 OpenAI Agents SDK：无现成实现可复用，增加第二 runtime；
- 业务直接使用 pi-ai completion：失去用户明确要求保留的 Agent Tool loop；
- 同时支持两个 Agent SDK：类型、trace、session 和测试矩阵翻倍；
- 从 assistant 文本猜 JSON：不可审计、易误提取。

## Verification

- 仅一个生产文件 import Pi `Agent`；
- 仅四个 `AiTaskKind`；
- terminal Tool transcript tests 覆盖文本、Tool、失败和 repair；
- shot-spec/fabricate 使用两个 invocation 且 checkpoint retry 不重复计费；
- safe trace redaction 与 size/depth bounds 有合同测试；
- 服务任务 source scan 无 Agent import；
- provider/model 与设置页和 invocation record 一致。
