/** video-director 八阶段。 */
export const PIPELINE_STAGES = [
  'INGEST',
  'DIRECT',
  'SHOT_SPEC',
  'FABRICATE',
  'ASSEMBLE',
  'FINALIZE',
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]

export interface StageMeta {
  id: PipelineStage
  title: string
  description: string
}
