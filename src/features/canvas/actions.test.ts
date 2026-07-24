import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '@/lib/db/migrate'
import { canvasEdges, canvasNodes, projects } from '@/lib/db/schema'
import { createProject, updateExportSettings } from './actions'
import { getExportSettings } from './queries'

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn<() => Db>() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: getDbMock }))

describe('createProject', () => {
  let database: ReturnType<typeof createDb>

  beforeEach(() => {
    database = createDb(':memory:')
    getDbMock.mockReturnValue(database.db)
  })

  afterEach(() => {
    database.sqlite.close()
    vi.clearAllMocks()
  })

  it('atomically creates the project and its four global DAG nodes', () => {
    const project = createProject({ title: 'RAG 十分钟入门', script: '测试稿件' })
    const nodes = database.db.select().from(canvasNodes).all()
    const edges = database.db.select().from(canvasEdges).all()

    expect(project.title).toBe('RAG 十分钟入门')
    expect(nodes.map(({ type, stage }) => [type, stage])).toEqual([
      ['script-import', 'INGEST'],
      ['shot-split', 'DIRECT'],
      ['score', 'ASSEMBLE'],
      ['export', 'FINALIZE'],
    ])
    expect(nodes[0]?.data).toEqual({ directorInput: { rawScript: '测试稿件' } })
    expect(edges.map(({ source, target }) => [source, target])).toEqual([
      [nodes[0]?.id, nodes[1]?.id],
      [nodes[2]?.id, nodes[3]?.id],
    ])
  })

  it('rolls back the project when initial graph creation fails', () => {
    database.sqlite.exec(`
      CREATE TRIGGER fail_initial_graph
      BEFORE INSERT ON canvas_nodes
      BEGIN
        SELECT RAISE(ABORT, 'injected graph failure');
      END;
    `)

    expect(() => createProject({ title: '失败项目', script: '稿件' })).toThrow(
      'injected graph failure'
    )
    expect(database.db.select().from(projects).all()).toHaveLength(0)
  })
})

describe('export settings', () => {
  let database: ReturnType<typeof createDb>

  beforeEach(() => {
    database = createDb(':memory:')
    getDbMock.mockReturnValue(database.db)
    database.db.insert(projects).values({ id: 'p1', title: '项目', script: '' }).run()
  })

  afterEach(() => {
    database.sqlite.close()
    vi.clearAllMocks()
  })

  it('defaults to the master preset when never set', () => {
    expect(getExportSettings('p1')).toEqual({ resolutionPreset: '1080x1920' })
  })

  it('persists a valid preset and reads it back', () => {
    updateExportSettings('p1', { resolutionPreset: '720x1280' })
    expect(getExportSettings('p1')).toEqual({ resolutionPreset: '720x1280' })
  })

  it('rejects an invalid preset without writing', () => {
    expect(() => updateExportSettings('p1', { resolutionPreset: '9999x9999' })).toThrow()
    expect(getExportSettings('p1')).toEqual({ resolutionPreset: '1080x1920' })
  })

  it('throws when the project does not exist', () => {
    expect(() =>
      updateExportSettings('missing', { resolutionPreset: '720x1280' })
    ).toThrow('项目不存在')
  })
})
