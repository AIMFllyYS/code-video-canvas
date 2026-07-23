import 'server-only'
import { randomUUID } from 'node:crypto'
import { getDb } from '@/lib/db/client'
import { canvasEdges, canvasNodes, projects } from '@/lib/db/schema'
import { createProjectSchema } from './schemas'
import type { Project } from './types'

const GLOBAL_NODE_DEFINITIONS = [
  { type: 'script-import', stage: 'INGEST' },
  { type: 'shot-split', stage: 'DIRECT' },
  { type: 'score', stage: 'ASSEMBLE' },
  { type: 'export', stage: 'FINALIZE' },
] as const

/** 单事务创建项目与初始全局 DAG，避免出现无入口节点的半成品项目。 */
export function createProject(input: unknown): Project {
  const { title, script } = createProjectSchema.parse(input)
  return getDb().transaction((tx) => {
    const project = tx
      .insert(projects)
      .values({ id: randomUUID(), title, script })
      .returning()
      .get()
    const nodes = GLOBAL_NODE_DEFINITIONS.map((definition, index) => ({
      id: randomUUID(),
      projectId: project.id,
      ...definition,
      position: { x: index * 260, y: 80 },
      data:
        definition.type === 'script-import'
          ? { directorInput: { rawScript: script } }
          : {},
    }))
    tx.insert(canvasNodes).values(nodes).run()
    tx.insert(canvasEdges)
      .values([
        {
          id: randomUUID(),
          projectId: project.id,
          source: nodes[0]!.id,
          target: nodes[1]!.id,
        },
        {
          id: randomUUID(),
          projectId: project.id,
          source: nodes[2]!.id,
          target: nodes[3]!.id,
        },
      ])
      .run()
    return project
  })
}
