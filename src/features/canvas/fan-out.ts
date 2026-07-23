import 'server-only'
import { createHash } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { canvasEdges, canvasNodes } from '@/lib/db/schema'
import type { Db } from '@/lib/db/migrate'
import type { ShotLaneNodeType } from './types'

const LANE_ROLES: ShotLaneNodeType[] = [
  'shot-script',
  'shot-codegen',
  'shot-sfx',
  'shot-subtitle',
  'shot-qa',
]

type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0]
type AnchorType = 'shot-split' | 'score'

/** 在单个事务内幂等物化分镜通道及其首尾锚点连线。 */
export function materializeShotLanes(projectId: string, shotIds: string[]): void {
  const uniqueShotIds = [...new Set(shotIds)]
  if (uniqueShotIds.length === 0) return

  getDb().transaction((tx) => {
    const anchors = findAnchors(tx, projectId)
    const existingKeys = findExistingLaneKeys(tx, projectId, uniqueShotIds)

    for (const shotId of uniqueShotIds) {
      const existingCount = LANE_ROLES.filter((role) =>
        existingKeys.has(laneKey(shotId, role))
      ).length
      if (existingCount !== 0 && existingCount !== LANE_ROLES.length) {
        throw new Error(`分镜通道数据不完整，拒绝继续物化：${shotId}`)
      }
      if (existingCount === 0) insertLaneNodes(tx, projectId, shotId)
      insertLaneEdges(tx, projectId, shotId, anchors)
    }
  })
}

function findAnchors(
  tx: Transaction,
  projectId: string
): Record<AnchorType, string> {
  const nodes = tx
    .select({ id: canvasNodes.id, type: canvasNodes.type })
    .from(canvasNodes)
    .where(
      and(
        eq(canvasNodes.projectId, projectId),
        inArray(canvasNodes.type, ['shot-split', 'score'])
      )
    )
    .all()

  return {
    'shot-split': requireSingleAnchor(nodes, 'shot-split'),
    score: requireSingleAnchor(nodes, 'score'),
  }
}

function requireSingleAnchor(
  nodes: Array<{ id: string; type: string }>,
  type: AnchorType
): string {
  const matches = nodes.filter((node) => node.type === type)
  if (matches.length !== 1) {
    throw new Error(`项目必须且只能包含一个 ${type} 节点，当前数量：${matches.length}`)
  }
  return matches[0]!.id
}

function findExistingLaneKeys(
  tx: Transaction,
  projectId: string,
  shotIds: string[]
): Set<string> {
  const nodes = tx
    .select({ laneKey: canvasNodes.laneKey, laneRole: canvasNodes.laneRole })
    .from(canvasNodes)
    .where(
      and(eq(canvasNodes.projectId, projectId), inArray(canvasNodes.laneKey, shotIds))
    )
    .all()
  return new Set(
    nodes.flatMap((node) =>
      node.laneKey && node.laneRole ? [laneKey(node.laneKey, node.laneRole)] : []
    )
  )
}

function insertLaneNodes(tx: Transaction, projectId: string, shotId: string): void {
  tx.insert(canvasNodes)
    .values(
      LANE_ROLES.map((role) => ({
        id: stableId('node', projectId, shotId, role),
        projectId,
        type: role,
        position: { x: 0, y: 0 },
        laneKey: shotId,
        laneRole: role,
      }))
    )
    .run()
}

function insertLaneEdges(
  tx: Transaction,
  projectId: string,
  shotId: string,
  anchors: Record<AnchorType, string>
): void {
  const nodeIds = LANE_ROLES.map((role) => stableId('node', projectId, shotId, role))
  const pairs = [
    [anchors['shot-split'], nodeIds[0]!],
    ...nodeIds.slice(0, -1).map((source, index) => [source, nodeIds[index + 1]!] as const),
    [nodeIds.at(-1)!, anchors.score],
  ]
  tx.insert(canvasEdges)
    .values(
      pairs.map(([source, target]) => ({
        id: stableId('edge', projectId, source, target),
        projectId,
        source,
        target,
      }))
    )
    .onConflictDoNothing()
    .run()
}

function laneKey(shotId: string, role: string): string {
  return `${shotId}\u0000${role}`
}

function stableId(kind: 'node' | 'edge', ...parts: string[]): string {
  const digest = createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 24)
  return `${kind}_${digest}`
}
