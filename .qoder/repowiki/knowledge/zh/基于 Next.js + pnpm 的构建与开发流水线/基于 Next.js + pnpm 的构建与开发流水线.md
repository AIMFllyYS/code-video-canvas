---
kind: build_system
name: 基于 Next.js + pnpm 的构建与开发流水线
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - next.config.ts
    - tsconfig.json
    - vitest.config.ts
    - drizzle.config.ts
    - scripts/README.md
    - scripts/setup/db-migrate.ts
---

该项目采用以 Next.js App Router 为核心的全栈构建体系，配合 pnpm 包管理器、TypeScript 编译、Vitest 测试以及 Drizzle ORM 迁移，形成一套轻量但完整的本地优先 AIGC 视频创作引擎构建流程。

**构建系统与工具链**
- 框架：Next.js（>=16.2.0）作为应用运行时与构建入口，`next dev` / `next build` / `next start` 分别对应开发、生产构建与运行。
- 包管理：pnpm@9.15.0，通过 `packageManager` 字段锁定版本；原生依赖通过 `pnpm.onlyBuiltDependencies` 白名单限制为 `better-sqlite3`、`esbuild`、`ffmpeg-static`，避免不必要的平台二进制编译。
- TypeScript：`tsconfig.json` 启用严格模式、`noEmit: true`（仅类型检查）、`moduleResolution: bundler`，路径别名 `@/*` → `./src/*`。
- 样式：Tailwind CSS v4 + PostCSS，由 Next.js 内置处理。
- 数据库：Drizzle Kit 管理 SQLite schema 与迁移，`drizzle.config.ts` 指向 `src/lib/db/schema.ts`，输出到 `src/lib/db/migrations`。
- 测试：Vitest v4，Node 环境，匹配 `src/**/*.test.ts`，支持 `@` 路径别名。
- Lint：ESLint 9 + eslint-config-next，通过 `pnpm lint` 执行。

**脚本与命令约定**
- `package.json scripts` 是主要入口：`dev`、`build`、`start`、`lint`、`typecheck`、`test`/`test:watch`、`db:generate`、`db:migrate`、`tsc`。
- `scripts/` 目录按用途分 `setup/`（环境初始化与 DB 迁移）、`build/`（构建辅助，当前为空）、`deploy/`（部署说明，当前为空）、`dev/`（开发辅助，当前为空）、`spikes/`（技术预研脚本）。脚本规范文档要求 Shell 用 `.sh`、Node 脚本用 `.mjs`/`.ts`，文件名 kebab-case，且需支持 `--help`。
- 数据库迁移通过 `tsx scripts/setup/db-migrate.ts` 执行，使用相对导入规避 `@/*` 在脚本环境下的解析问题。

**构建配置关键点**
- `next.config.ts` 中通过 `serverExternalPackages: ['better-sqlite3', 'ffmpeg-static']` 将原生依赖标记为外部包，确保 Turbopack 不会重写成 `/ROOT` 占位路径，使 Node 运行时能正确解析平台二进制。
- 项目为私有单仓库（`private: true`），无 Dockerfile、CI/CD 配置文件（`.github/workflows`、Makefile、Dockerfile 等均未发现），部署脚本目录存在但内容为空，表明当前阶段以本地开发为主。

**产物与输出**
- 构建产物位于 `.next/`（Next.js 默认输出）。
- 运行时数据存储在 `.data/app.db`（SQLite WAL 模式）。
- Playwright E2E 截图与日志输出至 `.playwright-cli/`。
- 临时文件与测试结果位于 `tmp/`。

**约束与约定**
- 所有构建、测试、迁移均通过 `pnpm` 脚本统一入口，不直接调用底层工具。
- 原生依赖必须列入 `onlyBuiltDependencies` 白名单，否则 pnpm 会拒绝安装。
- TypeScript 严格模式与 `isolatedModules` 强制模块隔离，禁止跨文件类型推断副作用。
- 数据库变更必须先 `db:generate` 生成迁移，再 `db:migrate` 应用到本地 SQLite。