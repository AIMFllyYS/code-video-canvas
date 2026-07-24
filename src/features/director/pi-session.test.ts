import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDirectorSession, type DirectorTool } from './pi-session'
import { PIPELINE_STAGES } from './types'

const mocks = vi.hoisted(() => {
  const appendMessage = vi.fn()
  const closeStore = vi.fn()
  const buildContext = vi.fn()
  const openStore = vi.fn()
  const publish = vi.fn()
  const createProvider = vi.fn(() => ({}))
  const resolveDirectorModelTarget = vi.fn()
  const agentInstances: MockAgent[] = []

  class MockAgent {
    readonly listeners: Array<(event: unknown) => Promise<void> | void> = []
    readonly state: {
      systemPrompt: string
      model: unknown
      tools: unknown[]
      messages: unknown[]
      errorMessage?: string
    }

    constructor(options: {
      initialState?: {
        systemPrompt?: string
        model?: unknown
        tools?: unknown[]
        messages?: unknown[]
      }
    }) {
      this.state = {
        systemPrompt: options.initialState?.systemPrompt ?? '',
        model: options.initialState?.model,
        tools: options.initialState?.tools ?? [],
        messages: options.initialState?.messages ?? [],
      }
      agentInstances.push(this)
    }

    subscribe(listener: (event: unknown) => Promise<void> | void) {
      this.listeners.push(listener)
      return vi.fn()
    }

    async prompt(prompt: string) {
      const messages = [
        { role: 'user', content: [{ type: 'text', text: prompt }], timestamp: 2 },
        {
          role: 'assistant',
          content: [{ type: 'text', text: '完成' }],
          timestamp: 3,
          stopReason: 'stop',
          usage: {},
        },
      ]
      // 流式增量：assistant 文本逐步增长（部分 → 完整），触发 message_update。
      for (const partial of ['完', '完成']) {
        for (const listener of this.listeners) {
          await listener({
            type: 'message_update',
            message: { role: 'assistant', content: [{ type: 'text', text: partial }] },
          })
        }
      }
      for (const message of messages) {
        for (const listener of this.listeners) {
          await listener({ type: 'message_end', message })
        }
      }
      this.state.messages.push(...messages)
    }

    async waitForIdle() {}
    abort() {}
  }

  return {
    appendMessage,
    closeStore,
    buildContext,
    openStore,
    publish,
    createProvider,
    resolveDirectorModelTarget,
    agentInstances,
    MockAgent,
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/stream/stream-bus', () => ({ streamBus: { publish: mocks.publish } }))
vi.mock('@earendil-works/pi-agent-core', () => ({ Agent: mocks.MockAgent }))
vi.mock('@earendil-works/pi-ai', () => ({
  createModels: () => ({ setProvider: vi.fn(), streamSimple: vi.fn() }),
  createProvider: mocks.createProvider,
  envApiKeyAuth: vi.fn(() => ({})),
}))
vi.mock('@earendil-works/pi-ai/api/openai-completions.lazy', () => ({
  openAICompletionsApi: vi.fn(() => ({})),
}))
vi.mock('@earendil-works/pi-ai/api/google-generative-ai.lazy', () => ({
  googleGenerativeAIApi: vi.fn(() => ({ nativeGoogle: true })),
}))
vi.mock('@/features/ai/model-routing', () => ({
  DIRECTOR_NODE_TYPES: [
    'script-import',
    'shot-split',
    'score',
    'export',
    'shot-script',
    'shot-codegen',
    'shot-sfx',
    'shot-subtitle',
    'shot-qa',
  ],
  resolveDirectorModelTarget: mocks.resolveDirectorModelTarget,
}))
vi.mock('./session-store', () => ({
  DirectorSessionStore: class {
    open = mocks.openStore
    close = mocks.closeStore
  },
}))

describe('createDirectorSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.agentInstances.length = 0
    mocks.resolveDirectorModelTarget.mockReturnValue({
      provider: 'stepfun',
      baseUrl: 'https://api.stepfun.test/v1',
      modelId: 'step-chat',
      apiKey: 'stepfun-key',
    })
    mocks.buildContext.mockResolvedValue({
      messages: [{ role: 'user', content: [{ type: 'text', text: '历史消息' }], timestamp: 1 }],
    })
    mocks.openStore.mockResolvedValue({
      id: 'session-1',
      storageKey: 'pi-sessions/project/session.jsonl',
      session: {
        appendMessage: mocks.appendMessage,
        buildContext: mocks.buildContext,
      },
    })
  })

  it('restores context, adapts project tools, and persists message_end once', async () => {
    const session = await createDirectorSession({
      projectId: 'project-1',
      nodeId: 'node-1',
      stage: 'FABRICATE',
      resumeSessionKey: 'pi-sessions/project/session.jsonl',
    })
    const tool: DirectorTool = {
      name: 'project_check',
      label: '项目校验',
      description: '只使用项目原生逻辑',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: vi.fn(async () => ({ content: 'ok', details: { ok: true } })),
    }
    const result = await session.run({ prompt: '执行阶段', tools: [tool] })

    const agent = mocks.agentInstances[0]!
    expect(agent.state.messages[0]).toMatchObject({ role: 'user' })
    expect(agent.state.tools).toHaveLength(1)
    expect(mocks.appendMessage.mock.calls.map(([message]) => message.role)).toEqual([
      'user',
      'assistant',
    ])
    expect(result.text).toBe('完成')
    expect(Object.keys(session).sort()).toEqual(['close', 'id', 'run', 'storageKey'])
    expect(agent.state.systemPrompt).not.toContain('Skill')
  })

  it('closes the subscription and session store', async () => {
    const session = await createDirectorSession({
      projectId: 'project-1',
      nodeId: 'node-1',
      stage: 'INGEST',
    })
    await session.close()
    expect(mocks.closeStore).toHaveBeenCalledOnce()
  })

  it.each(PIPELINE_STAGES)('returns the same project session surface for %s', async (stage) => {
    const session = await createDirectorSession({
      projectId: 'project-1',
      nodeId: `node-${stage.toLowerCase()}`,
      stage,
    })

    expect(Object.keys(session).sort()).toEqual(['close', 'id', 'run', 'storageKey'])
    await session.close()
  })

  it('通过 message_update 捕获流式增量并按 projectId:nodeId 推送事件总线', async () => {
    const session = await createDirectorSession({
      projectId: 'project-1',
      nodeId: 'node-1',
      stage: 'INGEST',
    })
    await session.run({ prompt: '执行阶段' })

    expect(mocks.publish.mock.calls).toEqual([
      ['project-1:node-1', '完'],
      ['project-1:node-1', '成'],
    ])
  })

  it('constructs the selected Gemini runtime from the trusted node type', async () => {
    mocks.resolveDirectorModelTarget.mockReturnValueOnce({
      provider: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      modelId: 'gemini-3.6-flash',
      apiKey: 'gemini-key',
    })

    const session = await createDirectorSession({
      projectId: 'project-1',
      nodeId: 'node-1',
      nodeType: 'shot-codegen',
      stage: 'FABRICATE',
    })

    expect(mocks.resolveDirectorModelTarget).toHaveBeenCalledWith(
      'shot-codegen',
      'text'
    )
    expect(mocks.createProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        api: { nativeGoogle: true },
        models: [
          expect.objectContaining({
            id: 'gemini-3.6-flash',
            provider: 'gemini',
            api: 'google-generative-ai',
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
          }),
        ],
      })
    )
    await session.close()
  })

  it('fails explicitly instead of falling back when the selected provider has no key', async () => {
    mocks.resolveDirectorModelTarget.mockReturnValueOnce({
      provider: 'gemini',
      baseUrl: 'https://gemini.test/openai/',
      modelId: 'gemini-3.6-flash',
      apiKey: null,
    })

    await expect(
      createDirectorSession({
        projectId: 'project-1',
        nodeId: 'node-1',
        nodeType: 'shot-codegen',
        stage: 'FABRICATE',
      })
    ).rejects.toThrow('Gemini API Key 未配置')
    expect(mocks.closeStore).toHaveBeenCalledOnce()
  })
})
