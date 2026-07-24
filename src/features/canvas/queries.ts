import 'server-only'
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { artifacts, canvasEdges, canvasNodes, projects } from '@/lib/db/schema'
import { canvasNodeTypeSchema } from './schemas'
import { resolveExportSettings, type ExportSettings } from './export-settings'
import type { CanvasNodeType, Project } from './types'

export interface CanvasNodeArtifact {
  id: string
  kind: string
  filename: string
}

export interface CanvasGraphNode {
  id: string
  type: CanvasNodeType
  status: typeof canvasNodes.$inferSelect.status
  stage: string | null
  contentHash: string | null
  data: Record<string, unknown>
  position: { x: number; y: number }
  laneKey: string | null
  laneRole: string | null
  artifacts: CanvasNodeArtifact[]
}

export interface CanvasGraphEdge {
  id: string
  source: string
  target: string
}

export interface CanvasGraph {
  nodes: CanvasGraphNode[]
  edges: CanvasGraphEdge[]
}

/** 列出全部项目（按更新时间倒序）。 */
export function listProjects(): Project[] {
  return getDb().select().from(projects).orderBy(desc(projects.updatedAt)).all()
}

/** 读取项目导出设置；null/缺省时回退 DEFAULT_EXPORT_SETTINGS。项目不存在抛错。 */
export function getExportSettings(projectId: string): ExportSettings {
  const row = getDb()
    .select({ exportSettings: projects.exportSettings })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get()
  if (!row) throw new Error(`项目不存在：${projectId}`)
  return resolveExportSettings(row.exportSettings)
}

/** 读取单个项目的画布投影；不会跨项目返回节点或边。 */
export function getCanvasGraph(projectId: string): CanvasGraph {
  const db = getDb()
  const nodes = db
    .select({
      id: canvasNodes.id,
      type: canvasNodes.type,
      status: canvasNodes.status,
      stage: canvasNodes.stage,
      contentHash: canvasNodes.contentHash,
      data: canvasNodes.data,
      position: canvasNodes.position,
      laneKey: canvasNodes.laneKey,
      laneRole: canvasNodes.laneRole,
    })
    .from(canvasNodes)
    .where(eq(canvasNodes.projectId, projectId))
    .all()
    .map((node) => ({
      ...node,
      type: canvasNodeTypeSchema.parse(node.type),
      artifacts: getNodeArtifacts(projectId, node.id),
    }))
  const edges = db
    .select({
      id: canvasEdges.id,
      source: canvasEdges.source,
      target: canvasEdges.target,
    })
    .from(canvasEdges)
    .where(eq(canvasEdges.projectId, projectId))
    .all()
  return { nodes, edges }
}

/** 某节点当前真实存在的产物列表（按最新优先），排除内部会话指针。 */
export function getNodeArtifacts(projectId: string, nodeId: string): CanvasNodeArtifact[] {
  return getDb()
    .select({ id: artifacts.id, kind: artifacts.kind, path: artifacts.path })
    .from(artifacts)
    .where(and(eq(artifacts.projectId, projectId), eq(artifacts.nodeId, nodeId)))
    .orderBy(desc(artifacts.createdAt), desc(artifacts.id))
    .all()
    .filter((row) => row.kind !== 'pi-session')
    .map((row) => ({ id: row.id, kind: row.kind, filename: basenameOf(row.path) }))
}

function basenameOf(path: string): string {
  const segments = path.split('/')
  return segments[segments.length - 1] || path
}
