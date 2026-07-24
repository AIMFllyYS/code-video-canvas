import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { AppSidebar } from './app-sidebar'
import { AppSidebarShell } from './app-sidebar-shell'
import type { AppSection } from './types'

export type { AppSection }
export { AppSidebar }

export interface AppShellProps {
  active: AppSection
  children: ReactNode
  projectId?: string
  rendererNodeId?: string
  className?: string
  contentClassName?: string
}

/**
 * 最新 canvas.pen 的统一应用壳。
 *
 * S1–S6 均以同一个 Sidebar symbol 为首列；页面只切换激活项，
 * 不再各自实现导航或顶部品牌栏。响应式/可调宽交互下沉到 AppSidebarShell。
 */
export function AppShell({
  active,
  children,
  projectId,
  rendererNodeId,
  className,
  contentClassName,
}: AppShellProps) {
  return (
    <div className={cn('flex h-screen w-screen overflow-hidden bg-bg text-label', className)}>
      <AppSidebarShell
        active={active}
        projectId={projectId}
        rendererNodeId={rendererNodeId}
      />
      <div className={cn('min-w-0 flex-1', contentClassName)}>{children}</div>
    </div>
  )
}
