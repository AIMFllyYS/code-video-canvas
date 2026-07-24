---
kind: build_system
name: 构建与制品管理（Next.js + pnpm + Drizzle）
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - next.config.ts
    - vitest.config.ts
    - drizzle.config.ts
    - scripts/README.md
    - scripts/setup/db-migrate.ts
---

本项目采用基于 Node.js 生态的轻量级构建体系，核心由 Next.js、pnpm、TypeScript、Vitest 和 Drizzle Kit 组成，没有独立的 Makefile 或 Dockerfile，构建流程通过 package.json scripts 驱动。

**构建系统与技术栈**
- 包管理器：pnpm 9.15.0（packageManager 字段锁定），仅对 better-sqlite3、esbuild、ffmpeg-static 三个原生依赖执行构建（onlyBuiltDependencies）
- 应用框架：Next.js 16+（>=16.2.0），以全栈模式运行（非静态导出），serverExternalPackages 显式声明 better-sqlite3 和 ffmpeg-static 为外部包，避免 Turbopack 重写成 /ROOT 占位路径
- 类型检查：TypeScript 5.7，通过 tsc --noEmit 校验
- 测试：Vitest 4.1，环境为 node，测试文件匹配 src/**/*.test.ts，使用 @ 别名指向 src/
- 数据库：Drizzle ORM + SQLite，drizzle-kit 生成迁移到 ./src/lib/db/migrations

**构建脚本约定（scripts/）**
- 目录按职责划分：setup（环境初始化）、build（构建辅助）、deploy（部署）、dev（开发工具）、verify（架构验证）、spikes（技术预研）
- 命名规范：Shell 脚本用 .sh，Node 脚本用 .mjs 或 .ts，文件名 kebab-case
- 每个脚本需支持 --help 参数或包含使用说明注释，危险操作前必须确认提示
- 入口脚本通过 tsx 直接运行 TypeScript（如 db:migrate、verify:v3、report:v3）

**关键命令**
- dev/build/start：Next.js 标准生命周期
- test/test:watch：Vitest 运行/监听
- typecheck：tsc --noEmit 类型检查
- db:generate：drizzle-kit generate 生成迁移
- db:migrate：tsx scripts/setup/db-migrate.ts 执行迁移
- verify:v3/report:v3：架构基线校验与报告

**制品与输出**
- .next：Next.js 构建产物
- output：自定义构建输出目录
- .data/app.db：SQLite 数据库文件（含 -shm/-wal 日志）
- .playwright-cli：Playwright E2E 测试截图与控制台日志
- docs/video-director/releases：技能包发布产物（sha256 哈希目录）

**约束与约定**
- 原生依赖通过 pnpm onlyBuiltDependencies 白名单控制，减少不必要的编译
- serverExternalPackages 强制 better-sqlite3 和 ffmpeg-static 在运行时解析，确保平台二进制正确加载
- 数据库迁移通过相对导入避免 @/* 路径别名在脚本环境中的解析问题
- 测试统一使用 vitest.config.ts 集中配置，包含路径别名映射