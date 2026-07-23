import 'server-only'

import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { jobs } from '@/lib/db/schema'
import type { JobStatus } from './types'

export interface JobSnapshot {
  id: string
  projectId: string
  nodeId: string | null
  kind: string
  status: JobStatus
  attempts: number
  error: string | null
}

export function getJobSnapshot(projectId: string, jobId: string): JobSnapshot | null {
  const row = getDb()
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.projectId, projectId)))
    .get()
  if (!row || !row.projectId) return null
  if (!isJobStatus(row.status)) throw new Error(`未知作业状态：${row.status}`)
  return {
    id: row.id,
    projectId: row.projectId,
    nodeId: row.nodeId,
    kind: row.kind,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
  }
}

function isJobStatus(status: string): status is JobStatus {
  return ['pending', 'running', 'done', 'failed'].includes(status)
}
