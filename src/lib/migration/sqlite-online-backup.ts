import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  chmod,
  mkdir,
  open,
  rm,
  stat,
} from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import Database from 'better-sqlite3'

export const LEGACY_TABLES = [
  'projects',
  'canvas_nodes',
  'canvas_edges',
  'jobs',
  'artifacts',
  'settings',
] as const

type LegacyTable = (typeof LEGACY_TABLES)[number]

export interface FileInventoryV1 {
  path: string
  sizeBytes: number
  modifiedAt: string
  sha256: string
}

export interface SqliteBackupReportV1 {
  schemaVersion: 1
  source: {
    db: FileInventoryV1
    wal: FileInventoryV1 | null
    shm: FileInventoryV1 | null
  }
  destination: string
  quickCheck: 'ok'
  rowCounts: Record<LegacyTable, number>
  snapshotSha256: string
  backupPages: { totalPages: number; remainingPages: number }
  completedAt: string
}

export async function createSqliteOnlineBackup(request: {
  sourcePath: string
  destinationPath: string
}): Promise<SqliteBackupReportV1> {
  const sourcePath = resolve(request.sourcePath)
  const destinationPath = resolve(request.destinationPath)
  if (sourcePath === destinationPath) {
    throw new Error('SQLite backup 源与目标不能相同')
  }
  const source = await sourceInventory(sourcePath)
  let ownsDestination = false
  try {
    await reserveDestination(destinationPath)
    ownsDestination = true
    const backupPages = await backupDatabase(sourcePath, destinationPath)
    const rowCounts = validateSnapshot(destinationPath)
    const snapshotSha256 = await sha256File(destinationPath)
    await chmod(destinationPath, 0o444)
    return {
      schemaVersion: 1,
      source,
      destination: destinationPath,
      quickCheck: 'ok',
      rowCounts,
      snapshotSha256,
      backupPages,
      completedAt: new Date().toISOString(),
    }
  } catch (error) {
    if (ownsDestination) await removeOwnedDestination(destinationPath, error)
    throw error
  }
}

async function sourceInventory(sourcePath: string): Promise<{
  db: FileInventoryV1
  wal: FileInventoryV1 | null
  shm: FileInventoryV1 | null
}> {
  return {
    db: await fileInventory(sourcePath),
    wal: await optionalFileInventory(`${sourcePath}-wal`),
    shm: await optionalFileInventory(`${sourcePath}-shm`),
  }
}

async function reserveDestination(destinationPath: string): Promise<void> {
  await mkdir(dirname(destinationPath), { recursive: true })
  let handle: Awaited<ReturnType<typeof open>>
  try {
    handle = await open(destinationPath, 'wx')
  } catch (error) {
    if (hasCode(error, 'EEXIST') || hasCode(error, 'EISDIR')) {
      throw new Error('SQLite backup 目标已存在')
    }
    throw error
  }
  try {
    await handle.close()
  } catch (error) {
    try {
      await rm(destinationPath, { force: true })
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'SQLite backup 清理目标预留文件失败'
      )
    }
    throw error
  }
}

async function backupDatabase(
  sourcePath: string,
  destinationPath: string
): Promise<{ totalPages: number; remainingPages: number }> {
  const source = new Database(sourcePath, {
    readonly: true,
    fileMustExist: true,
  })
  try {
    const metadata = await source.backup(destinationPath)
    return {
      totalPages: metadata.totalPages,
      remainingPages: metadata.remainingPages,
    }
  } finally {
    source.close()
  }
}

function validateSnapshot(destinationPath: string): Record<LegacyTable, number> {
  const snapshot = new Database(destinationPath, {
    readonly: true,
    fileMustExist: true,
  })
  try {
    const quickCheck = snapshot.pragma('quick_check') as unknown[]
    if (
      quickCheck.length !== 1 ||
      !isRecord(quickCheck[0]) ||
      quickCheck[0].quick_check !== 'ok'
    ) {
      throw new Error('SQLite backup quick_check 未通过')
    }
    return Object.fromEntries(
      LEGACY_TABLES.map((table) => [table, tableCount(snapshot, table)])
    ) as Record<LegacyTable, number>
  } finally {
    snapshot.close()
  }
}

function tableCount(snapshot: Database.Database, table: LegacyTable): number {
  const count: unknown = snapshot
    .prepare(`select count(*) from "${table}"`)
    .pluck()
    .get()
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    throw new Error(`SQLite backup ${table} count 无效`)
  }
  return count
}

async function fileInventory(path: string): Promise<FileInventoryV1> {
  const details = await stat(path)
  if (!details.isFile()) throw new Error('SQLite backup source 不是普通文件')
  return {
    path: resolve(path),
    sizeBytes: details.size,
    modifiedAt: details.mtime.toISOString(),
    sha256: await sha256File(path),
  }
}

async function optionalFileInventory(
  path: string
): Promise<FileInventoryV1 | null> {
  try {
    return await fileInventory(path)
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return null
    throw error
  }
}

async function sha256File(path: string): Promise<string> {
  const digest = createHash('sha256')
  await new Promise<void>((resolveHash, rejectHash) => {
    const input = createReadStream(path)
    input.on('data', (chunk) => digest.update(chunk))
    input.on('error', rejectHash)
    input.on('end', resolveHash)
  })
  return digest.digest('hex')
}

async function removeOwnedDestination(
  destinationPath: string,
  originalError: unknown
): Promise<void> {
  await chmod(destinationPath, 0o666).catch(() => undefined)
  try {
    await rm(destinationPath, { force: true })
  } catch (error) {
    throw new AggregateError(
      [originalError, error],
      'SQLite backup 清理未验收目标失败'
    )
  }
}

function hasCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
