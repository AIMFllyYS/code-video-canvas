---
kind: logging_system
name: 基于 console 的原生日志输出（无专用日志框架）
category: logging_system
scope:
    - '**'
source_files:
    - src/features/ai/gemini-adapter.ts
    - src/features/ai/stepfun-adapter.ts
    - src/features/director/stage-runner.ts
    - src/features/render/queue-handler.ts
    - src/app/api/render/export/route.ts
    - scripts/setup/db-migrate.ts
---

本仓库未引入任何第三方日志框架（如 pino、winston、bunyan、debug 等），也未在 src/lib 或 src/server 下建立统一的 logger 模块。全栈代码中的日志输出完全依赖 Node.js/浏览器原生的 `console` API，以分散的 `console.log` / `console.error` / `console.info` 调用形式出现在各业务文件中。

**使用方式与模式**
- 错误日志：在各适配器与运行时模块中使用 `console.error('[模块前缀] 描述', { 结构化字段 })`，例如 `src/features/ai/gemini-adapter.ts`、`src/features/ai/stepfun-adapter.ts`、`src/features/director/stage-runner.ts`、`src/features/render/queue-handler.ts`、`src/app/api/render/export/route.ts` 等，均通过方括号模块名作为前缀，并附带对象形式的上下文字段（projectId、nodeId、message 等）。
- 调试/信息日志：测试文件中使用 `console.info` 打印性能指标（如 `src/features/canvas/layout.test.ts`），脚本中使用 `console.log` 输出迁移结果（如 `scripts/setup/db-migrate.ts`）。
- 前端 UI 层：未发现服务端渲染或 Next.js 中间件级别的集中式日志拦截；前端组件中未见 console 调用。

**架构与约定**
- 无全局初始化：`src/instrumentation.ts` 仅用于 Next.js 启动时初始化队列，未注册任何日志钩子。
- 无日志级别管理：所有调用均为硬编码的 console 方法，没有按环境（dev/prod）切换级别或过滤机制。
- 无结构化输出规范：虽然部分 error 调用附带了对象参数，但整体格式不统一，也没有统一的 traceId、requestId 等关联字段贯穿请求链路。
- 无日志收集/持久化：日志直接输出到进程 stdout/stderr，未配置文件写入、远程收集或结构化日志后端。

**约束与限制**
- 由于缺乏统一日志抽象，新增模块需自行决定使用 console 还是其他方案，无法强制一致性。
- 生产环境中无法区分不同来源的日志，也无法按级别过滤，排查问题依赖人工阅读 stdout。
- 当前实现仅满足开发调试阶段的最低需求，不具备生产级可观测性能力。