import { describe, expect, it } from 'vitest'
import { buildStagePrompt } from './stage-prompt'

describe('buildStagePrompt', () => {
  it('uses the persisted project script as the INGEST fallback', () => {
    const prompt = buildStagePrompt('INGEST', {
      projectTitle: '演示项目',
      projectScript: '这是一段待拆分的原始脚本。',
      directorInput: undefined,
    })

    expect(prompt).toContain('这是一段待拆分的原始脚本。')
    expect(prompt).toContain('INGEST')
  })

  it('rejects missing typed input for downstream stages', () => {
    expect(() =>
      buildStagePrompt('DIRECT', {
        projectTitle: '演示项目',
        projectScript: '原稿',
        directorInput: undefined,
      })
    ).toThrow()
  })
})
