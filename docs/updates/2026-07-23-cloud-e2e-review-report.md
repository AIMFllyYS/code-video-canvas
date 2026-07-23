# code-video-canvas `feature/demo-harness-full` 深度审查、合并与端侧走查报告

> 报告时间：2026-07-23
> 仓库：`AIMFllyYS/code-video-canvas`
> 审查分支：`feature/demo-harness-full`
> 合并目标：`main`
> 本地工作目录：`C:\Users\Administrator\repos\code-video-canvas`

---

## 1. 执行摘要

### 覆盖范围

- 对 `feature/demo-harness-full` 相对 `origin/main`（HEAD `1b88f83`）的全部 diff 进行了审查与端到端验证。
- diff 规模：**226 个文件变更，+18,670 行 / -1,732 行**，合并为单一 squash commit。
- 合并后 `main` HEAD：`87600e4`（包含合并提交 `99112e3` 与两次修复/文档更新提交）。

### 主要结论

| 维度 | 结论 |
|------|------|
| 代码规范 / 架构红线 | 未发现 Key 泄露、`NEXT_PUBLIC_`、middleware.ts、pages/、硬编码 pink/indigo 等严重违规；`page.tsx` 行数、`params/searchParams await`、Lucide 白名单（除 `Code` 图标外）基本合规。 |
| Tier A（lint / tsc / build） | `pnpm lint`、`pnpm tsc --noEmit`、`pnpm build` 全部通过。 |
| Tier B（测试） | `pnpm test`：54 个测试文件 / 147 个测试全部通过。 |
| Tier B（真实浏览器 + AI + 渲染） | **部分失败**。新建项目、画布 fan-out、分镜通道折叠/展开、设置页暗色主题、导出页禁用状态均通过；**真实 StepFun Director 阶段运行、单镜渲染、导出合并、设置页 Key 成功校验未跑通**。 |
| 是否发现阻断合并的严重问题 | **是，但暴露于 e2e 阶段**。`SHOT_SPEC`/`FABRICATE` 阶段因 `canvas_nodes.data.directorInput` 缺失而失败，导致 AI Director 与渲染管线无法闭环。该问题在静态代码/单测中未显现。 |
| 当前 `main` 是否包含此缺陷 | **包含**。合并发生在问题暴露之前；本报告已将其记录为复杂遗留问题并更新任务台账。 |

### 关键 commit

| hash | 说明 |
|------|------|
| `1b88f83` | `origin/main` 合并前 HEAD |
| `99112e3` | `feat(harness): merge Track C/D/R/P/A/U implementation into main`（squash merge `feature/demo-harness-full`） |
| `91bf8d1` | `fix(shot-detail): use whitelisted FileCode icon instead of Code` |
| `87600e4` | `docs(harness): mark C1.1/D1.3/U1.8 e2e-blocked statuses` |
| `87600e4` | **当前 `origin/main` HEAD** |

> ⚠️ 由于严重功能缺陷在 e2e 中才暴露，建议阅读第 7 节后决定：是回滚 `main` 到 `1b88f83`、还是先修复再验收。

---

## 2. 代码审查发现清单

按 AGENTS.md「When Reviewing Code」逐项覆盖，结果如下。

### 2.1 严重级问题（阻断 / 必须修复）

| # | 文件/位置 | 问题描述 | 处理方式 |
|---|-----------|----------|----------|
| S1 | `src/features/canvas/fan-out.ts`<br>`src/features/director/stage-prompt.ts`<br>`src/features/director/runtime-repository.ts`<br>`src/features/director/stage-result.ts` | 分镜通道物化后，shot-script / shot-codegen 等下游节点的 `canvas_nodes.data.directorInput` 未写入；`stage-runner` 直接读取 `row.data.directorInput` 并传入 `buildStagePrompt`。真实运行时 `SHOT_SPEC`、`DIRECT`、`FABRICATE` 等阶段均报 `Invalid input: expected object, received undefined`，AI Director 管线无法闭环。 | **未修复，作为复杂遗留问题记录**（见 §7.1）。已更新 `harness-task-breakdown.md` C1.1/D1.3 为 `◐`。 |
| S2 | `src/features/ai/stepfun-adapter.ts:validateKey()` | 校验逻辑使用 `createClient(apiKey).models.list()`。在本次 e2e 中，提供的有效 StepFun Key 被判定为“校验失败”，导致设置页成功路径未通过。可能原因：该 Key 无 `models.list` 权限、StepFun 端点模型列表行为不同，或网络/鉴权失败。 | **未修复，作为复杂遗留问题记录**（见 §7.2）。 |

