import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '@/lib/db/migrate'
import { settings } from '@/lib/db/schema'
import {
  describeStepfunConfig,
  getSettingValue,
  getStepfunConfig,
  saveStepfunModelSettings,
  setSettingValue,
  STEPFUN_SETTINGS_KEYS,
} from './config'

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn<() => Db>() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: getDbMock }))

const originalEnv = { ...process.env }

describe('getStepfunConfig priority matrix (settings > env > default)', () => {
  let database: ReturnType<typeof createDb>

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.STEPFUN_API_KEY
    delete process.env.STEPFUN_BASE_URL
    delete process.env.STEPFUN_CHAT_MODEL
    delete process.env.STEPFUN_TTS_MODEL
    delete process.env.STEPFUN_ASR_MODEL
    delete process.env.STEPFUN_VISION_MODEL
    database = createDb(':memory:')
    getDbMock.mockReturnValue(database.db)
  })

  afterEach(() => {
    process.env = originalEnv
    database.sqlite.close()
  })

  it('falls back to built-in defaults when neither settings nor env is set', () => {
    const config = getStepfunConfig()
    expect(config).toEqual({
      apiKey: null,
      baseUrl: 'https://api.stepfun.com/v1',
      chatModel: 'step-3.5-flash',
      ttsModel: 'stepaudio-2.5-tts',
      asrModel: 'stepaudio-2.5-asr',
      visionModel: 'step-3.7-flash',
    })
  })

  it('reads from env when settings table has no row', () => {
    process.env.STEPFUN_API_KEY = 'env-key'
    process.env.STEPFUN_BASE_URL = 'https://env.example.com/v1'
    process.env.STEPFUN_CHAT_MODEL = 'env-chat'
    process.env.STEPFUN_TTS_MODEL = 'env-tts'
    process.env.STEPFUN_ASR_MODEL = 'env-asr'
    process.env.STEPFUN_VISION_MODEL = 'env-vision'

    expect(getStepfunConfig()).toEqual({
      apiKey: 'env-key',
      baseUrl: 'https://env.example.com/v1',
      chatModel: 'env-chat',
      ttsModel: 'env-tts',
      asrModel: 'env-asr',
      visionModel: 'env-vision',
    })
  })

  it('prefers settings table over env for every field', () => {
    process.env.STEPFUN_API_KEY = 'env-key'
    process.env.STEPFUN_BASE_URL = 'https://env.example.com/v1'
    process.env.STEPFUN_CHAT_MODEL = 'env-chat'
    process.env.STEPFUN_TTS_MODEL = 'env-tts'
    process.env.STEPFUN_ASR_MODEL = 'env-asr'
    process.env.STEPFUN_VISION_MODEL = 'env-vision'

    setSettingValue(STEPFUN_SETTINGS_KEYS.apiKey, 'settings-key')
    setSettingValue(STEPFUN_SETTINGS_KEYS.baseUrl, 'https://settings.example.com/v1')
    setSettingValue(STEPFUN_SETTINGS_KEYS.chatModel, 'settings-chat')
    setSettingValue(STEPFUN_SETTINGS_KEYS.ttsModel, 'settings-tts')
    setSettingValue(STEPFUN_SETTINGS_KEYS.asrModel, 'settings-asr')
    setSettingValue(STEPFUN_SETTINGS_KEYS.visionModel, 'settings-vision')

    expect(getStepfunConfig()).toEqual({
      apiKey: 'settings-key',
      baseUrl: 'https://settings.example.com/v1',
      chatModel: 'settings-chat',
      ttsModel: 'settings-tts',
      asrModel: 'settings-asr',
      visionModel: 'settings-vision',
    })
  })

  it('treats an empty-string settings value as unset and falls back to env', () => {
    process.env.STEPFUN_CHAT_MODEL = 'env-chat'
    setSettingValue(STEPFUN_SETTINGS_KEYS.chatModel, 'settings-chat')
    // 清空 = 显式回退
    setSettingValue(STEPFUN_SETTINGS_KEYS.chatModel, '')

    expect(getStepfunConfig().chatModel).toBe('env-chat')
    expect(getSettingValue(STEPFUN_SETTINGS_KEYS.chatModel)).toBeNull()
  })

  it('resolves apiKey independently per-field without touching model defaults', () => {
    setSettingValue(STEPFUN_SETTINGS_KEYS.apiKey, 'only-key-set')
    const config = getStepfunConfig()
    expect(config.apiKey).toBe('only-key-set')
    expect(config.chatModel).toBe('step-3.5-flash')
  })
})

describe('describeStepfunConfig', () => {
  let database: ReturnType<typeof createDb>

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.STEPFUN_CHAT_MODEL
    database = createDb(':memory:')
    getDbMock.mockReturnValue(database.db)
  })

  afterEach(() => {
    process.env = originalEnv
    database.sqlite.close()
  })

  it('labels each field with its resolution source and never includes apiKey', () => {
    setSettingValue(STEPFUN_SETTINGS_KEYS.chatModel, 'custom-chat')
    process.env.STEPFUN_ASR_MODEL = 'env-asr'

    const view = describeStepfunConfig()

    expect(view.chatModel).toEqual({ value: 'custom-chat', source: 'settings' })
    expect(view.asrModel).toEqual({ value: 'env-asr', source: 'env' })
    expect(view.visionModel).toEqual({ value: 'step-3.7-flash', source: 'default' })
    expect(view).not.toHaveProperty('apiKey')
  })
})

describe('saveStepfunModelSettings', () => {
  let database: ReturnType<typeof createDb>

  beforeEach(() => {
    process.env = { ...originalEnv }
    database = createDb(':memory:')
    getDbMock.mockReturnValue(database.db)
  })

  afterEach(() => {
    process.env = originalEnv
    database.sqlite.close()
  })

  it('writes only the provided fields and leaves others untouched', () => {
    setSettingValue(STEPFUN_SETTINGS_KEYS.ttsModel, 'existing-tts')

    saveStepfunModelSettings({ chatModel: 'new-chat' })

    expect(getSettingValue(STEPFUN_SETTINGS_KEYS.chatModel)).toBe('new-chat')
    expect(getSettingValue(STEPFUN_SETTINGS_KEYS.ttsModel)).toBe('existing-tts')
  })

  it('clears a field (deletes the settings row) when an empty string is submitted', () => {
    setSettingValue(STEPFUN_SETTINGS_KEYS.baseUrl, 'https://custom.example.com/v1')

    saveStepfunModelSettings({ baseUrl: '' })

    expect(getSettingValue(STEPFUN_SETTINGS_KEYS.baseUrl)).toBeNull()
    const row = database.db.select().from(settings).all()
    expect(row.find((r) => r.key === STEPFUN_SETTINGS_KEYS.baseUrl)).toBeUndefined()
  })
})
