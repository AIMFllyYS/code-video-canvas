import 'server-only'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import type { Db } from '@/lib/db/migrate'
import { artifacts, canvasNodes } from '@/lib/db/schema'
import type { RenderJob, ThumbnailContext } from './types'

const renderSpecSchema = z
  .object({
    fps: z.number().positive(),
    durationInFrames: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    seed: z.number().int().optional(),
  })
  .strict()

const ENQUEUEABLE_STATUSES = new Set(['idle', 'failed', 'stale'])
type RenderContextMode = 'enqueueable' | 'running' | 'completed'

/** Demo render-shot 的运行上下文、source pointer 与失败投影。 */
export class RenderShotRepository {
  constructor(protected readonly db: Db = getDb()) {}

  loadRenderAdmissionContext(projectId: string, nodeId: string): RenderJob {
    return this.buildRenderJob(projectId, nodeId, 'enqueueable')
  }

  loadRenderContext(projectId: string, nodeId: string): RenderJob {
    return this.buildRenderJob(projectId, nodeId, 'running')
  }

  recordRenderError(nodeId: string, error: unknown): void {
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
          renderError: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      })
      .where(eq(canvasNodes.id, nodeId))
      .run()
  }

  loadCompletedThumbnailContext(
    projectId: string,
    nodeId: string
  ): ThumbnailContext {
    const job = this.buildRenderJob(projectId, nodeId, 'completed')
    return {
      projectId,
      nodeId,
      htmlKey: job.htmlKey,
      frames: job.frames,
    }
  }

  private buildRenderJob(
    projectId: string,
    nodeId: string,
    mode: RenderContextMode
  ): RenderJob {
    const node = this.getRenderNode(projectId, nodeId)
    assertRenderStatus(node.status, mode)
    const spec = this.parseRenderSpec(node.data)
    return {
      projectId,
      nodeId,
      shotId: node.laneKey,
      htmlKey: this.requireFabricateArtifact(projectId, nodeId),
      frames: {
        fps: spec.fps,
        durationInFrames: spec.durationInFrames,
        width: spec.width,
        height: spec.height,
      },
      ...(spec.seed === undefined ? {} : { seed: spec.seed }),
    }
  }

  private getRenderNode(projectId: string, nodeId: string) {
    const node = this.db
      .select({
        id: canvasNodes.id,
        type: canvasNodes.type,
        status: canvasNodes.status,
        laneKey: canvasNodes.laneKey,
        data: canvasNodes.data,
      })
      .from(canvasNodes)
      .where(and(eq(canvasNodes.id, nodeId), eq(canvasNodes.projectId, projectId)))
      .get()
    if (!node) throw new Error(`项目内不存在节点：${nodeId}`)
    if (node.type !== 'shot-codegen' || !node.laneKey) {
      throw new Error(`节点不是可渲染的 shot-codegen：${nodeId}`)
    }
    return { ...node, laneKey: node.laneKey }
  }

  private parseRenderSpec(data: Record<string, unknown>) {
    const result = renderSpecSchema.safeParse(data.renderSpec)
    if (!result.success) {
      throw new Error(`renderSpec 无效：${result.error.message}`)
    }
    return result.data
  }

  private requireFabricateArtifact(projectId: string, nodeId: string): string {
    const artifact = this.db
      .select({ path: artifacts.path })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.projectId, projectId),
          eq(artifacts.nodeId, nodeId),
          eq(artifacts.kind, 'director-fabricate')
        )
      )
      .orderBy(desc(artifacts.createdAt), desc(artifacts.id))
      .get()
    if (!artifact) {
      throw new Error(`节点缺少 director-fabricate 产物：${nodeId}`)
    }
    return artifact.path
  }
}

function assertRenderStatus(status: string, mode: RenderContextMode): void {
  if (mode === 'enqueueable') {
    if (ENQUEUEABLE_STATUSES.has(status)) return
    throw new Error(`渲染节点当前不可入队：${status}`)
  }
  if (mode === 'running' && status !== 'running') {
    throw new Error(`渲染节点必须处于 running：${status}`)
  }
  if (mode === 'completed' && status !== 'success') {
    throw new Error(`该分镜尚未渲染成功，无法生成缩略图：${status}`)
  }
}
