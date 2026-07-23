import { describe, expect, it } from 'vitest'
import { generateScore } from './index'

describe('generateScore', () => {
  it('returns a typed P1 placeholder without throwing', async () => {
    await expect(generateScore({ projectId: 'project-1' })).resolves.toMatchObject({
      kind: 'score',
      projectId: 'project-1',
      status: 'placeholder',
      implementation: 'P1',
      plan: null,
    })
  })
})
