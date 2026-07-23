import 'server-only'
import { z } from 'zod'
import { transitionNodeStatus } from '@/features/canvas/status'
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

const repository = new RenderRepository()
const handlerDefaults: HandlerDependencies = {
  repository,
  transitionNodeStatus,
  renderer: new HyperframesRenderer(),
}
const enqueueDefaults: EnqueueDependencies = {
  queue: defaultQueue,
  assertRenderEnqueueable: (projectId, nodeId) =>
    repository.assertRenderEnqueueable(projectId, nodeId),
  transitionNodeStatus,
  recordRenderError: (nodeId, error) => repository.recordRenderError(nodeId, error),
}

export function registerRenderShotHandler(
  targetQueue: QueueAdapter = defaultQueue,
  dependencies: HandlerDependencies = handlerDefaults
): void {
  targetQueue.register('render-shot', async (job) => {
    const payload = renderJobPayloadSchema.parse(job.payload)
    dependencies.transitionNodeStatus(payload.nodeId, 'running')
    try {
      const context = dependencies.repository.loadRenderContext(
        payload.projectId,
        payload.nodeId
      )
      await dependencies.renderer.render(context)
      dependencies.transitionNodeStatus(payload.nodeId, 'success')
    } catch (error) {
      failRender(payload.nodeId, error, dependencies)
      throw error
    }
  })
}

export function enqueueRenderShot(
  input: RenderShotInput,
  dependencies: EnqueueDependencies = enqueueDefaults
): string {
  const payload = renderJobPayloadSchema.parse(input)
  dependencies.assertRenderEnqueueable(payload.projectId, payload.nodeId)
  dependencies.transitionNodeStatus(payload.nodeId, 'pending')
  try {
    return dependencies.queue.enqueue('render-shot', payload, {
      projectId: payload.projectId,
      nodeId: payload.nodeId,
    })
  } catch (error) {
    compensateEnqueueFailure(payload.nodeId, error, dependencies)
    throw error
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
