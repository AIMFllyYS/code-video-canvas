# N1.5 Trigger.dev Realtime Spike Evidence

## 结论

- 日期：2026-07-25
- SDK/CLI 版本：`4.5.7`
- 当前结果：`external-auth-blocked`
- 完成边界：最小 `cvc.pipeline.run`、typed safe progress stream、真实 trigger/
  run subscription 探针均已实现并通过静态门禁。
- 未完成边界：尚未取得真实 run，因此没有生成
  `.data/spikes/trigger.json`，也不宣称 Realtime spike 通过。
- Scoped token 正/负测试按计划 deferred 到 N2.5；本 Task 未提前实现 run API 或
  Realtime UI。

## 实现合同

- 唯一登记 task ID：`cvc.pipeline.run`
- payload：`{schemaVersion:1, probeId:string, requestedAt:string}`
- typed stream event：
  `{schemaVersion:1, phase:'started'|'completed', probeId:string}`
- 预期顺序：`started → completed → COMPLETED`
- task 不访问 Drizzle、DAG、模型、文件系统或业务流程。
- 探针只持久化 run ID 的 SHA-256、typed event hash、event schema/version、
  event sequence 与 terminal status；不保存 raw run ID、payload 或认证材料。

## 本机认证检查

检查只记录变量是否存在，未读取或输出值：

| 来源 | `TRIGGER_ACCESS_TOKEN` | `TRIGGER_SECRET_KEY` | `TRIGGER_PROJECT_REF` |
|---|---:|---:|---:|
| process | absent | absent | absent |
| user | absent | absent | absent |
| machine | absent | absent | absent |
| repo `.env*` variable names | absent | absent | absent |

`pnpm exec trigger whoami --log-level error` 的 CLI 文本结果为
`You must login first`。该命令本身返回 0，因此这里只把返回文本作为认证状态证据，
不把退出码误判为已登录。

## 真实运行尝试

### Trigger dev worker

```powershell
pnpm dev:trigger
```

- exit code：`1`
- 精确阻塞：`You must login first. Use the login CLI command.`
- 后续文本：`Failed to create authorization code`、`Connection error.`
- 判断：worker 未连接，task 未注册或执行。

### Realtime probe

```powershell
pnpm tsx scripts/spikes/trigger-realtime-probe.ts
```

- exit code：`1`
- 精确阻塞：
  `TRIGGER_SECRET_KEY is required to run the Trigger.dev Realtime probe`
- 判断：探针在任何网络请求前 fail closed；未写伪造 evidence。

## 静态门禁

```powershell
pnpm eslint trigger.config.ts trigger/tasks/pipeline-run.ts scripts/spikes/trigger-realtime-probe.ts
pnpm typecheck
git diff --check -- trigger.config.ts trigger/tasks/pipeline-run.ts scripts/spikes/trigger-realtime-probe.ts
```

三项 exit code 均为 `0`。源码只含一个 task ID；typed stream 只发送 bounded
`started/completed` 事件，不含 model delta、reasoning 或业务数据。

## 认证恢复后的重试

先在本机完成 Trigger.dev CLI 登录并准备已有项目的 server-only 配置；变量值不得
进入源码、日志、证据或 Git：

```powershell
pnpm exec trigger login --profile default
$env:TRIGGER_PROJECT_REF='<existing-project-ref>'
$env:TRIGGER_SECRET_KEY='<server-only-project-key>'
```

随后分别在两个终端运行：

```powershell
pnpm dev:trigger
```

```powershell
pnpm tsx scripts/spikes/trigger-realtime-probe.ts
```

通过条件是本地 ignored evidence
`.data/spikes/trigger.json` 含 `passed:true`、版本 `4.5.7`、两个小写 64 位十六进制
SHA-256、`['started','completed']` 与 terminal `COMPLETED`；仅 worker 注册成功不算
通过。
