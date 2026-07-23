import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Loading from './loading'

describe('Loading', () => {
  it('renders an animated spinner element', () => {
    const { container } = render(<Loading />)

    const spinner = container.querySelector('.animate-spin')
    expect(spinner).not.toBeNull()
  })
})
