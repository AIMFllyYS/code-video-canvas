import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
// type-only：编译期擦除，不产生 lib/db → features/canvas 的运行时依赖（避免循环）。
import type { ExportSettings } from '@/features/canvas/export-settings'

const now = sql`(unixepoch() * 1000)`

/** 项目：一份文字稿对应一个画布工程。 */
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  script: text('script').notNull().default(''),
  // 可空：null = 从未设置，应用层读到 null 时回退 DEFAULT_EXPORT_SETTINGS。
  exportSettings: text('export_settings', { mode: 'json' }).$type<ExportSettings>(),
  /** 项目级自动推进开关；关闭时保持原有手动逐节点行为。 */
  autopilot: integer('autopilot', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now),
})

/** 画布节点（video-director DAG 的可视化投影）。 */
export const canvasNodes = sqliteTable('canvas_nodes', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  stage: text('stage'),
  position: text('position', { mode: 'json' }).$type<{ x: number; y: number }>().notNull(),
  data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  status: text('status', {
    enum: ['idle', 'pending', 'running', 'success', 'failed', 'stale'],
  })
    .notNull()
    .default('idle'),
  contentHash: text('content_hash'),
  laneKey: text('lane_key'),
  laneRole: text('lane_role'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
})

/** 画布连线。 */
export const canvasEdges = sqliteTable('canvas_edges', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  source: text('source').notNull(),
  target: text('target').notNull(),
})

/** 作业（渲染等），进程内队列的持久化后端。 */
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  nodeId: text('node_id'),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('pending'),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now),
})

/** 产物索引（mp4 / 帧 / 音频 / html），二进制本体经 StorageAdapter 存本地 FS。 */
export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  nodeId: text('node_id'),
  kind: text('kind').notNull(),
  path: text('path').notNull(),
  contentHash: text('content_hash'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().default(now),
})

/** 键值设置（含 StepFun Key 等；仅服务端读写）。 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().default(now),
})
