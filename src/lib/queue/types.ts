export type JobStatus = 'pending' | 'running' | 'done' | 'failed'

export interface QueueJob {
  id: string
  kind: string
  status: JobStatus
  payload: Record<string, unknown>
  attempts: number
  error?: string | null
}

/** 作业处理器：由各领域（如 render）注册。 */
export type JobHandler = (job: QueueJob) => Promise<void>

/** 队列适配器。Demo 用进程内 + SQLite 持久化；未来可换 Redis / BullMQ。 */
export interface QueueAdapter {
  enqueue(
    kind: string,
    payload?: Record<string, unknown>,
    opts?: { projectId?: string; nodeId?: string },
  ): string
  register(kind: string, handler: JobHandler): void
  start(concurrency?: number): void
  stop(): void
}
