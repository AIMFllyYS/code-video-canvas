import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/lib/db/migrate'
import { artifacts, canvasNodes, projects } from '@/lib/db/schema'
import type { StorageAdapter } from '@/lib/storage'
import { buildDemoAudioAllocation, buildDemoAudioManifest } from './audio-demo'
import type { PreparedStageResult } from './stage-result'
import {
  audioAllocationSchema,
  audioManifestSchema,
  ingestStageResultSchema,
  type AudioAllocation,
  type AudioManifest,
} from './schemas/ingest'
import { directorShotPlanSchema, type DirectorShotPlan } from './schemas/director-shot-plan'
import type { PipelineStage } from './types'

const storageKeySchema = z
  .string()
  .min(1)
  .regex(/^(?![A-Za-z]:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\).+$/, {
    message: 'artifact storageKey 必须是安全相对路径',
  })

const directArtifactSchema = z
  .object({
    masterPlan: z.string().min(1),
    styleBible: z.string().min(1),
  })
  .strict()

export interface DirectorStageContext {
  projectId: string
  nodeId: string
  stage: PipelineStage
  status: 'pending'
  projectTitle: string
  projectScript: string
  directorInput: unknown
  resumeSessionKey?: string
}

export interface ArtifactPointerInput {
  projectId: string
  nodeId: string
  kind: string
  storageKey: string
  contentHash?: string
}

/** Director 持久化端口；封装执行上下文、artifact 指针与错误记录。 */
export class DirectorRuntimeRepository {
  constructor(
    private readonly db: Db,
    private readonly storage: StorageAdapter
  ) {}

  assertEnqueueable(
    projectId: string,
    nodeId: string,
    stage: PipelineStage
  ): void {
    const node = this.db
      .select({
        projectId: canvasNodes.projectId,
        stage: canvasNodes.stage,
        status: canvasNodes.status,
      })
      .from(canvasNodes)
      .where(and(eq(canvasNodes.id, nodeId), eq(canvasNodes.projectId, projectId)))
      .get()
    if (!node) throw new Error(`Director 节点不存在或不属于项目：${nodeId}`)
    if (node.stage !== stage) {
      throw new Error(`Director 节点阶段不匹配：${node.stage ?? 'null'} != ${stage}`)
    }
    if (!['idle', 'failed', 'stale'].includes(node.status)) {
      throw new Error(`Director 节点当前不可入队：${node.status}`)
    }
  }

  async loadStageContext(
    projectId: string,
    nodeId: string,
    stage: PipelineStage
  ): Promise<DirectorStageContext> {
    const row = this.db
      .select({
        projectTitle: projects.title,
        projectScript: projects.script,
        nodeProjectId: canvasNodes.projectId,
        nodeStage: canvasNodes.stage,
        status: canvasNodes.status,
        data: canvasNodes.data,
        nodeType: canvasNodes.type,
        laneKey: canvasNodes.laneKey,
      })
      .from(canvasNodes)
      .innerJoin(projects, eq(projects.id, canvasNodes.projectId))
      .where(and(eq(canvasNodes.id, nodeId), eq(projects.id, projectId)))
      .get()
    if (!row) throw new Error(`Director 节点不存在或不属于项目：${nodeId}`)
    if (row.nodeProjectId !== projectId) {
      throw new Error(`Director 节点不属于项目：${nodeId}`)
    }
    if (row.nodeStage !== stage) {
      throw new Error(`Director 节点阶段不匹配：${row.nodeStage ?? 'null'} != ${stage}`)
    }
    if (
      row.status !== 'pending' &&
      !(row.status === 'running' && stage === 'FABRICATE')
    ) {
      throw new Error(`Director 节点必须为 pending 或 FABRICATE 运行中，当前为：${row.status}`)
    }
    const resumeSessionKey = readResumeSessionKey(row.data)
    const directorInput = await this.resolveDirectorInput(row, stage)
    return {
      projectId,
      nodeId,
      stage,
      status: 'pending',
      projectTitle: row.projectTitle,
      projectScript: row.projectScript,
      directorInput,
      resumeSessionKey,
    }
  }

  registerArtifactPointer(input: ArtifactPointerInput): string {
    const storageKey = storageKeySchema.parse(input.storageKey)
    const id = randomUUID()
    this.db
      .insert(artifacts)
      .values({
        id,
        projectId: input.projectId,
        nodeId: input.nodeId,
        kind: input.kind,
        path: storageKey,
        contentHash: input.contentHash,
      })
      .run()
    return id
  }

  recordStageError(nodeId: string, stage: PipelineStage, error: unknown): void {
    const node = this.db
      .select({ data: canvasNodes.data })
      .from(canvasNodes)
      .where(eq(canvasNodes.id, nodeId))
      .get()
    if (!node) throw new Error(`节点不存在：${nodeId}`)
    const message = error instanceof Error ? error.message : String(error)
    this.db
      .update(canvasNodes)
      .set({ data: { ...node.data, directorError: { stage, message } } })
      .where(eq(canvasNodes.id, nodeId))
      .run()
  }

  recordStageOutput(
    nodeId: string,
    result: PreparedStageResult,
    artifactId: string
  ): void {
    const node = this.db
      .select({ data: canvasNodes.data })
      .from(canvasNodes)
      .where(eq(canvasNodes.id, nodeId))
      .get()
    if (!node) throw new Error(`节点不存在：${nodeId}`)
    this.db
      .update(canvasNodes)
      .set({
        data: {
          ...node.data,
          directorArtifactId: artifactId,
          ...(result.renderSpec ? { renderSpec: result.renderSpec } : {}),
        },
      })
      .where(eq(canvasNodes.id, nodeId))
      .run()
  }

