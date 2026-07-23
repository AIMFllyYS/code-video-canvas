import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import type { Db } from '@/lib/db/migrate'
import { artifacts, canvasNodes, projects } from '@/lib/db/schema'

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
