import 'server-only'
import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db/client'
import { projects } from '@/lib/db/schema'
import { createProjectSchema } from './schemas'
import type { Project } from './types'

/** 创建项目（DB 写路径证明）。 */
export function createProject(input: unknown): Project {
  const { title, script } = createProjectSchema.parse(input)
  const id = randomUUID()
  return getDb().insert(projects).values({ id, title, script }).returning().get()
}
