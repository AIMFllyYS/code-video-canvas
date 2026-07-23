import { describe, expect, it, vi } from 'vitest'
import { renderShotAndWait } from './shot-api'

describe('renderShotAndWait', () => {
  it('starts one render and polls until the mp4 artifact is available', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ ok: true, jobId: 'job-1' }))
      .mockResolvedValueOnce(json({ ok: true, job: { status: 'running' } }))
      .mockResolvedValueOnce(
        json({
          ok: true,
          job: { status: 'done' },
          artifactUrl: '/api/artifacts/a-1?projectId=p-1',
        })
      )
    const wait = vi.fn().mockResolvedValue(undefined)

    await expect(renderShotAndWait('p-1', 'n-1', fetcher, wait)).resolves.toEqual({
      status: 'done',
      artifactUrl: '/api/artifacts/a-1?projectId=p-1',
    })
    expect(wait).toHaveBeenCalledOnce()
  })
})

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
