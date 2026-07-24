import { CANVAS_NODE_TYPES } from '@/lib/db/schema/index'
import { decodeCredentialEnvelopeWire } from '@/features/credentials/credential-envelope'
import type {
  LegacyArtifactExportRowV1, LegacyJobExportRowV1,
  LegacyNodeExportRowV1, LegacyProjectExportRowV1,
} from './legacy-export'
import {
  addDispositionAccount, addTargetAccount, assembleLegacyProjectPlans,
  assertCompleteLegacyAccounting,
  compareLegacyUtf8 as compare,
  hasLegacyErrorCode as hasCode,
  isAccounted, legacyBoolean as bool, legacyDate as date,
  legacyEndpointDisposition as endpointDisposition, legacyImportFingerprint,
  legacyJson as json, legacyPoint as point,
  legacyRouteTarget as routeTarget, legacyText as text,
  loadVerifiedLegacyExport, sortImportAccounts,
  verifyLegacyArtifactEntity, type ArtifactInsert, type AttemptInsert,
  type LegacyGlobalImportPlanV1, type LegacyImportAccountV1,
  type LegacyImportPlanV1, type NodeInsert, type ProjectInsert, type RunInsert,
  type VerifiedLegacyExportBundleV1,
} from './legacy-import-contracts'
import { legacyIdToUuid } from './legacy-id'

interface Prepared<T, V> { row: T; value: V }
type PreparedJob = Prepared<LegacyJobExportRowV1, AttemptInsert> & { run: RunInsert; createdMs: number }
type ArtifactCandidate = Prepared<LegacyArtifactExportRowV1, Omit<ArtifactInsert,
  'version' | 'supersedesArtifactId'>>

const STATUS: Record<string, string> = { idle: 'idle', pending: 'queued',
  running: 'running', success: 'succeeded', failed: 'failed', stale: 'stale' }
const STAGE: Record<string, string> = {
  'script-import': 'INGEST', 'shot-split': 'DIRECT',
  'shot-script': 'SHOT_SPEC', 'shot-codegen': 'FABRICATE',
  'shot-sfx': 'ASSEMBLE', 'shot-subtitle': 'ASSEMBLE', score: 'ASSEMBLE',
  'shot-qa': 'FINALIZE', export: 'FINALIZE',
}
const GLOBAL_TYPES = new Set(['script-import', 'shot-split', 'score', 'export'])
const JOB_STATUS: Record<string, 'succeeded' | 'failed' | 'cancelled'> = {
  done: 'succeeded', failed: 'failed', pending: 'cancelled', running: 'cancelled' }

type PlanRequest = Parameters<typeof loadVerifiedLegacyExport>[0] & { artifactRoot: string }

export async function prepareLegacyImportPlan(
  input: PlanRequest,
): Promise<LegacyImportPlanV1> {
  const bundle = await loadVerifiedLegacyExport(input)
  const accounts = bundle.manifest.archivedDispositions.map((row) => ({
    sourceTable: row.sourceTable,
    legacyPk: row.legacyPk,
    canonicalRowHash: row.canonicalRowHash,
    targets: [],
    disposition: row.reason,
  }))
  const preparedProjects = prepareProjects(bundle, accounts)
  const preparedNodes = prepareNodes(bundle, preparedProjects, accounts)
  const preparedEdges = prepareEdges(bundle, preparedProjects, preparedNodes, accounts)
  const preparedJobs = prepareJobs(bundle, preparedProjects, accounts)
  const preparedArtifacts = await prepareArtifacts(
    bundle, preparedProjects, preparedNodes, preparedJobs, accounts, input.artifactRoot,
  )
  const globals = prepareGlobals(bundle, accounts)
  assertCompleteLegacyAccounting(bundle, accounts)
  return {
    manifest: bundle.manifest,
    fingerprint: legacyImportFingerprint(bundle.manifest),
    projects: assembleLegacyProjectPlans({
      projects: preparedProjects.map(({ value }) => value),
      nodes: preparedNodes.map(({ value }) => value),
      edges: preparedEdges.map(({ value }) => value),
      runs: preparedJobs.map(({ run }) => run),
      attempts: preparedJobs.map(({ value }) => value),
      artifacts: preparedArtifacts.map(({ value }) => value),
    }),
    globals,
    accounts: sortImportAccounts(accounts),
  }
}

