import { z } from 'zod'

/**
 * StepFun 设置输入：Key 可选（未提交则不改动已存 Key）；4 类模型 + 端点
 * 均可选，允许显式提交空串以清空该项（回退 env/默认）。
 */
export const stepfunSettingsSchema = z.object({
  apiKey: z.string().min(1, 'API Key 不能为空').optional(),
  baseUrl: z.string().optional(),
  chatModel: z.string().optional(),
  ttsModel: z.string().optional(),
  asrModel: z.string().optional(),
  visionModel: z.string().optional(),
})

export type StepfunSettings = z.infer<typeof stepfunSettingsSchema>
