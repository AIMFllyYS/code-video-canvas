import { eq } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import {
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
import type {
  LegacyImportPlanV1,
  TargetTable,
} from './legacy-import-contracts'

export type LegacyTargetVerificationMode = 'existing' | 'complete'

export interface LegacyImportTargetMismatchV1 {
  table: TargetTable
  id: string
  kind: 'missing' | 'content-mismatch'
  fields: string[]
}

export interface LegacyImportTargetVerificationV1 {
  expectedCount: number
  matchedCount: number
  mismatches: LegacyImportTargetMismatchV1[]
}

interface ExpectedTarget {
  table: TargetTable
  id: string
  fields: Record<string, unknown>
}

type ActualTargetMaps = Record<
  TargetTable,
  Map<string, Record<string, unknown>>
>

export async function verifyLegacyImportTargets(input: {
  db: Db
  plan: LegacyImportPlanV1
  mode: LegacyTargetVerificationMode
}): Promise<LegacyImportTargetVerificationV1> {
  const expected = collectExpectedTargets(input.plan)
  const actual = await loadActualTargets(
    input.db,
    input.plan.manifest.workspaceId,
  )
  const mismatches: LegacyImportTargetMismatchV1[] = []
  let matchedCount = 0
  for (const target of expected) {
    const row = actual[target.table].get(target.id)
    if (!row) {
      if (input.mode === 'complete') mismatches.push(missingTarget(target))
      continue
    }
    const fields = mismatchedFields(target.fields, row)
    if (fields.length) {
      mismatches.push({
        table: target.table,
        id: target.id,
        kind: 'content-mismatch',
        fields,
      })
    } else {
      matchedCount += 1
    }
  }
  return { expectedCount: expected.length, matchedCount, mismatches }
}

export async function assertLegacyImportTargets(input: {
  db: Db
  plan: LegacyImportPlanV1
  mode: LegacyTargetVerificationMode
}): Promise<void> {
  const report = await verifyLegacyImportTargets(input)
  if (!report.mismatches.length) return
  const safeDetails = report.mismatches.map((item) => ({
    table: item.table,
    id: item.id,
    kind: item.kind,
    fields: item.fields,
  }))
  throw new Error(
    `LEGACY_IMPORT_TARGET_MISMATCH:${JSON.stringify(safeDetails)}`,
  )
}

function collectExpectedTargets(plan: LegacyImportPlanV1): ExpectedTarget[] {
  const projectTargets = plan.projects.flatMap((project) => [
    expectedTarget('projects', project.project),
    ...project.nodes.map((row) => expectedTarget('canvas_nodes', row)),
    ...project.edges.map((row) => expectedTarget('canvas_edges', row)),
    ...project.runs.map((row) => expectedTarget('pipeline_runs', row)),
    ...project.attempts.map((row) => expectedTarget('task_attempts', row)),
    ...project.artifacts.map((row) => expectedTarget('artifacts', row)),
  ])
  const globalTargets = [
    ...plan.globals.credentials.map((row) => (
      expectedTarget('provider_credentials', row)
    )),
    ...plan.globals.modelRoutes.map((row) => expectedTarget('model_routes', row)),
    ...plan.globals.mediaRoutes.map((row) => expectedTarget('media_routes', row)),
  ]
  return assertUniqueTargets([...projectTargets, ...globalTargets])
}

function expectedTarget(
  table: TargetTable,
  value: object,
): ExpectedTarget {
  const fields = Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  )
  if (typeof fields.id !== 'string') {
    throw new Error('LEGACY_IMPORT_TARGET_ID_INVALID')
  }
  return { table, id: fields.id, fields }
}

function assertUniqueTargets(targets: ExpectedTarget[]): ExpectedTarget[] {
  const seen = new Set<string>()
  for (const target of targets) {
    const key = `${target.table}:${target.id}`
    if (seen.has(key)) throw new Error('LEGACY_IMPORT_TARGET_DUPLICATED')
    seen.add(key)
  }
  return targets
}

async function loadActualTargets(
  db: Db,
  workspaceId: string,
): Promise<ActualTargetMaps> {
  const rows = await Promise.all([
    db.select().from(projects).where(eq(projects.workspaceId, workspaceId)),
    db.select().from(canvasNodes).where(eq(canvasNodes.workspaceId, workspaceId)),
    db.select().from(canvasEdges).where(eq(canvasEdges.workspaceId, workspaceId)),
    db.select().from(pipelineRuns).where(eq(pipelineRuns.workspaceId, workspaceId)),
    db.select().from(taskAttempts).where(eq(taskAttempts.workspaceId, workspaceId)),
    db.select().from(artifacts).where(eq(artifacts.workspaceId, workspaceId)),
    db.select().from(providerCredentials)
      .where(eq(providerCredentials.workspaceId, workspaceId)),
    db.select().from(modelRoutes).where(eq(modelRoutes.workspaceId, workspaceId)),
    db.select().from(mediaRoutes).where(eq(mediaRoutes.workspaceId, workspaceId)),
  ])
  return actualTargetMaps(rows)
}

function actualTargetMaps(rows: readonly (readonly object[])[]): ActualTargetMaps {
  return {
    projects: rowMap(rows[0]!),
    canvas_nodes: rowMap(rows[1]!),
    canvas_edges: rowMap(rows[2]!),
    pipeline_runs: rowMap(rows[3]!),
    task_attempts: rowMap(rows[4]!),
    artifacts: rowMap(rows[5]!),
    provider_credentials: rowMap(rows[6]!),
    model_routes: rowMap(rows[7]!),
    media_routes: rowMap(rows[8]!),
  }
}

function rowMap(rows: readonly object[]): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>()
  for (const value of rows) {
    const row = value as Record<string, unknown>
    if (typeof row.id !== 'string') throw new Error('LEGACY_TARGET_ID_INVALID')
    result.set(row.id, row)
  }
  return result
}

function missingTarget(target: ExpectedTarget): LegacyImportTargetMismatchV1 {
  return {
    table: target.table,
    id: target.id,
    kind: 'missing',
    fields: [],
  }
}

function mismatchedFields(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): string[] {
  return Object.keys(expected).filter((field) => (
    canonicalValue(expected[field]) !== canonicalValue(actual[field])
  )).sort(compareUtf8)
}

function canonicalValue(value: unknown): string {
  return JSON.stringify(normalizeValue(value))
}

function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) return { type: 'date', value: value.toISOString() }
  if (value instanceof Uint8Array) {
    return { type: 'bytes', value: Buffer.from(value).toString('hex') }
  }
  if (typeof value === 'bigint') return { type: 'bigint', value: value.toString() }
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (value && typeof value === 'object') return normalizeObject(value)
  return value
}

function normalizeObject(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([left], [right]) => compareUtf8(left, right))
      .map(([key, field]) => [key, normalizeValue(field)]),
  )
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}
