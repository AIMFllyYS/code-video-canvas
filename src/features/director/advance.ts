import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import type { Db } from '@/lib/db/migrate'
import { canvasEdges, canvasNodes, projects } from '@/lib/db/schema'
import type { CanvasNodeType, NodeStatus } from '@/features/canvas/types'
import { DirectorRuntimeRepository } from './runtime-repository'
import { PIPELINE_STAGES, type PipelineStage } from './types'
import { storage } from '@/lib/storage'

export interface AdvanceCandidate {
  id: string
  type: CanvasNodeType
  stage: string | null
  status: NodeStatus
}

interface AdvanceRepository {
  isAutopilotEnabled(projectId: string): boolean
  listDownstreamCandidates(
    projectId: string,
    completedNodeId: string
  ): AdvanceCandidate[]
  areAllUpstreamsSuccessful(projectId: string, nodeId: string): boolean
  recordStageError(nodeId: string, stage: PipelineStage, error: unknown): void
}

interface PipelineRepository extends AdvanceRepository {
  setAutopilot(projectId: string, enabled: boolean): boolean
  getEntryNode(projectId: string): AdvanceCandidate
  listSuccessfulNodeIds(projectId: string): string[]
}

type EnqueueDirectorStage = (input: {
  projectId: string
  nodeId: string
  stage: PipelineStage
}) => string

type EnqueueRenderShot = (input: {
  projectId: string
  nodeId: string
}) => string

export interface AdvanceDependencies {
  repository: AdvanceRepository
  enqueueDirectorStage: EnqueueDirectorStage
  enqueueRenderShot: EnqueueRenderShot
  prepareFinalExport: (projectId: string) => Promise<void>
}

export interface AdvanceResult {
  enqueuedNodeIds: string[]
  failedNodeIds: string[]
}

export interface PipelineStartResult extends AdvanceResult {
  autopilot: true
}

interface PipelineControlDependencies {
  repository: PipelineRepository
  enqueueDirectorStage: EnqueueDirectorStage
  advance: (
    projectId: string,
    completedNodeId: string
  ) => Promise<AdvanceResult>
}

/**
 * 一个节点成功后推进其直接下游。
 *
 * 只消费持久化 DAG 与项目 autopilot，不接受客户端提供的下游节点或阶段。
 */
export async function advancePipeline(
  projectId: string,
  completedNodeId: string,
  dependencies?: AdvanceDependencies
): Promise<AdvanceResult> {
  const resolved = dependencies ?? (await createDefaultDependencies())
  const result: AdvanceResult = { enqueuedNodeIds: [], failedNodeIds: [] }
  if (!resolved.repository.isAutopilotEnabled(projectId)) return result

  const candidates = resolved.repository.listDownstreamCandidates(
    projectId,
    completedNodeId
  )
  for (const candidate of candidates) {
    if (
      candidate.status !== 'idle' ||
      !isPipelineStage(candidate.stage) ||
      !resolved.repository.areAllUpstreamsSuccessful(projectId, candidate.id)
    ) {
      continue
    }
    try {
      if (candidate.type === 'shot-codegen') {
        resolved.enqueueRenderShot({ projectId, nodeId: candidate.id })
      } else {
        if (candidate.type === 'export') {
          await resolved.prepareFinalExport(projectId)
        }
        resolved.enqueueDirectorStage({
          projectId,
          nodeId: candidate.id,
          stage: candidate.stage,
        })
      }
      result.enqueuedNodeIds.push(candidate.id)
    } catch (error) {
      result.failedNodeIds.push(candidate.id)
      resolved.repository.recordStageError(candidate.id, candidate.stage, error)
    }
  }
  return result
}

/** 开启项目 autopilot，并从入口或既有成功前沿继续执行。 */
export async function startProjectPipeline(
  projectId: string,
  dependencies?: PipelineControlDependencies
): Promise<PipelineStartResult> {
  const resolved = dependencies ?? (await createDefaultControlDependencies())
  resolved.repository.setAutopilot(projectId, true)
  const entry = resolved.repository.getEntryNode(projectId)
  const enqueued = new Set<string>()
  const failed = new Set<string>()

  if (entry.status === 'success') {
    for (const completedNodeId of resolved.repository.listSuccessfulNodeIds(projectId)) {
      const result = await resolved.advance(projectId, completedNodeId)
      result.enqueuedNodeIds.forEach((nodeId) => enqueued.add(nodeId))
      result.failedNodeIds.forEach((nodeId) => failed.add(nodeId))
    }
  } else if (['idle', 'failed', 'stale'].includes(entry.status)) {
    if (entry.stage !== 'INGEST') {
      throw new Error(`项目入口节点阶段无效：${entry.stage ?? 'null'}`)
    }
    resolved.enqueueDirectorStage({
      projectId,
      nodeId: entry.id,
      stage: 'INGEST',
    })
    enqueued.add(entry.id)
  }

  return {
    autopilot: true,
    enqueuedNodeIds: [...enqueued],
    failedNodeIds: [...failed],
  }
}

