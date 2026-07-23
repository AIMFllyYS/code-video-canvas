import { cn } from '@/lib/utils'

export type StatusPillVariant = 'pending' | 'generating' | 'rendered' | 'cached' | 'failed'

export interface StatusPillProps {
  variant?: StatusPillVariant
  label?: string
  className?: string
}

const STYLES: Record<StatusPillVariant, { bg: string; dot: string; defaultLabel: string }> = {
  pending: { bg: 'bg-fill', dot: 'bg-label-tertiary', defaultLabel: '待生成' },
  generating: { bg: 'bg-accent-fill', dot: 'bg-accent', defaultLabel: '生成中' },
  rendered: { bg: 'bg-success-fill', dot: 'bg-success', defaultLabel: '已渲染' },
  cached: { bg: 'bg-teal-fill', dot: 'bg-teal', defaultLabel: '已缓存' },
  failed: { bg: 'bg-danger-fill', dot: 'bg-danger', defaultLabel: '失败' },
}

/**
 * 状态胶囊（SSOT）。
 * canvas.pen: pill 形、*-fill 底、6px 色点 + 11px 标签。
 */
export function StatusPill({ variant = 'pending', label, className }: StatusPillProps) {
  const style = STYLES[variant]
  return (
    <div
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 rounded-pill px-2.5',
        style.bg,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      <span className="text-[11px] font-medium font-sc text-label">{label ?? style.defaultLabel}</span>
    </div>
  )
}
