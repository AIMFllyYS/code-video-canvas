import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '@/lib/db/migrate'
import { artifacts, canvasNodes, projects } from '@/lib/db/schema'
import type { StorageAdapter } from '@/lib/storage'
import { AudioRuntimeRepository } from './runtime-repository'

vi.mock('server-only', () => ({}))

describe('AudioRuntimeRepository', () => {
  let database: ReturnType<typeof createDb>
  let db: Db
  let storage: StorageAdapter

  beforeEach(() => {
    database = createDb(':memory:')
    db = database.db
    db.insert(projects).values({ id: 'project-1', title: '项目', script: '原稿' }).run()
    db.insert(canvasNodes)
      .values({
        id: 'sfx-1',
        projectId: 'project-1',
        type: 'shot-sfx',
        stage: 'ASSEMBLE',
        laneKey: 'S001',
        position: { x: 0, y: 0 },
        data: {},
        status: 'success',
      })
      .run()
    db.insert(artifacts)
      .values([
        {
          id: 'audio-1',
          projectId: 'project-1',
          nodeId: 'sfx-1',
          kind: 'voiceover-audio',
          path: 'audio/project-1/S001/voiceover.mp3',
          contentHash: 'audio-hash',
        },
        {
          id: 'metadata-1',
          projectId: 'project-1',
          nodeId: 'sfx-1',
          kind: 'voiceover-metadata',
          path: 'audio/project-1/S001/voiceover.json',
          contentHash: 'metadata-hash',
        },
      ])
      .run()
    storage = {
      put: vi.fn(),
      get: vi.fn(async (key: string) => {
        if (key.endsWith('.mp3')) return Buffer.from([1, 2, 3])
        return Buffer.from(
          JSON.stringify({
            version: 1,
            shotId: 'S001',
            model: 'stepaudio-2.5-tts',
            durationMs: 1200,
            audioArtifactId: 'audio-1',
            audioKey: 'audio/project-1/S001/voiceover.mp3',
            audioFormat: 'mp3',
            nativeCaptions: [{ startMs: 0, endMs: 1200, text: '旁白' }],
          })
        )
      }),
      exists: vi.fn(),
      localPath: vi.fn(),
      delete: vi.fn(),
      tempDir: vi.fn(),
      readLocalFile: vi.fn(),
      removeTempDir: vi.fn(),
    }
  })

  afterEach(() => {
    database.sqlite.close()
  })

  it('loads a traceable voiceover only from the matching project and lane', async () => {
    const repository = new AudioRuntimeRepository(db, storage)

    const source = await repository.loadVoiceover('project-1', 'S001')

    expect(source).toEqual(
      expect.objectContaining({
        audioArtifactId: 'audio-1',
        audioKey: 'audio/project-1/S001/voiceover.mp3',
        audioFormat: 'mp3',
        durationMs: 1200,
      })
    )
    expect(source.audioBytes).toEqual(Buffer.from([1, 2, 3]))
  })

  it('rejects metadata that points outside the indexed audio artifact', async () => {
    vi.mocked(storage.get).mockImplementationOnce(async () =>
      Buffer.from(
        JSON.stringify({
          version: 1,
          shotId: 'S001',
          model: 'stepaudio-2.5-tts',
          durationMs: 1200,
          audioArtifactId: 'audio-1',
          audioKey: 'audio/project-1/S001/other.mp3',
          audioFormat: 'mp3',
          nativeCaptions: [],
        })
      )
    )
    const repository = new AudioRuntimeRepository(db, storage)

    await expect(repository.loadVoiceover('project-1', 'S001')).rejects.toThrow(
      '索引不一致'
    )
  })
})
