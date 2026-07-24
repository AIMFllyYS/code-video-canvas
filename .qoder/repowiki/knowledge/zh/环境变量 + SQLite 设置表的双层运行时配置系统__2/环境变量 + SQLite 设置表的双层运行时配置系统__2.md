---
kind: configuration_system
name: 环境变量 + SQLite 设置表的双层运行时配置系统
category: configuration_system
scope:
    - '**'
source_files:
    - .env.example
    - src/lib/config/paths.ts
    - src/features/ai/stepfun-adapter.ts
    - src/features/director/pi-session.ts
    - src/app/api/settings/route.ts
    - src/lib/db/schema.ts
    - drizzle.config.ts
---

本仓库采用「环境变量（开发/部署）+ SQLite settings 表（运行期持久化）」双层配置体系，覆盖本地数据目录、StepFun AI 密钥与模型参数等关键运行时选项。

## 1. 配置来源与优先级
- 环境变量：通过 process.env 直接读取，用于开发、测试和容器部署时的快速注入。
- SQLite settings 表：通过 /api/settings 接口由用户在应用内写入，作为生产环境下的持久化配置源。
- 默认值：所有配置项均提供硬编码默认值，保证未显式配置时仍可运行。

优先级顺序（从高到低）：
1. 调用方传入的 options（如 chat() 的 options.model）
2. SQLite settings 表中保存的值（仅对 API Key）
3. 环境变量（STEPFUN_*、DATA_DIR）
4. 代码中的硬编码默认值

## 2. 核心配置项
- DATA_DIR: 环境变量，默认 ./.data，SQLite 数据库与渲染产物根目录
- DB_PATH: 计算得出，${DATA_DIR}/app.db
- ARTIFACTS_DIR: 计算得出，${DATA_DIR}/artifacts
- STEPFUN_API_KEY: 环境变量或 settings 表，StepFun API 密钥；优先读 settings，回退到 env
- STEPFUN_BASE_URL: 环境变量，默认 https://api.stepfun.com/v1
- STEPFUN_CHAT_MODEL: 环境变量，默认 step-3.5-flash
- STEPFUN_TTS_MODEL: 环境变量，默认 stepaudio-2.5-tts
- STEPFUN_ASR_MODEL: 环境变量，默认 stepaudio-2.5-asr
- STEPFUN_VISION_MODEL: 环境变量，默认 step-3.7-flash

## 3. 关键文件与职责
- src/lib/config/paths.ts: 解析 DATA_DIR、导出 DB_PATH、ARTIFACTS_DIR，并提供 ensureDataDirs() 幂等创建目录
- src/features/ai/stepfun-adapter.ts: 封装 StepFun OpenAI 客户端，实现 getStoredApiKey/saveApiKey/validateKey，并在构造 client 时合并 BASE_URL 与 CHAT_MODEL
- src/features/director/pi-session.ts: Director 运行时通过 @earendil-works/pi-ai 注册 stepfun provider，同样遵循 settings -> env -> default 的密钥读取顺序
- src/app/api/settings/route.ts: 暴露 GET/POST 两个端点，GET 返回已配置的 masked key，POST 先调用 validateKey 再落库
- src/lib/db/schema.ts: 定义 settings 表（key/value 键值对），是运行时设置的唯一持久化存储
- .env.example: 列出全部可配置环境变量及注释说明
- drizzle.config.ts: Drizzle Kit 迁移配置，指向 schema 与 migrations 输出目录

## 4. 架构约定与设计决策
- 服务端隔离：所有涉及文件系统与数据库的配置模块均通过 'server-only' 标记或仅在 server route/scripts 中引入，确保不进入前端 bundle
- 幂等初始化：ensureDataDirs() 在脚本启动时调用，保证 .data 与 artifacts 目录存在
- 安全策略：API Key 从不回显完整值，仅返回前 3 位加 *** 加后 2 位的掩码；校验失败日志仅打印状态码与消息，不含 Key 本身
- OpenAI 兼容抽象：StepFun 以 OpenAI SDK 方式接入，便于未来替换其他兼容提供商
- Schema 驱动验证：Settings 输入使用 zod schema（stepfunSettingsSchema）在服务端做类型校验，错误信息直接返回给前端

## 5. 开发者应遵循的规则
1. 新增配置项：先在 .env.example 中添加条目与注释，然后在对应模块中以 process.env.X ?? 'default' 形式读取
2. 需要持久化的敏感配置：通过 getStoredApiKey()/saveApiKey() 读写 settings 表，不要直接操作 DB
3. 不要在客户端组件中访问 process.env：所有配置读取逻辑必须放在 server-only 模块或 API Route 中
4. 目录路径统一走 src/lib/config/paths：避免各模块各自拼接路径导致不一致
5. 迁移与初始化：修改 schema 后使用 pnpm db:generate 生成迁移，部署前执行 db-migrate.ts 完成建表