import { z } from 'zod'
import { audioAllocationSchema } from '../schemas/ingest'
import { shotPlanSchema } from '../schemas/shot-plan'

export const assemblePromptInputSchema = z
  .object({
    shotPlan: shotPlanSchema,
    audioAllocation: audioAllocationSchema,
    renderedArtifactKeys: z.array(z.string().min(1)).min(1),
  })
  .strict()

export type AssemblePromptInput = z.infer<typeof assemblePromptInputSchema>

/** 构建 ASSEMBLE 阶段的编译与草稿合成提示词。 */
export function buildAssemblePrompt(input: AssemblePromptInput): string {
  const parsed = assemblePromptInputSchema.parse(input)
  return `你正在执行 CodeVideoCanvas 的 ASSEMBLE 阶段。

只编排已验证的镜头产物，不重新逐帧渲染镜头：
1. 按 shot plan 顺序拼接 rendered artifact。
2. 音频、字幕与镜头边界必须以 audio allocation 为唯一时间依据。
3. 默认使用硬切；只有合同明确要求时使用转场或 J/L cut。
4. 生成草稿成片与可追踪的合成清单；任一缺失产物必须结构化失败。

shot plan：
${JSON.stringify(parsed.shotPlan)}
audio allocation：
${JSON.stringify(parsed.audioAllocation)}
rendered artifact keys：
${JSON.stringify(parsed.renderedArtifactKeys)}

返回合成清单，不虚构不存在的本地路径。`
}
