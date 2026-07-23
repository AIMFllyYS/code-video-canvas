import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { jobs } from '@/lib/db/schema'
import type { JobHandler, QueueAdapter, QueueJob } from './types'

/**
 * 进程内持久队列骨架：作业落 SQLite（jobs 表），崩溃可恢复。
 * 有界并发默认 = CPU 核数。具体作业处理器（如渲染）后续注册；本步不自动 start。
 */
export class InProcessQueue implements QueueAdapter {
  private readonly handlers = new Map<string, JobHandler>()
  private timer: ReturnType<typeof setInterval> | null = null
  private running = 0

  enqueue(
    kind: string,
    payload: Record<string, unknown> = {},
    opts: { projectId?: string; nodeId?: string } = {},
  ): string {
    const id = randomUUID()
    getDb()
      .insert(jobs)
      .values({
        id,
        kind,
        status: 'pending',
        payload,
        projectId: opts.projectId ?? null,
        nodeId: opts.nodeId ?? null,
      })
      .run()
    return id
  }

  register(kind: string, handler: JobHandler): void {
    this.handlers.set(kind, handler)
  }

  start(concurrency = Math.max(1, os.cpus().length)): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(concurrency), 200)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private async tick(concurrency: number): Promise<void> {
    while (this.running < concurrency) {
      const job = this.claim()
      if (!job) return
      this.running += 1
      void this.run(job).finally(() => {
        this.running -= 1
      })
    }
  }

  private claim(): QueueJob | null {
    const db = getDb()
    const row = db.select().from(jobs).where(eq(jobs.status, 'pending')).limit(1).get()
    if (!row) return null
    const attempts = row.attempts + 1
    db.update(jobs).set({ status: 'running', attempts }).where(eq(jobs.id, row.id)).run()
    return { id: row.id, kind: row.kind, status: 'running', payload: row.payload, attempts }
  }

  private async run(job: QueueJob): Promise<void> {
    const db = getDb()
    const handler = this.handlers.get(job.kind)
    if (!handler) {
      db.update(jobs)
        .set({ status: 'failed', error: `no handler for kind: ${job.kind}` })
        .where(eq(jobs.id, job.id))
        .run()
      return
    }
    try {
      await handler(job)
      db.update(jobs).set({ status: 'done', error: null }).where(eq(jobs.id, job.id)).run()
    } catch (err) {
      db.update(jobs)
        .set({ status: 'failed', error: err instanceof Error ? err.message : String(err) })
        .where(eq(jobs.id, job.id))
        .run()
    }
  }
}
