import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '@/lib/db/migrate'
import { canvasEdges, canvasNodes, projects } from '@/lib/db/schema'
import { getCanvasGraph } from './queries'

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
})

function seedProject(db: Db, title: string): string {
  const id = randomUUID()
  db.insert(projects).values({ id, title }).run()
  return id
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
