import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import NotFound from './not-found'

describe('NotFound', () => {
  it('shows the 404 heading and message', () => {
    render(<NotFound />)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('404')
    expect(screen.getByText('页面不存在')).toBeTruthy()
  })

  it('links back to the home page', () => {
    render(<NotFound />)

    const link = screen.getByRole('link', { name: '返回首页' })
    expect(link.getAttribute('href')).toBe('/')
  })
})
