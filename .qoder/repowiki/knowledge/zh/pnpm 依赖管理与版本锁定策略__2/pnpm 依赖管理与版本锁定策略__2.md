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

本仓库使用 pnpm 作为包管理器，通过 `package.json` 声明依赖、`pnpm-lock.yaml` 锁定精确版本，并配合 `overrides` 与 `onlyBuiltDependencies` 实现依赖治理。

**系统与工具**
- 包管理器：pnpm 9.15.0（由 `packageManager: "pnpm@9.15.0"` 强制）
- 锁文件：`pnpm-lock.yaml`（lockfileVersion 9.0），记录所有依赖的精确版本与完整性校验哈希
- 构建脚本：Next.js + TypeScript + Vitest + ESLint + Drizzle Kit

**关键文件与位置**
- 根 `package.json`：声明生产/开发依赖、pnpm 配置（`overrides`、`onlyBuiltDependencies`）
- `pnpm-lock.yaml`：全量依赖解析结果，包含 `importers`、`packages`、`overrides` 等段
- `docs/video-director/package.json`：独立 skill 子项目，无 pnpm 配置，仅用 Node 脚本运行

**架构与约定**
- 单仓单应用：无 workspace 配置，所有依赖集中在根 `package.json`
- 依赖分类清晰：`dependencies` 为运行时依赖（Next、React、OpenAI、Jimp、ffmpeg-static 等），`devDependencies` 为构建/测试工具链
- 严格版本锁定：所有依赖在 lock 文件中都有精确 version 与 integrity 字段，确保可重复安装
- 原生模块白名单：通过 `onlyBuiltDependencies` 限定 `better-sqlite3`、`esbuild`、`ffmpeg-static` 三个需要编译的原生包，减少不必要的 rebuild
- 依赖覆盖策略：通过 `pnpm.overrides` 强制统一 `typescript-eslint` 生态版本为 `8.61.1`，并将 `better-sqlite3` 降级到 `12.1.0`（与 `drizzle-orm` 兼容）
- 语义化版本范围：生产依赖普遍使用 `^` 或 `>=` 前缀（如 `next >=16.2.0`、`react >=19.2`），允许小版本升级但锁定大版本

**约束与规则**
- 必须使用 pnpm 安装依赖（`packageManager` 字段由 pnpm 强制执行）
- 新增原生依赖需加入 `onlyBuiltDependencies` 列表，避免每次安装都触发编译
- 依赖冲突通过 `overrides` 集中解决，而非在各子包中单独指定
- 子项目（如 `docs/video-director`）不共享依赖，各自独立管理
- 未使用私有 npm 注册表或 vendoring，所有包来自 npm registry