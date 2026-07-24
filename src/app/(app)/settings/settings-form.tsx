'use client'

import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SettingsGroup, SettingsSeparator } from '@/components/ui/settings-group'
import { SettingsRow } from '@/components/ui/settings-row'
import { StatusPill } from '@/components/ui/status-pill'
import { Skeleton } from '@/components/ui/skeleton'
import { TextField } from '@/components/ui/text-field'
import { Toggle } from '@/components/ui/toggle'
import { Toast } from '@/components/ui/toast'
import type { StepfunConfigView, StepfunModelField } from '@/features/ai/config'
import { usePublishNavContext } from '@/features/navigation/nav-context'
import { ThemeControl } from './theme-control'

type ValidationState = 'unconfigured' | 'validating' | 'valid' | 'invalid'

const MODEL_FIELD_LABELS: Record<StepfunModelField, string> = {
  baseUrl: '端点',
  chatModel: 'Chat 模型',
  ttsModel: 'TTS 模型',
  asrModel: 'ASR 模型',
  visionModel: 'Vision 模型',
}

const MODEL_FIELD_ORDER: StepfunModelField[] = [
  'baseUrl',
  'chatModel',
  'ttsModel',
  'asrModel',
  'visionModel',
]

type ModelDraft = Record<StepfunModelField, string>

const EMPTY_DRAFT: ModelDraft = {
  baseUrl: '',
  chatModel: '',
  ttsModel: '',
  asrModel: '',
  visionModel: '',
}

interface SettingsResponse {
  configured?: boolean
  models?: StepfunConfigView
  renderConcurrency?: number
  storageDir?: string
}

/** settings 表已保存覆盖值时回显该值；否则留空，由 placeholder 展示 env/默认生效值。 */
function draftFromModels(models: StepfunConfigView | undefined): ModelDraft {
  if (!models) return EMPTY_DRAFT
  return MODEL_FIELD_ORDER.reduce((acc, field) => {
    acc[field] = models[field].source === 'settings' ? models[field].value : ''
    return acc
  }, { ...EMPTY_DRAFT })
}

function placeholderFor(field: StepfunConfigView[StepfunModelField] | undefined): string {
  if (!field) return ''
  if (field.source === 'env') return `${field.value}（跟随环境变量）`
  if (field.source === 'default') return `${field.value}（内置默认）`
  return field.value
}

