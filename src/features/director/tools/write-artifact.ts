import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { artifacts, getDb } from '@/lib/db'
import { storage as defaultStorage, type StorageAdapter } from '@/lib/storage'
import type { DirectorTool, DirectorToolResult } from '../pi-session'
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

type WriteArtifactInput = z.infer<typeof inputSchema>

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

export function createWriteArtifactTool(
  dependencies: WriteArtifactDependencies = {}
): DirectorTool {
  const storage = dependencies.storage ?? defaultStorage
  const validate = dependencies.validate ?? validateArtifact
  const insertArtifact = dependencies.insertArtifact ?? insertArtifactRecord
  return {
    name: 'write_artifact',
    label: '写入产物',
    description: '先按指定门禁复验内容，再写入 StorageAdapter 并登记 artifact 索引。',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', minLength: 1 },
        nodeId: { type: 'string', minLength: 1 },
        kind: { type: 'string', minLength: 1 },
        key: { type: 'string', minLength: 1 },
        content: { type: 'string' },
        validation: {
          type: 'string',
          enum: validationSchema.options,
        },
      },
      required: ['projectId', 'kind', 'key', 'content', 'validation'],
      additionalProperties: false,
    },
    async execute(input): Promise<DirectorToolResult> {
      const parsed = inputSchema.safeParse(input)
      if (!parsed.success) {
        return validationFailure(
          parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        )
      }
      const prevalidation = validate(parsed.data)
      if (!prevalidation.ok) return validationFailure(prevalidation.errors)

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
      const details = { ok: true as const, id, storageKey, contentHash }
      return { content: JSON.stringify(details), details }
    },
  }
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

function validationFailure(errors: string[]): DirectorToolResult {
  return {
    content: JSON.stringify({ ok: false, errors }),
    details: { ok: false, errors },
    terminate: false,
  }
}

function isSafeStorageKey(key: string): boolean {
  if (key.includes('\\') || key.startsWith('/') || /^[A-Za-z]:/.test(key)) return false
  return !key.split('/').some((segment) => segment === '..' || segment.length === 0)
}
