import os from 'node:os'
import path from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '@/lib/db/migrate'
import { artifacts, canvasNodes, projects } from '@/lib/db/schema'
import { LocalFsStorage } from '@/lib/storage'
import { RenderRepository } from './repository'
import { captureThumbnails } from './thumbnail'
import type { ThumbnailContext } from './types'

vi.mock('server-only', () => ({}))

describe('captureThumbnails integration', () => {
  let directory: string
  let db: Db
  let sqlite: ReturnType<typeof createDb>['sqlite']
  let storage: LocalFsStorage
  let repository: RenderRepository
  let context: ThumbnailContext

  beforeEach(async () => {
    directory = path.join(os.tmpdir(), `cvc-thumbnail-e2e-${crypto.randomUUID()}`)
    mkdirSync(directory, { recursive: true })
    const database = createDb(path.join(directory, 'test.db'))
    db = database.db
    sqlite = database.sqlite
    repository = new RenderRepository(db)
    storage = new LocalFsStorage(path.join(directory, 'artifacts'))

    await mkdir(path.join(directory, 'artifacts', 'director'), { recursive: true })
    const fixture = await readFile(
      new URL('./__fixtures__/deterministic-shot.html', import.meta.url)
    )
    await storage.put('director/S001.html', fixture)

    db.insert(projects).values({ id: 'project-e2e', title: '项目', script: '' }).run()
    db.insert(canvasNodes)
      .values({
        id: 'node-e2e',
        projectId: 'project-e2e',
        type: 'shot-codegen',
        position: { x: 0, y: 0 },
        data: {
          renderSpec: { fps: 24, durationInFrames: 12, width: 320, height: 180 },
        },
        status: 'success',
        laneKey: 'S001',
      })
      .run()
    db.insert(artifacts)
      .values({
        id: 'html-artifact',
        projectId: 'project-e2e',
        nodeId: 'node-e2e',
        kind: 'director-fabricate',
        path: 'director/S001.html',
      })
      .run()

    context = repository.loadCompletedThumbnailContext('project-e2e', 'node-e2e')
  })

  afterEach(() => {
    sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it('extracts real PNG frames and registers frame-thumbnail artifacts', async () => {
    const results = await captureThumbnails(context, [{ fraction: 0.25 }, { fraction: 0.95 }], {
      storage,
      repository,
    })

    expect(results).toHaveLength(2)
    for (const result of results) {
      const row = db
        .select({ path: artifacts.path, kind: artifacts.kind })
        .from(artifacts)
        .where(eq(artifacts.id, result.artifactId))
        .get()
      expect(row?.kind).toBe('frame-thumbnail')
      const bytes = await storage.get(row!.path)
      expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
    }
  }, 30_000)

  it('reuses the same artifact on a second call for the same targets', async () => {
    const first = await captureThumbnails(context, [{ fraction: 0.25 }, { fraction: 0.6 }], {
      storage,
      repository,
    })
    const second = await captureThumbnails(context, [{ fraction: 0.25 }, { fraction: 0.6 }], {
      storage,
      repository,
    })

    expect(second).toEqual(first)
  }, 30_000)

  it('throws a clear error when the node has no renderSpec yet', () => {
    db.insert(canvasNodes)
      .values({
        id: 'node-no-spec',
        projectId: 'project-e2e',
        type: 'shot-codegen',
        position: { x: 0, y: 0 },
        data: {},
        status: 'success',
        laneKey: 'S002',
      })
      .run()

    expect(() =>
      repository.loadCompletedThumbnailContext('project-e2e', 'node-no-spec')
    ).toThrow()
  })
})
