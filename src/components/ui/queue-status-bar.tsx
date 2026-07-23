import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface QueueStatusBarProps {
  completed: number
  total: number
  label?: string
  rightLabel?: string
  className?: string
}

/**
 * 渲染队列状态条（SSOT）。
 * canvas.pen: surface 底、上边框 separator、h-9、px-4；
 * 左侧 loader + 标签 + 迷你进度，右侧辅助信息。
 */
export function QueueStatusBar({
  completed,
  total,
  label,
  rightLabel,
  className,
}: QueueStatusBarProps) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  return (
    <div
      className={cn(
        'flex h-9 items-center justify-between border-t border-separator bg-surface px-4',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin text-accent" />
        <span className="text-xs font-sc text-label-secondary">
          {label ?? `渲染队列 · ${completed}/${total} 节点完成`}
        </span>
        <div className="h-1 w-[120px] rounded-sm bg-fill">
          <div className="h-1 rounded-sm bg-accent" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <span className="text-xs font-sc text-label-tertiary">
        {rightLabel ?? '本地渲染 · 命中缓存 5 次'}
      </span>
    </div>
  )
}
