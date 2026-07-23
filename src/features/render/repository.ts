import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import type { Db } from '@/lib/db/migrate'
import { artifacts, canvasNodes, projects } from '@/lib/db/schema'
import type { RenderJob } from './types'

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

export interface ExportShot {
  nodeId: string
  laneKey: string
  outputKey: string
}

export interface RenderExportPlan {
  incompleteNodeIds: string[]
  shots: ExportShot[]
  musicKey: string | null
}

export interface FinalArtifactInput {
  projectId: string
  outputKey: string
  contentHash: string
}

/** Render 持久化端口；集中处理画布顺序与 artifact 指针。 */
export class RenderRepository {
  constructor(private readonly db: Db = getDb()) {}

  assertRenderEnqueueable(projectId: string, nodeId: string): void {
    const node = this.getRenderNode(projectId, nodeId)
    if (!ENQUEUEABLE_STATUSES.has(node.status)) {
      throw new Error(`渲染节点当前不可入队：${node.status}`)
    }
    this.parseRenderSpec(node.data)
    this.requireFabricateArtifact(projectId, nodeId)
  }

  loadRenderContext(projectId: string, nodeId: string): RenderJob {
    const node = this.getRenderNode(projectId, nodeId)
    if (node.status !== 'running') {
      throw new Error(`渲染节点必须处于 running：${node.status}`)
    }
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
          renderError: { message: messageOf(error) },
        },
      })
      .where(eq(canvasNodes.id, nodeId))
      .run()
  }

  getExportPlan(projectId: string): RenderExportPlan {
    const project = this.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()
    if (!project) throw new Error(`项目不存在：${projectId}`)

    const nodes = this.db
      .select({
        id: canvasNodes.id,
        type: canvasNodes.type,
        status: canvasNodes.status,
        laneKey: canvasNodes.laneKey,
      })
      .from(canvasNodes)
      .where(and(eq(canvasNodes.projectId, projectId), isNotNull(canvasNodes.laneKey)))
      .all()
    const renderArtifacts = this.db
      .select({
        nodeId: artifacts.nodeId,
        path: artifacts.path,
      })
      .from(artifacts)
      .where(and(eq(artifacts.projectId, projectId), eq(artifacts.kind, 'render-mp4')))
      .orderBy(desc(artifacts.createdAt), desc(artifacts.id))
      .all()
    const latestByNode = new Map<string, string>()
    for (const artifact of renderArtifacts) {
      if (artifact.nodeId && !latestByNode.has(artifact.nodeId)) {
        latestByNode.set(artifact.nodeId, artifact.path)
      }
    }

    const incomplete = new Set(
      nodes.filter((node) => node.status !== 'success').map((node) => node.id)
    )
    const shots = nodes
      .filter(
        (node): node is typeof node & { laneKey: string } =>
          node.type === 'shot-codegen' && node.laneKey !== null
      )
      .flatMap((node) => {
        const outputKey = latestByNode.get(node.id)
        if (!outputKey) {
          incomplete.add(node.id)
          return []
        }
        return [{ nodeId: node.id, laneKey: node.laneKey, outputKey }]
      })
      .sort((left, right) => left.laneKey.localeCompare(right.laneKey))

    return {
      incompleteNodeIds: [...incomplete].sort(),
      shots,
      musicKey: this.latestMusicKey(projectId),
    }
  }

  registerFinalArtifact(input: FinalArtifactInput): string {
    const id = randomUUID()
    this.db
      .insert(artifacts)
      .values({
        id,
        projectId: input.projectId,
        kind: 'final-mp4',
        path: input.outputKey,
        contentHash: input.contentHash,
      })
      .run()
    return id
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
    if (!artifact) throw new Error(`节点缺少 director-fabricate 产物：${nodeId}`)
    return artifact.path
  }

  private latestMusicKey(projectId: string): string | null {
    return (
      this.db
        .select({ path: artifacts.path })
        .from(artifacts)
        .where(and(eq(artifacts.projectId, projectId), eq(artifacts.kind, 'score-audio')))
        .orderBy(desc(artifacts.createdAt), desc(artifacts.id))
        .get()?.path ?? null
    )
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
