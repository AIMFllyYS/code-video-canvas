import 'server-only'
import { z } from 'zod'
import type { CanvasNodeType } from '@/features/canvas/types'
import { getSettingValue, getStepfunConfig, setSettingValue } from './config'
import { getGeminiConfig } from './gemini-config'

export const AI_PROVIDER_IDS = ['stepfun', 'gemini'] as const
export type AiProviderId = (typeof AI_PROVIDER_IDS)[number]
export type ModelCapability = 'text' | 'vision'

export const DIRECTOR_NODE_TYPES = [
  'script-import',
  'shot-split',
  'score',
  'export',
  'shot-script',
  'shot-codegen',
  'shot-sfx',
  'shot-subtitle',
  'shot-qa',
] as const satisfies readonly CanvasNodeType[]

const providerSchema = z.enum(AI_PROVIDER_IDS)
const ROUTE_KEY_PREFIX = 'director_provider_'
const GEMINI_FAST_NODES = new Set<CanvasNodeType>([
  'script-import',
  'shot-sfx',
  'shot-subtitle',
])

const DEFAULT_PROVIDER: Record<CanvasNodeType, AiProviderId> = {
  'script-import': 'gemini',
  'shot-split': 'gemini',
  score: 'gemini',
  export: 'gemini',
  'shot-script': 'gemini',
  'shot-codegen': 'gemini',
  'shot-sfx': 'stepfun',
  'shot-subtitle': 'stepfun',
  'shot-qa': 'gemini',
}

export interface DirectorProviderView {
  provider: AiProviderId
  source: 'settings' | 'default'
}

export interface DirectorRouteView extends DirectorProviderView {
  model: string
}

export interface DirectorModelTarget {
  provider: AiProviderId
  baseUrl: string
  modelId: string
  apiKey: string | null
}

export function getDirectorProvider(
  nodeType: CanvasNodeType
): DirectorProviderView {
  const configured = providerSchema.safeParse(
    getSettingValue(routeKey(nodeType))
  )
  return configured.success
    ? { provider: configured.data, source: 'settings' }
    : { provider: DEFAULT_PROVIDER[nodeType], source: 'default' }
}

export function resolveDirectorModelTarget(
  nodeType: CanvasNodeType,
  capability: ModelCapability = 'text'
): DirectorModelTarget {
  const { provider } = getDirectorProvider(nodeType)
  if (provider === 'stepfun') {
    const config = getStepfunConfig()
    return {
      provider,
      baseUrl: config.baseUrl,
      modelId: capability === 'vision' ? config.visionModel : config.chatModel,
      apiKey: config.apiKey,
    }
  }
  const config = getGeminiConfig()
  return {
    provider,
    baseUrl: config.baseUrl,
    modelId:
      capability === 'vision' || !GEMINI_FAST_NODES.has(nodeType)
        ? config.primaryModel
        : config.fastModel,
    apiKey: config.apiKey,
  }
}

export function describeDirectorRoutes(): Record<CanvasNodeType, DirectorRouteView> {
  return Object.fromEntries(
    DIRECTOR_NODE_TYPES.map((nodeType) => {
      const provider = getDirectorProvider(nodeType)
      return [
        nodeType,
        {
          ...provider,
          model: resolveDirectorModelTarget(nodeType).modelId,
        },
      ]
    })
  ) as Record<CanvasNodeType, DirectorRouteView>
}

export type DirectorRouteSettingsInput = Partial<
  Record<CanvasNodeType, AiProviderId>
>

export function saveDirectorRoutes(input: DirectorRouteSettingsInput): void {
  for (const nodeType of DIRECTOR_NODE_TYPES) {
    const provider = input[nodeType]
    if (provider === undefined) continue
    setSettingValue(routeKey(nodeType), providerSchema.parse(provider))
  }
}

function routeKey(nodeType: CanvasNodeType): string {
  return `${ROUTE_KEY_PREFIX}${nodeType}`
}
