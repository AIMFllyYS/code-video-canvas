import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import OpenAI from 'openai'
import { z } from 'zod'
import { getDb } from '@/lib/db/client'
import { artifacts } from '@/lib/db/schema'
import { storage, type StorageAdapter } from '@/lib/storage'
import { readArtifact } from '@/features/artifacts'
import { getStepfunConfig, type StepfunConfig } from '@/features/ai/config'
import type { DirectorShot } from '@/features/director/schemas/director-shot-plan'
import { captureThumbnails } from './thumbnail'
import { QA_THUMBNAIL_FRACTIONS } from './qa-check'
import { RenderRepository } from './repository'
import type {
  ShotQaVisionData,
  ThumbnailResult,
  VisionQaReport,
  VisionRequirementResult,
} from './types'

const requirementSchema = z
  .object({
    requirement: z.string().trim().min(1),
    passed: z.boolean(),
    evidence: z.string().trim().min(1),
  })
  .strict()

const modelReportSchema = z
  .object({
    summary: z.string().trim().min(1),
    mustShow: z.array(requirementSchema),
    mustAvoid: z.array(requirementSchema),
    findings: z.array(z.string().trim().min(1)),
  })
  .strict()

const shotContractSchema = z
  .object({
    id: z.string().regex(/^S\d{3}$/),
    mustShow: z.array(z.string().trim().min(1)).default([]),
    mustAvoid: z.array(z.string().trim().min(1)).default([]),
  })
  .passthrough()

export interface VisionQaAnalysisInput {
  shotId: string
  mustShow: string[]
  mustAvoid: string[]
  images: Array<{ label: string; bytes: Buffer }>
}

interface VisionQaAnalysis {
  model: string
  report: z.infer<typeof modelReportSchema>
}

interface StoredVisionReport {
  id: string
  storageKey: string
  contentHash: string
}

export interface ShotVisionQaDependencies {
  repository: Pick<
    RenderRepository,
    'getShotQaTargets' | 'loadCompletedThumbnailContext' | 'writeShotQaVision'
  >
  capture: typeof captureThumbnails
  readArtifactBytes: (projectId: string, artifactId: string) => Promise<Buffer>
  analyze: (input: VisionQaAnalysisInput) => Promise<VisionQaAnalysis>
  storeReport: (input: {
    projectId: string
    nodeId: string
    report: VisionQaReport
  }) => Promise<StoredVisionReport>
  now: () => number
}

interface ShotVisionQaInput {
  projectId: string
  qaNodeId: string
  shot: DirectorShot
}

function defaultDependencies(): ShotVisionQaDependencies {
  return {
    repository: new RenderRepository(),
    capture: captureThumbnails,
    readArtifactBytes: async (projectId, artifactId) =>
      (await readArtifact(projectId, artifactId)).bytes,
    analyze: analyzeStepfunVision,
    storeReport: storeVisionQaReport,
    now: () => Date.now(),
  }
}

/** 复用确定性抽帧，以结构化 Vision 报告增强规则 QA（不替换规则层）。 */
export async function runShotVisionQa(
  input: ShotVisionQaInput,
  deps: Partial<ShotVisionQaDependencies> = {}
): Promise<ShotQaVisionData> {
  const dependencies = { ...defaultDependencies(), ...deps }
  const shot = shotContractSchema.parse(input.shot)
  const target = dependencies.repository
    .getShotQaTargets(input.projectId)
    .find((candidate) => candidate.qaNodeId === input.qaNodeId)
  if (!target) {
    throw new Error(`shot-qa 节点不具备 Vision QA 前置条件：${input.qaNodeId}`)
  }
  if (target.laneKey !== shot.id) {
    throw new Error(`Vision QA 分镜合同与节点 lane 不一致：${shot.id}`)
  }

  const context = dependencies.repository.loadCompletedThumbnailContext(
    input.projectId,
    target.codegenNodeId
  )
  const thumbnails = await dependencies.capture(
    context,
    QA_THUMBNAIL_FRACTIONS.map((fraction) => ({ fraction }))
  )
  const images = await Promise.all(
    thumbnails.map(async (thumbnail) => ({
      label: labelForFraction(thumbnail.fraction),
      bytes: await dependencies.readArtifactBytes(
        input.projectId,
        thumbnail.artifactId
      ),
    }))
  )
  const analysis = await dependencies.analyze({
    shotId: shot.id,
    mustShow: shot.mustShow,
    mustAvoid: shot.mustAvoid,
    images,
  })
  const normalized = normalizeReport(analysis.report, shot.mustShow, shot.mustAvoid)
  const report: VisionQaReport = {
    version: 1,
    shotId: shot.id,
    model: analysis.model,
    passed: [...normalized.mustShow, ...normalized.mustAvoid].every(
      (requirement) => requirement.passed
    ),
    ...normalized,
    thumbnailArtifactIds: thumbnails.map((thumbnail) => thumbnail.artifactId),
  }
  const stored = await dependencies.storeReport({
    projectId: input.projectId,
    nodeId: input.qaNodeId,
    report,
  })
  const qaVision: ShotQaVisionData = {
    passed: report.passed,
    checkedAt: dependencies.now(),
    thumbnailContentHash: aggregateThumbnailHash(thumbnails),
    model: report.model,
    summary: report.summary,
    reportArtifactId: stored.id,
    reportKey: stored.storageKey,
  }
  dependencies.repository.writeShotQaVision(input.qaNodeId, qaVision)
  return qaVision
}

