import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { StepfunAdapter } from './stepfun-adapter'
import OpenAI from 'openai'

vi.mock('openai', () => {
  const createMock = vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'mocked content' } }]
  })
  
  return {
    default: vi.fn().mockImplementation((options) => {
      return {
        _options: options,
        chat: {
          completions: {
            create: createMock
          }
        }
      }
    })
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

    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://custom.api.com/v1'
    })
  })

  it('should fallback to default baseURL if environment variable is not defined', () => {
    delete process.env.STEPFUN_BASE_URL
    new StepfunAdapter('test-key')

    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://api.stepfun.com/v1'
    })
  })

  it('should use model from chat options when specified', async () => {
    const adapter = new StepfunAdapter('test-key')
    const clientMock = (adapter as unknown as { client: OpenAI }).client

    await adapter.chat([{ role: 'user', content: 'hello' }], { model: 'step-3.5-flash-test' })
    
    expect(clientMock.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'step-3.5-flash-test'
      })
    )
  })

  it('should use model from environment when options are empty', async () => {
    process.env.STEPFUN_CHAT_MODEL = 'env-model'
    const adapter = new StepfunAdapter('test-key')
    const clientMock = (adapter as unknown as { client: OpenAI }).client

    await adapter.chat([{ role: 'user', content: 'hello' }])
    
    expect(clientMock.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'env-model'
      })
    )
  })

  it('should fallback to default model if neither options nor environment defines it', async () => {
    delete process.env.STEPFUN_CHAT_MODEL
    const adapter = new StepfunAdapter('test-key')
    const clientMock = (adapter as unknown as { client: OpenAI }).client

    await adapter.chat([{ role: 'user', content: 'hello' }])
    
    expect(clientMock.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'step-3.5-flash'
      })
    )
  })
})
