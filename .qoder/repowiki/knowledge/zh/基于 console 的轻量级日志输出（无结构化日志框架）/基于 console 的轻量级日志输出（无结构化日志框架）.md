---
kind: logging_system
name: 基于 console 的轻量级日志输出（无结构化日志框架）
category: logging_system
scope:
    - '**'
source_files:
    - src/instrumentation.ts
    - src/app/api/render/export/route.ts
    - src/features/ai/stepfun-adapter.ts
    - src/features/render/qa-check.ts
    - src/features/render/encode.ts
    - scripts/setup/db-migrate.ts
---

本仓库未引入任何第三方日志框架（如 pino、winston、bunyan、morgan、triple-beam 等），也未在 `src/` 下建立统一的 logger 初始化或中间件。应用日志完全依赖 Node.js 内置的 `console` API，以“带前缀标签”的字符串拼接方式输出到标准错误/标准输出，属于最轻量的内联式记录模式。

**使用位置与模式**
- 服务端 API 路由：`src/app/api/render/export/route.ts` 在 QA 检测异常时通过 `console.error('[render/export] ...')` 记录；`scripts/setup/db-migrate.ts` 用 `console.log('[db] migrations applied at ...')` 输出迁移结果。
- AI 适配器：`src/features/ai/stepfun-adapter.ts` 在 Key 校验失败时 `console.error('[stepfun] validateKey 失败', { status, message })`，并附带注释强调“仅服务端日志用于排障：不回显给客户端、不写入会被提交的文件、绝不含 Key”。
- 渲染 QA：`src/features/render/qa-check.ts` 对单个分镜 QA 失败捕获后 `console.error('[qa-check] 分镜 ... QA 检测失败：...')`，采用 best-effort 逐 shot 处理，单个失败不中断其余。
- 测试辅助：`src/features/canvas/layout.test.ts` 使用 `console.info` 打印布局性能指标。
- FFmpeg 子进程：`encode.ts` / `concat.ts` 通过 `-loglevel error` 将 ffmpeg 自身日志限制为错误级别，并通过 `stdio: ['ignore','ignore','pipe']` 只收集 stderr 作为错误原因返回，不直接写入应用日志流。

**架构约定与约束**
- 所有 `console.*` 调用均位于服务端代码路径（文件顶部带有 `'server-only'` 导入或位于 `app/api/*`、`features/*` 中），前端组件未发现 `console` 调用，避免污染浏览器控制台。
- 日志字段以方括号前缀标识来源模块（如 `[render/export]`、`[stepfun]`、`[qa-check]`、`[db]`），便于在 stdout/stderr 中快速过滤。
- 错误信息统一包裹在 `Error` 实例的 `message` 中，再拼接到日志字符串；部分场景附加 `{ status, message }` 等字面量对象作为第二参数，但整体仍非 JSON 行格式，无法被外部日志采集器直接解析。
- 未定义全局日志级别开关、未实现日志轮转/持久化、未接入集中式日志系统；调试主要依赖运行期 stdout/stderr 输出以及 `.next`、`tmp/` 下的 Playwright 控制台快照。

**结论**：该仓库当前处于“无日志框架”状态，日志是散落在各模块中的 `console` 调用，适合本地开发调试，尚不具备生产环境所需的结构化、可聚合、可分级能力。