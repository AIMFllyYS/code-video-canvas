import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { asc } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  artifacts,
  canvasNodes,
  commandReceipts,
  mediaRoutes,
  modelRoutes,
  pipelineRuns,
  projects,
  providerCredentials,
  taskAttempts,
} from '@/lib/db/schema/index'
import {
  createPgTestDatabase,
  type PgTestDatabase,
} from '@/lib/db/test/pg-test-database'
import { exportLegacySqlite } from './legacy-export'
import { legacyIdToUuid } from './legacy-id'
import { importLegacyExport } from './legacy-import'
import { legacyImportFingerprint, legacyText } from './legacy-import-contracts'

const roots: string[] = []
const masterKey = Buffer.alloc(32, 19)
const secret = '迁移密钥-绝不落明文'
let postgres: PgTestDatabase

beforeAll(async () => {
  postgres = await createPgTestDatabase()
})

afterAll(async () => {
  await postgres.close()
  for (const root of roots) {
    await chmod(root, 0o777).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})

describe('legacy Postgres importer', registerLegacyPostgresImporterTests)

function registerLegacyPostgresImporterTests(): void {
  it('resumes project transactions, imports terminal history, and replays idempotently',
    resumesProjectTransactions)
  it('rejects an export file changed after manifest creation before writing PG',
    rejectsChangedExportFile)
  it('rejects a distinct manifest fingerprint for the same snapshot receipt key',
    rejectsDistinctManifestFingerprint)
  it('accepts empty project text but rejects non-string values', validatesLegacyText)
}

async function resumesProjectTransactions(): Promise<void> {
  const fixture = await createFixture()
  await exportLegacySqlite({ ...fixture, masterKey })
  const manifestPath = path.join(fixture.outDir, 'manifest.json')
  const resumed = await runInterruptedImport(fixture, manifestPath)
  await assertImportedProjects()
  await assertImportedNode()
  await assertHistoricalAttempts()
  await assertImportedArtifacts()
  await assertImportedGlobals()
  assertExpectedDispositions(resumed)
  await assertReceiptAndReplay(fixture, manifestPath)
}

async function rejectsChangedExportFile(): Promise<void> {
  await postgres.reset()
  const fixture = await createFixture()
  await exportLegacySqlite({ ...fixture, masterKey })
  const manifestPath = path.join(fixture.outDir, 'manifest.json')
  await writeFile(
    path.join(fixture.outDir, 'projects.v1.jsonl'),
    '{"tampered":true}\n',
  )
  await expect(importLegacyExport({
    db: postgres.db,
    manifestPath,
    artifactRoot: fixture.artifactRoot,
  })).rejects.toThrow(/hash|count|canonical/i)
  expect(await postgres.db.select().from(commandReceipts)).toHaveLength(0)
}

async function rejectsDistinctManifestFingerprint(): Promise<void> {
  await postgres.reset()
  const fixture = await createFixture()
  const first = await exportLegacySqlite({ ...fixture, masterKey })
  await importLegacyExport({
    db: postgres.db,
    manifestPath: path.join(fixture.outDir, 'manifest.json'),
    artifactRoot: fixture.artifactRoot,
  })
  const conflictDir = path.join(path.dirname(fixture.outDir), 'export-conflict')
  const second = await exportLegacySqlite({
    ...fixture, outDir: conflictDir, masterKey: Buffer.alloc(32, 23),
  })
  expect(second.snapshotSha256).toBe(first.snapshotSha256)
  expect(legacyImportFingerprint(second)).not.toBe(legacyImportFingerprint(first))
  await expect(importLegacyExport({
    db: postgres.db,
    manifestPath: path.join(conflictDir, 'manifest.json'),
    artifactRoot: fixture.artifactRoot,
  })).rejects.toThrow('LEGACY_IMPORT_FINGERPRINT_CONFLICT')
  expect(await postgres.db.select().from(commandReceipts)).toHaveLength(1)
}

function validatesLegacyText(): void {
  expect(legacyText('', true)).toBe('')
  expect(() => legacyText(42, true)).toThrow('invalid legacy text')
}

type ImportFixture = Awaited<ReturnType<typeof createFixture>>
type ImportResult = Awaited<ReturnType<typeof importLegacyExport>>

async function runInterruptedImport(
  fixture: ImportFixture,
  manifestPath: string,
): Promise<ImportResult> {
  await installSecondProjectFailure()
  await expect(importLegacyExport({
    db: postgres.db,
    manifestPath,
    artifactRoot: fixture.artifactRoot,
  })).rejects.toThrow('fixture-second-project')
  expect(await postgres.db.select().from(canvasNodes)).toHaveLength(1)
  await removeSecondProjectFailure()
  const resumed = await importLegacyExport({
    db: postgres.db,
    manifestPath,
    artifactRoot: fixture.artifactRoot,
  })
  expect(resumed.replayed).toBe(false)
  expect(resumed.inserted).toBeGreaterThan(0)
  return resumed
}

async function assertImportedProjects(): Promise<void> {
  const imported = await postgres.db.select().from(projects)
  const empty = imported.find(({ id }) => (
    id === legacyIdToUuid('projects', 'project-empty')
  ))
  expect(empty).toMatchObject({ title: '', script: '' })
}

async function assertImportedNode(): Promise<void> {
  const nodes = await postgres.db.select().from(canvasNodes)
  const shotNode = nodes.find(({ id }) => (
    id === legacyIdToUuid('canvas_nodes', 'node-shot')
  ))
  expect(shotNode).toMatchObject({
    stage: 'FABRICATE',
    status: 'succeeded',
    logicalKey: 'shot:S001:shot-codegen',
  })
  expect(shotNode?.data).toMatchObject({
    schemaVersion: 1,
    migration: { legacyStage: 'MISMATCHED' },
  })
}

async function assertHistoricalAttempts(): Promise<void> {
  const runs = await postgres.db.select().from(pipelineRuns)
  const attempts = await postgres.db.select().from(taskAttempts)
  expect(runs).toHaveLength(3)
  expect(attempts).toHaveLength(3)
  const terminal = ({ status }: { status: string }) => (
    status === 'succeeded' || status === 'failed' || status === 'cancelled'
  )
  expect(runs.every(terminal)).toBe(true)
  expect(attempts.every(terminal)).toBe(true)
}

async function assertImportedArtifacts(): Promise<void> {
  const imported = await postgres.db
    .select()
    .from(artifacts)
    .orderBy(asc(artifacts.version))
  expect(imported).toHaveLength(2)
  expect(imported.map((row) => row.version)).toEqual([1, 2])
  expect(imported[1]?.supersedesArtifactId).toBe(imported[0]?.id)
  expect(imported[0]?.attemptId).toBe(
    legacyIdToUuid('task-attempts', 'job-early'),
  )
  expect(imported[1]?.attemptId).toBe(
    legacyIdToUuid('task-attempts', 'job-late'),
  )
}

async function assertImportedGlobals(): Promise<void> {
  const [credential] = await postgres.db.select().from(providerCredentials)
  expect(credential?.verifiedAt).toBeNull()
  expect(Buffer.from(credential!.ciphertext).toString('utf8')).not.toContain(secret)
  expect(await postgres.db.select().from(modelRoutes)).toHaveLength(4)
  expect(await postgres.db.select().from(mediaRoutes)).toHaveLength(2)
}

function assertExpectedDispositions(result: ImportResult): void {
  const dispositions = [
    ['artifacts', 'artifact-too-early', 'missing-attempt'],
    ['artifacts', 'artifact-missing', 'missing-file'],
    ['artifacts', 'artifact-cross-project', 'missing-node'],
    ['jobs', 'job-unsupported', 'unsupported-kind'],
    ['jobs', 'job-orphan', 'missing-project'],
    ['canvas_edges', 'edge-dangling', 'missing-target'],
    ['canvas_edges', 'edge-cross', 'cross-project-endpoint'],
  ]
  for (const [sourceTable, legacyPk, disposition] of dispositions) {
    expect(result.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceTable, legacyPk, disposition }),
    ]))
  }
}

