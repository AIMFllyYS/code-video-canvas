import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '@/lib/db/migrate'
import { GeminiAdapter, validateGeminiKey } from './gemini-adapter'

const { createMock, constructorMock, getDbMock } = vi.hoisted(() => ({
  createMock: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Gemini 完成' } }],
  }),
  constructorMock: vi.fn(),
  getDbMock: vi.fn<() => Db>(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: getDbMock }))
vi.mock('openai', () => ({
  default: class MockOpenAI {
    static readonly APIError = class extends Error {}
    readonly chat = { completions: { create: createMock } }
    constructor(options: unknown) {
      constructorMock(options)
    }
  },
}))

const originalEnv = { ...process.env }

describe('GeminiAdapter', () => {
  let database: ReturnType<typeof createDb>

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    delete process.env.GEMINI_BASE_URL
    delete process.env.GEMINI_PRIMARY_MODEL
    database = createDb(':memory:')
    getDbMock.mockReturnValue(database.db)
  })

  afterEach(() => {
    process.env = originalEnv
    database.sqlite.close()
  })

  it('uses Google official OpenAI-compatible configuration', async () => {
    const adapter = new GeminiAdapter('test-key')
    await adapter.chat([{ role: 'user', content: 'hello' }], {
      temperature: 0.9,
    })

    expect(constructorMock).toHaveBeenCalledWith({
      apiKey: 'test-key',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    })
    expect(createMock).toHaveBeenCalledWith({
      model: 'gemini-3.6-flash',
      messages: [{ role: 'user', content: 'hello' }],
      max_tokens: undefined,
    })
  })

  it('validates with the candidate endpoint/model and never logs key material', async () => {
    await expect(
      validateGeminiKey('secret-key', {
        baseUrl: 'https://candidate.example/openai/',
        primaryModel: 'candidate-model',
      })
    ).resolves.toBe(true)
    expect(constructorMock).toHaveBeenCalledWith({
      apiKey: 'secret-key',
      baseURL: 'https://candidate.example/openai/',
    })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'candidate-model',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      expect.anything()
    )

    createMock.mockRejectedValueOnce(new Error('boom'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(validateGeminiKey('do-not-log')).resolves.toBe(false)
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('do-not-log')
    errorSpy.mockRestore()
  })
})
