import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

/** 生成的迁移目录（由 `pnpm db:generate` 产出）。 */
const MIGRATIONS_DIR = path.join(process.cwd(), 'src', 'lib', 'db', 'migrations')

/** 打开一个 SQLite 连接并应用全部迁移，返回 drizzle 实例与底层连接。 */
export function createDb(dbFile: string): { db: Db; sqlite: Database.Database } {
  const sqlite = new Database(dbFile)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: MIGRATIONS_DIR })
  return { db, sqlite }
}

/** 对目标 SQLite 文件应用迁移后关闭连接（供 CLI 脚本使用）。 */
export function runMigrations(dbFile: string): void {
  const { sqlite } = createDb(dbFile)
  sqlite.close()
}
