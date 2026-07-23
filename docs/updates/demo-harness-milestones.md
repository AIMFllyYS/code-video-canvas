# Demo Harness 里程碑验收记录

> 本文件记录 Track 级 Tier B 结论；Task 级状态仍以
> `docs/specs/2026-07-23-harness-task-breakdown.md` 为唯一权威来源。

## Track F — Foundation

- 完成范围：F0.1–F0.7，全部状态与代码一致。
- 静态门禁：`pnpm lint`、`pnpm tsc --noEmit`、`pnpm build` 全部通过。
- 测试：4 个测试文件、14 条测试通过。
- 集成证据：真实 StepFun Provider 单轮调用成功；Pi JSONL 会话可创建/读取；
  Chromium 可启动；`ffmpeg-static` 可执行。
- 确定性：源码守卫可复用导出，相关扫描通过。
- 发现并修正：Node 最低版本、Pi SDK 入口、环境变量契约、会话持久化边界与
  Tool 注入边界原规格不一致，已同步修正 Harness/平台架构。
- 遗留/跳过：无。

## Track C — Canvas DAG

- 完成范围：C1.1–C1.5，全部状态与代码一致。
- 静态门禁：`pnpm lint`、`pnpm tsc --noEmit`、`pnpm build` 全部通过。
- 测试：8 个测试文件、24 条测试通过。
- 浏览器集成：50 条 lane、254 个节点可加载；折叠后节点数 254→250；
  连续缩放后 DOM 元素裁剪至 95；缩放约 292 ms、平移约 152 ms；无控制台错误。
- 数据隔离：浏览器验收所用项目与节点已按精确 ID 清理。
- 发现并修正：C1.4 原任务缺少画布读模型范围，已新增
  `getCanvasGraph(projectId)` 边界并同步架构规范。
- 遗留/跳过：无。

## Track D — Director

- 完成范围：D0.1–D1.5，全部状态与代码一致。
- 静态门禁：`pnpm lint`、`pnpm tsc --noEmit`、`pnpm build` 全部通过。
- 测试：Director/API 定向 13 个测试文件、42 条测试通过；项目全量 21 个测试
  文件、66 条测试通过。
- 运行时依赖：`src/` 零处读取 `docs/video-director/`，零
  `pi-coding-agent`/Skills/Extensions 运行时依赖。
- 确定性：Director/render 相关非测试源码扫描无违规；FABRICATE 输出在可信写入
  服务中对同一内容再次调用确定性守卫。
- 真实集成：隔离 `DATA_DIR` 下通过生产 HTTP 完成
  `POST /api/director/stage → 持久队列 → StepFun → DirectorSession → artifact`。
  作业一次完成、节点为 success；生成相对路径 Pi JSONL（3 条记录）与 INGEST
  产物，文件存在、内容哈希匹配、UTF-8 无替换字符、会话无凭据模式。
- 调用控制：本 Track 仅执行上述一次真实 StepFun Director 调用；其他阶段使用
  schema/prompt/Tool/runner 单测验证。
- 发现并修正：原规格缺少持久阶段输入、合法状态转换、repository 端口与 Next
  启动入口；另发现模型写 artifact 的越权/双写风险，以及 enqueue 非原子和
  stage 错配风险。现已统一为 `directorInput` + 类型化 prompt、可信写服务、
  `instrumentation.ts`、入队前置校验与失败补偿，并同步更新 AGENTS、架构规范、
  Harness、平台架构和任务路线图。
- 遗留/跳过：无。

## Track R — Render

- 完成范围：R1.1–R1.6，全部状态与代码一致。
- 静态门禁：`pnpm lint`、`pnpm tsc --noEmit`、`pnpm build` 全部通过。
- 测试：项目全量 34 个测试文件、98 条测试连续两轮通过；API 的请求校验、
  节点归属、入队与未完成节点 409 均有覆盖。
- 真实渲染：从隔离 StorageAdapter 路径加载自包含 shot artifact，经真实
  Chromium/CDP 截取 6 帧并由真实 ffmpeg 编码；相同可信输入连续两次得到相同
  contentHash、outputKey 与逐字节一致的非空 mp4。
- 真实合并：真实 ffmpeg concat 测试完成有序镜头拼接并验证时长；缺失输入时
  明确失败且不提交终片。