/** 关闭后续自动推进；已经入队的作业不会被伪装为已取消。 */
export function stopProjectPipeline(projectId: string): { autopilot: false } {
  new AdvanceRepositoryImpl(getDb()).setAutopilot(projectId, false)
  return { autopilot: false }
}

class AdvanceRepositoryImpl implements AdvanceRepository {
  private readonly directorRepository: DirectorRuntimeRepository

  constructor(private readonly db: Db) {
    this.directorRepository = new DirectorRuntimeRepository(db, storage)
  }

  isAutopilotEnabled(projectId: string): boolean {
    return (
      this.db
        .select({ autopilot: projects.autopilot })
        .from(projects)
        .where(eq(projects.id, projectId))
        .get()?.autopilot ?? false
    )
  }

  setAutopilot(projectId: string, enabled: boolean): boolean {
    const updated = this.db
      .update(projects)
      .set({ autopilot: enabled, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning({ autopilot: projects.autopilot })
      .get()
    if (!updated) throw new Error(`项目不存在：${projectId}`)
    return updated.autopilot
  }

  getEntryNode(projectId: string): AdvanceCandidate {
    const node = this.db
      .select({
        id: canvasNodes.id,
        type: canvasNodes.type,
        stage: canvasNodes.stage,
        status: canvasNodes.status,
      })
      .from(canvasNodes)
      .where(
        and(
          eq(canvasNodes.projectId, projectId),
          eq(canvasNodes.type, 'script-import')
        )
      )
      .get()
    if (!node) throw new Error(`项目缺少 script-import 入口节点：${projectId}`)
    return node as AdvanceCandidate
  }

  listSuccessfulNodeIds(projectId: string): string[] {
    return this.db
      .select({ id: canvasNodes.id })
      .from(canvasNodes)
      .where(
        and(
          eq(canvasNodes.projectId, projectId),
          eq(canvasNodes.status, 'success')
        )
      )
      .all()
      .map(({ id }) => id)
  }

  listDownstreamCandidates(
    projectId: string,
    completedNodeId: string
  ): AdvanceCandidate[] {
    const edges = this.db
      .select({ target: canvasEdges.target })
      .from(canvasEdges)
      .where(
        and(
          eq(canvasEdges.projectId, projectId),
          eq(canvasEdges.source, completedNodeId)
        )
      )
      .all()
    const targetIds = [...new Set(edges.map(({ target }) => target))]
    if (targetIds.length === 0) return []
    return this.db
      .select({
        id: canvasNodes.id,
        type: canvasNodes.type,
        stage: canvasNodes.stage,
        status: canvasNodes.status,
      })
      .from(canvasNodes)
      .where(
        and(
          eq(canvasNodes.projectId, projectId),
          inArray(canvasNodes.id, targetIds)
        )
      )
      .all() as AdvanceCandidate[]
  }

  areAllUpstreamsSuccessful(projectId: string, nodeId: string): boolean {
    const upstreamEdges = this.db
      .select({ source: canvasEdges.source })
      .from(canvasEdges)
      .where(
        and(
          eq(canvasEdges.projectId, projectId),
          eq(canvasEdges.target, nodeId)
        )
      )
      .all()
    if (upstreamEdges.length === 0) return false
    const sourceIds = [...new Set(upstreamEdges.map(({ source }) => source))]
    const upstreams = this.db
      .select({ id: canvasNodes.id, status: canvasNodes.status })
      .from(canvasNodes)
      .where(
        and(
          eq(canvasNodes.projectId, projectId),
          inArray(canvasNodes.id, sourceIds)
        )
      )
      .all()
    return (
      upstreams.length === sourceIds.length &&
      upstreams.every(({ status }) => status === 'success')
    )
  }

  recordStageError(
    nodeId: string,
    stage: PipelineStage,
    error: unknown
  ): void {
    this.directorRepository.recordStageError(nodeId, stage, error)
  }
}

async function createDefaultDependencies(): Promise<AdvanceDependencies> {
  const [{ enqueueDirectorStage }, { enqueueRenderShot }] = await Promise.all([
    import('./queue-handler'),
    import('@/features/render/queue-handler'),
  ])
  return {
    repository: new AdvanceRepositoryImpl(getDb()),
    enqueueDirectorStage,
    enqueueRenderShot,
    prepareFinalExport: async (projectId) => {
      const { exportProject } = await import('@/features/render/export-service')
      const result = await exportProject(projectId)
      if (!result.ok) {
        throw new Error(
          `终片导出前置未完成：${result.incompleteNodeIds.join(', ')}`
        )
      }
    },
  }
}

async function createDefaultControlDependencies(): Promise<PipelineControlDependencies> {
  const advanceDependencies = await createDefaultDependencies()
  const repository = advanceDependencies.repository as PipelineRepository
  return {
    repository,
    enqueueDirectorStage: advanceDependencies.enqueueDirectorStage,
    advance: (projectId, completedNodeId) =>
      advancePipeline(projectId, completedNodeId, advanceDependencies),
  }
}

function isPipelineStage(stage: string | null): stage is PipelineStage {
  return stage !== null && PIPELINE_STAGES.includes(stage as PipelineStage)
}
