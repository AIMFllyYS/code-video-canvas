import { z } from 'zod'
import { shotPlanSchema } from '../schemas/shot-plan'

export const finalizePromptInputSchema = z
  .object({
    shotPlan: shotPlanSchema,
    draftArtifactKey: z.string().min(1),
    qaFindings: z.array(z.string().min(1)),
  })
  .strict()

export type FinalizePromptInput = z.infer<typeof finalizePromptInputSchema>

/** 构建 FINALIZE 阶段的最终 QA 与交付提示词。 */
export function buildFinalizePrompt(input: FinalizePromptInput): string {
  const parsed = finalizePromptInputSchema.parse(input)
  return `你正在执行 CodeVideoCanvas 的 FINALIZE 阶段。

最终门禁：
- 检查真实 Main 成片，不以单镜预览替代。
- 核对音画同步、字幕、镜头边界、均匀抽帧、区块入口/出口与稳定尾帧。
- TypeScript、UTF-8、素材许可、确定性、时间线或必需元素失败均为硬 BLOCK。
- 修复后只复验受影响证据，最终输出必须通过 ffprobe 并登记本地产物。
- 不对视觉主观偏好作无依据改写；只处理可定位的功能性或合同性问题。

shot plan：
${JSON.stringify(parsed.shotPlan)}
draft artifact key：${parsed.draftArtifactKey}
已知 QA findings：
${JSON.stringify(parsed.qaFindings)}

返回结构化的通过/阻塞结论、证据与需要重做的 shot IDs。`
}
