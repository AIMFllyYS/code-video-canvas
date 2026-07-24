import 'server-only'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { canvasEdges, canvasNodes, projects } from '@/lib/db/schema'
import { createProjectSchema, exportSettingsSchema, type ExportSettings } from './schemas'
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

/**
 * 更新项目导出设置（当前仅分辨率预设）。非法输入由 zod 抛错，不写库；
 * 项目不存在抛可读错误。返回已持久化的设置供调用方回显。
 */
export function updateExportSettings(projectId: string, input: unknown): ExportSettings {
  const exportSettings = exportSettingsSchema.parse(input)
  const updated = getDb()
    .update(projects)
    .set({ exportSettings, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id })
    .get()
  if (!updated) throw new Error(`项目不存在：${projectId}`)
  return exportSettings
}

/** 开启或关闭项目级自动推进；项目不存在时不静默创建状态。 */
export function setProjectAutopilot(projectId: string, enabled: boolean): boolean {
  const updated = getDb()
    .update(projects)
    .set({ autopilot: enabled, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning({ autopilot: projects.autopilot })
    .get()
  if (!updated) throw new Error(`项目不存在：${projectId}`)
  return updated.autopilot
}
