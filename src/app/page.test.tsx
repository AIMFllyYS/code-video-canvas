import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HomePage from './page'

describe('HomePage', () => {
  it('renders the main heading', () => {
    render(<HomePage />)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('code-video-canvas')
  })

  it('renders inside a <main> landmark with the tagline', () => {
    const { container } = render(<HomePage />)

    expect(container.querySelector('main')).not.toBeNull()
    expect(screen.getByText(/自然语言/)).toBeTruthy()
  })
})
