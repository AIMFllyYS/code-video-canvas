import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  hasCode,
  legacyRowBase,
  requireLegacyString,
  sha256File,
  type LegacyArtifactExportRowV1,
  type LegacyArtifactManifestEntryV1,
  type LegacyRawRow,
  type LegacyScalar,
} from './legacy-export-contracts'
import { legacyIdToUuid } from './legacy-id'

export async function mapLegacyArtifacts(
  rows: LegacyRawRow[],
  artifactRoot: string,
): Promise<{
  rows: LegacyArtifactExportRowV1[]
  manifest: LegacyArtifactManifestEntryV1[]
}> {
  const mapped = rows.map((raw): LegacyArtifactExportRowV1 => ({
    ...legacyRowBase('artifacts', raw.id, raw),
    targetId: id('artifacts', raw.id),
    targetProjectId: optionalId('projects', raw.project_id),
    targetNodeId: optionalId('canvas_nodes', raw.node_id),
    kind: raw.kind,
    storageKey: safeStorageKey(
      artifactRoot,
      requireLegacyString(raw.path, 'artifact path'),
    ),
    contentHash: raw.content_hash,
    createdAt: raw.created_at,
  }))
  const manifest = await Promise.all(mapped.map((row) =>
    inspectArtifact(artifactRoot, row)))
  return { rows: mapped, manifest }
}

async function inspectArtifact(
  artifactRoot: string,
  row: LegacyArtifactExportRowV1,
): Promise<LegacyArtifactManifestEntryV1> {
  const absolute = path.resolve(artifactRoot, ...row.storageKey.split('/'))
  try {
    const details = await stat(absolute)
    if (!details.isFile()) throw new Error('artifact pointer is not a file')
    await assertRealPathWithin(artifactRoot, absolute)
    return {
      legacyPk: row.legacyPk,
      storageKey: row.storageKey,
      exists: true,
      sizeBytes: details.size,
      sha256: await sha256File(absolute),
    }
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error
    return {
      legacyPk: row.legacyPk,
      storageKey: row.storageKey,
      exists: false,
      sizeBytes: null,
      sha256: null,
    }
  }
}

function safeStorageKey(root: string, legacyPath: string): string {
  const rootPath = path.resolve(root)
  const normalized = legacyPath.replaceAll('\\', '/')
  const candidate = path.isAbsolute(legacyPath)
    ? path.resolve(legacyPath)
    : path.resolve(rootPath, ...normalized.split('/'))
  const relative = path.relative(rootPath, candidate)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) throw new Error('unsafe legacy artifact path')
  return relative.split(path.sep).join('/')
}

async function assertRealPathWithin(root: string, candidate: string): Promise<void> {
  const [realRoot, realCandidate] = await Promise.all([
    realpath(root),
    realpath(candidate),
  ])
  const relative = path.relative(realRoot, realCandidate)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) throw new Error('unsafe artifact symlink')
}

function id(scope: string, value: LegacyScalar | undefined): string {
  return legacyIdToUuid(
    scope,
    requireLegacyString(value, `${scope} id`),
  )
}

function optionalId(
  scope: string,
  value: LegacyScalar | undefined,
): string | null {
  return value === null || value === undefined ? null : id(scope, value)
}
