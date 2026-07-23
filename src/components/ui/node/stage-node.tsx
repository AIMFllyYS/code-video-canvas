import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { stageColorToken } from './stage-colors'
import type { NodeStage, NodeStatus } from './types'

export interface StageNodeProps {
  stage: NodeStage
  name: string
  icon: ComponentType<{ className?: string }>
  status?: NodeStatus
  chips?: ReactNode
  className?: string
}

const STATUS_DOT: Record<NodeStatus, string> = {
  pending: 'bg-label-tertiary',
  running: 'bg-accent',
  success: 'bg-success',
  failed: 'bg-danger',
}

/**
 * 阶段节点（SSOT）。
 * canvas.pen: 200×120、surface 底、rounded-md、1.5px 阶段色描边、shadow-card；
 * 左右各一个连接端口。
 */
export function StageNode({ stage, name, icon: Icon, status = 'pending', chips, className }: StageNodeProps) {
  const color = stageColorToken(stage)
  return (
    <div
      className={cn(
        'relative flex h-[120px] w-[200px] flex-col rounded-md border-[1.5px] bg-surface shadow-card',
        color,
        className,
      )}
    >
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4', color.split(' ')[0])} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold font-sc text-label">
            {name}
          </span>
          <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[status])} />
        </div>
        <div className="flex flex-col gap-1">{chips}</div>
      </div>
      <div
        className={cn(
          'absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-[1.5px] bg-surface',
          color,
        )}
      />
      <div
        className={cn(
          'absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-[1.5px] bg-surface',
          color,
        )}
      />
    </div>
  )
}
