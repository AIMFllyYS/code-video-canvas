'use client'

import dynamic from 'next/dynamic'
import type { CanvasViewProps } from './canvas-view'

const CanvasView = dynamic(
  () => import('./canvas-view').then((module) => module.CanvasView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-label-secondary">
        正在加载画布…
      </div>
    ),
  }
)

export function CanvasLoader(props: CanvasViewProps) {
  return <CanvasView {...props} />
}
