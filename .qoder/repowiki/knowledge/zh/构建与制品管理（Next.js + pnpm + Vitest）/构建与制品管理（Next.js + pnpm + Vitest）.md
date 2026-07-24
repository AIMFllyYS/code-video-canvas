---
kind: build_system
name: 构建与制品管理（Next.js + pnpm + Vitest）
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - next.config.ts
    - drizzle.config.ts
    - vitest.config.ts
    - tsconfig.json
    - scripts/README.md
    - scripts/setup/db-migrate.ts
---

本项目采用基于 Next.js 的全栈单仓构建体系，使用 pnpm 作为包管理器，Vitest 作为测试框架，Drizzle Kit 负责数据库迁移。整体构建流程围绕 `package.json` 的 npm scripts 组织，无 Makefile、Dockerfile 或 CI 流水线文件，属于轻量级本地开发/部署模式。

**1. 构建系统与工具链**
- 前端与后端统一由 Next.js 驱动：`next build` 生成生产产物，`next dev` 启动开发服务器，`next start` 运行生产服务。
- TypeScript 编译通过 `tsc --noEmit` 进行类型检查（`typecheck`），实际构建由 Next.js 内部完成，`tsconfig.json` 启用 `isolatedModules`、`incremental` 和 `moduleResolution: bundler`。
- 包管理使用 pnpm（锁定版本 `pnpm@9.15.0`），并通过 `pnpm.overrides` 强制对齐 typescript-eslint 相关依赖与 better-sqlite3 版本。
- 原生依赖通过 `pnpm.onlyBuiltDependencies` 白名单控制：`better-sqlite3`、`esbuild`、`ffmpeg-static`。

**2. 关键配置文件**
- `package.json`：定义所有 npm scripts（dev/build/start/lint/typecheck/test/db:migrate 等）、依赖与 pnpm 配置。
- `next.config.ts`：声明 `serverExternalPackages` 将 `better-sqlite3`、`ffmpeg-static` 标记为外部依赖，避免 Turbopack 重写路径。
- `drizzle.config.ts`：SQLite 方言，schema 位于 `src/lib/db/schema.ts`，迁移输出到 `src/lib/db/migrations`。
- `vitest.config.ts`：Node 环境测试，包含 `src/**/*.test.ts`，配置 `@/*` 路径别名指向 `./src`。
- `tsconfig.json`：ES2017 target、strict 模式、React JSX transform、paths 映射 `@/*` → `./src/*`。
- `postcss.config.mjs` / `eslint.config.mjs`：样式与代码规范工具链。

**3. 脚本与辅助工具**
- `scripts/` 目录按用途分设 `setup/`（环境初始化、db-migrate）、`build/`（构建辅助）、`deploy/`（EdgeOne 部署）、`dev/`（开发辅助）、`spikes/`（技术预研）。
- `scripts/setup/db-migrate.ts`：通过 tsx 执行数据库迁移，调用 `runMigrations(DB_PATH)`。
- 脚本规范文档要求 Shell 用 `.sh`、Node 脚本用 `.mjs` 或 `.ts`，文件名 kebab-case，支持 `--help`。

**4. 构建约定与约束**
- 全栈模式：Next.js 以真实 Node server 运行（非静态导出），原生二进制依赖必须在运行时由 Node 解析。
- 测试：Vitest 在 node 环境中运行，测试文件命名约定 `*.test.ts`，位于 `src/` 下。
- 数据库：默认 SQLite（better-sqlite3），通过 Drizzle Kit 生成迁移；文档中提及未来计划引入 PostgreSQL（docker-compose.dev.yml 规划中，尚未落地）。
- 制品输出：Next.js 默认输出到 `.next` 目录，构建产物由 `next build` 生成。
- 无容器化与 CI：仓库未包含 Dockerfile、docker-compose 文件或 GitHub Actions 工作流，部署脚本仅存在于 `scripts/deploy/README.md` 中描述。

**5. 已知限制**
- 无跨平台构建脚本或交叉编译配置。
- 无版本发布流水线（version 仍为 `0.1.0`），版本号管理未见自动化脚本。
- 文档中规划的 docker-compose 与 Postgres 支持仍处于 issue/plan 阶段，未在代码库中实现。