function prepareProjects(
  bundle: VerifiedLegacyExportBundleV1,
  accounts: LegacyImportAccountV1[],
): Prepared<LegacyProjectExportRowV1, ProjectInsert>[] {
  return bundle.rows.projects.flatMap((row) => {
    if (isAccounted(accounts, row)) return []
    try {
      const value: ProjectInsert = {
        workspaceId: bundle.manifest.workspaceId, id: row.targetId,
        title: text(row.title, true), script: text(row.script, true), status: 'active',
        workflowVersion: bundle.manifest.workflowVersion, revision: 0,
        exportSettings: { schemaVersion: 1, settings: json(row.exportSettingsJson) },
        autopilot: bool(row.autopilot), createdAt: date(row.createdAt),
        updatedAt: date(row.updatedAt),
      }
      addTargetAccount(accounts, row, { table: 'projects', id: row.targetId })
      return [{ row, value }]
    } catch {
      addDispositionAccount(accounts, row, 'invalid-project')
      return []
    }
  })
}

function prepareNodes(
  bundle: VerifiedLegacyExportBundleV1,
  projects: Prepared<LegacyProjectExportRowV1, ProjectInsert>[],
  accounts: LegacyImportAccountV1[],
): Prepared<LegacyNodeExportRowV1, NodeInsert>[] {
  const projectIds = new Set(projects.map(({ value }) => value.id))
  return bundle.rows.canvas_nodes.flatMap((row) => {
    if (isAccounted(accounts, row)) return []
    let reason: string | null = null
    if (!projectIds.has(row.targetProjectId)) reason = 'missing-project'
    else if (!CANVAS_NODE_TYPES.includes(String(row.type) as never)) {
      reason = 'unsupported-node-type'
    } else if (!STATUS[String(row.status)]) reason = 'invalid-node-status'
    else if (!GLOBAL_TYPES.has(String(row.type))
      && (typeof row.laneKey !== 'string' || !row.laneKey)) {
      reason = 'missing-lane-key'
    }
    try {
      if (reason) throw new Error(reason)
      const position = point(row.positionJson)
      const type = text(row.type)
      const value: NodeInsert = {
        workspaceId: bundle.manifest.workspaceId, id: row.targetId,
        projectId: row.targetProjectId,
        logicalKey: GLOBAL_TYPES.has(type) ? `global:${type}` : `shot:${text(row.laneKey)}:${type}`,
        type, stage: STAGE[type]!, status: STATUS[text(row.status)]!,
        positionX: position.x, positionY: position.y,
        data: {
          schemaVersion: 1, payload: json(row.dataJson),
          migration: { legacyStage: row.stage },
        }, revision: 0, createdAt: date(row.createdAt), updatedAt: date(row.createdAt),
      }
      addTargetAccount(accounts, row, { table: 'canvas_nodes', id: row.targetId })
      return [{ row, value }]
    } catch {
      addDispositionAccount(accounts, row, reason ?? 'invalid-node-data')
      return []
    }
  })
}

function prepareEdges(
  bundle: VerifiedLegacyExportBundleV1,
  projects: Prepared<LegacyProjectExportRowV1, ProjectInsert>[],
  nodes: Prepared<LegacyNodeExportRowV1, NodeInsert>[],
  accounts: LegacyImportAccountV1[],
) {
  const projectIds = new Set(projects.map(({ value }) => value.id))
  const valid = new Map(nodes.map((item) => [item.value.id, item]))
  const raw = new Map(bundle.rows.canvas_nodes.map((row) => [row.targetId, row]))
  return bundle.rows.canvas_edges.flatMap((row) => {
    if (isAccounted(accounts, row)) return []
    const source = valid.get(row.targetSourceId)
    const target = valid.get(row.targetTargetId)
    let reason: string | null = null
    if (!projectIds.has(row.targetProjectId)) reason = 'missing-project'
    else if (!source || source.value.projectId !== row.targetProjectId) {
      reason = endpointDisposition(raw.get(row.targetSourceId)?.targetProjectId,
        row.targetProjectId, 'missing-source')
    } else if (!target || target.value.projectId !== row.targetProjectId) {
      reason = endpointDisposition(raw.get(row.targetTargetId)?.targetProjectId,
        row.targetProjectId, 'missing-target')
    }
    if (reason) {
      addDispositionAccount(accounts, row, reason)
      return []
    }
    const value = {
      workspaceId: bundle.manifest.workspaceId, id: row.targetId,
      projectId: row.targetProjectId, source: row.targetSourceId,
      target: row.targetTargetId,
    }
    addTargetAccount(accounts, row, { table: 'canvas_edges', id: row.targetId })
    return [{ row, value }]
  })
}

