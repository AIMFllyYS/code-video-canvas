---
kind: build_system
name: Next.js 单仓构建与脚本体系
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - next.config.ts
    - drizzle.config.ts
    - vitest.config.ts
    - tsconfig.json
    - scripts/README.md
    - scripts/setup/db-migrate.ts
---

本项目采用 Next.js App Router 作为统一构建入口，通过 pnpm 管理依赖、Vitest 运行测试、Drizzle Kit 管理数据库迁移，形成以 package.json scripts 为核心的轻量构建系统。

## 构建工具链
- 框架与运行时：Next.js（>=16.2），全栈模式（非静态导出），原生依赖 better-sqlite3、ffmpeg-static 通过 serverExternalPackages 在 Node 运行时解析，避免 Turbopack 重写路径。
- 包管理器：pnpm@9.15.0，使用 onlyBuiltDependencies 仅编译必要原生包，并通过 overrides 锁定 TypeScript ESLint 生态版本。
- 类型检查：TypeScript 5.7，noEmit + isolatedModules，Next 插件注入类型；路径别名 @/* → ./src/* 由 tsconfig 与 vitest alias 共同维护。
- 样式与 CSS：Tailwind CSS v4 + @tailwindcss/postcss，PostCSS 配置位于根目录。
- 测试：Vitest 4，环境为 node，匹配 src/**/*.test.ts，与 tsconfig paths 共享 @/ 别名。
- 数据库：Drizzle ORM + Drizzle Kit，schema 位于 src/lib/db/schema.ts，migrations 输出至 src/lib/db/migrations，SQLite dialect。

## 核心脚本命令
- pnpm dev：启动 Next 开发服务器
- pnpm build：生产构建（Next.js）
- pnpm start：启动生产服务
- pnpm lint：ESLint 扫描
- pnpm typecheck：tsc --noEmit 类型检查
- pnpm test / pnpm test:watch：Vitest 运行/监听
- pnpm db:generate：生成 Drizzle 迁移文件
- pnpm db:migrate：执行迁移（调用 scripts/setup/db-migrate.ts）

## 脚本组织规范
scripts/ 目录按职责分四类：setup（环境初始化、数据库迁移）、build（构建辅助、产物检查、bundle 分析，当前为空占位）、deploy（部署相关，README 中说明）、dev（开发辅助、mock 数据生成、调试脚本）、spikes（实验性探针脚本）。脚本命名约定：Shell 用 .sh，Node 脚本用 .mjs 或 .ts，文件名 kebab-case，需支持 --help 并在危险操作前提示确认。

## 构建产物与输出
- .next/：Next.js 构建缓存与产物（被 .gitignore 排除）
- output/：空目录占位（可能用于静态导出或自定义输出）
- .data/app.db*：本地 SQLite 数据库文件（WAL 模式，被 .gitignore 排除）
- tmp/：E2E 测试中间产物（Playwright 截图、渲染结果、日志）

## 设计决策
1. 全栈而非静态站点：显式声明 serverExternalPackages 确保原生二进制在运行时可用，放弃静态导出以保留 API Routes 能力。
2. 单仓聚合：主应用与 docs/video-director（独立 skill 项目）共存于同一仓库，但 tsconfig exclude 将后者排除出主工程类型检查。
3. 零 Makefile/Dockerfile：未引入外部构建编排器，所有流程通过 pnpm scripts 串联，保持最小化基础设施。
4. 迁移即代码：数据库 schema 变更通过 Drizzle Kit 生成 SQL 迁移，由 db:migrate 脚本驱动执行，不依赖外部迁移工具。

## 开发者约束
- 新增脚本必须遵循 scripts/README.md 的命名与注释规范。
- 涉及 @/* 路径的脚本应改用相对导入，避免脚本环境下别名解析失败。
- 原生依赖需加入 pnpm.onlyBuiltDependencies 列表，避免不必要的编译。
- 测试文件统一放在 src/** 下并以 .test.ts 结尾，由 Vitest 自动发现。