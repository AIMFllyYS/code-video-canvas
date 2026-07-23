import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RootLayout, { metadata } from './layout'

describe('RootLayout', () => {
  it('exposes page metadata', () => {
    expect(metadata.title).toBe('code-video-canvas')
    expect(typeof metadata.description).toBe('string')
    expect(metadata.description).toContain('自然语言')
  })

  it('renders its children', () => {
    render(<RootLayout>{<span>child-content</span>}</RootLayout>)

    expect(screen.getByText('child-content')).toBeTruthy()
  })
})