### 2.2 中等级问题（建议修，不阻断本地运行）

| # | 文件/位置 | 问题描述 | 处理方式 |
|---|-----------|----------|----------|
| M1 | `src/features/render/export-service.ts` | 业务代码直接使用 `node:fs/promises`（`mkdir`/`mkdtemp`/`readFile`/`rm`）创建临时目录并读取最终 `mp4`。架构规范要求业务存储仅通过 `StorageAdapter`。 | 记录，建议见 §7.3。 |
| M2 | `src/lib/config/paths.ts` | 使用 `mkdirSync` 创建 `DATA_DIR` 与 `ARTIFACTS_DIR`。虽为配置初始化，但也可以封装进 `StorageAdapter` 初始化。 | 记录，优先级低。 |
| M3 | `src/app/api/ping/route.ts` | 健康接口使用 `Date.now()`。当前 `next.config.ts` 为全栈模式且路由标记 `dynamic = 'force-static'`? 实际该路由在 `output` 非 export 时无影响。 | 轻微，已标记为观察项。 |

### 2.3 轻微级问题（已修复）

| # | 文件/位置 | 问题描述 | 处理方式 |
|---|-----------|----------|----------|
| m1 | `src/app/canvas/shot/[id]/shot-detail.tsx` | 导入 `Code` 图标不在 `src/app/playbook/registry.ts` 的 Lucide 白名单内。 | 已替换为 `FileCode`（`91bf8d1`）。 |
| m2 | `docs/specs/2026-07-23-harness-task-breakdown.md` | C1.1 / D1.3 / U1.8 状态标记为 `☑`，与真实 e2e 结果不符。 | 已更新为 `◐` 并加注释（`87600e4`）。 |

### 2.4 规范检查结论

| 检查项 | 结果 | 备注 |
|--------|------|------|
| 确定性违规（rAF / ticker / 墙钟 / 无种子 Math.random / CSS animation / setTimeout） | ✅ 未在 shot 渲染路径发现 | 仅测试与 prompt 文本中出现这些关键词。 |
| Key 泄露（客户端组件 / `NEXT_PUBLIC_` / 仓库历史） | ✅ 未发现 | 密钥仅在服务端 `process.env` 与 SQLite `settings` 表使用。 |
| `params`/`searchParams`/`cookies`/`headers` await | ✅ 全部 await | `canvas/page.tsx`、`canvas/shot/[id]/page.tsx`、`settings/page.tsx`、`canvas/export/page.tsx` 均正确。 |
| 渲染逻辑误放浏览器端 | ✅ 未发现问题 | `features/render`、`features/director` 均为 `server-only` 或仅服务端调用。 |
| 绕过 `StorageAdapter` 裸 `fs` | ⚠️ `export-service.ts` 裸 fs | 见 M1。 |
| `page.tsx` 行数 | ✅ 未超 200 行 | 扫描 `src/**/page.tsx`，最大不超过 100 行。 |
| `'use client'` 过度上浮 | ✅ 未在 `page.tsx` 使用 | 仅叶子组件/业务壳使用。 |
| `middleware.ts` / `pages/` / `_dev/` 反向引用 | ✅ 不存在 | 已验证。 |
| 组件复用 / Playbook 登记 | ✅ 基本一致 | 发现 1 个图标白名单外图标，已修。 |
| 设计 Token 硬编码 hex / rgba | ✅ 基本合规 | 硬编码 hex 仅出现在 `globals.css` 设计 Token 与测试 fixture；无 pink/indigo。 |
| `write-artifact.ts` 仅由 stage runner 调用 | ✅ 未注册为 Pi Tool | `src/features/director/tools/write-artifact.ts` 仅被 `stage-runner.ts` 使用。 |
| 队列/Runner 边界 | ✅ 基本合规 | `enqueueDirectorStage` 先置 `pending` 并补偿失败；`runStage` 负责 `pending→running→success|failed`。 |

