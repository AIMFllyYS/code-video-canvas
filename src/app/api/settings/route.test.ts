import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from './route'

const mocks = vi.hoisted(() => ({
  getStoredApiKey: vi.fn(),
  saveApiKey: vi.fn(),
  validateKey: vi.fn(),
  describeStepfunConfig: vi.fn(),
  saveStepfunModelSettings: vi.fn(),
  getStepfunConfig: vi.fn(),
  getGeminiConfig: vi.fn(),
  describeGeminiConfig: vi.fn(),
  saveGeminiSettings: vi.fn(),
  saveGeminiApiKey: vi.fn(),
  validateGeminiKey: vi.fn(),
  describeDirectorRoutes: vi.fn(),
  saveDirectorRoutes: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/features/ai/stepfun-adapter', () => ({
  getStoredApiKey: mocks.getStoredApiKey,
  saveApiKey: mocks.saveApiKey,
  validateKey: mocks.validateKey,
}))
vi.mock('@/features/ai/config', () => ({
  describeStepfunConfig: mocks.describeStepfunConfig,
  getStepfunConfig: mocks.getStepfunConfig,
  saveStepfunModelSettings: mocks.saveStepfunModelSettings,
}))
vi.mock('@/features/ai/gemini-config', () => ({
  getGeminiConfig: mocks.getGeminiConfig,
  describeGeminiConfig: mocks.describeGeminiConfig,
  saveGeminiSettings: mocks.saveGeminiSettings,
  saveGeminiApiKey: mocks.saveGeminiApiKey,
}))
vi.mock('@/features/ai/gemini-adapter', () => ({
  validateGeminiKey: mocks.validateGeminiKey,
}))
vi.mock('@/features/ai/model-routing', () => ({
  describeDirectorRoutes: mocks.describeDirectorRoutes,
  saveDirectorRoutes: mocks.saveDirectorRoutes,
}))

describe('GET /api/settings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns masked key status plus the real effective model config (no key material)', async () => {
    mocks.getStoredApiKey.mockReturnValue('sk-abcdefgh')
    mocks.getStepfunConfig.mockReturnValue({ apiKey: 'sk-abcdefgh' })
    mocks.describeStepfunConfig.mockReturnValue({
      baseUrl: { value: 'https://api.stepfun.com/v1', source: 'default' },
      chatModel: { value: 'step-3.5-flash', source: 'env' },
      ttsModel: { value: 'stepaudio-2.5-tts', source: 'default' },
      asrModel: { value: 'stepaudio-2.5-asr', source: 'default' },
      visionModel: { value: 'step-3.7-flash', source: 'default' },
    })
    mocks.getGeminiConfig.mockReturnValue({ apiKey: 'gemini-env-key' })
    mocks.describeGeminiConfig.mockReturnValue({
      baseUrl: { value: 'https://google.test/openai/', source: 'default' },
      primaryModel: { value: 'gemini-3.6-flash', source: 'default' },
      fastModel: { value: 'gemini-3.1-flash-lite', source: 'default' },
    })
    mocks.describeDirectorRoutes.mockReturnValue({
      'shot-codegen': {
        provider: 'gemini',
        model: 'gemini-3.6-flash',
        source: 'default',
      },
    })

    const response = GET()
    const body = await response.json()

    expect(body.configured).toBe(true)
    expect(body.masked).toBe('sk-***gh')
    expect(body.models.chatModel).toEqual({ value: 'step-3.5-flash', source: 'env' })
    expect(body.geminiConfigured).toBe(true)
    expect(body.gemini.primaryModel.value).toBe('gemini-3.6-flash')
    expect(body.routes['shot-codegen'].provider).toBe('gemini')
    expect(JSON.stringify(body)).not.toContain('sk-abcdefgh')
    expect(JSON.stringify(body)).not.toContain('gemini-env-key')
  })
})

