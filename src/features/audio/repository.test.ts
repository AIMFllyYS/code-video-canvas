import { describe, expect, it, vi } from 'vitest'
import type { StorageAdapter } from '@/lib/storage'
import { storeAudioArtifact } from './repository'

vi.mock('server-only', () => ({}))

function storage(): StorageAdapter {
  return {
    put: vi.fn(async (key: string) => key),
    get: vi.fn(),
    exists: vi.fn(),
    localPath: vi.fn(),
    delete: vi.fn(),
    tempDir: vi.fn(),
    readLocalFile: vi.fn(),
    removeTempDir: vi.fn(),
  }
}

describe('storeAudioArtifact', () => {
  it('writes content-addressed bytes before registering the artifact', async () => {
    const target = storage()
    const order: string[] = []
    vi.mocked(target.put).mockImplementation(async (key) => {
      order.push('store')
      return key
    })
    const insertArtifact = vi.fn(async () => {
      order.push('index')
    })

    const result = await storeAudioArtifact(
      {
        projectId: 'project-1',
        nodeId: 'node-1',
        shotId: 'S001',
        kind: 'voiceover-audio',
        extension: 'mp3',
        data: Buffer.from([1, 2, 3]),
      },
      { storage: target, insertArtifact, createId: () => 'artifact-1' }
    )

    expect(order).toEqual(['store', 'index'])
    expect(result.id).toBe('artifact-1')
    expect(result.storageKey).toMatch(
      /^audio\/project-1\/S001\/voiceover-audio-[0-9a-f]{64}\.mp3$/
    )
    expect(insertArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'artifact-1',
        projectId: 'project-1',
        nodeId: 'node-1',
        kind: 'voiceover-audio',
        path: result.storageKey,
        contentHash: result.contentHash,
      })
    )
  })

  it('deletes stored bytes if artifact indexing fails', async () => {
    const target = storage()
    const failure = new Error('索引失败')

    await expect(
      storeAudioArtifact(
        {
          projectId: 'project-1',
          nodeId: 'node-1',
          shotId: 'S001',
          kind: 'subtitle-track',
          extension: 'json',
          data: '{}',
        },
        {
          storage: target,
          insertArtifact: vi.fn(async () => {
            throw failure
          }),
          createId: () => 'artifact-1',
        }
      )
    ).rejects.toBe(failure)
    expect(target.delete).toHaveBeenCalledOnce()
  })

  it('rejects identifiers that could escape the storage root', async () => {
    const target = storage()

    await expect(
      storeAudioArtifact(
        {
          projectId: '../outside',
          nodeId: 'node-1',
          shotId: 'S001',
          kind: 'voiceover-audio',
          extension: 'mp3',
          data: Buffer.from([1]),
        },
        {
          storage: target,
          insertArtifact: vi.fn(),
          createId: () => 'artifact-1',
        }
      )
    ).rejects.toThrow('projectId')
    expect(target.put).not.toHaveBeenCalled()
  })
})
