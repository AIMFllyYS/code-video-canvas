export interface ShotJobResult {
  status: 'done' | 'failed'
  artifactUrl?: string
  error?: string
}

export async function renderShotAndWait(
  projectId: string,
  nodeId: string,
  fetcher: typeof fetch = fetch,
  wait: (milliseconds: number) => Promise<void> = delay
): Promise<ShotJobResult> {
  const started = await fetcher('/api/render', request({ projectId, nodeId }))
  const startBody = await objectBody(started)
  if (!started.ok) throw new Error(errorOf(startBody, '渲染作业入队失败'))
  const jobId = stringOf(startBody, 'jobId')

  for (;;) {
    const response = await fetcher(
      `/api/jobs/${encodeURIComponent(jobId)}?projectId=${encodeURIComponent(projectId)}`
    )
    const body = await objectBody(response)
    if (!response.ok) throw new Error(errorOf(body, '作业状态读取失败'))
    const job = body.job
    if (!job || typeof job !== 'object' || Array.isArray(job)) {
      throw new Error('作业状态响应无效')
    }
    const status = (job as Record<string, unknown>).status
    if (status === 'done') {
      return {
        status,
        ...(typeof body.artifactUrl === 'string' ? { artifactUrl: body.artifactUrl } : {}),
      }
    }
    if (status === 'failed') {
      const error = (job as Record<string, unknown>).error
      return { status, ...(typeof error === 'string' ? { error } : {}) }
    }
    await wait(750)
  }
}

function request(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

async function objectBody(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('作业响应无效')
  }
  return body as Record<string, unknown>
}

function stringOf(body: Record<string, unknown>, key: string): string {
  if (typeof body[key] !== 'string') throw new Error(`作业响应缺少 ${key}`)
  return body[key]
}

function errorOf(body: Record<string, unknown>, fallback: string): string {
  return typeof body.error === 'string' ? body.error : fallback
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}
