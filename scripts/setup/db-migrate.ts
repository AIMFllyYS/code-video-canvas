/**
 * 应用数据库迁移到本地 SQLite（供 `pnpm db:migrate` 使用）。
 * 说明：使用相对导入，避免脚本环境下 `@/*` 路径别名解析问题。
 */
import { DB_PATH, ensureDataDirs } from '../../src/lib/config/paths'
import { runMigrations } from '../../src/lib/db/migrate'

ensureDataDirs()
runMigrations(DB_PATH)
console.log(`[db] migrations applied at ${DB_PATH}`)
