import { createHash, randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

import { configure, runs, tasks } from "@trigger.dev/sdk"

import type { pipelineRunTask } from "../../trigger/tasks/pipeline-run"
import { pipelineProgressStream } from "../../trigger/streams"
import { SafeProgressEventV1Schema } from "../../src/features/pipeline/contracts/progress"
import { CVC_TASK_IDS } from "../../src/features/pipeline/contracts/task-ids"
import { ProjectTaskPayloadV1Schema } from "../../src/features/pipeline/contracts/task-payload"
import { TaskResultV1Schema } from "../../src/features/pipeline/contracts/task-result"

const OUTPUT_PATH = ".data/spikes/trigger.json"
const PIPELINE_RUN_TASK_ID = CVC_TASK_IDS[0]
const WORKFLOW_VERSION = "n2.1-trigger-probe-v1"
const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "CANCELED",
  "FAILED",
  "CRASHED",
  "SYSTEM_FAILURE",
  "EXPIRED",
  "TIMED_OUT",
])

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function requireServerKey(): string {
  const value = process.env.TRIGGER_SECRET_KEY?.trim()
  if (!value) {
    throw new Error(
      "TRIGGER_SECRET_KEY is required to run the Trigger.dev Realtime probe",
    )
  }
  return value
}

async function collectProgress(runId: string) {
  const stream = await pipelineProgressStream.read(runId, {
    timeoutInSeconds: 60,
  })
  const events = []

  for await (const candidate of stream) {
    events.push(SafeProgressEventV1Schema.parse(candidate))
    if (events.length === 2) {
      break
    }
  }

  return events
}

async function waitForTerminal(runId: string) {
  for await (const run of runs.subscribeToRun<typeof pipelineRunTask>(runId, {
    skipColumns: ["payload"],
  })) {
    if (TERMINAL_STATUSES.has(run.status)) {
      return run
    }
  }

  throw new Error("Trigger.dev run subscription ended before a terminal state")
}

function assertEventSequence(
  events: Awaited<ReturnType<typeof collectProgress>>,
  pipelineRunId: string,
  attemptId: string,
): void {
  const phases = events.map((event) => event.phase)
  if (
    phases.length !== 2 ||
    phases[0] !== "started" ||
    phases[1] !== "completed"
  ) {
    throw new Error("Expected typed progress sequence started -> completed")
  }
  if (events[0]?.progress !== 0 || events[1]?.progress !== 100) {
    throw new Error("Typed progress event progress mismatch")
  }
  if (
    events.some(
      (event) =>
        event.taskId !== PIPELINE_RUN_TASK_ID ||
        event.pipelineRunId !== pipelineRunId ||
        event.attemptId !== attemptId,
    )
  ) {
    throw new Error("Typed progress event scope mismatch")
  }
}

function createProbePayload() {
  const workspaceId = randomUUID()
  const projectId = randomUUID()
  const pipelineRunId = randomUUID()
  const attemptId = randomUUID()
  const fingerprint = sha256(
    [workspaceId, projectId, pipelineRunId, attemptId].join(":"),
  )

  return ProjectTaskPayloadV1Schema.parse({
    schemaVersion: 1,
    workspaceId,
    projectId,
    pipelineRunId,
    attemptId,
    fingerprint,
    workflowVersion: WORKFLOW_VERSION,
    entity: {
      type: "project",
      id: projectId,
    },
  })
}

async function writeEvidence(
  runId: string,
  events: Awaited<ReturnType<typeof collectProgress>>,
): Promise<void> {
  const eventSequence = events.map((event) => event.phase)
  const evidence = {
    schemaVersion: 1,
    passed: true,
    version: "4.5.7",
    exitCode: 0,
    runIdHash: sha256(runId),
    eventHash: sha256(JSON.stringify(events)),
    eventSchemaVersion: 1,
    eventSequence,
    terminalStatus: "COMPLETED",
    scopedTokenDeferred: true,
  }

  await mkdir(dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify(evidence)}\n`)
}

async function main(): Promise<void> {
  configure({ accessToken: requireServerKey() })
  const payload = createProbePayload()
  const progressPromise = tasks
    .trigger<typeof pipelineRunTask>(PIPELINE_RUN_TASK_ID, payload)
    .then(async (handle) => ({
      handle,
      progress: collectProgress(handle.id),
    }))
  const { handle, progress } = await progressPromise
  const [events, terminal] = await Promise.all([
    progress,
    waitForTerminal(handle.id),
  ])

  if (terminal.status !== "COMPLETED" || !terminal.isSuccess) {
    throw new Error(`Trigger.dev probe finished with ${terminal.status}`)
  }
  const output = TaskResultV1Schema.parse(terminal.output)
  if (
    output.taskId !== PIPELINE_RUN_TASK_ID ||
    output.pipelineRunId !== payload.pipelineRunId ||
    output.attemptId !== payload.attemptId ||
    output.outcome !== "completed" ||
    output.artifactIds.length !== 0 ||
    output.checkpointHash !== payload.fingerprint
  ) {
    throw new Error("Trigger.dev task output contract mismatch")
  }
  assertEventSequence(events, payload.pipelineRunId, payload.attemptId)
  await writeEvidence(handle.id, events)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown probe failure"
  process.stderr.write(`Trigger.dev Realtime probe failed: ${message}\n`)
  process.exitCode = 1
})
