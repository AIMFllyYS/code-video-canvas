import os from 'node:os'
import path from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
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
    tempDir: vi.fn(),
    readLocalFile: vi.fn(),
    removeTempDir: vi.fn(),
  }
}

/** 按 storageKey 分发内容；未登记的 key 抛错，以验证永不读取 render/final mp4 二进制。 */
function createStorageFromMap(files: Map<string, string>): StorageAdapter {
  return {
    put: vi.fn(async () => 'mock-key'),
    get: vi.fn(async (key: string) => {
      const content = files.get(key)
      if (content === undefined) throw new Error(`未登记的产物内容：${key}`)
      return Buffer.from(content)
    }),
    exists: vi.fn(async () => false),
    localPath: vi.fn(() => '/mock/path'),
    delete: vi.fn(async () => {}),
    tempDir: vi.fn(),
    readLocalFile: vi.fn(),
    removeTempDir: vi.fn(),
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

  it('persistStreamLog 落盘为 director-stream-log 指针，空文本跳过', async () => {
    const storage = createMockStorage()
    const repo = new DirectorRuntimeRepository(db, storage)

    await repo.persistStreamLog('project-1', 'node-1', 'INGEST', '流式全文')
    expect(storage.put).toHaveBeenCalledWith(
      'director-stream/project-1/node-1/ingest.log',
      '流式全文'
    )
    const rows = db
      .select()
      .from(artifacts)
      .where(eq(artifacts.kind, 'director-stream-log'))
      .all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.path).toBe('director-stream/project-1/node-1/ingest.log')
    expect(rows[0]?.nodeId).toBe('node-1')

    await repo.persistStreamLog('project-1', 'node-1', 'INGEST', '')
    expect(storage.put).toHaveBeenCalledTimes(1)
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

describe('DirectorRuntimeRepository ASSEMBLE/FINALIZE 输入契约', () => {
  let directory: string
  let db: Db
  let sqlite: ReturnType<typeof createDb>['sqlite']
  let repository: DirectorRuntimeRepository
  let files: Map<string, string>

  function insertNode(
    id: string,
    type: string,
    stage: string,
    status: 'idle' | 'pending' | 'success',
    laneKey?: string
  ): void {
    db.insert(canvasNodes)
      .values({
        id,
        projectId: 'p1',
        type,
        stage,
        status,
        position: { x: 0, y: 0 },
        ...(laneKey ? { laneKey, laneRole: type } : {}),
      })
      .run()
  }

  function insertArtifact(
    nodeId: string | null,
    kind: string,
    artifactPath: string,
    content?: string
  ): void {
    db.insert(artifacts)
      .values({ id: crypto.randomUUID(), projectId: 'p1', nodeId, kind, path: artifactPath })
      .run()
    if (content !== undefined) files.set(artifactPath, content)
  }

  beforeEach(() => {
    directory = path.join(os.tmpdir(), `cvc-director-io-${crypto.randomUUID()}`)
    mkdirSync(directory, { recursive: true })
    const database = createDb(path.join(directory, 'test.db'))
    db = database.db
    sqlite = database.sqlite
    files = new Map()
    repository = new DirectorRuntimeRepository(db, createStorageFromMap(files))
    db.insert(projects).values({ id: 'p1', title: '项目', script: '原始脚本' }).run()
    insertNode('n-ingest', 'script-import', 'INGEST', 'success')
    insertNode('n-split', 'shot-split', 'DIRECT', 'success')
    insertNode('n-score', 'score', 'ASSEMBLE', 'pending')
    insertNode('n-export', 'export', 'FINALIZE', 'pending')
    insertArtifact(
      'n-ingest',
      'director-ingest',
      'a/ingest.json',
      JSON.stringify({
        scriptUnits: [
          { unitId: 'U001', text: '第一句。' },
          { unitId: 'U002', text: '第二句。' },
        ],
      })
    )
    insertArtifact(
      'n-split',
      'director-direct',
      'a/direct.json',
      JSON.stringify({ masterPlan: '导演总纲', styleBible: '风格圣经' })
    )
    for (const [index, shotId] of ['S001', 'S002'].entries()) {
      const n = index + 1
      insertNode(`n-script-${n}`, 'shot-script', 'SHOT_SPEC', 'success', shotId)
      insertNode(`n-codegen-${n}`, 'shot-codegen', 'FABRICATE', 'success', shotId)
      insertNode(`n-sfx-${n}`, 'shot-sfx', 'ASSEMBLE', 'pending', shotId)
      insertNode(`n-subtitle-${n}`, 'shot-subtitle', 'ASSEMBLE', 'pending', shotId)
      insertNode(`n-qa-${n}`, 'shot-qa', 'FINALIZE', 'pending', shotId)
      insertArtifact(
        `n-script-${n}`,
        'director-shot-spec',
        `a/spec-${n}.json`,
        JSON.stringify({ schemaVersion: 1, shots: [{ id: shotId, purpose: 'demo' }] })
      )
      insertArtifact(`n-codegen-${n}`, 'render-mp4', `r/${shotId}.mp4`)
    }
  })

  afterEach(() => {
    sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it('assembles the score input from every lane spec and render', async () => {
    const context = await repository.loadStageContext('p1', 'n-score', 'ASSEMBLE')
    const input = context.directorInput as {
      styleBible: string
      shotPlan: { shots: Array<{ id: string }> }
      audioAllocation: { shots: Array<{ id: string }> }
      renderedArtifactKeys: string[]
    }
    expect(context.nodeType).toBe('score')
    expect(input.styleBible).toBe('风格圣经')
    expect(input.shotPlan.shots.map((shot) => shot.id)).toEqual(['S001', 'S002'])
    expect(input.renderedArtifactKeys).toEqual(['r/S001.mp4', 'r/S002.mp4'])
    expect(input.audioAllocation.shots).toHaveLength(2)
  })

  it('fails the score input when any lane is missing its render', async () => {
    db.delete(artifacts)
      .where(and(eq(artifacts.nodeId, 'n-codegen-2'), eq(artifacts.kind, 'render-mp4')))
      .run()
    await expect(
      repository.loadStageContext('p1', 'n-score', 'ASSEMBLE')
    ).rejects.toThrow('render-mp4')
  })

  it('assembles per-shot sfx and subtitle inputs', async () => {
    const sfx = (await repository.loadStageContext('p1', 'n-sfx-1', 'ASSEMBLE'))
      .directorInput as {
      shot: { id: string }
      shotAllocation: { id: string }
      renderedArtifactKey: string
      styleBible: string
    }
    expect(sfx.shot.id).toBe('S001')
    expect(sfx.shotAllocation.id).toBe('S001')
    expect(sfx.renderedArtifactKey).toBe('r/S001.mp4')
    expect(sfx.styleBible).toBe('风格圣经')

    const subtitle = (await repository.loadStageContext('p1', 'n-subtitle-2', 'ASSEMBLE'))
      .directorInput as {
      shot: { id: string }
      scriptUnit: { unitId: string }
      shotAllocation: { id: string }
    }
    expect(subtitle.shot.id).toBe('S002')
    expect(subtitle.scriptUnit.unitId).toBe('U002')
    expect(subtitle.shotAllocation.id).toBe('S002')
  })

  it('resolves the export input from the final artifact and available shot-qa findings', async () => {
    insertArtifact(null, 'final-mp4', 'final/main.mp4')
    insertArtifact('n-qa-1', 'director-finalize', 'qa/S001.txt', 'S001 通过')
    const input = (await repository.loadStageContext('p1', 'n-export', 'FINALIZE'))
      .directorInput as {
      shotPlan: { shots: Array<{ id: string }> }
      draftArtifactKey: string
      qaFindings: string[]
    }
    expect(input.draftArtifactKey).toBe('final/main.mp4')
    expect(input.shotPlan.shots.map((shot) => shot.id)).toEqual(['S001', 'S002'])
    expect(input.qaFindings).toEqual(['S001 通过'])
  })

  it('fails the export input with a readable message before any final artifact exists', async () => {
    await expect(
      repository.loadStageContext('p1', 'n-export', 'FINALIZE')
    ).rejects.toThrow('请先完成合成导出')
  })

  it('assembles the per-shot qa input', async () => {
    const input = (await repository.loadStageContext('p1', 'n-qa-1', 'FINALIZE'))
      .directorInput as {
      shot: { id: string }
      renderedArtifactKey: string
      shotAllocation: { id: string }
    }
    expect(input.shot.id).toBe('S001')
    expect(input.renderedArtifactKey).toBe('r/S001.mp4')
    expect(input.shotAllocation.id).toBe('S001')
  })
})
