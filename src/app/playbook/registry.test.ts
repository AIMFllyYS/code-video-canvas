import { describe, expect, it } from 'vitest'
import {
  entriesByCategory,
  PENCIL_COMPONENT_FAMILY_COUNT,
  PENCIL_REUSABLE_SYMBOL_COUNT,
} from './registry'

const EXPECTED_PENCIL_FAMILIES = [
  'artifact-chip',
  'audio-node',
  'button',
  'contact-sheet-thumb',
  'dialog',
  'empty-state',
  'export-node',
  'icon-button',
  'nav-item',
  'progress-bar',
  'project-card',
  'queue-status-bar',
  'search-field',
  'segmented-control',
  'settings-group',
  'settings-row',
  'shot-node',
  'sidebar',
  'stage-node',
  'status-pill',
  'text-area',
  'text-field',
  'timeline-track',
  'toast',
  'toggle',
  'tooltip',
  'top-bar',
] as const

describe('Track P playbook registry', () => {
  it('accounts for 30 Pencil symbols as 27 component families', () => {
    expect(PENCIL_REUSABLE_SYMBOL_COUNT).toBe(30)
    expect(PENCIL_COMPONENT_FAMILY_COUNT).toBe(27)
    expect(entriesByCategory('ui').map(({ id }) => id).sort()).toEqual(
      [...EXPECTED_PENCIL_FAMILIES].sort()
    )
  })

  it('keeps the icon whitelist as a catalog rather than a visual primitive', () => {
    expect(entriesByCategory('icons').map(({ id }) => id)).toEqual(['lucide-catalog'])
  })
})
