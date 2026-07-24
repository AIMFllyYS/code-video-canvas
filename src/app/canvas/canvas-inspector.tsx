'use client'

import { ChevronRight, FileCode, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ArtifactChip } from '@/components/ui/artifact-chip'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { ResizeHandle } from '@/components/ui/resize-handle'
import { SettingsGroup, SettingsSeparator } from '@/components/ui/settings-group'
import { SettingsRow } from '@/components/ui/settings-row'
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill'
import { Toast } from '@/components/ui/toast'
import type { CanvasGraphNode } from '@/features/canvas'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { usePersistentToggle } from '@/lib/hooks/use-persistent-toggle'
import { useResizablePanel } from '@/lib/hooks/use-resizable-panel'
import {
  BP_SECONDARY_PANEL_COLLAPSE,
  INSPECTOR_DEFAULT_WIDTH,
  INSPECTOR_MAX_WIDTH,
  INSPECTOR_MIN_WIDTH,
} from '@/lib/layout/breakpoints'
import { cn } from '@/lib/utils'
import { triggerNodeAction } from './canvas-action-api'

export function CanvasInspector({
  projectId,
  node,
  onQueued,
}: {
  projectId: string
  node?: CanvasGraphNode
  onQueued: () => void
}) {
  const [error, setError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  const autoCollapse = useMediaQuery(`(max-width: ${BP_SECONDARY_PANEL_COLLAPSE - 1}px)`)
  const [manualCollapsed, setManualCollapsed] = usePersistentToggle(
    'cvc:inspector-collapsed',
    false,
  )
  const { width, isDragging, handlePointerDown, setWidth } = useResizablePanel({
    storageKey: 'cvc:inspector-width',
    defaultWidth: INSPECTOR_DEFAULT_WIDTH,
    min: INSPECTOR_MIN_WIDTH,
    max: INSPECTOR_MAX_WIDTH,
    invert: true,
  })
  const [overlayRequested, setOverlayRequested] = useState(false)

  const collapsed = autoCollapse || manualCollapsed
  const overlayOpen = collapsed && overlayRequested

  useEffect(() => {
    if (!overlayOpen) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOverlayRequested(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overlayOpen])

  async function execute() {
    if (!node) return
    setSubmitting(true)
    setError(undefined)
    try {
      await triggerNodeAction(projectId, node)
      onQueued()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '作业入队失败')
    } finally {
      setSubmitting(false)
    }
  }

  const body = node ? (
    <InspectorBody
      node={node}
      progress={node.status === 'success' ? 100 : node.status === 'running' ? 62 : 0}
      submitting={submitting}
      error={error}
      onExecute={execute}
      onCollapse={() => {
        setManualCollapsed(true)
        setOverlayRequested(false)
      }}
      showCollapse={!autoCollapse}
    />
  ) : (
    <EmptyInspector
      onCollapse={() => {
        setManualCollapsed(true)
        setOverlayRequested(false)
      }}
      showCollapse={!autoCollapse}
    />
  )

  if (collapsed && !overlayOpen) {
    return (
      <aside className="flex w-8 shrink-0 flex-col items-center border-l border-separator bg-surface py-3">
        <IconButton
          icon={ChevronRight}
          aria-label="展开分镜合同"
          className="[&>svg]:rotate-180"
          onClick={() => {
            if (autoCollapse) setOverlayRequested(true)
            else setManualCollapsed(false)
          }}
        />
      </aside>
    )
  }

  if (collapsed && overlayOpen) {
    return (
      <>
        <aside className="flex w-8 shrink-0 flex-col items-center border-l border-separator bg-surface py-3">
          <IconButton
            icon={ChevronRight}
            aria-label="关闭分镜合同"
            onClick={() => setOverlayRequested(false)}
          />
        </aside>
        <button
          type="button"
          aria-label="关闭分镜合同遮罩"
          className="fixed inset-0 z-40 bg-scrim"
          onClick={() => setOverlayRequested(false)}
        />
        <div
          className="fixed inset-y-0 right-0 z-50 flex shadow-float"
          style={{ width }}
        >
          <ResizeHandle
            isDragging={isDragging}
            onPointerDown={handlePointerDown}
            onKeyAdjust={(delta) => setWidth(width - delta)}
            aria-label="调节分镜合同宽度"
          />
          <div className="min-w-0 flex-1 overflow-auto border-l border-separator bg-surface">
            {body}
          </div>
        </div>
      </>
    )
  }

  return (
    <aside
      className="relative flex shrink-0 flex-col border-l border-separator bg-surface"
      style={{ width }}
    >
      <ResizeHandle
        className="absolute inset-y-0 left-0"
        isDragging={isDragging}
        onPointerDown={handlePointerDown}
        onKeyAdjust={(delta) => setWidth(width - delta)}
        aria-label="调节分镜合同宽度"
      />
      {body}
    </aside>
  )
}

function EmptyInspector({
  onCollapse,
  showCollapse,
}: {
  onCollapse: () => void
  showCollapse: boolean
}) {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-label-secondary">分镜合同</p>
        {showCollapse && (
          <IconButton
            icon={ChevronRight}
            aria-label="收起分镜合同"
            onClick={onCollapse}
          />
        )}
      </div>
    </div>
  )
}