function prepareJobs(
  bundle: VerifiedLegacyExportBundleV1,
  projects: Prepared<LegacyProjectExportRowV1, ProjectInsert>[],
  accounts: LegacyImportAccountV1[],
): PreparedJob[] {
  const projectIds = new Set(projects.map(({ value }) => value.id))
  return bundle.rows.jobs.flatMap((row) => {
    if (isAccounted(accounts, row)) return []
    if (!row.targetProjectId || !projectIds.has(row.targetProjectId)) {
      addDispositionAccount(accounts, row, 'missing-project')
      return []
    }
    const status = JOB_STATUS[String(row.status)]
    if (!status || (row.kind !== 'director-stage' && row.kind !== 'render-shot')) {
      addDispositionAccount(accounts, row, status ? 'unsupported-kind' : 'invalid-status')
      return []
    }
    const runId = legacyIdToUuid('pipeline-runs', row.legacyPk)
    const attemptId = legacyIdToUuid('task-attempts', row.legacyPk)
    const createdAt = date(row.createdAt)
    const completedAt = date(row.updatedAt)
    const run: RunInsert = {
      workspaceId: bundle.manifest.workspaceId, id: runId,
      projectId: row.targetProjectId, triggerRunId: null, status,
      workflowVersion: bundle.manifest.workflowVersion, fingerprint: row.payloadHash,
      revision: 0, createdAt, updatedAt: completedAt,
      startedAt: createdAt, completedAt,
    }
    const value: AttemptInsert = {
      workspaceId: bundle.manifest.workspaceId, id: attemptId, runId,
      taskId: `legacy.${row.kind}`, entityType: row.targetNodeId ? 'node' : 'project',
      entityId: row.targetNodeId ?? row.targetProjectId, attemptNo: 1, status,
      fingerprint: row.payloadHash,
      checkpoint: {
        schemaVersion: 1, sourceStatus: row.status,
        kind: row.kind, payloadHash: row.payloadHash,
      }, failure: status === 'failed'
        ? { schemaVersion: 1, code: 'LEGACY_JOB_FAILED', errorPresent: row.errorPresent }
        : null,
      revision: 0, createdAt, updatedAt: completedAt,
      startedAt: createdAt, completedAt,
    }
    addTargetAccount(accounts, row, [
      { table: 'pipeline_runs', id: runId },
      { table: 'task_attempts', id: attemptId },
    ])
    return [{ row, run, value, createdMs: createdAt.getTime() }]
  })
}

async function prepareArtifacts(
  bundle: VerifiedLegacyExportBundleV1,
  projects: Prepared<LegacyProjectExportRowV1, ProjectInsert>[],
  nodes: Prepared<LegacyNodeExportRowV1, NodeInsert>[],
  jobs: PreparedJob[], accounts: LegacyImportAccountV1[], artifactRoot: string,
) {
  const projectIds = new Set(projects.map(({ value }) => value.id))
  const nodeProjects = new Map(nodes.map(({ value }) => [value.id, value.projectId]))
  const inventory = new Map(bundle.manifest.artifactManifest
    .map((item) => [item.legacyPk, item]))
  const candidates: ArtifactCandidate[] = []
  for (const row of bundle.rows.artifacts) {
    if (isAccounted(accounts, row)) continue
    let reason: string | null = !row.targetProjectId
      || !projectIds.has(row.targetProjectId) ? 'missing-project' : null
    if (!reason && row.targetNodeId
      && nodeProjects.get(row.targetNodeId) !== row.targetProjectId) reason = 'missing-node'
    const entity = inventory.get(row.legacyPk)
    if (!reason && (!entity?.exists || entity.sizeBytes === null || !entity.sha256))
      reason = 'missing-file'
    const attempt = reason ? undefined : selectAttempt(row, jobs)
    if (!reason && !attempt) reason = 'missing-attempt'
    try {
      if (reason) throw new Error(reason)
      const verified = await verifyLegacyArtifactEntity({
        artifactRoot, storageKey: row.storageKey, expectedSize: entity!.sizeBytes!,
        expectedHash: entity!.sha256!,
      })
      if (row.contentHash !== null && row.contentHash !== verified.contentHash)
        throw new Error('hash-mismatch')
      candidates.push({
        row,
        value: {
          workspaceId: bundle.manifest.workspaceId, id: row.targetId,
          projectId: row.targetProjectId!, aggregateType: row.targetNodeId ? 'node' : 'project',
          aggregateId: row.targetNodeId ?? row.targetProjectId!, kind: text(row.kind),
          lifecycle: 'draft', schemaVersion: 'cvc.legacy-artifact/v1',
          storageKey: row.storageKey, sizeBytes: verified.sizeBytes, contentHash: verified.contentHash,
          attemptId: attempt!.value.id!,
          createdAt: date(row.createdAt), updatedAt: date(row.createdAt),
        },
      })
    } catch (error) {
      addDispositionAccount(accounts, row,
        reason ?? (hasCode(error, 'ENOENT') ? 'missing-file' : 'hash-mismatch'))
    }
  }
  return versionArtifacts(candidates, accounts)
}

