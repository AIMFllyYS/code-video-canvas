import { randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import Database from 'better-sqlite3'
import {
  ACTIVE_WORKFLOW_VERSION,
  serializeWorkflowVersion,
} from '@/lib/workflow/version'
import { mapLegacyArtifacts } from './legacy-export-artifacts'
import {
  LEGACY_EXPORT_TABLES,
  LEGACY_WORKSPACE_ID,
  canonicalJson,
  canonicalRowsSha256,
  compareUtf8,
  hasCode,
  isRecord,
  legacyRowBase,
  requireLegacyString,
  sha256,
  sha256File,
  type LegacyDispositionReason,
  type LegacyDispositionV1,
  type LegacyEdgeExportRowV1,
  type LegacyExportManifestV1,
  type LegacyExportRequest,
  type LegacyExportRows,
  type LegacyJobExportRowV1,
  type LegacyNodeExportRowV1,
  type LegacyProjectExportRowV1,
  type LegacyRawRow,
  type LegacyScalar,
  type LegacyTableManifestV1,
  type LegacyTableName,
} from './legacy-export-contracts'
import { mapLegacySettings } from './legacy-export-routes'
import { legacyIdToUuid } from './legacy-id'

export * from './legacy-export-contracts'

const TABLE_INDEX = new Map(LEGACY_EXPORT_TABLES.map((item, index) => [
  item.sourceTable, index,
]))

export async function exportLegacySqlite(
  request: LegacyExportRequest,
): Promise<LegacyExportManifestV1> {
  const workspaceId = request.workspaceId ?? LEGACY_WORKSPACE_ID
  if (workspaceId !== LEGACY_WORKSPACE_ID) {
    throw new Error('legacy export workspace must be the fixed local workspace')
  }
  if (await exists(request.outDir)) throw new Error('export output already exists')
  if (request.masterKey.length !== 32) throw new Error('master key must be 32 bytes')
  const validation = await validateInputs(request)
  const output = path.resolve(request.outDir)
  const temporary = `${output}.tmp-${randomUUID()}`
  await mkdir(path.dirname(output), { recursive: true })
  await mkdir(temporary)
  try {
    const collected = await collectExport(request, workspaceId)
    const tables = await writeTables(temporary, collected.rows)
    const manifest = buildManifest(validation, tables, collected)
    await writeFile(
      path.join(temporary, 'manifest.json'),
      `${canonicalJson(manifest)}\n`,
    )
    await renameLegacyExportDirectory(temporary, output)
    return manifest
  } catch (error) {
    await rm(temporary, { recursive: true, force: true })
    throw error
  }
}

export async function renameLegacyExportDirectory(
  source: string,
  target: string,
  move: (from: string, to: string) => Promise<void> = rename,
  wait: (milliseconds: number) => Promise<void> = delay,
): Promise<void> {
  const attempts = 3
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await exists(target)) throw new Error('export output already exists')
    try {
      await move(source, target)
      return
    } catch (error) {
      const retryable = hasCode(error, 'EPERM') || hasCode(error, 'EBUSY')
      if (!retryable || attempt === attempts - 1) throw error
      await wait(50 * (attempt + 1))
    }
  }
}

async function validateInputs(request: LegacyExportRequest): Promise<{
  snapshotSha256: string
  backupReportSha256: string
}> {
  const reportBytes = await readFile(request.backupReportPath)
  const report: unknown = JSON.parse(reportBytes.toString('utf8'))
  const snapshotSha256 = await sha256File(request.snapshotPath)
  if (!isRecord(report) || report.schemaVersion !== 1 || report.quickCheck !== 'ok'
    || report.snapshotSha256 !== snapshotSha256 || !isRecord(report.rowCounts)) {
    throw new Error('snapshot does not match validated backup report')
  }
  validateSnapshotDatabase(request.snapshotPath, report.rowCounts)
  const root = await stat(request.artifactRoot)
  if (!root.isDirectory()) throw new Error('artifact root is not a directory')
  return { snapshotSha256, backupReportSha256: sha256(reportBytes) }
}

function validateSnapshotDatabase(
  snapshotPath: string,
  counts: Record<string, unknown>,
): void {
  const db = new Database(snapshotPath, { readonly: true, fileMustExist: true })
  try {
    db.pragma('query_only = ON')
    const check = db.pragma('quick_check') as Array<{ quick_check?: unknown }>
    if (check.length !== 1 || check[0]?.quick_check !== 'ok') {
      throw new Error('snapshot quick_check failed')
    }
    for (const { sourceTable } of LEGACY_EXPORT_TABLES) {
      const count = db.prepare(`select count(*) from "${sourceTable}"`).pluck().get()
      if (count !== counts[sourceTable]) throw new Error('snapshot count mismatch')
    }
  } finally {
    db.close()
  }
}

async function collectExport(
  request: LegacyExportRequest,
  workspaceId: string,
): Promise<CollectedExport> {
  const db = new Database(request.snapshotPath, {
    readonly: true,
    fileMustExist: true,
  })
  try {
    db.pragma('query_only = ON')
    const projects = mapProjects(query(db, 'projects', 'id'))
    const nodes = mapNodes(query(db, 'canvas_nodes', 'id'))
    const edges = mapEdges(query(db, 'canvas_edges', 'id'))
    const jobs = mapJobs(query(db, 'jobs', 'id'))
    const artifacts = await mapLegacyArtifacts(
      query(db, 'artifacts', 'id'),
      request.artifactRoot,
    )
    const settings = mapLegacySettings(
      query(db, 'settings', 'key'),
      workspaceId,
      request.masterKey,
    )
    return {
      rows: {
        projects, canvas_nodes: nodes, canvas_edges: edges, jobs,
        artifacts: artifacts.rows, settings: settings.rows,
      },
      routes: settings.routes,
      artifactManifest: artifacts.manifest,
      dispositions: [...jobDispositions(jobs), ...settings.dispositions],
    }
  } finally {
    db.close()
  }
}

