import { z } from 'zod'

export const createProjectSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(200),
  script: z.string().default(''),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>
