import 'server-only'
import { desc } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { projects } from '@/lib/db/schema'
import type { Project } from './types'

/** 列出全部项目（按更新时间倒序）。 */
export function listProjects(): Project[] {
  return getDb().select().from(projects).orderBy(desc(projects.updatedAt)).all()
}
