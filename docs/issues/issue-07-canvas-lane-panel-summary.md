# issue-07 — 画布分镜通道折叠面板信息摘要

| 字段 | 值 |
|---|---|
| 优先级 | P2 |
| Wave | 2（`docs/specs/2026-07-23-harness-task-breakdown.md` Track H） |
| 依赖 | 无 |
| 状态 | 待施工 |

## 背景

画布左上角"分镜通道"面板（`src/app/(app)/canvas/canvas-view.tsx` 的 `LanePanel`）是用户判断"某个分镜通道的 5 个节点分别处于什么状态"的直觉入口，但当前"折叠/展开"只是控制 React Flow 节点的可见性开关，面板本身不承载任何详情摘要——用户点"展开"预期能看到点什么，实际只是让画布上重新显示回那 5 个节点。

## 根因

```119:149:src/app/(app)/canvas/canvas-view.tsx
interface LanePanelProps {
  laneKeys: string[]
  collapsedLanes: Set<string>
  onToggle: (laneKey: string) => void
}

function LanePanel({ laneKeys, collapsedLanes, onToggle }: LanePanelProps) {
  return (
    <aside className="absolute left-4 top-4 max-h-[calc(100%-8rem)] w-56 overflow-auto rounded-md border border-separator bg-glass p-3 shadow-float backdrop-blur-xl">
      <p className="mb-2 text-xs font-semibold text-label">分镜通道 · {laneKeys.length}</p>
      <div className="space-y-1">
        {laneKeys.map((laneKey) => {
          const collapsed = collapsedLanes.has(laneKey)
          return (
            <Button
              key={laneKey}
              variant="gray"
              size="sm"
              aria-pressed={collapsed}
              onClick={() => onToggle(laneKey)}
              className="w-full justify-between"
            >
              <span className="truncate">{laneKey}</span>
              <span className="text-label-secondary">{collapsed ? '展开' : '折叠'}</span>
            </Button>
          )
        })}
      </div>
    </aside>
  )
}
```

`LanePanel` 只接收 `laneKeys`（字符串数组）+ `collapsedLanes`（折叠状态集合）+ `onToggle` 回调，不接收任何节点详情数据（`data`/`status`）——即使把这些数据传进来，组件也没有渲染详情区的 JSX 结构。已确认本轮 motion/resizable 系列改动完全未触碰此文件（唯一"零改动"的目标文件），不是被动效改动掩盖，是从设计上就没有这个能力。

（附带发现，同文件第 88 行：TopBar 的「全部渲染」按钮是 `disabled` 的死按钮，不在本 issue 范围，建议另记入技术债或在本 issue 施工时顺手确认是否需要一并处理。）

## 修复方案

给 `LanePanel` 增加展开态摘要区，最小可行方案（不依赖新设计稿输入，复用已登记组件）：

1. `CanvasView` 传给 `LanePanel` 的 `laneKeys` 改为携带该通道 5 个节点的摘要信息（可以从已有的 `nodes` prop 按 `laneKey` 分组派生，不需要新的 API 请求）：

```typescript
interface LaneSummary {
  laneKey: string
  nodes: { type: CanvasNodeType; status: NodeStatus }[]
}
```

2. 展开态下，每个通道条目下方追加一行小号 `StatusPill` 序列（5 个，对应 `shot-script/shot-codegen/shot-sfx/shot-subtitle/shot-qa`），一眼看出该分镜通道整体进度（比如"3 个成功 / 1 个运行中 / 1 个待处理"）。
3. 可选增强：追加该分镜脚本片段的前 N 个字符（从 `shot-script` 节点的 `data.sourceUnit.text` 取，若存在），帮助用户不点进详情页就能识别是哪一段内容。

不需要新增 API：所有数据已经在 `CanvasView` 现有的 `nodes` prop 里，只是 `LanePanel` 没有使用。

## 允许改动范围 / 禁止改动 / 完成条件

**目标**：分镜通道折叠面板展开态展示该通道 5 个子节点的真实状态摘要，而不只是一个可见性开关。

**前置任务**：无。

**允许改动范围**：
- `src/app/(app)/canvas/canvas-view.tsx`
- `src/app/(app)/canvas/flow-elements.tsx`（若需要共享按 `laneKey` 分组的辅助函数）

**禁止改动**：
- `src/features/canvas/fan-out.ts`、`layout.ts`、`status.ts`（不改数据模型，只在前端派生展示用的分组视图）

**完成条件**：
- [ ] 展开某个分镜通道后，面板内可见该通道 5 个子节点的真实状态徽章
- [ ] 不发起额外网络请求（复用已有 `nodes` prop 派生）
- [ ] `pnpm lint && pnpm tsc --noEmit && pnpm build` 通过
