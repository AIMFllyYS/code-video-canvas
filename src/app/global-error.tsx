'use client'

import { ErrorView } from '@/components/ui/error-view'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="zh-CN">
      <body>
        <ErrorView title="系统错误" message={error.message} onRetry={reset} />
      </body>
    </html>
  )
}
