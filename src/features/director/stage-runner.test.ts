import { describe, expect, it, vi } from 'vitest'
import { createStageRunner } from './stage-runner'
import type { DirectorStageContext } from './runtime-repository'
import { ArtifactValidationError } from './tools/write-artifact'

vi.mock('server-only', () => ({}))

const context: DirectorStageContext = {
  projectId: 'project-1',
  nodeId: 'node-1',
  nodeType: 'script-import',
  stage: 'INGEST',
  status: 'pending',
  projectTitle: '项目',
  projectScript: '脚本',
  directorInput: { rawScript: '脚本' },
  resumeSessionKey: undefined,
}

function createHarness(
  run: (input: unknown) => Promise<{ text: string }> = vi.fn(
    async (input: unknown) => {
      void input
      return { text: '阶段产出' }
    }
  )
) {
  const calls: string[] = []
  const session = {
    id: 'session-1',
    storageKey: 'pi-sessions/project-1/session.jsonl',
    run: vi.fn(async (input: unknown) => {
      calls.push('run')
      return run(input)
    }),
    close: vi.fn(async () => {
      calls.push('close')
    }),
  }
  const repository = {
    loadStageContext: vi.fn(() => context),
    registerArtifactPointer: vi.fn(() => {
      calls.push('pointer')
    }),
    recordStageError: vi.fn(() => {
      calls.push('error')
    }),
    recordStageOutput: vi.fn(),
    persistStreamLog: vi.fn(async () => {}),
  }
  const transitionNodeStatus = vi.fn((_nodeId: string, status: string) => {
    calls.push(status)
  })
  const writeArtifact = vi.fn(async () => {
    calls.push('artifact')
    return { id: 'artifact-1', storageKey: 'director/output.txt', contentHash: 'hash' }
  })
  const prepareResult = vi.fn((_context, content: string) => ({ content }))
  const commitResult = vi.fn(() => {
    calls.push('commit')
  })
  const runStageEffect = vi.fn(async () => {
    calls.push('effect')
  })
  const advancePipeline = vi.fn(async () => {
    calls.push('advance')
  })
  const runner = createStageRunner({
    repository,
    transitionNodeStatus,
    createSession: vi.fn(async () => session),
    buildPrompt: vi.fn(() => '类型化阶段提示词'),
    writeArtifact,
    prepareResult,
    commitResult,
    runStageEffect,
    advancePipeline,
  })
  return {
    calls,
    repository,
    transitionNodeStatus,
    session,
    writeArtifact,
    prepareResult,
    commitResult,
    runStageEffect,
    advancePipeline,
    runner,
  }
}

