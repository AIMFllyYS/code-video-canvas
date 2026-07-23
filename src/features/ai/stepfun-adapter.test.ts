import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StepfunAdapter } from './stepfun-adapter'

const { createMock, openAiConstructorMock } = vi.hoisted(() => ({
  createMock: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'mocked content' } }],
  }),
  openAiConstructorMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
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
