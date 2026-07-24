---
kind: dependency_management
name: 基于 pnpm 的依赖管理与版本锁定策略
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-lock.yaml
    - docs/video-director/package.json
---

本项目采用 **pnpm** 作为包管理器，通过 `package.json` 声明依赖、`pnpm-lock.yaml` 锁定精确版本，形成完整的依赖管理体系。

### 使用的系统与工具
- **包管理器**: pnpm（指定版本 `pnpm@9.15.0`，通过 `packageManager` 字段强制）
- **锁文件**: `pnpm-lock.yaml`（lockfileVersion 9.0），提交至版本控制确保构建可重现
- **依赖声明**: 根 `package.json` 中按 `dependencies` 与 `devDependencies` 分类管理
- **构建优化**: 通过 `pnpm.onlyBuiltDependencies` 仅对 `better-sqlite3`、`esbuild`、`ffmpeg-static` 执行原生编译

### 关键文件与配置
- `package.json`: 主入口，声明所有依赖及 pnpm 配置
- `pnpm-lock.yaml`: 完整依赖树锁定，包含每个包的精确版本与 integrity 校验
- `docs/video-director/package.json`: video-director skill 子模块的独立脚本定义（无第三方依赖，纯 Node 脚本）

### 架构与约定
- **版本范围策略**: 生产依赖普遍使用 `^` 语义化版本（如 `next: ">=16.2.0"`、`react: ">=19.2"`），允许小版本升级；关键依赖在 lockfile 中固定到具体版本
- **依赖覆盖（overrides）**：通过 `pnpm.overrides` 强制统一以下依赖版本：
  - `typescript-eslint`、`@typescript-eslint/eslint-plugin`、`@typescript-eslint/parser` → `8.61.1`
  - `better-sqlite3` → `12.1.0`（覆盖 `package.json` 中的 `^13.0.1`，解决兼容性问题）
- **私有/内部依赖**: 使用 `@earendil-works/pi-agent-core` 和 `@earendil-works/pi-ai`（版本 `^0.81.1`），表明存在企业级私有 npm 仓库
- **Node.js 运行时**: 依赖广泛要求 Node >= 20（AWS SDK 等），与 Next.js 16+ 生态对齐

### 约束与规范
- **必须使用 pnpm**: `packageManager` 字段锁定 pnpm 版本，CI/本地环境需匹配
- **锁文件必须提交**: `pnpm-lock.yaml` 纳入版本控制，禁止生成后忽略
- **原生依赖最小化**: 仅允许 `better-sqlite3`、`esbuild`、`ffmpeg-static` 执行 `node-gyp` 构建，加速安装并减少平台差异
- **ESLint/TypeScript 版本统一**: 通过 overrides 强制所有子项目使用相同 ESLint 插件版本，避免多版本冲突
- **video-director skill 独立**: 该子模块不声明第三方依赖，仅通过脚本命令管理自身生命周期，保持轻量