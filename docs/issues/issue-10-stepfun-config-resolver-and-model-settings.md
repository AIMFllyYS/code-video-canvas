# issue-10 — StepFun 配置统一 resolver：settings 表 > env > 默认值，设置页支持 4 类模型

> **Frozen Demo v1 issue.** 保留诊断与完成证据；v3 施工只按
> [`refactor-v3/`](./refactor-v3/) 与 v3 Task Breakdown。

| 字段 | 值 |
|---|---|
| 优先级 | **P0**（配置机制断裂：Key 走双层配置而模型只读 env；设置页展示硬编码假值，违反 AGENTS.md「UI 字段真实性门禁」） |
| Wave | 5（第二轮系统性审查，2026-07-24） |
| 依赖 | 无，可立即开工 |
| 关联证据 | `.env.example` L13-L16 定义 4 类模型；设置页"模型"行显示 `step-1-8k` 而真实生效的是 `step-3.5-flash` |
| 状态 | 待施工 |

## 背景与目标口径（用户已拍板）

> **如果用户在设置页面没有配置对应内容则走 env，否则走用户自己配置；设置页与 env 一样是 4 类模型（chat/tts/asr/vision）。**

即每个配置项的解析优先级统一为：**SQLite settings 表 > 环境变量 > 内置默认值**。当前只有 API Key 实现了这个优先级，模型全部只读 env，且其中 3 个 env 变量定义了却零消费。

## 现状核查（2026-07-24 grep + 代码通读）

| 配置项 | settings 表（设置页可配） | env 读取点 | 内置默认 | 实际消费方 |
|---|---|---|---|---|
| API Key | ✅ `stepfun_api_key` | ✅ `STEPFUN_API_KEY` | 无 | `stepfun-adapter.ts`、`pi-session.ts`（优先级正确） |
| Base URL | ❌ | `stepfun-adapter.ts` L26、`pi-session.ts` L147 | `https://api.stepfun.com/v1` ×2 处重复 | 同左 |
| Chat 模型 | ❌ | `stepfun-adapter.ts` L35/L66、`pi-session.ts` L148 | `'step-3.5-flash'` ×3 处重复硬编码 | validateKey 探测、StepfunAdapter.chat、Director Pi 会话 |
| TTS 模型 | ❌ | **全仓库 0 处引用** | — | 无（`features/audio/*` 为 13-15 行占位 stub） |
| ASR 模型 | ❌ | **全仓库 0 处引用** | — | 无 |
| Vision 模型 | ❌ | **全仓库 0 处引用** | — | 无（shot-qa 走 `qa-check.ts` 亮度规则，未用多模态） |

### 问题 1：模型/端点配置无统一事实源

`'step-3.5-flash'` 与 base URL 默认值散落在 `stepfun-adapter.ts`（3 处）与 `pi-session.ts`（`DEFAULT_BASE_URL`/`DEFAULT_MODEL` 常量，L19-L20）中重复定义。任何一处改动都要人肉同步，且用户在设置页**无法**覆盖模型。

### 问题 2：设置页硬编码假值（UI 字段真实性违规）

[`src/app/(app)/settings/settings-form.tsx`](../../src/app/(app)/settings/settings-form.tsx)：

- L92：`<SettingsRow label="模型" value="step-1-8k" />` —— 纯硬编码，与真实生效的 `step-3.5-flash` 不符，典型的"静态值伪装真实状态"；
- L94：端点行硬编码 `https://api.stepfun.com/v1`，未反映 `STEPFUN_BASE_URL` 覆盖；
- L96-L103：「渲染」组的并发数 `4`、分辨率 `1080×1920`、存储位置 `~/CodeVideoCanvas/projects`、崩溃续渲恒 `checked readOnly`——全部无真实数据源（分辨率真实配置实际在导出页的 `projects.exportSettings`，见 issue-06）。

### 问题 3：settings API 契约过窄

[`src/app/api/settings/route.ts`](../../src/app/api/settings/route.ts)：GET 只返回 `{configured, masked}`；POST 只接受 `{apiKey}`（[`schemas.ts`](../../src/features/ai/schemas.ts) 的 `stepfunSettingsSchema` 仅一个字段）。无模型配置的读写通道。

## 修复方案

### A. 新建统一 resolver `src/features/ai/config.ts`

```typescript
import 'server-only'

export interface StepfunConfig {
  apiKey: string | null        // settings > env；null = 未配置
  baseUrl: string              // settings > env > 默认
  chatModel: string            // settings > env > 'step-3.5-flash'
  ttsModel: string             // settings > env > 'stepaudio-2.5-tts'
  asrModel: string             // settings > env > 'stepaudio-2.5-asr'
  visionModel: string          // settings > env > 'step-3.7-flash'
}

/** 每项独立解析：settings 表非空值 > 对应 STEPFUN_* env > 内置默认。 */
export function getStepfunConfig(): StepfunConfig { ... }

/** 供设置页展示"生效值 + 来源"（settings / env / default），不含 Key 原文。 */
export function describeStepfunConfig(): StepfunConfigView { ... }
```

