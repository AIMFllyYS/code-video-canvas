---
kind: dependency_management
name: pnpm 依赖管理与锁定策略
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-lock.yaml
---

本项目使用 pnpm 作为包管理器，通过 `package.json` 声明依赖、`pnpm-lock.yaml` 锁定版本，配合 `overrides` 和 `onlyBuiltDependencies` 实现统一的依赖治理。

**系统与工具**
- 包管理器：pnpm 9.15.0（由 `packageManager` 字段强制）
- 锁文件：`pnpm-lock.yaml`（lockfileVersion 9.0），提交至版本控制
- 构建脚本：`dev`/`build`/`start`/`test`/`db:migrate` 等统一入口

**关键配置与约定**
- `onlyBuiltDependencies` 仅允许 `better-sqlite3`、`esbuild`、`ffmpeg-static` 三个含原生模块的包执行安装后构建，减少 CI 构建体积与时间。
- `overrides` 将 `typescript-eslint`、`@typescript-eslint/*` 以及 `better-sqlite3` 强制统一到固定版本，避免传递依赖导致的版本漂移。
- 依赖版本策略以 `^`（兼容主版本内更新）为主，但 Next.js、React、TypeScript 等核心栈使用 `>=` 宽松范围，实际锁定由 lockfile 保证。
- 私有包 `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai` 通过 npm registry 引入，未见 `.npmrc` 或 `pnpm-workspace.yaml` 中的私有源配置，默认走公共 registry。
- 项目标记为 `private: true`，不发布到 npm。

**架构与组织**
- 单仓库单 package.json，无 monorepo 结构；所有依赖集中在根目录声明。
- 运行时依赖（dependencies）包含 Next.js、React、Zod、Drizzle ORM、OpenAI SDK、Playwright、GSAP、Jimp、Tailwind 相关库等。
- 开发依赖（devDependencies）包含 TypeScript、Vitest、ESLint、Tailwind CSS PostCSS 插件、tsx、drizzle-kit 等。
- 数据库层通过 Drizzle ORM + better-sqlite3（本地）/Postgres（生产）双后端，迁移脚本位于 `scripts/setup/db-migrate.ts`。

**约束与规范**
- 所有依赖变更需同步更新 `pnpm-lock.yaml`，CI 应校验 lockfile 一致性。
- 新增含原生模块的依赖必须加入 `onlyBuiltDependencies` 白名单，否则安装会失败。
- ESLint/TypeScript 生态通过 overrides 强制统一版本，禁止各自子依赖引入不同版本的 eslint-plugin/parser。
- 未使用 vendoring 或私有 npm registry，依赖均从公共 registry 拉取。