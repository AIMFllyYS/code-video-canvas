import 'server-only'
import { createHash } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import type { Db } from '@/lib/db/migrate'
import { canvasEdges, canvasNodes } from '@/lib/db/schema'
import type { NodeStatus } from './types'

export type { NodeStatus } from './types'

type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0]

const ALLOWED_TRANSITIONS: Record<NodeStatus, readonly NodeStatus[]> = {
  idle: ['pending'],
  pending: ['running'],
  running: ['success', 'failed'],
  success: ['stale'],
  failed: ['pending', 'stale'],
  stale: ['pending'],
}

/** 对 JSON 可序列化输入生成跨进程稳定的 SHA-256。 */
export function computeContentHash(input: unknown): string {
  const serialized = JSON.stringify(input)
  if (serialized === undefined) throw new Error('内容哈希输入必须可 JSON 序列化')

  let normalized: unknown
  try {
    normalized = sortJsonValue(JSON.parse(serialized) as unknown)
  } catch (error) {
    throw new Error('内容哈希输入必须可 JSON 序列化', { cause: error })
  }
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
}

/** 原子校验并写入节点状态；stale 只允许由真实上游变化触发。 */
export function transitionNodeStatus(nodeId: string, next: NodeStatus): void {
  getDb().transaction((tx) => {
    const node = tx
      .select({ id: canvasNodes.id, status: canvasNodes.status, contentHash: canvasNodes.contentHash })
      .from(canvasNodes)
      .where(eq(canvasNodes.id, nodeId))
      .get()
    if (!node) throw new Error(`节点不存在：${nodeId}`)
    if (!ALLOWED_TRANSITIONS[node.status].includes(next)) {
      throw new Error(`非法节点状态转换：${node.status} -> ${next}`)
    }
    if (next === 'stale' && !isStaleInTransaction(tx, node)) {
      throw new Error(`节点上游内容未变化，不能标记为 stale：${nodeId}`)
    }
    tx.update(canvasNodes).set({ status: next }).where(eq(canvasNodes.id, nodeId)).run()
  })
}

/**
 * 比较节点保存的“上次消费依赖指纹”与当前全部上游节点哈希。
 * 无上游的根节点不由依赖变化触发 stale。
 */
export function isStale(nodeId: string): boolean {
  return getDb().transaction((tx) => {
    const node = tx
      .select({ id: canvasNodes.id, contentHash: canvasNodes.contentHash })
      .from(canvasNodes)
      .where(eq(canvasNodes.id, nodeId))
      .get()
    if (!node) throw new Error(`节点不存在：${nodeId}`)
    return isStaleInTransaction(tx, node)
  })
}

function isStaleInTransaction(
  tx: Transaction,
  node: { id: string; contentHash: string | null }
): boolean {
  const dependencies = dependencyHashes(tx, node.id)
  if (dependencies.length === 0) return false
  return node.contentHash !== computeContentHash(dependencies)
}

function dependencyHashes(
  tx: Transaction,
  nodeId: string
): Array<{ id: string; contentHash: string | null }> {
  const incoming = tx
    .select({ source: canvasEdges.source })
    .from(canvasEdges)
    .where(eq(canvasEdges.target, nodeId))
    .all()
  if (incoming.length === 0) return []

  return tx
    .select({ id: canvasNodes.id, contentHash: canvasNodes.contentHash })
    .from(canvasNodes)
    .where(inArray(canvasNodes.id, incoming.map(({ source }) => source)))
    .all()
    .sort((left, right) => left.id.localeCompare(right.id))
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJsonValue(child)])
    )
  }
  return value
}
