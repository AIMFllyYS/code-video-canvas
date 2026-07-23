'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="zh-CN">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center p-8">
          <h2 className="text-2xl font-bold">系统错误</h2>
          <p className="mt-2 text-gray-600">{error.message}</p>
          {error.digest && (
            <p className="mt-1 text-sm text-gray-400">错误 ID：{error.digest}</p>
          )}
          <button
            onClick={reset}
            className="mt-4 rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
          >
            重试
          </button>
        </div>
      </body>
    </html>
  )
}