async function assertReceiptAndReplay(
  fixture: ImportFixture,
  manifestPath: string,
): Promise<void> {
  expect((await postgres.db.select().from(commandReceipts))[0]?.status).toBe(
    'succeeded',
  )
  const replay = await importLegacyExport({
    db: postgres.db,
    manifestPath,
    artifactRoot: fixture.artifactRoot,
  })
  expect(replay).toMatchObject({ inserted: 0, replayed: true })
  expect(await postgres.db.select().from(artifacts)).toHaveLength(2)
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'cvc-legacy-import-'))
  roots.push(root)
  const snapshotPath = path.join(root, 'app.db')
  const backupReportPath = path.join(root, 'backup-report.json')
  const artifactRoot = path.join(root, 'artifacts')
  const outDir = path.join(root, 'export')
  await mkdir(path.join(artifactRoot, 'render'), { recursive: true })
  await writeFile(path.join(artifactRoot, 'render', 'one.mp4'), 'one')
  await writeFile(path.join(artifactRoot, 'render', 'two.mp4'), 'two')
  await writeFile(path.join(artifactRoot, 'render', 'early.mp4'), 'early')
  await writeFile(path.join(artifactRoot, 'render', 'cross.mp4'), 'cross')
  const database = new Database(snapshotPath)
  createSchema(database)
  insertRows(database)
  database.close()
  await writeBackupReport(snapshotPath, backupReportPath)
  return { snapshotPath, backupReportPath, artifactRoot, outDir }
}

