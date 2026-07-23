'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { stepfunSettingsSchema } from '@/features/ai/schemas'

interface SettingsResponse {
  configured: boolean
  masked: string | null
}

interface SaveResponse {
  ok: boolean
  valid?: boolean
  error?: string
}

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('')
  const [configured, setConfigured] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json() as Promise<SettingsResponse>)
      .then((data) => setConfigured(data.configured))
      .catch(() => undefined)
  }, [])

  async function onSave() {
    const parsed = stepfunSettingsSchema.safeParse({ apiKey })
    if (!parsed.success) {
      setStatus(parsed.error.issues[0]?.message ?? '输入无效')
      return
    }
    setStatus('校验中…')
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    })
    const data = (await res.json()) as SaveResponse
    if (data.ok) {
      setConfigured(true)
      setStatus(data.valid ? '已保存并校验通过' : '已保存（Key 校验未通过，可稍后重试）')
    } else {
      setStatus(data.error ?? '保存失败')
    }
  }

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-bold">设置</h1>
      <p className="mt-2 text-sm text-label-secondary">
        StepFun（阶跃星辰）API Key 仅存本地服务端，永不进前端 bundle。
        {configured && ' 当前已配置。'}
      </p>
      <label htmlFor="apiKey" className="mt-6 block text-sm font-medium">
        StepFun API Key
      </label>
      <input
        id="apiKey"
        type="password"
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
        placeholder="填入以更新（sk-...）"
        className="mt-1 w-full rounded-md border border-separator bg-surface px-3 py-2 text-sm text-label"
      />
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={onSave}>保存并校验</Button>
        {status && <span className="text-sm text-label-secondary">{status}</span>}
      </div>
    </main>
  )
}
