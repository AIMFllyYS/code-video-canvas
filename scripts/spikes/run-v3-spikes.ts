import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

type JsonRecord = Record<string, unknown>

const EVIDENCE_PATH = 'docs/evidence/refactor-v3/n1-spikes.json'
const FRAGMENT_ROOT = '.data/spikes'
const SHA256 = /^[a-f0-9]{64}$/
const SENSITIVE_KEY = /^(apiKey|credential|secret|token|raw|reasoning|delta|prompt|response)$/i
const SENSITIVE_VALUE =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{16,}\b|\bBearer\s+[A-Za-z0-9._~-]{12,}/i
const ABSOLUTE_PATH = /(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+|\/home\/[^/]+\/|\/Users\/[^/]+\/)/

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertRecord(value: unknown, label: string): asserts value is JsonRecord {
  if (!isRecord(value)) throw new Error(`${label}_OBJECT_REQUIRED`)
}

function assertEqual(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new Error(`${label}_INVALID`)
}

function assertHash(value: unknown, label: string): void {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    throw new Error(`${label}_SHA256_REQUIRED`)
  }
}

function assertFiniteNumber(value: unknown, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label}_NUMBER_REQUIRED`)
  }
}

function scanSafe(value: unknown, label = 'evidence'): void {
  if (typeof value === 'string') {
    if (SENSITIVE_VALUE.test(value)) throw new Error(`${label}_SENSITIVE_VALUE`)
    if (ABSOLUTE_PATH.test(value)) throw new Error(`${label}_ABSOLUTE_PATH`)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSafe(item, `${label}[${index}]`))
    return
  }
  if (!isRecord(value)) return
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) throw new Error(`${label}_${key}_SENSITIVE_KEY`)
    scanSafe(item, `${label}.${key}`)
  }
}

function verifyTrigger(value: unknown, waived: boolean): void {
  assertRecord(value, 'TRIGGER')
  if (waived) {
    assertEqual(value.passed, false, 'TRIGGER_PASSED')
    assertEqual(value.waived, true, 'TRIGGER_WAIVED')
    assertEqual(value.implementationReady, true, 'TRIGGER_IMPLEMENTATION')
    assertEqual(value.staticGatePassed, true, 'TRIGGER_STATIC_GATE')
    assertEqual(value.liveRunObserved, false, 'TRIGGER_LIVE_RUN')
    assertEqual(value.version, '4.5.7', 'TRIGGER_VERSION')
    assertEqual(value.scopedTokenDeferred, true, 'TRIGGER_SCOPED_TOKEN_DEFERRED')
    return
  }
  assertEqual(value.passed, true, 'TRIGGER_PASSED')
  assertEqual(value.version, '4.5.7', 'TRIGGER_VERSION')
  assertEqual(value.exitCode, 0, 'TRIGGER_EXIT')
  assertHash(value.runIdHash, 'TRIGGER_RUN_ID')
  assertHash(value.eventHash, 'TRIGGER_EVENT')
  assertEqual(value.eventSchemaVersion, 1, 'TRIGGER_EVENT_SCHEMA')
  assertEqual(value.terminalStatus, 'COMPLETED', 'TRIGGER_TERMINAL')
  assertEqual(value.scopedTokenDeferred, true, 'TRIGGER_SCOPED_TOKEN_DEFERRED')
  if (JSON.stringify(value.eventSequence) !== '["started","completed"]') {
    throw new Error('TRIGGER_EVENT_SEQUENCE_INVALID')
  }
}

function verifyPi(value: unknown): void {
  assertRecord(value, 'PI')
  assertEqual(value.passed, true, 'PI_PASSED')
  assertEqual(value.version, '0.81.1', 'PI_VERSION')
  assertEqual(value.provider, 'stepfun', 'PI_PROVIDER')
  assertEqual(value.toolName, 'submit_probe_result', 'PI_TOOL')
  assertEqual(value.terminatedAfterTool, true, 'PI_TERMINATION')
  assertEqual(value.trailingAssistantText, false, 'PI_TRAILING_TEXT')
  assertEqual(value.exitCode, 0, 'PI_EXIT')
  assertHash(value.callHash, 'PI_CALL')
  assertHash(value.resultHash, 'PI_RESULT')
  if (typeof value.model !== 'string' || !value.model) throw new Error('PI_MODEL_REQUIRED')
  assertRecord(value.usage, 'PI_USAGE')
  Object.values(value.usage).forEach((number) => assertFiniteNumber(number, 'PI_USAGE'))
}

function verifyHyperframes(value: unknown): void {
  assertRecord(value, 'HYPERFRAMES')
  assertEqual(value.passed, true, 'HYPERFRAMES_PASSED')
  assertEqual(value.version, '0.7.70', 'HYPERFRAMES_VERSION')
  assertEqual(value.doctorOk, true, 'HYPERFRAMES_DOCTOR')
  assertEqual(value.doctorExitCode, 0, 'HYPERFRAMES_DOCTOR_EXIT')
  assertEqual(value.checkExitCode, 0, 'HYPERFRAMES_CHECK_EXIT')
  assertEqual(value.renderExitCode, 0, 'HYPERFRAMES_RENDER_EXIT')
  assertEqual(value.exitCode, 0, 'HYPERFRAMES_EXIT')
  assertHash(value.doctorPayloadHash, 'HYPERFRAMES_DOCTOR_PAYLOAD')
  assertHash(value.checkPayloadHash, 'HYPERFRAMES_CHECK_PAYLOAD')
  assertHash(value.mp4Sha256, 'HYPERFRAMES_MP4')
  if (!Array.isArray(value.snapshotHashes) || value.snapshotHashes.length === 0) {
    throw new Error('HYPERFRAMES_SNAPSHOTS_REQUIRED')
  }
  value.snapshotHashes.forEach((hash) => assertHash(hash, 'HYPERFRAMES_SNAPSHOT'))
  verifyMediaProbe(value.ffprobe)
}

function verifyMediaProbe(value: unknown): void {
  assertRecord(value, 'HYPERFRAMES_FFPROBE')
  for (const key of ['duration', 'size', 'width', 'height', 'frames']) {
    assertFiniteNumber(value[key], `HYPERFRAMES_FFPROBE_${key}`)
  }
  if (typeof value.codecName !== 'string' || !value.codecName) {
    throw new Error('HYPERFRAMES_FFPROBE_CODEC_REQUIRED')
  }
  if (typeof value.frameRate !== 'string' || !value.frameRate) {
    throw new Error('HYPERFRAMES_FFPROBE_RATE_REQUIRED')
  }
}

function verifyEvidence(value: unknown): asserts value is JsonRecord {
  scanSafe(value)
  assertRecord(value, 'EVIDENCE')
  const missing = ['trigger', 'pi', 'hyperframes'].filter((key) => !isRecord(value[key]))
  if (missing.length) {
    throw new Error(missing.map((key) => `${key.toUpperCase()}_EVIDENCE_MISSING`).join(','))
  }
  assertEqual(value.schemaVersion, 1, 'EVIDENCE_SCHEMA')
  if (typeof value.generatedAt !== 'string' || !value.generatedAt) {
    throw new Error('EVIDENCE_GENERATED_AT_REQUIRED')
  }
  const waived = isRecord(value.userWaivers)
    && value.userWaivers.triggerLoginAndLiveRun === true
  if (waived) verifyWaiver(value.userWaivers)
  verifyTrigger(value.trigger, waived)
  verifyPi(value.pi)
  verifyHyperframes(value.hyperframes)
}

function verifyWaiver(value: JsonRecord): void {
  assertEqual(value.triggerLoginAndLiveRun, true, 'WAIVER_TRIGGER')
  assertEqual(value.source, 'user', 'WAIVER_SOURCE')
  if (typeof value.authorizedAt !== 'string' || !value.authorizedAt) {
    throw new Error('WAIVER_AUTHORIZED_AT_REQUIRED')
  }
}

async function readJson(file: string): Promise<unknown> {
  const source = await readFile(file, 'utf8')
  return JSON.parse(source) as unknown
}

async function readFragment(name: string): Promise<unknown> {
  try {
    return await readJson(path.join(FRAGMENT_ROOT, `${name}.json`))
  } catch {
    throw new Error(`${name.toUpperCase()}_EVIDENCE_MISSING`)
  }
}

async function resolveTriggerEvidence(): Promise<{
  trigger: unknown
  userWaivers?: unknown
}> {
  try {
    return { trigger: await readFragment('trigger') }
  } catch {
    const saved = await readJson(EVIDENCE_PATH)
    assertRecord(saved, 'EVIDENCE')
    if (
      !isRecord(saved.userWaivers)
      || saved.userWaivers.triggerLoginAndLiveRun !== true
    ) {
      throw new Error('TRIGGER_EVIDENCE_MISSING')
    }
    return { trigger: saved.trigger, userWaivers: saved.userWaivers }
  }
}

async function aggregate(): Promise<void> {
  const [triggerResult, pi, hyperframes] = await Promise.all([
    resolveTriggerEvidence(),
    readFragment('pi'),
    readFragment('hyperframes'),
  ])
  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ...(triggerResult.userWaivers
      ? { userWaivers: triggerResult.userWaivers }
      : {}),
    trigger: triggerResult.trigger,
    pi,
    hyperframes,
  }
  verifyEvidence(evidence)
  await mkdir(path.dirname(EVIDENCE_PATH), { recursive: true })
  await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ status: 'ok', evidence: 'n1-spikes.json' }))
}

async function verifySaved(): Promise<void> {
  let evidence: unknown
  try {
    evidence = await readJson(EVIDENCE_PATH)
  } catch {
    throw new Error(
      'TRIGGER_EVIDENCE_MISSING,PI_EVIDENCE_MISSING,HYPERFRAMES_EVIDENCE_MISSING',
    )
  }
  verifyEvidence(evidence)
  console.log(JSON.stringify({ status: 'ok', verified: true }))
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length === 0) return aggregate()
  if (args.length === 1 && args[0] === '--verify-evidence') return verifySaved()
  throw new Error('INVALID_SPIKE_ARGUMENTS')
}

void main().catch((error: unknown) => {
  const code = error instanceof Error ? error.message : 'UNKNOWN_SPIKE_ERROR'
  console.error(JSON.stringify({ status: 'failed', code }))
  process.exitCode = 1
})
