# Track H — 系统性前后端打通修复：已知问题清单

> Created: 2026-07-24
> 与 [`docs/specs/2026-07-23-harness-task-breakdown.md`](../specs/2026-07-23-harness-task-breakdown.md) 的 Track H 小节互为索引：本文件是详细清单，task-breakdown 只登记摘要。
> 背景分析见对应会话记录；核心根因是既往验收标准只测"按钮点击是否触发对应 API"，未测"页面展示的每个字段是否真实"，详见 AGENTS.md「UI 字段真实性门禁」。

## 使用说明

- 每个 issue 是一个可独立施工的低耦合模块，文件命名 `issue-NN-<brief>.md`，内部结构对齐 harness Task 卡片（目标/根因/允许改动范围/禁止改动/完成条件），可直接作为 Codex Goal 的施工依据。
- 施工前**必须**重新核实该 issue 引用的代码行号是否已被后续提交改动（本清单起草期间已发生一次因新提交导致路径/行号整体偏移的教训，见下方"变更记录"）。
- 完成一个 issue 后，请在下表"状态"列更新，并同步 `harness-task-breakdown.md` Track H 小节的索引表。

## 索引与推进顺序

推进顺序遵循 Wave 分组，同一 Wave 内可并行，跨 Wave 建议按序：

```mermaid
flowchart TB
    subgraph wave1 [Wave 1 -- P0 立即可并行]
        I01[issue-01 Director 六阶段输入契约补全]
        I02[issue-02 StepFun Key 校验策略修复]
    end
    subgraph wave2 [Wave 2 -- 独立模块 可并行]
        I03[issue-03 Canvas Inspector 数据真实性]
        I04[issue-04 分镜缩略图共享基础设施]
        I07[issue-07 分镜通道折叠面板信息摘要]
        I08[issue-08 export-service StorageAdapter 边界治理]
    end
    subgraph wave3 [Wave 3]
        I05[issue-05 分镜渲染器页面真实数据打通]
    end
    subgraph wave4 [Wave 4]
        I06[issue-06 导出可配置参数 + Final QA 真实检测]
    end
    I04 --> I05
    I04 --> I06
    I01 -.->|完整六阶段验证依赖| I06
    I01 -.->|部分节点展示依赖| I03
```

### 并行执行建议（2026-07-24 补充）

Wave 编号只表示"建议的先后顺序"，**不代表必须串行**。逐个核对了 8 个 issue 的「允许改动范围」文件清单后，实际的并行空间比 Wave 分组暗示的更大：

- **可立即同时开工的 6 个（互相零文件重叠）**：`issue-01`、`issue-02`、`issue-03`、`issue-04`、`issue-07`、`issue-08`。这 6 个改动的文件集合两两不相交（`issue-01` 只碰 `features/director/**`；`issue-02` 只碰 `stepfun-adapter.ts`；`issue-03` 只碰 `features/canvas/queries.ts`+`canvas-inspector.tsx`；`issue-04` 只碰 `features/render/thumbnail.ts`+`repository.ts`（渲染）+`artifacts/service.ts`；`issue-07` 只碰 `canvas-view.tsx`+`flow-elements.tsx`；`issue-08` 只碰 `storage/**`+`export-service.ts`），可以分别开 6 条独立分支/worktree 同时施工，互不阻塞、互不产生合并冲突。
- **必须等 `issue-04` 落地后才能开工**：`issue-05`（消费缩略图 API）、`issue-06`（Final QA 部分消费缩略图 API）。
- **唯一需要协调的文件级冲突**：`issue-06` 与 `issue-08` 都会改到 `src/features/render/export-service.ts`（`issue-06` 加分辨率参数传递，`issue-08` 把裸 `fs` 换成 `StorageAdapter` 方法）。由于 `issue-06` 本身要等 `issue-04` 先完成，时间上大概率不会真正撞在一起；但如果两者被安排给不同的人/Agent 同时做，建议**先合并 `issue-08`，`issue-06` 在其基础上继续**，避免同一文件的两份改动互相冲突。
- **`issue-06` 建议在 `issue-01` 完成后再做一次完整回归**（因为要验证 FINALIZE 阶段的完整链路），但这只是"验收时机"的建议，不影响 `issue-06` 本身何时开始写代码。

