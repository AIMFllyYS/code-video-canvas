import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createLegacySqliteTestDatabase } from '@/lib/migration/legacy-sqlite-test-database'
import { canvasNodes, projects } from './schema'

describe('db schema', () => {
  it('migrates in-memory and round-trips a project', () => {
    const { db, sqlite } = createLegacySqliteTestDatabase(':memory:')
    const id = randomUUID()
    db.insert(projects).values({ id, title: '测试项目', script: '稿子' }).run()

    const rows = db.select().from(projects).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe('测试项目')
    expect(rows[0]?.createdAt).toBeInstanceOf(Date)

    sqlite.close()
  })

  it('applies canvas node execution defaults and permits nullable lane metadata', () => {
    const { db, sqlite } = createLegacySqliteTestDatabase(':memory:')
    const projectId = randomUUID()
    db.insert(projects).values({ id: projectId, title: '节点状态测试' }).run()
    db.insert(canvasNodes)
      .values({
        id: randomUUID(),
        projectId,
        type: 'shot',
        position: { x: 0, y: 0 },
        contentHash: null,
        laneKey: null,
        laneRole: null,
      })
      .run()

    const node = db.select().from(canvasNodes).get()
    expect(node?.status).toBe('idle')
    expect(node?.contentHash).toBeNull()
    expect(node?.laneKey).toBeNull()
    expect(node?.laneRole).toBeNull()

    sqlite.close()
  })
})
