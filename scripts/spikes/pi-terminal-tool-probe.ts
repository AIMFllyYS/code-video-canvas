import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Agent as AgentInstance, AgentMessage, AgentTool } from '@earendil-works/pi-agent-core'
import type { AssistantMessage, Model, ToolCall } from '@earendil-works/pi-ai'

const TOOL_NAME = 'submit_probe_result'
const PROBE_ID = 'n1-pi-terminal-tool'
const EXPECTED_ANSWER = 'terminal-tool-ok'
const EXPECTED_VERSION = '0.81.1'
const DEFAULT_BASE_URL = 'https://api.stepfun.com/v1'
const DEFAULT_MODEL = 'step-3.5-flash'
const EVIDENCE_PATH = resolve(process.cwd(), '.data/spikes/pi.json')
const ENV_KEYS = ['STEPFUN_API_KEY', 'STEPFUN_BASE_URL', 'STEPFUN_CHAT_MODEL'] as const

const parameters = {
  type: 'object',
  properties: { probeId: { type: 'string', minLength: 1 },
    answer: { type: 'string', enum: [EXPECTED_ANSWER] } },
  required: ['probeId', 'answer'],
  additionalProperties: false,
} as AgentTool['parameters']

const nativeImport = new Function('specifier', 'return import(specifier)') as
  <T>(specifier: string) => Promise<T>

interface ProbeArgs { probeId: string; answer: typeof EXPECTED_ANSWER }
interface ProbeDetails { ok: true; probeId: string }
type UsageEvidence = Record<'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'totalTokens', number>

interface ProbeEvidence {
  schemaVersion: 1
  passed: true
  version: string
  provider: 'stepfun'
  model: string
  toolName: typeof TOOL_NAME
  callHash: string
  resultHash: string
  usage: UsageEvidence
  terminatedAfterTool: true
  trailingAssistantText: false
  exitCode: 0
}

interface ToolObservation {
  toolCallId: string; toolName: string; details: unknown
  terminate: boolean; isError: boolean
}
interface TranscriptCall { message: AssistantMessage; item: ToolCall; index: number }
interface TranscriptProof { args: ProbeArgs; details: ProbeDetails; model: string }
interface TransportStatus { value: number | null }

class ProbeFailure extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'ProbeFailure'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function loadLocalEnv(): void {
  for (const fileName of ['.env.local', '.env']) {
    const filePath = resolve(process.cwd(), fileName)
    if (!existsSync(filePath)) continue
    const values = readEnvFile(filePath)
    for (const key of ENV_KEYS) {
      if (!process.env[key] && values.has(key)) process.env[key] = values.get(key)
    }
  }
}

function readEnvFile(filePath: string): Map<string, string> {
  return new Map(readFileSync(filePath, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=')
      return [line.slice(0, separator).trim(), line.slice(separator + 1).replace(/\s+#.*$/u, '').trim()]
    }))
}

function installedPiVersion(): string {
  const packagePath = resolve(process.cwd(),
    'node_modules/@earendil-works/pi-agent-core/package.json')
  const manifest: unknown = JSON.parse(readFileSync(packagePath, 'utf8'))
  if (!isRecord(manifest) || typeof manifest.version !== 'string')
    throw new ProbeFailure('PI_VERSION_UNAVAILABLE')
  if (manifest.version !== EXPECTED_VERSION) throw new ProbeFailure('PI_VERSION_MISMATCH')
  return manifest.version
}

function createStepfunModel(baseUrl: string, modelId: string): Model<'openai-completions'> {
  return {
    id: modelId,
    name: `StepFun ${modelId}`,
    api: 'openai-completions',
    provider: 'stepfun',
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 32_000,
  }
}

function createTerminalTool(): AgentTool<typeof parameters, ProbeDetails> {
  return {
    name: TOOL_NAME,
    label: 'Submit probe result',
    description: 'Submit the exact terminal result for the integration probe.',
    parameters,
    executionMode: 'sequential',
    async execute(_toolCallId, params) {
      const args = parseProbeArgs(params)
      return {
        content: [{ type: 'text', text: 'probe accepted' }],
        details: { ok: true, probeId: args.probeId },
        terminate: true,
      }
    },
  }
}

function observeToolResult(result: unknown): Pick<ToolObservation, 'details' | 'terminate'> {
  if (!isRecord(result)) return { details: undefined, terminate: false }
  return {
    details: result.details,
    terminate: result.terminate === true,
  }
}

function parseProbeArgs(value: unknown): ProbeArgs {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'answer,probeId') {
    throw new ProbeFailure('TOOL_ARGUMENT_SHAPE_INVALID')
  }
  if (value.probeId !== PROBE_ID || value.answer !== EXPECTED_ANSWER) {
    throw new ProbeFailure('TOOL_ARGUMENT_VALUE_INVALID')
  }
  return { probeId: value.probeId, answer: value.answer }
}

