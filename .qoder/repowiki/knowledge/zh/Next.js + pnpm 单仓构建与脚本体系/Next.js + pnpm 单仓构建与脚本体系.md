---
kind: build_system
name: Next.js + pnpm 单仓构建与脚本体系
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - next.config.ts
    - pnpm-lock.yaml
    - tsconfig.json
    - vitest.config.ts
    - eslint.config.mjs
    - drizzle.config.ts
    - scripts/setup/db-migrate.ts
    - scripts/README.md
---

本项目采用 Next.js App Router 全栈模式，基于 pnpm 进行依赖管理与构建编排，整体构建系统围绕 `package.json` scripts、Next.js 原生构建流程以及配套的 TypeScript/Vitest/ESLint 工具链展开。

**构建系统与工具链**
- 包管理器：pnpm@9.15.0（通过 `packageManager` 字段锁定），使用 `pnpm-lock.yaml` 锁定所有依赖版本。
- 运行时框架：Next.js >=16.2.0（当前解析为 16.2.11），以 `next dev` / `next build` / `next start` 驱动开发、生产构建与运行。
- 原生依赖处理：在 `next.config.ts` 中通过 `serverExternalPackages: ['better-sqlite3', 'ffmpeg-static']` 将包含平台二进制文件的包标记为外部依赖，避免 Turbopack 将其重写成 `/ROOT` 占位路径，确保 Node 运行时能正确解析本地二进制。
- 依赖安装优化：`pnpm.onlyBuiltDependencies` 仅对 `better-sqlite3`、`esbuild`、`ffmpeg-static` 执行 native build，加速安装。
- 依赖覆盖：通过 `pnpm.overrides` 强制统一 `typescript-eslint` 系列与 `better-sqlite3` 版本，保证构建一致性。

**脚本体系（scripts/）**
- `scripts/setup/db-migrate.ts`：通过 `tsx` 执行数据库迁移，调用 `src/lib/config/paths` 与 `src/lib/db/migrate` 将 Drizzle schema 应用到 SQLite。
- `scripts/dev/`、`scripts/build/`、`scripts/deploy/`、`scripts/spikes/` 目录按职责划分，遵循 kebab-case 命名规范，Node 脚本使用 `.ts`/`.mjs` 后缀。
- `scripts/README.md` 明确约定：Shell 用 `.sh`、Node 用 `.mjs`/`.ts`；每个脚本需支持 `--help` 或注释说明用途、参数与退出码；危险操作前必须确认提示。

**TypeScript 与编译配置**
- `tsconfig.json`：target ES2017、module esnext、moduleResolution bundler、strict 模式开启、noEmit 由 Next.js 接管编译，path alias `@/*` → `./src/*`。
- `vitest.config.ts`：测试环境为 node，匹配 `src/**/*.test.ts`，并配置了相同的 `@` 别名。
- `eslint.config.mjs`：基于 `eslint-config-next` flat config，忽略 `.next`、`out`、`node_modules`、`.data`、`docs`、`src/lib/db/migrations`。

**数据库构建与迁移**
- `drizzle.config.ts`：dialect sqlite，schema 位于 `./src/lib/db/schema.ts`，迁移输出至 `./src/lib/db/migrations`。
- `package.json` 提供 `db:generate`（生成迁移）与 `db:migrate`（执行迁移，通过 tsx 运行 `scripts/setup/db-migrate.ts`）两个命令。

**产物与输出**
- 构建产物输出到 `.next/`（Next.js 默认），另有 `output/` 目录存在但未被脚本引用。
- 运行时数据存储在 `.data/app.db`（SQLite WAL 模式），由 `ensureDataDirs()` 初始化。

**约束与约定**
- 所有构建相关脚本必须放在 `scripts/` 下并按子目录分类。
- 原生依赖必须通过 `onlyBuiltDependencies` 白名单管理，禁止随意引入含 native code 的包。
- Next.js 构建必须保持 serverExternalPackages 列表与实际使用的原生依赖一致。
- 数据库迁移必须先 `db:generate` 再 `db:migrate`，迁移文件不得手动编辑。
- 测试与类型检查通过 `pnpm test` 与 `pnpm typecheck` 分别执行 Vitest 与 tsc --noEmit。