要点：

- settings 表是现成 KV（[`schema.ts`](../../src/lib/db/schema.ts) L76-L80），**无需迁移**，新增 key：`stepfun_chat_model` / `stepfun_tts_model` / `stepfun_asr_model` / `stepfun_vision_model` / `stepfun_base_url`（值为空串或行不存在 = 未配置，回退 env）；
- 内置默认值以 `.env.example` L12-L16 为准，**只在 config.ts 一处定义**；
- `stepfun-adapter.ts`（`createClient`/`validateKey`/`chat`）与 `pi-session.ts`（`createStepfunRuntime`）改为从 `getStepfunConfig()` 取值，删除各自的散点 `process.env` 读取与重复默认常量；
- `getStoredApiKey()` 保留导出（issue-09 之外的既有调用方不破坏），内部可复用 config 读取。

### B. 设置 API 扩展

- `stepfunSettingsSchema` 扩展为 `{ apiKey?, baseUrl?, chatModel?, ttsModel?, asrModel?, visionModel? }`（全部可选；提交了 apiKey 才走 validateKey 门禁，**校验失败不得覆盖已保存 Key**——沿用现有红线）；
- 模型字段允许显式清空（提交空串 = 删除 settings 行 = 回退 env）；
- GET 返回 `describeStepfunConfig()` 结果：每项的**生效值 + 来源标签**（`settings`/`env`/`default`），Key 仍只回掩码。

### C. 设置页改造（`settings-form.tsx`）

1. 「STEPFUN 模型服务」组：4 类模型 + 端点各一行 `TextField`，placeholder 显示当前 env/默认生效值（如 `step-3.5-flash（跟随环境变量）`），留空即回退——与用户拍板口径一致；
2. "模型"假值行删除，改为展示 GET 返回的真实生效值与来源；
3. 「渲染」组假值治理：分辨率行改为链接/说明指向导出页真实配置（`projects.exportSettings`）；并发数、存储位置、崩溃续渲三项当前无真实数据源，按门禁降级为显式"Demo 占位"文案或移除可交互外观（`// Demo 占位，见 docs/issues/issue-10-*.md`）。

### D. TTS/ASR/Vision 的消费缺口

本 issue **只负责把配置值备好**（resolver 可解析、设置页可配置）；三类模型的真实调用点接线（配音合成、字幕时间轴对齐、QA 多模态验收）单独登记为 [issue-12](./issue-12-tts-asr-vision-model-wiring-gap.md)，避免本 issue 范围失控。

## 允许改动范围 / 禁止改动 / 完成条件

**允许改动范围**：

- `src/features/ai/config.ts`（新建）、`src/features/ai/stepfun-adapter.ts`、`src/features/ai/schemas.ts`、`src/features/ai/index.ts`
- `src/features/director/pi-session.ts`（仅 `createStepfunRuntime` 改为消费 config；不碰会话/流式逻辑，与 issue-09 解耦）
- `src/app/api/settings/route.ts`
- `src/app/(app)/settings/settings-form.tsx`
- `.env.example`（如需补注释说明优先级）
- 对应测试：config resolver 优先级矩阵（settings/env/default 三层 × 6 项）、settings API 扩展契约、adapter/pi-session 消费点

**禁止改动**：

- settings 表 schema（KV 结构够用，不做迁移）
- Key 安全红线：Key 永不进客户端 bundle / `NEXT_PUBLIC_`；GET 只回掩码；校验失败不覆盖已存 Key
- 不在客户端组件读取任何 `process.env.STEPFUN_*`

**完成条件**：

- [ ] `src/` 内除 `config.ts` 外 0 处直接读取 `process.env.STEPFUN_*`（测试文件除外），grep 可验证
- [ ] 优先级行为验证：settings 配置模型 → 生效；清空 → 回退 env；env 也没有 → 内置默认
- [ ] 设置页展示的模型/端点为真实生效值（含来源），假值 `step-1-8k` 消失；渲染组假值全部显式占位化或真实化
- [ ] validateKey 使用 resolver 解析出的 chatModel 探测；校验失败不覆盖已存 Key 的既有测试保持通过
- [ ] `pnpm lint && pnpm tsc --noEmit && pnpm test && pnpm build` 全绿

## 与其他 issue 的并行性

与 issue-09（`lib/stream`/`lib/queue`/SSE 路由）、issue-11（queue-handler/canvas 页面）、issue-13（director tools/prompts）零文件重叠。唯一接触的共同文件是 `pi-session.ts`（issue-10 改 L146-L160 的 runtime 构造；issue-09 明确不碰此文件），可安全并行。issue-12 依赖本 issue 的 resolver 先落地。
