import os from 'node:os'
import path from 'node:path'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StorageAdapter } from '@/lib/storage'
import { exportProject } from './export-service'

vi.mock('server-only', () => ({}))

const directories: string[] = []

describe('exportProject', () => {
  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    )
  })

  it('returns all incomplete ids without invoking concat', async () => {
    const concat = vi.fn()
    const result = await exportProject('project-1', {
      repository: {
        getExportPlan: vi.fn(() => ({
          incompleteNodeIds: ['node-2', 'node-1'],
          shots: [],
          musicKey: null,
        })),
        registerFinalArtifact: vi.fn(),
      },
      storage: createStorage(),
      concat,
    })

    expect(result).toEqual({
      ok: false,
      incompleteNodeIds: ['node-1', 'node-2'],
    })
    expect(concat).not.toHaveBeenCalled()
  })

  it('commits a complete concat result through StorageAdapter', async () => {
    const tempRoot = await createTempRoot()
    const storage = createStorage()
    vi.mocked(storage.exists).mockResolvedValue(true)
    vi.mocked(storage.localPath).mockImplementation((key) => path.join(tempRoot, key))
    vi.mocked(storage.put).mockImplementation(async (key) => key)
    const registerFinalArtifact = vi.fn()
    const concat = vi.fn(async (_shots, _music, outputPath: string) => {
      await writeFile(outputPath, Buffer.from('deterministic-final-mp4'))
      return outputPath
    })

    const result = await exportProject('project-1', {
      repository: {
        getExportPlan: vi.fn(() => ({
          incompleteNodeIds: [],
          shots: [
            { nodeId: 'node-2', laneKey: 'S002', outputKey: 'render/S002.mp4' },
            { nodeId: 'node-1', laneKey: 'S001', outputKey: 'render/S001.mp4' },
          ],
          musicKey: null,
        })),
        registerFinalArtifact,
      },
      storage,
      concat,
      tempRoot,
    })

    expect(result).toMatchObject({ ok: true })
    expect(concat.mock.calls[0]?.[0]).toEqual([
      path.join(tempRoot, 'render/S001.mp4'),
      path.join(tempRoot, 'render/S002.mp4'),
    ])
    expect(storage.put).toHaveBeenCalledOnce()
    expect(registerFinalArtifact).toHaveBeenCalledOnce()
  })
})

function createStorage(): StorageAdapter {
  return {
    put: vi.fn(),
    get: vi.fn(),
    exists: vi.fn(),
    localPath: vi.fn(),
    delete: vi.fn(),
  }
}

async function createTempRoot(): Promise<string> {
  const directory = path.join(os.tmpdir(), `cvc-export-${crypto.randomUUID()}`)
  directories.push(directory)
  await mkdir(directory, { recursive: true })
  return directory
}
