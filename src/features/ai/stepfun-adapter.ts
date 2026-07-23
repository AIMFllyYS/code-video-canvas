import 'server-only'
import { eq } from 'drizzle-orm'
import OpenAI from 'openai'
import { getDb } from '@/lib/db/client'
import { settings } from '@/lib/db/schema'
import type { ChatMessage, ChatOptions, LlmAdapter } from './types'

const STEPFUN_BASE_URL = process.env.STEPFUN_BASE_URL ?? 'https://api.stepfun.com/v1'
const DEFAULT_MODEL = 'step-2-mini'
const SETTINGS_KEY = 'stepfun_api_key'

/** 读取本地保存的 StepFun Key（仅服务端）。 */
export function getStoredApiKey(): string | null {
  const row = getDb().select().from(settings).where(eq(settings.key, SETTINGS_KEY)).get()
  return row?.value ?? null
}

/** 保存 StepFun Key（仅服务端；永不进前端 bundle）。 */
export function saveApiKey(apiKey: string): void {
  getDb()
    .insert(settings)
    .values({ key: SETTINGS_KEY, value: apiKey })
    .onConflictDoUpdate({ target: settings.key, set: { value: apiKey } })
    .run()
}

function createClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey, baseURL: STEPFUN_BASE_URL })
}

/** 校验 Key 是否可用（尝试拉取模型列表）。 */
export async function validateKey(apiKey: string): Promise<boolean> {
  try {
    await createClient(apiKey).models.list()
    return true
  } catch {
    return false
  }
}

/** StepFun LLM 适配器（OpenAI 兼容端点）。 */
export class StepfunAdapter implements LlmAdapter {
  private readonly client: OpenAI

  constructor(apiKey: string) {
    this.client = createClient(apiKey)
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: options.model ?? DEFAULT_MODEL,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    })
    return res.choices[0]?.message?.content ?? ''
  }
}

/** 用本地保存的 Key 构造适配器；未配置返回 null。 */
export function createLlmFromSettings(): StepfunAdapter | null {
  const key = getStoredApiKey()
  return key ? new StepfunAdapter(key) : null
}
