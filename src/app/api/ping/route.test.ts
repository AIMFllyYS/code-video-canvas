import { describe, expect, it, vi } from 'vitest'
import { GET } from './route'

describe('GET /api/ping', () => {
  it('responds with 200 and JSON content type', async () => {
    const res = await GET()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('returns { ok: true } with a numeric timestamp', async () => {
    const res = await GET()
    const body = (await res.json()) as { ok: boolean; timestamp: number }

    expect(body.ok).toBe(true)
    expect(typeof body.timestamp).toBe('number')
    expect(Number.isFinite(body.timestamp)).toBe(true)
  })

  it('uses the current time for the timestamp', async () => {
    const fixed = 1_700_000_000_000
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixed)

    try {
      const res = await GET()
      const body = (await res.json()) as { timestamp: number }
      expect(body.timestamp).toBe(fixed)
    } finally {
      nowSpy.mockRestore()
    }
  })
})