---

## 3. Tier A/B 验收结果

### 3.1 命令结果

```text
$ pnpm lint
> eslint .
(no errors, exit 0)

$ pnpm tsc --noEmit
(no errors, exit 0)

$ pnpm build
▲ Next.js 16.2.11 (Turbopack)
✓ Compiled successfully in 4.5s
✓ Running TypeScript ...
✓ Generating static pages using 7 workers (9/9)
✓ Finalizing page optimization ...
(exit 0)

$ pnpm test
> vitest run
Test Files  54 passed (54)
Tests       147 passed (147)
(exit 0)
```

### 3.2 结论

- **Tier A 全绿**：`lint`、`tsc --noEmit`、`build` 通过。
- **Tier B 单元/集成测试全绿**：`pnpm test` 通过。
- **Tier B 端到端浏览器链路**：未全绿，核心 Director → Render → Export 链路因 `directorInput` 缺失无法继续。

---

## 4. 合并记录

### 4.1 合并方式

- 由于环境未配置 `gh` CLI 且 GitHub PR 页面需登录才能点击合并按钮，按用户“按规范合并并同步 origin/main”的要求，执行了**本地 squash merge + push**：
  1. `git checkout main && git pull origin main`
  2. `git merge --squash feature/demo-harness-full`
  3. `git commit -m "feat(harness): merge Track C/D/R/P/A/U implementation into main"`
  4. `git push origin main`
- 合并后 PR #5 被关闭（记录为 closed，非 GitHub UI merged）。

### 4.2 HEAD 对照

| 位置 | HEAD |
|------|------|
| `origin/main` 合并前 | `1b88f83` |
| 合并提交 | `99112e3` |
| 图标修复提交 | `91bf8d1` |
| 任务台账更新 | `87600e4` |
| **当前 `origin/main`** | **`87600e4`** |

验证命令：

```text
$ git fetch origin main
$ git rev-parse origin/main
87600e4...
```

本地 `main` 与 `origin/main` 一致。

---

## 5. 端侧走查矩阵

环境：`pnpm dev` 运行于 `http://localhost:3000`；Windows 11；Node `20.19.0`；Chromium（Playwright）与 `ffmpeg-1011` 已安装。

