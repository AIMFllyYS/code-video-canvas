---
kind: configuration_system
name: 环境变量 + SQLite 设置表的双层运行时配置系统
category: configuration_system
scope:
    - '**'
source_files:
    - src/features/ai/config.ts
    - src/features/ai/gemini-config.ts
    - src/app/api/settings/route.ts
    - src/lib/config/paths.ts
    - src/lib/db/schema.ts
    - .env.example
    - next.config.ts
    - drizzle.config.ts
---

本仓库采用「环境变量 → SQLite settings 表 → 内置默认值」的三层优先级配置体系，核心由 `src/features/ai/config.ts` 与 `src/features/ai/gemini-config.ts` 实现，并通过 Next.js API Route (`src/app/api/settings/route.ts`) 暴露设置页读写能力。

**加载顺序与优先级**
- 最高优先：SQLite `settings` 表（通过应用「设置」页写入）
- 次优先：`.env.local` / `.env` 中的环境变量（如 `STEPFUN_API_KEY`、`GEMINI_BASE_URL` 等）
- 最低优先：代码内 `DEFAULTS` 对象中定义的内置默认值
- 任一来源为空串或 null 即视为未设置，自动回退到下一层；设置页留空 = 删除该行以回退 env/默认。

**配置项分层**
- StepFun 配置：apiKey + baseUrl + chatModel/ttsModel/asrModel/visionModel 六个字段，键名集中在 `STEPFUN_SETTINGS_KEYS` 常量中。
- Gemini 配置：apiKey + baseUrl + primaryModel/fastModel 三个字段，结构完全复用同一解析模式。
- 路径配置：`src/lib/config/paths.ts` 提供 `DATA_DIR`、`DB_PATH`、`ARTIFACTS_DIR`，仅受 `DATA_DIR` 环境变量影响，默认 `<cwd>/.data`。

**持久化与校验**
- `settings` 表为 Drizzle ORM 定义的 key-value 表（key 为主键），通过 `getSettingValue` / `setSettingValue` 统一读写。
- Key 保存前走在线校验：StepFun 通过 `validateKey`、Gemini 通过 `validateGeminiKey`，失败则拒绝覆盖已有配置。
- 非 Key 字段（模型名、端点）支持按字段级清空（空串 = 删除该行），实现逐项回退。

**API 暴露**
- `GET /api/settings`：返回当前生效配置（含 masked Key）、各字段来源（settings/env/default）、渲染并发数、存储目录。
- `POST /api/settings`：接收 Zod 校验后的输入，依次校验并保存 StepFun Key、Gemini Key/Settings、Director 路由映射。

**构建期与运行期分离**
- `next.config.ts` 将 `better-sqlite3`、`ffmpeg-static` 声明为 `serverExternalPackages`，确保原生依赖在 Node 运行时解析而非 Turbopack 打包。
- `drizzle.config.ts` 指向 `./src/lib/db/schema.ts`，迁移输出至 `./src/lib/db/migrations`。

**约定与约束**
- 所有配置读取必须经过 `resolveField` 三阶段解析，禁止直接访问 `process.env` 绕过优先级链。
- `apiKey` 字段不参与 `describe*Config` 展示，仅返回掩码形式，避免敏感信息泄露。
- 模块均使用 `import 'server-only'` 限制在服务端执行，防止客户端误用。