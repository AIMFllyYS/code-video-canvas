import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import type { Agent as AgentInstance } from '@earendil-works/pi-agent-core'
import type { Model } from '@earendil-works/pi-ai'

const DEFAULT_BASE_URL = 'https://api.stepfun.com/v1'
const DEFAULT_MODEL = 'step-3.5-flash'
const ENV_KEYS = [
  'STEPFUN_API_KEY',
  'STEPFUN_BASE_URL',
  'STEPFUN_CHAT_MODEL',
] as const

const nativeImport = new Function(
  'specifier',
  'return import(specifier)',
) as <T>(specifier: string) => Promise<T>

type ProbeResult =
  | {
      ok: true
      provider: 'stepfun'
      model: string
      response: string
      agentApi: 'Agent'
      sessionRepo: 'JsonlSessionRepo'
      sessionPathCreated: boolean
    }
  | {
      ok: false
      providerConfig: {
        provider: 'stepfun'
        api: 'openai-completions'
        authEnv: 'STEPFUN_API_KEY'
        baseUrl: string
        model: string
      }
      error: {
        name: string
        message: string
        stack: string
      }
    }

function loadLocalEnv(): void {
  for (const fileName of ['.env.local', '.env']) {
    const filePath = resolve(process.cwd(), fileName)
    if (!existsSync(filePath)) continue

    const values = new Map(
      readFileSync(filePath, 'utf8')
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const separator = line.indexOf('=')
          return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
        }),
    )

    for (const key of ENV_KEYS) {
      if (!process.env[key] && values.has(key)) process.env[key] = values.get(key)
    }
  }
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

async function verifySessionRepo(): Promise<boolean> {
  const { JsonlSessionRepo } =
    await nativeImport<typeof import('@earendil-works/pi-agent-core')>(
      '@earendil-works/pi-agent-core',
    )
  const { NodeExecutionEnv } =
    await nativeImport<typeof import('@earendil-works/pi-agent-core/node')>(
      '@earendil-works/pi-agent-core/node',
    )
  const sessionsRoot = resolve(tmpdir(), `cvc-pi-probe-${process.pid}`)
  const executionEnv = new NodeExecutionEnv({ cwd: process.cwd() })

  try {
    const repo = new JsonlSessionRepo({ fs: executionEnv, sessionsRoot })
    const session = await repo.create({
      cwd: process.cwd(),
      id: `probe-${process.pid}`,
      metadata: { purpose: 'stepfun-provider-probe' },
    })
    const metadata = await session.getMetadata()
    await repo.delete(metadata)
    return metadata.path.endsWith('.jsonl')
  } finally {
    await executionEnv.cleanup()
    rmSync(sessionsRoot, { recursive: true, force: true })
  }
}

function assistantText(agent: AgentInstance): string {
  const message = [...agent.state.messages].reverse().find((item) => item.role === 'assistant')
  if (!message || message.role !== 'assistant') {
    throw new Error('Pi Agent did not return an assistant message')
  }
  return message.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('')
    .trim()
}

function errorResult(error: unknown, baseUrl: string, model: string): ProbeResult {
  const cause = error instanceof Error ? error : new Error(String(error))
  return {
    ok: false,
    providerConfig: {
      provider: 'stepfun',
      api: 'openai-completions',
      authEnv: 'STEPFUN_API_KEY',
      baseUrl,
      model,
    },
    error: {
      name: cause.name,
      message: cause.message,
      stack: cause.stack ?? cause.message,
    },
  }
}

async function runProbe(): Promise<ProbeResult> {
  loadLocalEnv()

  const apiKey = process.env.STEPFUN_API_KEY
  const baseUrl = process.env.STEPFUN_BASE_URL ?? DEFAULT_BASE_URL
  const modelId = process.env.STEPFUN_CHAT_MODEL ?? DEFAULT_MODEL

  if (!apiKey) {
    return errorResult(new Error('STEPFUN_API_KEY is not configured'), baseUrl, modelId)
  }

  try {
    const { Agent } =
      await nativeImport<typeof import('@earendil-works/pi-agent-core')>(
        '@earendil-works/pi-agent-core',
      )
    const { createModels, createProvider, envApiKeyAuth } =
      await nativeImport<typeof import('@earendil-works/pi-ai')>(
        '@earendil-works/pi-ai',
      )
    const { openAICompletionsApi } = await nativeImport<
      typeof import('@earendil-works/pi-ai/api/openai-completions.lazy')
    >('@earendil-works/pi-ai/api/openai-completions.lazy')
    const model = createStepfunModel(baseUrl, modelId)
    const provider = createProvider({
      id: 'stepfun',
      name: 'StepFun',
      baseUrl,
      auth: { apiKey: envApiKeyAuth('StepFun API key', ['STEPFUN_API_KEY']) },
      models: [model],
      api: openAICompletionsApi(),
    })
    const models = createModels()
    models.setProvider(provider)

    const agent = new Agent({
      initialState: {
        model,
        systemPrompt: '只回复 OK。',
        messages: [],
        tools: [],
      },
      streamFn: (activeModel, context, options) =>
        models.streamSimple(activeModel, context, options),
      getApiKey: (providerId) =>
        providerId === 'stepfun' ? process.env.STEPFUN_API_KEY : undefined,
    })

    await agent.prompt('回复 OK')
    await agent.waitForIdle()

    if (agent.state.errorMessage) throw new Error(agent.state.errorMessage)

    return {
      ok: true,
      provider: 'stepfun',
      model: modelId,
      response: assistantText(agent),
      agentApi: 'Agent',
      sessionRepo: 'JsonlSessionRepo',
      sessionPathCreated: await verifySessionRepo(),
    }
  } catch (error) {
    return errorResult(error, baseUrl, modelId)
  }
}

async function main(): Promise<void> {
  const result = await runProbe()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
}

void main()