interface CollectedExport {
  rows: LegacyExportRows
  routes: LegacyExportManifestV1['resolvedRoutesV1']
  artifactManifest: LegacyExportManifestV1['artifactManifest']
  dispositions: LegacyDispositionV1[]
}

function buildManifest(
  validation: { snapshotSha256: string; backupReportSha256: string },
  tables: LegacyTableManifestV1[],
  collected: CollectedExport,
): LegacyExportManifestV1 {
  return {
    schemaVersion: 1,
    workspaceId: LEGACY_WORKSPACE_ID,
    workflowVersion: serializeWorkflowVersion(ACTIVE_WORKFLOW_VERSION),
    ...validation,
    tables,
    resolvedRoutesV1: collected.routes,
    artifactManifest: collected.artifactManifest,
    archivedDispositions: sortDispositions(collected.dispositions),
  }
}

function mapProjects(rows: LegacyRawRow[]): LegacyProjectExportRowV1[] {
  return rows.map((raw) => ({
    ...legacyRowBase('projects', raw.id, raw),
    targetId: id('projects', raw.id),
    title: raw.title,
    script: raw.script,
    exportSettingsJson: raw.export_settings,
    autopilot: raw.autopilot,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }))
}

function mapNodes(rows: LegacyRawRow[]): LegacyNodeExportRowV1[] {
  return rows.map((raw) => ({
    ...legacyRowBase('canvas_nodes', raw.id, raw),
    targetId: id('canvas_nodes', raw.id),
    targetProjectId: id('projects', raw.project_id),
    type: raw.type,
    stage: raw.stage,
    positionJson: raw.position,
    dataJson: raw.data,
    status: raw.status,
    contentHash: raw.content_hash,
    laneKey: raw.lane_key,
    laneRole: raw.lane_role,
    createdAt: raw.created_at,
  }))
}

function mapEdges(rows: LegacyRawRow[]): LegacyEdgeExportRowV1[] {
  return rows.map((raw) => ({
    ...legacyRowBase('canvas_edges', raw.id, raw),
    targetId: id('canvas_edges', raw.id),
    targetProjectId: id('projects', raw.project_id),
    targetSourceId: id('canvas_nodes', raw.source),
    targetTargetId: id('canvas_nodes', raw.target),
  }))
}

function mapJobs(rows: LegacyRawRow[]): LegacyJobExportRowV1[] {
  return rows.map((raw) => ({
    ...legacyRowBase('jobs', raw.id, raw),
    targetId: id('jobs', raw.id),
    targetProjectId: optionalId('projects', raw.project_id),
    targetNodeId: optionalId('canvas_nodes', raw.node_id),
    kind: raw.kind,
    status: raw.status,
    payloadHash: sha256(String(raw.payload ?? '')),
    attempts: raw.attempts,
    errorPresent: raw.error !== null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }))
}

function jobDispositions(
  rows: LegacyJobExportRowV1[],
): LegacyDispositionV1[] {
  return rows.flatMap((row) => {
    let reason: LegacyDispositionReason | null = null
    if (!row.targetProjectId) reason = 'missing-project'
    else if (row.kind !== 'director-stage' && row.kind !== 'render-shot') {
      reason = 'unsupported-kind'
    } else if (!['done', 'failed', 'pending', 'running'].includes(String(row.status))) {
      reason = 'invalid-status'
    }
    return reason ? [{
      schemaVersion: 1,
      sourceTable: row.sourceTable,
      legacyPk: row.legacyPk,
      canonicalRowHash: row.canonicalRowHash,
      reason,
    }] : []
  })
}

async function writeTables(
  directory: string,
  rows: LegacyExportRows,
): Promise<LegacyTableManifestV1[]> {
  const manifests: LegacyTableManifestV1[] = []
  for (const item of LEGACY_EXPORT_TABLES) {
    const tableRows = rows[item.sourceTable]
    const content = tableRows.map((row) => canonicalJson(row)).join('\n')
    const bytes = Buffer.from(content ? `${content}\n` : '', 'utf8')
    await writeFile(path.join(directory, item.fileName), bytes)
    manifests.push({
      ...item,
      sourceCount: tableRows.length,
      canonicalRowsSha256: canonicalRowsSha256(tableRows),
      fileSha256: sha256(bytes),
    })
  }
  return manifests
}

function query(
  db: Database.Database,
  table: LegacyTableName,
  primaryKey: string,
): LegacyRawRow[] {
  const rows = db.prepare(`select * from "${table}"`).all() as LegacyRawRow[]
  return rows.sort((left, right) => compareUtf8(
    requireLegacyString(left[primaryKey], `${table} primary key`),
    requireLegacyString(right[primaryKey], `${table} primary key`),
  ))
}

function sortDispositions(
  rows: LegacyDispositionV1[],
): LegacyDispositionV1[] {
  return rows.sort((left, right) =>
    (TABLE_INDEX.get(left.sourceTable)! - TABLE_INDEX.get(right.sourceTable)!)
    || compareUtf8(left.legacyPk, right.legacyPk))
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

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target)
    return true
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return false
    throw error
  }
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}
