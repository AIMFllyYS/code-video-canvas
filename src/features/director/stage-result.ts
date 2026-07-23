import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { ShotLaneSeed } from '@/features/canvas/fan-out'
import { fabricatePromptInputSchema } from './prompts/fabricate'
import {
  ingestStageResultSchema,
} from './schemas/ingest'
import type { DirectorStageContext } from './runtime-repository'

const renderSpecSchema = z
  .object({
    fps: z.union([z.literal(24), z.literal(30), z.literal(60)]),
    durationInFrames: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    seed: z.number().int().nonnegative(),
  })
  .strict()

export type PreparedStageResult = {
  content: string
  ingestShots?: ShotLaneSeed[]
  renderSpec?: z.infer<typeof renderSpecSchema>
}

/** 将不可信模型文本归一化为可提交的阶段结果。 */
export function prepareStageResult(
  context: DirectorStageContext,
  rawContent: string
): PreparedStageResult {
  if (context.stage === 'INGEST') {
    const parsed = ingestStageResultSchema.parse(parseJsonObject(rawContent))
    return {
      content: JSON.stringify(parsed),
      ingestShots: parsed.scriptUnits.map((unit, index) => ({
        shotId: `S${String(index + 1).padStart(3, '0')}`,
        sourceUnit: unit,
      })),
    }
  }

  if (context.stage === 'FABRICATE') {
    const input = fabricatePromptInputSchema.parse(context.directorInput)
    const allocation = input.audioAllocation.shots.find(
      (shot) => shot.id === input.shot.id
    )
    if (!allocation) {
      throw new Error(`FABRICATE 缺少分镜 ${input.shot.id} 的音频分配`)
    }
    return {
      content: rawContent,
      renderSpec: renderSpecSchema.parse({
        fps: input.audioAllocation.fps,
        durationInFrames: allocation.durationInFrames,
        width: 1080,
        height: 1920,
        seed: stableSeed(context.projectId, context.nodeId, input.shot.id),
      }),
    }
  }

  return { content: rawContent }
}

function parseJsonObject(content: string): unknown {
  const trimmed = content.trim()
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('INGEST 输出不是 JSON 对象')
  return JSON.parse(unfenced.slice(start, end + 1)) as unknown
}

function stableSeed(...parts: string[]): number {
  return Number.parseInt(
    createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 8),
    16
  )
}
