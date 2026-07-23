import 'server-only'
import { InProcessQueue } from './in-process-queue'

/** 进程内队列单例（本步不自动 start；渲染步注册 handler 后再启动）。 */
export const queue = new InProcessQueue()

export { InProcessQueue } from './in-process-queue'
export type { JobHandler, JobStatus, QueueAdapter, QueueJob } from './types'
