import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import type { Db } from '@/lib/db/migrate'
import { artifacts, canvasNodes, projects } from '@/lib/db/schema'
import {
  resolutionForPreset,
  resolveExportSettings,
  type ResolutionPreset,
} from '@/features/canvas/export-settings'
import { FRAME_THUMBNAIL_KIND, thumbnailOutputPath } from './types'
import type {
  RenderJob,
  ShotQaCheckData,
  ThumbnailArtifactRecord,
  ThumbnailContext,
} from './types'

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
  /** 导出目标分辨率（由项目 exportSettings 解析），仅用于 concat 阶段。 */
  targetResolution: { width: number; height: number }
  resolutionPreset: ResolutionPreset
  /** laneKey → QA 是否通过；null 表示尚未检测（不得默认 true）。 */
  shotQa: Record<string, boolean | null>
}

/** shot-qa 检测编排所需的一个目标：已成功渲染的 shot-codegen + 同 laneKey 的 shot-qa 节点。 */
export interface ShotQaTarget {
  codegenNodeId: string
  qaNodeId: string
  laneKey: string
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
      .select({ id: projects.id, exportSettings: projects.exportSettings })
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()
    if (!project) throw new Error(`项目不存在：${projectId}`)
    const settings = resolveExportSettings(project.exportSettings)

    const nodes = this.db
      .select({
        id: canvasNodes.id,
        type: canvasNodes.type,
        status: canvasNodes.status,
        laneKey: canvasNodes.laneKey,
        data: canvasNodes.data,
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

    const shotQa: Record<string, boolean | null> = {}
    for (const node of nodes) {
      if (node.type === 'shot-qa' && node.laneKey) {
        shotQa[node.laneKey] = qaPassedOf(node.data)
      }
    }

    return {
      incompleteNodeIds: [...incomplete].sort(),
      shots,
      musicKey: this.latestMusicKey(projectId),
      targetResolution: resolutionForPreset(settings.resolutionPreset),
      resolutionPreset: settings.resolutionPreset,
      shotQa,
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

  /** 加载已成功渲染分镜的缩略图生成上下文（HTML key + 渲染规格）。 */
  loadCompletedThumbnailContext(projectId: string, nodeId: string): ThumbnailContext {
    const node = this.getRenderNode(projectId, nodeId)
    if (node.status !== 'success') {
      throw new Error(`该分镜尚未渲染成功，无法生成缩略图：${node.status}`)
    }
    const spec = this.parseRenderSpec(node.data)
    return {
      projectId,
      nodeId,
      htmlKey: this.requireFabricateArtifact(projectId, nodeId),
      frames: {
        fps: spec.fps,
        durationInFrames: spec.durationInFrames,
        width: spec.width,
        height: spec.height,
      },
    }
  }

  /** 查找已登记的缩略图 artifact（sourceKey + frame 唯一寻址）；不存在返回 null。 */
  findThumbnail(
    projectId: string,
    nodeId: string,
    sourceKey: string,
    frame: number
  ): ThumbnailArtifactRecord | null {
    const path = thumbnailOutputPath(projectId, nodeId, sourceKey, frame)
    const row = this.db
      .select({ id: artifacts.id, path: artifacts.path, contentHash: artifacts.contentHash })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.projectId, projectId),
          eq(artifacts.nodeId, nodeId),
          eq(artifacts.kind, FRAME_THUMBNAIL_KIND),
          eq(artifacts.path, path)
        )
      )
      .orderBy(desc(artifacts.createdAt), desc(artifacts.id))
      .get()
    if (!row || !row.contentHash) return null
    return { artifactId: row.id, path: row.path, contentHash: row.contentHash }
  }

  /** 登记已由可信调用方提交到 StorageAdapter 的内容寻址缩略图 PNG。 */
  registerThumbnail(input: {
    projectId: string
    nodeId: string
    outputKey: string
    contentHash: string
  }): string {
    const id = randomUUID()
    this.db
      .insert(artifacts)
      .values({
        id,
        projectId: input.projectId,
        nodeId: input.nodeId,
        kind: FRAME_THUMBNAIL_KIND,
        path: input.outputKey,
        contentHash: input.contentHash,
      })
      .run()
    return id
  }

  /**
   * 列出可跑 QA 的目标：已成功渲染的 shot-codegen 节点与同 laneKey 的 shot-qa 节点配对。
   * 单次查询 + 内存 join，不产生 N+1。
   */
  getShotQaTargets(projectId: string): ShotQaTarget[] {
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
    const qaNodeByLane = new Map<string, string>()
    for (const node of nodes) {
      if (node.type === 'shot-qa' && node.laneKey) qaNodeByLane.set(node.laneKey, node.id)
    }
    const targets: ShotQaTarget[] = []
    for (const node of nodes) {
      if (node.type !== 'shot-codegen' || node.status !== 'success' || !node.laneKey) continue
      const qaNodeId = qaNodeByLane.get(node.laneKey)
      if (qaNodeId) targets.push({ codegenNodeId: node.id, qaNodeId, laneKey: node.laneKey })
    }
    return targets.sort((left, right) => left.laneKey.localeCompare(right.laneKey))
  }

  /** 读取 shot-qa 节点已持久化的 qaCheck（供 contentHash 跳过判断）；不存在/非法返回 null。 */
  readShotQaCheck(nodeId: string): ShotQaCheckData | null {
    const node = this.db
      .select({ data: canvasNodes.data })
      .from(canvasNodes)
      .where(eq(canvasNodes.id, nodeId))
      .get()
    return node ? asShotQaCheckData(node.data.qaCheck) : null
  }

  /** 将 QA 结果写回 shot-qa 节点 data.qaCheck（保留其他 data 字段）。 */
  writeShotQaCheck(nodeId: string, qaCheck: ShotQaCheckData): void {
    const node = this.db
      .select({ data: canvasNodes.data })
      .from(canvasNodes)
      .where(eq(canvasNodes.id, nodeId))
      .get()
    if (!node) throw new Error(`节点不存在：${nodeId}`)
    this.db
      .update(canvasNodes)
      .set({ data: { ...node.data, qaCheck } })
      .where(eq(canvasNodes.id, nodeId))
      .run()
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

/** 从节点 data 中安全提取 qaCheck.passed；缺失/非法返回 null（不得默认 true）。 */
function qaPassedOf(data: Record<string, unknown>): boolean | null {
  const qaCheck = data.qaCheck
  if (qaCheck && typeof qaCheck === 'object' && 'passed' in qaCheck) {
    const passed = (qaCheck as { passed: unknown }).passed
    if (typeof passed === 'boolean') return passed
  }
  return null
}

/** 将未知 data.qaCheck 归一为 ShotQaCheckData；形状不符返回 null。 */
function asShotQaCheckData(value: unknown): ShotQaCheckData | null {
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as ShotQaCheckData).thumbnailContentHash === 'string' &&
    typeof (value as ShotQaCheckData).passed === 'boolean'
  ) {
    return value as ShotQaCheckData
  }
  return null
}
