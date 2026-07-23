import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface NavItemProps {
  icon: ComponentType<{ className?: string }>
  children: ReactNode
  active?: boolean
  className?: string
}

/**
 * 导航项（SSOT）。
 * canvas.pen: 32px 高、rounded-sm、gap-2、px-2.5 py-1.5；
 * active 时 fill-strong 底 + accent 图标 + label 加粗字。
 */
export function NavItem({ icon: Icon, children, active, className }: NavItemProps) {
  return (
    <div
      className={cn(
        'flex h-8 items-center gap-2 rounded-sm px-2.5 py-1.5',
        active ? 'bg-fill-strong' : 'bg-transparent',
        className,
      )}
    >
      <Icon className={cn('h-4 w-4', active ? 'text-accent' : 'text-label-secondary')} />
      <span
        className={cn(
          'text-[13px] font-sc',
          active ? 'font-semibold text-label' : 'font-normal text-label-secondary',
        )}
      >
        {children}
      </span>
    </div>
  )
}
