import { and, eq } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import {
  artifacts,
  canvasEdges,
  canvasNodes,
  commandReceipts,
  mediaRoutes,
  modelRoutes,
  pipelineRuns,
  projects,
  providerCredentials,
  taskAttempts,
  workspaces,
  type VersionedPayload,
} from '@/lib/db/schema/index'
import {
  type ArtifactInsert,
  type LegacyGlobalImportPlanV1,
  type LegacyImportPlanV1,
  type LegacyImportReceiptResultV1,
  type LegacyImportRunResultV1,
  type LegacyProjectImportPlanV1,
} from './legacy-import-contracts'
import { prepareLegacyImportPlan } from './legacy-import-plan'
import { assertLegacyImportTargets } from './legacy-import-target-verifier'
import { legacyIdToUuid } from './legacy-id'

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export type {
  LegacyImportAccountV1,
  LegacyImportReceiptResultV1,
  LegacyImportRunResultV1,
  LegacyImportTargetV1,
} from './legacy-import-contracts'

export async function importLegacyExport(input: {
  db: Db
  manifestPath: string
  artifactRoot: string
  snapshotPath?: string
  backupReportPath?: string
}): Promise<LegacyImportRunResultV1> {
  const plan = await prepareLegacyImportPlan(input)
  const replay = await openReceipt(input.db, plan)
  if (replay) {
    await assertLegacyImportTargets({
      db: input.db,
      plan,
      mode: 'complete',
    })
    return { ...replay, inserted: 0, replayed: true }
  }
  await assertLegacyImportTargets({
    db: input.db,
    plan,
    mode: 'existing',
  })
  let inserted = 0
  for (const project of plan.projects) {
    inserted += await input.db.transaction((tx) => persistProject(tx, project))
  }
  inserted += await input.db.transaction((tx) => persistGlobals(tx, plan.globals))
  const result: LegacyImportReceiptResultV1 = {
    schemaVersion: 1,
    snapshotSha256: plan.manifest.snapshotSha256,
    accounts: plan.accounts,
  }
  await assertLegacyImportTargets({
    db: input.db,
    plan,
    mode: 'complete',
  })
  await completeReceipt(input.db, plan, result)
  return { ...result, inserted, replayed: false }
}

async function openReceipt(
  db: Db,
  plan: LegacyImportPlanV1,
): Promise<LegacyImportReceiptResultV1 | null> {
  const key = receiptKey(plan)
  return db.transaction(async (tx) => {
    await tx.insert(workspaces).values({
      id: plan.manifest.workspaceId,
      slug: 'local',
      name: 'Local workspace',
    }).onConflictDoNothing()
    await tx.insert(commandReceipts).values({
      workspaceId: plan.manifest.workspaceId,
      id: legacyIdToUuid('command-receipts', key),
      command: 'legacy-import-v1',
      idempotencyKey: key,
      fingerprint: plan.fingerprint,
      status: 'pending',
    }).onConflictDoNothing()
    const [row] = await tx.select().from(commandReceipts).where(and(
      eq(commandReceipts.workspaceId, plan.manifest.workspaceId),
      eq(commandReceipts.idempotencyKey, key),
    )).limit(1)
    if (!row || row.fingerprint !== plan.fingerprint) {
      throw new Error('LEGACY_IMPORT_FINGERPRINT_CONFLICT')
    }
    if (row.status === 'succeeded') {
      return parseReceiptResult(row.result, plan.manifest.snapshotSha256)
    }
    if (row.status !== 'pending') {
      throw new Error('LEGACY_IMPORT_RECEIPT_NOT_RESUMABLE')
    }
    return null
  })
}

async function persistProject(
  tx: Tx,
  plan: LegacyProjectImportPlanV1,
): Promise<number> {
  let count = (await tx.insert(projects).values(plan.project)
    .onConflictDoNothing().returning({ id: projects.id })).length
  if (plan.nodes.length) {
    count += (await tx.insert(canvasNodes).values(plan.nodes)
      .onConflictDoNothing().returning({ id: canvasNodes.id })).length
  }
  if (plan.edges.length) {
    count += (await tx.insert(canvasEdges).values(plan.edges)
      .onConflictDoNothing().returning({ id: canvasEdges.id })).length
  }
  if (plan.runs.length) {
    count += (await tx.insert(pipelineRuns).values(plan.runs)
      .onConflictDoNothing().returning({ id: pipelineRuns.id })).length
  }
  if (plan.attempts.length) {
    count += (await tx.insert(taskAttempts).values(plan.attempts)
      .onConflictDoNothing().returning({ id: taskAttempts.id })).length
  }
  count += await persistArtifacts(tx, plan.artifacts)
  return count
}

async function persistArtifacts(
  tx: Tx,
  values: ArtifactInsert[],
): Promise<number> {
  let inserted = 0
  for (const value of values.sort((left, right) => left.version - right.version)) {
    inserted += (await tx.insert(artifacts).values(value)
      .onConflictDoNothing().returning({ id: artifacts.id })).length
  }
  return inserted
}

async function persistGlobals(
  tx: Tx,
  plan: LegacyGlobalImportPlanV1,
): Promise<number> {
  let count = 0
  if (plan.credentials.length) {
    count += (await tx.insert(providerCredentials).values(plan.credentials)
      .onConflictDoNothing().returning({ id: providerCredentials.id })).length
  }
  if (plan.modelRoutes.length) {
    count += (await tx.insert(modelRoutes).values(plan.modelRoutes)
      .onConflictDoNothing().returning({ id: modelRoutes.id })).length
  }
  if (plan.mediaRoutes.length) {
    count += (await tx.insert(mediaRoutes).values(plan.mediaRoutes)
      .onConflictDoNothing().returning({ id: mediaRoutes.id })).length
  }
  return count
}

async function completeReceipt(
  db: Db,
  plan: LegacyImportPlanV1,
  result: LegacyImportReceiptResultV1,
): Promise<void> {
  const updated = await db.update(commandReceipts).set({
    status: 'succeeded',
    result: result as unknown as VersionedPayload,
    completedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(commandReceipts.workspaceId, plan.manifest.workspaceId),
    eq(commandReceipts.idempotencyKey, receiptKey(plan)),
    eq(commandReceipts.fingerprint, plan.fingerprint),
    eq(commandReceipts.status, 'pending'),
  )).returning({ id: commandReceipts.id })
  if (updated.length !== 1) throw new Error('LEGACY_IMPORT_RECEIPT_COMMIT_FAILED')
}

function parseReceiptResult(
  value: VersionedPayload | null,
  snapshotSha256: string,
): LegacyImportReceiptResultV1 {
  if (!value || value.schemaVersion !== 1
    || value.snapshotSha256 !== snapshotSha256
    || !Array.isArray(value.accounts)) {
    throw new Error('LEGACY_IMPORT_RECEIPT_RESULT_INVALID')
  }
  return value as unknown as LegacyImportReceiptResultV1
}

function receiptKey(plan: LegacyImportPlanV1): string {
  return `legacy-import-v1:${plan.manifest.snapshotSha256}`
}
