# issue-13 — FABRICATE 确定性门禁失败的会话内反馈重试

| 字段 | 值 |
|---|---|
| 优先级 | **P2**（体验/成功率优化：门禁本身按设计正确工作，但失败后只能整段人工重试，浪费已消耗的 token 且成功率低） |
| Wave | 7（建议在 issue-11 合并后施工——二者都触碰 `stage-runner.ts`，先后串行避免同文件冲突） |
| 依赖 | 无硬依赖；与 issue-11 有 `stage-runner.ts` 文件级冲突（见文末） |
| 关联证据 | 用户实测截图：FABRICATE 阶段失败弹窗 `产物校验失败：set-interval@457: 禁止 setInterval 驱动动画；用帧取模表达` |
| 状态 | **已完成**（2026-07-24） |

## 背景：门禁在正确工作，但失败即全盘作废

FABRICATE 阶段现有流程（[`stage-runner.ts`](../../src/features/director/stage-runner.ts) L115-L119）：

```
session.run(prompt) → prepareStageResult() → writeValidatedArtifact()
                                                └─ deterministic-html 预校验
```

[`write-artifact.ts`](../../src/features/director/tools/write-artifact.ts) L102-L111：`deterministic-html` 校验调用 `inspectDeterminism()`，命中违规（rAF / setInterval / Date.now / 无种子随机 / CSS animation 等）时抛 `ArtifactValidationError`（L50-L55，即截图中的"产物校验失败：set-interval@457…"）→ 整个 stage 直接 failed。

问题：

1. **模型有自检工具但没被强制使用**：`toolsForStage('FABRICATE')` 挂了 `createCheckDeterminismTool()`（L171-L175），模型*可以*在会话中自检，但不自检也能直接交稿——最终门禁在会话结束后才执行，违规信息没有机会回到模型手里；
2. **人工重试是冷启动**：用户点"重试"→ 重新 enqueue → 新一轮完整生成。上一轮的违规细节（规则 ID + 行号 + 修正建议）没有注入重试上下文，模型大概率复犯同类错误；
3. 一旦 issue-11 的 autopilot 落地，FABRICATE 失败会成为全自动链路最常见的断点，此问题会被放大。

## 修复方案：会话内有界反馈循环

在 `stage-runner.ts` 的 FABRICATE 路径（或抽出的辅助函数）实现：

```
第 1 轮：session.run(prompt) → prepare → writeValidatedArtifact
  └─ 捕获 ArtifactValidationError（仅此类型，其他错误照旧抛出）
第 2 轮：session.run(反馈 prompt：逐条列出 violations（ruleId@line: message），
         要求只修正违规处、重新输出完整 HTML）→ prepare → write
  └─ 再失败 → 最多再来 1 轮（共 MAX_GATE_RETRIES = 2 次反馈）
仍失败 → 按现有失败路径处理（failed + recordStageError，错误消息附「已自动重试 2 次」）
```

要点：

- **复用同一个 DirectorSession**：反馈轮走 `session.run()` 追加对话，上下文（风格圣经、shot 合同、上一版 HTML）都在会话里，成本远低于冷启动重跑；
- **只对 `ArtifactValidationError` 反馈重试**：网络错误、schema 归一失败等其他异常不进循环（避免掩盖真实故障）；
- 反馈 prompt 放 `prompts/fabricate.ts` 新增 builder（如 `buildFabricateRetryPrompt(violations)`），遵循"六阶段原生 prompt builder"约定，不在 runner 里临时拼无类型 prompt；
- 重试计数与最终失败原因写入 `recordStageError` 的 message（如 `产物校验失败（自动重试 2 次后仍违规）：…`），Inspector 错误弹窗直接可见，满足 UI 真实性门禁；
- 流式面板天然兼容：反馈轮的 token 依旧经 `pi-session.ts` 的 diff 推送进 streamBus，用户能看到"AI 正在修正违规"的过程（依赖 issue-09 修复后流式可见）；
- SHOT_SPEC 的 `shot-plan` 校验失败（`validate-shot-plan`）是同构问题，方案落地时用同一机制顺带覆盖（validation 类型判别已经在 `writeValidatedArtifact` 内聚，runner 侧无需区分）。

## 允许改动范围 / 禁止改动 / 完成条件

**允许改动范围**：

- `src/features/director/stage-runner.ts`（成功路径内的有界重试循环）
- `src/features/director/prompts/fabricate.ts`（新增反馈 prompt builder）、必要时 `prompts/shot-spec.ts` 同构补充
- `src/features/director/stage-prompt.ts`（如反馈 builder 需要经此分发）
- 对应测试：mock session 的两轮/三轮反馈、非 ArtifactValidationError 不重试、重试上限后失败消息格式

**禁止改动**：

- `inspectDeterminism` / `validateShotPlanValue` 的校验规则本身（门禁标准不放松）
- `write-artifact.ts` 的可信写服务契约（校验失败必须继续抛错，不改为静默降级）
- 不增加无上限循环；重试次数为常量（建议 2），不做成配置项（避免用户调大烧 Key）

**完成条件**：

- [x] FABRICATE 产物违规时自动在同一会话内反馈重试，最多 2 轮；成功则正常提交，用户无感知
- [x] 重试耗尽后 failed，错误消息包含重试次数与最后一轮违规明细
- [x] 非门禁类错误（网络/schema/存储）不触发反馈循环的回归测试
- [x] `pnpm lint && pnpm tsc --noEmit && pnpm test && pnpm build` 全绿

## 2026-07-24 实施记录

- `MAX_GATE_RETRIES = 2` 固定在应用编排层；首轮 + 两轮反馈共最多三次
  `session.run()`，始终复用同一 `DirectorSession`。
- 只有 `writeValidatedArtifact()` 抛出的 `ArtifactValidationError` 会进入循环；
  模型网络错误、`prepareStageResult()` schema 归一错误、存储/索引错误保持原有
  立即失败语义。
- FABRICATE 与 SHOT_SPEC 分别使用原生类型化 retry prompt builder；反馈逐条包含
  可信门禁错误，并要求重新输出完整 HTML / JSON，runner 不临时拼 prompt。
- 两轮耗尽后错误消息为“自动重试 2 次后仍违规”并保留最后一轮全部明细，
  `recordStageError`、SSE 终态与 Inspector 会读取同一真实错误。
- 新鲜验证：`pnpm lint`、`pnpm tsc --noEmit`、73 files / 329 tests、
  `pnpm build` 全部通过。

## 与其他 issue 的并行性

与 issue-09（lib 层）、issue-10（ai/settings）、issue-12（audio/qa）零文件重叠。与 **issue-11 冲突**：二者都改 `stage-runner.ts`（issue-11 改成功后的 advance 挂接，本 issue 改 run→write 的重试循环）——虽然函数段不同，仍建议**串行：先 issue-11 后 issue-13**（或反之），不要双分支同时改此文件。
