import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
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
  type ScriptUnit,
  type ShotAllocation,
} from './schemas/ingest'
import {
  directorShotPlanSchema,
  type DirectorShot,
  type DirectorShotPlan,
} from './schemas/director-shot-plan'
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
  nodeType: string | null
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

/** `loadStageContext` 查出的行形状，供 `resolveDirectorInput` 及其 stage 帮手复用。 */
interface StageContextRow {
  projectTitle: string
  projectScript: string
  nodeProjectId: string
  nodeStage: string | null
  status: string
  data: Record<string, unknown>
  nodeType: string | null
  laneKey: string | null
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
      nodeType: row.nodeType,
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

  /**
   * 持久化一轮流式输出为可回看日志：内容经 StorageAdapter 落盘，artifacts
   * 表登记指针（kind='director-stream-log'，与 pi-session 同为非产物字节，
   * 由 getNodeArtifacts 从 Inspector 产物 chips 中排除）。空文本直接跳过。
   */
  async persistStreamLog(
    projectId: string,
    nodeId: string,
    stage: PipelineStage,
    text: string
  ): Promise<void> {
    if (!text) return
    const slug = stage.toLowerCase().replaceAll('_', '-')
    const key = `director-stream/${projectId}/${nodeId}/${slug}.log`
    await this.storage.put(key, text)
    this.registerArtifactPointer({
      projectId,
      nodeId,
      kind: 'director-stream-log',
      storageKey: key,
    })
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
    row: StageContextRow,
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
    if (stage === 'ASSEMBLE') {
      return this.resolveAssembleInput(row)
    }
    if (stage === 'FINALIZE') {
      return this.resolveFinalizeInput(row)
    }
    throw new Error(`未处理的 Director stage：${stage}`)
  }

  private async resolveAssembleInput(row: StageContextRow): Promise<unknown> {
    const direct = await this.loadDirectArtifact(row.nodeProjectId)
    if (row.nodeType === 'score') {
      const ingest = await this.loadIngestArtifact(row.nodeProjectId)
      const shotPlan = await this.loadAllShotSpecs(row.nodeProjectId)
      const rendered = this.loadAllRenderedArtifactKeys(row.nodeProjectId)
      return {
        styleBible: direct.styleBible,
        shotPlan,
        audioAllocation: ingest.audioAllocation,
        renderedArtifactKeys: rendered.map((item) => item.storageKey),
      }
    }
    if (row.nodeType === 'shot-sfx' || row.nodeType === 'shot-subtitle') {
      if (!row.laneKey) throw new Error(`${row.nodeType} 节点缺少 laneKey`)
      const ingest = await this.loadIngestArtifact(row.nodeProjectId)
      const shot = await this.loadShot(row.nodeProjectId, row.laneKey)
      const shotAllocation = this.requireShotAllocation(
        ingest.audioAllocation,
        row.laneKey
      )
      if (row.nodeType === 'shot-sfx') {
        return {
          shot,
          shotAllocation,
          renderedArtifactKey: this.loadRenderedArtifactKey(
            row.nodeProjectId,
            row.laneKey
          ),
          styleBible: direct.styleBible,
        }
      }
      const scriptUnit = ingest.scriptUnits.find(
        (unit) => unit.unitId === shotAllocation.audioUnitId
      )
      if (!scriptUnit) {
        throw new Error(`script units 中找不到 ${shotAllocation.audioUnitId}`)
      }
      return { shot, scriptUnit, shotAllocation }
    }
    throw new Error(`未知 ASSEMBLE 节点类型：${row.nodeType ?? 'null'}`)
  }

  private async resolveFinalizeInput(row: StageContextRow): Promise<unknown> {
    if (row.nodeType === 'export') {
      const shotPlan = await this.loadAllShotSpecs(row.nodeProjectId)
      const draftArtifactKey = this.loadFinalExportArtifact(row.nodeProjectId)
      const qaFindings = await this.loadShotQaFindings(row.nodeProjectId)
      return { shotPlan, draftArtifactKey, qaFindings }
    }
    if (row.nodeType === 'shot-qa') {
      if (!row.laneKey) throw new Error('shot-qa 节点缺少 laneKey')
      const ingest = await this.loadIngestArtifact(row.nodeProjectId)
      const shot = await this.loadShot(row.nodeProjectId, row.laneKey)
      const shotAllocation = this.requireShotAllocation(
        ingest.audioAllocation,
        row.laneKey
      )
      return {
        shot,
        renderedArtifactKey: this.loadRenderedArtifactKey(
          row.nodeProjectId,
          row.laneKey
        ),
        shotAllocation,
      }
    }
    throw new Error(`未知 FINALIZE 节点类型：${row.nodeType ?? 'null'}`)
  }

  private async loadShot(projectId: string, laneKey: string): Promise<DirectorShot> {
    const shotPlan = await this.loadShotSpecArtifact(projectId, laneKey)
    const shot = shotPlan.shots.find((item) => item.id === laneKey)
    if (!shot) throw new Error(`shot plan 中找不到 ${laneKey}`)
    return shot
  }

  private requireShotAllocation(
    audioAllocation: AudioAllocation,
    laneKey: string
  ): ShotAllocation {
    const allocation = audioAllocation.shots.find((item) => item.id === laneKey)
    if (!allocation) throw new Error(`audio allocation 中找不到 ${laneKey}`)
    return allocation
  }

