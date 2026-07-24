import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '@/lib/db/migrate'
import {
  describeGeminiConfig,
  GEMINI_SETTINGS_KEYS,
  getGeminiConfig,
  saveGeminiSettings,
} from './gemini-config'
import { setSettingValue } from './config'

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn<() => Db>() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: getDbMock }))

const originalEnv = { ...process.env }

describe('Gemini config', () => {
  let database: ReturnType<typeof createDb>

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.GEMINI_API_KEY
    delete process.env.GEMINI_BASE_URL
    delete process.env.GEMINI_PRIMARY_MODEL
    delete process.env.GEMINI_FAST_MODEL
    database = createDb(':memory:')
    getDbMock.mockReturnValue(database.db)
  })

  afterEach(() => {
    process.env = originalEnv
    database.sqlite.close()
  })

  it('uses the official OpenAI-compatible endpoint and requested model defaults', () => {
    expect(getGeminiConfig()).toEqual({
      apiKey: null,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      primaryModel: 'gemini-3.6-flash',
      fastModel: 'gemini-3.1-flash-lite',
    })
  })

  it('resolves settings over env over defaults without exposing the key view', () => {
    process.env.GEMINI_API_KEY = 'env-key'
    process.env.GEMINI_FAST_MODEL = 'env-fast'
    setSettingValue(GEMINI_SETTINGS_KEYS.apiKey, 'settings-key')
    setSettingValue(GEMINI_SETTINGS_KEYS.primaryModel, 'settings-primary')

    expect(getGeminiConfig()).toMatchObject({
      apiKey: 'settings-key',
      primaryModel: 'settings-primary',
      fastModel: 'env-fast',
    })
    expect(describeGeminiConfig()).toEqual({
      baseUrl: {
        value: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        source: 'default',
      },
      primaryModel: { value: 'settings-primary', source: 'settings' },
      fastModel: { value: 'env-fast', source: 'env' },
    })
  })

  it('saves only submitted fields and clears empty overrides', () => {
    saveGeminiSettings({ primaryModel: 'custom-primary', fastModel: 'custom-fast' })
    saveGeminiSettings({ fastModel: '' })

    expect(getGeminiConfig().primaryModel).toBe('custom-primary')
    expect(getGeminiConfig().fastModel).toBe('gemini-3.1-flash-lite')
  })
})
