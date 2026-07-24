import 'server-only'
import { DB_PATH, ensureDataDirs } from '@/lib/config/paths'
import { createDb, type Db } from './migrate'

/**
 * 进程内单例数据库缓存：锚定到 globalThis，避免 Next.js HMR 下 better-sqlite3
 * 连接句柄随模块重求值累积。
 */
const globalStore = globalThis as unknown as { __cvcDb?: Db }

/** 进程内单例数据库：首次访问时确保目录存在并应用迁移。 */
export function getDb(): Db {
  if (!globalStore.__cvcDb) {
    ensureDataDirs()
    globalStore.__cvcDb = createDb(DB_PATH).db
  }
  return globalStore.__cvcDb
}
