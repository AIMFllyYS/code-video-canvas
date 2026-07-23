import { describe, expect, it } from 'vitest'
import { generateSubtitle } from './index'

describe('generateSubtitle', () => {
  it('returns a typed P1 placeholder without throwing', async () => {
    await expect(
      generateSubtitle({ shotId: 'S001', script: '你好', durationMs: 1200 })
    ).resolves.toEqual({
      kind: 'subtitle',
      shotId: 'S001',
      status: 'placeholder',
      implementation: 'P1',
      note: '占位实现，P1 补齐',
      captions: [],
    })
  })
})
