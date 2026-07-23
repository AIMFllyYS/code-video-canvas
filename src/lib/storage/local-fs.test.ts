import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LocalFsStorage } from './local-fs'

describe('LocalFsStorage', () => {
  let root: string
  let storage: LocalFsStorage

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'cvc-storage-'))
    storage = new LocalFsStorage(root)
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('put/get round-trips content', async () => {
    await storage.put('a/b.txt', 'hello 视频')
    const buffer = await storage.get('a/b.txt')
    expect(buffer.toString('utf8')).toBe('hello 视频')
  })

  it('exists reflects presence and delete removes', async () => {
    await storage.put('c.bin', Buffer.from([1, 2, 3]))
    expect(await storage.exists('c.bin')).toBe(true)
    await storage.delete('c.bin')
    expect(await storage.exists('c.bin')).toBe(false)
  })

  it('localPath resolves under root', () => {
    expect(storage.localPath('x/y.mp4')).toBe(path.join(root, 'x/y.mp4'))
  })
})