function versionArtifacts(
  candidates: ArtifactCandidate[],
  accounts: LegacyImportAccountV1[],
): Prepared<LegacyArtifactExportRowV1, ArtifactInsert>[] {
  const groups = new Map<string, ArtifactCandidate[]>()
  for (const item of candidates) {
    const key = `${item.value.aggregateType}:${item.value.aggregateId}:${item.value.kind}`
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  const result: Prepared<LegacyArtifactExportRowV1, ArtifactInsert>[] = []
  for (const group of groups.values()) {
    group.sort((a, b) => (
      a.value.createdAt!.getTime() - b.value.createdAt!.getTime()
      || compare(a.row.legacyPk, b.row.legacyPk)
    ))
    group.forEach((item, index) => {
      const value: ArtifactInsert = {
        ...item.value, version: index + 1,
        supersedesArtifactId: index ? group[index - 1]!.row.targetId : null,
      }
      result.push({ row: item.row, value })
      addTargetAccount(accounts, item.row, { table: 'artifacts', id: item.row.targetId })
    })
  }
  return result
}

function prepareGlobals(
  bundle: VerifiedLegacyExportBundleV1,
  accounts: LegacyImportAccountV1[],
): LegacyGlobalImportPlanV1 {
  const credentials: LegacyGlobalImportPlanV1['credentials'] = []
  for (const row of bundle.rows.settings) {
    if (isAccounted(accounts, row)) continue
    if (row.classification === 'credential' && row.provider && row.envelopeWire) {
      const id = legacyIdToUuid('provider-credentials', row.provider)
      credentials.push({
        workspaceId: bundle.manifest.workspaceId, id, provider: row.provider,
        ...decodeCredentialEnvelopeWire(row.envelopeWire), verifiedAt: null,
      })
      addTargetAccount(accounts, row, { table: 'provider_credentials', id })
    } else if (row.classification === 'route-setting') {
      addTargetAccount(accounts, row, row.associatedTargets.map(routeTarget))
    } else {
      addDispositionAccount(accounts, row, 'unsupported-setting')
    }
  }
  const modelRoutes = Object.entries(bundle.manifest.resolvedRoutesV1.ai).map(
    ([kind, route]) => ({
      workspaceId: bundle.manifest.workspaceId,
      id: legacyIdToUuid('model-routes', kind), aiTaskKind: kind,
      provider: route.provider, model: route.model, revision: 0,
    }),
  )
  const mediaRoutes = Object.entries(bundle.manifest.resolvedRoutesV1.media).map(
    ([kind, route]) => ({
      workspaceId: bundle.manifest.workspaceId,
      id: legacyIdToUuid('media-routes', kind), mediaTaskKind: kind,
      provider: route.provider, model: route.model, revision: 0,
    }),
  )
  return { credentials, modelRoutes, mediaRoutes }
}
function selectAttempt(row: LegacyArtifactExportRowV1, jobs: PreparedJob[]) {
  const created = date(row.createdAt).getTime()
  return jobs.filter((job) => (
    job.run.projectId === row.targetProjectId && job.createdMs <= created
    && (!row.targetNodeId || job.row.targetNodeId === row.targetNodeId)
  )).sort((a, b) => b.createdMs - a.createdMs || compare(b.row.legacyPk, a.row.legacyPk))[0]
}
