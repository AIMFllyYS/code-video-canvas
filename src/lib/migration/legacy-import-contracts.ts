import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import type {
  artifacts,
  canvasEdges,
  canvasNodes,
  mediaRoutes,
  modelRoutes,
  pipelineRuns,
  projects,
  providerCredentials,
  taskAttempts,
} from '@/lib/db/schema/index'
import {
  canonicalJson,
  readLegacyExportFile,
  readLegacyExportManifest,
  type LegacyArtifactExportRowV1,
  type LegacyEdgeExportRowV1,
  type LegacyExportManifestV1,
  type LegacyJobExportRowV1,
  type LegacyNodeExportRowV1,
  type LegacyProjectExportRowV1,
  type LegacySettingExportRowV1,
  type LegacyTableName,
} from './legacy-export'
import { assertLegacyExportSemantics } from './legacy-export-validation'
import { legacyIdToUuid } from './legacy-id'

export type SourceTable = LegacyTableName
export type TargetTable = 'projects' | 'canvas_nodes' | 'canvas_edges'
  | 'pipeline_runs' | 'task_attempts' | 'artifacts'
  | 'provider_credentials' | 'model_routes' | 'media_routes'
export type ProjectInsert = typeof projects.$inferInsert
export type NodeInsert = typeof canvasNodes.$inferInsert
export type EdgeInsert = typeof canvasEdges.$inferInsert
export type RunInsert = typeof pipelineRuns.$inferInsert
export type AttemptInsert = typeof taskAttempts.$inferInsert
export type ArtifactInsert = typeof artifacts.$inferInsert
export type CredentialInsert = typeof providerCredentials.$inferInsert
export type ModelRouteInsert = typeof modelRoutes.$inferInsert
export type MediaRouteInsert = typeof mediaRoutes.$inferInsert

export interface LegacyImportTargetV1 {
  table: TargetTable
  id: string
}
export interface LegacyImportAccountV1 {
  sourceTable: SourceTable
  legacyPk: string
  canonicalRowHash: string
  targets: LegacyImportTargetV1[]
  disposition?: string
}
export interface LegacyImportReceiptResultV1 {
  schemaVersion: 1
  snapshotSha256: string
  accounts: LegacyImportAccountV1[]
}
export interface LegacyImportRunResultV1 extends LegacyImportReceiptResultV1 {
  inserted: number
  replayed: boolean
}
export interface LegacyProjectImportPlanV1 {
  project: ProjectInsert
  nodes: NodeInsert[]
  edges: EdgeInsert[]
  runs: RunInsert[]
  attempts: AttemptInsert[]
  artifacts: ArtifactInsert[]
}
export interface LegacyGlobalImportPlanV1 {
  credentials: CredentialInsert[]
  modelRoutes: ModelRouteInsert[]
  mediaRoutes: MediaRouteInsert[]
}
export interface LegacyImportPlanV1 {
  manifest: LegacyExportManifestV1
  fingerprint: string
  projects: LegacyProjectImportPlanV1[]
  globals: LegacyGlobalImportPlanV1
  accounts: LegacyImportAccountV1[]
}
export interface VerifiedLegacyExportBundleV1 {
  manifest: LegacyExportManifestV1
  rows: {
    projects: LegacyProjectExportRowV1[]
    canvas_nodes: LegacyNodeExportRowV1[]
    canvas_edges: LegacyEdgeExportRowV1[]
    jobs: LegacyJobExportRowV1[]
    artifacts: LegacyArtifactExportRowV1[]
    settings: LegacySettingExportRowV1[]
  }
}

