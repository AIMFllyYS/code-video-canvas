import 'server-only'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { canvasEdges, canvasNodes, projects } from '@/lib/db/schema'
import { canvasNodeTypeSchema } from './schemas'
import type { CanvasNodeType, Project } from './types'

export interface CanvasGraphNode {
  id: string
  type: CanvasNodeType
  status: typeof canvasNodes.$inferSelect.status
  stage: string | null
  position: { x: number; y: number }
  laneKey: string | null
  laneRole: string | null
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

/** 读取单个项目的画布投影；不会跨项目返回节点或边。 */
export function getCanvasGraph(projectId: string): CanvasGraph {
  const db = getDb()
  const nodes = db
    .select({
      id: canvasNodes.id,
      type: canvasNodes.type,
      status: canvasNodes.status,
      stage: canvasNodes.stage,
      position: canvasNodes.position,
      laneKey: canvasNodes.laneKey,
      laneRole: canvasNodes.laneRole,
    })
    .from(canvasNodes)
    .where(eq(canvasNodes.projectId, projectId))
    .all()
    .map((node) => ({ ...node, type: canvasNodeTypeSchema.parse(node.type) }))
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
