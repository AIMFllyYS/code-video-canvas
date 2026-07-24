---
kind: design
name: StepFun Key 校验改用最小 chat.completions.create 探测替代 models.list
source: session
category: adr
---

# StepFun Key 校验改用最小 chat.completions.create 探测替代 models.list

_来源：5c5f968 → c3e6164 提交周期内记录的编码计划——内容为规划时意图，实现可能滞后或有出入。_

**状态：** accepted

## 背景
issue-02 中 validateKey() 使用 OpenAI SDK 的 models.list() 探测 Key，但 StepFun 兼容端点对部分有效 Key 的该接口返回失败，导致有效 Key 被误判为校验失败。需要在不改 createClient 行为的前提下修复误判。

## 决策驱动
- 与真实对话使用完全一致的探测方式
- 最小 token 成本
- 不影响生产 chat() 行为
- 服务端可诊断但不泄露 Key

## 备选方案
- **最小 chat.completions.create ping 探测** — 优点：与 StepfunAdapter.chat() 完全一致；max_tokens=1 成本最低；per-request timeout/maxRetries 不影响共享 createClient；错误日志含 status/message 便于排障；缺点：每次校验多一次网络往返
- **给共享 createClient() 加全局 timeout** _（已否决）_ — 优点：统一超时策略；缺点：改变生产 chat() 行为，超出 issue 范围且有回归风险
- **提交受 env 门控的网络集成测试** _（已否决）_ — 优点：CI 自动验证；缺点：需改 vitest.config.ts 加载 .env（超范围）；引入网络抖动风险
- **按错误类型返回不同结果或抛错** _（已否决）_ — 优点：更细粒度反馈；缺点：违反 issue 明确要求的布尔返回契约，settings/route.ts 签名不变

## 决策
将 validateKey() 替换为最小 chat.completions.create({ model: STEPFUN_CHAT_MODEL ?? step-3.5-flash, messages: [{ role: user, content: ping }], max_tokens: 1 }) 探测，通过 per-request { timeout: 15_000, maxRetries: 0 } 控制本次请求行为，不触碰共享 createClient；失败时 console.error 记录 status/message 用于排障但绝不泄露 Key，统一返回 false。

## 影响
有效 Key 不再被 models.list 的不兼容行为误杀；校验成本降至 1 token；生产 chat() 行为零回归；服务端日志可在排查时定位具体 APIError status。代价是每次设置页保存 Key 都会发起一次真实网络请求，且需在手动运行期验证（因测试文件全局 mock openai）。