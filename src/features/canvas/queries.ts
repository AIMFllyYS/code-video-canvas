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

/** 可展示的 Director 阶段失败信息（源自 canvas_nodes.data.directorError）。 */
export interface DirectorNodeError {
  stage: string
  message: string
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
  directorError?: DirectorNodeError
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

/** 读取项目级自动推进真实状态；项目不存在时抛错。 */
export function getProjectAutopilot(projectId: string): boolean {
  const row = getDb()
    .select({ autopilot: projects.autopilot })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get()
  if (!row) throw new Error(`项目不存在：${projectId}`)
  return row.autopilot
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
      directorError: parseDirectorError(node.data),
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
    .filter((row) => row.kind !== 'pi-session' && row.kind !== 'director-stream-log')
    .map((row) => ({ id: row.id, kind: row.kind, filename: basenameOf(row.path) }))
}

/** 从节点 data 收窄出可展示的 Director 失败信息（无 / 形状不符时返回 undefined）。 */
export function parseDirectorError(
  data: Record<string, unknown>
): DirectorNodeError | undefined {
  const raw = data.directorError
  if (!raw || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  if (typeof record.stage !== 'string' || typeof record.message !== 'string') {
    return undefined
  }
  return { stage: record.stage, message: record.message }
}

export interface NodeStreamContext {
  status: CanvasGraphNode['status']
  directorError?: DirectorNodeError
}

/** 单节点流式上下文（含项目归属校验）：不存在或不属于该项目返回 null。 */
export function getNodeStreamContext(
  projectId: string,
  nodeId: string
): NodeStreamContext | null {
  const row = getDb()
    .select({ status: canvasNodes.status, data: canvasNodes.data })
    .from(canvasNodes)
    .where(and(eq(canvasNodes.id, nodeId), eq(canvasNodes.projectId, projectId)))
    .get()
  if (!row) return null
  return { status: row.status, directorError: parseDirectorError(row.data) }
}

function basenameOf(path: string): string {
  const segments = path.split('/')
  return segments[segments.length - 1] || path
}
