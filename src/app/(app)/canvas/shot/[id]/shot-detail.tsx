'use client'

import Link from 'next/link'
import {
  ArrowLeft,
  Download,
  FileCode,
  Play,
  RefreshCw,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsGroup, SettingsSeparator } from '@/components/ui/settings-group'
import { SettingsRow } from '@/components/ui/settings-row'
import { StatusPill } from '@/components/ui/status-pill'
import { TopBar } from '@/components/ui/top-bar'
import { Toast } from '@/components/ui/toast'
import { usePublishNavContext } from '@/features/navigation/nav-context'
import { ShotPanelChrome, useShotPanelState } from './shot-panels'
import { renderShotAndWait } from './shot-api'

export function ShotDetail({
  projectId,
  projectTitle,
  nodeId,
  laneKey,
  sourceText,
  previousNodeId,
  nextNodeId,
  previewUrl,
}: {
  projectId: string
  projectTitle: string
  nodeId: string
  laneKey: string
  sourceText: string
  previousNodeId?: string
  nextNodeId?: string
  previewUrl?: string
}) {
  const runtime = useShotRuntime(projectId, nodeId, previewUrl)
  const panels = useShotPanelState()

  usePublishNavContext({ projectId, rendererNodeId: nodeId })

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar
          title={
            <span className="flex items-center gap-2">
              <Link href={`/canvas?projectId=${projectId}`} aria-label="返回画布">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              {laneKey} · {projectTitle}
              <StatusPill
                variant={
                  runtime.outputUrl
                    ? 'rendered'
                    : runtime.rendering
                      ? 'generating'
                      : 'pending'
                }
              />
            </span>
          }
          actions={
            <>
              <ShotLink label="上一镜" nodeId={previousNodeId} projectId={projectId} />
              <ShotLink label="下一镜" nodeId={nextNodeId} projectId={projectId} />
              <Button
                variant="tinted"
                size="sm"
                icon={RefreshCw}
                onClick={runtime.render}
                disabled={runtime.rendering}
              >
                重渲此镜
              </Button>
              {runtime.outputUrl && (
                <a href={runtime.outputUrl} download>
                  <Button size="sm" icon={Download}>导出 MP4</Button>
                </a>
              )}
            </>
          }
        />
        <ShotPanelChrome
          panels={panels}
          player={
            <ShotPlayer
              outputUrl={runtime.outputUrl}
              previewUrl={previewUrl}
              error={runtime.error}
            />
          }
          codeContent={
            <ShotCode
              sourceCode={runtime.sourceCode}
              codeLoading={runtime.codeLoading}
              onRender={runtime.render}
              rendering={runtime.rendering}
            />
          }
          contractContent={<ShotContract laneKey={laneKey} sourceText={sourceText} />}
        />
      </main>
  )
}

function useShotRuntime(projectId: string, nodeId: string, previewUrl?: string) {
  const [rendering, setRendering] = useState(false)
  const [outputUrl, setOutputUrl] = useState<string>()
  const [sourceCode, setSourceCode] = useState(
    previewUrl ? '' : '分镜代码尚未生成',
  )
  const [codeLoading, setCodeLoading] = useState(Boolean(previewUrl))
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!previewUrl) return
    void fetch(previewUrl)
      .then((response) => {
        if (!response.ok) throw new Error('分镜代码读取失败')
        return response.text()
      })
      .then(setSourceCode)
      .catch(() => setSourceCode('分镜代码读取失败'))
      .finally(() => setCodeLoading(false))
  }, [previewUrl])

  async function render() {
    setRendering(true)
    setError(undefined)
    try {
      const result = await renderShotAndWait(projectId, nodeId)
      if (result.status === 'failed') setError(result.error ?? '单镜渲染失败')
      else setOutputUrl(result.artifactUrl)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '单镜渲染失败')
    } finally {
      setRendering(false)
    }
  }
  return { rendering, outputUrl, sourceCode, codeLoading, error, render }
}

function ShotLink({
  label,
  nodeId,
  projectId,
}: {
  label: string
  nodeId?: string
  projectId: string
}) {
  if (!nodeId) return <Button variant="gray" size="sm" disabled>{label}</Button>
  return (
    <Link href={`/canvas/shot/${nodeId}?projectId=${projectId}`}>
      <Button variant="gray" size="sm">{label}</Button>
    </Link>
  )
}

function ShotPlayer({
  outputUrl,
  previewUrl,
  error,
}: {
  outputUrl?: string
  previewUrl?: string
  error?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex h-[480px] items-center justify-center overflow-hidden rounded-lg bg-player-bg">
        {outputUrl ? (
          <video src={outputUrl} controls className="h-full w-full" />
        ) : previewUrl ? (
          <iframe
            title="确定性分镜预览"
            src={previewUrl}
            sandbox="allow-scripts"
            className="h-full w-full border-0"
          />
        ) : (
          <Play className="h-10 w-10 text-text-inverse" />
        )}
      </div>
      <div className="flex h-12 items-center gap-3">
        <IconButton icon={SkipBack} aria-label="上一帧" />
        <IconButton icon={Play} aria-label="播放" />
        <IconButton icon={SkipForward} aria-label="下一帧" />
        <span className="text-xs font-mono text-label-secondary">00:03:12 / 00:08:00</span>
        <ProgressBar value={40} className="flex-1" />
        <Volume2 className="h-4 w-4 text-label-tertiary" />
      </div>
      <div className="grid h-18 grid-cols-8 gap-1">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className={
              index === 2
                ? 'rounded-sm border border-accent bg-fill'
                : 'rounded-sm bg-fill'
            }
          />
        ))}
      </div>
      {error && <Toast variant="error" title="失败" body={error} />}
    </div>
  )
}

function ShotCode({
  sourceCode,
  codeLoading,
  onRender,
  rendering,
}: {
  sourceCode: string
  codeLoading: boolean
  onRender: () => void
  rendering: boolean
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <FileCode className="h-4 w-4 text-accent" />分镜画布代码
        </span>
        <span className="text-[11px] text-success">已同步</span>
      </div>
      {codeLoading ? (
        <div className="min-h-0 flex-1 space-y-2 rounded-md bg-bg-secondary p-3">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-3" style={{ width: `${92 - index * 9}%` }} />
          ))}
        </div>
      ) : (
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md bg-bg-secondary p-3 text-[11px] leading-relaxed text-label-secondary">
          {sourceCode}
        </pre>
      )}
      <Button variant="tinted" icon={RefreshCw} onClick={onRender} disabled={rendering}>
        重渲此镜
      </Button>
    </div>
  )
}

function ShotContract({ laneKey, sourceText }: { laneKey: string; sourceText: string }) {
  return (
    <aside className="flex min-w-0 flex-col gap-4">
      <h2 className="text-[13px] font-semibold text-label-secondary">分镜合同</h2>
      <SettingsGroup>
        <SettingsRow label="分镜编号" value={laneKey} />
        <SettingsSeparator />
        <SettingsRow label="构图模式" value="center-stack" />
        <SettingsSeparator />
        <SettingsRow label="分辨率" value="540×960" />
      </SettingsGroup>
      <h2 className="text-[13px] font-semibold text-label-secondary">字幕</h2>
      <div className="rounded-sm bg-fill p-2">
        <p className="mb-1 text-xs font-mono text-accent">00:00–结束</p>
        <p className="text-[13px]">{sourceText}</p>
      </div>
      <p className="flex items-center gap-2 text-xs text-label-secondary">
        <ShieldCheck className="h-3.5 w-3.5 text-success" />
        无 rAF / 无墙钟 · 通过
      </p>
    </aside>
  )
}
