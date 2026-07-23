import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { artifacts, getDb } from '@/lib/db'
import { storage as defaultStorage, type StorageAdapter } from '@/lib/storage'
import { inspectDeterminism } from './check-determinism'
import { validateShotPlanValue } from './validate-shot-plan'

const validationSchema = z.enum(['non-empty', 'shot-plan', 'deterministic-html'])
const inputSchema = z
  .object({
    projectId: z.string().min(1),
    nodeId: z.string().min(1).optional(),
    kind: z.string().min(1),
    key: z
      .string()
      .min(1)
      .refine(isSafeStorageKey, 'key 必须是存储根目录内的安全相对路径'),
    content: z.string(),
    validation: validationSchema,
  })
  .strict()

export type WriteArtifactInput = z.infer<typeof inputSchema>

export type ArtifactPrevalidation =
  | { ok: true }
  | { ok: false; errors: string[] }

interface ArtifactIndexRecord {
  id: string
  projectId: string
  nodeId?: string
  kind: string
  path: string
  contentHash: string
}

interface WriteArtifactDependencies {
  storage?: StorageAdapter
  validate?: (input: WriteArtifactInput) => ArtifactPrevalidation
  insertArtifact?: (record: ArtifactIndexRecord) => Promise<void>
}

export interface ArtifactCommitResult {
  id: string
  storageKey: string
  contentHash: string
}

export class ArtifactValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(`产物校验失败：${errors.join('；')}`)
    this.name = 'ArtifactValidationError'
  }
}

/**
 * 可信应用写服务。projectId/nodeId/key 必须来自 stage runner 的持久执行上下文，
 * 本函数不会被注册为 Pi Agent Tool。
 */
export async function writeValidatedArtifact(
  input: WriteArtifactInput,
  dependencies: WriteArtifactDependencies = {}
): Promise<ArtifactCommitResult> {
  const storage = dependencies.storage ?? defaultStorage
  const validate = dependencies.validate ?? validateArtifact
  const insertArtifact = dependencies.insertArtifact ?? insertArtifactRecord
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) {
    throw new ArtifactValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    )
  }
  const prevalidation = validate(parsed.data)
  if (!prevalidation.ok) throw new ArtifactValidationError(prevalidation.errors)

  const contentHash = createHash('sha256').update(parsed.data.content).digest('hex')
  const id = randomUUID()
  const storageKey = await storage.put(parsed.data.key, parsed.data.content)
  try {
    await insertArtifact({
      id,
      projectId: parsed.data.projectId,
      nodeId: parsed.data.nodeId,
      kind: parsed.data.kind,
      path: storageKey,
      contentHash,
    })
  } catch (error) {
    await storage.delete(storageKey)
    throw error
  }
  return { id, storageKey, contentHash }
}

function validateArtifact(input: WriteArtifactInput): ArtifactPrevalidation {
  if (input.validation === 'non-empty') {
    return input.content.trim()
      ? { ok: true }
      : { ok: false, errors: ['产物内容不能为空'] }
  }
  if (input.validation === 'deterministic-html') {
    const inspection = inspectDeterminism(input.content)
    return inspection.ok
      ? { ok: true }
      : {
          ok: false,
          errors: inspection.violations.map(
            (violation) => `${violation.ruleId}@${violation.line}: ${violation.message}`
          ),
        }
  }
  try {
    const validation = validateShotPlanValue(JSON.parse(input.content) as unknown)
    return validation.ok ? { ok: true } : { ok: false, errors: validation.errors }
  } catch {
    return { ok: false, errors: ['shot-plan 内容不是合法 JSON'] }
  }
}

async function insertArtifactRecord(record: ArtifactIndexRecord): Promise<void> {
  getDb().insert(artifacts).values(record).run()
}

function isSafeStorageKey(key: string): boolean {
  if (key.includes('\\') || key.startsWith('/') || /^[A-Za-z]:/.test(key)) return false
  return !key.split('/').some((segment) => segment === '..' || segment.length === 0)
}