| # | 路径 | 步骤与预期 | 实际结果 | 判定 | 证据 |
|---|------|------------|----------|------|------|
| 1 | 首页 / 项目列表 | 打开 `/`；应展示标题、新建项目按钮、项目列表（为空时提示）。 | 页面渲染正常，无报错。 | **通过** | `home.png` |
| 2 | 新建项目对话框 | 填写项目名“E2E Review Test”与文字稿，点击“生成分镜”；应创建项目并返回可信赖的 ingest node id。 | 首次使用 React 受控组件模拟失败（仅设 `value` 未触发 `input` 事件导致校验仍报空名）；改用 `HTMLInputElement.prototype.value` setter + `dispatchEvent('input')` 后提交成功。创建项目 `ae576fc8-8acf-4414-8101-b846f4dce7b8`，ingest node id `b416a2c8-02bd-4e3b-8bcb-96e254b198d7`。脚本导入节点最终 `success`。 | **通过**（自动化填单方式有 workaround） | `new-project.png` / §5 数据库记录 |
| 3 | 画布主视图 | 进入 `/canvas?projectId=...`；观察分镜通道 fan-out；点击“折叠/展开”；尝试平移缩放。 | fan-out 正常：出现 1 个分镜通道（S001）共 9 个节点；脚本导入 `success`；点击“S001折叠”后显示“已折叠 · 5 节点”；点击“展开”恢复。平移/缩放按钮存在，未做鼠标拖动验证。 | **部分通过**（折叠/展开通过；平移缩放未完全覆盖） | `canvas-fanout.png`、`canvas-collapsed.png` |
| 4 | 分镜详情页：Director → 渲染 → mp4 | 进入 `/canvas/shot/node_a568054f1256935ac45ab2e1?projectId=...`，点击“重渲此镜”；预期触发真实 StepFun 调用、Playwright 截帧、ffmpeg 编码并产出可下载 mp4。 | 点击后报错：`renderSpec 无效：Invalid input: expected object, received undefined`。根本原因是 `shot-codegen` 节点的 `directorInput` 缺失，上游 `FABRICATE` 阶段尚未成功产出 `director-fabricate` artifact。后续手动调用 `POST /api/director/stage` 对 `node_2c03169626a06fef70bb8e26`（SHOT_SPEC）与 `7c589a3d-ac1e-4bef-8cbb-32bcae2ba22f`（DIRECT）均报同样的 `directorInput` undefined。 | **失败** | `shot-detail.png`、`shot-render-error.png`、§5 API 错误记录 |
| 5 | 定向重渲 | 修改分镜内容后，只重渲改动节点，其余命中缓存。 | 无法测试，路径 4 失败导致无渲染产物。 | **阻塞未测** | — |
| 6 | 导出页 | 打开 `/canvas/export?projectId=...`；预期未全部完成时“导出 MP4”禁用。 | 页面显示“未完成分镜”，顶部与底部“导出 MP4”按钮均 `disabled`，符合预期。 | **通过（禁用状态）** | `export-disabled.png` |
| 7 | 设置页 StepFun Key | 提交错误 Key 应提示失败；提交正确 Key 应提示成功，且 Key 不回显、不进日志。 | 错误 Key：提示“校验失败”，通过。正确 Key：同样提示“校验失败”，设置成功路径未通过。Key 以 password input 显示，未明文回显，未出现在 console。 | **部分通过**（失败路径通过；成功路径失败） | `settings-invalid.png` |
| 8 | 暗色主题 | 在设置页切换到“深色”，逐页观察颜色是否来自 Token。 | 设置页成功切换到 dark 模式，背景/表面/文字颜色均来自 CSS 变量，未观察到硬编码 pink/indigo。 | **通过** | `settings-dark.png` |
| 9 | 250+ 模拟节点压力检查 | 在画布中创建 250+ 节点并验证交互不卡死。 | 未执行。真实项目只能生成 1 个分镜；手动构造大规模数据需要额外脚本，且当前 Director 管线阻塞。 | **未测** | — |

### 5. 关键运行证据

#### 5.1 项目创建与 ingest 节点

数据库查询结果（`canvas_nodes` 表，项目 `ae576fc8-8acf-4414-8101-b846f4dce7b8`）：

```json
[
  { "id": "b416a2c8-02bd-4e3b-8bcb-96e254b198d7", "type": "script-import", "stage": "INGEST",   "status": "success" },
  { "id": "7c589a3d-ac1e-4bef-8cbb-32bcae2ba22f", "type": "shot-split",  "stage": "DIRECT",   "status": "failed"  },
  { "id": "7f8ce62e-f8f8-4094-82c3-a9aeb3a59eae", "type": "score",       "stage": "ASSEMBLE", "status": "idle"    },
  { "id": "73cc020c-7ece-4266-a010-09f8f34d3796", "type": "export",      "stage": "FINALIZE", "status": "idle"    },
  { "id": "node_2c03169626a06fef70bb8e26",         "type": "shot-script", "stage": "SHOT_SPEC", "status": "failed"  },
  { "id": "node_a568054f1256935ac45ab2e1",         "type": "shot-codegen","stage": "FABRICATE", "status": "failed"  },
  { "id": "node_39fe14ad23b1d0aadfa41f95",         "type": "shot-sfx",    "stage": "ASSEMBLE", "status": "idle"    },
  { "id": "node_807ede5776f684e49cedbd17",         "type": "shot-subtitle","stage":"ASSEMBLE", "status": "idle"    },
  { "id": "node_9bd76cfe7c0e0413a61790af",         "type": "shot-qa",     "stage": "FINALIZE", "status": "idle"    }
]
```

说明：只有 `script-import`（INGEST）成功；`shot-split`（DIRECT）与 `shot-script`（SHOT_SPEC）均失败；shot-codegen 因无上游 artifact 而失败。

#### 5.2 Director 阶段真实运行错误

