import type {
  LegacyArtifactExportRowV1, LegacyArtifactManifestEntryV1,
  LegacyDispositionReason, LegacyDispositionV1, LegacyEdgeExportRowV1,
  LegacyExportManifestV1, LegacyExportRowV1, LegacyJobExportRowV1,
  LegacyNodeExportRowV1, LegacyProjectExportRowV1,
  LegacySettingExportRowV1, LegacyTableName,
} from './legacy-export-contracts'
type ExpectedTable = { sourceTable: LegacyTableName; fileName: string }
export interface LegacyExportRowsV1 {
  projects: LegacyProjectExportRowV1[]; canvas_nodes: LegacyNodeExportRowV1[]
  canvas_edges: LegacyEdgeExportRowV1[]; jobs: LegacyJobExportRowV1[]
  artifacts: LegacyArtifactExportRowV1[]; settings: LegacySettingExportRowV1[]
}
const SHA256 = /^[0-9a-f]{64}$/u
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const AI_TASKS = ['project-plan', 'shot-spec', 'fabricate', 'vision-qa'] as const
const MEDIA_TASKS = ['tts', 'asr'] as const
const MANIFEST_KEYS = [
  'schemaVersion', 'workspaceId', 'workflowVersion', 'snapshotSha256',
  'backupReportSha256', 'tables', 'resolvedRoutesV1', 'artifactManifest',
  'archivedDispositions',
]
const BASE_ROW_KEYS = ['schemaVersion', 'sourceTable', 'legacyPk', 'canonicalRowHash']
const ROW_KEYS: Record<LegacyTableName, string[]> = {
  projects: [
    ...BASE_ROW_KEYS, 'targetId', 'title', 'script', 'exportSettingsJson',
    'autopilot', 'createdAt', 'updatedAt',
  ],
  canvas_nodes: [
    ...BASE_ROW_KEYS, 'targetId', 'targetProjectId', 'type', 'stage',
    'positionJson', 'dataJson', 'status', 'contentHash', 'laneKey', 'laneRole',
    'createdAt',
  ],
  canvas_edges: [
    ...BASE_ROW_KEYS, 'targetId', 'targetProjectId', 'targetSourceId',
    'targetTargetId',
  ],
  jobs: [
    ...BASE_ROW_KEYS, 'targetId', 'targetProjectId', 'targetNodeId', 'kind',
    'status', 'payloadHash', 'attempts', 'errorPresent', 'createdAt', 'updatedAt',
  ],
  artifacts: [
    ...BASE_ROW_KEYS, 'targetId', 'targetProjectId', 'targetNodeId', 'kind',
    'storageKey', 'contentHash', 'createdAt',
  ],
  settings: [],
}
const JOB_REASONS = new Set<LegacyDispositionReason>([
  'missing-project', 'unsupported-kind', 'invalid-status',
])
const SETTING_REASONS = new Set<LegacyDispositionReason>([
  'unused-route-setting', 'unsupported-setting', 'invalid-setting-value',
])
export function assertLegacyExportManifestShape(
  value: unknown,
  expectedWorkspaceId: string,
  expectedTables: readonly ExpectedTable[],
): asserts value is LegacyExportManifestV1 {
  const manifest = requireRecord(value, 'invalid legacy export manifest')
  assertExactKeys(manifest, MANIFEST_KEYS, 'invalid legacy export manifest')
  if (manifest.schemaVersion !== 1 || manifest.workspaceId !== expectedWorkspaceId
    || !isNonEmptyString(manifest.workflowVersion)
    || !isSha256(manifest.snapshotSha256)
    || !isSha256(manifest.backupReportSha256)
    || !Array.isArray(manifest.tables)
    || manifest.tables.length !== expectedTables.length) {
    throw new Error('invalid legacy export manifest')
  }
  manifest.tables.forEach((table, index) =>
    assertTableManifest(table, expectedTables[index]!))
  assertRoutes(manifest.resolvedRoutesV1)
  assertArtifactManifest(manifest.artifactManifest)
  assertDispositions(manifest.archivedDispositions)
}
export function assertLegacyExportRowShape(
  value: unknown,
  sourceTable: LegacyTableName,
): asserts value is LegacyExportRowV1 {
  const row = requireRecord(value, 'invalid canonical export row')
  const expectedKeys = sourceTable === 'settings'
    ? settingKeys(row.classification) : ROW_KEYS[sourceTable]
  assertExactKeys(row, expectedKeys, 'invalid canonical export row')
  assertRowBase(row, sourceTable)
  if (sourceTable === 'projects') assertProjectRow(row)
  else if (sourceTable === 'canvas_nodes') assertNodeRow(row)
  else if (sourceTable === 'canvas_edges') assertEdgeRow(row)
  else if (sourceTable === 'jobs') assertJobRow(row)
  else if (sourceTable === 'artifacts') assertArtifactRow(row)
  else assertSettingRow(row)
}
export function assertLegacyExportSemantics(input: {
  manifest: LegacyExportManifestV1
  rows: LegacyExportRowsV1
}): void {
  assertArtifactInventoryMatches(input.manifest.artifactManifest, input.rows.artifacts)
  const dispositions = new Map<string, LegacyDispositionV1>()
  for (const disposition of input.manifest.archivedDispositions) {
    const sourceRows = disposition.sourceTable === 'jobs'
      ? input.rows.jobs : input.rows.settings
    const source = sourceRows.find((row) => row.legacyPk === disposition.legacyPk)
    if (!source || source.canonicalRowHash !== disposition.canonicalRowHash) {
      throw new Error('legacy disposition does not match a source row')
    }
    dispositions.set(dispositionKey(disposition), disposition)
  }
  assertJobDispositionSemantics(input.rows.jobs, dispositions)
  assertSettingDispositionSemantics(input.rows.settings, dispositions)
}
function assertTableManifest(value: unknown, expected: ExpectedTable): void {
  const table = requireRecord(value, 'invalid legacy export table manifest')
  assertExactKeys(table, [
    'sourceTable', 'fileName', 'sourceCount', 'canonicalRowsSha256', 'fileSha256',
  ], 'invalid legacy export table manifest')
  if (table.sourceTable !== expected.sourceTable || table.fileName !== expected.fileName
    || !isNonNegativeInteger(table.sourceCount)
    || !isSha256(table.canonicalRowsSha256) || !isSha256(table.fileSha256)) {
    throw new Error('invalid legacy export table manifest')
  }
}
function assertRoutes(value: unknown): void {
  const routes = requireRecord(value, 'invalid legacy export routes')
  assertExactKeys(routes, ['schemaVersion', 'ai', 'media'], 'invalid legacy export routes')
  const ai = requireRecord(routes.ai, 'invalid legacy export routes')
  const media = requireRecord(routes.media, 'invalid legacy export routes')
  assertExactKeys(ai, [...AI_TASKS], 'invalid legacy export routes')
  assertExactKeys(media, [...MEDIA_TASKS], 'invalid legacy export routes')
  for (const task of AI_TASKS) assertRoute(ai[task], ['stepfun', 'gemini'])
  for (const task of MEDIA_TASKS) assertRoute(media[task], ['stepfun'])
  if (routes.schemaVersion !== 1) throw new Error('invalid legacy export routes')
}
function assertRoute(value: unknown, providers: string[]): void {
  const route = requireRecord(value, 'invalid legacy export route')
  assertExactKeys(route, ['provider', 'model'], 'invalid legacy export route')
  if (!providers.includes(String(route.provider)) || !isNonEmptyString(route.model)
    || route.model !== route.model.trim()) {
    throw new Error('invalid legacy export route')
  }
}
function assertArtifactManifest(value: unknown): void {
  if (!Array.isArray(value)) throw new Error('invalid artifact manifest')
  for (const entryValue of value) {
    const entry = requireRecord(entryValue, 'invalid artifact manifest')
    assertExactKeys(entry, [
      'legacyPk', 'storageKey', 'exists', 'sizeBytes', 'sha256',
    ], 'invalid artifact manifest')
    if (!isNonEmptyString(entry.legacyPk) || !isSafeStorageKey(entry.storageKey)
      || typeof entry.exists !== 'boolean') throw new Error('invalid artifact manifest')
    const present = entry.exists && isNonNegativeInteger(entry.sizeBytes)
      && isSha256(entry.sha256)
    const missing = !entry.exists && entry.sizeBytes === null && entry.sha256 === null
    if (!present && !missing) throw new Error('invalid artifact manifest')
  }
  assertSortedUnique(value, 'legacyPk', 'artifact manifest must be sorted and unique')
}
function assertDispositions(value: unknown): void {
  if (!Array.isArray(value)) throw new Error('invalid archived dispositions')
  for (const item of value) {
    const row = requireRecord(item, 'invalid archived disposition')
    assertExactKeys(row, [...BASE_ROW_KEYS, 'reason'], 'invalid archived disposition')
    if ((row.sourceTable !== 'jobs' && row.sourceTable !== 'settings')
      || !isNonEmptyString(row.legacyPk) || !isSha256(row.canonicalRowHash)
      || row.schemaVersion !== 1
      || !validDispositionReason(row.sourceTable, row.reason)) {
      throw new Error('invalid archived disposition')
    }
  }
  assertDispositionOrder(value as LegacyDispositionV1[])
}
function assertRowBase(
  row: Record<string, unknown>,
  sourceTable: LegacyTableName,
): void {
  if (row.schemaVersion !== 1 || row.sourceTable !== sourceTable
    || !isNonEmptyString(row.legacyPk) || !isSha256(row.canonicalRowHash))
    throw new Error('invalid canonical export row')
}
function assertProjectRow(row: Record<string, unknown>): void {
  if (!isUuid(row.targetId) || !isScalar(row.title) || !isScalar(row.script)
    || !isScalar(row.exportSettingsJson) || !isScalar(row.autopilot)
    || !isScalar(row.createdAt) || !isScalar(row.updatedAt))
    throw new Error('invalid projects export row')
}
function assertNodeRow(row: Record<string, unknown>): void {
  const scalarKeys = [
    'type', 'stage', 'positionJson', 'dataJson', 'status', 'contentHash',
    'laneKey', 'laneRole', 'createdAt',
  ]
  if (!isUuid(row.targetId) || !isUuid(row.targetProjectId)
    || !scalarKeys.every((key) => isScalar(row[key])))
    throw new Error('invalid canvas nodes export row')
}
function assertEdgeRow(row: Record<string, unknown>): void {
  if (!['targetId', 'targetProjectId', 'targetSourceId', 'targetTargetId']
    .every((key) => isUuid(row[key]))) throw new Error('invalid canvas edges export row')
}
function assertJobRow(row: Record<string, unknown>): void {
  const scalars = ['kind', 'status', 'attempts', 'createdAt', 'updatedAt']
  if (!isUuid(row.targetId) || !isNullableUuid(row.targetProjectId)
    || !isNullableUuid(row.targetNodeId) || !isSha256(row.payloadHash)
    || typeof row.errorPresent !== 'boolean'
    || !scalars.every((key) => isScalar(row[key])))
    throw new Error('invalid jobs export row')
}
function assertArtifactRow(row: Record<string, unknown>): void {
  if (!isUuid(row.targetId) || !isNullableUuid(row.targetProjectId)
    || !isNullableUuid(row.targetNodeId) || !isScalar(row.kind)
    || !isSafeStorageKey(row.storageKey) || !isScalar(row.contentHash)
    || !isScalar(row.createdAt)) throw new Error('invalid artifacts export row')
}
function assertSettingRow(row: Record<string, unknown>): void {
  if (!Array.isArray(row.associatedTargets)
    || !row.associatedTargets.every(isValidTarget)
    || new Set(row.associatedTargets).size !== row.associatedTargets.length)
    throw new Error('invalid settings export row')
  if (row.classification === 'credential') {
    if ((row.provider !== 'stepfun' && row.provider !== 'gemini')
      || !isNonEmptyString(row.envelopeWire)
      || row.associatedTargets.length !== 1
      || row.associatedTargets[0] !== `credential:${row.provider}`)
      throw new Error('invalid credential setting export row')
  } else if (row.classification === 'route-setting') {
    if (row.associatedTargets.length === 0)
      throw new Error('invalid route setting export row')
  } else if (row.classification !== 'archived'
    || row.associatedTargets.length !== 0)
    throw new Error('invalid archived setting export row')
}
function assertArtifactInventoryMatches(
  inventory: LegacyArtifactManifestEntryV1[],
  rows: LegacyArtifactExportRowV1[],
): void {
  if (inventory.length !== rows.length)
    throw new Error('artifact inventory does not account for every artifact row')
  inventory.forEach((entry, index) => {
    const row = rows[index]
    if (!row || entry.legacyPk !== row.legacyPk || entry.storageKey !== row.storageKey)
      throw new Error('artifact inventory does not match artifact source rows')
  })
}
function assertJobDispositionSemantics(
  rows: LegacyJobExportRowV1[],
  dispositions: Map<string, LegacyDispositionV1>,
): void {
  for (const row of rows) {
    const disposition = dispositions.get(dispositionKey(row))
    const expected = expectedJobReason(row)
    if (disposition?.reason !== expected) {
      if (disposition || expected) throw new Error('invalid job disposition semantics')
    }
  }
}
function assertSettingDispositionSemantics(
  rows: LegacySettingExportRowV1[],
  dispositions: Map<string, LegacyDispositionV1>,
): void {
  for (const row of rows) {
    const disposition = dispositions.get(dispositionKey(row))
    if ((row.classification === 'archived') !== Boolean(disposition))
      throw new Error('invalid setting disposition semantics')
  }
}
function expectedJobReason(row: LegacyJobExportRowV1): LegacyDispositionReason | null {
  if (!row.targetProjectId) return 'missing-project'
  if (row.kind !== 'director-stage' && row.kind !== 'render-shot')
    return 'unsupported-kind'
  return ['done', 'failed', 'pending', 'running'].includes(String(row.status))
    ? null : 'invalid-status'
}
function settingKeys(classification: unknown): string[] {
  if (classification === 'credential')
    return [...BASE_ROW_KEYS, 'classification', 'provider', 'envelopeWire',
      'associatedTargets']
  return [...BASE_ROW_KEYS, 'classification', 'associatedTargets']
}
function validDispositionReason(sourceTable: string, reason: unknown): boolean {
  return typeof reason === 'string' && (
    sourceTable === 'jobs' ? JOB_REASONS : SETTING_REASONS
  ).has(reason as LegacyDispositionReason)
}
function assertDispositionOrder(rows: LegacyDispositionV1[]): void {
  const keys = rows.map((row) => `${row.sourceTable === 'jobs' ? '0' : '1'}:${row.legacyPk}`)
  if (!keys.every((key, index) =>
    index === 0 || utf8Compare(keys[index - 1]!, key) < 0))
    throw new Error('archived dispositions must be sorted and unique')
}
function assertSortedUnique(
  rows: unknown[],
  key: string,
  message: string,
): void {
  const values = rows.map((row) => String((row as Record<string, unknown>)[key]))
  if (!values.every((value, index) =>
    index === 0 || utf8Compare(values[index - 1]!, value) < 0))
    throw new Error(message)
}
function assertExactKeys(
  value: Record<string, unknown>,
  expected: string[],
  message: string,
): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) throw new Error(message)
}
function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message)
  return value as Record<string, unknown>
}
function dispositionKey(row: { sourceTable: string; legacyPk: string }): string {
  return `${row.sourceTable}:${row.legacyPk}`
}
function isScalar(value: unknown): boolean {
  return value === null || typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value))
}
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}
function isNullableUuid(value: unknown): boolean {
  return value === null || isUuid(value)
}
function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value)
}
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function isSafeStorageKey(value: unknown): value is string {
  if (!isNonEmptyString(value) || value.includes('\\') || value.startsWith('/')) return false
  if (/^[a-z]:/iu.test(value)) return false
  const segments = value.split('/')
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}
function isValidTarget(value: unknown): value is string {
  return typeof value === 'string' && (
    AI_TASKS.some((task) => value === `ai:${task}`)
    || MEDIA_TASKS.some((task) => value === `media:${task}`)
    || value === 'credential:stepfun'
    || value === 'credential:gemini'
  )
}
function utf8Compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}