function parseProbeDetails(value: unknown): ProbeDetails {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'ok,probeId') {
    throw new ProbeFailure('TOOL_RESULT_DETAILS_INVALID')
  }
  if (value.ok !== true || value.probeId !== PROBE_ID) {
    throw new ProbeFailure('TOOL_RESULT_DETAILS_INVALID')
  }
  return { ok: true, probeId: value.probeId }
}

function assistantTextAfterCall(message: AssistantMessage, callIndex: number): boolean {
  return message.content
    .slice(callIndex + 1)
    .some((item) => item.type === 'text' && item.text.trim().length > 0)
}

function usageFrom(messages: readonly AgentMessage[]): UsageEvidence {
  const total: UsageEvidence = {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
  }
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    for (const key of Object.keys(total) as (keyof UsageEvidence)[]) {
      const value = message.usage[key]
      if (!Number.isFinite(value) || value < 0) {
        throw new ProbeFailure('USAGE_INVALID')
      }
      total[key] += value
    }
  }
  return total
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function validateTranscript(
  messages: readonly AgentMessage[],
  observations: readonly ToolObservation[],
): TranscriptProof {
  const calls: TranscriptCall[] = []
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    message.content.forEach((item, index) => {
      if (item.type === 'toolCall') calls.push({ item, index, message })
    })
  }
  if (calls.length !== 1) {
    throw new ProbeFailure('TERMINAL_TOOL_CALL_COUNT_INVALID')
  }
  const call = calls[0]
  if (call.item.name !== TOOL_NAME) throw new ProbeFailure('TERMINAL_TOOL_NAME_INVALID')
  const args = parseProbeArgs(call.item.arguments)
  const results = messages.filter((message) =>
    message.role === 'toolResult' && message.toolCallId === call.item.id)
  if (results.length !== 1 || results[0].role !== 'toolResult') {
    throw new ProbeFailure('TERMINAL_TOOL_RESULT_COUNT_INVALID')
  }
  const result = results[0]
  const details = parseProbeDetails(result.details)
  const observation = observations.find((item) => item.toolCallId === call.item.id)
  const resultIndex = messages.indexOf(result)
  const assistantAfterResult = messages
    .slice(resultIndex + 1)
    .some((message) => message.role === 'assistant')
  const trailingText = assistantTextAfterCall(call.message, call.index)
  if (
    !observation ||
    observation.toolName !== TOOL_NAME ||
    observation.isError ||
    !observation.terminate ||
    assistantAfterResult ||
    trailingText ||
    result.isError
  ) {
    throw new ProbeFailure('TERMINAL_TOOL_DID_NOT_TERMINATE')
  }
  parseProbeDetails(observation.details)
  return { args, details, model: call.message.model }
}

function buildEvidence(
  messages: readonly AgentMessage[],
  observations: readonly ToolObservation[],
  version: string,
): ProbeEvidence {
  const proof = validateTranscript(messages, observations)
  return {
    schemaVersion: 1,
    passed: true,
    version,
    provider: 'stepfun',
    model: proof.model,
    toolName: TOOL_NAME,
    callHash: sha256({ toolName: TOOL_NAME, arguments: proof.args }),
    resultHash: sha256({ toolName: TOOL_NAME, details: proof.details }),
    usage: usageFrom(messages),
    terminatedAfterTool: true,
    trailingAssistantText: false,
    exitCode: 0,
  }
}

