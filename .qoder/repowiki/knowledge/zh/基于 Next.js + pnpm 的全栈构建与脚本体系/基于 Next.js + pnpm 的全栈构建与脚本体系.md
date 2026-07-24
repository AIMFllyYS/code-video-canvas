---
kind: build_system
name: 基于 Next.js + pnpm 的全栈构建与脚本体系
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

## 1. 构建系统与工具链
本项目采用 **Next.js App Router** 作为全栈框架，使用 **pnpm**（v9.15.0）作为包管理器，构建流程完全围绕 `next build` / `next dev` / `next start` 展开。TypeScript 编译通过 `tsc --noEmit` 进行类型检查，测试由 **Vitest** 驱动（Node 环境），数据库迁移使用 **Drizzle Kit**。

- 开发：`pnpm dev` → Next.js 开发服务器
- 构建：`pnpm build` → Next.js 生产构建
- 启动：`pnpm start` → 生产模式运行
- 类型检查：`pnpm typecheck` / `pnpm tsc`
- 测试：`pnpm test` / `pnpm test:watch`
- Lint：`pnpm lint`（ESLint 9）
- 数据库：`pnpm db:generate`（生成迁移）、`pnpm db:migrate`（执行迁移）

## 2. 关键配置文件
- `package.json`：定义所有 npm scripts、依赖及 pnpm overrides（锁定 TypeScript ESLint 版本、降级 better-sqlite3 至 12.1.0）
- `next.config.ts`：声明 `serverExternalPackages` 以保留 `better-sqlite3` 和 `ffmpeg-static` 的原生二进制路径，避免 Turbopack 重写成 `/ROOT` 占位符
- `tsconfig.json`：严格模式、`moduleResolution: bundler`、`@/*` 路径别名指向 `src/`，排除 `.data`、`.next`、`docs/video-director` 等目录
- `vitest.config.ts`：Node 测试环境，包含 `src/**/*.test.ts`，配置 `@` 别名
- `drizzle.config.ts`：SQLite 方言，schema 位于 `./src/lib/db/schema.ts`，迁移输出到 `./src/lib/db/migrations`

## 3. 脚本组织规范
`scripts/` 目录按职责划分：
- `setup/`：环境初始化（如 `db-migrate.ts` 应用本地 SQLite 迁移）
- `build/`：构建辅助、产物检查、bundle 分析（当前为空目录）
- `deploy/`：部署相关（EdgeOne 部署、环境变量同步、CDN 刷新，文档待实现）
- `dev/`：开发辅助工具、mock 数据生成、调试脚本（当前为空目录）
- `spikes/`：技术探路脚本（如 StepFun API 探测）
- `verify/`：基线验证脚本（如 E2E 截图基线捕获）

脚本命名规范：Shell 使用 `.sh`，Node 脚本使用 `.mjs` 或 `.ts`，文件名 kebab-case，每个脚本需支持 `--help` 或包含使用说明注释，危险操作前必须确认提示。

## 4. 原生依赖与平台二进制处理
项目依赖多个需要原生编译的包：`better-sqlite3`、`ffmpeg-static`、`esbuild`。通过 pnpm 的 `onlyBuiltDependencies` 白名单限制仅允许这些包在 install 时编译，减少构建体积和失败风险。Next.js 构建中通过 `serverExternalPackages` 将这些包标记为外部依赖，确保运行时由 Node.js 解析真实路径而非被打包进 bundle。

## 5. 数据库构建流程
- Schema 定义：`src/lib/db/schema.ts`
- 迁移生成：`pnpm db:generate` → 输出到 `src/lib/db/migrations`
- 迁移执行：`pnpm db:migrate` → 调用 `tsx scripts/setup/db-migrate.ts` → 应用 SQLite 迁移
- 本地数据库文件：`.data/app.db`（WAL 模式）

## 6. CI/容器化现状
仓库中未发现 Dockerfile、docker-compose 文件或 GitHub Actions 工作流。相关规划见 `docs/issues/refactor-v3/issue-n1-postgres-foundation-and-spikes.md`，计划创建 `docker-compose.dev.yml` 用于 PostgreSQL 开发环境，但尚未落地。当前构建完全依赖本地 Node.js 环境。

## 7. 约束与约定
- 包管理器固定为 pnpm v9.15.0（`packageManager` 字段）
- TypeScript 严格模式 + noEmit（由 Next.js 内置编译）
- 测试文件统一以 `.test.ts` 后缀，存放于源码同级目录
- 路径别名 `@/*` 在 tsconfig 和 vitest 中保持一致
- 原生依赖必须通过 pnpm `onlyBuiltDependencies` 白名单管理