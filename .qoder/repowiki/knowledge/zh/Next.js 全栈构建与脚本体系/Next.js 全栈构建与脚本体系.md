---
kind: build_system
name: Next.js 全栈构建与脚本体系
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - next.config.ts
    - tsconfig.json
    - vitest.config.ts
    - drizzle.config.ts
    - scripts/README.md
    - scripts/deploy/README.md
    - scripts/dev/README.md
    - scripts/setup/db-migrate.ts
---

本项目采用 Next.js App Router 作为统一构建与运行框架，围绕 package.json scripts、pnpm 包管理器与少量辅助脚本组织构建流程，未引入 Makefile、Dockerfile 或 GitHub Actions 等外部 CI/CD 配置。

1. 构建系统与方法
- 构建工具：Next.js（next build / next dev / next start），通过 next.config.ts 显式声明 serverExternalPackages: ['better-sqlite3', 'ffmpeg-static']，确保原生依赖在运行时由 Node 解析而非被 Turbopack 重写为 /ROOT 占位路径。
- 包管理：pnpm@9.15.0，使用 pnpm-lock.yaml 锁定版本；通过 pnpm.overrides 强制 typescript-eslint 系列与 better-sqlite3 到指定版本，避免平台二进制冲突。
- TypeScript：tsconfig.json 开启 strict、noEmit、isolatedModules、moduleResolution=bundler，并注册 next 插件与 @/* 路径别名；Vitest 通过 vitest.config.ts 的 resolve.alias 复用同一别名。
- 数据库迁移：Drizzle Kit 负责 schema 生成与迁移，drizzle.config.ts 指向 ./src/lib/db/schema.ts，输出至 ./src/lib/db/migrations；应用层迁移入口为 scripts/setup/db-migrate.ts，通过 pnpm db:migrate 调用。
- 测试：Vitest（vitest run / vitest），环境为 node，匹配 src/**/*.test.ts。
- Lint：ESLint v9 + eslint-config-next，通过 pnpm lint 执行。

2. 关键文件与包
- 根级构建配置：package.json、next.config.ts、tsconfig.json、vitest.config.ts、drizzle.config.ts、eslint.config.mjs、postcss.config.mjs、.env.example。
- 脚本目录：scripts/README.md 定义脚本规范（Shell 用 .sh、Node 用 .mjs/.ts、kebab-case 命名、支持 --help、危险操作需确认）；scripts/deploy/README.md 说明 EdgeOne Pages 部署相关脚本用途；scripts/dev/README.md 说明开发辅助脚本用途；scripts/setup/db-migrate.ts 是数据库迁移的实际入口。

3. 架构与约定
- 单一入口：所有构建、开发、测试、迁移命令均通过 package.json scripts 暴露，外部工具（CI、IDE、pnpm）只需调用标准 npm/pnpm 命令。
- 原生依赖隔离：通过 serverExternalPackages 与 pnpm onlyBuiltDependencies 白名单（better-sqlite3、esbuild、ffmpeg-static）共同约束原生模块只在运行时加载，避免打包期失败。
- 路径别名一致性：tsconfig.json 与 vitest.config.ts 共享 @/* → ./src/* 映射，保证源码与测试对同一份代码进行类型检查与运行。
- 文档驱动脚本：scripts/ 下每个子目录附带 README，明确该组脚本的职责边界，形成“脚本即文档”的约定。

4. 约定与约束
- 脚本命名与风格：遵循 scripts/README.md 中约定的 kebab-case、注释说明、--help 支持、危险操作前确认。
- 原生依赖必须列入 pnpm.onlyBuiltDependencies 并在 next.config.ts 的 serverExternalPackages 中声明，否则构建或运行时可能因路径重写失败。
- 数据库迁移必须先执行 pnpm db:generate 再生成迁移文件，再执行 pnpm db:migrate 应用到本地 SQLite（drizzle.config.ts 已固定 dialect=sqlite）。
- 当前仓库未发现 Dockerfile、docker-compose、Makefile、GitHub Actions 或其他 CI/CD 配置文件；部署目标为 EdgeOne Pages（见 scripts/deploy/README.md），但具体部署脚本尚未在仓库中落地。