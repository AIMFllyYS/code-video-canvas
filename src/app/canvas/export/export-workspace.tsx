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
import { loadExportReadiness, startProjectExport, type ExportReadiness } from './export-api'

const SHOT_CLIPS = ['开场', '概念', '图解', '代码', '案例', '总结'].map((label, index) => ({
  start: index * 100 + 4,
  width: 92,
  label,
}))

export function ExportWorkspace({ projectId }: { projectId: string }) {
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

  const disabled = !readiness?.ready || exporting
  return (
    <main className="min-h-screen bg-bg text-label">
      <TopBar
        title="合成与导出"
        actions={<Button size="sm" icon={Download} disabled={disabled} onClick={exportVideo}>导出 MP4</Button>}
      />
      <section className="flex flex-col items-center gap-2 p-6">
        <div className="flex h-[270px] w-[480px] items-center justify-center overflow-hidden rounded-lg bg-overlay">
          {outputUrl ? <video src={outputUrl} controls className="h-full w-full" /> : <Film className="h-10 w-10 text-text-inverse" />}
        </div>
        <p className="text-xs text-label-tertiary">RAG 十分钟入门</p>
      </section>
      <section className="flex flex-col gap-2 px-6">
        <TimelineTrack icon={Film} label="分镜" clips={SHOT_CLIPS} />
        <TimelineTrack icon={Captions} label="字幕" clips={SHOT_CLIPS.slice(0, 4)} color="bg-stage-direct" />
        <TimelineTrack icon={AudioLines} label="配音" clips={[{ start: 4, width: 596, label: '配音' }]} color="bg-stage-audio" />
        <TimelineTrack icon={Music} label="BGM" clips={[{ start: 4, width: 596, label: '配乐' }]} color="bg-stage-assemble" />
      </section>
      <section className="grid grid-cols-[320px_minmax(0,1fr)] gap-6 p-6">
        <SettingsGroup>
          <SettingsRow label="分辨率" value="1080×1920 · 竖屏" />
          <SettingsSeparator />
          <SettingsRow label="帧率" value="30 fps" />
          <SettingsSeparator />
          <SettingsRow label="格式" value="MP4 (H.264)" />
          <SettingsSeparator />
          <SettingsRow label="字幕烧录"><Toggle checked readOnly /></SettingsRow>
          <div className="flex flex-col gap-3 p-4">
            <Button icon={Download} disabled={disabled} onClick={exportVideo}>开始导出</Button>
            <ProgressBar value={outputUrl ? 100 : exporting ? 62 : 0} label="导出队列" className="w-full" />
          </div>
        </SettingsGroup>
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-[13px] font-semibold">Final QA · 抽帧审查</h2>
            <p className="text-xs text-label-tertiary">25% / 60% / 95% 三态联系表</p>
          </div>
          <div className="flex gap-4">
            {['镜头 01', '镜头 02', '镜头 03', '镜头 04'].map((label, index) => (
              <ContactSheetThumb key={label} label={label} checked={index !== 2} />
            ))}
          </div>
          {!readiness?.ready && readiness && (
            <>
              <p className="flex items-center gap-2 text-xs text-label-secondary">
                <TriangleAlert className="h-3.5 w-3.5 text-warning" />
                未完成分镜
              </p>
              <div className="flex flex-wrap gap-2">
                {readiness.incompleteNodeIds.map((id) => <ArtifactChip key={id} filename={id} />)}
              </div>
            </>
          )}
          {error && <Toast variant="error" title="失败" body={error} />}
        </div>
      </section>
    </main>
  )
}