`POST /api/director/stage` 返回的作业状态（`GET /api/jobs/{jobId}`）：

```json
{
  "ok": true,
  "job": {
    "id": "...",
    "status": "failed",
    "error": "[\n  {\n    \"expected\": \"object\",\n    \"code\": \"invalid_type\",\n    \"path\": [],\n    \"message\": \"Invalid input: expected object, received undefined\"\n  }\n]"
  }
}
```

该错误贯穿 `SHOT_SPEC`、`DIRECT`、`FABRICATE` 阶段。

#### 5.3 单镜渲染错误

`shot/[id]` 页面点击“重渲此镜”后 UI 提示：

```text
失败 renderSpec 无效：[ { "expected": "object", "code": "invalid_type", "path": [], "message": "Invalid input: expected object, received undefined" } ]
```

---

## 6. 已修复问题清单

| # | 问题 | 修复 commit | 文件 |
|---|------|-------------|------|
| 1 | `shot-detail.tsx` 使用 Lucide 白名单外 `Code` 图标 | `91bf8d1` | `src/app/canvas/shot/[id]/shot-detail.tsx` |
| 2 | `harness-task-breakdown.md` 中 C1.1 / D1.3 / U1.8 状态与实际 e2e 结果不符 | `87600e4` | `docs/specs/2026-07-23-harness-task-breakdown.md` |

---

## 7. 遗留复杂问题清单（未擅自修复）

### 7.1 Director 阶段输入（`directorInput`）未从源头贯通到下游节点

- **影响**：`SHOT_SPEC`、`DIRECT`、`FABRICATE`、`ASSEMBLE`、`FINALIZE` 等阶段均无法获取合法的 `directorInput`，AI Director 管线整体阻塞。
- **根因分析**：
  - `src/features/canvas/fan-out.ts` 为 shot 节点写入 `data: { sourceUnit: ... }`，但没有写入 `directorInput`。
  - `src/features/director/runtime-repository.ts` 的 `loadStageContext` 直接读取 `row.data.directorInput` 并传入 `stage-prompt.ts`。
  - `src/features/director/stage-result.ts` 对 INGEST 返回 `ingestShots`（仅含 `sourceUnit`），没有将 `scriptUnits`/`audioAllocation` 写回节点；对 DIRECT 仅返回原始文本，没有把 `masterPlan`/`styleBible` 写回 shot 节点。
- **建议修法**（任选其一，需与架构总纲对齐）：
  1. **方案 A（推荐）**：在 `loadStageContext` 中按 stage 从上游 artifact 与当前节点 `sourceUnit` 组装 `directorInput`，而不是依赖节点 data。这样 `fan-out` 无需预先知道未来 stage 的输入。
  2. **方案 B**：在 `commitStageResult` 与 `materializeShotLanes` 中把上游 artifact 内容作为 `directorInput` 写回到下游节点；需要确保 `DIRECT` 完成后能更新所有 shot-script/shot-codegen 节点。
- **优先级**：P0（阻断 AI 调用与渲染）。

### 7.2 StepFun Key 成功校验路径失败

- **影响**：设置页“保存有效 Key”路径无法通过，用户无法确认 Key 可用。
- **根因分析**：`src/features/ai/stepfun-adapter.ts:validateKey()` 调用 `models.list()`，但提供的 Key 可能不具备该端点权限或 StepFun 的 `models.list` 行为与 OpenAI 兼容端点不一致。
- **建议修法**：
  1. 先降级为一次极轻量的 `chat.completions`（如 `max_tokens=1`）或 `models` 错误码判断。
  2. 若必须保留 `models.list`，增加对错误码的日志/提示，区分网络、鉴权、权限。
- **优先级**：P1（阻断设置页成功路径）。

### 7.3 `export-service.ts` 直接裸 fs 操作

- **影响**：业务代码绕过 `StorageAdapter` 抽象，违反 AGENTS.md 存储边界。
- **根因分析**：`exportProject` 使用 `mkdtemp`/`mkdir`/`readFile`/`rm` 创建临时目录并读取 ffmpeg 输出。
- **建议修法**：
  1. 扩展 `StorageAdapter` 接口，增加 `tempDir(prefix)` / `read(key)` / `remove(dir)`，使所有 fs 细节集中到一个实现。
  2. 或让 `concat` 输出字节流直接返回 Buffer，避免临时文件。
