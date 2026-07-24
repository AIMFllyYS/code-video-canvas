---
kind: build_system
name: 构建与制品管理（Next.js + pnpm 单仓）
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - next.config.ts
    - vitest.config.ts
    - drizzle.config.ts
    - scripts/README.md
---

本项目采用基于 Next.js App Router 的单仓全栈构建体系，所有构建、测试、数据库迁移等流程均通过 `package.json` 的 npm scripts 驱动，由 pnpm 作为包管理器统一解析依赖。

### 1. 构建系统概览
- **运行时框架**：Next.js（>=16.2），以“真实 Node server”模式运行，非静态导出。
- **包管理器**：pnpm@9.15.0，通过 `pnpm.overrides` 锁定 TypeScript ESLint 生态版本，并通过 `onlyBuiltDependencies` 仅对 `better-sqlite3`、`esbuild`、`ffmpeg-static` 三个原生/二进制依赖执行本地编译。
- **构建入口**：`next build` 生成 `.next` 产物；`next start` 启动生产服务。
- **原生依赖处理**：在 `next.config.ts` 中通过 `serverExternalPackages: ['better-sqlite3', 'ffmpeg-static']` 将这两个包标记为外部依赖，避免 Turbopack 将其重写成 `/ROOT` 占位路径，确保运行时由 Node 正确解析平台二进制。

### 2. 关键脚本与工具链
| 命令 | 作用 |
|---|---|
| `pnpm dev` | 启动 Next.js 开发服务器 |
| `pnpm build` | 执行 `next build` 构建生产产物 |
| `pnpm start` | 启动生产服务 |
| `pnpm lint` | 使用 ESLint 扫描全部源码 |
| `pnpm typecheck` / `tsc` | TypeScript 类型检查（无输出） |
| `pnpm test` / `test:watch` | Vitest 单元测试（node 环境，匹配 `src/**/*.test.ts`） |
| `pnpm db:generate` | drizzle-kit 生成 SQLite 迁移文件 |
| `pnpm db:migrate` | 通过 `tsx` 执行 `scripts/setup/db-migrate.ts` 应用迁移 |

- **测试框架**：Vitest v4，配置于根目录 `vitest.config.ts`，设置 `environment: 'node'`，并通过别名 `@` → `./src` 支持模块导入。
- **数据库迁移**：Drizzle ORM + SQLite，schema 位于 `src/lib/db/schema.ts`，迁移输出至 `src/lib/db/migrations`，配置文件见 `drizzle.config.ts`。
- **Lint 配置**：ESLint v9 配合 `eslint-config-next`，配置文件 `eslint.config.mjs`。

### 3. 辅助脚本组织
根目录下 `scripts/` 按职责分目录存放辅助脚本：
- `setup/`：环境初始化、依赖安装、配置生成（含 `db-migrate.ts`）
- `build/`：构建辅助、产物检查、bundle 分析（目录存在但当前为空）
- `deploy/`：EdgeOne 部署、环境变量同步、CDN 刷新（README 已定义规范）
- `dev/`：开发辅助工具、mock 数据生成、调试脚本
- `spikes/`：技术预研探针脚本

脚本命名约定：Shell 用 `.sh`，Node 脚本用 `.mjs` 或 `.ts`，文件名 kebab-case，每个脚本需包含用途注释并支持 `--help`。

### 4. 架构与约定
- **单仓全栈**：前端（Next.js App Router）、后端 API Routes（`src/app/api/*`）、渲染引擎（Remotion/GSAP 产物）、AI Director 流水线、SQLite 数据库均在同一仓库，通过 Next.js 内置路由和 API 层解耦。
- **原生依赖最小化**：仅允许 `better-sqlite3`、`ffmpeg-static`、`esbuild` 进行原生编译，其余依赖均为纯 JS，降低跨平台构建复杂度。
- **无容器化/CI 配置**：仓库未包含 Dockerfile、docker-compose、GitHub Actions 等 CI/CD 文件，部署流程尚未固化到代码中（`scripts/deploy/` 下仅有 README）。

### 5. 开发者应遵循的规则
- 新增构建/部署脚本时，放入 `scripts/<category>/` 对应目录，遵循 kebab-case 命名并在文件头添加用途说明。
- 需要引入原生依赖前，先在 `pnpm.onlyBuiltDependencies` 中声明，避免污染依赖树。
- 数据库 schema 变更通过 `pnpm db:generate` 生成迁移，再经 `pnpm db:migrate` 应用，禁止手写 SQL 迁移。
- 测试用例统一放在 `src/**` 同级 `.test.ts` 文件中，由 Vitest 自动发现。
- 不要修改 `next.config.ts` 中的 `serverExternalPackages` 列表，除非确认该包必须在运行时由 Node 解析。

### 6. 已知局限
- 缺少容器化镜像与 CI 流水线，本地构建与线上部署之间存在环境差异风险。
- `scripts/build/`、`scripts/deploy/` 目录目前为空，实际构建/部署逻辑仍集中在 `package.json` scripts 中，尚未模块化封装。
- 未实现多环境（dev/staging/prod）构建变体，所有环境共用同一套 Next.js 构建产物。