import 'server-only'
import {
  Agent,
  type AgentMessage,
  type AgentTool,
} from '@earendil-works/pi-agent-core'
import {
  createModels,
  createProvider,
  type Model,
} from '@earendil-works/pi-ai'
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import type { CanvasNodeType } from '@/features/canvas'
import {
  DIRECTOR_NODE_TYPES,
  resolveDirectorModelTarget,
  type DirectorModelTarget,
} from '@/features/ai/model-routing'
import { streamBus } from '@/lib/stream/stream-bus'
import { STAGE_META } from './pipeline'
import {
  extractDirectorOutput,
  type DirectorOutput,
  type DirectorOutputPolicy,
} from './pi-output'
import { DirectorSessionStore, type SessionStoreInput } from './session-store'
import type { PipelineStage } from './types'

export interface DirectorToolResult {
  content: string
  details?: unknown
  terminate?: boolean
}

/** 项目自有 Tool 契约；Pi 类型只在本文件内部出现。 */
export interface DirectorTool {
  name: string
  label: string
  description: string
  parameters: Readonly<Record<string, unknown>>
  execute: (input: unknown, signal?: AbortSignal) => Promise<DirectorToolResult>
}

export interface DirectorRunInput {
  prompt: string
  tools?: readonly DirectorTool[]
  output: DirectorOutputPolicy
}

// 保留施工合同规定的命名接口，供调用方稳定引用。
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DirectorRunResult extends DirectorOutput {}

export interface DirectorSession {
  id: string
  storageKey: string
  run(input: DirectorRunInput): Promise<DirectorRunResult>
  close(): Promise<void>
}

export async function createDirectorSession(
  input: SessionStoreInput
): Promise<DirectorSession> {
  const store = new DirectorSessionStore()
  try {
    const stored = await store.open(input)
    const context = await stored.session.buildContext()
    const runtime = await createDirectorRuntime(input)
    const agent = new Agent({
      initialState: {
        model: runtime.model,
        systemPrompt: buildSystemPrompt(input),
        messages: context.messages,
        tools: [],
      },
      streamFn: (model, agentContext, options) =>
        runtime.models.streamSimple(model, agentContext, options),
      getApiKey: (provider) =>
        provider === runtime.model.provider ? runtime.apiKey : undefined,
      sessionId: stored.id,
      toolExecution: 'sequential',
    })
    const streamKey = `${input.projectId}:${input.nodeId}`
    let lastText = ''
    const unsubscribe = agent.subscribe(async (event) => {
      if (event.type === 'message_update') {
        // 逐 token 流式：用累积文本 diff 出增量推给事件总线（阶段结束/失败由
        // stage-runner 依据真实阶段结果 markDone/markError，与 node.status 一致）。
        const text = messageText(event.message)
        if (text.length > lastText.length) {
          streamBus.publish(streamKey, text.slice(lastText.length))
          lastText = text
        }
      } else if (event.type === 'message_end') {
        await stored.session.appendMessage(withoutHiddenThinking(event.message))
      }
    })
    return wrapSession(stored.id, stored.storageKey, agent, store, unsubscribe)
  } catch (error) {
    await store.close()
    throw error
  }
}

function wrapSession(
  id: string,
  storageKey: string,
  agent: Agent,
  store: DirectorSessionStore,
  unsubscribe: () => void
): DirectorSession {
  let closed = false
  return {
    id,
    storageKey,
    async run(input) {
      if (closed) throw new Error('DirectorSession 已关闭')
      agent.state.tools = (input.tools ?? []).map(adaptDirectorTool)
      const messageStart = agent.state.messages.length
      await agent.prompt(input.prompt)
      await agent.waitForIdle()
      if (agent.state.errorMessage) throw new Error(agent.state.errorMessage)
      return extractDirectorOutput(
        agent.state.messages.slice(messageStart),
        input.output
      )
    },
    async close() {
      if (closed) return
      closed = true
      unsubscribe()
      agent.abort()
      await agent.waitForIdle()
      await store.close()
    },
  }
}

