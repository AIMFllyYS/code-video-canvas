import { task } from "@trigger.dev/sdk"

import { CVC_TASK_IDS } from "@/features/pipeline/contracts/task-ids"
import { ProjectTaskPayloadV1Schema } from "@/features/pipeline/contracts/task-payload"
import { TaskResultV1Schema } from "@/features/pipeline/contracts/task-result"

import { pipelineProgressStream } from "../streams"

const PIPELINE_RUN_TASK_ID = CVC_TASK_IDS[0]

export const pipelineRunTask = task({
  id: PIPELINE_RUN_TASK_ID,
  run: async (payload: unknown) => {
    const parsed = ProjectTaskPayloadV1Schema.parse(payload)
    await pipelineProgressStream.append({
      schemaVersion: 1,
      taskId: PIPELINE_RUN_TASK_ID,
      pipelineRunId: parsed.pipelineRunId,
      attemptId: parsed.attemptId,
      phase: "started",
      progress: 0,
    })
    await pipelineProgressStream.append({
      schemaVersion: 1,
      taskId: PIPELINE_RUN_TASK_ID,
      pipelineRunId: parsed.pipelineRunId,
      attemptId: parsed.attemptId,
      phase: "completed",
      progress: 100,
    })

    return TaskResultV1Schema.parse({
      schemaVersion: 1,
      taskId: PIPELINE_RUN_TASK_ID,
      pipelineRunId: parsed.pipelineRunId,
      attemptId: parsed.attemptId,
      outcome: "completed",
      artifactIds: [],
      checkpointHash: parsed.fingerprint,
    })
  },
})
