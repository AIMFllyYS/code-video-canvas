# Track N0 Closeout — 基线封账与止血

- Track 状态：`done`
- 完成日期：2026-07-25
- 分支：`main`
- N0 代码与 Task 证据末端：`7b38d8a`
- push：`false`

## 1. Task 与本地 commit

| Task | 范围/前置 commit | 实现 commit | 账本 evidence commit |
|---|---|---|---|
| N0.1 | `ce8430b` | `1a604b5` | `a27d767` |
| N0.2 | `1178c83` | `21c78fa` | `adf4929` |
| N0.3 | `859f264`、scope `1cc940c` | `339bc0f` | `3baa1af` |
| N0.4 | `e09b57f` | `acf4089` | `963d30d` |
| N0.5 | `c67b29c`、DOC-CONFLICT 修订 `bade79a` | `eb1328f` | `7b38d8a` |

N0.5 的最终 capture 在包含五个待提交 Task 路径的工作树上运行，这些路径随后提交为
`eb1328f`。JSON 的 `commit` 字段仅锚定 capture 时的已提交 HEAD `bade79a`，
不代表 N0.5 实现 commit。

## 2. 规范覆盖

- Product：`PROD-FOUND-003..004`、`PROD-AI-005`、`PROD-RENDER-002`、
  `PROD-RUN-006`、`PROD-UI-001..004`。
- Architecture：`ARCH-DEC-003..004`、`ARCH-DEC-010`、
  `ARCH-MOD-004..005`。
- Contracts/Security/Test：`CONTRACT-AI-005..006`、`SEC-003`、`TEST-004`。
- Harness：Tier 0/A/B、Task 独立 commit、UTF-8/secret/import 门禁、
  Track checkpoint、evidence 与不 push 规则。

## 3. 变更范围与公开合同

| Task | 主要文件 | 新增或收紧的公开能力 |
|---|---|---|
| N0.1 | `src/lib/workflow/version.ts`、`scripts/verify/capture-v3-baseline.ts` | `WorkflowVersionV1`、`ACTIVE_WORKFLOW_VERSION`、`serializeWorkflowVersion` |
| N0.2 | `src/features/director/pi-output.ts`、Pi session/stage/tool 调用方 | `DirectorOutputPolicy`、`DirectorOutput`、`extractDirectorOutput` |
| N0.3 | `src/features/render/source-contract.ts`、`admission.ts`、`render-shot-repository.ts`、render API/queue/repository | `assertDeterministicSource`、`RenderAdmissionDependencies`、`assertRenderAdmission`、`RenderShotRepository` |
| N0.4 | `src/app/(app)/canvas/pipeline-feedback.ts`、Canvas inspector/view、`queue-status-bar.tsx` | `PipelineFeedback`、`describePipelineResult`、`QueueActivity`、`describeQueueActivity`、`QueueStatusBar` |
| N0.5 | `scripts/verify/v3-architecture.ts`、baseline、package scripts | `scanV3Architecture`、`createV3ArchitectureBaseline`、`checkV3Architecture`、`writeV3ArchitectureBaseline`；`verify:v3`、`report:v3` |

N0 没有建立第二套 runtime、状态模型或渲染链；改动只冻结现状、修复止血项并建立
后续 Track 的增量门禁。

## 4. Focused 与 Tier B 证据

### Focused

| Task | 运行时与结果 |
|---|---|
| N0.1 | Node 22 隔离基线：79 files / 352 tests；lint、typecheck、build 退出 0 |
| N0.2 | Node 22：5 files / 41 tests；typecheck、lint 退出 0 |
| N0.3 | Node 22 纯逻辑：5 files / 35 tests；Node 24 原生：6 files / 47 tests；renderer integration 1 file / 1 test |
| N0.4 | Node 22：3 files / 15 tests；typecheck、lint 退出 0 |
| N0.5 | Node 22：1 file / 15 tests；`pnpm verify:v3`、typecheck、定向 lint 退出 0；独立只读终审 PASS |

### 最终 Tier B

`docs/evidence/refactor-v3/n0-baseline.json` 于
`2026-07-24T18:43:32.372Z` 捕获：

| 命令 | 结果 |
|---|---|
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | exit 0；85 files / 411 tests |
| `pnpm build` | exit 0 |
| `pnpm verify:v3` | exit 0 |

最终全量原生门禁使用 Node 24.15.0 / pnpm 9.15.0。capture 的 UTF-8 原文已按
UTF-8 解码复核，构建路由树字符保持为 `├`、`└`、`○`、`ƒ`。

## 5. API、像素与媒体证据边界

- 真实本地开发服务在最终 build 后仍由原 PID 44452 监听 3000，
  `GET /api/ping` 返回 HTTP 200。
- N0.3 证明 render admission 在 node `pending` 和 queue enqueue 前拒绝非法 source；
  N0.4 的回归测试与调用方 wiring 证明 start/stop、partial failure 的 API
  结果对象不会再被 UI 丢弃；本 Track 未执行 Canvas 浏览器 E2E。
- Pi 证据来自录制 transcript/fixture：成功 Tool args 优先于 trailing assistant
  文本，失败 Tool 不回退，thinking 不落盘；它不是本 Track 的真实付费模型 E2E。
- renderer integration 仅证明 legacy deterministic fixture 可走通；它不是 N4
  HyperFrames，也不是 live FABRICATE。
- N0 不宣称最终用户视频、golden pixel、媒体 decode 或 Tier C 已完成；这些证据按
  Task Breakdown 留给 N4、N5、N7。

## 6. 治理扫描

- U+FFFD：0。
- `@openai/agents*` package/import：0；普通 `openai` 未被误判。
- Evidence 中已知 secret 与绝对路径：0。
- `git diff --check`：Task 精确路径与 staged scope 均通过。
- v3 report：2910 files；ordinary `openai` 3；Canvas forbidden import 23；
  Trigger task forbidden import 0；U+FFFD 0。
- 历史超限文件冻结为 4 个：389/350、518/350、507/350、565/400；新增或增长会失败。
- npm alias 与受治理目录的非字面量 `import()`/`require()` 均已 fail-closed。

## 7. 未解决风险

1. 当前树完整原生门禁已在 Node 24 通过；当前树的 Node 22
   SQLite/Playwright 原生组合因 ABI 127/137 差异、用户存活服务和隔离同步配额限制
   未重新复证。初始 Node 22 基线仍冻结在 `1a604b5`，后续 Track 必须继续明确两类
   运行时证据边界。
2. `workflowVersion.renderImage` 仍是目标 Node 22 descriptor，不等同于本次最终
   capture 的 Node 24 验证运行时。
3. ordinary `openai` 3、Canvas forbidden import 23、四个超限文件是冻结债务，
   不是已清零；必须按 N1–N7 的删除期限下降且不得替换增长。
4. N0 没有做真实付费模型、HyperFrames 像素或最终媒体验收，不能外推为完整工作流
   成功。

## 8. 账本、worktree 与远端

- Task Breakdown：N0.1–N0.5 均为 `task_state=done`；Track N0 转为 `done`，
  Track N1 转为 `ready`，仅 N1.1 初始可施工。
- N0 授权路径均已精确提交且无 staged 内容。
- 全局 worktree 不宣称 clean：用户 `.qoder/repowiki/**` WIP 仍存在，未读取、
  未修改、未 stage。
- 未 push、未创建 PR、未改写远端。
