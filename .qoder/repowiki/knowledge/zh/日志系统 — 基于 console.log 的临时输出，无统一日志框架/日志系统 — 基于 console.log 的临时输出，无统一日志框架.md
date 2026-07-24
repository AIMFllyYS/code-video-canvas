---
kind: logging_system
name: 日志系统 — 基于 console.log 的临时输出，无统一日志框架
category: logging_system
scope:
    - '**'
source_files:
    - src/instrumentation.ts
    - scripts/setup/db-migrate.ts
    - scripts/spikes/pi-stepfun-probe.mts
    - scripts/verify/capture-v3-baseline.ts
    - src/app/api/render/export/route.ts
---

经对仓库进行全面搜索，未发现任何统一的日志框架或结构化日志实现。代码库中不存在 pino、winston、bunyan、loglevel 等第三方日志库依赖，也没有自定义 logger 模块或 log/ 目录。

当前日志输出方式：
- 应用源码（src/**）中未检测到 console.log/error/warn/debug 调用，说明业务代码有意避免直接输出日志
- 脚本工具（scripts/ 目录下）广泛使用 console.log 和 console.error 进行调试输出，如 db-migrate.ts、pi-stepfun-probe.mts、capture-v3-baseline.ts 等
- Next.js API 路由中仅在错误处理分支使用 console.error 输出异常信息

设计决策与约束：
- 项目采用「零日志框架」策略，通过 Next.js 内置控制台输出作为开发期日志
- 前端通过 streaming-log-card.tsx 组件以 SSE 流式展示管道执行状态，而非传统文件日志
- FFmpeg 子进程通过 -loglevel error 参数限制 stderr 输出，体现「仅错误可见」原则
- instrumentation.ts 中仅初始化队列，未配置全局日志拦截器

该方案适用于本地开发与测试环境，但缺乏生产级日志能力（结构化字段、分级过滤、集中收集、持久化存储）。