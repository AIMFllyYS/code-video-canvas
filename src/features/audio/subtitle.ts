import type { SubtitleInput, SubtitleResult } from './types'

/** PRD F10：接口定稿；Demo 返回占位结果，P1 实现真实字幕对齐。 */
export async function generateSubtitle(
  input: SubtitleInput
): Promise<SubtitleResult> {
  return {
    kind: 'subtitle',
    shotId: input.shotId,
    status: 'placeholder',
    implementation: 'P1',
    note: '占位实现，P1 补齐',
    captions: [],
  }
}