describe('POST /api/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.describeStepfunConfig.mockReturnValue({})
    mocks.describeGeminiConfig.mockReturnValue({})
    mocks.describeDirectorRoutes.mockReturnValue({})
    mocks.getGeminiConfig.mockReturnValue({ apiKey: null })
    mocks.getStepfunConfig.mockReturnValue({ apiKey: null })
  })

  it('validates before saving a StepFun Key', async () => {
    mocks.validateKey.mockResolvedValue(true)
    const response = await POST(request({ apiKey: 'sk-valid-value' }))

    expect(response.status).toBe(200)
    expect(mocks.validateKey).toHaveBeenCalledWith('sk-valid-value')
    expect(mocks.saveApiKey).toHaveBeenCalledWith('sk-valid-value')
    expect(mocks.validateKey.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveApiKey.mock.invocationCallOrder[0]!
    )
  })

  it('never persists a Key that fails validation', async () => {
    mocks.validateKey.mockResolvedValue(false)
    const response = await POST(request({ apiKey: 'sk-invalid-value' }))

    expect(response.status).toBe(422)
    expect(mocks.saveApiKey).not.toHaveBeenCalled()
    expect(mocks.saveStepfunModelSettings).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      ok: false,
      valid: false,
      error: 'StepFun Key 校验失败 · 请检查 Key 是否正确',
    })
  })

  it('saves model settings without requiring or validating an apiKey', async () => {
    const response = await POST(request({ chatModel: 'step-3.5-flash', ttsModel: '' }))

    expect(response.status).toBe(200)
    expect(mocks.validateKey).not.toHaveBeenCalled()
    expect(mocks.saveApiKey).not.toHaveBeenCalled()
    expect(mocks.saveStepfunModelSettings).toHaveBeenCalledWith({
      chatModel: 'step-3.5-flash',
      ttsModel: '',
    })
  })

  it('applies apiKey and model settings together only after validation succeeds', async () => {
    mocks.validateKey.mockResolvedValue(true)
    const response = await POST(request({ apiKey: 'sk-valid-value', baseUrl: 'https://x.com/v1' }))

    expect(response.status).toBe(200)
    expect(mocks.saveApiKey).toHaveBeenCalledWith('sk-valid-value')
    expect(mocks.saveStepfunModelSettings).toHaveBeenCalledWith({ baseUrl: 'https://x.com/v1' })
  })

  it('validates and saves Gemini candidate config without replacing StepFun', async () => {
    mocks.validateGeminiKey.mockResolvedValue(true)
    const response = await POST(
      request({
        gemini: {
          apiKey: 'gemini-valid',
          primaryModel: 'gemini-3.6-flash',
        },
        routes: {
          'shot-codegen': 'gemini',
          'shot-sfx': 'stepfun',
        },
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.validateGeminiKey).toHaveBeenCalledWith('gemini-valid', {
      primaryModel: 'gemini-3.6-flash',
    })
    expect(mocks.saveGeminiApiKey).toHaveBeenCalledWith('gemini-valid')
    expect(mocks.saveGeminiSettings).toHaveBeenCalledWith({
      primaryModel: 'gemini-3.6-flash',
    })
    expect(mocks.saveDirectorRoutes).toHaveBeenCalledWith({
      'shot-codegen': 'gemini',
      'shot-sfx': 'stepfun',
    })
    expect(mocks.saveApiKey).not.toHaveBeenCalled()
  })

  it('does not persist Gemini key/config/routes when validation fails', async () => {
    mocks.validateGeminiKey.mockResolvedValue(false)
    const response = await POST(
      request({
        gemini: { apiKey: 'gemini-invalid', fastModel: 'candidate-fast' },
        routes: { 'script-import': 'gemini' },
      })
    )

    expect(response.status).toBe(422)
    expect(mocks.saveGeminiApiKey).not.toHaveBeenCalled()
    expect(mocks.saveGeminiSettings).not.toHaveBeenCalled()
    expect(mocks.saveDirectorRoutes).not.toHaveBeenCalled()
  })
})

function request(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