- 确定性：Render/守卫相关非测试源码扫描无 rAF、墙钟、无种子随机、ticker、
  timer 或 CSS animation/transition 违规；截图前守卫失败路径为零截图、零编码、
  零 artifact。
- 资源与状态：帧序列写隔离磁盘目录并显式 cleanup；renderer 使用版本化内容
  哈希与 StorageAdapter；enqueue/handler 成功、渲染失败和入队失败均不遗留
  pending/running。
- 发现并修正：原测试 shot 依赖工作区相对 `node_modules`，复制到 artifact
  存储后 runtime 失效，现将 shot 合同收紧为可搬运、自包含、位置无关，并同步
  AGENTS、Harness、平台架构和 FABRICATE prompt。
- 发现并修正：Director/Render queue 与 runner 在模块导入时急切打开默认
  SQLite，导致并行测试争用；现改为 enqueue/handler 执行时延迟创建 repository，
  新增“模块导入不得访问 DB”边界测试，全量测试连续两轮稳定通过。
- 遗留/跳过：无。

## Track A — Audio

- 完成范围：A1.1，状态与代码一致。
- 静态门禁：`pnpm lint`、`pnpm tsc --noEmit`、`pnpm build` 全部通过。
- 测试：Audio 定向 4 个测试文件、4 条测试通过；项目全量 38 个测试文件、
  102 条测试通过。
- 功能验收：字幕、配音、音效、配乐四个公开异步函数均从 `features/audio`
  统一入口调用成功，不抛异常，并返回含 `status: placeholder`、
  `implementation: P1`、`占位实现，P1 补齐` 的结构化结果。
- 发现并修正：原任务遗漏配乐对应 PRD F12，且允许范围排除了接口定稿所需的
  `types.ts`、`index.ts` 与强制要求的测试；已修正任务卡并建立稳定对象输入、
  结构化结果和 barrel export。
- 遗留/跳过：真实 TTS/ASR/SFX/BGM 生成按任务定义属于 P1，Demo 有意使用
  明确占位结果，不计为跳过。

## Track P — Pencil 组件港口

- 完成范围：P0.1–P1.5，全部状态与实际代码一致。
- Pencil 证据：通过 Pencil MCP 读取 `canvas.pen` 当前 30 个
  `reusable:true` symbols 的真实结构、变量、截图；四个 Button symbols
  由一个 `variant` 组件承载，故 `/playbook` 登记 27 个 Pencil UI 组件族，
  并另列 1 个 Lucide 白名单目录。
- 静态门禁：`pnpm lint`、`pnpm tsc --noEmit`、`pnpm build` 全部通过。
- 测试：项目全量 40 个测试文件、113 条测试通过；登记表测试固定 30→27 的
  完整映射，九种 `CanvasNodeType` 的视觉阶段色均有显式测试。
- 浏览器验收：生产构建的 `/playbook`、`/playbook/ui`、`/playbook/icons`
  在 1440px 视口真实加载；27 个组件标题、37 个白名单图标、30/27 数量说明
  均可见，浅色背景与暗色 `#0F0F0F` 正确，控制台零错误。
- 交互验收：Dialog 可打开/关闭，Toggle 可从开切到关，SegmentedControl
  可切换选中项；节点组件至少覆盖 pending/running/success/stale 等多种状态。
- 视觉核对：B1–B4 逐组导出 Pencil PNG，并对 Button、Dialog、Sidebar、
  StageNode、ShotNode 等代表组件做生产页面像素核对；ShotNode 的预览、状态、
  时长、菜单、重渲和缓存标记均与底稿结构一致。
- 图标与 token：源码零旧 Lucide 名、零 emoji 图标；Pencil Sidebar 实际使用的
  `waypoints` 已补入白名单，UI 交接文档中的旧图标名、`$indigo`、硬编码
  overlay/grid 色已改为当前标准名与 token。
- 发现并修正：Node UI 曾复制旧四态状态并把 Agent stage 当节点类型；现统一
  复用 canvas 域的九种节点类型与六态状态，并同步 AGENTS、Harness 与平台架构。
- 遗留/跳过：无。旧 Card/LogoMark 文件暂由尚未进入 Track U 重写的占位页面
  使用，但已从 Track P registry 移除，不能被后续页面视为 Pencil 登记组件。