function InspectorBody({
  node,
  progress,
  submitting,
  error,
  onExecute,
  onCollapse,
  showCollapse,
}: {
  node: CanvasGraphNode
  progress: number
  submitting: boolean
  error?: string
  onExecute: () => void
  onCollapse: () => void
  showCollapse: boolean
}) {
  return (
    <div className={cn('flex h-full flex-col gap-4 overflow-auto p-4')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-[17px] font-semibold">
          {node.laneKey ?? NODE_LABEL[node.type]}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <StatusPill variant={STATUS_VARIANT[node.status]} />
          {showCollapse && (
            <IconButton
              icon={ChevronRight}
              aria-label="收起分镜合同"
              onClick={onCollapse}
            />
          )}
        </div>
      </div>
      <div className="flex h-40 items-center justify-center rounded-sm bg-fill">
        <FileCode className="h-10 w-10 text-label-tertiary" />
      </div>
      <SettingsGroup>
        <SettingsRow label="节点类型" value={node.type} />
        <SettingsSeparator />
        <SettingsRow label="执行阶段" value={node.stage ?? '未配置'} />
        <SettingsSeparator />
        <SettingsRow label="内容哈希" value="待生成" />
      </SettingsGroup>
      <div>
        <p className="mb-2 text-[13px] font-semibold text-label-secondary">分镜合同 shot-plan</p>
        <div className="flex flex-wrap gap-2">
          <ArtifactChip icon={FileCode} filename="shot-plan.json" />
          <ArtifactChip icon={FileCode} filename="script-units.json" />
        </div>
      </div>
      <ProgressBar value={progress} label="生成进度" className="w-full" />
      <Button variant="tinted" icon={RefreshCw} onClick={onExecute} disabled={submitting}>
        {node.type === 'shot-codegen' ? '重渲此镜' : '全部渲染'}
      </Button>
      {node.type === 'shot-codegen' && (
        <Button variant="gray">查看代码</Button>
      )}
      {error && <Toast variant="error" title="失败" body={error} className="w-full" />}
    </div>
  )
}

const STATUS_VARIANT: Record<CanvasGraphNode['status'], StatusPillVariant> = {
  idle: 'pending',
  pending: 'pending',
  running: 'generating',
  success: 'rendered',
  failed: 'failed',
  stale: 'stale',
}

const NODE_LABEL: Record<CanvasGraphNode['type'], string> = {
  'script-import': 'Ingest 语义分镜',
  'shot-split': 'Direct 风格圣经',
  score: 'Assemble 合成',
  export: 'Finalize 导出',
  'shot-script': 'Shot-Spec 分镜合同',
  'shot-codegen': 'Shot 分镜节点',
  'shot-sfx': 'Audio 配音字幕',
  'shot-subtitle': 'Audio 配音字幕',
  'shot-qa': 'Finalize 验收',
}
