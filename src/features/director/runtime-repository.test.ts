import os from 'node:os'
import path from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb, type Db } from '@/lib/db/migrate'
import { artifacts, canvasNodes, projects } from '@/lib/db/schema'
import type { StorageAdapter } from '@/lib/storage'
import { DirectorRuntimeRepository } from './runtime-repository'

vi.mock('server-only', () => ({}))

function createMockStorage(): StorageAdapter {
  return {
    put: vi.fn(async () => 'mock-key'),
    get: vi.fn(async () => Buffer.from('{}')),
    exists: vi.fn(async () => false),
    localPath: vi.fn(() => '/mock/path'),
    delete: vi.fn(async () => {}),
  }
}

describe('DirectorRuntimeRepository', () => {
  let directory: string
  let db: Db
  let sqlite: ReturnType<typeof createDb>['sqlite']
  let repository: DirectorRuntimeRepository

  beforeEach(() => {
    directory = path.join(os.tmpdir(), `cvc-director-repo-${crypto.randomUUID()}`)
    mkdirSync(directory, { recursive: true })
    const database = createDb(path.join(directory, 'test.db'))
    db = database.db
    sqlite = database.sqlite
    repository = new DirectorRuntimeRepository(db, createMockStorage())
    db.insert(projects)
      .values({ id: 'project-1', title: '项目', script: '原始脚本' })
      .run()
    db.insert(canvasNodes)
      .values({
        id: 'node-1',
        projectId: 'project-1',
        type: 'script-import',
        stage: 'INGEST',
        status: 'pending',
        position: { x: 0, y: 0 },
        data: { directorInput: { rawScript: '节点脚本' } },
      })
      .run()
  })

  afterEach(() => {
    sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it('loads only a matching pending stage context', async () => {
    await expect(
      repository.loadStageContext('project-1', 'node-1', 'INGEST')
    ).resolves.toMatchObject({
      projectId: 'project-1',
      nodeId: 'node-1',
      status: 'pending',
      projectScript: '原始脚本',
      directorInput: { rawScript: '节点脚本' },
    })
    await expect(
      repository.loadStageContext('project-1', 'node-1', 'DIRECT')
    ).rejects.toThrow('阶段不匹配')

    db.update(canvasNodes)
      .set({ status: 'idle' })
      .where(eq(canvasNodes.id, 'node-1'))
      .run()
    await expect(
      repository.loadStageContext('project-1', 'node-1', 'INGEST')
    ).rejects.toThrow('pending')
  })

  it('checks ownership, stage, and status before enqueueing', () => {
    db.update(canvasNodes)
      .set({ status: 'idle' })
      .where(eq(canvasNodes.id, 'node-1'))
      .run()
    expect(() =>
      repository.assertEnqueueable('project-1', 'node-1', 'INGEST')
    ).not.toThrow()
    expect(() =>
      repository.assertEnqueueable('project-1', 'node-1', 'DIRECT')
    ).toThrow('阶段不匹配')
    expect(() =>
      repository.assertEnqueueable('other-project', 'node-1', 'INGEST')
    ).toThrow('不属于项目')
  })

  it('registers only relative artifact pointers and records structured errors', () => {
    repository.registerArtifactPointer({
      projectId: 'project-1',
      nodeId: 'node-1',
      kind: 'pi-session',
      storageKey: 'pi-sessions/project-1/session.jsonl',
    })
    expect(db.select().from(artifacts).all()).toHaveLength(1)
    expect(() =>
      repository.registerArtifactPointer({
        projectId: 'project-1',
        nodeId: 'node-1',
        kind: 'pi-session',
        storageKey: 'D:\\sessions\\secret.jsonl',
      })
    ).toThrow('相对')

    repository.recordStageError('node-1', 'INGEST', new Error('模型失败'))
    const node = db.select().from(canvasNodes).where(eq(canvasNodes.id, 'node-1')).get()
    expect(node?.data).toMatchObject({
      directorError: { stage: 'INGEST', message: '模型失败' },
    })
  })

  it('records only trusted stage metadata alongside existing node data', () => {
    repository.recordStageOutput(
      'node-1',
      {
        content: '<!doctype html>',
        renderSpec: {
          fps: 30,
          durationInFrames: 45,
          width: 1080,
          height: 1920,
          seed: 42,
        },
      },
      'artifact-1'
    )

    const node = db.select().from(canvasNodes).where(eq(canvasNodes.id, 'node-1')).get()
    expect(node?.data).toMatchObject({
      directorInput: { rawScript: '节点脚本' },
      directorArtifactId: 'artifact-1',
      renderSpec: {
        fps: 30,
        durationInFrames: 45,
        width: 1080,
        height: 1920,
        seed: 42,
      },
    })
  })
})
