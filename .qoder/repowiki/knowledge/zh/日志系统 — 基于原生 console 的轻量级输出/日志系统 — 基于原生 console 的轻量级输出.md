---
kind: logging_system
name: 日志系统 — 基于原生 console 的轻量级输出
category: logging_system
scope:
    - '**'
source_files:
    - src/features/ai/stepfun-adapter.ts
    - scripts/setup/db-migrate.ts
    - scripts/spikes/pi-stepfun-probe.mts
    - src/features/render/concat.ts
    - src/features/render/encode.ts
---

该仓库**未实现专门的日志框架或结构化日志系统**，而是直接使用 Node.js/浏览器原生的 `console` API 进行输出。具体表现如下：

1. **使用方式**：全仓仅发现 3 处 `console` 调用
   - `src/features/ai/stepfun-adapter.ts`：在 Key 校验失败时通过 `console.error('[stepfun] validateKey 失败', { status, message })` 输出错误上下文
   - `scripts/setup/db-migrate.ts`：迁移完成后 `console.log('[db] migrations applied at ${DB_PATH}')`
   - `scripts/spikes/pi-stepfun-probe.mts`：探针脚本中大量 `console.log/error` 用于调试
   - `src/features/canvas/layout.test.ts`：测试中用 `console.info` 打印性能数据

2. **无统一封装**：不存在 `lib/logger.ts`、`logging/` 目录、`pino/winston/bunyan/debug` 等第三方库依赖；也没有 log level 管理、结构化字段约定或集中式 sink。

3. **FFmpeg 日志参数**：`src/features/render/concat.ts` 和 `encode.ts` 中通过 `-loglevel error` 控制 FFmpeg 子进程输出级别，这是唯一一处对“日志级别”概念的显式使用。

4. **.gitignore** 仅忽略 npm/yarn/pnpm 的 debug.log 文件，无自定义日志路径规则。

**结论**：本项目处于“无日志系统”状态，开发者直接散落使用 `console.log/error/info`，缺乏统一的级别策略、结构化格式与输出路由。若需改进，建议引入 `pino`（Node 端）+ 前端 `debug` 库，并建立 `src/lib/logger.ts` 作为统一入口。