**实操建议**：如果你有多个 Codex/Cursor Agent 会话可以同时用，最多可以一次拉 6 条并行分支同时推进（`issue-01/02/03/04/07/08`），`issue-04` 完成后再补上 `issue-05`、`issue-06` 两条。每条分支建议用 `git worktree` 隔离，施工完成后按 issue 编号逐个提 PR / 合并，避免所有改动堆在一个分支里互相踩。

| Issue | 优先级 | Wave | 依赖 | 一句话目标 | 状态 |
|---|---|---|---|---|---|
| [`issue-01-director-stage-input-contract-completion`](./issue-01-director-stage-input-contract-completion.md) | P0 | 1 | 无 | 补齐 ASSEMBLE/FINALIZE 的 `directorInput` 真实组装，使六阶段无 mock 全部跑通 | **已完成**（2026-07-24；Q1-Q4 决策记录见文档 §3；Q4 涉及的两项延后工作已登记 [GitHub Issue #7](https://github.com/AIMFllyYS/code-video-canvas/issues/7)） |
| [`issue-02-stepfun-key-validation-strategy`](./issue-02-stepfun-key-validation-strategy.md) | P0 | 1 | 无 | 修复 `validateKey()` 用 `models.list()` 导致有效 Key 也判定失败的问题 | **已完成**（2026-07-24） |
| [`issue-03-canvas-inspector-data-truthfulness`](./issue-03-canvas-inspector-data-truthfulness.md) | P1 | 2 | 部分展示依赖 issue-01 | Inspector 的内容哈希/合同 chips/进度/查看代码改为真实数据 | 待施工 |
| [`issue-04-shot-thumbnail-infrastructure`](./issue-04-shot-thumbnail-infrastructure.md) | P1 | 2 | 无 | 新增共享的分镜静态帧缩略图生成能力 | 待施工 |
| [`issue-05-shot-renderer-page-wiring`](./issue-05-shot-renderer-page-wiring.md) | P1 | 3 | issue-04 | 分镜渲染器页面播放器/缩略图/历史产物真实打通 | 待施工 |
| [`issue-06-export-configurable-params-and-real-qa`](./issue-06-export-configurable-params-and-real-qa.md) | P1 | 4 | issue-04；建议 issue-01 后回归 | 导出参数最小可配置 + Final QA 真实抽帧检测 | **已拍板，可开工**（架构选"导出时缩放"；图像库已批准 `jimp`） |
| [`issue-07-canvas-lane-panel-summary`](./issue-07-canvas-lane-panel-summary.md) | P2 | 2 | 无 | 分镜通道折叠面板补充子节点状态摘要 | **已完成**（2026-07-24，`29bba21`） |
| [`issue-08-export-service-storage-adapter-boundary`](./issue-08-export-service-storage-adapter-boundary.md) | P2 | 2 | 无 | `export-service.ts` 裸 `fs` 改走 `StorageAdapter` | **已完成**（2026-07-24） |

## 关键决策记录（2026-07-24 已与负责人确认）

以下问题原本分散在各 issue 文档的"待确认问题"章节，通过一轮结构化问答已全部拍板，此处汇总留痕；各 issue 文档正文已同步更新为"已拍板"表述：

1. **issue-01 Q1**：`prompts/assemble.ts`/`finalize.ts` 采用 **Option A**——从"单一 builder"拆成"按节点角色区分的多个 builder+schema"（改动范围扩大到 `stage-prompt.ts`，但更清晰不易出错）。
2. **issue-01 Q2**：`score`/`export` 节点查询"全部分镜渲染完成状态"时，**在 `DirectorRuntimeRepository` 内重复实现一份简化查询**，不复用 `features/render`，避免循环模块依赖。
3. **issue-01 Q3**：`export` 节点的 FINALIZE **必须**等 `features/render` 的 `exportProject()` 先跑完（`final-mp4` 已存在）才允许执行，缺失时给出可读的前置错误提示。
4. **issue-01 Q4**：`prepareStageResult` 对 ASSEMBLE/FINALIZE 输出的结构化归一化 + `DIRECT`/`SHOT_SPEC`/`FABRICATE` 存量测试缺口，**本轮均不做**，已合并登记为 [GitHub Issue #7](https://github.com/AIMFllyYS/code-video-canvas/issues/7)，留到 issue-01 收口后再排期。
5. **issue-06 Part A**：分辨率切换采用"导出时用 ffmpeg `scale` 统一缩放"，不在渲染阶段分档（不破坏单镜渲染缓存）；`exportSettings` 存储位置采用 `projects` 表新增 JSON 列（Harness 总纲 §6.6 默认倾向方案）。
6. **issue-06 Part B**：黑帧/纯色检测新增依赖已确定为 **`jimp`**（纯 JS，无原生二进制编译负担），已获批准，施工时可直接 `pnpm add jimp`。

## 已在调研中发现并纠正的错误信息（供后续施工者参考，避免重复踩坑）

- 一名调研子智能体最初误判 `src/app/canvas/export/export-workspace.tsx`（旧路径）与 `src/app/(app)/canvas/export/export-workspace.tsx`（新路径）两份文件同时存在——这是把 `git log` 对 rename 的展示方式（同一提交同时"触碰"两个路径）误读成"文件并存"。经 `Glob` 复核，`src/app/canvas/**` 已 0 文件，只有路由组版本是真实存在的正式页面。**教训**：核实文件是否存在，优先用 `Glob`/直接 `Read` 而不是只看 `git log` 的路径列表。
- 本清单起草期间，项目引入了 `motion` 动画库并重构了常驻 Sidebar 挂载方式（`src/app/canvas/**` → `src/app/(app)/canvas/**`），导致最初基于旧路径写的分析笔记全部需要重新核对路径与行号。已确认：①`motion` 库不涉及任何确定性红线风险（只用于应用 UI）；②新增的 `Skeleton` 组件只覆盖真实网络请求等待窗口，不掩盖本清单列出的任何恒定假值问题，两者互不影响。

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-07-24 | 初版发布，8 个 issue 覆盖画布 Inspector/分镜通道折叠、分镜渲染器、合成导出三大症状的系统性打通修复；`issue-01`/`issue-04`/`issue-06` 经深度子智能体调研后由子智能体直接撰写并经人工复核修正一处事实错误，其余 issue 由直接读取当前代码撰写 |
| 2026-07-24（决策轮） | 通过一轮结构化问答拍板了 `issue-01`（Q1-Q4）与 `issue-06`（Part A 架构、Part B 依赖选型）的全部待确认问题；`issue-01`/`issue-06` 状态更新为"已拍板，可开工"；Q4 涉及的两项范围外延后工作登记为 [GitHub Issue #7](https://github.com/AIMFllyYS/code-video-canvas/issues/7) |
| 2026-07-24（并行分析） | 逐一核对 8 个 issue 的允许改动范围，确认 `issue-01/02/03/04/07/08` 六个互相零文件重叠、可立即同时并行开工；标出 `issue-06`/`issue-08` 都会改到 `export-service.ts` 这一处需要协调的文件级冲突 |
| 2026-07-24（issue-02 完成） | `validateKey()` 由 `models.list()` 改为与 `StepfunAdapter.chat()` 一致的最小 `chat.completions.create()` 探测（`max_tokens:1` + per-request `timeout`/`maxRetries:0`），保留不泄露 Key 的服务端 `console.error` 日志；新增 4 个 `validateKey` 单测（共 9 tests 全绿）；经 `pnpm dev` + POST `/api/settings` 真实 Key 验证（有效→200/无效→422）；状态→已完成 |
| 2026-07-24（issue-07 完成） | 画布从既有 `nodes` 投影纯派生固定五角色通道摘要，展开态显示真实状态徽章与脚本文本，不完整数据显式提示且不伪造状态；5 个新增测试、全量 168 tests、lint/tsc/build 与 production Chromium 交互验收通过；提交 `29bba21` |
