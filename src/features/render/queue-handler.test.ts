import { describe, expect, it, vi } from 'vitest'
import type { QueueAdapter } from '@/lib/queue'
import type { RenderJob, RenderResult } from './types'
import {
  enqueueRenderShot,
  registerRenderShotHandler,
} from './queue-handler'

vi.mock('server-only', () => ({}))

const renderJob: RenderJob = {
  projectId: 'project-1',
  nodeId: 'node-1',
  shotId: 'S001',
  htmlKey: 'director/S001.html',
  frames: { fps: 30, durationInFrames: 60, width: 1920, height: 1080 },
}

function createQueue() {
  let handler: ((job: {
    id: string
    kind: string
    status: 'running'
    payload: Record<string, unknown>
    attempts: number
  }) => Promise<void>) | undefined
  const queue: QueueAdapter = {
    enqueue: vi.fn(() => 'job-1'),
    register: vi.fn((_kind, nextHandler) => {
      handler = nextHandler
    }),
    start: vi.fn(),
    stop: vi.fn(),
  }
  return { queue, getHandler: () => handler }
}

describe('render queue handler', () => {
  it('loads context and completes running to success', async () => {
    const harness = createQueue()
    const statuses: string[] = []
    const renderer = {
      render: vi.fn(async (): Promise<RenderResult> => ({
        shotId: 'S001',
        outputKey: 'render/S001.mp4',
        contentHash: 'hash',
      })),
    }
    registerRenderShotHandler(harness.queue, {
      repository: {
        loadRenderContext: vi.fn(() => renderJob),
        recordRenderError: vi.fn(),
      },
      transitionNodeStatus: vi.fn((_nodeId, status) => statuses.push(status)),
      renderer,
      advancePipeline: vi.fn(async () => statuses.push('advance')),
    })

    await harness.getHandler()?.({
      id: 'job-1',
      kind: 'render-shot',
      status: 'running',
      payload: { projectId: 'project-1', nodeId: 'node-1' },
      attempts: 1,
    })

    expect(renderer.render).toHaveBeenCalledWith(renderJob)
    expect(statuses).toEqual(['running', 'success', 'advance'])
  })

  it('moves render failures to failed and records the error', async () => {
    const harness = createQueue()
    const failure = new Error('编码失败')
    const transitionNodeStatus = vi.fn()
    const recordRenderError = vi.fn()
    registerRenderShotHandler(harness.queue, {
      repository: {
        loadRenderContext: vi.fn(() => renderJob),
        recordRenderError,
      },
      transitionNodeStatus,
      renderer: { render: vi.fn(async () => { throw failure }) },
      advancePipeline: vi.fn(),
    })

    await expect(
      harness.getHandler()?.({
        id: 'job-1',
        kind: 'render-shot',
        status: 'running',
        payload: { projectId: 'project-1', nodeId: 'node-1' },
        attempts: 1,
      })
    ).rejects.toThrow(failure)
    expect(transitionNodeStatus.mock.calls.map((call) => call[1])).toEqual([
      'running',
      'failed',
    ])
    expect(recordRenderError).toHaveBeenCalledWith('node-1', failure)
  })

  it('validates, marks pending, and enqueues a render job', () => {
    const harness = createQueue()
    const order: string[] = []
    const jobId = enqueueRenderShot(
      { projectId: 'project-1', nodeId: 'node-1' },
      {
        queue: harness.queue,
        assertRenderEnqueueable: vi.fn(() => order.push('validate')),
        transitionNodeStatus: vi.fn((_nodeId, status) => order.push(status)),
        recordRenderError: vi.fn(),
      }
    )

    expect(jobId).toBe('job-1')
    expect(order).toEqual(['validate', 'pending'])
    expect(harness.queue.enqueue).toHaveBeenCalledWith(
      'render-shot',
      { projectId: 'project-1', nodeId: 'node-1' },
      { projectId: 'project-1', nodeId: 'node-1' }
    )
  })

  it('compensates a failed enqueue without leaving pending state', () => {
    const harness = createQueue()
    vi.mocked(harness.queue.enqueue).mockImplementation(() => {
      throw new Error('队列写入失败')
    })
    const statuses: string[] = []
    const recordRenderError = vi.fn()

    expect(() =>
      enqueueRenderShot(
        { projectId: 'project-1', nodeId: 'node-1' },
        {
          queue: harness.queue,
          assertRenderEnqueueable: vi.fn(),
          transitionNodeStatus: vi.fn((_nodeId, status) => statuses.push(status)),
          recordRenderError,
        }
      )
    ).toThrow('队列写入失败')
    expect(statuses).toEqual(['pending', 'running', 'failed'])
    expect(recordRenderError).toHaveBeenCalledWith('node-1', expect.any(Error))
  })
})
