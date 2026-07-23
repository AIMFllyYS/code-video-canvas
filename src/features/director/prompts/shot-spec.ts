import { z } from 'zod'
import { audioAllocationSchema, scriptUnitsSchema } from '../schemas/ingest'
import { compositionModeSchema } from '../schemas/shot-plan'

export const shotSpecPromptInputSchema = z
  .object({
    scriptUnits: scriptUnitsSchema,
    audioAllocation: audioAllocationSchema,
    masterPlan: z.string().min(1),
    styleBible: z.string().min(1),
  })
  .strict()

export type ShotSpecPromptInput = z.infer<typeof shotSpecPromptInputSchema>

/** 构建 SHOT-SPEC 阶段的 canonical shot-plan 提示词。 */
export function buildShotSpecPrompt(input: ShotSpecPromptInput): string {
  const parsed = shotSpecPromptInputSchema.parse(input)
  return `你正在执行 CodeVideoCanvas 的 SHOT-SPEC 阶段。

只生成一份 canonical shot plan；每镜必须完整填写职责、音频绑定、视觉增幅、构图、hero anatomy、屏幕文字、运动阶段、关键帧、能力、素材、音效与 mustShow/mustAvoid。

可用构图模式仅限：${compositionModeSchema.options.join('、')}。

正向视觉法则 6：默认使用全画布；空间不足时优先横移、纵移、推进、缩放、分阶段揭示或深度场景。
正向视觉法则 7：Three.js、Shader、复杂文字与粒子只能表达关系，不能只做装饰。
正向视觉法则 8：组件复用用于建立视觉记忆；连续镜头必须改变状态、拓扑、视角或信息职责。
正向视觉法则 9：连续三镜同拓扑必须警告；只有连续状态机或明确 montage 可声明例外。

master plan：
${parsed.masterPlan}
style bible：
${parsed.styleBible}
script units：
${JSON.stringify(parsed.scriptUnits)}
audio allocation：
${JSON.stringify(parsed.audioAllocation)}

输出必须可由项目原生 shotPlanSchema 直接解析，不要添加额外键或 Markdown 围栏。`
}
