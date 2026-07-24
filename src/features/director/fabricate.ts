import 'server-only'
import { getDb } from '@/lib/db/client'
import { storage } from '@/lib/storage'
import { createDirectorSession } from './pi-session'
import { DirectorRuntimeRepository } from './runtime-repository'
import { createStageRunner } from './stage-runner'
import { buildStagePrompt } from './stage-prompt'
import { prepareStageResult } from './stage-result'
import { commitStageResult } from './stage-result-committer'
import { writeValidatedArtifact } from './tools/write-artifact'

/**
 * 为 shot-codegen 节点生成 HTML + renderSpec，但不改变节点状态。
 *
 * 渲染队列会在将节点置为 running 后调用本函数；保持 pending/running 状态不变，
 * 使后续渲染流程仍能使用自己的状态机（idle -> pending -> running -> success）。
 */
export async function fabricateShot(projectId: string, nodeId: string): Promise<void> {
  const repository = new DirectorRuntimeRepository(getDb(), storage)
  const runner = createStageRunner({
    repository,
    transitionNodeStatus: () => {
      // 渲染队列自己管理 shot-codegen 节点状态；这里只负责产出 artifact 和 renderSpec。
      // no-op 避免改变节点 pending/running 状态。
    },
    createSession: createDirectorSession,
    buildPrompt: buildStagePrompt,
    writeArtifact: writeValidatedArtifact,
    prepareResult: prepareStageResult,
    commitResult: (context, result, artifact) =>
      commitStageResult(repository, context, result, artifact),
  })
  await runner(projectId, nodeId, 'FABRICATE')
}
