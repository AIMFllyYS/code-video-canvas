import 'server-only'
import { z } from 'zod'
import { transitionNodeStatus } from '@/features/canvas/status'
import { queue as defaultQueue, type QueueAdapter } from '@/lib/queue'
import { DirectorRuntimeRepository } from './runtime-repository'
import { runStage as defaultRunStage } from './stage-runner'
import { PIPELINE_STAGES, type PipelineStage } from './types'

const directorStageJobSchema = z
  .object({
    projectId: z.string().min(1),
    nodeId: z.string().min(1),
    stage: z.enum(PIPELINE_STAGES),
  })
  .strict()

export type DirectorStageJobInput = z.infer<typeof directorStageJobSchema>

type RunStage = (
  projectId: string,
  nodeId: string,
  stage: PipelineStage
) => Promise<void>

interface EnqueueDependencies {
  queue: QueueAdapter
  transitionNodeStatus: typeof transitionNodeStatus
  recordStageError(nodeId: string, stage: PipelineStage, error: unknown): void
}

const defaultRepository = new DirectorRuntimeRepository()
const defaultEnqueueDependencies: EnqueueDependencies = {
  queue: defaultQueue,
  transitionNodeStatus,
  recordStageError: (nodeId, stage, error) =>
    defaultRepository.recordStageError(nodeId, stage, error),
}

export function registerDirectorStageHandler(
  targetQueue: QueueAdapter = defaultQueue,
  runStage: RunStage = defaultRunStage
): void {
  targetQueue.register('director-stage', async (job) => {
    const payload = directorStageJobSchema.parse(job.payload)
    await runStage(payload.projectId, payload.nodeId, payload.stage)
  })
}

export function startDirectorQueue(
  targetQueue: QueueAdapter = defaultQueue,
  runStage: RunStage = defaultRunStage
): void {
  registerDirectorStageHandler(targetQueue, runStage)
  targetQueue.start()
}

export function enqueueDirectorStage(
  input: DirectorStageJobInput,
  dependencies: EnqueueDependencies = defaultEnqueueDependencies
): string {
  const payload = directorStageJobSchema.parse(input)
  dependencies.transitionNodeStatus(payload.nodeId, 'pending')
  try {
    return dependencies.queue.enqueue('director-stage', payload, {
      projectId: payload.projectId,
      nodeId: payload.nodeId,
    })
  } catch (error) {
    compensateEnqueueFailure(payload, error, dependencies)
    throw error
  }
}

function compensateEnqueueFailure(
  payload: DirectorStageJobInput,
  error: unknown,
  dependencies: EnqueueDependencies
): void {
  const cleanupErrors: unknown[] = []
  for (const status of ['running', 'failed'] as const) {
    try {
      dependencies.transitionNodeStatus(payload.nodeId, status)
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError)
    }
  }
  try {
    dependencies.recordStageError(payload.nodeId, payload.stage, error)
  } catch (cleanupError) {
    cleanupErrors.push(cleanupError)
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      [error, ...cleanupErrors],
      `Director 作业入队失败且补偿不完整：${payload.stage}`
    )
  }
}
