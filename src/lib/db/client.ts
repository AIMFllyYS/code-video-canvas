import 'server-only'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres, { type Sql } from 'postgres'
import { DB_PATH, ensureDataDirs } from '@/lib/config/paths'
import * as postgresSchema from '@/lib/db/schema/index'
import { createDb, type Db } from './migrate'

/**
 * 进程内单例数据库缓存：锚定到 globalThis，避免 Next.js HMR 下 better-sqlite3
 * 连接句柄随模块重求值累积。
 */
const globalStore = globalThis as unknown as {
  __cvcDb?: Db
  __cvcPostgresClient?: Sql
  __cvcPostgresDbPromise?: Promise<PostgresDb>
}

export type PostgresDb = PostgresJsDatabase<typeof postgresSchema>

/** 进程内单例数据库：首次访问时确保目录存在并应用迁移。 */
export function getDb(): Db {
  if (!globalStore.__cvcDb) {
    ensureDataDirs()
    globalStore.__cvcDb = createDb(DB_PATH).db
  }
  return globalStore.__cvcDb
}

/**
 * N1.2 过渡期的显式 Postgres client。N1.3 完成全部 async caller cutover 后，
 * 该函数会收口为正式 `getDb()`，legacy 同步入口随之退出 runtime graph。
 */
export function getPostgresDb(): Promise<PostgresDb> {
  if (!globalStore.__cvcPostgresDbPromise) {
    const pending = initializePostgresDb()
    globalStore.__cvcPostgresDbPromise = pending
    void pending.catch(() => {
      if (globalStore.__cvcPostgresDbPromise === pending) {
        delete globalStore.__cvcPostgresDbPromise
      }
    })
  }
  return globalStore.__cvcPostgresDbPromise
}

async function initializePostgresDb(): Promise<PostgresDb> {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  const client = postgres(databaseUrl)
  globalStore.__cvcPostgresClient = client
  try {
    await client`select 1`
    return drizzle(client, { schema: postgresSchema })
  } catch (error) {
    if (globalStore.__cvcPostgresClient === client) {
      delete globalStore.__cvcPostgresClient
    }
    await client.end().catch(() => undefined)
    throw error
  }
}
