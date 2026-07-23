import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { ReactNode } from 'react'
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill'
import type { CanvasGraphEdge, CanvasGraphNode } from '@/features/canvas'
import { cn } from '@/lib/utils'

type ViewNode = Node<{
  label: ReactNode
  type: CanvasGraphNode['type']
  status: CanvasGraphNode['status']
  laneKey: string | null
}>

export function toFlowNode(
  node: CanvasGraphNode,
  hiddenNodeIds: Set<string>,
  collapsedLanes: Set<string>
): ViewNode {
  const collapsed = Boolean(node.laneKey && collapsedLanes.has(node.laneKey))
  return {
    id: node.id,
    position: node.position,
    hidden: hiddenNodeIds.has(node.id),
    className: cn(
      '!w-[220px] !rounded-md !border-2 !bg-surface !p-0 !shadow-card',
      NODE_STAGE_CLASS[node.type]
    ),
    data: {
      type: node.type,
      status: node.status,
      laneKey: node.laneKey,
      label: nodeLabel(node, collapsed),
    },
  }
}

export function toFlowEdge(edge: CanvasGraphEdge, hiddenNodeIds: Set<string>): Edge {
  return {
    ...edge,
    hidden: hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target),
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: 'var(--color-label-tertiary)' },
  }
}

function nodeLabel(node: CanvasGraphNode, collapsed: boolean): ReactNode {
  return (
    <div className="flex min-h-20 flex-col items-start justify-between gap-3 p-3 text-left">
      <div>
        <p className="text-[13px] font-semibold text-label">{NODE_LABEL[node.type]}</p>
        {node.laneKey && (
          <p className="mt-1 text-[11px] text-label-secondary">{node.laneKey}</p>
        )}
      </div>
      <StatusPill
        variant={STATUS_VARIANT[node.status]}
        label={
          collapsed && node.type === 'shot-script'
            ? '已折叠 · 5 节点'
            : STATUS_LABEL[node.status]
        }
      />
    </div>
  )
}

const STATUS_VARIANT: Record<CanvasGraphNode['status'], StatusPillVariant> = {
  idle: 'pending',
  pending: 'pending',
  running: 'generating',
  success: 'rendered',
  failed: 'failed',
  stale: 'cached',
}

const STATUS_LABEL: Record<CanvasGraphNode['status'], string> = {
  idle: '空闲',
  pending: '待执行',
  running: '执行中',
  success: '已完成',
  failed: '失败',
  stale: '需更新',
}

const NODE_LABEL: Record<CanvasGraphNode['type'], string> = {
  'script-import': '脚本导入',
  'shot-split': '语义拆分',
  score: '全局配乐',
  export: '合并导出',
  'shot-script': '分镜脚本',
  'shot-codegen': '代码生成',
  'shot-sfx': '音效',
  'shot-subtitle': '字幕',
  'shot-qa': '验收',
}

const NODE_STAGE_CLASS: Record<CanvasGraphNode['type'], string> = {
  'script-import': '!border-stage-ingest',
  'shot-split': '!border-stage-ingest',
  score: '!border-stage-assemble',
  export: '!border-stage-finalize',
  'shot-script': '!border-stage-shot',
  'shot-codegen': '!border-stage-direct',
  'shot-sfx': '!border-stage-audio',
  'shot-subtitle': '!border-stage-audio',
  'shot-qa': '!border-stage-finalize',
}
