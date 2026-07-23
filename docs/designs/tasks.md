# Implementation Plan

## Overview

本文件遵循 Kiro Spec 规范的 `tasks.md` 格式：编号任务清单 + checkbox + `_Requirements: <PRD 功能编号>_` 追溯标注。

这是 [`docs/specs/2026-07-23-harness-task-breakdown.md`](../specs/2026-07-23-harness-task-breakdown.md) 的**精简/追溯视图**——权威的执行细节（Task 规格、允许改动范围、完成条件、Goal 启动提示词）仍以该文档为准；本文件的作用是把同一批任务按 Kiro 习惯的层级 checklist 呈现，并显式标注每个任务对应的 PRD 需求编号（F1~F14，见 [PRD §6.2](../specs/2026-07-23-prd-code-video-canvas.md)），方便按需求维度追溯覆盖情况。

两份文档中的任务 ID 一一对应（如下文 `1.1` ↔ task-breakdown 的 `F0.1`），执行时请打开 task-breakdown 对应章节获取完整 Task 规格与 Goal 启动提示词，不要仅凭本文件的一句话描述施工。顶层编号（1~7）对应 [Harness 总纲](../specs/2026-07-23-ai-development-harness.md) §9 定义的 **Goal 颗粒度**（一个顶层任务 = 一次 Codex `/goal` 会话），子任务（如 1.1、1.2）是该 Goal 会话内部 Codex 自主执行的 **Task**。

## Tasks

- [ ] 1. Foundation — 地基验证与骨架补齐
  - 对应 Goal：Track F（一次 `/goal` 会话完成 1.1~1.7 全部子任务）
  - _Requirements: 全局前置，不直接对应单个 F 功能编号_

  - [ ] 1.1 Spike：Pi Agent + StepFun 自定义 Provider 可行性验证
    - 对应 task-breakdown：F0.1
    - _Requirements: 支撑 F1~F14 的 AI 调用底座_

  - [ ] 1.2 `.env` 契约核查与修正
    - 对应 task-breakdown：F0.2
    - _Requirements: F8（StepFun Key 设置）_

  - [ ] 1.3 修正 `stepfun-adapter.ts` 默认模型与 base URL
    - 对应 task-breakdown：F0.3
    - _Requirements: F8_

  - [ ] 1.4 DB 迁移：`canvas_nodes` 新增状态与哈希字段
    - 对应 task-breakdown：F0.4
    - _Requirements: F5（定向重渲染）、F6（画布编辑）_

  - [ ] 1.5 节点类型 taxonomy 重新设计
    - 对应 task-breakdown：F0.5
    - _Requirements: F4（分镜节点渲染）、F6_

  - [ ] 1.6 引入渲染管线依赖（playwright + ffmpeg-static）
    - 对应 task-breakdown：F0.6
    - _Requirements: F4、F9（合成导出）_

  - [ ] 1.7 确定性守卫扩展：覆盖检查范围与 CI 化
    - 对应 task-breakdown：F0.7
    - _Requirements: F4（确定性红线为硬约束，见 PRD §7 非功能需求）_

- [ ] 2. Canvas DAG — 画布数据模型 + fan-out 物化 + 布局
  - 对应 Goal：Track C（前置：Task 1 全部完成）
  - _Requirements: F2（语义分镜）、F4、F5、F6_

  - [ ] 2.1 `fan-out.ts`：分镜通道物化
    - 对应 task-breakdown：C1.1
    - _Requirements: F2、F4_

  - [ ] 2.2 `layout.ts`：自动布局算法
    - 对应 task-breakdown：C1.2
    - _Requirements: F6_

  - [ ] 2.3 `status.ts`：节点状态机与内容哈希比对
    - 对应 task-breakdown：C1.3
    - _Requirements: F5_

  - [ ] 2.4 React Flow 画布组件骨架 + 分镜通道分组折叠
    - 对应 task-breakdown：C1.4
    - _Requirements: F6_

  - [ ] 2.5 画布性能优化：视口裁剪与大规模节点压测
    - 对应 task-breakdown：C1.5
    - _Requirements: F6（非功能：本地渲染/交互性能，见 PRD §7）_

- [ ] 3. Director — video-director 方法论原生移植 + Pi tool-calling 编排
  - 对应 Goal：Track D（前置：Task 1 全部完成，1.1 的 Spike 结论已确定）
  - _Requirements: F2、F3（分镜脚本撰写）、F4_

  - [x] 3.1 `schemas/`：移植 video-director 输出契约为原生 Zod schema
    - 对应 task-breakdown：D0.1
    - _Requirements: F2、F3_

  - [x] 3.2 `prompts/`：移植 video-director 方法论为原生 prompt 模板
    - 对应 task-breakdown：D0.2
    - _Requirements: F2、F3、F4_

  - [x] 3.3 `pi-session.ts`：Director 会话工厂（`Agent + JsonlSessionRepo`，不挂 Skill）
    - 对应 task-breakdown：D1.1
    - _Requirements: F2、F3、F4_

  - [x] 3.4 `tools/`：阶段自定义 Tool 集
    - 对应 task-breakdown：D1.2
    - _Requirements: F4（确定性红线强制点）_

  - [x] 3.5 `stage-runner.ts`：持久输入 + 类型化 prompt + 单阶段运行编排
    - 对应 task-breakdown：D1.3
    - _Requirements: F2、F3、F4_

  - [x] 3.6 队列接入：`director` 作业处理器注册（`instrumentation.ts` 启动）
    - 对应 task-breakdown：D1.4
    - _Requirements: F2、F3、F4_

  - [x] 3.7 API 路由：`api/director/stage`
    - 对应 task-breakdown：D1.5
    - _Requirements: F2、F3_

