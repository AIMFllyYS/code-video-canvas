import { describe, expect, it, vi } from 'vitest'
import type { StorageAdapter } from '@/lib/storage'
import {
  ArtifactValidationError,
  writeValidatedArtifact,
} from './write-artifact'

vi.mock('server-only', () => ({}))

function createStorage(): StorageAdapter {
  return {
    put: vi.fn(async (key: string) => key),
    get: vi.fn(),
    exists: vi.fn(),
    localPath: vi.fn(),
    delete: vi.fn(),
  }
}

describe('writeValidatedArtifact', () => {
  it('validates before storing and indexing an artifact', async () => {
    const order: string[] = []
    const storage = createStorage()
    vi.mocked(storage.put).mockImplementation(async (key) => {
      order.push('store')
      return key
    })
    const insertArtifact = vi.fn(async () => {
      order.push('index')
    })
    const result = await writeValidatedArtifact(
      {
        projectId: 'project-1',
        nodeId: 'node-1',
        kind: 'director-output',
        key: 'project-1/node-1/output.json',
        content: '{"ok":true}',
        validation: 'non-empty',
      },
      {
        storage,
        insertArtifact,
        validate: () => {
          order.push('validate')
          return { ok: true }
        },
      }
    )

    expect(order).toEqual(['validate', 'store', 'index'])
    expect(result).toMatchObject({
      storageKey: 'project-1/node-1/output.json',
    })
  })

  it('does not write when pre-validation fails', async () => {
    const storage = createStorage()
    const insertArtifact = vi.fn()
    const writing = writeValidatedArtifact(
      {
        projectId: 'project-1',
        kind: 'director-output',
        key: 'project-1/output.json',
        content: '',
        validation: 'non-empty',
      },
      {
        storage,
        insertArtifact,
        validate: () => ({ ok: false, errors: ['内容无效'] }),
      }
    )

    await expect(writing).rejects.toBeInstanceOf(ArtifactValidationError)
    expect(storage.put).not.toHaveBeenCalled()
    expect(insertArtifact).not.toHaveBeenCalled()
  })

  it('compensates the file when artifact indexing fails', async () => {
    const storage = createStorage()
    const failure = new Error('索引不可用')

    await expect(
      writeValidatedArtifact(
        {
          projectId: 'project-1',
          kind: 'director-output',
          key: 'project-1/output.json',
          content: '{"ok":true}',
          validation: 'non-empty',
        },
        {
          storage,
          insertArtifact: vi.fn(async () => {
            throw failure
          }),
        }
      )
    ).rejects.toBe(failure)

    expect(storage.delete).toHaveBeenCalledWith('project-1/output.json')
  })
})
