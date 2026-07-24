---
kind: logging_system
name: 日志系统 — 基于 console 与 ffmpeg stderr 的轻量输出
category: logging_system
scope:
    - '**'
source_files:
    - src/instrumentation.ts
    - scripts/setup/db-migrate.ts
    - src/features/render/concat.ts
    - src/features/render/encode.ts
    - scripts/spikes/pi-stepfun-probe.ts
---

本仓库未引入任何专用日志框架（如 pino、winston、bunyan、debug 等），也没有统一的 logger 模块或结构化日志中间件。应用中的“日志”行为由以下三种方式构成：

1. **Node.js 标准输出**
   - `scripts/setup/db-migrate.ts` 使用 `console.log` 打印迁移完成信息。
   - `src/features/canvas/layout.test.ts` 在测试中用 `console.info` 输出性能数据。
   - `scripts/spikes/pi-stepfun-probe.ts` 通过 `process.stdout.write(JSON.stringify(...))` 向 stdout 输出结构化结果，供外部脚本消费。

2. **Next.js instrumentation 钩子**
   - `src/instrumentation.ts` 仅用于在服务端运行时初始化队列（`initQueue()`），并未在此处注册全局日志拦截器或错误上报逻辑。

3. **ffmpeg 子进程 stderr 捕获**
   - `src/features/render/concat.ts` 与 `src/features/render/encode.ts` 在调用 ffmpeg 时传入 `-loglevel` 参数，并通过监听子进程的 `stderr` 流收集输出；失败时将 stderr 内容拼接到错误消息中返回给上层。
   - 这些 stderr 片段属于底层工具链输出，并非应用自身业务日志。

**架构与约定**
- 没有集中式日志门面，各模块直接依赖原生 API 输出。
- 服务端启动入口 `instrumentation.ts` 未承担日志路由职责，仅做基础设施初始化。
- 渲染管线将 ffmpeg 的错误信息以字符串形式透传至调用方，由上层决定如何展示或记录。

**开发者应遵循的规则**
- 如需新增结构化日志，建议先在 `src/lib/` 下建立统一 logger 模块（例如封装 pino），再在各 feature 中导入使用，避免散落的 `console.*` 调用。
- 对长耗时操作的性能指标可沿用 `console.info` + JSON 格式的做法，但需评估是否应改为可配置的 sink（文件/远程服务）。
- 涉及外部进程（ffmpeg、remotion 等）的输出应继续通过 stderr/stdout 管道采集，并在错误路径中附带原始片段以便排障。