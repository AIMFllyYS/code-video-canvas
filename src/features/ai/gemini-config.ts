import 'server-only'
import {
  getSettingValue,
  setSettingValue,
  type StepfunConfigFieldView,
  type StepfunConfigSource,
} from './config'

export type GeminiConfigField = 'baseUrl' | 'primaryModel' | 'fastModel'

export interface GeminiConfig {
  apiKey: string | null
  baseUrl: string
  primaryModel: string
  fastModel: string
}

export type GeminiConfigView = Record<GeminiConfigField, StepfunConfigFieldView>

export const GEMINI_SETTINGS_KEYS = {
  apiKey: 'gemini_api_key',
  baseUrl: 'gemini_base_url',
  primaryModel: 'gemini_primary_model',
  fastModel: 'gemini_fast_model',
} as const

const ENV_KEYS: Record<GeminiConfigField, string> = {
  baseUrl: 'GEMINI_BASE_URL',
  primaryModel: 'GEMINI_PRIMARY_MODEL',
  fastModel: 'GEMINI_FAST_MODEL',
}

const DEFAULTS: Record<GeminiConfigField, string> = {
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  primaryModel: 'gemini-3.6-flash',
  fastModel: 'gemini-3.1-flash-lite',
}

const FIELDS: GeminiConfigField[] = ['baseUrl', 'primaryModel', 'fastModel']

export function getGeminiConfig(): GeminiConfig {
  return {
    apiKey:
      getSettingValue(GEMINI_SETTINGS_KEYS.apiKey) ??
      nonEmpty(process.env.GEMINI_API_KEY),
    baseUrl: resolveField('baseUrl').value,
    primaryModel: resolveField('primaryModel').value,
    fastModel: resolveField('fastModel').value,
  }
}

export function describeGeminiConfig(): GeminiConfigView {
  return Object.fromEntries(
    FIELDS.map((field) => [field, resolveField(field)])
  ) as GeminiConfigView
}

export interface GeminiSettingsInput {
  baseUrl?: string
  primaryModel?: string
  fastModel?: string
}

export function saveGeminiSettings(input: GeminiSettingsInput): void {
  for (const field of FIELDS) {
    if (input[field] === undefined) continue
    setSettingValue(GEMINI_SETTINGS_KEYS[field], input[field])
  }
}

export function saveGeminiApiKey(apiKey: string): void {
  setSettingValue(GEMINI_SETTINGS_KEYS.apiKey, apiKey)
}

function resolveField(field: GeminiConfigField): StepfunConfigFieldView {
  const settingsValue = getSettingValue(GEMINI_SETTINGS_KEYS[field])
  if (settingsValue) return { value: settingsValue, source: 'settings' }
  const envValue = nonEmpty(process.env[ENV_KEYS[field]])
  if (envValue) return { value: envValue, source: 'env' }
  return { value: DEFAULTS[field], source: 'default' }
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export type { StepfunConfigSource as GeminiConfigSource }