- [ ] 4. Render — 渲染管线
  - 对应 Goal：Track R（前置：F0.6、F0.7 完成）
  - _Requirements: F4、F5、F9_

  - [x] 4.1 `frame-capture.ts`：shot runtime 合同 + 可复用截图 session
    - 对应 task-breakdown：R1.1
    - _Requirements: F4_

  - [x] 4.2 磁盘帧序列、有限 session 池与内容哈希缓存
    - 对应 task-breakdown：R1.2
    - _Requirements: F5_

  - [x] 4.3 `encode.ts`：ffmpeg 编码
    - 对应 task-breakdown：R1.3
    - _Requirements: F4_

  - [x] 4.4 `concat.ts` + 可信 export service：终局合并导出
    - 对应 task-breakdown：R1.4
    - _Requirements: F9、F13（转场/剪辑）_

  - [x] 4.5 `renderer.ts`：可信顶层编排 + 单例队列接入
    - 对应 task-breakdown：R1.5
    - _Requirements: F4、F5_

  - [x] 4.6 API 路由：`api/render` 与 `api/render/export`
    - 对应 task-breakdown：R1.6
    - _Requirements: F4、F9_

- [x] 5. Pencil 组件港口 — `canvas.pen` → 真实前端组件（SSOT 强制）
  - 对应 Goal：Track P（必须在 Task 6 之前完成）
  - _Requirements: 支撑全部 UI 相关需求（F6、F8~F14 的界面呈现），不直接对应单个功能编号_

  - [x] 5.1 依赖补全：`lucide-react` + 自动布局库
    - 对应 task-breakdown：P0.1

  - [x] 5.2 B1 基础控件港口（13 个组件）
    - 对应 task-breakdown：P1.1

  - [x] 5.3 B2 反馈组件港口（Toast / Dialog / EmptyState）
    - 对应 task-breakdown：P1.2

  - [x] 5.4 B3 导航组件港口（NavItem / TopBar / Sidebar）
    - 对应 task-breakdown：P1.3

  - [x] 5.5 B4 业务/节点组件港口（11 个组件）
    - 对应 task-breakdown：P1.4
    - _Requirements: F4、F6（节点视觉呈现）_

  - [x] 5.6 图标白名单核查 + Playbook 完整性收口
    - 对应 task-breakdown：P1.5

- [ ] 6. Audio — 字幕/配音/音效/配乐（P1 优先级，Demo 阶段占位）
  - 对应 Goal：Track A（前置：Task 2、Task 3 完成）
  - _Requirements: F10、F11、F12、F14_

  - [x] 6.1 `features/audio/` 骨架与占位实现
    - 对应 task-breakdown：A1.1
    - _Requirements: F10、F11、F12、F14（Demo 阶段仅占位，真实实现为 P1 后续任务）_

- [ ] 7. UI — 六页面按设计稿实装
  - 对应 Goal：Track U（前置：Task 5 全部完成，Task 2/3/4 已完成对应 API；建议拆成两个顺序 Goal，见 task-breakdown）
  - _Requirements: F1（脚本导入）、F6、F7（本地项目存储）、F8、F9_

  - [x] 7.1 S1 首页 / 项目列表
    - 对应 task-breakdown：U1.1
    - _Requirements: F7_

  - [x] 7.2 S2 新建项目对话框（脚本提交入口）
    - 对应 task-breakdown：U1.2
    - _Requirements: F1_

  - [x] 7.3 S3 画布主视图整合
    - 对应 task-breakdown：U1.3
    - _Requirements: F6_

  - [x] 7.4 S4 分镜详情页（预览 + 单独导出）
    - 对应 task-breakdown：U1.4
    - _Requirements: F4、F5_

  - [x] 7.5 S5 导出页（合并导出）
    - 对应 task-breakdown：U1.5
    - _Requirements: F9_

  - [x] 7.6 S6 设置页（StepFun Key 等）
    - 对应 task-breakdown：U1.6
    - _Requirements: F8_

  - [x] 7.6a 全局主题状态
    - 对应 task-breakdown：U1.6a

  - [ ] 7.7 暗色主题（Zone D 页面镜像）
    - 对应 task-breakdown：U1.7

  - [ ] 7.8 端到端 UI 走查（Tier B 里程碑收口）
    - 对应 task-breakdown：U1.8
    - _Requirements: F1~F9 端到端功能性验证（不含视觉/内容质量的主观评价，见总纲 §8.3）_

## Task Dependency Graph

