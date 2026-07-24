---
kind: dependency_management
name: pnpm 依赖管理与版本锁定策略
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-lock.yaml
---

本仓库采用 pnpm 作为统一的 Node.js 包管理器，通过 `package.json` 声明依赖，配合 `pnpm-lock.yaml` 进行精确版本锁定，确保构建可重复性。

**系统与方法**
- 包管理器：pnpm（指定版本 `pnpm@9.15.0`，通过 `packageManager` 字段强制团队使用）
- 依赖声明：集中在根目录 `package.json` 的 `dependencies` 与 `devDependencies` 中
- 版本锁定：`pnpm-lock.yaml`（lockfileVersion 9.0），提交至版本控制
- 无 vendoring：未使用 `node_modules` 本地打包或私有 registry 镜像

**关键文件与配置**
- `package.json`：声明所有运行时与开发依赖，包含 pnpm 专属配置
- `pnpm-lock.yaml`：完整依赖树锁定，含 integrity hash
- `.env.example` / `.env.local`：环境变量管理（非依赖但影响运行时行为）

**架构与约定**
- 依赖分类清晰：运行时依赖（如 next、react、drizzle-orm、playwright、ffmpeg-static）与开发依赖（typescript、vitest、eslint、tailwindcss）严格分离
- 使用 `overrides` 强制统一子依赖版本：将 typescript-eslint 系列和 better-sqlite3 固定到特定版本，避免依赖树分裂
- `onlyBuiltDependencies` 白名单机制：仅允许 `better-sqlite3`、`esbuild`、`ffmpeg-static` 三个需要原生编译的包执行安装后脚本，提升安全性与构建速度
- 语义化版本策略：主要依赖使用 `^` 前缀允许小版本更新（如 `next: ">=16.2.0"`、`react: ">=19.2"`），由 lockfile 锁定实际版本
- 内部私有包：`@earendil-works/pi-agent-core` 与 `@earendil-works/pi-ai` 为内部开发的 AI Agent 工具包，通过 npm registry 引入

**约束与规范**
- 所有新增依赖必须同时出现在 `package.json` 与 `pnpm-lock.yaml` 中（pnpm 自动同步）
- 禁止在代码中直接 `require('node_modules/xxx')`，必须通过 npm 包名引用
- 原生模块需提前列入 `onlyBuiltDependencies`，否则安装会被拒绝
- 依赖升级需通过 `pnpm update` 并审查 lockfile 变更，确保 CI 构建一致性