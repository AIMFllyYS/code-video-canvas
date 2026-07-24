---
kind: configuration_system
name: 配置系统 — 环境变量 + SQLite settings 表的双层配置机制
category: configuration_system
scope:
    - '**'
source_files:
    - .env.example
    - src/features/ai/stepfun-adapter.ts
    - src/app/api/settings/route.ts
    - src/features/ai/schemas.ts
    - src/app/(app)/settings/settings-form.tsx
    - next.config.ts
    - drizzle.config.ts
---

## 1. 系统概览
本仓库采用「环境变量 → SQLite settings 表」双层配置加载机制，核心目标是把敏感配置（StepFun API Key）与运行时模型参数解耦：开发期通过 `.env` 变量注入，生产期通过设置页写入本地 SQLite `settings` 表持久化。当前仅 API Key 实现了完整的「settings > env > 默认值」三级优先级，其余模型配置（chat/tts/asr/vision/baseUrl）仍只读 `process.env`，存在待修复的配置断裂问题（见 issue-10）。

## 2. 关键文件与位置
- `.env.example` — 所有 StepFun 相关环境变量的模板与说明
- `src/features/ai/stepfun-adapter.ts` — 唯一在服务端读取 `process.env.STEPFUN_*` 的模块，负责构造 OpenAI 客户端、校验 Key、读写 SQLite
- `src/app/api/settings/route.ts` — Next.js API Route，暴露 GET/POST 接口用于查询和保存 Key
- `src/features/ai/schemas.ts` — Zod schema 定义输入校验（当前仅 apiKey）
- `src/app/(app)/settings/settings-form.tsx` — 前端设置页 UI（含硬编码假值，待治理）
- `next.config.ts` — 声明 `serverExternalPackages` 让 better-sqlite3、ffmpeg-static 在 Node 运行时解析
- `drizzle.config.ts` — Drizzle ORM 迁移配置，指向 `./src/lib/db/schema.ts`

## 3. 架构与设计决策
- **服务端隔离**：`stepfun-adapter.ts` 首行 `import 'server-only'` 确保 Key 永不进入前端 bundle；所有 `process.env.STEPFUN_*` 读取点集中在该文件
- **持久化策略**：API Key 以 KV 形式存入 SQLite `settings` 表（key=`stepfun_api_key`），通过 Drizzle ORM 的 `onConflictDoUpdate` 实现幂等写入
- **校验门禁**：POST `/api/settings` 先调用 `validateKey()` 发起真实 chat.completions 探测，失败则拒绝覆盖已存 Key
- **数据目录**：`.data/` 作为 SQLite 数据库与渲染产物的根目录，由 `DATA_DIR` 环境变量控制（默认 `./.data`），已被 `.gitignore` 排除
- **Next.js 全栈模式**：`next.config.ts` 显式声明 `serverExternalPackages`，避免 Turbopack 重写原生依赖路径

## 4. 约定与约束
- **优先级约定**（已在文档中明确，当前仅部分实现）：settings 表非空值 > 对应 `STEPFUN_*` 环境变量 > 内置默认值
- **安全红线**：Key 不得出现在客户端组件、不得使用 `NEXT_PUBLIC_` 前缀、GET 接口仅返回掩码（如 `sk-***9c`）
- **配置集中化**：issue-10 要求除 `config.ts` 外 0 处直接读取 `process.env.STEPFUN_*`，但当前仍有散点读取未清理
- **默认值来源**：内置默认值应以 `.env.example` L12-L16 为准，只在单一 resolver 处定义（尚未落地）
- **存储位置**：`DATA_DIR` 环境变量控制本地数据目录，默认 `./.data`，包含 `app.db`、`artifacts/` 等

## 5. 已知缺口（待改进）
- 模型配置（chat/tts/asr/vision/baseUrl）尚未接入 settings 表，仍散落在多处 `process.env` 读取与硬编码默认值中
- 设置页展示大量硬编码假值（如模型 `step-1-8k`、并发数 `4`、分辨率 `1080×1920`），违反「UI 字段真实性门禁」
- `stepfunSettingsSchema` 仅支持 `apiKey` 字段，缺少模型配置的读写通道
- `getStoredApiKey()` 与 `saveApiKey()` 仍独立于统一 config resolver，存在重复逻辑