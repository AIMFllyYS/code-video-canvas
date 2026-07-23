'use client'

import { AudioLines, Captions, Download, Film, Music, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ArtifactChip } from '@/components/ui/artifact-chip'
import { Button } from '@/components/ui/button'
import { ContactSheetThumb } from '@/components/ui/contact-sheet-thumb'
import { ProgressBar } from '@/components/ui/progress-bar'
import { SettingsGroup, SettingsSeparator } from '@/components/ui/settings-group'
import { SettingsRow } from '@/components/ui/settings-row'
import { TimelineTrack } from '@/components/ui/timeline-track'
import { Toggle } from '@/components/ui/toggle'
import { TopBar } from '@/components/ui/top-bar'
import { Toast } from '@/components/ui/toast'
import { AppShell } from '@/features/navigation/app-shell'
import { loadExportReadiness, startProjectExport, type ExportReadiness } from './export-api'
import { buildShotClips, fullTrackClip } from './export-view-model'

export function ExportWorkspace({
  projectId,
  projectTitle,
  laneKeys,
  rendererNodeId,
}: {
  projectId: string
  projectTitle: string
  laneKeys: string[]
  rendererNodeId?: string
}) {
  const runtime = useExportRuntime(projectId)
  const disabled = !runtime.readiness?.ready || runtime.exporting
  const shotClips = buildShotClips(laneKeys)
  return (
    <AppShell active="export" projectId={projectId} rendererNodeId={rendererNodeId}>
      <main className="h-full overflow-y-auto bg-bg text-label">
        <TopBar
          title="合成与导出"
          actions={<Button size="sm" icon={Download} disabled={disabled} onClick={runtime.exportVideo}>导出 MP4</Button>}
        />
        <ExportPreview projectTitle={projectTitle} outputUrl={runtime.outputUrl} />
        <ExportTimeline laneKeys={laneKeys} shotClips={shotClips} />
        <ExportReview
          laneKeys={laneKeys}
          readiness={runtime.readiness}
          outputUrl={runtime.outputUrl}
          exporting={runtime.exporting}
          error={runtime.error}
          disabled={disabled}
          onExport={runtime.exportVideo}
        />
      </main>
    </AppShell>
  )
}

function useExportRuntime(projectId: string) {
  const [readiness, setReadiness] = useState<ExportReadiness>()
  const [outputUrl, setOutputUrl] = useState<string>()
  const [error, setError] = useState<string>()
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    void loadExportReadiness(projectId).then(setReadiness).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : '导出状态读取失败')
    })
  }, [projectId])

  async function exportVideo() {
    setExporting(true)
    setError(undefined)
    try {
      setOutputUrl(await startProjectExport(projectId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '终片导出失败')
    } finally {
      setExporting(false)
    }
  }

  return { readiness, outputUrl, error, exporting, exportVideo }
}

function ExportPreview({ projectTitle, outputUrl }: { projectTitle: string; outputUrl?: string }) {
  return (
    <section className="flex h-[257px] flex-col items-center gap-2 p-4">
      <div className="flex h-[200px] w-[480px] items-center justify-center overflow-hidden rounded-lg bg-player-bg">
        {outputUrl ? <video src={outputUrl} controls className="h-full w-full" /> : <Film className="h-10 w-10 text-text-inverse" />}
      </div>
      <p className="text-xs text-label-tertiary">{projectTitle} · 成片预览</p>
    </section>
  )
}

function ExportTimeline({ laneKeys, shotClips }: { laneKeys: string[]; shotClips: ReturnType<typeof buildShotClips> }) {
  return (
    <section className="flex flex-col gap-1 px-6">
      <div className="flex h-5 justify-between border-b border-separator text-[11px] font-mono text-label-tertiary">
        {['00:00', '00:20', '00:40', '01:00', '01:20'].map((time) => <span key={time}>{time}</span>)}
      </div>
      <TimelineTrack icon={Film} label="分镜" clips={shotClips} />
      <TimelineTrack icon={Captions} label="字幕" clips={shotClips} color="bg-stage-direct" />
      <TimelineTrack icon={AudioLines} label="配音" clips={fullTrackClip('配音', laneKeys.length)} color="bg-stage-audio" />
      <TimelineTrack icon={Music} label="BGM" clips={fullTrackClip('配乐', laneKeys.length)} color="bg-stage-assemble" />
    </section>
  )
}

function ExportReview(props: {
  laneKeys: string[]
  readiness?: ExportReadiness
  outputUrl?: string
  exporting: boolean
  error?: string
  disabled: boolean
  onExport: () => void
}) {
  return (
    <section className="grid grid-cols-[320px_minmax(0,1fr)] gap-4 p-4">
      <ExportSettings {...props} />
      <ExportQa {...props} />
    </section>
  )
}

function ExportSettings({ outputUrl, exporting, disabled, onExport }: Pick<Parameters<typeof ExportReview>[0], 'outputUrl' | 'exporting' | 'disabled' | 'onExport'>) {
  return (
    <SettingsGroup>
      <SettingsRow label="分辨率" value="1080×1920 · 竖屏" />
      <SettingsSeparator />
      <SettingsRow label="帧率" value="30 fps" />
      <SettingsSeparator />
      <SettingsRow label="格式" value="MP4 (H.264)" />
      <SettingsSeparator />
      <SettingsRow label="字幕烧录"><Toggle checked readOnly /></SettingsRow>
      <div className="flex flex-col gap-3 p-4">
        <Button icon={Download} disabled={disabled} onClick={onExport}>开始导出</Button>
        <ProgressBar value={outputUrl ? 100 : exporting ? 62 : 0} label="导出队列" className="w-full" />
      </div>
    </SettingsGroup>
  )
}

function ExportQa({ laneKeys, readiness, error }: Pick<Parameters<typeof ExportReview>[0], 'laneKeys' | 'readiness' | 'error'>) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-semibold">Final QA · 抽帧审查</h2>
        <p className="text-xs text-label-tertiary">25% / 60% / 95% 三态联系表</p>
      </div>
      <div className="flex gap-4 overflow-x-auto">
        {laneKeys.map((laneKey) => <ContactSheetThumb key={laneKey} label={laneKey} checked />)}
      </div>
      {!readiness?.ready && readiness && (
        <>
          <p className="flex items-center gap-2 text-xs text-label-secondary">
            <TriangleAlert className="h-3.5 w-3.5 text-warning" />未完成分镜
          </p>
          <div className="flex max-h-20 flex-wrap gap-2 overflow-auto">
            {readiness.incompleteNodeIds.map((id) => <ArtifactChip key={id} filename={id} />)}
          </div>
        </>
      )}
      {error && <Toast variant="error" title="失败" body={error} />}
    </div>
  )
}
