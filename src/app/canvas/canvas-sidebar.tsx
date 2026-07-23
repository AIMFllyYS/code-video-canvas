import { AppSidebar } from '@/features/navigation/app-shell'

/** @deprecated 画布与其他页面统一使用 AppShell；保留薄适配避免旧引用复制侧栏。 */
export function CanvasSidebar({
  projectId,
  rendererNodeId,
}: {
  projectId?: string
  rendererNodeId?: string
}) {
  return (
    <AppSidebar
      active="canvas"
      projectId={projectId}
      rendererNodeId={rendererNodeId}
    />
  )
}
