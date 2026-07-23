import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const mocks = vi.hoisted(() => ({
  getStoredApiKey: vi.fn(),
  saveApiKey: vi.fn(),
  validateKey: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/features/ai/stepfun-adapter', () => mocks)

describe('POST /api/settings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('validates before saving a StepFun Key', async () => {
    mocks.validateKey.mockResolvedValue(true)
    const response = await POST(request('sk-valid-value'))

    expect(response.status).toBe(200)
    expect(mocks.validateKey).toHaveBeenCalledWith('sk-valid-value')
    expect(mocks.saveApiKey).toHaveBeenCalledWith('sk-valid-value')
    expect(mocks.validateKey.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.saveApiKey.mock.invocationCallOrder[0]!
    )
  })

  it('never persists a Key that fails validation', async () => {
    mocks.validateKey.mockResolvedValue(false)
    const response = await POST(request('sk-invalid-value'))

    expect(response.status).toBe(422)
    expect(mocks.saveApiKey).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      ok: false,
      valid: false,
      error: 'StepFun Key 校验失败 · 请检查 Key 是否正确',
    })
  })
})

function request(apiKey: string): Request {
  return new Request('http://localhost/api/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  })
}
