import { describe, expect, it } from 'vitest'
import {
  legacyIdToUuid,
  UUID_NAMESPACE_DNS,
  uuidV5,
} from './legacy-id'

describe('legacy UUIDv5 mapping', () => {
  it('matches the RFC 4122 published UUIDv5 vector', () => {
    expect(uuidV5('www.widgets.com', UUID_NAMESPACE_DNS)).toBe(
      '21f7f8de-8051-5b89-8680-0195ef798b6a',
    )
  })

  it('is stable and separates source scopes', () => {
    const first = legacyIdToUuid('projects', '旧项目-一')
    expect(legacyIdToUuid('projects', '旧项目-一')).toBe(first)
    expect(legacyIdToUuid('canvas_nodes', '旧项目-一')).not.toBe(first)
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('rejects malformed namespace and empty inputs', () => {
    expect(() => uuidV5('name', 'not-a-uuid')).toThrow('namespace')
    expect(() => legacyIdToUuid('', 'id')).toThrow('scope')
    expect(() => legacyIdToUuid('projects', '')).toThrow('legacyId')
  })
})
