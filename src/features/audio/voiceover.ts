import type { VoiceoverInput, VoiceoverResult } from './types'

/** PRD F11：接口定稿；Demo 返回占位结果，P1 实现真实配音生成。 */
export async function generateVoiceover(
  input: VoiceoverInput
): Promise<VoiceoverResult> {
  return {
    kind: 'voiceover',
    shotId: input.shotId,
    status: 'placeholder',
    implementation: 'P1',
    note: '占位实现，P1 补齐',
    track: null,
  }
}
