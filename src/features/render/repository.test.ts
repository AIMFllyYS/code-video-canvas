import os from 'node:os'
import path from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb, type Db } from '@/lib/db/migrate'
import { artifacts, canvasNodes, projects } from '@/lib/db/schema'
import { RenderRepository } from './repository'

vi.mock('server-only', () => ({}))

const roles = ['shot-script', 'shot-codegen', 'shot-sfx', 'shot-subtitle', 'shot-qa']

describe('RenderRepository export plan', () => {
  let directory: string
  let db: Db
  let sqlite: ReturnType<typeof createDb>['sqlite']
  let repository: RenderRepository

  beforeEach(() => {
    directory = path.join(os.tmpdir(), `cvc-render-repo-${crypto.randomUUID()}`)
    mkdirSync(directory, { recursive: true })
    const database = createDb(path.join(directory, 'test.db'))
    db = database.db
    sqlite = database.sqlite
    repository = new RenderRepository(db)
    db.insert(projects).values({ id: 'project-1', title: '项目', script: '' }).run()
    insertLane(db, 'S002')
    insertLane(db, 'S001')
    for (const lane of ['S001', 'S002']) {
      db.insert(artifacts)
        .values({
          id: `artifact-${lane}`,
          projectId: 'project-1',
          nodeId: `node-${lane}-shot-codegen`,
          kind: 'render-mp4',
          path: `render/${lane}.mp4`,
          contentHash: `hash-${lane}`,
        })
        .run()
    }
  })

  afterEach(() => {
    sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it('returns shots in stable lane order', () => {
    expect(repository.getExportPlan('project-1')).toMatchObject({
      incompleteNodeIds: [],
      shots: [
        { laneKey: 'S001', outputKey: 'render/S001.mp4' },
        { laneKey: 'S002', outputKey: 'render/S002.mp4' },
      ],
    })
  })

  it('reports every non-success or missing-artifact node', () => {
    db.update(canvasNodes)
      .set({ status: 'pending' })
      .where(eq(canvasNodes.id, 'node-S002-shot-sfx'))
      .run()
    db.delete(artifacts).where(eq(artifacts.id, 'artifact-S001')).run()

    expect(repository.getExportPlan('project-1').incompleteNodeIds).toEqual([
      'node-S001-shot-codegen',
      'node-S002-shot-sfx',
    ])
  })
})

function insertLane(db: Db, laneKey: string): void {
  db.insert(canvasNodes)
    .values(
      roles.map((role) => ({
        id: `node-${laneKey}-${role}`,
        projectId: 'project-1',
        type: role,
        position: { x: 0, y: 0 },
        data: {},
        status: 'success' as const,
        laneKey,
        laneRole: role,
      }))
    )
    .run()
}
