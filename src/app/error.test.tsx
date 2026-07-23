import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AppError from './error'

describe('Error boundary', () => {
  it('displays the error message', () => {
    render(<AppError error={new Error('boom')} reset={() => {}} />)

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('出错了')
    expect(screen.getByText('boom')).toBeTruthy()
  })

  it('calls reset when the retry button is clicked', () => {
    const reset = vi.fn()
    render(<AppError error={new Error('boom')} reset={reset} />)

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
