import type { ReactNode } from 'react'
import {
  Download,
  Film,
  Folder,
  LayoutDashboard,
  Settings,
  Waypoints,
} from 'lucide-react'
import { NavItem } from '@/components/ui/nav-item'
import {
  Sidebar,
  SidebarBrand,
  SidebarDivider,
  SidebarFooter,
  SidebarLocalStatus,
  SidebarNav,
  SidebarSearch,
  SidebarSection,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

export type AppSection =
  | 'workbench'
  | 'projects'
  | 'canvas'
  | 'renderer'
  | 'export'
  | 'settings'

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
 * S1–S6 均以同一个 240px Sidebar symbol 为首列；页面只切换激活项，
 * 不再各自实现导航或顶部品牌栏。
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
      <AppSidebar
        active={active}
        projectId={projectId}
        rendererNodeId={rendererNodeId}
      />
      <div className={cn('min-w-0 flex-1', contentClassName)}>{children}</div>
    </div>
  )
}

export function AppSidebar({
  active,
  projectId,
  rendererNodeId,
}: {
  active: AppSection
  projectId?: string
  rendererNodeId?: string
}) {
  const canvasHref = projectHref('/canvas', projectId)
  const rendererHref =
    projectId && rendererNodeId
      ? `/canvas/shot/${encodeURIComponent(rendererNodeId)}?projectId=${encodeURIComponent(projectId)}`
      : canvasHref

  return (
    <Sidebar className="shrink-0">
      <SidebarBrand />
      <SidebarSearch aria-label="搜索项目" />
      <SidebarSection>项目</SidebarSection>
      <SidebarNav>
        <NavItem icon={LayoutDashboard} href="/" active={active === 'workbench'}>
          工作台
        </NavItem>
        <NavItem icon={Folder} href="/projects" active={active === 'projects'}>
          项目列表
        </NavItem>
        <NavItem icon={Waypoints} href={canvasHref} active={active === 'canvas'}>
          画布编辑器
        </NavItem>
        <NavItem icon={Film} href={rendererHref} active={active === 'renderer'}>
          分镜渲染器
        </NavItem>
        <NavItem
          icon={Download}
          href={projectId ? projectHref('/canvas/export', projectId) : canvasHref}
          active={active === 'export'}
        >
          合成与导出
        </NavItem>
      </SidebarNav>
      <SidebarDivider />
      <SidebarFooter>
        <NavItem
          icon={Settings}
          href={projectHref('/settings', projectId)}
          active={active === 'settings'}
        >
          设置
        </NavItem>
        <SidebarLocalStatus />
      </SidebarFooter>
    </Sidebar>
  )
}

function projectHref(pathname: string, projectId?: string): string {
  return projectId
    ? `${pathname}?projectId=${encodeURIComponent(projectId)}`
    : pathname
}
