import 'server-only'
import { z } from 'zod'
import { transitionNodeStatus } from '@/features/canvas/status'
import { fabricateShot } from '@/features/director/fabricate'
import { queue as defaultQueue, type QueueAdapter } from '@/lib/queue'
import { RenderRepository } from './repository'
import { HyperframesRenderer, type Renderer } from './renderer'
import type { RenderJob } from './types'

const renderJobPayloadSchema = z
  .object({
    projectId: z.string().min(1),
    nodeId: z.string().min(1),
  })
  .strict()

export type RenderShotInput = z.infer<typeof renderJobPayloadSchema>

interface HandlerRepository {
  loadRenderContext(projectId: string, nodeId: string): RenderJob
  recordRenderError(nodeId: string, error: unknown): void
}

interface HandlerDependencies {
  repository: HandlerRepository
  transitionNodeStatus: typeof transitionNodeStatus
  renderer: Renderer
}

interface EnqueueDependencies {
  queue: QueueAdapter
  assertRenderEnqueueable(projectId: string, nodeId: string): void
  transitionNodeStatus: typeof transitionNodeStatus
  recordRenderError(nodeId: string, error: unknown): void
}

export function registerRenderShotHandler(
  targetQueue: QueueAdapter = defaultQueue,
  dependencies?: HandlerDependencies
): void {
  targetQueue.register('render-shot', async (job) => {
    const resolved = dependencies ?? createHandlerDependencies()
    const payload = renderJobPayloadSchema.parse(job.payload)
    resolved.transitionNodeStatus(payload.nodeId, 'running')
    try {
      let context: ReturnType<typeof resolved.repository.loadRenderContext>
      try {
        context = resolved.repository.loadRenderContext(
          payload.projectId,
          payload.nodeId
        )
      } catch {
        await fabricateShot(payload.projectId, payload.nodeId)
        context = resolved.repository.loadRenderContext(
          payload.projectId,
          payload.nodeId
        )
      }
      await resolved.renderer.render(context)
      resolved.transitionNodeStatus(payload.nodeId, 'success')
    } catch (error) {
      failRender(payload.nodeId, error, resolved)
      throw error
    }
  })
}

export function enqueueRenderShot(
  input: RenderShotInput,
  dependencies?: EnqueueDependencies
): string {
  const resolved = dependencies ?? createEnqueueDependencies()
  const payload = renderJobPayloadSchema.parse(input)
  resolved.assertRenderEnqueueable(payload.projectId, payload.nodeId)
  resolved.transitionNodeStatus(payload.nodeId, 'pending')
  try {
    return resolved.queue.enqueue('render-shot', payload, {
      projectId: payload.projectId,
      nodeId: payload.nodeId,
    })
  } catch (error) {
    compensateEnqueueFailure(payload.nodeId, error, resolved)
    throw error
  }
}

function createHandlerDependencies(): HandlerDependencies {
  return {
    repository: new RenderRepository(),
    transitionNodeStatus,
    renderer: new HyperframesRenderer(),
  }
}

function createEnqueueDependencies(): EnqueueDependencies {
  const repository = new RenderRepository()
  return {
    queue: defaultQueue,
    assertRenderEnqueueable: (projectId, nodeId) =>
      repository.assertRenderEnqueueable(projectId, nodeId),
    transitionNodeStatus,
    recordRenderError: (nodeId, error) =>
      repository.recordRenderError(nodeId, error),
  }
}

function failRender(
  nodeId: string,
  error: unknown,
  dependencies: Pick<HandlerDependencies, 'transitionNodeStatus' | 'repository'>
): void {
  const cleanupErrors: unknown[] = []
  try {
    dependencies.transitionNodeStatus(nodeId, 'failed')
  } catch (cleanupError) {
    cleanupErrors.push(cleanupError)
  }
  try {
    dependencies.repository.recordRenderError(nodeId, error)
  } catch (cleanupError) {
    cleanupErrors.push(cleanupError)
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError([error, ...cleanupErrors], '渲染失败补偿不完整')
  }
}

function compensateEnqueueFailure(
  nodeId: string,
  error: unknown,
  dependencies: EnqueueDependencies
): void {
  const cleanupErrors: unknown[] = []
  for (const status of ['running', 'failed'] as const) {
    try {
      dependencies.transitionNodeStatus(nodeId, status)
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError)
    }
  }
  try {
    dependencies.recordRenderError(nodeId, error)
  } catch (cleanupError) {
    cleanupErrors.push(cleanupError)
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      [error, ...cleanupErrors],
      '渲染作业入队失败且补偿不完整'
    )
  }
}
