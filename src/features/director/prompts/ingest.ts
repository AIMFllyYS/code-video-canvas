import { z } from 'zod'
import {
  audioManifestSchema,
  scriptUnitsSchema,
} from '../schemas/ingest'

export const ingestPromptInputSchema = z
  .object({
    rawScript: z.string().min(1),
    existingUnits: scriptUnitsSchema.optional(),
    existingAudioManifest: audioManifestSchema.optional(),
  })
  .strict()

export type IngestPromptInput = z.infer<typeof ingestPromptInputSchema>

/** 构建 INGEST 阶段的项目原生提示词。 */
export function buildIngestPrompt(input: IngestPromptInput): string {
  const parsed = ingestPromptInputSchema.parse(input)
  return `你正在执行 CodeVideoCanvas 的 INGEST 阶段。

目标：
1. 保持原文事实、限定语、疑问与顺序，不补写外部事实。
2. 把原稿拆成连续 script units，unitId 使用 U001 起的三位序号。
3. 声音是唯一时间地基；基于实测音频生成 audio manifest 和 allocation。
4. allocation 的帧数只能由音频时长与 fps 量化，禁止凭感觉填写。
5. 输出必须分别符合项目原生 scriptUnitsSchema、audioManifestSchema、audioAllocationSchema。

原始稿件：
${parsed.rawScript}

已有 script units（可能为空）：
${JSON.stringify(parsed.existingUnits ?? null)}

已有 audio manifest（可能为空）：
${JSON.stringify(parsed.existingAudioManifest ?? null)}

只返回阶段要求的结构化工件，不返回 Markdown 说明。`
}
