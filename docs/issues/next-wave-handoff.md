# Track H 收尾交接：issue-05 / issue-06 并行施工指南

> Created: 2026-07-24
> 承接对象：`docs/issues/known-issues.md`（总索引）+ 本次对 issue-01/02/03/04/07/08 的完成情况审查。
> 目的：给下一轮并行 Codex/Cursor Agent 会话提供可直接复制使用的 Goal 启动提示词，并说明为什么现在可以安全并行开工。

## 0. 先回答一个关键问题：六个已完成 issue 之后，项目是不是"基本没问题了"？

**不是。只能说"这六个模块各自的问题已经清除干净"，Track H 整体还有两大块尚未打通：**

| 已完成（issue-01/02/03/04/07/08） | 尚未开工（issue-05/06） |
|---|---|
| Director 六阶段输入契约、StepFun Key 校验、Canvas Inspector 字段真实性、缩略图基础设施、分镜通道摘要、export-service 存储边界 | **分镜渲染器页面**（`/canvas/shot/[id]`）播放器控件/缩略图轨道/历史产物/同步状态/分镜合同字段全部还是硬编码占位；**合成导出页**（`/canvas/export`）分辨率/帧率/格式设置和 Final QA 勾选状态也全部是硬编码占位 |

也就是说：**issue-05、issue-06 覆盖的"看起来能用、实际是假的"UI 字段数量，不比已经修完的六个少**——分镜渲染器页面本身就有 8 类静态占位（`issue-05` §根因表），合成导出页有 2 大类（导出设置 + Final QA）。这两块不修完，Track H 的"系统性打通"目标不算达成。

