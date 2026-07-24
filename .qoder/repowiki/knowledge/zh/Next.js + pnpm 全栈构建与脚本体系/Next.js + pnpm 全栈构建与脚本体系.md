---
kind: build_system
name: Next.js + pnpm 全栈构建与脚本体系
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

## 构建系统概览

本项目采用 **Next.js App Router** 作为统一的全栈构建入口，配合 **pnpm** 包管理器、**TypeScript** 编译、**Vitest** 测试和 **Drizzle Kit** 数据库迁移，形成轻量但完整的本地开发-构建-部署流水线。

### 核心工具链
- **运行时框架**: Next.js（`next dev/build/start`）
- **包管理**: pnpm 9.15.0（`packageManager` 字段锁定版本）
- **类型检查**: TypeScript 5.7（`noEmit` + `strict` 模式）
- **测试**: Vitest 4.1（Node 环境，`src/**/*.test.ts`）
- **数据库**: Drizzle ORM + SQLite（本地 `.data/app.db`）
- **原生依赖**: better-sqlite3、ffmpeg-static（通过 `serverExternalPackages` 绕过 Turbopack 路径重写）

### 构建脚本约定
`package.json` 的 `scripts` 定义了标准命令：
- `dev`: 启动 Next.js 开发服务器
- `build`: 生产构建（输出到 `.next/`）
- `start`: 运行生产服务器
- `lint`: ESLint 静态检查
- `typecheck`: TypeScript 类型检查（无输出）
- `test` / `test:watch`: Vitest 单测
- `db:generate` / `db:migrate`: Drizzle 迁移生成与应用

### 数据库构建流程
- Schema 定义在 `src/lib/db/schema.ts`
- 迁移文件生成至 `src/lib/db/migrations`
- 本地 SQLite 数据目录位于 `.data/`，由 `ensureDataDirs()` 自动创建
- 迁移执行入口为 `scripts/setup/db-migrate.ts`，通过 `pnpm db:migrate` 调用

### 原生依赖处理策略
`next.config.ts` 显式声明 `serverExternalPackages: ['better-sqlite3', 'ffmpeg-static']`，确保这些包含平台二进制文件的依赖在 Node 运行时解析而非被 Turbopack 重写成 `/ROOT` 占位路径。`pnpm.overrides` 中固定了 `better-sqlite3@12.1.0` 以解决兼容性问题。

### 脚本规范
`scripts/README.md` 规定了辅助脚本的组织方式：
- Shell 脚本使用 `.sh` 后缀，Node 脚本使用 `.mjs` 或 `.ts` 后缀
- 文件名采用 kebab-case
- 每个脚本需包含用途说明、参数说明、退出码含义
- 支持 `--help` 参数
- 危险操作前必须确认提示

### 测试与质量门禁
- 单元测试：Vitest 配置于 `vitest.config.ts`，使用 `@/*` 路径别名指向 `src/`
- Playwright E2E 测试产物位于 `.playwright-cli/`（日志与截图）
- ESLint 配置于根目录 `eslint.config.mjs`

### 容器化与 CI
当前仓库未包含 Dockerfile、docker-compose 或 GitHub Actions 等 CI/CD 配置文件。文档 `docs/conventions/git-workflow.md` 提到团队阶段将启用分支保护、PR 审查与 CI，但尚未实现。部署相关脚本位于 `scripts/deploy/`，目前仅有 README 占位。

### 构建约束
- TypeScript 严格模式（`strict: true`、`noEmit: true`、`isolatedModules: true`）
- 模块解析使用 bundler 模式（适配 Next.js/Vite 生态）
- 排除 `docs/video-director`、`.next`、`out`、`.data` 等目录不参与类型检查
- Next.js 全栈模式（非静态导出），保留 Node.js 服务端能力