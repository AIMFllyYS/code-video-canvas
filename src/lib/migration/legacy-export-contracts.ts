import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { legacyIdToUuid } from './legacy-id'
import {
  assertLegacyExportManifestShape,
  assertLegacyExportRowShape,
} from './legacy-export-validation'

export const LEGACY_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001'
export const LEGACY_EXPORT_TABLES = [
  { sourceTable: 'projects', fileName: 'projects.v1.jsonl' },
  { sourceTable: 'canvas_nodes', fileName: 'canvas-nodes.v1.jsonl' },
  { sourceTable: 'canvas_edges', fileName: 'canvas-edges.v1.jsonl' },
  { sourceTable: 'jobs', fileName: 'jobs.v1.jsonl' },
  { sourceTable: 'artifacts', fileName: 'artifacts.v1.jsonl' },
  { sourceTable: 'settings', fileName: 'settings.v1.jsonl' },
] as const

export const LEGACY_ROUTE_DEFAULTS_V1 = {
  ai: {
    'project-plan': { nodeType: 'shot-split', provider: 'gemini' },
    'shot-spec': { nodeType: 'shot-script', provider: 'gemini' },
    fabricate: { nodeType: 'shot-codegen', provider: 'gemini' },
    'vision-qa': { nodeType: 'shot-qa', provider: 'gemini' },
  },
  models: {
    gemini: { text: 'gemini-3.6-flash', vision: 'gemini-3.6-flash' },
    stepfun: {
      text: 'step-3.5-flash',
      vision: 'step-3.7-flash',
      tts: 'stepaudio-2.5-tts',
      asr: 'stepaudio-2.5-asr',
    },
  },
  media: {
    tts: { provider: 'stepfun', model: 'stepaudio-2.5-tts' },
    asr: { provider: 'stepfun', model: 'stepaudio-2.5-asr' },
  },
} as const

export type LegacyTableName = (typeof LEGACY_EXPORT_TABLES)[number]['sourceTable']
export type LegacyScalar = string | number | null
export type LegacyRawRow = Record<string, LegacyScalar>
export type LegacyDispositionReason =
  | 'invalid-project' | 'unsupported-node-type' | 'invalid-node-status'
  | 'missing-lane-key' | 'invalid-node-data' | 'missing-source' | 'missing-target'
  | 'cross-project-endpoint' | 'missing-project' | 'unsupported-kind'
  | 'invalid-status' | 'missing-node' | 'missing-file' | 'hash-mismatch'
  | 'missing-attempt' | 'unused-route-setting' | 'unsupported-setting'
  | 'invalid-setting-value'

export interface LegacyExportRowV1 {
  schemaVersion: 1
  sourceTable: LegacyTableName
  legacyPk: string
  canonicalRowHash: string
}
export interface LegacyProjectExportRowV1 extends LegacyExportRowV1 {
  targetId: string; title: LegacyScalar; script: LegacyScalar
  exportSettingsJson: LegacyScalar; autopilot: LegacyScalar
  createdAt: LegacyScalar; updatedAt: LegacyScalar
}
export interface LegacyNodeExportRowV1 extends LegacyExportRowV1 {
  targetId: string; targetProjectId: string; type: LegacyScalar
  stage: LegacyScalar; positionJson: LegacyScalar; dataJson: LegacyScalar
  status: LegacyScalar; contentHash: LegacyScalar; laneKey: LegacyScalar
  laneRole: LegacyScalar; createdAt: LegacyScalar
}
export interface LegacyEdgeExportRowV1 extends LegacyExportRowV1 {
  targetId: string; targetProjectId: string
  targetSourceId: string; targetTargetId: string
}
export interface LegacyJobExportRowV1 extends LegacyExportRowV1 {
  targetId: string; targetProjectId: string | null; targetNodeId: string | null
  kind: LegacyScalar; status: LegacyScalar; payloadHash: string
  attempts: LegacyScalar; errorPresent: boolean
  createdAt: LegacyScalar; updatedAt: LegacyScalar
}
export interface LegacyArtifactExportRowV1 extends LegacyExportRowV1 {
  targetId: string; targetProjectId: string | null; targetNodeId: string | null
  kind: LegacyScalar; storageKey: string; contentHash: LegacyScalar
  createdAt: LegacyScalar
}
export interface LegacySettingExportRowV1 extends LegacyExportRowV1 {
  classification: 'credential' | 'route-setting' | 'archived'
  provider?: 'stepfun' | 'gemini'; envelopeWire?: string
  associatedTargets: string[]
}
export interface LegacyDispositionV1 extends LegacyExportRowV1 {
  reason: LegacyDispositionReason
}
export interface LegacyArtifactManifestEntryV1 {
  legacyPk: string; storageKey: string; exists: boolean
  sizeBytes: number | null; sha256: string | null
}
export interface ResolvedRoutesV1 {
  schemaVersion: 1
  ai: Record<'project-plan' | 'shot-spec' | 'fabricate' | 'vision-qa', {
    provider: 'stepfun' | 'gemini'; model: string
  }>
  media: Record<'tts' | 'asr', { provider: 'stepfun'; model: string }>
}
export interface LegacyTableManifestV1 {
  sourceTable: LegacyTableName; fileName: string; sourceCount: number
  canonicalRowsSha256: string; fileSha256: string
}
export interface LegacyExportManifestV1 {
  schemaVersion: 1; workspaceId: string; workflowVersion: string
  snapshotSha256: string; backupReportSha256: string
  tables: LegacyTableManifestV1[]; resolvedRoutesV1: ResolvedRoutesV1
  artifactManifest: LegacyArtifactManifestEntryV1[]
  archivedDispositions: LegacyDispositionV1[]
}
export interface LegacyExportRequest {
  snapshotPath: string; backupReportPath: string; artifactRoot: string
  outDir: string; masterKey: Uint8Array; workspaceId?: string
}

