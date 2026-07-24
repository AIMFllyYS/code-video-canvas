import { describe, expect, it, vi } from 'vitest'
import type { CanvasGraphNode } from '@/features/canvas'
import { triggerNodeAction } from './canvas-action-api'

describe('triggerNodeAction', () => {
  it('uses the persisted stage for Director nodes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({ ok: true, jobId: 'job-1' })
    )
    await triggerNodeAction('project-1', node({ type: 'script-import', stage: 'INGEST' }), fetcher)

    expect(fetcher).toHaveBeenCalledWith(
      '/api/director/stage',
      expect.objectContaining({
        body: JSON.stringify({ projectId: 'project-1', nodeId: 'node-1', stage: 'INGEST' }),
      })
    )
  })

  it('routes shot-codegen through the render API', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      response({ ok: true, jobId: 'render-1' })
    )
    await triggerNodeAction('project-1', node({ type: 'shot-codegen', stage: 'FABRICATE' }), fetcher)

    expect(fetcher).toHaveBeenCalledWith(
      '/api/render',
      expect.objectContaining({
        body: JSON.stringify({ projectId: 'project-1', nodeId: 'node-1' }),
      })
    )
  })
})

function node(overrides: Partial<CanvasGraphNode>): CanvasGraphNode {
  return {
    id: 'node-1',
    type: 'script-import',
    status: 'idle',
    stage: null,
    contentHash: null,
    data: {},
    position: { x: 0, y: 0 },
    laneKey: null,
    laneRole: null,
    artifacts: [],
    ...overrides,
  }
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
