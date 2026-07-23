import 'server-only'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import {
  JsonlSessionRepo,
  loadJsonlSessionMetadata,
  type JsonlSessionMetadata,
  type Session,
} from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import { storage as defaultStorage } from '@/lib/storage'
import type { StorageAdapter } from '@/lib/storage/types'
import type { PipelineStage } from './types'

const SESSION_PREFIX = 'pi-sessions'

export interface SessionStoreInput {
  projectId: string
  nodeId: string
  stage: PipelineStage
  resumeSessionKey?: string
}

export interface StoredDirectorSession {
  id: string
  storageKey: string
  session: Session<JsonlSessionMetadata>
}

/** 以 StorageAdapter 管理的目录为边界封装 Pi JSONL 会话文件语义。 */
export class DirectorSessionStore {
  private readonly executionEnv: NodeExecutionEnv
  private readonly repo: JsonlSessionRepo
  private readonly sessionsRoot: string
  private closed = false

  constructor(
    private readonly storage: StorageAdapter = defaultStorage,
    private readonly cwd: string = process.cwd()
  ) {
    this.sessionsRoot = storage.localPath(SESSION_PREFIX)
    this.executionEnv = new NodeExecutionEnv({ cwd })
    this.repo = new JsonlSessionRepo({
      fs: this.executionEnv,
      sessionsRoot: this.sessionsRoot,
    })
  }

  async open(input: SessionStoreInput): Promise<StoredDirectorSession> {
    return input.resumeSessionKey
      ? this.resume(input.resumeSessionKey)
      : this.create(input)
  }

  async create(input: Omit<SessionStoreInput, 'resumeSessionKey'>): Promise<StoredDirectorSession> {
    this.assertOpen()
    const session = await this.repo.create({
      cwd: this.cwd,
      id: randomUUID(),
      metadata: {
        projectId: input.projectId,
        nodeId: input.nodeId,
        stage: input.stage,
      },
    })
    return this.toHandle(session)
  }

  async resume(storageKey: string): Promise<StoredDirectorSession> {
    this.assertOpen()
    const absolutePath = this.resolveSessionKey(storageKey)
    const metadata = await loadJsonlSessionMetadata(this.executionEnv, absolutePath)
    return this.toHandle(await this.repo.open(metadata))
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.executionEnv.cleanup()
  }

  private async toHandle(
    session: Session<JsonlSessionMetadata>
  ): Promise<StoredDirectorSession> {
    const metadata = await session.getMetadata()
    return {
      id: metadata.id,
      storageKey: this.toStorageKey(metadata.path),
      session,
    }
  }

  private toStorageKey(absolutePath: string): string {
    const storageRoot = this.storage.localPath('')
    const relativePath = path.relative(storageRoot, absolutePath)
    if (path.isAbsolute(relativePath) || relativePath.startsWith('..')) {
      throw new Error('Pi 会话文件越出 StorageAdapter 管理目录')
    }
    return relativePath.split(path.sep).join('/')
  }

  private resolveSessionKey(storageKey: string): string {
    const normalized = storageKey.replaceAll('\\', '/')
    if (!normalized.startsWith(`${SESSION_PREFIX}/`)) {
      throw new Error(`非法 Pi 会话 storageKey：${storageKey}`)
    }
    const absolutePath = this.storage.localPath(normalized)
    const relativeToRoot = path.relative(this.sessionsRoot, absolutePath)
    if (path.isAbsolute(relativeToRoot) || relativeToRoot.startsWith('..')) {
      throw new Error(`非法 Pi 会话 storageKey：${storageKey}`)
    }
    return absolutePath
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('DirectorSessionStore 已关闭')
  }
}
