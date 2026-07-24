import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { decodeCredentialEnvelopeWire, openCredentialEnvelope } from '@/features/credentials/credential-envelope'
import {
  exportLegacySqlite, LEGACY_EXPORT_TABLES, LEGACY_WORKSPACE_ID, canonicalJson,
  readLegacyExportFile, readLegacyExportManifest, renameLegacyExportDirectory,
  type LegacySettingExportRowV1,
} from './legacy-export'
import { assertLegacyExportRowShape, assertLegacyExportSemantics,
  type LegacyExportRowsV1 } from './legacy-export-validation'
import { loadPersistentMasterKey } from '../../../scripts/migration/export-sqlite'
const roots: string[] = []
const masterKey = Buffer.alloc(32, 7)
const secret = 'fixture-credential-绝不能进入导出文本'
const execFileAsync = promisify(execFile)
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await chmod(root, 0o777).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
})
describe('legacy SQLite export', () => {
  it('writes fixed canonical JSONL and protected content', testCanonicalExport)
  it('refuses overwrite and leaves no partial output', testFailClosedExport)
  it('retries transient Windows rename failures', testRenameRetry)
  it('rejects tampered manifest, rows, dispositions, and inventory', testTampering)
})
type ExportFixture = Awaited<ReturnType<typeof createFixture>>
type ExportManifest = Awaited<ReturnType<typeof exportLegacySqlite>>
async function testCanonicalExport(): Promise<void> {
  const fixture = await createFixture()
  const manifest = await exportLegacySqlite({
    ...fixture, masterKey, workspaceId: LEGACY_WORKSPACE_ID,
  })
  assertManifestRoutes(manifest)
  await assertProtectedExport(fixture, manifest)
  assertArtifactInventory(fixture, manifest)
  const projectFile = path.join(fixture.outDir, 'projects.v1.jsonl')
  await writeFile(projectFile, `${await readFile(projectFile, 'utf8')} `)
  await expect(readLegacyExportFile(
    manifest, path.join(fixture.outDir, 'manifest.json'), 'projects',
  )).rejects.toThrow('hash mismatch')
}
async function testFailClosedExport(): Promise<void> {
  const fixture = await createFixture()
  await mkdir(fixture.outDir)
  await expect(exportLegacySqlite({ ...fixture, masterKey })).rejects.toThrow(
    'already exists',
  )
  await rm(fixture.outDir, { recursive: true })
  const db = new Database(fixture.snapshotPath)
  db.prepare("update settings set value = 'unknown' where key = ?").run(
    'director_provider_shot-codegen',
  )
  db.close()
  await refreshBackupReport(fixture.snapshotPath, fixture.backupReportPath)
  await expect(exportLegacySqlite({ ...fixture, masterKey })).rejects.toThrow(
    'unknown provider',
  )
  await expect(readFile(path.join(fixture.outDir, 'manifest.json')))
    .rejects.toMatchObject({ code: 'ENOENT' })
}
async function testRenameRetry(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'cvc-export-rename-'))
  roots.push(root)
  let calls = 0
  const waits: number[] = []
  await renameLegacyExportDirectory(
    path.join(root, 'source'),
    path.join(root, 'target'),
    async () => {
      calls += 1
      if (calls < 3) {
        const error = new Error('transient') as Error & { code: string }
        error.code = calls === 1 ? 'EPERM' : 'EBUSY'
        throw error
      }
    },
    async (milliseconds) => { waits.push(milliseconds) },
  )
  expect(calls).toBe(3)
  expect(waits).toEqual([50, 100])
}
async function testTampering(): Promise<void> {
  const fixture = await createFixture()
  const manifest = await exportLegacySqlite({ ...fixture, masterKey })
  const manifestPath = path.join(fixture.outDir, 'manifest.json')
  const rows = await readAllRows(manifest, manifestPath)
  assertLegacyExportSemantics({ manifest, rows })
  await expectManifestMutation(manifestPath, manifest, (draft) => {
    draft.injected = true
  })
  await expectManifestMutation(manifestPath, manifest, (draft) => {
    objectValue(objectValue(draft.resolvedRoutesV1).ai).injected = {
      provider: 'gemini', model: 'unexpected',
    }
  })
  await expectManifestMutation(manifestPath, manifest, (draft) => {
    const dispositions = draft.archivedDispositions as unknown[]
    objectValue(dispositions[0]).sourceTable = 'projects'
  })
  expect(() => assertLegacyExportRowShape({
    ...rows.projects[0], injected: true,
  }, 'projects')).toThrow('invalid canonical export row')
  const badDisposition = structuredClone(manifest)
  badDisposition.archivedDispositions[0]!.canonicalRowHash = '0'.repeat(64)
  expect(() => assertLegacyExportSemantics({
    manifest: badDisposition, rows,
  })).toThrow('does not match a source row')
  const badInventory = structuredClone(manifest)
  badInventory.artifactManifest[0]!.storageKey = 'other/file.mp4'
  expect(() => assertLegacyExportSemantics({
    manifest: badInventory, rows,
  })).toThrow('does not match artifact source rows')
}
function assertManifestRoutes(manifest: ExportManifest): void {
  expect(manifest.tables.map(({ sourceTable, fileName }) => ({
    sourceTable,
    fileName,
  }))).toEqual(LEGACY_EXPORT_TABLES)
  expect(manifest.resolvedRoutesV1.ai.fabricate).toEqual({
    provider: 'stepfun',
    model: 'step-custom-中文',
  })
  expect(manifest.resolvedRoutesV1.ai['vision-qa']).toEqual({
    provider: 'gemini',
    model: 'gemini-custom',
  })
  expect(manifest.resolvedRoutesV1.media.tts.model).toBe('tts-custom')
}
async function assertProtectedExport(
  fixture: ExportFixture,
  manifest: ExportManifest,
): Promise<ExportManifest> {
  const manifestPath = path.join(fixture.outDir, 'manifest.json')
  const parsed = await readLegacyExportManifest(manifestPath)
  const projects = await readLegacyExportFile(parsed, manifestPath, 'projects')
  expect(projects.map((row) => row.legacyPk)).toEqual(['a-project', '中-project'])
  const settings = await readLegacyExportFile<LegacySettingExportRowV1>(
    parsed, manifestPath, 'settings',
  )
  const credential = settings.find((row) => row.legacyPk === 'stepfun_api_key')
  expect(credential?.classification).toBe('credential')
  expect(openCredentialEnvelope({
    workspaceId: LEGACY_WORKSPACE_ID,
    provider: 'stepfun',
    masterKey,
    envelope: decodeCredentialEnvelopeWire(credential!.envelopeWire!),
  })).toBe(secret)
  const exportText = await readAllExportText(fixture.outDir)
  expect(exportText).not.toContain(secret)
  expect(Buffer.from(exportText).includes(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false)
  expect(exportText).not.toContain('\uFFFD')
  expect(parsed).toEqual(manifest)
  return parsed
}
function assertArtifactInventory(
  fixture: ExportFixture,
  manifest: ExportManifest,
): void {
  expect(manifest.artifactManifest).toEqual([
    expect.objectContaining({
      legacyPk: 'artifact-a',
      storageKey: 'render/中文.mp4',
      exists: true,
      sizeBytes: 8,
    }),
    expect.objectContaining({
      legacyPk: 'artifact-z',
      storageKey: 'render/missing.mp4',
      exists: false,
      sizeBytes: null,
      sha256: null,
    }),
  ])
  expect(JSON.stringify(manifest)).not.toContain(path.resolve(fixture.artifactRoot))
  expect(manifest.archivedDispositions).toEqual(expect.arrayContaining([
    expect.objectContaining({ legacyPk: 'job-orphan', reason: 'missing-project' }),
    expect.objectContaining({ legacyPk: 'misc_setting', reason: 'unsupported-setting' }),
    expect.objectContaining({
      legacyPk: 'stepfun_asr_model',
      reason: 'invalid-setting-value',
    }),
  ]))
}
async function readAllRows(
  manifest: ExportManifest,
  manifestPath: string,
): Promise<LegacyExportRowsV1> {
  const read = <T,>(table: Parameters<typeof readLegacyExportFile>[2]) =>
    readLegacyExportFile<T & { schemaVersion: 1; sourceTable: typeof table;
      legacyPk: string; canonicalRowHash: string }>(manifest, manifestPath, table)
  const [projects, canvasNodes, canvasEdges, jobs, artifacts, settings] =
    await Promise.all([
      read('projects'), read('canvas_nodes'), read('canvas_edges'),
      read('jobs'), read('artifacts'), read('settings'),
    ])
  return {
    projects, canvas_nodes: canvasNodes, canvas_edges: canvasEdges,
    jobs, artifacts, settings,
  } as LegacyExportRowsV1
}
async function expectManifestMutation(
  manifestPath: string,
  manifest: ExportManifest,
  mutate: (draft: Record<string, unknown>) => void,
): Promise<void> {
  const draft = structuredClone(manifest) as unknown as Record<string, unknown>
  mutate(draft)
  await writeFile(manifestPath, `${canonicalJson(draft)}\n`)
  await expect(readLegacyExportManifest(manifestPath)).rejects.toThrow()
}
function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('record')
  return value as Record<string, unknown>
}
describe('migration master key provisioner', () => {
  it('atomically creates and reuses without printing the key', testKeyProvision)
  it('fails closed for duplicate or malformed assignments', testInvalidKeyFile)
  it('makes the env file authoritative over inherited keys', testKeyPrecedence)
})
async function testKeyProvision(): Promise<void> {
  const envPath = await temporaryEnvPath('cvc-key-provision-')
  const first = await runProvisioner(envPath)
  expect(first).toEqual({ stdout: 'created\n', stderr: '' })
  const content = await readFile(envPath, 'utf8')
  const encoded = content.match(/^CVC_CREDENTIAL_MASTER_KEY=(.+)$/m)?.[1]
  expect(Buffer.from(encoded!, 'base64')).toHaveLength(32)
  const second = await runProvisioner(envPath)
  expect(second).toEqual({ stdout: 'reused\n', stderr: '' })
  expect(await readFile(envPath, 'utf8')).toBe(content)
  expect(`${first.stdout}${first.stderr}${second.stdout}${second.stderr}`)
    .not.toContain(encoded)
}
async function testInvalidKeyFile(): Promise<void> {
  const envPath = await temporaryEnvPath('cvc-key-invalid-')
  await writeFile(envPath, [
    'CVC_CREDENTIAL_MASTER_KEY=bad',
    'CVC_CREDENTIAL_MASTER_KEY=also-bad',
    '',
  ].join('\n'))
  await expect(runProvisioner(envPath)).rejects.toMatchObject({
    stdout: '', stderr: '',
  })
  expect(await readFile(envPath, 'utf8')).toContain('also-bad')
}
async function testKeyPrecedence(): Promise<void> {
  const envPath = await temporaryEnvPath('cvc-key-precedence-')
  const persisted = Buffer.alloc(32, 4).toString('base64')
  const inherited = Buffer.alloc(32, 5).toString('base64')
  await writeFile(envPath, `CVC_CREDENTIAL_MASTER_KEY=${persisted}\n`)
  await expect(runProvisioner(envPath, inherited)).rejects.toMatchObject({
    stdout: '', stderr: '',
  })
  const previous = process.env.CVC_CREDENTIAL_MASTER_KEY
  try {
    process.env.CVC_CREDENTIAL_MASTER_KEY = inherited
    expect(() => loadPersistentMasterKey(envPath)).toThrow('does not match')
    process.env.CVC_CREDENTIAL_MASTER_KEY = persisted
    expect(loadPersistentMasterKey(envPath)).toEqual(Buffer.alloc(32, 4))
    expect(() => loadPersistentMasterKey(`${envPath}.missing`)).toThrow()
  } finally {
    restoreProcessKey(previous)
  }
}
async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'cvc-legacy-export-'))
  roots.push(root)
  const snapshotPath = path.join(root, 'app.db')
  const backupReportPath = path.join(root, 'backup-report.json')
  const artifactRoot = path.join(root, 'artifacts')
  const outDir = path.join(root, 'export')
  await mkdir(path.join(artifactRoot, 'render'), { recursive: true })
  await writeFile(path.join(artifactRoot, 'render', '中文.mp4'), '视频ok')
  const db = new Database(snapshotPath)
  createSchema(db)
  insertFixtureRows(db)
  db.close()
  await refreshBackupReport(snapshotPath, backupReportPath)
  return { snapshotPath, backupReportPath, artifactRoot, outDir }
}
function createSchema(db: Database.Database): void {
  db.exec(`
    create table projects(id text primary key,title text not null,script text not null,export_settings text,autopilot integer,created_at integer,updated_at integer);
    create table canvas_nodes(id text primary key,project_id text not null,type text not null,stage text,position text not null,data text not null,status text not null,content_hash text,lane_key text,lane_role text,created_at integer);
    create table canvas_edges(id text primary key,project_id text not null,source text not null,target text not null);
    create table jobs(id text primary key,project_id text,node_id text,kind text not null,status text not null,payload text not null,attempts integer,error text,created_at integer,updated_at integer);
    create table artifacts(id text primary key,project_id text,node_id text,kind text not null,path text not null,content_hash text,created_at integer);
    create table settings(key text primary key,value text not null,updated_at integer);
  `)
}
function insertFixtureRows(db: Database.Database): void {
  const statements = [
    `insert into projects values ('中-project','中文项目','脚本：你好','{"width":1920}',1,2,3),('a-project','Alpha','Script',null,0,1,2)`,
    `insert into canvas_nodes values ('node-z','中-project','shot-codegen','BAD','{"x":1,"y":2}','{"中文":"值"}','success','hash','S001','shot',4),('node-a','a-project','script-import',null,'{"x":0,"y":0}','{}','idle',null,null,null,2)`,
    `insert into canvas_edges values ('edge-z','中-project','node-z','missing'),('edge-a','a-project','node-a','node-a')`,
    `insert into jobs values ('job-with','中-project','node-z','director-stage','done','{"secret":"payload"}',1,null,5,6),('job-orphan',null,null,'render-shot','running','{}',0,'err',7,8)`,
    `insert into artifacts values ('artifact-z','中-project','node-z','render-mp4','render/missing.mp4',null,7),('artifact-a','中-project','node-z','render-mp4','render/中文.mp4',null,6)`,
    `insert into settings values ('stepfun_api_key','${secret}',1),('director_provider_shot-codegen','stepfun',2),('stepfun_chat_model','step-custom-中文',3),('gemini_primary_model','gemini-custom',4),('stepfun_tts_model','tts-custom',5),('stepfun_asr_model','',6),('misc_setting','private-ish',7)`,
  ]
  db.transaction(() => statements.forEach((sql) => db.exec(sql)))()
}
async function refreshBackupReport(snapshotPath: string, reportPath: string) {
  const bytes = await readFile(snapshotPath)
  const db = new Database(snapshotPath, { readonly: true })
  const tables = ['projects', 'canvas_nodes', 'canvas_edges', 'jobs', 'artifacts', 'settings']
  const rowCounts = Object.fromEntries(tables.map((table) => [
    table,
    db.prepare(`select count(*) from "${table}"`).pluck().get(),
  ]))
  db.close()
  await writeFile(reportPath, JSON.stringify({
    schemaVersion: 1,
    quickCheck: 'ok',
    rowCounts,
    snapshotSha256: createHash('sha256').update(bytes).digest('hex'),
  }))
}
async function readAllExportText(outDir: string): Promise<string> {
  const names = ['manifest.json', ...LEGACY_EXPORT_TABLES.map((item) => item.fileName)]
  return (await Promise.all(names.map((name) => readFile(path.join(outDir, name), 'utf8'))))
    .join('\n')
}
async function temporaryEnvPath(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix))
  roots.push(root)
  return path.join(root, '.env.local')
}
function restoreProcessKey(value: string | undefined): void {
  if (value === undefined) delete process.env.CVC_CREDENTIAL_MASTER_KEY
  else process.env.CVC_CREDENTIAL_MASTER_KEY = value
}
async function runProvisioner(envPath: string, inherited?: string) {
  const cli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs')
  const script = path.join(process.cwd(), 'scripts', 'migration',
    'provision-master-key.ts')
  const env = { ...process.env }
  if (inherited === undefined) delete env.CVC_CREDENTIAL_MASTER_KEY
  else env.CVC_CREDENTIAL_MASTER_KEY = inherited
  return execFileAsync(process.execPath, [cli, script, '--env', envPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env,
  })
}
