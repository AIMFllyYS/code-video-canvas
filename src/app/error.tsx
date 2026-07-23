'use client'

import { ErrorView } from '@/components/ui/error-view'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorView title="出错了" message={error.message} onRetry={reset} />
}
