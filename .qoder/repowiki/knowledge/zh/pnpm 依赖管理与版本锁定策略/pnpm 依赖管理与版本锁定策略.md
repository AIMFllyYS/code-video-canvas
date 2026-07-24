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

本仓库采用 pnpm 作为包管理器，通过 package.json 声明依赖、pnpm-lock.yaml 锁定精确版本，形成可复现的构建产物。

## 1. 使用的系统与工具
- 包管理器：pnpm（packageManager: "pnpm@9.15.0"）
- 锁文件：pnpm-lock.yaml（lockfileVersion 9.0），提交到版本控制，保证 CI/CD 与本地安装一致
- 私有包源：通过 @earendil-works/pi-agent-core、@earendil-works/pi-ai 两个 scoped 包可见，推测由团队私有 npm registry 提供；未发现 .npmrc / .pnpmrc，默认使用公共 npm 或全局配置
- 无 vendor 目录：未使用 node_modules 外的 vendoring 策略，依赖全部走 pnpm 的硬链接 + 内容寻址存储

## 2. 关键文件
- package.json — 依赖声明、脚本、pnpm overrides
- pnpm-lock.yaml — 完整依赖树与 integrity 校验
- drizzle.config.ts — 数据库迁移 CLI 依赖 drizzle-kit
- next.config.ts / tsconfig.json — 运行时对 Next.js、TypeScript 版本的约束

## 3. 架构与约定
- 依赖范围划分清晰：dependencies 为运行时库（Next.js、React、Zod、Drizzle ORM、ffmpeg-static、GSAP、Playwright 等），devDependencies 为开发期工具（ESLint、Vitest、tsx、drizzle-kit、Tailwind v4、@types/*）
- 版本策略：框架层使用宽松范围（>=16.2.0、>=19.2），便于跟随上游小版本更新；核心第三方库使用 ^x.y.z 语义化版本，允许补丁级自动升级
- 通过 pnpm.overrides 强制统一冲突子依赖：typescript-eslint 生态固定为 8.61.1（避免 ESLint 9 下多版本共存）、better-sqlite3 从 ^13.0.1 降级覆盖到 12.1.0（解决原生编译问题）
- 仅构建依赖白名单：onlyBuiltDependencies 仅包含 better-sqlite3、esbuild、ffmpeg-static，减少无关原生模块在 CI 中的编译开销
- Peer Dependencies 管理：React/Next.js/Tailwind 等通过 peer 关系声明，由顶层 overrides 和 pnpm 的 peer 解析策略保证一致性

## 4. 开发者应遵循的规则
1. 新增依赖时明确归属：运行时依赖放入 dependencies，仅开发期使用的放入 devDependencies，不要混用
2. 优先使用 ^ 语义化版本，仅在存在已知兼容性问题时使用精确版本并通过 overrides 集中管理
3. 遇到子依赖冲突时，使用 pnpm.overrides 而非直接修改 node_modules，并在 PR 中说明原因
4. 涉及原生模块的依赖（如 better-sqlite3、esbuild）需评估是否加入 onlyBuiltDependencies 以加速安装
5. 引入私有包（@earendil-works/*）前确认 CI 环境已配置对应 registry 认证
6. 变更 package.json 后必须重新生成并提交 pnpm-lock.yaml，禁止只改 manifest 不更新锁文件
7. 不要手动编辑 pnpm-lock.yaml，应通过 pnpm up、pnpm add --save-exact 等命令驱动变更
8. 保持 Node 引擎版本与依赖要求一致（当前依赖普遍要求 Node >= 16/20），CI 应与本地 packageManager 指定的 pnpm 版本对齐