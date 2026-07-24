---
kind: dependency_management
name: pnpm 单仓依赖管理与版本锁定
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-lock.yaml
    - docs/video-director/package.json
---

## 系统概览

本项目采用 **pnpm** 作为唯一的包管理器，使用根级 `package.json` + `pnpm-lock.yaml` 的“单仓（monorepo）”模式管理所有依赖。未引入子 workspace，`docs/video-director/package.json` 仅用于脚本与测试，不纳入主应用依赖图。

## 关键文件与配置

- `package.json`：声明运行时与开发时依赖、scripts、`packageManager` 字段以及 pnpm 专属配置。
- `pnpm-lock.yaml`：由 pnpm 生成的完整锁文件，记录每个包的精确版本与 integrity，确保构建可复现。
- `pnpm overrides`：在 `package.json.pnpm.overrides` 中强制固定若干传递依赖的版本（见下文）。
- `pnpm.onlyBuiltDependencies`：显式列出需要原生编译的包，避免不必要的 native rebuild。

## 架构与约定

1. **包管理器锁定**
   - 通过 `packageManager: "pnpm@9.15.0"` 字段约束团队使用的 pnpm 大版本，配合 CI 环境保证一致性。
   - 提交 `pnpm-lock.yaml`，禁止手动编辑；新增/升级依赖后统一执行 `pnpm install` 生成新锁。

2. **版本策略**
   - 核心框架（next、react、react-dom、eslint-config-next）使用 `>=X.Y.Z` 宽松范围，便于跟随 Next.js/React 大版本演进。
   - 业务库（zod、drizzle-orm、gsap、lucide-react 等）使用 `^X.Y.Z` 语义化版本，允许补丁与小特性更新。
   - 对存在兼容问题的包（如 `better-sqlite3`）通过 `overrides` 直接钉死到已知稳定版本，规避上游破坏性变更。

3. **私有包与内部工具链**
   - 依赖 `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai` 两个内部包，来自同一组织 scope，表明项目可能通过私有 npm registry 或 GitHub Packages 分发。仓库中未发现 `.npmrc` / `.pnpmfile` 自定义注册表配置，默认走全局 pnpm 设置。

4. **构建期依赖隔离**
   - `onlyBuiltDependencies` 将 `better-sqlite3`、`esbuild`、`ffmpeg-static` 限定为仅安装这些包的原生模块，减少无关 native 重建时间。

5. **视频导演 Skill 子包**
   - `docs/video-director/package.json` 是独立 skill 包，不含运行时依赖，仅定义脚本命令供 skill 生命周期调用，不参与主应用依赖树。

## 开发者应遵循的规则

- **统一使用 pnpm**：不要改用 npm/yarn；本地可通过 Corepack 自动安装指定版本。
- **修改依赖后必须提交锁文件**：`pnpm add/remove/update` 之后将 `pnpm-lock.yaml` 一并提交。
- **谨慎使用 overrides**：仅在确有必要（兼容性修复、安全补丁）时才覆盖依赖版本，并在 PR 中说明原因。
- **新增原生依赖时同步更新 onlyBuiltDependencies**：避免 CI 上出现意外编译开销。
- **内部包升级需确认 registry 可用**：若切换 CI 环境，确保已配置好访问 `@earendil-works/*` 的认证信息。

## 参考文件

- `package.json`
- `pnpm-lock.yaml`
- `docs/video-director/package.json`
