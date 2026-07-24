import { streams } from '@trigger.dev/sdk'
import {
  SafeProgressEventV1Schema,
  type SafeProgressEventV1,
} from '@/features/pipeline/contracts/progress'

const triggerPipelineProgress = streams.define<SafeProgressEventV1>({
  id: 'cvc.pipeline.progress.v1',
})

export function parsePipelineProgressEvent(
  value: unknown,
): SafeProgressEventV1 {
  return SafeProgressEventV1Schema.parse(value)
}

export const pipelineProgressStream = {
  id: triggerPipelineProgress.id,
  read: triggerPipelineProgress.read,
  async append(
    value: unknown,
    options?: Parameters<typeof triggerPipelineProgress.append>[1],
  ): Promise<void> {
    await triggerPipelineProgress.append(
      parsePipelineProgressEvent(value),
      options,
    )
  },
}
