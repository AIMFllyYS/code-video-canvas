import { streams, task } from "@trigger.dev/sdk"
import { z } from "zod"

export const pipelineRunProbePayloadSchema = z.object({
  schemaVersion: z.literal(1),
  probeId: z.uuid(),
  requestedAt: z.iso.datetime(),
}).strict()

export type PipelineRunProbePayload = z.infer<
  typeof pipelineRunProbePayloadSchema
>

export const pipelineRunProgressEventSchema = z.object({
  schemaVersion: z.literal(1),
  phase: z.enum(["started", "completed"]),
  probeId: z.uuid(),
}).strict()

export type PipelineRunProgressEvent = z.infer<
  typeof pipelineRunProgressEventSchema
>

export const pipelineRunProgress =
  streams.define<PipelineRunProgressEvent>({
    id: "pipeline-run-progress-v1",
  })

export const pipelineRunTask = task({
  id: "cvc.pipeline.run",
  run: async (payload: unknown) => {
    const parsed = pipelineRunProbePayloadSchema.parse(payload)
    await pipelineRunProgress.append({
      schemaVersion: 1,
      phase: "started",
      probeId: parsed.probeId,
    })
    await pipelineRunProgress.append({
      schemaVersion: 1,
      phase: "completed",
      probeId: parsed.probeId,
    })

    return {
      schemaVersion: 1 as const,
      probeId: parsed.probeId,
    }
  },
})
