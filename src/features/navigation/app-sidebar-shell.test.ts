import { describe, expect, it } from 'vitest'
import { resolveSidebarMode } from './app-sidebar-shell'

describe('resolveSidebarMode', () => {
  it('prioritizes hidden over rail and expanded', () => {
    expect(resolveSidebarMode(true, true, false)).toBe('hidden')
    expect(resolveSidebarMode(true, false, true)).toBe('hidden')
  })

  it('uses rail when viewport is narrow', () => {
    expect(resolveSidebarMode(false, true, false)).toBe('rail')
  })

  it('uses rail when manually collapsed on a wide viewport', () => {
    expect(resolveSidebarMode(false, false, true)).toBe('rail')
  })

  it('stays expanded on a wide viewport without manual collapse', () => {
    expect(resolveSidebarMode(false, false, false)).toBe('expanded')
  })
})
