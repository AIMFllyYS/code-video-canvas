import 'server-only'
import OpenAI from 'openai'
import { getSettingValue, getStepfunConfig, setSettingValue, STEPFUN_SETTINGS_KEYS } from './config'
import type { ChatMessage, ChatOptions, LlmAdapter } from './types'

/** 读取本地保存的 StepFun Key（仅服务端；只读 settings 表，不回退 env）。 */
export function getStoredApiKey(): string | null {
  return getSettingValue(STEPFUN_SETTINGS_KEYS.apiKey)
}

/** 保存 StepFun Key（仅服务端；永不进前端 bundle）。 */
export function saveApiKey(apiKey: string): void {
  setSettingValue(STEPFUN_SETTINGS_KEYS.apiKey, apiKey)
}

function createClient(apiKey: string, baseUrl: string): OpenAI {
  return new OpenAI({ apiKey, baseURL: baseUrl })
}

/** 校验 Key 是否可用（用与真实对话一致的最小 chat 探测；端点/模型走统一 resolver）。 */
export async function validateKey(apiKey: string): Promise<boolean> {
  const config = getStepfunConfig()
  try {
    await createClient(apiKey, config.baseUrl).chat.completions.create(
      {
        model: config.chatModel,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      },
      { timeout: 15_000, maxRetries: 0 },
    )
    return true
  } catch (error) {
    // 仅服务端日志用于排障：不回显给客户端、不写入会被提交的文件、绝不含 Key
    const status = error instanceof OpenAI.APIError ? error.status : undefined
    const message = error instanceof Error ? error.message : String(error)
    console.error('[stepfun] validateKey 失败', { status, message })
    return false
  }
}

/** 用本地保存的 Key 构造适配器；未配置返回 null。 */
export function createLlmFromSettings(): StepfunAdapter | null {
  const key = getStoredApiKey()
  return key ? new StepfunAdapter(key) : null
}

/** StepFun LLM 适配器（OpenAI 兼容端点；端点/模型统一走 `getStepfunConfig()`）。 */
export class StepfunAdapter implements LlmAdapter {
  private readonly client: OpenAI

  constructor(apiKey: string) {
    this.client = createClient(apiKey, getStepfunConfig().baseUrl)
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const model = options.model ?? getStepfunConfig().chatModel
    const res = await this.client.chat.completions.create({
      model,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    })
    return res.choices[0]?.message?.content ?? ''
  }
}
