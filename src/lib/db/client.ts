import 'server-only'
import { DB_PATH, ensureDataDirs } from '@/lib/config/paths'
import { createDb, type Db } from './migrate'

let cached: Db | undefined

/** 进程内单例数据库：首次访问时确保目录存在并应用迁移。 */
export function getDb(): Db {
  if (!cached) {
    ensureDataDirs()
    cached = createDb(DB_PATH).db
  }
  return cached
}
