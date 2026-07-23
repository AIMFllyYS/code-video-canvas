import {
  buildAssemblePrompt,
  assemblePromptInputSchema,
} from './prompts/assemble'
import { buildDirectPrompt, directPromptInputSchema } from './prompts/direct'
import {
  buildFabricatePrompt,
  fabricatePromptInputSchema,
} from './prompts/fabricate'
import {
  buildFinalizePrompt,
  finalizePromptInputSchema,
} from './prompts/finalize'
import { buildIngestPrompt, ingestPromptInputSchema } from './prompts/ingest'
import {
  buildShotSpecPrompt,
  shotSpecPromptInputSchema,
} from './prompts/shot-spec'
import type { PipelineStage } from './types'

export interface StagePromptContext {
  projectTitle: string
  projectScript: string
  directorInput: unknown
}

/** 将持久化阶段输入路由到项目原生的类型化 prompt builder。 */
export function buildStagePrompt(
  stage: PipelineStage,
  context: StagePromptContext
): string {
  switch (stage) {
    case 'INGEST':
      return buildIngestPrompt(
        ingestPromptInputSchema.parse(withScriptFallback(context))
      )
    case 'DIRECT':
      return buildDirectPrompt(directPromptInputSchema.parse(context.directorInput))
    case 'SHOT_SPEC':
      return buildShotSpecPrompt(
        shotSpecPromptInputSchema.parse(context.directorInput)
      )
    case 'FABRICATE':
      return buildFabricatePrompt(
        fabricatePromptInputSchema.parse(context.directorInput)
      )
    case 'ASSEMBLE':
      return buildAssemblePrompt(
        assemblePromptInputSchema.parse(context.directorInput)
      )
    case 'FINALIZE':
      return buildFinalizePrompt(
        finalizePromptInputSchema.parse(context.directorInput)
      )
  }
}

function withScriptFallback(context: StagePromptContext): unknown {
  if (
    context.directorInput !== null &&
    typeof context.directorInput === 'object' &&
    !Array.isArray(context.directorInput)
  ) {
    return { rawScript: context.projectScript, ...context.directorInput }
  }
  return { rawScript: context.projectScript }
}
