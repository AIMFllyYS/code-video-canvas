import { NextResponse } from 'next/server'
import { z } from 'zod'
import { exportProject } from '@/features/render/export-service'

export const dynamic = 'force-dynamic'

const requestSchema = z.object({ projectId: z.string().min(1) }).strict()

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: '请求体无效' }, { status: 400 })
  }
  try {
    const result = await exportProject(parsed.data.projectId)
    return NextResponse.json(result, { status: result.ok ? 200 : 409 })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : '终片导出失败',
      },
      { status: 409 }
    )
  }
}
