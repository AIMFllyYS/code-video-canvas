import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import GlobalError from './global-error'

describe('GlobalError boundary', () => {
  it('displays the system error message', () => {
    render(<GlobalError error={new Error('fatal')} reset={() => {}} />)

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('系统错误')
    expect(screen.getByText('fatal')).toBeTruthy()
  })

  it('calls reset when the retry button is clicked', () => {
    const reset = vi.fn()
    render(<GlobalError error={new Error('fatal')} reset={reset} />)

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