export type LegacyIdMapper = typeof legacyIdToUuid
export type LegacyExportRows = Record<LegacyTableName, LegacyExportRowV1[]>
export const SHA256_PATTERN = /^[0-9a-f]{64}$/
const TABLE_INDEX = new Map(LEGACY_EXPORT_TABLES.map((item, index) => [
  item.sourceTable, index,
]))

export async function readLegacyExportManifest(
  manifestPath: string,
): Promise<LegacyExportManifestV1> {
  const text = await readFile(manifestPath, 'utf8')
  if (text.charCodeAt(0) === 0xfeff || text.includes('\uFFFD')) {
    throw new Error('legacy export manifest is not canonical UTF-8')
  }
  const parsed: unknown = JSON.parse(text)
  assertLegacyExportManifestShape(
    parsed,
    LEGACY_WORKSPACE_ID,
    LEGACY_EXPORT_TABLES,
  )
  if (text !== `${canonicalJson(parsed)}\n`) {
    throw new Error('legacy export manifest is not canonical JSON')
  }
  return parsed
}

export async function readLegacyExportFile<T extends LegacyExportRowV1 = LegacyExportRowV1>(
  manifest: LegacyExportManifestV1,
  manifestPath: string,
  sourceTable: LegacyTableName,
): Promise<T[]> {
  const table = manifest.tables.find((item) => item.sourceTable === sourceTable)
  const expected = LEGACY_EXPORT_TABLES[TABLE_INDEX.get(sourceTable)!]
  if (!table || table.fileName !== expected.fileName) {
    throw new Error(`manifest table missing or unsafe: ${sourceTable}`)
  }
  const bytes = await readFile(path.join(path.dirname(manifestPath), table.fileName))
  if (sha256(bytes) !== table.fileSha256) throw new Error('export file hash mismatch')
  const text = bytes.toString('utf8')
  if (text.charCodeAt(0) === 0xfeff || text.includes('\uFFFD')) {
    throw new Error('export file is not canonical UTF-8')
  }
  const rows = parseCanonicalLines<T>(text, sourceTable)
  if (rows.length !== table.sourceCount
    || canonicalRowsSha256(rows) !== table.canonicalRowsSha256
    || !isSortedUnique(rows.map((row) => row.legacyPk))) {
    throw new Error('export row reconciliation mismatch')
  }
  return rows
}

export function canonicalRowsSha256(rows: readonly LegacyExportRowV1[]): string {
  return sha256(rows.map((row) => `${row.canonicalRowHash}\n`).join(''))
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  throw new Error('value is not canonical JSON')
}

export function sha256Canonical(value: unknown): string {
  return sha256(canonicalJson(value))
}

export function legacyRowBase(
  sourceTable: LegacyTableName,
  pk: LegacyScalar | undefined,
  raw: LegacyRawRow,
): LegacyExportRowV1 {
  return {
    schemaVersion: 1, sourceTable,
    legacyPk: requireLegacyString(pk, `${sourceTable} primary key`),
    canonicalRowHash: sha256Canonical(raw),
  }
}

export function requireLegacyString(
  value: LegacyScalar | undefined,
  label: string,
): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} must be non-empty`)
  return value
}

export function requireLegacyText(
  value: LegacyScalar | undefined,
  label: string,
): string {
  if (typeof value !== 'string') throw new Error(`${label} must be text`)
  return value
}

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export async function sha256File(file: string): Promise<string> {
  const digest = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(file)
    input.on('data', (chunk) => digest.update(chunk))
    input.on('error', reject)
    input.on('end', resolve)
  })
  return digest.digest('hex')
}

export function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}

export function hasCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseCanonicalLines<T extends LegacyExportRowV1>(
  text: string,
  sourceTable: LegacyTableName,
): T[] {
  return text ? text.trimEnd().split('\n').map((line) => {
    const row: unknown = JSON.parse(line)
    if (!isRecord(row) || row.schemaVersion !== 1
      || row.sourceTable !== sourceTable || typeof row.legacyPk !== 'string'
      || !SHA256_PATTERN.test(String(row.canonicalRowHash))
      || canonicalJson(row) !== line) {
      throw new Error('invalid canonical export row')
    }
    assertLegacyExportRowShape(row, sourceTable)
    return row as unknown as T
  }) : []
}

function isSortedUnique(values: string[]): boolean {
  return values.every((value, index) =>
    index === 0 || compareUtf8(values[index - 1]!, value) < 0)
}
