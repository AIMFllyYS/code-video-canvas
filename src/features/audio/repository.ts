import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { artifacts } from '@/lib/db/schema'
import { getDb } from '@/lib/db/client'
import { storage as defaultStorage, type StorageAdapter } from '@/lib/storage'

const safeSegment = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9._-]+$/, '只能包含字母、数字、点、下划线或连字符')

const storeInputSchema = z
  .object({
    projectId: safeSegment,
    nodeId: safeSegment,
    shotId: safeSegment,
    kind: safeSegment,
    extension: safeSegment,
    data: z.union([z.string(), z.instanceof(Buffer), z.instanceof(Uint8Array)]),
  })
  .strict()

export type StoreAudioArtifactInput = z.input<typeof storeInputSchema>

interface ArtifactIndexRecord {
  id: string
  projectId: string
  nodeId: string
  kind: string
  path: string
  contentHash: string
}

interface StoreDependencies {
  storage: StorageAdapter
  insertArtifact: (record: ArtifactIndexRecord) => Promise<void>
  createId: () => string
}

export interface StoredAudioArtifact {
  id: string
  storageKey: string
  contentHash: string
}

/** 音频域可信写服务：内容寻址落盘，索引失败时补偿删除字节。 */
export async function storeAudioArtifact(
  input: StoreAudioArtifactInput,
  dependencies: StoreDependencies = defaultDependencies()
): Promise<StoredAudioArtifact> {
  const parsed = storeInputSchema.parse(input)
  const contentHash = createHash('sha256').update(parsed.data).digest('hex')
  const storageKey =
    `audio/${parsed.projectId}/${parsed.shotId}/` +
    `${parsed.kind}-${contentHash}.${parsed.extension}`
  const id = dependencies.createId()
  await dependencies.storage.put(storageKey, parsed.data)
  try {
    await dependencies.insertArtifact({
      id,
      projectId: parsed.projectId,
      nodeId: parsed.nodeId,
      kind: parsed.kind,
      path: storageKey,
      contentHash,
    })
  } catch (error) {
    await dependencies.storage.delete(storageKey)
    throw error
  }
  return { id, storageKey, contentHash }
}

function defaultDependencies(): StoreDependencies {
  return {
    storage: defaultStorage,
    createId: randomUUID,
    insertArtifact: async (record) => {
      getDb().insert(artifacts).values(record).run()
    },
  }
}
