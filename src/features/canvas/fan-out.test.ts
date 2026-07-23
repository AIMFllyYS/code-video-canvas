import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '@/lib/db/migrate'
import { canvasEdges, canvasNodes, projects } from '@/lib/db/schema'
import { materializeShotLanes } from './fan-out'

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn<() => Db>() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: getDbMock }))

describe('materializeShotLanes', () => {
  let database: ReturnType<typeof createDb>
  let projectId: string

  beforeEach(() => {
    database = createDb(':memory:')
    projectId = randomUUID()
    getDbMock.mockReturnValue(database.db)
    database.db.insert(projects).values({ id: projectId, title: '分镜物化测试' }).run()
    database.db
      .insert(canvasNodes)
      .values([
        globalNode(projectId, 'split', 'shot-split'),
        globalNode(projectId, 'score', 'score'),
      ])
      .run()
  })

  afterEach(() => {
    database.sqlite.close()
    vi.clearAllMocks()
  })

  it('creates five ordered nodes and six edges for each shot', () => {
    materializeShotLanes(projectId, ['shot-1', 'shot-2', 'shot-3'])

    const laneNodes = database.db
      .select()
      .from(canvasNodes)
      .all()
      .filter((node) => node.laneKey !== null)
    expect(laneNodes).toHaveLength(15)
    expect(database.db.select().from(canvasEdges).all()).toHaveLength(18)

    const firstLane = laneNodes.filter((node) => node.laneKey === 'shot-1')
    expect(firstLane.map((node) => node.laneRole)).toEqual([
      'shot-script',
      'shot-codegen',
      'shot-sfx',
      'shot-subtitle',
      'shot-qa',
    ])
    expect(firstLane.map((node) => node.stage)).toEqual([
      'SHOT_SPEC',
      'FABRICATE',
      'ASSEMBLE',
      'ASSEMBLE',
      'FINALIZE',
    ])
  })

  it('rolls back every write when a mid-transaction insert fails', () => {
    database.sqlite.exec(`
      CREATE TRIGGER fail_shot_sfx
      BEFORE INSERT ON canvas_nodes
      WHEN NEW.lane_role = 'shot-sfx'
      BEGIN
        SELECT RAISE(ABORT, 'injected lane failure');
      END;
    `)

    expect(() => materializeShotLanes(projectId, ['shot-fails'])).toThrow(
      'injected lane failure'
    )
    expect(
      database.db
        .select()
        .from(canvasNodes)
        .all()
        .filter((node) => node.laneKey !== null)
    ).toHaveLength(0)
    expect(database.db.select().from(canvasEdges).all()).toHaveLength(0)
  })

  it('is idempotent for an already materialized shot batch', () => {
    const shotIds = ['shot-1', 'shot-2', 'shot-3']
    materializeShotLanes(projectId, shotIds)
    materializeShotLanes(projectId, shotIds)

    expect(
      database.db
        .select()
        .from(canvasNodes)
        .all()
        .filter((node) => node.laneKey !== null)
    ).toHaveLength(15)
    expect(database.db.select().from(canvasEdges).all()).toHaveLength(18)
  })
})

function globalNode(
  projectId: string,
  suffix: string,
  type: 'shot-split' | 'score'
): typeof canvasNodes.$inferInsert {
  return {
    id: `${projectId}-${suffix}`,
    projectId,
    type,
    position: { x: 0, y: 0 },
  }
}