describe('createStageRunner', () => {
  it('registers the session before the model call and commits the validated output', async () => {
    const harness = createHarness()

    await harness.runner('project-1', 'node-1', 'INGEST')

    expect(harness.calls).toEqual([
      'running',
      'pointer',
      'run',
      'artifact',
      'commit',
      'effect',
      'close',
      'success',
      'advance',
    ])
    expect(harness.writeArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        nodeId: 'node-1',
        content: '阶段产出',
        validation: 'non-empty',
      })
    )
    expect(harness.repository.persistStreamLog).toHaveBeenCalledTimes(1)
    expect(harness.runStageEffect).toHaveBeenCalledWith(
      context,
      { content: '阶段产出' },
      { id: 'artifact-1', storageKey: 'director/output.txt', contentHash: 'hash' }
    )
    expect(harness.repository.persistStreamLog).toHaveBeenCalledWith(
      'project-1',
      'node-1',
      'INGEST',
      '阶段产出'
    )
    expect(harness.advancePipeline).toHaveBeenCalledWith('project-1', 'node-1')
  })

  it('keeps the session pointer and records failures without leaving running state', async () => {
    const harness = createHarness(
      vi.fn(async () => {
        throw new Error('模型失败')
      })
    )

    await expect(harness.runner('project-1', 'node-1', 'INGEST')).rejects.toThrow(
      '模型失败'
    )

    expect(harness.repository.registerArtifactPointer).toHaveBeenCalledOnce()
    expect(harness.repository.recordStageError).toHaveBeenCalledWith(
      'node-1',
      'INGEST',
      expect.any(Error)
    )
    expect(harness.calls).toEqual([
      'running',
      'pointer',
      'run',
      'close',
      'failed',
      'error',
    ])
    expect(harness.repository.persistStreamLog).toHaveBeenCalledTimes(1)
    expect(harness.advancePipeline).not.toHaveBeenCalled()
  })

  it('fails invalid persisted input before creating a model session', async () => {
    const harness = createHarness()
    const inputError = new Error('directorInput 无效')
    const createSession = vi.fn()
    const runner = createStageRunner({
      repository: harness.repository,
      transitionNodeStatus: harness.transitionNodeStatus,
      createSession,
      buildPrompt: vi.fn(() => {
        throw inputError
      }),
      writeArtifact: harness.writeArtifact,
      prepareResult: harness.prepareResult,
      commitResult: harness.commitResult,
      runStageEffect: harness.runStageEffect,
      advancePipeline: harness.advancePipeline,
    })

    await expect(runner('project-1', 'node-1', 'INGEST')).rejects.toBe(inputError)
    expect(createSession).not.toHaveBeenCalled()
    expect(harness.transitionNodeStatus.mock.calls.map((call) => call[1])).toEqual([
      'running',
      'failed',
    ])
  })

  it('does not start the model when repository preconditions reject the node', async () => {
    const harness = createHarness()
    const createSession = vi.fn()
    harness.repository.loadStageContext.mockImplementation(() => {
      throw new Error('Director 节点必须为 pending')
    })
    const runner = createStageRunner({
      repository: harness.repository,
      transitionNodeStatus: harness.transitionNodeStatus,
      createSession,
      buildPrompt: vi.fn(() => '不会构建'),
      writeArtifact: harness.writeArtifact,
      prepareResult: harness.prepareResult,
      commitResult: harness.commitResult,
      runStageEffect: harness.runStageEffect,
      advancePipeline: harness.advancePipeline,
    })

    await expect(runner('project-1', 'node-1', 'INGEST')).rejects.toThrow('pending')
    expect(createSession).not.toHaveBeenCalled()
    expect(harness.transitionNodeStatus).not.toHaveBeenCalled()
  })

  it('fails the stage when an application side effect cannot produce its real artifact', async () => {
    const harness = createHarness()
    harness.runStageEffect.mockRejectedValueOnce(new Error('TTS 失败'))

    await expect(harness.runner('project-1', 'node-1', 'INGEST')).rejects.toThrow(
      'TTS 失败'
    )

    expect(harness.calls).toEqual([
      'running',
      'pointer',
      'run',
      'artifact',
      'commit',
      'close',
      'failed',
      'error',
    ])
    expect(harness.transitionNodeStatus).not.toHaveBeenCalledWith('node-1', 'success')
    expect(harness.advancePipeline).not.toHaveBeenCalled()
  })

  it('reuses the same FABRICATE session for at most two gate-feedback retries', async () => {
    const harness = createHarness()
    harness.repository.loadStageContext.mockReturnValue({
      ...context,
      nodeType: 'shot-codegen',
      stage: 'FABRICATE',
    })
    harness.session.run
      .mockResolvedValueOnce({ text: '<html>违规一</html>' })
      .mockResolvedValueOnce({ text: '<html>违规二</html>' })
      .mockResolvedValueOnce({ text: '<html>合格</html>' })
    harness.writeArtifact
      .mockImplementationOnce(async () => {
        harness.calls.push('artifact')
        throw new ArtifactValidationError([
          'set-interval@457: 禁止 setInterval 驱动动画',
        ])
      })
      .mockImplementationOnce(async () => {
        harness.calls.push('artifact')
        throw new ArtifactValidationError([
          'date-now@99: 禁止读取墙钟时间',
        ])
      })

    await harness.runner('project-1', 'node-1', 'FABRICATE')

    expect(harness.session.run).toHaveBeenCalledTimes(3)
    expect(harness.writeArtifact).toHaveBeenCalledTimes(3)
    expect(harness.session.run.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        prompt: expect.stringContaining('set-interval@457'),
      })
    )
    expect(harness.session.run.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({
        prompt: expect.stringContaining('date-now@99'),
      })
    )
    expect(harness.calls.filter((call) => call === 'commit')).toHaveLength(1)
    expect(harness.calls).toContain('success')
  })

  it('fails with the last violation detail after exhausting two feedback retries', async () => {
    const harness = createHarness()
    harness.repository.loadStageContext.mockReturnValue({
      ...context,
      nodeType: 'shot-codegen',
      stage: 'FABRICATE',
    })
    harness.writeArtifact.mockImplementation(async () => {
      harness.calls.push('artifact')
      throw new ArtifactValidationError([
        'css-animation@88: 禁止 CSS animation',
      ])
    })

    await expect(
      harness.runner('project-1', 'node-1', 'FABRICATE')
    ).rejects.toThrow('自动重试 2 次后仍违规')

    expect(harness.session.run).toHaveBeenCalledTimes(3)
    expect(harness.repository.recordStageError).toHaveBeenCalledWith(
      'node-1',
      'FABRICATE',
      expect.objectContaining({
        message: expect.stringContaining('css-animation@88'),
      })
    )
    expect(harness.advancePipeline).not.toHaveBeenCalled()
  })

  it('applies the same bounded feedback mechanism to SHOT_SPEC validation', async () => {
    const harness = createHarness()
    harness.repository.loadStageContext.mockReturnValue({
      ...context,
      nodeType: 'shot-script',
      stage: 'SHOT_SPEC',
    })
    harness.writeArtifact.mockImplementationOnce(async () => {
      harness.calls.push('artifact')
      throw new ArtifactValidationError(['shots.0.mustShow: Required'])
    })

    await harness.runner('project-1', 'node-1', 'SHOT_SPEC')

    expect(harness.session.run).toHaveBeenCalledTimes(2)
    expect(harness.session.run.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        prompt: expect.stringContaining('完整 JSON'),
      })
    )
  })

  it('does not retry network, normalization, or storage failures', async () => {
    const network = createHarness(
      vi.fn(async () => {
        throw new Error('网络失败')
      })
    )
    await expect(
      network.runner('project-1', 'node-1', 'FABRICATE')
    ).rejects.toThrow('网络失败')
    expect(network.session.run).toHaveBeenCalledOnce()

    const normalization = createHarness()
    normalization.prepareResult.mockImplementationOnce(() => {
      throw new Error('schema 归一失败')
    })
    await expect(
      normalization.runner('project-1', 'node-1', 'FABRICATE')
    ).rejects.toThrow('schema 归一失败')
    expect(normalization.session.run).toHaveBeenCalledOnce()
    expect(normalization.writeArtifact).not.toHaveBeenCalled()

    const storage = createHarness()
    storage.writeArtifact.mockRejectedValueOnce(new Error('存储失败'))
    await expect(
      storage.runner('project-1', 'node-1', 'FABRICATE')
    ).rejects.toThrow('存储失败')
    expect(storage.session.run).toHaveBeenCalledOnce()
  })
})