async function createStepfunRuntime(baseUrl: string, modelId: string) {
  const { createModels, createProvider, envApiKeyAuth } =
    await nativeImport<typeof import('@earendil-works/pi-ai')>(
      '@earendil-works/pi-ai',
    )
  const { openAICompletionsApi } = await nativeImport<
    typeof import('@earendil-works/pi-ai/api/openai-completions.lazy')
  >('@earendil-works/pi-ai/api/openai-completions.lazy')
  const model = createStepfunModel(baseUrl, modelId)
  const provider = createProvider({
    id: 'stepfun', name: 'StepFun', baseUrl,
    auth: { apiKey: envApiKeyAuth('StepFun API key', ['STEPFUN_API_KEY']) },
    models: [model],
    api: openAICompletionsApi(),
  })
  const models = createModels()
  models.setProvider(provider)
  return { model, models }
}

async function createProbeAgent(
  apiKey: string, baseUrl: string, modelId: string,
  observations: ToolObservation[], transport: TransportStatus,
): Promise<AgentInstance> {
  const { Agent } = await nativeImport<typeof import('@earendil-works/pi-agent-core')>(
    '@earendil-works/pi-agent-core',
  )
  const { model, models } = await createStepfunRuntime(baseUrl, modelId)
  const agent = new Agent({
    initialState: {
      model,
      systemPrompt: [
        'You are a deterministic integration probe.',
        `Call ${TOOL_NAME} exactly once with probeId "${PROBE_ID}"`,
        `and answer "${EXPECTED_ANSWER}". Emit no assistant text.`,
      ].join(' '),
      messages: [],
      tools: [createTerminalTool()],
    },
    streamFn: (activeModel, context, options) =>
      models.stream(activeModel as Model<'openai-completions'>, context, {
        ...options,
        maxTokens: 256,
        temperature: 0,
        toolChoice: 'auto',
        onResponse: (response) => { transport.value = response.status },
      }),
    getApiKey: (providerId) => providerId === 'stepfun' ? apiKey : undefined,
    toolExecution: 'sequential',
  })
  agent.subscribe((event) => {
    if (event.type !== 'tool_execution_end') return
    const result = observeToolResult(event.result)
    observations.push({
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      details: result.details,
      terminate: result.terminate,
      isError: event.isError,
    })
  })
  return agent
}

async function runProbe(): Promise<ProbeEvidence> {
  loadLocalEnv()
  const apiKey = process.env.STEPFUN_API_KEY
  if (!apiKey) throw new ProbeFailure('STEPFUN_CREDENTIAL_NOT_CONFIGURED')
  const baseUrl = process.env.STEPFUN_BASE_URL ?? DEFAULT_BASE_URL
  const modelId = process.env.STEPFUN_CHAT_MODEL ?? DEFAULT_MODEL
  const observations: ToolObservation[] = []
  const transport: TransportStatus = { value: null }
  const agent = await createProbeAgent(apiKey, baseUrl, modelId, observations, transport)
  await agent.prompt(`Submit probe ${PROBE_ID} with answer ${EXPECTED_ANSWER}.`)
  await agent.waitForIdle()
  if (agent.state.errorMessage) throw new ProbeFailure(
    transport.value === null ? 'PROVIDER_TRANSPORT_FAILED' : `PROVIDER_HTTP_${transport.value}_FAILED`,
  )
  return buildEvidence(agent.state.messages, observations, installedPiVersion())
}

async function main(): Promise<void> {
  await rm(EVIDENCE_PATH, { force: true })
  try {
    const evidence = await runProbe()
    await mkdir(resolve(process.cwd(), '.data/spikes'), { recursive: true })
    await writeFile(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify(evidence)}\n`)
  } catch (error) {
    const blocker = error instanceof ProbeFailure ? error.code
      : 'PI_TERMINAL_TOOL_PROBE_UNEXPECTED_FAILURE'
    process.stderr.write(`${JSON.stringify({ passed: false, blocker, exitCode: 1 })}\n`)
    process.exitCode = 1
  }
}

void main()
