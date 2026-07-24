import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '@/lib/db/migrate'
import { artifacts, canvasEdges, canvasNodes, projects } from '@/lib/db/schema'
import { getCanvasGraph, getNodeArtifacts } from './queries'

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn<() => Db>() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: getDbMock }))

describe('getCanvasGraph', () => {
  let database: ReturnType<typeof createDb>

  beforeEach(() => {
    database = createDb(':memory:')
    getDbMock.mockReturnValue(database.db)
  })

  afterEach(() => {
    database.sqlite.close()
    vi.clearAllMocks()
  })

  it('returns only nodes and edges owned by the requested project', () => {
    const requestedId = seedProject(database.db, '目标项目')
    const otherId = seedProject(database.db, '其他项目')
    seedGraph(database.db, requestedId, 'requested')
    seedGraph(database.db, otherId, 'other')

    const graph = getCanvasGraph(requestedId)

    expect(graph.nodes.map(({ id }) => id)).toEqual(['requested-node'])
    expect(graph.edges.map(({ id }) => id)).toEqual(['requested-edge'])
  })

  it('returns the trusted node data needed by page projections', () => {
    const projectId = seedProject(database.db, '分镜项目')
    database.db
      .insert(canvasNodes)
      .values({
        id: 'shot-node',
        projectId,
        type: 'shot-codegen',
        stage: 'FABRICATE',
        laneKey: 'S001',
        laneRole: 'shot-codegen',
        position: { x: 0, y: 0 },
        data: {
          sourceUnit: { unitId: 'U001', text: '第一段真实脚本', order: 0 },
        },
      })
      .run()

    expect(getCanvasGraph(projectId).nodes[0]?.data).toEqual({
      sourceUnit: { unitId: 'U001', text: '第一段真实脚本', order: 0 },
    })
  })

  it('exposes the real contentHash column instead of a placeholder', () => {
    const projectId = seedProject(database.db, '哈希项目')
    database.db
      .insert(canvasNodes)
      .values({
        id: 'hashed-node',
        projectId,
        type: 'script-import',
        position: { x: 0, y: 0 },
        contentHash: 'real-hash-value',
      })
      .run()
    database.db
      .insert(canvasNodes)
      .values({ id: 'unhashed-node', projectId, type: 'shot-split', position: { x: 0, y: 0 } })
      .run()

    const nodes = getCanvasGraph(projectId).nodes
    expect(nodes.find(({ id }) => id === 'hashed-node')?.contentHash).toBe('real-hash-value')
    expect(nodes.find(({ id }) => id === 'unhashed-node')?.contentHash).toBeNull()
  })

  it('attaches each node its own real artifacts via getCanvasGraph', () => {
    const projectId = seedProject(database.db, '产物项目')
    database.db
      .insert(canvasNodes)
      .values({ id: 'node-with-artifact', projectId, type: 'shot-codegen', position: { x: 0, y: 0 } })
      .run()
    database.db
      .insert(canvasNodes)
      .values({ id: 'node-without-artifact', projectId, type: 'shot-script', position: { x: 0, y: 0 } })
      .run()
    insertArtifact(database.db, {
      id: 'artifact-1',
      projectId,
      nodeId: 'node-with-artifact',
      kind: 'director-fabricate',
      path: 'director/proj/node-with-artifact/fabricate-abc123.html',
    })

    const nodes = getCanvasGraph(projectId).nodes
    expect(nodes.find(({ id }) => id === 'node-with-artifact')?.artifacts).toEqual([
      { id: 'artifact-1', kind: 'director-fabricate', filename: 'fabricate-abc123.html' },
    ])
    expect(nodes.find(({ id }) => id === 'node-without-artifact')?.artifacts).toEqual([])
  })
})

describe('getNodeArtifacts', () => {
  let database: ReturnType<typeof createDb>

  beforeEach(() => {
    database = createDb(':memory:')
    getDbMock.mockReturnValue(database.db)
  })

  afterEach(() => {
    database.sqlite.close()
    vi.clearAllMocks()
  })

  it('only returns artifacts matching both projectId and nodeId', () => {
    const projectId = seedProject(database.db, '项目 A')
    const otherProjectId = seedProject(database.db, '项目 B')
    insertArtifact(database.db, {
      id: 'own',
      projectId,
      nodeId: 'node-1',
      kind: 'director-shot-spec',
      path: 'director/a/node-1/shot-spec-hash.json',
    })
    insertArtifact(database.db, {
      id: 'other-node',
      projectId,
      nodeId: 'node-2',
      kind: 'director-shot-spec',
      path: 'director/a/node-2/shot-spec-hash.json',
    })
    insertArtifact(database.db, {
      id: 'other-project',
      projectId: otherProjectId,
      nodeId: 'node-1',
      kind: 'director-shot-spec',
      path: 'director/b/node-1/shot-spec-hash.json',
    })

    expect(getNodeArtifacts(projectId, 'node-1')).toEqual([
      { id: 'own', kind: 'director-shot-spec', filename: 'shot-spec-hash.json' },
    ])
  })

  it('excludes internal pi-session pointers and orders by most recent first', () => {
    const projectId = seedProject(database.db, '会话项目')
    insertArtifact(database.db, {
      id: 'session-pointer',
      projectId,
      nodeId: 'node-1',
      kind: 'pi-session',
      path: 'pi-sessions/node-1/session.jsonl',
      createdAt: new Date(1000),
    })
    insertArtifact(database.db, {
      id: 'older-output',
      projectId,
      nodeId: 'node-1',
      kind: 'director-ingest',
      path: 'director/a/node-1/ingest-1.json',
      createdAt: new Date(2000),
    })
    insertArtifact(database.db, {
      id: 'newer-output',
      projectId,
      nodeId: 'node-1',
      kind: 'director-ingest',
      path: 'director/a/node-1/ingest-2.json',
      createdAt: new Date(3000),
    })

    expect(getNodeArtifacts(projectId, 'node-1')).toEqual([
      { id: 'newer-output', kind: 'director-ingest', filename: 'ingest-2.json' },
      { id: 'older-output', kind: 'director-ingest', filename: 'ingest-1.json' },
    ])
  })

  it('returns an empty list when the node has no real artifacts', () => {
    const projectId = seedProject(database.db, '空项目')
    expect(getNodeArtifacts(projectId, 'node-without-artifacts')).toEqual([])
  })
})

function seedProject(db: Db, title: string): string {
  const id = randomUUID()
  db.insert(projects).values({ id, title }).run()
  return id
}

function insertArtifact(
  db: Db,
  input: {
    id: string
    projectId: string
    nodeId: string
    kind: string
    path: string
    createdAt?: Date
  }
): void {
  db.insert(artifacts)
    .values({
      id: input.id,
      projectId: input.projectId,
      nodeId: input.nodeId,
      kind: input.kind,
      path: input.path,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    })
    .run()
}

function seedGraph(db: Db, projectId: string, prefix: string): void {
  const nodeId = `${prefix}-node`
  db.insert(canvasNodes)
    .values({
      id: nodeId,
      projectId,
      type: 'script-import',
      position: { x: 0, y: 0 },
    })
    .run()
  db.insert(canvasEdges)
    .values({
      id: `${prefix}-edge`,
      projectId,
      source: nodeId,
      target: nodeId,
    })
    .run()
}
