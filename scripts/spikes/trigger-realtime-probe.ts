import { createHash, randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

import { configure, runs, tasks } from "@trigger.dev/sdk"
import { z } from "zod"

import type { pipelineRunTask } from "../../trigger/tasks/pipeline-run"
import {
  pipelineRunProgress,
  pipelineRunProgressEventSchema,
} from "../../trigger/tasks/pipeline-run"

const OUTPUT_PATH = ".data/spikes/trigger.json"
const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "CANCELED",
  "FAILED",
  "CRASHED",
  "SYSTEM_FAILURE",
  "EXPIRED",
  "TIMED_OUT",
])

const outputSchema = z.object({
  schemaVersion: z.literal(1),
  probeId: z.uuid(),
}).strict()

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
  const stream = await pipelineRunProgress.read(runId, {
    timeoutInSeconds: 60,
  })
  const events = []

  for await (const candidate of stream) {
    events.push(pipelineRunProgressEventSchema.parse(candidate))
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
  probeId: string,
): void {
  const phases = events.map((event) => event.phase)
  if (
    phases.length !== 2 ||
    phases[0] !== "started" ||
    phases[1] !== "completed"
  ) {
    throw new Error("Expected typed progress sequence started -> completed")
  }
  if (events.some((event) => event.probeId !== probeId)) {
    throw new Error("Typed progress event probeId mismatch")
  }
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
  const probeId = randomUUID()
  const progressPromise = tasks
    .trigger<typeof pipelineRunTask>("cvc.pipeline.run", {
      schemaVersion: 1,
      probeId,
      requestedAt: new Date().toISOString(),
    })
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
  const output = outputSchema.parse(terminal.output)
  if (output.probeId !== probeId) {
    throw new Error("Trigger.dev task output probeId mismatch")
  }
  assertEventSequence(events, probeId)
  await writeEvidence(handle.id, events)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown probe failure"
  process.stderr.write(`Trigger.dev Realtime probe failed: ${message}\n`)
  process.exitCode = 1
})
