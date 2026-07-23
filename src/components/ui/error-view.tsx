'use client'

import { Button } from '@/components/ui/button'
import { CenteredScreen } from '@/components/ui/centered-screen'

type ErrorViewProps = {
  title: string
  message: string
  onRetry: () => void
  retryLabel?: string
}

/**
 * Shared error UI for `error.tsx` and `global-error.tsx`:
 * a centered title, the error message, and a retry button.
 */
export function ErrorView({
  title,
  message,
  onRetry,
  retryLabel = '重试',
}: ErrorViewProps) {
  return (
    <CenteredScreen>
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-gray-600">{message}</p>
      <Button onClick={onRetry} className="mt-4">
        {retryLabel}
      </Button>
    </CenteredScreen>
  )
}
