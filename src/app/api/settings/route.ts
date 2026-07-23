import { NextResponse } from 'next/server'
import { stepfunSettingsSchema } from '@/features/ai/schemas'
import { getStoredApiKey, saveApiKey, validateKey } from '@/features/ai/stepfun-adapter'

export const dynamic = 'force-dynamic'

export function GET() {
  const key = getStoredApiKey()
  return NextResponse.json({
    configured: Boolean(key),
    masked: key ? `${key.slice(0, 3)}***${key.slice(-2)}` : null,
  })
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const parsed = stepfunSettingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? '输入无效' },
      { status: 400 },
    )
  }
  const { apiKey } = parsed.data
  const valid = await validateKey(apiKey)
  if (!valid) {
    return NextResponse.json(
      {
        ok: false,
        valid: false,
        error: 'StepFun Key 校验失败 · 请检查 Key 是否正确',
      },
      { status: 422 }
    )
  }
  saveApiKey(apiKey)
  return NextResponse.json({ ok: true, valid: true })
}
