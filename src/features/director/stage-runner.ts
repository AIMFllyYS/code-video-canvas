import 'server-only'
import { createHash } from 'node:crypto'
import { getDb } from '@/lib/db/client'
import { transitionNodeStatus } from '@/features/canvas/status'
import { createDirectorSession, type DirectorSession, type DirectorTool } from './pi-session'
import { DirectorRuntimeRepository, type DirectorStageContext } from './runtime-repository'
import { buildStagePrompt } from './stage-prompt'
import { commitStageResult } from './stage-result-committer'
import {
  prepareStageResult,
  type PreparedStageResult,
} from './stage-result'
import { storage } from '@/lib/storage'
import { streamBus } from '@/lib/stream/stream-bus'
import { createCheckDeterminismTool } from './tools/check-determinism'
import { createValidateShotPlanTool } from './tools/validate-shot-plan'
import {
  ArtifactValidationError,
  writeValidatedArtifact,
  type ArtifactCommitResult,
  type WriteArtifactInput,
} from './tools/write-artifact'
import type { PipelineStage } from './types'
import { advancePipeline } from './advance'
import { buildFabricateRetryPrompt } from './prompts/fabricate'
import { buildShotSpecRetryPrompt } from './prompts/shot-spec'

interface StageRepository {
  loadStageContext(
    projectId: string,
    nodeId: string,
    stage: PipelineStage
  ): DirectorStageContext | Promise<DirectorStageContext>
  registerArtifactPointer(input: {
    projectId: string
    nodeId: string
    kind: string
    storageKey: string
  }): string | void
  recordStageError(nodeId: string, stage: PipelineStage, error: unknown): void
  recordStageOutput(
    nodeId: string,
    result: PreparedStageResult,
    artifactId: string
  ): void
  persistStreamLog(
    projectId: string,
    nodeId: string,
    stage: PipelineStage,
    text: string
  ): Promise<void>
}

interface StageRunnerDependencies {
  repository: StageRepository
  transitionNodeStatus: typeof transitionNodeStatus
  createSession: typeof createDirectorSession
  buildPrompt: typeof buildStagePrompt
  writeArtifact: (input: WriteArtifactInput) => Promise<ArtifactCommitResult>
  prepareResult: typeof prepareStageResult
  commitResult: (
    context: DirectorStageContext,
    result: PreparedStageResult,
    artifact: ArtifactCommitResult
  ) => void
  runStageEffect: (
    context: DirectorStageContext,
    result: PreparedStageResult,
    artifact: ArtifactCommitResult
  ) => Promise<void>
  advancePipeline: (
    projectId: string,
    completedNodeId: string
  ) => Promise<unknown>
}

type StageRunner = (
  projectId: string,
  nodeId: string,
  stage: PipelineStage
) => Promise<void>

export const MAX_GATE_RETRIES = 2

let defaultRunner: StageRunner | undefined

/** 首次真正执行作业时才打开 SQLite，模块导入保持无副作用。 */
export const runStage: StageRunner = (projectId, nodeId, stage) => {
  defaultRunner ??= createDefaultRunner()
  return defaultRunner(projectId, nodeId, stage)
}

function createDefaultRunner(): StageRunner {
  const repository = new DirectorRuntimeRepository(getDb(), storage)
  return createStageRunner({
    repository,
    transitionNodeStatus,
    createSession: createDirectorSession,
    buildPrompt: buildStagePrompt,
    writeArtifact: writeValidatedArtifact,
    prepareResult: prepareStageResult,
    commitResult: (context, result, artifact) =>
      commitStageResult(repository, context, result, artifact),
    runStageEffect: async (context) => {
      if (
        context.nodeType !== 'shot-sfx' &&
        context.nodeType !== 'shot-subtitle' &&
        context.nodeType !== 'shot-qa'
      ) {
        return
      }
      const { runDirectorStageEffect } = await import('./stage-effects')
      await runDirectorStageEffect(context)
    },
    advancePipeline,
  })
}

