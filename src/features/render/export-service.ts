import 'server-only'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { storage as defaultStorage, type StorageAdapter } from '@/lib/storage'
import { concatExport } from './concat'
import {
  RenderRepository,
  type FinalArtifactInput,
  type RenderExportPlan,
} from './repository'

export type ExportProjectResult =
  | { ok: false; incompleteNodeIds: string[] }
  | { ok: true; artifactId: string; outputKey: string; contentHash: string }

interface ExportRepository {
  getExportPlan(projectId: string): RenderExportPlan
  registerFinalArtifact(input: FinalArtifactInput): string
}

interface ExportDependencies {
  repository?: ExportRepository
  storage?: StorageAdapter
  concat?: typeof concatExport
  tempRoot?: string
}

export async function exportProject(
  projectId: string,
  dependencies: ExportDependencies = {}
): Promise<ExportProjectResult> {
  const repository = dependencies.repository ?? new RenderRepository()
  const storage = dependencies.storage ?? defaultStorage
  const concat = dependencies.concat ?? concatExport
  const plan = repository.getExportPlan(projectId)
  if (plan.incompleteNodeIds.length > 0) {
    return incomplete(plan.incompleteNodeIds)
  }
  const orderedShots = [...plan.shots].sort((left, right) =>
    left.laneKey.localeCompare(right.laneKey)
  )
  const missing = await missingShotIds(orderedShots, storage)
  if (missing.length > 0) return incomplete(missing)
  if (plan.musicKey && !(await storage.exists(plan.musicKey))) {
    throw new Error(`配乐 artifact 文件不存在：${plan.musicKey}`)
  }

  const root = dependencies.tempRoot ?? os.tmpdir()
  await mkdir(root, { recursive: true })
  const workDirectory = await mkdtemp(path.join(root, 'cvc-export-'))
  try {
    const temporaryOutput = path.join(workDirectory, 'final.mp4')
    await concat(
      orderedShots.map((shot) => storage.localPath(shot.outputKey)),
      plan.musicKey ? storage.localPath(plan.musicKey) : null,
      temporaryOutput
    )
    const bytes = await readFile(temporaryOutput)
    const contentHash = createHash('sha256').update(bytes).digest('hex')
    const outputKey = await storage.put(
      `exports/${projectId}/final-${contentHash}.mp4`,
      bytes
    )
    const artifactId = repository.registerFinalArtifact({ projectId, outputKey, contentHash })
    return { ok: true, artifactId, outputKey, contentHash }
  } finally {
    await rm(workDirectory, { recursive: true, force: true })
  }
}

export function getExportReadiness(
  projectId: string,
  repository: Pick<ExportRepository, 'getExportPlan'> = new RenderRepository()
): { ready: boolean; incompleteNodeIds: string[]; shotCount: number } {
  const plan = repository.getExportPlan(projectId)
  return {
    ready: plan.incompleteNodeIds.length === 0,
    incompleteNodeIds: plan.incompleteNodeIds,
    shotCount: plan.shots.length,
  }
}

async function missingShotIds(
  shots: RenderExportPlan['shots'],
  storage: StorageAdapter
): Promise<string[]> {
  const checks = await Promise.all(
    shots.map(async (shot) => ({
      nodeId: shot.nodeId,
      exists: await storage.exists(shot.outputKey),
    }))
  )
  return checks.filter((item) => !item.exists).map((item) => item.nodeId).sort()
}

function incomplete(nodeIds: string[]): ExportProjectResult {
  return { ok: false, incompleteNodeIds: [...new Set(nodeIds)].sort() }
}
