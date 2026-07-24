import os from 'node:os'
import { NextResponse } from 'next/server'
import { describeStepfunConfig, saveStepfunModelSettings } from '@/features/ai/config'
import { stepfunSettingsSchema } from '@/features/ai/schemas'
import { getStoredApiKey, saveApiKey, validateKey } from '@/features/ai/stepfun-adapter'
import { DATA_DIR } from '@/lib/config/paths'

export const dynamic = 'force-dynamic'

export function GET() {
  const key = getStoredApiKey()
  return NextResponse.json({
    configured: Boolean(key),
    masked: key ? `${key.slice(0, 3)}***${key.slice(-2)}` : null,
    models: describeStepfunConfig(),
    // 渲染队列默认并发数 = CPU 核数（`in-process-queue.ts` 的 `start()` 默认值），当前不可配置。
    renderConcurrency: Math.max(1, os.cpus().length),
    // 二进制产物/数据库根目录（`DATA_DIR`，可用环境变量覆盖），当前设置页不可改。
    storageDir: DATA_DIR,
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
  const { apiKey, ...modelSettings } = parsed.data
  // Key 未提交时不校验也不改动已存 Key；只提交了才走校验门禁（校验失败不得覆盖）。
  if (apiKey !== undefined) {
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
  }
  saveStepfunModelSettings(modelSettings)
  return NextResponse.json({ ok: true, valid: true, models: describeStepfunConfig() })
}
