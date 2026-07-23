import 'server-only'

import { and, desc, eq, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { artifacts } from '@/lib/db/schema'
import { storage } from '@/lib/storage'

export interface ArtifactDescriptor {
  id: string
  projectId: string
  nodeId: string | null
  kind: string
  contentHash: string | null
}

export function getLatestArtifact(
  projectId: string,
  nodeId: string | null,
  kind: string
): ArtifactDescriptor | null {
  const predicates = [
    eq(artifacts.projectId, projectId),
    eq(artifacts.kind, kind),
    nodeId === null ? isNull(artifacts.nodeId) : eq(artifacts.nodeId, nodeId),
  ]
  const row = getDb()
    .select({
      id: artifacts.id,
      projectId: artifacts.projectId,
      nodeId: artifacts.nodeId,
      kind: artifacts.kind,
      contentHash: artifacts.contentHash,
    })
    .from(artifacts)
    .where(and(...predicates))
    .orderBy(desc(artifacts.createdAt), desc(artifacts.id))
    .get()
  return row?.projectId ? { ...row, projectId: row.projectId } : null
}

export async function readArtifact(
  projectId: string,
  artifactId: string
): Promise<{ descriptor: ArtifactDescriptor; bytes: Buffer }> {
  const row = getDb()
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.projectId, projectId)))
    .get()
  if (!row || !row.projectId) throw new Error('产物不存在或不属于该项目')
  return {
    descriptor: {
      id: row.id,
      projectId: row.projectId,
      nodeId: row.nodeId,
      kind: row.kind,
      contentHash: row.contentHash,
    },
    bytes: await storage.get(row.path),
  }
}

export function artifactContentType(kind: string): string {
  if (kind.endsWith('mp4')) return 'video/mp4'
  if (kind === 'director-fabricate') return 'text/html; charset=utf-8'
  if (kind.includes('json') || kind === 'director-shot-spec') {
    return 'application/json; charset=utf-8'
  }
  return 'application/octet-stream'
}
