import 'server-only'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { checkSource } from '@/lib/determinism'
import { storage as defaultStorage, type StorageAdapter } from '@/lib/storage'
import { lookupCache, writeCache, type RenderCacheEntry } from './cache'
import { encodeToMp4 } from './encode'
import { captureSequence, type FrameSequence } from './frame-sequence'
import type { RenderJob, RenderResult } from './types'

export interface Renderer {
  render(job: RenderJob): Promise<RenderResult>
}

interface RendererDependencies {
  storage: StorageAdapter
  lookupCache(contentHash: string): Promise<RenderCacheEntry | null>
  writeCache(input: {
    projectId: string
    nodeId: string
    outputKey: string
    contentHash: string
  }): string
  captureSequence(
    htmlPath: string,
    totalFrames: number,
    fps: number,
    options: { width: number; height: number }
  ): Promise<FrameSequence>
  encode(
    sequence: FrameSequence,
    fps: number,
    outputPath: string
  ): Promise<string>
  tempRoot: string
}

const defaults: RendererDependencies = {
  storage: defaultStorage,
  lookupCache,
  writeCache,
  captureSequence,
  encode: encodeToMp4,
  tempRoot: os.tmpdir(),
}

/** 可信的确定性渲染编排器：guard → cache → capture → encode → commit。 */
export class HyperframesRenderer implements Renderer {
  private readonly dependencies: RendererDependencies

  constructor(dependencies: Partial<RendererDependencies> = {}) {
    this.dependencies = { ...defaults, ...dependencies }
  }

  async render(job: RenderJob): Promise<RenderResult> {
    const html = await this.dependencies.storage.get(job.htmlKey)
    assertDeterministic(html.toString('utf8'))
    const contentHash = renderHash(html, job)
    const cached = await this.dependencies.lookupCache(contentHash)
    if (cached) return { shotId: job.shotId, ...cached }

    let sequence: FrameSequence | undefined
    let workDirectory: string | undefined
    try {
      sequence = await this.dependencies.captureSequence(
        this.dependencies.storage.localPath(job.htmlKey),
        job.frames.durationInFrames,
        job.frames.fps,
        { width: job.frames.width, height: job.frames.height }
      )
      await mkdir(this.dependencies.tempRoot, { recursive: true })
      workDirectory = await mkdtemp(path.join(this.dependencies.tempRoot, 'cvc-render-'))
      const encodedPath = path.join(workDirectory, 'shot.mp4')
      await this.dependencies.encode(sequence, job.frames.fps, encodedPath)
      const outputKey = `render/${job.projectId}/${job.nodeId}/${contentHash}.mp4`
      await this.dependencies.storage.put(outputKey, await readFile(encodedPath))
      try {
        this.dependencies.writeCache({
          projectId: job.projectId,
          nodeId: job.nodeId,
          outputKey,
          contentHash,
        })
      } catch (error) {
        await this.dependencies.storage.delete(outputKey)
        throw error
      }
      return { shotId: job.shotId, outputKey, contentHash }
    } finally {
      if (sequence) await sequence.cleanup()
      if (workDirectory) {
        await rm(workDirectory, { recursive: true, force: true })
      }
    }
  }
}

function assertDeterministic(source: string): void {
  const violations = checkSource(source)
  if (violations.length === 0) return
  const summary = violations
    .map((violation) => `${violation.ruleId}@${violation.line}`)
    .join(', ')
  throw new Error(`确定性违规：${summary}`)
}

function renderHash(html: Buffer, job: RenderJob): string {
  return createHash('sha256')
    .update('cvc-render-v1\0')
    .update(html)
    .update('\0')
    .update(JSON.stringify({ frames: job.frames, seed: job.seed ?? null }))
    .digest('hex')
}