export function createStageRunner(
  dependencies: StageRunnerDependencies
): StageRunner {
  return async (projectId, nodeId, stage) => {
    const context = await dependencies.repository.loadStageContext(projectId, nodeId, stage)
    const streamKey = `${projectId}:${nodeId}`
    dependencies.transitionNodeStatus(nodeId, 'running')
    let session: DirectorSession | undefined
    let closed = false
    try {
      const prompt = dependencies.buildPrompt(stage, context)
      session = await dependencies.createSession({
        projectId,
        nodeId,
        stage,
        resumeSessionKey: context.resumeSessionKey,
      })
      dependencies.repository.registerArtifactPointer({
        projectId,
        nodeId,
        kind: 'pi-session',
        storageKey: session.storageKey,
      })
      const { rawText, prepared, artifact } = await generateValidatedArtifact({
        stage,
        context,
        session,
        initialPrompt: prompt,
        dependencies,
      })
      dependencies.commitResult(context, prepared, artifact)
      await dependencies.runStageEffect(context, prepared, artifact)
      // 持久化已流出的全文（回退 result.text）为可回看日志，并收尾流。
      await dependencies.repository.persistStreamLog(
        projectId,
        nodeId,
        stage,
        streamBus.getSnapshot(streamKey).text || rawText
      )
      streamBus.markDone(streamKey)
      await session.close()
      closed = true
      dependencies.transitionNodeStatus(nodeId, 'success')
      await advanceWithoutMasking(
        dependencies.advancePipeline,
        projectId,
        nodeId
      )
    } catch (error) {
      if (session && !closed) await closeWithoutMasking(session)
      const cleanupErrors: unknown[] = []
      try {
        dependencies.transitionNodeStatus(nodeId, 'failed')
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError)
      }
      try {
        dependencies.repository.recordStageError(nodeId, stage, error)
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError)
      }
      // 落已流出的部分文本（可能为空）；持久化失败不掩盖主错误，并入清理链。
      try {
        await dependencies.repository.persistStreamLog(
          projectId,
          nodeId,
          stage,
          streamBus.getSnapshot(streamKey).text
        )
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError)
      }
      streamBus.markError(streamKey, {
        stage,
        message: error instanceof Error ? error.message : String(error),
      })
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          `Director 阶段失败且清理不完整：${stage}`
        )
      }
      throw error
    }
  }
}

async function advanceWithoutMasking(
  advance: StageRunnerDependencies['advancePipeline'],
  projectId: string,
  nodeId: string
): Promise<void> {
  try {
    await advance(projectId, nodeId)
  } catch (error) {
    console.error('[director] 下游自动推进失败', {
      projectId,
      nodeId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

async function generateValidatedArtifact(input: {
  stage: PipelineStage
  context: DirectorStageContext
  session: DirectorSession
  initialPrompt: string
  dependencies: StageRunnerDependencies
}): Promise<{
  rawText: string
  prepared: PreparedStageResult
  artifact: ArtifactCommitResult
}> {
  let prompt = input.initialPrompt
  let retries = 0
  while (true) {
    const result = await input.session.run({
      prompt,
      tools: toolsForStage(input.stage),
    })
    const prepared = input.dependencies.prepareResult(input.context, result.text)
    try {
      const artifact = await input.dependencies.writeArtifact(
        outputArtifact(input.context, prepared.content)
      )
      return { rawText: result.text, prepared, artifact }
    } catch (error) {
      if (
        !(error instanceof ArtifactValidationError) ||
        !isFeedbackStage(input.stage)
      ) {
        throw error
      }
      if (retries >= MAX_GATE_RETRIES) {
        throw exhaustedGateError(error)
      }
      retries += 1
      prompt = buildGateRetryPrompt(input.stage, retries, error.errors)
    }
  }
}

function isFeedbackStage(
  stage: PipelineStage
): stage is 'SHOT_SPEC' | 'FABRICATE' {
  return stage === 'SHOT_SPEC' || stage === 'FABRICATE'
}

function buildGateRetryPrompt(
  stage: 'SHOT_SPEC' | 'FABRICATE',
  retry: number,
  errors: string[]
): string {
  const input = { retry, maxRetries: MAX_GATE_RETRIES, errors }
  return stage === 'FABRICATE'
    ? buildFabricateRetryPrompt(input)
    : buildShotSpecRetryPrompt(input)
}

function exhaustedGateError(error: ArtifactValidationError): ArtifactValidationError {
  const exhausted = new ArtifactValidationError(error.errors)
  exhausted.message =
    `产物校验失败（自动重试 ${MAX_GATE_RETRIES} 次后仍违规）：` +
    error.errors.join('；')
  return exhausted
}

function toolsForStage(stage: PipelineStage): readonly DirectorTool[] {
  if (stage === 'SHOT_SPEC') return [createValidateShotPlanTool()]
  if (stage === 'FABRICATE') return [createCheckDeterminismTool()]
  return []
}

function outputArtifact(
  context: DirectorStageContext,
  content: string
): WriteArtifactInput {
  const digest = createHash('sha256').update(content).digest('hex')
  const slug = context.stage.toLowerCase().replaceAll('_', '-')
  const extension =
    context.stage === 'SHOT_SPEC' ? 'json' : context.stage === 'FABRICATE' ? 'html' : 'txt'
  const validation =
    context.stage === 'SHOT_SPEC'
      ? 'shot-plan'
      : context.stage === 'FABRICATE'
        ? 'deterministic-html'
        : 'non-empty'
  return {
    projectId: context.projectId,
    nodeId: context.nodeId,
    kind: `director-${slug}`,
    key: `director/${context.projectId}/${context.nodeId}/${slug}-${digest}.${extension}`,
    content,
    validation,
  }
}

async function closeWithoutMasking(session: DirectorSession): Promise<void> {
  try {
    await session.close()
  } catch {
    // 主失败原因已由 stage runner 捕获；close 错误不覆盖它。
  }
}