  private async loadIngestArtifact(projectId: string): Promise<{
    scriptUnits: ScriptUnit[]
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

  private async loadAllShotSpecs(projectId: string): Promise<DirectorShotPlan> {
    const nodes = this.findNodeIds(projectId, 'shot-script')
    if (nodes.length === 0) throw new Error('项目缺少 shot-script 节点')
    const ordered = [...nodes].sort((left, right) =>
      (left.laneKey ?? '').localeCompare(right.laneKey ?? '')
    )
    const shots: DirectorShot[] = []
    for (const node of ordered) {
      if (!node.laneKey) continue
      const raw = await this.loadArtifactJson(projectId, node.id, 'director-shot-spec')
      const plan = directorShotPlanSchema.parse(raw)
      const shot = plan.shots.find((item) => item.id === node.laneKey)
      if (!shot) throw new Error(`shot plan 中找不到 ${node.laneKey}`)
      shots.push(shot)
    }
    if (shots.length === 0) throw new Error('项目缺少可聚合的分镜合同')
    return { schemaVersion: 1, shots }
  }

  private loadRenderedArtifactKey(projectId: string, laneKey: string): string {
    const nodeId = this.findNodeId(projectId, 'shot-codegen', laneKey)
    const path = this.resolveLatestArtifactPath(projectId, nodeId, 'render-mp4')
    if (!path) throw new Error(`找不到 render-mp4 产物：${laneKey}`)
    return path
  }

  private loadAllRenderedArtifactKeys(
    projectId: string
  ): Array<{ laneKey: string; storageKey: string }> {
    const nodes = this.db
      .select({ id: canvasNodes.id, laneKey: canvasNodes.laneKey })
      .from(canvasNodes)
      .where(
        and(
          eq(canvasNodes.projectId, projectId),
          eq(canvasNodes.type, 'shot-codegen'),
          isNotNull(canvasNodes.laneKey)
        )
      )
      .all()
    if (nodes.length === 0) throw new Error('项目缺少 shot-codegen 分镜渲染节点')
    const renderArtifacts = this.db
      .select({ nodeId: artifacts.nodeId, path: artifacts.path })
      .from(artifacts)
      .where(and(eq(artifacts.projectId, projectId), eq(artifacts.kind, 'render-mp4')))
      .orderBy(desc(artifacts.createdAt), desc(artifacts.id))
      .all()
    const latestByNode = new Map<string, string>()
    for (const artifact of renderArtifacts) {
      if (artifact.nodeId && !latestByNode.has(artifact.nodeId)) {
        latestByNode.set(artifact.nodeId, artifact.path)
      }
    }
    return nodes
      .flatMap((node) => {
        if (!node.laneKey) return []
        const storageKey = latestByNode.get(node.id)
        if (!storageKey) throw new Error(`找不到 render-mp4 产物：${node.laneKey}`)
        return [{ laneKey: node.laneKey, storageKey }]
      })
      .sort((left, right) => left.laneKey.localeCompare(right.laneKey))
  }

  private loadFinalExportArtifact(projectId: string): string {
    const artifact = this.db
      .select({ path: artifacts.path })
      .from(artifacts)
      .where(and(eq(artifacts.projectId, projectId), eq(artifacts.kind, 'final-mp4')))
      .orderBy(desc(artifacts.createdAt), desc(artifacts.id))
      .get()
    if (!artifact) throw new Error('请先完成合成导出：项目尚无 final-mp4 产物')
    return artifact.path
  }

  private async loadShotQaFindings(projectId: string): Promise<string[]> {
    const nodes = this.findNodeIds(projectId, 'shot-qa')
    const ordered = [...nodes].sort((left, right) =>
      (left.laneKey ?? '').localeCompare(right.laneKey ?? '')
    )
    const findings: string[] = []
    for (const node of ordered) {
      const path = this.resolveLatestArtifactPath(projectId, node.id, 'director-finalize')
      if (!path) continue
      const buffer = await this.storage.get(path)
      findings.push(buffer.toString('utf-8'))
    }
    return findings
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

  private findNodeIds(
    projectId: string,
    type: string
  ): Array<{ id: string; laneKey: string | null }> {
    return this.db
      .select({ id: canvasNodes.id, laneKey: canvasNodes.laneKey })
      .from(canvasNodes)
      .where(and(eq(canvasNodes.projectId, projectId), eq(canvasNodes.type, type)))
      .all()
  }

  private resolveLatestArtifactPath(
    projectId: string,
    nodeId: string,
    kind: string
  ): string | undefined {
    return this.db
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
      .get()?.path
  }

  private async loadArtifactJson(
    projectId: string,
    nodeId: string,
    kind: string
  ): Promise<unknown> {
    const path = this.resolveLatestArtifactPath(projectId, nodeId, kind)
    if (!path) throw new Error(`找不到 ${kind} 产物：${nodeId}`)
    const buffer = await this.storage.get(path)
    const text = buffer.toString('utf-8')
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new Error(`${kind} 产物不是合法 JSON：${path}`)
    }
  }
}

function readResumeSessionKey(data: Record<string, unknown>): string | undefined {
  if (data.directorSessionKey === undefined) return undefined
  return storageKeySchema.parse(data.directorSessionKey)
}
