---
kind: dependency_management
name: pnpm 依赖管理与版本锁定策略
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-lock.yaml
    - drizzle.config.ts
---

本项目使用 pnpm 作为包管理器，通过 `package.json` 声明依赖、`pnpm-lock.yaml` 锁定精确版本，并配合 `.pnpm-store` 进行全局缓存。具体实践如下：

**包管理器与锁文件**
- 通过 `packageManager: "pnpm@9.15.0"` 固定 pnpm 版本，确保团队环境一致。
- `pnpm-lock.yaml`（lockfileVersion 9.0）记录所有依赖的精确版本、完整性校验和 peerDependencies 解析结果，是构建可重现性的核心。

**依赖声明与版本策略**
- 运行时依赖（dependencies）包括 Next.js、React、Drizzle ORM、better-sqlite3、GSAP、Jimp、OpenAI SDK、Playwright 等。
- 开发依赖（devDependencies）包含 TypeScript、Vitest、ESLint、Tailwind CSS、drizzle-kit、tsx 等。
- 对 React/Next.js 使用 `>=` 语义化范围（如 `react >=19.2`、`next >=16.2.0`），允许小版本升级；其他库多使用 `^` 前缀，保持向后兼容更新。

**版本覆盖与强制约束**
- 通过 `pnpm.overrides` 强制统一 typescript-eslint 相关包到 `8.61.1`，避免 ESLint 插件版本冲突。
- 将 `better-sqlite3` 从 `^13.0.1` 覆盖为 `12.1.0`，解决原生模块编译问题。
- 这些覆盖在 `package.json.pnpm.overrides` 和 `pnpm-lock.yaml.overrides` 中双重生效。

**原生模块构建优化**
- 通过 `pnpm.onlyBuiltDependencies` 仅对 `better-sqlite3`、`esbuild`、`ffmpeg-static` 三个需要 C++ 扩展的包执行 native build，显著减少安装时间。

**私有包与内部依赖**
- 引入 `@earendil-works/pi-agent-core` 和 `@earendil-works/pi-ai` 两个内部包，版本号 `^0.81.1`，表明项目依赖企业级私有 npm 仓库。
- 未发现 `.npmrc`、`.pnpmrc` 或 `NPM_TOKEN`/`NODE_AUTH_TOKEN` 配置，私有仓库认证可能通过环境变量或 CI 注入。

**数据库依赖管理**
- Drizzle ORM 通过 `drizzle.config.ts` 配置 SQLite 方言，schema 位于 `./src/lib/db/schema.ts`，迁移输出至 `./src/lib/db/migrations`。
- 本地 SQLite 数据库文件位于 `.data/app.db`，属于运行时数据而非代码依赖。

**无 vendoring 策略**
- 项目未使用 `node_modules` 内联提交（已被 `.gitignore` 忽略），也未使用任何 vendoring 工具（如 yarn workspaces、lerna）。依赖通过 pnpm 的符号链接机制在 `node_modules/.pnpm` 中管理。

**脚本与生命周期**
- 提供 `db:generate`（生成 Drizzle schema）、`db:migrate`（执行迁移）等专用脚本。
- 测试通过 `vitest run`，类型检查通过 `tsc --noEmit`，lint 通过 `eslint .`。

**约束与约定**
- 所有依赖必须通过 `package.json` 声明，禁止直接修改 `node_modules`。
- 新增依赖需同步更新 `pnpm-lock.yaml`，确保锁文件与依赖树一致。
- 原生模块必须列入 `onlyBuiltDependencies`，避免不必要的编译开销。