function createSchema(database: Database.Database): void {
  database.exec(`
    create table projects(id text primary key,title text not null,script text not null,export_settings text,autopilot integer,created_at integer,updated_at integer);
    create table canvas_nodes(id text primary key,project_id text not null,type text not null,stage text,position text not null,data text not null,status text not null,content_hash text,lane_key text,lane_role text,created_at integer);
    create table canvas_edges(id text primary key,project_id text not null,source text not null,target text not null);
    create table jobs(id text primary key,project_id text,node_id text,kind text not null,status text not null,payload text not null,attempts integer,error text,created_at integer,updated_at integer);
    create table artifacts(id text primary key,project_id text,node_id text,kind text not null,path text not null,content_hash text,created_at integer);
    create table settings(key text primary key,value text not null,updated_at integer);
  `)
}

function insertRows(database: Database.Database): void {
  const statements = [
    `insert into projects values ('project-a','中文项目','脚本：你好','{"width":1920}',1,10,20),('project-b','fixture-second-project','B',null,0,11,21),('project-empty','','',null,0,12,22)`,
    `insert into canvas_nodes values ('node-shot','project-a','shot-codegen','MISMATCHED','{"x":1,"y":2}','{"中文":"值"}','success',null,'S001','shot',20),('node-global','project-b','script-import',null,'{"x":0,"y":0}','{}','idle',null,null,null,21)`,
    `insert into canvas_edges values ('edge-ok','project-a','node-shot','node-shot'),('edge-dangling','project-a','node-shot','missing'),('edge-cross','project-a','node-shot','node-global')`,
    `insert into jobs values ('job-early','project-a','node-shot','director-stage','done','{"input":1}',1,null,100,110),('job-late','project-a','node-shot','render-shot','failed','{"input":2}',2,'private',200,210),('job-cancel','project-b',null,'render-shot','running','{}',0,null,120,130),('job-unsupported','project-a','node-shot','other','done','{}',0,null,220,230),('job-orphan',null,null,'render-shot','running','{}',0,null,225,235)`,
    `insert into artifacts values ('artifact-too-early','project-a','node-shot','render-mp4','render/early.mp4',null,50),('artifact-one','project-a','node-shot','render-mp4','render/one.mp4',null,150),('artifact-cross-project','project-a','node-global','render-mp4','render/cross.mp4',null,175),('artifact-two','project-a','node-shot','render-mp4','render/two.mp4',null,250),('artifact-missing','project-a','node-shot','thumbnail','render/missing.png',null,260)`,
    `insert into settings values ('stepfun_api_key','${secret}',1),('director_provider_shot-codegen','stepfun',2),('stepfun_chat_model','step-import',3),('gemini_primary_model','gemini-import',4),('misc_setting','discard-me',5)`,
  ]
  database.transaction(() => statements.forEach((statement) => database.exec(statement)))()
}

async function writeBackupReport(
  snapshotPath: string,
  reportPath: string,
): Promise<void> {
  const bytes = await readFile(snapshotPath)
  const database = new Database(snapshotPath, { readonly: true })
  const names = ['projects', 'canvas_nodes', 'canvas_edges', 'jobs', 'artifacts', 'settings']
  const rowCounts = Object.fromEntries(names.map((name) => [
    name,
    database.prepare(`select count(*) from "${name}"`).pluck().get(),
  ]))
  database.close()
  await writeFile(reportPath, JSON.stringify({
    schemaVersion: 1,
    quickCheck: 'ok',
    rowCounts,
    snapshotSha256: createHash('sha256').update(bytes).digest('hex'),
  }))
}

async function installSecondProjectFailure(): Promise<void> {
  await postgres.sql`
    create function reject_fixture_second_project() returns trigger language plpgsql as $$
    begin
      if NEW.title = 'fixture-second-project' then
        raise exception 'fixture-second-project';
      end if;
      return NEW;
    end $$`
  await postgres.sql`
    create trigger reject_fixture_second_project
    before insert on projects
    for each row execute function reject_fixture_second_project()`
}

async function removeSecondProjectFailure(): Promise<void> {
  await postgres.sql`drop trigger reject_fixture_second_project on projects`
  await postgres.sql`drop function reject_fixture_second_project()`
}
