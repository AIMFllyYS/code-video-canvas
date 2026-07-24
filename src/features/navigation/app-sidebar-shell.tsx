'use client'

import { useEffect, useState } from 'react'
import { ChevronRight, LayoutDashboard } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'
import { ResizeHandle } from '@/components/ui/resize-handle'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { usePersistentToggle } from '@/lib/hooks/use-persistent-toggle'
import { useResizablePanel } from '@/lib/hooks/use-resizable-panel'
import {
  BP_SIDEBAR_HIDDEN,
  BP_SIDEBAR_RAIL,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_RAIL_WIDTH,
} from '@/lib/layout/breakpoints'
import { AppSidebar } from './app-sidebar'
import type { AppSection } from './types'

export type SidebarMode = 'expanded' | 'rail' | 'hidden'

/** 纯函数：互斥三态。hidden > rail > expanded。 */
export function resolveSidebarMode(
  isHidden: boolean,
  isNarrow: boolean,
  manualCollapsed: boolean,
): SidebarMode {
  if (isHidden) return 'hidden'
  if (isNarrow || manualCollapsed) return 'rail'
  return 'expanded'
}

export function AppSidebarShell({
  active,
  projectId,
  rendererNodeId,
}: {
  active: AppSection
  projectId?: string
  rendererNodeId?: string
}) {
  const isHidden = useMediaQuery(`(max-width: ${BP_SIDEBAR_HIDDEN - 1}px)`)
  const isNarrow = useMediaQuery(`(max-width: ${BP_SIDEBAR_RAIL - 1}px)`)
  const [manualCollapsed, setManualCollapsed] = usePersistentToggle(
    'cvc:sidebar-collapsed',
    false,
  )
  const { width, isDragging, handlePointerDown, setWidth } = useResizablePanel({
    storageKey: 'cvc:sidebar-width',
    defaultWidth: SIDEBAR_DEFAULT_WIDTH,
    min: SIDEBAR_MIN_WIDTH,
    max: SIDEBAR_MAX_WIDTH,
  })
  const [drawerRequested, setDrawerRequested] = useState(false)

  const mode = resolveSidebarMode(isHidden, isNarrow, manualCollapsed)
  const drawerOpen = mode === 'hidden' && drawerRequested

  useEffect(() => {
    if (!drawerOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerRequested(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  if (mode === 'hidden') {
    return (
      <>
        <IconButton
          icon={LayoutDashboard}
          aria-label="打开导航"
          className="fixed left-2 top-2 z-40 shadow-float"
          onClick={() => setDrawerRequested(true)}
        />
        {drawerOpen && (
          <>
            <button
              type="button"
              aria-label="关闭导航遮罩"
              className="fixed inset-0 z-40 bg-scrim"
              onClick={() => setDrawerRequested(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 shadow-float">
              <AppSidebar
                active={active}
                projectId={projectId}
                rendererNodeId={rendererNodeId}
                style={{ width: SIDEBAR_DEFAULT_WIDTH }}
              />
            </div>
          </>
        )}
      </>
    )
  }

  if (mode === 'rail') {
    return (
      <div className="relative flex h-full shrink-0">
        <AppSidebar
          active={active}
          projectId={projectId}
          rendererNodeId={rendererNodeId}
          compact
          style={{ width: SIDEBAR_RAIL_WIDTH }}
        />
        {!isNarrow && (
          <IconButton
            icon={ChevronRight}
            aria-label="展开侧边栏"
            className="absolute -right-3 top-3 z-20 shadow-card"
            onClick={() => setManualCollapsed(false)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="relative flex h-full shrink-0">
      <AppSidebar
        active={active}
        projectId={projectId}
        rendererNodeId={rendererNodeId}
        style={{ width }}
      />
      <div className="absolute right-2 top-3 z-20">
        <IconButton
          icon={ChevronRight}
          aria-label="收起侧边栏"
          className="shadow-card [&>svg]:rotate-180"
          onClick={() => setManualCollapsed(true)}
        />
      </div>
      <ResizeHandle
        className="absolute inset-y-0 right-0"
        isDragging={isDragging}
        onPointerDown={handlePointerDown}
        onKeyAdjust={(delta) => setWidth(width + delta)}
        aria-label="调节导航侧边栏宽度"
      />
    </div>
  )
}
