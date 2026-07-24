'use client'

import { ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SettingsGroup, SettingsSeparator } from '@/components/ui/settings-group'
import { SettingsRow } from '@/components/ui/settings-row'
import { StatusPill } from '@/components/ui/status-pill'
import { TextField } from '@/components/ui/text-field'
import { Toggle } from '@/components/ui/toggle'
import { Toast } from '@/components/ui/toast'
import { AppShell } from '@/features/navigation/app-shell'
import { ThemeControl } from './theme-control'

type ValidationState = 'unconfigured' | 'validating' | 'valid' | 'invalid'

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
  const [error, setError] = useState<string>()

  useEffect(() => {
    void fetch('/api/settings')
      .then((response) => response.json() as Promise<{ configured?: boolean }>)
      .then(({ configured }) => setState(configured ? 'valid' : 'unconfigured'))
      .catch(() => setState('unconfigured'))
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

  return (
    <AppShell
      active="settings"
      projectId={projectId}
      rendererNodeId={rendererNodeId}
      contentClassName="overflow-y-auto"
    >
      <main className="mx-auto flex min-h-full w-full max-w-[720px] flex-col gap-6 px-4 py-10">
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
            <StatusPill {...statusProps(state)} />
          </SettingsRow>
          <SettingsSeparator />
          <SettingsRow label="显示 Key"><Toggle checked={reveal} onCheckedChange={setReveal} /></SettingsRow>
          <SettingsSeparator />
          <SettingsRow label="模型" value="step-1-8k" />
          <SettingsSeparator />
          <SettingsRow label="端点" value="https://api.stepfun.com/v1" />
        </SettingsSection>
        <SettingsSection title="渲染">
          <SettingsRow label="渲染并发数" value="4" />
          <SettingsSeparator />
          <SettingsRow label="默认分辨率" value="1080×1920" />
          <SettingsSeparator />
          <SettingsRow label="存储位置" value="~/CodeVideoCanvas/projects" />
          <SettingsSeparator />
          <SettingsRow label="崩溃续渲"><Toggle checked readOnly /></SettingsRow>
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
    </AppShell>
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
