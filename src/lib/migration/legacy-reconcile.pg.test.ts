import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  commandReceipts,
  projects,
  workspaces,
} from '@/lib/db/schema/index'
import {
  createPgTestDatabase,
  type PgTestDatabase,
} from '@/lib/db/test/pg-test-database'
import { exportLegacySqlite } from './legacy-export'
import {
  importLegacyExport,
  type LegacyImportReceiptResultV1,
} from './legacy-import'
import { prepareLegacyImportPlan } from './legacy-import-plan'
import { reconcileLegacyImport } from './legacy-reconcile'

const roots: string[] = []
let postgres: PgTestDatabase

beforeAll(async () => {
  postgres = await createPgTestDatabase()
})

beforeEach(async () => {
  await postgres.reset()
})

afterAll(async () => {
  await postgres.close()
  for (const root of roots) {
    await chmod(root, 0o777).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})

describe('legacy import reconciliation', registerLegacyReconciliationTests)

function registerLegacyReconciliationTests(): void {
  it('accounts every source PK/hash and detects a missing account',
    accountsEverySourceRow)
  it('rejects a divergent deterministic target before resuming pending import',
    rejectsDivergentPendingTarget)
  it('reports target tampering and rejects a succeeded replay',
    reportsTargetTampering)
}

async function accountsEverySourceRow(): Promise<void> {
  const fixture = await createExportedFixture()
  await importLegacyExport({
    db: postgres.db,
    manifestPath: fixture.manifestPath,
    artifactRoot: fixture.artifactRoot,
  })
  const report = await reconcileLegacyImport({
    db: postgres.db,
    manifestPath: fixture.manifestPath,
    artifactRoot: fixture.artifactRoot,
  })
  expect(report.ok).toBe(true)
  expect(report.tables).toHaveLength(6)
  expect(report.tables.every((table) => (
    table.sourceCount === table.accountedCount
    && table.missingLegacyPks.length === 0
    && table.unresolvedTargets.length === 0
    && table.contentMismatches.length === 0
  ))).toBe(true)
  await assertMissingAccountDetected(fixture)
}

async function rejectsDivergentPendingTarget(): Promise<void> {
  const fixture = await createExportedFixture()
  const plan = await prepareLegacyImportPlan({
    manifestPath: fixture.manifestPath,
    artifactRoot: fixture.artifactRoot,
  })
  await postgres.db.insert(workspaces).values({
    id: plan.manifest.workspaceId,
    slug: 'conflicting-target',
    name: 'Conflicting target',
  })
  await postgres.db.insert(projects).values({
    ...plan.projects[0]!.project,
    title: '冲突标题',
  })
  await expect(importLegacyExport({
    db: postgres.db,
    manifestPath: fixture.manifestPath,
    artifactRoot: fixture.artifactRoot,
  })).rejects.toThrow('LEGACY_IMPORT_TARGET_MISMATCH')
  expect((await postgres.db.select().from(commandReceipts))[0]?.status).toBe(
    'pending',
  )
  await expect(importLegacyExport({
    db: postgres.db,
    manifestPath: fixture.manifestPath,
    artifactRoot: fixture.artifactRoot,
  })).rejects.toThrow('LEGACY_IMPORT_TARGET_MISMATCH')
}

async function reportsTargetTampering(): Promise<void> {
  const fixture = await createExportedFixture()
  await importLegacyExport({
    db: postgres.db,
    manifestPath: fixture.manifestPath,
    artifactRoot: fixture.artifactRoot,
  })
  const [project] = await postgres.db.select().from(projects)
  await postgres.db.update(projects).set({
    title: '导入后篡改',
  }).where(eq(projects.id, project!.id))
  const report = await reconcileLegacyImport({
    db: postgres.db,
    manifestPath: fixture.manifestPath,
    artifactRoot: fixture.artifactRoot,
  })
  expect(report.ok).toBe(false)
  expect(report.targetMismatches).toContainEqual({
    table: 'projects',
    id: project!.id,
    kind: 'content-mismatch',
    fields: ['title'],
  })
  expect(report.tables.find(({ sourceTable }) => (
    sourceTable === 'projects'
  ))?.contentMismatches).toHaveLength(1)
  await expect(importLegacyExport({
    db: postgres.db,
    manifestPath: fixture.manifestPath,
    artifactRoot: fixture.artifactRoot,
  })).rejects.toThrow('LEGACY_IMPORT_TARGET_MISMATCH')
}

async function assertMissingAccountDetected(
  fixture: ExportedFixture,
): Promise<void> {
  const [receipt] = await postgres.db.select().from(commandReceipts)
  const result = receipt!.result as unknown as LegacyImportReceiptResultV1
  const tampered = {
    ...result,
    accounts: result.accounts.filter((account) => (
      account.sourceTable !== 'canvas_edges'
    )),
  }
  await postgres.db.update(commandReceipts).set({
    result: tampered,
  }).where(eq(commandReceipts.id, receipt!.id))
  const failed = await reconcileLegacyImport({
    db: postgres.db,
    manifestPath: fixture.manifestPath,
    artifactRoot: fixture.artifactRoot,
  })
  expect(failed.ok).toBe(false)
  expect(failed.tables.find(({ sourceTable }) => (
    sourceTable === 'canvas_edges'
  ))).toMatchObject({
    sourceCount: 1,
    accountedCount: 0,
    missingLegacyPks: ['edge'],
  })
}

interface ExportedFixture {
  manifestPath: string
  artifactRoot: string
}

async function createExportedFixture(): Promise<ExportedFixture> {
  const fixture = await createFixture()
  await exportLegacySqlite({
    ...fixture,
    masterKey: Buffer.alloc(32, 31),
  })
  return {
    manifestPath: path.join(fixture.outDir, 'manifest.json'),
    artifactRoot: fixture.artifactRoot,
  }
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'cvc-legacy-reconcile-'))
  roots.push(root)
  const snapshotPath = path.join(root, 'app.db')
  const backupReportPath = path.join(root, 'backup-report.json')
  const artifactRoot = path.join(root, 'artifacts')
  const outDir = path.join(root, 'export')
  await mkdir(path.join(artifactRoot, 'render'), { recursive: true })
  await writeFile(path.join(artifactRoot, 'render', 'shot.mp4'), 'shot')
  const database = new Database(snapshotPath)
  database.exec(`
    create table projects(id text primary key,title text not null,script text not null,export_settings text,autopilot integer,created_at integer,updated_at integer);
    create table canvas_nodes(id text primary key,project_id text not null,type text not null,stage text,position text not null,data text not null,status text not null,content_hash text,lane_key text,lane_role text,created_at integer);
    create table canvas_edges(id text primary key,project_id text not null,source text not null,target text not null);
    create table jobs(id text primary key,project_id text,node_id text,kind text not null,status text not null,payload text not null,attempts integer,error text,created_at integer,updated_at integer);
    create table artifacts(id text primary key,project_id text,node_id text,kind text not null,path text not null,content_hash text,created_at integer);
    create table settings(key text primary key,value text not null,updated_at integer);
    insert into projects values ('project','对账项目','稿件','{}',0,1,2);
    insert into canvas_nodes values ('node','project','shot-codegen',null,'{"x":1,"y":2}','{}','success',null,'S001','shot',2);
    insert into canvas_edges values ('edge','project','node','node');
    insert into jobs values ('job','project','node','render-shot','done','{}',1,null,3,4);
    insert into artifacts values ('artifact','project','node','render-mp4','render/shot.mp4',null,5);
    insert into settings values ('stepfun_api_key','secret-reconcile',1),('misc_setting','discard',2);
  `)
  database.close()
  await writeBackupReport(snapshotPath, backupReportPath)
  return { snapshotPath, backupReportPath, artifactRoot, outDir }
}

async function writeBackupReport(
  snapshotPath: string,
  reportPath: string,
): Promise<void> {
  const bytes = await readFile(snapshotPath)
  const database = new Database(snapshotPath, { readonly: true })
  const tables = ['projects', 'canvas_nodes', 'canvas_edges', 'jobs', 'artifacts', 'settings']
  const rowCounts = Object.fromEntries(tables.map((table) => [
    table,
    database.prepare(`select count(*) from "${table}"`).pluck().get(),
  ]))
  database.close()
  await writeFile(reportPath, JSON.stringify({
    schemaVersion: 1,
    quickCheck: 'ok',
    rowCounts,
    snapshotSha256: createHash('sha256').update(bytes).digest('hex'),
  }))
}
