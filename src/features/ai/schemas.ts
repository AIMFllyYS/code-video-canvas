import { z } from 'zod'

/** StepFun 设置输入（保存 Key）。 */
export const stepfunSettingsSchema = z.object({
  apiKey: z.string().min(1, 'API Key 不能为空'),
})

export type StepfunSettings = z.infer<typeof stepfunSettingsSchema>
