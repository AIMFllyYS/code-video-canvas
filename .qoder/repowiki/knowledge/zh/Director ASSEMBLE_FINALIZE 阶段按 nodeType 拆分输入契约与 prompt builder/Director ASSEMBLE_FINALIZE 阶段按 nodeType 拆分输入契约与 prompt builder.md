---
kind: design
name: Director ASSEMBLE/FINALIZE 阶段按 nodeType 拆分输入契约与 prompt builder
source: session
category: adr
---

# Director ASSEMBLE/FINALIZE 阶段按 nodeType 拆分输入契约与 prompt builder

_来源：5c5f968 → c3e6164 提交周期内记录的编码计划——内容为规划时意图，实现可能滞后或有出入。_

**状态：** accepted

## 背景
issue-01 暴露 resolveDirectorInput 仅对 INGEST/DIRECT/SHOT_SPEC/FABRICATE 组装 directorInput，ASSEMBLE（score/shot-sfx/shot-subtitle）与 FINALIZE（export/shot-qa）落到 return row.data.directorInput（恒为 undefined），导致 stage-prompt.ts 对 undefined 调用 .strict().parse() 必现 Invalid input: expected object, received undefined。需要让六阶段无 mock 全部跑通。

## 决策驱动
- 避免循环依赖（director↔render）
- 单镜视角 prompt 语义清晰不误导模型
- 在模型运行前失败而非中途崩溃
- 最小改动面、不改输出归一化

## 备选方案
- **Option A：按节点角色拆 builder + schema，stage-prompt 增加 nodeType 二次路由** — 优点：单镜/全片语义分离，prompt 文案精准；nodeType 路由显式覆盖所有组合；只改输入侧，不改 stage-result 输出；缺点：需新增 5 个 schema/builder 及 runtime-repository 查询方法
- **Option B：单一 schema 硬凑单镜数据到全片结构** _（已否决）_ — 优点：改动量小；缺点：全片视角 prompt 套单镜语义会误导模型；draftArtifactKey/qaFindings 单数语义无法表达第几镜
- **复用 RenderRepository.getExportPlan()** _（已否决）_ — 优点：DRY；缺点：造成 director↔render 循环依赖
- **在 assertEnqueueable 加 final-mp4 前置校验** _（已否决）_ — 优点：更早拦截；缺点：给共享 enqueue 热路径增加 artifact I/O、扩大改动面；resolveDirectorInput 已满足 Q3 要求

## 决策
采用 Option A：在 prompts/assemble.ts 拆出 scoreAssemblePromptInputSchema/buildScoreAssemblePrompt、shotSfxPromptInputSchema/buildShotSfxPrompt、shotSubtitlePromptInputSchema/buildShotSubtitlePrompt；在 prompts/finalize.ts 拆出 exportFinalizePromptInputSchema/buildExportFinalizePrompt、shotQaPromptInputSchema/buildShotQaPrompt；stage-prompt.ts 的 StagePromptContext 增加 nodeType 字段并在 ASSEMBLE/FINALIZE 分支按 nodeType switch 路由；runtime-repository.ts 的 resolveDirectorInput 补全对应分支，自写简化只读查询替代 import render 模块。

## 影响
五类节点均有显式输入契约，不再静默兜底；每类 prompt 文案与其数据视图一致，降低模型误用风险；director 与 render 保持单向依赖；后续如需扩展新节点类型只需追加 nodeType 分支与 builder，契约清晰可演进。代价是新增约 5 个 schema/builder 与若干私有查询方法，测试需搭建跨节点聚合夹具。