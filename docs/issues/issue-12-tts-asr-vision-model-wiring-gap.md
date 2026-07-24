# issue-12 — TTS / ASR / Vision 三类模型接线缺口（audio 域 + shot-qa 多模态验收）

| 字段 | 值 |
|---|---|
| 优先级 | **P2**（功能缺口登记：`.env.example` 承诺的三类模型能力当前为零实现；PRD 将配音/字幕/多模态验收列为 P1 后置项） |
| Wave | 7（**硬依赖 issue-10**：必须先有统一 config resolver 才有可信的模型配置来源） |
| 依赖 | issue-10（`getStepfunConfig()` 提供 ttsModel/asrModel/visionModel） |
| 关联证据 | grep 核实：`STEPFUN_TTS_MODEL` / `STEPFUN_ASR_MODEL` / `STEPFUN_VISION_MODEL` 在 `src/` 内 0 处引用 |
| 状态 | 待施工（可先只做本文档 §「短期最小动作」，完整接线按 P1 排期） |

## 现状核查

### 三类模型环境变量：定义了，但没有任何代码消费

`.env.example` L14-L16：

```
STEPFUN_TTS_MODEL=stepaudio-2.5-tts           # 配音/声音克隆模型
STEPFUN_ASR_MODEL=stepaudio-2.5-asr           # 语音转写模型 (用于字幕时间轴对齐)
STEPFUN_VISION_MODEL=step-3.7-flash           # 视觉模型验收节点 (多模态)
```

`grep -r "STEPFUN_(TTS|ASR|VISION)"` 于 `src/`：**0 命中**。这三个变量目前是"文档承诺、代码空转"。

### 预期消费方的真实现状

1. **`src/features/audio/*`（TTS/ASR 的家）**：`voiceover.ts`（15 行）、`subtitle.ts`（15 行）、`sfx.ts` / `score.ts`（各 13 行）——全部是 Demo 占位 stub，与 AGENTS.md「audio/ 配音 / SFX / BGM / 字幕（Demo 阶段占位，P1 补齐真实实现）」的声明一致。Director 的 ASSEMBLE 阶段用的是 `runtime-repository.ts` 引入的 `buildDemoAudioAllocation` / `buildDemoAudioManifest`（`audio-demo.ts`）——**确定性 Demo 数据，非模型产物**（这是刻意设计：音频 manifest 禁止由模型猜测）。
2. **shot-qa 验收（Vision 的家）**：issue-06 落地的 `features/render/qa-check.ts` 用 `jimp` 做亮度均值黑帧 + 标准差纯色检测——纯规则引擎，无多模态。`.env.example` 注释里"视觉模型验收节点 (多模态)"的能力不存在。

## 为什么单独立 issue 而不并入 issue-10

issue-10 的边界是"配置值备好、可解析、可在设置页配置"；本 issue 是"消费这些值的真实功能"。后者是特性开发（涉及 StepFun TTS/ASR 端点契约调研、音频产物的 StorageAdapter 落盘、字幕时间轴对齐算法、QA 抽帧喂视觉模型的 prompt 设计），工作量与风险跟配置治理完全不同量级，混在一起会让 issue-10 无法收口。

## 短期最小动作（可与 issue-10 同批完成，不算完整接线）

1. 设置页三类模型输入行旁加显式占位说明："该模型将用于配音/字幕/验收，当前版本尚未启用"——满足 AGENTS.md「Demo 阶段允许占位，但必须显式声明」门禁，避免用户误以为配了就生效；
2. 本文档作为缺口的唯一登记处，`.env.example` 三行注释补充 `（尚未接线，见 docs/issues/issue-12）`。

## 完整接线范围（P1 排期时按此拆卡）

### Part A — TTS 配音（shot-sfx / voiceover）

- `features/audio/voiceover.ts` 实现真实 StepFun TTS 调用（模型取 `getStepfunConfig().ttsModel`），音频字节经 `StorageAdapter.put()` 落盘 + artifacts 登记（kind 如 `voiceover-audio`）；
- 与 ASSEMBLE 阶段集成时保持现有红线：**audio manifest/allocation 不由模型猜测**，TTS 只生成音频实体，时长等元数据由应用测量写回。

### Part B — ASR 字幕时间轴（shot-subtitle）

- `features/audio/subtitle.ts` 用 ASR 模型（`asrModel`）对配音音频转写取词级时间戳，对齐出字幕轨道 JSON（产物 kind 如 `subtitle-track`）；
- 依赖 Part A 产出的音频（无配音则显式跳过并标注，不伪造时间轴）。

### Part C — Vision 多模态验收（shot-qa）

- 复用 issue-04 的 `captureThumbnails` 抽帧能力，把关键帧喂给视觉模型（`visionModel`，OpenAI 兼容 image 输入），按 shot-plan 合同逐条核对视觉要素，输出结构化验收报告（产物 kind 如 `qa-vision-report`）；
- 与现有 `qa-check.ts` 规则检测**并存不替换**：规则检测零成本兜底，视觉模型报告作为增强层；
- 模型输出必须经 Zod schema 归一（沿用「类型化归一 → artifact 门禁 → 提交」协议），禁止直接采信自由文本。

## 允许改动范围 / 禁止改动 / 完成条件（完整接线时）

**允许改动范围**：`src/features/audio/**`、`src/features/render/qa-check.ts` 周边（新增 vision 报告模块）、`src/features/director/` 中 ASSEMBLE/FINALIZE 的输入组装消费点、相应 API/测试。

**禁止改动**：

- `getStepfunConfig()` 契约（issue-10 已定）；
- 确定性红线：音频/验收全部发生在服务端作业中，不进 shot HTML 渲染管线；
- 不绕过 StorageAdapter 落盘音频/报告字节。

**完成条件**（完整接线时逐项打勾；短期最小动作只需前两项）：

- [ ] 设置页三类模型行有显式"尚未启用"占位声明（短期）
- [ ] `.env.example` 注释标注接线状态并指向本 issue（短期）
- [ ] TTS 真实生成配音音频并落盘登记（Part A）
- [ ] ASR 真实产出词级时间轴字幕轨道（Part B）
- [ ] Vision 验收报告与规则检测并存输出（Part C）
- [ ] 三类调用全部通过 `getStepfunConfig()` 取模型名，0 处散点 env 读取
- [ ] `pnpm lint && pnpm tsc --noEmit && pnpm test && pnpm build` 全绿

## 与其他 issue 的并行性

短期最小动作与 issue-10 同文件（`settings-form.tsx`、`.env.example`），**建议直接并入 issue-10 的施工分支完成**。完整接线（Part A/B/C）与 issue-09/11/13 零重叠，三个 Part 之间 A→B 有依赖、C 独立可并行。