export async function loadVerifiedLegacyExport(input: {
  manifestPath: string
  snapshotPath?: string
  backupReportPath?: string
}): Promise<VerifiedLegacyExportBundleV1> {
  const manifestPath = path.resolve(input.manifestPath)
  const manifest = await readLegacyExportManifest(manifestPath)
  const archiveRoot = path.dirname(path.dirname(manifestPath))
  await assertFileHash(
    input.snapshotPath ?? path.join(archiveRoot, 'app.db'),
    manifest.snapshotSha256,
    'snapshot',
  )
  await assertFileHash(
    input.backupReportPath ?? path.join(archiveRoot, 'backup-report.json'),
    manifest.backupReportSha256,
    'backup report',
  )
  const [projectRows, nodeRows, edgeRows, jobRows, artifactRows, settingRows] =
    await Promise.all([
      readLegacyExportFile<LegacyProjectExportRowV1>(manifest, manifestPath, 'projects'),
      readLegacyExportFile<LegacyNodeExportRowV1>(manifest, manifestPath, 'canvas_nodes'),
      readLegacyExportFile<LegacyEdgeExportRowV1>(manifest, manifestPath, 'canvas_edges'),
      readLegacyExportFile<LegacyJobExportRowV1>(manifest, manifestPath, 'jobs'),
      readLegacyExportFile<LegacyArtifactExportRowV1>(manifest, manifestPath, 'artifacts'),
      readLegacyExportFile<LegacySettingExportRowV1>(manifest, manifestPath, 'settings'),
    ])
  const rows = {
    projects: projectRows, canvas_nodes: nodeRows, canvas_edges: edgeRows,
    jobs: jobRows, artifacts: artifactRows, settings: settingRows,
  }
  assertLegacyExportSemantics({ manifest, rows })
  return { manifest, rows }
}

export function legacyImportFingerprint(manifest: LegacyExportManifestV1): string {
  return createHash('sha256').update(canonicalJson(manifest)).digest('hex')
}

export function addTargetAccount(
  accounts: LegacyImportAccountV1[],
  row: { sourceTable: SourceTable; legacyPk: string; canonicalRowHash: string },
  targets: LegacyImportTargetV1 | LegacyImportTargetV1[],
): void {
  accounts.push({
    sourceTable: row.sourceTable,
    legacyPk: row.legacyPk,
    canonicalRowHash: row.canonicalRowHash,
    targets: Array.isArray(targets) ? targets : [targets],
  })
}

export function addDispositionAccount(
  accounts: LegacyImportAccountV1[],
  row: { sourceTable: SourceTable; legacyPk: string; canonicalRowHash: string },
  disposition: string,
): void {
  accounts.push({
    sourceTable: row.sourceTable,
    legacyPk: row.legacyPk,
    canonicalRowHash: row.canonicalRowHash,
    targets: [],
    disposition,
  })
}

export function isAccounted(
  accounts: LegacyImportAccountV1[],
  row: { sourceTable: SourceTable; legacyPk: string },
): boolean {
  return accounts.some((account) => (
    account.sourceTable === row.sourceTable
    && account.legacyPk === row.legacyPk
  ))
}

export function sortImportAccounts(
  accounts: LegacyImportAccountV1[],
): LegacyImportAccountV1[] {
  const order = ['projects', 'canvas_nodes', 'canvas_edges', 'jobs', 'artifacts', 'settings']
  return [...accounts].sort((left, right) => (
    order.indexOf(left.sourceTable) - order.indexOf(right.sourceTable)
    || Buffer.compare(Buffer.from(left.legacyPk), Buffer.from(right.legacyPk))
  ))
}

export function assertCompleteLegacyAccounting(
  bundle: VerifiedLegacyExportBundleV1,
  accounts: LegacyImportAccountV1[],
): void {
  const rows = Object.values(bundle.rows).flat()
  for (const row of rows) {
    const matches = accounts.filter((account) => (
      account.sourceTable === row.sourceTable
      && account.legacyPk === row.legacyPk
      && account.canonicalRowHash === row.canonicalRowHash
    ))
    if (matches.length !== 1) throw new Error('legacy row accounting is incomplete')
  }
  if (accounts.length !== rows.length) {
    throw new Error('legacy row accounting is duplicated')
  }
}

