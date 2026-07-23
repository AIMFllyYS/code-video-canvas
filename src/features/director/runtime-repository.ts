import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import type { Db } from '@/lib/db/migrate'
import { artifacts, canvasNodes, projects } from '@/lib/db/schema'
import type { PipelineStage } from './types'
import type { PreparedStageResult } from './stage-result'

const storageKeySchema = z
  .string()
  .min(1)
  .regex(/^(?![A-Za-z]:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\).+$/, {
    message: 'artifact storageKey 必须是安全相对路径',
  })

export interface DirectorStageContext {
  projectId: string
  nodeId: string
  stage: PipelineStage
  status: 'pending'
  projectTitle: string
  projectScript: string
  directorInput: unknown
  resumeSessionKey?: string
}

export interface ArtifactPointerInput {
  projectId: string
  nodeId: string
  kind: string
  storageKey: string
  contentHash?: string
}

/** Director 持久化端口；封装执行上下文、artifact 指针与错误记录。 */
export class DirectorRuntimeRepository {
  constructor(private readonly db: Db = getDb()) {}

  assertEnqueueable(
    projectId: string,
    nodeId: string,
    stage: PipelineStage
  ): void {
    const node = this.db
      .select({
        projectId: canvasNodes.projectId,
        stage: canvasNodes.stage,
        status: canvasNodes.status,
      })
      .from(canvasNodes)
      .where(and(eq(canvasNodes.id, nodeId), eq(canvasNodes.projectId, projectId)))
      .get()
    if (!node) throw new Error(`Director 节点不存在或不属于项目：${nodeId}`)
    if (node.stage !== stage) {
      throw new Error(`Director 节点阶段不匹配：${node.stage ?? 'null'} != ${stage}`)
    }
    if (!['idle', 'failed', 'stale'].includes(node.status)) {
      throw new Error(`Director 节点当前不可入队：${node.status}`)
    }
  }

  loadStageContext(
    projectId: string,
    nodeId: string,
    stage: PipelineStage
  ): DirectorStageContext {
    const row = this.db
      .select({
        projectTitle: projects.title,
        projectScript: projects.script,
        nodeProjectId: canvasNodes.projectId,
        nodeStage: canvasNodes.stage,
        status: canvasNodes.status,
        data: canvasNodes.data,
      })
      .from(canvasNodes)
      .innerJoin(projects, eq(projects.id, canvasNodes.projectId))
      .where(and(eq(canvasNodes.id, nodeId), eq(projects.id, projectId)))
      .get()
    if (!row) throw new Error(`Director 节点不存在或不属于项目：${nodeId}`)
    if (row.nodeProjectId !== projectId) {
      throw new Error(`Director 节点不属于项目：${nodeId}`)
    }
    if (row.nodeStage !== stage) {
      throw new Error(`Director 节点阶段不匹配：${row.nodeStage ?? 'null'} != ${stage}`)
    }
    if (row.status !== 'pending') {
      throw new Error(`Director 节点必须为 pending，当前为：${row.status}`)
    }
    const resumeSessionKey = readResumeSessionKey(row.data)
    return {
      projectId,
      nodeId,
      stage,
      status: 'pending',
      projectTitle: row.projectTitle,
      projectScript: row.projectScript,
      directorInput: row.data.directorInput,
      resumeSessionKey,
    }
  }

  registerArtifactPointer(input: ArtifactPointerInput): string {
    const storageKey = storageKeySchema.parse(input.storageKey)
    const id = randomUUID()
    this.db
      .insert(artifacts)
      .values({
        id,
        projectId: input.projectId,
        nodeId: input.nodeId,
        kind: input.kind,
        path: storageKey,
        contentHash: input.contentHash,
      })
      .run()
    return id
  }

  recordStageError(nodeId: string, stage: PipelineStage, error: unknown): void {
    const node = this.db
      .select({ data: canvasNodes.data })
      .from(canvasNodes)
      .where(eq(canvasNodes.id, nodeId))
      .get()
    if (!node) throw new Error(`节点不存在：${nodeId}`)
    const message = error instanceof Error ? error.message : String(error)
    this.db
      .update(canvasNodes)
      .set({ data: { ...node.data, directorError: { stage, message } } })
      .where(eq(canvasNodes.id, nodeId))
      .run()
  }

  recordStageOutput(
    nodeId: string,
    result: PreparedStageResult,
    artifactId: string
  ): void {
    const node = this.db
      .select({ data: canvasNodes.data })
      .from(canvasNodes)
      .where(eq(canvasNodes.id, nodeId))
      .get()
    if (!node) throw new Error(`节点不存在：${nodeId}`)
    this.db
      .update(canvasNodes)
      .set({
        data: {
          ...node.data,
          directorArtifactId: artifactId,
          ...(result.renderSpec ? { renderSpec: result.renderSpec } : {}),
        },
      })
      .where(eq(canvasNodes.id, nodeId))
      .run()
  }
}

function readResumeSessionKey(data: Record<string, unknown>): string | undefined {
  if (data.directorSessionKey === undefined) return undefined
  return storageKeySchema.parse(data.directorSessionKey)
}
