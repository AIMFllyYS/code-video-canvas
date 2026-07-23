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
