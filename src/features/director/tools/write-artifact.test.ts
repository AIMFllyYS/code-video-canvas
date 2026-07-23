import { describe, expect, it, vi } from 'vitest'
import type { StorageAdapter } from '@/lib/storage'
import { createWriteArtifactTool } from './write-artifact'

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

describe('createWriteArtifactTool', () => {
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
    const tool = createWriteArtifactTool({
      storage,
      insertArtifact,
      validate: () => {
        order.push('validate')
        return { ok: true }
      },
    })

    const result = await tool.execute({
      projectId: 'project-1',
      nodeId: 'node-1',
      kind: 'director-output',
      key: 'project-1/node-1/output.json',
      content: '{"ok":true}',
      validation: 'non-empty',
    })

    expect(order).toEqual(['validate', 'store', 'index'])
    expect(result.details).toMatchObject({
      ok: true,
      storageKey: 'project-1/node-1/output.json',
    })
  })

  it('does not write when pre-validation fails', async () => {
    const storage = createStorage()
    const insertArtifact = vi.fn()
    const tool = createWriteArtifactTool({
      storage,
      insertArtifact,
      validate: () => ({ ok: false, errors: ['内容无效'] }),
    })

    const result = await tool.execute({
      projectId: 'project-1',
      kind: 'director-output',
      key: 'project-1/output.json',
      content: '',
      validation: 'non-empty',
    })

    expect(result.details).toMatchObject({ ok: false })
    expect(storage.put).not.toHaveBeenCalled()
    expect(insertArtifact).not.toHaveBeenCalled()
  })
})