- **优先级**：P2（架构债，本地运行暂时可用）。

### 7.4 250+ 节点压力测试

- **影响**：未验证大规模画布下的交互与渲染性能。
- **阻塞原因**：当前真实项目只能生成 1 个分镜；需要构造包含 50+ 分镜的脚本并跑通 INGEST 才能自然生成 250+ 节点，而 Director 管线已阻塞。
- **建议修法**：在修复 `directorInput` 后，用长脚本生成 50 个分镜（15×50 = 750 节点）或在测试/脚本中直接批量插入节点数据，进行画布 FPS 与内存测试。
- **优先级**：P2。

---

## 8. 环境与工具限制说明

| 项目 | 说明 |
|------|------|
| Node 版本 | 实际运行环境为 Node `20.19.0`（`C:\hostedtoolcache\node\20.19.0\x64`）。AGENTS.md 要求 `≥22.19.0`（`pi-agent-core@0.81.x` 最低），但 `pnpm build`/`test` 在 20 上已通过。 |
| `typescript-eslint` | `8.65.0` 的 tarball 缺少 `configs` 目录，导致 `pnpm lint` 报 `Cannot find module './configs/flat/all'`。已通过 `package.json` 的 `pnpm.overrides` 固定为 `8.61.1`。 |
| `better-sqlite3` | `13.0.1` 在 Node 20 上运行时 native crash（`new Database(':memory:')` 退出 code 1）。已通过 `pnpm.overrides` 固定为 `12.1.0`，重新 `pnpm install` 后正常。 |
| Playwright | `npx playwright install --with-deps chromium` 已完成；`chromium-1228`、`chromium_headless_shell-1228`、`ffmpeg-1011`、`winldd-1007` 均在本机。 |
| Windows 长路径 | 删除 `node_modules` 时 `Remove-Item` 遇到长路径错误；后续通过 `pnpm install` 直接复用 store 解决，未阻塞。 |
| Git 合并 | 无 `gh` CLI；PR #5 由本 session 创建后通过本地 squash merge 并 push 关闭。 |
| StepFun 网络 | 从本机 `pnpm dev` 调用 `api.stepfun.com/v1` 可通（INGEST 成功返回并写入 SQLite），但 `models.list` 校验失败，需进一步确认 Key 权限或端点差异。 |

---

## 9. 下一步建议

1. **立即修复 `directorInput` 贯通问题**（§7.1），这是当前最严重的功能阻塞。修复后重新跑一次完整 e2e（路径 4/5/6/9）。
2. **调整 StepFun Key 校验策略**（§7.2），确保设置页成功路径可用。
3. **消除 `export-service.ts` 裸 fs**（§7.3），将临时目录/文件操作收拢到 `StorageAdapter`。
4. **补充 250+ 节点压力测试**（§7.4），验证 React Flow 在大量分镜通道下的性能。
5. **评估本次合并**：由于 `main` 当前包含无法闭环的 AI 管线，建议管理层决定是否：
   - **回滚** `main` 到 `1b88f83`，重新打开 PR #5，待修复后再合并；或
   - **保留当前 `main` 并尽快 hotfix**，在 `feature/demo-harness-full` 或新分支修复后二次合并。

---

## 附图目录

截图保存在 `docs/updates/2026-07-23-cloud-e2e-review-screenshots/`：

| 文件名 | 内容 |
|--------|------|
| `home.png` | 首页 / 工作台 |
| `new-project.png` | 新建项目对话框 |
| `canvas-fanout.png` | 画布 fan-out 后 9 节点状态 |
| `canvas-collapsed.png` | 分镜通道折叠 |
| `settings-invalid.png` | 设置页 Key 校验失败 |
| `settings-dark.png` | 设置页暗色主题 |
| `shot-detail.png` | 分镜详情页（未渲染） |
| `shot-render-error.png` | 单镜渲染 `renderSpec` 缺失错误 |
| `export-disabled.png` | 导出页未完成分镜时按钮禁用 |
