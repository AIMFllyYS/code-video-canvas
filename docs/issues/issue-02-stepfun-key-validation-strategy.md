# issue-02 — StepFun Key 校验策略修复

| 字段 | 值 |
|---|---|
| 优先级 | P0 |
| Wave | 1（`docs/specs/2026-07-23-harness-task-breakdown.md` Track H），与 issue-01 均可立即开工，完全独立 |
| 依赖 | 无 |
| 关联证据 | `docs/updates/2026-07-23-cloud-e2e-review-report.md` §5 路径 7、§7.2 |
| 状态 | 待施工 |

## 背景

设置页「保存有效 Key」的成功路径至今从未被验证通过：2026-07-23 e2e 走查记录，提交一个**确认有效**的 StepFun Key 仍被判定为"校验失败"，用户无法通过设置页确认自己配置的 Key 真的可用——这直接损害用户对"AI 是否真的在工作"的信任，与本轮系统性问题分析的关注点一致。

## 根因

`validateKey()`（`src/features/ai/stepfun-adapter.ts:31-38`）用 OpenAI SDK 的 `models.list()` 探测 Key 是否可用：

```30:38:src/features/ai/stepfun-adapter.ts
/** 校验 Key 是否可用（尝试拉取模型列表）。 */
export async function validateKey(apiKey: string): Promise<boolean> {
  try {
    await createClient(apiKey).models.list()
    return true
  } catch {
    return false
  }
}
```

已确认的问题：StepFun 的 OpenAI 兼容端点上，`models.list()` 对某些 Key/权限组合会返回失败（可能是该端点未实现此接口、或该 Key 权限范围不含"查询模型列表"，与 OpenAI 官方端点行为不一致），导致**即使 Key 本身完全可用于 `chat.completions`**，校验也会先于任何真实对话请求失败。当前实现用 `catch { return false }` 吞掉了具体错误，连排查线索都没有留下。

## 修复方案

改用与项目实际调用路径完全一致的轻量探测：一次 `chat.completions.create()`，`max_tokens` 设为最小值（如 `1`），只关心请求是否成功（HTTP 200 + 有响应），不关心内容质量：

```typescript
export async function validateKey(apiKey: string): Promise<boolean> {
  try {
    await createClient(apiKey).chat.completions.create({
      model: process.env.STEPFUN_CHAT_MODEL ?? 'step-3.5-flash',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    })
    return true
  } catch {
    return false
  }
}
```

理由：
- 这与 `StepfunAdapter.chat()`（`stepfun-adapter.ts:54-63`）的真实调用路径一致，"校验通过"才真正等价于"这个 Key 能被本项目正常使用"，而不是校验一个项目自己都不依赖的旁路接口（`models.list()` 在 `StepfunAdapter` 类里从未被用于除校验外的任何业务逻辑）。
- `max_tokens: 1` 把每次校验的 token 消耗降到最低，避免校验本身成为不必要的成本。
- 失败时的 `catch` 分支建议保留错误信息用于服务端日志（不回显给客户端、不写入可能被提交的文件），方便未来排查是网络/鉴权/额度哪一类问题，而不是像现在一样完全黑盒。

## 允许改动范围 / 禁止改动 / 完成条件

**目标**：修复 `validateKey()` 导致有效 Key 也被判定失败的问题，确保设置页"保存成功"路径可以被真实验证通过。

**前置任务**：无。

**允许改动范围**：
- `src/features/ai/stepfun-adapter.ts`
- 对应测试（若不存在 `stepfun-adapter.test.ts` 则新建）

**禁止改动**：
- `src/app/api/settings/**`（设置 API 的"先 validate 再 save"顺序不变，本 issue 只改 `validateKey` 内部实现）
- `src/app/(app)/settings/**`（前端展示逻辑不变，本 issue 是纯后端修复）

**完成条件**：
- [ ] 使用 `.env`/`.env.local` 中的开发期种子 Key（`STEPFUN_API_KEY`）走一次真实 `validateKey()` 调用，返回 `true`
- [ ] 使用一个明显无效的 Key 字符串走一次真实调用，返回 `false`（确认修复没有把"总是返回 true"当成捷径）
- [ ] 设置页手动/集成验证：提交有效 Key 后状态显示"已验证"，且 Key 不回显、不进入客户端日志（沿用现有边界，不改动这部分行为）
- [ ] `pnpm lint && pnpm tsc --noEmit` 通过；新增/修改测试通过
