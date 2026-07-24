import 'server-only'
import OpenAI from 'openai'
import {
  getGeminiConfig,
  type GeminiSettingsInput,
} from './gemini-config'
import type { ChatMessage, ChatOptions, LlmAdapter } from './types'

function createClient(apiKey: string, baseUrl: string): OpenAI {
  return new OpenAI({ apiKey, baseURL: baseUrl })
}

/** 用候选配置执行最小真实补全；失败只记录无 Key 的服务端诊断。 */
export async function validateGeminiKey(
  apiKey: string,
  overrides: GeminiSettingsInput = {}
): Promise<boolean> {
  const current = getGeminiConfig()
  const baseUrl = nonEmpty(overrides.baseUrl) ?? current.baseUrl
  const model = nonEmpty(overrides.primaryModel) ?? current.primaryModel
  try {
    await createClient(apiKey, baseUrl).chat.completions.create(
      {
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      },
      { timeout: 15_000, maxRetries: 0 }
    )
    return true
  } catch (error) {
    const status = error instanceof OpenAI.APIError ? error.status : undefined
    const message = error instanceof Error ? error.message : String(error)
    console.error('[gemini] validateGeminiKey 失败', { status, message })
    return false
  }
}

/** Gemini OpenAI 兼容适配器；不发送 Gemini 3.6 已弃用的采样参数。 */
export class GeminiAdapter implements LlmAdapter {
  private readonly client: OpenAI

  constructor(apiKey: string) {
    this.client = createClient(apiKey, getGeminiConfig().baseUrl)
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {}
  ): Promise<string> {
    const config = getGeminiConfig()
    const response = await this.client.chat.completions.create({
      model: options.model ?? config.primaryModel,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: options.maxTokens,
    })
    return response.choices[0]?.message.content ?? ''
  }
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
