---
kind: dependency_management
name: pnpm 依赖管理与版本锁定策略
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-lock.yaml
    - docs/video-director/package.json
---

本仓库使用 pnpm（指定版本 9.15.0）作为唯一的包管理器，通过 `packageManager` 字段在 `package.json` 中强制统一开发环境。依赖声明集中在根目录的 `package.json`，分为运行时依赖与开发依赖两类：运行时依赖包括 Next.js、React、GSAP、Zod、OpenAI SDK、Playwright、better-sqlite3、ffmpeg-static 等；开发依赖涵盖 TypeScript、Vitest、ESLint、Tailwind CSS、Drizzle Kit 以及内部 `@earendil-works/pi-agent-core` 和 `@earendil-works/pi-ai` 两个私有/专用包。

版本锁定通过 `pnpm-lock.yaml`（lockfileVersion 9.0）实现，所有依赖的具体版本与完整性校验哈希均被记录，确保构建可重现。仓库未使用 vendoring，而是依赖 pnpm 的严格安装语义与 lockfile 保证一致性。

关键约束与覆盖策略：
- `pnpm.overrides` 显式固定了 `typescript-eslint`、`@typescript-eslint/eslint-plugin`、`@typescript-eslint/parser` 为 8.61.1，以规避上游 tarball 缺失 `configs` 目录的问题；同时把 `better-sqlite3` 从声明的 13.0.1 回退到 12.1.0，解决 Node 20 上 native crash 问题。
- `pnpm.onlyBuiltDependencies` 仅允许 `better-sqlite3`、`esbuild`、`ffmpeg-static` 三个含原生编译的包执行构建脚本，减少安装时的安全风险与构建时间。
- 部分依赖使用宽松范围（如 `next >=16.2.0`、`react/react-dom >=19.2`），但实际解析后的精确版本由 lockfile 锁定。

子模块方面，`docs/video-director/package.json` 是一个独立的 skill 包，不共享根级依赖，拥有自己的脚本体系（prompts/experience/release 等），但未包含依赖声明，推测其依赖通过外部机制同步或继承。

没有发现 `.npmrc`、`.pnpmrc` 或私有 npm registry 配置，也未见 `pnpm-workspace.yaml`，表明这是一个单包仓库，不涉及多包工作区管理。