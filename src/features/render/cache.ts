import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import type { Db } from '@/lib/db/migrate'
import { artifacts } from '@/lib/db/schema'
import { storage as defaultStorage, type StorageAdapter } from '@/lib/storage'

export interface RenderCacheEntry {
  outputKey: string
  contentHash: string
}

export interface WriteRenderCacheInput extends RenderCacheEntry {
  projectId: string
  nodeId: string
}

interface CacheDependencies {
  db?: Db
  storage?: StorageAdapter
}

/** 查找仍有实体文件的最新 render-mp4 缓存。 */
export async function lookupCache(
  contentHash: string,
  dependencies: CacheDependencies = {}
): Promise<RenderCacheEntry | null> {
  const db = dependencies.db ?? getDb()
  const storage = dependencies.storage ?? defaultStorage
  const candidates = db
    .select({ path: artifacts.path, contentHash: artifacts.contentHash })
    .from(artifacts)
    .where(
      and(
        eq(artifacts.kind, 'render-mp4'),
        eq(artifacts.contentHash, contentHash)
      )
    )
    .orderBy(desc(artifacts.createdAt))
    .all()
  for (const candidate of candidates) {
    if (candidate.contentHash && (await storage.exists(candidate.path))) {
      return { outputKey: candidate.path, contentHash: candidate.contentHash }
    }
  }
  return null
}

/** 登记已由可信 renderer 提交到 StorageAdapter 的内容寻址 mp4。 */
export function writeCache(
  input: WriteRenderCacheInput,
  dependencies: Pick<CacheDependencies, 'db'> = {}
): string {
  const id = randomUUID()
  const db = dependencies.db ?? getDb()
  db.insert(artifacts)
    .values({
      id,
      projectId: input.projectId,
      nodeId: input.nodeId,
      kind: 'render-mp4',
      path: input.outputKey,
      contentHash: input.contentHash,
    })
    .run()
  return id
}
