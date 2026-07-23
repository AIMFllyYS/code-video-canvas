import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

export interface ArtifactChipProps {
  icon?: ComponentType<{ className?: string }>
  filename: string
  className?: string
}

/**
 * 工件文件名芯片（SSOT）。
 * canvas.pen: fill 底、rounded-sm、h-[26px]、gap-1.5、px-2 py-1。
 */
export function ArtifactChip({ icon: Icon, filename, className }: ArtifactChipProps) {
  return (
    <div
      className={cn(
        'inline-flex h-[26px] items-center gap-1.5 rounded-sm bg-fill px-2 py-1',
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3 text-label-secondary" />}
      <span className="text-[11px] font-mono text-label">{filename}</span>
    </div>
  )
}
