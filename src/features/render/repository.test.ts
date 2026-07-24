import os from 'node:os'
import path from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb, type Db } from '@/lib/db/migrate'
import { artifacts, canvasNodes, projects } from '@/lib/db/schema'
import { RenderRepository } from './repository'

vi.mock('server-only', () => ({}))

const roles = ['shot-script', 'shot-codegen', 'shot-sfx', 'shot-subtitle', 'shot-qa']

describe('RenderRepository export plan', () => {
  let directory: string
  let db: Db
  let sqlite: ReturnType<typeof createDb>['sqlite']
  let repository: RenderRepository

  beforeEach(() => {
    directory = path.join(os.tmpdir(), `cvc-render-repo-${crypto.randomUUID()}`)
    mkdirSync(directory, { recursive: true })
    const database = createDb(path.join(directory, 'test.db'))
    db = database.db
    sqlite = database.sqlite
    repository = new RenderRepository(db)
    db.insert(projects).values({ id: 'project-1', title: '项目', script: '' }).run()
    insertLane(db, 'S002')
    insertLane(db, 'S001')
    for (const lane of ['S001', 'S002']) {
      db.insert(artifacts)
        .values({
          id: `artifact-${lane}`,
          projectId: 'project-1',
          nodeId: `node-${lane}-shot-codegen`,
          kind: 'render-mp4',
          path: `render/${lane}.mp4`,
          contentHash: `hash-${lane}`,
        })
        .run()
    }
  })

  afterEach(() => {
    sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it('returns shots in stable lane order', () => {
    expect(repository.getExportPlan('project-1')).toMatchObject({
      incompleteNodeIds: [],
      shots: [
        { laneKey: 'S001', outputKey: 'render/S001.mp4' },
        { laneKey: 'S002', outputKey: 'render/S002.mp4' },
      ],
    })
  })

  it('reports every non-success or missing-artifact node', () => {
    db.update(canvasNodes)
      .set({ status: 'pending' })
      .where(eq(canvasNodes.id, 'node-S002-shot-sfx'))
      .run()
    db.delete(artifacts).where(eq(artifacts.id, 'artifact-S001')).run()

    expect(repository.getExportPlan('project-1').incompleteNodeIds).toEqual([
      'node-S001-shot-codegen',
      'node-S002-shot-sfx',
    ])
  })

  it('loads a validated running render context', () => {
    db.update(canvasNodes)
      .set({
        status: 'idle',
        data: {
          renderSpec: {
            fps: 30,
            durationInFrames: 60,
            width: 1920,
            height: 1080,
          },
        },
      })
      .where(eq(canvasNodes.id, 'node-S001-shot-codegen'))
      .run()
    db.insert(artifacts)
      .values({
        id: 'html-S001',
        projectId: 'project-1',
        nodeId: 'node-S001-shot-codegen',
        kind: 'director-fabricate',
        path: 'director/S001.html',
      })
      .run()

    expect(() =>
      repository.assertRenderEnqueueable('project-1', 'node-S001-shot-codegen')
    ).not.toThrow()
    db.update(canvasNodes)
      .set({ status: 'running' })
      .where(eq(canvasNodes.id, 'node-S001-shot-codegen'))
      .run()
    expect(
      repository.loadRenderContext('project-1', 'node-S001-shot-codegen')
    ).toMatchObject({
      projectId: 'project-1',
      nodeId: 'node-S001-shot-codegen',
      shotId: 'S001',
      htmlKey: 'director/S001.html',
      frames: { fps: 30, durationInFrames: 60, width: 1920, height: 1080 },
    })
  })

  it('carries default target resolution and null shotQa when unset', () => {
    const plan = repository.getExportPlan('project-1')
    expect(plan.targetResolution).toEqual({ width: 1080, height: 1920 })
    expect(plan.resolutionPreset).toBe('1080x1920')
    expect(plan.shotQa).toEqual({ S001: null, S002: null })
  })

  it('resolves target resolution from project export settings', () => {
    db.update(projects)
      .set({ exportSettings: { resolutionPreset: '540x960' } })
      .where(eq(projects.id, 'project-1'))
      .run()
    const plan = repository.getExportPlan('project-1')
    expect(plan.resolutionPreset).toBe('540x960')
    expect(plan.targetResolution).toEqual({ width: 540, height: 960 })
  })

  it('round-trips shot-qa results and exposes them via plan + targets', () => {
    const qaCheck = {
      passed: false,
      checkedAt: 1,
      thumbnailContentHash: 'agg-1',
      results: [],
    }
    repository.writeShotQaCheck('node-S001-shot-qa', qaCheck)
    expect(repository.readShotQaCheck('node-S001-shot-qa')).toEqual(qaCheck)
    expect(repository.getExportPlan('project-1').shotQa).toEqual({ S001: false, S002: null })
    expect(repository.getShotQaTargets('project-1')).toEqual([
      { codegenNodeId: 'node-S001-shot-codegen', qaNodeId: 'node-S001-shot-qa', laneKey: 'S001' },
      { codegenNodeId: 'node-S002-shot-codegen', qaNodeId: 'node-S002-shot-qa', laneKey: 'S002' },
    ])
  })

  it('combines rule and Vision results without replacing the deterministic layer', () => {
    repository.writeShotQaCheck('node-S001-shot-qa', {
      passed: true,
      checkedAt: 1,
      thumbnailContentHash: 'rules',
      results: [],
    })
    repository.writeShotQaVision('node-S001-shot-qa', {
      passed: false,
      checkedAt: 2,
      thumbnailContentHash: 'vision',
      provider: 'stepfun',
      model: 'step-3.7-flash',
      summary: '缺少标题',
      reportArtifactId: 'report-1',
      reportKey: 'qa/report.json',
    })

    expect(repository.getExportPlan('project-1').shotQa.S001).toBe(false)
  })

  it('excludes non-success shot-codegen from qa targets', () => {
    db.update(canvasNodes)
      .set({ status: 'pending' })
      .where(eq(canvasNodes.id, 'node-S002-shot-codegen'))
      .run()
    expect(repository.getShotQaTargets('project-1')).toEqual([
      { codegenNodeId: 'node-S001-shot-codegen', qaNodeId: 'node-S001-shot-qa', laneKey: 'S001' },
    ])
  })
})

function insertLane(db: Db, laneKey: string): void {
  db.insert(canvasNodes)
    .values(
      roles.map((role) => ({
        id: `node-${laneKey}-${role}`,
        projectId: 'project-1',
        type: role,
        position: { x: 0, y: 0 },
        data: {},
        status: 'success' as const,
        laneKey,
        laneRole: role,
      }))
    )
    .run()
}
