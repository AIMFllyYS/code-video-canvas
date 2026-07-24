# issue-08 — export-service StorageAdapter 边界治理

| 字段 | 值 |
|---|---|
| 优先级 | P2 |
| Wave | 2（`docs/specs/2026-07-23-harness-task-breakdown.md` Track H），纯重构，随时可做 |
| 依赖 | 无 |
| 关联证据 | `docs/updates/2026-07-23-cloud-e2e-review-report.md` §7.3（已记录未修的遗留技术债） |
| 状态 | **已完成**（2026-07-24） |

## 背景

AGENTS.md「存储」小节明确要求"二进制产物走 `StorageAdapter`；不要在业务里散落裸 `fs` 调用"，但 `export-service.ts` 从合并导出功能落地起就一直违反这条边界，2026-07-23 e2e 审查已记录为遗留问题但未修复。

## 根因

```1:71:src/features/render/export-service.ts
import 'server-only'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
...
export async function exportProject(
  projectId: string,
  dependencies: ExportDependencies = {}
): Promise<ExportProjectResult> {
  ...
  const root = dependencies.tempRoot ?? os.tmpdir()
  await mkdir(root, { recursive: true })
  const workDirectory = await mkdtemp(path.join(root, 'cvc-export-'))
  try {
    const temporaryOutput = path.join(workDirectory, 'final.mp4')
    await concat(...)
    const bytes = await readFile(temporaryOutput)
    const contentHash = createHash('sha256').update(bytes).digest('hex')
    const outputKey = await storage.put(`exports/${projectId}/final-${contentHash}.mp4`, bytes)
    ...
  } finally {
    await rm(workDirectory, { recursive: true, force: true })
  }
}
```

`mkdir`/`mkdtemp`/`readFile`/`rm` 全部直接从 `node:fs/promises` 导入，绕过 `StorageAdapter`。现有 `StorageAdapter` 接口（`src/lib/storage/types.ts`）只有 `put`/`get`/`exists`/`localPath`/`delete` 五个方法，没有"创建临时工作目录"这个能力，这是当年落地时选择裸 `fs` 的直接原因——不是疏忽，是接口确实缺这个方法。

## 修复方案

扩展 `StorageAdapter` 接口新增：

```typescript
export interface StorageAdapter {
  put(key: string, data: Buffer | Uint8Array | string): Promise<string>
  get(key: string): Promise<Buffer>
  exists(key: string): Promise<boolean>
  localPath(key: string): string
  delete(key: string): Promise<void>
  /** 新增：创建隔离临时工作目录，返回本机绝对路径；调用方负责后续 removeTempDir 清理 */
  tempDir(prefix: string): Promise<string>
  /** 新增：从本机绝对路径读取文件内容（区别于 get()，get() 按 storage key 读，本方法按临时目录内的绝对路径读） */
  readLocalFile(absolutePath: string): Promise<Buffer>
  /** 新增：递归删除临时工作目录 */
  removeTempDir(absolutePath: string): Promise<void>
}
```

本地实现（`src/lib/storage/local.ts` 或等价文件）内部实现时仍然会用到 `node:fs/promises`，但这是**适配器实现内部的实现细节**，符合"细节收口在一处"的目标——AGENTS.md 的边界是"业务代码不散落裸 `fs`"，不是"整个项目零处出现 `fs`"。

`export-service.ts` 改为：

```typescript
const workDirectory = await storage.tempDir('cvc-export-')
try {
  const temporaryOutput = path.join(workDirectory, 'final.mp4')
  await concat(...)
  const bytes = await storage.readLocalFile(temporaryOutput)
  ...
} finally {
  await storage.removeTempDir(workDirectory)
}
```

## 允许改动范围 / 禁止改动 / 完成条件

**目标**：`export-service.ts` 消除直接 `node:fs/promises` 导入，临时目录/读取/清理全部通过 `StorageAdapter` 扩展方法完成。

**前置任务**：无。

**允许改动范围**：
- `src/lib/storage/types.ts`（接口新增三个方法）
- `src/lib/storage/**` 的本地实现文件（新增方法实现）
- `src/features/render/export-service.ts`
- 对应测试（`export-service.test.ts`、`storage` 相关测试）

**禁止改动**：
- `src/features/render/concat.ts`（ffmpeg 参数拼接逻辑不变，只改调用方怎么拿到临时目录路径）
- 不改变 `exportProject()` 的公开签名与行为（同一份输入产出同一份输出，只是内部实现路径改变）

**完成条件**：
- [x] `export-service.ts` 全文零处 `import ... from 'node:fs/promises'`
- [x] `StorageAdapter` 扩展方法有独立单元测试覆盖（临时目录创建/清理、异常路径下清理仍执行）
- [x] 现有 `export-service.test.ts`/导出相关集成测试全部通过，行为无回归
- [x] `pnpm lint && pnpm tsc --noEmit && pnpm build` 通过
