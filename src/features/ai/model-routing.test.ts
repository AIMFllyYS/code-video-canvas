import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDb, type Db } from '@/lib/db/migrate'
import {
  describeDirectorRoutes,
  getDirectorProvider,
  resolveDirectorModelTarget,
  saveDirectorRoutes,
} from './model-routing'

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn<() => Db>() }))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db/client', () => ({ getDb: getDbMock }))

const originalEnv = { ...process.env }

describe('Director provider routing', () => {
  let database: ReturnType<typeof createDb>

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY: 'gemini-key',
      STEPFUN_API_KEY: 'stepfun-key',
    }
    database = createDb(':memory:')
    getDbMock.mockReturnValue(database.db)
  })

  afterEach(() => {
    process.env = originalEnv
    database.sqlite.close()
  })

  it('defaults most Director nodes to Gemini while keeping audio nodes on StepFun', () => {
    expect(getDirectorProvider('script-import').provider).toBe('gemini')
    expect(getDirectorProvider('shot-codegen').provider).toBe('gemini')
    expect(getDirectorProvider('shot-qa').provider).toBe('gemini')
    expect(getDirectorProvider('shot-sfx').provider).toBe('stepfun')
    expect(getDirectorProvider('shot-subtitle').provider).toBe('stepfun')
  })

  it('lets settings override each node independently', () => {
    saveDirectorRoutes({
      'shot-codegen': 'stepfun',
      'shot-sfx': 'gemini',
    })

    expect(getDirectorProvider('shot-codegen')).toEqual({
      provider: 'stepfun',
      source: 'settings',
    })
    expect(getDirectorProvider('shot-sfx')).toEqual({
      provider: 'gemini',
      source: 'settings',
    })
  })

  it('selects low-latency Gemini for ingest and primary Gemini for code and vision', () => {
    expect(resolveDirectorModelTarget('script-import', 'text')).toMatchObject({
      provider: 'gemini',
      modelId: 'gemini-3.1-flash-lite',
      apiKey: 'gemini-key',
    })
    expect(resolveDirectorModelTarget('shot-codegen', 'text')).toMatchObject({
      provider: 'gemini',
      modelId: 'gemini-3.6-flash',
    })
    expect(resolveDirectorModelTarget('shot-qa', 'vision')).toMatchObject({
      provider: 'gemini',
      modelId: 'gemini-3.6-flash',
    })
  })

  it('describes the effective provider and model for every visible route', () => {
    const routes = describeDirectorRoutes()

    expect(Object.keys(routes)).toHaveLength(9)
    expect(routes['script-import']).toMatchObject({
      provider: 'gemini',
      source: 'default',
      model: 'gemini-3.1-flash-lite',
    })
    expect(routes['shot-sfx']).toMatchObject({
      provider: 'stepfun',
      model: 'step-3.5-flash',
    })
  })
})
