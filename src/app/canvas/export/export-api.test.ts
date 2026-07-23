import { describe, expect, it, vi } from 'vitest'
import { loadExportReadiness, startProjectExport } from './export-api'

describe('export API client', () => {
  it('loads incomplete nodes and keeps export disabled', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({ ok: true, ready: false, incompleteNodeIds: ['node-2'], shotCount: 1 })
    )
    await expect(loadExportReadiness('project-1', fetcher)).resolves.toEqual({
      ready: false,
      incompleteNodeIds: ['node-2'],
      shotCount: 1,
    })
  })

  it('returns the controlled final artifact URL', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({ ok: true, artifactUrl: '/api/artifacts/final?projectId=project-1' })
    )
    await expect(startProjectExport('project-1', fetcher)).resolves.toBe(
      '/api/artifacts/final?projectId=project-1'
    )
  })
})

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