export async function analyzeStepfunVision(
  input: VisionQaAnalysisInput,
  dependencies: {
    getConfig: () => StepfunConfig
    complete: (
      config: StepfunConfig,
      messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    ) => Promise<string | null>
  } = {
    getConfig: getStepfunConfig,
    complete: async (config, messages) => {
      const client = new OpenAI({ apiKey: config.apiKey ?? '', baseURL: config.baseUrl })
      const completion = await client.chat.completions.create({
        model: config.visionModel,
        messages,
      })
      return completion.choices[0]?.message.content ?? null
    },
  }
): Promise<VisionQaAnalysis> {
  const config = dependencies.getConfig()
  if (!config.apiKey) throw new Error('StepFun API Key 未配置，无法执行 Vision QA')
  const content = await dependencies.complete(config, [
      {
        role: 'system',
        content:
          '你是严格的视频分镜验收器。只返回 JSON，不要 Markdown。每个合同项必须逐条且恰好出现一次。',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: visionPrompt(input),
          },
          ...input.images.map(
            (image): OpenAI.Chat.Completions.ChatCompletionContentPartImage => ({
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${image.bytes.toString('base64')}`,
                detail: 'high',
              },
            })
          ),
        ],
      },
    ])
  if (!content) throw new Error('Vision 模型未返回报告')
  return {
    model: config.visionModel,
    report: modelReportSchema.parse(parseJsonResponse(content)),
  }
}

interface StoreVisionDependencies {
  storage: StorageAdapter
  insert: (record: {
    id: string
    projectId: string
    nodeId: string
    path: string
    contentHash: string
  }) => Promise<void>
  createId: () => string
}

export async function storeVisionQaReport(
  input: { projectId: string; nodeId: string; report: VisionQaReport },
  deps: StoreVisionDependencies = {
    storage,
    createId: randomUUID,
    insert: async (record) => {
      getDb()
        .insert(artifacts)
        .values({ ...record, kind: 'qa-vision-report' })
        .run()
    },
  }
): Promise<StoredVisionReport> {
  const content = JSON.stringify(input.report)
  const contentHash = createHash('sha256').update(content).digest('hex')
  const storageKey = `qa/${input.projectId}/${input.nodeId}/vision-${contentHash}.json`
  const id = deps.createId()
  await deps.storage.put(storageKey, content)
  try {
    await deps.insert({
      id,
      projectId: input.projectId,
      nodeId: input.nodeId,
      path: storageKey,
      contentHash,
    })
  } catch (error) {
    await deps.storage.delete(storageKey)
    throw error
  }
  return { id, storageKey, contentHash }
}

function normalizeReport(
  report: unknown,
  mustShow: string[],
  mustAvoid: string[]
): z.infer<typeof modelReportSchema> {
  const parsed = modelReportSchema.parse(report)
  assertCoverage('mustShow', parsed.mustShow, mustShow)
  assertCoverage('mustAvoid', parsed.mustAvoid, mustAvoid)
  return parsed
}

function assertCoverage(
  label: string,
  results: VisionRequirementResult[],
  expected: string[]
): void {
  const actual = results.map((item) => item.requirement)
  if (
    actual.length !== expected.length ||
    expected.some((requirement) => actual.filter((item) => item === requirement).length !== 1)
  ) {
    throw new Error(`${label} 合同覆盖不完整`)
  }
}

function visionPrompt(input: VisionQaAnalysisInput): string {
  return `验收分镜 ${input.shotId} 的三张关键帧（顺序标签：${input.images
    .map((image) => image.label)
    .join('、')}）。
mustShow：${JSON.stringify(input.mustShow)}
mustAvoid：${JSON.stringify(input.mustAvoid)}
返回：
{"summary":"...","mustShow":[{"requirement":"原合同项","passed":true,"evidence":"可定位证据"}],"mustAvoid":[{"requirement":"原合同项","passed":true,"evidence":"可定位证据"}],"findings":[]}
mustAvoid 的 passed=true 表示成功避开该元素。不得遗漏、合并或改写合同项。`
}

function parseJsonResponse(content: string): unknown {
  const trimmed = content.trim()
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return JSON.parse(withoutFence) as unknown
  } catch (error) {
    throw new Error('Vision 模型返回的不是合法 JSON', { cause: error })
  }
}

function aggregateThumbnailHash(thumbnails: ThumbnailResult[]): string {
  return createHash('sha256')
    .update(thumbnails.map((thumbnail) => thumbnail.contentHash).join('\0'))
    .digest('hex')
}

function labelForFraction(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}
