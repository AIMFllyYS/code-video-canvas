---
kind: logging_system
name: 基于原生 console 与 ffmpeg stderr 的轻量日志输出
category: logging_system
scope:
    - '**'
source_files:
    - src/features/ai/gemini-adapter.ts
    - src/features/ai/stepfun-adapter.ts
    - src/features/director/stage-runner.ts
    - src/features/render/queue-handler.ts
    - src/features/render/encode.ts
    - src/app/api/render/export/route.ts
    - scripts/setup/db-migrate.ts
---

该仓库未引入任何第三方日志框架（如 winston、pino、log4js 等），也没有独立的 logger 模块或集中式日志配置。整个应用的日志输出完全依赖 Node.js 原生的 `console` API 以及外部子进程（ffmpeg）的 stderr 流，属于最轻量的“无框架”日志方案。

**使用的框架/工具**
- 仅使用 `console.log / console.error / console.info` 进行控制台输出。
- 通过 `child_process.spawn` 启动 ffmpeg，并监听其 `stderr` 流以收集编码错误信息。
- 没有 log level 管理、结构化日志库、日志轮转或远程收集器。

**关键位置与模式**
- 业务错误日志集中在各 feature 模块中，统一采用 `[模块名] 描述 + 对象参数` 的形式：
  - `src/features/ai/gemini-adapter.ts`：`console.error('[gemini] validateGeminiKey 失败', { status, message })`
  - `src/features/ai/stepfun-adapter.ts`：`console.error('[stepfun] validateKey 失败', { status, message })`
  - `src/features/director/stage-runner.ts`：`console.error('[director] 下游自动推进失败', { projectId, nodeId, message })`
  - `src/features/render/queue-handler.ts`：`console.error('[render] 下游自动推进失败', { projectId, nodeId, message })`
  - `src/app/api/render/export/route.ts`：`console.error(...)` 用于导出流程异常
  - `scripts/setup/db-migrate.ts`：`console.log('[db] migrations applied at ...')`
- 性能调试日志仅在测试中使用，如 `src/features/canvas/layout.test.ts` 中的 `console.info('computeLayout ...')`。
- ffmpeg 的错误输出被捕获并拼接到抛出错误的消息中：`encode.ts` 中 `runFfmpeg` 将 `stderr` 累积后在 `close` 事件中拼接为 `ffmpeg 编码失败（exit ${code}）：${stderr.trim()}`。

**架构约定**
- 所有日志都是同步写入标准输出/标准错误，没有异步缓冲或队列。
- 日志格式不统一但遵循 `[模块前缀] 中文描述 + JSON 对象` 的约定，便于在终端中快速定位来源。
- 没有全局错误处理器拦截 `console.error`，也没有统一的 error boundary 聚合日志。
- 外部子进程（ffmpeg）的错误通过 stderr 管道回传，由调用方转换为 JS Error 抛出，而非直接记录到日志文件。

**约束与限制**
- 由于未集成任何日志框架，无法实现按级别过滤、结构化查询、持久化存储或远程上报。
- 日志内容随进程生命周期存在，重启后丢失。
- 在生产环境中，日志输出依赖于运行容器或宿主机的 stdout/stderr 收集机制（如 Docker 日志驱动、PM2 等），代码本身不做任何路由或过滤。