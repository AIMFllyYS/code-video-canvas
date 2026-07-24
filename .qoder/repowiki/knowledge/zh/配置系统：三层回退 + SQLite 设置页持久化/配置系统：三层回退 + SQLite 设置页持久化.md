---
kind: configuration_system
name: 配置系统：三层回退 + SQLite 设置页持久化
category: configuration_system
scope:
    - '**'
source_files:
    - src/features/ai/config.ts
    - src/lib/config/paths.ts
    - src/app/api/settings/route.ts
    - .env.example
    - drizzle.config.ts
    - next.config.ts
---

## 1. 采用的方案与工具
- **环境变量**（`.env` / `.env.local`）作为开发期快速覆盖手段，由 Node `process.env` 直接读取。
- **SQLite 持久化设置表**（Drizzle ORM + better-sqlite3）作为运行时可编辑的“应用设置”存储，通过 Next.js API Route 暴露 GET/POST。
- **内置默认值**集中定义在 `src/features/ai/config.ts` 中，作为最终兜底。
- 路径类配置（数据目录、数据库文件、产物目录）集中在 `src/lib/config/paths.ts`，仅服务端/脚本使用。

## 2. 核心文件与包
- `src/features/ai/config.ts` — StepFun 相关配置的解析器、读写器、视图导出（唯一事实源）
- `src/lib/config/paths.ts` — `DATA_DIR` / `DB_PATH` / `ARTIFACTS_DIR` 等本地路径常量及幂等创建
- `src/app/api/settings/route.ts` — 设置页 API，负责 Key 校验、模型设置保存、配置展示
- `drizzle.config.ts` — Drizzle Kit 配置（dialect=sqlite，schema 指向 `src/lib/db/schema.ts`）
- `.env.example` — 环境变量模板，注释明确优先级规则
- `next.config.ts` — 声明原生依赖 `better-sqlite3`、`ffmpeg-static` 为 serverExternalPackages，避免 Turbopack 重写路径

## 3. 架构与约定
### 3.1 三层回退顺序（对每个字段独立生效）
settings 表（设置页配置） > 环境变量 > 内置默认值
该顺序在 `config.ts` 的 `resolveField` 和 `getStepfunConfig` 中硬编码实现，并通过测试用例强制验证。

### 3.2 配置项分类
- **API Key**：单独处理，不在 `describeStepfunConfig` 视图中返回明文，仅支持掩码展示；写入前调用 `validateKey` 做在线校验，失败则拒绝保存。
- **模型/端点字段**（baseUrl、chatModel、ttsModel、asrModel、visionModel）：统一走 `resolveField` 三源解析，并可通过 `describeStepfunConfig()` 获取每项的 `{ value, source }` 视图。
- **路径类配置**：`DATA_DIR` 可由 `DATA_DIR` 环境变量覆盖，默认 `<cwd>/.data`；`DB_PATH`、`ARTIFACTS_DIR` 由其派生，启动时 `ensureDataDirs()` 幂等创建。

### 3.3 读写边界
- 读：`getSettingValue(key)` → `getDb().select().from(settings).where(eq(settings.key, key)).get()`，空串/不存在视为 null。
- 写：`setSettingValue(key, value)` 使用 upsert（onConflictDoUpdate），传入空值等价于删除该行以触发回退。
- API 层：`GET /api/settings` 返回 masked apiKey + models 视图 + 运行期信息（CPU 核数、storageDir）；`POST /api/settings` 先校验 Key（可选），再批量保存模型设置。

### 3.4 类型与 Schema 约束
- `StepfunConfigKey` / `StepfunModelField` / `StepfunConfigSource` 等类型确保键名一致。
- `STETFUN_SETTINGS_KEYS` 映射是 settings 表键名的唯一来源，所有读写均通过此映射访问，避免散落的字符串字面量。
- 输入校验使用 `stepfunSettingsSchema.safeParse`（Zod），非法请求直接 400 返回。

## 4. 约定与约束（基于代码证据）
- **优先级不可绕过**：`resolveField` 严格按 settings > env > default 顺序短路返回，测试覆盖了“settings 优先于 env”“env 优先于默认”两条分支。
- **Key 不进入通用视图**：`describeStepfunConfig` 显式排除 `apiKey`，仅返回其余 5 个字段，防止敏感信息泄露到前端。
- **空值即回退**：`setSettingValue` 收到空串/undefined 会 delete 对应行，使该项自动回退到 env/默认值。
- **路径仅在服务端可用**：`src/lib/config/paths.ts` 依赖 `node:fs`，注释明确“本模块仅在服务端 / 脚本 / 测试中使用”。
- **原生依赖必须 serverExternalPackages**：`next.config.ts` 将 `better-sqlite3`、`ffmpeg-static` 加入白名单，否则 Turbopack 会重写路径导致运行时找不到二进制。
- **设置页 Key 校验门禁**：POST 提交 apiKey 时必须通过 `validateKey` 在线校验，失败返回 422 且不得覆盖已存 Key。

## 5. 未覆盖范围
当前仓库未发现通用的全局配置加载框架（如 `@clack/prompts`、`dotenv-flow` 等），除 AI 相关配置外，其他功能模块暂未发现统一的配置入口；路径类配置集中在 `paths.ts`，AI 配置集中在 `features/ai/config.ts`，属于按领域划分的轻量级配置模式。