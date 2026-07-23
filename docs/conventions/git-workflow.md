# Git 工作流规范（Git Workflow）

> 分支模型、提交规范与协作流程。

## 1. 分支模型

| 分支 | 角色 | 说明 |
|---|---|---|
| `main` | 生产 / 主分支 | 始终可发布；受保护，仅经 PR 合入 |
| `dev` | 开发 / 测试 | 集成与测试分支 |
| `feature/<分类>-<描述>` | 新功能 | 如 `feature/canvas-shot-node` |
| `fix/<描述>` | 缺陷修复 | 如 `fix/render-seek-drift` |
| `chore/<描述>` | 杂务 | 构建、依赖、脚手架等 |

## 2. 流程

```
feature/*  ──PR──▶  dev  ──(测试通过)──PR──▶  main
```

- 从 `dev`（或 `main`）切功能分支；完成后 PR 回 `dev`。
- `dev` 验证通过后，PR 合入 `main` 发布。
- 团队 GitHub 阶段：`main` / `dev` 启用分支保护，PR 需通过 CI 与至少一次审查，采用 Squash merge。

## 3. 提交规范（Conventional Commits）

格式：`type(scope): description`

- **type**：`feat` / `fix` / `chore` / `docs` / `refactor` / `test` / `perf` / `build` / `ci`。
- **scope**：用领域名（`canvas` / `director` / `render` / `ai` / `audio` / `lib`）。
- 示例：`feat(canvas): add shot node preview`、`fix(render): correct frame seek rounding`。

## 4. 当前阶段与迁移

- **当前**：使用**自建本地 git 仓库**开发 demo。
- **后续**：切换到**团队 GitHub 云端仓库**。迁移时：
  1. 新建云端仓库并设 `main` 为默认分支，创建 `dev`；
  2. 配置 `main` / `dev` 分支保护与 PR 审查、接入 CI；
  3. 关联远程并推送。

## 5. 禁止事项

- **禁止** force push 到 `main` / 受保护分支。
- **禁止**提交 `.env*`、Key 或任何凭据。
- **禁止** `--no-verify` 跳过 hooks。
- 未经明确授权**不推送远程**。
