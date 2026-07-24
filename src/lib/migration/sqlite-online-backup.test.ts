import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, expect, it } from 'vitest'
import {
  createSqliteOnlineBackup,
  LEGACY_TABLES,
} from './sqlite-online-backup'

let fixtureRoot: string | undefined
let writer: Database.Database | undefined

afterEach(() => {
  writer?.close()
  writer = undefined
  if (!fixtureRoot) return
  const destination = join(fixtureRoot, 'snapshot', 'app.db')
  if (existsSync(destination)) chmodSync(destination, 0o666)
  rmSync(fixtureRoot, { recursive: true, force: true })
  fixtureRoot = undefined
})

it('在 WAL writer 保持打开时生成通过 quick_check 的一致快照', async () => {
  const paths = createWalFixture()
  const before = {
    db: sha256(paths.source),
    wal: sha256(paths.wal),
  }

  const report = await createSqliteOnlineBackup({
    sourcePath: paths.source,
    destinationPath: paths.destination,
  })

  expect(report.schemaVersion).toBe(1)
  expect(report.quickCheck).toBe('ok')
  expect(report.rowCounts).toEqual({
    projects: 2,
    canvas_nodes: 2,
    canvas_edges: 3,
    jobs: 4,
    artifacts: 5,
    settings: 6,
  })
  expect(report.backupPages.totalPages).toBeGreaterThan(0)
  expect(report.backupPages.remainingPages).toBe(0)
  expect(report.snapshotSha256).toBe(sha256(paths.destination))
  expect(report.source.db.sha256).toBe(before.db)
  expect(report.source.wal?.sha256).toBe(before.wal)
  expect(statSync(paths.destination).mode & 0o222).toBe(0)
  expect(canOpenForWrite(paths.destination)).toBe(false)

  const snapshot = new Database(paths.destination, {
    readonly: true,
    fileMustExist: true,
  })
  try {
    expect(snapshot.pragma('quick_check', { simple: true })).toBe('ok')
    expect(
      snapshot.prepare('select title from projects where id = ?').get('wal-project')
    ).toEqual({ title: 'WAL 中的中文项目' })
  } finally {
    snapshot.close()
  }
  expect(sha256(paths.source)).toBe(before.db)
  expect(sha256(paths.wal)).toBe(before.wal)
})

it('目标已存在时拒绝覆盖并保留原字节', async () => {
  const paths = createWalFixture()
  mkdirSync(join(fixtureRoot!, 'snapshot'), { recursive: true })
  writeFileSync(paths.destination, 'sentinel', { flag: 'wx' })
  const before = sha256(paths.destination)
  const beforeBytes = readFileSync(paths.destination)
  const beforeSize = statSync(paths.destination).size

  await expect(
    createSqliteOnlineBackup({
      sourcePath: paths.source,
      destinationPath: paths.destination,
    })
  ).rejects.toThrow(/已存在/)

  expect(sha256(paths.destination)).toBe(before)
  expect(statSync(paths.destination).size).toBe(beforeSize)
  expect(readFileSync(paths.destination)).toEqual(beforeBytes)
})

it('快照缺少固定 legacy 表时删除未验收目标', async () => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'cvc-sqlite-backup-invalid-'))
  const source = join(fixtureRoot, 'source.db')
  const destination = join(fixtureRoot, 'snapshot', 'app.db')
  writer = new Database(source)
  writer.exec('create table projects (id text primary key)')

  await expect(
    createSqliteOnlineBackup({
      sourcePath: source,
      destinationPath: destination,
    })
  ).rejects.toThrow(/canvas_nodes/)

  expect(existsSync(destination)).toBe(false)
})

function createWalFixture(): {
  source: string
  wal: string
  destination: string
} {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'cvc-sqlite-backup-'))
  const source = join(fixtureRoot, 'source.db')
  const destination = join(fixtureRoot, 'snapshot', 'app.db')
  writer = new Database(source)
  expect(writer.pragma('journal_mode = WAL', { simple: true })).toBe('wal')
  writer.pragma('wal_autocheckpoint = 0')
  expect(writer.pragma('wal_autocheckpoint', { simple: true })).toBe(0)
  writer.exec(legacySchemaSql())
  insertBaselineRows(writer)
  writer.pragma('wal_checkpoint(TRUNCATE)')
  const checkpointHash = sha256(source)
  writer.prepare(
    'insert into projects (id, title) values (?, ?)'
  ).run('wal-project', 'WAL 中的中文项目')
  expect(sha256(source)).toBe(checkpointHash)
  expect(
    writer.prepare('select title from projects where id = ?').get('wal-project')
  ).toEqual({ title: 'WAL 中的中文项目' })
  const wal = `${source}-wal`
  expect(statSync(wal).size).toBeGreaterThan(0)
  return { source, wal, destination }
}

function legacySchemaSql(): string {
  return LEGACY_TABLES.map((table) => {
    if (table === 'settings') {
      return 'create table settings (key text primary key, value text not null)'
    }
    if (table === 'projects') {
      return 'create table projects (id text primary key, title text not null)'
    }
    return `create table ${table} (id text primary key)`
  }).join(';\n')
}

function insertBaselineRows(database: Database.Database): void {
  for (let index = 0; index < 1; index += 1) {
    database.prepare('insert into projects (id, title) values (?, ?)').run(
      `project-${index}`,
      `基线项目 ${index}`
    )
  }
  const counts = {
    canvas_nodes: 2,
    canvas_edges: 3,
    jobs: 4,
    artifacts: 5,
  } as const
  for (const [table, count] of Object.entries(counts)) {
    const insert = database.prepare(`insert into ${table} (id) values (?)`)
    for (let index = 0; index < count; index += 1) {
      insert.run(`${table}-${index}`)
    }
  }
  const insertSetting = database.prepare(
    'insert into settings (key, value) values (?, ?)'
  )
  for (let index = 0; index < 6; index += 1) {
    insertSetting.run(`setting-${index}`, `value-${index}`)
  }
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function canOpenForWrite(path: string): boolean {
  try {
    const descriptor = openSync(path, 'r+')
    closeSync(descriptor)
    return true
  } catch {
    return false
  }
}
