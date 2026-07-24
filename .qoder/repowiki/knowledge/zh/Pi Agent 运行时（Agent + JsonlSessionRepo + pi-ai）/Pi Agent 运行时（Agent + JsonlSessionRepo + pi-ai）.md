---
kind: external_dependency
name: Pi Agent 运行时（Agent + JsonlSessionRepo + pi-ai）
slug: pi-agent-core
category: external_dependency
category_hints:
    - framework_behavior
    - sdk_real_api
scope:
    - '**'
---

### Pi Agent 在本项目的用法
- 仅借用 `@earendil-works/pi-agent-core` 的 `Agent`、会话存储与 tool-calling 循环机制，**不使用其 Skills/Extensions 加载体系**；也不引入 `pi-coding-agent`。
- Tool 契约为项目自有 `DirectorTool`，内部适配为 Pi `AgentTool`，不暴露 Pi 类型到外部。