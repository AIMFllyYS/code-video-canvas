---
kind: dependency_management
name: pnpm 依赖管理与版本锁定策略
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-lock.yaml
    - .gitignore
    - docs/video-director/package.json
---

## 系统概述

本项目采用 **pnpm** 作为统一的包管理器，通过 `package.json` 声明依赖、`pnpm-lock.yaml` 锁定精确版本，配合 `overrides` 和 `onlyBuiltDependencies` 实现依赖冲突解决与原生模块构建优化。项目为单仓库结构（非 monorepo），但文档中规划了未来向 pnpm workspace 迁移的路径。

## 关键文件与配置

- **根级 `package.json`**：声明所有运行时与开发依赖，包含 pnpm 专属配置段
- **`pnpm-lock.yaml`**：锁文件，记录每个包的精确版本与完整性校验哈希
- **`.gitignore`**：忽略 `yarn.lock`、`bun.lockb` 等其它包管理器的锁文件，强制使用 pnpm
- **`docs/video-director/package.json`**：独立的视频导演技能包，无依赖声明（纯脚本工具）

## 架构与约定

### 依赖声明规范
- 运行时依赖使用 `^` 语义化版本范围（如 `"next": ">=16.2.0"`、`"react": ">=19.2"`），允许小版本升级
- 开发依赖同样使用 `^` 前缀，保持灵活性
- 核心框架（Next.js、React）使用宽松范围以支持渐进升级

### pnpm 专属策略
- **`packageManager` 字段**：锁定团队使用的 pnpm 版本为 `9.15.0`，确保环境一致性
- **`onlyBuiltDependencies`**：仅允许 `better-sqlite3`、`esbuild`、`ffmpeg-static` 三个包执行原生编译，减少构建时间与安全攻击面
- **`overrides`**：全局覆盖特定依赖版本，包括：
  - TypeScript ESLint 相关包统一为 `8.61.1`，避免版本漂移
  - `better-sqlite3` 强制降级至 `12.1.0`，解决兼容性问题

### 锁文件策略
- 提交 `pnpm-lock.yaml` 到版本控制，保证构建可重现性
- 使用 `autoInstallPeers: true` 自动安装 peer dependencies
- 不排除链接文件（`excludeLinksFromLockfile: false`），便于本地开发调试

### 多包管理规划
文档中多次提及 `pnpm-workspace.yaml` 的规划（issue-n4、architecture-spec.md），表明当前虽为单包结构，但已预留向多包 monorepo 演进的架构设计，包括 `packages/` 目录划分与 workspace 配置。

## 约束与规则

1. **必须使用 pnpm**：`.gitignore` 显式忽略 yarn.lock 和 bun.lockb，禁止混用其他包管理器
2. **锁文件必须提交**：`pnpm-lock.yaml` 纳入版本控制，禁止手动修改
3. **原生模块白名单**：仅 `onlyBuiltDependencies` 中列出的包可执行 native build
4. **ESLint 版本统一**：通过 overrides 强制 typescript-eslint 生态版本一致
5. **SQLite 版本固定**：better-sqlite3 被 override 到 12.1.0，不得自行升级

## 依赖更新流程

- 使用 `pnpm update` 或 `pnpm add <package>@<version>` 更新依赖
- 审查 `pnpm-lock.yaml` 变更，确认无意外版本提升
- 运行测试套件验证兼容性
- 提交锁文件变更以确保团队一致性