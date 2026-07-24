---
kind: dependency_management
name: 基于 pnpm 的依赖管理体系
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-lock.yaml
---

本项目采用 **pnpm** 作为包管理器，通过 `package.json` 声明依赖版本，配合 `pnpm-lock.yaml` 锁定精确版本，实现可重复构建。核心机制如下：

### 1. 包管理器与锁文件
- 使用 `packageManager: "pnpm@9.15.0"` 固定 pnpm 版本，确保团队环境一致。
- `pnpm-lock.yaml`（lockfileVersion 9.0）记录所有依赖的精确版本、完整性校验和 peerDependencies 解析结果，提交至版本控制。

### 2. 依赖分类与版本策略
- **运行时依赖**（dependencies）：Next.js、React、GSAP、Zod、Drizzle ORM、OpenAI SDK、Playwright 等。
- **开发依赖**（devDependencies）：TypeScript、Vitest、ESLint、Tailwind CSS、tsx、drizzle-kit 等。
- 版本范围使用 `^` 前缀（如 `^3.15.0`），允许小版本更新；部分关键依赖使用宽松范围（如 `next: ">=16.2.0"`、`react: ">=19.2"`）以适配 Next.js 生态。

### 3. 依赖覆盖与构建优化
- `pnpm.overrides` 强制统一 typescript-eslint 相关包版本为 `8.61.1`，避免 ESLint 插件版本冲突。
- `better-sqlite3` 被覆盖到 `12.1.0`，解决原生模块兼容性问题。
- `onlyBuiltDependencies` 仅对 `better-sqlite3`、`esbuild`、`ffmpeg-static` 执行原生编译，加速安装并减少缓存体积。

### 4. 私有/内部依赖
- 引入 `@earendil-works/pi-agent-core` 和 `@earendil-works/pi-ai` 两个内部包，推测通过私有 npm registry 或 Git 源获取，但未在仓库中配置 `.npmrc` 或 `pnpm-workspace.yaml`，可能依赖全局配置或 CI 环境变量。

### 5. 无 vendoring 策略
- 项目未使用 `node_modules` 之外的 vendoring（如 `yarn.lock` 的 `--frozen-lockfile` 或 `pnpm` 的 `--frozen-lockfile` 仅在 CI 中使用），也未见 `vendor/` 目录，完全依赖 pnpm 的符号链接机制。

### 开发者规范
- 新增依赖需同时更新 `package.json` 和提交 `pnpm-lock.yaml`。
- 优先使用 `^` 语义化版本，避免硬编码精确版本（overrides 除外）。
- 原生模块应加入 `onlyBuiltDependencies` 列表以提升安装性能。
- 内部包升级需同步检查 `overrides` 是否需要同步调整。