import { describe, expect, it } from 'vitest'
import { generateVoiceover } from './index'

describe('generateVoiceover', () => {
  it('returns a typed P1 placeholder without throwing', async () => {
    await expect(
      generateVoiceover({ shotId: 'S001', text: '你好' })
    ).resolves.toMatchObject({
      kind: 'voiceover',
      shotId: 'S001',
      status: 'placeholder',
      implementation: 'P1',
      track: null,
    })
  })
})
