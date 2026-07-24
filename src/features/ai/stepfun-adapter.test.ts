import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StepfunAdapter, validateKey } from './stepfun-adapter'

const { createMock, openAiConstructorMock } = vi.hoisted(() => ({
  createMock: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'mocked content' } }],
  }),
  openAiConstructorMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('openai', () => {
  class MockAPIError extends Error {
    readonly status?: number
    constructor(message: string, status?: number) {
      super(message)
      this.status = status
    }
  }
  return {
    default: class MockOpenAI {
      static readonly APIError = MockAPIError
      readonly chat = { completions: { create: createMock } }

      constructor(options: unknown) {
        openAiConstructorMock(options)
      }
    },
  }
})

describe('StepfunAdapter', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should initialize OpenAI client with correct baseURL from environment', () => {
    process.env.STEPFUN_BASE_URL = 'https://custom.api.com/v1'
    new StepfunAdapter('test-key')

    expect(openAiConstructorMock).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://custom.api.com/v1',
    })
  })

  it('should fallback to default baseURL if environment variable is not defined', () => {
    delete process.env.STEPFUN_BASE_URL
    new StepfunAdapter('test-key')

    expect(openAiConstructorMock).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://api.stepfun.com/v1',
    })
  })

  it('should use model from chat options when specified', async () => {
    const adapter = new StepfunAdapter('test-key')

    await adapter.chat([{ role: 'user', content: 'hello' }], { model: 'step-3.5-flash-test' })

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'step-3.5-flash-test',
      })
    )
  })

  it('should use model from environment when options are empty', async () => {
    process.env.STEPFUN_CHAT_MODEL = 'env-model'
    const adapter = new StepfunAdapter('test-key')

    await adapter.chat([{ role: 'user', content: 'hello' }])

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'env-model',
      })
    )
  })

  it('should fallback to default model if neither options nor environment defines it', async () => {
    delete process.env.STEPFUN_CHAT_MODEL
    const adapter = new StepfunAdapter('test-key')

    await adapter.chat([{ role: 'user', content: 'hello' }])

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'step-3.5-flash',
      })
    )
  })
})

describe('validateKey', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should return true when the chat probe succeeds', async () => {
    await expect(validateKey('sk-valid')).resolves.toBe(true)
  })

  it('should return false and log server-side without leaking the key when the probe fails', async () => {
    createMock.mockRejectedValueOnce(new Error('boom'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(validateKey('sk-super-secret')).resolves.toBe(false)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(errorSpy.mock.calls[0])
    expect(logged).not.toContain('sk-super-secret')

    errorSpy.mockRestore()
  })

  it('should probe with a minimal chat completion using the default model', async () => {
    delete process.env.STEPFUN_CHAT_MODEL

    await validateKey('test-key')

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'step-3.5-flash',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      expect.anything()
    )
  })

  it('should respect STEPFUN_CHAT_MODEL when probing', async () => {
    process.env.STEPFUN_CHAT_MODEL = 'env-model'

    await validateKey('test-key')

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'env-model',
      }),
      expect.anything()
    )
  })
})
