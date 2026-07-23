import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'
import { stageColorToken } from './stage-colors'
import type { NodeStage, NodeStatus } from './types'

export interface AudioNodeProps {
  stage?: NodeStage
  title: string
  icon: ComponentType<{ className?: string }>
  status?: NodeStatus
  bars?: number[]
  className?: string
}

const STATUS_DOT: Record<NodeStatus, string> = {
  pending: 'bg-label-tertiary',
  running: 'bg-accent',
  success: 'bg-success',
  failed: 'bg-danger',
}

/**
 * 音频节点（SSOT）。
 * canvas.pen: 200 宽、surface 底、rounded-md、1.5px 阶段色描边、shadow-card；
 * 头部 + 音浪条。
 */
export function AudioNode({
  stage = 'audio',
  title,
  icon: Icon,
  status = 'pending',
  bars = [12, 22, 8, 28, 16, 24, 10, 20, 14, 26, 6, 18],
  className,
}: AudioNodeProps) {
  const color = stageColorToken(stage)
  return (
    <div
      className={cn(
        'flex w-[200px] flex-col gap-2 rounded-md border-[1.5px] bg-surface p-3 shadow-card',
        color,
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', color.split(' ')[0])} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold font-sc text-label">
          {title}
        </span>
        <span className={cn('h-2 w-2 rounded-full', STATUS_DOT[status])} />
      </div>
      <div className="flex h-8 items-end gap-0.5">
        {bars.map((h, i) => (
          <div
            key={i}
            className={cn('w-[3px] rounded-sm', stage === 'audio' ? 'bg-stage-audio' : 'bg-stage-finalize')}
            style={{ height: `${h}px` }}
          />
        ))}
      </div>
    </div>
  )
}
