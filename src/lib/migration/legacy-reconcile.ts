import { and, eq } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import { commandReceipts } from '@/lib/db/schema/index'
import { canonicalRowsSha256, sha256Canonical } from './legacy-export'
import {
  legacyImportFingerprint,
  loadVerifiedLegacyExport,
  type LegacyImportAccountV1,
  type LegacyImportReceiptResultV1,
  type SourceTable,
  type VerifiedLegacyExportBundleV1,
} from './legacy-import-contracts'
import { prepareLegacyImportPlan } from './legacy-import-plan'
import {
  verifyLegacyImportTargets,
  type LegacyImportTargetMismatchV1,
} from './legacy-import-target-verifier'

export interface LegacyTableReconciliationV1 {
  sourceTable: SourceTable
  sourceCount: number
  accountedCount: number
  sourcePkSha256: string
  accountedPkSha256: string
  sourceRowsSha256: string
  accountedRowsSha256: string
  missingLegacyPks: string[]
  extraLegacyPks: string[]
  unresolvedTargets: string[]
  contentMismatches: string[]
}
export interface LegacyReconciliationReportV1 {
  schemaVersion: 1
  snapshotSha256: string
  receiptId: string
  ok: boolean
  tables: LegacyTableReconciliationV1[]
  dispositionCounts: Record<string, number>
  targetMismatches: LegacyImportTargetMismatchV1[]
}

export async function reconcileLegacyImport(input: {
  db: Db
  manifestPath: string
  artifactRoot?: string
  snapshotPath?: string
  backupReportPath?: string
}): Promise<LegacyReconciliationReportV1> {
  const exportInput = {
    manifestPath: input.manifestPath,
    snapshotPath: input.snapshotPath,
    backupReportPath: input.backupReportPath,
  }
  const bundle = await loadVerifiedLegacyExport(exportInput)
  const plan = await prepareLegacyImportPlan({
    ...exportInput,
    artifactRoot: input.artifactRoot ?? '.data/artifacts',
  })
  const receipt = await loadReceipt(input.db, bundle)
  const targetVerification = await verifyLegacyImportTargets({
    db: input.db,
    plan,
    mode: 'complete',
  })
  const targetMismatches = mismatchMap(targetVerification.mismatches)
  const tables = bundle.manifest.tables.map(({ sourceTable }) => reconcileTable(
    bundle, sourceTable, receipt.result.accounts, targetMismatches,
  ))
  const dispositionCounts = countDispositions(receipt.result.accounts)
  return {
    schemaVersion: 1,
    snapshotSha256: bundle.manifest.snapshotSha256,
    receiptId: receipt.id,
    ok: !targetVerification.mismatches.length && tables.every(tableIsReconciled),
    tables,
    dispositionCounts,
    targetMismatches: targetVerification.mismatches,
  }
}

async function loadReceipt(
  db: Db,
  bundle: VerifiedLegacyExportBundleV1,
): Promise<{ id: string; result: LegacyImportReceiptResultV1 }> {
  const key = `legacy-import-v1:${bundle.manifest.snapshotSha256}`
  const [row] = await db.select().from(commandReceipts).where(and(
    eq(commandReceipts.workspaceId, bundle.manifest.workspaceId),
    eq(commandReceipts.idempotencyKey, key),
  )).limit(1)
  if (!row || row.status !== 'succeeded'
    || row.fingerprint !== legacyImportFingerprint(bundle.manifest)
    || !row.result || row.result.schemaVersion !== 1
    || row.result.snapshotSha256 !== bundle.manifest.snapshotSha256
    || !Array.isArray(row.result.accounts)) {
    throw new Error('LEGACY_IMPORT_RECEIPT_NOT_RECONCILABLE')
  }
  return {
    id: row.id,
    result: row.result as unknown as LegacyImportReceiptResultV1,
  }
}

function reconcileTable(
  bundle: VerifiedLegacyExportBundleV1,
  sourceTable: SourceTable,
  accounts: LegacyImportAccountV1[],
  targetMismatches: Map<string, LegacyImportTargetMismatchV1>,
): LegacyTableReconciliationV1 {
  const rows = bundle.rows[sourceTable]
  const tableAccounts = accounts.filter((account) => account.sourceTable === sourceTable)
  const sourcePks = rows.map(({ legacyPk }) => legacyPk)
  const accountedPks = tableAccounts.map(({ legacyPk }) => legacyPk).sort(compare)
  const sourceSet = new Set(sourcePks)
  const accountSet = new Set(accountedPks)
  const targetIssues = reconcileAccountTargets(tableAccounts, targetMismatches)
  return {
    sourceTable,
    sourceCount: rows.length,
    accountedCount: tableAccounts.length,
    sourcePkSha256: sha256Canonical(sourcePks),
    accountedPkSha256: sha256Canonical(accountedPks),
    sourceRowsSha256: canonicalRowsSha256(rows),
    accountedRowsSha256: hashAccounts(rows, tableAccounts),
    missingLegacyPks: sourcePks.filter((pk) => !accountSet.has(pk)),
    extraLegacyPks: accountedPks.filter((pk) => !sourceSet.has(pk)),
    unresolvedTargets: targetIssues.unresolved,
    contentMismatches: targetIssues.content,
  }
}

function reconcileAccountTargets(
  accounts: LegacyImportAccountV1[],
  mismatches: Map<string, LegacyImportTargetMismatchV1>,
): { unresolved: string[]; content: string[] } {
  const unresolved: string[] = []
  const content: string[] = []
  for (const account of accounts) {
    const invalidShape = Boolean(account.disposition) === Boolean(account.targets.length)
    if (invalidShape) unresolved.push(`${account.legacyPk}:invalid-account`)
    for (const target of account.targets) {
      const mismatch = mismatches.get(mismatchKey(target.table, target.id))
      if (!mismatch) continue
      const label = `${account.legacyPk}:${target.table}:${target.id}`
      if (mismatch.kind === 'missing') unresolved.push(label)
      else content.push(`${label}:${mismatch.fields.join(',')}`)
    }
  }
  return { unresolved, content }
}

function mismatchMap(
  mismatches: LegacyImportTargetMismatchV1[],
): Map<string, LegacyImportTargetMismatchV1> {
  return new Map(mismatches.map((item) => [
    mismatchKey(item.table, item.id),
    item,
  ]))
}

function mismatchKey(table: string, id: string): string {
  return `${table}:${id}`
}

function hashAccounts(
  rows: VerifiedLegacyExportBundleV1['rows'][SourceTable],
  accounts: LegacyImportAccountV1[],
): string {
  const byPk = new Map(accounts.map((account) => [account.legacyPk, account]))
  return canonicalRowsSha256(rows.flatMap((row) => {
    const account = byPk.get(row.legacyPk)
    return account ? [{ ...row, canonicalRowHash: account.canonicalRowHash }] : []
  }))
}

function tableIsReconciled(table: LegacyTableReconciliationV1): boolean {
  return table.sourceCount === table.accountedCount
    && table.sourcePkSha256 === table.accountedPkSha256
    && table.sourceRowsSha256 === table.accountedRowsSha256
    && table.missingLegacyPks.length === 0
    && table.extraLegacyPks.length === 0
    && table.unresolvedTargets.length === 0
    && table.contentMismatches.length === 0
}

function countDispositions(
  accounts: LegacyImportAccountV1[],
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const { disposition } of accounts) {
    if (disposition) result[disposition] = (result[disposition] ?? 0) + 1
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => (
    compare(left, right)
  )))
}

function compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}
