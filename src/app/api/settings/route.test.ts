import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from './route'

const mocks = vi.hoisted(() => ({
  getStoredApiKey: vi.fn(),
  saveApiKey: vi.fn(),
  validateKey: vi.fn(),
  describeStepfunConfig: vi.fn(),
  saveStepfunModelSettings: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/features/ai/stepfun-adapter', () => ({
  getStoredApiKey: mocks.getStoredApiKey,
  saveApiKey: mocks.saveApiKey,
  validateKey: mocks.validateKey,
}))
vi.mock('@/features/ai/config', () => ({
  describeStepfunConfig: mocks.describeStepfunConfig,
  saveStepfunModelSettings: mocks.saveStepfunModelSettings,
}))

describe('GET /api/settings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns masked key status plus the real effective model config (no key material)', async () => {
    mocks.getStoredApiKey.mockReturnValue('sk-abcdefgh')
    mocks.describeStepfunConfig.mockReturnValue({
      baseUrl: { value: 'https://api.stepfun.com/v1', source: 'default' },
      chatModel: { value: 'step-3.5-flash', source: 'env' },
      ttsModel: { value: 'stepaudio-2.5-tts', source: 'default' },
      asrModel: { value: 'stepaudio-2.5-asr', source: 'default' },
      visionModel: { value: 'step-3.7-flash', source: 'default' },
    })

    const response = GET()
    const body = await response.json()

    expect(body.configured).toBe(true)
    expect(body.masked).toBe('sk-***gh')
    expect(body.models.chatModel).toEqual({ value: 'step-3.5-flash', source: 'env' })
    expect(JSON.stringify(body)).not.toContain('sk-abcdefgh')
  })
})

describe('POST /api/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.describeStepfunConfig.mockReturnValue({})
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
})

function request(body: Record<string, string>): Request {
  return new Request('http://localhost/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