  private async resolveDirectorInput(
    row: {
      projectTitle: string
      projectScript: string
      nodeProjectId: string
      nodeStage: string | null
      status: string
      data: Record<string, unknown>
      nodeType: string | null
      laneKey: string | null
    },
    stage: PipelineStage
  ): Promise<unknown> {
    if (stage === 'INGEST') {
      return row.data.directorInput ?? { rawScript: row.projectScript }
    }
    if (stage === 'DIRECT') {
      const ingest = await this.loadIngestArtifact(row.nodeProjectId)
      return {
        projectTitle: row.projectTitle,
        scriptUnits: ingest.scriptUnits,
        audioManifest: ingest.audioManifest,
        audioAllocation: ingest.audioAllocation,
      }
    }
    if (stage === 'SHOT_SPEC') {
      const ingest = await this.loadIngestArtifact(row.nodeProjectId)
      const direct = await this.loadDirectArtifact(row.nodeProjectId)
      return {
        scriptUnits: ingest.scriptUnits,
        audioAllocation: ingest.audioAllocation,
        masterPlan: direct.masterPlan,
        styleBible: direct.styleBible,
      }
    }
    if (stage === 'FABRICATE') {
      if (!row.laneKey) throw new Error('FABRICATE 节点缺少 laneKey')
      const ingest = await this.loadIngestArtifact(row.nodeProjectId)
      const direct = await this.loadDirectArtifact(row.nodeProjectId)
      const shotPlan = await this.loadShotSpecArtifact(row.nodeProjectId, row.laneKey)
      const shot = shotPlan.shots.find((item) => item.id === row.laneKey)
      if (!shot) {
        throw new Error(`shot plan 中找不到 ${row.laneKey}`)
      }
      return {
        shot,
        audioAllocation: ingest.audioAllocation,
        styleBible: direct.styleBible,
      }
    }
    return row.data.directorInput
  }

  private async loadIngestArtifact(projectId: string): Promise<{
    scriptUnits: unknown
    audioManifest: AudioManifest
    audioAllocation: AudioAllocation
  }> {
    const nodeId = this.findNodeId(projectId, 'script-import')
    const raw = await this.loadArtifactJson(projectId, nodeId, 'director-ingest')
    const parsed = z
      .object({
        scriptUnits: z.unknown(),
        audioManifest: z.unknown().optional(),
        audioAllocation: z.unknown().optional(),
      })
      .parse(raw)
    const scriptUnits = ingestStageResultSchema.parse({ scriptUnits: parsed.scriptUnits }).scriptUnits
    if (parsed.audioManifest && parsed.audioAllocation) {
      return {
        scriptUnits,
        audioManifest: audioManifestSchema.parse(parsed.audioManifest),
        audioAllocation: audioAllocationSchema.parse(parsed.audioAllocation),
      }
    }
    const audioManifest = buildDemoAudioManifest(scriptUnits)
    const audioAllocation = buildDemoAudioAllocation(scriptUnits, audioManifest)
    return { scriptUnits, audioManifest, audioAllocation }
  }

  private async loadDirectArtifact(
    projectId: string
  ): Promise<{ masterPlan: string; styleBible: string }> {
    const nodeId = this.findNodeId(projectId, 'shot-split')
    const raw = await this.loadArtifactJson(projectId, nodeId, 'director-direct')
    return directArtifactSchema.parse(raw)
  }

  private async loadShotSpecArtifact(projectId: string, laneKey: string): Promise<DirectorShotPlan> {
    const nodeId = this.findNodeId(projectId, 'shot-script', laneKey)
    const raw = await this.loadArtifactJson(projectId, nodeId, 'director-shot-spec')
    return directorShotPlanSchema.parse(raw)
  }

  private findNodeId(
    projectId: string,
    type: string,
    laneKey?: string
  ): string {
    const conditions = [
      eq(canvasNodes.projectId, projectId),
      eq(canvasNodes.type, type),
    ]
    if (laneKey) conditions.push(eq(canvasNodes.laneKey, laneKey))
    const node = this.db
      .select({ id: canvasNodes.id })
      .from(canvasNodes)
      .where(and(...conditions))
      .get()
    if (!node) throw new Error(`找不到 ${type}${laneKey ? `(${laneKey})` : ''} 节点`)
    return node.id
  }

  private async loadArtifactJson(
    projectId: string,
    nodeId: string,
    kind: string
  ): Promise<unknown> {
    const artifact = this.db
      .select({ path: artifacts.path })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.projectId, projectId),
          eq(artifacts.nodeId, nodeId),
          eq(artifacts.kind, kind)
        )
      )
      .orderBy(desc(artifacts.createdAt), desc(artifacts.id))
      .get()
    if (!artifact) throw new Error(`找不到 ${kind} 产物：${nodeId}`)
    const buffer = await this.storage.get(artifact.path)
    const text = buffer.toString('utf-8')
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new Error(`${kind} 产物不是合法 JSON：${artifact.path}`)
    }
  }
}

function readResumeSessionKey(data: Record<string, unknown>): string | undefined {
  if (data.directorSessionKey === undefined) return undefined
  return storageKeySchema.parse(data.directorSessionKey)
}
