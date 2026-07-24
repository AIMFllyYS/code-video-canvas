import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as legacySchema from '@/lib/db/schema'

export type LegacySqliteDb = BetterSQLite3Database<typeof legacySchema>

const MIGRATIONS_DIR = path.join(
  process.cwd(),
  'src',
  'lib',
  'db',
  'migrations'
)

/** N1.6 删除前，仅供冻结 legacy schema 测试打开临时 SQLite。 */
export function createLegacySqliteTestDatabase(
  dbFile: string
): { db: LegacySqliteDb; sqlite: Database.Database } {
  const sqlite = new Database(dbFile)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema: legacySchema })
  migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  return { db, sqlite }
}
