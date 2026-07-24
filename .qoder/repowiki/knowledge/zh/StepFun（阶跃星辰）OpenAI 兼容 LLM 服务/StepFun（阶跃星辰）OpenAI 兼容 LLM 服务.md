---
kind: external_dependency
name: StepFun（阶跃星辰）OpenAI 兼容 LLM 服务
slug: stepfun
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

### StepFun（阶跃星辰）
- 本项目唯一选定的 LLM 提供方，使用 OpenAI 兼容端点 `https://api.stepfun.com/v1`，默认模型 `step-3.5-flash`。
- Key 仅服务端可读写，永不进入前端 bundle；用户通过设置页自行填写并校验（调用 `/models/list`）。