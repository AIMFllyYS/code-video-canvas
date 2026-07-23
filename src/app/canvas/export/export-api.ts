export interface ExportReadiness {
  ready: boolean
  incompleteNodeIds: string[]
  shotCount: number
}

export async function loadExportReadiness(
  projectId: string,
  fetcher: typeof fetch = fetch
): Promise<ExportReadiness> {
  const response = await fetcher(
    `/api/render/export?projectId=${encodeURIComponent(projectId)}`
  )
  const body = await objectBody(response)
  if (!response.ok) throw new Error(errorOf(body, '导出状态读取失败'))
  if (
    typeof body.ready !== 'boolean' ||
    !Array.isArray(body.incompleteNodeIds) ||
    !body.incompleteNodeIds.every((value) => typeof value === 'string') ||
    typeof body.shotCount !== 'number'
  ) {
    throw new Error('导出状态响应无效')
  }
  return {
    ready: body.ready,
    incompleteNodeIds: body.incompleteNodeIds as string[],
    shotCount: body.shotCount,
  }
}

export async function startProjectExport(
  projectId: string,
  fetcher: typeof fetch = fetch
): Promise<string> {
  const response = await fetcher('/api/render/export', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId }),
  })
  const body = await objectBody(response)
  if (!response.ok) throw new Error(errorOf(body, '终片导出失败'))
  if (typeof body.artifactUrl !== 'string') throw new Error('导出响应缺少 artifactUrl')
  return body.artifactUrl
}

async function objectBody(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('导出响应无效')
  }
  return body as Record<string, unknown>
}

function errorOf(body: Record<string, unknown>, fallback: string): string {
  return typeof body.error === 'string' ? body.error : fallback
}
