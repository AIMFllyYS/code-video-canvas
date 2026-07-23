import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createDb } from './migrate'
import { projects } from './schema'

describe('db schema', () => {
  it('migrates in-memory and round-trips a project', () => {
    const { db, sqlite } = createDb(':memory:')
    const id = randomUUID()
    db.insert(projects).values({ id, title: '测试项目', script: '稿子' }).run()

    const rows = db.select().from(projects).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.title).toBe('测试项目')
    expect(rows[0]?.createdAt).toBeInstanceOf(Date)

    sqlite.close()
  })
})