function adaptDirectorTool(tool: DirectorTool): AgentTool {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters as AgentTool['parameters'],
    async execute(_toolCallId, params, signal) {
      const result = await tool.execute(params, signal)
      return {
        content: [{ type: 'text', text: result.content }],
        details: result.details ?? null,
        terminate: result.terminate,
      }
    },
  }
}

async function createDirectorRuntime(input: SessionStoreInput) {
  const nodeType = resolveNodeType(input)
  const target = await resolveDirectorModelTarget(nodeType, 'text')
  if (!target.apiKey) {
    throw new Error(`${providerName(target.provider)} API Key 未配置`)
  }
  return target.provider === 'gemini'
    ? createGeminiRuntime(target, target.apiKey)
    : createStepfunRuntime(target, target.apiKey)
}

function createGeminiRuntime(target: DirectorModelTarget, apiKey: string) {
  const baseUrl = geminiNativeBaseUrl(target.baseUrl)
  const model: Model<'google-generative-ai'> = {
    id: target.modelId,
    name: `Gemini ${target.modelId}`,
    api: 'google-generative-ai',
    provider: 'gemini',
    baseUrl,
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1_048_576,
    maxTokens: 32_000,
  }
  const provider = createProvider({
    id: 'gemini',
    name: 'Gemini',
    baseUrl,
    auth: {
      apiKey: workspaceApiKeyAuth('Gemini API key', apiKey),
    },
    models: [model],
    api: googleGenerativeAIApi(),
  })
  const models = createModels()
  models.setProvider(provider)
  return { model, models, apiKey }
}

function createStepfunRuntime(target: DirectorModelTarget, apiKey: string) {
  const model: Model<'openai-completions'> = {
    id: target.modelId,
    name: `StepFun ${target.modelId}`,
    api: 'openai-completions',
    provider: 'stepfun',
    baseUrl: target.baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 32_000,
  }
  const provider = createProvider({
    id: 'stepfun',
    name: 'StepFun',
    baseUrl: target.baseUrl,
    auth: {
      apiKey: workspaceApiKeyAuth('StepFun API key', apiKey),
    },
    models: [model],
    api: openAICompletionsApi(),
  })
  const models = createModels()
  models.setProvider(provider)
  return { model, models, apiKey }
}

function geminiNativeBaseUrl(openAiBaseUrl: string): string {
  return openAiBaseUrl.replace(/\/openai\/?$/, '')
}

function resolveNodeType(input: SessionStoreInput): CanvasNodeType {
  if (
    input.nodeType &&
    DIRECTOR_NODE_TYPES.includes(input.nodeType as CanvasNodeType)
  ) {
    return input.nodeType as CanvasNodeType
  }
  if (input.nodeType) {
    throw new Error(`未知 Director 节点类型：${input.nodeType}`)
  }
  const fallback: Record<PipelineStage, CanvasNodeType> = {
    INGEST: 'script-import',
    DIRECT: 'shot-split',
    SHOT_SPEC: 'shot-script',
    FABRICATE: 'shot-codegen',
    ASSEMBLE: 'score',
    FINALIZE: 'export',
  }
  return fallback[input.stage]
}

function providerName(provider: DirectorModelTarget['provider']): string {
  return provider === 'gemini' ? 'Gemini' : 'StepFun'
}

function buildSystemPrompt(input: SessionStoreInput): string {
  const stage = STAGE_META[input.stage]
  return `你是 CodeVideoCanvas 项目原生 Director 运行时。当前阶段：${stage.id}（${stage.title}）。只遵守调用方提供的阶段 prompt 和项目工具；所有结构化输出必须通过项目 schema。`
}

/** 提取一条消息的文本内容（非 assistant 或无文本时返回空串），用于流式增量 diff。 */
function messageText(message: AgentMessage): string {
  if (message.role !== 'assistant') return ''
  return message.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('')
}

function workspaceApiKeyAuth(name: string, apiKey: string) {
  return {
    name,
    resolve: async () => ({
      auth: { apiKey },
      source: 'workspace credential',
    }),
  }
}

function withoutHiddenThinking(message: AgentMessage): AgentMessage {
  if (message.role !== 'assistant') return message
  return {
    ...message,
    content: message.content.filter((item) => item.type !== 'thinking'),
  }
}
