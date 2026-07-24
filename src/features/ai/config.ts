import 'server-only'
import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { settings } from '@/lib/db/schema'

/** StepFun 统一配置的 6 个字段（Key + 端点 + 4 类模型）。 */
export type StepfunConfigKey =
  | 'apiKey'
  | 'baseUrl'
  | 'chatModel'
  | 'ttsModel'
  | 'asrModel'
  | 'visionModel'

/** 可展示"生效值 + 来源"的字段（不含 Key，Key 只回掩码）。 */
export type StepfunModelField = Exclude<StepfunConfigKey, 'apiKey'>

export type StepfunConfigSource = 'settings' | 'env' | 'default'

export interface StepfunConfigFieldView {
  value: string
  source: StepfunConfigSource
}

export type StepfunConfigView = Record<StepfunModelField, StepfunConfigFieldView>

export interface StepfunConfig {
  /** settings 表 > STEPFUN_API_KEY；均未配置为 null。 */
  apiKey: string | null
  baseUrl: string
  chatModel: string
  ttsModel: string
  asrModel: string
  visionModel: string
}

/** settings 表键名（唯一事实源，供 stepfun-adapter.ts 等内部复用）。 */
export const STEPFUN_SETTINGS_KEYS: Record<StepfunConfigKey, string> = {
  apiKey: 'stepfun_api_key',
  baseUrl: 'stepfun_base_url',
  chatModel: 'stepfun_chat_model',
  ttsModel: 'stepfun_tts_model',
  asrModel: 'stepfun_asr_model',
  visionModel: 'stepfun_vision_model',
}

const ENV_KEYS: Record<StepfunModelField, string> = {
  baseUrl: 'STEPFUN_BASE_URL',
  chatModel: 'STEPFUN_CHAT_MODEL',
  ttsModel: 'STEPFUN_TTS_MODEL',
  asrModel: 'STEPFUN_ASR_MODEL',
  visionModel: 'STEPFUN_VISION_MODEL',
}

/** 内置默认值：唯一定义处，与 `.env.example` 保持一致。 */
const DEFAULTS: Record<StepfunModelField, string> = {
  baseUrl: 'https://api.stepfun.com/v1',
  chatModel: 'step-3.5-flash',
  ttsModel: 'stepaudio-2.5-tts',
  asrModel: 'stepaudio-2.5-asr',
  visionModel: 'step-3.7-flash',
}

const MODEL_FIELDS: readonly StepfunModelField[] = [
  'baseUrl',
  'chatModel',
  'ttsModel',
  'asrModel',
  'visionModel',
]

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/** 读取 settings 表中某键的值；空串/不存在均视为未设置（null）。 */
export function getSettingValue(key: string): string | null {
  const row = getDb().select().from(settings).where(eq(settings.key, key)).get()
  return nonEmpty(row?.value)
}

/** 写入 settings 表；空值/未定义等同删除该行（回退 env/默认）。 */
export function setSettingValue(key: string, value: string | null | undefined): void {
  const trimmed = nonEmpty(value)
  const db = getDb()
  if (!trimmed) {
    db.delete(settings).where(eq(settings.key, key)).run()
    return
  }
  db.insert(settings)
    .values({ key, value: trimmed })
    .onConflictDoUpdate({ target: settings.key, set: { value: trimmed } })
    .run()
}

/** 单个模型/端点字段的三层解析：settings 表 > env > 内置默认。 */
function resolveField(field: StepfunModelField): StepfunConfigFieldView {
  const settingsValue = getSettingValue(STEPFUN_SETTINGS_KEYS[field])
  if (settingsValue) return { value: settingsValue, source: 'settings' }
  const envValue = nonEmpty(process.env[ENV_KEYS[field]])
  if (envValue) return { value: envValue, source: 'env' }
  return { value: DEFAULTS[field], source: 'default' }
}

/** 统一 resolver：每项独立按 settings > env > 默认值 解析。 */
export function getStepfunConfig(): StepfunConfig {
  const apiKey =
    getSettingValue(STEPFUN_SETTINGS_KEYS.apiKey) ?? nonEmpty(process.env.STEPFUN_API_KEY)
  return {
    apiKey,
    baseUrl: resolveField('baseUrl').value,
    chatModel: resolveField('chatModel').value,
    ttsModel: resolveField('ttsModel').value,
    asrModel: resolveField('asrModel').value,
    visionModel: resolveField('visionModel').value,
  }
}

/** 供设置页展示"生效值 + 来源"（settings / env / default），不含 Key 原文。 */
export function describeStepfunConfig(): StepfunConfigView {
  return Object.fromEntries(
    MODEL_FIELDS.map((field) => [field, resolveField(field)])
  ) as StepfunConfigView
}

export interface StepfunModelSettingsInput {
  baseUrl?: string
  chatModel?: string
  ttsModel?: string
  asrModel?: string
  visionModel?: string
}

/** 保存模型/端点设置；字段为空串 = 清空该项（回退 env/默认）；未定义 = 不改动。 */
export function saveStepfunModelSettings(input: StepfunModelSettingsInput): void {
  for (const field of MODEL_FIELDS) {
    const value = input[field]
    if (value === undefined) continue
    setSettingValue(STEPFUN_SETTINGS_KEYS[field], value)
  }
}