顶层任务（Goal 颗粒度）之间的依赖关系（单向 DAG，对应 [Harness 总纲](../specs/2026-07-23-ai-development-harness.md) §9.1 的 Track 依赖速览）：

```
1. Foundation
   │
   ├──▶ 2. Canvas DAG ──────────────┐
   │                                │
   ├──▶ 3. Director                 │
   │                                ├──▶ 6. Audio（占位）
   ├──▶ 4. Render                   │
   │         │                      │
   ├──▶ 5. Pencil 组件港口           │
   │         │                      │
   │         └──────────────────────┴──▶ 7. UI（六页面实装）
```

- **1 Foundation** 必须最先完成，且内部子任务严格顺序执行（1.1 的 Spike 结论决定 1.2~1.7 怎么写）。
- **2 Canvas DAG / 3 Director / 4 Render / 5 Pencil 组件港口** 在 1 完成后可并行推进（互不依赖，可对应并行启动的独立 Goal 会话）。
- **6 Audio** 依赖 2、3 完成（需要通道节点已建、阶段编排已通）。
- **7 UI** 依赖 5（组件港口，强制前置）以及 2、3、4 已完成对应 API；**7 不能在 5 之前开始**。
- 子任务级别的依赖（如 2.4 依赖 2.1~2.3）见各顶层任务下的子任务列表顺序，以及 task-breakdown 对应 Task 规格中的「前置任务」字段。

Wave 定义（按依赖关系分组的并行执行批次；同一 wave 内的顶层任务互不依赖，可对应并行启动的独立 Goal 会话；跨 wave 必须按顺序推进）：

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1"],
      "description": "Foundation：地基验证与骨架补齐，必须最先完成"
    },
    {
      "wave": 2,
      "tasks": ["2", "3", "4", "5"],
      "description": "Canvas DAG / Director / Render / Pencil 组件港口，互不依赖，可并行"
    },
    {
      "wave": 3,
      "tasks": ["6", "7"],
      "description": "Audio 占位（依赖 2、3）与 UI 六页面实装（依赖 5，以及 2、3、4 的对应 API）"
    }
  ]
}
```

## Notes

- 本文件与 task-breakdown 文档中的状态勾选（`☐`/`◐`/`☑`）应保持同步；若发现不一致，以 task-breakdown 文档的状态列为唯一可信来源（本文件不重复维护独立的状态台账，仅用 GitHub 风格 checkbox 表达任务清单结构）。
- P1/P2 功能（F10~F14，字幕/配音/配乐/音效）在本轮 Demo Track 中仅通过任务 6.1 做占位骨架，不产出真实生成逻辑，详见 [Harness 总纲](../specs/2026-07-23-ai-development-harness.md) §4.1 的决策与追溯矩阵下方的覆盖核查说明。
- 视觉/内容质量层面的端到端验收（"好不好看""内容是否贴合原意"）始终由人工完成，不在本文件的任何任务完成条件中出现，参见总纲 §8.3。
- Codex 执行任一顶层任务（Goal）时，应先完整阅读 task-breakdown 文档对应 Track 章节的 Goal 启动提示词与逐个 Task 规格，本文件仅作路线图与追溯索引使用。

## 追溯矩阵（PRD 功能编号 → 任务映射）

| PRD 功能 | 优先级 | 覆盖任务 |
|---|---|---|
| F1 script 导入 | P0 | 7.2 |
| F2 语义分镜 | P0 | 2.1, 3.1, 3.2, 3.3, 3.5, 3.6, 3.7 |
| F3 分镜脚本撰写 | P0 | 3.1, 3.2, 3.3, 3.5, 3.6, 3.7 |
| F4 分镜节点渲染 | P0 | 1.5, 1.6, 1.7, 2.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.3, 4.5, 4.6, 5.5, 7.4 |
| F5 定向重渲染 | P0 | 1.4, 2.3, 4.2, 4.5, 7.4 |
| F6 画布编辑 | P0 | 1.4, 1.5, 2.2, 2.4, 2.5, 5.5, 7.3 |
| F7 本地项目存储 | P0 | 7.1 |
| F8 StepFun Key 设置 | P0 | 1.2, 1.3, 7.6 |
| F9 合成导出 | P0 | 1.6, 4.4, 4.6, 7.5 |
| F10 字幕 | P1 | 6.1（占位） |
| F11 配音 | P1 | 6.1（占位） |
| F12 整体配乐 BGM | P1 | 6.1（占位） |
| F13 转场/剪辑 | P1 | 4.4（基础拼接，转场特效延后） |
| F14 音效 SFX | P2 | 6.1（占位） |

**覆盖核查**：PRD 全部 P0 功能（F1~F9）在 Task 1~5、7 中均有对应任务覆盖真实实现；P1/P2 功能（F10~F14）在 Demo 阶段仅通过 Task 6 做占位骨架，真实生成逻辑按总纲 §4.1 决策延后到 P1 迭代，不在本轮 Track 范围内产出。

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-07-23 | 初版发布，按 Kiro Spec `tasks.md` 格式建立与 [`harness-task-breakdown.md`](../specs/2026-07-23-harness-task-breakdown.md) 的任务追溯映射，补充 PRD 功能编号覆盖矩阵 |
