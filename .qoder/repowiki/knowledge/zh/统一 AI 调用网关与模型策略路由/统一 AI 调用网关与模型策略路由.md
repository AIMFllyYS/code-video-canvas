---
kind: design
name: 统一 AI 调用网关与模型策略路由
source: session
category: adr
---

# 统一 AI 调用网关与模型策略路由

_来源：1bc7587 → 5c81ef8 提交周期内记录的编码计划——内容为规划时意图，实现可能滞后或有出入。_

**状态：** accepted

## 背景
当前模型调用分散在各处，业务代码直接感知 provider 实现，且存在大量无效调用（score/export/shot-sfx 纯文本调用无副作用），3 镜项目付费调用高达 13 次。

## 决策驱动
- 调用有效性
- provider 解耦
- 成本控制
- 可观测性

## 备选方案
- **AiGateway + ModelPolicy 统一网关** — 优点：业务代码零 provider 感知、按 AiTaskType 自动路由、删除无效调用（13→7次）、集中式限流和重试策略；缺点：需要重构所有 AI 调用点
- **OpenAI Agents SDK beta 适配** _（已否决）_ — 优点：标准化 agent 框架；缺点：beta 稳定性风险、多模型灵活性不如自定义方案、与本地优先定位冲突

## 决策
构建 AiGateway 抽象接口（generateStructured/generateText/generateVision/stream），ModelPolicy 根据 AiTaskType（project-plan/shot-spec/fabricate/vision-qa）自动选择 gemini 或 stepfun provider，删除 score/export/shot-sfx 等无副作用文本调用。

## 影响
模型调用次数从 4+5N 降至四类任务；新增 RunEvent 类型化事件流（model_started/model_delta/tool_started/tool_completed）；provider 配置集中在设置页，支持运行时切换。