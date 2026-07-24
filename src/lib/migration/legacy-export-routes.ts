import {
  createCredentialEnvelope,
  encodeCredentialEnvelopeWire,
} from '@/features/credentials/credential-envelope'
import {
  LEGACY_ROUTE_DEFAULTS_V1,
  legacyRowBase,
  requireLegacyString,
  requireLegacyText,
  type LegacyDispositionReason,
  type LegacyDispositionV1,
  type LegacyRawRow,
  type LegacySettingExportRowV1,
  type ResolvedRoutesV1,
} from './legacy-export-contracts'

export function mapLegacySettings(
  rows: LegacyRawRow[],
  workspaceId: string,
  masterKey: Uint8Array,
): {
  rows: LegacySettingExportRowV1[]
  routes: ResolvedRoutesV1
  dispositions: LegacyDispositionV1[]
} {
  const values = new Map(rows.map((row) => [
    requireLegacyString(row.key, 'setting key'),
    requireLegacyText(row.value, 'setting value'),
  ]))
  const targets = new Map<string, string[]>()
  const routes = resolveRoutes(values, targets)
  const dispositions: LegacyDispositionV1[] = []
  const mapped = rows.map((raw): LegacySettingExportRowV1 => {
    const key = requireLegacyString(raw.key, 'setting key')
    const common = legacyRowBase('settings', key, raw)
    const provider = credentialProvider(key)
    if (provider) {
      if (!values.get(key)) throw new Error('legacy credential must not be empty')
      return {
        ...common, classification: 'credential', provider,
        envelopeWire: encodeCredentialEnvelopeWire(createCredentialEnvelope({
          workspaceId, provider, secret: values.get(key)!, masterKey,
        })),
        associatedTargets: [`credential:${provider}`],
      }
    }
    const associatedTargets = targets.get(key) ?? []
    const reason = settingDisposition(key, values.get(key)!, associatedTargets)
    if (reason) dispositions.push({ ...common, reason })
    return {
      ...common,
      classification: reason ? 'archived' : 'route-setting',
      associatedTargets,
    }
  })
  return { rows: mapped, routes, dispositions }
}

function resolveRoutes(
  values: Map<string, string>,
  targets: Map<string, string[]>,
): ResolvedRoutesV1 {
  const ai = {} as ResolvedRoutesV1['ai']
  for (const [task, defaults] of Object.entries(LEGACY_ROUTE_DEFAULTS_V1.ai)) {
    const routeKey = `director_provider_${defaults.nodeType}`
    const provider = (values.get(routeKey) ?? defaults.provider).trim()
    if (provider !== 'stepfun' && provider !== 'gemini') {
      throw new Error(`unknown provider for ${task}`)
    }
    if (values.has(routeKey)) addTarget(targets, routeKey, `ai:${task}`)
    const capability = task === 'vision-qa' ? 'vision' : 'text'
    const modelKey = provider === 'gemini'
      ? 'gemini_primary_model'
      : capability === 'vision' ? 'stepfun_vision_model' : 'stepfun_chat_model'
    const model = values.get(modelKey)
      ?? LEGACY_ROUTE_DEFAULTS_V1.models[provider][capability]
    if (!model.trim()) throw new Error(`empty model for ${task}`)
    if (values.has(modelKey)) addTarget(targets, modelKey, `ai:${task}`)
    ai[task as keyof typeof ai] = { provider, model: model.trim() }
  }
  return {
    schemaVersion: 1,
    ai,
    media: resolveMediaRoutes(values, targets),
  }
}

function resolveMediaRoutes(
  values: Map<string, string>,
  targets: Map<string, string[]>,
): ResolvedRoutesV1['media'] {
  const media = {} as ResolvedRoutesV1['media']
  for (const kind of ['tts', 'asr'] as const) {
    const modelKey = `stepfun_${kind}_model`
    const configured = values.get(modelKey)
    const model = configured?.trim() || LEGACY_ROUTE_DEFAULTS_V1.media[kind].model
    if (configured?.trim()) addTarget(targets, modelKey, `media:${kind}`)
    media[kind] = { provider: 'stepfun', model }
  }
  return media
}

function settingDisposition(
  key: string,
  value: string,
  targets: string[],
): LegacyDispositionReason | null {
  if ((key === 'stepfun_tts_model' || key === 'stepfun_asr_model') && !value.trim()) {
    return 'invalid-setting-value'
  }
  if (targets.length > 0 || credentialProvider(key)) return null
  if (key === 'gemini_fast_model' || key.startsWith('director_provider_')
    || key === 'gemini_primary_model' || key === 'stepfun_chat_model'
    || key === 'stepfun_vision_model') return 'unused-route-setting'
  return 'unsupported-setting'
}

function credentialProvider(key: string): 'stepfun' | 'gemini' | null {
  if (key === 'stepfun_api_key') return 'stepfun'
  if (key === 'gemini_api_key') return 'gemini'
  return null
}

function addTarget(targets: Map<string, string[]>, key: string, target: string): void {
  targets.set(key, [...(targets.get(key) ?? []), target])
}
