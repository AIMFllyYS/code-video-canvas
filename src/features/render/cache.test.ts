import os from 'node:os'
import path from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '@/lib/db/migrate'
import { artifacts, canvasNodes, projects } from '@/lib/db/schema'
import type { StorageAdapter } from '@/lib/storage'
import { lookupCache, writeCache } from './cache'

vi.mock('server-only', () => ({}))

describe('render cache', () => {
  let directory: string
  let db: Db
  let sqlite: ReturnType<typeof createDb>['sqlite']
  let storage: StorageAdapter

  beforeEach(() => {
    directory = path.join(os.tmpdir(), `cvc-render-cache-${crypto.randomUUID()}`)
    mkdirSync(directory, { recursive: true })
    const database = createDb(path.join(directory, 'test.db'))
    db = database.db
    sqlite = database.sqlite
    storage = {
      put: vi.fn(),
      get: vi.fn(),
      exists: vi.fn(async () => true),
      localPath: vi.fn(),
      delete: vi.fn(),
    }
    db.insert(projects).values({ id: 'project-1', title: '项目', script: '' }).run()
    db.insert(canvasNodes)
      .values({
        id: 'node-1',
        projectId: 'project-1',
        type: 'shot-codegen',
        position: { x: 0, y: 0 },
        data: {},
      })
      .run()
  })

  afterEach(() => {
    sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it('registers and returns an existing content-addressed mp4', async () => {
    writeCache(
      {
        projectId: 'project-1',
        nodeId: 'node-1',
        outputKey: 'render/project-1/node-1/render-key-1.mp4',
        contentHash: 'file-hash-1',
      },
      { db }
    )

    await expect(
      lookupCache(
        { projectId: 'project-1', nodeId: 'node-1', renderKey: 'render-key-1' },
        { db, storage }
      )
    ).resolves.toEqual({
      outputKey: 'render/project-1/node-1/render-key-1.mp4',
      contentHash: 'file-hash-1',
    })
  })

  it('treats an artifact with a missing file as a cache miss', async () => {
    db.insert(artifacts)
      .values({
        id: 'artifact-1',
        projectId: 'project-1',
        nodeId: 'node-1',
        kind: 'render-mp4',
        path: 'render/missing.mp4',
        contentHash: 'hash-1',
      })
      .run()
    vi.mocked(storage.exists).mockResolvedValue(false)

    await expect(
      lookupCache(
        { projectId: 'project-1', nodeId: 'node-1', renderKey: 'hash-1' },
        { db, storage }
      )
    ).resolves.toBeNull()
  })
})
