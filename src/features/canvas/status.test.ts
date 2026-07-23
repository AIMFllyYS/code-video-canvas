import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb, type Db } from '@/lib/db/migrate'
import { canvasEdges, canvasNodes, projects } from '@/lib/db/schema'
import {
  computeContentHash,
  isStale,
  transitionNodeStatus,
} from './status'

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn<() => Db>() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: getDbMock }))

describe('canvas node status', () => {
  let database: ReturnType<typeof createDb>
  let projectId: string

  beforeEach(() => {
    database = createDb(':memory:')
    projectId = randomUUID()
    getDbMock.mockReturnValue(database.db)
    database.db.insert(projects).values({ id: projectId, title: '状态机测试' }).run()
  })

  afterEach(() => {
    database.sqlite.close()
    vi.clearAllMocks()
  })

  it('rejects an illegal idle to success transition', () => {
    const nodeId = insertNode(database.db, projectId, 'idle-node')
    expect(() => transitionNodeStatus(nodeId, 'success')).toThrow(
      '非法节点状态转换：idle -> success'
    )
  })

  it('persists a valid execution lifecycle', () => {
    const nodeId = insertNode(database.db, projectId, 'valid-node')
    transitionNodeStatus(nodeId, 'pending')
    transitionNodeStatus(nodeId, 'running')
    transitionNodeStatus(nodeId, 'success')

    const node = database.db
      .select()
      .from(canvasNodes)
      .where(eq(canvasNodes.id, nodeId))
      .get()
    expect(node?.status).toBe('success')
  })

  it('produces the same hash for semantically identical serializable input', () => {
    expect(computeContentHash({ b: 2, a: { y: 1, x: 0 } })).toBe(
      computeContentHash({ a: { x: 0, y: 1 }, b: 2 })
    )
  })

  it('becomes stale only after an upstream content hash changes', () => {
    const upstreamId = insertNode(database.db, projectId, 'upstream', 'hash-a')
    const fingerprint = computeContentHash([{ id: upstreamId, contentHash: 'hash-a' }])
    const downstreamId = insertNode(database.db, projectId, 'downstream', fingerprint, 'success')
    database.db
      .insert(canvasEdges)
      .values({
        id: randomUUID(),
        projectId,
        source: upstreamId,
        target: downstreamId,
      })
      .run()

    expect(isStale(downstreamId)).toBe(false)
    database.db
      .update(canvasNodes)
      .set({ contentHash: 'hash-b' })
      .where(eq(canvasNodes.id, upstreamId))
      .run()
    expect(isStale(downstreamId)).toBe(true)
    transitionNodeStatus(downstreamId, 'stale')
    expect(
      database.db
        .select({ status: canvasNodes.status })
        .from(canvasNodes)
        .where(eq(canvasNodes.id, downstreamId))
        .get()?.status
    ).toBe('stale')
  })
})

function insertNode(
  db: Db,
  projectId: string,
  suffix: string,
  contentHash: string | null = null,
  status: 'idle' | 'success' = 'idle'
): string {
  const id = `${projectId}-${suffix}`
  db.insert(canvasNodes)
    .values({
      id,
      projectId,
      type: 'shot-script',
      position: { x: 0, y: 0 },
      contentHash,
      status,
    })
    .run()
  return id
}
