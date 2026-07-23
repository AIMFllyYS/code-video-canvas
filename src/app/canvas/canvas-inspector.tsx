'use client'

import { FileCode, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { ArtifactChip } from '@/components/ui/artifact-chip'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SettingsGroup, SettingsSeparator } from '@/components/ui/settings-group'
import { SettingsRow } from '@/components/ui/settings-row'
import { StatusPill, type StatusPillVariant } from '@/components/ui/status-pill'
import { Toast } from '@/components/ui/toast'
import type { CanvasGraphNode } from '@/features/canvas'
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
  if (!node) {
    return <aside className="w-80 border-l border-separator bg-surface p-4 text-sm text-label-secondary">分镜合同</aside>
  }
  const progress = node.status === 'success' ? 100 : node.status === 'running' ? 62 : 0

  async function execute() {
    setSubmitting(true)
    setError(undefined)
    try {
      await triggerNodeAction(projectId, node!)
      onQueued()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '作业入队失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-auto border-l border-separator bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold">{node.laneKey ?? NODE_LABEL[node.type]}</h2>
        <StatusPill variant={STATUS_VARIANT[node.status]} />
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
      <Button variant="tinted" icon={RefreshCw} onClick={execute} disabled={submitting}>
        {node.type === 'shot-codegen' ? '重渲此镜' : '全部渲染'}
      </Button>
      {node.type === 'shot-codegen' && (
        <Button variant="gray">查看代码</Button>
      )}
      {error && <Toast variant="error" title="失败" body={error} className="w-full" />}
    </aside>
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
