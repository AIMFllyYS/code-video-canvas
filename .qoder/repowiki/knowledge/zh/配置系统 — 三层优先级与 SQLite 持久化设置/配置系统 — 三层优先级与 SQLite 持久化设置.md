---
kind: configuration_system
name: 配置系统 — 三层优先级与 SQLite 持久化设置
category: configuration_system
scope:
    - '**'
source_files:
    - src/features/ai/config.ts
    - src/features/ai/gemini-config.ts
    - src/features/ai/model-routing.ts
    - src/lib/db/schema.ts
    - src/app/api/settings/route.ts
    - src/app/(app)/settings/settings-form.tsx
    - .env.example
---

本仓库采用「settings 表 > 环境变量 > 内置默认值」的三层配置解析策略，所有 AI 服务（StepFun、Gemini）及 Director 节点路由均通过统一的 `getSettingValue`/`setSettingValue` 读写 SQLite 的 `settings` 键值表，未设置时回退到 `process.env`，再回退到代码内 `DEFAULTS`。

**核心机制**
- 统一读取器：`src/features/ai/config.ts` 中的 `getSettingValue(key)` 从 `settings` 表按 key 取值，空串/不存在返回 null；`setSettingValue(key, value)` 写入或清空行。
- 字段解析器：每个 provider 定义 `ENV_KEYS`、`DEFAULTS`、`SETTINGS_KEYS` 三张映射，`resolveField` 依次尝试 settings → env → default，并附带 `{value, source}` 来源标记。
- StepFun 配置：6 个字段（apiKey/baseUrl/chatModel/ttsModel/asrModel/visionModel），apiKey 仅支持 settings 表或环境变量，不暴露默认值。
- Gemini 配置：3 个字段（baseUrl/primaryModel/fastModel），fastModel 用于低延迟节点（script-import、shot-sfx、shot-subtitle）。
- Director 节点路由：按 CanvasNodeType 存储 `director_provider_<nodeType>` 键，选择 stepfun 或 gemini，未配置时回退 `DEFAULT_PROVIDER`。

**持久化与 API**
- `settings` 表（`src/lib/db/schema.ts`）：key/value 键值对，updatedAt 时间戳，仅服务端可读写。
- `/api/settings`（`src/app/api/settings/route.ts`）：GET 返回 masked apiKey、各 provider 生效配置及来源、Director 路由视图；POST 接收 Zod 校验后的表单，逐项保存并返回最新视图。
- 设置页 UI（`src/app/(app)/settings/settings-form.tsx` + `model-service-settings.tsx`）：前端展示生效值与来源，支持修改模型参数和 Provider 路由。

**环境变量约定**
- `.env.example` 定义了 STEPFUN_* 与 GEMINI_* 系列变量，注释明确优先级规则：settings 表 > 环境变量 > 内置默认值。
- DATA_DIR 环境变量覆盖 SQLite 数据库根目录（由 `@/lib/config/paths` 提供）。

**约束与验证**
- Key 校验：提交 apiKey/geminiApiKey 时才调用 `validateKey`/`validateGeminiKey` 进行在线校验，失败返回 422 且不覆盖已存值。
- 空值语义：传入空串等于删除该行，触发回退链；undefined 表示不改动该字段。
- 类型安全：所有配置项通过 TypeScript 接口与 Zod schema 双重约束，测试覆盖优先级回退逻辑。