export function assembleLegacyProjectPlans(input: {
  projects: ProjectInsert[]
  nodes: NodeInsert[]
  edges: EdgeInsert[]
  runs: RunInsert[]
  attempts: AttemptInsert[]
  artifacts: ArtifactInsert[]
}): LegacyProjectImportPlanV1[] {
  return input.projects.map((project) => ({
    project,
    nodes: input.nodes.filter((row) => row.projectId === project.id),
    edges: input.edges.filter((row) => row.projectId === project.id),
    runs: input.runs.filter((row) => row.projectId === project.id),
    attempts: input.attempts.filter((row) => (
      input.runs.some((run) => run.id === row.runId && run.projectId === project.id)
    )),
    artifacts: input.artifacts.filter((row) => row.projectId === project.id),
  }))
}

export function legacyRouteTarget(target: string): LegacyImportTargetV1 {
  const [domain, kind, extra] = target.split(':')
  if (extra || !kind || (domain !== 'ai' && domain !== 'media')) {
    throw new Error('invalid legacy route target')
  }
  return domain === 'ai'
    ? { table: 'model_routes', id: legacyIdToUuid('model-routes', kind) }
    : { table: 'media_routes', id: legacyIdToUuid('media-routes', kind) }
}

export function compareLegacyUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}

export function hasLegacyErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null
    && 'code' in error && (error as { code?: unknown }).code === code
}

export function legacyEndpointDisposition(
  actualProjectId: string | undefined, expectedProjectId: string,
  missing: 'missing-source' | 'missing-target',
): string {
  return actualProjectId && actualProjectId !== expectedProjectId
    ? 'cross-project-endpoint' : missing
}

export function legacyText(value: unknown, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value)) throw new Error('invalid legacy text')
  return value
}

export function legacyBoolean(value: unknown): boolean {
  if (value === 0 || value === false) return false
  if (value === 1 || value === true) return true
  throw new Error('invalid legacy boolean')
}

export function legacyDate(value: unknown): Date {
  const parsed = typeof value === 'number' ? new Date(value) : new Date(legacyText(value))
  if (Number.isNaN(parsed.getTime())) throw new Error('invalid legacy date')
  return parsed
}

export function legacyJson(value: unknown): unknown {
  if (value === null) return null
  const parsed: unknown = JSON.parse(legacyText(value))
  if (parsed === undefined) throw new Error('invalid legacy JSON')
  return parsed
}

export function legacyPoint(value: unknown): { x: number; y: number } {
  const parsed = legacyJson(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid legacy position')
  }
  const { x, y } = parsed as Record<string, unknown>
  if (typeof x !== 'number' || !Number.isFinite(x)
    || typeof y !== 'number' || !Number.isFinite(y)) {
    throw new Error('invalid legacy position')
  }
  return { x, y }
}

export async function verifyLegacyArtifactEntity(input: {
  artifactRoot: string
  storageKey: string
  expectedSize: number
  expectedHash: string
}): Promise<{ sizeBytes: number; contentHash: string }> {
  if (path.isAbsolute(input.storageKey) || input.storageKey.includes('\\')) {
    throw new Error('unsafe artifact storage key')
  }
  const root = path.resolve(input.artifactRoot)
  const target = path.resolve(root, ...input.storageKey.split('/'))
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('unsafe artifact storage key')
  }
  const [realRoot, realTarget, details] = await Promise.all([
    realpath(root), realpath(target), stat(target),
  ])
  const realRelative = path.relative(realRoot, realTarget)
  if (!details.isFile() || !realRelative
    || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    throw new Error('unsafe artifact entity')
  }
  const contentHash = await hashFile(target)
  if (details.size !== input.expectedSize || contentHash !== input.expectedHash) {
    throw new Error('artifact entity hash mismatch')
  }
  return { sizeBytes: details.size, contentHash }
}

async function assertFileHash(
  filePath: string,
  expected: string,
  label: string,
): Promise<void> {
  const digest = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(filePath)
    input.on('data', (chunk) => digest.update(chunk))
    input.on('error', reject)
    input.on('end', resolve)
  })
  if (digest.digest('hex') !== expected) {
    throw new Error(`${label} hash mismatch`)
  }
}

async function hashFile(filePath: string): Promise<string> {
  const digest = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(filePath)
    input.on('data', (chunk) => digest.update(chunk))
    input.on('error', reject)
    input.on('end', resolve)
  })
  return digest.digest('hex')
}
