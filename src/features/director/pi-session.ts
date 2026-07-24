import 'server-only'
import {
  Agent,
  type AgentMessage,
  type AgentTool,
} from '@earendil-works/pi-agent-core'
import {
  createModels,
  createProvider,
  envApiKeyAuth,
  type Model,
} from '@earendil-works/pi-ai'
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy'
import { getStepfunConfig } from '@/features/ai/config'
import { streamBus } from '@/lib/stream/stream-bus'
import { STAGE_META } from './pipeline'
import { DirectorSessionStore, type SessionStoreInput } from './session-store'

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
}

export interface DirectorRunResult {
  text: string
}

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
    const runtime = createStepfunRuntime()
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
        provider === 'stepfun' ? getStepfunConfig().apiKey ?? undefined : undefined,
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
        await stored.session.appendMessage(event.message)
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
      await agent.prompt(input.prompt)
      await agent.waitForIdle()
      if (agent.state.errorMessage) throw new Error(agent.state.errorMessage)
      return { text: lastAssistantText(agent.state.messages) }
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

function createStepfunRuntime() {
  const config = getStepfunConfig()
  const model = createStepfunModel(config.baseUrl, config.chatModel)
  const provider = createProvider({
    id: 'stepfun',
    name: 'StepFun',
    baseUrl: config.baseUrl,
    auth: { apiKey: envApiKeyAuth('StepFun API key', ['STEPFUN_API_KEY']) },
    models: [model],
    api: openAICompletionsApi(),
  })
  const models = createModels()
  models.setProvider(provider)
  return { model, models }
}

function createStepfunModel(
  baseUrl: string,
  modelId: string
): Model<'openai-completions'> {
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

function lastAssistantText(messages: AgentMessage[]): string {
  const message = [...messages].reverse().find((item) => item.role === 'assistant')
  if (!message || message.role !== 'assistant') {
    throw new Error('Director 未返回 assistant 消息')
  }
  return message.content
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('')
    .trim()
}