export function SettingsForm({
  projectId,
  rendererNodeId,
}: {
  projectId?: string
  rendererNodeId?: string
}) {
  const [apiKey, setApiKey] = useState('')
  const [reveal, setReveal] = useState(false)
  const [state, setState] = useState<ValidationState>('unconfigured')
  const [initializing, setInitializing] = useState(true)
  const [error, setError] = useState<string>()

  const [models, setModels] = useState<StepfunConfigView>()
  const [draft, setDraft] = useState<ModelDraft>(EMPTY_DRAFT)
  const [modelSaving, setModelSaving] = useState(false)
  const [modelSaved, setModelSaved] = useState(false)
  const [renderConcurrency, setRenderConcurrency] = useState<number>()
  const [storageDir, setStorageDir] = useState<string>()

  usePublishNavContext({ projectId, rendererNodeId })

  useEffect(() => {
    void fetch('/api/settings')
      .then((response) => response.json() as Promise<SettingsResponse>)
      .then((body) => {
        setState(body.configured ? 'valid' : 'unconfigured')
        setModels(body.models)
        setDraft(draftFromModels(body.models))
        setRenderConcurrency(body.renderConcurrency)
        setStorageDir(body.storageDir)
      })
      .catch(() => setState('unconfigured'))
      .finally(() => setInitializing(false))
  }, [])

  async function validateAndSave() {
    if (!apiKey.trim()) {
      setState('invalid')
      setError('StepFun Key 校验失败 · 请检查 Key 是否正确')
      return
    }
    setState('validating')
    setError(undefined)
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    })
    const body: unknown = await response.json()
    if (response.ok) {
      setApiKey('')
      setState('valid')
      return
    }
    setState('invalid')
    setError(
      body && typeof body === 'object' && !Array.isArray(body) &&
      typeof (body as Record<string, unknown>).error === 'string'
        ? String((body as Record<string, unknown>).error)
        : 'StepFun Key 校验失败 · 请检查 Key 是否正确'
    )
  }

  async function saveModelSettings() {
    setModelSaving(true)
    setModelSaved(false)
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const body = (await response.json()) as SettingsResponse
      if (response.ok) {
        setModels(body.models)
        setDraft(draftFromModels(body.models))
        setModelSaved(true)
      }
    } finally {
      setModelSaving(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-[720px] flex-1 flex-col gap-6 overflow-y-auto px-4 py-10">
        <h1 className="text-[28px] font-bold">设置</h1>
        <SettingsSection title="STEPFUN 模型服务">
          <SettingsRow label="API Key">
            <TextField
              aria-label="StepFun API Key"
              type={reveal ? 'text' : 'password'}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="sk-••••••••••••3f9c"
              className="w-[260px]"
            />
            <Button size="sm" variant="gray" onClick={validateAndSave} disabled={state === 'validating'}>校验</Button>
            {initializing ? (
              <Skeleton className="h-6 w-20 rounded-pill" />
            ) : (
              <StatusPill {...statusProps(state)} />
            )}
          </SettingsRow>
          <SettingsSeparator />
          <SettingsRow label="显示 Key"><Toggle checked={reveal} onCheckedChange={setReveal} /></SettingsRow>
          {MODEL_FIELD_ORDER.map((field) => (
            <div key={field}>
              <SettingsSeparator />
              <SettingsRow label={MODEL_FIELD_LABELS[field]}>
                {initializing ? (
                  <Skeleton className="h-9 w-[260px] rounded-md" />
                ) : (
                  <TextField
                    aria-label={MODEL_FIELD_LABELS[field]}
                    value={draft[field]}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, [field]: event.target.value }))
                    }
                    placeholder={placeholderFor(models?.[field])}
                    className="w-[260px]"
                  />
                )}
              </SettingsRow>
            </div>
          ))}
          <SettingsSeparator />
          <SettingsRow label="模型设置">
            <span className="text-[13px] text-label-tertiary">留空回退环境变量/内置默认</span>
            <Button size="sm" variant="gray" onClick={saveModelSettings} disabled={modelSaving}>
              保存
            </Button>
            {modelSaved && <StatusPill variant="rendered" label="已保存" />}
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title="渲染">
          <SettingsRow
            label="渲染并发数"
            value={renderConcurrency ? `${renderConcurrency}（CPU 核数，暂不可配置）` : undefined}
          />
          <SettingsSeparator />
          <SettingsRow label="导出分辨率">
            {projectId ? (
              <Link
                href={`/canvas/export?projectId=${encodeURIComponent(projectId)}`}
                className="text-[13px] text-accent underline-offset-2 hover:underline"
              >
                按项目在导出页配置
              </Link>
            ) : (
              <span className="text-[13px] text-label-tertiary">按项目在导出页配置</span>
            )}
          </SettingsRow>
          <SettingsSeparator />
          <SettingsRow label="存储位置" value={storageDir ?? undefined} />
          <SettingsSeparator />
          <SettingsRow label="崩溃续渲">
            {/* Demo 占位：队列作业状态已落 SQLite，但暂无崩溃后自动重新入队的恢复逻辑，
                见 docs/issues/issue-10-*.md；不得用恒 checked 的 Toggle 伪装为已实现。 */}
            <span className="text-[13px] text-label-tertiary">尚未实现（Demo 占位）</span>
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title="外观">
          <SettingsRow label="主题">
            <ThemeControl />
          </SettingsRow>
        </SettingsSection>
        <SettingsSection title="关于">
          <SettingsRow label="版本" value="0.1.0 (Demo)" />
          <SettingsSeparator />
          <SettingsRow label="本地模式">
            <span className="flex items-center gap-2 text-[13px] text-label-secondary">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />数据不出本机
            </span>
          </SettingsRow>
        </SettingsSection>
        {error && <Toast variant="error" title="StepFun Key 校验失败" body="请检查 Key 是否正确" />}
        <p className="text-center text-xs text-label-tertiary">CodeVideoCanvas · 本地优先的 AIGC 视频创作引擎</p>
    </main>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs text-label-tertiary">{title}</h2>
      <SettingsGroup>{children}</SettingsGroup>
    </section>
  )
}

function statusProps(state: ValidationState) {
  if (state === 'valid') return { variant: 'rendered' as const, label: '已验证' }
  if (state === 'invalid') return { variant: 'failed' as const, label: '校验失败' }
  if (state === 'validating') return { variant: 'generating' as const, label: '生成中' }
  return { variant: 'pending' as const, label: '未配置' }
}