此外还有一项已知但明确延后、目前仍是技术债的缺口：**[GitHub Issue #7](https://github.com/AIMFllyYS/code-video-canvas/issues/7)**（`issue-01` Q4 决策记录）——`prepareStageResult` 对 ASSEMBLE/FINALIZE 模型输出的结构化归一化、以及 `DIRECT`/`SHOT_SPEC`/`FABRICATE` 三个 stage 的存量测试缺口。这个不阻塞 issue-05/06，但建议在 Track H 全部收口后单独排期，不要遗漏。

## 1. 现在能否并行开工 issue-05 / issue-06？——可以，且互不冲突

核对两份 issue 文档的「允许改动范围」，文件集合**完全不相交**：

- **issue-05** 只碰：`src/app/(app)/canvas/shot/[id]/**`、（新增）`src/app/api/render/thumbnails/**`、`src/features/artifacts/**`
- **issue-06** 只碰：`src/lib/db/schema.ts`+迁移、（新增）`src/features/render/export-settings.ts`/`qa-check.ts`、`src/features/director/stage-result.ts`（仅替换魔法数字为常量引用）、`src/features/canvas/{schemas,actions,queries,index}.ts`、（新增）`src/app/api/projects/[id]/route.ts`、`src/features/render/{repository,export-service,concat}.ts`、`src/app/(app)/canvas/export/export-workspace.tsx`+`export-api.ts`、`src/app/api/render/export/route.ts`、`src/components/ui/contact-sheet-thumb.tsx`、`package.json`（新增 `jimp`）

两者都依赖 **issue-04**（已完成，`48cd5c5`），前置条件已满足。**唯一需要留意的是二者都会间接接触 `features/render/`（issue-05 只读消费 `thumbnail.ts` 的产出，issue-06 改的是 `repository.ts`/`export-service.ts`/`concat.ts`），但具体文件不重叠**，可以分别开两条独立分支/worktree 同时施工。

建议 issue-06 内部 Part A（导出参数）与 Part B（Final QA）**先做 Part A 再做 Part B**（同一文件内部顺序依赖较小，但 Part B 需要先核实 issue-04 的 `thumbnail.ts` 真实签名，做完 Part A 后手感更熟），不强制拆两个 Goal，但如果要拆，见下方模板注明的拆分方式。

## 2. issue-05 Goal 启动提示词（可直接复制给 Codex/Cursor）

```
Goal：完成 docs/issues/issue-05-shot-renderer-page-wiring.md 描述的修复，严格按该文件的
目标/允许改动范围/禁止改动/完成条件执行。

背景（先读，不要跳过）：
- 分镜渲染器页面（src/app/(app)/canvas/shot/[id]/shot-detail.tsx）当前有 8 类静态占位：
  播放器控件无 onClick、时间戳/进度条硬编码、8 格缩略图纯色块、历史产物不自动加载、
  "已同步"文案恒定、构图模式/分辨率硬编码、确定性声明恒定。
- 本 issue 依赖 issue-04（已完成，src/features/render/thumbnail.ts 已落地并提交 48cd5c5），
  开工前必须先读一遍 thumbnail.ts 的真实签名（captureThumbnails/ThumbnailContext/
  ThumbnailResult），issue-05 文档里对它的引用可能与最终实现有细节出入。

执行要求：
- 落笔前重新核实 shot-detail.tsx / shot-panels.tsx / shot-api.ts / page.tsx 的当前行号
  （issue 文档写作时的行号可能已被后续提交偏移）。
- 六个修复点按文档 §1~§6 顺序实现：历史产物自动加载 → 播放器绑定真实 <video> 状态 →
  缩略图轨道消费 captureThumbnails() → 同步状态改真实判断 → 分镜合同字段读真实
  renderSpec/shot-spec → 独立"生成分镜代码"入口。
- 新增 API route（如采用 GET /api/render/thumbnails 方案）需要按项目现有 route 的鉴权/
  projectId 隔离模式实现，浏览器只能拿到 artifact id 下载 URL，不能拿到 StorageAdapter
  裸路径或本机绝对路径。
- 完成后运行 pnpm lint && pnpm tsc --noEmit && pnpm build；涉及测试变更需 pnpm test 通过。
- 在 docs/issues/known-issues.md 与 docs/specs/2026-07-23-harness-task-breakdown.md 的
  Track H 索引表同步状态为已完成，附提交哈希。

完成条件（对齐 issue-05 §完成条件）：
- [ ] 刷新页面/首次进入即可看到该分镜的历史渲染结果（若存在）
- [ ] 播放器上一帧/播放/下一帧/进度条/时间戳全部绑定真实 <video> 状态；预览态（无真实
      视频）时相关控件隐藏或禁用
- [ ] 8 格缩略图为真实帧图，加载中展示 Skeleton
- [ ] 「已同步」文案反映真实同步状态
- [ ] 分镜合同的构图模式/分辨率来自真实数据，未生成时显式展示"待生成"
- [ ] 独立"生成分镜代码"入口可用，不强制依赖"重渲此镜"
- [ ] pnpm lint && pnpm tsc --noEmit && pnpm build 通过；新增/改动路径有测试覆盖
- [ ] known-issues.md / harness-task-breakdown.md 状态已同步
```

## 3. issue-06 Goal 启动提示词（可直接复制给 Codex/Cursor）

```
Goal：完成 docs/issues/issue-06-export-configurable-params-and-real-qa.md 描述的修复
（Part A + Part B），严格按该文件的目标/允许改动范围/禁止改动/完成条件执行。

背景（先读，不要跳过）：
- 合成导出页（src/app/(app)/canvas/export/export-workspace.tsx）有两处假字段：
  ExportSettings 的分辨率/帧率/格式是硬编码字符串（Part A 要修）；ExportQa 的每条分镜
  checked 恒为 true（Part B 要修）。
- Part A 架构已拍板：导出时用 ffmpeg scale 滤镜统一缩放，不在渲染阶段分档
  （不破坏单镜渲染缓存）；exportSettings 存储位置是 projects 表新增 JSON 列。
- Part B 依赖已批准的 jimp 依赖（pnpm add jimp，无需再次确认）；黑帧/纯色检测新增
  src/features/render/qa-check.ts，禁止混入 src/lib/determinism/。
- Part B 依赖 issue-04 的 thumbnail.ts 真实签名——开工前必须重新读一遍 thumbnail.ts
  当前代码（已提交 48cd5c5），issue-06 文档 §B.4/§B.5 对它的引用只是设计意图，不是
  读到的真实代码，不能保证字段名/调用约定不变。

执行顺序：
1. Part A：schema.ts 新增 exportSettings 列 → pnpm db:generate 生成迁移（不得手改
   meta/*.json snapshot）→ export-settings.ts 新增三档预设常量 → stage-result.ts
   替换魔法数字 → canvas/{schemas,actions,queries,index}.ts 新增读写 → 新增
   PATCH /api/projects/[id] → repository.ts 的 RenderExportPlan 新增 targetResolution
   → export-service.ts 传参 → concat.ts 按是否等于母版分辨率分 -c:v copy / -vf scale
   两条路径 → export-workspace.tsx 分辨率 SettingsRow 改真实受控组件。
2. Part B：qa-check.ts 新增 checkThumbnailQa()（亮度均值黑帧判定 + 标准差纯色判定，
   阈值定义为具名常量）→ 在 thumbnail.ts 产出新缩略图后触发检测，结果写入
   shot-qa 节点 canvas_nodes.data.qaCheck（contentHash 不变时跳过重复计算）→
   RenderExportPlan / GET /api/render/export 新增 shotQa 字段（未检测返回 null，
   不能默认 true）→ export-workspace.tsx 的 ExportQa 消费真实 shotQa →
   contact-sheet-thumb.tsx 的 checked 去掉恒真默认值。

执行要求：
- 落笔前重新核实文档引用的所有文件行号（尤其 stage-result.ts、repository.ts、
  export-workspace.tsx，issue-01/03/04/07/08 已改动过相邻代码，行号大概率已偏移）。
- 默认预设（1080×1920）必须继续走原有 -c:v copy 无损路径，产出结果与改动前逐字节
  一致；只有用户主动选择非母版分辨率时才切换到重编码路径——这是零回归红线。
- 不得新增 jimp 以外的图像处理依赖；不得把黑帧检测混入 lib/determinism/；不得新建
  独立的 QA 结果 artifact kind（结果写节点 data 字段，不是新 artifact）。
- 完成后运行 pnpm lint && pnpm tsc --noEmit && pnpm build；pnpm test 通过（含新增
  db 迁移后的全量测试）。
- 在 docs/issues/known-issues.md 与 harness-task-breakdown.md Track H 索引表同步
  状态为已完成，附提交哈希；同步回填 docs/specs/2026-07-23-ai-development-harness.md
  §6.6（导出参数存储位置待办）。

完成条件（对齐 issue-06 §A.6 + §B.5）：
- [ ] projects 表迁移已生成并可在全新数据库与既有数据库上无损应用
- [ ] PATCH /api/projects/[id] 校验非法 resolutionPreset 返回 400 且不落库；合法值
      成功持久化
- [ ] exportProject() 按项目 exportSettings 选择分辨率；默认预设仍走 -c:v copy
      无损路径，产出结果与改动前逐字节一致
- [ ] 非默认预设导出产物的实际分辨率经 ffprobe（或等价手段）校验与所选预设一致
- [ ] 已渲染的单镜 mp4（render-mp4 artifact）不因切换导出分辨率而失效或重新入队渲染
- [ ] 合成导出页分辨率 SettingsRow 改为真实受控组件
- [ ] checkThumbnailQa() 对已知黑帧样本与正常样本分别返回正确结果，有单元测试覆盖阈值边界
- [ ] shot-qa 节点在缩略图产出后写入真实 qaCheck 字段，contentHash 不变时不重复计算
- [ ] GET /api/render/export 返回的 shotQa 对未检测分镜返回 null 而非默认 true
- [ ] 合成导出页每个分镜的 ContactSheetThumb 勾选状态来自 shotQa
- [ ] pnpm lint && pnpm tsc --noEmit && pnpm build 通过；pnpm test 通过
- [ ] known-issues.md / harness-task-breakdown.md 状态已同步
```

## 4. 并行施工的通用注意事项（沿用前六个 issue 收尾时踩过的坑）

1. **工作区可能不是干净的单一分支**：前六个 issue 处理期间反复出现多会话同时改共享文档（`known-issues.md`、`harness-task-breakdown.md`）、甚至互相把对方未完成的改动带入暂存区的情况。建议：每个 Goal 会话独立 `git worktree`，提交前用 `git diff --cached --name-only` 核对只包含自己 issue 范围内的文件，禁止 `git add -A`。
2. **文档行号会漂移**：issue-05/06 文档写作时引用的行号，在 issue-01/03/04/07/08 落地后大概率已经偏移（这六个 issue 都改过 `features/render/` 或 `features/canvas/` 的相邻代码）。开工第一步必须重新 `Read`/`Grep` 核实真实行号，不能直接信文档里的 `196:218:...` 引用。
3. **提交后务必同步三处文档**：`docs/issues/known-issues.md` 索引表 + 变更记录、`docs/specs/2026-07-23-harness-task-breakdown.md` 的 Track H 表、issue 文件自身的状态头与完成条件复选框——本次审查发现的最大遗留问题就是这三处文档没有跟上代码进度，别重复这个疏漏。
4. **验证基线**：施工前先跑一遍 `pnpm lint && pnpm tsc --noEmit && pnpm test && pnpm build` 记录基线（当前 `main` @ 干净工作区应为全绿：60 files / 208 tests），施工中如果看到与自己改动无关的报错，先怀疑是并行会话的未提交 WIP，不要为了让自己的 issue "变绿"去越界修复别人的文件。
